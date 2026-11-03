import { useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../../lib/rolloutApi";
import { getModel, PROGRAM } from "../../../shared/rollout/program";
import type { Phone } from "../../../shared/rollout/types";
import { ErrorBox, Loading, useData } from "../../components/rollout/ui";
import { PhoneStatus } from "./Tracker";

interface SetupData {
  phone: Phone;
  siblings: { label: string; extension: string | null; status: string }[];
  order: { store_name: string; store_number: string; model_id: string; has_poe: number; main_number: string | null; stage: string; contact_name: string };
}

const HELP_TOPICS = ["Screen stays blank", "Phone won't sign in", "No dial tone", "Can't hear caller", "Something's missing from the box", "Other"];

export default function Setup() {
  const { token } = useParams();
  const { data, error, reload } = useData<SetupData>(`/rollout-public/setup/${token}`);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [help, setHelp] = useState(false);
  const [topic, setTopic] = useState(HELP_TOPICS[0]);
  const [msg, setMsg] = useState("");
  const [helpSent, setHelpSent] = useState(false);

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const { phone: p, order: o, siblings } = data;
  const m = getModel(o.model_id)!;
  const online = p.status === "registered" || p.status === "verified";
  const done = p.status === "verified";
  const notShipped = !["shipped", "delivered", "live", "verified"].includes(o.stage);
  const other = siblings.find((s) => s.extension && s.extension !== p.extension);

  const act = async (action: string, body?: unknown) => {
    setBusy(action); setErr("");
    try { await api(`/rollout-public/setup/${token}/${action}`, { body: body ?? {} }); await reload(); return true; }
    catch (e) { setErr((e as Error).message); return false; }
    finally { setBusy(""); }
  };

  return (
    <div className="space-y-4">
      <div className="ro-card overflow-hidden">
        <div className="bg-gradient-to-br from-ro-navy to-ro-steel p-5 text-white">
          <div className="text-xs font-semibold uppercase tracking-wider text-ro-teal">Phone setup</div>
          <div className="mt-1 text-2xl font-bold">{p.label}</div>
          <div className="text-ro-mist">Extension {p.extension} · {o.store_name}</div>
        </div>
        <div className="flex items-center justify-between px-5 py-3 text-sm">
          <span className="text-ro-slate">{m.name}</span>
          <PhoneStatus status={p.status} />
        </div>
      </div>

      {done ? (
        <div className="ro-card border-ro-teal bg-ro-teal/5 p-6 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-ro-teal text-2xl text-white">✓</div>
          <div className="text-lg font-bold text-ro-navy">This phone is all set</div>
          <p className="text-sm text-ro-slate">Thanks! Scan the QR code on the next phone to set it up.</p>
        </div>
      ) : (
        <>
          <div className="ro-card flex aspect-video flex-col items-center justify-center bg-ro-navy-deep text-center text-ro-mist">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-2xl">▶</div>
            <div className="mt-2 text-sm font-semibold">Watch: set up your phone in 90 seconds</div>
            <div className="text-xs text-ro-mist/60">Video placeholder</div>
          </div>

          <Step n={1} title="Unbox">
            <ul className="list-disc space-y-0.5 pl-5">
              <li>Phone and handset with coiled cord</li>
              <li>Stand</li>
              <li>Network cable</li>
              {!o.has_poe && <li>Power adapter</li>}
            </ul>
          </Step>
          <Step n={2} title="Assemble">Clip the stand onto the back of the phone, then plug the coiled cord into the handset and into the port with the handset icon.</Step>
          <Step n={3} title="Connect">
            Plug the network cable into the port marked <b>Internet</b> on the back of the phone, and the other end into the wall jack or network switch.
            {!o.has_poe && <> Then plug the power adapter into the phone and an outlet.</>}
          </Step>
          <Step n={4} title="Wait for it to sign in">
            <p>The phone starts up on its own. This takes 2–3 minutes. Don't press anything. When it's ready, the screen shows <b>{p.extension} {p.label}</b>.</p>
            {!online && (
              <button className="ro-btn-navy mt-3 w-full" disabled={!!busy || notShipped} onClick={() => act("registered")}>
                {busy === "registered" ? "Checking with Zoom…" : `My screen shows ${p.extension}`}
              </button>
            )}
            {online && <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">✓ Zoom sees this phone online</div>}
          </Step>
          <Step n={5} title="Make a test call" dim={!online}>
            <p>Pick up the handset and call {other ? <>the <b>{other.label}</b> (dial <b>{other.extension}</b>)</> : "your cell phone"}. Then ask someone to call the store's main number{o.main_number ? <> (<b>{o.main_number}</b>)</> : ""} and make sure this phone rings.</p>
            <button className="ro-btn-primary mt-3 w-full" disabled={!online || !!busy} onClick={() => act("verified")}>
              {busy === "verified" ? "Saving…" : "Test call worked"}
            </button>
          </Step>
        </>
      )}

      {err && <div className="ro-card border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      {notShipped && <div className="ro-card border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">This phone hasn't shipped yet. You'll be able to complete setup once it arrives.</div>}

      <div className="ro-card p-5">
        {helpSent ? (
          <div className="text-sm"><b className="text-ro-navy">Got it.</b> <span className="text-ro-slate">Packet Fusion support has your request and will call {o.contact_name} shortly.</span></div>
        ) : help ? (
          <div className="space-y-3">
            <div className="font-semibold text-ro-navy">What's going on?</div>
            <select className="ro-field" value={topic} onChange={(e) => setTopic(e.target.value)}>{HELP_TOPICS.map((t) => <option key={t}>{t}</option>)}</select>
            <textarea className="ro-field" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Anything else we should know?" />
            <div className="flex gap-2">
              <button className="ro-btn-navy flex-1" disabled={!!busy || notShipped} onClick={async () => { if (await act("help", { category: topic, message: msg })) setHelpSent(true); }}>Send to support</button>
              <button className="ro-btn-ghost" onClick={() => setHelp(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="w-full text-sm font-semibold text-ro-steel hover:text-ro-teal" onClick={() => setHelp(true)}>Something's not right? Get help →</button>
        )}
      </div>

      <div className="ro-card p-5">
        <div className="ro-label">Phones at this store</div>
        <ul className="divide-y divide-ro-mist text-sm">
          {siblings.map((s) => (
            <li key={s.label} className="flex items-center justify-between py-2">
              <span className={s.extension === p.extension ? "font-semibold text-ro-navy" : "text-ro-slate"}>{s.label} · ext {s.extension}</span>
              <PhoneStatus status={s.status} />
            </li>
          ))}
        </ul>
      </div>
      <p className="text-center text-xs text-ro-slate">Need a person? {PROGRAM.supportPhone}</p>
    </div>
  );
}

function Step({ n, title, children, dim }: { n: number; title: string; children: React.ReactNode; dim?: boolean }) {
  return (
    <div className={`ro-card flex gap-4 p-5 text-sm text-ro-slate ${dim ? "opacity-50" : ""}`}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ro-mist font-bold text-ro-navy">{n}</span>
      <div className="flex-1">
        <div className="mb-1 font-semibold text-ro-navy">{title}</div>
        {children}
      </div>
    </div>
  );
}
