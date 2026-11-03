// Order lifecycle engine. Each transition does the vendor work for the stage
// it moves INTO, then records a milestone. Autopilot (demo) walks an order
// forward on a timer up to "delivered"; the last two steps — phones live and
// verified — are driven by the store contact scanning the QR codes, or forced
// from the ops console.

import { buildQuote, getModel, getTemplate, PROGRAM, STATE_REGION, type Stage } from "../../shared/rollout/program";
import type { NewOrderInput, Order, Phone } from "../../shared/rollout/types";
import { getEvents, getOrder, getPhones, id, logEvent, now, token, updateOrder, updatePhone } from "./db";
import { callVendor, rolloutVar } from "./integrations";
import type { Bindings } from "../types";

const AUTOPILOT_STOPS_AT: Stage = "delivered";

export const stepMs = (env: Bindings) => Number(rolloutVar(env, "ROLLOUT_STEP_SECONDS") ?? 20) * 1000;
const nextAt = (env: Bindings) => new Date(Date.now() + stepMs(env)).toISOString();

export function phoneLabel(seq: number): string {
  return ["Front counter 1", "Front counter 2", "Back office", "Owner's office"][seq - 1] ?? `Counter ${seq - 1}`;
}

export async function createOrder(env: Bindings, input: NewOrderInput): Promise<Order> {
  const t = getTemplate(input.template_id);
  const m = getModel(input.model_id);
  if (!t || !m) throw new Error("Unknown template or model");
  const qty = Math.min(Math.max(input.phone_qty, t.phones), t.maxPhones);
  const quote = buildQuote(t.id, m.id, qty, input.has_poe);

  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM rollout_orders").first<{ n: number }>();
  const seq = String(10200 + (count?.n ?? 0) + 1);
  const orderId = id("ord");
  const ts = now();
  const order_number = `PF-${PROGRAM.code}-${seq}`;
  const sow_number = `SOW-${PROGRAM.code}-${t.sowCode}-${seq}`;

  await env.DB.prepare(
    `INSERT INTO rollout_orders (id, order_number, sow_number, access_token, stage, wave, region, store_number, store_name,
      address1, address2, city, state, zip, timezone, contact_name, contact_title, contact_email, contact_phone, submitted_by,
      template_id, model_id, phone_qty, has_poe, number_option, port_number, port_carrier, notes, one_time_total, monthly_total,
      created_at, updated_at)
     VALUES (?,?,?,?, 'submitted', 'Wave 3', ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    orderId, order_number, sow_number, token(), STATE_REGION[input.state.toUpperCase()] ?? "Central",
    input.store_number, input.store_name, input.address1, input.address2 || null, input.city, input.state.toUpperCase(), input.zip,
    input.timezone, input.contact_name, input.contact_title || null, input.contact_email, input.contact_phone, input.submitted_by,
    t.id, m.id, qty, input.has_poe ? 1 : 0, input.number_option, input.port_number || null, input.port_carrier || null,
    input.notes || null, quote.oneTime, quote.monthly, ts, ts,
  ).run();

  await env.DB.batch(
    Array.from({ length: qty }, (_, i) =>
      env.DB.prepare("INSERT INTO rollout_phones (id, order_id, seq, label, model_id, setup_token) VALUES (?,?,?,?,?,?)")
        .bind(id("ph"), orderId, i + 1, phoneLabel(i + 1), m.id, token()),
    ),
  );
  await logEvent(env, orderId, { kind: "milestone", system: "portal", title: "Order received", detail: `Submitted by ${input.submitted_by} — ${t.name} template, ${qty}× ${m.name}` });
  await logEvent(env, orderId, { kind: "note", system: "portal", title: `${sow_number} generated`, detail: "Canned scope and fixed price applied. Sent for signature." });
  return (await getOrder(env, orderId))!;
}

export async function signOrder(env: Bindings, orderId: string, name: string, title: string) {
  const o = await getOrder(env, orderId);
  if (!o) throw new Error("Order not found");
  if (o.stage !== "submitted") return o;
  await updateOrder(env, orderId, { stage: "signed", signed_name: name, signed_title: title, signed_at: now(), autopilot: 1, next_step_at: nextAt(env) });
  await logEvent(env, orderId, { kind: "milestone", system: "portal", title: "SOW signed", detail: `Signed electronically by ${name}${title ? `, ${title}` : ""}. Store queued for deployment.` });
  return (await getOrder(env, orderId))!;
}

/** Move an order one stage forward. Returns the updated order. */
export async function advance(env: Bindings, orderId: string): Promise<Order> {
  const o = await getOrder(env, orderId);
  if (!o) throw new Error("Order not found");
  const phones = await getPhones(env, orderId);
  const t = getTemplate(o.template_id)!;
  const m = getModel(o.model_id)!;

  switch (o.stage) {
    case "submitted":
      throw new Error("Waiting on the franchisee's SOW signature");

    case "signed": {
      const so = await callVendor<{ orderNumber: string; estimatedShipDate: string }>(env, o.id, "scansource", "POST", "/v1/orders", "Purchase order submitted to ScanSource", {
        customerPO: o.order_number,
        shipTo: "PACKET FUSION KITTING",
        endUser: `${o.store_name} #${o.store_number}`,
        lines: [
          { itemNumber: m.scansourceSku, quantity: o.phone_qty },
          ...(o.has_poe ? [] : [{ itemNumber: "YEA-PS5V2000US", quantity: o.phone_qty }]),
        ],
      });
      await logEvent(env, o.id, { kind: "note", system: "zoom", title: `${o.phone_qty} Zoom Phone Common Area licenses reserved`, detail: "Held against the program license pool until devices register." });
      await finish(env, o, "ordered", { scansource_order: so.orderNumber }, `Equipment ordered — ScanSource ${so.orderNumber}, est. ship ${so.estimatedShipDate}`);
      break;
    }

    case "ordered": {
      const inbound = await callVendor<{ shipments: { serials: { serialNumber: string; macAddress: string }[] }[] }>(
        env, o.id, "scansource", "GET", `/v1/orders/${o.scansource_order}?qty=${o.phone_qty}`, "ScanSource order status — received at kitting");
      const serials = inbound.shipments[0]?.serials ?? [];

      const site = await callVendor<{ id: string }>(env, o.id, "zoom", "POST", "/v2/phone/sites", "Zoom Phone site created", {
        name: `${o.store_name} #${o.store_number}`, site_code: o.store_number, address: { line1: o.address1, city: o.city, state: o.state, zip: o.zip },
      });
      const areaCode = o.contact_phone.replace(/\D/g, "").replace(/^1/, "").slice(0, 3) || "925";
      const num = await callVendor<{ phone_number: string }>(env, o.id, "zoom", "POST", "/v2/phone/numbers/assign", o.number_option === "port" ? "Port request filed for main number" : "Main number assigned", {
        site_id: site.id, area_code: areaCode, ...(o.number_option === "port" && o.port_number ? { port_number: o.port_number } : {}),
      });

      for (const [i, p] of phones.entries()) {
        const ext = String(100 + p.seq);
        const ca = await callVendor<{ id: string }>(env, o.id, "zoom", "POST", "/v2/phone/common_areas", `Common area phone "${p.label}" — ext ${ext}`, {
          site_id: site.id, display_name: `${o.store_number} ${p.label}`, extension_number: ext,
        });
        const s = serials[i] ?? { serialNumber: "", macAddress: "" };
        const dev = await callVendor<{ id: string }>(env, o.id, "zoom", "POST", "/v2/phone/devices", `Device ${s.macAddress} assigned to ext ${ext}`, {
          mac_address: s.macAddress, model: m.mfrPart, assigned_to: ca.id,
        });
        await updatePhone(env, p.id, { extension: ext, mac: s.macAddress, serial: s.serialNumber, zoom_device_id: dev.id, status: "provisioned" });
      }
      await callVendor(env, o.id, "zoom", "POST", "/v2/phone/call_flows", `${t.name} call flow built`, { site_id: site.id, type: t.id, description: t.callFlow });
      await finish(env, o, "staged", { zoom_site_id: site.id, main_number: num.phone_number }, `Kit staged — ${o.phone_qty} phones provisioned and labeled with setup QR codes`);
      break;
    }

    case "staged": {
      const sh = await callVendor<{ trackingNumber: string; estimatedDelivery: string }>(env, o.id, "carrier", "POST", "/v1/shipments", "Outbound shipment created", {
        reference: o.order_number, service: "Ground", shipTo: { name: o.contact_name, company: `${o.store_name} #${o.store_number}`, line1: o.address1, city: o.city, state: o.state, zip: o.zip },
      });
      await finish(env, o, "shipped", { carrier: "UPS", tracking_number: sh.trackingNumber, eta: sh.estimatedDelivery, shipped_at: now() }, `Shipped — UPS ${sh.trackingNumber}`);
      await logEvent(env, o.id, { kind: "note", system: "portal", title: `Setup instructions emailed to ${o.contact_name}`, detail: `${o.contact_email} — tracking link, what's in the box, and how to scan the QR codes.` });
      break;
    }

    case "shipped": {
      const priorException = (await getEvents(env, o.id)).some((e) => e.kind === "alert" && e.system === "carrier");
      const tr = await callVendor<{ status: string; statusDetail: string }>(env, o.id, "carrier", "GET",
        `/v1/track/${priorException ? o.tracking_number + "R" : o.tracking_number}`, "Tracking status checked");
      if (tr.status === "Exception") {
        await logEvent(env, o.id, { kind: "alert", system: "carrier", title: "Delivery exception", detail: tr.statusDetail });
        await updateOrder(env, o.id, { next_step_at: o.autopilot ? nextAt(env) : null });
        break;
      }
      await finish(env, o, "delivered", { delivered_at: now() }, `Delivered — ${tr.statusDetail}`);
      break;
    }

    case "delivered":
      for (const p of phones) if (p.status !== "registered" && p.status !== "verified") await registerPhone(env, o, p, "ops");
      break;

    case "live":
      for (const p of phones) if (p.status !== "verified") await updatePhone(env, p.id, { status: "verified", verified_at: now() });
      await finish(env, o, "verified", { verified_at: now() }, "Verified — remote validation signed off by Packet Fusion");
      break;

    case "verified":
      break;
  }
  return (await getOrder(env, orderId))!;
}

async function finish(env: Bindings, o: Order, stage: Stage, fields: Partial<Order>, title: string) {
  const keepGoing = o.autopilot === 1 && stage !== AUTOPILOT_STOPS_AT && stage !== "verified" && stage !== "live";
  await updateOrder(env, o.id, { ...fields, stage, next_step_at: keepGoing ? nextAt(env) : null });
  await logEvent(env, o.id, { kind: "milestone", system: stage === "verified" ? "ops" : "portal", title, detail: null });
}

/** Store contact plugged a phone in (or ops forced it): confirm with Zoom it's online. */
export async function registerPhone(env: Bindings, o: Order, p: Phone, by: "store" | "ops") {
  if (o.stage === "shipped") await finish(env, o, "delivered", { delivered_at: now() }, "Delivered — confirmed by store contact");
  if (p.zoom_device_id) {
    await callVendor(env, o.id, "zoom", "GET", `/v2/phone/devices/${p.zoom_device_id}`, `Device registration check — ext ${p.extension}`);
  }
  await updatePhone(env, p.id, { status: "registered", registered_at: now() });
  await logEvent(env, o.id, { kind: "note", system: by, title: `${p.label} (ext ${p.extension}) registered with Zoom`, detail: by === "store" ? "Reported via QR setup page" : null });
  const phones = await getPhones(env, o.id);
  const fresh = (await getOrder(env, o.id))!;
  if (phones.every((x) => x.status === "registered" || x.status === "verified") && (fresh.stage === "delivered" || fresh.stage === "shipped")) {
    await finish(env, fresh, "live", { live_at: now() }, "Phones live — all devices registered");
  }
}

/** Store contact confirmed a test call on a phone. */
export async function verifyPhone(env: Bindings, o: Order, p: Phone) {
  if (p.status !== "registered" && p.status !== "verified") await registerPhone(env, o, p, "store");
  await updatePhone(env, p.id, { status: "verified", verified_at: now() });
  await logEvent(env, o.id, { kind: "note", system: "store", title: `Test call passed on ${p.label} (ext ${p.extension})`, detail: null });
  const phones = await getPhones(env, o.id);
  const fresh = (await getOrder(env, o.id))!;
  if (phones.every((x) => x.status === "verified") && fresh.stage === "live") {
    await finish(env, fresh, "verified", { verified_at: now() }, "Verified — every phone passed its test call");
  }
}

/** Run any autopilot steps that are due. Called lazily on reads, so no cron is needed. */
export async function catchUp(env: Bindings, o: Order): Promise<Order> {
  let cur = o;
  for (let i = 0; i < 3 && cur.autopilot && cur.next_step_at && cur.next_step_at <= now(); i++) {
    // Claim the step so two overlapping polls can't both run it.
    const claim = await env.DB.prepare("UPDATE rollout_orders SET next_step_at = NULL WHERE id = ? AND next_step_at = ?").bind(cur.id, cur.next_step_at).run();
    if (!claim.meta.changes) return (await getOrder(env, cur.id))!;
    try {
      cur = await advance(env, cur.id);
    } catch (e) {
      await logEvent(env, cur.id, { kind: "alert", system: "ops", title: "Autopilot step failed", detail: String(e) });
      return (await getOrder(env, cur.id))!;
    }
  }
  return cur;
}
