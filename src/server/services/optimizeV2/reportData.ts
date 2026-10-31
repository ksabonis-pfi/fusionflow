// Slim, derived fields the in-app readouts (Executive, Outcomes, Growth plan)
// need from a run's `raw` (Zoom) or `native` (RingCentral) payload. GET
// /runs/:runId strips those payloads, so the few counts the readouts use are
// lifted here instead of shipping the raw API data to the browser.
import type { StoredResult } from "./store";

export type ZoomReportData = {
  platform: "zoom";
  /** Contact Center contacts offered in the window (raw.cc.offered). */
  ccOffered: number | null;
  phoneUsers: number | null;
  roomsTotal: number | null;
  webinarsTotal: number | null;
  zvaSessions: number | null;
  users: { licensed: number | null; dormant30d: number | null; neverLoggedIn: number | null } | null;
  phone: { numbers: number | null; unassignedNumbers: number | null; devices: number | null; offlineDevices: number | null } | null;
};

export type RingCentralReportData = {
  platform: "ringcentral";
  windowDays: number | null;
  callsInWindow: number | null;
  callsPerDay: number | null;
  sampleVolume: boolean;
  kpisMeasurable: number | null;
  kpisBlocked: number | null;
  elapsedMs: number | null;
  /** Inputs each composite index couldn't get, by index key. */
  indexMissing: Record<string, number>;
  /** Why a KPI is blocked on this tenant, by KPI key. */
  kpiBlockedBy: Record<string, string>;
  extensions: number | null;
  hardPhones: number | null;
  hasRoomDevices: boolean;
  ringcxReachable: boolean;
  ringcxDrilled: boolean;
  aceRecordedCalls: number | null;
  aceNote: string | null;
};

export type ReportData = ZoomReportData | RingCentralReportData;

type Loose = Record<string, unknown> | null | undefined;
const obj = (v: unknown): Loose => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function buildReportData(result: StoredResult): ReportData | null {
  if (result.platform === "ringcentral") return ringCentral(obj(result.native));
  if (result.platform === "zoom" || result.raw) return zoom(obj(result.raw), obj(result.zva));
  return null;
}

function zoom(raw: Loose, zva: Loose): ZoomReportData {
  const users = obj(raw?.users), phone = obj(raw?.phone);
  const zvaSummary = obj(zva?.summary) ?? obj(obj(raw?.zva)?.summary);
  return {
    platform: "zoom",
    ccOffered: num(obj(raw?.cc)?.offered),
    phoneUsers: num(phone?.users),
    roomsTotal: num(obj(raw?.rooms)?.total),
    webinarsTotal: num(obj(raw?.webinars)?.total),
    zvaSessions: num(zvaSummary?.sessions),
    users: users ? { licensed: num(users.licensed), dormant30d: num(users.dormant30d), neverLoggedIn: num(users.neverLoggedIn) } : null,
    phone: phone ? {
      numbers: num(phone.numbers), unassignedNumbers: num(phone.unassignedNumbers),
      devices: num(phone.devices), offlineDevices: num(phone.offlineDevices),
    } : null,
  };
}

function ringCentral(snap: Loose): RingCentralReportData {
  const meta = obj(snap?.meta), summary = obj(snap?.summary);
  const inv = obj(snap?.inventory), ringcx = obj(snap?.ringcx), ace = obj(snap?.ace);
  const indexMissing: Record<string, number> = {};
  for (const ix of list<{ key?: string; missing?: unknown[] }>(snap?.indices)) {
    if (ix?.key && Array.isArray(ix.missing) && ix.missing.length) indexMissing[ix.key] = ix.missing.length;
  }
  const kpiBlockedBy: Record<string, string> = {};
  for (const k of list<{ key?: string; blockedBy?: string | null }>(snap?.kpis)) {
    if (k?.key && k.blockedBy) kpiBlockedBy[k.key] = k.blockedBy;
  }
  return {
    platform: "ringcentral",
    windowDays: num(obj(meta?.window)?.days),
    callsInWindow: num(summary?.total_calls_in_window),
    callsPerDay: num(summary?.calls_per_day),
    sampleVolume: !!summary?.sample_volume_flag,
    kpisMeasurable: num(summary?.kpis_measurable) ?? num(summary?.kpis_total),
    kpisBlocked: num(summary?.kpis_blocked),
    elapsedMs: num(meta?.elapsed_ms),
    indexMissing,
    kpiBlockedBy,
    extensions: num(obj(inv?.counts)?.extensions),
    hardPhones: num(inv?.hardPhones),
    hasRoomDevices: !!num(obj(inv?.devicesByType)?.Room),
    ringcxReachable: !!ringcx?.reachable,
    ringcxDrilled: !!ringcx?.drilled,
    aceRecordedCalls: num(ace?.recordedCalls),
    aceNote: typeof ace?.note === "string" ? ace.note : null,
  };
}
