/**
 * Formatters and input parsing for the AI Agent ROI model, ported verbatim
 * from the original builder so on-screen and exported text match it exactly.
 */

import type { RoiField, RoiFieldType } from "./types.ts";

/** On-screen formatters. */
export const fmt = {
  int: (v: number | null | undefined): string => (v == null ? "" : Math.round(v).toLocaleString("en-US")),
  usd: (v: number): string => (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US"),
  usd2: (v: number): string => (v < 0 ? "-$" : "$") + Math.abs(v).toFixed(2),
  M: (v: number): string => (v < 0 ? "-$" : "$") + (Math.abs(v) / 1e6).toFixed(2) + "M",
  M1: (v: number): string => (v < 0 ? "-$" : "$") + (Math.abs(v) / 1e6).toFixed(1) + "M",
  pct: (v: number, d = 1): string => (v * 100).toFixed(d) + "%",
  one: (v: number): string => v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
};

/** Export formatters: "—" for null, plus pctT (trimmed 2dp percent) and x (multiplier). */
export const xf = {
  int: (v: number | null | undefined): string => (v == null ? "—" : Math.round(v).toLocaleString("en-US")),
  usd: (v: number | null | undefined): string => (v == null ? "—" : fmt.usd(v)),
  usd2: (v: number | null | undefined): string => (v == null ? "—" : fmt.usd2(v)),
  M1: (v: number): string => fmt.M1(v),
  M2: (v: number): string => fmt.M(v),
  pct: (v: number | null | undefined, d = 1): string => (v == null ? "—" : (v * 100).toFixed(d) + "%"),
  one: (v: number | null | undefined): string => (v == null ? "—" : fmt.one(v)),
  pctT: (v: number): string => {
    const s = (v * 100).toFixed(2);
    return s.replace(/\.?0+$/, "") + "%";
  },
  x: (v: number): string => v.toFixed(1) + "×",
};

/**
 * Parse a user-typed number: strips $ , % and whitespace. Blank → NaN.
 * Callers ignore NaN (the field keeps its previous value), except `numOpt`
 * where NaN or ≤ 0 stores null.
 */
export function parseNum(s: unknown): number {
  if (s == null) return NaN;
  const t = String(s).replace(/[$,%\s]/g, "");
  return t === "" ? NaN : Number(t);
}

/** The string an input box shows for a stored value (one cell of a Yr3 field). */
export function shownValue(type: RoiFieldType, v: unknown): string {
  switch (type) {
    case "pct":
    case "pct3":
      return v == null ? "" : +((v as number) * 100).toFixed(4) + "";
    case "money":
    case "money3":
      return v == null ? "" : (+(v as number)).toFixed(2);
    case "money0":
      return fmt.int(v as number | null | undefined);
    case "int":
      return fmt.int(v as number | null | undefined);
    case "numOpt":
      return v == null ? "" : String(v);
    default:
      return v == null ? "" : String(v);
  }
}

/** A stored input as it appears in the exports' input tables. */
export function showInput(f: Pick<RoiField, "type">, v: unknown): string {
  if (v == null) return "Not set";
  const T = f.type;
  if (T === "text") return v as string;
  if (T === "pct") return xf.pctT(v as number);
  if (T === "pct3") return (v as number[]).map(xf.pctT).join(" / ");
  if (T === "money") return xf.usd2(v as number);
  if (T === "money3") return (v as number[]).map(xf.usd2).join(" / ");
  if (T === "money0") return xf.usd(v as number);
  if (T === "int") return xf.int(v as number);
  return String(v);
}

/** Decimal places for a sensitivity discount column header (0 for whole tens). */
export function sensDiscDigits(d: number): number {
  return Math.abs(d * 10 - Math.round(d * 10)) < 1e-9 ? 0 : 1;
}
