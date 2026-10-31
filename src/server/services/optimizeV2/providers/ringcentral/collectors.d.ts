import type { RcClient } from "./rc";
import type { RcBlob } from "./types";

type Window = { timeFrom: string; timeTo: string; timeZone: string; days: number };

export function collectInventory(rc: RcClient, accountId: string): Promise<Record<string, unknown> & { collectionFindings?: string[]; queueMembershipComplete?: boolean }>;
export function collectAggregate(rc: RcClient, accountId: string, win: Window & { groupBy?: string }): Promise<RcBlob>;
export function collectTimeline(rc: RcClient, accountId: string, win: Window & { interval?: string; groupBy?: string }): Promise<(Record<string, unknown> & { paging?: { page?: number; totalPages?: number } }) | null>;
export function timelineBuckets(tl: RcBlob, counter?: string): unknown[];
export function collectAceCoverage(rc: RcClient, accountId: string, opts: { days: number; sample: number }): Promise<Record<string, unknown> & { note?: string }>;
export function collectRingCx(rc: RcClient, opts?: { budgetFloor?: number }): Promise<Record<string, unknown> & { note?: string }>;
export function collectVideo(rc: RcClient, opts: { timeFrom: string }): Promise<RcBlob>;
export function collectPresence(rc: RcClient, accountId: string): Promise<RcBlob>;
export function collectLicenses(rc: RcClient, accountId: string): Promise<RcBlob>;
