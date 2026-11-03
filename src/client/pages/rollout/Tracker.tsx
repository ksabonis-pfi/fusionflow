import { Link, useParams } from "react-router-dom";
import { getModel, getTemplate, money, PROGRAM, type Stage } from "../../../shared/rollout/program";
import type { OrderDetail } from "../../../shared/rollout/types";
import { ErrorBox, Loading, StageBadge, Stepper, fmtDate, fmtDateTime, useData } from "../../components/rollout/ui";

const NEXT: Record<Stage, string> = {
  submitted: "Review and sign your Statement of Work to place the order.",
  signed: "We're placing your equipment order and reserving your Zoom licenses.",
  ordered: "Your phones are on their way to our kitting center, where we set them up for your store.",
  staged: "Your phones are configured and labeled. They'll ship shortly.",
  shipped: "Your phones are on the way. When the box arrives, scan the QR code on each phone to set it up.",
  delivered: "Your phones have arrived. Scan the QR code on each phone and follow the steps. It takes about 5 minutes.",
  live: "All phones are connected. Make a test call from each phone and confirm it on the setup page.",
  verified: "You're all set. Your store is live on Zoom Phone.",
};

export default function Tracker() {
  const { token } = useParams();
  const { data, error } = useData<OrderDetail>(`/rollout-public/track/${token}`, 5000);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const { order: o, phones, events } = data;
  const t = getTemplate(o.template_id)!;
  const m = getModel(o.model_id)!;
  const stamps: Partial<Record<Stage, string | null>> = {
    submitted: o.created_at, signed: o.signed_at, shipped: o.shipped_at, delivered: o.delivered_at, live: o.live_at, verified: o.verified_at,
    ordered: events.find((e) => e.title.startsWith("Equipment ordered"))?.ts, staged: events.find((e) => e.title.startsWith("Kit staged"))?.ts,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="ro-eyebrow">Order {o.order_number}</div>
          <h1 className="text-2xl font-bold text-ro-navy">{o.store_name}</h1>
          <div className="text-sm text-ro-slate">{o.address1}, {o.city}, {o.state} {o.zip}</div>
        </div>
        <StageBadge stage={o.stage} />
      </div>

      <div className="ro-card p-5"><Stepper stage={o.stage} stamps={stamps} /></div>

      <div className={`ro-card flex flex-wrap items-center justify-between gap-3 p-5 ${o.stage === "verified" ? "border-ro-teal bg-ro-teal/5" : ""}`}>
        <div>
          <div className="ro-label">What happens next</div>
          <p className="text-ro-navy">{NEXT[o.stage]}</p>
        </div>
        {o.stage === "submitted" && <Link to={`/rollout/t/${token}/sow`} className="ro-btn-primary">Review & sign SOW →</Link>}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="ro-card p-5">
          <div className="ro-label">Shipment</div>
          {o.tracking_number ? (
            <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-sm">
              <dt className="text-ro-slate">Carrier</dt><dd className="font-medium text-ro-navy">{o.carrier} Ground</dd>
              <dt className="text-ro-slate">Tracking #</dt><dd className="font-mono text-ro-navy">{o.tracking_number}</dd>
              <dt className="text-ro-slate">{o.delivered_at ? "Delivered" : "Est. delivery"}</dt>
              <dd className="font-medium text-ro-navy">{o.delivered_at ? fmtDateTime(o.delivered_at) : fmtDate(o.eta)}</dd>
            </dl>
          ) : <p className="text-sm text-ro-slate">Tracking appears here as soon as your kit ships.</p>}
        </div>

        <div className="ro-card p-5">
          <div className="ro-label">Your order</div>
          <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-sm">
            <dt className="text-ro-slate">Package</dt><dd className="font-medium text-ro-navy">{t.name} — {o.phone_qty}× {m.name}</dd>
            <dt className="text-ro-slate">Main number</dt><dd className="text-ro-navy">{o.main_number ?? (o.number_option === "port" ? `Porting ${o.port_number}` : "Assigned at setup")}</dd>
            <dt className="text-ro-slate">Price</dt><dd className="text-ro-navy">{money(o.one_time_total)} one-time · {money(o.monthly_total)}/mo</dd>
            <dt className="text-ro-slate">SOW</dt><dd><Link to={`/rollout/t/${token}/sow`} className="font-medium text-ro-steel hover:text-ro-teal">{o.sow_number}{o.signed_at ? " (signed)" : ""}</Link></dd>
            <dt className="text-ro-slate">Site contact</dt><dd className="text-ro-navy">{o.contact_name} · {o.contact_phone}</dd>
          </dl>
        </div>
      </div>

      <div className="ro-card p-5">
        <div className="mb-2 flex items-baseline justify-between">
          <div className="ro-label">Phones</div>
          {["staged", "shipped", "delivered", "live"].includes(o.stage) && <span className="text-xs text-ro-slate">Demo: open a phone's setup page as if you'd scanned its QR code</span>}
        </div>
        <ul className="divide-y divide-ro-mist text-sm">
          {phones.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="font-medium text-ro-navy">{p.label}{p.extension && <span className="ml-2 font-normal text-ro-slate">ext {p.extension}</span>}</span>
              <span className="flex items-center gap-3">
                <PhoneStatus status={p.status} />
                {p.status !== "pending" && <Link to={`/rollout/s/${p.setup_token}`} className="text-xs font-semibold text-ro-steel hover:text-ro-teal">Setup page →</Link>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="ro-card p-5">
        <div className="ro-label">History</div>
        <ol className="space-y-2 text-sm">
          {[...events].reverse().map((e) => (
            <li key={e.id} className="flex gap-3">
              <span className="w-32 shrink-0 text-xs text-ro-slate">{fmtDateTime(e.ts)}</span>
              <span className="text-ro-navy">{e.title}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-center text-xs text-ro-slate">Questions? {PROGRAM.supportEmail} · {PROGRAM.supportPhone}</p>
    </div>
  );
}

export function PhoneStatus({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    pending: ["Awaiting equipment", "bg-ro-mist text-ro-slate"],
    provisioned: ["Configured", "bg-indigo-50 text-indigo-700"],
    registered: ["Online", "bg-emerald-50 text-emerald-700"],
    verified: ["Test call passed", "bg-ro-teal text-white"],
  };
  const [label, cls] = map[status] ?? [status, "bg-ro-mist"];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}
