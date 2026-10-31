// Helpers shared by the Zoom and RingCentral readouts (non-component code).
import type { Grade } from "../../../lib/optimizeV2Api";

/** Grade → CSS color var (the originals' gradeVar). */
export const gradeVar = (g: Grade | string | null | undefined) =>
  ({ A: "var(--o2r-good)", B: "var(--o2r-good)", C: "var(--o2r-warning)", D: "var(--o2r-serious)", F: "var(--o2r-critical)" } as Record<string, string>)[g ?? ""] ?? "var(--o2r-muted)";

/** RAG severity → CSS color var (the originals' ragVar). */
export const ragVar = (s: string | null | undefined) =>
  ({ Red: "var(--o2r-critical)", Amber: "var(--o2r-warning)", Green: "var(--o2r-good)" } as Record<string, string>)[s ?? ""] ?? "var(--o2r-muted)";

/** Accent token used in the narrative tables ("var(--s1)") → this module's CSS var. */
export const accentVar = (a: string | undefined) => (a ? a.replace("--s", "--o2r-s") : "var(--o2r-s1)");

export const letterGrade = (s: number | null): Grade =>
  s == null ? "N/A" : s >= 90 ? "A" : s >= 80 ? "B" : s >= 70 ? "C" : s >= 60 ? "D" : "F";

/** Locale number, "—" for null (the RingCentral original's N()). */
export const N = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString());

/** Days between two ISO dates, inclusive. */
export function reviewDays(w: { from?: string; to?: string } | undefined) {
  return w?.from && w?.to ? Math.round((Date.parse(w.to) - Date.parse(w.from)) / 86_400_000) + 1 : null;
}

/** File-name-safe customer slug. */
export const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
