// Zoom Growth & Enablement plan model. Ported from the standalone Zoom agent's
// growth.js (buildGrowthModel). Raw-payload counts come from the run's slim
// `reportData` (see src/server/services/optimizeV2/reportData.ts).
import type { ConfigAuditRow } from "../../../../lib/optimizeV2Api";
import { opp, pickTopWins, totalOf } from "../growthKit";
import type { GrowthModel, Opportunity, ReportResult, ReportRun, ZoomProductReport, ZoomReportData } from "../types";
import { MARKETPLACE, ecosystemOf, growthSummary, type ZoomSignals } from "./growthContent";

const prio2impact = (p: string | undefined): Opportunity["impact"] => (({ High: "High", Medium: "Med", Low: "Low" } as Record<string, Opportunity["impact"]>)[p ?? ""] || "Med");
const areaIcon = (a: string) => (({ "Contact Center": "bot", "Virtual Agent": "bot", "Zoom Phone": "trend", Meetings: "layers" } as Record<string, string>)[a] || "heart");

export function buildZoomGrowthModel(r: ReportResult, run: ReportRun): GrowthModel & { signals: ZoomSignals } {
  const sc = r.scorecard, meta = r.meta;
  const data: Partial<ZoomReportData> = r.reportData?.platform === "zoom" ? r.reportData : {};
  const rows = sc.configAudit.rows;
  const domains = sc.domains || {};
  const row = (k: string) => rows.find((x) => x.key === k);
  const zraRow = row("zra_crm");
  const crmName = zraRow && /—/.test(zraRow.current || "") ? (zraRow.current.split("—").pop() ?? "").trim() : "";
  const crmConnected = !!(zraRow && (zraRow.state === "Aligned" || /connect/i.test(zraRow.current || "")));
  const ssoEnforced = row("sso")?.state === "Aligned";
  const aiCompanion = row("ai_meeting_summary")?.state === "Aligned" || row("ai_org_policy")?.state === "Aligned";
  const ecosystem = ecosystemOf(crmName);
  const active = (d: string) => !!domains[d]?.ok;
  const signals: ZoomSignals = {
    cc: active("contactCenter") && !!data.ccOffered,
    phone: active("phone") && !!data.phoneUsers,
    meetings: active("usage") || active("users"),
    rooms: active("rooms") && !!data.roomsTotal,
    zva: active("virtualAgent"),
    crm: crmConnected, crmName, ssoEnforced, aiCompanion, ecosystem: ecosystem.key,
  };

  const lic = licensingOpps(data);
  const categories: Record<string, Opportunity[]> = {
    untapped: untappedOpps(r, data, rows),
    licensing: lic.opps,
    workflow: workflowOpps(rows),
    cx: cxOpps(r),
    marketplace: marketplaceOpps(signals),
  };
  const customer = run.customer_name || meta.accountId || "Customer";
  return {
    cover: { customer, accountId: meta.accountId || "—", window: meta.window || {}, generatedAt: meta.generatedAt || new Date().toISOString() },
    ecosystem, signals, categories,
    topWins: pickTopWins(categories),
    summary: growthSummary(customer, categories.untapped.length, lic.seats),
    total: totalOf(categories),
  };

  function marketplaceOpps(s: ZoomSignals) {
    const out: Opportunity[] = [];
    for (const p of MARKETPLACE) {
      if (!p.when(s)) continue;
      if (p.ecosystem && ecosystem.key !== "unknown" && p.ecosystem !== ecosystem.key) continue; // unknown → show both suites
      const why = typeof p.why === "function" ? p.why(s) : p.why;
      out.push(opp("marketplace", p.icon, p.title, why, p.benefit, "Department · End-user", "Med", "Med", "Observed", null, p.steps, `marketplace:${p.key}`));
    }
    return out.slice(0, 7);
  }
}

function untappedOpps(r: ReportResult, data: Partial<ZoomReportData>, rows: ConfigAuditRow[]) {
  const out: Opportunity[] = [];
  const domains = r.scorecard.domains || {};
  const dark = (d: string) => !domains[d]?.ok;
  const zvaSess = r.zva?.summary?.sessions || data.zvaSessions;
  if (dark("virtualAgent") || !zvaSess) out.push(opp("untapped", "bot", "Deploy a Virtual Agent for self-service",
    "No virtual-agent traffic is showing — customers reach a person for questions a bot could resolve.",
    "A KB-grounded virtual agent deflects routine contacts 24/7, cutting cost-to-serve and wait times while freeing agents for complex work.",
    "End-user · CX", "High", "Med", "Observed", null,
    ["Zoom Virtual Agent → connect your knowledge base and enable generative answers.", "Publish the bot to your top web/app/voice entry points.", "Start with the highest-volume contact reasons and expand."]));
  if (r.scorecard.gaps.some((g) => /ai companion/i.test(g.kpi))) out.push(opp("untapped", "spark", "Turn on AI Companion everywhere",
    "AI Companion adoption isn't registering — meeting summaries, smart recordings and compose are included but dark.",
    "Automatic notes, action items and summaries save every employee time on documentation — one of the fastest productivity wins in the platform.",
    "Company · End-user", "High", "Low", "Observed", null,
    ["Admin → AI Companion: enable Meeting Summary, Smart Recording, Team Chat & Mail compose org-wide.", "Lock it on so groups inherit it; allow auto-start summaries.", "Announce + train; track adoption in the AI Companion dashboard."]));
  if (data.webinarsTotal === 0 || dark("webinars")) out.push(opp("untapped", "trend", "Use Zoom Webinars / Events",
    "No webinars ran in the window — if the license is owned, it's capacity going unused.",
    "Run town-halls, training and marketing events on the platform you already pay for, with registration and engagement analytics built in.",
    "Department", "Med", "Low", "Observed", null,
    ["Confirm the Webinar / Events entitlement.", "Pilot one recurring internal or external event and review the engagement report."]));
  const zraRow = rows.find((x) => x.key === "zra_crm");
  if (zraRow && zraRow.state !== "Aligned") out.push(opp("untapped", "trend", "Connect Revenue Accelerator to your CRM",
    "Revenue Accelerator isn't connected, so conversation intelligence and deal-risk insight aren't flowing.",
    "Surface at-risk pipeline and scale coaching on what wins — the platform starts contributing to revenue, not just communications.",
    "Department", "Med", "Med", "Observed", null, zraRow.steps || []));
  return out;
}

function licensingOpps(data: Partial<ZoomReportData>) {
  const out: Opportunity[] = [], u = data.users ?? null, ph = data.phone ?? null;
  const idle = (u?.dormant30d || 0) + (u?.neverLoggedIn || 0);
  let seats = 0;
  if (u?.licensed && idle) {
    seats = idle;
    out.push(opp("licensing", "license", "Reclaim or right-size idle licenses",
      `${idle} of ${u.licensed} licensed users are dormant (30d+) or have never signed in — about ${Math.round(idle / u.licensed * 100)}% of paid seats.`,
      "Reassign or downgrade idle seats so the renewal reflects real usage — direct, recurring savings.",
      "Company · IT", "High", "Low", "Confirmed", { count: idle, label: "idle licenses" },
      ["Admin → Dashboard → Reports → Active Hosts: list users with no activity in 30–90 days.", "Downgrade/reclaim dormant Licensed users; reclaim never-logged-in seats at renewal.", "Add SCIM so leavers auto-release seats going forward."]));
  }
  if (ph?.unassignedNumbers && ph.numbers && ph.unassignedNumbers / ph.numbers >= 0.1)
    out.push(opp("licensing", "license", "Reclaim unassigned phone numbers",
      `${ph.unassignedNumbers} of ${ph.numbers} numbers have no user assigned.`,
      "Release or reassign unused DIDs to cut per-number cost and tidy routing.",
      "IT", "Med", "Low", "Confirmed", { count: ph.unassignedNumbers, label: "unassigned numbers" },
      ["Phone System Management → Numbers: identify unassigned DIDs.", "Release or reassign; confirm none are intended auto-receptionist lines."]));
  if (ph?.offlineDevices && ph.devices && ph.offlineDevices / ph.devices >= 0.3)
    out.push(opp("licensing", "gears", "Investigate offline desk phones",
      `${ph.offlineDevices} of ${ph.devices} provisioned devices are offline.`,
      "Reclaim or re-home hardware that isn't in use — or confirm they're shared / common-area devices.",
      "IT", "Low", "Low", "Confirmed", { count: ph.offlineDevices, label: "offline devices" },
      ["Phone → Devices: review offline hardware.", "Reassign, retire, or set shared units as Common Area Phones."]));
  return { opps: out, seats };
}

function workflowOpps(rows: ConfigAuditRow[]) {
  return rows.filter((r) => r.state === "Gap" || r.state === "Not Assessed").map((r) =>
    opp("workflow", "gears", `Enable: ${r.setting}`,
      r.state === "Gap" ? `${r.product}: currently “${r.current || "not set"}”, recommended “${r.recommended}”.` : `${r.product}: not yet assessed — recommended “${r.recommended}”.`,
      `Strengthens ${(r.impact || "the deployment").toLowerCase()}. ${r.remediation || ""}`.trim(),
      "IT · Admin", "Med", "Low", r.state === "Gap" ? "Confirmed" : "Observed", null, r.steps || [], `config:${r.key}`));
}

function cxOpps(r: ReportResult) {
  const out: Opportunity[] = [], seen = new Set<string>();
  const pull = (rep: ZoomProductReport | undefined, area: string) => {
    const o = rep?.opportunities;
    if (!Array.isArray(o)) return;
    for (const x of o) {
      // Skip the collectors' "nothing to report" placeholders (priority "—"); the
      // original listed them as Medium-impact opportunities.
      if (!x?.title || x.priority === "—" || seen.has(x.title)) continue;
      seen.add(x.title);
      out.push(opp("cx", areaIcon(area), x.title, x.detail || "", "", area, prio2impact(x.priority), "Med", "Confirmed", null, x.steps || [], area));
    }
  };
  pull(r.cc, "Contact Center"); pull(r.zva, "Virtual Agent"); pull(r.phone, "Zoom Phone"); pull(r.meetings, "Meetings");
  if (!out.length) {
    r.findings.findings.filter((f) => [4, 5, 8].includes(f.layer) && f.severity !== "Green").slice(0, 4).forEach((f) =>
      out.push(opp("cx", "heart", f.kpi, f.observation || "", f.recommendation || "", f.area || "Contact Center", f.severity === "Red" ? "High" : "Med", "Med", "Confirmed", null, f.steps || [], "finding")));
  }
  return out.slice(0, 8);
}
