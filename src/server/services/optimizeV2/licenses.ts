// Licenses & seat utilization summary for the run page. Computed from the raw
// collector data when a run is read, because GET /runs/:runId keeps `raw` and
// `native` server-side.
//
// Utilization uses the exact formula behind each platform's
// `license_utilization` KPI so the section and the scorecard can't disagree:
//   Zoom (collectors.js usersAndLicenses): in use = licensed − dormant30d − neverLoggedIn
//     (floored at 0), utilization = in use / licensed, rounded to 2 dp as ctx.set does.
//   RingCentral (kpis.js deriveMetrics): Enabled user extensions / all user extensions.
// Both KPIs can be overridden by a manual input (mode "supplied"), so the
// scorecard's KPI is passed along too and the UI says when it was supplied.
import type { StoredResult } from "./store";

type ScorecardKpi = { value: number | null; target: number | null; supplied: boolean };

export type ZoomLicenseSummary = {
  platform: "zoom";
  licensed: number;
  inUse: number;
  /** Bar segments, capped so inUse + dormantSeats + neverSeats = licensed. */
  dormantSeats: number;
  neverSeats: number;
  /** licensed − inUse: seats held by dormant or never-signed-in users. */
  reclaimable: number;
  /** The collector counts dormant / never-signed-in across every user, Basic
   *  included; true when those counts exceed the licensed seats they're
   *  subtracted from (so the bar segments above are capped). */
  countsIncludeBasic: boolean;
  utilizationPct: number | null;
  basic: number;
  totalUsers: number;
  /** The user list hit its page cap (large tenant). */
  sampled: boolean;
  phone: { users: number; numbers: number | null; unassignedNumbers: number | null } | null;
  rooms: number | null;
  scorecardKpi: ScorecardKpi | null;
};

export type RingCentralLicenseSummary = {
  platform: "ringcentral";
  /** User extensions by status: the KPI's population (queues, IVRs excluded). */
  users: { total: number; enabled: number; notActivated: number; disabled: number; other: number } | null;
  utilizationPct: number | null;
  /** Purchased licenses from the account's license inventory. */
  licenses: { total: number; assigned: number; unassigned: number; planName: string | null } | null;
  scorecardKpi: ScorecardKpi | null;
};

export type LicenseSummary = ZoomLicenseSummary | RingCentralLicenseSummary;

const round2 = (v: number) => Math.round(v * 100) / 100;
const num =(v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const optNum = (v: unknown): number | null => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function scorecardKpi(result: StoredResult): ScorecardKpi | null {
  for (const l of result.scorecard?.layers ?? []) {
    const k = l.kpis.find((x) => x.key === "license_utilization");
    if (k) return { value: k.available ? k.value : null, target: k.target, supplied: k.mode === "supplied" };
  }
  return null;
}

export function summarizeLicenses(result: StoredResult | null): LicenseSummary | null {
  if (!result) return null;
  return result.platform === "ringcentral" ? summarizeRingCentral(result) : summarizeZoom(result);
}

function summarizeZoom(result: StoredResult): ZoomLicenseSummary | null {
  const raw = obj(result.raw);
  const u = obj(raw?.users);
  if (!u) return null;
  const licensed = num(u.licensed), totalUsers = num(u.total);
  if (licensed === 0 && totalUsers === 0) return null;

  const dormant = num(u.dormant30d), never = num(u.neverLoggedIn);
  const inUse = Math.max(0, licensed - dormant - never);
  const dormantSeats = Math.min(dormant, licensed - inUse);
  const neverSeats = Math.min(never, licensed - inUse - dormantSeats);

  const ph = obj(raw?.phone), rm = obj(raw?.rooms);
  return {
    platform: "zoom",
    licensed, inUse, dormantSeats, neverSeats,
    reclaimable: licensed - inUse,
    countsIncludeBasic: licensed > 0 && dormant + never > licensed,
    utilizationPct: licensed > 0 ? round2((inUse / licensed) * 100) : null,
    basic: num(u.basic),
    totalUsers,
    sampled: !!u.truncated,
    phone: ph && num(ph.users) > 0 ? { users: num(ph.users), numbers: optNum(ph.numbers), unassignedNumbers: optNum(ph.unassignedNumbers) } : null,
    rooms: rm && num(rm.total) > 0 ? num(rm.total) : null,
    scorecardKpi: scorecardKpi(result),
  };
}

function summarizeRingCentral(result: StoredResult): RingCentralLicenseSummary | null {
  const native = obj(result.native);
  const inv = obj(native?.inventory);
  const lic = obj(native?.licenses);

  let users: RingCentralLicenseSummary["users"] = null;
  const unavailable = Array.isArray(inv?.unavailable) ? (inv.unavailable as unknown[]) : [];
  const ubs = obj(inv?.usersByStatus);
  if (inv && ubs && !unavailable.includes("extensions")) {
    const total = Object.values(ubs).reduce<number>((a, b) => a + num(b), 0);
    if (total > 0) {
      const enabled = num(ubs.Enabled), notActivated = num(ubs.NotActivated), disabled = num(ubs.Disabled);
      users = { total, enabled, notActivated, disabled, other: total - enabled - notActivated - disabled };
    }
  }

  const licenses = lic?.reachable && num(lic.total) > 0
    ? { total: num(lic.total), assigned: num(lic.assigned), unassigned: num(lic.unassigned), planName: typeof lic.planName === "string" ? lic.planName : null }
    : null;

  if (!users && !licenses) return null;
  return {
    platform: "ringcentral",
    users,
    utilizationPct: users ? (users.enabled / users.total) * 100 : null,
    licenses,
    scorecardKpi: scorecardKpi(result),
  };
}
