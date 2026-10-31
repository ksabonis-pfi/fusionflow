// Types for collectors.js (kept as JavaScript; see its header).
import type { DomainStatus, MetricEntry } from "../../engine/types";
import type { ZoomClient } from "./client";

/** Raw data the collectors stash for reports. Mostly loose Zoom JSON. */
export type ZoomRaw = {
  cc?: { offered?: number; [k: string]: unknown };
  zva?: Record<string, unknown>;
  ccReport?: Record<string, unknown>;
  phoneReport?: Record<string, unknown>;
  meetingsReport?: Record<string, unknown>;
  [k: string]: unknown;
};

export type ZoomContext = {
  client: ZoomClient;
  accountId: string;
  from: string;
  to: string;
  metrics: Record<string, MetricEntry>;
  raw: ZoomRaw;
  /** Config-audit detect key → detected state ("Enabled", "Configured", …) or null. */
  audit: Record<string, string | null>;
  domains: Record<string, DomainStatus>;
  set(key: string, value: number | null, endpoint: string): void;
  miss(key: string, reason: string): void;
};

export function makeContext(client: ZoomClient, opts: { accountId: string; from: string; to: string }): ZoomContext;

/** Runs every domain collector in priority order. Never throws; gaps become per-KPI reasons. */
export function collectAll(ctx: ZoomContext): Promise<ZoomContext>;
