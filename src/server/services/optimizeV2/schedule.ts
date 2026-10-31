// Monthly scheduled re-runs (phase 5). Each connection can opt in to a run on a
// day of the month, judged in the connection's own timezone. The hourly cron
// calls runDueConnections(); see the comment there for batching and limits.
import type { Bindings } from "../../types";
import { RunInputError, runConnection } from "./run";
import { getConnection, recordRunError, saveRun, type ConnectionRow } from "./store";
import { ZoomError } from "./providers/zoom/client";

const DEFAULT_TZ = "America/Los_Angeles";

/** At most this many assessments per cron invocation. Each run makes up to
 *  ~200 platform API calls plus a few D1/R2 calls and takes 10–40s, so three
 *  stay well inside one invocation's subrequest and wall-clock limits. */
export const SCHEDULE_BATCH = 3;

export type ScheduleState = {
  schedule_enabled: number;
  schedule_day: number;
  timezone: string;
  has_credentials: boolean;
  /** Any run (manual or scheduled), D1 UTC datetime. */
  last_run_at: string | null;
  /** Last time the scheduler started a run for this connection, D1 UTC datetime. */
  schedule_attempted_at: string | null;
};

export type DueCheck = { due: boolean; reason: string; dueDate?: string };

/** D1 datetime('now') text ("YYYY-MM-DD HH:MM:SS", UTC) or ISO, as a Date. */
function parseUtc(v: string): Date {
  return new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v) ? `${v.replace(" ", "T")}Z` : v);
}

function validTz(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

/** The calendar date (YYYY-MM-DD) of an instant in a timezone. */
export function localDate(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: validTz(tz), year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based

/** This month's run date for a schedule day, clamped to the month's last day
 *  (a day-31 schedule runs on Feb 28/29, Apr 30, …). */
export function dueDateFor(today: string, scheduleDay: number): string {
  const [y, m] = today.split("-").map(Number);
  const day = Math.min(Math.max(1, Math.trunc(scheduleDay) || 1), daysInMonth(y, m));
  return `${today.slice(0, 7)}-${String(day).padStart(2, "0")}`;
}

/**
 * Whether a connection's monthly run is due at `now`.
 *
 * Due on or after this month's run date (in the connection's timezone) until a
 * run lands on or after that date. "On or after", not "on": a connection the
 * batch cap or a failure pushed past its day still runs that month. A manual
 * run on or after the date counts, so a run someone just did by hand isn't
 * repeated. The scheduler tries each connection at most once per local day, so
 * a broken connection fails once a day rather than every tick.
 */
export function isDue(s: ScheduleState, now: Date): DueCheck {
  if (!s.schedule_enabled) return { due: false, reason: "disabled" };
  if (!s.has_credentials) return { due: false, reason: "no credentials" };
  const tz = validTz(s.timezone);
  const today = localDate(now, tz);
  const dueDate = dueDateFor(today, s.schedule_day);
  if (today < dueDate) return { due: false, reason: "before this month's run date", dueDate };
  if (s.last_run_at && localDate(parseUtc(s.last_run_at), tz) >= dueDate) {
    return { due: false, reason: "already ran this month", dueDate };
  }
  if (s.schedule_attempted_at && localDate(parseUtc(s.schedule_attempted_at), tz) === today) {
    return { due: false, reason: "already attempted today", dueDate };
  }
  return { due: true, reason: "due", dueDate };
}

type Candidate = Pick<ConnectionRow, "id" | "schedule_enabled" | "schedule_day" | "timezone" | "last_run_at"> & {
  has_credentials: number;
  schedule_attempted_at: string | null;
};

/**
 * Run the connections whose monthly run is due, oldest attempt first, up to
 * SCHEDULE_BATCH per call and one at a time. Anything left over is picked up
 * by the next hourly tick (isDue stays true until a run lands).
 */
export async function runDueConnections(env: Bindings, now = new Date()): Promise<void> {
  if (env.OPTIMIZE_V2_ENABLED !== "true" || !env.OPTIMIZE_ENC_KEY) return;

  const rows = await env.DB.prepare(
    `SELECT id, schedule_enabled, schedule_day, timezone, last_run_at, schedule_attempted_at,
            (creds_enc IS NOT NULL) AS has_credentials
       FROM opt2_connections
      WHERE schedule_enabled = 1 AND creds_enc IS NOT NULL
      ORDER BY schedule_attempted_at IS NOT NULL, schedule_attempted_at, created_at`,
  ).all<Candidate>();

  const due = (rows.results ?? [])
    .filter((r) => isDue({ ...r, has_credentials: !!r.has_credentials }, now).due)
    .slice(0, SCHEDULE_BATCH);

  for (const { id } of due) {
    // Claim it first: if this invocation dies mid-run, the next tick won't
    // retry it until tomorrow (local), rather than hammering the tenant hourly.
    await env.DB.prepare("UPDATE opt2_connections SET schedule_attempted_at = datetime('now') WHERE id = ?").bind(id).run();
    const conn = await getConnection(env, id);
    if (!conn) continue;
    try {
      const result = await runConnection(env, conn);
      await saveRun(env, conn, result, "scheduled", null);
      console.log("[optimize-v2] scheduled run saved", conn.id, result.scorecard.overall);
    } catch (err) {
      const msg = err instanceof ZoomError ? `Zoom: ${err.message}` : err instanceof Error ? err.message : String(err);
      console.error("[optimize-v2] scheduled run failed", conn.id, err instanceof RunInputError ? msg : err);
      await recordRunError(env, conn.id, `Scheduled run: ${msg}`).catch(() => {});
    }
  }
}
