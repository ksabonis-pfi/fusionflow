// Ported from the standalone Zoom Optimization agent (collectors.js, v3.2.0).
// Kept as JavaScript, close to the version validated against live tenants;
// collectors.d.ts types its surface. Changes: the client import path, and
// settingsAudit() now reports why account settings couldn't be read instead of
// silently succeeding with an empty audit.

// Domain collectors. They populate a shared metrics map (keyed by KPI key from
// kpis.js), a raw context object, and a config-audit current-state map.
// Nothing throws — every gap is captured as a per-KPI reason so the scorecard
// can show exactly what was/wasn't reachable and why.

import { ZoomError } from "./client";

// ---------- shared extraction helpers ----------
function rowsFrom(resp) {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  for (const k of [
    "users", "queue_performance", "agent_performance", "engagement", "dataset",
    "results", "engagements", "data", "records", "queues", "deals", "rooms",
    "zoom_rooms", "call_logs", "metrics", "agents", "forecasts", "evaluations",
  ]) {
    if (Array.isArray(resp[k])) return resp[k];
  }
  // Fallback: first array-valued property (handles unknown dataset key names).
  for (const k of Object.keys(resp)) {
    if (Array.isArray(resp[k]) && (resp[k].length === 0 || typeof resp[k][0] === "object")) return resp[k];
  }
  return [];
}

function pickNums(rows, patterns) {
  const re = patterns.map((p) => new RegExp(p, "i"));
  const vals = [];
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    for (const key of Object.keys(r)) {
      if (re.some((x) => x.test(key))) {
        const n = Number(typeof r[key] === "string" ? r[key].replace(/[%,$\s]/g, "") : r[key]);
        if (!Number.isNaN(n)) { vals.push(n); break; }
      }
    }
  }
  return vals;
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const sum = (a) => (a.length ? a.reduce((x, y) => x + y, 0) : null);
const pct = (v) => (v == null ? null : v <= 1 ? v * 100 : v); // 0-1 fraction -> %
const round = (v, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const hmsToMin = (s) => {
  if (typeof s === "number") return s / 60;
  if (!s || typeof s !== "string") return 0;
  const p = s.split(":").map(Number);
  if (p.length === 3) return (p[0] * 3600 + p[1] * 60 + p[2]) / 60;
  if (p.length === 2) return (p[0] * 60 + p[1]) / 60;
  return 0;
};

// CX Analytics (reports v2) + Logs use ISO-8601 with time, range ~1 month.
const isoStart = (d) => `${d}T00:00:00Z`;
const isoEnd = (d) => `${d}T23:59:59Z`;

// Normalize a CX Analytics dataset/log response to an array of row objects.
// Handles columnar { column_headers:[{name|id}], rows:[[...]] } and array shapes.
function datasetRows(resp) {
  if (resp && Array.isArray(resp.rows)) {
    const hdrs = resp.column_headers || resp.columns || resp.headers;
    if (Array.isArray(hdrs)) {
      const cols = hdrs.map((c) => (typeof c === "string" ? c : c.name || c.id || c.field || c.key));
      return resp.rows.map((r) => (Array.isArray(r) ? Object.fromEntries(cols.map((c, i) => [c, r[i]])) : r));
    }
    return resp.rows;
  }
  return rowsFrom(resp);
}

// ---------- context ----------
// Concrete Zoom-admin configuration steps per optimization-opportunity title.
// Attached to each opportunity so product reports show 3–5 fixes that raise scores.
const OPP_STEPS = {
  // ---- Contact Center ----
  "Reduce queue abandonment": [
    "Contact Center → Preferences → Queues: enable Callback-in-Queue so callers keep their place without holding.",
    "Add position-in-queue and estimated-wait announcements to the queue's flow.",
    "WFM / scheduling: raise staffing at the peak half-hours driving abandonment; add secondary/overflow skills.",
    "Flows: shorten the pre-queue IVR path so callers reach an agent faster.",
  ],
  "Raise service level": [
    "Contact Center → Queues: set/confirm the service-level target (e.g. 80% in 30s) per queue.",
    "Enable overflow and interruptible secondary routing so waiting calls spill to eligible agents.",
    "WFM: align schedules to the interval forecast; cover the busiest intervals first.",
    "Add callback-in-queue for peaks so SLA isn't consumed by hold time.",
  ],
  "Coach agents on missed/declined offers": [
    "Contact Center → Agent Routing Profiles: verify max-concurrency and auto-answer settings for the flagged agents.",
    "Review each agent's Not-Ready sub-status usage in the agent status report; tighten adherence.",
    "Confirm ring/no-answer timeout and re-route so missed offers don't idle.",
    "Add a QM coaching plan for agents with elevated declined/missed.",
  ],
  "Occupancy risk (burnout)": [
    "WFM: add headcount or shrink shift lengths at the intervals where occupancy exceeds ~85%.",
    "Build scheduled off-phone time (training/admin) into rosters.",
    "Rebalance skills so volume spreads across more eligible agents.",
  ],
  "Low occupancy": [
    "WFM: tighten schedules to demand; reduce over-staffing at low-volume intervals.",
    "Blend under-utilized agents into outbound campaigns or secondary queues.",
    "Review skill assignments so idle agents can take adjacent queues.",
  ],
  "High transfer rate": [
    "Flows: fix mis-routes — verify skill/queue mapping so contacts land on the right team first time.",
    "Expand agent skills/knowledge for the top transfer reasons (from dispositions).",
    "Enable warm-transfer context passing so re-work drops.",
    "Add self-service/Virtual Agent for the intents most often transferred.",
  ],
  "Adopt AI Expert Assist": [
    "Contact Center → AI → Expert Assist: enable the feature and assign it to the busiest queues.",
    "Connect/verify the knowledge base powering Expert Assist suggestions.",
    "Turn on real-time transcription (required for live agent assist).",
    "Train agents on accepting/using suggested articles to cut wrap time.",
  ],
  "Improve flow self-service": [
    "Flows: add automated resolution paths (data-dips, self-service actions) before routing to an agent.",
    "Layer a Zoom Virtual Agent on the highest-volume flows for conversational deflection.",
    "Instrument flow analytics to find and remove dead-ends before the queue.",
  ],
  "Enforce disposition capture": [
    "Contact Center → Dispositions: build a required disposition set and attach it to each queue.",
    "Make disposition mandatory at wrap-up in the agent settings.",
    "Report on disposition completion weekly and coach gaps.",
  ],
  // ---- Zoom Phone ----
  "Improve call audio quality": [
    "Admin → Dashboard → Zoom Phone → Quality of Service: identify the sites/segments with low MOS.",
    "Apply network QoS/DSCP tagging for Zoom Phone media and prioritize it on the WAN/LAN.",
    "Check ISP/VPN paths on the worst segments; move media off congested or split-tunnel VPN links.",
    "Update the Zoom client and audio devices on affected users; replace poor headsets.",
  ],
  "Network quality by ISP": [
    "Correlate the low-MOS ISP with the affected sites in the QoS dashboard.",
    "Engage the carrier / apply SD-WAN or QoS on that network's egress.",
    "For remote users on that ISP, recommend wired/5GHz and disable bandwidth-heavy background apps.",
  ],
  "Quality by client/device": [
    "Push the latest Zoom client to the flagged device types (older builds degrade audio).",
    "Audit headsets/microphones on those clients; standardize on certified devices.",
    "Enable audio enhancement / background-noise suppression in Phone policy.",
  ],
  "Reclaim unassigned numbers": [
    "Phone System Management → Numbers: filter to Unassigned and release numbers no longer needed.",
    "Reassign useful DIDs to new users/auto-receptionists instead of buying more.",
    "Schedule a quarterly DID true-up to keep spend aligned.",
  ],
  "Offline desk phones": [
    "Phone System Management → Devices: identify offline devices and confirm power/network/provisioning.",
    "Re-provision or deprovision devices that are permanently offline (softphone-only users).",
    "Reclaim licenses tied to unused desk phones.",
  ],
  // ---- Meetings & Webinars ----
  "Improve meeting media quality": [
    "Admin → Dashboard → Meetings → Quality: find the weakest media type and the sites driving it.",
    "Apply network QoS for meeting media and verify firewall/SBC rules.",
    "Enable original-audio / noise-suppression policy defaults; update clients.",
    "For chronic sites, review bandwidth and wired vs Wi-Fi.",
  ],
  "Drive AI Companion adoption": [
    "Admin → AI Companion → Meeting: enable Meeting Summary and Smart Recording at the account level.",
    "Lock the setting on so groups inherit it; allow auto-start summaries.",
    "Announce + train hosts; track adoption in the AI Companion dashboard.",
  ],
  "Recording adoption": [
    "Admin → Recording: enable cloud recording (and optional auto-record) with a retention policy.",
    "Enable recording transcripts/summaries for searchability.",
    "Promote recording for training and compliance use-cases.",
  ],
  "Reclaim idle licenses": [
    "Admin → Dashboard → Reports → Active Hosts: list dormant and never-logged-in licensed users.",
    "Reassign or downgrade dormant Licensed users to Basic; reclaim never-logged-in seats at renewal.",
    "Enable SCIM auto-deprovisioning so leavers free licenses automatically.",
  ],
  "Low hosting activity": [
    "Run a targeted enablement campaign for non-hosting cohorts (calendar integration, scheduler).",
    "Confirm users have the right license and client installed.",
    "Reclaim persistently inactive licenses at the next true-up.",
  ],
  // ---- Virtual Agent ----
  "Cover top no-match queries": [
    "Virtual Agent → Knowledge / Intents: add intents or KB articles for the most-missed queries.",
    "Add training phrases/synonyms so those utterances match.",
    "Enable generative/KB answers as a fallback for long-tail questions.",
    "Re-test the flows and re-run this assessment to confirm coverage.",
  ],
  "Improve KB article relevance": [
    "Virtual Agent → Knowledge Base: tighten/curate the articles scoring below 0.5 relevance.",
    "Split overly broad articles and add specific ones for the missed topics.",
    "Re-index/re-sync the KB after edits and validate the top queries.",
  ],
  "Ground the knowledge base": [
    "Add training phrases and KB coverage for the low-confidence intents.",
    "Review and merge overlapping intents that confuse matching.",
    "Enable generative answers grounded in the KB for long-tail queries.",
  ],
  "Raise containment": [
    "Add automated resolution actions (data-dips, account actions) for the top-volume topics.",
    "Enable generative answers so more questions resolve without an agent.",
    "Trim unnecessary escalation triggers in the flow.",
    "Expand intent/KB coverage for the highest-volume topics.",
  ],
  "Improve bot CSAT": [
    "Review responses on the lowest-rated topics and rewrite for clarity/tone.",
    "Add a post-interaction survey if missing to capture drivers.",
    "Shorten multi-turn paths that frustrate users before resolution.",
  ],
  "Maintain top topics": [
    "Keep the highest-volume topics' answers current as products/policies change.",
    "Monitor their match confidence and CSAT monthly.",
  ],
  "Maintain top intents": [
    "Keep the highest-volume intents' answers and training phrases current.",
    "Monitor their accuracy and fallback rate monthly.",
  ],
  "High live-agent escalation from self-service": [
    "Flows: add automated intents/actions for the top flows that escalate today.",
    "Layer a Zoom Virtual Agent on those flows for conversational deflection.",
    "Verify skill/queue routing so only true agent-needs escalate.",
  ],
  "Raise self-service containment": [
    "Expand IVR/flow self-service coverage on the busiest flows.",
    "Add knowledge-grounded answers to resolve more in-flow.",
    "Instrument flow analytics to remove dead-ends before the queue.",
  ],
  "Investigate flow drop-off": [
    "Flows: review menus/prompts on the drop-off flows for confusing or dead-end paths.",
    "Add timeouts/re-prompts and a clear path to an agent.",
    "A/B test shorter prompts and re-measure.",
  ],
  "Add a Virtual Agent on top flows": [
    "Build a Zoom Virtual Agent and connect the knowledge base.",
    "Route the top flows into the Virtual Agent before agent queues.",
    "Enable intent + KB answers and monitor containment.",
  ],
};
function attachSteps(opps) {
  for (const o of opps || []) if (!o.steps && OPP_STEPS[o.title]) o.steps = OPP_STEPS[o.title].slice(0, 5);
  return opps;
}

export function makeContext(client, { accountId, from, to }) {
  const metrics = {};   // key -> { value, available, reason, endpoint }
  const raw = {};
  const audit = {};     // detect-key -> "Enabled"/"Configured"/... or null
  const domains = {};   // domain -> { ok, reason }

  function set(key, value, endpoint) {
    metrics[key] = { value: value == null ? null : round(value), available: value != null, reason: null, endpoint };
  }
  function miss(key, reason) {
    metrics[key] = { value: null, available: false, reason, endpoint: null };
  }
  return { client, accountId, from, to, metrics, raw, audit, domains, set, miss };
}

// run a domain collector, recording a domain-level status
async function runDomain(ctx, name, keys, fn) {
  try {
    await fn();
    ctx.domains[name] = { ok: true, reason: null };
  } catch (err) {
    const reason = err instanceof ZoomError ? `${err.status || ""} ${err.message}`.trim() : String(err?.message || err);
    ctx.domains[name] = { ok: false, reason };
    for (const k of keys) if (!ctx.metrics[k]) ctx.miss(k, reason);
  }
}

// ===================================================================
// 1 — Users, licenses, active-user rate, license utilization
// ===================================================================
export async function usersAndLicenses(ctx) {
  await runDomain(ctx, "users", ["active_user_rate"], async () => {
    const active = await ctx.client.paginate("/users", { status: "active" }, { itemsKey: "users", maxPages: 6 });
    const inactive = await ctx.client.paginate("/users", { status: "inactive" }, { itemsKey: "users", maxPages: 2 });
    const all = [...active.items, ...inactive.items];
    const now = Date.now(), day = 86400000;
    let licensed = 0, basic = 0, dormant = 0, never = 0;
    for (const u of all) {
      if (u.type === 2) licensed++; else if (u.type === 1) basic++;
      if (!u.last_login_time) never++;
      else if (now - Date.parse(u.last_login_time) > 30 * day) dormant++;
    }
    ctx.raw.users = { total: all.length, licensed, basic, dormant30d: dormant, neverLoggedIn: never, truncated: active.truncated };

    // License utilization (derived): active paid users / provisioned paid users.
    if (licensed > 0) {
      const activePaid = Math.max(0, licensed - dormant - never);
      ctx.set("license_utilization", (activePaid / licensed) * 100, "/users (derived)");
    } else ctx.miss("license_utilization", "No licensed users found");

    // Active-host rate from the report (true hosting activity).
    try {
      const hosts = await ctx.client.paginate("/report/users", { from: ctx.from, to: ctx.to, type: "active" }, { itemsKey: "users", maxPages: 4 });
      const hosted = hosts.items.filter((u) => (u.meeting_count ?? u.meetings ?? 0) > 0).length || hosts.items.length;
      const denom = licensed || all.length;
      ctx.raw.hostsInWindow = hosted;
      if (denom > 0) ctx.set("active_user_rate", (hosted / denom) * 100, "/report/users");
    } catch (e) {
      ctx.miss("active_user_rate", e instanceof ZoomError ? `${e.status} ${e.message}` : String(e));
    }
  });
}

// ===================================================================
// 2 — Usage / recording (feeds raw + feature adoption)
// ===================================================================
export async function usage(ctx) {
  await runDomain(ctx, "usage", [], async () => {
    const d = new Date(ctx.to);
    const rep = await ctx.client.get("/report/daily", { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
    const dates = rep.dates || [];
    const s = (k) => dates.reduce((a, x) => a + (Number(x[k]) || 0), 0);
    ctx.raw.usage = {
      meetings: s("meetings"), participants: s("participants"),
      meetingMinutes: s("meeting_minutes"), newUsers: s("new_users"),
      recordingStorageGB: round(s("cloud_recording_storage") / 1024, 1) || null,
      month: d.getUTCMonth() + 1, year: d.getUTCFullYear(),
    };

    // Sample past meetings (record-level: feature flags + per-meeting quality) for
    // the Meetings deep report. One page (≈300) is a representative sample; kept on
    // ctx (transient) so the report aggregates it with zero further calls.
    if (ctx.client.remaining() > 4) {
      // Dashboard metrics also enforce a ~1-month cap — clamp to ≤29 days.
      const mFrom = Date.parse(ctx.to) - Date.parse(ctx.from) > 29 * 86400000 ? new Date(Date.parse(ctx.to) - 29 * 86400000).toISOString().slice(0, 10) : ctx.from;
      const mm = await safeCall(() => ctx.client.get("/metrics/meetings", { from: isoStart(mFrom), to: isoEnd(ctx.to), type: "past", page_size: 300 }));
      if (mm) { ctx._meetings = rowsFrom(mm); ctx.raw.meetingsSampled = ctx._meetings.length; ctx.raw.meetingsTotal = mm.total_records ?? ctx._meetings.length; }
    }
  });
}

// ===================================================================
// 3 — Quality: meeting quality score + Zoom Phone MOS
// ===================================================================
export async function quality(ctx) {
  await runDomain(ctx, "quality", ["mos"], async () => {
    // Phone MOS — /phone/metrics/call_logs returns a per-call `mos` string.
    // Paginate so the average reflects the full window, not a single page.
    let mosSum = 0, mosN = 0, calls = 0, token, pages = 0;
    const maxPages = Number(ctx.mosMaxPages) || 6;
    const callRows = []; // retained (transient) so the Phone deep report reuses them — 0 extra subrequests
    try {
      do {
        const r = await ctx.client.get("/phone/metrics/call_logs", { from: ctx.from, to: ctx.to, page_size: 300, next_page_token: token });
        const rows = rowsFrom(r);
        calls += rows.length; callRows.push(...rows);
        for (const v of pickNums(rows, ["^mos$"])) if (v > 0) { mosSum += v; mosN++; }
        token = r.next_page_token; pages++;
      } while (token && pages < maxPages && ctx.client.remaining() > 4);
    } catch (_) { /* fall through */ }
    ctx._phoneCalls = callRows;
    ctx.raw.callsSampled = calls; ctx.raw.mosCalls = mosN;
    if (mosN > 0) ctx.set("mos", mosSum / mosN, `/phone/metrics/call_logs (${mosN} calls)`);
    else ctx.miss("mos", "No MOS in call logs (no calls in window, or scope)");

    // Meeting quality — /metrics/quality returns good/fair/poor/bad by media type.
    try {
      const q = await ctx.client.get("/metrics/quality", { from: ctx.from, to: ctx.to });
      const buckets = q.quality || {};
      let good = 0, total = 0;
      for (const m of ["audio", "video", "screen_share"]) {
        const b = buckets[m]; if (!b) continue;
        good += Number(b.good) || 0;
        total += ["good", "fair", "poor", "bad"].reduce((a, k) => a + (Number(b[k]) || 0), 0);
      }
      ctx.raw.meetingQualityGoodPct = total ? round((good / total) * 100, 1) : null;
      ctx.raw.meetingQuality = buckets; // per-media {audio,video,screen_share}:{good,fair,poor,bad} for the Meetings report
    } catch (_) { /* optional */ }
  });
}

// ===================================================================
// 4 — Zoom Rooms: inventory + utilization
// ===================================================================
export async function rooms(ctx) {
  await runDomain(ctx, "rooms", ["room_utilization"], async () => {
    const list = await ctx.client.paginate("/rooms", {}, { itemsKey: "rooms", maxPages: 2 });
    ctx.raw.rooms = { total: list.items.length };
    try {
      const m = await safeCall(() => ctx.client.get("/metrics/zoomrooms", { from: ctx.from, to: ctx.to, page_size: 100 }));
      const rws = m ? rowsFrom(m) : [];
      const online = rws.filter((r) => !/offline|disconnect/i.test(String(r.status || "") + String(r.health || ""))).length;
      ctx.raw.rooms.metricsRooms = rws.length;
      ctx.raw.rooms.onlinePct = rws.length ? round((online / rws.length) * 100, 0) : null;

      // Utilization: sum past-meeting minutes per room (/metrics/zoomrooms/{id})
      // vs bookable hours in the window.
      const days = Math.max(1, Math.round((Date.parse(ctx.to) - Date.parse(ctx.from)) / 86400000));
      const bookableMinPerRoom = days * (Number(ctx.bookableHoursPerDay) || 10) * 60;
      let usedMin = 0, detailed = 0;
      for (const rm of rws) {
        if (ctx.client.remaining() < 6) break;
        const d = await safeCall(() => ctx.client.get(`/metrics/zoomrooms/${rm.id}`, { from: ctx.from, to: ctx.to }));
        if (!d) continue;
        const meetings = d.past_meetings?.meetings || (Array.isArray(d.past_meetings) ? d.past_meetings : []);
        for (const mt of meetings) {
          const mins = hmsToMin(mt.duration) ||
            (mt.start_time && mt.end_time ? (Date.parse(mt.end_time) - Date.parse(mt.start_time)) / 60000 : 0);
          usedMin += mins > 0 ? mins : 0;
        }
        detailed++;
      }
      ctx.raw.rooms.detailedRooms = detailed; ctx.raw.rooms.usedMinutes = Math.round(usedMin);
      if (detailed > 0 && bookableMinPerRoom > 0) {
        const util = Math.min(100, (usedMin / (detailed * bookableMinPerRoom)) * 100);
        ctx.set("room_utilization", util, `/metrics/zoomrooms/{id} past_meetings (${detailed} rooms · ${days}d × ${(Number(ctx.bookableHoursPerDay) || 10)}h)`);
      } else ctx.miss("room_utilization", "No room meeting data in window");
    } catch (e) {
      ctx.miss("room_utilization", e instanceof ZoomError ? `${e.status} ${e.message}` : String(e));
    }
  });
}

// ===================================================================
// 5 — Zoom Phone: inventory + queues + SMS (feeds raw)
// ===================================================================
export async function phone(ctx) {
  await runDomain(ctx, "phone", [], async () => {
    const users = await ctx.client.paginate("/phone/users", {}, { itemsKey: "users", maxPages: 3 });
    const r = { users: users.items.length };
    const numbers = await safeCall(() => ctx.client.paginate("/phone/numbers", { type: "all" }, { itemsKey: "phone_numbers", maxPages: 3 }));
    if (numbers) {
      r.numbers = numbers.items.length;
      r.unassignedNumbers = numbers.items.filter((n) => n.status === "unassigned" || (!n.assignee && !n.user_id)).length;
    }
    const devices = await safeCall(() => ctx.client.paginate("/phone/devices", {}, { itemsKey: "devices", maxPages: 2 }));
    if (devices) {
      r.devices = devices.items.length;
      r.offlineDevices = devices.items.filter((d) => String(d.status || "").toLowerCase() === "offline").length;
    }
    const queues = await safeCall(() => ctx.client.paginate("/phone/call_queues", {}, { itemsKey: "call_queues", maxPages: 2 }));
    if (queues) r.callQueues = queues.items.length;
    ctx.raw.phone = r;
  });
}

// ===================================================================
// 6 — Contact Center: queue + agent performance datasets
// ===================================================================
export async function contactCenter(ctx) {
  const ccKeys = ["sla", "asa", "abandon_rate", "aht", "fcr", "csat", "repeat_contact", "human_aht_escalated", "expert_assist", "occupancy"];
  await runDomain(ctx, "contactCenter", ccKeys, async () => {
    const users = await safeCall(() => ctx.client.paginate("/contact_center/users", {}, { itemsKey: "users", maxPages: 1 }));
    ctx.raw.cc = { agents: users ? users.items.length : null };

    // CX Analytics enforces a strict 1-month cap. isoStart(from)→isoEnd(to) spans
    // the assessment window + ~1 day, so a 30-day window trips the limit — clamp
    // to ≤29 days ending at ctx.to (mirrors the ZVA window clamp).
    const ccFrom = Date.parse(ctx.to) - Date.parse(ctx.from) > 29 * 86400000
      ? new Date(Date.parse(ctx.to) - 29 * 86400000).toISOString().slice(0, 10) : ctx.from;
    const win = { from: isoStart(ccFrom), to: isoEnd(ctx.to) };
    const SL_MS = Number(ctx.slThresholdMs) || 30000; // service-level threshold (30s)
    const ms2s = (v) => (v == null ? null : v / 1000);
    const N = (r, k) => Number(r[k]) || 0;

    // CX Analytics datasets are record-level — paginate and aggregate ourselves.
    const fetchDS = async (name, maxPages = 2) => {
      const rows = []; let token, pages = 0;
      do {
        const page = await ctx.client.get(`/contact_center/analytics/dataset/historical/${name}`, { ...win, page_size: 300, next_page_token: token });
        rows.push(...datasetRows(page));
        token = page.next_page_token; pages++;
      } while (token && pages < maxPages && ctx.client.remaining() > 3);
      return rows;
    };

    // --- Queue performance: SLA (computed), ASA, AHT, abandonment (durations in ms) ---
    // Degrade gracefully: a queue_performance failure (scope, window limit, etc.)
    // must NOT kill the whole domain — engagement/flow data still drives the CC
    // report and the ZVA flow-sourced fallback.
    let qrows = [];
    try { qrows = await fetchDS("queue_performance"); }
    catch (e) { ctx.raw.cc.queuePerfError = `${e.status || ""} ${e.message || e}`.trim(); }

    // SLA/ASA/AHT/abandonment targets are VOICE CC targets — compute voice-only
    // (email/chat answer & handle times run to hours and would skew them).
    const chOffered = {};
    const agg = (keep) => {
      let offered = 0, abandoned = 0, handled = 0, soaSum = 0, soaN = 0, hdSum = 0, hdN = 0, within = 0;
      for (const r of qrows) {
        const ch = String(r.enter_channel || r.channel || "unknown").toLowerCase();
        const off = N(r, "queue_offered_count");
        if (keep === "*") chOffered[ch] = (chOffered[ch] || 0) + off;
        if (keep !== "*" && ch !== keep) continue;
        offered += off; abandoned += N(r, "abandoned_count");
        const h = N(r, "inbound_handled_count") || N(r, "handle_count"); handled += h;
        if (h > 0) { const soa = N(r, "speed_of_answer_duration"); soaSum += soa; soaN += h; if (soa <= SL_MS) within += h; }
        const hd = N(r, "handle_duration"), hc = N(r, "handle_count"); if (hc > 0) { hdSum += hd; hdN += hc; }
      }
      return { offered, abandoned, handled, soaSum, soaN, hdSum, hdN, within };
    };
    agg("*"); // channel breakdown
    const channel = chOffered.voice ? "voice" : "*";
    const tag = channel === "voice" ? "voice" : "all channels";
    const a = agg(channel);
    if (a.offered > 0) {
      setIf(ctx, "abandon_rate", (a.abandoned / a.offered) * 100, `CX queue_performance (${tag})`);
      setIf(ctx, "sla", (a.within / a.offered) * 100, `CX queue_performance (${tag}, answered ≤${SL_MS / 1000}s ÷ offered)`);
    }
    if (a.soaN > 0) setIf(ctx, "asa", ms2s(a.soaSum / a.soaN), `CX queue_performance (${tag}, speed_of_answer)`);
    if (a.hdN > 0) setIf(ctx, "aht", ms2s(a.hdSum / a.hdN), `CX queue_performance (${tag}, handle_duration)`);
    ctx.raw.cc.channelOffered = chOffered; ctx.raw.cc.channelScope = tag;
    ctx.raw.cc.offered = a.offered; ctx.raw.cc.handled = a.handled; ctx.raw.cc.abandoned = a.abandoned;

    // --- Engagement dataset: channel mix, repeat-contact (FCR proxy), Expert Assist ---
    const erows = (await safeCall(() => fetchDS("engagement"))) || [];
    const transferred = new Set();
    if (erows.length) {
      const byConsumer = {}, mix = {}; let aiUsed = 0, aiTot = 0;
      for (const r of erows) {
        const ch = String(r.enter_channel || (r.channels && r.channels[0] && r.channels[0].channel) || "unknown").toLowerCase();
        mix[ch] = (mix[ch] || 0) + 1;
        const name = r.consumer && r.consumer.consumer_name;
        if (name) byConsumer[name] = (byConsumer[name] || 0) + 1;
        const aiea = String(r.aiea_usage || "").toLowerCase();
        if (aiea) { aiTot++; if (!["not_used", "disabled", "none", "no", "unknown", "n/a"].includes(aiea)) aiUsed++; }
        if (N(r, "transfer_completed_count") + N(r, "warm_transfer_completed_count") + N(r, "direct_transfer_count") + N(r, "conference_count") > 0)
          transferred.add(r.engagement_id);
      }
      ctx.raw.cc.channelMix = mix;
      // Denominator = all engagements; numerator = engagements from NAMED consumers
      // seen more than once (blank names are not collapsed into one bucket).
      const totalEng = erows.length;
      const repeatEng = Object.values(byConsumer).filter((c) => c > 1).reduce((s, c) => s + c, 0);
      if (totalEng > 0) {
        const rr = (repeatEng / totalEng) * 100;
        setIf(ctx, "repeat_contact", rr, "CX engagement (repeat named consumers ÷ all)");
        setIf(ctx, "fcr", 100 - rr, "CX engagement (1 − repeat, proxy)");
      }
      if (aiTot > 0) setIf(ctx, "expert_assist", (aiUsed / aiTot) * 100, "CX engagement (aiea_usage)");
    }

    // --- Agent performance: human AHT on escalated engagements (join by engagement_id) ---
    const arows = (await safeCall(() => fetchDS("agent_performance"))) || [];
    if (arows.length) {
      let escSum = 0, escN = 0, aSum = 0, aN = 0;
      for (const r of arows) {
        if (String(r.channel || "").toLowerCase() !== "voice") continue; // voice AHT only
        const hd = N(r, "handle_duration"), hc = N(r, "handled_count");
        if (hc > 0) { aSum += hd; aN += hc; if (transferred.has(r.engagement_id)) { escSum += hd; escN += hc; } }
      }
      if (escN > 0) setIf(ctx, "human_aht_escalated", ms2s(escSum / escN), "CX agent_performance (voice, transferred)");
      ctx.raw.cc.agentAhtSec = aN > 0 ? round(ms2s(aSum / aN), 0) : null;
    }

    // --- Agent occupancy from timecard: Occupied ÷ (Occupied + Ready) ---
    const tcrows = (await safeCall(() => fetchDS("agent_timecard"))) || [];
    if (tcrows.length) {
      let occ = 0, ready = 0;
      for (const r of tcrows) {
        const s = String(r.user_status || "").toLowerCase();
        const ws = N(r, "work_session_duration");
        if (s === "occupied") occ += ws; else if (s === "ready") ready += ws;
      }
      if (occ + ready > 0) setIf(ctx, "occupancy", (occ / (occ + ready)) * 100, "CX agent_timecard (occupied ÷ occupied+ready)");
      ctx.raw.cc.occupiedMin = Math.round(occ / 60000); ctx.raw.cc.readyMin = Math.round(ready / 60000);
    }

    // --- Flow performance: self-service containment & deflection (IVR/flows) ---
    // Bot-specific ZVA metrics need ZVA traffic; flow containment is the best
    // automation signal when there is no Virtual Agent data.
    const frows = (await safeCall(() => fetchDS("flow_performance"))) || [];
    if (frows.length) {
      let fo = 0, oa = 0, hbq = 0, durSum = 0, durN = 0;
      const byFlow = {};
      for (const r of frows) {
        const o = N(r, "flow_offered_count"), a = N(r, "offered_to_agent_count"), q = N(r, "handled_by_queue_count");
        fo += o; oa += a; hbq += q;
        const d = N(r, "flow_duration"); if (d > 0) { durSum += d; durN++; }
        const fn = r.flow_name || r.flow_id || r.flow || "Unnamed flow";
        const e = (byFlow[fn] = byFlow[fn] || { flow: fn, offered: 0, toAgent: 0, handledByQueue: 0 });
        e.offered += o; e.toAgent += a; e.handledByQueue += q;
      }
      if (fo > 0) {
        const contained = (1 - oa / fo) * 100; // resolved without reaching a live agent
        setIf(ctx, "containment", contained, "CX flow_performance (self-service, no agent)");
        setIf(ctx, "deflection", contained, "CX flow_performance (self-service deflection)");
        ctx.raw.cc.flowOffered = fo; ctx.raw.cc.flowToAgent = oa;
        // Per-flow detail powers the Optimization report when standalone ZVA is empty.
        let avgDur = durN ? durSum / durN : null;
        if (avgDur != null && avgDur > 1000) avgDur /= 1000; // ms → s
        ctx.raw.cc.flows = {
          offered: fo, toAgent: oa, handledByQueue: hbq,
          avgDurationSec: avgDur != null ? Math.round(avgDur) : null,
          byFlow: Object.values(byFlow).sort((a, b) => b.offered - a.offered).slice(0, 8),
        };
      }
    }

    // Stash the rows already fetched (transient — NOT persisted) so the deep CC
    // report, which runs LAST in the pipeline, can reuse them with zero extra
    // subrequests and only spend leftover budget on its supplementary datasets.
    ctx._cc = { qrows, erows, arows, tcrows, frows, slMs: SL_MS, win };

    ctx.miss("csat", "CSAT not in CX Analytics datasets — capture via ZCC post-interaction survey export");
    for (const k of ccKeys) if (!ctx.metrics[k]) ctx.miss(k, "Not derivable from CX Analytics datasets for this window");
  });
}

// Lowest-priority collector: builds the deep CC report from rows already fetched
// by contactCenter (zero extra subrequests for the core sections) and spends only
// LEFTOVER budget on supplementary datasets (disposition / journey / outbound).
// Runs last so core domains (webinars, ZRA, etc.) get budget first.
export async function contactCenterReport(ctx) {
  if (!ctx._cc) return; // CC domain absent/failed
  const { qrows, erows, arows, tcrows, frows, slMs, win } = ctx._cc;
  // This is the LAST collector — nothing downstream to starve — so it may spend
  // all remaining budget. Order by value: dispositions, journeys, then outbound.
  const ds = (n) => ctx.client.get(`/contact_center/analytics/dataset/historical/${n}`, { ...win, page_size: 300 });
  const disprows = ctx.client.remaining() > 1 ? rowsFrom(await safeCall(() => ds("disposition")) || {}) : [];
  let journeys = [];
  if (ctx.client.remaining() > 1) {
    const jr = await safeCall(() => ctx.client.get("/contact_center/analytics/log/historical/journey", { ...win, page_size: 100 }));
    journeys = jr ? rowsFrom(jr) : [];
  }
  const obrows = ctx.client.remaining() > 1 ? rowsFrom(await safeCall(() => ds("outbound_dialer_performance")) || {}) : [];
  ctx.raw.ccReport = buildCcReport({ from: ctx.from, to: ctx.to, slMs, qrows, erows, arows, tcrows, frows, disprows, obrows, journeys });
}

// Build the deep Contact Center report (compact aggregates) from CX Analytics
// rows. Durations in CX datasets are MILLISECONDS (timecard too); status_history
// is seconds. All field names verified against live PFI responses.
export function buildCcReport({ from, to, slMs = 30000, qrows = [], erows = [], arows = [], tcrows = [], frows = [], disprows = [], earows = [], obrows = [], journeys = [] }) {
  const N = (r, k) => Number(r[k]) || 0;
  const s1 = (ms) => (ms == null ? null : Math.round(ms / 1000)); // ms → s
  const m1 = (ms) => (ms == null ? null : Math.round(ms / 60000)); // ms → min
  const pctR = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
  const meanR = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const sortTop = (obj, key, n = 12) => Object.values(obj).sort((a, b) => (b[key] || 0) - (a[key] || 0)).slice(0, n);
  const tally = (arr, get) => { const m = {}; for (const r of arr) { const k = get(r); if (k) m[k] = (m[k] || 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1]); };

  // ---- Overview ----
  const channelMix = {}, directionMix = {};
  for (const r of erows) {
    const ch = String(r.enter_channel || (r.channels && r.channels[0] && r.channels[0].channel) || "unknown").toLowerCase();
    channelMix[ch] = (channelMix[ch] || 0) + 1;
    const d = String(r.direction || "unknown").toLowerCase(); directionMix[d] = (directionMix[d] || 0) + 1;
  }

  // ---- Queues ----
  const qMap = {};
  let totOffered = 0, totHandled = 0;
  // Headline SLA/ASA/AHT are VOICE-ONLY (email/chat answer & handle times run to
  // hours and would distort the service-level view); per-queue keeps each channel.
  let vOffered = 0, vHandled = 0, vAband = 0, vWithin = 0;
  const vSoa = [], vAht = [];
  for (const r of qrows) {
    const name = r.queue_name || r.queue_id || "Unknown queue";
    const ch = String(r.enter_channel || r.channel || "unknown").toLowerCase();
    const e = (qMap[name] = qMap[name] || { name, channel: ch, offered: 0, handled: 0, abandoned: 0, within: 0, soa: [], aht: [], transfers: 0, holds: 0, callbacks: 0 });
    const off = N(r, "queue_offered_count"), h = N(r, "inbound_handled_count") || N(r, "handle_count");
    e.offered += off; e.handled += h; e.abandoned += N(r, "abandoned_count");
    e.transfers += N(r, "transfer_completed_count") + N(r, "warm_transfer_completed_count") + N(r, "direct_transfer_count");
    e.holds += N(r, "hold_count"); e.callbacks += N(r, "callback_handled_count");
    totOffered += off; totHandled += h;
    const soa = N(r, "speed_of_answer_duration");
    if (h > 0) { e.soa.push(soa); if (soa <= slMs) e.within++; }
    const hd = N(r, "inbound_handle_duration") || N(r, "handle_duration"); if (hd > 0) e.aht.push(hd);
    if (ch === "voice") {
      vOffered += off; vHandled += h; vAband += N(r, "abandoned_count");
      if (h > 0) { vSoa.push(soa); if (soa <= slMs) vWithin++; }
      if (hd > 0) vAht.push(hd);
    }
  }
  const queues = sortTop(qMap, "offered").map((q) => ({
    name: q.name, channel: q.channel, offered: q.offered, handled: q.handled, abandoned: q.abandoned,
    abandonRate: pctR(q.abandoned, q.offered), slaPct: pctR(q.within, q.offered),
    asaSec: s1(meanR(q.soa)), ahtSec: s1(meanR(q.aht)), transfers: q.transfers, holds: q.holds, callbacks: q.callbacks,
  }));

  // ---- Agents ----
  const aMap = {};
  for (const r of arows) {
    const name = r.user_name || r.user_id || "Unknown agent";
    const e = (aMap[name] = aMap[name] || { name, handled: 0, offered: 0, aht: [], transfers: 0, declined: 0, ring: [] });
    const h = N(r, "handled_count"); e.handled += h; e.offered += N(r, "agent_offered_count");
    const hd = N(r, "inbound_handle_duration") || N(r, "handle_duration"); if (hd > 0 && h > 0) e.aht.push(hd);
    e.transfers += N(r, "transfer_completed_count") + N(r, "warm_transfer_completed_count") + N(r, "direct_transfer_count");
    e.declined += N(r, "agent_declined_count") + N(r, "agent_missed_count") + N(r, "agent_refused_count");
    const rd = N(r, "ring_duration"); if (rd > 0) e.ring.push(rd);
  }
  // Occupancy per user from timecard (ms): Occupied ÷ (Occupied+Ready)
  const occMap = {};
  for (const r of tcrows) {
    const name = r.user_name || r.user_id; if (!name) continue;
    const st = String(r.user_status || "").toLowerCase(), ws = N(r, "work_session_duration");
    const e = (occMap[name] = occMap[name] || { occ: 0, ready: 0 });
    if (st === "occupied") e.occ += ws; else if (st === "ready") e.ready += ws;
  }
  const agents = sortTop(aMap, "handled").map((a) => {
    const o = occMap[a.name];
    return { name: a.name, handled: a.handled, offered: a.offered, ahtSec: s1(meanR(a.aht)), transfers: a.transfers,
      declined: a.declined, ringSec: s1(meanR(a.ring)), occupancy: o && o.occ + o.ready > 0 ? pctR(o.occ, o.occ + o.ready) : null };
  });

  // ---- Dispositions ----
  const dispositions = tally(disprows, (r) => r.disposition_name || r.tier1_disposition_name).slice(0, 12).map(([name, count]) => ({ name, count }));
  const dispoBySource = Object.fromEntries(tally(disprows, (r) => r.disposition_source));

  // ---- Flows ----
  const fMap = {};
  for (const r of frows) {
    const name = r.flow_name || r.flow_id || "Unnamed flow";
    const e = (fMap[name] = fMap[name] || { name, offered: 0, toQueue: 0, handledByQueue: 0, toAgent: 0, handledByAgent: 0, dur: [] });
    e.offered += N(r, "flow_offered_count"); e.toQueue += N(r, "offered_to_queue_count"); e.handledByQueue += N(r, "handled_by_queue_count");
    e.toAgent += N(r, "offered_to_agent_count"); e.handledByAgent += N(r, "handled_by_agent_count");
    const d = N(r, "flow_duration"); if (d > 0) e.dur.push(d);
  }
  const flows = sortTop(fMap, "offered").map((f) => ({
    name: f.name, offered: f.offered, toAgent: f.toAgent, handledByQueue: f.handledByQueue,
    containmentPct: pctR(f.offered - f.toAgent, f.offered), avgDurationSec: s1(meanR(f.dur)),
  }));

  // ---- Expert Assist (AI) ----
  let aiUsed = 0, aiTot = 0;
  for (const r of erows) { const a = String(r.aiea_usage || "").toLowerCase(); if (a) { aiTot++; if (!["not_used", "disabled", "none", "no", "unknown", "n/a"].includes(a)) aiUsed++; } }
  const expertAssist = {
    adoptionPct: pctR(aiUsed, aiTot), used: aiUsed, total: aiTot,
    byFeature: Object.fromEntries(tally(earows, (r) => r.expert_assist_feature)),
    byStatus: Object.fromEntries(tally(earows, (r) => r.expert_assist_status)),
  };

  // ---- Outbound dialer ----
  let obConnected = 0, obAnswered = 0, obFailed = 0, obAmd = 0, obDnc = 0;
  for (const r of obrows) { obConnected += N(r, "contacts_connected_count"); obAnswered += N(r, "calls_answered_count"); obFailed += N(r, "calls_failed_count"); obAmd += N(r, "calls_with_amd_count"); obDnc += N(r, "dnc_count"); }
  const outbound = obrows.length ? { engagements: obrows.length, connected: obConnected, answered: obAnswered, failed: obFailed, amd: obAmd, dnc: obDnc,
    connectRatePct: pctR(obConnected, obConnected + obFailed), campaigns: tally(obrows, (r) => (r.campaign && (r.campaign.campaign_name || r.campaign.name)) || null).slice(0, 8).map(([name, count]) => ({ name, count })) } : null;

  // ---- Journeys (cross-product) ----
  const prodKeys = ["zoom_phone_users", "shared_line_groups", "auto_receptionists", "common_areas", "zoom_rooms", "call_queues"];
  let crossProduct = 0;
  for (const r of journeys) if (prodKeys.some((k) => Array.isArray(r[k]) && r[k].length)) crossProduct++;
  const journeySummary = journeys.length ? {
    total: journeys.length, crossProduct,
    channels: Object.fromEntries(tally(journeys, (r) => r.channels && r.channels[0] && r.channels[0].channel)),
    directions: Object.fromEntries(tally(journeys, (r) => r.direction)),
    topEntry: tally(journeys, (r) => r.dnis_to).slice(0, 6).map(([dnis, count]) => ({ dnis, count })),
  } : null;

  // ---- Opportunities ----
  const overallSla = pctR(vWithin, vOffered), overallAband = pctR(vAband, vOffered);
  const overallAsa = s1(meanR(vSoa)), overallAht = s1(meanR(vAht));
  const opp = [];
  const worstAband = queues.filter((q) => q.abandonRate != null && q.abandonRate > 8 && q.offered >= 5).slice(0, 3);
  if (worstAband.length) opp.push({ priority: "High", title: "Reduce queue abandonment", detail: `High abandonment: ${worstAband.map((q) => `${q.name} ${q.abandonRate}%`).join(", ")}. Review staffing/coverage and callback offers on these queues.` });
  if (overallSla != null && overallSla < 80) opp.push({ priority: "High", title: "Raise service level", detail: `Overall SLA ${overallSla}% answered ≤${Math.round(slMs / 1000)}s (ASA ${overallAsa ?? "—"}s). Add coverage at peak intervals or adjust routing.` });
  const highDeclg = agents.filter((a) => a.declined >= 3 && a.handled > 0).slice(0, 3);
  if (highDeclg.length) opp.push({ priority: "Medium", title: "Coach agents on missed/declined offers", detail: `Elevated declined/missed: ${highDeclg.map((a) => `${a.name} (${a.declined})`).join(", ")}. Check availability and routing fit.` });
  const occVals = agents.map((a) => a.occupancy).filter((x) => x != null);
  const avgOcc = occVals.length ? Math.round(meanR(occVals)) : null;
  if (avgOcc != null && avgOcc > 85) opp.push({ priority: "Medium", title: "Occupancy risk (burnout)", detail: `Average agent occupancy ${avgOcc}% — sustained >85% drives burnout/attrition. Add headcount or rebalance.` });
  else if (avgOcc != null && avgOcc < 40) opp.push({ priority: "Low", title: "Low occupancy", detail: `Average agent occupancy ${avgOcc}% — capacity available; consider blended/outbound or schedule tightening.` });
  const totTransfers = queues.reduce((s, q) => s + q.transfers, 0);
  if (overallSla != null && totHandled > 0 && pctR(totTransfers, totHandled) > 20) opp.push({ priority: "Medium", title: "High transfer rate", detail: `${pctR(totTransfers, totHandled)}% of handled interactions are transferred — review routing/skilling and first-contact coverage.` });
  if (expertAssist.adoptionPct != null && expertAssist.adoptionPct < 20) opp.push({ priority: "Medium", title: "Adopt AI Expert Assist", detail: `AI Expert Assist used on ${expertAssist.adoptionPct}% of engagements — enable for more queues to speed handling and improve quality.` });
  const flowDrop = flows.filter((f) => f.offered >= 5 && f.containmentPct != null && f.containmentPct < 40).slice(0, 2);
  if (flowDrop.length) opp.push({ priority: "Low", title: "Improve flow self-service", detail: `Low self-service containment on: ${flowDrop.map((f) => `${f.name} ${f.containmentPct}%`).join(", ")}. Add automation/Virtual Agent before agent routing.` });
  if (!dispositions.length) opp.push({ priority: "Low", title: "Enforce disposition capture", detail: "No dispositions recorded in window — require agents to disposition interactions for reporting and QA." });

  return {
    available: !!(qrows.length || erows.length || arows.length),
    window: { from, to },
    overview: {
      engagements: erows.length, queuesActive: Object.keys(qMap).length, agentsActive: Object.keys(aMap).length,
      channels: channelMix, directions: directionMix,
      sla: overallSla, abandonRate: overallAband, asaSec: overallAsa, ahtSec: overallAht, slaScope: "voice",
      handled: totHandled, offered: totOffered, voiceOffered: vOffered, voiceHandled: vHandled,
    },
    queues, agents, dispositions, dispoBySource, flows, expertAssist, outbound, journeys: journeySummary,
    records: (erows || []).slice(0, 300).map((r) => {
      let d = N(r, "duration"); if (d > 1000) d = Math.round(d / 1000);
      return { id: r.engagement_id, direction: r.direction || "", channel: String(r.enter_channel || (r.channels && r.channels[0] && r.channels[0].channel) || "").toLowerCase(),
        consumer: (r.consumer && (r.consumer.consumer_name || r.consumer.consumer_email)) || "", durationSec: d || null,
        transfers: N(r, "transfer_completed_count") + N(r, "warm_transfer_completed_count") + N(r, "direct_transfer_count"), ai: r.aiea_usage || "" };
    }),
    recordsTotal: (erows || []).length,
    opportunities: opp.length ? attachSteps(opp) : [{ priority: "—", title: "No material Contact Center findings in window", detail: "Metrics are within range or volume is low — widen the window or review per-queue detail." }],
  };
}

// ===================================================================
// 7 — Virtual Agent (ZVA): bot effectiveness
// ===================================================================
export async function virtualAgent(ctx) {
  const zvaKeys = ["containment", "deflection", "bot_escalation", "intent_accuracy", "fallback_rate", "bot_aht", "ai_confidence"];
  await runDomain(ctx, "virtualAgent", zvaKeys, async () => {
    // ZVA report endpoints cap each request to ~30 days AND page_size to 100.
    const zvaDbg = {};
    const dayMs = 86400000;
    let win = null;
    const fetchZva = async (path, maxPages = 5) => {
      const name = path.replace("/virtual_agent/report/", "");
      const rows = []; let token, pages = 0, first = true;
      try {
        do {
          const page = await ctx.client.get(path, { ...win, page_size: 100, next_page_token: token });
          if (first) {
            first = false;
            const arrK = Object.keys(page).find((k) => Array.isArray(page[k]));
            zvaDbg[name] = {
              keys: Object.keys(page), arrayKey: arrK || null,
              len: arrK ? page[arrK].length : 0,
              sampleFields: arrK && page[arrK][0] && typeof page[arrK][0] === "object" ? Object.keys(page[arrK][0]) : [],
            };
          }
          rows.push(...rowsFrom(page));
          token = page.next_page_token; pages++;
        } while (token && pages < maxPages && ctx.client.remaining() > 4);
      } catch (e) {
        zvaDbg[name] = { error: `${e.status || ""} ${e.message || e}`.trim() };
      }
      return rows;
    };
    const keyOf = (r, re) => Object.keys(r).find((k) => re.test(k));
    const mkWin = (toMs) => ({ from: isoStart(new Date(toMs - 29 * dayMs).toISOString().slice(0, 10)), to: isoEnd(new Date(toMs).toISOString().slice(0, 10)) });

    // Pick the ZVA window: the most recent 30-day window WITH bot engagements
    // (scan back up to ~6 months so demo/sparse bots still surface).
    let eng = [], scannedBack = 0;
    const baseTo = Date.parse(ctx.to);
    for (let i = 0; i <= 6 && ctx.client.remaining() > 10; i++) {
      win = mkWin(baseTo - i * 30 * dayMs);
      const rows = await safeCall(() => fetchZva("/virtual_agent/report/engagements", 3));
      if (rows && rows.length) { eng = rows; scannedBack = i; break; }
    }
    // Supplementary endpoints (query_details adds per-query rows; surveys = CSAT).
    const q = (await safeCall(() => fetchZva("/virtual_agent/report/engagements/query_details"))) || [];
    const surveys = (await safeCall(() => fetchZva("/virtual_agent/report/surveys"))) || [];
    const trResp = await safeCall(() => ctx.client.get("/virtual_agent/report/transcripts", { ...win, page_size: 50 }));
    const transcripts = trResp ? rowsFrom(trResp) : [];
    if (trResp) { const ak = Object.keys(trResp).find((k) => Array.isArray(trResp[k])); zvaDbg.transcripts = { keys: Object.keys(trResp), arrayKey: ak || null, len: ak ? trResp[ak].length : 0, sampleFields: ak && trResp[ak][0] ? Object.keys(trResp[ak][0]) : [] }; }
    const vars = (await safeCall(() => fetchZva("/virtual_agent/report/engagements/variables"))) || [];
    const engR = eng || [], qR = q || [];

    // ---- Schema-aware field extraction (ZVA engagement / query_details records) ----
    // Intents are NESTED under intent_summary.intents_matched[] with
    // {intent_name, intent_type, accuracy(0-1), system_intent}. Resolution =
    // implicit_resolution; escalation = transfer_accepted | outcome | a human in
    // agents[]; duration = interaction_duration (seconds). Heuristic fallbacks
    // are kept so flat-shaped rows (if any endpoint returns them) still parse.
    const fk = (r, re) => Object.keys(r).find((k) => re.test(k));
    const num = (x) => { const n = Number(x); return Number.isNaN(n) ? null : n; };
    const matchedIntents = (r) => {
      const s = r.intent_summary || {};
      const arr = Array.isArray(s.intents_matched) ? s.intents_matched
        : Array.isArray(r.intents_matched) ? r.intents_matched
        : Array.isArray(r.intents) ? r.intents : [];
      return arr.filter((x) => x && typeof x === "object");
    };
    const intentNameOf = (m) => String(m.intent_name || m.name || m.matched_intent || m.intent || "").trim();
    const intentTypeOf = (m) => String(m.intent_type || m.type || "").toLowerCase();
    const accuracyOf = (m) => { const a = num(m.accuracy ?? m.confidence ?? m.score); return a == null ? null : a > 1 ? a / 100 : a; };
    const isFallbackType = (t) => !t || /default|fallback|no_?match|none|unmatched|small_?talk/.test(t);
    const outcomeOf = (r) => String(r.outcome || "").toLowerCase();
    const lastResponderOf = (r) => String(r.last_responder || "").toLowerCase();
    const resolutionStr = (r) => String(r.implicit_resolution ?? r.resolution ?? r.resolved ?? "").toUpperCase();
    // Escalation: explicit transfer flag, an assistance/transfer outcome, a human
    // last-responder, or a non-AI agent on the engagement.
    const isEscalated = (r) =>
      r.transfer_accepted === true ||
      /assistance|escalat|transfer|to_?agent|live_?agent|handoff|agent_?requested/.test(outcomeOf(r)) ||
      /agent|human/.test(lastResponderOf(r)) ||
      (Array.isArray(r.agents) && r.agents.some((a) => a && !/AI|BOT|VIRTUAL/i.test(String(a.agent_type || a.type || ""))));
    // Contained: Zoom's own self-serve/resolved outcome, or RESOLVED resolution,
    // and not escalated to a human.
    const isContained = (r) => {
      if (isEscalated(r)) return false;
      if (/self.?serv|deflect|contain|resolved|complete|success/.test(outcomeOf(r))) return true;
      const s = resolutionStr(r); return /RESOLV|CONTAIN|SUCCESS|COMPLETE/.test(s) && !/NOT|UN|FAIL/.test(s);
    };
    const durationOf = (r) => num(r.interaction_duration ?? r.duration ?? r.bot_duration ?? r.engagement_duration);
    const channelOf = (r) => {
      if (Array.isArray(r.source_types) && r.source_types.length) return String(r.source_types[0]).toLowerCase();
      if (Array.isArray(r.agents) && r.agents[0]) return String(r.agents[0].agent_type || "bot").toLowerCase();
      const k = fk(r, /enter_channel|^channel$/i);
      if (k) { const v = r[k]; return String(v && typeof v === "object" ? v.channel || "unknown" : v || "unknown").toLowerCase(); }
      return "bot";
    };
    const queryTextOf = (r) => { const k = fk(r, /query_text|utterance|message|^query$|^text$/i); return k ? String(r[k]).trim() : ""; };
    const topicOf = (r) => (Array.isArray(r.topics) && r.topics[0] ? String(r.topics[0]) : "");

    // ---- Aggregate over engagements (session-level: containment, escalation, AHT) ----
    let sessions = engR.length, contained = 0, escalated = 0, durSum = 0, durN = 0;
    let engWithIntentData = 0, engFallback = 0;
    const intentTally = {}, fallbackTally = {}, channels = {}, topicTally = {};
    const accuracies = [], kbScores = [];
    const bump = (m, k, n = 1) => { if (k) m[k] = (m[k] || 0) + n; };
    for (const r of engR) {
      if (isEscalated(r)) escalated++;
      if (isContained(r)) contained++;
      const d = durationOf(r); if (d != null && d > 0) { durSum += d; durN++; }
      bump(channels, channelOf(r));
      if (topicOf(r)) bump(topicTally, topicOf(r));
      // Documented (voice) shape carries matched intents on the engagement itself;
      // count engagement-level fallback only when the engagement actually carries
      // intent data (live chat/KB engagements have none — their signal is in queries).
      const ms = matchedIntents(r);
      if (ms.length || r.intent_summary) {
        engWithIntentData++;
        for (const m of ms) { const a = accuracyOf(m); if (a != null) accuracies.push(a); }
        const nonFallback = ms.filter((m) => !isFallbackType(intentTypeOf(m)));
        if (nonFallback.length) for (const m of nonFallback) bump(intentTally, intentNameOf(m));
        else { engFallback++; bump(fallbackTally, topicOf(r) || queryTextOf(r) || "(no matched intent)"); }
      }
    }

    // ---- Query-level analysis: descend into query_details[] (live chat/KB shape) ----
    // A query_details row is { engagement_id, query_details:[ {query_text, intents,
    // articles:[{article_score}], topic_name} ] }. The documented (voice) shape
    // instead exposes intents on the row itself; handle both.
    const queries = [];
    for (const r of qR) {
      if (Array.isArray(r.query_details)) queries.push(...r.query_details);
      else queries.push(r);
    }
    let qTotal = 0, qMatched = 0;
    for (const qq of queries) {
      qTotal++;
      const ints = (Array.isArray(qq.intents) ? qq.intents : matchedIntents(qq)).filter((x) => x && typeof x === "object");
      const nonFallback = ints.filter((m) => !isFallbackType(intentTypeOf(m)));
      for (const m of ints) { const a = accuracyOf(m); if (a != null) accuracies.push(a); }
      if (Array.isArray(qq.articles)) for (const a of qq.articles) { const s = num(a.article_score); if (s != null) kbScores.push(s > 1 ? s / 100 : s); }
      if (nonFallback.length) { qMatched++; for (const m of nonFallback) bump(intentTally, intentNameOf(m)); }
      else bump(fallbackTally, queryTextOf(qq) || String(qq.topic_name || "") || "(no-match query)");
    }

    // Fallback rate / intent accuracy from the query level when query_details exist;
    // otherwise from engagement-level matched intents (voice shape).
    let fr = null;
    if (qTotal) fr = round((1 - qMatched / qTotal) * 100, 1);
    else if (engWithIntentData) fr = round((engFallback / engWithIntentData) * 100, 1);

    if (sessions) {
      const containment = round((contained / sessions) * 100, 1);
      ctx.set("containment", containment, "ZVA engagements (self-serviced/resolved ÷ sessions)");
      ctx.set("deflection", containment, "ZVA engagements (self-service)");
      ctx.set("bot_escalation", round((escalated / sessions) * 100, 1), "ZVA engagements (escalated to agent ÷ sessions)");
      if (durN) { let aht = durSum / durN; if (aht > 1000) aht /= 1000; ctx.set("bot_aht", round(aht, 0), "ZVA engagements (interaction_duration)"); }
    }
    if (fr != null) {
      ctx.set("fallback_rate", fr, qTotal ? "ZVA query_details (no-intent queries ÷ queries)" : "ZVA engagements (unmatched ÷ matched+unmatched)");
      ctx.set("intent_accuracy", round(100 - fr, 1), qTotal ? "ZVA query_details (matched ÷ queries)" : "ZVA engagements (matched ÷ total)");
    }
    // AI confidence: matched-intent accuracy if available, else KB article relevance.
    const confPool = accuracies.length ? accuracies : kbScores;
    const confSrc = accuracies.length ? "ZVA intents (avg match accuracy)" : "ZVA query_details (avg KB article relevance)";
    if (confPool.length) ctx.set("ai_confidence", round(confPool.reduce((a, b) => a + b, 0) / confPool.length, 2), confSrc);

    const sortTally = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]);
    const topIntents = sortTally(intentTally).slice(0, 8).map(([intent, count]) => ({ intent, count }));
    const topFallbacks = sortTally(fallbackTally).slice(0, 8).map(([query, count]) => ({ query, count }));
    const topTopics = sortTally(topicTally).slice(0, 8).map(([topic, count]) => ({ topic, count }));
    const lowConf = confPool.filter((x) => x < 0.5).length;
    const lowPct = confPool.length ? Math.round((lowConf / confPool.length) * 100) : null;
    const surveyScores = surveys.map((r) => { const k = fk(r, /csat|nps|score|rating/i); return k ? Number(r[k]) : NaN; }).filter((x) => !Number.isNaN(x));
    const csat = surveyScores.length ? round(surveyScores.reduce((a, b) => a + b, 0) / surveyScores.length, 2) : null;
    const containment = sessions ? round((contained / sessions) * 100, 1) : null;
    const kbConfidence = accuracies.length === 0 && kbScores.length > 0;

    const fbCount = Object.values(fallbackTally).reduce((a, b) => a + b, 0);
    const opp = [];
    if (topFallbacks.length && fbCount) opp.push({ priority: "High", title: "Cover top no-match queries", detail: `${fbCount} ${qTotal ? "queries" : "engagements"} had no matched intent. Add intents / KB articles for the most-missed: ${topFallbacks.slice(0, 3).map((f) => `“${f.query}” ×${f.count}`).join(", ")}.` });
    if (lowPct != null && lowPct > 20) opp.push({ priority: "High", title: kbConfidence ? "Improve KB article relevance" : "Ground the knowledge base", detail: `${lowPct}% of ${kbConfidence ? "KB article matches scored" : "matched intents scored"} below 0.5 — ${kbConfidence ? "tighten KB articles / add coverage for these topics" : "improve KB grounding / training phrases"}.` });
    if (containment != null && containment < 60) opp.push({ priority: "Medium", title: "Raise containment", detail: `Containment ${containment}% — expand coverage on top-volume topics and enable generative answers.` });
    if (csat != null && csat < 4) opp.push({ priority: "Medium", title: "Improve bot CSAT", detail: `Bot CSAT ${csat} — review responses on low-rated interactions.` });
    if (topTopics.length) opp.push({ priority: "Low", title: "Maintain top topics", detail: `Highest-volume topics: ${topTopics.slice(0, 3).map((t) => `${t.topic} ×${t.count}`).join(", ")} — keep content current.` });
    else if (topIntents.length) opp.push({ priority: "Low", title: "Maintain top intents", detail: `Highest-volume intents: ${topIntents.slice(0, 3).map((i) => `${i.intent} ×${i.count}`).join(", ")} — keep answers current.` });

    // ---- Voice/Chat + per-agent segmentation (re-aggregation, 0 extra calls) ----
    // Agent identity: voice → agents[].agent_name; chat → bot_name (from
    // query_details) or campaign_name. Channel: agent_type / source_types.
    const pctR = (nn, dd) => (dd > 0 ? Math.round((nn / dd) * 1000) / 10 : null);
    const botByEng = {};
    for (const r of qR) { const b = (Array.isArray(r.query_details) && r.query_details[0] && r.query_details[0].bot_name) || r.bot_name; if (r.engagement_id && b) botByEng[r.engagement_id] = b; }
    const typeOf = (r) => {
      const at = (Array.isArray(r.agents) ? r.agents : []).map((a) => String(a.agent_type || a.type || "").toLowerCase());
      if (at.some((x) => /voice/.test(x))) return "voice";
      if (at.some((x) => /chat|messag/.test(x))) return "chat";
      const st = (Array.isArray(r.source_types) ? r.source_types : []).map((s) => String(s).toLowerCase());
      if (st.some((x) => /phone|voice/.test(x))) return "voice";
      if (st.some((x) => /chat|web|messag/.test(x))) return "chat";
      return /chat|bot/.test(lastResponderOf(r)) ? "chat" : "other";
    };
    const agentNameOf = (r) => {
      if (Array.isArray(r.agents) && r.agents[0] && (r.agents[0].agent_name || r.agents[0].name)) return String(r.agents[0].agent_name || r.agents[0].name);
      if (botByEng[r.engagement_id]) return botByEng[r.engagement_id];
      if (r.campaign_name) return String(r.campaign_name);
      return "(unnamed agent)";
    };
    const turnsOf = (r) => num(r.interaction_turns);
    const isDropOff = (r) => /drop|non.?engaged|abandon/.test(outcomeOf(r)) || (turnsOf(r) != null && turnsOf(r) <= 1 && !isContained(r) && !isEscalated(r));
    const mkSeg = (extra = {}) => ({ sessions: 0, contained: 0, escalated: 0, dropOffs: 0, multiTurn: 0, durSum: 0, durN: 0, turnsSum: 0, turnsN: 0, implicitResolved: 0, toolUsed: 0, topics: {}, fallbacks: {}, articles: {}, ...extra });
    const engToAgent = {};
    const chanSeg = {}, agentSeg = {};
    let multiTurn = 0, dropOffs = 0, toolUsed = 0, implicitResolved = 0, intDurSum = 0, intDurN = 0;
    for (const r of engR) {
      const type = typeOf(r), agent = agentNameOf(r);
      engToAgent[r.engagement_id] = agent;
      const cs = (chanSeg[type] = chanSeg[type] || mkSeg());
      const as = (agentSeg[agent] = agentSeg[agent] || mkSeg({ agent, channel: type }));
      const t = turnsOf(r), dv = durationOf(r); let ds = dv; if (ds != null && ds > 1000) ds /= 1000;
      const cont = isContained(r), esc = isEscalated(r), drop = isDropOff(r), res = /RESOLV/.test(resolutionStr(r)), tool = Array.isArray(r.tools) && r.tools.length > 0;
      for (const seg of [cs, as]) {
        seg.sessions++; if (cont) seg.contained++; if (esc) seg.escalated++; if (drop) seg.dropOffs++;
        if (t != null) { seg.turnsSum += t; seg.turnsN++; if (t > 1) seg.multiTurn++; }
        if (ds != null && ds > 0) { seg.durSum += ds; seg.durN++; }
        if (res) seg.implicitResolved++; if (tool) seg.toolUsed++;
        if (topicOf(r)) bump(seg.topics, topicOf(r));
        if (Array.isArray(r.articles)) for (const a of r.articles) bump(seg.articles, String(a));
      }
      if (t != null && t > 1) multiTurn++; if (drop) dropOffs++; if (tool) toolUsed++; if (res) implicitResolved++;
      if (ds != null && ds > 0) { intDurSum += ds; intDurN++; }
    }
    // Query-level: match types, feedback, article usage, attributed to agents.
    let matchedArticle = 0, matchedIntent = 0, noMatchQ = 0, fbHelpful = 0, fbNot = 0, fbNo = 0;
    const articleTally = {};
    for (const r of qR) {
      const as = agentSeg[engToAgent[r.engagement_id]];
      const qds = Array.isArray(r.query_details) ? r.query_details : [r];
      for (const qq of qds) {
        const ints = (Array.isArray(qq.intents) ? qq.intents : matchedIntents(qq)).filter((x) => x && typeof x === "object");
        const nonFallback = ints.filter((m) => !isFallbackType(intentTypeOf(m)));
        const arts = Array.isArray(qq.articles) ? qq.articles : [];
        if (arts.length) { matchedArticle++; for (const a of arts) { const nm = a.article_title || a.title || a.article_name || a.name; if (nm) { bump(articleTally, String(nm)); if (as) bump(as.articles, String(nm)); } } }
        else if (nonFallback.length) matchedIntent++;
        else { noMatchQ++; if (as) bump(as.fallbacks, queryTextOf(qq) || String(qq.topic_name || "")); }
        if (as && qq.topic_name) bump(as.topics, String(qq.topic_name));
        const fb = String(qq.feedback || "").toLowerCase();
        if (/not.?help|unhelp|thumbs?_?down|negative/.test(fb)) fbNot++;
        else if (/help|thumbs?_?up|positive|good/.test(fb)) fbHelpful++;
        else fbNo++;
      }
    }
    const segOut = (s) => ({ sessions: s.sessions, containmentPct: pctR(s.contained, s.sessions), escalationPct: pctR(s.escalated, s.sessions), dropOffPct: pctR(s.dropOffs, s.sessions), multiTurn: s.multiTurn, avgInteractionSec: s.durN ? Math.round(s.durSum / s.durN) : null, avgTurns: s.turnsN ? Math.round((s.turnsSum / s.turnsN) * 10) / 10 : null });
    const byChannel = Object.fromEntries(Object.entries(chanSeg).map(([k, s]) => [k, segOut(s)]));
    const byAgent = Object.values(agentSeg).sort((a, b) => b.sessions - a.sessions).slice(0, 25).map((s) => ({
      agent: s.agent, channel: s.channel, ...segOut(s),
      implicitResolvedPct: pctR(s.implicitResolved, s.contained), toolUsed: s.toolUsed,
      topTopics: sortTally(s.topics).slice(0, 6).map(([topic, count]) => ({ topic, count })),
      topFallbacks: sortTally(s.fallbacks).slice(0, 6).map(([query, count]) => ({ query, count })),
      topArticles: sortTally(s.articles).slice(0, 6).map(([article, count]) => ({ article, count })),
    }));

    // ---- Deep records + article/knowledge/topic analytics for drill-down pages ----
    // Everything below is derived from engagements + query_details (no sub-endpoints
    // exist — all 404). Records are capped to bound stored size.
    const CAP_E = 400, CAP_Q = 1200;
    const records = [], dayMap = {}, topicPopular = {}, topicSolved = {}, topicEscalated = {}, engOutcome = {};
    for (const r of engR) {
      const cont = isContained(r), esc = isEscalated(r), day = String(r.start_time || "").slice(0, 10);
      if (r.engagement_id) engOutcome[r.engagement_id] = { contained: cont, escalated: esc, day };
      if (day) { const dm = (dayMap[day] = dayMap[day] || { date: day, engagements: 0, contained: 0, escalated: 0 }); dm.engagements++; if (cont) dm.contained++; if (esc) dm.escalated++; }
      for (const tp of Array.isArray(r.topics) ? r.topics : []) { bump(topicPopular, tp); if (cont) bump(topicSolved, tp); if (esc) bump(topicEscalated, tp); }
      if (records.length < CAP_E) {
        let d = durationOf(r); if (d != null && d > 1000) d /= 1000;
        records.push({
          id: r.engagement_id, source: (r.source_types || [])[0] || null, agent: agentNameOf(r), channel: typeOf(r),
          consumer: r.consumer_id || null, outcome: r.outcome || null, dropCategory: isDropOff(r) ? (r.drop_off_category || r.outcome || "drop-off") : null,
          tools: (r.tools || []).join(", "), skills: (r.skills || []).join(", "), topics: (r.topics || []).join(", "), articles: (r.articles || []).join(", "),
          implicitResolution: r.implicit_resolution || null, lastResponder: r.last_responder || null,
          turns: num(r.interaction_turns), durationSec: d != null ? Math.round(d) : null, start: r.start_time || null, end: r.end_time || null,
        });
      }
    }
    const queryRecords = [], articleMap = {}, kbMap = {};
    // Knowledge-performance accumulators (mirror Zoom's Knowledge report)
    const kaEng = new Set();          // engagements that referenced ≥1 article
    let articleRefTotal = 0;          // total article references
    const artMatchedTopics = {}, artEscalatedTopics = {}, fbByDay = {}, kaByDay = {};
    for (const r of qR) {
      const eid = r.engagement_id, agent = engToAgent[eid], meta = engOutcome[eid] || {};
      const qds = Array.isArray(r.query_details) ? r.query_details : [r];
      for (const qq of qds) {
        const arts = Array.isArray(qq.articles) ? qq.articles : [];
        const ints = (Array.isArray(qq.intents) ? qq.intents : matchedIntents(qq)).filter((x) => x && typeof x === "object");
        const nonFallback = ints.filter((m) => !isFallbackType(intentTypeOf(m)));
        const matchType = arts.length ? "Matched Article" : nonFallback.length ? "Matched Intent" : "No Match";
        const fb = String(qq.feedback || "").toLowerCase();
        const fbLabel = /not.?help|unhelp|down|negative/.test(fb) ? "Not helpful" : /help|up|positive|good/.test(fb) ? "Helpful" : "No response";
        const qDay = qq.query_time ? new Date(Number(qq.query_time)).toISOString().slice(0, 10) : (meta.day || null);
        if (arts.length && eid) kaEng.add(eid);
        if (arts.length && qq.topic_name) { bump(artMatchedTopics, qq.topic_name); if (meta.escalated) bump(artEscalatedTopics, qq.topic_name); }
        for (const a of arts) {
          articleRefTotal++;
          const key = a.article_title || a.article_id || "(article)";
          const am = (articleMap[key] = articleMap[key] || { title: key, url: a.article_url || null, source: a.article_source || "Manually added", kb: (a.kb_details && a.kb_details[0] && a.kb_details[0].kb_name) || null, queryMatch: 0, engIds: new Set(), helpful: 0, notHelpful: 0, noResponse: 0 });
          am.queryMatch++; if (eid) am.engIds.add(eid);
          const hr = String(a.helpful_response || "").toLowerCase();
          if (/not.?help|unhelp|down|negative/.test(hr)) am.notHelpful++; else if (/^help|thumbs?_?up|positive|good/.test(hr)) am.helpful++; else am.noResponse++;
          const kbn = a.kb_details && a.kb_details[0] && a.kb_details[0].kb_name;
          if (kbn) { const km = (kbMap[kbn] = kbMap[kbn] || { kb: kbn, articleMatches: 0, engIds: new Set(), articles: new Set() }); km.articleMatches++; km.articles.add(key); if (eid) km.engIds.add(eid); }
          if (qDay) { const d = (fbByDay[qDay] = fbByDay[qDay] || { date: qDay, helpful: 0, notHelpful: 0, noResponse: 0 }); if (/not.?help|unhelp|down|negative/.test(hr)) d.notHelpful++; else if (/^help|thumbs?_?up|positive|good/.test(hr)) d.helpful++; else d.noResponse++; }
        }
        if (arts.length && qDay) { const k = (kaByDay[qDay] = kaByDay[qDay] || { date: qDay, count: 0 }); k.count++; }
        if (qq.topic_name) bump(topicPopular, qq.topic_name);
        if (queryRecords.length < CAP_Q) queryRecords.push({
          query: qq.query_text || "", agent: agent || qq.bot_name || null, matchType, feedback: fbLabel,
          topArticle: arts[0] ? arts[0].article_title || null : null, score: arts[0] && arts[0].article_score != null ? Math.round(arts[0].article_score * 100) / 100 : null,
          topic: qq.topic_name || null, engagementId: eid || qq.engagement_id || null,
          date: qq.query_time ? new Date(Number(qq.query_time)).toISOString() : null,
        });
      }
    }
    const topN = (m, n = 10) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([topic, count]) => ({ topic, count }));
    const topPct = (m, tot, n = 5) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n).map(([topic, count]) => ({ topic, count, pct: tot ? Math.round((count / tot) * 100) : 0 }));
    const topicGroups = { popular: topN(topicPopular), solved: topN(topicSolved), escalated: topN(topicEscalated) };
    const rate = (nn, dd) => (dd > 0 ? Math.round((nn / dd) * 1000) / 10 : null);
    const articleStats = Object.values(articleMap).map((a) => ({ title: a.title, url: a.url, source: a.source, kb: a.kb, queryMatch: a.queryMatch, engagementUsed: a.engIds.size, helpful: a.helpful, notHelpful: a.notHelpful, noResponse: a.noResponse, helpfulRate: rate(a.helpful, a.queryMatch), notHelpfulRate: rate(a.notHelpful, a.queryMatch) })).sort((a, b) => b.queryMatch - a.queryMatch).slice(0, 50);
    const knowledgeStats = Object.values(kbMap).map((k) => ({ kb: k.kb, articleMatches: k.articleMatches, engagements: k.engIds.size, articles: k.articles.size })).sort((a, b) => b.engagements - a.engagements);
    const byDay = Object.values(dayMap).sort((a, b) => (a.date < b.date ? -1 : 1));
    // knowledge-assisted containment = contained engagements among those that used a KB article
    let kaContained = 0; for (const id of kaEng) if (engOutcome[id] && engOutcome[id].contained) kaContained++;
    const knowledge = {
      assistedEngagements: kaEng.size, assistedRate: rate(kaEng.size, sessions), assistedContainmentRate: rate(kaContained, kaEng.size),
      articleReferenced: articleRefTotal, avgPerEngagement: sessions ? Math.round((articleRefTotal / sessions) * 10) / 10 : null,
    };
    const articleTopicGroups = { matched: topPct(artMatchedTopics, articleRefTotal), escalated: topPct(artEscalatedTopics, Object.values(artEscalatedTopics).reduce((a, b) => a + b, 0)) };
    const feedbackByDay = Object.values(fbByDay).sort((a, b) => (a.date < b.date ? -1 : 1));
    const kaTrend = Object.values(kaByDay).sort((a, b) => (a.date < b.date ? -1 : 1));

    ctx.raw.zva = {
      available: !!(sessions || qTotal || surveys.length || transcripts.length),
      window: { from: (win.from || "").slice(0, 10), to: (win.to || "").slice(0, 10) },
      windowNote: scannedBack > 0 ? `Bot activity found ${scannedBack} window(s) before the assessment date — report reflects that 30-day period.` : null,
      confidenceBasis: kbConfidence ? "kb_article_relevance" : accuracies.length ? "intent_match_accuracy" : null,
      summary: { sessions, queries: qTotal, containment, escalation: ctx.metrics.bot_escalation?.value ?? null, botAhtSec: ctx.metrics.bot_aht?.value ?? null, intentAccuracy: ctx.metrics.intent_accuracy?.value ?? null, fallbackRate: ctx.metrics.fallback_rate?.value ?? null, aiConfidence: ctx.metrics.ai_confidence?.value ?? null, csat, surveyResponses: surveys.length, transcripts: transcripts.length, variables: vars.length },
      metricsExtra: { multiTurn, dropOffs, toolUsed, implicitResolvedRate: pctR(implicitResolved, contained), avgInteractionSec: intDurN ? Math.round(intDurSum / intDurN) : null, totalInteractionMin: Math.round(intDurSum / 60) },
      queryMatch: { matchedArticle, matchedIntent, noMatch: noMatchQ, total: matchedArticle + matchedIntent + noMatchQ },
      feedback: { helpful: fbHelpful, notHelpful: fbNot, noResponse: fbNo },
      byChannel, byAgent,
      topicGroups, articleStats, knowledgeStats, byDay,
      knowledge, articleTopicGroups, feedbackByDay, kaTrend,
      records, queryRecords,
      recordsTruncated: engR.length > CAP_E, queryRecordsTruncated: qTotal > CAP_Q,
      topIntents, topFallbacks, topTopics,
      topArticles: sortTally(articleTally).slice(0, 10).map(([article, count]) => ({ article, count })),
      lowConfidence: { count: lowConf, pct: lowPct, threshold: 0.5, sampled: confPool.length, basis: kbConfidence ? "KB article relevance" : "intent match accuracy" },
      channels,
      opportunities: opp.length ? attachSteps(opp) : [{ priority: "—", title: "No Virtual Agent traffic in this window", detail: "Deploy/route a bot (and ensure the date window covers bot activity), then re-run to populate this report." }],
      debug: zvaDbg,
    };

    // Fallback: when the standalone ZVA report has no traffic but the account
    // runs self-service through Contact Center flows/IVR, build the Optimization
    // report from flow_performance so the customer still gets actionable insight.
    const flows = ctx.raw.cc && ctx.raw.cc.flows;
    if (!ctx.raw.zva.available && flows && flows.offered > 0) {
      const containmentF = round((1 - flows.toAgent / flows.offered) * 100, 1);
      const toAgentRate = round((flows.toAgent / flows.offered) * 100, 1);
      const top3 = flows.byFlow.slice(0, 3).map((x) => `${x.flow} ×${x.offered}`).join(", ");
      const oppF = [];
      if (toAgentRate > 40) oppF.push({ priority: "High", title: "High live-agent escalation from self-service", detail: `${toAgentRate}% of ${flows.offered} self-service sessions escalate to a live agent. Add automated intents / a Virtual Agent for the highest-volume flows (${top3}) to deflect more.` });
      if (containmentF < 60) oppF.push({ priority: "Medium", title: "Raise self-service containment", detail: `Flow containment is ${containmentF}%. Expand IVR/flow self-service coverage and add knowledge-grounded answers on the busiest flows.` });
      const dropoff = flows.byFlow.filter((x) => x.offered > 0 && x.toAgent + x.handledByQueue < x.offered);
      if (dropoff.length) oppF.push({ priority: "Medium", title: "Investigate flow drop-off", detail: `Flows where callers exit before agent or queue: ${dropoff.slice(0, 3).map((x) => x.flow).join(", ")}. Review menus/prompts for dead-ends.` });
      oppF.push({ priority: "Low", title: "Add a Virtual Agent on top flows", detail: `Self-service runs through Contact Center flows today — a Zoom Virtual Agent layered on the top flows (${top3}) would add conversational deflection and intent analytics.` });
      // CC-derived analytics so the Queries/Knowledge drill-downs show real data for
      // a flow-sourced (Contact Center voice) VA that has no standalone query/KB feed.
      const _er = (ctx._cc && ctx._cc.erows) ? ctx._cc.erows : [];
      let selfServed = 0, escalatedN = 0, aiUsed = 0, aiTot = 0; const qTopics = {}, qStat = {}, dayStat = {};
      for (const r of _er) {
        const tr = (Number(r.transfer_completed_count) || 0) + (Number(r.warm_transfer_completed_count) || 0) + (Number(r.direct_transfer_count) || 0);
        const esc = tr > 0; if (esc) escalatedN++; else selfServed++;
        const a = String(r.aiea_usage || "").toLowerCase(); if (a) { aiTot++; if (!["not_used", "disabled", "none", "no", "unknown", "n/a"].includes(a)) aiUsed++; }
        const qn = (Array.isArray(r.queues) && r.queues[0] && r.queues[0].queue_name) || r.enter_channel || "(unrouted)";
        qTopics[qn] = (qTopics[qn] || 0) + 1;
        const e = (qStat[qn] = qStat[qn] || { topic: qn, total: 0, solved: 0, escalated: 0 }); e.total++; if (esc) e.escalated++; else e.solved++;
        const day = String(r.start_time || "").slice(0, 10);
        if (day) { const d = (dayStat[day] = dayStat[day] || { date: day, contained: 0, escalated: 0 }); if (esc) d.escalated++; else d.contained++; }
      }
      const tgTop = (key) => Object.values(qStat).filter((x) => x[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, 5).map((x) => ({ topic: x.topic, count: x[key], pct: Math.round((x[key] / _er.length) * 100) }));
      ctx.raw.zva = {
        available: true,
        source: "Contact Center flows (no standalone Virtual Agent traffic in range)",
        flowSourced: true,
        window: { from: (win.from || "").slice(0, 10), to: (win.to || "").slice(0, 10) },
        windowNote: null,
        summary: { sessions: flows.offered, queries: null, containment: containmentF, escalation: toAgentRate, botAhtSec: flows.avgDurationSec, intentAccuracy: null, fallbackRate: null, aiConfidence: null, csat: null, surveyResponses: 0, transcripts: 0, variables: 0 },
        topIntents: flows.byFlow.map((x) => ({ intent: x.flow, count: x.offered })),
        topFallbacks: flows.byFlow.filter((x) => x.toAgent > 0).sort((a, b) => b.toAgent - a.toAgent).slice(0, 8).map((x) => ({ query: `${x.flow} → live agent`, count: x.toAgent })),
        lowConfidence: { count: 0, pct: null, threshold: 0.5, sampled: 0 },
        channels: ctx.raw.cc.channelMix || {},
        opportunities: attachSteps(oppF),
        // Drill-downs for the flow-sourced report: the self-service engagement log
        // (from CC engagement rows already fetched) + per-flow detail.
        records: (ctx._cc && ctx._cc.erows ? ctx._cc.erows : []).slice(0, 300).map((r) => {
          let d = Number(r.duration) || 0; if (d > 1000) d = Math.round(d / 1000);
          return { id: r.engagement_id, direction: r.direction || "", channel: String(r.enter_channel || (r.channels && r.channels[0] && r.channels[0].channel) || "").toLowerCase(),
            consumer: (r.consumer && (r.consumer.consumer_name || r.consumer.consumer_email)) || "", durationSec: d || null,
            transfers: (Number(r.transfer_completed_count) || 0) + (Number(r.warm_transfer_completed_count) || 0) + (Number(r.direct_transfer_count) || 0), ai: r.aiea_usage || "" };
        }),
        recordsTotal: (ctx._cc && ctx._cc.erows ? ctx._cc.erows.length : 0),
        flowRows: flows.byFlow.map((x) => ({ flow: x.flow, offered: x.offered, toAgent: x.toAgent, handledByQueue: x.handledByQueue, containmentPct: round((1 - x.toAgent / Math.max(x.offered, 1)) * 100, 1) })),
        handling: { selfServed: Math.max(0, flows.offered - flows.toAgent), escalated: flows.toAgent },
        queueTopics: Object.entries(qTopics).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([topic, count]) => ({ topic, count })),
        topicGroups: { popular: tgTop("total"), solved: tgTop("solved"), escalated: tgTop("escalated") },
        byDay: Object.values(dayStat).sort((a, b) => (a.date < b.date ? -1 : 1)),
        aiAssist: { used: aiUsed, total: aiTot, pct: aiTot ? Math.round((aiUsed / aiTot) * 100) : null },
        debug: zvaDbg,
      };
    }

    for (const k of zvaKeys) if (!ctx.metrics[k]) ctx.miss(k, "No Virtual Agent traffic in window — capture via ZVA export");
  });
}

// ===================================================================
// 8 — Workforce Management
// ===================================================================
export async function wfm(ctx) {
  await runDomain(ctx, "wfm", ["forecast_accuracy", "schedule_adherence"], async () => {
    // Adherence report requires a single `date` (not from/to).
    const adh = await safeCall(() => ctx.client.get("/workforce-management/reports/adherence/agents", { date: ctx.to, from: ctx.from, to: ctx.to, page_size: 100 }));
    if (adh) setIf(ctx, "schedule_adherence", pct(avg(pickNums(rowsFrom(adh), ["adherence"]))), "WFM adherence");
    const fc = await safeCall(() => ctx.client.get("/workforce-management/forecasts", { page_size: 50 }));
    if (fc) {
      const rows = rowsFrom(fc);
      if (rows.length) setIf(ctx, "forecast_accuracy", pct(avg(pickNums(rows, ["accuracy"]))), "WFM forecasts");
      else ctx.raw.wfm = { forecasts: 0 };
    }
    for (const k of ["forecast_accuracy", "schedule_adherence"]) if (!ctx.metrics[k]) ctx.miss(k, "No WFM forecast/adherence data configured — capture via WFM export");
  });
}

// ===================================================================
// 9 — Revenue Accelerator
// ===================================================================
export async function revenueAccelerator(ctx) {
  const zraKeys = ["deal_risk", "ai_influenced_revenue", "conv_sentiment", "conv_engagement", "conversations_analyzed"];
  await runDomain(ctx, "zra", zraKeys, async () => {
    const deals = await safeCall(() => ctx.client.paginate("/zra/deals", {}, { itemsKey: "deals", maxPages: 2, pageSize: 100 }));
    if (deals && deals.items.length) {
      const atRisk = deals.items.filter((d) => {
        const r = (d.deal_risk ?? d.risk ?? "").toString().toLowerCase();
        return r === "high" || Number(d.deal_risk) >= 1 || d.at_risk === true;
      }).length;
      setIf(ctx, "deal_risk", (atRisk / deals.items.length) * 100, "ZRA deals");
      ctx.audit.zra_connected = "Connected";
    }

    // Conversation intelligence (engagement_score / sentiment_score, 0-100).
    const conv = await safeCall(() =>
      ctx.client.paginate("/zra/conversations", { from: isoStart(ctx.from), to: isoEnd(ctx.to) }, { itemsKey: "conversations", maxPages: 3, pageSize: 100 }));
    if (conv && conv.items.length) {
      const sent = pickNums(conv.items, ["^sentiment_score$"]).filter((x) => x >= 0);
      const eng = pickNums(conv.items, ["^engagement_score$"]).filter((x) => x >= 0);
      setIf(ctx, "conv_sentiment", avg(sent), "ZRA conversations (sentiment_score)");
      setIf(ctx, "conv_engagement", avg(eng), "ZRA conversations (engagement_score)");
      ctx.set("conversations_analyzed", conv.items.length, "ZRA conversations");
      ctx.audit.zra_connected = "Connected";
    }

    const ind = await safeCall(() => ctx.client.get("/zra/settings/indicators"));
    if (ind) setIf(ctx, "ai_influenced_revenue", avg(pickNums(rowsFrom(ind), ["ai_influenced", "influenced_revenue", "revenue"])), "ZRA indicators");

    for (const k of zraKeys) if (!ctx.metrics[k]) ctx.miss(k, "ZRA data not exposed — capture via ZRA/CRM export");
  });
}

// ===================================================================
// 10 — Account settings -> config audit current state
// ===================================================================
export async function settingsAudit(ctx) {
  await runDomain(ctx, "settings", [], async () => {
    // CloudConnect change: keep the errors. The original used safeCall here,
    // so when every settings call failed (e.g. a missing granular scope) the
    // audit came back empty while the domain still reported success, and the
    // reason was lost. Zoom's error text names the scope it wanted.
    const errors = [];
    const tryGet = async (path) => {
      try { return await ctx.client.get(path); } catch (err) {
        errors.push(err instanceof ZoomError ? `${path}: ${`${err.status || ""} ${err.message}`.trim()}` : `${path}: ${String(err?.message || err)}`);
        return null;
      }
    };
    // /accounts/me/settings works without the master scope (real field paths below).
    const s = await tryGet("/accounts/me/settings")
      || await tryGet(`/accounts/${encodeURIComponent(ctx.accountId)}/settings`);
    const a = ctx.audit;
    if (s) {
      const sec = s.security || {};
      const sched = s.schedule_meeting || {};
      const inm = s.in_meeting || {};
      const rec = s.recording || {};
      a.sso_enforced = boolState(sec.signin_with_sso ?? sec.sign_in_with_sso);
      const wr = boolState(sched.waiting_room ?? inm.waiting_room) === "Enabled";
      const pc = boolState(sched.require_password_for_scheduling_new_meetings ?? sched.require_password_for_all_meetings ?? inm.require_password_for_all_meetings) === "Enabled";
      a.meeting_security_defaults = wr && pc ? "Enforced" : sched.waiting_room != null ? "Partial" : null;
      const retKey = Object.keys(rec).find((k) => /retention/i.test(k));
      a.retention_configured = retKey ? boolState(rec[retKey]) : null;
      a.recording_retention = a.retention_configured;
      a.ai_companion_meetings = boolState(s.zoom_ai_companion ?? s.ai_companion ?? s.feature?.meeting_summary);
      ctx.raw.settingsKeys = Object.keys(s).length;
    }
    const ps = await tryGet("/phone/account_settings");
    if (ps) {
      a.vm_transcription = boolState(ps.voicemail_transcription || ps.voicemail?.transcription);
      a.phone_recording = boolState(ps.auto_call_recording || ps.call_recording || ps.recording);
    }
    ctx.raw.settingsKeys = s ? Object.keys(s).length : 0;
    // Account settings drive most of the audit: if they couldn't be read, mark
    // the domain failed with Zoom's own reason (phone settings already read
    // above are kept). Phone-settings errors alone are recorded, not fatal.
    if (!s) throw new Error(`Couldn't read account settings — ${errors.join("; ")}`);
    if (errors.length) ctx.raw.settingsErrors = errors;
  });
}

// ===================================================================
// 11 — Webinars (feeds feature adoption breadth)
// ===================================================================
export async function webinars(ctx) {
  await runDomain(ctx, "webinars", [], async () => {
    const w = await ctx.client.get("/metrics/webinars", { from: ctx.from, to: ctx.to, type: "past", page_size: 30 });
    const wrows = rowsFrom(w);
    ctx.raw.webinars = { total: w.total_records ?? wrows.length };
    ctx._webinars = wrows; // retained for the Meetings & Webinars report
  });
}

// ---------- small helpers ----------
async function safeCall(fn) { try { return await fn(); } catch (_) { return null; } }
function setIf(ctx, key, value, endpoint) { if (value != null && !Number.isNaN(value)) ctx.set(key, value, endpoint); }
function boolState(v) {
  if (v == null) return null;
  if (typeof v === "object") v = v.enable ?? v.enabled ?? v.status; // {enable:bool} settings
  if (v === "active" || v === "on" || v === true) return "Enabled";
  if (v === "inactive" || v === "off" || v === false) return "Disabled";
  return v ? "Enabled" : null;
}

// Run everything (sequential — shared subrequest budget keeps us under platform caps).
// Lowest-priority collector: builds the deep Zoom Phone report purely from the
// /phone/metrics/call_logs rows already fetched by quality() + the /phone counts
// from phone() — ZERO extra subrequests.
export async function phoneReport(ctx) {
  const calls = ctx._phoneCalls || [];
  if (!calls.length && !ctx.raw.phone) return;
  ctx.raw.phoneReport = buildPhoneReport({ calls, phone: ctx.raw.phone || {}, meetingQualityGoodPct: ctx.raw.meetingQualityGoodPct ?? null });
}

// Pure aggregator for the Phone QoS report. Field names verified against live
// PFI /phone/metrics/call_logs: { duration(sec), direction, mos(string),
// caller{device_type,codec,isp,site_id}, callee }.
export function buildPhoneReport({ calls = [], phone = {}, meetingQualityGoodPct = null }) {
  const num = (x) => { const n = Number(x); return Number.isNaN(n) ? null : n; };
  const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
  const pctR = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
  const meanR = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

  let good = 0, fair = 0, poor = 0, durSum = 0;
  const mosAll = [], directions = {};
  const dim = { device: {}, isp: {}, codec: {}, site: {} };
  const lowIsp = {}, lowDevice = {};
  const bump = (m, k, mos) => { if (!k) return; const e = (m[k] = m[k] || { key: k, n: 0, mos: [] }); e.n++; if (mos != null) e.mos.push(mos); };
  for (const c of calls) {
    const dir = String(c.direction || "unknown").toLowerCase(); directions[dir] = (directions[dir] || 0) + 1;
    const d = num(c.duration); if (d != null && d > 0) durSum += d;
    const m = num(c.mos);
    if (m != null && m > 0) {
      mosAll.push(m);
      if (m >= 4.0) good++; else if (m >= 3.5) fair++; else poor++;
    }
    const cl = c.caller || {};
    bump(dim.device, cl.device_type, m); bump(dim.isp, cl.isp, m); bump(dim.codec, cl.codec, m); bump(dim.site, cl.site_id, m);
    if (m != null && m < 3.5) { if (cl.isp) lowIsp[cl.isp] = (lowIsp[cl.isp] || 0) + 1; if (cl.device_type) lowDevice[cl.device_type] = (lowDevice[cl.device_type] || 0) + 1; }
  }
  const avgMos = mosAll.length ? r1(meanR(mosAll)) : null;
  const scored = good + fair + poor;
  const topDim = (m, n = 8) => Object.values(m).sort((a, b) => b.n - a.n).slice(0, n).map((e) => ({ name: e.key, calls: e.n, avgMos: e.mos.length ? r1(meanR(e.mos)) : null }));
  const sortCount = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]);

  const opp = [];
  const poorPct = pctR(poor, scored);
  if (avgMos != null && avgMos < 4.0) opp.push({ priority: avgMos < 3.6 ? "High" : "Medium", title: "Improve call audio quality", detail: `Average MOS ${avgMos} across ${scored} scored calls (${poorPct ?? 0}% poor, MOS<3.5). Investigate network/device on the worst segments below.` });
  const worstIsp = topDim(dim.isp).filter((x) => x.avgMos != null && x.avgMos < 3.8 && x.calls >= 10).slice(0, 2);
  if (worstIsp.length) opp.push({ priority: "Medium", title: "Network quality by ISP", detail: `Low MOS on: ${worstIsp.map((x) => `${x.name} (${x.avgMos}, ${x.calls} calls)`).join(", ")}. Check WAN/QoS or carrier for these networks.` });
  const worstDev = topDim(dim.device).filter((x) => x.avgMos != null && x.avgMos < 3.8 && x.calls >= 10).slice(0, 2);
  if (worstDev.length) opp.push({ priority: "Medium", title: "Quality by client/device", detail: `Low MOS on: ${worstDev.map((x) => `${x.name} (${x.avgMos})`).join(", ")}. Update clients / check headsets on these.` });
  if (phone.unassignedNumbers > 0 && phone.numbers > 0 && pctR(phone.unassignedNumbers, phone.numbers) >= 15) opp.push({ priority: "Low", title: "Reclaim unassigned numbers", detail: `${phone.unassignedNumbers} of ${phone.numbers} DIDs unassigned (${pctR(phone.unassignedNumbers, phone.numbers)}%) — reclaim to cut DID spend.` });
  if (phone.offlineDevices > 0) opp.push({ priority: "Low", title: "Offline desk phones", detail: `${phone.offlineDevices} of ${phone.devices} provisioned devices offline — verify provisioning/network.` });

  return {
    available: !!(calls.length || phone.users),
    sampledCalls: calls.length,
    overview: {
      calls: calls.length, avgMos, directions, totalTalkMin: Math.round(durSum / 60), avgCallSec: calls.length ? Math.round(durSum / calls.length) : null,
      meetingQualityGoodPct,
      users: phone.users ?? null, numbers: phone.numbers ?? null, unassignedNumbers: phone.unassignedNumbers ?? null,
      devices: phone.devices ?? null, offlineDevices: phone.offlineDevices ?? null, callQueues: phone.callQueues ?? null,
    },
    quality: { good, fair, poor, scored, goodPct: pctR(good, scored), fairPct: pctR(fair, scored), poorPct },
    byDevice: topDim(dim.device), byIsp: topDim(dim.isp), bySite: topDim(dim.site),
    byCodec: sortCount(Object.fromEntries(Object.entries(dim.codec).map(([k, v]) => [k, v.n]))).slice(0, 6).map(([name, calls2]) => ({ name, calls: calls2 })),
    lowMos: { count: poor, topIsp: sortCount(lowIsp).slice(0, 5).map(([name, c]) => ({ name, count: c })), topDevice: sortCount(lowDevice).slice(0, 5).map(([name, c]) => ({ name, count: c })) },
    records: calls.slice(0, 300).map((c) => { const m = num(c.mos), cl = c.caller || {}; return { dir: String(c.direction || "").toLowerCase(), durationSec: num(c.duration), mos: m, isp: cl.isp || "", device: (cl.device_type || "").replace(/_/g, " "), site: cl.site_id || "" }; }),
    recordsTotal: calls.length,
    opportunities: opp.length ? attachSteps(opp) : [{ priority: "—", title: "Call quality healthy", detail: "No material Phone quality findings in window." }],
  };
}

// Lowest-priority collector: deep Meetings & Webinars report from data already
// fetched (usage /report/daily, quality /metrics/quality, users, /metrics/meetings
// sample, /metrics/webinars rows) — ZERO extra subrequests.
export async function meetingsReport(ctx) {
  if (!ctx.raw.usage && !ctx._meetings && !ctx.raw.meetingQuality) return;
  ctx.raw.meetingsReport = buildMeetingsReport({
    meetings: ctx._meetings || [], meetingsTotal: ctx.raw.meetingsTotal ?? null,
    usage: ctx.raw.usage || {}, users: ctx.raw.users || {}, hostsInWindow: ctx.raw.hostsInWindow ?? null,
    quality: ctx.raw.meetingQuality || null, webinars: ctx._webinars || [], webinarsTotal: (ctx.raw.webinars || {}).total ?? 0,
  });
}

// Pure aggregator for the Meetings & Webinars report. /metrics/meetings fields
// verified against live PFI (has_recording/video/screen_share/poll/qa/meeting_summary/
// automated_captions/external_participant, participants, duration(min), dept, *_quality).
export function buildMeetingsReport({ meetings = [], meetingsTotal = null, usage = {}, users = {}, hostsInWindow = null, quality = null, webinars = [], webinarsTotal = 0 }) {
  const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
  const pctR = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
  const meanR = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

  // Per-media meeting quality (good ÷ all).
  const mediaQuality = {};
  let qGood = 0, qTot = 0;
  for (const m of ["audio", "video", "screen_share"]) {
    const b = quality && quality[m]; if (!b) continue;
    const tot = ["good", "fair", "poor", "bad"].reduce((a, k) => a + (Number(b[k]) || 0), 0);
    mediaQuality[m] = { goodPct: pctR(Number(b.good) || 0, tot), good: Number(b.good) || 0, fair: Number(b.fair) || 0, poor: (Number(b.poor) || 0) + (Number(b.bad) || 0), total: tot };
    qGood += Number(b.good) || 0; qTot += tot;
  }

  // Feature adoption + size/duration from the meetings sample.
  const n = meetings.length;
  const feat = { recording: 0, video: 0, screen_share: 0, poll: 0, qa: 0, meeting_summary: 0, automated_captions: 0, external_participant: 0 };
  const featKey = { recording: "has_recording", video: "has_video", screen_share: "has_screen_share", poll: "has_poll", qa: "has_qa", meeting_summary: "has_meeting_summary", automated_captions: "has_automated_captions", external_participant: "has_external_participant" };
  const parts = [], durs = [], byDept = {}, byHost = {}, platforms = {};
  for (const m of meetings) {
    for (const k of Object.keys(feat)) if (m[featKey[k]] === true) feat[k]++;
    const p = Number(m.participants); if (!Number.isNaN(p) && p > 0) parts.push(p);
    // /metrics/meetings duration is "HH:MM:SS"; /report-style may be numeric minutes.
    const dv = m.duration;
    let dmin = NaN;
    if (typeof dv === "number") dmin = dv;
    else if (typeof dv === "string" && dv.includes(":")) { const a = dv.split(":").map(Number); dmin = a.length === 3 ? a[0] * 60 + a[1] + a[2] / 60 : a.length === 2 ? a[0] + a[1] / 60 : Number(dv); }
    else dmin = Number(dv);
    if (!Number.isNaN(dmin) && dmin > 0) durs.push(dmin);
    const dep = m.dept || "(none)"; byDept[dep] = (byDept[dep] || 0) + 1;
    const h = m.host || m.email; if (h) byHost[h] = (byHost[h] || 0) + 1;
    const pf = m.meeting_platform || "Zoom"; platforms[pf] = (platforms[pf] || 0) + 1;
  }
  const adoption = n ? Object.fromEntries(Object.entries(feat).map(([k, v]) => [k, pctR(v, n)])) : {};
  const topHosts = Object.entries(byHost).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([host, c]) => ({ host, meetings: c }));
  const topDepts = Object.entries(byDept).filter(([k]) => k !== "(none)").sort((a, b) => b[1] - a[1]).slice(0, 8).map(([dept, c]) => ({ dept, meetings: c }));

  // Adoption / licensing health (from users + report/daily).
  const licensed = users.licensed ?? null, total = users.total ?? null;
  const hostRate = (hostsInWindow != null && (licensed || total)) ? pctR(hostsInWindow, licensed || total) : null;

  const opp = [];
  const overallGood = pctR(qGood, qTot);
  if (overallGood != null && overallGood < 95) opp.push({ priority: overallGood < 90 ? "High" : "Medium", title: "Improve meeting media quality", detail: `${overallGood}% of media streams rated good. Review the weakest media type (${Object.entries(mediaQuality).sort((a, b) => (a[1].goodPct || 0) - (b[1].goodPct || 0))[0]?.[0] || "—"}) — check network/devices.` });
  if (n && adoption.meeting_summary != null && adoption.meeting_summary < 20) opp.push({ priority: "Medium", title: "Drive AI Companion adoption", detail: `AI Meeting Summary used in ${adoption.meeting_summary}% of sampled meetings — enable/promote AI Companion to capture notes & action items.` });
  if (n && adoption.recording != null && adoption.recording < 15) opp.push({ priority: "Low", title: "Recording adoption", detail: `${adoption.recording}% of meetings recorded — promote recording for training/compliance where appropriate.` });
  if (users.dormant30d > 0 && (licensed || 0) > 0 && pctR(users.dormant30d + (users.neverLoggedIn || 0), licensed) >= 15) opp.push({ priority: "Medium", title: "Reclaim idle licenses", detail: `${users.dormant30d} dormant + ${users.neverLoggedIn || 0} never-logged-in of ${licensed} licensed — reclaim/reassign to cut spend.` });
  if (hostRate != null && hostRate < 50) opp.push({ priority: "Low", title: "Low hosting activity", detail: `Only ${hostRate}% of users hosted in window — drive adoption (training, calendar integration).` });

  return {
    available: !!(n || qTot || usage.meetings),
    meetingsSampled: n, meetingsTotal,
    overview: {
      meetingsMonth: usage.meetings ?? null, participantsMonth: usage.participants ?? null, meetingMinutesMonth: usage.meetingMinutes ?? null,
      recordingStorageGB: usage.recordingStorageGB ?? null, newUsers: usage.newUsers ?? null,
      avgParticipants: parts.length ? r1(meanR(parts)) : null, avgDurationMin: durs.length ? Math.round(meanR(durs)) : null,
      qualityGoodPct: overallGood, users: total, licensed, basic: users.basic ?? null, hostsInWindow, hostRate,
      dormant30d: users.dormant30d ?? null, neverLoggedIn: users.neverLoggedIn ?? null,
    },
    mediaQuality, adoption, topHosts, topDepts, platforms,
    webinars: { total: webinarsTotal, top: webinars.slice(0, 8).map((w) => ({ topic: w.topic || w.id, participants: w.participants ?? w.total_participants ?? null, duration: w.duration ?? null })) },
    records: meetings.slice(0, 300).map((mm) => {
      const dv = mm.duration; let dmin = NaN;
      if (typeof dv === "number") dmin = dv;
      else if (typeof dv === "string" && dv.includes(":")) { const a = dv.split(":").map(Number); dmin = a.length === 3 ? a[0] * 60 + a[1] + a[2] / 60 : a[0] + (a[1] || 0) / 60; }
      return { topic: mm.topic || "", host: mm.host || mm.email || "", dept: mm.dept || "", participants: Number(mm.participants) || null, durationMin: Number.isNaN(dmin) ? null : Math.round(dmin),
        recording: mm.has_recording === true, video: mm.has_video === true, screenShare: mm.has_screen_share === true, aiSummary: mm.has_meeting_summary === true, external: mm.has_external_participant === true };
    }),
    recordsTotal: meetings.length,
    opportunities: opp.length ? attachSteps(opp) : [{ priority: "—", title: "Meetings healthy", detail: "Quality and adoption are within range for this window." }],
  };
}

export async function collectAll(ctx) {
  await usersAndLicenses(ctx);
  await usage(ctx);
  await settingsAudit(ctx);
  await quality(ctx);
  await rooms(ctx);
  await phone(ctx);
  await contactCenter(ctx);
  await virtualAgent(ctx);
  await wfm(ctx);
  await revenueAccelerator(ctx);
  await webinars(ctx);
  await contactCenterReport(ctx); // lowest priority: deep CC report on leftover budget
  await phoneReport(ctx); // zero extra subrequests (reuses fetched call logs + phone counts)
  await meetingsReport(ctx); // zero extra subrequests (reuses meetings sample + quality + usage)
  return ctx;
}
