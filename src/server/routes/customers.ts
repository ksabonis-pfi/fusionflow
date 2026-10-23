import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { getAccountTeam, getLastUcaasVendor } from "../services/dynamicsService";
import { findOrCreatePfUser } from "../lib/crmUsers";
import { refreshAccountTeamIfStale } from "../lib/accountTeamSync";
import { normalizeSolutionTypesField, normalizeSolutionRow } from "../../shared/solutionTypes";
import { getDemoVendor } from "../lib/appSettings";
import { clientAccountIds } from "../lib/permissions";
import { inPlaceholders } from "../lib/teamUtils";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Access helpers ─────────────────────────────────────────────────────────────

function canViewCustomers(role: string): boolean {
  // partner_ae intentionally excluded — partner AEs don't get the Customers
  // feature (they'd see every customer). They work via their assigned
  // solutions/projects, which have their own per-AE access scoping.
  return ["admin", "executive", "pm", "pf_ae", "pf_sa", "pf_csm", "pf_engineer", "client"].includes(role);
}

function canEditCustomer(role: string): boolean {
  return ["admin", "pm", "pf_ae", "pf_sa", "pf_csm"].includes(role);
}

// ── Select fragment ────────────────────────────────────────────────────────────

const CUSTOMER_SELECT = `
  SELECT c.*,
    ae.name  AS pf_ae_name,  ae.email  AS pf_ae_email,
    sa.name  AS pf_sa_name,  sa.email  AS pf_sa_email,
    csm.name AS pf_csm_name, csm.email AS pf_csm_email,
    hc.name  AS hypercare_engineer_name, hc.email AS hypercare_engineer_email
  FROM customers c
  LEFT JOIN users ae  ON ae.id  = c.pf_ae_user_id
  LEFT JOIN users sa  ON sa.id  = c.pf_sa_user_id
  LEFT JOIN users csm ON csm.id = c.pf_csm_user_id
  LEFT JOIN users hc  ON hc.id  = c.hypercare_engineer_user_id
`;

// ── Data migration (must come before /:id to avoid 405 shadowing) ─────────────
// Admin-only. Idempotent — safe to call multiple times.

app.post("/migrate", async (c) => {
  const auth = c.get("auth");
  if (auth.role !== "admin") throw new HTTPException(403, { message: "Admin only" });

  const db = c.env.DB;
  let created = 0;
  let linked = 0;

  // Create customers from solutions (preferred — they carry team data)
  const solutionAccounts = await db
    .prepare(`
      SELECT dynamics_account_id, customer_name, pf_ae_user_id, pf_sa_user_id, pf_csm_user_id
      FROM solutions
      WHERE dynamics_account_id IS NOT NULL AND dynamics_account_id != ''
      GROUP BY dynamics_account_id
    `)
    .all<{
      dynamics_account_id: string;
      customer_name: string;
      pf_ae_user_id: string | null;
      pf_sa_user_id: string | null;
      pf_csm_user_id: string | null;
    }>();

  for (const row of solutionAccounts.results ?? []) {
    const existing = await db
      .prepare("SELECT id FROM customers WHERE crm_account_id = ? LIMIT 1")
      .bind(row.dynamics_account_id)
      .first<{ id: string }>();

    let customerId = existing?.id;

    if (!customerId) {
      customerId = crypto.randomUUID();
      await db.prepare(
        `INSERT INTO customers (id, name, crm_account_id, pf_ae_user_id, pf_sa_user_id, pf_csm_user_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(customerId, row.customer_name, row.dynamics_account_id, row.pf_ae_user_id ?? null, row.pf_sa_user_id ?? null, row.pf_csm_user_id ?? null).run();
      created++;
    }

    const r = await db
      .prepare("UPDATE solutions SET customer_id = ? WHERE dynamics_account_id = ? AND (customer_id IS NULL OR customer_id != ?)")
      .bind(customerId, row.dynamics_account_id, customerId)
      .run();
    linked += r.meta.changes ?? 0;
  }

  // Create customers from projects whose CRM account isn't already covered
  const projectAccounts = await db
    .prepare(`
      SELECT dynamics_account_id, customer_name
      FROM projects
      WHERE dynamics_account_id IS NOT NULL AND dynamics_account_id != ''
        AND dynamics_account_id NOT IN (SELECT crm_account_id FROM customers WHERE crm_account_id IS NOT NULL)
      GROUP BY dynamics_account_id
    `)
    .all<{ dynamics_account_id: string; customer_name: string }>();

  for (const row of projectAccounts.results ?? []) {
    const customerId = crypto.randomUUID();
    await db.prepare(
      "INSERT INTO customers (id, name, crm_account_id) VALUES (?, ?, ?)"
    ).bind(customerId, row.customer_name, row.dynamics_account_id).run();
    created++;

    const r = await db
      .prepare("UPDATE projects SET customer_id = ? WHERE dynamics_account_id = ?")
      .bind(customerId, row.dynamics_account_id)
      .run();
    linked += r.meta.changes ?? 0;
  }

  // Link any remaining projects via crm_account_id match
  const rp = await db.prepare(`
    UPDATE projects
    SET customer_id = (SELECT id FROM customers WHERE crm_account_id = projects.dynamics_account_id LIMIT 1)
    WHERE dynamics_account_id IS NOT NULL AND customer_id IS NULL
      AND EXISTS (SELECT 1 FROM customers WHERE crm_account_id = projects.dynamics_account_id)
  `).run();
  linked += rp.meta.changes ?? 0;

  // Link optimize_accounts via their project's customer_id
  const ro = await db.prepare(`
    UPDATE optimize_accounts
    SET customer_id = (SELECT customer_id FROM projects WHERE projects.id = optimize_accounts.project_id LIMIT 1)
    WHERE customer_id IS NULL
      AND EXISTS (SELECT 1 FROM projects WHERE projects.id = optimize_accounts.project_id AND projects.customer_id IS NOT NULL)
  `).run();
  linked += ro.meta.changes ?? 0;

  return c.json({ created, linked });
});

// ── List ───────────────────────────────────────────────────────────────────────

app.get("/", async (c) => {
  const auth = c.get("auth");
  if (!canViewCustomers(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const db = c.env.DB;
  let sql = `${CUSTOMER_SELECT} WHERE 1=1`;
  const bindings: string[] = [];

  if (auth.role === "client") {
    // A contact on two customers (sister agencies sharing staff) sees both.
    const accountIds = clientAccountIds(auth.user);
    if (accountIds.length === 0) {
      // Fail closed. This previously skipped the filter entirely when a client
      // had no resolvable account, which showed them every customer in the
      // system — the one client-scoping site that failed open instead of shut.
      sql += " AND 1=0";
    } else {
      sql += ` AND c.crm_account_id IN (${inPlaceholders(accountIds)})`;
      bindings.push(...accountIds);
    }
  }

  // Demo-mode vendor lens: only customers with ≥1 matching-vendor project.
  const demoVendor = await getDemoVendor(db);
  if (demoVendor) {
    sql += " AND EXISTS (SELECT 1 FROM projects p WHERE p.customer_id = c.id AND LOWER(p.vendor) = ?)";
    bindings.push(demoVendor);
  }

  sql += " ORDER BY c.name ASC";
  const rows = await db.prepare(sql).bind(...bindings).all();
  return c.json(rows.results ?? []);
});

// ── Create ─────────────────────────────────────────────────────────────────────

const createCustomerSchema = z.object({
  name: z.string().min(1).max(500),
  crm_account_id: z.string().min(1),
  sharepoint_url: z.string().nullable().optional(),
  pf_ae_user_id: z.string().nullable().optional(),
  pf_sa_user_id: z.string().nullable().optional(),
  pf_csm_user_id: z.string().nullable().optional(),
});

app.post("/", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const parsed = createCustomerSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const { name, crm_account_id, sharepoint_url, pf_ae_user_id, pf_sa_user_id, pf_csm_user_id } = parsed.data;
  const db = c.env.DB;

  const existing = await db
    .prepare("SELECT id FROM customers WHERE crm_account_id = ? LIMIT 1")
    .bind(crm_account_id)
    .first<{ id: string }>();
  if (existing) throw new HTTPException(409, { message: "A customer with this CRM account already exists" });

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO customers (id, name, crm_account_id, sharepoint_url, pf_ae_user_id, pf_sa_user_id, pf_csm_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, name, crm_account_id, sharepoint_url ?? null, pf_ae_user_id ?? null, pf_sa_user_id ?? null, pf_csm_user_id ?? null)
    .run();

  const created = await db.prepare(`${CUSTOMER_SELECT} WHERE c.id = ? LIMIT 1`).bind(id).first();
  return c.json(created, 201);
});

// ── Detail ─────────────────────────────────────────────────────────────────────

app.get("/:id", async (c) => {
  const auth = c.get("auth");
  if (!canViewCustomers(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const customer = await c.env.DB
    .prepare(`${CUSTOMER_SELECT} WHERE c.id = ? LIMIT 1`)
    .bind(c.req.param("id"))
    .first();
  if (!customer) throw new HTTPException(404, { message: "Customer not found" });
  // Background-refresh the account team from CRM when stale (never blocks read).
  const cust = customer as { id?: string | null; crm_account_id?: string | null };
  refreshAccountTeamIfStale(c.env, c.executionCtx, cust.crm_account_id, cust.id);
  return c.json(customer);
});

// ── Update ─────────────────────────────────────────────────────────────────────

const updateCustomerSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  sharepoint_url: z.string().nullable().optional(),
  pf_ae_user_id: z.string().nullable().optional(),
  pf_sa_user_id: z.string().nullable().optional(),
  pf_csm_user_id: z.string().nullable().optional(),
  hypercare_engineer_user_id: z.string().nullable().optional(),
  // Client Success module, Phase 1 — see migration 0154.
  csm_tier: z.enum(["strategic", "core", "scale"]).nullable().optional(),
  csm_industry: z.string().max(200).nullable().optional(),
  csm_locations_count: z.number().int().min(0).nullable().optional(),
  client_success_specialist_user_id: z.string().nullable().optional(),
  executive_sponsor_contact_id: z.string().nullable().optional(),
  primary_admin_contact_id: z.string().nullable().optional(),
  relationship_strength: z.number().int().min(1).max(5).nullable().optional(),
  last_qbr_date: z.string().nullable().optional(),
  next_qbr_date: z.string().nullable().optional(),
  customer_since_date: z.string().nullable().optional(),
  csm_notes: z.string().max(4000).nullable().optional(),
});

app.patch("/:id", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const db = c.env.DB;
  const customerId = c.req.param("id");

  const existing = await db.prepare("SELECT id FROM customers WHERE id = ? LIMIT 1").bind(customerId).first();
  if (!existing) throw new HTTPException(404, { message: "Customer not found" });

  const parsed = updateCustomerSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) { fields.push(`${key} = ?`); values.push(value); }
  }
  if (!fields.length) throw new HTTPException(400, { message: "No fields to update" });
  fields.push("updated_at = CURRENT_TIMESTAMP");

  await db.prepare(`UPDATE customers SET ${fields.join(", ")} WHERE id = ?`).bind(...values, customerId).run();

  return c.json(await db.prepare(`${CUSTOMER_SELECT} WHERE c.id = ? LIMIT 1`).bind(customerId).first());
});

// ── Delete ─────────────────────────────────────────────────────────────────────

app.delete("/:id", async (c) => {
  const auth = c.get("auth");
  if (auth.role !== "admin") throw new HTTPException(403, { message: "Admin only" });

  const db = c.env.DB;
  const customerId = c.req.param("id");
  const existing = await db.prepare("SELECT id FROM customers WHERE id = ? LIMIT 1").bind(customerId).first();
  if (!existing) throw new HTTPException(404, { message: "Customer not found" });

  await db.prepare("DELETE FROM customers WHERE id = ?").bind(customerId).run();
  return c.json({ success: true });
});

// ── CRM sync: pull PF team from Dynamics ──────────────────────────────────────

app.post("/:id/crm-sync", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const db = c.env.DB;
  const customerId = c.req.param("id");

  const customer = await db
    .prepare("SELECT crm_account_id FROM customers WHERE id = ? LIMIT 1")
    .bind(customerId)
    .first<{ crm_account_id: string }>();
  if (!customer) throw new HTTPException(404, { message: "Customer not found" });

  const team = await getAccountTeam(c.env, customer.crm_account_id);

  const [ae_user_id, sa_user_id, csm_user_id] = await Promise.all([
    findOrCreatePfUser(db, team.ae_email, team.ae_name, "pf_ae"),
    findOrCreatePfUser(db, team.sa_email, team.sa_name, "pf_sa"),
    findOrCreatePfUser(db, team.csm_email, team.csm_name, "pf_csm"),
  ]);

  await db.prepare(`
    UPDATE customers
    SET pf_ae_user_id  = COALESCE(?, pf_ae_user_id),
        pf_sa_user_id  = COALESCE(?, pf_sa_user_id),
        pf_csm_user_id = COALESCE(?, pf_csm_user_id),
        address_city   = COALESCE(?, address_city),
        address_state  = COALESCE(?, address_state),
        updated_at     = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(ae_user_id, sa_user_id, csm_user_id, team.address_city, team.address_state, customerId).run();

  const updated = await db.prepare(`${CUSTOMER_SELECT} WHERE c.id = ? LIMIT 1`).bind(customerId).first();
  return c.json({ customer: updated, crm: { ae_name: team.ae_name, sa_name: team.sa_name, csm_name: team.csm_name } });
});

// ── Contacts ───────────────────────────────────────────────────────────────────

app.get("/:id/contacts", async (c) => {
  const auth = c.get("auth");
  if (!canViewCustomers(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await c.env.DB
    .prepare("SELECT * FROM customer_contacts WHERE customer_id = ? ORDER BY name ASC")
    .bind(c.req.param("id"))
    .all();
  return c.json(rows.results ?? []);
});

const contactSchema = z.object({
  dynamics_contact_id: z.string().optional(),
  name: z.string().min(1).max(200),
  email: z.string().email().nullable().optional().or(z.literal("")),
  phone: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  contact_role: z.string().nullable().optional(),
});

// Client Success module, Phase 1 — role/engagement/active-status tracking on
// an existing contact. Separate from contactSchema above (used at create
// time) since these fields are only ever set after the fact.
const contactCsmUpdateSchema = z.object({
  csm_role: z.enum(["executive_sponsor", "decision_maker", "admin", "champion", "procurement", "end_user"]).nullable().optional(),
  engagement_level: z.enum(["high", "medium", "low"]).nullable().optional(),
  still_active: z.number().int().min(0).max(1).optional(),
});

app.post("/:id/contacts", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const db = c.env.DB;
  const customerId = c.req.param("id");

  const existing = await db.prepare("SELECT id FROM customers WHERE id = ? LIMIT 1").bind(customerId).first();
  if (!existing) throw new HTTPException(404, { message: "Customer not found" });

  const parsed = contactSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid contact data" });

  const { dynamics_contact_id, name, email, phone, job_title, contact_role } = parsed.data;
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO customer_contacts (id, customer_id, dynamics_contact_id, name, email, phone, job_title, contact_role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, customerId, dynamics_contact_id ?? null, name, email || null, phone ?? null, job_title ?? null, contact_role ?? null)
    .run();

  return c.json(await db.prepare("SELECT * FROM customer_contacts WHERE id = ? LIMIT 1").bind(id).first(), 201);
});

app.delete("/:id/contacts/:contactId", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const { id: customerId, contactId } = c.req.param();
  const contact = await c.env.DB
    .prepare("SELECT id FROM customer_contacts WHERE id = ? AND customer_id = ? LIMIT 1")
    .bind(contactId, customerId)
    .first();
  if (!contact) throw new HTTPException(404, { message: "Contact not found" });

  await c.env.DB.prepare("DELETE FROM customer_contacts WHERE id = ?").bind(contactId).run();
  return c.json({ success: true });
});

app.patch("/:id/contacts/:contactId", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const db = c.env.DB;
  const { id: customerId, contactId } = c.req.param();
  const existing = await db
    .prepare("SELECT id FROM customer_contacts WHERE id = ? AND customer_id = ? LIMIT 1")
    .bind(contactId, customerId)
    .first();
  if (!existing) throw new HTTPException(404, { message: "Contact not found" });

  const parsed = contactCsmUpdateSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid contact data" });

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) { fields.push(`${key} = ?`); values.push(value); }
  }
  if (!fields.length) throw new HTTPException(400, { message: "No fields to update" });

  await db.prepare(`UPDATE customer_contacts SET ${fields.join(", ")} WHERE id = ?`).bind(...values, contactId).run();
  return c.json(await db.prepare("SELECT * FROM customer_contacts WHERE id = ? LIMIT 1").bind(contactId).first());
});

// ── Provider AEs ───────────────────────────────────────────────────────────────

app.get("/:id/provider-aes", async (c) => {
  const auth = c.get("auth");
  if (!canViewCustomers(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await c.env.DB
    .prepare("SELECT * FROM customer_provider_aes WHERE customer_id = ? ORDER BY company ASC, name ASC")
    .bind(c.req.param("id"))
    .all();
  return c.json(rows.results ?? []);
});

const providerAeSchema = z.object({
  name: z.string().min(1).max(200),
  company: z.string().nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  phone: z.string().nullable().optional(),
});

app.post("/:id/provider-aes", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const db = c.env.DB;
  const customerId = c.req.param("id");

  const existing = await db.prepare("SELECT id FROM customers WHERE id = ? LIMIT 1").bind(customerId).first();
  if (!existing) throw new HTTPException(404, { message: "Customer not found" });

  const parsed = providerAeSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid provider AE data" });

  const { name, company, email, phone } = parsed.data;
  const id = crypto.randomUUID();

  await db
    .prepare("INSERT INTO customer_provider_aes (id, customer_id, name, company, email, phone) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, customerId, name, company ?? null, email || null, phone ?? null)
    .run();

  return c.json(await db.prepare("SELECT * FROM customer_provider_aes WHERE id = ? LIMIT 1").bind(id).first(), 201);
});

app.patch("/:id/provider-aes/:aeId", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const db = c.env.DB;
  const { id: customerId, aeId } = c.req.param();

  const existing = await db
    .prepare("SELECT id FROM customer_provider_aes WHERE id = ? AND customer_id = ? LIMIT 1")
    .bind(aeId, customerId)
    .first();
  if (!existing) throw new HTTPException(404, { message: "Provider AE not found" });

  const parsed = providerAeSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid provider AE data" });

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) { fields.push(`${key} = ?`); values.push(value); }
  }
  if (!fields.length) throw new HTTPException(400, { message: "No fields to update" });

  await db.prepare(`UPDATE customer_provider_aes SET ${fields.join(", ")} WHERE id = ?`).bind(...values, aeId).run();

  return c.json(await db.prepare("SELECT * FROM customer_provider_aes WHERE id = ? LIMIT 1").bind(aeId).first());
});

app.delete("/:id/provider-aes/:aeId", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const { id: customerId, aeId } = c.req.param();
  const existing = await c.env.DB
    .prepare("SELECT id FROM customer_provider_aes WHERE id = ? AND customer_id = ? LIMIT 1")
    .bind(aeId, customerId)
    .first();
  if (!existing) throw new HTTPException(404, { message: "Provider AE not found" });

  await c.env.DB.prepare("DELETE FROM customer_provider_aes WHERE id = ?").bind(aeId).run();
  return c.json({ success: true });
});

// ── Client Success: Platforms / Subscriptions ─────────────────────────────────
// Phase 1 of the CSM App Spec. One row per vendor subscription on an account.

app.get("/:id/platforms", async (c) => {
  const auth = c.get("auth");
  if (!canViewCustomers(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await c.env.DB
    .prepare("SELECT * FROM customer_platforms WHERE customer_id = ? ORDER BY created_at ASC")
    .bind(c.req.param("id"))
    .all();
  return c.json(rows.results ?? []);
});

const platformSchema = z.object({
  vendor: z.enum(["zoom", "ringcentral", "8x8", "dialpad", "other"]),
  product: z.enum(["phone", "contact_center", "meetings", "rooms", "webinar", "wem_qm", "ai_addons"]),
  licenses_purchased: z.number().int().min(0).nullable().optional(),
  licenses_assigned: z.number().int().min(0).nullable().optional(),
  active_users_30d: z.number().int().min(0).nullable().optional(),
  mrr: z.number().nullable().optional(),
  arr: z.number().nullable().optional(),
  contract_start_date: z.string().nullable().optional(),
  contract_end_date: z.string().nullable().optional(),
  term_length_months: z.number().int().min(0).nullable().optional(),
  auto_renew: z.number().int().min(0).max(1).optional(),
  go_live_date: z.string().nullable().optional(),
  implementation_project_id: z.string().nullable().optional(),
  integrations_in_place: z.array(z.string()).optional(),
});

app.post("/:id/platforms", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const db = c.env.DB;
  const customerId = c.req.param("id");
  const existing = await db.prepare("SELECT id FROM customers WHERE id = ? LIMIT 1").bind(customerId).first();
  if (!existing) throw new HTTPException(404, { message: "Customer not found" });

  const parsed = platformSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid platform data" });
  const p = parsed.data;
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO customer_platforms (
        id, customer_id, vendor, product, licenses_purchased, licenses_assigned, active_users_30d,
        mrr, arr, contract_start_date, contract_end_date, term_length_months, auto_renew,
        go_live_date, implementation_project_id, integrations_in_place
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id, customerId, p.vendor, p.product, p.licenses_purchased ?? null, p.licenses_assigned ?? null, p.active_users_30d ?? null,
      p.mrr ?? null, p.arr ?? null, p.contract_start_date ?? null, p.contract_end_date ?? null, p.term_length_months ?? null, p.auto_renew ?? 0,
      p.go_live_date ?? null, p.implementation_project_id ?? null, p.integrations_in_place ? JSON.stringify(p.integrations_in_place) : null
    )
    .run();

  // Every subscription starts a renewal record immediately — the Renewal
  // Pipeline board and My Book both expect one per platform, even before the
  // CSM has entered any renewal-specific detail yet.
  await db
    .prepare("INSERT INTO customer_renewals (id, customer_platform_id) VALUES (?, ?)")
    .bind(crypto.randomUUID(), id)
    .run();

  return c.json(await db.prepare("SELECT * FROM customer_platforms WHERE id = ? LIMIT 1").bind(id).first(), 201);
});

app.patch("/:id/platforms/:platformId", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const db = c.env.DB;
  const { id: customerId, platformId } = c.req.param();
  const existing = await db
    .prepare("SELECT id FROM customer_platforms WHERE id = ? AND customer_id = ? LIMIT 1")
    .bind(platformId, customerId)
    .first();
  if (!existing) throw new HTTPException(404, { message: "Platform not found" });

  const parsed = platformSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid platform data" });

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;
    if (key === "integrations_in_place") {
      fields.push("integrations_in_place = ?");
      values.push(JSON.stringify(value));
      continue;
    }
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (!fields.length) throw new HTTPException(400, { message: "No fields to update" });
  fields.push("updated_at = CURRENT_TIMESTAMP");

  await db.prepare(`UPDATE customer_platforms SET ${fields.join(", ")} WHERE id = ?`).bind(...values, platformId).run();
  return c.json(await db.prepare("SELECT * FROM customer_platforms WHERE id = ? LIMIT 1").bind(platformId).first());
});

app.delete("/:id/platforms/:platformId", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const { id: customerId, platformId } = c.req.param();
  const existing = await c.env.DB
    .prepare("SELECT id FROM customer_platforms WHERE id = ? AND customer_id = ? LIMIT 1")
    .bind(platformId, customerId)
    .first();
  if (!existing) throw new HTTPException(404, { message: "Platform not found" });

  await c.env.DB.prepare("DELETE FROM customer_platforms WHERE id = ?").bind(platformId).run();
  return c.json({ success: true });
});

// ── Client Success: Renewal ────────────────────────────────────────────────────
// One active renewal per platform (the latest row). PATCH is what the Renewal
// Pipeline board calls when a card is dragged to a new stage.

app.get("/:id/platforms/:platformId/renewal", async (c) => {
  const auth = c.get("auth");
  if (!canViewCustomers(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const { id: customerId, platformId } = c.req.param();
  const platform = await c.env.DB
    .prepare("SELECT id FROM customer_platforms WHERE id = ? AND customer_id = ? LIMIT 1")
    .bind(platformId, customerId)
    .first();
  if (!platform) throw new HTTPException(404, { message: "Platform not found" });

  const renewal = await c.env.DB
    .prepare("SELECT * FROM customer_renewals WHERE customer_platform_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(platformId)
    .first();
  return c.json(renewal ?? null);
});

const renewalSchema = z.object({
  stage: z.enum(["not_started", "discovery", "proposal", "negotiation", "committed", "renewed", "lost"]).optional(),
  forecast: z.enum(["likely", "at_risk", "churn_expected"]).nullable().optional(),
  current_arr: z.number().nullable().optional(),
  expected_renewal_arr: z.number().nullable().optional(),
  decision_maker_contact_id: z.string().nullable().optional(),
  procurement_contact_id: z.string().nullable().optional(),
  competitive_threat: z.string().nullable().optional(),
  loss_reason: z.string().nullable().optional(),
  linked_opportunity_id: z.string().nullable().optional(),
});

app.patch("/:id/platforms/:platformId/renewal", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const db = c.env.DB;
  const { id: customerId, platformId } = c.req.param();
  const platform = await db
    .prepare("SELECT id FROM customer_platforms WHERE id = ? AND customer_id = ? LIMIT 1")
    .bind(platformId, customerId)
    .first();
  if (!platform) throw new HTTPException(404, { message: "Platform not found" });

  const renewal = await db
    .prepare("SELECT id FROM customer_renewals WHERE customer_platform_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(platformId)
    .first<{ id: string }>();
  if (!renewal) throw new HTTPException(404, { message: "No renewal record for this platform" });

  const parsed = renewalSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid renewal data" });
  if (parsed.data.stage === "lost" && !parsed.data.loss_reason) {
    throw new HTTPException(400, { message: "A loss reason is required to mark a renewal as Lost" });
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) { fields.push(`${key} = ?`); values.push(value); }
  }
  if (!fields.length) throw new HTTPException(400, { message: "No fields to update" });
  fields.push("updated_at = CURRENT_TIMESTAMP");

  await db.prepare(`UPDATE customer_renewals SET ${fields.join(", ")} WHERE id = ?`).bind(...values, renewal.id).run();
  return c.json(await db.prepare("SELECT * FROM customer_renewals WHERE id = ? LIMIT 1").bind(renewal.id).first());
});

// ── Client Success: Engagement Log ─────────────────────────────────────────────

app.get("/:id/engagements", async (c) => {
  const auth = c.get("auth");
  if (!canViewCustomers(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const limit = Math.min(Number(c.req.query("limit")) || 100, 500);
  const rows = await c.env.DB
    .prepare("SELECT * FROM customer_engagements WHERE customer_id = ? ORDER BY engaged_at DESC LIMIT ?")
    .bind(c.req.param("id"), limit)
    .all();
  return c.json(rows.results ?? []);
});

const engagementAttendeeSchema = z.object({ kind: z.enum(["contact", "user"]), id: z.string() });

const engagementSchema = z.object({
  engaged_at: z.string().min(1),
  type: z.enum(["qbr", "health_check", "executive_call", "training", "escalation", "onsite", "email"]),
  attendees: z.array(engagementAttendeeSchema).optional(),
  summary: z.string().max(4000).nullable().optional(),
  sentiment: z.enum(["positive", "neutral", "negative"]).nullable().optional(),
  next_steps: z.string().max(2000).nullable().optional(),
  follow_up_owner_user_id: z.string().nullable().optional(),
  follow_up_due_date: z.string().nullable().optional(),
});

app.post("/:id/engagements", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const db = c.env.DB;
  const customerId = c.req.param("id");
  const existing = await db.prepare("SELECT id FROM customers WHERE id = ? LIMIT 1").bind(customerId).first();
  if (!existing) throw new HTTPException(404, { message: "Customer not found" });

  const parsed = engagementSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid engagement data" });
  const e = parsed.data;
  const id = crypto.randomUUID();

  await db
    .prepare(
      `INSERT INTO customer_engagements (
        id, customer_id, engaged_at, type, attendees, summary, sentiment,
        next_steps, follow_up_owner_user_id, follow_up_due_date, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id, customerId, e.engaged_at, e.type, e.attendees ? JSON.stringify(e.attendees) : null, e.summary ?? null, e.sentiment ?? null,
      e.next_steps ?? null, e.follow_up_owner_user_id ?? null, e.follow_up_due_date ?? null, auth.user.id
    )
    .run();

  return c.json(await db.prepare("SELECT * FROM customer_engagements WHERE id = ? LIMIT 1").bind(id).first(), 201);
});

const engagementUpdateSchema = engagementSchema.partial().extend({
  follow_up_done: z.number().int().min(0).max(1).optional(),
});

app.patch("/:id/engagements/:engagementId", async (c) => {
  const auth = c.get("auth");
  if (!canEditCustomer(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const db = c.env.DB;
  const { id: customerId, engagementId } = c.req.param();
  const existing = await db
    .prepare("SELECT id FROM customer_engagements WHERE id = ? AND customer_id = ? LIMIT 1")
    .bind(engagementId, customerId)
    .first();
  if (!existing) throw new HTTPException(404, { message: "Engagement not found" });

  const parsed = engagementUpdateSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid engagement data" });

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;
    if (key === "attendees") {
      fields.push("attendees = ?");
      values.push(JSON.stringify(value));
      continue;
    }
    fields.push(`${key} = ?`);
    values.push(value);
  }
  if (!fields.length) throw new HTTPException(400, { message: "No fields to update" });

  await db.prepare(`UPDATE customer_engagements SET ${fields.join(", ")} WHERE id = ?`).bind(...values, engagementId).run();
  return c.json(await db.prepare("SELECT * FROM customer_engagements WHERE id = ? LIMIT 1").bind(engagementId).first());
});

// ── Journey tabs ───────────────────────────────────────────────────────────────

app.get("/:id/solutions", async (c) => {
  const auth = c.get("auth");
  if (!canViewCustomers(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const demoVendor = await getDemoVendor(c.env.DB);
  const vendorClause = demoVendor ? " AND LOWER(s.vendor) = ?" : "";
  const vendorBinding = demoVendor ? [demoVendor] : [];

  const rows = await c.env.DB
    .prepare(`
      SELECT s.id, s.name, s.vendor, s.solution_types, s.other_technologies, s.status,
             s.created_at, s.updated_at, s.linked_project_id, s.dynamics_account_id, s.journeys
      FROM solutions s
      WHERE s.customer_id = ?${vendorClause}
      ORDER BY s.updated_at DESC
    `)
    .bind(c.req.param("id"), ...vendorBinding)
    .all();
  return c.json((rows.results ?? []).map(normalizeSolutionRow));
});

app.get("/:id/projects", async (c) => {
  const auth = c.get("auth");
  if (!canViewCustomers(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const demoVendor = await getDemoVendor(c.env.DB);
  const vendorClause = demoVendor ? " AND LOWER(p.vendor) = ?" : "";
  const vendorBinding = demoVendor ? [demoVendor] : [];

  const rows = await c.env.DB
    .prepare(`
      SELECT p.id, p.name, p.vendor, p.solution_types, p.status, p.health,
             p.kickoff_date, p.target_go_live_date, p.actual_go_live_date,
             p.pm_user_id, p.created_at, p.updated_at,
             CASE WHEN EXISTS(SELECT 1 FROM optimize_accounts oa WHERE oa.project_id = p.id) THEN 1 ELSE 0 END AS has_optimization
      FROM projects p
      WHERE p.customer_id = ? AND (p.archived = 0 OR p.archived IS NULL)${vendorClause}
      ORDER BY p.updated_at DESC
    `)
    .bind(c.req.param("id"), ...vendorBinding)
    .all();
  return c.json((rows.results ?? []).map(normalizeSolutionTypesField));
});

app.get("/:id/optimizations", async (c) => {
  const auth = c.get("auth");
  if (!canViewCustomers(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const demoVendor = await getDemoVendor(c.env.DB);
  const vendorClause = demoVendor ? " AND LOWER(p.vendor) = ?" : "";
  const vendorBinding = demoVendor ? [demoVendor] : [];

  const rows = await c.env.DB
    .prepare(`
      SELECT oa.id, oa.project_id, oa.optimize_status, oa.graduated_at, oa.next_review_date,
             p.name AS project_name, p.vendor, p.solution_types, p.actual_go_live_date
      FROM optimize_accounts oa
      JOIN projects p ON p.id = oa.project_id
      -- COALESCE, not oa.customer_id alone: that column is DENORMALIZED and no
      -- graduation path has ever written it (see routes/optimize.ts INSERTs),
      -- so it was NULL on every row and this tab was empty for every customer.
      -- The authoritative link is the project's — optimize accounts hang off a
      -- project 1:1, and projects carry customer_id. Same pattern already used
      -- by routes/optimize.ts:140, which hit this first.
      WHERE COALESCE(oa.customer_id, p.customer_id) = ?${vendorClause}
      ORDER BY oa.graduated_at DESC
    `)
    .bind(c.req.param("id"), ...vendorBinding)
    .all();
  return c.json((rows.results ?? []).map(normalizeSolutionTypesField));
});

// ── Most-recent UCaaS vendor (from D365 am_soldtechnology) ────────────────────

app.get("/:id/last-vendor", async (c) => {
  const auth = c.get("auth");
  if (!canViewCustomers(auth.role)) throw new HTTPException(403, { message: "Forbidden" });

  const customer = await c.env.DB
    .prepare("SELECT crm_account_id FROM customers WHERE id = ? LIMIT 1")
    .bind(c.req.param("id"))
    .first<{ crm_account_id: string | null }>();
  if (!customer) throw new HTTPException(404, { message: "Customer not found" });
  if (!customer.crm_account_id) return c.json({ vendor: null });

  const result = await getLastUcaasVendor(c.env, customer.crm_account_id);
  return c.json(result ?? { vendor: null });
});

export default app;
