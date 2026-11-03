import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/rolloutApi";
import { getModel, getTemplate, money, STAGES, type Stage } from "../../../shared/rollout/program";
import type { Order, OrderDetail, OrderEvent } from "../../../shared/rollout/types";
import { ErrorBox, Loading, QR, StageBadge, Stepper, ago, fmtDateTime, useData } from "../../components/rollout/ui";
import { PhoneStatus } from "./Tracker";

export function OpsQueue() {
  const { data, error, reload } = useData<{ orders: Order[] }>("/rollout/orders", 5000);
  const [stage, setStage] = useState<Stage | "all">("all");
  const [q, setQ] = useState("");
  const [resetting, setResetting] = useState(false);

  const orders = data?.orders ?? [];
  const counts = Object.fromEntries(STAGES.map((s) => [s.id, orders.filter((o) => o.stage === s.id).length]));
  const shown = orders.filter((o) => (stage === "all" || o.stage === stage) &&
    (!q || `${o.order_number} ${o.store_name} ${o.city} ${o.state} ${o.contact_name}`.toLowerCase().includes(q.toLowerCase())));

  const reset = async () => {
    if (!window.confirm("Reset all demo data? Orders placed during the demo will be removed.")) return;
    setResetting(true);
    await api("/rollout/demo/reset", { body: {} });
    await reload();
    setResetting(false);
  };

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="ro-eyebrow">Packet Fusion · Ops</div>
          <h1 className="text-2xl font-bold text-ro-navy">Dispatch queue</h1>
        </div>
        <div className="flex gap-2">
          <input className="ro-field w-60" placeholder="Search store, order, contact…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="ro-btn-ghost" onClick={reset} disabled={resetting}>{resetting ? "Resetting…" : "Reset demo data"}</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Tab on={stage === "all"} onClick={() => setStage("all")}>All <b>{orders.length}</b></Tab>
        {STAGES.map((s) => <Tab key={s.id} on={stage === s.id} onClick={() => setStage(s.id)}>{s.short} <b>{counts[s.id]}</b></Tab>)}
      </div>

      <div className="ro-card overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-ro-line bg-ro-haze text-[11px] uppercase tracking-wider text-ro-steel">
            <tr><th className="px-4 py-2.5">Order</th><th>Store</th><th>Region</th><th>Package</th><th>Stage</th><th>Updated</th></tr>
          </thead>
          <tbody className="divide-y divide-ro-mist">
            {shown.map((o) => (
              <tr key={o.id} className="hover:bg-ro-haze">
                <td className="px-4 py-2.5">
                  <Link to={`/rollout/ops/${o.id}`} className="font-semibold text-ro-navy hover:text-ro-teal">{o.order_number}</Link>
                  {o.autopilot === 1 && o.next_step_at && <span className="ml-2 rounded bg-ro-teal/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-ro-teal-dark">auto</span>}
                </td>
                <td><div className="text-ro-navy">{o.store_name}</div><div className="text-xs text-ro-slate">{o.city}, {o.state}</div></td>
                <td className="text-ro-slate">{o.region}<div className="text-xs">{o.wave}</div></td>
                <td className="text-ro-slate">{getTemplate(o.template_id)?.name} · {o.phone_qty}× {getModel(o.model_id)?.name.replace("Yealink ", "")}</td>
                <td><StageBadge stage={o.stage} /></td>
                <td className="text-xs text-ro-slate">{ago(o.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <div className="p-8 text-center text-sm text-ro-slate">No orders match.</div>}
      </div>
    </div>
  );
}

function Tab({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-full px-3 py-1 text-xs ${on ? "bg-ro-navy text-white" : "bg-white text-ro-slate ring-1 ring-ro-line hover:bg-ro-mist"}`}>{children}</button>;
}

const SYSTEM_TONE: Record<OrderEvent["system"], string> = {
  portal: "bg-ro-mist text-ro-navy",
  scansource: "bg-orange-50 text-orange-700",
  zoom: "bg-blue-50 text-blue-700",
  carrier: "bg-amber-50 text-amber-800",
  ops: "bg-ro-teal/10 text-ro-teal-dark",
  store: "bg-violet-50 text-violet-700",
};

export function OpsOrder() {
  const { id } = useParams();
  const { data, error, setData } = useData<OrderDetail>(`/rollout/orders/${id}`, 4000);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState<"all" | "integration">("all");

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const { order: o, phones, events, support } = data;
  const t = getTemplate(o.template_id)!;
  const m = getModel(o.model_id)!;

  const run = async (label: string, path: string, body: unknown = {}) => {
    setBusy(label); setErr("");
    try { setData(await api<OrderDetail>(path, { body })); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(""); }
  };
  const resolve = async (sid: string) => {
    await api(`/rollout/support/${sid}/resolve`, { body: {} });
    setData(await api<OrderDetail>(`/rollout/orders/${id}`));
  };

  const shownEvents = [...events].reverse().filter((e) => filter === "all" || e.kind === "integration");

  return (
    <div className="space-y-5">
      <Link to="/rollout/ops" className="text-sm font-medium text-ro-steel hover:text-ro-teal">← Dispatch queue</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="ro-eyebrow">{o.order_number} · {o.sow_number}</div>
          <h1 className="text-2xl font-bold text-ro-navy">{o.store_name}</h1>
          <div className="text-sm text-ro-slate">{o.region} · {o.wave} · {t.name} · {o.phone_qty}× {m.name}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StageBadge stage={o.stage} />
          <button className="ro-btn-navy" disabled={!!busy || o.stage === "verified" || o.stage === "submitted"} onClick={() => run("advance", `/rollout/orders/${o.id}/advance`)}>
            {busy === "advance" ? "Working…" : "Advance next step →"}
          </button>
          <button className="ro-btn-ghost" disabled={!!busy || o.stage === "submitted"} onClick={() => run("auto", `/rollout/orders/${o.id}/autopilot`, { on: !o.autopilot })}>
            Autopilot: {!o.autopilot ? "off" : o.next_step_at ? "on" : "waiting on store"}
          </button>
        </div>
      </div>
      {err && <div className="ro-card border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      {o.autopilot === 1 && o.next_step_at && (
        <div className="rounded-lg bg-ro-teal/10 px-4 py-2 text-sm text-ro-teal-dark">Autopilot is moving this order forward — next step in about {Math.max(0, Math.round((Date.parse(o.next_step_at) - Date.now()) / 1000))}s. It pauses at delivery, waiting for the store to scan the QR codes.</div>
      )}

      <div className="ro-card p-5"><Stepper stage={o.stage} /></div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="space-y-5">
          <div className="ro-card p-5 text-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="ro-label">Order</div>
              <div className="flex gap-3 text-xs font-semibold">
                <Link className="text-ro-steel hover:text-ro-teal" to={`/rollout/t/${o.access_token}`}>Store view</Link>
                <Link className="text-ro-steel hover:text-ro-teal" to={`/rollout/t/${o.access_token}/sow`}>SOW</Link>
                {phones[0]?.extension && <Link className="text-ro-steel hover:text-ro-teal" to={`/rollout/ops/${o.id}/labels`}>Kit labels</Link>}
              </div>
            </div>
            <dl className="grid grid-cols-[120px_1fr] gap-y-1">
              <dt className="text-ro-slate">Address</dt><dd className="text-ro-navy">{o.address1}{o.address2 ? `, ${o.address2}` : ""}, {o.city}, {o.state} {o.zip}</dd>
              <dt className="text-ro-slate">Site contact</dt><dd className="text-ro-navy">{o.contact_name} · {o.contact_email} · {o.contact_phone}</dd>
              <dt className="text-ro-slate">Ordered by</dt><dd className="text-ro-navy">{o.submitted_by} · {fmtDateTime(o.created_at)}</dd>
              <dt className="text-ro-slate">Signed</dt><dd className="text-ro-navy">{o.signed_at ? `${o.signed_name} · ${fmtDateTime(o.signed_at)}` : "—"}</dd>
              <dt className="text-ro-slate">Number</dt><dd className="text-ro-navy">{o.main_number ?? (o.number_option === "port" ? `Port ${o.port_number} (${o.port_carrier})` : "New")}</dd>
              <dt className="text-ro-slate">ScanSource</dt><dd className="font-mono text-ro-navy">{o.scansource_order ?? "—"}</dd>
              <dt className="text-ro-slate">Zoom site</dt><dd className="font-mono text-ro-navy">{o.zoom_site_id ?? "—"}</dd>
              <dt className="text-ro-slate">Tracking</dt><dd className="font-mono text-ro-navy">{o.tracking_number ?? "—"}</dd>
              <dt className="text-ro-slate">Value</dt><dd className="text-ro-navy">{money(o.one_time_total)} + {money(o.monthly_total)}/mo</dd>
              {o.notes && <><dt className="text-ro-slate">Notes</dt><dd className="text-ro-navy">{o.notes}</dd></>}
            </dl>
          </div>

          <div className="ro-card overflow-x-auto p-5">
            <div className="ro-label">Phones</div>
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-ro-steel"><tr><th className="py-1.5">Label</th><th>Ext</th><th>MAC</th><th>Serial</th><th>Status</th></tr></thead>
              <tbody className="divide-y divide-ro-mist">
                {phones.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 font-medium text-ro-navy"><Link to={`/rollout/s/${p.setup_token}`} className="hover:text-ro-teal">{p.label}</Link></td>
                    <td>{p.extension ?? "—"}</td>
                    <td className="font-mono">{p.mac ?? "—"}</td>
                    <td className="font-mono">{p.serial ?? "—"}</td>
                    <td><PhoneStatus status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {support.length > 0 && (
            <div className="ro-card p-5">
              <div className="ro-label">Support requests</div>
              <ul className="space-y-2 text-sm">
                {support.map((s) => (
                  <li key={s.id} className={`rounded-lg p-3 ${s.status === "open" ? "bg-red-50" : "bg-ro-haze"}`}>
                    <div className="flex items-center justify-between">
                      <b className="text-ro-navy">{s.category}</b>
                      {s.status === "open" ? <button className="text-xs font-semibold text-ro-steel hover:text-ro-teal" onClick={() => resolve(s.id)}>Mark resolved</button> : <span className="text-xs text-ro-slate">Resolved</span>}
                    </div>
                    <div className="text-ro-slate">{s.message}</div>
                    <div className="text-xs text-ro-slate/80">{fmtDateTime(s.ts)}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="ro-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="ro-label">Activity &amp; integration log</div>
            <div className="flex gap-1">
              <Tab on={filter === "all"} onClick={() => setFilter("all")}>All</Tab>
              <Tab on={filter === "integration"} onClick={() => setFilter("integration")}>API calls</Tab>
            </div>
          </div>
          <ol className="space-y-2">
            {shownEvents.map((e) => <EventRow key={e.id} e={e} />)}
            {!shownEvents.length && <li className="text-sm text-ro-slate">No API calls logged yet{filter === "integration" ? " — seeded demo orders only carry milestones; place a new order to see live calls" : ""}.</li>}
          </ol>
        </div>
      </div>
    </div>
  );
}

function EventRow({ e }: { e: OrderEvent }) {
  const [open, setOpen] = useState(false);
  const hasPayload = !!(e.request_json || e.response_json);
  return (
    <li className={`rounded-lg border p-3 text-sm ${e.kind === "alert" ? "border-red-200 bg-red-50" : e.kind === "milestone" ? "border-ro-teal/30 bg-ro-teal/5" : "border-ro-mist"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${SYSTEM_TONE[e.system]}`}>{e.system}</span>
          <div>
            <div className={`text-ro-navy ${e.kind === "milestone" ? "font-semibold" : ""}`}>{e.title}</div>
            {e.detail && <div className="text-xs text-ro-slate">{e.detail}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasPayload && <button className="text-[11px] font-semibold text-ro-steel hover:text-ro-teal" onClick={() => setOpen(!open)}>{open ? "Hide" : "Payload"}</button>}
          <span className="whitespace-nowrap text-[11px] text-ro-slate">{fmtDateTime(e.ts)}</span>
        </div>
      </div>
      {open && (
        <div className={`mt-2 grid gap-2 ${e.request_json && e.response_json ? "md:grid-cols-2" : ""}`}>
          {e.request_json && <Json label="Request" text={e.request_json} />}
          {e.response_json && <Json label="Response" text={e.response_json} />}
        </div>
      )}
    </li>
  );
}

function Json({ label, text }: { label: string; text: string }) {
  let pretty = text;
  try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* raw */ }
  return (
    <div>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ro-steel">{label}</div>
      <pre className="max-h-64 overflow-auto rounded bg-ro-navy-deep p-2 text-[11px] leading-snug text-ro-mist">{pretty}</pre>
    </div>
  );
}

/** Printable QR labels — one per phone, stuck on the underside before the kit ships. */
export function KitLabels() {
  const { id } = useParams();
  const { data, error } = useData<OrderDetail>(`/rollout/orders/${id}`);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const { order: o, phones } = data;
  return (
    <div className="space-y-4">
      <div className="ro-no-print flex items-center justify-between">
        <Link to={`/rollout/ops/${o.id}`} className="text-sm font-medium text-ro-steel hover:text-ro-teal">← {o.order_number}</Link>
        <button className="ro-btn-navy" onClick={() => window.print()}>Print labels</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {phones.map((p) => (
          <div key={p.id} className="flex gap-4 rounded-xl border-2 border-dashed border-ro-line bg-white p-4">
            <QR value={`${location.origin}/rollout/s/${p.setup_token}`} size={120} />
            <div className="flex flex-col justify-between text-sm">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-ro-teal">Scan to set up</div>
                <div className="text-lg font-bold leading-tight text-ro-navy">{p.label}</div>
                <div className="text-ro-navy">Ext {p.extension}</div>
              </div>
              <div className="text-[11px] text-ro-slate">
                <div>{o.store_name}</div>
                <div className="font-mono">MAC {p.mac}</div>
                <div>Help: Packet Fusion support</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
