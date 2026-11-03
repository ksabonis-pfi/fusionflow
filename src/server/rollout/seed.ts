// Demo seed — a believable mid-rollout program: ~50 stores spread across
// regions and stages, with a few alerts planted so the dashboards have
// something to show. Seeded history is milestones only (no vendor payloads);
// orders placed live through the portal get the full integration log.

import { buildQuote, PROGRAM, STAGES, STATE_REGION, TEMPLATES, MODELS, type Stage } from "../../shared/rollout/program";
import { id, token } from "./db";
import { phoneLabel } from "./lifecycle";
import type { Bindings } from "../types";

const CITIES: [string, string, string, string][] = [
  ["Pleasanton", "CA", "94566", "925"], ["Sacramento", "CA", "95814", "916"], ["San Diego", "CA", "92101", "619"], ["Fresno", "CA", "93721", "559"],
  ["Portland", "OR", "97205", "503"], ["Seattle", "WA", "98101", "206"], ["Boise", "ID", "83702", "208"], ["Reno", "NV", "89501", "775"],
  ["Phoenix", "AZ", "85004", "602"], ["Tucson", "AZ", "85701", "520"], ["Austin", "TX", "78701", "512"], ["Plano", "TX", "75024", "972"],
  ["San Antonio", "TX", "78205", "210"], ["Denver", "CO", "80202", "303"], ["Albuquerque", "NM", "87102", "505"], ["Tulsa", "OK", "74103", "918"],
  ["Omaha", "NE", "68102", "402"], ["Kansas City", "MO", "64105", "816"], ["Minneapolis", "MN", "55401", "612"], ["Des Moines", "IA", "50309", "515"],
  ["Chicago", "IL", "60601", "312"], ["Naperville", "IL", "60540", "630"], ["Columbus", "OH", "43215", "614"], ["Ann Arbor", "MI", "48104", "734"],
  ["Indianapolis", "IN", "46204", "317"], ["Milwaukee", "WI", "53202", "414"], ["Louisville", "KY", "40202", "502"],
  ["Atlanta", "GA", "30303", "404"], ["Orlando", "FL", "32801", "407"], ["Tampa", "FL", "33602", "813"], ["Charlotte", "NC", "28202", "704"],
  ["Raleigh", "NC", "27601", "919"], ["Nashville", "TN", "37203", "615"], ["Richmond", "VA", "23219", "804"], ["Charleston", "SC", "29401", "843"],
  ["Hoboken", "NJ", "07030", "201"], ["Albany", "NY", "12207", "518"], ["Boston", "MA", "02108", "617"], ["Pittsburgh", "PA", "15222", "412"],
  ["Hartford", "CT", "06103", "860"], ["Baltimore", "MD", "21202", "410"], ["Burlington", "VT", "05401", "802"],
];
const STREETS = ["Main St", "Oak Ave", "Market St", "Broadway", "Center Blvd", "Park Ave", "Commerce Dr", "Elm St", "Lake Rd", "Highland Ave"];
const FIRST = ["Maria", "James", "Priya", "Daniel", "Aisha", "Tom", "Keiko", "Luis", "Grace", "Omar", "Hannah", "Marcus", "Elena", "Raj", "Beth", "Andre"];
const LAST = ["Nguyen", "Patel", "Garcia", "Johnson", "Kim", "Okafor", "Rossi", "Chen", "Walsh", "Haddad", "Lopez", "Brooks", "Singh", "Meyer"];

function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// How many stores sit at each stage (sums to the seeded store count).
const DISTRIBUTION: [Stage, number][] = [
  ["verified", 19], ["live", 5], ["delivered", 5], ["shipped", 6], ["staged", 4], ["ordered", 5], ["signed", 3], ["submitted", 4],
];

export async function resetAndSeed(env: Bindings) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM rollout_support"),
    env.DB.prepare("DELETE FROM rollout_events"),
    env.DB.prepare("DELETE FROM rollout_phones"),
    env.DB.prepare("DELETE FROM rollout_orders"),
  ]);

  const r = rng(42);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const DAY = 86400000;
  const stmts: D1PreparedStatement[] = [];
  let n = 0;

  for (const [stage, count] of DISTRIBUTION) {
    const si = STAGES.findIndex((s) => s.id === stage);
    for (let k = 0; k < count; k++, n++) {
      const [city, state, zip, area] = CITIES[n % CITIES.length];
      // 2 phones is the norm; a minority of stores go bigger.
      const roll = r();
      const tpl = roll < 0.62 ? TEMPLATES[0] : roll < 0.82 ? TEMPLATES[1] : roll < 0.94 ? TEMPLATES[2] : TEMPLATES[3];
      const qty = tpl.id === "enterprise" ? 5 + Math.floor(r() * 3) : tpl.phones;
      const model = r() < 0.55 ? MODELS[0] : r() < 0.75 ? MODELS[1] : MODELS[2];
      const hasPoe = r() < 0.7;
      const quote = buildQuote(tpl.id, model.id, qty, hasPoe);
      const contact = `${pick(FIRST)} ${pick(LAST)}`;
      const storeNum = String(1000 + Math.floor(r() * 6000));
      const seq = String(10200 + n + 1);
      const orderId = id("ord");

      // Walk the stage timeline backwards from "now-ish" so older stages are earlier.
      const stepDays = [0, 1 + r() * 2, 2 + r() * 2, 3 + r() * 2, 1, 2, r() * 2, 0.3];
      const ageDays = stage === "submitted" && k >= 2 ? 0.2 + k * 0.3 : 2 + (si + 1) * 2.5 + r() * 6 + (stage === "verified" ? r() * 25 : 0);
      const created = Date.now() - ageDays * DAY;
      const at: string[] = [];
      let t = created;
      for (let i = 0; i <= si; i++) { t += stepDays[i] * DAY; at.push(new Date(Math.min(t, Date.now() - (si - i) * 3600000)).toISOString()); }
      const stamp = (s: Stage) => at[STAGES.findIndex((x) => x.id === s)] ?? null;
      const reached = (s: Stage) => STAGES.findIndex((x) => x.id === s) <= si;
      // Plant alerts: some delivered stores have sat unregistered for days; some unsigned SOWs are stale.
      if (stage === "delivered") at[5] = new Date(Date.now() - (k < 2 ? (2 + k) * DAY : (3 + k * 3) * 3600000)).toISOString();

      const wave = ageDays > 20 ? "Wave 1" : ageDays > 10 ? "Wave 2" : "Wave 3";
      const tracking = reached("shipped") ? `1Z9F${(n * 7919).toString(16).toUpperCase().padStart(6, "0")}01${String(30000000 + n * 1371)}` : null;

      stmts.push(env.DB.prepare(
        `INSERT INTO rollout_orders (id, order_number, sow_number, access_token, stage, wave, region, store_number, store_name, address1, city, state, zip,
          timezone, contact_name, contact_title, contact_email, contact_phone, submitted_by, template_id, model_id, phone_qty, has_poe, number_option,
          one_time_total, monthly_total, signed_name, signed_title, signed_at, scansource_order, zoom_site_id, main_number, carrier, tracking_number, eta,
          shipped_at, delivered_at, live_at, verified_at, autopilot, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
      ).bind(
        orderId, `PF-${PROGRAM.code}-${seq}`, `SOW-${PROGRAM.code}-${tpl.sowCode}-${seq}`, token(), stage, wave, STATE_REGION[state],
        storeNum, `Store #${storeNum} ${city}`, `${100 + Math.floor(r() * 8900)} ${pick(STREETS)}`, city, state, zip,
        "America/" + (["CA", "OR", "WA", "NV"].includes(state) ? "Los_Angeles" : ["AZ"].includes(state) ? "Phoenix" : ["CO", "NM", "ID", "UT"].includes(state) ? "Denver" : ["TX", "OK", "NE", "MO", "MN", "IA", "IL", "WI", "TN"].includes(state) ? "Chicago" : "New_York"),
        contact, "Franchise owner", `${contact.split(" ")[0].toLowerCase()}@store${storeNum}.example.com`, `(${area}) 555-${String(1000 + n * 37).slice(-4)}`, contact,
        tpl.id, model.id, qty, hasPoe ? 1 : 0, r() < 0.6 ? "port" : "new", quote.oneTime, quote.monthly,
        reached("signed") ? contact : null, reached("signed") ? "Franchise owner" : null, stamp("signed"),
        reached("ordered") ? `SS${String(41000000 + n * 2273)}` : null, reached("staged") ? `zs_${orderId.slice(4, 12)}` : null,
        reached("staged") ? `+1${area}555${String(2000 + n * 13).slice(-4)}` : null, tracking ? "UPS" : null, tracking,
        tracking ? new Date(Date.parse(stamp("shipped")!) + 2 * DAY).toISOString().slice(0, 10) : null,
        stamp("shipped"), stamp("delivered"), stamp("live"), stamp("verified"), new Date(created).toISOString(), at[at.length - 1] ?? new Date(created).toISOString(),
      ));

      for (let p = 1; p <= qty; p++) {
        const status = reached("verified") ? "verified" : reached("live") ? "registered" : reached("staged") ? "provisioned" : "pending";
        stmts.push(env.DB.prepare(
          "INSERT INTO rollout_phones (id, order_id, seq, label, model_id, extension, mac, serial, zoom_device_id, setup_token, status, registered_at, verified_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ).bind(
          id("ph"), orderId, p, phoneLabel(p), model.id,
          reached("staged") ? String(100 + p) : null,
          reached("staged") ? `80:5E:C0:${((n * 31 + p) * 2654435761 >>> 0).toString(16).toUpperCase().padStart(8, "0").slice(0, 6).match(/../g)!.join(":")}` : null,
          reached("staged") ? `8${String(100000000 + n * 1000 + p)}` : null,
          reached("staged") ? `dv_${n}_${p}` : null, token(), status, stamp("live"), stamp("verified"),
        ));
      }

      const ev = (ts: string | null, title: string, system = "portal", kind = "milestone", detail: string | null = null) => {
        if (ts) stmts.push(env.DB.prepare("INSERT INTO rollout_events (id, order_id, ts, kind, system, title, detail) VALUES (?,?,?,?,?,?,?)").bind(id("ev"), orderId, ts, kind, system, title, detail));
      };
      ev(new Date(created).toISOString(), "Order received", "portal", "milestone", `Submitted by ${contact} — ${tpl.name} template, ${qty}× ${model.name}`);
      ev(stamp("signed"), "SOW signed", "portal", "milestone", `Signed electronically by ${contact}, Franchise owner.`);
      ev(stamp("ordered"), `Equipment ordered — ScanSource SS${41000000 + n * 2273}`);
      ev(stamp("staged"), `Kit staged — ${qty} phones provisioned and labeled with setup QR codes`);
      ev(stamp("shipped"), `Shipped — UPS ${tracking}`);
      ev(stamp("delivered"), "Delivered — left at front counter");
      ev(stamp("live"), "Phones live — all devices registered");
      ev(stamp("verified"), "Verified — every phone passed its test call", "ops");

      if (stage === "shipped" && k < 2) {
        ev(new Date(Date.now() - 5 * 3600000).toISOString(), "Delivery exception", "carrier", "alert", "Delivery attempted — business closed. Will retry next business day.");
      }
      if (stage === "live" && k < 2) {
        stmts.push(env.DB.prepare("INSERT INTO rollout_support (id, order_id, ts, category, message, status) VALUES (?,?,?,?,?, 'open')").bind(
          id("sr"), orderId, new Date(Date.now() - (k + 1) * 7200000).toISOString(),
          k === 0 ? "No dial tone" : "Can't hear caller",
          k === 0 ? "Back office phone shows the extension but calls drop right away." : "Callers say we sound muffled on the counter phone.",
        ));
      }
      if (stage === "submitted" && k < 2) {
        // Leave a couple of SOWs unsigned for a while so the "awaiting signature" nudge shows.
        stmts.push(env.DB.prepare("UPDATE rollout_orders SET created_at = ? WHERE id = ?").bind(new Date(Date.now() - (4 + k) * DAY).toISOString(), orderId));
      }
    }
  }

  for (let i = 0; i < stmts.length; i += 80) await env.DB.batch(stmts.slice(i, i + 80));
}
