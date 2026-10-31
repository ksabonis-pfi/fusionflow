// Ported verbatim from the standalone RingCentral Optimization agent (kpis.js, v0.3.x).
// Kept as JavaScript, close to the validated original. Changes: config import
// paths (the JSON now lives in ./config), and deliberate fixes from review —
// license utilization uses one population (enabled users / all users), and the
// config audit marks checks whose inventory read failed as "not assessed".

// KPI computation. Config is the source of truth — this file reads the same
// config/*.json the CLI uses and never hard-codes a metric name or target.
//
// Honesty guardrail: a measurement window too thin to be credible is FLAGGED,
// never presented as a headline result.

import kpiConfig from "./config/kpis.json";
import auditConfig from "./config/config-audit.json";
import layerConfig from "./config/layers.json";
import { sumCounter, sumBreakdown, readTimer } from "./collectors.js";
import { attainment as attainmentOf } from "./scoring.js";

export const LAYERS = layerConfig.layers;

/** Volume floors below which rate KPIs are not credible. Config-driven. */
export const SAMPLE_VOLUME_FLOOR = kpiConfig._thresholds?.sampleVolumeMinCalls ?? 100;
export const SAMPLE_VOLUME_PER_DAY = kpiConfig._thresholds?.sampleVolumeMinCallsPerDay ?? 20;

/** RAG status from value vs target, respecting the KPI's direction. */
export function ragStatus(value, target, direction) {
  if (value == null || target == null) return { status: "n/a", attainment: null };
  if (direction === "higher") {
    const a = target === 0 ? null : value / target;
    return { status: a >= 1 ? "green" : a >= 0.9 ? "amber" : "red", attainment: a };
  }
  if (direction === "lower") {
    if (target === 0) return { status: value === 0 ? "green" : value <= 2 ? "amber" : "red", attainment: null };
    const a = value / target;
    return { status: a <= 1 ? "green" : a <= 1.1 ? "amber" : "red", attainment: a };
  }
  return { status: "n/a", attainment: null };
}

/**
 * Derive raw metric values from collected data.
 * Returns { values, sources, totalCalls }.
 */
export function deriveMetrics({ inventory, aggregate, ace, ringcx, video, presence, licenses }) {
  const values = {};
  const sources = {};
  // Why a KPI has no value, when the reason is a fact about this account rather
  // than a standing platform limitation. config/kpis.json carries the standing
  // ones in `blockedBy`; these are decided at collection time. Either way the
  // scorecard states a reason instead of showing a silent blank — a blank cell
  // reads as a gap in the tool rather than a fact about the tenant.
  const reasons = {};
  const put = (k, v, src) => { if (v !== undefined && v !== null && !Number.isNaN(v)) { values[k] = v; sources[k] = src; } };
  const why = (k, reason) => { if (values[k] === undefined) reasons[k] = reason; };

  // --- Analytics-derived ---------------------------------------------------
  const totalCalls = sumCounter(aggregate, "allCalls");
  const byResult = sumBreakdown(aggregate, "callsByResult");
  const byDirection = sumBreakdown(aggregate, "callsByDirection");
  const byHours = sumBreakdown(aggregate, "callsByCompanyHours");

  // Only when Analytics actually answered. A null response sums to 0, and
  // "0 calls" is a claim about the account rather than about the request.
  if (aggregate) put("total_calls", totalCalls, "analytics.aggregate");

  // Mean call duration. Business Analytics has no speed-to-answer timer at all
  // (see collectAggregate), so handle time is the only timing figure available
  // from this surface.
  const avgDuration = readTimer(aggregate, "allCallsDuration");
  if (avgDuration != null) put("avg_handle_time", avgDuration, "analytics.aggregate:allCallsDuration");

  // Answer rate comes from callsByResponse, NOT callsByResult.
  //   answered + notAnswered  == inbound calls
  //   connected + notConnected == outbound calls
  // (verified against this tenant: 46+183=229 inbound, 78+37=115 outbound).
  // callsByResult is unreliable for this — its largest bucket can be "unknown".
  const byResponse = sumBreakdown(aggregate, "callsByResponse");
  const byOrigin = sumBreakdown(aggregate, "callsByOrigin");
  const answered = byResponse.answered || 0;
  const notAnswered = byResponse.notAnswered || 0;
  const connected = byResponse.connected || 0;
  const notConnected = byResponse.notConnected || 0;
  // answered/notAnswered covers every call that could ring someone — inbound
  // EXTERNAL plus INTERNAL. callsByDirection.inbound counts external only, so
  // it is smaller. Verified live: direction 157+93=250 = external, while
  // response 183+93=276 = allCalls (internal 26 sits inside the 183).
  const answerable = answered + notAnswered;
  const outbound = connected + notConnected;

  if (answerable > 0) {
    put("answer_rate", (answered / answerable) * 100, "analytics.aggregate:callsByResponse");
    put("missed_call_rate", (notAnswered / answerable) * 100, "analytics.aggregate:callsByResponse");
  }
  if (outbound > 0) {
    put("outbound_connect_rate", (connected / outbound) * 100, "analytics.aggregate:callsByResponse");
    put("call_failure_rate", (notConnected / outbound) * 100, "analytics.aggregate:callsByResponse");
  }
  if (totalCalls > 0) {
    const afterHours = byHours.afterHours ?? byHours.AfterHours;
    if (afterHours != null) put("after_hours_call_pct", (afterHours / totalCalls) * 100, "analytics.aggregate");
  }

  // callsByResult is still collected for evidence, but a large "unknown" share
  // means it must not be used to derive rates.
  const resultTotal = Object.values(byResult).reduce((a, b) => a + (Number(b) || 0), 0);
  const unknownShare = resultTotal ? (byResult.unknown || 0) / resultTotal : 0;

  void byDirection;

  // --- Inventory-derived ---------------------------------------------------
  if (inventory) {
    // Only publish a figure when the read behind it actually succeeded. An
    // endpoint that errored leaves an empty array, and "0 disabled extensions"
    // against a target of 0 scores 100 — a collection failure presenting as a
    // perfect result. Observed live: a bad JWT produced an overall of 100.
    const missing = new Set(inventory.unavailable || []);
    const st = inventory.extensionsByStatus || {};

    if (!missing.has("extensions")) {
      put("ext_not_activated", st.NotActivated || 0, "inventory");
      put("ext_disabled", st.Disabled || 0, "inventory");

      // Enabled users / all users. The original divided Enabled extensions of
      // every type (queues, IVRs) by users + NotActivated (double-counting the
      // not-activated users): 80 enabled + 20 not activated read 67%, not 80%.
      const ubs = inventory.usersByStatus || {};
      const users = Object.values(ubs).reduce((a, b) => a + b, 0);
      if (users > 0) put("license_utilization", ((ubs.Enabled || 0) / users) * 100, "inventory");
    }

    if (!missing.has("devices")) {
      const dt = inventory.devicesByType || {};
      const totalDevices = Object.values(dt).reduce((a, b) => a + b, 0);
      // Softphone share of the phones people actually use. Paging and other
      // endpoints are excluded: they are not a desk-hardware decision.
      const phones = (dt.SoftPhone || 0) + (dt.HardPhone || 0);
      if (phones > 0) put("softphone_ratio", ((dt.SoftPhone || 0) / phones) * 100, "inventory:device");
      void totalDevices;

      // Only publish a count that covers every hard phone. A partial sweep
      // would understate the gap, and this is a compliance figure.
      if (inventory.e911Complete && inventory.hardPhonesChecked === inventory.hardPhones) {
        put("hardphones_no_e911", inventory.hardPhonesNoE911, "inventory:device.emergency");
      } else if (inventory.hardPhones) {
        why("hardphones_no_e911",
          `Emergency addressing needs one call per hard phone and the subrequest budget covered ${inventory.hardPhonesChecked} of ${inventory.hardPhones}. A partial count would understate a compliance gap, so none is published. Raise SUBREQUEST_BUDGET to complete it.`);
      }
    }

    // Fax displacement. Zero dedicated fax numbers is a real zero, so this
    // publishes whenever the number list was read.
    if (!missing.has("phone numbers")) put("fax_numbers", inventory.faxNumbers || 0, "inventory:phone-number");

    if (!missing.has("call queues") && inventory.queueMembershipComplete) {
      put("queues_without_members", (inventory.queues || []).filter((q) => q.memberCount === 0).length, "inventory");
    }
  }

  // Raw breakdowns, kept for the UI to chart. Facts as returned by the API.
  const breakdowns = {
    byDirection: byDirection,
    byResponse: byResponse,
    byResult: byResult,
    byCompanyHours: byHours,
    byOrigin: byOrigin,
  };

  // --- Layer 10: license position -----------------------------------------
  if (licenses?.reachable) {
    put("licenses_unassigned", licenses.unassigned, "licenses");
  } else if (licenses) {
    why("licenses_unassigned", "The license inventory could not be read for this account.");
  }

  // --- Layer 4: Presence ---------------------------------------------------
  // A point-in-time read. Published as counts and a share of what was sampled;
  // never described as a window average, because one sample is not one.
  if (presence?.reachable && presence.total > 0) {
    put("presence_offline_pct", (presence.offline / presence.total) * 100, "presence");
    put("dnd_blocking_calls", presence.dndBlocking, "presence");
  } else if (presence) {
    why("presence_offline_pct", "Presence returned no extensions, so there is nothing to compute a share from.");
    why("dnd_blocking_calls", "Presence returned no extensions.");
  }

  // --- Layer 7: Meetings & collaboration ----------------------------------
  if (video?.reachable) {
    put("meetings_held", video.meetings, "video");
    put("meeting_minutes", video.minutes, "video");
  }

  // --- Layer 9: AI / RingSense (ACE) --------------------------------------
  if (ace) {
    if (ace.coveragePct != null) put("ace_insight_coverage", ace.coveragePct, "ace");
    else why("ace_insight_coverage", ace.note || "No recorded calls in the window, so there is nothing for AI to analyse. Coverage is undefined rather than zero.");
    put("ace_recordings_analyzed", ace.withInsights, "ace");
    if (totalCalls > 0 && ace.recordedCalls != null) {
      put("recorded_call_pct", (ace.recordedCalls / totalCalls) * 100, "callLog");
    }
  }

  // --- Layer 8: Contact Center (RingCX) -----------------------------------
  if (ringcx?.reachable && ringcx.drilled) {
    if (ringcx.queues != null) put("ringcx_queues", ringcx.queues, "ringcx");
    if (ringcx.agents != null) put("ringcx_agents", ringcx.agents, "ringcx");
    put("ringcx_active_queues", ringcx.activeQueues, "ringcx");
    if (ringcx.staffingChecked) put("ringcx_unstaffed_queues", (ringcx.unstaffedQueues || []).length, "ringcx");
    put("ringcx_inactive_agents", ringcx.inactiveAgents, "ringcx");
    put("ringcx_agents_not_rc_managed", ringcx.agentsNotRcManaged, "ringcx");
    put("ringcx_dialgroups_no_campaign", (ringcx.dialGroupsNoCampaign || []).length, "ringcx");

    // Same-day operational metrics — realTimeData, no WEM required.
    const rt = ringcx.realtime || {};
    const inb = rt.inbound;
    if (inb && inb.presented > 0) {
      put("ringcx_queue_answer_rate", (inb.answered / inb.presented) * 100, "ringcxRealtime");
      put("ringcx_queue_abandon_rate", (inb.abandoned / inb.presented) * 100, "ringcxRealtime");
    }
    const ob = rt.outbound;
    if (ob && (ob.answer + ob.noanswer) > 0) {
      put("ringcx_outbound_answer_rate", (ob.answer / (ob.answer + ob.noanswer)) * 100, "ringcxRealtime");
    }
    const ivr = rt.ivr;
    if (ivr && ivr.presented > 0) {
      put("ringcx_ivr_containment", ((ivr.presented - ivr.transferGate) / ivr.presented) * 100, "ringcxRealtime");
    }

    // realTimeData describes TODAY. No contacts today is a real answer, not a
    // collection failure, and it must not read as one.
    const sameDay = "Same-day only without WEM, and no contacts have been presented today — there is nothing to compute a rate from. Re-check during operating hours, or enable WEM for window-length history.";
    if (!inb || !(inb.presented > 0)) { why("ringcx_queue_answer_rate", sameDay); why("ringcx_queue_abandon_rate", sameDay); }
    if (!ob || !((ob.answer + ob.noanswer) > 0)) why("ringcx_outbound_answer_rate", sameDay);
    if (!ivr || !(ivr.presented > 0)) why("ringcx_ivr_containment", sameDay);
  }

  return { values, sources, reasons, totalCalls, answerable, outbound, unknownShare, breakdowns };
}

/**
 * Score every KPI in config against the derived values.
 * `flaggedKeys` are rendered as sample-volume artifacts, never as results.
 */
export function scoreKpis({ values, sources, reasons = {}, totalCalls, windowDays = 30, overrides = {}, extraFlags = [] }) {
  const perDay = windowDays > 0 ? totalCalls / windowDays : totalCalls;
  const thinWindow = totalCalls < SAMPLE_VOLUME_FLOOR || perDay < SAMPLE_VOLUME_PER_DAY;

  // Rate-style KPIs are the ones a thin window distorts. Counts are still fine.
  const VOLUME_SENSITIVE = new Set(["answer_rate", "missed_call_rate", "outbound_connect_rate", "after_hours_call_pct"]);

  const rows = kpiConfig.kpis.map((k) => {
    const supplied = overrides[k.id];
    const value = supplied !== undefined ? Number(supplied) : values[k.id];
    const available = value !== undefined && value !== null && !Number.isNaN(value);
    // A blockedBy reason only applies while the value is genuinely missing —
    // once the data arrives the KPI is simply measured.
    // A reason observed on this account beats the standing one from config.
    const blockedBy = available ? null : (reasons[k.id] ?? k.blockedBy ?? null);
    const { status } = available ? ragStatus(value, k.target, k.direction) : { status: "n/a" };
    const attainment = available ? attainmentOf(value, k.target, k.direction) : null;

    const flagged =
      extraFlags.includes(k.id) || (thinWindow && VOLUME_SENSITIVE.has(k.id) && available);

    return {
      key: k.id,
      label: k.name,
      layer: k.layer,
      /** Part of the model but not measurable here yet — carries the reason. */
      blockedBy,
      value: available ? value : null,
      target: k.target ?? null,
      unit: k.unit,
      dir: k.direction,
      status: flagged ? "n/a" : status,
      attainment: flagged ? null : attainment,
      mode: supplied !== undefined ? "supplied" : available ? "api" : blockedBy ? "blocked" : "missing",
      source: sources[k.id] || k.source || null,
      available: available ? 1 : 0,
      flagged,
      flagReason: flagged
        ? `sample-volume artifact — ${totalCalls} calls over ${windowDays}d (${perDay.toFixed(1)}/day; floors ${SAMPLE_VOLUME_FLOOR} total / ${SAMPLE_VOLUME_PER_DAY} per day); re-baseline on production volumes`
        : null,
    };
  });

  const populated = rows.filter((r) => r.available).length;
  const blocked = rows.filter((r) => r.mode === "blocked").length;
  const measurable = rows.length - blocked;
  const scored = rows.filter((r) => r.status === "green" || r.status === "amber" || r.status === "red");
  const greens = scored.filter((r) => r.status === "green").length;
  const overall = scored.length ? Math.round((greens / scored.length) * 100) : null;

  return {
    rows,
    summary: {
      kpis_total: rows.length,
      kpis_populated: populated,
      kpis_blocked: blocked,
      kpis_measurable: measurable,
      api_populated: rows.filter((r) => r.mode === "api").length,
      // Coverage is of what CAN be measured on this tenant. Blocked KPIs are
      // reported separately rather than silently depressing the score.
      data_coverage_pct: measurable ? Math.round((populated / measurable) * 100) : 0,
      overall,
      overall_grade: overall == null ? null : overall >= 90 ? "A" : overall >= 80 ? "B" : overall >= 70 ? "C" : overall >= 60 ? "D" : "F",
      red_findings: rows.filter((r) => r.status === "red").length,
      amber_findings: rows.filter((r) => r.status === "amber").length,
      sample_volume_flag: thinWindow ? 1 : 0,
      total_calls_in_window: totalCalls,
      calls_per_day: Number(perDay.toFixed(2)),
    },
  };
}

/** Configuration-audit checks against the collected inventory. */
export function runAudit(inventory, ringcx) {
  if (!inventory) return [];
  const out = [];
  const st = inventory.extensionsByStatus || {};
  // A failed read leaves []/null behind; judging that as real configuration
  // scored unreadable extensions as "aligned" and unreadable business hours,
  // recording or sites as gaps. Those checks are "not assessed" instead.
  const missing = new Set(inventory.unavailable || []);
  const unread = (label) => missing.has(label);
  const verdict = (id, ok, detail) => {
    const cfg = auditConfig.checks.find((c) => c.id === id);
    if (!cfg) return;
    out.push({
      id, layer: cfg.layer, setting: cfg.setting, recommended: cfg.recommended,
      status: ok === null ? "not assessed" : ok ? "aligned" : "gap",
      detail, impact: cfg.impact, remediation: cfg.remediation,
    });
  };

  verdict("emergency_locations_present", unread("emergency locations") ? null : (inventory.counts?.emergencyLocations ?? 0) > 0,
    unread("emergency locations") ? "emergency locations could not be read" : `${inventory.counts?.emergencyLocations ?? 0} emergency location(s)`);

  const empty = inventory.queueMembershipComplete && !unread("call queues")
    ? (inventory.queues || []).filter((q) => q.memberCount === 0)
    : null;
  verdict("queue_has_members", empty === null ? null : empty.length === 0,
    empty === null ? (unread("call queues") ? "call queues could not be read" : "queue membership not fully collected (budget)") : empty.length ? `empty: ${empty.map((q) => q.name).join(", ")}` : "all queues staffed");

  verdict("business_hours_defined", unread("business hours") ? null : !!inventory.businessHours,
    unread("business hours") ? "business hours could not be read" : inventory.businessHours ? "defined" : "not defined");
  verdict("no_stale_extensions", unread("extensions") ? null : (st.NotActivated || 0) === 0,
    unread("extensions") ? "extensions could not be read" : `${st.NotActivated || 0} never activated`);
  verdict("no_disabled_extensions", unread("extensions") ? null : (st.Disabled || 0) === 0,
    unread("extensions") ? "extensions could not be read" : `${st.Disabled || 0} disabled`);
  verdict("call_recording_policy", unread("call recording") ? null : !!inventory.callRecording,
    unread("call recording") ? "call recording settings could not be read" : inventory.callRecording ? "configured" : "not configured");
  verdict("sites_configured", unread("sites") ? null : (inventory.counts?.sites ?? 0) > 0,
    unread("sites") ? "sites could not be read" : `${inventory.counts?.sites ?? 0} site(s)`);

  // --- Layer 8: contact centre -------------------------------------------
  if (ringcx?.reachable && ringcx.drilled) {
    const unstaffed = ringcx.unstaffedQueues || [];
    verdict("ringcx_queues_staffed", ringcx.staffingChecked ? unstaffed.length === 0 : null,
      !ringcx.staffingChecked ? "staffing not checked — subrequest budget"
        : unstaffed.length ? `unstaffed: ${unstaffed.slice(0, 5).join(", ")}${unstaffed.length > 5 ? ` +${unstaffed.length - 5}` : ""}`
        : `${ringcx.activeQueues} active queue(s) staffed`);
    verdict("ringcx_no_inactive_agents", ringcx.inactiveAgents === 0, `${ringcx.inactiveAgents} inactive of ${ringcx.agents ?? "?"}`);
    verdict("ringcx_agents_rc_managed", ringcx.agentsNotRcManaged === 0, `${ringcx.agentsNotRcManaged} not managed by RingEX`);
    const dialing = (ringcx.campaigns ?? 0) > 0;
    verdict("ringcx_dnc_configured", dialing ? ringcx.dncLists > 0 : null,
      dialing ? `${ringcx.dncLists} DNC list(s) with ${ringcx.campaigns} campaign(s)` : "no outbound campaigns configured — not applicable");
    const noCamp = ringcx.dialGroupsNoCampaign || [];
    verdict("ringcx_dialgroups_have_campaigns", ringcx.dialGroups ? noCamp.length === 0 : null,
      ringcx.dialGroups ? (noCamp.length ? `empty: ${noCamp.slice(0, 4).join(", ")}` : `${ringcx.dialGroups} dial group(s) configured`) : "no dial groups");
  }

  const assessed = out.filter((c) => c.status !== "not assessed");
  const aligned = assessed.filter((c) => c.status === "aligned").length;
  return Object.assign(out, { alignment: assessed.length ? aligned / assessed.length : null });
}
