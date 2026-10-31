import type { Platform } from "../../lib/optimizeV2Api";

export const PLATFORM_LABEL: Record<Platform, string> = { zoom: "Zoom", ringcentral: "RingCentral" };

export function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  // D1 datetime('now') has no zone marker; it's UTC.
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v) ? `${v.replace(" ", "T")}Z` : v;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** A KPI value in its unit: "$1,200", "82%", "45s", "4.1". */
export function fmtValue(v: number | string | null | undefined, unit?: string) {
  if (v == null || v === "") return "—";
  if (typeof v === "string") return v;
  if (unit === "$") return "$" + v.toLocaleString("en-US");
  if (unit === "%") return `${v}%`;
  if (unit === "sec") return `${v}s`;
  return v.toLocaleString("en-US");
}

export const SEVERITY_COLOR = {
  Red: { bg: "#fee2e2", fg: "#991b1b" },
  Amber: { bg: "#fef3c7", fg: "#92400e" },
  Green: { bg: "#dcfce7", fg: "#166534" },
} as const;
