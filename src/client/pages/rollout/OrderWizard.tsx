import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/rolloutApi";
import { buildQuote, getTemplate, MODELS, money, STATE_REGION, TEMPLATES, type ModelId, type TemplateId } from "../../../shared/rollout/program";
import type { NewOrderInput, Order } from "../../../shared/rollout/types";

const STATES = Object.keys(STATE_REGION).sort();
const TIMEZONES = [
  ["America/New_York", "Eastern"], ["America/Chicago", "Central"], ["America/Denver", "Mountain"],
  ["America/Phoenix", "Arizona"], ["America/Los_Angeles", "Pacific"], ["America/Anchorage", "Alaska"], ["Pacific/Honolulu", "Hawaii"],
];
const STEPS = ["Store", "Phones", "Site contact", "Review"];

type Form = Omit<NewOrderInput, "phone_qty" | "has_poe" | "template_id" | "model_id"> & { phone_qty: number; has_poe: boolean; template_id: TemplateId; model_id: ModelId };

const EMPTY: Form = {
  store_number: "", store_name: "", address1: "", address2: "", city: "", state: "", zip: "", timezone: "America/Los_Angeles",
  contact_name: "", contact_title: "", contact_email: "", contact_phone: "", submitted_by: "",
  template_id: "starter", model_id: "essential", phone_qty: 2, has_poe: true, number_option: "port", port_number: "", port_carrier: "", notes: "",
};

const SAMPLE: Partial<Form> = {
  store_number: "4127", store_name: "Store #4127 Pleasanton", address1: "5000 Hopyard Rd", address2: "Suite 110", city: "Pleasanton", state: "CA", zip: "94588",
  timezone: "America/Los_Angeles", port_number: "(925) 555-0187", port_carrier: "AT&T", submitted_by: "Dana Whitfield",
  contact_name: "Luis Ortega", contact_title: "Store manager", contact_email: "luis.ortega@store4127.example.com", contact_phone: "(925) 555-0187",
  notes: "Deliveries accepted 9–5 at the front counter.",
};

export default function OrderWizard() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const tpl = getTemplate(f.template_id)!;
  const quote = useMemo(() => buildQuote(f.template_id, f.model_id, f.phone_qty, f.has_poe), [f.template_id, f.model_id, f.phone_qty, f.has_poe]);

  const valid = [
    !!(f.store_number && f.store_name && f.address1 && f.city && f.state && /^\d{5}/.test(f.zip) && (f.number_option === "new" || f.port_number)),
    true,
    !!(f.contact_name && /\S+@\S+\.\S+/.test(f.contact_email) && f.contact_phone && f.submitted_by),
    true,
  ];

  const pickTemplate = (id: TemplateId) => {
    const t = getTemplate(id)!;
    setF((p) => ({ ...p, template_id: id, phone_qty: t.phones }));
  };

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const { order } = await api<{ order: Order }>("/rollout/orders", { body: f });
      nav(`/rollout/t/${order.access_token}/sow`);
    } catch (e) {
      setErr((e as Error).message); setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="ro-eyebrow">New store order</div>
            <h1 className="text-2xl font-bold text-ro-navy">{STEPS[step]}</h1>
          </div>
          <button type="button" className="text-xs font-medium text-ro-steel underline-offset-2 hover:underline" onClick={() => setF((p) => ({ ...p, ...SAMPLE }))}>
            Fill sample store
          </button>
        </div>
        <ol className="flex gap-2">
          {STEPS.map((s, i) => (
            <li key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-ro-teal" : "bg-ro-line"}`} title={s} />
          ))}
        </ol>

        {step === 0 && (
          <div className="ro-card space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
              <Field label="Store #"><input className="ro-field" value={f.store_number} onChange={(e) => set("store_number", e.target.value)} /></Field>
              <Field label="Store name"><input className="ro-field" value={f.store_name} onChange={(e) => set("store_name", e.target.value)} placeholder="e.g. Store #4127 Pleasanton" /></Field>
            </div>
            <Field label="Street address"><input className="ro-field" value={f.address1} onChange={(e) => set("address1", e.target.value)} /></Field>
            <Field label="Suite / unit (optional)"><input className="ro-field" value={f.address2} onChange={(e) => set("address2", e.target.value)} /></Field>
            <div className="grid gap-4 sm:grid-cols-[1fr_110px_130px]">
              <Field label="City"><input className="ro-field" value={f.city} onChange={(e) => set("city", e.target.value)} /></Field>
              <Field label="State">
                <select className="ro-field" value={f.state} onChange={(e) => set("state", e.target.value)}>
                  <option value="">—</option>
                  {STATES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="ZIP"><input className="ro-field" value={f.zip} onChange={(e) => set("zip", e.target.value)} inputMode="numeric" /></Field>
            </div>
            <Field label="Time zone">
              <select className="ro-field" value={f.timezone} onChange={(e) => set("timezone", e.target.value)}>
                {TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <div>
              <div className="ro-label">Store phone number</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Choice on={f.number_option === "port"} onClick={() => set("number_option", "port")} title="Keep our current number" body="We'll port it to Zoom — no change for customers." />
                <Choice on={f.number_option === "new"} onClick={() => set("number_option", "new")} title="Get a new number" body="A local number assigned in your area code." />
              </div>
            </div>
            {f.number_option === "port" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Current number"><input className="ro-field" value={f.port_number} onChange={(e) => set("port_number", e.target.value)} placeholder="(555) 555-0100" /></Field>
                <Field label="Current provider"><input className="ro-field" value={f.port_carrier} onChange={(e) => set("port_carrier", e.target.value)} placeholder="e.g. AT&T, Comcast" /></Field>
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <div className="ro-label">1 · Store template</div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {TEMPLATES.map((t) => {
                  const from = buildQuote(t.id, f.model_id, t.phones, f.has_poe).oneTime;
                  const on = f.template_id === t.id;
                  return (
                    <button key={t.id} type="button" onClick={() => pickTemplate(t.id)}
                      className={`ro-card flex flex-col p-4 text-left transition ${on ? "border-ro-teal ring-2 ring-ro-teal" : "hover:border-ro-steel"}`}>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-bold text-ro-navy">{t.phones}{t.maxPhones > t.phones ? "+" : ""}</span>
                        <span className="text-sm text-ro-slate">phones</span>
                      </div>
                      <div className="mt-1 text-xs font-bold uppercase tracking-wider text-ro-teal">{t.name}</div>
                      <div className="mt-2 text-lg font-bold text-ro-navy">{money(from)}</div>
                      <div className="text-[11px] text-ro-slate">one-time, per store</div>
                      <ul className="mt-3 space-y-1 text-xs text-ro-slate">
                        {t.features.map((x) => <li key={x}>✓ {x}</li>)}
                      </ul>
                    </button>
                  );
                })}
              </div>
              {tpl.maxPhones > tpl.phones && (
                <div className="ro-card mt-3 flex items-center justify-between p-4">
                  <div>
                    <div className="font-semibold text-ro-navy">How many phones?</div>
                    <div className="text-xs text-ro-slate">Enterprise covers 5 to {tpl.maxPhones} phones.</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="ro-btn-ghost h-9 w-9 p-0" onClick={() => set("phone_qty", Math.max(tpl.phones, f.phone_qty - 1))}>−</button>
                    <span className="w-8 text-center text-xl font-bold tabular-nums text-ro-navy">{f.phone_qty}</span>
                    <button type="button" className="ro-btn-ghost h-9 w-9 p-0" onClick={() => set("phone_qty", Math.min(tpl.maxPhones, f.phone_qty + 1))}>+</button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="ro-label">2 · Phone model</div>
              <div className="grid gap-3 md:grid-cols-3">
                {MODELS.map((m) => {
                  const on = f.model_id === m.id;
                  return (
                    <button key={m.id} type="button" onClick={() => set("model_id", m.id)}
                      className={`ro-card p-4 text-left transition ${on ? "border-ro-teal ring-2 ring-ro-teal" : "hover:border-ro-steel"}`}>
                      <div className="flex items-center justify-between">
                        <span className="rounded-full bg-ro-mist px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-ro-navy">{m.tier}</span>
                        <span className="font-bold text-ro-navy">{money(m.price)}<span className="text-xs font-normal text-ro-slate"> /phone</span></span>
                      </div>
                      <PhoneArt tier={m.tier} />
                      <div className="font-semibold text-ro-navy">{m.name}</div>
                      <p className="mt-1 text-xs text-ro-slate">{m.blurb}</p>
                      <ul className="mt-2 space-y-0.5 text-xs text-ro-slate">{m.specs.map((s) => <li key={s}>· {s}</li>)}</ul>
                      <div className="mt-2 text-[11px] font-semibold text-ro-steel">Best for: {m.bestFor}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="ro-card p-4">
              <div className="ro-label">3 · Network</div>
              <p className="mb-3 text-sm text-ro-slate">Does the store have a PoE network switch (one that powers phones over the network cable)? Not sure? Choose “No” — we'll include power adapters.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Choice on={f.has_poe} onClick={() => set("has_poe", true)} title="Yes, we have PoE" body="Phones power from the network cable." />
                <Choice on={!f.has_poe} onClick={() => set("has_poe", false)} title="No / not sure" body={`Adds a power adapter per phone.`} />
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="ro-card space-y-4 p-5">
            <p className="text-sm text-ro-slate">Who will receive the phones and plug them in? We'll email them tracking and setup instructions. They don't need to be technical.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Site contact name"><input className="ro-field" value={f.contact_name} onChange={(e) => set("contact_name", e.target.value)} /></Field>
              <Field label="Title (optional)"><input className="ro-field" value={f.contact_title} onChange={(e) => set("contact_title", e.target.value)} /></Field>
              <Field label="Email"><input className="ro-field" type="email" value={f.contact_email} onChange={(e) => set("contact_email", e.target.value)} /></Field>
              <Field label="Mobile phone"><input className="ro-field" value={f.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} /></Field>
            </div>
            <Field label="Delivery notes (optional)"><textarea className="ro-field" rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Receiving hours, back door, etc." /></Field>
            <hr className="border-ro-mist" />
            <Field label="Your name (person placing this order)"><input className="ro-field" value={f.submitted_by} onChange={(e) => set("submitted_by", e.target.value)} /></Field>
          </div>
        )}

        {step === 3 && (
          <div className="ro-card divide-y divide-ro-mist">
            <Review title="Store" onEdit={() => setStep(0)}>
              <div className="font-medium text-ro-navy">{f.store_name}</div>
              <div>{f.address1}{f.address2 ? `, ${f.address2}` : ""}, {f.city}, {f.state} {f.zip}</div>
              <div>{f.number_option === "port" ? `Port ${f.port_number} from ${f.port_carrier || "current provider"}` : "New local number"}</div>
            </Review>
            <Review title="Phones" onEdit={() => setStep(1)}>
              <div className="font-medium text-ro-navy">{tpl.name} template · {f.phone_qty}× {MODELS.find((m) => m.id === f.model_id)!.name}</div>
              <div>{tpl.callFlow}</div>
              <div>{f.has_poe ? "PoE network — no adapters" : "Power adapters included"}</div>
            </Review>
            <Review title="Site contact" onEdit={() => setStep(2)}>
              <div className="font-medium text-ro-navy">{f.contact_name}{f.contact_title ? `, ${f.contact_title}` : ""}</div>
              <div>{f.contact_email} · {f.contact_phone}</div>
            </Review>
            <div className="p-5 text-sm text-ro-slate">
              Next, we generate your Statement of Work with this scope and price. You'll review and sign it on the next screen.
            </div>
          </div>
        )}

        {err && <div className="ro-card border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

        <div className="flex justify-between">
          <button type="button" className="ro-btn-ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>← Back</button>
          {step < 3 ? (
            <button type="button" className="ro-btn-navy" disabled={!valid[step]} onClick={() => setStep(step + 1)}>Continue →</button>
          ) : (
            <button type="button" className="ro-btn-primary" disabled={busy} onClick={submit}>{busy ? "Generating…" : "Generate SOW →"}</button>
          )}
        </div>
      </div>

      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="ro-card overflow-hidden">
          <div className="bg-ro-navy px-4 py-3 text-white">
            <div className="text-xs font-semibold uppercase tracking-wider text-ro-teal">Your quote</div>
            <div className="text-sm text-ro-mist">{tpl.name} · {f.phone_qty} phones</div>
          </div>
          <ul className="divide-y divide-ro-mist px-4 text-sm">
            {quote.lines.map((l) => (
              <li key={l.sku} className="flex justify-between gap-3 py-2">
                <span className="text-ro-slate">{l.qty > 1 && <span className="font-semibold text-ro-navy">{l.qty}× </span>}{l.description}</span>
                <span className="whitespace-nowrap tabular-nums">{l.billing === "monthly" ? (l.total ? `${money(l.total)}/mo` : "incl.") : money(l.total)}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-1 border-t border-ro-line bg-ro-haze px-4 py-3">
            <div className="flex justify-between font-bold text-ro-navy"><span>One-time</span><span className="tabular-nums">{money(quote.oneTime)}</span></div>
            <div className="flex justify-between text-sm text-ro-slate"><span>Monthly</span><span className="tabular-nums">{money(quote.monthly)}/mo</span></div>
          </div>
        </div>
        <p className="mt-2 px-1 text-[11px] text-ro-slate/80">Illustrative demo pricing. Taxes and shipping not shown.</p>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="ro-label">{label}</span>{children}</label>;
}

function Choice({ on, onClick, title, body }: { on: boolean; onClick: () => void; title: string; body: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-lg border p-3 text-left transition ${on ? "border-ro-teal bg-ro-teal/5 ring-1 ring-ro-teal" : "border-ro-line bg-white hover:border-ro-steel"}`}>
      <div className="text-sm font-semibold text-ro-navy">{title}</div>
      <div className="text-xs text-ro-slate">{body}</div>
    </button>
  );
}

function Review({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 p-5 text-sm text-ro-slate">
      <div className="w-28 shrink-0 ro-label pt-0.5">{title}</div>
      <div className="flex-1 space-y-0.5">{children}</div>
      <button type="button" className="text-xs font-semibold text-ro-steel hover:text-ro-teal" onClick={onEdit}>Edit</button>
    </div>
  );
}

/** Simple line drawing of a desk phone; screen grows with the tier. */
function PhoneArt({ tier }: { tier: "Good" | "Better" | "Best" }) {
  const w = { Good: 30, Better: 40, Best: 52 }[tier];
  return (
    <svg viewBox="0 0 120 64" className="my-3 h-16 w-full" aria-hidden>
      <rect x="8" y="10" width="104" height="48" rx="8" fill="#dde8f0" />
      <rect x="14" y="16" width="16" height="36" rx="5" fill="#1a3560" />
      <rect x={70 - w / 2 + 8} y="16" width={w} height={tier === "Best" ? 30 : 20} rx="2" fill="#1a3560" />
      <rect x={72 - w / 2 + 8} y="18" width={w - 4} height={tier === "Best" ? 26 : 16} rx="1" fill="#0dbf8a" opacity=".35" />
      {tier !== "Best" && [0, 1, 2].map((i) => <rect key={i} x={56 + i * 14} y="42" width="10" height="8" rx="2" fill="#5b7fa6" opacity=".6" />)}
    </svg>
  );
}
