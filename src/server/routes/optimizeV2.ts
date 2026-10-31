import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import type { Platform } from "../services/optimizeV2/engine/types";
import { runZoomAssessment } from "../services/optimizeV2/providers/zoom/assess";
import { getToken, ZoomError } from "../services/optimizeV2/providers/zoom/client";
import {
  getConnection, getRunResult, readCredentials, recordRunError, saveRun, toView, upsertConnection,
  type ConnectionRow, type RunRow,
} from "../services/optimizeV2/store";

// Optimizations V2 (see docs/optimize-v2/DESIGN.md). Hangs off the V1
// optimize_accounts row, so these use the same role rules as V1 Optimize.
// Consolidate with routes/optimize.ts when V1 retires.

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function assertAccess(role: string) {
  if (!["admin", "pm", "pf_ae", "pf_sa", "pf_csm", "pf_engineer", "executive"].includes(role)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
}
function assertEdit(role: string) {
  if (!["admin", "pf_sa", "pf_csm", "pm"].includes(role)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
}

app.use("*", async (c, next) => {
  assertAccess(c.get("auth").role);
  await next();
});

const platformParam = z.enum(["zoom", "ringcentral"]);

// Optimize accounts with their V2 connections and latest run per platform.
app.get("/accounts", async (c) => {
  const accounts = await c.env.DB.prepare(
    `SELECT oa.id, oa.customer_id, oa.optimize_status, oa.vendor, cu.name AS customer_name
       FROM optimize_accounts oa JOIN customers cu ON cu.id = oa.customer_id
      ORDER BY cu.name COLLATE NOCASE`,
  ).all<{ id: string; customer_id: string; optimize_status: string; vendor: string | null; customer_name: string }>();

  const conns = await c.env.DB.prepare(
    `SELECT oc.id, oc.optimize_account_id, oc.platform, oc.last_run_at, oc.last_error, oc.schedule_enabled,
            (oc.creds_enc IS NOT NULL) AS has_credentials,
            r.overall, r.overall_grade, r.created_at AS latest_run_at
       FROM opt2_connections oc
       LEFT JOIN opt2_runs r ON r.id = (
         SELECT id FROM opt2_runs WHERE connection_id = oc.id ORDER BY created_at DESC LIMIT 1)`,
  ).all<{ optimize_account_id: string } & Record<string, unknown>>();

  const byAccount = new Map<string, unknown[]>();
  for (const row of conns.results ?? []) {
    const list = byAccount.get(row.optimize_account_id) ?? [];
    list.push(row);
    byAccount.set(row.optimize_account_id, list);
  }
  return c.json((accounts.results ?? []).map((a) => ({ ...a, connections: byAccount.get(a.id) ?? [] })));
});

app.get("/accounts/:accountId", async (c) => {
  const accountId = c.req.param("accountId");
  const account = await c.env.DB.prepare(
    `SELECT oa.id, oa.customer_id, oa.optimize_status, oa.vendor, cu.name AS customer_name, cu.crm_account_id
       FROM optimize_accounts oa JOIN customers cu ON cu.id = oa.customer_id WHERE oa.id = ?`,
  ).bind(accountId).first();
  if (!account) return c.json({ error: "Account not found" }, 404);

  const conns = await c.env.DB.prepare("SELECT * FROM opt2_connections WHERE optimize_account_id = ? ORDER BY platform")
    .bind(accountId).all<ConnectionRow>();
  const runs = await c.env.DB.prepare(
    `SELECT id, connection_id, platform, from_date, to_date, source, overall, overall_grade, config_alignment, indices,
            kpis_populated, kpis_total, red_findings, amber_findings, potential_gain, created_at
       FROM opt2_runs WHERE optimize_account_id = ? ORDER BY created_at DESC LIMIT 50`,
  ).bind(accountId).all<RunRow>();

  return c.json({
    account,
    connections: (conns.results ?? []).map(toView),
    runs: (runs.results ?? []).map((r) => ({ ...r, indices: JSON.parse(r.indices || "[]") })),
  });
});

const zoomCredsSchema = z.object({
  accountId: z.string().trim().min(5).max(64),
  clientId: z.string().trim().min(5).max(128),
  clientSecret: z.string().trim().min(5).max(256),
});

const connectionSchema = z.object({
  credentials: zoomCredsSchema.optional(),
  window_days: z.number().int().min(7).max(90).optional(),
  timezone: z.string().max(64).optional(),
  assumptions: z.object({
    agentLoadedRatePerHr: z.number().min(0).max(1000).optional(),
    automationCostYr: z.number().min(0).max(100_000_000).optional(),
    crm: z.string().max(60).optional(),
  }).optional(),
  inputs: z.record(z.string(), z.unknown()).optional(),
});

/** Create or update the account's connection for a platform. New credentials
 *  are verified against the platform before they're stored. */
app.put("/accounts/:accountId/connections/:platform", async (c) => {
  const auth = c.get("auth");
  assertEdit(auth.role);
  const accountId = c.req.param("accountId");
  const platform = platformParam.safeParse(c.req.param("platform"));
  if (!platform.success) return c.json({ error: "Unknown platform" }, 400);
  if (platform.data === "ringcentral") return c.json({ error: "RingCentral connections arrive in the next phase" }, 400);
  if (!c.env.OPTIMIZE_ENC_KEY) return c.json({ error: "Optimizations isn't configured (OPTIMIZE_ENC_KEY missing)" }, 503);

  const exists = await c.env.DB.prepare("SELECT 1 FROM optimize_accounts WHERE id = ?").bind(accountId).first();
  if (!exists) return c.json({ error: "Account not found" }, 404);

  const parsed = connectionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid connection settings", details: parsed.error.flatten() }, 400);
  const { credentials, ...settings } = parsed.data;

  let scopes: string[] | undefined;
  if (credentials) {
    try {
      scopes = (await getToken(credentials)).scopes;
    } catch (err) {
      const msg = err instanceof ZoomError ? err.message : "Couldn't reach Zoom";
      return c.json({ error: `Zoom rejected these credentials: ${msg}` }, 400);
    }
  }

  const row = await upsertConnection(c.env, accountId, platform.data as Platform, auth.user.id, settings, credentials);
  return c.json({ connection: toView(row), grantedScopes: scopes });
});

app.delete("/connections/:id", async (c) => {
  assertEdit(c.get("auth").role);
  await c.env.DB.prepare("DELETE FROM opt2_connections WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

/** Run an assessment now. Takes ~10–40s: it sweeps the tenant's APIs within
 *  the per-run request budget. */
app.post("/connections/:id/runs", async (c) => {
  const auth = c.get("auth");
  assertEdit(auth.role);
  const conn = await getConnection(c.env, c.req.param("id"));
  if (!conn) return c.json({ error: "Connection not found" }, 404);
  if (!conn.creds_enc) return c.json({ error: "Add credentials before running an assessment" }, 400);
  if (conn.platform !== "zoom") return c.json({ error: "RingCentral assessments arrive in the next phase" }, 400);

  try {
    const creds = await readCredentials<"zoom">(c.env, conn);
    const view = toView(conn);
    const result = await runZoomAssessment({
      ...creds,
      windowDays: conn.window_days,
      assumptions: view.assumptions,
      inputs: view.inputs,
    });
    const runId = await saveRun(c.env, conn, result, "manual", auth.user.id);
    return c.json({ runId, overall: result.scorecard.overall, grade: result.scorecard.overallGrade });
  } catch (err) {
    const msg = err instanceof ZoomError ? `Zoom: ${err.message}` : err instanceof Error ? err.message : String(err);
    console.error("[optimize-v2] run failed", conn.id, err);
    await recordRunError(c.env, conn.id, msg);
    return c.json({ error: `Assessment failed — ${msg}` }, 502);
  }
});

/** One run: headline row plus the full result (scorecard, findings, product reports). */
app.get("/runs/:runId", async (c) => {
  const run = await c.env.DB.prepare("SELECT * FROM opt2_runs WHERE id = ?").bind(c.req.param("runId")).first<RunRow>();
  if (!run) return c.json({ error: "Run not found" }, 404);
  const result = await getRunResult(c.env, run);
  // Raw API payloads stay server-side; the UI renders from the scorecard and reports.
  const slim = result ? { ...result, raw: undefined } : null;
  return c.json({ run: { ...run, indices: JSON.parse(run.indices || "[]") }, result: slim });
});

export default app;
