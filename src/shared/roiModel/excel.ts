/**
 * "Copy results for Excel": the ROI table as tab-separated text, ported
 * verbatim from the original builder so the pasted output matches it
 * byte-for-byte (verified by the external parity harness).
 *
 * Values are rounded to 2 decimals and stringified by Array#join; null
 * cells (Today on year-only rows, and rows with no 3-year total) are empty.
 */

import type { RoiResult } from "./types.ts";

type Cell = string | number;

export function buildRoiTsv(o: RoiResult): string {
  const R = o.R, H = o.H;
  const L: Cell[][] = [["Line item", "Today", "Year 1", "Year 2", "Year 3", "3-yr total"]];
  const add = (n: string, a: (number | null)[], t?: number | null) =>
    L.push([n, ...a.map((v) => (v == null ? "" : Math.round(v * 100) / 100)), t == null ? "" : Math.round(t * 100) / 100]);
  add("Annual calls offered", R.offered); add("Calls routed to AI agent", R.routed); add("Calls fully resolved by AI", R.contained); add("Calls still needing a human", R.human); add("Calls answered (total)", R.answered); add("Calls abandoned", R.abandoned); add("Additional callers served vs. today", R.added); add("Outbound calls placed", R.outbound); add("Outbound calls placed by AI", R.outAIc); add("Outbound calls placed by agents", R.outHuman);
  add("Human agents required", R.req); add("Agents needed without AI", R.needed); add("Agents offset vs. today", R.offset);
  add("Human labor", R.labor, H.tot.labor); add("Turnover / onboarding", R.turn, H.tot.turn); add("AI voice conversations", R.voice, H.tot.voice); add("AI digital conversations", R.digital, H.tot.digital); add("Implementation", R.impl, H.tot.impl); add("Managed services", R.admin, H.tot.admin); add("Total cost with AI agent", R.total, H.tot.total);
  add("Net savings vs. today (View A)", R.saveA, H.tot.saveA); add("Cost of human-only plan", R.humanOnly, H.tot.humanOnly); add("Net savings vs. human-only plan (View B)", R.saveB, H.tot.saveB);
  add("Human cost per handled call", R.costPerCall); add("AI cost per AI-handled call", R.aiPerResolved); add("Break-even containment", R.breakeven);
  return L.map((r) => r.join("\t")).join("\n");
}
