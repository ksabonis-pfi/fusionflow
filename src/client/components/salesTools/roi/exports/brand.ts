/**
 * Shared look and naming for the ROI Word and PowerPoint exports. Ported from
 * the original builder's export palette (`XC`), hex without "#" as docx and
 * PptxGenJS expect.
 */

export const XC = {
  navy: "003B5C",
  green: "17C662",
  greenInk: "0B7A3E",
  blue: "63C1EA",
  grey: "D9E1E2",
  light: "EEF3F5",
  ink: "14232C",
  muted: "5B6B73",
  red: "B42318",
  aband: "9FB3BA",
} as const;

/** System font only (no web fonts are loaded into the exports). */
export const EXPORT_FONT = "Arial";

/** Long en-US date for the cover and title slide, e.g. "October 30, 2026". */
export function exportDate(): string {
  return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** Client name as shown inside the documents. */
export function clientLabel(client: string): string {
  return client || "Client";
}

/** File-name-safe client name: letters, digits, dash, underscore. Fallback "ROI". */
export function safeFileName(client: string): string {
  return String(client || "ROI").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "ROI";
}

export function exportFileName(client: string, ext: "docx" | "pptx"): string {
  return `${safeFileName(client)}_AI_Agent_ROI_Analysis.${ext}`;
}
