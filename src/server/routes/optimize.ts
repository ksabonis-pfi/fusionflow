import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { zPlanDate, zPlanDateOrBlank } from "../lib/dateSchemas";
import type { Bindings, Variables } from "../types";
import { findOrCreatePfUser } from "../lib/crmUsers";
import { refreshAccountTeamIfStale, syncAccountTeamToCustomer } from "../lib/accountTeamSync";
import { linkProjectToOptimize } from "../lib/teamUtils";
import { fetchZoomUtilizationSnapshot } from "../services/zoomService";
import { fetchRCUtilizationSnapshot } from "../services/ringCentralService";
import { searchAccounts, getAccountTeam } from "../services/dynamicsService";
import { scoreAssessment } from "../lib/scoringEngine";
import { SOLUTION_TYPES, serializeSolutionTypes, normalizeSolutionTypesField } from "../../shared/solutionTypes";
import { deriveTimeRating } from "../../shared/timeFramework";
import { getDemoVendor } from "../lib/appSettings";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// An Optimize account belongs to a customer (one per customer) and stands on
// its own — no project row behind it (migration 0158). Implementation projects
// that graduated are linked through optimize_account_projects for history only.

// Only internal PF roles can access Optimize
function assertOptimizeAccess(role: string) {
  if (!["admin", "pm", "pf_ae", "pf_sa", "pf_csm", "pf_engineer", "executive"].includes(role)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
}
function assertOptimizeEdit(role: string) {
  if (!["admin", "pf_sa", "pf_csm", "pm"].includes(role)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
}

// Columns shared by the list, single-account and create responses. creds_key is
// the id the account's Zoom / RingCentral credentials live under in KV.
const ACCOUNT_COLUMNS = `
  oa.id, oa.customer_id, oa.graduated_at, oa.graduation_method,
  oa.optimize_status, oa.next_review_date, oa.notes, oa.updated_at,
  oa.vendor, oa.solution_types, oa.go_live_date AS actual_go_live_date,
  COALESCE(oa.creds_key, oa.id) AS creds_key,
  cust.name AS customer_name, cust.crm_account_id AS dynamics_account_id,
  cust.sharepoint_url AS customer_sharepoint_url,
  cust.pf_ae_user_id AS ae_user_id, ae.name AS ae_name, ae.email AS ae_email,
  cust.pf_sa_user_id AS sa_user_id, sa.name AS sa_name, sa.email AS sa_email,
  cust.pf_csm_user_id AS csm_user_id, csm.name AS csm_name, csm.email AS csm_email`;

const ACCOUNT_FROM = `
  FROM optimize_accounts oa
  JOIN customers cust ON cust.id = oa.customer_id
  LEFT JOIN users ae  ON ae.id  = cust.pf_ae_user_id
  LEFT JOIN users sa  ON sa.id  = cust.pf_sa_user_id
  LEFT JOIN users csm ON csm.id = cust.pf_csm_user_id`;

async function loadAccount(db: D1Database, accountId: string) {
  const row = await db
    .prepare(`SELECT ${ACCOUNT_COLUMNS} ${ACCOUNT_FROM} WHERE oa.id = ? LIMIT 1`)
    .bind(accountId)
    .first<Record<string, unknown>>();
  if (!row) return null;
  const linked = await db
    .prepare(
      `SELECT p.id, p.name, p.status, p.actual_go_live_date, l.linked_at
       FROM optimize_account_projects l JOIN projects p ON p.id = l.project_id
       WHERE l.optimize_account_id = ?
       ORDER BY l.linked_at DESC`,
    )
    .bind(accountId)
    .all();
  return { ...normalizeSolutionTypesField(row), linked_projects: linked.results ?? [] };
}

async function requireAccount(db: D1Database, accountId: string) {
  const row = await db
    .prepare("SELECT id, vendor, COALESCE(creds_key, id) AS creds_key FROM optimize_accounts WHERE id = ? LIMIT 1")
    .bind(accountId)
    .first<{ id: string; vendor: string | null; creds_key: string }>();
  if (!row) throw new HTTPException(404, { message: "Optimize account not found" });
  return row;
}

// ── Account list ───────────────────────────────────────────────────────────────

app.get("/accounts", async (c) => {
  assertOptimizeAccess(c.get("auth").role);
  const demoVendor = await getDemoVendor(c.env.DB);
  const vendorClause = demoVendor ? "WHERE LOWER(oa.vendor) = ?" : "";
  const vendorBinding = demoVendor ? [demoVendor] : [];
  const rows = await c.env.DB.prepare(`
    SELECT ${ACCOUNT_COLUMNS},
      (SELECT conducted_date FROM impact_assessments WHERE optimize_account_id = oa.id
       ORDER BY conducted_date DESC LIMIT 1) AS last_assessment_date,
      (SELECT overall_score FROM impact_assessments WHERE optimize_account_id = oa.id
       ORDER BY conducted_date DESC LIMIT 1) AS last_assessment_score
    ${ACCOUNT_FROM}
    ${vendorClause}
    ORDER BY oa.graduated_at DESC
  `).bind(...vendorBinding).all();
  return c.json((rows.results ?? []).map(normalizeSolutionTypesField));
});

// ── Eligible projects (went live, not yet linked to an Optimize account) ───────

app.get("/eligible", async (c) => {
  assertOptimizeAccess(c.get("auth").role);
  const rows = await c.env.DB.prepare(`
    SELECT p.id, p.name, p.customer_name, p.vendor, p.solution_types,
           p.actual_go_live_date, p.pm_user_id
    FROM projects p
    WHERE (p.archived = 0 OR p.archived IS NULL)
      AND p.id NOT IN (SELECT project_id FROM optimize_account_projects)
      AND p.actual_go_live_date IS NOT NULL
    ORDER BY p.actual_go_live_date DESC
  `).all();
  return c.json((rows.results ?? []).map(normalizeSolutionTypesField));
});

// ── Single account ─────────────────────────────────────────────────────────────

app.get("/accounts/:accountId", async (c) => {
  assertOptimizeAccess(c.get("auth").role);
  const id = c.req.param("accountId");
  // Links from before migration 0158 carry the old project id, which lives on
  // as creds_key; resolve those so bookmarks keep working (the page then
  // redirects to the account id).
  const legacy = await c.env.DB
    .prepare("SELECT id FROM optimize_accounts WHERE id = ? OR creds_key = ? ORDER BY id = ? DESC LIMIT 1")
    .bind(id, id, id)
    .first<{ id: string }>();
  const account = legacy ? await loadAccount(c.env.DB, legacy.id) : null;
  if (!account) throw new HTTPException(404, { message: "Optimize account not found" });
  // Background-refresh the account team from CRM when stale (never blocks read).
  const a = account as { dynamics_account_id?: string | null; customer_id?: string | null };
  refreshAccountTeamIfStale(c.env, c.executionCtx, a.dynamics_account_id, a.customer_id);
  return c.json(account);
});

// ── CRM account search ─────────────────────────────────────────────────────────

app.get("/crm/accounts", async (c) => {
  assertOptimizeAccess(c.get("auth").role);
  const q = c.req.query("q") ?? "";
  const results = await searchAccounts(c.env, q);
  return c.json(results);
});

// ── CRM account team (find-or-create users, return with IDs) ──────────────────

app.get("/crm/accounts/:accountId/team", async (c) => {
  assertOptimizeAccess(c.get("auth").role);
  const db = c.env.DB;
  const team = await getAccountTeam(c.env, c.req.param("accountId"));
  const [ae_user_id, sa_user_id, csm_user_id] = await Promise.all([
    findOrCreatePfUser(db, team.ae_email, team.ae_name, "pf_ae"),
    findOrCreatePfUser(db, team.sa_email, team.sa_name, "pf_sa"),
    findOrCreatePfUser(db, team.csm_email, team.csm_name, "pf_csm"),
  ]);
  return c.json({ ...team, ae_user_id, sa_user_id, csm_user_id });
});

// ── CRM sync: refresh AE/SA/CSM from CRM account team ─────────────────────────

app.post("/accounts/:accountId/crm-sync", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const accountId = c.req.param("accountId");

  const row = await db
    .prepare(
      `SELECT cust.crm_account_id, oa.customer_id
       FROM optimize_accounts oa JOIN customers cust ON cust.id = oa.customer_id
       WHERE oa.id = ? LIMIT 1`,
    )
    .bind(accountId)
    .first<{ crm_account_id: string | null; customer_id: string }>();
  if (!row) throw new HTTPException(404, { message: "Optimize account not found" });
  if (!row.crm_account_id) throw new HTTPException(400, { message: "No CRM account linked to this customer" });

  // Manual force-refresh: pull the team from CRM and write it onto the customer.
  // Same code path the read-time SWR refresh and daily cron use.
  const team = await syncAccountTeamToCustomer(c.env, row.crm_account_id, row.customer_id);

  return c.json({ account: await loadAccount(db, accountId), crm: { ae_name: team.ae_name, sa_name: team.sa_name, csm_name: team.csm_name } });
});

// ── New account (from a CRM account or an existing customer) ──────────────────

const createAccountSchema = z.object({
  dynamics_account_id: z.string().min(1).nullable().optional(),
  customer_id: z.string().min(1).nullable().optional(),
  customer_name: z.string().min(1).max(500).nullable().optional(),
  vendor: z.string().max(100).nullable().optional(),
  solution_types: z.array(z.enum(SOLUTION_TYPES)).default([]),
  actual_go_live_date: zPlanDateOrBlank.nullable().optional(),
  next_review_date: zPlanDateOrBlank.nullable().optional(),
  notes: z.string().nullable().optional(),
});

app.post("/accounts", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const auth = c.get("auth");

  const parsed = createAccountSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });
  const d = parsed.data;

  // Resolve the customer: an existing CloudConnect customer, or the customer
  // for a CRM account (created, with its account team, if it's new to us).
  let customerId: string | null = null;
  if (d.customer_id) {
    const existing = await db.prepare("SELECT id FROM customers WHERE id = ? LIMIT 1").bind(d.customer_id).first<{ id: string }>();
    if (!existing) throw new HTTPException(404, { message: "Customer not found" });
    customerId = existing.id;
  } else if (d.dynamics_account_id) {
    const existing = await db
      .prepare("SELECT id FROM customers WHERE crm_account_id = ? LIMIT 1")
      .bind(d.dynamics_account_id)
      .first<{ id: string }>();
    if (existing) {
      customerId = existing.id;
    } else {
      if (!d.customer_name) throw new HTTPException(400, { message: "customer_name is required for a new CRM account" });
      customerId = crypto.randomUUID();
      await db
        .prepare("INSERT INTO customers (id, name, crm_account_id) VALUES (?, ?, ?)")
        .bind(customerId, d.customer_name, d.dynamics_account_id)
        .run();
      try {
        await syncAccountTeamToCustomer(c.env, d.dynamics_account_id, customerId);
      } catch { /* sync is best-effort */ }
    }
  } else {
    throw new HTTPException(400, { message: "Choose the customer's CRM account" });
  }

  const already = await db
    .prepare("SELECT id FROM optimize_accounts WHERE customer_id = ? LIMIT 1")
    .bind(customerId)
    .first<{ id: string }>();
  if (already) {
    throw new HTTPException(409, { message: "This customer already has an Optimize account" });
  }

  const accountId = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO optimize_accounts
      (id, customer_id, vendor, solution_types, go_live_date, creds_key,
       graduated_by, graduation_method, next_review_date, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'direct', ?, ?)
  `).bind(
    accountId, customerId, d.vendor ?? null, serializeSolutionTypes(d.solution_types),
    d.actual_go_live_date || null, accountId, auth.user.id,
    d.next_review_date || null, d.notes ?? null,
  ).run();

  return c.json(await loadAccount(db, accountId), 201);
});

// ── Graduate a project: link it to its customer's Optimize account ─────────────

const graduateSchema = z.object({
  next_review_date: zPlanDateOrBlank.nullable().optional(),
  notes: z.string().nullable().optional(),
});

app.post("/projects/:projectId/graduate", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const projectId = c.req.param("projectId");
  const auth = c.get("auth");

  const body = await c.req.json().catch(() => ({}));
  const parsed = graduateSchema.safeParse(body);
  const data = parsed.success ? parsed.data : {};

  const result = await linkProjectToOptimize(db, projectId, auth.user.id, "manual");
  if (result.status === "no_project") throw new HTTPException(404, { message: "Project not found" });
  if (result.status === "no_customer") {
    throw new HTTPException(400, { message: "Link this project to a customer before moving it to Optimize" });
  }
  if (result.status === "already_linked") throw new HTTPException(409, { message: "Project already in Optimize" });

  // Review date / notes only seed a brand-new account; an existing one keeps its own.
  if (result.created && (data.next_review_date || data.notes)) {
    await db
      .prepare("UPDATE optimize_accounts SET next_review_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(data.next_review_date || null, data.notes ?? null, result.accountId)
      .run();
  }

  return c.json(await loadAccount(db, result.accountId), 201);
});

// ── Unlink a graduated project (the account and its data stay) ─────────────────

app.delete("/accounts/:accountId/projects/:projectId", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const { accountId, projectId } = c.req.param();
  const res = await c.env.DB
    .prepare("DELETE FROM optimize_account_projects WHERE optimize_account_id = ? AND project_id = ?")
    .bind(accountId, projectId)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Project is not linked to this account" });
  return c.json({ success: true });
});

// ── Update account ─────────────────────────────────────────────────────────────

const updateAccountSchema = z.object({
  optimize_status: z.enum(["active", "paused", "churned"]).optional(),
  next_review_date: zPlanDateOrBlank.nullable().optional(),
  notes: z.string().nullable().optional(),
  vendor: z.string().max(100).nullable().optional(),
  solution_types: z.array(z.enum(SOLUTION_TYPES)).optional(),
  actual_go_live_date: zPlanDateOrBlank.nullable().optional(),
});

app.patch("/accounts/:accountId", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const accountId = c.req.param("accountId");
  await requireAccount(db, accountId);

  const parsed = updateAccountSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const fields: string[] = [], values: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    if (k === "solution_types") { fields.push("solution_types = ?"); values.push(serializeSolutionTypes(v as (typeof SOLUTION_TYPES)[number][])); }
    else if (k === "actual_go_live_date") { fields.push("go_live_date = ?"); values.push(v || null); }
    else { fields.push(`${k} = ?`); values.push(v); }
  }
  if (!fields.length) throw new HTTPException(400, { message: "No fields to update" });
  fields.push("updated_at = CURRENT_TIMESTAMP");

  await db.prepare(`UPDATE optimize_accounts SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values, accountId).run();

  return c.json(await loadAccount(db, accountId));
});

// ── Delete account ─────────────────────────────────────────────────────────────
// Removes the account and (via ON DELETE CASCADE) its assessments, tech stack,
// roadmap, utilization history and project links. Linked projects themselves
// are untouched.

app.delete("/accounts/:accountId", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const accountId = c.req.param("accountId");
  await requireAccount(db, accountId);
  await db.prepare("DELETE FROM optimize_accounts WHERE id = ?").bind(accountId).run();
  return c.json({ success: true });
});

// ── Impact Assessments ─────────────────────────────────────────────────────────

app.get("/accounts/:accountId/assessments", async (c) => {
  assertOptimizeAccess(c.get("auth").role);
  const accountId = c.req.param("accountId");
  const rows = await c.env.DB.prepare(`
    SELECT ia.*, u.name AS conducted_by_name
    FROM impact_assessments ia
    LEFT JOIN users u ON u.id = ia.conducted_by_user_id
    WHERE ia.optimize_account_id = ?
    ORDER BY ia.conducted_date DESC
  `).bind(accountId).all();

  const results = (rows.results ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    solution_types: tryParseJSON(r.solution_types as string, []),
    answers: tryParseJSON(r.answers as string, {}),
    section_scores: tryParseJSON(r.section_scores as string | null, null),
    solution_scores: tryParseJSON(r.solution_scores as string | null, null),
    recommended_actions: tryParseJSON(r.recommended_actions as string | null, null),
    insights: tryParseJSON(r.insights as string | null, null),
  }));

  return c.json(results);
});

const impactAssessmentSchema = z.object({
  conducted_date: zPlanDate,
  conducted_by_user_id: z.string().nullable().optional(),
  solution_types: z.array(z.string()).min(1),
  answers: z.record(z.string(), z.unknown()),
});

app.post("/accounts/:accountId/assessments", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const accountId = c.req.param("accountId");
  await requireAccount(db, accountId);

  const parsed = impactAssessmentSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const d = parsed.data;
  const result = scoreAssessment(d.answers, d.solution_types);

  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO impact_assessments
      (id, optimize_account_id, survey_id, conducted_date, conducted_by_user_id,
       solution_types, answers, section_scores, solution_scores,
       overall_score, confidence_score, health_band, recommended_actions, insights)
    VALUES (?, ?, 'client_impact_assessment_unified_v1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, accountId,
    d.conducted_date, d.conducted_by_user_id ?? null,
    JSON.stringify(d.solution_types),
    JSON.stringify(d.answers),
    JSON.stringify(result.sectionScores),
    JSON.stringify(result.solutionScores),
    result.overallScore,
    result.confidenceScore,
    result.healthBand,
    JSON.stringify(result.recommendedActions),
    JSON.stringify(result.insights),
  ).run();

  const row = await db.prepare(`
    SELECT ia.*, u.name AS conducted_by_name
    FROM impact_assessments ia
    LEFT JOIN users u ON u.id = ia.conducted_by_user_id
    WHERE ia.id = ? LIMIT 1
  `).bind(id).first() as Record<string, unknown> | null;

  if (!row) throw new HTTPException(500, { message: "Failed to retrieve created assessment" });

  return c.json({
    ...row,
    solution_types: tryParseJSON(row.solution_types as string, []),
    answers: tryParseJSON(row.answers as string, {}),
    section_scores: tryParseJSON(row.section_scores as string | null, null),
    solution_scores: tryParseJSON(row.solution_scores as string | null, null),
    recommended_actions: tryParseJSON(row.recommended_actions as string | null, null),
    insights: tryParseJSON(row.insights as string | null, null),
  }, 201);
});

app.delete("/accounts/:accountId/assessments/:assessmentId", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const { accountId, assessmentId } = c.req.param();
  const existing = await c.env.DB.prepare("SELECT id FROM impact_assessments WHERE id = ? AND optimize_account_id = ? LIMIT 1")
    .bind(assessmentId, accountId).first();
  if (!existing) throw new HTTPException(404, { message: "Assessment not found" });
  await c.env.DB.prepare("DELETE FROM impact_assessments WHERE id = ?").bind(assessmentId).run();
  return c.json({ success: true });
});

function tryParseJSON<T>(val: string | null | undefined, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}

// ── Tech Stack ─────────────────────────────────────────────────────────────────

app.get("/accounts/:accountId/tech-stack", async (c) => {
  assertOptimizeAccess(c.get("auth").role);
  const rows = await c.env.DB.prepare(
    "SELECT * FROM account_tech_stack WHERE optimize_account_id = ? ORDER BY tech_area ASC"
  ).bind(c.req.param("accountId")).all();
  return c.json(rows.results ?? []);
});

const techStackSchema = z.object({
  tech_area: z.enum(["ai", "uc", "security", "network", "datacenter", "backup_dr", "tem", "other"]),
  tech_area_label: z.string().nullable().optional(),
  current_vendor: z.string().nullable().optional(),
  current_solution: z.string().nullable().optional(),
  functional_fit: z.number().int().min(1).max(5).nullable().optional(),
  technical_fit: z.number().int().min(1).max(5).nullable().optional(),
  contract_expiration: z.string().nullable().optional(),
  // Deliberately NOT a date validator. This is a free-text horizon — the UI's
  // own placeholder is "e.g. Q1 27, 3/1/2027, 2027, TBD" — so "Q1 27" and "TBD"
  // are valid values. The date-hardening pass wrongly typed it as a date and
  // rejected them. Name ends in _start but it isn't a timestamp.
  initiative_start: z.string().max(120).nullable().optional(),
  time_rating: z.enum(["tolerate", "invest", "migrate", "eliminate"]).nullable().optional(),
  notes: z.string().nullable().optional(),
  last_reviewed: z.string().nullable().optional(),
});

app.post("/accounts/:accountId/tech-stack", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const accountId = c.req.param("accountId");
  const auth = c.get("auth");
  await requireAccount(db, accountId);

  const parsed = techStackSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const d = parsed.data;
  const id = crypto.randomUUID();
  // TIME letter is auto-derived from the two fit scores; an explicit time_rating
  // in the payload (a manual override) wins.
  const timeRating = d.time_rating ?? deriveTimeRating(d.functional_fit, d.technical_fit);
  await db.prepare(`
    INSERT INTO account_tech_stack
      (id, optimize_account_id, tech_area, tech_area_label, current_vendor, current_solution,
       functional_fit, technical_fit, contract_expiration, initiative_start,
       time_rating, notes, last_reviewed, reviewed_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, accountId, d.tech_area, d.tech_area_label ?? null, d.current_vendor ?? null,
    d.current_solution ?? null, d.functional_fit ?? null, d.technical_fit ?? null,
    d.contract_expiration ?? null, d.initiative_start ?? null, timeRating ?? null,
    d.notes ?? null, d.last_reviewed ?? null, auth.user.id).run();

  return c.json(await db.prepare("SELECT * FROM account_tech_stack WHERE id = ? LIMIT 1").bind(id).first(), 201);
});

app.patch("/accounts/:accountId/tech-stack/:areaId", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const { accountId, areaId } = c.req.param();
  const auth = c.get("auth");

  const existing = await db.prepare(
    "SELECT functional_fit, technical_fit FROM account_tech_stack WHERE id = ? AND optimize_account_id = ? LIMIT 1"
  ).bind(areaId, accountId).first<{ functional_fit: number | null; technical_fit: number | null }>();
  if (!existing) throw new HTTPException(404, { message: "Tech stack area not found" });

  const parsed = techStackSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const d = parsed.data;
  const fields: string[] = [], values: unknown[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (v !== undefined) { fields.push(`${k} = ?`); values.push(v); }
  }

  // When a fit score changes but the caller didn't explicitly set time_rating,
  // recompute the derived TIME letter from the merged (existing + patched) scores.
  if ((d.functional_fit !== undefined || d.technical_fit !== undefined) && d.time_rating === undefined) {
    const func = d.functional_fit !== undefined ? d.functional_fit : existing.functional_fit;
    const tech = d.technical_fit !== undefined ? d.technical_fit : existing.technical_fit;
    fields.push("time_rating = ?");
    values.push(deriveTimeRating(func, tech));
  }

  fields.push("reviewed_by_user_id = ?", "updated_at = CURRENT_TIMESTAMP");
  values.push(auth.user.id);

  await db.prepare(`UPDATE account_tech_stack SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values, areaId).run();

  return c.json(await db.prepare("SELECT * FROM account_tech_stack WHERE id = ? LIMIT 1").bind(areaId).first());
});

app.delete("/accounts/:accountId/tech-stack/:areaId", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const { accountId, areaId } = c.req.param();
  const existing = await db.prepare("SELECT id FROM account_tech_stack WHERE id = ? AND optimize_account_id = ? LIMIT 1")
    .bind(areaId, accountId).first();
  if (!existing) throw new HTTPException(404, { message: "Tech stack area not found" });
  await db.prepare("DELETE FROM account_tech_stack WHERE id = ?").bind(areaId).run();
  return c.json({ success: true });
});

// ── Roadmap ────────────────────────────────────────────────────────────────────

app.get("/accounts/:accountId/roadmap", async (c) => {
  assertOptimizeAccess(c.get("auth").role);
  const rows = await c.env.DB.prepare(`
    SELECT r.*, u.name AS created_by_name,
           ts.tech_area, ts.tech_area_label
    FROM roadmap_items r
    LEFT JOIN users u ON u.id = r.created_by
    LEFT JOIN account_tech_stack ts ON ts.id = r.tech_stack_id
    WHERE r.optimize_account_id = ?
    ORDER BY
      CASE r.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      r.created_at DESC
  `).bind(c.req.param("accountId")).all();
  return c.json(rows.results ?? []);
});

const roadmapSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().nullable().optional(),
  tech_stack_id: z.string().nullable().optional(),
  category: z.enum(["enhancement", "new_project", "optimization", "replacement"]).default("enhancement"),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  time_rating: z.enum(["tolerate", "invest", "migrate", "eliminate"]).nullable().optional(),
  status: z.enum(["identified", "evaluating", "approved", "in_progress", "completed", "deferred"]).default("identified"),
  target_date: zPlanDateOrBlank.nullable().optional(),
});

app.post("/accounts/:accountId/roadmap", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const accountId = c.req.param("accountId");
  const auth = c.get("auth");
  await requireAccount(db, accountId);

  const parsed = roadmapSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const d = parsed.data;
  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO roadmap_items
      (id, optimize_account_id, tech_stack_id, title, description, category, priority,
       time_rating, status, target_date, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, accountId, d.tech_stack_id ?? null, d.title, d.description ?? null,
    d.category, d.priority, d.time_rating ?? null, d.status, d.target_date ?? null, auth.user.id).run();

  return c.json(await db.prepare(`
    SELECT r.*, u.name AS created_by_name FROM roadmap_items r
    LEFT JOIN users u ON u.id = r.created_by WHERE r.id = ? LIMIT 1
  `).bind(id).first(), 201);
});

app.patch("/accounts/:accountId/roadmap/:itemId", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const { accountId, itemId } = c.req.param();

  const existing = await db.prepare("SELECT id FROM roadmap_items WHERE id = ? AND optimize_account_id = ? LIMIT 1")
    .bind(itemId, accountId).first();
  if (!existing) throw new HTTPException(404, { message: "Roadmap item not found" });

  const parsed = roadmapSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });

  const fields: string[] = [], values: unknown[] = [];
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) { fields.push(`${k} = ?`); values.push(v); }
  }
  if (!fields.length) throw new HTTPException(400, { message: "No fields to update" });
  fields.push("updated_at = CURRENT_TIMESTAMP");

  await db.prepare(`UPDATE roadmap_items SET ${fields.join(", ")} WHERE id = ?`)
    .bind(...values, itemId).run();

  return c.json(await db.prepare(`
    SELECT r.*, u.name AS created_by_name FROM roadmap_items r
    LEFT JOIN users u ON u.id = r.created_by WHERE r.id = ? LIMIT 1
  `).bind(itemId).first());
});

app.delete("/accounts/:accountId/roadmap/:itemId", async (c) => {
  assertOptimizeEdit(c.get("auth").role);
  const db = c.env.DB;
  const { accountId, itemId } = c.req.param();
  const existing = await db.prepare("SELECT id FROM roadmap_items WHERE id = ? AND optimize_account_id = ? LIMIT 1")
    .bind(itemId, accountId).first();
  if (!existing) throw new HTTPException(404, { message: "Roadmap item not found" });
  await db.prepare("DELETE FROM roadmap_items WHERE id = ?").bind(itemId).run();
  return c.json({ success: true });
});

// ── Utilization snapshots ──────────────────────────────────────────────────────

app.get("/accounts/:accountId/utilization", async (c) => {
  assertOptimizeAccess(c.get("auth").role);
  const rows = await c.env.DB.prepare(
    "SELECT * FROM utilization_snapshots WHERE optimize_account_id = ? ORDER BY snapshot_date DESC"
  ).bind(c.req.param("accountId")).all();
  return c.json(rows.results ?? []);
});

app.post("/accounts/:accountId/utilization/sync", async (c) => {
  assertOptimizeAccess(c.get("auth").role);
  const accountId = c.req.param("accountId");
  const db = c.env.DB;

  // Dispatch by the account's vendor so RC accounts pull from RingCentral
  // and Zoom accounts pull from Zoom. Both write into utilization_snapshots
  // with the appropriate platform value; the table already supports both
  // via the platform column + total_call_minutes (RC-specific) field.
  const account = await requireAccount(db, accountId);
  const vendor = (account.vendor ?? "").toLowerCase();
  const platform: "zoom" | "ringcentral" = vendor === "ringcentral" ? "ringcentral" : "zoom";

  let licenses_purchased: number | null;
  let licenses_assigned:  number | null;
  let active_users_30d:   number | null;
  let active_users_90d:   number | null;
  let total_meetings:     number | null;
  let total_call_minutes: number | null;
  let raw_data:           Record<string, unknown>;

  try {
    if (platform === "ringcentral") {
      const d = await fetchRCUtilizationSnapshot(c.env.KV, account.creds_key);
      licenses_purchased = d.licenses_purchased;
      licenses_assigned  = d.licenses_assigned;
      active_users_30d   = d.active_users_30d;
      active_users_90d   = d.active_users_90d;
      total_meetings     = d.total_meetings;
      total_call_minutes = d.total_call_minutes;
      raw_data           = d.raw_data;
    } else {
      const d = await fetchZoomUtilizationSnapshot(c.env.KV, account.creds_key);
      licenses_purchased = d.licenses_purchased;
      licenses_assigned  = d.licenses_assigned;
      active_users_30d   = d.active_users_30d;
      active_users_90d   = d.active_users_90d;
      total_meetings     = d.total_meetings;
      total_call_minutes = null;
      raw_data           = d.raw_data;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : `${platform} sync failed`;
    throw new HTTPException(400, { message });
  }

  const id = crypto.randomUUID();
  const snapshot_date = new Date().toISOString().slice(0, 10);

  await db.prepare(`
    INSERT INTO utilization_snapshots
      (id, optimize_account_id, platform, snapshot_date, licenses_purchased, licenses_assigned,
       active_users_30d, active_users_90d, total_meetings, total_call_minutes, raw_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, accountId, platform, snapshot_date,
    licenses_purchased, licenses_assigned,
    active_users_30d, active_users_90d,
    total_meetings, total_call_minutes,
    JSON.stringify(raw_data)
  ).run();

  const created = await db.prepare("SELECT * FROM utilization_snapshots WHERE id = ? LIMIT 1").bind(id).first();
  return c.json(created, 201);
});

export default app;
