// Zoom Executive and Outcomes readouts. Ported from the standalone Zoom agent's
// report.js (renderReportHTML / renderOutcomesHTML) as React; the section order,
// headings and copy follow the original.
import { fmtDate, fmtValue } from "../../format";
import { GrowthPlan, type GrowthCopy } from "../GrowthPlan";
import { Icon } from "../icons";
import { accentVar, gradeVar, ragVar, reviewDays } from "../kit";
import { BasisBadge, InterpBlock, Kicker, OneInterp, Rich, ScoreRing, Section, StepsDetails } from "../shared";
import type { ReportResult, ReportRun } from "../types";
import { dataNotes, HOW_TO_READ } from "./content";
import { buildZoomGrowthModel } from "./growth";
import { CATEGORIES, HOW_WE_PICKED, TOP_WINS_LEDE } from "./growthContent";
import type { PriorityFinding, RoadmapItem, ZoomReadout } from "./model";

function Footer({ m }: { m: ZoomReadout }) {
  return <footer className="o2r-foot"><span>Confidential — prepared for {m.cover.customer} · {fmtDate(m.cover.generatedAt)}</span></footer>;
}

function Glance({ value, label, color }: { value: string; label: string; color: string }) {
  return <div><div className="o2r-glance-v" style={{ color }}>{value}</div><div className="o2r-glance-l">{label}</div></div>;
}

function FindingCard({ f }: { f: PriorityFinding }) {
  const n = f.narrative;
  return (
    <div className="o2r-find" style={{ borderLeftColor: ragVar(f.severity) }}>
      <div className="o2r-find-head">
        <span className="o2r-pill" style={{ background: ragVar(f.severity) }}>{f.severity}</span>
        <BasisBadge basis={f.basis} note={f.basisNote} />
        <b>{f.kpi}</b>
        <span className="o2r-sub">{f.area} · Layer {f.layer}</span>
      </div>
      <p>{f.observation}</p>
      {n.whyItMatters && <p><b>Why it matters:</b> {n.whyItMatters}</p>}
      {n.affectsNow && <p><b>What it affects now:</b> {n.affectsNow}</p>}
      {n.improving && <p><b>What addressing it unlocks:</b> {n.improving}</p>}
      <div className="o2r-find-foot">
        <div><span className="o2r-tag">ROI lever</span> {f.roiLever || f.businessImpact || "Value realization"}</div>
        <div><span className="o2r-tag ok">Recommendation</span> {f.recommendation}</div>
      </div>
      <StepsDetails steps={f.steps} summary="Configuration steps" />
    </div>
  );
}

function RoadmapRow({ it, i, maxLift }: { it: RoadmapItem; i: number; maxLift: number }) {
  const pct = it.scoreLift != null ? Math.max(4, (it.scoreLift / maxLift) * 100) : it.attainment != null ? Math.max(4, 100 - it.attainment) : 30;
  const badge = it.scoreLift != null ? `+${it.scoreLift}` : it.severity || "•";
  const col = it.scoreLift != null ? "var(--o2r-s2)" : ragVar(it.severity);
  return (
    <div className="o2r-road-row">
      <span className="o2r-road-rank">{i + 1}</span>
      <div className="o2r-road-main">
        <div className="o2r-road-top"><b>{it.label}</b><span>{fmtValue(it.current, it.unit)} → {fmtValue(it.target, it.unit)}</span></div>
        <div className="o2r-track"><i style={{ width: `${pct.toFixed(0)}%`, background: col }} /></div>
        <div className="o2r-road-reco">{it.reco}{it.lever && <span className="o2r-sub"> · {it.lever}</span>}</div>
      </div>
      <span className="o2r-road-lift" style={{ background: col }}>{badge}</span>
    </div>
  );
}

export function ZoomExecutive({ m }: { m: ZoomReadout }) {
  const h = m.headline, c = m.cover, essentials = m.scope === "essentials";
  const rm = m.roadmap;
  const maxLift = Math.max(...rm.items.map((i) => i.scoreLift || 0), 0.1);
  return (
    <article className="o2r">
      <section className="o2r-hero">
        <div>
          <Kicker icon="layers">Zoom Optimization{essentials ? " · Essentials (UCaaS)" : ""}</Kicker>
          <h1>{essentials ? "Communications Optimization Report" : "Executive Optimization Report"}</h1>
          <div className="o2r-cust">{c.customer}</div>
          <div className="o2r-metaline">Account {c.accountId} · Assessment window {fmtDate(c.window.from)} → {fmtDate(c.window.to)} · Generated {fmtDate(c.generatedAt)}</div>
        </div>
        <div className="o2r-hero-r">
          <ScoreRing value={h.overall} color={gradeVar(h.grade)} />
          <span className="o2r-gradechip" style={{ background: gradeVar(h.grade) }}>Grade {h.grade}</span>
          {h.potentialGain > 0 && (
            <div className="o2r-potential">▲ up to +{h.potentialGain} potential score lift{h.potentialOverall != null && <> → <b>{h.potentialOverall}</b></>}</div>
          )}
        </div>
      </section>

      <section className="o2r-glance">
        <Glance value={`${h.overall ?? "—"}/100`} label="Overall score" color={gradeVar(h.grade)} />
        <Glance value={h.configAlignment == null ? "—" : `${h.configAlignment}%`} label="Config aligned" color="var(--o2r-s1)" />
        <Glance value={`${h.kpisPopulated}/${h.kpisTotal}`} label="KPIs measured" color="var(--o2r-s2)" />
        <Glance value={String(h.redFindings)} label="Critical (Red)" color="var(--o2r-critical)" />
        <Glance value={String(h.amberFindings)} label="Watch (Amber)" color="var(--o2r-warning)" />
        <Glance value={String(h.strengths)} label="Strengths" color="var(--o2r-good)" />
      </section>

      <Section icon="doc" title="Executive summary">
        <div className="o2r-prose">{m.execSummary.map((p, i) => <p key={i}><Rich text={p} /></p>)}</div>
        <InterpBlock it={m.outcomes.interpretation} />
      </Section>

      <Section icon="search" title="Why this assessment matters" sub={m.whyThisMatters.lede}>
        <div className="o2r-grid">
          {m.whyThisMatters.points.map((p) => (
            <div key={p.title} className="o2r-card o2r-icard">
              <span className="o2r-ic"><Icon name={p.icon} size={22} /></span>
              <h4>{p.title}</h4>
              <p>{p.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section icon="team" title="Who this matters to — and why" sub="Optimization creates value at every level of the organization.">
        <div className="o2r-grid">
          {m.stakeholderValue.map((t) => (
            <div key={t.key} className="o2r-card o2r-stake">
              <div className="o2r-stake-top">
                <span className="o2r-shead-ic"><Icon name={t.icon} size={22} /></span>
                <div><h4>{t.label}</h4><span className="who">{t.who}</span></div>
              </div>
              <ul>{(t.items.length ? t.items : [t.blurb]).map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          ))}
        </div>
      </Section>

      {m.valueProps.length > 0 && (
        <Section icon="coins" title="Value & ROI" sub="What optimizing this environment is worth — grounded in your own data.">
          <ValueTiles m={m} />
        </Section>
      )}

      {m.priorityFindings.length > 0 && (
        <Section icon="alert" title="Priority findings" sub="Ranked by severity. Each is framed by impact, value, and the exact fix." flow>
          {m.priorityFindings.map((f) => <FindingCard key={f.id} f={f} />)}
        </Section>
      )}

      {rm.items.length > 0 && (
        <Section
          icon="flag" title="Score-improvement roadmap" flow
          sub={rm.potentialGain ? `Sequenced by score impact — up to +${rm.potentialGain} points${rm.potentialOverall != null ? ` (to ${rm.potentialOverall}/100)` : ""}.` : "Sequenced by severity and distance from target."}
        >
          {rm.items.map((it, i) => <RoadmapRow key={`${it.label}-${i}`} it={it} i={i} maxLift={maxLift} />)}
        </Section>
      )}

      <Section icon="layers" title="Layer-by-layer deep dive" sub="All 11 optimization layers, what each means for the business, and how this tenant scores." flow>
        {m.layerDeepDives.map((l) => {
          const n = l.narrative;
          const scoredKpis = l.kpis.filter((k) => k.available && k.value != null);
          return (
            <div key={l.layer} className="o2r-layer">
              <div className="o2r-layer-head">
                <span style={{ color: accentVar(n.accent) }}><Icon name={n.icon || "layers"} size={26} /></span>
                <div><h3>L{l.layer} · {l.label}</h3>{n.tagline && <span className="tag">{n.tagline}</span>}</div>
                <div className="o2r-layer-score">
                  {l.score == null ? <span className="o2r-muted">n/a</span>
                    : <><span className="o2r-layer-num" style={{ color: gradeVar(l.grade) }}>{l.score}</span><span className="o2r-layer-g">{l.grade}</span></>}
                </div>
              </div>
              <div className="o2r-layer-body">
                <div>
                  {n.whyItMatters && <p><b>Why it matters.</b> {n.whyItMatters}</p>}
                  {n.affectsNow && <p><b>Affects now.</b> {n.affectsNow}</p>}
                  {n.improving && <p><b>Improving it.</b> {n.improving}</p>}
                  {n.howItHelps && <p className="o2r-layer-help"><b>How PacketFusion helps.</b> {n.howItHelps}</p>}
                </div>
                <div>
                  {scoredKpis.length ? (
                    <table className="o2r-table"><tbody>
                      {scoredKpis.map((k) => (
                        <tr key={k.key}>
                          <td>{k.label}</td>
                          <td className="num"><b>{fmtValue(k.value, k.unit)}</b></td>
                          <td className="num o2r-sub">tgt {fmtValue(k.target, k.unit)}</td>
                          <td style={{ whiteSpace: "nowrap" }}><span className={`o2r-dot ${k.status === "On Target" ? "ok" : "bad"}`} />{k.status}</td>
                        </tr>
                      ))}
                    </tbody></table>
                  ) : <p className="o2r-muted">No KPIs populated for this layer in this window.</p>}
                  {n.roi && <p style={{ marginTop: 8 }}><span className="o2r-tag">ROI</span> {n.roi}</p>}
                </div>
              </div>
            </div>
          );
        })}
      </Section>

      {m.configRemediation.length > 0 && (
        <Section icon="shield" title="Configuration remediation" sub="Governance and security gaps — the fastest, lowest-cost score lifts." flow>
          {m.configRemediation.map((g) => (
            <div key={g.key} className="o2r-cfg-row">
              <div><b>{g.setting}</b><div className="o2r-sub">{g.product} · impact: {g.impact || "—"}</div></div>
              <div>
                <span className="o2r-badge warn">now: {g.current || "not set"}</span> →{" "}
                <span className="o2r-badge ok">target: {g.recommended}</span>
              </div>
              <div>
                {g.remediation}
                {g.steps && g.steps.length > 0 &&<ol>{g.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
              </div>
            </div>
          ))}
        </Section>
      )}

      {m.strengths.length > 0 && (
        <Section icon="check" title="What's working" sub="Strengths to protect and build on.">
          <div className="o2r-grid">
            {m.strengths.map((s) => (
              <div key={s.kpi} className="o2r-card" style={{ display: "flex", gap: 8 }}>
                <span style={{ color: "var(--o2r-good)" }}><Icon name="check" size={20} /></span>
                <div><b>{s.kpi}</b><div className="o2r-sub">{s.product}{s.value != null ? ` · ${s.value}` : ""}</div></div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section icon="flag" title="Recommended next steps">
        <ol>{m.nextSteps.map((s) => <li key={s}>{s}</li>)}</ol>
        <div className="o2r-card" style={{ marginTop: 14, background: "var(--o2r-panel)" }}>
          <h4 style={{ marginBottom: 6 }}>Methodology &amp; coverage</h4>
          <p style={{ fontSize: 13 }}>
            Scores are computed from live Zoom platform data across {m.scoreByLayer.filter((l) => l.score != null).length} measured layers
            ({h.kpisPopulated} of {h.kpisTotal} KPIs populated). Assessment window {fmtDate(c.window.from)} → {fmtDate(c.window.to)}.
            Generated by {m.methodology.generator || "Zoom Optimization"}{m.methodology.subrequests ? ` using ${m.methodology.subrequests} API calls` : ""}.
          </p>
          {m.methodology.scopes.length > 0 && (
            <details>
              <summary>Granted OAuth scopes ({m.methodology.scopes.length})</summary>
              <p className="o2r-sub" style={{ marginTop: 6 }}>{m.methodology.scopes.join(" · ")}</p>
            </details>
          )}
        </div>
      </Section>

      <Footer m={m} />
    </article>
  );
}

function ValueTiles({ m }: { m: ZoomReadout }) {
  return (
    <div className="o2r-grid">
      {m.valueProps.map((vp) => (
        <div key={vp.key} className="o2r-card o2r-icard">
          <span className="o2r-ic"><Icon name={vp.icon} size={22} /></span>
          <div className="o2r-value-num">{vp.m.value}</div>
          <div className="o2r-value-lbl">{vp.m.label}</div>
          <div className="o2r-value-title">{vp.title}</div>
          <p>{vp.body}</p>
        </div>
      ))}
    </div>
  );
}

function dataSourcesLine(m: ZoomReadout) {
  const prod = [...new Set(m.kpisAll.filter((k) => k.available).map((k) => k.product))].filter((p) => p && p !== "Cross-product" && p !== "Platform");
  const list = prod.length ? prod.slice(0, 8).join(", ") : "Users, Meetings, Phone, Contact Center";
  return `Live Zoom platform APIs — ${list}${m.methodology.scopes.length ? ` (${m.methodology.scopes.length} authorized scopes)` : ""}, plus Reports & Dashboards for the stated window.`;
}

export function ZoomOutcomes({ m }: { m: ZoomReadout }) {
  const o = m.outcomes, h = m.headline, c = m.cover;
  const days = reviewDays(c.window);
  const scored = m.scoreByLayer.filter((l) => l.score != null);
  return (
    <article className="o2r">
      <section className="o2r-hero">
        <div style={{ width: "100%" }}>
          <Kicker icon="flag">Zoom Optimization</Kicker>
          <h1>Optimization Outcomes Review</h1>
          <div className="o2r-cust">{c.customer} · utilization, adoption &amp; recommended next steps</div>
          <div className="o2r-ometa">
            <div><span>Client</span><b>{c.customer}</b></div>
            <div><span>Review period</span><b>{fmtDate(c.window.from)} – {fmtDate(c.window.to)}{days ? ` (${days} days)` : ""}</b></div>
            <div><span>Prepared for</span><b>Optimization review</b></div>
            <div className="wide"><span>Data sources</span><b>{dataSourcesLine(m)}</b></div>
          </div>
        </div>
      </section>

      <Section icon="doc" title="Summary">
        <div className="o2r-prose">{o.summary.map((p, i) => <p key={i}><Rich text={p} /></p>)}</div>
        <p className="o2r-howread"><Rich text={HOW_TO_READ} /></p>
        <InterpBlock it={o.interpretation} />
      </Section>

      {o.adoption && (
        <Section icon="pulse" title="Adoption snapshot" sub="How much of the platform is actually being used.">
          <div className="o2r-glance">
            {o.adoption.stats.map((s) => (
              <div key={s.label}>
                <div className={`o2r-adopt-v tone-${s.tone}`}>{s.value}</div>
                <div className="o2r-glance-l">{s.label}</div>
                {s.target != null && <div className="o2r-sub">target {s.target}%</div>}
              </div>
            ))}
          </div>
          <OneInterp label="What this tells us" text={o.adoption.tellsUs} tone="tells" />
        </Section>
      )}

      <Section icon="gauge" title="Where you stand" sub="A quick read of the optimization score behind this review. The full scorecard is in the Executive report.">
        <div className="o2r-stand">
          <div><span className="o2r-stand-num" style={{ color: gradeVar(h.grade) }}>{h.overall ?? "—"}</span><div className="o2r-sub">/100 · {h.grade}</div></div>
          <div className="o2r-stand-bars">
            {scored.map((l) => (
              <div key={l.layer} className="o2r-standbar">
                <span>{l.label}</span>
                <span className="o2r-track"><i style={{ width: `${Math.max(3, l.score ?? 0).toFixed(0)}%`, background: gradeVar(l.grade) }} /></span>
                <b>{l.score}</b>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {m.priorityFindings.length > 0 && (
        <Section icon="search" title="Key findings" sub="What the data shows — tagged Confirmed (platform-stated) or Observed (cause not yet established)." flow>
          {m.priorityFindings.map((f) => {
            const means = f.narrative.affectsNow || f.narrative.whyItMatters || "";
            return (
              <div key={f.id} className="o2r-find" style={{ borderLeftColor: ragVar(f.severity) }}>
                <div className="o2r-find-head">
                  <span className="o2r-pill" style={{ background: ragVar(f.severity) }}>{f.severity}</span>
                  <BasisBadge basis={f.basis} note={f.basisNote} />
                  <b>{f.kpi}</b>
                  <span className="o2r-sub">{f.area}</span>
                </div>
                <p>{f.observation}</p>
                {means && <p><b>What this means.</b> {means}</p>}
              </div>
            );
          })}
        </Section>
      )}

      <Section icon="check" title="What's working & the gaps">
        <div className="o2r-wg">
          <div className="good">
            <h4><Icon name="check" size={18} /> What's working</h4>
            <ul>
              {m.strengths.length
                ? m.strengths.map((s) => <li key={s.kpi}>{s.kpi}{s.value != null ? ` — ${s.value}` : ""}{s.product && <span className="o2r-sub"> ({s.product})</span>}</li>)
                : <li>Core platform is live and serving traffic.</li>}
            </ul>
          </div>
          <div className="bad">
            <h4><Icon name="alert" size={18} /> Gaps</h4>
            <ul>
              {o.gapsList.length ? o.gapsList.map((f) => <li key={f.id}>{f.observation || f.kpi}</li>) : <li>No material gaps surfaced this period.</li>}
            </ul>
          </div>
        </div>
      </Section>

      {o.openQuestions.length > 0 && (
        <Section icon="search" title={`Open questions for ${c.customer}`} sub="What we'd confirm together — to turn observations into agreed causes and actions.">
          <ol className="o2r-oq">{o.openQuestions.map((q, i) => <li key={i}><span className="o2r-tag">{q.tag}</span><Rich text={q.q} /></li>)}</ol>
        </Section>
      )}

      {m.roadmap.items.length > 0 && (
        <Section icon="flag" title="Recommended next steps" sub="In the order we'd take them. Each names the number we will re-measure next review." flow>
          {m.roadmap.items.slice(0, 8).map((it, i) => (
            <div key={`${it.label}-${i}`} className="o2r-rec">
              <span className="o2r-road-rank">{i + 1}</span>
              <div style={{ flex: 1 }}>
                <div><b>{it.label}</b>{it.lever && <span className="o2r-sub"> · {it.lever}</span>}</div>
                <p>{it.reco}</p>
                <div style={{ fontSize: 13 }}>
                  <span className="o2r-tag ok">Measured by</span> {it.label}
                  {it.target != null && ` → target ${fmtValue(it.target, it.unit)}`}
                  {it.current != null && <span className="o2r-sub"> (now {fmtValue(it.current, it.unit)})</span>}
                </div>
              </div>
            </div>
          ))}
        </Section>
      )}

      {m.valueProps.length > 0 && (
        <Section icon="coins" title="Outcomes & value" sub="What acting on this is worth — grounded in your own data.">
          <ValueTiles m={m} />
          <OneInterp label="What we think" text={o.interpretation.think} tone="think" />
        </Section>
      )}

      <Section icon="trend" title="Next review">
        <p className="o2r-prose">{o.nextReview}</p>
      </Section>
      <Section icon="doc" title="Glossary" flow>
        <dl className="o2r-gloss">{o.glossary.map((t) => <div key={t.term}><dt>{t.term}</dt><dd>{t.def}</dd></div>)}</dl>
      </Section>
      <Section icon="search" title="Data notes">
        <ul>{dataNotes(m, fmtDate).map((n) => <li key={n}>{n}</li>)}</ul>
      </Section>

      <Footer m={m} />
    </article>
  );
}

const ZOOM_GROWTH_COPY: GrowthCopy = {
  kicker: "Zoom Optimization",
  subtitle: "features, integrations & expansion opportunities",
  worthLabel: "Why it's worth it.",
  topWinsLede: TOP_WINS_LEDE,
  howWePicked: HOW_WE_PICKED,
  categories: CATEGORIES,
  ecoNote: (note) => `Zoom's API can't reveal a tenant's installed apps or collaboration suite, so these span the common suites — ${note}.`,
  howBuilt: "",
};

export function ZoomGrowth({ result, run }: { result: ReportResult; run: ReportRun }) {
  const model = buildZoomGrowthModel(result, run);
  const c = model.cover;
  const copy: GrowthCopy = {
    ...ZOOM_GROWTH_COPY,
    howBuilt: `This plan is generated automatically from your live Zoom assessment — workload activity, licensing, configuration state and the product deep-dives — for ${fmtDate(c.window.from)} → ${fmtDate(c.window.to)}. Items marked **Confirmed** are platform-stated; **Observed** are inferred from the data (including the collaboration-suite inference, which Zoom's API can't confirm — worth validating with the customer). No installed-app list is available from Zoom's API, so Marketplace recommendations are matched to detected signals and your CRM, not a scan of what's installed.`,
  };
  return <GrowthPlan model={model} copy={copy} />;
}
