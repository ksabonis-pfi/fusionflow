// Zoom findings: recommendation and ROI-lever text per KPI, and the findings
// engine (observation → RAG severity → impact → recommendation → steps).
// Ported from the standalone Zoom Optimization agent (findings.js, v3.2.0).
import { severity } from "../../engine/scoring";
import type { Finding, Findings, Scorecard } from "../../engine/types";
import { KPI_STEPS } from "./kpis";

// ROI lever per KPI/product family (condensed from the Product-Feature ROI Catalog).
export const ROI_LEVER: Record<string, string> = {
  config_alignment: "Deployment assurance; risk reduction",
  license_utilization: "Reclaim idle licenses; right-size plan",
  feature_adoption: "Value realization; tool consolidation",
  ai_companion_adoption: "Documentation time saved; productivity",
  active_user_rate: "Adoption; license efficiency",
  sla: "SLA attainment; routing efficiency",
  asa: "Routing & staffing efficiency",
  abandon_rate: "Staffing balance; abandonment recovery",
  aht: "Handle efficiency; cost-to-serve",
  fcr: "Cost-to-serve; repeat-contact reduction",
  mos: "Quality assurance; user experience",
  csat: "Customer experience",
  repeat_contact: "Experience; cost-to-serve",
  agent_hours_saved: "Automation cost avoidance",
  forecast_accuracy: "Staffing precision",
  schedule_adherence: "Staffing efficiency",
  room_utilization: "Real-estate / meeting-space optimization",
  cost_per_interaction: "Cost-to-serve reduction",
  cost_per_automated: "Automation unit-cost reduction",
  cost_avoided: "Live-agent cost displaced",
  containment: "Deflection cost avoidance",
  deflection: "Deflection cost avoidance",
  bot_escalation: "Automation quality; seamless handoff",
  intent_accuracy: "Automation quality",
  fallback_rate: "Self-service breadth",
  bot_aht: "Bot efficiency",
  human_aht_escalated: "Post-bot handle efficiency",
  ai_confidence: "Automation quality",
  expert_assist: "Agent efficiency (ACW reduction)",
  deal_risk: "Win-rate protection",
  ai_influenced_revenue: "Revenue impact",
  bot_roi: "Automation ROI",
  adoption_risk_index: "Adoption risk mitigation",
  occupancy: "Staffing balance / agent utilization",
  conv_sentiment: "Customer & deal experience",
  conv_engagement: "Conversation effectiveness",
  conversations_analyzed: "Conversation-intelligence coverage",
};
// Crisp recommendation per KPI when it misses target.
export const RECO: Record<string, string> = {
  config_alignment: "Close configuration gaps in the audit below to lift the alignment score to ≥90%.",
  license_utilization: "Run a license utilization review; reclaim or downgrade dormant/never-logged-in licenses at next true-up.",
  feature_adoption: "Drive a feature-adoption campaign on the lowest-used licensed workloads.",
  ai_companion_adoption: "Enable AI Companion org-wide and train users on summaries, next steps, and compose.",
  active_user_rate: "Targeted enablement for dormant cohorts; reclaim inactive licenses.",
  sla: "Tune routing and staffing (WFM) to hit the service-level target; add callback offers at peak.",
  asa: "Reduce queue wait via staffing/skill alignment and overflow routing.",
  abandon_rate: "Add callback-in-queue and rebalance staffing to cut abandonment below 5%.",
  aht: "Streamline flows, surface knowledge/Expert Assist, and reduce hold to lower AHT.",
  fcr: "Improve disposition taxonomy and agent knowledge to resolve on first contact.",
  mos: "Enable QSS monitoring; investigate network/QoS at the worst sites to raise MOS to ≥4.2.",
  csat: "Act on survey drivers; coach low-CSAT cohorts via QM.",
  repeat_contact: "Address top repeat-drivers identified in dispositions and FCR analysis.",
  forecast_accuracy: "Stand up / retune WFM forecasting models.",
  schedule_adherence: "Enforce adherence tracking and intraday management.",
  room_utilization: "Consolidate idle rooms; enable check-in/auto-release to reclaim ghost meetings.",
  cost_per_interaction: "Shift volume to automation and improve handle efficiency to lower cost per interaction.",
  cost_per_automated: "Improve containment to drive down cost per automated interaction.",
  containment: "Expand intents/KB and enable generative answers to raise containment to ≥60%.",
  deflection: "Promote self-service entry points and broaden bot coverage.",
  bot_escalation: "Improve intent coverage and KB grounding to reduce unnecessary escalations.",
  intent_accuracy: "Retrain intents and review fallbacks to raise accuracy to ≥85%.",
  fallback_rate: "Add intents/KB for top no-match queries to cut fallback below 15%.",
  bot_aht: "Optimize bot flows to reduce bot handle time.",
  human_aht_escalated: "Pass full bot context (transcript+intent) on handoff to cut post-escalation AHT.",
  ai_confidence: "Improve KB grounding and training data to raise model confidence.",
  expert_assist: "Roll out AI Expert Assist to more agents to reduce wrap/ACW.",
  deal_risk: "Use Revenue Accelerator deal insights to action at-risk pipeline.",
  ai_influenced_revenue: "Expand Revenue Accelerator coaching and CRM sync to grow AI-influenced revenue.",
  bot_roi: "Scale automation against the highest-volume contact reasons to improve ROI.",
  adoption_risk_index: "Prioritize adoption plays on the lowest-scoring layers (license, feature, active use).",
  occupancy: "Rebalance staffing/schedules to lift occupancy toward ~85% without overloading agents.",
  conv_sentiment: "Coach reps on conversations flagged with low sentiment; review talk-to-listen.",
  conv_engagement: "Use Revenue Accelerator coaching/scorecards to raise conversation engagement.",
  conversations_analyzed: "Expand recording + conversation-intelligence coverage across more reps/calls.",
};
const fmt = (v: number | null | undefined, unit: string | undefined) =>
  v == null ? "—" : unit === "$" ? "$" + Number(v).toLocaleString() : unit === "%" ? v + "%" : unit === "sec" ? v + "s" : String(v);

export function buildFindings(sc: Scorecard): Findings {
  const findings: Finding[] = [];
  const strengths: Findings["strengths"] = [];
  let id = 0;

  // 1) KPI-driven findings (anything not On Target that has a value).
  for (const layer of sc.layers) {
    for (const k of layer.kpis) {
      if (!k.available || k.value == null) continue;
      if (k.status === "On Target") {
        if ((k.attainment ?? 0) >= 100) strengths.push({ kpi: k.label, layer: k.layer, value: fmt(k.value, k.unit), product: k.product });
        continue;
      }
      const gapDir = k.dir === "higher" ? "below" : "above";
      // 0-target "any is good" KPIs (see kpiStatus): "below the 0 target" reads oddly.
      const zeroTarget = k.dir === "higher" && (k.target ?? 0) <= 0;
      findings.push({
        id: ++id,
        layer: k.layer,
        area: k.product,
        kpi: k.label,
        severity: severity(k.attainment),
        observation: zeroTarget
          ? `${k.label} is ${fmt(k.value, k.unit)}: none recorded in this window.`
          : `${k.label} is ${fmt(k.value, k.unit)}, ${gapDir} the ${fmt(k.target, k.unit)} target (${k.attainment}% attainment).`,
        value: k.value, unit: k.unit, target: k.target, attainment: k.attainment,
        businessImpact: ROI_LEVER[k.key] || "Value realization",
        recommendation: RECO[k.key] || "Review against target and remediate.",
        roiLever: ROI_LEVER[k.key] || "—",
        steps: KPI_STEPS[k.key] || [],
        source: k.endpoint || k.mode,
      });
    }
  }

  // 2) Configuration-audit findings (Layer 0 gaps).
  for (const a of sc.configAudit.rows) {
    if (a.state !== "Gap") continue;
    findings.push({
      id: ++id,
      layer: 0,
      area: a.product,
      kpi: `Config: ${a.setting}`,
      severity: "Amber",
      observation: `${a.product} — “${a.setting}” is “${a.current || "not set"}”, recommended “${a.recommended}”.`,
      businessImpact: a.impact || "Deployment assurance",
      recommendation: a.remediation,
      roiLever: "Deployment assurance; risk reduction",
      steps: a.steps || [],
      source: "Config Audit",
    });
  }

  // 3) Composite-index findings.
  for (const ix of sc.indices) {
    if (ix.value != null && ix.status !== "On Target") {
      const cx = ix.key === "cx_health";
      findings.push({
        id: ++id,
        layer: cx ? 5 : 8,
        area: "Composite",
        kpi: ix.label,
        severity: severity((ix.value / ix.target) * 100),
        observation: `${ix.label} is ${ix.value} vs ≥${ix.target} target.`,
        businessImpact: cx ? "Customer experience" : "Automation effectiveness",
        recommendation: cx
          ? "Lift the contributing CX KPIs (SLA, FCR, CSAT, abandonment, repeat contact)."
          : "Lift the contributing automation KPIs (containment, intent accuracy, fallback, AI confidence).",
        roiLever: cx ? "Experience" : "Deflection cost avoidance",
        steps: cx
          ? ["Work the contributing CX KPIs below (SLA, FCR, CSAT, abandonment, repeat) — each has its own steps."]
          : ["Work the contributing automation KPIs below (containment, intent accuracy, fallback, AI confidence) — each has its own steps."],
        source: "Derived index",
      });
    }
  }

  // Rank: Red first, then by lowest attainment.
  const rank = { Red: 0, Amber: 1, Green: 2 };
  findings.sort((a, b) => (rank[a.severity] - rank[b.severity]) || ((a.attainment ?? 100) - (b.attainment ?? 100)));

  return {
    summary: {
      total: findings.length,
      red: findings.filter((f) => f.severity === "Red").length,
      amber: findings.filter((f) => f.severity === "Amber").length,
      strengths: strengths.length,
      byLayer: sc.layers.map((l) => ({ layer: l.layer, label: l.label, findings: findings.filter((f) => f.layer === l.layer).length })),
    },
    findings,
    strengths,
  };
}
