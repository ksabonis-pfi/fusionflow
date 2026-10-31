// Ported verbatim from the standalone RingCentral Optimization agent (collectors.js, v0.3.x).
// Kept as JavaScript, close to the validated original. Changes: config import
// paths (the JSON now lives in ./config), and deliberate fixes from review —
// RingCX requests now count against the budget (they bypassed it), and inventory
// adds usersByStatus so license utilization uses one population. The per-phone
// E911 sweep (75 phones) and per-queue membership (100 queues) are bounded so a
// large estate can't spend the whole run budget in inventory.

// Data collection against a customer's RingCentral account.
// Every endpoint here is verified in ../../../../docs/surfaces.md.
// All reads. Each collector degrades to null rather than failing the run.

/** Account-wide configuration picture. */
export async function collectInventory(rc, accountId) {
  const findings = [];
  // A read that failed and a read that returned nothing are different facts.
  // Collapsing them loses the distinction between "no disabled extensions" and
  // "could not ask", and the first scores full marks. `unavailable` keeps them
  // apart so deriveMetrics can refuse to publish a number it does not have.
  const unavailable = new Set();
  const safe = async (label, fn, fallback) => {
    try { return await fn(); }
    catch (e) {
      findings.push(`Could not read ${label}: ${String(e.message).split("\n")[0]}`);
      unavailable.add(label);
      return fallback;
    }
  };

  const account = await safe("account info", () => rc.json(`/restapi/v1.0/account/${accountId}`), {});
  const extensions = await safe("extensions", () => rc.collect(`/restapi/v1.0/account/${accountId}/extension?perPage=1000`), []);
  const sites = await safe("sites", () => rc.collect(`/restapi/v1.0/account/${accountId}/sites?perPage=1000`), []);
  const queues = await safe("call queues", () => rc.collect(`/restapi/v1.0/account/${accountId}/call-queues?perPage=1000`), []);
  const numbers = await safe("phone numbers", () => rc.collect(`/restapi/v1.0/account/${accountId}/phone-number?perPage=1000`), []);
  const emergency = await safe("emergency locations", () => rc.collect(`/restapi/v1.0/account/${accountId}/emergency-locations?perPage=1000`), []);
  const devices = await safe("devices", () => rc.collect(`/restapi/v1.0/account/${accountId}/device?perPage=1000`), []);
  const businessHours = await safe("business hours", () => rc.json(`/restapi/v1.0/account/${accountId}/business-hours`), null);
  const callRecording = await safe("call recording", () => rc.json(`/restapi/v1.0/account/${accountId}/call-recording`), null);

  const byType = {};
  const byStatus = {};
  // User extensions by status: the license population (queues/IVRs excluded).
  const usersByStatus = {};
  for (const e of extensions) {
    byType[e.type || "Unknown"] = (byType[e.type || "Unknown"] || 0) + 1;
    byStatus[e.status || "Unknown"] = (byStatus[e.status || "Unknown"] || 0) + 1;
    if (e.type === "User") usersByStatus[e.status || "Unknown"] = (usersByStatus[e.status || "Unknown"] || 0) + 1;
  }
  const byUsageType = {};
  for (const n of numbers) byUsageType[n.usageType || "Unknown"] = (byUsageType[n.usageType || "Unknown"] || 0) + 1;
  // Fax displacement: dedicated fax numbers are the retirement target. `type`
  // being VoiceFax only means the line is fax-capable, which most are, so it is
  // the usage type that identifies a line actually dedicated to fax.
  const faxNumbers = numbers.filter((n) => n.usageType === "CompanyFaxNumber").length;

  // Device mix. `type` is on the list response, so this costs nothing extra.
  const devicesByType = {};
  for (const d of devices) devicesByType[d.type || "Unknown"] = (devicesByType[d.type || "Unknown"] || 0) + 1;

  // Emergency addressing is per device and the LIST response does not carry it,
  // so each hard phone needs its own call. Bounded by the subrequest budget and
  // reported as partial rather than as a smaller number — an undercount here
  // would read as better compliance than the account actually has.
  const hardPhones = devices.filter((d) => d.type === "HardPhone");
  let hardPhonesChecked = 0;
  let hardPhonesNoE911 = 0;
  let e911Complete = true;
  // CloudConnect change: only sweep when a complete answer is possible. The
  // figure is withheld unless every phone is checked, so on a large estate the
  // sweep spent the whole budget (181 of 200 calls on 900 phones) for nothing
  // and starved the collectors after inventory.
  const E911_MAX_PHONES = 75;
  const e911Skipped = hardPhones.length > E911_MAX_PHONES;
  if (e911Skipped) e911Complete = false;
  for (const d of e911Skipped ? [] : hardPhones) {
    if (rc.remaining < 8) { e911Complete = false; break; }
    try {
      const detail = await rc.json(`/restapi/v1.0/account/${accountId}/device/${d.id}`);
      // "Valid" is the only status that means a dispatchable location exists.
      const status = detail.emergency?.addressStatus
        || (detail.emergencyServiceAddress ? "Valid" : "None");
      hardPhonesChecked++;
      if (status !== "Valid") hardPhonesNoE911++;
    } catch {
      e911Complete = false;
    }
  }
  if (hardPhones.length && !hardPhonesChecked) e911Complete = false;

  // Queue membership needs one call per queue — only if the budget allows.
  // CloudConnect change: like E911, membership is only used when complete, so
  // past QUEUE_MAX queues the sweep is skipped rather than spending ~100 calls
  // on a partial answer nothing publishes.
  const QUEUE_MAX = 100;
  const queueDetail = [];
  const queueMembershipSkipped = queues.length > QUEUE_MAX;
  let queueMembershipComplete = !queueMembershipSkipped;
  for (const q of queueMembershipSkipped ? [] : queues) {
    if (rc.remaining < 6) { queueMembershipComplete = false; break; }
    try {
      const m = await rc.json(`/restapi/v1.0/account/${accountId}/call-queues/${q.id}/members?perPage=1000`);
      queueDetail.push({ id: q.id, name: q.name, extensionNumber: q.extensionNumber, memberCount: (m.records || []).length });
    } catch {
      queueDetail.push({ id: q.id, name: q.name, extensionNumber: q.extensionNumber, memberCount: null });
    }
  }

  return {
    account: { id: account.id, mainNumber: account.mainNumber, status: account.status },
    counts: {
      extensions: extensions.length, sites: sites.length,
      callQueues: queues.length, phoneNumbers: numbers.length,
      emergencyLocations: emergency.length,
      devices: devices.length,
    },
    devicesByType,
    hardPhones: hardPhones.length,
    hardPhonesChecked,
    hardPhonesNoE911,
    e911Complete,
    e911Skipped,
    extensionsByType: byType,
    extensionsByStatus: byStatus,
    usersByStatus,
    phoneNumbersByUsageType: byUsageType,
    faxNumbers,
    queues: queueDetail,
    queueMembershipComplete,
    queueMembershipSkipped,
    businessHours, callRecording, sites,
    unavailable: [...unavailable],
    collectionFindings: findings,
  };
}

/**
 * Business Analytics aggregate.
 *
 * groupBy defaults to "Company" — NOT "Users". Grouping by Users returns one
 * record per user and a call that touched several users (queue ring, transfer)
 * is counted in each, so summing the records over-counts. Measured on a live
 * tenant: Company 276 calls vs summed-Users 348, a 26% overstatement.
 * "Company" also returns a single record, so there is nothing to paginate.
 *
 * grouping is required; timers use the "…Duration" names; perPage max 100.
 */
export async function collectAggregate(rc, accountId, { timeFrom, timeTo, timeZone, groupBy = "Company" }) {
  return rc.post(`/analytics/calls/v1/accounts/${accountId}/aggregation/fetch?perPage=100`, {
    grouping: { groupBy },
    timeSettings: { timeZone, timeRange: { timeFrom, timeTo } },
    responseOptions: {
      counters: {
        allCalls: { aggregationType: "Sum" },
        callsByDirection: { aggregationType: "Sum" },
        // callsByResponse is what answer/connect rates are derived from:
        // answered+notAnswered == inbound, connected+notConnected == outbound.
        callsByResponse: { aggregationType: "Sum" },
        // Internal vs external. callsByDirection covers EXTERNAL calls only,
        // so origin is what explains the gap to allCalls.
        callsByOrigin: { aggregationType: "Sum" },
        // Kept for evidence only — its "unknown" bucket can dominate.
        callsByResult: { aggregationType: "Sum" },
        callsByCompanyHours: { aggregationType: "Sum" },
      },
      // Business Analytics has exactly one call-duration timer. Asking for
      // speedOfAnswer / handleDuration is a 400: the valid set is
      // allCallsDuration, callsDurationBy{Direction,Origin,Response,Result,
      // CompanyHours,QueueSla,Type,EndingParty,QueueHours} and
      // callsSegmentsDuration. Averaged, allCallsDuration IS mean handle time.
      // NOTE the response keys this back as `timers.allCalls`, not by the
      // name it was requested under.
      timers: { allCallsDuration: { aggregationType: "Average" } },
    },
  });
}

/**
 * Business Analytics timeline.
 *
 * Same Company-vs-Users reasoning as the aggregate. Grouping by Company also
 * collapses the result to one record, which sidesteps the perPage=20 cap that
 * previously made every total a partial page-one figure.
 *
 * interval is a QUERY parameter; responseOptions are BOOLEANS; perPage max 20.
 */
export async function collectTimeline(rc, accountId, { timeFrom, timeTo, timeZone, interval = "Week", groupBy = "Company" }) {
  const q = new URLSearchParams({ interval, perPage: "20" });
  return rc.post(`/analytics/calls/v1/accounts/${accountId}/timeline/fetch?${q}`, {
    grouping: { groupBy },
    timeSettings: { timeZone, timeRange: { timeFrom, timeTo } },
    responseOptions: { counters: { allCalls: true } },
  });
}

/**
 * RingCentral Video meeting history.
 *
 * /rcvideo/v2/account/~/bridges is a 404 on this surface; v1 history/meetings
 * is the one that answers. An account that simply does not use RC Video
 * returns an empty list, which is a real zero rather than a gap.
 */
export async function collectVideo(rc, { timeFrom } = {}) {
  const q = new URLSearchParams({ perPage: "250" });
  if (timeFrom) q.set("startTimeFrom", timeFrom);
  const r = await rc.json(`/rcvideo/v1/history/meetings?${q}`);
  const meetings = r?.meetings || [];
  let minutes = 0;
  for (const m of meetings) {
    const ms = m.duration != null ? Number(m.duration) * 1000
      : (m.endTime && m.startTime ? new Date(m.endTime) - new Date(m.startTime) : 0);
    if (Number.isFinite(ms) && ms > 0) minutes += ms / 60000;
  }
  return { meetings: meetings.length, minutes: Math.round(minutes), reachable: true };
}

/**
 * Account-wide presence — a point-in-time read, not a window figure.
 *
 * /account/{id}/presence is a bulk endpoint (100 per page), so the whole tenant
 * costs a couple of subrequests rather than one per extension. Two signals come
 * out of it that nothing else in the run can see:
 *
 *  - Offline share: people not signed in to any app, so presence and softphone
 *    routing cannot work for them.
 *  - Call-refusing DND: an extension set to DoNotAcceptAnyCalls or
 *    DoNotAcceptDepartmentCalls still counts as queue staffing but receives
 *    nothing. The queue configuration looks fine; the calls go unanswered.
 *
 * Everything here describes the instant the run executed. A single sample is not
 * a working-hours average, and the KPI wording says so.
 */
export async function collectPresence(rc, accountId) {
  const records = await rc.collect(`/restapi/v1.0/account/${accountId}/presence?detailedTelephonyState=true&perPage=100`);
  let offline = 0, available = 0, busy = 0, dndAny = 0, dndDept = 0, queueOptOut = 0;
  for (const r of records) {
    const p = r.presenceStatus;
    if (p === "Offline") offline++;
    else if (p === "Available") available++;
    else if (p === "Busy") busy++;
    if (r.dndStatus === "DoNotAcceptAnyCalls") dndAny++;
    else if (r.dndStatus === "DoNotAcceptDepartmentCalls") dndDept++;
    if (r.acceptCallQueueCalls === false) queueOptOut++;
  }
  return {
    reachable: true,
    total: records.length,
    offline, available, busy,
    dndAny, dndDept,
    dndBlocking: dndAny + dndDept,
    queueOptOut,
    sampledAt: new Date().toISOString(),
  };
}

/**
 * License position: what is owned, and how much of it is assigned.
 *
 * /restapi/v2/accounts/{id}/licenses is the only endpoint that returns real
 * quantities, and it returns { skuId, quantity, assigned } — no names. There is
 * no SKU dictionary endpoint and ?view=detailed changes nothing, so a readable
 * label can only come from a PacketFusion-maintained map (config/sku-labels.json).
 * The service plan name DOES come from the API, via service-info.
 *
 * The same skuId appears twice when some of it is assigned and some is not, so
 * the rows are folded per SKU before being returned.
 */
export async function collectLicenses(rc, accountId) {
  const out = { reachable: false, planName: null, edition: null, skus: [], assigned: 0, unassigned: 0, total: 0 };

  try {
    const si = await rc.json(`/restapi/v1.0/account/${accountId}/service-info`);
    out.planName = si?.servicePlan?.name || si?.servicePlanName || null;
    out.edition = si?.servicePlan?.edition || null;
    out.brand = si?.brand?.name || null;
  } catch { /* plan name is a nicety; the quantities below are the point */ }

  const lic = await rc.json(`/restapi/v2/accounts/${accountId}/licenses`);
  const bySku = new Map();
  for (const l of (lic?.licenses || [])) {
    const id = l.skuId || "unknown";
    const q = Number(l.quantity) || 0;
    const row = bySku.get(id) || { skuId: id, assigned: 0, unassigned: 0, total: 0 };
    if (l.assigned) row.assigned += q; else row.unassigned += q;
    row.total += q;
    bySku.set(id, row);
  }
  out.skus = [...bySku.values()].sort((a, b) => b.total - a.total);
  for (const r of out.skus) { out.assigned += r.assigned; out.unassigned += r.unassigned; out.total += r.total; }
  out.reachable = true;
  return out;
}

/** Sum a counter across every grouped record in an aggregate response. */
export function sumCounter(agg, name) {
  let total = 0;
  const add = (v) => { if (typeof v === "number") total += v; };
  for (const rec of agg?.data?.records ?? []) add(rec.counters?.[name]?.values);
  if (!agg?.data?.records?.length) add(agg?.data?.counters?.[name]?.values);
  return total;
}

/**
 * Read an aggregate timer. The API echoes allCallsDuration back under the key
 * `allCalls`, so accept either spelling rather than depending on which.
 */
export function readTimer(agg, name = "allCallsDuration") {
  const alt = name === "allCallsDuration" ? "allCalls" : name;
  for (const rec of agg?.data?.records ?? []) {
    const v = rec.timers?.[name]?.values ?? rec.timers?.[alt]?.values;
    if (typeof v === "number") return v;
  }
  const v = agg?.data?.timers?.[name]?.values ?? agg?.data?.timers?.[alt]?.values;
  return typeof v === "number" ? v : null;
}

/** Sum a breakdown map (e.g. callsByResult -> {missed, completed, …}). */
export function sumBreakdown(agg, name) {
  const out = {};
  const merge = (v) => {
    if (v && typeof v === "object") for (const [k, n] of Object.entries(v)) out[k] = (out[k] || 0) + (Number(n) || 0);
  };
  for (const rec of agg?.data?.records ?? []) merge(rec.counters?.[name]?.values);
  if (!agg?.data?.records?.length) merge(agg?.data?.counters?.[name]?.values);
  return out;
}

/** Flatten a timeline response into { bucket, value } rows for the snapshot store. */
export function timelineBuckets(tl, counter = "allCalls") {
  const buckets = new Map();
  for (const rec of tl?.data?.records ?? []) {
    for (const pt of rec.points ?? []) {
      const v = pt.counters?.[counter]?.values;
      if (typeof v === "number") buckets.set(pt.time, (buckets.get(pt.time) || 0) + v);
    }
  }
  return [...buckets].sort(([a], [b]) => a.localeCompare(b)).map(([bucket, value]) => ({ bucket, value }));
}

/**
 * RingSense / AI Conversation Expert coverage.
 *
 * There is no list endpoint — insights are fetched per recording id. So we
 * pull recorded calls and probe a bounded sample. Each probe is one
 * subrequest, hence the small default.
 *
 * RAH-3001 (404) means "no insights for this recording", which is a normal
 * answer, not an error: insights only exist for users holding an ACE licence.
 */
export async function collectAceCoverage(rc, accountId, { days = 90, sample = 8 } = {}) {
  const out = {
    permission: null, recordedCalls: 0, sampled: 0, withInsights: 0,
    coveragePct: null, sentiments: {}, aiScores: [], note: null,
  };

  try {
    const chk = await rc.json(`/restapi/v1.0/account/${accountId}/extension/~/authz-profile/check?permissionId=ReadRingSenseInsights`);
    out.permission = { allowed: !!chk.successful, scopes: chk.details?.scopes ?? [] };
  } catch {
    out.permission = { allowed: false, scopes: [] };
  }
  if (!out.permission.allowed) {
    out.note = "Extension lacks ReadRingSenseInsights — enable 'AI Conversation Expert - Access Insights' on its role.";
    return out;
  }

  const dateFrom = new Date(Date.now() - days * 86_400_000).toISOString();
  let calls = [];
  try {
    const q = new URLSearchParams({ perPage: "250", view: "Detailed", dateFrom, withRecording: "true" });
    calls = await rc.collect(`/restapi/v1.0/account/${accountId}/call-log?${q}`, 2);
  } catch (e) {
    out.note = `Could not read recorded calls: ${String(e.message).split("\n")[0]}`;
    return out;
  }
  out.recordedCalls = calls.length;

  for (const c of calls) {
    if (out.sampled >= sample || rc.remaining < 6) break;
    const recId = c.recording?.id, sessId = c.sessionId;
    if (!recId && !sessId) continue;
    out.sampled += 1;
    const path = recId
      ? `/ai/ringsense/v1/public/accounts/${accountId}/domains/pbx/records/${recId}/insights`
      : `/ai/ringsense/v1/public/accounts/${accountId}/domains/pbx/sessions/${sessId}/insights`;
    try {
      const d = await rc.json(path);
      out.withInsights += 1;
      const ins = d.insights ?? d.records?.[0]?.insights ?? {};
      const sent = typeof ins.sentiment === "string" ? ins.sentiment : ins.sentiment?.value;
      if (sent) out.sentiments[sent] = (out.sentiments[sent] || 0) + 1;
      const sc = typeof ins.aiScore === "number" ? ins.aiScore : ins.aiScore?.value;
      if (typeof sc === "number") out.aiScores.push(sc);
    } catch (e) {
      if (!/RAH-3001/.test(String(e.message))) {
        out.note = out.note ?? `Insight lookup failed: ${String(e.message).split("\n")[0].slice(0, 120)}`;
      }
    }
  }

  out.coveragePct = out.sampled ? (out.withInsights / out.sampled) * 100 : null;
  if (!out.note) {
    if (out.recordedCalls === 0) out.note = "No recorded calls in the window — nothing for AI to analyse.";
    else if (out.withInsights === 0) out.note = "Recordings exist but none carry AI insights. Insights are generated only for users holding an AI Conversation Expert licence — check licence assignment.";
  }
  return out;
}

/**
 * RingCX contact-centre inventory.
 *
 * ⚠ ACCOUNT ID TRAP: the login's `mainAccountId` is the PARENT. Rights are
 * granted on sub-accounts, and account-scoped calls against the parent return
 * access.denied — which looks exactly like a missing permission and is not.
 * Enumerate GET /voice/api/v1/admin/accounts and use those ids.
 *
 * Vocabulary is inherited from Engage: a queue is a GATE inside a GATEGROUP.
 *
 * Budget-aware: group counts are cheap, drilling into gates/agents costs one
 * subrequest per group, so it only happens when there is room.
 */
export async function collectRingCx(rc, { budgetFloor = 10 } = {}) {
  const out = {
    reachable: false, accounts: [], availableWEM: false, note: null,
    queueGroups: 0, queues: null, activeQueues: 0, inactiveQueues: 0, unstaffedQueues: [],
    agentGroups: 0, agents: null, activeAgents: 0, inactiveAgents: 0,
    agentsNotRcManaged: 0, agentsWemEnabled: 0,
    dialGroups: 0, dialGroupsNoCampaign: [], dialGroupsNoMembers: [],
    campaigns: 0, dncLists: 0, auxStates: 0, drilled: false,
    staffingChecked: false, dialMembersChecked: false, realtime: null,
  };

  const RCX = "https://ringcx.ringcentral.com";
  let token;
  try {
    const rcTok = await rc.getToken();
    rc.charge();
    const res = await fetch(`${RCX}/api/auth/login/rc/accesstoken?includeRefresh=true`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ rcAccessToken: rcTok, rcTokenType: "Bearer" }),
    });
    if (!res.ok) { out.note = `RingCX token exchange failed (${res.status}) — is the RingCentral account linked to RingCX?`; return out; }
    const sess = await res.json();
    token = sess.accessToken;
    out.availableWEM = !!sess.availableWEM;
    out.reachable = true;
    out.mainAccountId = String(sess.mainAccountId);
  } catch (e) {
    out.note = `RingCX unreachable: ${String(e.message).split("\n")[0]}`;
    return out;
  }

  // Every RingCX call counts against the run's budget, so the rc.remaining
  // guards below actually stop a large tenant (they never moved before).
  const get = async (path) => {
    rc.charge();
    const r = await fetch(`${RCX}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (!r.ok) throw new Error(`RingCX ${r.status} on ${path}`);
    return r.json();
  };

  // Operable accounts — NEVER mainAccountId, which is the parent and 403s.
  let ids = [];
  try {
    const accts = await get("/voice/api/v1/admin/accounts");
    out.accounts = (accts || []).map((a) => ({ id: String(a.accountId), name: a.accountName, parent: a.mainAccountId }));
    ids = out.accounts.map((a) => a.id);
  } catch { /* fall through */ }
  if (!ids.length) { ids = [out.mainAccountId]; out.note = "Could not enumerate sub-accounts; fell back to mainAccountId."; }

  for (const id of ids) {
    const B = `/voice/api/v1/admin/accounts/${id}`;
    if (rc.remaining < budgetFloor) { out.note = (out.note ? out.note + " " : "") + "Collection truncated — subrequest budget."; break; }

    // Queues. withChildren nests the gates, so this is one call, not 1+N.
    let gg = [];
    try { gg = await get(`${B}/gateGroups/withChildren`); } catch (e) {
      out.note = out.note ?? (/access.denied/.test(String(e.message))
        ? `No rights on RingCX account ${id} — check which sub-account the role grants.`
        : String(e.message).slice(0, 120));
      continue;
    }
    out.drilled = true;
    out.queueGroups += gg.length;
    const gates = gg.flatMap((g) => (g.gates || []).map((x) => ({ ...x, groupName: g.groupName })));
    out.queues = (out.queues ?? 0) + gates.length;
    for (const gt of gates) (gt.isActive ? out.activeQueues++ : out.inactiveQueues++);

    // Agents.
    let ag = [];
    try { ag = await get(`${B}/agentGroups`); } catch { /* keep going */ }
    out.agentGroups += ag.length;
    for (const g of ag) {
      if (rc.remaining <= 8) { out.note = (out.note ? out.note + " " : "") + "Agent enumeration truncated — budget."; break; }
      let agents = [];
      try { agents = await get(`${B}/agentGroups/${g.agentGroupId}/agents`); } catch { continue; }
      out.agents = (out.agents ?? 0) + agents.length;
      for (const a of agents) {
        a.isActive ? out.activeAgents++ : out.inactiveAgents++;
        if (a.userManagedByRC === false) out.agentsNotRcManaged++;
        if (a.enableWEM) out.agentsWemEnabled++;
      }
    }

    // Queue staffing MUST come from the per-gate assignedAgents endpoint.
    // The association arrays on the list endpoints (agentGateAccess,
    // agentDialGroupMembers) come back NULL — reading them as "no agents"
    // produced a false "every queue is unstaffed" finding. Verified: the
    // dedicated endpoint returns 1, 1, 4 for gates the nested field showed
    // as empty.
    if (rc.remaining > gates.length + 6) {
      out.staffingChecked = true;
      for (const gt of gates) {
        if (!gt.isActive) continue;
        if (rc.remaining <= 6) { out.staffingChecked = false; break; }
        try {
          const aa = await get(`${B}/gateGroups/${gt.gateGroup?.id ?? gt.gateGroupId}/gates/${gt.gateId}/assignedAgents`);
          if (!Array.isArray(aa) || aa.length === 0) out.unstaffedQueues.push(gt.gateName || `gate ${gt.gateId}`);
        } catch { /* leave unjudged rather than assert unstaffed */ }
      }
    } else {
      out.note = (out.note ? out.note + " " : "") + "Queue staffing not checked — subrequest budget.";
    }

    // Dialing. withChildren nests campaigns and members.
    try {
      const dg = await get(`${B}/dialGroups/withChildren`);
      out.dialGroups += dg.length;
      for (const d of dg) {
        const camps = d.campaigns || [];
        out.campaigns += camps.length;
        if (!camps.length) out.dialGroupsNoCampaign.push(d.dialGroupName || `dialGroup ${d.dialGroupId}`);
        // agentDialGroupMembers is null here too — ask the dedicated endpoint.
        if (rc.remaining > 8) {
          out.dialMembersChecked = true;
          try {
            const aa = await get(`${B}/dialGroups/${d.dialGroupId}/assignedAgents`);
            if (!Array.isArray(aa) || aa.length === 0) out.dialGroupsNoMembers.push(d.dialGroupName || `dialGroup ${d.dialGroupId}`);
          } catch { /* leave unjudged */ }
        }
      }
    } catch { /* optional */ }

    // Real-time operational snapshot. Requires only ReadAccounts + reporting
    // rights in the RingCX Admin portal — NOT WEM. WEM gates the HISTORICAL
    // Reports APIs; these are same-day counters that reset at midnight in the
    // account's timezone. Rate limit here is a generous 120/min.
    const rt = { inbound: null, outbound: null, chat: null, ivr: null, agents: null };
    const sum = (rows, k) => (rows || []).reduce((a, r) => a + (Number(r[k]) || 0), 0);
    try {
      const inb = await get(`${B}/realTimeData/inbound`);
      rt.inbound = {
        gates: inb.length,
        presented: sum(inb, "presentedAll"),
        answered: sum(inb, "answeredAll"),
        abandoned: sum(inb, "abandoned"),
        inQueue: sum(inb, "inQueue"),
        staffed: sum(inb, "staffed"),
        available: sum(inb, "available"),
        totalQueueTime: sum(inb, "totalQueueTime"),
        totalAnswerTime: sum(inb, "totalAnswerTime"),
        totalTalkTime: sum(inb, "totalTalkTime"),
        unstaffedNow: (inb || []).filter((r) => r.active && !r.staffed).map((r) => r.gateName),
      };
    } catch (e) {
      rt.inboundError = /access.denied/.test(String(e.message))
        ? "reporting rights not enabled for this user in the RingCX Admin portal"
        : String(e.message).slice(0, 100);
    }
    try {
      const outb = await get(`${B}/realTimeData/outbound`);
      rt.outbound = {
        campaigns: outb.length,
        answer: sum(outb, "answer"), noanswer: sum(outb, "noanswer"),
        abandon: sum(outb, "abandon"), connects: sum(outb, "connects"),
        machine: sum(outb, "machine"), busy: sum(outb, "busy"),
        staffed: sum(outb, "staffed"), available: sum(outb, "available"),
      };
    } catch { /* optional */ }
    try {
      const ivr = await get(`${B}/realTimeData/ivr`);
      rt.ivr = { flows: ivr.length, presented: sum(ivr, "presented"), connected: sum(ivr, "connected"),
                 transferGate: sum(ivr, "transferGate") };
    } catch { /* optional */ }
    try {
      const ch = await get(`${B}/realTimeData/chat`);
      rt.chat = { queues: ch.length, presented: sum(ch, "presented"), accepted: sum(ch, "accepted"),
                  abandoned: sum(ch, "abandoned") };
    } catch { /* optional */ }
    out.realtime = rt;

    try { out.dncLists += (await get(`${B}/dncLists`)).length; } catch { /* optional */ }
    try { out.auxStates += (await get(`${B}/auxStates?active=1`)).length; } catch { /* optional */ }
  }

  if (!out.note && !out.availableWEM) {
    out.note = "Same-day queue/campaign metrics are available via realTimeData. WEM Access gates only the HISTORICAL Reports APIs (agent segment metadata, queue statistics over an arbitrary window).";
  }
  return out;
}
