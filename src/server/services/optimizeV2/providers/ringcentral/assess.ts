// RingCentral assessment pipeline: authenticate → collect → derive → score →
// audit → findings. Ported from the standalone RingCentral Optimization agent's
// assessCustomer() (assess.js); the sequence, guards and warnings are the
// original's. What changed: credentials are passed in (CloudConnect owns
// storage and encryption) and the result is returned rather than saved.
import {
  collectAceCoverage, collectAggregate, collectInventory, collectLicenses, collectPresence,
  collectRingCx, collectTimeline, collectVideo, timelineBuckets,
} from "./collectors";
import { buildFindings, buildImprovements } from "./findings";
import { deriveMetrics, runAudit, scoreKpis } from "./kpis";
import { RcClient } from "./rc";
import { computeIndices, grade, overallScore, scoreLayers } from "./scoring";
import type { RcAuditRow, RcBlob, RcFinding, RcImprovement, RcIndex, RcKpiRow, RcLayer, RcSummary } from "./types";

/** Business Analytics serves at most 184 days; any window is clamped to fit. */
const MAX_ANALYTICS_DAYS = 184;

export type RingCentralCredentials = {
  clientId: string;
  clientSecret: string;
  jwt: string;
  /** "production" (the sandbox host is retired). */
  rcEnv?: string;
  /** "~" = the account the JWT belongs to. */
  rcAccountId?: string;
};

export type RcWindow = { timeFrom: string; timeTo: string; timeZone: string; days: number; clamped: boolean };

export function windowFor(days: number | undefined, tz: string | undefined): RcWindow {
  const clamped = Math.min(Math.max(1, Number(days) || 30), MAX_ANALYTICS_DAYS);
  const to = new Date();
  const from = new Date(to.getTime() - clamped * 86_400_000);
  return { timeFrom: from.toISOString(), timeTo: to.toISOString(), timeZone: tz || "America/Los_Angeles", days: clamped, clamped: false };
}

/** Read the `exp` claim from a JWT without verifying it (we don't hold the signing key). */
export function jwtExpiry(jwt: string): string | null {
  try {
    let p = String(jwt).split(".")[1];
    p += "=".repeat((4 - (p.length % 4)) % 4);
    const { exp } = JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return exp ? new Date(exp * 1000).toISOString() : null;
  } catch {
    return null;
  }
}

export class RcCredentialError extends Error {}

/** The engine's native result: the same `snapshot` the standalone app stored per run. */
export type RcSnapshot = {
  meta: {
    account_id: unknown;
    window: { from: string; to: string; days: number; timezone: string };
    volume: { total: number; answerable: number; outbound: number; per_day: number };
    interval: string;
    subrequests_used: number;
    scope_granted: string[];
    elapsed_ms: number;
    generated_at: string;
  };
  summary: RcSummary;
  kpis: RcKpiRow[];
  layers: RcLayer[];
  indices: RcIndex[];
  findings: RcFinding[];
  findingSummary: { red: number; amber: number; green: number; total: number };
  improvements: RcImprovement[];
  potentialGain: number;
  analytics: { counters: unknown; timeline: { interval: string; buckets: unknown[] }; unknownResultShare: number };
  ace: RcBlob;
  ringcx: RcBlob;
  video: RcBlob;
  presence: RcBlob;
  licenses: RcBlob;
  audit: RcAuditRow[];
  audit_alignment: number | null;
  inventory: RcBlob;
  warnings: string[];
};

export type RcAssessmentInput = RingCentralCredentials & {
  windowDays?: number;
  timezone?: string;
  /** Manually supplied KPI values by key (the standalone app's `inputs`). */
  overrides?: Record<string, unknown>;
  /** KPI keys to flag as sample-volume artifacts (the standalone app's `flags.sampleVolumeArtifacts`). */
  extraFlags?: string[];
  interval?: string;
  /** Max RingCentral API calls for this run (the standalone app ran with 80). */
  budget?: number;
};

const firstLine = (e: unknown) => String(e instanceof Error ? e.message : e).split("\n")[0];

export async function runRingCentralAssessment(input: RcAssessmentInput): Promise<RcSnapshot> {
  const started = Date.now();
  const warnings: string[] = [];
  const interval = input.interval || "Week";
  const { clientId, clientSecret, jwt } = input;
  if (!clientSecret || !jwt) throw new RcCredentialError("This connection has no stored RingCentral credentials.");

  const expires = jwtExpiry(jwt);
  if (expires) {
    const daysLeft = (new Date(expires).getTime() - Date.now()) / 86_400_000;
    if (daysLeft < 0) throw new RcCredentialError(`Stored JWT expired ${Math.abs(Math.round(daysLeft))} day(s) ago — issue a new one.`);
    if (daysLeft < 30) warnings.push(`JWT expires in ${Math.round(daysLeft)} day(s) — reissue before it lapses.`);
  }

  const acct = input.rcAccountId || "~";
  const rc = new RcClient({ clientId, clientSecret, jwt, rcEnv: input.rcEnv || "production", accountId: acct, budget: input.budget ?? 80 });

  // Authenticate before spending budget: when the token exchange fails every
  // collector degrades to empty results, which would score as "nothing wrong"
  // rather than "nothing known". A credential problem stops the run outright.
  try {
    await rc.getToken();
  } catch (e) {
    throw new RcCredentialError(
      `RingCentral rejected these credentials, so no assessment was run. ${firstLine(e)} ` +
      `Nothing was saved — fix the client id, client secret or JWT and run again.`,
    );
  }

  const win = windowFor(input.windowDays, input.timezone);

  // --- collect -------------------------------------------------------------
  let aggregate: RcBlob = null;
  try { aggregate = await collectAggregate(rc, acct, win); } catch (e) { warnings.push(`Analytics aggregate unavailable: ${firstLine(e)}`); }

  let buckets: unknown[] = [];
  try {
    const tl = await collectTimeline(rc, acct, { ...win, interval });
    buckets = timelineBuckets(tl);
    const pg = tl?.paging;
    if ((pg?.totalPages ?? 1) > 1) {
      warnings.push(`Timeline returned page ${pg?.page} of ${pg?.totalPages} (perPage capped at 20) — trend covers this page only.`);
    }
  } catch (e) { warnings.push(`Analytics timeline unavailable: ${firstLine(e)}`); }

  let inventory: Awaited<ReturnType<typeof collectInventory>> | null = null;
  try {
    inventory = await collectInventory(rc, acct);
    warnings.push(...(inventory.collectionFindings || []));
    if (!inventory.queueMembershipComplete) warnings.push("Queue membership only partially collected — subrequest budget reached.");
  } catch (e) { warnings.push(`Inventory unavailable: ${firstLine(e)}`); }

  let ace: Awaited<ReturnType<typeof collectAceCoverage>> | null = null;
  try {
    ace = await collectAceCoverage(rc, acct, { days: win.days, sample: 8 });
    if (ace.note) warnings.push(`AI insights: ${ace.note}`);
  } catch (e) { warnings.push(`AI insight coverage unavailable: ${firstLine(e)}`); }

  let licenses: RcBlob = null;
  try { licenses = await collectLicenses(rc, acct); } catch (e) { warnings.push(`License inventory unavailable: ${firstLine(e)}`); }

  let presence: RcBlob = null;
  try { presence = await collectPresence(rc, acct); } catch (e) { warnings.push(`Presence unavailable: ${firstLine(e)}`); }

  let video: RcBlob = null;
  try { video = await collectVideo(rc, { timeFrom: win.timeFrom }); } catch (e) { warnings.push(`Video history unavailable: ${firstLine(e)}`); }

  let ringcx: Awaited<ReturnType<typeof collectRingCx>> | null = null;
  try {
    ringcx = await collectRingCx(rc);
    if (ringcx.note) warnings.push(`RingCX: ${ringcx.note}`);
  } catch (e) { warnings.push(`RingCX unavailable: ${firstLine(e)}`); }

  // --- compute -------------------------------------------------------------
  const { values, sources, reasons, totalCalls, answerable, outbound, unknownShare, breakdowns } =
    deriveMetrics({ inventory, aggregate, ace, ringcx, video, presence, licenses });

  const { rows, summary } = scoreKpis({
    values, sources, reasons, totalCalls, windowDays: win.days, overrides: input.overrides || {}, extraFlags: input.extraFlags || [],
  });
  const auditRows = runAudit(inventory, ringcx);

  const layers = scoreLayers(rows);
  const indices = computeIndices(rows);
  const overall = overallScore(layers);
  const { findings, summary: findingSummary } = buildFindings(rows, auditRows, layers);
  const { improvements, potentialGain } = buildImprovements(rows, auditRows, layers);

  // Layer scoring supersedes the crude green-ratio in scoreKpis().
  summary.overall = overall;
  summary.overall_grade = grade(overall);
  summary.red_findings = findingSummary.red;
  summary.amber_findings = findingSummary.amber;
  summary.potential_gain = potentialGain;
  summary.potential_overall = overall != null ? Math.min(100, Math.round((overall + potentialGain) * 10) / 10) : null;

  if (summary.sample_volume_flag) {
    warnings.push(
      `Sample-volume artifact: ${totalCalls} calls over ${win.days} days (${summary.calls_per_day}/day). ` +
      `Rate KPIs are flagged and must not be presented as outcomes — re-baseline on production volumes.`,
    );
  }
  if (unknownShare > 0.1) {
    warnings.push(
      `callsByResult has a ${(unknownShare * 100).toFixed(0)}% "unknown" bucket — it is not a sound basis for rates. ` +
      `Answer and connect rates here are derived from callsByResponse instead.`,
    );
  }

  return {
    meta: {
      account_id: (inventory?.account as { id?: unknown } | undefined)?.id ?? null,
      window: { from: win.timeFrom, to: win.timeTo, days: win.days, timezone: win.timeZone },
      volume: { total: totalCalls, answerable, outbound, per_day: summary.calls_per_day },
      interval,
      subrequests_used: rc.spent,
      scope_granted: rc.scope ? rc.scope.split(/[\s,]+/).filter(Boolean) : [],
      elapsed_ms: Date.now() - started,
      generated_at: new Date().toISOString(),
    },
    summary,
    kpis: rows,
    layers,
    indices,
    findings,
    findingSummary,
    improvements,
    potentialGain,
    analytics: { counters: breakdowns, timeline: { interval, buckets }, unknownResultShare: unknownShare },
    ace,
    ringcx,
    video,
    presence,
    licenses,
    audit: auditRows,
    audit_alignment: auditRows.alignment ?? null,
    inventory,
    warnings,
  };
}
