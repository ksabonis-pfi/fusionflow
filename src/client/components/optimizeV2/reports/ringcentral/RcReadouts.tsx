// RingCentral Executive and Outcomes readouts. Ported from the standalone
// RingCentral agent's report.js (renderReportHTML / renderOutcomesHTML) as
// React; section order, headings and copy follow the original.
import { fmtDate, fmtValue } from "../../format";
import { GrowthPlan, type GrowthCopy } from "../GrowthPlan";
import { Icon } from "../icons";
import { N, accentVar, gradeVar, ragVar } from "../kit";
import { Kicker, Section } from "../shared";
import type { ReportResult, ReportRun } from "../types";
import { buildRcGrowthModel } from "./growth";
import { CATEGORIES, HOW_WE_PICKED, TOP_WINS_LEDE } from "./growthContent";
import type { RcReadout } from "./model";

function Footer({ m }: { m: RcReadout }) {
  return (
    <footer className="o2r-foot">
      <span>Confidential — prepared for {m.cover.customer} · {fmtDate(m.cover.generatedAt)}</span>
    </footer>
  );
}

function CoverStats({ items }: { items: [string, string][] }) {
  return (
    <section className="o2r-glance">
      {items.map(([v, l]) => <div key={l}><div className="o2r-glance-v" style={{ color: "var(--o2r-navy)" }}>{v}</div><div className="o2r-glance-l">{l}</div></div>)}
    </section>
  );
}

export function RcExecutive({ m }: { m: RcReadout }) {
  const h = m.headline, c = m.cover, w = c.window;
  const align = h.configAlignment == null ? "—" : `${h.configAlignment}%`;
  return (
    <article className="o2r">
      <section className="o2r-hero">
        <div>
          <Kicker icon="layers">RingCentral Optimization</Kicker>
          <h1>{c.customer}</h1>
          <div className="o2r-metaline">Account {String(c.accountId)} · {fmtDate(w.from)} → {fmtDate(w.to)} ({w.days ?? "?"} days)</div>
        </div>
        <div className="o2r-hero-r">
          <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1 }}>{h.overall ?? "—"}</div>
          <span className="o2r-gradechip" style={{ background: gradeVar(h.grade) }}>Grade {h.grade}</span>
        </div>
      </section>
      <CoverStats items={[
        [align, "Config alignment"],
        [`${h.kpisPopulated}/${h.kpisMeasurable}`, "KPIs measured"],
        [`${h.redFindings}R · ${h.amberFindings}A`, "Findings"],
        [`+${h.potentialGain}`, `Upside${h.potentialOverall != null ? ` → ${h.potentialOverall}` : ""}`],
      ]} />
      {h.sampleVolume && (
        <div className="o2r-warn">
          <b>Sample-volume artifact.</b> {N(h.callsInWindow)} calls over {w.days ?? "?"} days ({h.callsPerDay ?? "—"}/day). Rate-based measures are
          reported for completeness, excluded from the score, and must not be presented as outcomes.
        </div>
      )}

      <Section icon="doc" title="Executive summary">
        <p>
          {c.customer} scores <b>{h.overall ?? "—"}</b> (grade {h.grade}) across the eleven-layer RingCentral optimization model,
          measured over {w.days ?? "?"} days to {fmtDate(w.to)}. Configuration alignment is <b>{align}</b>, with <b>{h.kpisPopulated}</b> of{" "}
          <b>{h.kpisMeasurable}</b> measurable indicators returning data
          {h.kpisBlocked ? <> and a further <b>{h.kpisBlocked}</b> blocked by access or entitlement rather than by collection</> : null}.
        </p>
        <p>
          The assessment raised <b>{h.redFindings}</b> red and <b>{h.amberFindings}</b> amber findings. Addressing the ranked actions in this
          report would lift the overall score by an estimated <b>+{h.potentialGain}</b> points{h.potentialOverall != null && <>, to <b>{h.potentialOverall}</b></>}.
        </p>
      </Section>

      {m.indices.length > 0 && (
        <Section icon="gauge" title="Composite indices">
          <div className="o2r-grid">
            {m.indices.map((i) => (
              <div key={i.key} className="o2r-card" style={{ textAlign: "center" }}>
                <div className="o2r-glance-v" style={{ color: i.value == null ? "var(--o2r-muted)" : i.value >= i.target ? "var(--o2r-good)" : "var(--o2r-serious)" }}>{i.value ?? "—"}</div>
                <div style={{ fontWeight: 700 }}>{i.label}</div>
                <div className="o2r-sub">target {i.target}{i.missing ? ` · ${i.missing} input(s) unavailable` : ""}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section icon="layers" title="Scores by layer">
        <table className="o2r-table">
          <thead><tr><th>Layer</th><th className="num">Score</th><th>Grade</th><th className="num">Measured</th></tr></thead>
          <tbody>
            {m.scoreByLayer.map((l) => (
              <tr key={l.layer}>
                <td><b>L{l.layer}</b> {l.label}<div className="o2r-sub">{l.narrative.tagline}</div></td>
                <td className="num">{l.score == null ? "N/A" : l.score}</td>
                <td><span className="o2r-pill" style={{ background: gradeVar(l.grade) }}>{l.grade}</span></td>
                <td className="num">{l.populated}/{l.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section icon="alert" title="Priority findings" flow>
        {m.priorityFindings.length ? m.priorityFindings.map((f) => (
          <div key={f.id} className="o2r-find" style={{ borderLeftColor: ragVar(f.severity) }}>
            <div className="o2r-find-head">
              <span className="o2r-pill" style={{ background: ragVar(f.severity) }}>{f.severity}</span>
              <b>{f.kpi}</b> <span className="o2r-sub">L{f.layer} · {f.area}</span>
            </div>
            <p>{f.observation}</p>
            <p><b>Recommendation:</b> {f.recommendation}</p>
            {f.steps && f.steps.length > 0 &&<ol>{f.steps.map((x, i) => <li key={i}>{x}</li>)}</ol>}
            <div className="o2r-sub">ROI lever: {f.roiLever}</div>
          </div>
        )) : <p className="o2r-muted">No findings — every measured indicator is on target.</p>}
      </Section>

      <Section icon="flag" title="Improvement roadmap" flow>
        <p className="o2r-muted">Ranked by projected lift to the overall score. The lifts sum to the gap between today's score and 100, so the ordering is the fastest route to the target.</p>
        <table className="o2r-table">
          <thead><tr><th className="num">Points</th><th>Action</th><th>Current</th><th>Target</th><th>ROI lever</th></tr></thead>
          <tbody>
            {m.roadmap.map((i) => (
              <tr key={i.key}>
                <td className="num"><b>+{i.scoreLift}</b></td>
                <td><b>{i.kpi}</b><div className="o2r-sub">L{i.layer} {i.layerLabel}</div><div style={{ fontSize: 13 }}>{i.reco}</div></td>
                <td>{fmtValue(i.current, i.unit)}</td>
                <td>{fmtValue(i.target, i.unit)}</td>
                <td className="o2r-sub">{i.lever}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section icon="layers" title="Layer detail" flow>
        {m.layerDeepDives.map((l) => {
          const n = l.narrative, st = n.stakeholders;
          return (
            <div key={l.layer} className="o2r-layer">
              <div className="o2r-layer-head">
                <span style={{ color: accentVar(n.accent) }}><Icon name={n.icon || "shield"} size={26} /></span>
                <div><h3>L{l.layer} · {l.label}</h3>{n.tagline && <span className="tag">{n.tagline}</span>}</div>
                <div className="o2r-layer-score">
                  <span className="o2r-pill" style={{ background: gradeVar(l.grade) }}>{l.score == null ? "N/A" : `${l.score} · ${l.grade}`}</span>
                </div>
              </div>
              {n.whyItMatters && <p><b>Why it matters.</b> {n.whyItMatters}</p>}
              {n.affectsNow && <p><b>What it is costing today.</b> {n.affectsNow}</p>}
              {n.improving && <p><b>What improving it unlocks.</b> {n.improving}</p>}
              {n.howItHelps && <p><b>How PacketFusion helps.</b> {n.howItHelps}</p>}
              {n.roi && <p className="o2r-sub">ROI: {n.roi}</p>}
              {st && (
                <table className="o2r-table" style={{ marginBottom: 10 }}>
                  <tbody>
                    <tr><th style={{ width: 120 }}>Company</th><td>{st.company}</td></tr>
                    <tr><th>Department</th><td>{st.department}</td></tr>
                    <tr><th>Team</th><td>{st.team}</td></tr>
                    <tr><th>End user</th><td>{st.user}</td></tr>
                  </tbody>
                </table>
              )}
              {l.kpis.length > 0 && (
                <table className="o2r-table">
                  <thead><tr><th>Indicator</th><th className="num">Value</th><th className="num">Target</th><th>Status</th></tr></thead>
                  <tbody>
                    {l.kpis.map((k) => (
                      <tr key={k.key}>
                        <td>{k.label}{k.blockedBy && <div className="o2r-sub">Blocked: {k.blockedBy}</div>}</td>
                        <td className="num">{fmtValue(k.value, k.unit)}</td>
                        <td className="num">{k.target == null ? "—" : fmtValue(k.target, k.unit)}</td>
                        <td>{k.mode === "blocked" ? "blocked" : k.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </Section>

      <Section icon="shield" title="Configuration remediation" flow>
        {m.configRemediation.length ? (
          <table className="o2r-table">
            <thead><tr><th>Setting</th><th>Observed</th><th>Recommended</th><th>Why it matters</th></tr></thead>
            <tbody>
              {m.configRemediation.map((a) => (
                <tr key={a.key}>
                  <td><b>{a.setting}</b><div className="o2r-sub">{a.product}</div></td>
                  <td>{a.current}</td>
                  <td>{a.recommended}</td>
                  <td className="o2r-sub">{a.impact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="o2r-muted">No configuration gaps — every assessed setting is aligned.</p>}
      </Section>

      <Section icon="search" title="Method and provenance">
        <p>
          Collected live from the RingCentral platform APIs on {fmtDate(m.methodology.generatedAt)} using {m.methodology.subrequests ?? "—"} API calls
          over {m.methodology.elapsedMs ?? "—"} ms, under a read-only grant of {m.methodology.scopes.length} scope(s). The agent cannot modify a customer tenant.
        </p>
        <ul>
          <li><b>Metrics.</b> RingCentral Business Analytics.</li>
          <li><b>Configuration.</b> RingCentral platform REST.</li>
          <li><b>Window.</b> Business Analytics serves at most 184 days; longer horizons accumulate from stored snapshots.</li>
          <li><b>Scoring.</b> Layer score is the mean attainment of its measured indicators; overall is the mean of scored layers. Sample-volume artifacts and access-blocked indicators are excluded from both.</li>
        </ul>
        {m.warnings.length > 0 && (
          <>
            <p><b>Collection notes.</b></p>
            <ul>{m.warnings.map((x) => <li key={x}>{x}</li>)}</ul>
          </>
        )}
      </Section>

      <Footer m={m} />
    </article>
  );
}

export function RcOutcomes({ m }: { m: RcReadout }) {
  const h = m.headline, c = m.cover, w = c.window;
  const top = m.roadmap.slice(0, 6);
  const byLever = new Map<string, typeof m.roadmap>();
  for (const i of m.roadmap) {
    const k = i.lever || "Operational efficiency";
    byLever.set(k, [...(byLever.get(k) ?? []), i]);
  }
  const sumLift = (items: typeof m.roadmap) => items.reduce((x, y) => x + (y.scoreLift || 0), 0);
  const levers = [...byLever.entries()].sort((a, b) => sumLift(b[1]) - sumLift(a[1]));
  const feel = m.scoreByLayer.filter((l) => l.score != null && l.score < 80).slice(0, 5);
  return (
    <article className="o2r">
      <section className="o2r-hero">
        <div>
          <Kicker icon="flag">RingCentral Optimization</Kicker>
          <h1>Outcomes &amp; Value</h1>
          <div className="o2r-metaline">{c.customer} · {fmtDate(w.from)} → {fmtDate(w.to)}</div>
        </div>
        <div className="o2r-hero-r">
          <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1 }}>+{h.potentialGain}</div>
          <span className="o2r-potential">points available</span>
        </div>
      </section>
      <CoverStats items={[
        [String(h.overall ?? "—"), "Today"],
        [String(h.potentialOverall ?? "—"), "Achievable"],
        [String(h.redFindings), "Red findings"],
        [String(m.configRemediation.length), "Config gaps"],
      ]} />

      <Section icon="coins" title="Where the value is">
        <p>
          Each action below is scored by the points it returns to the overall optimization score. The arithmetic is transparent: an
          indicator reaching target lifts the score by (100 − attainment) ÷ indicators in its layer ÷ scored layers, so the ranking is the
          fastest route to the target rather than a judgement call.
        </p>
        <table className="o2r-table">
          <thead><tr><th className="num">Points</th><th>Action</th><th>Business outcome</th></tr></thead>
          <tbody>
            {top.map((i) => (
              <tr key={i.key}>
                <td className="num"><b>+{i.scoreLift}</b></td>
                <td><b>{i.kpi}</b><div className="o2r-sub">L{i.layer} {i.layerLabel}</div></td>
                <td>{i.lever}<div style={{ fontSize: 13 }}>{i.reco}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section icon="trend" title="Value by lever">
        <table className="o2r-table">
          <thead><tr><th>ROI lever</th><th className="num">Actions</th><th className="num">Points</th></tr></thead>
          <tbody>
            {levers.map(([lever, items]) => (
              <tr key={lever}>
                <td>{lever}</td>
                <td className="num">{items.length}</td>
                <td className="num"><b>+{Math.round(sumLift(items) * 10) / 10}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section icon="team" title="Who feels the change" flow>
        {feel.length ? feel.map((l) => {
          const st = l.narrative.stakeholders;
          return (
            <div key={l.layer} className="o2r-find" style={{ borderLeftColor: gradeVar(l.grade) }}>
              <div className="o2r-find-head">
                <b>L{l.layer} · {l.label}</b>
                <span className="o2r-pill" style={{ background: gradeVar(l.grade) }}>{l.score} · {l.grade}</span>
              </div>
              {st && (
                <>
                  <p><b>Company.</b> {st.company}</p>
                  <p><b>Department.</b> {st.department}</p>
                  <p><b>Team.</b> {st.team}</p>
                  <p><b>End user.</b> {st.user}</p>
                </>
              )}
              {l.narrative.roi && <div className="o2r-sub">ROI: {l.narrative.roi}</div>}
            </div>
          );
        }) : <p className="o2r-muted">No layer is below target.</p>}
      </Section>

      {h.sampleVolume && (
        <Section icon="alert" title="A note on measurement">
          <div className="o2r-warn">
            <b>This window is too thin for rate-based claims.</b> {N(h.callsInWindow)} calls over {w.days ?? "?"} days ({h.callsPerDay ?? "—"}/day).
            Counts and configuration findings in this report stand on their own; percentages do not, and are excluded from the score.
            Re-baseline on production volumes before presenting any rate as an outcome.
          </div>
        </Section>
      )}

      <Footer m={m} />
    </article>
  );
}

export function RcGrowth({ result, run }: { result: ReportResult; run: ReportRun }) {
  const model = buildRcGrowthModel(result, run);
  const c = model.cover;
  const copy: GrowthCopy = {
    kicker: "RingCentral Optimization",
    subtitle: "features, integrations and expansion opportunities",
    worthLabel: "Why it is worth it.",
    topWinsLede: TOP_WINS_LEDE,
    howWePicked: HOW_WE_PICKED,
    categories: CATEGORIES,
    ecoNote: (note) => `RingCentral's API cannot reveal a tenant's installed apps or collaboration suite, so these span the common suites — ${note}.`,
    howBuilt: `Generated from your live RingCentral assessment — inventory, configuration audit, Business Analytics, RingCX and RingSense — for ${fmtDate(c.window.from)} → ${fmtDate(c.window.to)}. Items marked **Confirmed** are platform-stated. **Observed** are inferred from what the data does and does not show, including the collaboration-suite inference, which the RingCentral API cannot confirm and which is worth validating with the customer. No installed-app list is available, so integration recommendations are matched to detected signals rather than to a scan of what is installed.${model.thinWindow ? " The measurement window was too thin to support rate-based claims, so rate KPIs are excluded from the scoring this plan draws on." : ""}`,
  };
  return <GrowthPlan model={model} copy={copy} />;
}
