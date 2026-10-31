// Shapes produced by the RingCentral engine (kept as JavaScript; see each file's header).

export type RcDirection = "higher" | "lower" | "neutral";
export type RcStatus = "green" | "amber" | "red" | "n/a";
export type RcMode = "api" | "supplied" | "blocked" | "missing";

/** One scored KPI row from scoreKpis(). */
export type RcKpiRow = {
  key: string;
  label: string;
  layer: number;
  blockedBy: string | null;
  value: number | null;
  target: number | null;
  unit: string;
  dir: RcDirection;
  status: RcStatus;
  attainment: number | null;
  mode: RcMode;
  source: string | null;
  available: 0 | 1;
  flagged: boolean;
  flagReason: string | null;
};

export type RcLayer = {
  layer: number; label: string; score: number | null; grade: string;
  kpis: RcKpiRow[]; populated: number; scored: number; blocked: number; total: number;
};

export type RcIndex = {
  key: string; label: string; value: number | null; target: number; note: string;
  components: string[]; missing: string[]; status: "On Target" | "Below Target" | "—";
};

export type RcAuditRow = {
  id: string; layer: number; setting: string; recommended: string;
  status: "aligned" | "gap" | "not assessed"; detail: string; impact: string; remediation: string;
};

export type RcFinding = {
  severity: "Red" | "Amber" | "Green"; kind: "kpi" | "config" | "access"; kpi: string; layer: number; area: string;
  value?: number | null; target?: number | null; unit?: string; attainment?: number | null;
  observation: string; recommendation: string; steps: string[] | null; roiLever: string;
};

export type RcImprovement = {
  kpi: string; layer: number; layerLabel: string; current: number | string | null; target: number | string | null;
  unit: string | null; attainment: number | null; scoreLift: number; reco: string; steps: string[] | null;
  lever: string; source: string | null;
};

export type RcSummary = {
  kpis_total: number; kpis_populated: number; kpis_blocked: number; kpis_measurable: number; api_populated: number;
  data_coverage_pct: number; overall: number | null; overall_grade: string | null; red_findings: number; amber_findings: number;
  sample_volume_flag: 0 | 1; total_calls_in_window: number; calls_per_day: number;
  potential_gain?: number; potential_overall?: number | null;
};

/** Loosely shaped collector output (inventory, analytics, RingCX, …). */
export type RcBlob = Record<string, unknown> | null;
