import type { RcAuditRow, RcBlob, RcKpiRow, RcSummary } from "./types";

export const SAMPLE_VOLUME_FLOOR: number;

export function deriveMetrics(input: {
  inventory: RcBlob; aggregate: RcBlob; ace: RcBlob; ringcx: RcBlob; video: RcBlob; presence: RcBlob; licenses: RcBlob;
}): {
  values: Record<string, number | null>; sources: Record<string, string>; reasons: Record<string, string>;
  totalCalls: number; answerable: number; outbound: number; unknownShare: number; breakdowns: unknown;
};

export function scoreKpis(input: {
  values: Record<string, number | null>; sources: Record<string, string>; reasons?: Record<string, string>;
  totalCalls: number; windowDays?: number; overrides?: Record<string, unknown>; extraFlags?: string[];
}): { rows: RcKpiRow[]; summary: RcSummary };

/** Audit rows, with the share of assessed checks aligned attached as `alignment` (0–1). */
export function runAudit(inventory: RcBlob, ringcx: RcBlob): RcAuditRow[] & { alignment?: number | null };
