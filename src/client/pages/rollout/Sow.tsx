import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/rolloutApi";
import { buildQuote, getModel, getTemplate, money, PROGRAM } from "../../../shared/rollout/program";
import type { OrderDetail } from "../../../shared/rollout/types";
import { ErrorBox, Loading, fmtDate, fmtDateTime, useData } from "../../components/rollout/ui";

export default function Sow() {
  const { token } = useParams();
  const nav = useNavigate();
  const { data, error } = useData<OrderDetail>(`/rollout-public/track/${token}`);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const o = data.order;
  const t = getTemplate(o.template_id)!;
  const m = getModel(o.model_id)!;
  const q = buildQuote(o.template_id, o.model_id, o.phone_qty, !!o.has_poe);
  const signed = !!o.signed_at;

  const sign = async () => {
    setBusy(true); setErr("");
    try {
      await api(`/rollout-public/track/${token}/sign`, { body: { name, title, agree } });
      nav(`/rollout/t/${token}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="ro-no-print flex flex-wrap items-center justify-between gap-2">
        <Link to={`/rollout/t/${token}`} className="text-sm font-medium text-ro-steel hover:text-ro-teal">← Order status</Link>
        <button className="ro-btn-ghost" onClick={() => window.print()}>Print / save PDF</button>
      </div>

      <article className="ro-card space-y-6 p-6 text-sm leading-relaxed text-ro-slate md:p-10">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-ro-line pb-5">
          <div>
            <div className="ro-eyebrow">Statement of Work</div>
            <h1 className="mt-1 text-2xl font-bold text-ro-navy">{o.sow_number}</h1>
            <div className="mt-1">{PROGRAM.name} — {t.name} store deployment</div>
          </div>
          <div className="text-right text-xs">
            <div className="font-semibold text-ro-navy">Packet Fusion, Inc.</div>
            <div>Issued {fmtDate(o.created_at)}</div>
            <div>Order {o.order_number}</div>
          </div>
        </header>

        <Section n="1" title="Parties and location">
          <p>This Statement of Work is between <b>Packet Fusion, Inc.</b> (“Packet Fusion”) and the franchisee operating <b>{o.store_name}</b> (“Store”), located at {o.address1}{o.address2 ? `, ${o.address2}` : ""}, {o.city}, {o.state} {o.zip}, under the {PROGRAM.name}.</p>
        </Section>

        <Section n="2" title="Scope — what Packet Fusion delivers">
          <ul className="list-disc space-y-1 pl-5">
            <li>Order {o.phone_qty}× {m.name} desk phones{o.has_poe ? "" : " with power adapters"} through our distribution partner.</li>
            <li>Provision a Zoom Phone site for the Store with {o.phone_qty} common-area phones (extensions 101–{100 + o.phone_qty}) and {o.phone_qty} Zoom Phone Common Area licenses.</li>
            <li>{o.number_option === "port" ? `Port the Store's existing number ${o.port_number ?? ""} to Zoom Phone and manage the port to completion.` : "Assign a new local main number for the Store."}</li>
            <li>Call flow: {t.callFlow}</li>
            <li>Kit, ro-label and pre-configure every phone, including a setup QR code on each unit linking to step-by-step instructions.</li>
            <li>Ship the kit to the Store and provide tracking to the site contact.</li>
            <li>Remote validation: confirm every phone registers and completes a test call{t.id === "enterprise" ? ", with field-dispatch SLA if remote validation fails" : ""}.</li>
          </ul>
        </Section>

        <Section n="3" title="Store responsibilities">
          <ul className="list-disc space-y-1 pl-5">
            <li>Site contact <b>{o.contact_name}</b> ({o.contact_email}) receives the shipment and plugs in each phone.</li>
            <li>An active network jack or switch port with internet access at each phone location.</li>
            <li>For ported numbers: authorize the port and keep the current service active until the port completes.</li>
          </ul>
        </Section>

        <Section n="4" title="Bill of materials and price">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-ro-line text-[11px] uppercase tracking-wider text-ro-steel">
                <tr><th className="py-2">SKU</th><th>Description</th><th className="text-right">Qty</th><th className="text-right">Unit</th><th className="text-right">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-ro-mist">
                {q.lines.map((l) => (
                  <tr key={l.sku}>
                    <td className="py-2 font-mono text-[11px]">{l.sku}</td>
                    <td>{l.description}</td>
                    <td className="text-right tabular-nums">{l.qty}</td>
                    <td className="text-right tabular-nums">{money(l.unit)}{l.billing === "monthly" ? "/mo" : ""}</td>
                    <td className="text-right tabular-nums">{money(l.total)}{l.billing === "monthly" ? "/mo" : ""}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-ro-line font-semibold text-ro-navy">
                <tr><td colSpan={4} className="py-2 text-right">One-time total (fixed)</td><td className="text-right tabular-nums">{money(q.oneTime)}</td></tr>
                <tr><td colSpan={4} className="text-right">Monthly recurring</td><td className="text-right tabular-nums">{money(q.monthly)}/mo</td></tr>
              </tfoot>
            </table>
          </div>
        </Section>

        <Section n="5" title="Assumptions and acceptance">
          <p>Price is fixed per store template; no on-site visit is included unless stated above. Structured cabling, network changes and in-store hardware other than the phones listed are out of scope. The deployment is accepted when every phone registers with Zoom and completes a test call, or 5 business days after delivery if no issue has been reported.</p>
        </Section>

        <Section n="6" title="Signature">
          {signed ? (
            <div className="rounded-lg border border-ro-teal/40 bg-ro-teal/5 p-4">
              <div className="font-[cursive] text-2xl text-ro-navy">{o.signed_name}</div>
              <div className="text-xs">{o.signed_name}{o.signed_title ? `, ${o.signed_title}` : ""} · signed electronically {fmtDateTime(o.signed_at)}</div>
            </div>
          ) : (
            <div className="ro-no-print space-y-3 rounded-lg border border-ro-line bg-ro-haze p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label><span className="ro-label">Full name</span><input className="ro-field" value={name} onChange={(e) => setName(e.target.value)} /></label>
                <label><span className="ro-label">Title</span><input className="ro-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Franchise owner" /></label>
              </div>
              {name && <div className="font-[cursive] text-2xl text-ro-navy">{name}</div>}
              <label className="flex items-start gap-2 text-xs">
                <input type="checkbox" className="mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                I'm authorized to sign for this store and agree to this Statement of Work. Typing my name is my electronic signature.
              </label>
              {err && <div className="text-sm text-red-600">{err}</div>}
              <button className="ro-btn-primary" disabled={!name.trim() || !agree || busy} onClick={sign}>{busy ? "Signing…" : "Sign and submit order"}</button>
            </div>
          )}
        </Section>
      </article>
    </div>
  );
}

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-semibold text-ro-navy"><span className="mr-2 text-ro-teal">{n}.</span>{title}</h2>
      {children}
    </section>
  );
}
