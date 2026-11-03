import { useState } from "react";
import { Link } from "react-router-dom";
import { MODELS, PROGRAM, REGIONS, STAGES, TEMPLATES, stageIndex } from "../../../shared/rollout/program";
import type { Alert, Order } from "../../../shared/rollout/types";
import { ErrorBox, Loading, Stat, ago, useData } from "../../components/rollout/ui";

type Audience = "pm" | "ae" | "sponsor";
const AUDIENCES: { id: Audience; label: string; blurb: string }[] = [
  { id: "pm", label: "Packet Fusion PM", blurb: "Full operational view — escalations, dispatch queue, wave schedule" },
  { id: "ae", label: "Zoom Account Executive", blurb: "National progress, stores live, escalations open, wave ETA" },
  { id: "sponsor", label: "Program sponsor", blurb: "Program summary — stores deployed, pending, issues by region" },
];

const ALERT_META: Record<Alert["kind"], { icon: string; label: string; cls: string }> = {
  not_registered: { icon: "⚠", label: "Not registered", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  carrier_exception: { icon: "⚠", label: "Carrier exception", cls: "bg-amber-50 text-amber-800 ring-amber-200" },
  support_request: { icon: "✆", label: "Support request", cls: "bg-red-50 text-red-700 ring-red-200" },
  unsigned: { icon: "✎", label: "Unsigned SOW", cls: "bg-ro-mist text-ro-navy ring-ro-line" },
};

const MILESTONES = [25, 50, 75, 100];

export default function Program() {
  const { data, error } = useData<{ orders: Order[]; phoneStatus: Record<string, number>; alerts: Alert[]; liveLast14d: number }>("/rollout/program", 8000);
  const [aud, setAud] = useState<Audience>("pm");
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const { orders, phoneStatus, alerts, liveLast14d } = data;

  const atLeast = (s: (typeof STAGES)[number]["id"]) => orders.filter((o) => stageIndex(o.stage) >= stageIndex(s)).length;
  const signed = atLeast("signed");
  const shipped = atLeast("shipped");
  const live = atLeast("live");
  const verified = atLeast("verified");
  const phonesLive = (phoneStatus.registered ?? 0) + (phoneStatus.verified ?? 0);
  const phonesTotal = Object.values(phoneStatus).reduce((a, b) => a + b, 0);
  const pct = Math.round((live / PROGRAM.targetStores) * 100);
  const nextMilestone = MILESTONES.find((m) => pct < m);

  // Pace: stores reaching "live" per week over the last 14 days → ETA for the next milestone.
  const perWeek = liveLast14d / 2;
  const etaWeeks = nextMilestone && perWeek ? Math.ceil(((nextMilestone / 100) * PROGRAM.targetStores - live) / perWeek) : null;

  const byRegion = REGIONS.map((r) => {
    const os = orders.filter((o) => o.region === r);
    const l = os.filter((o) => stageIndex(o.stage) >= stageIndex("live")).length;
    return { region: r, total: os.length, inFlight: os.filter((o) => stageIndex(o.stage) >= 1 && stageIndex(o.stage) < stageIndex("live")).length, live: l, issues: alerts.filter((a) => a.region === r).length };
  });
  const maxStage = Math.max(...STAGES.map((s) => orders.filter((o) => o.stage === s.id).length), 1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="ro-eyebrow">{PROGRAM.client} · {PROGRAM.name}</div>
          <h1 className="text-2xl font-bold text-ro-navy">Program dashboard</h1>
          <p className="text-sm text-ro-slate">{AUDIENCES.find((a) => a.id === aud)!.blurb}</p>
        </div>
        <div className="flex rounded-lg bg-white p-1 ring-1 ring-ro-line">
          {AUDIENCES.map((a) => (
            <button key={a.id} onClick={() => setAud(a.id)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${aud === a.id ? "bg-ro-navy text-white" : "text-ro-slate hover:text-ro-navy"}`}>{a.label}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Stores signed" value={signed} sub={`of ${PROGRAM.targetStores} in wave plan · ${orders.length - signed} awaiting signature`} />
        <Stat label="Stores live" value={live} tone="teal" sub={`${verified} fully verified · ${shipped - live} in transit or installing`} />
        <Stat label="Phones online" value={phonesLive} sub={`of ${phonesTotal} ordered`} />
        <Stat label="Open alerts" value={alerts.length} tone={alerts.length ? "amber" : "teal"} sub={alerts.length ? "needs attention" : "all clear"} />
      </div>

      <div className="ro-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="ro-label">National progress — stores live</div>
          <div className="text-sm text-ro-slate">
            <b className="text-2xl text-ro-navy">{pct}%</b> · {live} of {PROGRAM.targetStores}
            {etaWeeks !== null && nextMilestone && <> · {nextMilestone}% milestone in ~{etaWeeks} wk at current pace</>}
          </div>
        </div>
        <div className="relative mt-4 h-3 rounded-full bg-ro-mist" title={`${live} of ${PROGRAM.targetStores} stores live (${pct}%)`}>
          <div className="h-3 rounded-full bg-ro-teal" style={{ width: `${Math.min(pct, 100)}%` }} />
          {MILESTONES.map((m) => (
            <div key={m} className="absolute top-0 h-3 w-0.5 bg-white" style={{ left: `${m}%` }} />
          ))}
        </div>
        <div className="relative mt-1 h-4 text-[11px] text-ro-slate">
          {MILESTONES.map((m) => (
            <span key={m} className={`absolute -translate-x-full ${pct >= m ? "font-semibold text-ro-teal-dark" : ""}`} style={{ left: `${m}%` }}>{pct >= m ? "✓ " : ""}{m}%</span>
          ))}
        </div>
      </div>

      <div className={`grid gap-5 ${aud === "sponsor" ? "" : "lg:grid-cols-2"}`}>
        <div className="ro-card overflow-x-auto p-5">
          <div className="ro-label mb-2">By region</div>
          <table className="w-full min-w-[460px] text-left text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-ro-steel">
              <tr><th className="py-1.5">Region</th><th className="text-right">Ordered</th><th className="text-right">In progress</th><th className="text-right">Live</th><th className="w-[30%] pl-4">Share live</th><th className="text-right">Issues</th></tr>
            </thead>
            <tbody className="divide-y divide-ro-mist">
              {byRegion.map((r) => {
                const share = r.total ? Math.round((r.live / r.total) * 100) : 0;
                return (
                  <tr key={r.region}>
                    <td className="py-2 font-medium text-ro-navy">{r.region}</td>
                    <td className="text-right tabular-nums">{r.total}</td>
                    <td className="text-right tabular-nums">{r.inFlight}</td>
                    <td className="text-right tabular-nums">{r.live}</td>
                    <td className="pl-4">
                      <div className="flex items-center gap-2" title={`${r.region}: ${r.live} of ${r.total} stores live (${share}%)`}>
                        <div className="h-2 flex-1 rounded-full bg-ro-mist"><div className="h-2 rounded-full bg-ro-teal" style={{ width: `${share}%` }} /></div>
                        <span className="w-9 text-right text-xs tabular-nums text-ro-slate">{share}%</span>
                      </div>
                    </td>
                    <td className="text-right">{r.issues ? <span className="font-semibold text-amber-700">⚠ {r.issues}</span> : <span className="text-ro-slate/60">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {aud !== "sponsor" && (
          <div className="ro-card p-5">
            <div className="ro-label mb-3">Stores by current stage</div>
            <ul className="space-y-2">
              {STAGES.map((s) => {
                const n = orders.filter((o) => o.stage === s.id).length;
                return (
                  <li key={s.id} className="grid grid-cols-[120px_1fr_32px] items-center gap-3 text-sm" title={`${s.label}: ${n} stores`}>
                    <span className="text-ro-slate">{s.label}</span>
                    <div className="h-4 rounded-r bg-ro-haze"><div className="h-4 rounded-r bg-ro-navy" style={{ width: `${(n / maxStage) * 100}%`, minWidth: n ? 4 : 0 }} /></div>
                    <span className="text-right font-semibold tabular-nums text-ro-navy">{n}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {aud === "ae" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Mix title="Phone model mix" rows={MODELS.map((m) => ({ label: `${m.tier} · ${m.name}`, n: orders.filter((o) => o.model_id === m.id).reduce((s, o) => s + o.phone_qty, 0) }))} unit="phones" />
          <Mix title="Store template mix" rows={TEMPLATES.map((t) => ({ label: t.name, n: orders.filter((o) => o.template_id === t.id).length }))} unit="stores" />
        </div>
      )}

      <div className="ro-card p-5">
        <div className="ro-label mb-3">{aud === "sponsor" ? "Open issues" : "Automated alerts"}</div>
        {!alerts.length && <p className="text-sm text-ro-slate">No open alerts.</p>}
        <ul className="divide-y divide-ro-mist">
          {(aud === "sponsor" ? alerts.slice(0, 6) : alerts).map((a, i) => {
            const meta = ALERT_META[a.kind];
            return (
              <li key={i} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${meta.cls}`}>{meta.icon} {meta.label}</span>
                {aud === "pm" ? <Link to={`/rollout/ops/${a.order_id}`} className="font-medium text-ro-navy hover:text-ro-teal">{a.store}</Link> : <span className="font-medium text-ro-navy">{a.store}</span>}
                <span className="flex-1 text-ro-slate">{a.message}</span>
                <span className="text-xs text-ro-slate">{a.region} · {ago(a.ts)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Mix({ title, rows, unit }: { title: string; rows: { label: string; n: number }[]; unit: string }) {
  const total = rows.reduce((s, r) => s + r.n, 0) || 1;
  return (
    <div className="ro-card p-5">
      <div className="ro-label mb-3">{title}</div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.label} className="text-sm" title={`${r.label}: ${r.n} ${unit} (${Math.round((r.n / total) * 100)}%)`}>
            <div className="flex justify-between"><span className="text-ro-navy">{r.label}</span><span className="tabular-nums text-ro-slate">{r.n} {unit}</span></div>
            <div className="mt-1 h-2 rounded-full bg-ro-mist"><div className="h-2 rounded-full bg-ro-steel" style={{ width: `${(r.n / total) * 100}%` }} /></div>
          </li>
        ))}
      </ul>
    </div>
  );
}
