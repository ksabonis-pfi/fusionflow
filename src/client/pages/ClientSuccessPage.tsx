// Client Success module — landing shell. The module-select tile and this page
// exist; the four capability areas below (roadmaps, renewals, surveys,
// success plans) are not built yet — scope/data model TBD with the user
// before any of them get real pages.
const PLANNED: Array<{ title: string; desc: string; icon: React.ReactNode }> = [
  {
    title: "Technology Roadmaps",
    desc: "Shared, forward-looking plans for what's next with each customer's stack.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
        <path d="M3 3v18h18" /><path d="M7 14l4-4 4 4 5-5" />
      </svg>
    ),
  },
  {
    title: "Renewal Tracking",
    desc: "Visibility into upcoming renewal dates and risk ahead of the deadline.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
        <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      </svg>
    ),
  },
  {
    title: "Satisfaction Surveys",
    desc: "Structured check-ins to capture how a customer feels about the partnership.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    title: "Success Plans",
    desc: "Shared goals and milestones that keep the account moving toward value.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
        <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
];

export default function ClientSuccessPage() {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="ms-page-header">
        <div>
          <h1 className="ms-page-title">Client Success</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>Health &amp; Advocacy</p>
        </div>
      </div>

      <div className="ms-card" style={{ padding: "28px 24px", marginBottom: 20 }}>
        <p style={{ margin: 0, fontSize: 14, color: "#475569", lineHeight: 1.6, maxWidth: 640 }}>
          This module is just getting started. The four areas below are planned — nothing here is wired up yet.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {PLANNED.map((p) => (
          <div key={p.title} className="ms-card" style={{ padding: "20px 20px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#7c3aed22", border: "1px solid #7c3aed44", color: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {p.icon}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>{p.title}</div>
            <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{p.desc}</div>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a3b8", marginTop: "auto", paddingTop: 8 }}>Planned</span>
          </div>
        ))}
      </div>
    </div>
  );
}
