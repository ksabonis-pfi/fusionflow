// Adapts the RingCentral engine's native result (RcSnapshot) to the shared
// Scorecard / Findings shapes the V2 pages render. Scoring itself is untouched:
// every number here comes straight from the RingCentral engine.
import type {
  ConfigAuditRow, DomainStatus, Findings, Grade, Improvement, KpiMode, KpiStatus, Scorecard, ScoredKpi,
} from "../../engine/types";
import type { RcSnapshot } from "./assess";
import { KPI_META } from "./meta";
import type { RcKpiRow } from "./types";

/** RingCentral config units → the shared display units. */
const UNIT: Record<string, string> = { percent: "%", seconds: "sec", minutes: "min", count: "count" };
const unitOf = (u: string | null | undefined) => (u ? UNIT[u] ?? u : "");

function statusOf(r: RcKpiRow): KpiStatus {
  if (r.status === "green") return "On Target";
  if (r.status === "amber" || r.status === "red") return r.dir === "lower" ? "Off Target" : "Below Target";
  return "—";
}

function toKpi(r: RcKpiRow): ScoredKpi {
  return {
    layer: r.layer,
    key: r.key,
    label: r.label,
    product: KPI_META[r.key]?.product ?? "RingCentral",
    unit: unitOf(r.unit),
    dir: r.dir,
    target: r.target,
    mode: r.mode as KpiMode,
    source: r.source ?? "",
    value: r.value,
    status: statusOf(r),
    attainment: r.attainment,
    available: !!r.available,
    // Why it isn't scored: blocked on this tenant, or a sample-volume artifact.
    reason: r.flagReason ?? r.blockedBy ?? (r.available ? null : "Not collected"),
    endpoint: r.source,
  };
}

/** Which RingCentral areas the run reached, from the collectors' own warnings. */
const DOMAINS: { key: string; prefixes: string[]; blob?: keyof RcSnapshot }[] = [
  { key: "analytics", prefixes: ["Analytics aggregate unavailable", "Analytics timeline unavailable"] },
  { key: "inventory", prefixes: ["Inventory unavailable"], blob: "inventory" },
  { key: "aiInsights", prefixes: ["AI insight coverage unavailable", "AI insights:"], blob: "ace" },
  { key: "licenses", prefixes: ["License inventory unavailable"], blob: "licenses" },
  { key: "presence", prefixes: ["Presence unavailable"], blob: "presence" },
  { key: "video", prefixes: ["Video history unavailable"], blob: "video" },
  { key: "ringcx", prefixes: ["RingCX unavailable", "RingCX:"], blob: "ringcx" },
];

function domainsOf(s: RcSnapshot): Record<string, DomainStatus> {
  const out: Record<string, DomainStatus> = {};
  for (const d of DOMAINS) {
    const warning = s.warnings.find((w) => d.prefixes.some((p) => w.startsWith(p)));
    const blob = d.blob ? (s[d.blob] as { reachable?: boolean; permission?: { allowed?: boolean } } | null) : undefined;
    // Collectors signal "no access" three ways: a thrown error (→ "unavailable"
    // warning), reachable: false (RingCX), or permission.allowed: false (RingSense).
    const failed = (warning && /unavailable/.test(warning)) || blob === null
      || blob?.reachable === false || blob?.permission?.allowed === false;
    out[d.key] = { ok: !failed, reason: failed ? warning ?? "Not reachable with the granted access" : warning ?? null };
  }
  return out;
}

const auditState = (s: string): ConfigAuditRow["state"] => (s === "aligned" ? "Aligned" : s === "gap" ? "Gap" : "Not Assessed");

export function toScorecard(s: RcSnapshot): Scorecard {
  const layerName = Object.fromEntries(s.layers.map((l) => [l.layer, l.label]));
  const layers = s.layers.map((l) => ({
    layer: l.layer, label: l.label, score: l.score, grade: l.grade as Grade,
    kpis: l.kpis.map(toKpi), populated: l.populated, total: l.total,
  }));
  const rows = s.audit.map((a): ConfigAuditRow => ({
    key: a.id, product: layerName[a.layer] ?? `Layer ${a.layer}`, setting: a.setting, recommended: a.recommended,
    detect: null, impact: a.impact, remediation: a.remediation, steps: [], current: a.detail ?? "", state: auditState(a.status),
  }));
  const assessed = rows.filter((r) => r.state !== "Not Assessed").length;
  const kpis = s.kpis.map(toKpi);

  const improvements = s.improvements.map((i, n): Improvement => ({
    type: i.source === "config-audit" ? "config" : "kpi",
    key: `${i.source === "config-audit" ? "config" : "kpi"}-${n}`,
    kpi: i.kpi, layer: i.layer, layerLabel: i.layerLabel, product: i.layerLabel,
    current: i.current, unit: unitOf(i.unit), target: i.target, dir: "higher",
    attainment: i.attainment, scoreLift: i.scoreLift, reco: i.reco, lever: i.lever, steps: i.steps,
  }));

  return {
    overall: s.summary.overall,
    overallGrade: (s.summary.overall_grade ?? "N/A") as Grade,
    configAlignment: s.audit_alignment != null ? Math.round(s.audit_alignment * 1000) / 10 : null,
    coverage: {
      populated: s.summary.kpis_populated,
      total: s.summary.kpis_total,
      apiPopulated: s.summary.api_populated,
      apiTotal: s.summary.kpis_measurable,
      manual: s.summary.kpis_blocked,
    },
    layers,
    indices: s.indices.map(({ key, label, value, target, note, status }) => ({ key, label, value, target, note, status })),
    configAudit: { rows, assessed, aligned: rows.filter((r) => r.state === "Aligned").length, total: rows.length },
    topActions: [],
    improvements,
    potentialGain: s.potentialGain,
    potentialOverall: s.summary.potential_overall ?? null,
    gaps: kpis.filter((k) => !k.available).map((k) => ({ kpi: k.label, layer: k.layer, mode: k.mode, source: k.source, reason: k.reason })),
    domains: domainsOf(s),
  };
}

export function toFindings(s: RcSnapshot, sc: Scorecard): Findings {
  const findings = s.findings.map((f, n) => ({
    id: n + 1,
    layer: f.layer,
    area: f.area,
    kpi: f.kpi,
    severity: f.severity,
    observation: f.observation,
    value: f.value,
    unit: unitOf(f.unit),
    target: f.target,
    attainment: f.attainment,
    businessImpact: f.roiLever,
    recommendation: f.recommendation,
    roiLever: f.roiLever,
    steps: f.steps ?? [],
    source: f.kind,
  }));
  const strengths = s.kpis
    .filter((r) => r.status === "green" && (r.attainment ?? 0) >= 100 && !r.flagged)
    .map((r) => ({ kpi: r.label, layer: r.layer, value: r.value == null ? "—" : `${r.value}${unitOf(r.unit) === "%" ? "%" : ""}`, product: KPI_META[r.key]?.product ?? "RingCentral" }));
  return {
    summary: {
      total: s.findingSummary.total,
      red: s.findingSummary.red,
      amber: s.findingSummary.amber,
      strengths: strengths.length,
      byLayer: sc.layers.map((l) => ({ layer: l.layer, label: l.label, findings: findings.filter((f) => f.layer === l.layer).length })),
    },
    findings,
    strengths,
  };
}
