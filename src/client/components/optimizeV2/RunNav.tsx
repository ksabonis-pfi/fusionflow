// Page header + area tabs shared by a run's assessment page and its Reports
// page, so the two read as one place: Assessment | Reports. Which report is
// open, and for which audience, is chosen in the Reports page's own side panel.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PLATFORM_LABEL, fmtDate } from "./format";
import { DEFAULT_REPORT } from "./reports/catalog";
import type { ReportRun } from "./reports/types";
import { ImportedBadge } from "./ui";

export type RunArea = "assessment" | "reports";

export default function RunNav({ run, active, readoutsHidden = false, query = "", actions }: {
  run: ReportRun;
  active: RunArea;
  /** No stored full result (e.g. an imported headline-only run), so there are no reports to show. */
  readoutsHidden?: boolean;
  /** Carried across areas (e.g. "?track=advanced") so a chosen Zoom audience sticks. */
  query?: string;
  actions?: ReactNode;
}) {
  const base = `/optimize-v2/runs/${encodeURIComponent(run.id)}`;
  const tabs: { id: RunArea; label: string; to: string }[] = [
    { id: "assessment", label: "Assessment", to: `${base}${query}` },
    ...(readoutsHidden ? [] : [{ id: "reports" as const, label: "Reports", to: `${base}/report/${DEFAULT_REPORT}${query}` }]),
  ];
  const customer = run.customer_name || "Customer";

  return (
    <>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", fontSize: 12, color: "#64748b", marginBottom: 8 }}>
        <Link to="/optimize-v2" style={crumb}>Optimizations V2</Link>
        <span aria-hidden>›</span>
        {run.optimize_account_id
          ? <Link to={`/optimize-v2/${run.optimize_account_id}`} style={crumb}>{customer}</Link>
          : <span>{customer}</span>}
        <span aria-hidden>›</span>
        <span>{PLATFORM_LABEL[run.platform]} assessment</span>
      </div>

      <div className="ms-page-header" style={{ marginBottom: 16, gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="ms-page-title">{customer}</h1>
          <p className="ms-page-subtitle">
            {PLATFORM_LABEL[run.platform]} assessment · {fmtDate(run.from_date)} – {fmtDate(run.to_date)} · run {fmtDate(run.created_at)}
            {run.source === "imported" && <ImportedBadge />}
          </p>
        </div>
        {actions && <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{actions}</div>}
      </div>

      <nav className="ms-tabs" aria-label="Assessment and reports">
        {tabs.map((t) => (
          <Link
            key={t.id}
            to={t.to}
            className={`ms-tab-btn${active === t.id ? " active" : ""}`}
            aria-current={active === t.id ? "page" : undefined}
            style={{ textDecoration: "none" }}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}

const crumb = { color: "#03395f", textDecoration: "none", fontWeight: 600 } as const;
