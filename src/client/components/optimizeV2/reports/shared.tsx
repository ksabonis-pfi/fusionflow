// Layout pieces shared by the Zoom and RingCentral readouts.
import type { ReactNode } from "react";
import { Icon } from "./icons";
import { REPORT_CSS } from "./styles";
import type { Basis } from "./types";

/** Authored text uses **bold** markers (the originals' <strong>); rendered as React nodes. */
export function Rich({ text }: { text: string }) {
  const parts = text.split("**");
  return <>{parts.map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : p))}</>;
}

export function ReportStyles() {
  return <style>{REPORT_CSS}</style>;
}

export function SectionHead({ icon, title, sub }: { icon: string; title: string; sub?: ReactNode }) {
  return (
    <div className="o2r-shead">
      <span className="o2r-shead-ic"><Icon name={icon} size={22} /></span>
      <div>
        <h2>{title}</h2>
        {sub ? <p>{sub}</p> : null}
      </div>
    </div>
  );
}

export function Section({ icon, title, sub, flow, children }: { icon: string; title: string; sub?: ReactNode; flow?: boolean; children?: ReactNode }) {
  return (
    <section className={`o2r-section${flow ? " o2r-flow" : ""}`}>
      <SectionHead icon={icon} title={title} sub={sub} />
      {children}
    </section>
  );
}

export type Interpretation = { tellsUs: string; means: string; think: string };

/** "What this tells us / What that means / What we think". */
export function InterpBlock({ it }: { it: Interpretation | null | undefined }) {
  if (!it) return null;
  return (
    <div className="o2r-interp">
      <div className="o2r-interp-row"><span className="o2r-interp-k tells">What this tells us</span><p><Rich text={it.tellsUs} /></p></div>
      <div className="o2r-interp-row"><span className="o2r-interp-k means">What that means</span><p><Rich text={it.means} /></p></div>
      <div className="o2r-interp-row"><span className="o2r-interp-k think">What we think</span><p><Rich text={it.think} /></p></div>
    </div>
  );
}

export function OneInterp({ label, text, tone }: { label: string; text: string | null | undefined; tone: "tells" | "means" | "think" }) {
  if (!text) return null;
  return (
    <div className="o2r-interp">
      <div className="o2r-interp-row"><span className={`o2r-interp-k ${tone}`}>{label}</span><p><Rich text={text} /></p></div>
    </div>
  );
}

export function BasisBadge({ basis, note }: { basis: Basis | null | undefined; note?: string }) {
  if (!basis) return null;
  return <span className={`o2r-basis b-${basis}`} title={note}>{basis}</span>;
}

/** Collapsible steps on screen; the report page opens every <details> before printing. */
export function StepsDetails({ steps, summary }: { steps: string[] | null | undefined; summary: string }) {
  if (!steps?.length) return null;
  return (
    <details>
      <summary>{summary}</summary>
      <ol>{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
    </details>
  );
}

/** Score ring for the cover (the original drew a gauge). */
export function ScoreRing({ value, color, size = 140 }: { value: number | null; color: string; size?: number }) {
  const r = 52, c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-label={value == null ? "No score" : `Score ${value}`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="10" />
      <circle
        cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 60 60)"
      />
      <text x="60" y="68" textAnchor="middle" fontSize="30" fontWeight="800" fill="#fff">{value ?? "—"}</text>
    </svg>
  );
}

export function Kicker({ icon, children }: { icon: string; children: ReactNode }) {
  return <div className="o2r-kicker"><Icon name={icon} size={16} /> {children}</div>;
}
