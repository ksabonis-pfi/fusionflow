// Small display pieces shared by the Optimizations V2 pages.
import type { Grade } from "../../lib/optimizeV2Api";

const GRADE_COLOR: Record<Grade, { bg: string; fg: string }> = {
  A: { bg: "#dcfce7", fg: "#166534" },
  B: { bg: "#ecfccb", fg: "#3f6212" },
  C: { bg: "#fef9c3", fg: "#854d0e" },
  D: { bg: "#ffedd5", fg: "#9a3412" },
  F: { bg: "#fee2e2", fg: "#991b1b" },
  "N/A": { bg: "#f1f5f9", fg: "#64748b" },
};

export function GradePill({ score, grade, size = "sm" }: { score: number | null; grade: Grade | null; size?: "sm" | "lg" }) {
  const g = grade ?? "N/A";
  const c = GRADE_COLOR[g];
  const lg = size === "lg";
  return (
    <span style={{
      display: "inline-flex", alignItems: "baseline", gap: lg ? 8 : 4, padding: lg ? "6px 14px" : "2px 8px",
      borderRadius: 999, background: c.bg, color: c.fg, fontWeight: 700, fontSize: lg ? 28 : 12, whiteSpace: "nowrap",
    }}>
      {score ?? "—"}<span style={{ fontSize: lg ? 15 : 11, opacity: 0.85 }}>{g}</span>
    </span>
  );
}

/** Marks a run brought over from the standalone Zoom / RingCentral apps. */
export function ImportedBadge() {
  return (
    <span title="Imported from the standalone optimization app" style={{ marginLeft: 6 }}>
      <Pill bg="#e0f2fe" fg="#075985">Imported</Pill>
    </span>
  );
}

export function Pill({ children, bg, fg }: { children: React.ReactNode; bg: string; fg: string }) {
  return (
    <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: bg, color: fg, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}
