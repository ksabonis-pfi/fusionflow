// Builds the Zoom 11-layer scorecard from the collected metrics: derived and
// cross-product KPIs, config alignment, composite indices, layer attainment,
// coverage, and the ranked score-improvement plan. Ported from the standalone
// Zoom Optimization agent (scorecard.js, v3.2.0); logic unchanged.
import { attainment, clamp, grade, kpiStatus, r1, sameState } from "../../engine/scoring";
import type { Assumptions, ConfigAuditRow, Improvement, LayerScore, ManualInputs, MetricEntry, Scorecard, ScoredKpi } from "../../engine/types";
import type { ZoomContext } from "./collectors";
import { RECO, ROI_LEVER } from "./findings";
import { CONFIG_AUDIT, INDICES, KPI_STEPS, KPIS, LAYERS } from "./kpis";

const manual = (reason: string): MetricEntry => ({ value: null, available: false, reason, endpoint: null, manual: true });
const derived = (value: number | null, endpoint: string): MetricEntry => ({ value, available: true, reason: null, endpoint });

export function buildScorecard(ctx: ZoomContext, assumptions: Assumptions = {}, inputs: ManualInputs = {}): Scorecard {
  const M = ctx.metrics;

  // Supplied overrides (export-only / modeled KPIs, or to override API values).
  // inputs.__audit holds config-audit current-state overrides (by row key).
  const auditOv = (inputs && typeof inputs.__audit === "object" && inputs.__audit) || {};
  for (const [k, v] of Object.entries(inputs || {})) {
    if (k === "__audit" || v === "" || v == null) continue;
    const n = Number(v);
    if (!Number.isNaN(n)) M[k] = { value: n, available: true, reason: null, endpoint: "supplied (manual/export)", supplied: true };
  }

  const val = (k: string) => (M[k] && M[k].available ? M[k].value : null);

  // ---- Config Alignment Score (Layer 0) from the audit current-state map ----
  const auditRows: ConfigAuditRow[] = CONFIG_AUDIT.map((row) => {
    const auto = row.detect ? ctx.audit[row.detect] ?? null : null;
    const ov = auditOv[row.key];
    let current: string | null = ov != null && ov !== "" ? ov : auto; // supplied override wins over auto-detect
    let state: ConfigAuditRow["state"] = "Not Assessed";
    if (current != null && current !== "") state = sameState(current, row.recommended) ? "Aligned" : "Gap";
    // Name the actual CRM (Dynamics/Salesforce/HubSpot) when set on the connection.
    if (row.key === "zra_crm" && current && assumptions.crm) current = `${current} — ${assumptions.crm}`;
    return { ...row, current: current ?? "", state };
  });
  const assessed = auditRows.filter((r) => r.state !== "Not Assessed");
  const aligned = assessed.filter((r) => r.state === "Aligned").length;
  const configAlignment = assessed.length ? (aligned / assessed.length) * 100 : null;
  const settingsFailed = ctx.domains.settings?.ok === false;
  M.config_alignment = configAlignment != null
    ? derived(r1(configAlignment), "Config Audit")
    : {
      value: null, available: false, endpoint: null,
      reason: settingsFailed ? `Account settings unreadable: ${ctx.domains.settings?.reason}` : "No auditable settings detected",
    };

  // ---- Feature adoption (derived): breadth of workloads actually in use ----
  // A workload counts only when it returned real activity. The original
  // counted any area whose API calls didn't error, so a phone-only tenant got
  // credit for Contact Center, Virtual Agent and ZRA because Zoom answered
  // those requests with empty results.
  const raw = ctx.raw as Record<string, { total?: number; users?: number; agents?: number | null; available?: boolean } | undefined>;
  const inUse: Record<string, boolean> = {
    users: (raw.users?.total ?? 0) > 0,
    phone: (raw.phone?.users ?? 0) > 0,
    rooms: (raw.rooms?.total ?? 0) > 0,
    contactCenter: (raw.cc?.agents ?? 0) > 0,
    virtualAgent: raw.zva?.available === true,
    webinars: (raw.webinars?.total ?? 0) > 0,
    zra: ctx.audit.zra_connected === "Connected",
  };
  const breadthDomains = Object.keys(inUse);
  const live = breadthDomains.filter((d) => ctx.domains[d]?.ok && inUse[d]).length;
  M.feature_adoption = derived(r1((live / breadthDomains.length) * 100), "Workloads with activity (derived)");

  // ---- Cross-product derived KPIs (skip if a value was supplied) ----
  // Agent hours saved = deflected interactions × handle time.
  const defl = val("deflection");
  const aht = val("aht");
  const offered = ctx.raw?.cc?.offered;
  if (!M.agent_hours_saved?.supplied) {
    if (defl != null && aht != null && offered) {
      M.agent_hours_saved = derived(r1((offered * (defl / 100) * aht) / 3600), "Derived (deflection × AHT × volume)");
    } else if (!M.agent_hours_saved) M.agent_hours_saved = manual("Needs deflection, AHT and volume (or supply directly)");
  }

  // Cost avoided = hours saved × loaded agent rate.
  const loadedRate = Number(assumptions.agentLoadedRatePerHr) || 0;
  if (!M.cost_avoided?.supplied) {
    if (M.agent_hours_saved?.available && loadedRate > 0) {
      M.cost_avoided = derived(r1((M.agent_hours_saved.value ?? 0) * loadedRate), "Derived (hours × loaded rate)");
    } else if (!M.cost_avoided) M.cost_avoided = manual("Set agent loaded rate (and deflection) to compute");
  }

  // Bot ROI = cost avoided ÷ automation cost.
  const autoCost = Number(assumptions.automationCostYr) || 0;
  if (!M.bot_roi?.supplied) {
    if (M.cost_avoided?.available && autoCost > 0) {
      M.bot_roi = derived(r1(((M.cost_avoided.value ?? 0) / autoCost) * 100), "Derived (cost avoided ÷ automation cost)");
    } else if (!M.bot_roi) M.bot_roi = manual("Set automation cost (and cost avoided) to compute");
  }

  // Manual/model KPIs not collectable via API (kept as gaps unless supplied).
  for (const k of ["ai_companion_adoption", "cost_per_interaction", "cost_per_automated", "ai_influenced_revenue"]) {
    if (!M[k]?.available) M[k] = manual("Export-only / modeled — supply via manual inputs");
  }

  // Adoption Risk Index (derived): inverse of active-user & feature adoption health.
  const healthBits = [val("active_user_rate"), M.feature_adoption.value, val("license_utilization")].filter((x): x is number => x != null);
  if (healthBits.length) {
    const health = healthBits.reduce((a, b) => a + b, 0) / healthBits.length;
    M.adoption_risk_index = derived(r1(clamp(100 - health)), "Derived (100-adoption health)");
  } else if (!M.adoption_risk_index) M.adoption_risk_index = manual("Needs adoption inputs");

  // ---- Per-KPI scored rows ----
  const rows: ScoredKpi[] = KPIS.map((k) => {
    const m = M[k.key] || { value: null, available: false, reason: "Not collected", endpoint: null };
    const v = m.available ? m.value : null;
    return {
      ...k,
      mode: m.supplied ? "supplied" : k.mode,
      value: v,
      status: kpiStatus(v, k.target, k.dir),
      attainment: attainment(v, k.target, k.dir),
      available: m.available,
      reason: m.reason,
      endpoint: m.endpoint,
    };
  });

  // ---- Layer rollups ----
  const layers: LayerScore[] = Object.entries(LAYERS).map(([n, label]) => {
    const lr = rows.filter((r) => r.layer === Number(n));
    const scored = lr.filter((r) => r.attainment != null);
    const score = scored.length ? Math.round(scored.reduce((a, r) => a + (r.attainment ?? 0), 0) / scored.length) : null;
    return { layer: Number(n), label, score, grade: grade(score), kpis: lr, populated: scored.length, total: lr.length };
  });

  // ---- Overall + indices ----
  const scoredLayers = layers.filter((l) => l.score != null);
  const overall = scoredLayers.length ? Math.round(scoredLayers.reduce((a, l) => a + (l.score ?? 0), 0) / scoredLayers.length) : null;

  const flatVals = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const indices = INDICES.map((ix) => {
    const value = ix.compute(flatVals);
    return {
      key: ix.key, label: ix.label, value, target: ix.target, note: ix.note,
      status: (value == null ? "—" : value >= ix.target ? "On Target" : "Below Target") as "—" | "On Target" | "Below Target",
    };
  });

  // ---- Coverage ----
  const apiKpis = rows.filter((r) => r.mode !== "manual");
  const coverage = {
    populated: rows.filter((r) => r.available).length,
    total: rows.length,
    apiPopulated: apiKpis.filter((r) => r.available).length,
    apiTotal: apiKpis.length,
    manual: rows.filter((r) => r.mode === "manual").length,
  };

  // ---- Priority actions: worst attainment first ----
  const topActions = rows
    .filter((r) => r.attainment != null && r.status !== "On Target")
    .sort((a, b) => (a.attainment ?? 0) - (b.attainment ?? 0))
    .slice(0, 6)
    .map((r) => ({ kpi: r.label, layer: r.layer, value: r.value, unit: r.unit, target: r.target, attainment: r.attainment, product: r.product }));

  // ---- Score improvement plan: ranked items that will raise the overall score ----
  // Overall = mean of layer scores; a layer score = mean of its scored KPIs'
  // attainment. So bringing one KPI to target lifts overall by
  // (100 − attainment) ÷ (KPIs scored in its layer) ÷ (scored layers).
  const layerByNum = Object.fromEntries(layers.map((l) => [l.layer, l]));
  const nScored = scoredLayers.length || 1;
  const improvements: Improvement[] = [];
  for (const r of rows) {
    if (r.attainment == null || r.status === "On Target" || r.attainment >= 100) continue;
    if (r.key === "config_alignment") continue; // surfaced as individual config gaps below
    const L = layerByNum[r.layer];
    const nKpi = (L && L.populated) || 1;
    improvements.push({
      type: "kpi", key: r.key, kpi: r.label, layer: r.layer, layerLabel: L?.label, product: r.product,
      current: r.value, unit: r.unit, target: r.target, dir: r.dir, attainment: r.attainment,
      scoreLift: r1(((100 - r.attainment) / nKpi) / nScored),
      reco: RECO[r.key] || "Improve this metric toward its target.", lever: ROI_LEVER[r.key] || null, steps: KPI_STEPS[r.key] || null,
    });
  }
  // Config-audit gaps: each aligned gap raises config_alignment (Layer 0).
  const cfgL = layerByNum[0];
  const cfgN = (cfgL && cfgL.populated) || 1;
  const gapRows = auditRows.filter((r) => r.state === "Gap");
  if (gapRows.length && assessed.length && M.config_alignment.available) {
    const perGap = r1(((100 / assessed.length) / cfgN) / nScored);
    for (const g of gapRows) {
      improvements.push({
        type: "config", key: g.key, kpi: `Configuration: ${g.setting}`, layer: 0, layerLabel: cfgL?.label, product: g.product,
        current: g.current || "Gap / not set", target: g.recommended, dir: "higher", attainment: null,
        scoreLift: perGap, reco: g.remediation || `Set to “${g.recommended}”.`, lever: g.impact || "Deployment assurance", steps: g.steps || null,
      });
    }
  }
  improvements.sort((a, b) => (b.scoreLift || 0) - (a.scoreLift || 0));
  const potentialGain = r1(improvements.reduce((s, i) => s + (i.scoreLift || 0), 0));

  return {
    overall,
    overallGrade: grade(overall),
    configAlignment: M.config_alignment.value,
    coverage,
    layers,
    indices,
    configAudit: { rows: auditRows, assessed: assessed.length, aligned, total: auditRows.length },
    topActions,
    improvements,
    potentialGain,
    potentialOverall: overall != null ? Math.min(100, r1(overall + (potentialGain ?? 0)) ?? 0) : null,
    gaps: rows.filter((r) => !r.available).map((r) => ({ kpi: r.label, layer: r.layer, mode: r.mode, source: r.source, reason: r.reason })),
    domains: ctx.domains,
  };
}
