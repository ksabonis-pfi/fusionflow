// Zoom assessment pipeline: token → collect → scorecard → findings.
// Ported from the standalone Zoom Optimization agent (assess.js, v3.2.0).
import type { Assumptions, Findings, ManualInputs, Scorecard } from "../../engine/types";
import { getToken, makeClient, type ZoomCredentials } from "./client";
import { collectAll, makeContext, type ZoomRaw } from "./collectors";
import { buildFindings } from "./findings";
import { buildScorecard } from "./scorecard";

export type ZoomAssessmentInput = ZoomCredentials & {
  fromDate?: string;
  toDate?: string;
  windowDays?: number;
  assumptions?: Assumptions;
  inputs?: ManualInputs;
  /** Max Zoom API calls for this run (Workers cap subrequests per invocation). */
  budget?: number;
};

export const ZOOM_RUN_BUDGET = 200;

export type ZoomAssessmentResult = {
  meta: {
    generatedAt: string;
    accountId: string;
    window: { from: string; to: string };
    grantedScopes: string[];
    subrequestsUsed: number;
    generator: string;
  };
  scorecard: Scorecard;
  findings: Findings;
  /** Per-product deep-report data, built by the collectors. */
  zva: Record<string, unknown>;
  cc: Record<string, unknown>;
  phone: Record<string, unknown>;
  meetings: Record<string, unknown>;
  raw: ZoomRaw;
  domains: Scorecard["domains"];
};

export async function runZoomAssessment(input: ZoomAssessmentInput): Promise<ZoomAssessmentResult> {
  // 200 calls per run. The standalone app used 48 to fit Cloudflare's free plan
  // (50 subrequests per invocation); CloudConnect runs on the paid plan. At 48 a
  // tenant with full admin read scopes hit the cap every run and the late
  // collectors (ZRA, webinars, deep phone/meeting reports) were cut short.
  // Each collector still has its own page caps, so a run stays well under this.
  const { accountId, clientId, clientSecret, assumptions = {}, inputs = {}, budget = ZOOM_RUN_BUDGET } = input;
  const to = input.toDate || new Date().toISOString().slice(0, 10);
  const from = input.fromDate || new Date(Date.parse(to) - (Number(input.windowDays) || 30) * 86_400_000).toISOString().slice(0, 10);

  const token = await getToken({ accountId, clientId, clientSecret });
  // Use the API host Zoom assigned this tenant (regional deployments differ).
  const client = makeClient(token.accessToken, { base: token.apiUrl, budget });
  const ctx = makeContext(client, { accountId, from, to });
  await collectAll(ctx);
  const scorecard = buildScorecard(ctx, assumptions, inputs);
  const findings = buildFindings(scorecard);

  // The ZVA drill-down logs are heavy: keep them only on the top-level `zva`
  // and strip them from the `raw.zva` copy so the run isn't stored twice.
  const zva = ctx.raw.zva || { available: false };
  if (ctx.raw.zva) ctx.raw.zva = { ...ctx.raw.zva, records: undefined, queryRecords: undefined, debug: undefined };

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      accountId,
      window: { from, to },
      grantedScopes: token.scopes,
      subrequestsUsed: client.usage(),
      generator: "PacketFusion CloudConnect — Optimizations (Zoom)",
    },
    scorecard,
    findings,
    zva,
    cc: ctx.raw.ccReport || { available: false },
    phone: ctx.raw.phoneReport || { available: false },
    meetings: ctx.raw.meetingsReport || { available: false },
    raw: ctx.raw,
    domains: ctx.domains,
  };
}
