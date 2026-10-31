import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { optimizeV2Api } from "../lib/optimizeV2Api";
import { PLATFORM_LABEL } from "../components/optimizeV2/format";
import { ReportStyles } from "../components/optimizeV2/reports/shared";
import type { ReportResult, ReportRun, ZoomTrack } from "../components/optimizeV2/reports/types";
import { DEFAULT_REPORT, REPORTS, findReport, type ReportDef } from "../components/optimizeV2/reports/catalog";
import { TRACK_LABEL, autoTrackReason, readoutTrack } from "../components/optimizeV2/reports/track";
import RunNav from "../components/optimizeV2/RunNav";

// A run's Reports area: a side panel (Zoom audience switch + the report list
// from reports/catalog.ts) beside the selected customer-facing readout, inside
// the app shell under the shared RunNav header. URL: /report/:kind?track=.
// "Print / Save as PDF" is the PDF path until the Word / PowerPoint builders
// land: while this page is mounted <html> carries `o2r-readout`, which the
// report's print CSS uses to hide the shell, the header and the side panel
// (all `.o2r-chrome`) and un-clip the shell's scrolling <main> so the whole
// readout prints.

export default function OptimizeV2ReportPage() {
  const { runId = "", kind: kindParam } = useParams<{ runId: string; kind: string }>();
  const report: ReportDef = findReport(kindParam) ?? findReport(DEFAULT_REPORT)!;
  const [search, setSearch] = useSearchParams();
  const [data, setData] = useState<{ run: ReportRun; result: ReportResult | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    optimizeV2Api.run(runId)
      .then((d) => setData(d as { run: ReportRun; result: ReportResult | null }))
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load run"));
  }, [runId]);

  const result = data?.result ?? null;
  // Zoom audience: Essentials unless Contact Center / Virtual Agent activity; ?track= overrides.
  const trackParam = search.get("track");
  const { isZoom, autoTrack, track, essentials } = readoutTrack(data?.run.platform, result, trackParam);
  const unavailable = !!report.advancedOnly && essentials;

  const docTitle = report.docTitle?.(essentials) ?? report.label;
  const customer = data?.run.customer_name || "Customer";

  // Name the tab so "Save as PDF" suggests a sensible file name.
  useEffect(() => {
    if (!data) return;
    const prev = document.title;
    document.title = `${PLATFORM_LABEL[data.run.platform]} ${docTitle} — ${customer}`;
    return () => { document.title = prev; };
  }, [data, docTitle, customer]);

  // Scope the print CSS (shell chrome hidden, <main> un-clipped) to this page.
  useEffect(() => {
    document.documentElement.classList.add("o2r-readout");
    return () => document.documentElement.classList.remove("o2r-readout");
  }, []);

  // Expand collapsed steps for printing, then restore.
  useEffect(() => {
    let opened: HTMLDetailsElement[] = [];
    const before = () => {
      opened = [...document.querySelectorAll<HTMLDetailsElement>(".o2r details:not([open])")];
      opened.forEach((d) => { d.open = true; });
    };
    const after = () => { opened.forEach((d) => { d.open = false; }); opened = []; };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);

  const query = search.toString() ? `?${search}` : "";
  const reportHref = (id: string) => `/optimize-v2/runs/${encodeURIComponent(runId)}/report/${id}${query}`;
  const setTrack = (t: ZoomTrack | null) => {
    const s = new URLSearchParams(search);
    if (t) s.set("track", t); else s.delete("track");
    setSearch(s, { replace: true });
  };

  let body: React.ReactNode;
  if (error) body = <Message tone="error">{error}</Message>;
  else if (!data) body = <Message>Building the readout…</Message>;
  else if (!result) body = <Message tone="error">This run's full result is missing. Re-run the assessment to generate the readouts.</Message>;
  else if (unavailable) {
    body = (
      <div className="o2r-note">
        <div style={{ fontWeight: 700, color: "#03395f", marginBottom: 4 }}>{report.label} is an Advanced report</div>
        <p style={{ margin: "0 0 12px", color: "#475569" }}>
          The Essentials audience doesn't include the {report.label} readout. Switch the audience to Advanced to view it.
        </p>
        <button type="button" className="ms-btn-primary" onClick={() => setTrack("advanced")}>Switch to Advanced</button>
      </div>
    );
  } else body = <report.View result={result} run={data.run} isZoom={isZoom} track={track} />;

  if (!data) {
    return (
      <div className="o2r-page">
        <ReportStyles />
        <Link to={`/optimize-v2/runs/${runId}`} className="ms-btn-ghost" style={{ display: "inline-block", marginBottom: 16 }}>← Assessment</Link>
        {body}
      </div>
    );
  }

  return (
    <div className="o2r-page">
      <ReportStyles />
      <div className="o2r-chrome">
        <RunNav
          run={data.run}
          active="reports"
          query={query}
          actions={
            <button type="button" className="ms-btn-primary" onClick={() => window.print()} disabled={!result || unavailable}>
              Print / Save as PDF
            </button>
          }
        />
      </div>

      <div className="o2r-layout">
        <aside className="o2r-side o2r-chrome" aria-label="Report options">
          {isZoom && (
            <div className="o2r-side-group">
              <div className="o2r-side-label" id="o2r-aud-label">Audience</div>
              <div className="o2r-seg o2r-aud" role="radiogroup" aria-labelledby="o2r-aud-label">
                {(["essentials", "advanced"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={track === t}
                    className={track === t ? "on" : ""}
                    onClick={() => setTrack(t)}
                  >
                    {TRACK_LABEL[t]}
                  </button>
                ))}
              </div>
              <div className="o2r-side-hint">
                Detected: {TRACK_LABEL[autoTrack]} ({autoTrackReason(autoTrack)})
                {trackParam != null && track !== autoTrack && (
                  <> · <button type="button" className="o2r-linkbtn" onClick={() => setTrack(null)}>use detected</button></>
                )}
              </div>
            </div>
          )}

          <div className="o2r-side-group">
            <div className="o2r-side-label">Reports</div>
            <nav aria-label="Reports">
              <ul className="o2r-rlist">
                {REPORTS.map((r) => {
                  const off = !!r.advancedOnly && essentials;
                  const on = r.id === report.id;
                  return (
                    <li key={r.id}>
                      {off && !on ? (
                        <span className="o2r-ritem off" aria-disabled="true" title="Available for the Advanced audience">
                          {r.label}<small>Advanced only</small>
                        </span>
                      ) : (
                        <Link
                          to={reportHref(r.id)}
                          className={`o2r-ritem${on ? " on" : ""}${off ? " off" : ""}`}
                          aria-current={on ? "page" : undefined}
                        >
                          {r.label}{off && <small>Advanced only</small>}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        </aside>

        <div className="o2r-main">{body}</div>
      </div>
    </div>
  );
}

function Message({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return (
    <div className="o2r" style={{ color: tone === "error" ? "#b91c1c" : "#64748b", fontSize: 14 }}>{children}</div>
  );
}
