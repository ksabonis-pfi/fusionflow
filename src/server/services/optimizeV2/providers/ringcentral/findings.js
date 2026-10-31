// Ported verbatim from the standalone RingCentral Optimization agent (findings.js, v0.3.x).
// Kept as JavaScript so it stays identical to the validated original; only the
// config import paths changed (the JSON now lives in ./config).

// Findings and improvement ranking.
//
// Every KPI below target and every configuration gap becomes a finding with
// an observation, a recommendation, and where config supplies them, concrete
// steps and an ROI lever. Improvements are the same set ranked by projected
// lift to the overall score, so "fix these three first" is answerable.
//
// Severity follows the Zoom program: Red <60% attainment, Amber 60-85%,
// Green >=85%.

import kpiConfig from "./config/kpis.json";
import { scoreLift, LAYER_NAME } from "./scoring.js";

const KPI = Object.fromEntries(kpiConfig.kpis.map((k) => [k.id, k]));

export function severityOf(attainment) {
  if (attainment == null) return "Green";
  return attainment < 60 ? "Red" : attainment < 85 ? "Amber" : "Green";
}

const fmtVal = (v, unit) =>
  v == null ? "—"
  : unit === "percent" ? `${Math.round(v * 10) / 10}%`
  : unit === "seconds" ? `${Math.round(v)}s`
  : unit === "minutes" ? `${Math.round(v)}m`
  : Number(v).toLocaleString();

/**
 * Build findings from scored KPI rows and audit results.
 * `flagged` KPIs are deliberately excluded — a sample-volume artifact is not
 * a finding, and presenting it as one is exactly the dishonesty the guardrail
 * exists to prevent.
 */
export function buildFindings(rows, auditRows, layers) {
  const findings = [];

  for (const r of rows) {
    if (r.flagged) continue;
    if (r.mode === "blocked") {
      findings.push({
        severity: "Amber",
        kind: "access",
        kpi: r.label,
        layer: r.layer,
        area: LAYER_NAME[r.layer] ?? "",
        observation: `Not measurable on this account: ${r.blockedBy}`,
        recommendation: "Clear the access or entitlement above, then re-run. No code change will surface this.",
        steps: null,
        roiLever: "Assessment completeness",
      });
      continue;
    }
    if (r.attainment == null || r.status === "green") continue;

    const cfg = KPI[r.key] || {};
    findings.push({
      severity: severityOf(r.attainment),
      kind: "kpi",
      kpi: r.label,
      layer: r.layer,
      area: LAYER_NAME[r.layer] ?? "",
      value: r.value,
      target: r.target,
      unit: r.unit,
      attainment: r.attainment,
      observation: `${r.label} is ${fmtVal(r.value, r.unit)} against a target of ${fmtVal(r.target, r.unit)} (${r.attainment}% attainment).`,
      recommendation: cfg.reco || defaultReco(r),
      steps: cfg.steps || null,
      roiLever: cfg.lever || "Operational efficiency",
    });
  }

  for (const a of auditRows || []) {
    if (a.status !== "gap") continue;
    findings.push({
      severity: "Amber",
      kind: "config",
      kpi: a.setting,
      layer: a.layer,
      area: LAYER_NAME[a.layer] ?? "",
      observation: `${a.setting}: ${a.detail || "not aligned"}. Recommended: ${a.recommended}.`,
      recommendation: a.remediation || `Set to “${a.recommended}”.`,
      steps: null,
      roiLever: a.impact || "Deployment assurance",
    });
  }

  const order = { Red: 0, Amber: 1, Green: 2 };
  findings.sort((x, y) => (order[x.severity] - order[y.severity]) || ((x.attainment ?? 100) - (y.attainment ?? 100)));

  return {
    findings,
    summary: {
      red: findings.filter((f) => f.severity === "Red").length,
      amber: findings.filter((f) => f.severity === "Amber").length,
      green: findings.filter((f) => f.severity === "Green").length,
      total: findings.length,
    },
  };
}

function defaultReco(r) {
  const dir = r.dir === "higher" ? "raise" : "reduce";
  return `Bring ${r.label} to ${fmtVal(r.target, r.unit)} — ${dir} it from the current ${fmtVal(r.value, r.unit)}.`;
}

/**
 * Ranked improvements: what to fix first, and what each is worth.
 * Config gaps share an equal slice of one notional layer's worth of lift, the
 * same simplification the Zoom program makes.
 */
export function buildImprovements(rows, auditRows, layers) {
  const improvements = [];

  for (const r of rows) {
    if (r.flagged || r.mode === "blocked") continue;
    if (r.attainment == null || r.attainment >= 100 || r.status === "green") continue;
    const cfg = KPI[r.key] || {};
    improvements.push({
      kpi: r.label,
      layer: r.layer,
      layerLabel: LAYER_NAME[r.layer] ?? "",
      current: r.value,
      target: r.target,
      unit: r.unit,
      attainment: r.attainment,
      scoreLift: scoreLift(r, layers),
      reco: cfg.reco || defaultReco(r),
      steps: cfg.steps || null,
      lever: cfg.lever || "Operational efficiency",
      source: r.source,
    });
  }

  const gaps = (auditRows || []).filter((a) => a.status === "gap");
  if (gaps.length) {
    const nScored = layers.filter((l) => l.score != null).length || 1;
    const perGap = Math.round((100 / nScored / Math.max(gaps.length, 1)) * 10) / 10;
    for (const g of gaps) {
      improvements.push({
        kpi: g.setting,
        layer: g.layer,
        layerLabel: LAYER_NAME[g.layer] ?? "",
        current: g.detail,
        target: g.recommended,
        unit: null,
        attainment: null,
        scoreLift: perGap,
        reco: g.remediation || `Set to “${g.recommended}”.`,
        steps: null,
        lever: g.impact || "Deployment assurance",
        source: "config-audit",
      });
    }
  }

  improvements.sort((a, b) => (b.scoreLift || 0) - (a.scoreLift || 0));
  const potentialGain = Math.round(improvements.reduce((s, i) => s + (i.scoreLift || 0), 0) * 10) / 10;
  return { improvements, potentialGain };
}
