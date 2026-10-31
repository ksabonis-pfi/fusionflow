// Shapes the readouts read from GET /optimize-v2/runs/:runId, beyond the
// shared RunResult. `reportData` mirrors src/server/services/optimizeV2/reportData.ts.
import type { RunResult, RunSummary } from "../../../lib/optimizeV2Api";

export type ZoomReportData = {
  platform: "zoom";
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
  indexMissing: Record<string, number>;
  kpiBlockedBy: Record<string, string>;
  extensions: number | null;
  hardPhones: number | null;
  hasRoomDevices: boolean;
  ringcxReachable: boolean;
  ringcxDrilled: boolean;
  aceRecordedCalls: number | null;
  aceNote: string | null;
};

/** A Zoom product deep-report blob (cc / zva / phone / meetings): only what the readouts touch. */
export type ZoomProductReport = {
  available?: boolean;
  summary?: { sessions?: number | null } & Record<string, unknown>;
  opportunities?: { priority?: string; title?: string; detail?: string; steps?: string[] }[];
  [k: string]: unknown;
};

export type ReportResult = RunResult & {
  meta: RunResult["meta"] & { generator?: string };
  reportData?: ZoomReportData | RingCentralReportData | null;
  cc?: ZoomProductReport;
  zva?: ZoomProductReport;
  phone?: ZoomProductReport;
  meetings?: ZoomProductReport;
};

export type ReportRun = RunSummary & {
  optimize_account_id?: string;
  customer_name?: string | null;
  schedule_enabled?: number;
};

export type ReportKind = "executive" | "outcomes" | "growth";
export type ZoomTrack = "essentials" | "advanced";

/** Evidence basis tag (the Outcomes report's Confirmed / Observed tagging). */
export type Basis = "Confirmed" | "Observed" | "Modeled" | "Supplied";

/** One Growth & Enablement opportunity (both platforms share the shape). */
export type Opportunity = {
  category: string;
  icon: string;
  title: string;
  why: string;
  benefit: string;
  who: string;
  impact: "High" | "Med" | "Low";
  effort: "High" | "Med" | "Low";
  basis: Basis;
  value: { count: number | string; label: string } | null;
  steps: string[];
  source: string;
};

export type GrowthCategory = { key: string; icon: string; label: string; lede: string };

export type Ecosystem = { key: "microsoft" | "google" | "saas" | "unknown"; label: string; basis: Basis; note: string };

/** What the shared Growth plan renderer needs, whatever the platform. */
export type GrowthModel = {
  cover: { customer: string; accountId: string; window: { from?: string; to?: string }; generatedAt: string };
  ecosystem: Ecosystem;
  categories: Record<string, Opportunity[]>;
  topWins: Opportunity[];
  summary: string[];
  total: number;
};
