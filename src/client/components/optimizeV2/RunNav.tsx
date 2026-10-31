// Page header + tab row shared by a run's assessment page and its readouts, so
// the two read as one place: Assessment | Executive | Outcomes | Growth plan.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PLATFORM_LABEL, fmtDate } from "./format";
import type { ReportKind, ReportRun } from "./reports/types";
import { ImportedBadge } from "./ui";

export type RunView = "assessment" | ReportKind;

export default function RunNav({ run, active, outcomesHidden, readoutsHidden = false, query = "", actions }: {
  run: ReportRun;
  active: RunView;
  /** Zoom Essentials has no Outcomes readout; its Executive readout is titled "Communications". */
  outcomesHidden: boolean;
  /** No stored full result (e.g. an imported headline-only run), so there are no readouts to show. */
  readoutsHidden?: boolean;
  /** Carried across tabs (e.g. "?track=advanced") so a chosen Zoom track sticks. */
  query?: string;
  actions?: ReactNode;
}) {
  const base = `/optimize-v2/runs/${encodeURIComponent(run.id)}`;
  const tabs: { id: RunView; label: string; to: string }[] = [
    { id: "assessment", label: "Assessment", to: `${base}${query}` },
    ...(readoutsHidden ? [] : [
      { id: "executive" as const, label: outcomesHidden ? "Communications" : "Executive", to: `${base}/report/executive${query}` },
      ...(outcomesHidden ? [] : [{ id: "outcomes" as const, label: "Outcomes", to: `${base}/report/outcomes${query}` }]),
      { id: "growth" as const, label: "Growth plan", to: `${base}/report/growth${query}` },
    ]),
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

      <nav className="ms-tabs" aria-label="Assessment and readouts">
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
