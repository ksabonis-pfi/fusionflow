import { meanDefined } from "../../engine/scoring";
import type { KpiDef } from "../../engine/types";

// Zoom KPI registry, layers, indices and config audit. Ported from the
// standalone Zoom Optimization agent (kpis.js, v3.2.0); content unchanged.
//
// The analytical spec — mirrors the Optimization Scorecard workbook 1:1.
// 11-layer KPI registry + composite indices + config-audit checklist.
//
// Each KPI: { layer, key, label, product, unit, dir, target, source, mode }
//   dir   : "higher" | "lower"  (higher_is_better / lower_is_better)
//   mode  : "api"     -> collected directly from a Zoom endpoint
//           "derived" -> computed from other collected values
//           "manual"  -> export-only or modeled; maps to a blue input cell

export const LAYERS: Record<number, string> = {
  0: "Deployment & Config Health",
  1: "License Utilization",
  2: "Feature Adoption",
  3: "Behavioral Usage",
  4: "Performance Metrics",
  5: "Experience Metrics",
  6: "Operational Efficiency",
  7: "Cost Efficiency",
  8: "AI Effectiveness",
  9: "Revenue Impact",
  10: "Predictive Risk",
};

export const KPIS: KpiDef[] = [
  { layer: 0, key: "config_alignment", label: "Config Alignment Score", product: "Platform", unit: "%", dir: "higher", target: 90, mode: "derived", source: "Config Audit" },

  { layer: 1, key: "license_utilization", label: "License Utilization", product: "Cross-product", unit: "%", dir: "higher", target: 80, mode: "derived", source: "Dashboard; Billing" },

  { layer: 2, key: "feature_adoption", label: "Feature Adoption Rate", product: "Cross-product", unit: "%", dir: "higher", target: 70, mode: "derived", source: "Dashboard; AI Companion" },
  { layer: 2, key: "ai_companion_adoption", label: "AI Companion Adoption", product: "AI Companion", unit: "%", dir: "higher", target: 60, mode: "manual", source: "AI Companion dashboard (export)" },

  { layer: 3, key: "active_user_rate", label: "Active User Rate", product: "Workplace", unit: "%", dir: "higher", target: 85, mode: "api", source: "Reports: Active Hosts" },

  { layer: 4, key: "sla", label: "Service Level (SLA)", product: "Contact Center", unit: "%", dir: "higher", target: 80, mode: "api", source: "ZCC Analytics" },
  { layer: 4, key: "asa", label: "Average Speed of Answer", product: "Contact Center", unit: "sec", dir: "lower", target: 30, mode: "api", source: "ZCC Analytics" },
  { layer: 4, key: "abandon_rate", label: "Abandonment Rate", product: "Contact Center", unit: "%", dir: "lower", target: 5, mode: "api", source: "ZCC Analytics" },
  { layer: 4, key: "aht", label: "Average Handle Time", product: "Contact Center", unit: "sec", dir: "lower", target: 300, mode: "api", source: "ZCC Analytics" },
  { layer: 4, key: "fcr", label: "First Contact Resolution", product: "Contact Center", unit: "%", dir: "higher", target: 80, mode: "api", source: "ZCC Analytics" },
  { layer: 4, key: "mos", label: "Voice Quality (MOS)", product: "Zoom Phone", unit: "score", dir: "higher", target: 4.2, mode: "api", source: "Phone QoS; QSS" },

  { layer: 5, key: "csat", label: "CSAT", product: "Contact Center", unit: "score", dir: "higher", target: 4.2, mode: "api", source: "ZCC Surveys" },
  { layer: 5, key: "repeat_contact", label: "Repeat Contact Rate", product: "Contact Center", unit: "%", dir: "lower", target: 15, mode: "api", source: "ZCC Analytics" },

  { layer: 6, key: "agent_hours_saved", label: "Agent Hours Saved", product: "Contact Center", unit: "count", dir: "higher", target: 0, mode: "derived", source: "ZVA + ZCC" },
  { layer: 6, key: "forecast_accuracy", label: "Forecast Accuracy", product: "WFM", unit: "%", dir: "higher", target: 90, mode: "api", source: "WFM" },
  { layer: 6, key: "schedule_adherence", label: "Schedule Adherence", product: "WFM", unit: "%", dir: "higher", target: 90, mode: "api", source: "WFM" },
  { layer: 6, key: "room_utilization", label: "Room Utilization", product: "Zoom Rooms", unit: "%", dir: "higher", target: 50, mode: "api", source: "Dashboard: Zoom Rooms" },
  { layer: 6, key: "occupancy", label: "Agent Occupancy", product: "Contact Center", unit: "%", dir: "higher", target: 85, mode: "api", source: "ZCC agent_timecard" },

  { layer: 7, key: "cost_per_interaction", label: "Cost per Interaction", product: "Contact Center", unit: "$", dir: "lower", target: 4, mode: "manual", source: "Model" },
  { layer: 7, key: "cost_per_automated", label: "Cost per Automated Interaction", product: "Virtual Agent", unit: "$", dir: "lower", target: 1, mode: "manual", source: "Model" },
  { layer: 7, key: "cost_avoided", label: "Cost Avoided", product: "Cross-product", unit: "$", dir: "higher", target: 0, mode: "derived", source: "Model" },

  { layer: 8, key: "containment", label: "Containment Rate", product: "Virtual Agent", unit: "%", dir: "higher", target: 60, mode: "api", source: "ZVA Analytics" },
  { layer: 8, key: "deflection", label: "Automation Deflection Rate", product: "Virtual Agent", unit: "%", dir: "higher", target: 60, mode: "api", source: "ZVA Analytics" },
  { layer: 8, key: "bot_escalation", label: "Bot Escalation Rate", product: "Virtual Agent", unit: "%", dir: "lower", target: 40, mode: "api", source: "ZVA Analytics" },
  { layer: 8, key: "intent_accuracy", label: "Intent Accuracy", product: "Virtual Agent", unit: "%", dir: "higher", target: 85, mode: "api", source: "ZVA Analytics" },
  { layer: 8, key: "fallback_rate", label: "Fallback Rate", product: "Virtual Agent", unit: "%", dir: "lower", target: 15, mode: "api", source: "ZVA Analytics" },
  { layer: 8, key: "bot_aht", label: "Bot AHT (bAHT)", product: "Virtual Agent", unit: "sec", dir: "lower", target: 90, mode: "api", source: "ZVA Analytics" },
  { layer: 8, key: "human_aht_escalated", label: "Human AHT After Escalation", product: "Contact Center", unit: "sec", dir: "lower", target: 300, mode: "api", source: "ZCC Analytics" },
  { layer: 8, key: "ai_confidence", label: "AI Confidence Score", product: "Virtual Agent", unit: "score", dir: "higher", target: 0.75, mode: "api", source: "ZVA Analytics" },
  { layer: 8, key: "expert_assist", label: "Expert Assist Adoption", product: "Contact Center", unit: "%", dir: "higher", target: 70, mode: "api", source: "ZCC AI" },

  { layer: 9, key: "deal_risk", label: "Deal Risk Rate", product: "Revenue Accelerator", unit: "%", dir: "lower", target: 20, mode: "api", source: "ZRA" },
  { layer: 9, key: "ai_influenced_revenue", label: "AI-Influenced Revenue", product: "Revenue Accelerator", unit: "$", dir: "higher", target: 0, mode: "api", source: "ZRA + CRM" },
  { layer: 9, key: "bot_roi", label: "Bot ROI", product: "Virtual Agent", unit: "%", dir: "higher", target: 100, mode: "derived", source: "Model" },
  { layer: 9, key: "conv_sentiment", label: "Conversation Sentiment", product: "Revenue Accelerator", unit: "score", dir: "higher", target: 70, mode: "api", source: "ZRA conversations" },
  { layer: 9, key: "conv_engagement", label: "Conversation Engagement", product: "Revenue Accelerator", unit: "score", dir: "higher", target: 70, mode: "api", source: "ZRA conversations" },
  { layer: 9, key: "conversations_analyzed", label: "Conversations Analyzed", product: "Revenue Accelerator", unit: "count", dir: "higher", target: 0, mode: "api", source: "ZRA conversations" },

  { layer: 10, key: "adoption_risk_index", label: "Adoption Risk Index", product: "Cross-product", unit: "score", dir: "lower", target: 30, mode: "derived", source: "Derived" },
];

// Composite indices (Executive Summary tab) — transparent, formula-driven.
export type IndexDef = { key: string; label: string; target: number; note: string; compute: (m: Record<string, number | null>) => number | null };

export const INDICES: IndexDef[] = [
  {
    key: "cx_health", label: "CX Health Index", target: 80,
    note: "Mean of SLA, FCR, CSAT×20, 100-Abandonment, 100-Repeat",
    compute: (m) => meanDefined([m.sla, m.fcr, sx(m.csat, 20), inv(m.abandon_rate), inv(m.repeat_contact)]),
  },
  {
    key: "automation_maturity", label: "Automation Maturity Index", target: 80,
    note: "Mean of Containment, Intent Accuracy, 100-Fallback, AI Confidence×100",
    compute: (m) => meanDefined([m.containment, m.intent_accuracy, inv(m.fallback_rate), sx(m.ai_confidence, 100)]),
  },
];

// Config / Deployment audit (Layer 0). recommended = target state.
// detect: key into the normalized settings object the collector builds, or null (manual).
// key: stable id for inline overrides; steps: concrete Zoom configuration steps.
export type ConfigAuditDef = {
  key: string; product: string; setting: string; recommended: string;
  /** Key into the settings map the collectors build, or null for manually assessed rows. */
  detect: string | null;
  impact: string; remediation: string; steps: string[];
};

export const CONFIG_AUDIT: ConfigAuditDef[] = [
  { key: "sso", product: "Platform", setting: "SSO / SAML enforced", recommended: "Enforced", detect: "sso_enforced", impact: "Access security", remediation: "Enforce SSO; reclaim non-SSO logins",
    steps: ["Admin Portal → Advanced → Single Sign-On: configure your IdP (Okta/Entra/Ping) and verify the SAML response maps email + name.", "Admin → Account Management → Security: set ‘Sign-in methods’ to require SSO and disable email/password sign-in.", "Use Associated Domains so all corporate-domain users are forced through SSO."] },
  { key: "scim", product: "Platform", setting: "SCIM auto-deprovisioning", recommended: "Enabled", detect: "scim_enabled", impact: "License hygiene", remediation: "Enable SCIM; reclaim idle licenses",
    steps: ["Marketplace → build/enable the SCIM app, or configure SCIM from your IdP (Okta/Entra) ‘Provisioning’ tab.", "Map create/update/deactivate so leavers are auto-deprovisioned (frees licenses).", "Run an initial sync and confirm deactivated users lose their license."] },
  { key: "retention", product: "Platform", setting: "Data retention & Vault policy", recommended: "Configured", detect: "retention_configured", impact: "Compliance", remediation: "Set retention/Vault policy",
    steps: ["Admin → Account Management → Recording Management / Compliance: set cloud-recording retention (auto-delete after N days).", "If using Zoom Compliance Manager / Vault, configure archiving + legal-hold per policy."] },
  { key: "rbac", product: "Platform", setting: "Role-based access (least privilege)", recommended: "Configured", detect: null, impact: "Governance", remediation: "Review admin roles",
    steps: ["Admin → User Management → Roles: review each role’s privileges; remove broad admin where not needed.", "Create scoped roles (Phone admin, CC supervisor) and reassign users to least-privilege roles.", "Audit role membership quarterly via the Operation/Sign-in audit logs."] },
  { key: "ai_meeting_summary", product: "Meetings", setting: "AI Companion summary", recommended: "Enabled", detect: "ai_companion_meetings", impact: "Productivity", remediation: "Enable org-wide; train users",
    steps: ["Admin → AI Companion → Meeting: turn on Meeting Summary (and Smart Recording) at account level.", "Lock the setting on so groups inherit it; allow auto-start summaries.", "Announce + train hosts; track adoption in AI Companion dashboard."] },
  { key: "meeting_security", product: "Meetings", setting: "Security defaults (waiting room/passcode)", recommended: "Enforced", detect: "meeting_security_defaults", impact: "Risk reduction", remediation: "Enforce security defaults",
    steps: ["Admin → Account Settings → Security: enable Waiting Room and require passcode for meetings/PMI/phone.", "Lock both settings so users can’t disable them.", "Set default ‘only authenticated users can join’ for internal meetings."] },
  { key: "cloud_recording", product: "Meetings", setting: "Cloud recording + retention", recommended: "Configured", detect: "recording_retention", impact: "Knowledge retention", remediation: "Set auto-record + retention",
    steps: ["Admin → Recording: enable Cloud Recording; optionally auto-record meetings.", "Set retention auto-delete window and access controls; enable recording transcripts."] },
  { key: "phone_qss", product: "Zoom Phone", setting: "QoS monitoring (QSS)", recommended: "Enabled", detect: null, impact: "Quality assurance", remediation: "Enable QSS; baseline MOS",
    steps: ["Build a Server-to-Server app and subscribe to the Quality of Service Subscription (QSS) / Phone QoS webhooks, or enable Phone Power Pack quality dashboards.", "Baseline MOS/jitter/latency per site in Admin → Dashboard → Zoom Phone → Quality."] },
  { key: "phone_rightsize", product: "Zoom Phone", setting: "License right-sizing (quarterly)", recommended: "Reviewed quarterly", detect: null, impact: "Cost", remediation: "Run utilization review",
    steps: ["Admin → Dashboard → Zoom Phone: review per-user call volume; identify zero-use licenses.", "Downgrade Unlimited→Metered (or reclaim) for low-usage users each quarter.", "Release unassigned/idle DIDs in Phone System Management → Numbers."] },
  { key: "vm_transcription", product: "Zoom Phone", setting: "Voicemail transcription", recommended: "Enabled", detect: "vm_transcription", impact: "Response time", remediation: "Enable VM transcription",
    steps: ["Admin → Phone System Management → Company Info / Policy: enable Voicemail Transcription.", "Optionally enable voicemail-to-email with transcript."] },
  { key: "phone_recording", product: "Zoom Phone", setting: "Call recording + retention", recommended: "Configured", detect: "phone_recording", impact: "Compliance", remediation: "Set call recording policy",
    steps: ["Admin → Phone → Policy: set automatic call recording for in-scope sites/queues; configure recording disclaimer.", "Set recording retention + access; confirm consent/announcement compliance."] },
  { key: "cc_survey", product: "Contact Center", setting: "Post-interaction survey (CSAT)", recommended: "Enabled all queues", detect: null, impact: "Experience", remediation: "Enable survey on all channels",
    steps: ["Contact Center → Preferences/Flows: add a post-interaction survey widget to each voice/chat flow.", "Define the CSAT question + scale; attach to every queue/channel.", "Verify responses appear in CC Analytics → Surveys."] },
  { key: "cc_auto_qa", product: "Contact Center", setting: "AI auto-QA (Quality Management)", recommended: "Enabled", detect: null, impact: "Quality coverage", remediation: "Enable auto-QA (100% coverage)",
    steps: ["Contact Center → Quality Management: create evaluation forms and enable AI Auto-QA / auto-scoring.", "Map the rubric to dispositions; set auto-evaluation to 100% of interactions.", "Calibrate scores with supervisors, then review QM dashboard."] },
  { key: "cc_screen_pop", product: "Contact Center", setting: "Screen pop (CRM)", recommended: "Configured", detect: null, impact: "Agent efficiency", remediation: "Configure CRM screen pop",
    steps: ["Contact Center → Integrations: connect Salesforce/HubSpot/Dynamics.", "In the flow, add a screen-pop/CRM action keyed on ANI/email so agents get the record on answer."] },
  { key: "zva_genai", product: "Virtual Agent", setting: "Generative answers (KB-grounded)", recommended: "Enabled", detect: null, impact: "Self-service breadth", remediation: "Enable; ground to KB",
    steps: ["Zoom Virtual Agent → Knowledge Base: connect/sync your KB (URLs, articles, custom API KB).", "Enable Generative AI answers grounded to that KB; set confidence threshold.", "Test intents and publish the bot to voice/chat channels."] },
  { key: "zva_handoff", product: "Virtual Agent", setting: "Escalation handoff context", recommended: "Pass transcript+intent", detect: null, impact: "Seamless handoff", remediation: "Configure full-context handoff",
    steps: ["ZVA flow → Escalation/Transfer node: enable passing transcript + detected intent + variables to ZCC.", "In ZCC, surface the context on the agent desktop so there’s no repeat."] },
  { key: "wfm_forecast", product: "WFM", setting: "Forecast model configured", recommended: "Configured", detect: null, impact: "Staffing precision", remediation: "Stand up forecasting",
    steps: ["Contact Center → Workforce Management → Forecasts: create a forecast for each scheduling group from historical volume.", "Select the model + horizon; generate and review forecast accuracy."] },
  { key: "wfm_adherence", product: "WFM", setting: "Adherence tracking", recommended: "Enabled", detect: null, impact: "Staffing efficiency", remediation: "Enable adherence tracking",
    steps: ["WFM → Scheduling: publish agent schedules and define activities.", "Enable real-time adherence; review the adherence report and intraday alerts."] },
  { key: "zra_crm", product: "Revenue Accelerator", setting: "CRM sync (Revenue Accelerator)", recommended: "Connected", detect: "zra_connected", impact: "Revenue insight", remediation: "Connect your CRM (Salesforce / Microsoft Dynamics / HubSpot)",
    steps: ["Revenue Accelerator → Settings → CRM/Integrations: connect your CRM — Salesforce, Microsoft Dynamics, or HubSpot.", "Map opportunities/stages and enable conversation→deal association so deal-risk and AI-influenced revenue populate.", "Set the customer's CRM on the Add/Edit Customer form so the readout names the right system."] },
  { key: "ai_org_policy", product: "AI Companion", setting: "Org enablement policy", recommended: "Enabled", detect: "ai_companion_meetings", impact: "Productivity platform", remediation: "Enable per policy; drive adoption",
    steps: ["Admin → AI Companion: enable across Meetings/Team Chat/Phone/Mail per your data policy; lock where required.", "Roll out enablement comms + training; monitor adoption in the AI Companion dashboard."] },
];

// Dropdown choices when assessing a config-audit row inline.
export const AUDIT_OPTIONS: string[] = ["Enabled", "Enforced", "Configured", "Connected", "Reviewed quarterly", "Pass transcript+intent", "Partial", "Disabled", "Not configured", "Not enforced", "Not connected"];

// Concrete Zoom configuration steps per KPI (shown under each finding/recommendation).
export const KPI_STEPS: Record<string, string[]> = {
  license_utilization: ["Admin → Dashboard → Reports → Active Hosts: identify users with no activity in 30–90 days.", "Reassign/downgrade dormant Licensed users to Basic; reclaim never-logged-in seats at renewal."],
  feature_adoption: ["Admin → Dashboard: compare licensed vs. used features per workload.", "Run a targeted enablement campaign on the lowest-used licensed features."],
  ai_companion_adoption: ["Admin → AI Companion: enable Meeting Summary, Smart Recording, Team Chat & Mail compose org-wide.", "Train users; track ‘active AI Companion users’ in the AI Companion dashboard."],
  active_user_rate: ["Admin → Dashboard → Reports → Active Hosts: list inactive licensed users.", "Drive enablement for dormant cohorts; reclaim persistently inactive licenses."],
  sla: ["Contact Center → Queues: set the service-level target (e.g., 80/30) per queue.", "WFM: align staffing to forecast; add overflow/secondary skills and callback-in-queue for peaks."],
  asa: ["Reduce queue wait: add skilled agents at peak intervals; enable overflow routing.", "Offer callback-in-queue so callers don’t wait on hold."],
  abandon_rate: ["Contact Center → Flows: enable callback-in-queue and position/wait-time announcements.", "WFM: increase peak staffing; review IVR length to cut early abandons."],
  aht: ["Reduce handle time: enable AI Expert Assist + knowledge surfacing; trim flow/IVR steps.", "Coach long-AHT agents via Quality Management; reduce hold/transfers."],
  fcr: ["Build a clean disposition taxonomy; require disposition on every interaction.", "Add knowledge base + Expert Assist so agents resolve on first contact; track repeat contacts."],
  mos: ["Enable QSS/QoS monitoring; baseline MOS per site in Admin → Dashboard → Zoom Phone → Quality.", "Fix network QoS (DSCP/SD-WAN, jitter buffers) at the worst sites; prefer wired/headsets."],
  csat: ["Contact Center → Flows: add a post-interaction CSAT survey to every channel.", "Act on low-CSAT drivers; coach via QM and close the loop with customers."],
  repeat_contact: ["Analyze dispositions for top repeat-drivers; fix root causes (KB gaps, process).", "Improve FCR to reduce repeats; add proactive follow-up."],
  forecast_accuracy: ["WFM → Forecasts: build per-group forecasts from history; pick the right model + horizon.", "Review forecast-vs-actual weekly and retune."],
  schedule_adherence: ["WFM → Scheduling: publish schedules + activities; enable real-time adherence.", "Use intraday alerts; coach low-adherence agents."],
  room_utilization: ["Admin → Dashboard → Zoom Rooms: identify chronically idle rooms.", "Enable check-in/auto-release to reclaim ghost meetings; consolidate under-used rooms."],
  occupancy: ["WFM: balance staffing to keep occupancy ~85% (avoid burnout >90%).", "Smooth schedules across intervals; reduce idle ‘Ready’ time with blended channels."],
  cost_per_interaction: ["Shift volume to self-service/automation to lower cost-to-serve.", "Improve AHT/FCR; right-size staffing to demand."],
  cost_per_automated: ["Raise bot containment so the fixed automation cost spreads over more contained interactions.", "Expand intents/KB for the highest-volume contact reasons."],
  containment: ["Zoom Virtual Agent: expand intents + sync KB; enable generative answers grounded to KB.", "Add the bot to the top entry points (web/app/voice IVR); review fallbacks weekly."],
  deflection: ["Promote self-service entry points (web widget, IVR ‘ask the assistant’).", "Broaden bot coverage for common reasons to deflect from live agents."],
  bot_escalation: ["Improve intent coverage + KB grounding so fewer sessions escalate.", "Review escalation transcripts; add intents for the top no-match reasons."],
  intent_accuracy: ["ZVA → Intents: add training phrases; merge overlapping intents; review misclassifications.", "Retrain and re-test; monitor accuracy in ZVA analytics."],
  fallback_rate: ["ZVA: add intents/KB articles for the top fallback/no-match queries.", "Tune confidence threshold; enable generative answers to cut fallbacks."],
  bot_aht: ["Streamline bot flows (fewer steps/prompts); cache answers; speed KB lookups.", "Remove dead-ends and loops identified in ZVA analytics."],
  ai_confidence: ["Improve KB grounding + training data quality; remove stale articles.", "Raise/tune the confidence threshold and re-evaluate."],
  expert_assist: ["Contact Center → AI: enable AI Expert Assist for queues/agents.", "Train agents to use suggested answers/articles; track adoption in CC AI dashboards."],
  deal_risk: ["Revenue Accelerator: connect CRM; enable deal/pipeline insights.", "Action at-risk deals flagged by ZRA; coach reps on risk signals."],
  ai_influenced_revenue: ["ZRA: enable revenue attribution + CRM sync so AI-assisted deal value is tracked.", "Expand conversation-intelligence coverage across the sales team."],
  bot_roi: ["Scale automation against the highest-volume contact reasons to grow cost avoided vs. automation cost.", "Track contained interactions × loaded agent rate."],
  conv_sentiment: ["Revenue Accelerator: review low-sentiment conversations; coach on talk-to-listen + discovery.", "Use scorecards to reinforce positive behaviors."],
  conv_engagement: ["ZRA: enable coaching scorecards; review engagement drivers per rep.", "Share top-performer call snippets in enablement."],
  adoption_risk_index: ["Prioritize adoption plays on the lowest-scoring layers (license, feature, active use).", "Assign a champion + 30/60/90 enablement plan."],
};

// ---- helpers used by indices ----
function inv(v: number | null | undefined) { return v == null ? undefined : 100 - v; }
function sx(v: number | null | undefined, k: number) { return v == null ? undefined : v * k; }
