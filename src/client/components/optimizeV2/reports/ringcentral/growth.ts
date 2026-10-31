// RingCentral Growth & Enablement plan model. Ported from the standalone
// RingCentral agent's growth.js (buildGrowthModel): the same assessment data,
// read for what to do next rather than for a grade. Inventory / RingCX /
// RingSense signals the original read from the native snapshot come from the
// run's slim `reportData`.
import type { ConfigAuditRow, Improvement, ScoredKpi } from "../../../../lib/optimizeV2Api";
import { opp, pickTopWins, totalOf } from "../growthKit";
import type { GrowthModel, Opportunity, ReportResult, ReportRun, RingCentralReportData } from "../types";
import { GALLERY, ecosystemOf, growthSummary, type RcSignals } from "./growthContent";

export function buildRcGrowthModel(r: ReportResult, run: ReportRun): GrowthModel & { signals: RcSignals; thinWindow: boolean } {
  const sc = r.scorecard, meta = r.meta;
  const data: Partial<RingCentralReportData> = r.reportData?.platform === "ringcentral" ? r.reportData : {};
  const idx: Record<string, ScoredKpi> = Object.fromEntries(sc.layers.flatMap((l) => l.kpis).map((k) => [k.key, k]));
  const val = (key: string) => (idx[key]?.available ? idx[key].value : null);
  const audit = sc.configAudit.rows;

  // The API can't name the collaboration suite, so infer from what the audit and
  // inventory did see, and label the result Observed.
  const crmName = "";
  const ssoRow = audit.find((a) => a.key === "sso_enforced") ?? audit.find((a) => a.key === "sso");
  const ecosystem = ecosystemOf(crmName);
  const signals: RcSignals = {
    ringex: (val("total_calls") || 0) > 0 || (data.extensions ?? 0) > 0,
    ringcx: !!(data.ringcxReachable && data.ringcxDrilled),
    ringsense: (val("ace_recordings_analyzed") || 0) > 0,
    recording: (val("recorded_call_pct") || 0) > 0 || (data.aceRecordedCalls || 0) > 0,
    video: (val("meetings_held") || 0) > 0,
    sms: (val("sms_volume") || 0) > 0,
    rooms: !!data.hasRoomDevices,
    hardPhones: (data.hardPhones || 0) > 0,
    offlinePct: val("presence_offline_pct"),
    dndBlocking: val("dnd_blocking_calls") || 0,
    faxNumbers: val("fax_numbers") || 0,
    ssoEnforced: ssoRow?.state === "Aligned",
    crmName, ecosystem: ecosystem.key,
  };
  const thinWindow = !!data.sampleVolume;

  const lic = licensingOpps(val);
  const categories: Record<string, Opportunity[]> = {
    untapped: untappedOpps(idx, signals, data),
    licensing: lic.opps,
    workflow: workflowOpps(audit),
    // CX takes the KPI-derived improvements only, minus anything licensing already
    // claimed, so the same extension or agent problem isn't pitched twice.
    cx: cxOpps(sc.improvements, lic.claims),
    marketplace: galleryOpps(signals),
  };
  const customer = run.customer_name || "Customer";
  return {
    cover: { customer, accountId: meta.accountId == null ? "—" : String(meta.accountId), window: meta.window || {}, generatedAt: meta.generatedAt || new Date().toISOString() },
    ecosystem, signals, thinWindow, categories,
    topWins: pickTopWins(categories),
    summary: growthSummary(customer, categories.untapped.length, lic.reclaim, thinWindow),
    total: totalOf(categories),
  };

  function galleryOpps(s: RcSignals) {
    const out: Opportunity[] = [];
    for (const p of GALLERY) {
      if (!p.when(s)) continue;
      // An unknown ecosystem shows both suites rather than silently picking one.
      if (p.ecosystem && ecosystem.key !== "unknown" && p.ecosystem !== ecosystem.key) continue;
      const why = typeof p.why === "function" ? p.why(s) : p.why;
      out.push(opp("marketplace", p.icon, p.title, why, p.benefit, "Department · End-user", "Med", "Med", "Observed", null, p.steps, `gallery:${p.key}`));
    }
    return out.slice(0, 7);
  }
}

// ---- capability you own but is dark -------------------------------------
function untappedOpps(idx: Record<string, ScoredKpi>, s: RcSignals, data: Partial<RingCentralReportData>) {
  const out: Opportunity[] = [];
  if (!s.ringcx) out.push(opp("untapped", "bot", "Stand up RingCX for the contact-centre queues",
    "No RingCX activity is reachable for this account — contacts that need routing, skills and reporting are being handled on plain call queues.",
    "Skills-based routing, dispositions and agent reporting turn a phone queue into something you can actually manage and improve.",
    "Company · CX", "High", "High", "Observed", null,
    ["Confirm RingCX entitlement and which queues belong in it.", "Map the current call queues to gates and gate groups.", "Pilot one queue end to end before migrating the rest."]));

  if (s.ringcx && !s.recording) out.push(opp("untapped", "spark", "Turn on call recording for the teams that need it",
    "Nothing was recorded in the window, so quality review, coaching and dispute defence have no evidence base at all.",
    "Recording sets the ceiling on everything downstream — RingSense, QA and any coaching programme can only ever cover what was captured.",
    "Department · CX", "High", "Low", "Confirmed", null,
    ["Confirm the consent and retention position with legal before enabling.", "Admin → Call Recording: set automatic recording for the groups in scope.", "Re-check coverage after two weeks."]));

  if (s.recording && !s.ringsense) out.push(opp("untapped", "spark", "Apply RingSense to the calls you already record",
    "Calls are being recorded but no AI insights are coming back — the recordings are an archive rather than an asset.",
    "Transcription, summaries and theme analysis across recorded calls, so supervisors coach from the conversation instead of from a sample they happened to hear.",
    "Department", "High", "Low", "Observed", null,
    [data.aceNote || "Confirm RingSense (AI Conversation Expert) licences are assigned.", "Enable 'Access Insights' on the roles that need it.", "Review the first month's themes and choose one coaching focus."]));

  if (!s.video) out.push(opp("untapped", "layers", "Consolidate meetings onto RingCentral Video",
    "No RingCentral Video meetings ran in the window. If meetings are happening on another platform, that is duplicate spend with an owner on both sides.",
    "Running meetings on the platform you already pay for removes a parallel subscription and gives one place for recordings and retention.",
    "Company · IT", "Med", "Med", "Observed", null,
    ["Confirm whether another meeting platform is in use and what it costs.", "Pilot with one department, including room systems.", "Set a switch-over date and retire the parallel licence at renewal."]));

  if (!s.sms) out.push(opp("untapped", "spark", "Open SMS as a contact channel",
    "No business SMS traffic is showing. Routine contacts that currently take a call are cheaper and faster as a message.",
    "A lower-cost channel for confirmations, reminders and status updates — the benefit usually shows up as reduced inbound call volume rather than as an SMS number.",
    "Department", "Med", "Med", "Observed", null,
    ["Start A2P 10DLC brand and campaign registration early — it is carrier-controlled and gates go-live.", "Enable messaging on the numbers that need it.", "Pilot one high-volume, low-complexity contact reason."]));

  // App adoption, read from presence rather than a usage report: if someone is
  // never signed in, nothing else in the platform reaches them.
  if (s.offlinePct != null && s.offlinePct >= 25) out.push(opp("untapped", "user", "Get the never-signed-in users onto the apps",
    `${Math.round(s.offlinePct)}% of extensions were offline when the assessment ran — those people are not reachable on any RingCentral app.`,
    "Presence, softphone routing, mobility and chat all depend on being signed in. Until that is fixed, every other adoption number understates what the platform could do, and some of those seats are licence waste rather than a training problem.",
    "Company · IT", "High", "Low", "Confirmed", { count: `${Math.round(s.offlinePct)}%`, label: "offline at sample" },
    ["Export the offline list and compare it against recent call activity.",
      "Separate genuinely unused seats (a licence finding) from users who never sign in (a training finding).",
      "Push the desktop and mobile apps through MDM so signing in is the default rather than a choice."]));

  if (s.dndBlocking > 0) out.push(opp("untapped", "alert", "Check the extensions sitting in call-refusing DND",
    `${s.dndBlocking} extension${s.dndBlocking === 1 ? " is" : "s are"} set to refuse all calls or all department calls.`,
    "A queue member in this state counts as staffing but receives nothing. The queue configuration looks correct and the calls still go unanswered, which is why this is invisible without checking presence directly.",
    "CX · IT", "High", "Low", "Confirmed", { count: s.dndBlocking, label: "refusing calls" },
    ["Cross-reference the DND list against call queue membership.",
      "For queue members, confirm whether the state is deliberate or simply left on.",
      "Where it is routine, the queue is short-staffed — fix the roster rather than the symptom."]));

  if (s.faxNumbers > 0) out.push(opp("untapped", "trend", "Retire the remaining fax lines",
    `${s.faxNumbers} dedicated fax number${s.faxNumbers === 1 ? " is" : "s are"} still provisioned.`,
    "Each one is a recurring cost attached to a workflow nobody has revisited. Usually a single counterparty is keeping it alive, and they can move to secure email or a portal.",
    "IT · Department", "Low", "Low", "Confirmed", { count: s.faxNumbers, label: s.faxNumbers === 1 ? "fax number" : "fax numbers" },
    ["Pull fax volume per number for the last quarter.",
      "Release numbers with no traffic at the next billing cycle.",
      "For numbers with traffic, identify the counterparty and agree an alternative."]));

  const containment = idx.ringcx_ivr_containment;
  if (s.ringcx && containment && !containment.available) out.push(opp("untapped", "bot", "Measure and then raise IVR containment",
    data.kpiBlockedBy?.ringcx_ivr_containment || "Containment is not being measured, so self-service is running without a feedback loop.",
    "Every contained contact avoids an agent-handled minute. Without the measurement there is no way to tell whether a self-service change helped or hurt.",
    "CX", "Med", "Med", "Observed", null,
    ["Re-check during operating hours — realTimeData is same-day and reports nothing outside them.", "For window-length history, enable WEM Access.", "Once measured, pick the highest-volume contact reason and design a containment path for it."]));
  return out;
}

// ---- spend you can reclaim ----------------------------------------------
function licensingOpps(val: (key: string) => number | null) {
  const out: Opportunity[] = [];
  const notActivated = val("ext_not_activated") || 0;
  const disabled = val("ext_disabled") || 0;
  const util = val("license_utilization");
  const inactiveAgents = val("ringcx_inactive_agents") || 0;
  const seats = notActivated + disabled;

  if (seats) out.push(opp("licensing", "license", "Reclaim never-activated and disabled extensions",
    `${notActivated} extension${notActivated === 1 ? " has" : "s have"} never been activated and ${disabled} ${disabled === 1 ? "is" : "are"} disabled${util != null ? ` — licence utilisation is ${Math.round(util)}%` : ""}.`,
    "Seats that have never been used, or belong to leavers, are recurring spend with nothing behind it. Reclaiming them is the most defensible saving in the programme, because both sides of it are counted rather than estimated.",
    "Company · IT", "High", "Low", "Confirmed", { count: seats, label: seats === 1 ? "reclaimable seat" : "reclaimable seats" },
    ["Admin → Users: filter for Not Activated and Disabled.", "Activate, reassign or release each one; confirm none are reserved for a known start date.", "Add SCIM provisioning so leavers release their seat automatically from now on."]));

  if (inactiveAgents) out.push(opp("licensing", "license", "Reclaim inactive RingCX agent seats",
    `${inactiveAgents} RingCX agent${inactiveAgents === 1 ? "" : "s"} ${inactiveAgents === 1 ? "is" : "are"} inactive or have never logged in while still holding a seat.`,
    "Contact-centre seats are the most expensive per-user licence in the stack, so an unused one costs more than an unused RingEX seat.",
    "CX · IT", "High", "Low", "Confirmed", { count: inactiveAgents, label: inactiveAgents === 1 ? "contact-centre seat" : "contact-centre seats" },
    ["RingCX Admin → Agents: list inactive and never-logged-in agents.", "Confirm with the supervisor, then deactivate and release.", "Review at each renewal."]));

  const notRcManaged = val("ringcx_agents_not_rc_managed") || 0;
  if (notRcManaged) out.push(opp("licensing", "gears", "Bring RingCX agent identity under RingEX",
    `${notRcManaged} RingCX agent${notRcManaged === 1 ? " is" : "s are"} not managed by RingEX identity.`,
    "Where contact-centre identity sits outside the directory, every joiner, mover and leaver is two pieces of work and offboarding has two places to fail — which is also how inactive seats accumulate.",
    "IT", "Med", "Med", "Confirmed", null,
    ["RingCX Admin → Agents: identify agents without a linked RingEX user.", "Link them, or recreate them as RingEX-managed.", "Fold the contact centre into the same joiner-mover-leaver process."]));

  const dialGroups = val("ringcx_dialgroups_no_campaign") || 0;
  if (dialGroups) out.push(opp("licensing", "trend", "Put the idle outbound dial groups to work",
    `${dialGroups} dial group${dialGroups === 1 ? " has" : "s have"} no campaign attached.`,
    "Outbound capacity that is configured but not dialling is capacity already paid for and producing nothing.",
    "CX", "Low", "Low", "Confirmed", null,
    ["RingCX Admin → Dial Groups: review groups with no campaign.", "Attach a campaign with appropriate pacing, or retire the group."]));

  // KPI labels this category has spoken for, so CX can skip them.
  const claims: string[] = [];
  if (seats) claims.push("Extensions never activated", "Disabled extensions");
  if (inactiveAgents) claims.push("Inactive RingCX agents");
  if (notRcManaged) claims.push("Agents not managed by RingEX");
  if (dialGroups) claims.push("Dial groups with no campaign");
  return { opps: out, reclaim: { seats, agents: inactiveAgents }, claims };
}

// ---- configuration not yet aligned --------------------------------------
// The original tested status === "not_assessed", which the engine never emits
// ("not assessed"), so unassessed rows read "Currently “not assessed”" and were
// tagged Confirmed. Here they read as intended.
function workflowOpps(audit: ConfigAuditRow[]) {
  return audit.filter((a) => a.state !== "Aligned").map((a) => {
    const notAssessed = a.state === "Not Assessed";
    return opp("workflow", "gears", `${a.setting}: ${a.recommended}`,
      notAssessed ? `Not yet assessed — recommended “${a.recommended}”.` : `Currently “${a.current || a.state}”, recommended “${a.recommended}”.`,
      `${a.impact || ""} ${a.remediation || ""}`.trim(),
      "IT · Admin", /e911|emergency/i.test(a.key || "") ? "High" : "Med", "Low",
      notAssessed ? "Observed" : "Confirmed", null,
      a.remediation ? [a.remediation] : [], `config:${a.key}`);
  });
}

// ---- lifted from the scorecard's own improvements -------------------------
function cxOpps(improvements: Improvement[], claimed: string[]) {
  const out: Opportunity[] = [], seen = new Set<string>(), taken = new Set(claimed);
  for (const im of improvements) {
    const title = im.kpi;
    if (!title || seen.has(title) || taken.has(title)) continue;
    // Config-audit improvements are the rows Workflow enablement already lists.
    if (im.type === "config") continue;
    seen.add(title);
    const lift = Number(im.scoreLift) || 0;
    // RingCentral rates arrive unrounded (e.g. 86.666…).
    const show = (v: number | string | null) => (v == null ? "—" : `${typeof v === "number" ? Math.round(v * 10) / 10 : v}${im.unit === "%" ? "%" : ""}`);
    const cur = show(im.current), tgt = show(im.target);
    out.push(opp("cx", "heart", im.reco || `Improve ${title}`,
      `${title} is at ${cur} against a target of ${tgt}${im.layerLabel ? ` (${im.layerLabel})` : ""}.`,
      im.lever ? `Lever: ${im.lever}. Closing this is worth about ${lift} points of the overall score.`
        : `Closing this is worth about ${lift} points of the overall score.`,
      im.layerLabel || "CX",
      lift >= 8 ? "High" : lift >= 3 ? "Med" : "Low", "Med", "Confirmed",
      lift ? { count: `+${lift}`, label: "projected score points" } : null,
      im.steps || [], "scorecard:improvement"));
  }
  // Biggest score lift first.
  out.sort((a, b) => (parseFloat(String(b.value?.count)) || 0) - (parseFloat(String(a.value?.count)) || 0));
  return out.slice(0, 10);
}
