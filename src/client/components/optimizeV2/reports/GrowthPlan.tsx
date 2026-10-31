// Growth & Enablement plan renderer, shared by Zoom and RingCentral (the two
// originals' growth.js renderers differ only in the copy passed in here).
import { fmtDate } from "../format";
import { Icon } from "./icons";
import { BasisBadge, Kicker, Rich, Section, StepsDetails } from "./shared";
import type { GrowthCategory, GrowthModel, Opportunity } from "./types";

export type GrowthCopy = {
  kicker: string;
  subtitle: string;
  worthLabel: string;
  topWinsLede: string;
  howWePicked: string;
  categories: GrowthCategory[];
  /** Note under the integrations category when the collaboration suite is unknown. */
  ecoNote: (note: string) => string;
  howBuilt: string;
  footer?: string;
};

function OppCard({ o, n, worthLabel }: { o: Opportunity; n?: number; worthLabel: string }) {
  const val = o.value ? `${o.value.count ?? ""} ${o.value.label || ""}`.trim() : "";
  return (
    <div className="o2r-opp">
      {n ? <span className="o2r-opp-n">{n}</span> : <span className="o2r-opp-ic"><Icon name={o.icon || "spark"} size={22} /></span>}
      <div className="o2r-opp-main">
        <div className="o2r-opp-head">
          <b>{o.title}</b>
          <span className={`o2r-chip imp-${o.impact}`}>{o.impact} impact</span>
          <span className="o2r-chip">{o.effort} effort</span>
          <BasisBadge basis={o.basis} />
        </div>
        {o.why && <p>{o.why}</p>}
        {o.benefit && <p><b>{worthLabel}</b> {o.benefit}</p>}
        {val && <div className="o2r-val">{val}</div>}
        <StepsDetails steps={o.steps} summary="How to do it" />
        {o.who && <div className="o2r-who">{o.who}</div>}
      </div>
    </div>
  );
}

export function GrowthPlan({ model, copy }: { model: GrowthModel; copy: GrowthCopy }) {
  const c = model.cover, eco = model.ecosystem;
  return (
    <article className="o2r">
      <section className="o2r-hero">
        <div>
          <Kicker icon="flag">{copy.kicker}</Kicker>
          <h1>Growth &amp; Enablement Plan</h1>
          <div className="o2r-cust">{c.customer} · {copy.subtitle}</div>
          <div className="o2r-metaline">
            Account {c.accountId} · {fmtDate(c.window.from)} → {fmtDate(c.window.to)} · {model.total} opportunities ·{" "}
            Ecosystem: {eco.label}{eco.key === "unknown" ? " (unconfirmed)" : ""}
          </div>
        </div>
      </section>

      <Section icon="trend" title="The opportunity" sub="Turning the assessment into what to grow next.">
        <div className="o2r-prose">{model.summary.map((p, i) => <p key={i}><Rich text={p} /></p>)}</div>
      </Section>

      {model.topWins.length > 0 && (
        <Section icon="target" title="Top wins — start here" sub={copy.topWinsLede}>
          {model.topWins.map((o, i) => <OppCard key={`${o.source}-${o.title}`} o={o} n={i + 1} worthLabel={copy.worthLabel} />)}
          <p className="o2r-sub" style={{ marginTop: 8 }}>{copy.howWePicked}</p>
        </Section>
      )}

      {copy.categories.map((cat) => {
        const items = model.categories[cat.key] || [];
        return (
          <Section key={cat.key} icon={cat.icon} title={cat.label} sub={cat.lede} flow>
            {cat.key === "marketplace" && eco.key === "unknown" && <p className="o2r-howread">{copy.ecoNote(eco.note)}</p>}
            {items.length
              ? items.map((o) => <OppCard key={`${o.source}-${o.title}`} o={o} worthLabel={copy.worthLabel} />)
              : <p className="o2r-empty"><Icon name="check" size={18} /> Nothing flagged here — this area is in good shape. Revisit at the next review.</p>}
          </Section>
        );
      })}

      <Section icon="search" title="How this was built">
        <p className="o2r-prose"><Rich text={copy.howBuilt} /></p>
      </Section>

      <footer className="o2r-foot">
        <span>Confidential — prepared by PacketFusion for {c.customer} · {fmtDate(c.generatedAt)}</span>
        {copy.footer && <span>{copy.footer}</span>}
      </footer>
    </article>
  );
}
