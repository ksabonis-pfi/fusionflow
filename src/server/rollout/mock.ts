// Dummy vendor APIs. These stand in for ScanSource, Zoom Phone and the parcel
// carrier until we have real credentials/agreements. Response shapes are
// modelled on the real APIs closely enough that the adapters in
// ../integrations.ts only need a base URL + auth swap to go live.
//
// Stateless on purpose: anything a later call needs (serials, MACs) is derived
// deterministically from the IDs handed back earlier.

import { Hono } from "hono";

const mock = new Hono();

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const digits = (seed: string, n: number) => String(hash(seed)).padStart(10, "7").slice(0, n);
const hex = (seed: string, n: number) => hash(seed).toString(16).padStart(8, "0").toUpperCase().slice(0, n);
const daysFromNow = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

// ── ScanSource (distribution order) ─────────────────────────────────────────

mock.post("/scansource/v1/orders", async (c) => {
  const body = await c.req.json<{ customerPO: string; lines: { itemNumber: string; quantity: number }[] }>();
  const orderNumber = `SS${digits(body.customerPO, 8)}`;
  return c.json({
    orderNumber,
    customerPO: body.customerPO,
    status: "Accepted",
    shipToWarehouse: "Packet Fusion Kitting — Pleasanton, CA",
    estimatedShipDate: daysFromNow(2),
    lines: body.lines.map((l, i) => ({ lineNumber: i + 1, itemNumber: l.itemNumber, quantity: l.quantity, status: "Allocated" })),
  }, 201);
});

mock.get("/scansource/v1/orders/:orderNumber", (c) => {
  const n = c.req.param("orderNumber");
  const qty = Number(c.req.query("qty") ?? 2);
  return c.json({
    orderNumber: n,
    status: "Delivered",
    shipments: [{
      carrier: "UPS",
      trackingNumber: `1Z9F${hex(n + "in", 6)}03${digits(n, 8)}`,
      deliveredTo: "Packet Fusion Kitting — Pleasanton, CA",
      deliveredDate: daysFromNow(0),
      serials: Array.from({ length: qty }, (_, i) => ({
        serialNumber: `8${digits(n + i, 9)}`,
        macAddress: `80:5E:C0:${hex(n + "m" + i, 6).match(/../g)!.join(":")}`,
      })),
    }],
  });
});

// ── Zoom Phone ──────────────────────────────────────────────────────────────

mock.post("/zoom/v2/phone/sites", async (c) => {
  const b = await c.req.json<{ name: string; site_code: string }>();
  return c.json({ id: `zs_${hex(b.name, 8).toLowerCase()}`, name: b.name, site_code: b.site_code }, 201);
});

mock.post("/zoom/v2/phone/numbers/assign", async (c) => {
  const b = await c.req.json<{ site_id: string; area_code: string; port_number?: string }>();
  const number = b.port_number ?? `+1${b.area_code}555${digits(b.site_id, 4)}`;
  return c.json({ phone_number: number, status: b.port_number ? "port_pending" : "assigned", site_id: b.site_id }, 201);
});

mock.post("/zoom/v2/phone/common_areas", async (c) => {
  const b = await c.req.json<{ site_id: string; display_name: string; extension_number: string }>();
  return c.json({
    id: `ca_${hex(b.site_id + b.extension_number, 8).toLowerCase()}`,
    display_name: b.display_name,
    extension_number: b.extension_number,
    calling_plans: [{ type: 200, name: "Zoom Phone Common Area" }],
  }, 201);
});

mock.post("/zoom/v2/phone/devices", async (c) => {
  const b = await c.req.json<{ mac_address: string; model: string; assigned_to: string }>();
  return c.json({ id: `dv_${hex(b.mac_address, 8).toLowerCase()}`, mac_address: b.mac_address, model: b.model, status: "offline", provision_template: "pf-franchise-v1" }, 201);
});

mock.get("/zoom/v2/phone/devices/:id", (c) =>
  c.json({ id: c.req.param("id"), status: "online", last_online: new Date().toISOString(), firmware: "96.86.0.75" }),
);

mock.post("/zoom/v2/phone/call_flows", async (c) => {
  const b = await c.req.json<{ site_id: string; type: string }>();
  return c.json({ id: `cf_${hex(b.site_id + b.type, 8).toLowerCase()}`, type: b.type, status: "active" }, 201);
});

// ── Carrier (outbound kit to the store) ─────────────────────────────────────

mock.post("/carrier/v1/shipments", async (c) => {
  const b = await c.req.json<{ reference: string; service: string }>();
  return c.json({
    trackingNumber: `1Z9F${hex(b.reference, 6)}01${digits(b.reference, 8)}`,
    service: b.service,
    estimatedDelivery: daysFromNow(2),
    label: "https://example.invalid/label.pdf",
  }, 201);
});

mock.get("/carrier/v1/track/:trackingNumber", (c) => {
  const t = c.req.param("trackingNumber");
  const exception = hash(t) % 9 === 0;
  return c.json({
    trackingNumber: t,
    status: exception ? "Exception" : "Delivered",
    statusDetail: exception ? "Delivery attempted — business closed. Will retry next business day." : "Delivered, left at front counter",
    signedBy: exception ? null : "COUNTER",
    activity: [
      { status: "Label created", date: daysFromNow(-2) },
      { status: "Departed facility", date: daysFromNow(-1) },
      { status: exception ? "Delivery attempted" : "Delivered", date: daysFromNow(0) },
    ],
  });
});

export default mock;
