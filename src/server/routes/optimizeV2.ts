import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import type { Platform } from "../services/optimizeV2/engine/types";
import { jwtExpiry, type RingCentralCredentials } from "../services/optimizeV2/providers/ringcentral/assess";
import { RcClient } from "../services/optimizeV2/providers/ringcentral/rc";
import { getToken, ZoomError, type ZoomCredentials } from "../services/optimizeV2/providers/zoom/client";
import { RunInputError, runConnection } from "../services/optimizeV2/run";
import { isDue } from "../services/optimizeV2/schedule";
import { inPlaceholders } from "../lib/teamUtils";
import {
  getConnection, getRunResult, recordRunError, saveRun, toView, upsertConnection,
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
const EDIT_ROLES = ["admin", "pf_sa", "pf_csm", "pm"];
function assertEdit(role: string) {
  if (!EDIT_ROLES.includes(role)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }
}

// Preview until cutover: the API only exists where OPTIMIZE_V2_ENABLED is set
// (staging and local dev). Hiding the nav link alone left it callable on prod.
app.use("*", async (c, next) => {
  if (c.env.OPTIMIZE_V2_ENABLED !== "true") return c.json({ error: "Not found" }, 404);
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
    can_edit: EDIT_ROLES.includes(c.get("auth").role),
    connections: (conns.results ?? []).map(toView),
    runs: (runs.results ?? []).map((r) => ({ ...r, indices: JSON.parse(r.indices || "[]") })),
  });
});

const zoomCredsSchema = z.object({
  accountId: z.string().trim().min(5).max(64),
  clientId: z.string().trim().min(5).max(128),
  clientSecret: z.string().trim().min(5).max(256),
});

const rcCredsSchema = z.object({
  clientId: z.string().trim().min(5).max(128),
  clientSecret: z.string().trim().min(5).max(256),
  jwt: z.string().trim().min(20).max(4096),
  rcEnv: z.enum(["production", "sandbox"]).optional(),
});

const connectionSchema = z.object({
  /** Validated per platform below. */
  credentials: z.unknown().optional(),
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
  if (!c.env.OPTIMIZE_ENC_KEY) return c.json({ error: "Optimizations isn't configured (OPTIMIZE_ENC_KEY missing)" }, 503);

  const exists = await c.env.DB.prepare("SELECT 1 FROM optimize_accounts WHERE id = ?").bind(accountId).first();
  if (!exists) return c.json({ error: "Account not found" }, 404);

  const parsed = connectionSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid connection settings", details: parsed.error.flatten() }, 400);
  const { credentials: rawCreds, ...settings } = parsed.data;

  let credentials: ZoomCredentials | RingCentralCredentials | undefined;
  let scopes: string[] | undefined;
  if (rawCreds != null) {
    const verified = await verifyCredentials(platform.data, rawCreds);
    if ("error" in verified) return c.json({ error: verified.error }, 400);
    ({ credentials, scopes } = verified);
  }

  const row = await upsertConnection(c.env, accountId, platform.data as Platform, auth.user.id, settings, credentials);
  return c.json({ connection: toView(row), grantedScopes: scopes });
});

/** Validate a platform's credential shape and prove it against the platform
 *  (token exchange only — no data is read) before anything is stored. */
async function verifyCredentials(platform: Platform, raw: unknown):
  Promise<{ credentials: ZoomCredentials | RingCentralCredentials; scopes: string[] } | { error: string }> {
  if (platform === "zoom") {
    const p = zoomCredsSchema.safeParse(raw);
    if (!p.success) return { error: "Enter the Zoom account ID, client ID and client secret" };
    try {
      return { credentials: p.data, scopes: (await getToken(p.data)).scopes };
    } catch (err) {
      return { error: `Zoom rejected these credentials: ${err instanceof ZoomError ? err.message : "couldn't reach Zoom"}` };
    }
  }
  const p = rcCredsSchema.safeParse(raw);
  if (!p.success) return { error: "Enter the RingCentral client ID, client secret and JWT" };
  const exp = jwtExpiry(p.data.jwt);
  if (exp && new Date(exp).getTime() < Date.now()) return { error: `This JWT expired on ${exp.slice(0, 10)}. Issue a new one in the RingCentral developer console.` };
  try {
    // A budget of 2 allows the token exchange (with one retry) and nothing else.
    const rc = new RcClient({ ...p.data, rcEnv: p.data.rcEnv || "production", accountId: "~", budget: 2 });
    await rc.getToken();
    return { credentials: { ...p.data, rcAccountId: "~" }, scopes: rc.scope ? rc.scope.split(/[\s,]+/).filter(Boolean) : [] };
  } catch (err) {
    const detail = String(err instanceof Error ? err.message : err).split("\n")[0];
    return { error: `RingCentral rejected these credentials: ${detail}` };
  }
}

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

  try {
    const result = await runConnection(c.env, conn);
    const runId = await saveRun(c.env, conn, result, "manual", auth.user.id);
    return c.json({ runId, overall: result.scorecard.overall, grade: result.scorecard.overallGrade });
  } catch (err) {
    const msg = err instanceof ZoomError ? `Zoom: ${err.message}` : err instanceof Error ? err.message : String(err);
    console.error("[optimize-v2] run failed", conn.id, err);
    await recordRunError(c.env, conn.id, msg);
    return c.json({ error: `Assessment failed — ${msg}` }, err instanceof RunInputError ? 400 : 502);
  }
});

const scheduleSchema = z.object({
  enabled: z.boolean(),
  /** Day of the month; past a short month's end it runs on the last day. */
  day: z.number().int().min(1).max(31),
  timezone: z.string().max(64).refine((tz) => {
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
  }, "Unknown timezone").optional(),
});

/** Turn the monthly scheduled run on or off and pick its day (judged in the
 *  connection's timezone). Run by the hourly cron; see services/optimizeV2/schedule.ts. */
app.put("/connections/:id/schedule", async (c) => {
  assertEdit(c.get("auth").role);
  const conn = await getConnection(c.env, c.req.param("id"));
  if (!conn) return c.json({ error: "Connection not found" }, 404);
  const parsed = scheduleSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Invalid schedule", details: parsed.error.flatten() }, 400);
  const { enabled, day, timezone } = parsed.data;
  await c.env.DB.prepare(
    "UPDATE opt2_connections SET schedule_enabled = ?, schedule_day = ?, timezone = ?, updated_at = datetime('now') WHERE id = ?",
  ).bind(enabled ? 1 : 0, day, timezone ?? conn.timezone, conn.id).run();
  const row = (await getConnection(c.env, conn.id))!;
  const view = toView(row);
  // Tell the UI when it'll first run: a past day this month with no run since means "within the hour".
  const due = enabled ? isDue({ ...view, schedule_attempted_at: row.schedule_attempted_at ?? null }, new Date()) : null;
  return c.json({ connection: view, due });
});

type TrendRun = Pick<RunRow, "id" | "source" | "created_at" | "from_date" | "to_date" | "overall" | "overall_grade" | "config_alignment" | "red_findings" | "amber_findings" | "layer_scores">;
type LayerPoint = { layer: number; label: string; score: number | null };
type KpiRow = { run_id: string; key: string; label: string; unit: string | null; target: number | null; value: number | null; attainment: number | null; status: string | null };

/**
 * Score history for one connection, oldest first: overall, per-layer scores and
 * a few KPI series. Layer scores come from the run row (saved since migration
 * 0162); older runs fall back to the mean attainment of their scored KPIs in
 * opt2_run_kpis, which matches Zoom exactly and RingCentral except for its
 * sample-volume-flagged KPIs (not stored per KPI). No R2 reads.
 *
 * ?kpis=key1,key2 picks the KPI series (max 8); by default, the latest run's
 * five lowest-attainment scored KPIs.
 */
app.get("/connections/:id/trend", async (c) => {
  const conn = await getConnection(c.env, c.req.param("id"));
  if (!conn) return c.json({ error: "Connection not found" }, 404);
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 24, 2), 60);

  const runRows = await c.env.DB.prepare(
    `SELECT id, source, created_at, from_date, to_date, overall, overall_grade, config_alignment, red_findings, amber_findings, layer_scores
       FROM opt2_runs WHERE connection_id = ? ORDER BY created_at DESC LIMIT ?`,
  ).bind(conn.id, limit).all<TrendRun>();
  const runs = (runRows.results ?? []).reverse();
  const runIds = runs.map((r) => r.id);
  const latest = runs[runs.length - 1];

  // Layer scores, stored or derived.
  const stored = new Map<string, LayerPoint[]>();
  for (const r of runs) {
    if (!r.layer_scores) continue;
    try { stored.set(r.id, JSON.parse(r.layer_scores) as LayerPoint[]); } catch { /* derived below */ }
  }
  const missing = runIds.filter((id) => !stored.has(id));
  const derived = new Map<string, LayerPoint[]>();
  if (missing.length) {
    const rows = await c.env.DB.prepare(
      `SELECT run_id, layer, ROUND(AVG(attainment)) AS score FROM opt2_run_kpis
        WHERE run_id IN (${inPlaceholders(missing)}) AND attainment IS NOT NULL AND (mode IS NULL OR mode != 'blocked')
        GROUP BY run_id, layer`,
    ).bind(...missing).all<{ run_id: string; layer: number; score: number }>();
    for (const row of rows.results ?? []) {
      const list = derived.get(row.run_id) ?? [];
      list.push({ layer: row.layer, label: "", score: row.score });
      derived.set(row.run_id, list);
    }
  }
  const layerLabel = new Map<number, string>();
  for (const list of stored.values()) for (const l of list) if (l.label) layerLabel.set(l.layer, l.label);

  // KPI options (from the latest run) and the requested series.
  const options = latest
    ? (await c.env.DB.prepare(
      `SELECT key, label, layer, unit, attainment FROM opt2_run_kpis
        WHERE run_id = ? AND (dir IS NULL OR dir != 'neutral') ORDER BY layer, label`,
    ).bind(latest.id).all<{ key: string; label: string; layer: number; unit: string | null; attainment: number | null }>()).results ?? []
    : [];
  const requested = (c.req.query("kpis") ?? "").split(",").map((k) => k.trim()).filter(Boolean).slice(0, 8);
  const kpiKeys = requested.length
    ? requested
    : options.filter((o) => o.attainment != null && o.attainment < 100)
      .sort((a, b) => (a.attainment ?? 0) - (b.attainment ?? 0)).slice(0, 5).map((o) => o.key);
  const kpiRows = kpiKeys.length && runIds.length
    ? (await c.env.DB.prepare(
      `SELECT run_id, key, label, unit, target, value, attainment, status FROM opt2_run_kpis
        WHERE run_id IN (${inPlaceholders(runIds)}) AND key IN (${inPlaceholders(kpiKeys)})`,
    ).bind(...runIds, ...kpiKeys).all<KpiRow>()).results ?? []
    : [];

  return c.json({
    connection: { id: conn.id, platform: conn.platform, schedule_enabled: conn.schedule_enabled, schedule_day: conn.schedule_day, timezone: conn.timezone },
    runs: runs.map((r) => ({
      id: r.id, source: r.source, created_at: r.created_at, from_date: r.from_date, to_date: r.to_date,
      overall: r.overall, overall_grade: r.overall_grade, config_alignment: r.config_alignment,
      red_findings: r.red_findings, amber_findings: r.amber_findings,
      layers_derived: !stored.has(r.id),
      layers: (stored.get(r.id) ?? derived.get(r.id) ?? [])
        .map((l) => ({ layer: l.layer, label: l.label || layerLabel.get(l.layer) || `Layer ${l.layer}`, score: l.score }))
        .sort((a, b) => a.layer - b.layer),
    })),
    kpi_options: options.map(({ key, label, layer, unit }) => ({ key, label, layer, unit })),
    kpis: kpiKeys.map((key) => {
      const rows = kpiRows.filter((k) => k.key === key);
      const meta = rows[rows.length - 1] ?? options.find((o) => o.key === key);
      return {
        key,
        label: meta?.label ?? key,
        unit: meta?.unit ?? null,
        points: runIds.map((runId) => {
          const k = rows.find((x) => x.run_id === runId);
          return { run_id: runId, value: k?.value ?? null, target: k?.target ?? null, attainment: k?.attainment ?? null, status: k?.status ?? null };
        }),
      };
    }),
  });
});

/** One run: headline row plus the full result (scorecard, findings, product reports). */
app.get("/runs/:runId", async (c) => {
  const run = await c.env.DB.prepare("SELECT * FROM opt2_runs WHERE id = ?").bind(c.req.param("runId")).first<RunRow>();
  if (!run) return c.json({ error: "Run not found" }, 404);
  const result = await getRunResult(c.env, run);
  // Raw API payloads and the engine-native result stay server-side; the UI
  // renders from the shared scorecard, findings and warnings.
  const slim = result ? { ...result, raw: undefined, native: undefined } : null;
  return c.json({ run: { ...run, indices: JSON.parse(run.indices || "[]") }, result: slim });
});

export default app;
