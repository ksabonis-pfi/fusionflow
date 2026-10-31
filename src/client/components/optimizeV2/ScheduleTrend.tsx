// Monthly schedule control (connection card) and score-trend view (account page)
// for Optimizations V2. Charts are inline SVG; no chart library.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { optimizeV2Api, type Connection, type Trend, type TrendRun } from "../../lib/optimizeV2Api";
import { PLATFORM_LABEL, fmtDate, fmtValue } from "./format";

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const TIMEZONES = [
  "America/Los_Angeles", "America/Denver", "America/Phoenix", "America/Chicago", "America/New_York",
  "America/Anchorage", "Pacific/Honolulu", "Europe/London", "Europe/Berlin", "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney", "UTC",
];

/** "Monthly run: on the 1st (America/Los_Angeles)" with an inline editor for edit roles. */
export function ScheduleControl({ connection, canEdit, onChanged }: { connection: Connection; canEdit: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [enabled, setEnabled] = useState(!!connection.schedule_enabled);
  const [day, setDay] = useState(connection.schedule_day || 1);
  const [tz, setTz] = useState(connection.timezone || "America/Los_Angeles");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await optimizeV2Api.saveSchedule(connection.id, { enabled, day, timezone: tz });
      setEditing(false);
      setMsg({
        tone: "ok",
        text: !enabled ? "Monthly runs off."
          : res.due?.due ? "Saved. This month's run hasn't happened yet, so it runs within the hour."
            : "Saved.",
      });
      onChanged();
    } catch (err) {
      setMsg({ tone: "err", text: errMsg(err, "Couldn't save the schedule") });
    } finally {
      setBusy(false);
    }
  }

  const summary = connection.schedule_enabled
    ? <>Monthly run on the {ordinal(connection.schedule_day)}{connection.schedule_day > 28 ? " (or the month's last day)" : ""} · {connection.timezone}</>
    : <>Monthly run off</>;

  return (
    <div style={{ fontSize: 13, color: "#475569", margin: "0 0 12px", paddingTop: 10, borderTop: "1px solid #f1f5f9" }}>
      {!editing && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span>{summary}</span>
          {canEdit && (
            <button type="button" className="ms-btn-ghost" style={{ padding: "1px 8px", fontSize: 12 }} onClick={() => setEditing(true)}>
              {connection.schedule_enabled ? "Change" : "Set up"}
            </button>
          )}
        </div>
      )}
      {editing && (
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, marginBottom: 8 }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Run an assessment every month
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 8, marginBottom: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              Day
              <select className="ms-input" value={day} onChange={(e) => setDay(Number(e.target.value))} disabled={!enabled} style={{ marginTop: 4 }}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{ordinal(d)}</option>)}
              </select>
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              Timezone
              <select className="ms-input" value={tz} onChange={(e) => setTz(e.target.value)} disabled={!enabled} style={{ marginTop: 4 }}>
                {(TIMEZONES.includes(tz) ? TIMEZONES : [tz, ...TIMEZONES]).map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </label>
          </div>
          {enabled && day > 28 && (
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>In shorter months it runs on the last day.</div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="ms-btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save schedule"}</button>
            <button type="button" className="ms-btn-secondary" disabled={busy} onClick={() => {
              setEditing(false); setEnabled(!!connection.schedule_enabled); setDay(connection.schedule_day || 1); setTz(connection.timezone);
            }}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <div style={{ marginTop: 6, fontSize: 12, color: msg.tone === "ok" ? "#166534" : "#b91c1c" }}>{msg.text}</div>}
    </div>
  );
}

// ---- Trend chart ----------------------------------------------------------

const INK = "#0f172a", MUTED = "#64748b", GRID = "#e2e8f0", LINE = "#2563eb", SURFACE = "#ffffff";

/** D1 UTC text or ISO → epoch ms. */
const ts = (v: string) => Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v) ? `${v.replace(" ", "T")}Z` : v);

type Pt = { t: number; v: number | null; run: TrendRun; label: string };

/** One score line on a fixed 0–100 axis, x by run time. Scheduled runs are filled
 *  dots, manual ones hollow, imported ones squares. */
function ScoreLine({ points, height = 150, compact = false, onPick }: {
  points: Pt[]; height?: number; compact?: boolean; onPick?: (runId: string) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, padL = compact ? 4 : 30, padR = compact ? 4 : 12, padT = 8, padB = compact ? 6 : 22;
  const H = height;
  const ts0 = points[0]?.t ?? 0, ts1 = points[points.length - 1]?.t ?? 1;
  const span = ts1 - ts0 || 1;
  const x = (t: number) => (points.length === 1 ? (padL + W - padR) / 2 : padL + ((t - ts0) / span) * (W - padL - padR));
  const y = (v: number) => padT + (1 - v / 100) * (H - padT - padB);

  // Break the line where a run has no score.
  const segs: string[] = [];
  let cur = "";
  for (const p of points) {
    if (p.v == null) { if (cur) segs.push(cur); cur = ""; continue; }
    cur += `${cur ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
  }
  if (cur) segs.push(cur);

  const hp = hover != null ? points[hover] : null;

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={compact ? height / 2 : height} preserveAspectRatio="none" role="img"
        aria-label={`Score over ${points.length} runs`} style={{ display: "block", overflow: "visible" }}
        onMouseLeave={() => setHover(null)}>
        {!compact && [60, 70, 80, 90].map((g) => (
          <g key={g}>
            <line x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} stroke={GRID} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={padL - 6} y={y(g) + 3} textAnchor="end" fontSize={10} fill={MUTED}>{g}</text>
          </g>
        ))}
        {compact && <line x1={padL} x2={W - padR} y1={y(80)} y2={y(80)} stroke={GRID} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        {segs.map((d, i) => <path key={i} d={d} fill="none" stroke={LINE} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />)}
        {hp && hp.v != null && (
          <line x1={x(hp.t)} x2={x(hp.t)} y1={padT} y2={H - padB} stroke={MUTED} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        )}
        {!compact && points.length > 0 && (
          <>
            <text x={padL} y={H - 6} fontSize={10} fill={MUTED}>{fmtDate(points[0].run.created_at)}</text>
            {points.length > 1 && <text x={W - padR} y={H - 6} fontSize={10} fill={MUTED} textAnchor="end">{fmtDate(points[points.length - 1].run.created_at)}</text>}
          </>
        )}
        {/* Hit areas wider than the marks; the marks themselves are drawn as HTML below so they stay round under preserveAspectRatio="none". */}
        {points.map((p, i) => {
          const prev = points[i - 1], next = points[i + 1];
          const left = prev ? (x(prev.t) + x(p.t)) / 2 : padL - 4;
          const right = next ? (x(p.t) + x(next.t)) / 2 : W - padR + 4;
          return (
            <rect key={p.run.id} x={left} y={0} width={Math.max(1, right - left)} height={H} fill="transparent"
              style={{ cursor: onPick ? "pointer" : "default" }}
              onMouseEnter={() => setHover(i)} onClick={() => onPick?.(p.run.id)} />
          );
        })}
      </svg>
      {/* Markers in HTML, positioned by percentage, so they keep their shape. */}
      {points.map((p, i) => p.v == null ? null : (
        <span key={p.run.id} aria-hidden style={{
          position: "absolute", pointerEvents: "none",
          left: `${(x(p.t) / W) * 100}%`, top: `${(y(p.v) / H) * 100}%`,
          width: compact ? 6 : 9, height: compact ? 6 : 9, transform: "translate(-50%, -50%)",
          borderRadius: p.run.source === "imported" ? 1 : 999,
          background: p.run.source === "manual" ? SURFACE : LINE,
          border: `2px solid ${LINE}`, boxShadow: `0 0 0 2px ${SURFACE}`,
          outline: hover === i ? `2px solid ${LINE}33` : undefined,
        }} />
      ))}
      {hp && !compact && (
        <div style={{
          position: "absolute", top: 0, left: `${Math.min(Math.max((x(hp.t) / W) * 100, 12), 78)}%`, transform: "translateX(-50%)",
          background: SURFACE, border: `1px solid ${GRID}`, borderRadius: 6, padding: "6px 8px", fontSize: 12, color: INK,
          boxShadow: "0 2px 8px rgba(15,23,42,0.08)", pointerEvents: "none", whiteSpace: "nowrap", zIndex: 1,
        }}>
          <div style={{ fontWeight: 700 }}>{hp.label}</div>
          <div style={{ color: MUTED }}>{fmtDate(hp.run.created_at)} · {hp.run.source}</div>
          {hp.run.red_findings != null && <div style={{ color: MUTED }}>{hp.run.red_findings} red · {hp.run.amber_findings ?? 0} amber findings</div>}
        </div>
      )}
    </div>
  );
}

function Delta({ now, prev }: { now: number | null | undefined; prev: number | null | undefined }) {
  if (now == null || prev == null) return null;
  const d = Math.round(now - prev);
  if (d === 0) return <span style={{ color: MUTED, fontSize: 12 }}>±0</span>;
  return <span style={{ color: d > 0 ? "#166534" : "#b91c1c", fontSize: 12, fontWeight: 600 }}>{d > 0 ? "▲" : "▼"} {Math.abs(d)}</span>;
}

function Key() {
  const dot = (filled: boolean) => (
    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, border: `2px solid ${LINE}`, background: filled ? LINE : SURFACE, marginRight: 4, verticalAlign: "middle" }} />
  );
  return (
    <span style={{ fontSize: 12, color: MUTED, display: "inline-flex", gap: 12 }}>
      <span>{dot(true)}Scheduled</span><span>{dot(false)}Manual</span>
    </span>
  );
}

/** Score history for one connection: overall over time, layers and KPIs on demand. */
export function ScoreTrend({ connectionId, platform }: { connectionId: string; platform: Connection["platform"] }) {
  const navigate = useNavigate();
  const [trend, setTrend] = useState<Trend | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"overall" | "layers" | "kpis">("overall");
  const [kpi, setKpi] = useState<string>("");

  useEffect(() => {
    optimizeV2Api.trend(connectionId, kpi ? [kpi] : undefined).then(setTrend).catch((e) => setError(errMsg(e, "Couldn't load the trend")));
  }, [connectionId, kpi]);

  if (error) return <div className="ms-card" style={{ fontSize: 13, color: "#b91c1c" }}>{error}</div>;
  if (!trend) return <div className="ms-card" style={{ fontSize: 13, color: MUTED }}>Loading trend…</div>;
  if (trend.runs.length === 0) return null;

  const runs = trend.runs;
  const last = runs[runs.length - 1], prev = runs[runs.length - 2];
  const overall: Pt[] = runs.map((r) => ({ t: ts(r.created_at), v: r.overall, run: r, label: `Score ${r.overall ?? "—"} ${r.overall_grade ?? ""}` }));
  const layerIds = [...new Set(runs.flatMap((r) => r.layers.map((l) => l.layer)))].sort((a, b) => a - b);
  const anyDerived = runs.some((r) => r.layers_derived);
  const tab = (key: typeof view, label: string) => (
    <button type="button" onClick={() => setView(key)} className={view === key ? "ms-btn-secondary" : "ms-btn-ghost"}
      style={{ padding: "2px 10px", fontSize: 12 }} aria-pressed={view === key}>{label}</button>
  );

  return (
    <div className="ms-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, color: INK }}>{PLATFORM_LABEL[platform]} score trend</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
            {runs.length} run{runs.length === 1 ? "" : "s"} · latest {last.overall ?? "—"} {last.overall_grade ?? ""} <Delta now={last.overall} prev={prev?.overall} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {tab("overall", "Overall")}{tab("layers", "Layers")}{tab("kpis", "KPIs")}
        </div>
      </div>

      {view === "overall" && (
        <>
          <ScoreLine points={overall} onPick={(id) => navigate(`/optimize-v2/runs/${id}`)} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, flexWrap: "wrap", gap: 8 }}>
            <Key />
            <span style={{ fontSize: 12, color: MUTED }}>Click a point to open that run.</span>
          </div>
        </>
      )}

      {view === "layers" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            {layerIds.map((id) => {
              const pts: Pt[] = runs.map((r) => {
                const l = r.layers.find((x) => x.layer === id);
                return { t: ts(r.created_at), v: l?.score ?? null, run: r, label: `${l?.label ?? `Layer ${id}`}: ${l?.score ?? "—"}` };
              });
              const label = [...runs].reverse().flatMap((r) => r.layers).find((l) => l.layer === id)?.label ?? `Layer ${id}`;
              const lastScore = last.layers.find((l) => l.layer === id)?.score ?? null;
              const prevScore = prev?.layers.find((l) => l.layer === id)?.score ?? null;
              return (
                <div key={id} style={{ border: `1px solid ${GRID}`, borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={label}>{label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: INK, margin: "2px 0 4px" }}>
                    {lastScore ?? "—"} <Delta now={lastScore} prev={prevScore} />
                  </div>
                  <ScoreLine points={pts} height={80} compact />
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 8 }}><Key /></div>
          {anyDerived && (
            <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
              Some older runs' layer scores are recomputed from their KPI rows and may differ slightly from the run's own scorecard.
            </div>
          )}
        </>
      )}

      {view === "kpis" && (
        <>
          <div style={{ marginBottom: 8 }}>
            <select className="ms-input" value={kpi} onChange={(e) => setKpi(e.target.value)} style={{ maxWidth: 360 }}>
              <option value="">Lowest-scoring KPIs (latest run)</option>
              {trend.kpi_options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>
          {trend.kpis.length === 0 && <div style={{ fontSize: 13, color: MUTED }}>Every scored KPI was on target in the latest run.</div>}
          <table className="ms-table" style={{ fontSize: 13 }}>
            <thead>
              <tr><th>KPI</th><th style={{ width: "40%" }}>Attainment over time</th><th style={{ textAlign: "right" }}>Latest</th><th style={{ textAlign: "right" }}>Target</th></tr>
            </thead>
            <tbody>
              {trend.kpis.map((k) => {
                const pts: Pt[] = k.points.map((p, i) => ({ t: ts(runs[i].created_at), v: p.attainment, run: runs[i], label: `${k.label}: ${fmtValue(p.value, k.unit ?? undefined)}` }));
                const lp = k.points[k.points.length - 1];
                return (
                  <tr key={k.key}>
                    <td>{k.label}</td>
                    <td><ScoreLine points={pts} height={60} compact /></td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{fmtValue(lp?.value ?? null, k.unit ?? undefined)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap", color: MUTED }}>{fmtValue(lp?.target ?? null, k.unit ?? undefined)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
