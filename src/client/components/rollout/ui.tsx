import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import QRCode from "qrcode";
import { api } from "../../lib/rolloutApi";
import { ApiError } from "../../lib/api";
import { PROGRAM, STAGES, stageIndex, type Stage } from "../../../shared/rollout/program";

// ── Formatting ──────────────────────────────────────────────────────────────

export const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
export const fmtDateTime = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
export function ago(s: string | null | undefined) {
  if (!s) return "—";
  const m = Math.round((Date.now() - Date.parse(s)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

// ── Data hook with polling ──────────────────────────────────────────────────

export function useData<T>(path: string | null, pollMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const alive = useRef(true);
  const load = useCallback((): Promise<void> => {
    if (!path) return Promise.resolve();
    return api<T>(path).then(
      (d) => { if (alive.current) { setData(d); setError(null); } },
      (e) => { if (alive.current) setError(e as Error); },
    );
  }, [path]);
  useEffect(() => {
    alive.current = true;
    void load();
    const t = pollMs ? setInterval(load, pollMs) : undefined;
    return () => { alive.current = false; if (t) clearInterval(t); };
  }, [load, pollMs]);
  return { data, error, reload: load, setData };
}

// ── Layouts ─────────────────────────────────────────────────────────────────

const subNavCls = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-1.5 text-sm font-medium transition ${isActive ? "bg-ro-navy text-white" : "text-ro-slate hover:bg-ro-mist hover:text-ro-navy"}`;

/** Internal pages — rendered inside CloudConnect's AppShell. */
export function RolloutLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-ro-haze px-4 py-5 text-slate-800 md:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="ro-no-print mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-ro-line pb-3">
          <div className="flex items-center gap-3">
            <img src="/favicon.png" alt="" className="h-8 w-8 rounded-full" />
            <div className="leading-tight">
              <div className="font-bold text-ro-navy">Zoom Retail Rollout</div>
              <div className="text-[11px] text-ro-slate">{PROGRAM.name} · demo — vendor integrations are simulated</div>
            </div>
          </div>
          <nav className="flex flex-wrap gap-1">
            <NavLink to="/rollout" end className={subNavCls}>Store portal</NavLink>
            <NavLink to="/rollout/ops" className={subNavCls}>Ops console</NavLink>
            <NavLink to="/rollout/program" className={subNavCls}>Program dashboard</NavLink>
          </nav>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Store-facing token pages (tracker, SOW, QR setup) — no CloudConnect chrome or login. */
export function StoreShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-ro-haze text-slate-800">
      <header className="ro-no-print bg-ro-navy">
        <div className={`mx-auto flex ${wide ? "max-w-5xl" : "max-w-2xl"} items-center px-4 py-3`}>
          <div className="flex items-center gap-3">
            <img src="/favicon.png" alt="" className="h-9 w-9 rounded-full ring-2 ring-white/20" />
            <div className="leading-tight">
              <div className="text-[15px] font-bold tracking-tight text-white">Zoom <span className="text-ro-teal">Retail</span> Rollout</div>
              <div className="text-[11px] text-ro-mist/70">by Packet Fusion</div>
            </div>
          </div>
        </div>
      </header>
      <main className={`mx-auto ${wide ? "max-w-5xl" : "max-w-2xl"} px-4 py-6`}>{children}</main>
      <footer className="ro-no-print py-8 text-center text-xs text-ro-slate/70">Packet Fusion, Inc. · Zoom Retail Rollout</footer>
    </div>
  );
}

// ── Stage visuals ───────────────────────────────────────────────────────────

const STAGE_TONE: Record<Stage, string> = {
  submitted: "bg-amber-50 text-amber-800 ring-amber-200",
  signed: "bg-sky-50 text-sky-800 ring-sky-200",
  ordered: "bg-sky-50 text-sky-800 ring-sky-200",
  staged: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  shipped: "bg-violet-50 text-violet-800 ring-violet-200",
  delivered: "bg-violet-50 text-violet-800 ring-violet-200",
  live: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  verified: "bg-ro-teal text-white ring-ro-teal",
};

export function StageBadge({ stage }: { stage: Stage }) {
  const s = STAGES.find((x) => x.id === stage)!;
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STAGE_TONE[stage]}`}>{s.label}</span>;
}

/** Horizontal milestone track, like slide 3 of the deck. */
export function Stepper({ stage, stamps }: { stage: Stage; stamps?: Partial<Record<Stage, string | null>> }) {
  const cur = stageIndex(stage);
  return (
    <ol className="grid grid-cols-4 gap-y-4 sm:grid-cols-8">
      {STAGES.map((s, i) => {
        const done = i <= cur;
        const active = i === cur && stage !== "verified";
        return (
          <li key={s.id} className="relative flex flex-col items-center px-1 text-center">
            {i > 0 && <span className={`absolute right-1/2 top-4 hidden h-0.5 w-full sm:block ${i <= cur ? "bg-ro-teal" : "bg-ro-line"}`} />}
            <span className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ring-4 ring-white
              ${done ? "bg-ro-teal text-white" : "bg-ro-mist text-ro-slate"} ${active ? "animate-pulse" : ""}`}>
              {done ? "✓" : String(i + 1).padStart(2, "0")}
            </span>
            <span className={`mt-2 text-xs font-semibold ${done ? "text-ro-navy" : "text-ro-slate/70"}`}>{s.label}</span>
            {stamps?.[s.id] && <span className="text-[11px] text-ro-slate/80">{fmtDate(stamps[s.id])}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function QR({ value, size = 128 }: { value: string; size?: number }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(value, { width: size * 2, margin: 1, color: { dark: "#1a3560", light: "#ffffff" } }).then(setSrc);
  }, [value, size]);
  return src ? <img src={src} width={size} height={size} alt="Setup QR code" /> : <div style={{ width: size, height: size }} />;
}

export function Stat({ label, value, sub, tone = "navy" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "navy" | "teal" | "amber" | "red" }) {
  const c = { navy: "text-ro-navy", teal: "text-ro-teal", amber: "text-amber-600", red: "text-red-600" }[tone];
  return (
    <div className="ro-card p-4">
      <div className="ro-label">{label}</div>
      <div className={`text-3xl font-bold tabular-nums ${c}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ro-slate">{sub}</div>}
    </div>
  );
}

export function Loading() {
  return <div className="py-20 text-center text-sm text-ro-slate">Loading…</div>;
}

export function ErrorBox({ error }: { error: Error }) {
  if (error instanceof ApiError && error.status === 403) {
    return <div className="ro-card p-8 text-center text-sm text-ro-slate">This module isn't enabled for your account.</div>;
  }
  return <div className="ro-card border-red-200 bg-red-50 p-4 text-sm text-red-700">{error.message}</div>;
}
