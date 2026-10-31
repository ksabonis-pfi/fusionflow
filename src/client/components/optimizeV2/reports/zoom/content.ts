// Authored narrative for the Zoom Executive and Outcomes readouts. Ported from
// the standalone Zoom Optimization agent (public/report-content.js); wording
// unchanged apart from markup (<strong> → **bold**, &amp; → &).
//
// The run data is quantitative (scores, KPIs, findings). This supplies the story
// the data doesn't carry on its own: why each layer matters, what it affects
// today, what addressing it unlocks, who it matters to, the ROI, and how
// PacketFusion helps. Keyed by the 11 scorecard layers.
import type { Basis } from "../types";
import type { ZoomReportModel } from "./model";

export type LayerNarrative = {
  icon: string;
  accent: string;
  tagline: string;
  whyItMatters: string;
  affectsNow: string;
  improving: string;
  howItHelps: string;
  roi: string;
  stakeholders: { company: string; department: string; team: string; user: string };
};

export const LAYERS: Record<number, LayerNarrative> = {
  0: {
    icon: "shield", accent: "var(--s1)", tagline: "The governed foundation everything else sits on",
    whyItMatters: "Your Zoom tenant's security, compliance, and governance settings are the bedrock under every other outcome. When the foundation is misconfigured, adoption, cost control, and data protection all erode quietly from underneath.",
    affectsNow: "Unenforced SSO, missing auto-deprovisioning, and absent retention or recording policies expose the business to unauthorized access, license leakage, and compliance gaps — happening today, invisibly, with no alert.",
    improving: "Aligning each setting to Zoom's recommended state hardens access, automates license hygiene, and makes every downstream metric trustworthy. It is the fastest, lowest-cost score lift on the board.",
    howItHelps: "PacketFusion maps each configuration to its recommended target and hands your admins the exact portal steps to close the gap — turning an invisible risk surface into a documented, auditable baseline.",
    roi: "Risk reduction plus licenses reclaimed through SCIM auto-deprovisioning — typically the cheapest, highest-certainty points available.",
    stakeholders: {
      company: "Protects brand, customer data, and audit posture; removes silent compliance exposure.",
      department: "IT & Security gain an enforced, repeatable configuration standard they can prove.",
      team: "Admins stop firefighting one-off access, retention, and policy exceptions.",
      user: "Employees get secure single sign-on and consistent, protected experiences everywhere.",
    },
  },
  1: {
    icon: "license", accent: "var(--s2)", tagline: "Pay for what you use — reclaim what you don't",
    whyItMatters: "Every assigned-but-idle license is money leaving the business each month. License utilization is the clearest line between what you pay Zoom and the value you actually receive.",
    affectsNow: "Dormant and never-logged-in seats inflate the renewal, hide true demand, and make right-sizing impossible. At the next true-up you over-commit to capacity you aren't using.",
    improving: "A utilization review reclaims or downgrades idle seats, right-sizes the plan, and converts waste into either savings or re-investment in the features that drive adoption.",
    howItHelps: "PacketFusion surfaces the idle-seat gap against an 80% target and gives you the reclaim workflow — so the renewal reflects real usage, not historical over-provisioning.",
    roi: "Direct, recurring cost savings at renewal; every reclaimed license drops to the bottom line.",
    stakeholders: {
      company: "Lower total cost of ownership and a defensible, usage-based renewal.",
      department: "IT & Procurement negotiate from real data instead of guesswork.",
      team: "License admins get a repeatable quarterly reclaim motion.",
      user: "Active users keep full capability; only genuinely idle seats are touched.",
    },
  },
  2: {
    icon: "spark", accent: "var(--s4)", tagline: "Turn licensed capability into realized value",
    whyItMatters: "You are already paying for features most users never touch. Feature adoption is the difference between owning a capability and getting a return on it.",
    affectsNow: "Low adoption means the business funds AI Companion, Phone, Rooms, or Contact Center capabilities that sit dark — so the expected productivity and experience gains never show up.",
    improving: "A targeted enablement campaign on the lowest-used licensed workloads converts shelf-ware into measurable productivity, and consolidates overlapping third-party tools you can retire.",
    howItHelps: "PacketFusion identifies which licensed features are under-adopted and sequences the enablement plays that unlock them — so spend you've already committed starts returning value.",
    roi: "Value realization on existing spend plus tool-consolidation savings — no new license cost required.",
    stakeholders: {
      company: "Higher return on the Zoom investment; fewer redundant point tools.",
      department: "Enablement & IT can prove the platform is earning its keep.",
      team: "Managers get modern capabilities their people will actually use.",
      user: "Employees work faster with AI summaries, smart recordings, and unified tools.",
    },
  },
  3: {
    icon: "pulse", accent: "var(--s1)", tagline: "Are people actually using what you deployed?",
    whyItMatters: "Active usage is the leading indicator of adoption health. A deployment can look 'complete' on paper while real engagement quietly stalls.",
    affectsNow: "A soft active-user rate signals dormant cohorts, change-management gaps, or licenses that could be reclaimed — a slow leak on both value and spend.",
    improving: "Re-engaging dormant cohorts lifts the return on every license and strengthens every experience and efficiency metric that depends on consistent use.",
    howItHelps: "PacketFusion flags the engagement gap against an 85% target and points enablement at the specific inactive cohorts, so adoption is driven by data, not assumption.",
    roi: "Adoption uplift that compounds across license efficiency, experience, and productivity.",
    stakeholders: {
      company: "Confidence that the rollout is delivering, not just installed.",
      department: "CX/IT leadership can target change management where it's needed.",
      team: "Supervisors see which groups need coaching or re-onboarding.",
      user: "Dormant users get brought back with relevant, timely enablement.",
    },
  },
  4: {
    icon: "gauge", accent: "var(--s3)", tagline: "The operational vitals customers feel",
    whyItMatters: "Service level, speed of answer, handle time, resolution, and voice quality are the vitals of the service your customers actually experience. They translate directly into satisfaction and cost.",
    affectsNow: "Missed SLA, long queues, high handle time, or poor MOS mean customers wait, repeat themselves, and churn — while agents burn capacity on avoidable effort.",
    improving: "Tuning routing, staffing, knowledge, and network quality lifts first-contact resolution and cuts wait and handle time — better experience at lower cost to serve, simultaneously.",
    howItHelps: "PacketFusion benchmarks each performance KPI against its target and prescribes the routing, WFM, and QoS actions that move it — with the exact configuration steps.",
    roi: "Lower cost-to-serve and higher retention from measurable SLA, AHT, FCR, and MOS gains.",
    stakeholders: {
      company: "Protected revenue and reputation through a reliably good service.",
      department: "Contact Center & Telephony leaders hit SLA and quality commitments.",
      team: "Supervisors manage to clear, attainable performance targets.",
      user: "Customers reach the right help fast; agents get the tools to resolve it.",
    },
  },
  5: {
    icon: "heart", accent: "var(--s5)", tagline: "How customers feel after every interaction",
    whyItMatters: "CSAT and repeat-contact rate capture the outcome that matters most: whether customers leave satisfied and resolved, or frustrated and likely to return.",
    affectsNow: "Low CSAT and high repeat contacts signal unresolved root causes — driving churn risk, re-work, and avoidable volume that inflates every downstream cost.",
    improving: "Acting on survey drivers and the top repeat-reasons lifts loyalty and removes whole categories of avoidable contacts, improving experience and efficiency at once.",
    howItHelps: "PacketFusion ties experience scores to the specific drivers and dispositions behind them, so you coach and fix the few things that move loyalty most.",
    roi: "Retention and lifetime-value protection, plus volume removed by eliminating repeat drivers.",
    stakeholders: {
      company: "Stronger loyalty, referrals, and lifetime value.",
      department: "CX leadership can prove the experience is improving, not just measured.",
      team: "Supervisors coach to real customer-voice drivers via Quality Management.",
      user: "Customers get resolved the first time and feel heard.",
    },
  },
  6: {
    icon: "gears", accent: "var(--s2)", tagline: "Do more with the capacity you already have",
    whyItMatters: "Operational efficiency — forecast accuracy, schedule adherence, occupancy, room and automation utilization — determines how much output you get from the headcount and assets you already pay for.",
    affectsNow: "Weak forecasting and adherence create over- and under-staffing, idle rooms, and burned-out or under-utilized agents — capacity paid for but not converted to service.",
    improving: "Tightening WFM and utilization smooths staffing to demand, reclaims idle rooms, and lifts automated hours saved — more service per dollar without adding headcount.",
    howItHelps: "PacketFusion highlights the efficiency gaps and the WFM, Rooms, and automation levers that close them, with concrete steps for each.",
    roi: "Capacity unlocked and hours saved — output growth without proportional cost growth.",
    stakeholders: {
      company: "Scales service capacity without scaling spend.",
      department: "Operations & Workplace leaders optimize staffing and real estate.",
      team: "Workforce planners forecast and schedule with precision.",
      user: "Agents get balanced schedules; employees find rooms that are actually free.",
    },
  },
  7: {
    icon: "coins", accent: "var(--s3)", tagline: "The unit economics of every interaction",
    whyItMatters: "Cost per interaction, cost per automated interaction, and cost avoided translate everything else into the language the business runs on: dollars per outcome.",
    affectsNow: "A high cost-to-serve with low automation means every contact is handled the most expensive way possible — a structural drag on margin that compounds with volume.",
    improving: "Shifting volume to automation and improving handle efficiency drives cost per interaction down and cost avoided up, freeing budget for growth or reinvestment.",
    howItHelps: "PacketFusion models your unit economics from live volume, deflection, and loaded-rate assumptions, so the savings case is grounded in your own numbers.",
    roi: "Hard, quantified cost avoidance you can take to finance and to the renewal.",
    stakeholders: {
      company: "Improved margin and a defensible cost-to-serve trajectory.",
      department: "Finance & CX leaders get a shared, data-backed savings model.",
      team: "Managers see which contact types are cheapest to automate.",
      user: "Routine requests resolve instantly; agents focus on high-value work.",
    },
  },
  8: {
    icon: "bot", accent: "var(--s4)", tagline: "How hard your AI is actually working",
    whyItMatters: "Containment, deflection, intent accuracy, and AI confidence measure whether your virtual agent and AI assist are genuinely deflecting work — or just adding a layer customers route around.",
    affectsNow: "Low containment and accuracy mean customers bounce out of automation to live agents anyway, so you pay for the bot and the agent for the same contact.",
    improving: "Expanding intents, grounding answers to your knowledge base, and tuning handoff lift containment and cut fallbacks — each contained interaction is an agent hour and a dollar avoided.",
    howItHelps: "PacketFusion pinpoints where automation leaks (fallbacks, low-confidence intents, unnecessary escalations) and prescribes the KB and flow changes that seal it.",
    roi: "Automation ROI: more contained interactions spread fixed automation cost and displace live-agent cost.",
    stakeholders: {
      company: "A compounding automation dividend as containment rises.",
      department: "CX & AI owners prove the virtual agent is earning its keep.",
      team: "Bot managers see exactly which intents and KBs to improve.",
      user: "Customers get accurate instant answers; agents inherit full context on handoff.",
    },
  },
  9: {
    icon: "trend", accent: "var(--s1)", tagline: "Where communications data meets revenue",
    whyItMatters: "Deal risk, AI-influenced revenue, conversation sentiment, and automation ROI connect your communications platform to the top line — the outcomes executives ultimately fund it for.",
    affectsNow: "Without CRM sync and conversation intelligence, at-risk deals go unseen, winning behaviors go uncoached, and the platform's revenue contribution stays invisible.",
    improving: "Connecting Revenue Accelerator to the CRM surfaces at-risk pipeline, scales coaching on what wins, and makes the platform's revenue influence measurable and growable.",
    howItHelps: "PacketFusion checks the revenue-intelligence wiring and coverage, and prescribes the CRM and coaching steps that turn conversations into pipeline insight.",
    roi: "Win-rate protection and revenue influence — the platform shifts from cost center to growth lever.",
    stakeholders: {
      company: "Communications spend tied directly to pipeline and revenue outcomes.",
      department: "Sales & RevOps leaders get deal-risk and coaching insight.",
      team: "Sales managers coach reps on data-backed winning behaviors.",
      user: "Reps get guidance and context that help them close.",
    },
  },
  10: {
    icon: "alert", accent: "var(--s5)", tagline: "See the risk before it becomes attrition",
    whyItMatters: "The adoption-risk index is a forward-looking signal — it combines license, feature, and active-use health into an early warning of where value (and renewal confidence) is slipping.",
    affectsNow: "A rising risk index means adoption is decaying beneath the surface; left unaddressed it becomes dormant seats, soft renewals, and lost ground at the next review.",
    improving: "Prioritizing adoption plays on the lowest-scoring layers reverses the decay early — far cheaper than recovering a stalled deployment after the renewal is at risk.",
    howItHelps: "PacketFusion computes the risk index from live adoption health and points your 30/60/90 plan at the specific layers dragging it down.",
    roi: "Renewal protection and churn avoidance by acting on leading indicators, not lagging ones.",
    stakeholders: {
      company: "Early warning that protects renewal and realized value.",
      department: "CX/IT leadership can intervene before adoption stalls.",
      team: "Managers get a prioritized, time-boxed adoption plan.",
      user: "Users are re-engaged before they drift away from the platform.",
    },
  },
};

// Stakeholder tiers for the value map.
export type StakeholderKey = keyof LayerNarrative["stakeholders"];
export const STAKEHOLDER_META: { key: StakeholderKey; icon: string; label: string; who: string; blurb: string }[] = [
  { key: "company", icon: "building", label: "Company", who: "Executive & business", blurb: "Strategic outcomes: cost, risk, revenue, and renewal confidence." },
  { key: "department", icon: "sitemap", label: "Department / Group", who: "IT · CX · Sales leadership", blurb: "Owns the platform and its service commitments." },
  { key: "team", icon: "team", label: "Team", who: "Supervisors & managers", blurb: "Runs the day-to-day and coaches to targets." },
  { key: "user", icon: "user", label: "End-user", who: "Agents · employees · customers", blurb: "Lives the experience every interaction." },
];

// Value-prop tiles. `metric(model)` returns {value,label} when the data exists, else null.
const money = (n: number) => "$" + Math.round(n).toLocaleString();
export const kpiVal = (model: Pick<ZoomReportModel, "kpiByKey">, key: string) => {
  const k = model.kpiByKey[key];
  return k && k.available && k.value != null ? k.value : null;
};

export type ValueProp = { key: string; icon: string; title: string; body: string; metric: (m: ZoomReportModel) => { value: string; label: string } | null };
export const VALUE_PROPS: ValueProp[] = [
  { key: "cost_avoided", icon: "coins", title: "Annualized cost avoided", body: "Live-agent cost displaced by automation and efficiency gains, modeled from your own volume and loaded rate.",
    metric: (m) => { const v = kpiVal(m, "cost_avoided"); return v ? { value: money(v), label: "per year, modeled" } : null; } },
  { key: "agent_hours_saved", icon: "clock", title: "Agent hours saved", body: "Hours returned to the business by deflecting and streamlining interactions.",
    metric: (m) => { const v = kpiVal(m, "agent_hours_saved"); return v ? { value: Math.round(v).toLocaleString() + " hrs", label: "in the assessed window" } : null; } },
  { key: "license", icon: "license", title: "License efficiency", body: "Reclaim or right-size idle seats so the renewal reflects real usage.",
    metric: (m) => { const v = kpiVal(m, "license_utilization"); return v != null ? { value: Math.round(v) + "%", label: "utilized · target 80%" } : null; } },
  { key: "cx", icon: "heart", title: "Customer experience", body: "A composite of SLA, resolution, CSAT, abandonment, and repeat contacts — the experience customers feel.",
    metric: (m) => { const ix = m.indices.find((x) => x.key === "cx_health"); return ix && ix.value != null ? { value: String(ix.value), label: "CX Health · target 80" } : null; } },
  { key: "automation", icon: "bot", title: "Automation effectiveness", body: "How much work your virtual agent genuinely contains versus passing to live agents.",
    metric: (m) => { const v = kpiVal(m, "containment"); return v != null ? { value: Math.round(v) + "%", label: "contained · target 60%" } : null; } },
  { key: "risk", icon: "shield", title: "Governance & risk", body: "Configuration aligned to Zoom's recommended security, compliance, and license-hygiene baseline.",
    metric: (m) => { const v = m.headline.configAlignment; return v != null ? { value: v + "%", label: "config aligned · target 90%" } : null; } },
];

// Adaptive executive summary (paragraphs).
export const gradeWord = (g: string) =>
  ({ A: "excellent", B: "strong", C: "solid but improvable", D: "at-risk", F: "critical", "N/A": "partial" } as Record<string, string>)[g] || "developing";

const scoredLayers = (m: ZoomReportModel) => m.scoreByLayer.filter((l): l is typeof l & { score: number } => l.score != null);

export function execSummary(model: ZoomReportModel): string[] {
  const h = model.headline, paras: string[] = [];
  const scored = scoredLayers(model);
  const strong = [...scored].sort((a, b) => b.score - a.score).slice(0, 2).map((l) => l.label);
  const weak = [...scored].sort((a, b) => a.score - b.score).slice(0, 2).map((l) => l.label);
  const cust = model.cover.customer;
  paras.push(
    `This report assesses **${cust}**'s Zoom environment across ${scored.length} measured optimization layers against industry-aligned targets. The tenant scores **${h.overall}/100 (grade ${h.grade})** — a ${gradeWord(h.grade)} posture. The assessment is built entirely from live platform data, so every finding is grounded in what the environment is actually doing today.`,
  );
  if (strong.length) paras.push(`**What's working:** ${cust} is strongest in ${strong.join(" and ")}. These are foundations to protect and build on.`);
  if (weak.length) paras.push(`**Where the opportunity is:** the largest gaps sit in ${weak.join(" and ")}. These are where focused effort returns the most — in both score and business value.`);
  if (h.potentialGain) paras.push(`Acting on the prioritized roadmap in this report can lift the overall score by up to **+${h.potentialGain} points${h.potentialOverall != null ? ` (to ${h.potentialOverall}/100)` : ""}**, while reducing cost-to-serve, tightening governance, and improving the experience your users and customers feel.`);
  else paras.push("The prioritized roadmap in this report sequences the highest-impact actions first, so the earliest effort returns the most score and business value.");
  return paras;
}

// "Why this matters": framing for the whole assessment (static).
export const WHY_THIS_MATTERS = {
  lede: "Optimization isn't a one-time project — it's the ongoing practice of making sure the platform you pay for keeps returning value as your business changes.",
  points: [
    { icon: "search", title: "Data you can trust", body: "Every score is computed from live Zoom telemetry across 11 layers — not opinion or a sales pitch. It reflects your environment as it actually runs." },
    { icon: "target", title: "Tied to outcomes", body: "Each layer maps to a business outcome: cost, risk, experience, efficiency, or revenue — so technical findings translate into language leadership acts on." },
    { icon: "flag", title: "Action, not just insight", body: "Findings come with the exact configuration steps and a point-weighted roadmap, so the path from 'what' to 'done' is explicit." },
    { icon: "trend", title: "A measurable trajectory", body: "Re-running the assessment turns optimization into a tracked trend line — proof of progress at every renewal conversation." },
  ],
};

export const NEXT_STEPS = [
  "Review the prioritized roadmap and confirm the top 3–5 actions with your PacketFusion team.",
  "Assign an owner and a 30/60/90 window to each committed action.",
  "Close the configuration gaps first — they are the fastest, lowest-cost score lifts.",
  "Re-run the assessment after implementation to quantify the lift and set the next target.",
];

// ============================================================ OUTCOMES (evidence-led, conversation-ready)

// Evidence basis: separates platform-stated fact from inference/estimate.
export function basisFromMode(mode: string | undefined): Basis {
  return mode === "api" ? "Confirmed" : mode === "derived" ? "Observed" : mode === "supplied" ? "Supplied" : "Modeled";
}
export const BASIS_NOTE: Record<Basis, string> = {
  Confirmed: "stated directly by the Zoom platform API",
  Observed: "derived from platform data — the cause is not yet established",
  Modeled: "modeled from supplied assumptions, not platform-measured",
  Supplied: "entered manually for this assessment",
};
export function basisForFinding(f: { kpi?: string; source?: string }, model: ZoomReportModel): Basis {
  if (/^config/i.test(f.kpi || "") || /config audit/i.test(f.source || "")) return "Confirmed";
  if (/derived|index/i.test(f.source || "")) return "Observed";
  const k = model.labelToKpi[(f.kpi || "").toLowerCase()];
  if (k) return basisFromMode(k.mode);
  if (/model|manual|supplied|export/i.test(f.source || "")) return "Modeled";
  return "Confirmed";
}

// Glossary: plain-language definitions, built from the KPIs actually present + standard terms.
const TERMS: Record<string, string> = {
  config_alignment: "Share of recommended security, compliance and governance settings that match Zoom best practice.",
  license_utilization: "Share of paid licenses actively used; the gap is reclaimable spend at renewal.",
  feature_adoption: "Breadth of licensed workloads (Phone, Rooms, CC, AI…) actually returning activity.",
  ai_companion_adoption: "Share of users actively using AI Companion (summaries, smart recording, compose).",
  active_user_rate: "Share of licensed users active in the period — the headline adoption signal.",
  sla: "Service level — share of contacts answered within the target time (voice-only headline).",
  asa: "Average speed of answer — how long callers wait before a person picks up.",
  abandon_rate: "Share of queued contacts that hang up before an agent answers.",
  aht: "Average handle time — mean length of a handled interaction.",
  fcr: "First-contact resolution — share resolved without the customer coming back.",
  mos: "Mean Opinion Score — a 1–5 voice-quality rating; above ~4 is good.",
  csat: "Customer satisfaction score from post-interaction surveys.",
  repeat_contact: "Share of customers who contact again about the same issue.",
  agent_hours_saved: "Agent hours returned to the business by deflecting/streamlining interactions.",
  forecast_accuracy: "How closely WFM volume forecasts matched actual demand.",
  schedule_adherence: "Share of time agents worked their published schedule.",
  room_utilization: "Share of available Zoom Room capacity actually used.",
  occupancy: "Share of logged-in agent time spent handling work vs. idle-ready.",
  cost_per_interaction: "Fully-loaded cost to handle one customer interaction.",
  cost_per_automated: "Cost to resolve one interaction through automation.",
  cost_avoided: "Live-agent cost displaced by automation and efficiency gains (modeled).",
  containment: "Share of contacts fully resolved by the virtual agent without a human.",
  deflection: "Share of demand kept out of the live queue by self-service/automation.",
  bot_escalation: "Share of bot sessions that hand off to a live agent.",
  intent_accuracy: "How often the virtual agent correctly understood the request.",
  fallback_rate: "Share of bot turns with no matching answer (no-match).",
  bot_aht: "Average length of a bot-handled session.",
  human_aht_escalated: "Handle time for interactions after they escalate from the bot.",
  ai_confidence: "The virtual agent's average confidence in its answers.",
  expert_assist: "Share of agents using AI Expert Assist (suggested answers/wrap-up).",
  deal_risk: "Share of pipeline flagged at risk by Revenue Accelerator.",
  ai_influenced_revenue: "Revenue on deals where AI conversation intelligence was used.",
  bot_roi: "Cost avoided by automation ÷ the cost of running it.",
  conv_sentiment: "Average customer/prospect sentiment across analyzed conversations.",
  conv_engagement: "How engaged conversations were (talk/listen, interactivity).",
  conversations_analyzed: "Count of conversations processed by conversation intelligence.",
  adoption_risk_index: "A forward-looking score of where adoption (and renewal value) is slipping.",
};
const STD_TERMS = [
  { term: "Confirmed / Observed", def: "Confirmed = stated directly by the platform. Observed = visible in the data, but the cause has not yet been established." },
  { term: "Modeled", def: "A figure estimated from supplied assumptions rather than measured by the platform." },
  { term: "Attainment", def: "How close a metric is to its target, expressed 0–100%." },
  { term: "RAG", def: "Red / Amber / Green severity rating of a finding." },
  { term: "Target", def: "The industry-aligned benchmark each KPI is measured against." },
  { term: "Optimization layer", def: "One of 11 themes (config, licensing, adoption, performance, experience, efficiency, cost, AI, revenue, risk) the platform is scored across." },
];
export function glossaryFor(model: ZoomReportModel) {
  const seen = new Set<string>(), out: { term: string; def: string }[] = [];
  for (const k of model.kpisAll) {
    const def = TERMS[k.key];
    if (def && !seen.has(k.key)) { seen.add(k.key); out.push({ term: k.label, def }); }
  }
  out.sort((a, b) => a.term.localeCompare(b.term));
  return [...STD_TERMS, ...out];
}

// Adaptive plain-language summary for the Outcomes review.
export function outcomesSummary(model: ZoomReportModel): string[] {
  const h = model.headline, cust = model.cover.customer, paras: string[] = [];
  const red = h.redFindings, amber = h.amberFindings;
  const adopt = kpiVal(model, "active_user_rate"), lic = kpiVal(model, "license_utilization");
  const scored = scoredLayers(model);
  const weak = [...scored].sort((a, b) => a.score - b.score)[0];
  paras.push(
    `${cust} is live on Zoom and the core service is doing its job. This review looks beyond "is it on?" to how much of the platform is actually being used, where the experience is slipping, and what to do about it — framed so we can work through it together on the call.`,
  );
  const bits: string[] = [];
  if (adopt != null) bits.push(`${adopt}% of licensed users were active`);
  if (lic != null) bits.push(`${Math.round(lic)}% of licenses are being used`);
  if (bits.length) paras.push(`The headline is adoption: ${bits.join(", ")}. Every idle licence and dormant workload is value you are paying for but not yet receiving.`);
  paras.push(
    `Overall the environment scores **${h.overall}/100 (grade ${h.grade})** across ${scored.length} measured layers, with **${red} critical** and **${amber} watch** findings${weak ? `. The weakest area is **${weak.label}**` : ""}. The recommendations at the end are ordered by impact, and each names the number we will re-measure next time so progress is visible.`,
  );
  return paras;
}

export const HOW_TO_READ = "How to read this report. Figures come from live Zoom platform data for the stated window. Findings marked **Confirmed** are stated by the platform; findings marked **Observed** are visible in the data but the cause has not yet been discussed with you. Figures marked **Modeled** are estimates from supplied assumptions. A short glossary is at the end.";

// Adoption snapshot: the lead story, with an interpretation callout.
export type AdoptionStat = { value: string; label: string; tone: "good" | "bad" | "mut"; target: number | null };
export function adoptionSnapshot(model: ZoomReportModel): { stats: AdoptionStat[]; tellsUs: string } | null {
  const stat = (key: string, label: string, higher = true): AdoptionStat | null => {
    const v = kpiVal(model, key); if (v == null) return null;
    const t = model.kpiByKey[key]?.target ?? null;
    const tone = t == null ? "mut" : (higher ? v >= t : v <= t) ? "good" : "bad";
    return { value: Math.round(v) + "%", label, tone, target: t };
  };
  const stats = [
    stat("active_user_rate", "Licensed users active"),
    stat("license_utilization", "Licenses utilized"),
    stat("feature_adoption", "Workloads in use"),
    stat("ai_companion_adoption", "AI Companion adoption"),
  ].filter((s): s is AdoptionStat => !!s);
  const au = kpiVal(model, "active_user_rate"), lu = kpiVal(model, "license_utilization");
  let tellsUs = "";
  if (au != null) {
    const inactive = Math.round(100 - au);
    tellsUs = `About ${inactive}% of licensed users were not active in this window. The platform is deployed, but for most people it has not yet become the way they work day to day` + (lu != null && lu < 80 ? `, and ${Math.round(100 - lu)}% of paid licenses are going unused.` : ".");
  }
  return stats.length ? { stats, tellsUs } : null;
}

// Open questions for the customer: from gaps, unassessed config and modeled figures, plus seeds.
const OQ_SEEDS = [
  "Which roles are meant to be inactive on the platform (shared mailboxes, admin or service accounts), so we can separate planned inactivity from adoption gaps?",
  "What is the primary collaboration tool your teams live in day to day, and should Zoom be embedded in it?",
  "Who owns user communication, enablement and training for the platform?",
];
export function openQuestions(model: ZoomReportModel): { q: string; tag: string }[] {
  const qs: { q: string; tag: string }[] = [];
  const na = model.configAll.filter((r) => r.state === "Not Assessed").slice(0, 4);
  for (const r of na) qs.push({ q: `Confirm the current state of **${r.setting}** (${r.product}).`, tag: "Config" });
  const modeled = model.kpisAll.filter((k) => k.mode === "manual" && k.available).slice(0, 2);
  for (const k of modeled) qs.push({ q: `Confirm the assumptions behind **${k.label}** — we modeled it rather than measuring it.`, tag: "Modeled" });
  const missing = model.gaps.filter((g) => g.mode !== "manual").slice(0, 3);
  for (const g of missing) qs.push({ q: `We saw no data for **${g.kpi}** — is that workload in use, or is it an opportunity to enable?`, tag: "Coverage" });
  for (const s of OQ_SEEDS) qs.push({ q: s, tag: "Discovery" });
  return qs.slice(0, 9);
}

// Data notes: provenance + honest caveats.
export function dataNotes(model: ZoomReportModel, fmt: (d: string | undefined) => string): string[] {
  const c = model.methodology.coverage, notes: string[] = [];
  notes.push(`Figures come directly from Zoom platform APIs for the window ${fmt(model.cover.window.from)} to ${fmt(model.cover.window.to)}${model.methodology.subrequests ? ` (${model.methodology.subrequests} API calls)` : ""}.`);
  if (c.total) notes.push(`Scores are computed from ${c.populated} of ${c.total} KPIs populated (${c.apiPopulated ?? "—"} measured via API; ${c.manual ?? 0} are modeled or supplied). Unpopulated KPIs reflect workloads with no activity in the window, or metrics that are export-only.`);
  notes.push("Contact Center and Meetings metrics sample the most recent ~30 days of a longer window (Zoom caps those analytics at one month); Virtual Agent scans back within the window to find bot activity.");
  notes.push("Figures marked Modeled are estimates from the supplied cost/volume assumptions, not platform-measured — confirm them before treating them as exact.");
  return notes;
}

// Next review / baseline commitment.
export const nextReviewNote = (model: ZoomReportModel) =>
  `This review is the baseline. We will re-run the same figures at the next optimization review and compare them against these numbers — the goal is to improve them each time. PacketFusion can run this on a recurring cadence so progress stays visible${model.cover.scheduled ? ", and it is already scheduled monthly for this account" : ""}.`;

// Headline interpretation triplet.
export function outcomesInterpretation(model: ZoomReportModel) {
  const h = model.headline;
  const top = model.roadmap.items[0];
  const weak = [...scoredLayers(model)].sort((a, b) => a.score - b.score)[0];
  return {
    tellsUs: `The environment scores ${h.overall}/100 with ${h.redFindings} critical and ${h.amberFindings} watch findings${weak ? `, weakest in ${weak.label}` : ""}.`,
    means: "Calling and core service work; the gaps are mostly about how the platform is adopted, routed and configured day to day — more than the technology itself.",
    think: top ? `Start with ${top.label}: ${top.reco || "address this first"} It is the highest-leverage move and we will measure it by its target.` : "Work the prioritized recommendations in order — the earliest effort returns the most.",
  };
}
