// Client for Optimizations V2 (/api/optimize-v2). Types mirror
// src/server/services/optimizeV2/engine/types.ts and store.ts.
import { request } from "./api";

export type Platform = "zoom" | "ringcentral";
export type Grade = "A" | "B" | "C" | "D" | "F" | "N/A";

export type ConnectionSummary = {
  id: string;
  platform: Platform;
  has_credentials: number | boolean;
  last_run_at: string | null;
  last_error: string | null;
  schedule_enabled: number;
  overall: number | null;
  overall_grade: Grade | null;
  latest_run_at: string | null;
};

export type OptimizeV2Account = {
  id: string;
  customer_id: string;
  customer_name: string;
  optimize_status: string;
  vendor: string | null;
  connections: ConnectionSummary[];
};

export type Connection = {
  id: string;
  optimize_account_id: string;
  platform: Platform;
  has_credentials: boolean;
  creds_hint: Record<string, string>;
  window_days: number;
  timezone: string;
  assumptions: { agentLoadedRatePerHr?: number; automationCostYr?: number; crm?: string };
  inputs: Record<string, unknown>;
  schedule_enabled: number;
  schedule_day: number;
  last_run_at: string | null;
  last_error: string | null;
};

export type IndexScore = { key: string; label: string; value: number | null; target: number; note?: string; status: string };

export type RunSummary = {
  id: string;
  connection_id: string;
  platform: Platform;
  from_date: string;
  to_date: string;
  source: "manual" | "scheduled" | "imported";
  overall: number | null;
  overall_grade: Grade | null;
  config_alignment: number | null;
  indices: IndexScore[];
  kpis_populated: number | null;
  kpis_total: number | null;
  red_findings: number | null;
  amber_findings: number | null;
  potential_gain: number | null;
  created_at: string;
};

export type ScoredKpi = {
  layer: number; key: string; label: string; product: string; unit: string; dir: "higher" | "lower" | "neutral";
  target: number | null; mode: string; source: string;
  value: number | null; status: string; attainment: number | null; available: boolean; reason: string | null; endpoint: string | null;
};

export type LayerScore = { layer: number; label: string; score: number | null; grade: Grade; kpis: ScoredKpi[]; populated: number; total: number };

export type ConfigAuditRow = {
  key: string; product: string; setting: string; recommended: string; impact: string; remediation: string;
  steps: string[]; current: string; state: "Aligned" | "Gap" | "Not Assessed";
};

export type Improvement = {
  type: "kpi" | "config"; key: string; kpi: string; layer: number; layerLabel?: string; product: string;
  current: number | string | null; unit?: string; target: number | string | null; attainment: number | null;
  scoreLift: number | null; reco: string; lever: string | null; steps: string[] | null;
};

export type Finding = {
  id: number; layer: number; area: string; kpi: string; severity: "Red" | "Amber" | "Green";
  observation: string; businessImpact: string; recommendation: string; roiLever: string; steps: string[]; source: string;
};

export type RunResult = {
  platform?: Platform;
  /** Collection notes (RingCentral: partial data, sample volume, JWT expiry). */
  warnings?: string[];
  meta: { generatedAt: string; accountId: string; window: { from: string; to: string }; grantedScopes: string[]; subrequestsUsed: number };
  scorecard: {
    overall: number | null; overallGrade: Grade; configAlignment: number | null;
    coverage: { populated: number; total: number; apiPopulated: number; apiTotal: number; manual: number };
    layers: LayerScore[]; indices: IndexScore[];
    configAudit: { rows: ConfigAuditRow[]; assessed: number; aligned: number; total: number };
    improvements: Improvement[]; potentialGain: number | null; potentialOverall: number | null;
    gaps: { kpi: string; layer: number; mode: string; source: string; reason: string | null }[];
    domains: Record<string, { ok: boolean; reason: string | null }>;
  };
  findings: {
    summary: { total: number; red: number; amber: number; strengths: number };
    findings: Finding[];
    strengths: { kpi: string; layer: number; value: string; product: string }[];
  };
};

export type TrendRun = {
  id: string;
  source: RunSummary["source"];
  created_at: string;
  from_date: string;
  to_date: string;
  overall: number | null;
  overall_grade: Grade | null;
  config_alignment: number | null;
  red_findings: number | null;
  amber_findings: number | null;
  /** True when layer scores were derived from per-KPI rows (runs saved before layer scores were stored). */
  layers_derived: boolean;
  layers: { layer: number; label: string; score: number | null }[];
};

export type Trend = {
  connection: { id: string; platform: Platform; schedule_enabled: number; schedule_day: number; timezone: string };
  runs: TrendRun[];
  kpi_options: { key: string; label: string; layer: number; unit: string | null }[];
  kpis: {
    key: string; label: string; unit: string | null;
    points: { run_id: string; value: number | null; target: number | null; attainment: number | null; status: string | null }[];
  }[];
};

export type ZoomCredentialsInput = { accountId: string; clientId: string; clientSecret: string };
export type RingCentralCredentialsInput = { clientId: string; clientSecret: string; jwt: string };

export const optimizeV2Api = {
  accounts: () => request<OptimizeV2Account[]>("/optimize-v2/accounts"),

  account: (accountId: string) =>
    request<{
      account: { id: string; customer_id: string; customer_name: string; crm_account_id: string | null; optimize_status: string; vendor: string | null };
      /** Whether the signed-in role can change connections and schedules. */
      can_edit?: boolean;
      connections: Connection[];
      runs: RunSummary[];
    }>(`/optimize-v2/accounts/${encodeURIComponent(accountId)}`),

  saveConnection: (
    accountId: string,
    platform: Platform,
    body: { credentials?: ZoomCredentialsInput | RingCentralCredentialsInput; window_days?: number; assumptions?: Connection["assumptions"] },
  ) =>
    request<{ connection: Connection; grantedScopes?: string[] }>(
      `/optimize-v2/accounts/${encodeURIComponent(accountId)}/connections/${platform}`,
      { method: "PUT", body: JSON.stringify(body) },
    ),

  deleteConnection: (connectionId: string) =>
    request<{ ok: boolean }>(`/optimize-v2/connections/${encodeURIComponent(connectionId)}`, { method: "DELETE" }),

  runAssessment: (connectionId: string) =>
    request<{ runId: string; overall: number | null; grade: Grade }>(
      `/optimize-v2/connections/${encodeURIComponent(connectionId)}/runs`,
      { method: "POST" },
    ),

  saveSchedule: (connectionId: string, body: { enabled: boolean; day: number; timezone?: string }) =>
    request<{ connection: Connection; due: { due: boolean; reason: string; dueDate?: string } | null }>(
      `/optimize-v2/connections/${encodeURIComponent(connectionId)}/schedule`,
      { method: "PUT", body: JSON.stringify(body) },
    ),

  trend: (connectionId: string, kpis?: string[]) =>
    request<Trend>(
      `/optimize-v2/connections/${encodeURIComponent(connectionId)}/trend${kpis?.length ? `?kpis=${encodeURIComponent(kpis.join(","))}` : ""}`,
    ),

  run: (runId: string) =>
    request<{ run: RunSummary; result: RunResult | null }>(`/optimize-v2/runs/${encodeURIComponent(runId)}`),
};
