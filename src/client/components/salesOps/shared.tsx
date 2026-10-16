// Small display components shared by the Sales Ops tabs.

export type BadgeTone = "green" | "amber" | "red" | "slate" | "teal";

export function Badge({ children, tone, title }: { children: React.ReactNode; tone: BadgeTone; title?: string }) {
  const tones = {
    green: { bg: "#dcfce7", fg: "#166534" },
    amber: { bg: "#fef3c7", fg: "#92400e" },
    red: { bg: "#fee2e2", fg: "#991b1b" },
    slate: { bg: "#f1f5f9", fg: "#475569" },
    teal: { bg: "#ccfbf1", fg: "#115e59" },
  }[tone];
  return (
    <span title={title} style={{ display: "inline-block", fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: tones.bg, color: tones.fg, marginRight: 4, marginBottom: 2, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}
