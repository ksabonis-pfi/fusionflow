import { getAccountContacts, findContactByEmail, createContact, contactExists, type DynamicsContact } from "../services/dynamicsService";
import type { Bindings } from "../types";

/** "John Smith" -> {firstName: "John", lastName: "Smith"}. A single-word name
 *  goes entirely to lastName, since Dynamics requires Last Name and treats
 *  First Name as optional. */
export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return { firstName: "", lastName: parts[0] ?? "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

/** Standard edit distance — small and dependency-free. */
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Exact (after normalizing case/whitespace) or close enough to be a likely
 *  typo of the same value — edit distance under ~20% of the longer string's
 *  length, with a floor so two very short strings need near-exact equality. */
export function isCloseMatch(a: string, b: string): boolean {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const dist = levenshtein(na, nb);
  const threshold = Math.max(1, Math.floor(Math.max(na.length, nb.length) * 0.2));
  return dist <= threshold;
}

function contactLabel(c: DynamicsContact): string {
  const name = [c.firstname, c.lastname].filter(Boolean).join(" ") || "(no name)";
  return c.emailaddress1 ? `${name} <${c.emailaddress1}>` : name;
}

function emailLocalPart(email: string): string {
  return email.split("@")[0] ?? email;
}

type ProjectContactRow = {
  id: string;
  project_id: string;
  dynamics_contact_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
};

async function loadContactAndAccount(db: D1Database, projectContactId: string): Promise<{ contact: ProjectContactRow; accountId: string; customerId: string | null } | null> {
  const contact = await db
    .prepare(
      `SELECT pc.id, pc.project_id, pc.dynamics_contact_id, pc.name, pc.email, pc.phone, pc.job_title
       FROM project_contacts pc WHERE pc.id = ? LIMIT 1`
    )
    .bind(projectContactId)
    .first<ProjectContactRow>();
  if (!contact) return null;

  const project = await db
    .prepare("SELECT dynamics_account_id, customer_id FROM projects WHERE id = ? LIMIT 1")
    .bind(contact.project_id)
    .first<{ dynamics_account_id: string | null; customer_id: string | null }>();
  const accountId = project?.dynamics_account_id;
  if (!accountId) return null;

  return { contact, accountId, customerId: project?.customer_id ?? null };
}

/**
 * Mirrors a project contact that's now confirmed in CE onto the customer's
 * own contact list (customer_contacts, surfaced on the Customer Detail
 * page) — so a contact added from inside a project shows up there too, not
 * just on that one project. Skipped if the project isn't linked to a
 * CloudConnect customer record, or if a contact tied to the same Dynamics
 * id (or email) is already there — never overwrites an existing row, since
 * someone may have already edited it at the customer level.
 */
export async function mirrorToCustomerContacts(
  db: D1Database,
  customerId: string | null,
  contact: { dynamics_contact_id: string; name: string; email: string | null; phone: string | null; job_title: string | null }
): Promise<void> {
  if (!customerId) return;

  const existing = await db
    .prepare(
      `SELECT id FROM customer_contacts
       WHERE customer_id = ? AND (dynamics_contact_id = ? OR (email IS NOT NULL AND LOWER(email) = LOWER(?)))
       LIMIT 1`
    )
    .bind(customerId, contact.dynamics_contact_id, contact.email ?? "")
    .first();
  if (existing) return;

  await db
    .prepare(
      `INSERT INTO customer_contacts (id, customer_id, dynamics_contact_id, name, email, phone, job_title)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(crypto.randomUUID(), customerId, contact.dynamics_contact_id, contact.name, contact.email, contact.phone, contact.job_title)
    .run();
}

/**
 * Checks one CloudConnect project contact against Dynamics — matching only,
 * never creating: links an exact email match, flags a close-but-not-exact
 * match for human review, or marks it 'not_found' when nothing looks like
 * a match. Creating a CE record is a deliberate, separate action
 * (`pushProjectContactToCrm`) — PF staff, partner reps, and people who exist
 * under a different account would otherwise get duplicated into CE
 * automatically just by being typed into a project. No-ops when the project
 * isn't tied to a CRM account.
 */
export async function syncProjectContactToCrm(env: Bindings, db: D1Database, projectContactId: string): Promise<void> {
  const loaded = await loadContactAndAccount(db, projectContactId);
  if (!loaded) return;
  const { contact, accountId, customerId } = loaded;

  const email = contact.email?.trim() || null;
  if (email) {
    const exact = await findContactByEmail(env, accountId, email);
    if (exact) {
      await db
        .prepare("UPDATE project_contacts SET dynamics_contact_id = ?, ce_match_status = 'matched', ce_checked_at = CURRENT_TIMESTAMP, ce_candidate_contact_id = NULL, ce_candidate_label = NULL WHERE id = ?")
        .bind(exact.contactid, projectContactId)
        .run();
      await mirrorToCustomerContacts(db, customerId, { dynamics_contact_id: exact.contactid, name: contact.name, email: contact.email, phone: contact.phone, job_title: contact.job_title });
      return;
    }
  }

  // Exact match (the only kind that's authoritative across the whole account)
  // came up empty — now look for a close-but-uncertain match, from the
  // capped candidate list. That cap is fine here: this is a suggestion for a
  // human to confirm, not a duplicate check, which the exact lookup above
  // already covers without a cap.
  const candidates = await getAccountContacts(env, accountId);
  const fuzzy = candidates.find((c) => {
    const nameMatch = isCloseMatch(contact.name, [c.firstname, c.lastname].filter(Boolean).join(" "));
    const emailMatch = email && c.emailaddress1 ? isCloseMatch(emailLocalPart(email), emailLocalPart(c.emailaddress1)) : false;
    return nameMatch || emailMatch;
  });
  if (fuzzy) {
    await db
      .prepare("UPDATE project_contacts SET ce_match_status = 'needs_review', ce_candidate_contact_id = ?, ce_candidate_label = ?, ce_checked_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(fuzzy.contactid, contactLabel(fuzzy), projectContactId)
      .run();
    return;
  }

  await db
    .prepare("UPDATE project_contacts SET ce_match_status = 'not_found', ce_checked_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(projectContactId)
    .run();
}

/**
 * The manual "Push to CE" action — the only path that creates a Dynamics
 * contact. Re-checks the authoritative exact-email match first (it may have
 * appeared in CE since the last check, or this may be recovering a 'missing'
 * link) and creates only if that still comes up empty, clearing any stale
 * link/candidate either way.
 */
export async function pushProjectContactToCrm(env: Bindings, db: D1Database, projectContactId: string): Promise<void> {
  const loaded = await loadContactAndAccount(db, projectContactId);
  if (!loaded) throw new Error("This project has no linked CRM account");
  const { contact, accountId, customerId } = loaded;

  const email = contact.email?.trim() || null;
  const exact = email ? await findContactByEmail(env, accountId, email) : null;
  if (exact) {
    await db
      .prepare("UPDATE project_contacts SET dynamics_contact_id = ?, ce_match_status = 'matched', ce_checked_at = CURRENT_TIMESTAMP, ce_candidate_contact_id = NULL, ce_candidate_label = NULL WHERE id = ?")
      .bind(exact.contactid, projectContactId)
      .run();
    await mirrorToCustomerContacts(db, customerId, { dynamics_contact_id: exact.contactid, name: contact.name, email: contact.email, phone: contact.phone, job_title: contact.job_title });
    return;
  }

  const { firstName, lastName } = splitName(contact.name);
  const created = await createContact(env, {
    firstName, lastName, email, phone: contact.phone, jobTitle: contact.job_title, accountId,
  });
  await db
    .prepare("UPDATE project_contacts SET dynamics_contact_id = ?, ce_match_status = 'created', ce_checked_at = CURRENT_TIMESTAMP, ce_candidate_contact_id = NULL, ce_candidate_label = NULL WHERE id = ?")
    .bind(created.contactid, projectContactId)
    .run();
  await mirrorToCustomerContacts(db, customerId, { dynamics_contact_id: created.contactid, name: contact.name, email: contact.email, phone: contact.phone, job_title: contact.job_title });
}

/** Re-confirms an already-linked contact still exists AND is active in CE,
 *  flagging it 'missing' if the CE record is gone or deactivated. No-op if
 *  nothing is linked yet. */
export async function verifyProjectContactInCrm(env: Bindings, db: D1Database, projectContactId: string): Promise<void> {
  const contact = await db
    .prepare("SELECT dynamics_contact_id FROM project_contacts WHERE id = ? LIMIT 1")
    .bind(projectContactId)
    .first<{ dynamics_contact_id: string | null }>();
  if (!contact?.dynamics_contact_id) return;

  const exists = await contactExists(env, contact.dynamics_contact_id);
  await db
    .prepare("UPDATE project_contacts SET ce_match_status = ?, ce_checked_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(exists ? "matched" : "missing", projectContactId)
    .run();
}
