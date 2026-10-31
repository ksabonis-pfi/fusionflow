// Scoring primitives shared by every provider. Both standalone apps used these
// exact formulas (the RingCentral one documents itself as "deliberately
// identical to Zoom's"), so cross-platform scores stay comparable.
import type { Direction, Grade, KpiStatus, Severity } from "./types";

export const clamp = (n: number) => Math.max(0, Math.min(100, n));
export const r1 = (n: number | null | undefined): number | null => (n == null ? null : Math.round(n * 10) / 10);

/** A KPI value normalized to 0–100 attainment against its target and direction. */
export function attainment(v: number | null, target: number | null, dir: Direction): number | null {
  if (v == null || target == null) return null;
  if (dir === "higher") {
    if (target <= 0) return v > 0 ? 100 : 0;
    return Math.round(clamp((v / target) * 100));
  }
  if (v <= 0) return 100;
  return Math.round(clamp((target / v) * 100));
}

export function kpiStatus(v: number | null, target: number | null, dir: Direction): KpiStatus {
  if (v == null || target == null) return "—";
  if (dir === "higher") {
    // A 0 target on a higher-is-better KPI (hours saved, cost avoided, revenue)
    // means "any is good": match attainment(), which scores 0 as 0%. Without
    // this, 0 showed "On Target" while dragging the layer score down.
    if (target <= 0) return v > 0 ? "On Target" : "Below Target";
    return v >= target ? "On Target" : "Below Target";
  }
  return v <= target ? "On Target" : "Off Target";
}

export function grade(s: number | null): Grade {
  return s == null ? "N/A" : s >= 90 ? "A" : s >= 80 ? "B" : s >= 70 ? "C" : s >= 60 ? "D" : "F";
}

/** RAG severity for a missed KPI. */
export function severity(att: number | null): Severity {
  if (att == null) return "Amber";
  if (att < 60) return "Red";
  if (att < 85) return "Amber";
  return "Green";
}

const NEGATED_STATE = /\b(not|no|none|off|disabled|partial|missing)\b/;
const POSITIVE_STATE = /\b(enabled|enforced|configured|connected|on)\b/;

/** Whether a detected/entered config state satisfies the recommended one.
 *  Negated states ("Not configured", "Not connected", "Partial") are gaps: the
 *  original substring test matched "configured" inside "Not configured". */
export function sameState(current: unknown, recommended: string): boolean {
  const c = String(current).trim().toLowerCase();
  const r = recommended.trim().toLowerCase();
  if (c === r) return true;
  if (NEGATED_STATE.test(c)) return false;
  return POSITIVE_STATE.test(c) && /(enabled|enforced|configured|connected)/.test(r);
}

export function meanDefined(arr: (number | null | undefined)[]): number | null {
  const xs = arr.filter((x): x is number => x != null && !Number.isNaN(x));
  return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
}
