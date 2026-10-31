import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { optimizeV2Api } from "../lib/optimizeV2Api";
import { PLATFORM_LABEL } from "../components/optimizeV2/format";
import { ReportStyles } from "../components/optimizeV2/reports/shared";
import type { ReportKind, ReportResult, ReportRun, ZoomTrack } from "../components/optimizeV2/reports/types";
import { buildZoomReportModel } from "../components/optimizeV2/reports/zoom/model";
import { ZoomExecutive, ZoomGrowth, ZoomOutcomes } from "../components/optimizeV2/reports/zoom/ZoomReadouts";
import { buildRcReportModel } from "../components/optimizeV2/reports/ringcentral/model";
import { RcExecutive, RcGrowth, RcOutcomes } from "../components/optimizeV2/reports/ringcentral/RcReadouts";
import { readoutTrack } from "../components/optimizeV2/reports/track";
import RunNav from "../components/optimizeV2/RunNav";

// Customer-facing readouts for one run: Executive, Outcomes and the Growth &
// Enablement plan. Rendered inside the app shell, sharing the assessment page's
// header and tab row (RunNav). "Print / Save as PDF" is the PDF path until the
// Word / PowerPoint builders land: while this page is mounted <html> carries
// `o2r-readout`, which the report's print CSS uses to hide the shell chrome and
// un-clip the shell's scrolling <main> so the whole readout prints.

const KINDS: { id: ReportKind; label: string }[] = [
  { id: "executive", label: "Executive" },
  { id: "outcomes", label: "Outcomes" },
  { id: "growth", label: "Growth plan" },
];

export default function OptimizeV2ReportPage() {
  const { runId = "", kind: kindParam = "executive" } = useParams<{ runId: string; kind: string }>();
  const kind: ReportKind = KINDS.some((k) => k.id === kindParam) ? (kindParam as ReportKind) : "executive";
  const [search, setSearch] = useSearchParams();
  const navigate = useNavigate();
  const [data, setData] = useState<{ run: ReportRun; result: ReportResult | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    optimizeV2Api.run(runId)
      .then((d) => setData(d as { run: ReportRun; result: ReportResult | null }))
      .catch((e) => setError(e instanceof Error ? e.message : "Couldn't load run"));
  }, [runId]);

  const result = data?.result ?? null;
  // Zoom track: Essentials unless Contact Center / Virtual Agent activity; ?track= overrides.
  const trackParam = search.get("track");
  const { isZoom, autoTrack, track, outcomesHidden } = readoutTrack(data?.run.platform, result, trackParam);

  // Essentials has no Outcomes readout (as in the original); fall back to Executive.
  useEffect(() => {
    if (data && outcomesHidden && kind === "outcomes") navigate(`/optimize-v2/runs/${runId}/report/executive?${search}`, { replace: true });
  }, [data, outcomesHidden, kind, navigate, runId, search]);

  const zoomModel = useMemo(
    () => (result && data && isZoom && kind !== "growth" ? buildZoomReportModel(result, data.run, track) : null),
    [result, data, isZoom, kind, track],
  );
  const rcModel = useMemo(
    () => (result && data && !isZoom && kind !== "growth" ? buildRcReportModel(result, data.run) : null),
    [result, data, isZoom, kind],
  );

  const kindLabel = kind === "executive" && outcomesHidden ? "Communications" : KINDS.find((k) => k.id === kind)!.label;
  const customer = data?.run.customer_name || "Customer";

  // Name the tab so "Save as PDF" suggests a sensible file name.
  useEffect(() => {
    if (!data) return;
    const prev = document.title;
    document.title = `${PLATFORM_LABEL[data.run.platform]} ${kindLabel} — ${customer}`;
    return () => { document.title = prev; };
  }, [data, kindLabel, customer]);

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
  const setTrack = (t: ZoomTrack) => { const s = new URLSearchParams(search); s.set("track", t); setSearch(s, { replace: true }); };

  let body: React.ReactNode;
  if (error) body = <Message tone="error">{error}</Message>;
  else if (!data) body = <Message>Building the readout…</Message>;
  else if (!result && data.run.source === "imported") body = <Message>Imported from the standalone app — full detail wasn't stored for this run, so there are no readouts. The Assessment tab shows its headline scores.</Message>;
  else if (!result) body = <Message tone="error">This run's full result is missing. Re-run the assessment to generate the readouts.</Message>;
  else if (kind === "growth") body = isZoom ? <ZoomGrowth result={result} run={data.run} /> : <RcGrowth result={result} run={data.run} />;
  else if (zoomModel) body = kind === "outcomes" ? <ZoomOutcomes m={zoomModel} /> : <ZoomExecutive m={zoomModel} />;
  else if (rcModel) body = kind === "outcomes" ? <RcOutcomes m={rcModel} /> : <RcExecutive m={rcModel} />;

  return (
    <div className="o2r-page">
      <ReportStyles />
      <div className="o2r-chrome">
        {data ? (
          <RunNav
            run={data.run}
            active={kind}
            outcomesHidden={outcomesHidden}
            readoutsHidden={!result}
            query={query}
            actions={
              <>
                {isZoom && result && (
                  <div className="o2r-seg" title="Report track">
                    <button type="button" className={track === "essentials" ? "on" : ""} onClick={() => setTrack("essentials")}>Essentials</button>
                    <button type="button" className={track === "advanced" ? "on" : ""} onClick={() => setTrack("advanced")}>Advanced</button>
                  </div>
                )}
                <button type="button" className="ms-btn-primary" onClick={() => window.print()} disabled={!result}>Print / Save as PDF</button>
              </>
            }
          />
        ) : (
          <Link to={`/optimize-v2/runs/${runId}`} className="ms-btn-ghost" style={{ marginBottom: 16 }}>← Assessment</Link>
        )}
        {isZoom && trackParam == null && result && (
          <div className="o2r-hint">
            Track auto-detected: {autoTrack === "advanced" ? "Contact Center / Virtual Agent activity found" : "no Contact Center activity"}
          </div>
        )}
      </div>
      {body}
    </div>
  );
}

function Message({ children, tone }: { children: React.ReactNode; tone?: "error" }) {
  return (
    <div className="o2r" style={{ color: tone === "error" ? "#b91c1c" : "#64748b", fontSize: 14 }}>{children}</div>
  );
}
