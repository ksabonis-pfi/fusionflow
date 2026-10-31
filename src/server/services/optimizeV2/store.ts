// D1 + R2 persistence for Optimizations V2: connections (with encrypted
// credentials), runs, and per-KPI rows for trends.
import type { Bindings } from "../../types";
import { decryptJson, encryptJson } from "./crypto";
import type { Assumptions, ManualInputs, Platform } from "./engine/types";
import type { ZoomAssessmentResult } from "./providers/zoom/assess";
import type { ZoomCredentials } from "./providers/zoom/client";

export type ConnectionRow = {
  id: string;
  optimize_account_id: string;
  platform: Platform;
  creds_enc: string | null;
  creds_hint: string;
  window_days: number;
  timezone: string;
  assumptions: string;
  inputs: string;
  schedule_enabled: number;
  schedule_day: number;
  last_run_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

/** What the client sees: never the encrypted blob. */
export type ConnectionView = Omit<ConnectionRow, "creds_enc" | "creds_hint" | "assumptions" | "inputs"> & {
  has_credentials: boolean;
  creds_hint: Record<string, string>;
  assumptions: Assumptions;
  inputs: ManualInputs;
};

export type CredentialsFor = { zoom: ZoomCredentials };

const parse = <T>(s: string | null | undefined, fallback: T): T => {
  try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
};

export function toView(row: ConnectionRow): ConnectionView {
  const { creds_enc, creds_hint, assumptions, inputs, ...rest } = row;
  return {
    ...rest,
    has_credentials: !!creds_enc,
    creds_hint: parse(creds_hint, {}),
    assumptions: parse(assumptions, {}),
    inputs: parse(inputs, {}),
  };
}

/** Non-secret identifiers shown in the UI so staff can tell which tenant a connection points at. */
export function credentialHint(platform: Platform, creds: ZoomCredentials): Record<string, string> {
  if (platform === "zoom") {
    return { account_id: creds.accountId, client_id: creds.clientId };
  }
  return {};
}

export function encKey(env: Bindings): string {
  if (!env.OPTIMIZE_ENC_KEY) throw new Error("OPTIMIZE_ENC_KEY is not set");
  return env.OPTIMIZE_ENC_KEY;
}

export async function getConnection(env: Bindings, id: string): Promise<ConnectionRow | null> {
  return env.DB.prepare("SELECT * FROM opt2_connections WHERE id = ?").bind(id).first<ConnectionRow>();
}

export async function getConnectionFor(env: Bindings, accountId: string, platform: Platform): Promise<ConnectionRow | null> {
  return env.DB.prepare("SELECT * FROM opt2_connections WHERE optimize_account_id = ? AND platform = ?")
    .bind(accountId, platform).first<ConnectionRow>();
}

export async function readCredentials<P extends keyof CredentialsFor>(env: Bindings, row: ConnectionRow): Promise<CredentialsFor[P]> {
  if (!row.creds_enc) throw new Error("This connection has no credentials yet");
  return decryptJson<CredentialsFor[P]>(encKey(env), row.creds_enc);
}

export type ConnectionSettings = {
  window_days?: number;
  timezone?: string;
  assumptions?: Assumptions;
  inputs?: ManualInputs;
};

/** Create or update a connection. Credentials are replaced only when provided. */
export async function upsertConnection(
  env: Bindings,
  accountId: string,
  platform: Platform,
  userId: string,
  settings: ConnectionSettings,
  creds?: ZoomCredentials,
): Promise<ConnectionRow> {
  const existing = await getConnectionFor(env, accountId, platform);
  const credsEnc = creds ? await encryptJson(encKey(env), creds) : existing?.creds_enc ?? null;
  const hint = creds ? JSON.stringify(credentialHint(platform, creds)) : existing?.creds_hint ?? "{}";
  const windowDays = settings.window_days ?? existing?.window_days ?? 30;
  const timezone = settings.timezone ?? existing?.timezone ?? "America/Los_Angeles";
  const assumptions = settings.assumptions ? JSON.stringify(settings.assumptions) : existing?.assumptions ?? "{}";
  const inputs = settings.inputs ? JSON.stringify(settings.inputs) : existing?.inputs ?? "{}";

  if (existing) {
    await env.DB.prepare(
      `UPDATE opt2_connections SET creds_enc = ?, creds_hint = ?, window_days = ?, timezone = ?, assumptions = ?, inputs = ?,
         updated_at = datetime('now') WHERE id = ?`,
    ).bind(credsEnc, hint, windowDays, timezone, assumptions, inputs, existing.id).run();
    return (await getConnection(env, existing.id))!;
  }
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO opt2_connections (id, optimize_account_id, platform, creds_enc, creds_hint, window_days, timezone, assumptions, inputs, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, accountId, platform, credsEnc, hint, windowDays, timezone, assumptions, inputs, userId).run();
  return (await getConnection(env, id))!;
}

export type RunRow = {
  id: string;
  connection_id: string;
  optimize_account_id: string;
  platform: Platform;
  from_date: string;
  to_date: string;
  source: "manual" | "scheduled" | "imported";
  overall: number | null;
  overall_grade: string | null;
  config_alignment: number | null;
  indices: string;
  kpis_populated: number | null;
  kpis_total: number | null;
  api_populated: number | null;
  red_findings: number | null;
  amber_findings: number | null;
  potential_gain: number | null;
  subrequests_used: number | null;
  result_key: string | null;
  created_by: string | null;
  created_at: string;
};

const resultKey = (accountId: string, runId: string) => `optimize-v2/${accountId}/${runId}/result.json`;

/** Persist a finished assessment: full result to R2, headline + per-KPI rows to D1. */
export async function saveRun(
  env: Bindings,
  conn: ConnectionRow,
  result: ZoomAssessmentResult,
  source: RunRow["source"],
  userId: string | null,
): Promise<string> {
  const runId = crypto.randomUUID();
  const key = resultKey(conn.optimize_account_id, runId);
  await env.R2.put(key, JSON.stringify(result), { httpMetadata: { contentType: "application/json" } });

  const sc = result.scorecard;
  const stmts = [
    env.DB.prepare(
      `INSERT INTO opt2_runs (id, connection_id, optimize_account_id, platform, from_date, to_date, source, overall, overall_grade,
         config_alignment, indices, kpis_populated, kpis_total, api_populated, red_findings, amber_findings, potential_gain,
         subrequests_used, result_key, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      runId, conn.id, conn.optimize_account_id, conn.platform, result.meta.window.from, result.meta.window.to, source,
      sc.overall, sc.overallGrade, sc.configAlignment, JSON.stringify(sc.indices.map(({ key, label, value, target, status }) => ({ key, label, value, target, status }))),
      sc.coverage.populated, sc.coverage.total, sc.coverage.apiPopulated, result.findings.summary.red, result.findings.summary.amber,
      sc.potentialGain, result.meta.subrequestsUsed, key, userId,
    ),
    ...sc.layers.flatMap((l) => l.kpis.map((k) =>
      env.DB.prepare(
        `INSERT INTO opt2_run_kpis (run_id, connection_id, key, label, layer, value, target, unit, dir, status, attainment, mode, available)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(runId, conn.id, k.key, k.label, k.layer, k.value, k.target, k.unit, k.dir, k.status, k.attainment, k.mode, k.available ? 1 : 0),
    )),
    env.DB.prepare("UPDATE opt2_connections SET last_run_at = datetime('now'), last_error = NULL WHERE id = ?").bind(conn.id),
  ];
  await env.DB.batch(stmts);
  return runId;
}

export async function recordRunError(env: Bindings, connectionId: string, message: string) {
  await env.DB.prepare("UPDATE opt2_connections SET last_error = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(message.slice(0, 500), connectionId).run();
}

export async function getRunResult(env: Bindings, run: RunRow): Promise<ZoomAssessmentResult | null> {
  if (!run.result_key) return null;
  const obj = await env.R2.get(run.result_key);
  return obj ? (await obj.json()) as ZoomAssessmentResult : null;
}
