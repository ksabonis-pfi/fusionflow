// Provider-neutral shapes shared by every optimization provider (Zoom, RingCentral).

export type Platform = "zoom" | "ringcentral";

/** "neutral" KPIs (RingCentral volume context, e.g. total calls) are shown but never scored. */
export type Direction = "higher" | "lower" | "neutral";

/** How a KPI's value is obtained. "supplied" = overridden by a manual input on the connection.
 *  RingCentral adds "blocked" (not measurable on this tenant, with a reason) and "missing". */
export type KpiMode = "api" | "derived" | "manual" | "supplied" | "blocked" | "missing";

export type KpiDef = {
  layer: number;
  key: string;
  label: string;
  product: string;
  unit: string;
  dir: Direction;
  /** null for neutral (context-only) KPIs. */
  target: number | null;
  mode: KpiMode;
  source: string;
};

/** One collected metric, keyed by KPI key. */
export type MetricEntry = {
  value: number | null;
  available: boolean;
  reason: string | null;
  endpoint: string | null;
  supplied?: boolean;
  manual?: boolean;
};

export type DomainStatus = { ok: boolean; reason: string | null };

export type KpiStatus = "On Target" | "Below Target" | "Off Target" | "—";

export type ScoredKpi = KpiDef & {
  value: number | null;
  status: KpiStatus;
  attainment: number | null;
  available: boolean;
  reason: string | null;
  endpoint: string | null;
};

export type Grade = "A" | "B" | "C" | "D" | "F" | "N/A";

export type LayerScore = {
  layer: number;
  label: string;
  score: number | null;
  grade: Grade;
  kpis: ScoredKpi[];
  populated: number;
  total: number;
};

export type IndexScore = {
  key: string;
  label: string;
  value: number | null;
  target: number;
  note: string;
  status: "On Target" | "Below Target" | "—";
};

export type ConfigAuditRow = {
  key: string;
  product: string;
  setting: string;
  recommended: string;
  detect: string | null;
  impact: string;
  remediation: string;
  steps: string[];
  current: string;
  state: "Aligned" | "Gap" | "Not Assessed";
};

export type Improvement = {
  type: "kpi" | "config";
  key: string;
  kpi: string;
  layer: number;
  layerLabel: string | undefined;
  product: string;
  current: number | string | null;
  unit?: string;
  target: number | string | null;
  dir: Direction;
  attainment: number | null;
  scoreLift: number | null;
  reco: string;
  lever: string | null;
  steps: string[] | null;
};

export type Scorecard = {
  overall: number | null;
  overallGrade: Grade;
  configAlignment: number | null;
  coverage: { populated: number; total: number; apiPopulated: number; apiTotal: number; manual: number };
  layers: LayerScore[];
  indices: IndexScore[];
  configAudit: { rows: ConfigAuditRow[]; assessed: number; aligned: number; total: number };
  topActions: { kpi: string; layer: number; value: number | null; unit: string; target: number | null; attainment: number | null; product: string }[];
  improvements: Improvement[];
  potentialGain: number | null;
  potentialOverall: number | null;
  gaps: { kpi: string; layer: number; mode: KpiMode; source: string; reason: string | null }[];
  domains: Record<string, DomainStatus>;
};

export type Severity = "Red" | "Amber" | "Green";

export type Finding = {
  id: number;
  layer: number;
  area: string;
  kpi: string;
  severity: Severity;
  observation: string;
  value?: number | null;
  unit?: string;
  target?: number | null;
  attainment?: number | null;
  businessImpact: string;
  recommendation: string;
  roiLever: string;
  steps: string[];
  source: string;
};

export type Findings = {
  summary: { total: number; red: number; amber: number; strengths: number; byLayer: { layer: number; label: string; findings: number }[] };
  findings: Finding[];
  strengths: { kpi: string; layer: number; value: string; product: string }[];
};

/** Cost-model assumptions set per connection (used by derived KPIs). */
export type Assumptions = { agentLoadedRatePerHr?: number; automationCostYr?: number; crm?: string };

/** Manual KPI values by key; `__audit` holds config-audit current-state overrides by row key. */
export type ManualInputs = Record<string, unknown> & { __audit?: Record<string, string> };
