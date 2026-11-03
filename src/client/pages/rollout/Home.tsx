import { Link } from "react-router-dom";
import { PROGRAM } from "../../../shared/rollout/program";
import type { Order } from "../../../shared/rollout/types";
import { StageBadge, ago, useData } from "../../components/rollout/ui";

const STEPS = [
  { n: "01", phase: "Solutioning", title: "Select template", body: "Pick your store size and phone model — good, better or best." },
  { n: "02", phase: "Solutioning", title: "Auto-generated SOW", body: "Canned scope and set pricing. No custom quoting, no waiting." },
  { n: "03", phase: "Solutioning", title: "Sign online", body: "Digital signature — your store is queued for deployment." },
  { n: "04", phase: "Implementation", title: "Track every step", body: "Ordered, kitted, shipped, live. Scan the QR on each phone to set it up." },
];

export default function Home() {
  const { data } = useData<{ orders: Order[] }>("/rollout/orders");
  const recent = data?.orders.slice(0, 5) ?? [];

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl bg-ro-navy text-white shadow-lg">
        <div className="grid gap-8 p-8 md:grid-cols-[1.3fr_1fr] md:p-10">
          <div>
            <div className="ro-eyebrow">{PROGRAM.name}</div>
            <h1 className="mt-3 text-3xl font-bold leading-tight md:text-4xl">
              Order Zoom Phone for your store.<br />
              <span className="text-ro-teal">We handle everything else.</span>
            </h1>
            <p className="mt-4 max-w-xl text-ro-mist/85">
              Tell us where the phones go and how many you need. We order the equipment, set up Zoom, ro-label every phone with
              a setup QR code and ship it to your counter — ready to plug in.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/rollout/order" className="ro-btn-primary px-6 py-3 text-base">Start a store order →</Link>
            </div>
          </div>
          <div className="grid content-center gap-3 text-sm">
            {[
              ["Most stores", "2 phones · about 10 minutes to order"],
              ["Delivered", "Pre-configured, labeled, plug-and-play"],
              ["Setup", "Scan the QR on the phone — step-by-step guide"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-white/8 px-4 py-3 ring-1 ring-white/10">
                <div className="text-xs font-semibold uppercase tracking-wider text-ro-teal">{k}</div>
                <div className="text-ro-mist">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {STEPS.map((s) => (
          <div key={s.n} className="ro-card p-5">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-ro-teal">{s.n}</span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-ro-steel">{s.phase}</span>
            </div>
            <div className="mt-2 font-semibold text-ro-navy">{s.title}</div>
            <p className="mt-1 text-sm text-ro-slate">{s.body}</p>
          </div>
        ))}
      </section>

      {recent.length > 0 && (
        <section className="ro-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-ro-navy">Store tracking links</h2>
              <p className="text-xs text-ro-slate">Each franchisee gets a private link by email. Shown here for the demo.</p>
            </div>
          </div>
          <ul className="divide-y divide-ro-mist">
            {recent.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <Link to={`/rollout/t/${o.access_token}`} className="font-medium text-ro-navy hover:text-ro-teal">{o.store_name}</Link>
                  <span className="ml-2 text-ro-slate">{o.order_number} · {ago(o.created_at)}</span>
                </div>
                <StageBadge stage={o.stage} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
