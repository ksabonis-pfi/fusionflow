import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { optimizeV2Api, type LayerScore, type RunResult, type RunSummary } from "../lib/optimizeV2Api";
import { PLATFORM_LABEL, SEVERITY_COLOR, fmtDate, fmtValue } from "../components/optimizeV2/format";
import LicensesSection from "../components/optimizeV2/LicensesSection";
import RunNav from "../components/optimizeV2/RunNav";
import type { ReportRun } from "../components/optimizeV2/reports/types";
import { GradePill, Pill } from "../components/optimizeV2/ui";

type Tab = "scorecard" | "plan" | "findings" | "config" | "coverage";

export default function OptimizeV2RunPage() {
  const { runId = "" } = useParams<{ runId: string }>();
  const [search] = useSearchParams();
  const [data, setData] = useState<{ run: ReportRun; result: RunResult | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("scorecard");

  useEffect(() => {
    optimizeV2Api.run(runId).then(setData).catch((e) => setError(e instanceof Error ? e.message : "Couldn't load run"));
  }, [runId]);

  if (error) return <Wrap><div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div></Wrap>;
  if (!data) return <Wrap><div style={{ color: "#64748b", fontSize: 13 }}>Loading…</div></Wrap>;
  if (!data.result) return <Wrap accountId={data.run.optimize_account_id}><div style={{ color: "#b91c1c", fontSize: 13 }}>This run's full result is missing.</div></Wrap>;

  const { run } = data;
  const sc = data.result.scorecard;
  const f = data.result.findings;
  const TABS: { id: Tab; label: string }[] = [
    { id: "scorecard", label: "Scorecard" },
    { id: "plan", label: `Improvement plan (${sc.improvements.length})` },
    { id: "findings", label: `Findings (${f.summary.total})` },
    { id: "config", label: `Configuration (${sc.configAudit.aligned}/${sc.configAudit.assessed})` },
    { id: "coverage", label: "Data coverage" },
  ];
  // A Zoom audience chosen on the Reports page rides along so "Reports" reopens with it.
  const trackParam = search.get("track");

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <RunNav
        run={run}
        active="assessment"
        query={trackParam ? `?track=${encodeURIComponent(trackParam)}` : ""}
        actions={
          // Plain link: the server names the file via Content-Disposition.
          <a href={`/api/optimize-v2/runs/${encodeURIComponent(run.id)}/workbook.xlsx`} className="ms-btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }}>
            Download workbook (.xlsx)
          </a>
        }
      />
      <div className="ms-card" style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Overall score</div>
          <GradePill score={sc.overall} grade={sc.overallGrade} size="lg" />
        </div>
        <Stat label="Could reach" value={sc.potentialOverall != null ? `${sc.potentialOverall}` : "—"} sub={sc.potentialGain ? `+${sc.potentialGain} via the plan` : undefined} />
        <Stat label="Findings" value={`${f.summary.red} red · ${f.summary.amber} amber`} sub={`${f.summary.strengths} strengths`} />
        <Stat label="KPIs measured" value={`${sc.coverage.populated} / ${sc.coverage.total}`} sub={`${sc.coverage.apiPopulated} from the API`} />
        <Stat label="Window" value={`${fmtDate(run.from_date)} – ${fmtDate(run.to_date)}`} sub={`${PLATFORM_LABEL[run.platform]} · run ${fmtDate(run.created_at)}`} />
      </div>

      {data.result.warnings && data.result.warnings.length > 0 && (
        <div className="ms-card" style={{ background: "#fffbeb", borderColor: "#fde68a", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: "#92400e", marginBottom: 6 }}>Collection notes</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#78350f", lineHeight: 1.5 }}>
            {data.result.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        </div>
      )}

      <div style={{ display: "flex", gap: 2, borderBottom: "2px solid #e2e8f0", marginBottom: 16, overflowX: "auto" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: "10px 16px", fontSize: 14, whiteSpace: "nowrap",
              fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? "#0b9aad" : "#64748b",
              borderBottom: tab === t.id ? "2px solid #0b9aad" : "2px solid transparent", marginBottom: -2,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "scorecard" && <ScorecardTab result={data.result} />}
      {tab === "plan" && <PlanTab result={data.result} />}
      {tab === "findings" && <FindingsTab result={data.result} />}
      {tab === "config" && <ConfigTab result={data.result} />}
      {tab === "coverage" && <CoverageTab result={data.result} platform={run.platform} />}
    </div>
  );
}

function Wrap({ children, accountId }: { children: React.ReactNode; accountId?: string }) {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <Link to={accountId ? `/optimize-v2/${accountId}` : "/optimize-v2"} className="ms-btn-ghost" style={{ display: "inline-block", marginBottom: 16, padding: "4px 10px" }}>
        ← {accountId ? "Account" : "All accounts"}
      </Link>
      {children}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#64748b" }}>{sub}</div>}
    </div>
  );
}

function ScorecardTab({ result }: { result: RunResult }) {
  const sc = result.scorecard;
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      {sc.indices.length > 0 && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          {sc.indices.map((ix) => (
            <div key={ix.key} className="ms-card" style={{ flex: "1 1 220px" }} title={ix.note}>
              <div style={{ fontSize: 12, color: "#64748b" }}>{ix.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{ix.value ?? "—"} <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>target ≥{ix.target}</span></div>
            </div>
          ))}
        </div>
      )}
      {result.licenses && <LicensesSection summary={result.licenses} />}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {sc.layers.map((l) => (
          <button
            key={l.layer}
            type="button"
            onClick={() => setOpen(open === l.layer ? null : l.layer)}
            className="ms-card"
            style={{ textAlign: "left", cursor: "pointer", border: open === l.layer ? "1px solid #0b9aad" : undefined }}
          >
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700 }}>LAYER {l.layer}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "2px 0 8px" }}>{l.label}</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <GradePill score={l.score} grade={l.grade} />
              <span style={{ fontSize: 12, color: "#64748b" }}>{l.populated}/{l.total} KPIs</span>
            </div>
          </button>
        ))}
      </div>
      {open != null && <LayerKpis layer={sc.layers.find((l) => l.layer === open)!} />}
    </>
  );
}

function LayerKpis({ layer }: { layer: LayerScore }) {
  return (
    <div className="ms-card" style={{ padding: 0, overflowX: "auto", marginTop: 16 }}>
      <div style={{ padding: "12px 16px", fontWeight: 700, color: "#0f172a" }}>Layer {layer.layer}: {layer.label}</div>
      <table className="ms-table">
        <thead>
          <tr><th>KPI</th><th>Product</th><th style={{ textAlign: "right" }}>Value</th><th style={{ textAlign: "right" }}>Target</th><th style={{ textAlign: "right" }}>Attainment</th><th>Source / why missing</th></tr>
        </thead>
        <tbody>
          {layer.kpis.map((k) => (
            <tr key={k.key}>
              <td style={{ fontWeight: 600 }}>{k.label}</td>
              <td style={{ fontSize: 13 }}>{k.product}</td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmtValue(k.value, k.unit)}</td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap", color: "#64748b" }}>{k.dir === "higher" ? "≥" : "≤"} {fmtValue(k.target, k.unit)}</td>
              <td style={{ textAlign: "right" }}>{k.attainment != null ? `${k.attainment}%` : "—"}</td>
              <td style={{ fontSize: 12, color: k.available ? "#64748b" : "#92400e" }}>{k.available ? k.endpoint : k.reason ?? "Not collected"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Steps({ steps }: { steps: string[] | null | undefined }) {
  if (!steps?.length) return null;
  return (
    <details style={{ marginTop: 6 }}>
      <summary style={{ fontSize: 12, color: "#0b9aad", cursor: "pointer" }}>How to fix ({steps.length} steps)</summary>
      <ol style={{ margin: "6px 0 0", paddingLeft: 20, fontSize: 13, color: "#334155", lineHeight: 1.5 }}>
        {steps.map((s) => <li key={s}>{s}</li>)}
      </ol>
    </details>
  );
}

function PlanTab({ result }: { result: RunResult }) {
  const items = result.scorecard.improvements;
  if (!items.length) return <div style={{ color: "#64748b", fontSize: 13 }}>Nothing to improve — every measured KPI is on target.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map((i, n) => (
        <div key={`${i.type}-${i.key}`} className="ms-card" style={{ display: "flex", gap: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#0b9aad", minWidth: 56, textAlign: "right" }}>+{i.scoreLift ?? 0}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>{n + 1}. {i.kpi}</div>
            <div style={{ fontSize: 12, color: "#64748b", margin: "2px 0 6px" }}>
              Layer {i.layer}{i.layerLabel ? ` · ${i.layerLabel}` : ""} · {i.product} · now {fmtValue(i.current, i.unit)} → target {fmtValue(i.target, i.unit)}
            </div>
            <div style={{ fontSize: 14, color: "#334155" }}>{i.reco}</div>
            {i.lever && <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Value lever: {i.lever}</div>}
            <Steps steps={i.steps} />
          </div>
        </div>
      ))}
    </div>
  );
}

function FindingsTab({ result }: { result: RunResult }) {
  const { findings, strengths } = result.findings;
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {findings.map((x) => (
          <div key={x.id} className="ms-card">
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
              <Pill {...SEVERITY_COLOR[x.severity]}>{x.severity}</Pill>
              <span style={{ fontWeight: 700, color: "#0f172a" }}>{x.kpi}</span>
              <span style={{ fontSize: 12, color: "#64748b" }}>Layer {x.layer} · {x.area}</span>
            </div>
            <div style={{ fontSize: 14, color: "#334155" }}>{x.observation}</div>
            <div style={{ fontSize: 13, color: "#334155", marginTop: 6 }}><strong>Recommendation:</strong> {x.recommendation}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Impact: {x.businessImpact}</div>
            <Steps steps={x.steps} />
          </div>
        ))}
      </div>
      {strengths.length > 0 && (
        <div className="ms-card" style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, color: "#166534", marginBottom: 8 }}>Strengths</div>
          {strengths.map((s) => (
            <div key={s.kpi} style={{ fontSize: 13, color: "#334155" }}>{s.kpi}: {s.value} <span style={{ color: "#64748b" }}>({s.product})</span></div>
          ))}
        </div>
      )}
    </>
  );
}

function ConfigTab({ result }: { result: RunResult }) {
  const { rows } = result.scorecard.configAudit;
  const tone = { Aligned: SEVERITY_COLOR.Green, Gap: SEVERITY_COLOR.Amber, "Not Assessed": { bg: "#f1f5f9", fg: "#64748b" } } as const;
  return (
    <div className="ms-card" style={{ padding: 0, overflowX: "auto" }}>
      <table className="ms-table">
        <thead><tr><th>Setting</th><th>Product</th><th>Current</th><th>Recommended</th><th>State</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td style={{ minWidth: 220 }}>
                <div style={{ fontWeight: 600 }}>{r.setting}</div>
                {r.state === "Gap" && <Steps steps={r.steps} />}
              </td>
              <td style={{ fontSize: 13 }}>{r.product}</td>
              <td style={{ fontSize: 13 }}>{r.current || "—"}</td>
              <td style={{ fontSize: 13 }}>{r.recommended}</td>
              <td><Pill {...tone[r.state]}>{r.state}</Pill></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CoverageTab({ result, platform }: { result: RunResult; platform: RunSummary["platform"] }) {
  const sc = result.scorecard;
  return (
    <>
      <div className="ms-card" style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>{PLATFORM_LABEL[platform]} areas reached</div>
        {Object.entries(sc.domains).map(([name, d]) => (
          <div key={name} style={{ fontSize: 13, marginBottom: 4 }}>
            <span style={{ color: d.ok ? "#166534" : "#b91c1c", fontWeight: 700 }}>{d.ok ? "✓" : "✗"}</span> {name}
            {!d.ok && d.reason && <span style={{ color: "#64748b" }}> — {d.reason}</span>}
          </div>
        ))}
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
          {result.meta.subrequestsUsed} API calls · {result.meta.grantedScopes.length} scopes granted
        </div>
      </div>
      {sc.gaps.length > 0 && (
        <div className="ms-card" style={{ padding: 0, overflowX: "auto" }}>
          <div style={{ padding: "12px 16px", fontWeight: 700, color: "#0f172a" }}>KPIs not measured ({sc.gaps.length})</div>
          <table className="ms-table">
            <thead><tr><th>KPI</th><th>Layer</th><th>Mode</th><th>Why</th></tr></thead>
            <tbody>
              {sc.gaps.map((g) => (
                <tr key={g.kpi}>
                  <td style={{ fontWeight: 600 }}>{g.kpi}</td>
                  <td>{g.layer}</td>
                  <td style={{ fontSize: 13 }}>{g.mode}</td>
                  <td style={{ fontSize: 12, color: "#64748b" }}>{g.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
