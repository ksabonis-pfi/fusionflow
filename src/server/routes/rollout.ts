// Zoom Retail Rollout — franchise Zoom Phone ordering + deployment tracking
// (demo). Store-facing token pages live in rolloutPublic.ts; everything here
// is the internal side: order queue, lifecycle controls, program dashboard.
import { Hono } from "hono";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import type { Alert, Order, OrderDetail } from "../../shared/rollout/types";
import { getEvents, getOrder, getPhones, getSupport, logEvent, now, updateOrder } from "../rollout/db";
import { advance, catchUp, createOrder, stepMs } from "../rollout/lifecycle";
import { resetAndSeed } from "../rollout/seed";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Hidden module: explicit per-user flag only, never implied by admin
// (migration 0164). Checked against D1 rather than the cached session so a
// revoke takes effect immediately, same as Sales Operations.
app.use("*", async (c, next) => {
  const auth = c.get("auth");
  if (!auth?.user) return c.json({ error: "Unauthorized" }, 401);
  const row = await c.env.DB
    .prepare("SELECT is_rollout FROM users WHERE id = ? AND is_active = 1 LIMIT 1")
    .bind(auth.user.id)
    .first<{ is_rollout: number }>();
  if (!row || row.is_rollout !== 1) return c.json({ error: "Forbidden" }, 403);
  await next();
});

export async function ensureSeeded(env: Bindings) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM rollout_orders").first<{ n: number }>();
  if (!row?.n) await resetAndSeed(env);
}

export async function orderDetail(env: Bindings, o: Order): Promise<OrderDetail> {
  const order = await catchUp(env, o);
  const [phones, events, support] = await Promise.all([getPhones(env, order.id), getEvents(env, order.id), getSupport(env, order.id)]);
  return { order, phones, events, support };
}

app.get("/orders", async (c) => {
  await ensureSeeded(c.env);
  const due = await c.env.DB.prepare("SELECT * FROM rollout_orders WHERE autopilot = 1 AND next_step_at <= ?").bind(now()).all<Order>();
  for (const o of due.results) await catchUp(c.env, o);
  const r = await c.env.DB.prepare("SELECT * FROM rollout_orders ORDER BY created_at DESC").all<Order>();
  return c.json({ orders: r.results });
});

const NewOrder = z.object({
  store_number: z.string().min(1).max(12),
  store_name: z.string().min(1).max(120),
  address1: z.string().min(1).max(200),
  address2: z.string().max(200).optional(),
  city: z.string().min(1).max(80),
  state: z.string().length(2),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/),
  timezone: z.string().min(1),
  contact_name: z.string().min(1).max(120),
  contact_title: z.string().max(80).optional(),
  contact_email: z.email(),
  contact_phone: z.string().min(7).max(30),
  submitted_by: z.string().min(1).max(120),
  template_id: z.string(),
  model_id: z.string(),
  phone_qty: z.number().int().min(1).max(12),
  has_poe: z.boolean(),
  number_option: z.enum(["new", "port"]),
  port_number: z.string().max(30).optional(),
  port_carrier: z.string().max(80).optional(),
  notes: z.string().max(2000).optional(),
});

app.post("/orders", async (c) => {
  const parsed = NewOrder.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid order", issues: parsed.error.issues }, 400);
  try {
    return c.json({ order: await createOrder(c.env, parsed.data) });
  } catch (e) {
    return c.json({ error: String(e instanceof Error ? e.message : e) }, 400);
  }
});

app.get("/orders/:id", async (c) => {
  const o = await getOrder(c.env, c.req.param("id"));
  if (!o) return c.json({ error: "Not found" }, 404);
  return c.json(await orderDetail(c.env, o));
});

app.post("/orders/:id/advance", async (c) => {
  try {
    const cur = await getOrder(c.env, c.req.param("id"));
    if (cur && cur.stage !== "submitted" && cur.stage !== "verified") {
      await logEvent(c.env, cur.id, { kind: "note", system: "ops", title: `Step advanced manually by ${c.get("auth").user.name ?? c.get("auth").user.email}` });
    }
    const o = await advance(c.env, c.req.param("id"));
    return c.json(await orderDetail(c.env, o));
  } catch (e) {
    return c.json({ error: String(e instanceof Error ? e.message : e) }, 400);
  }
});

app.post("/orders/:id/autopilot", async (c) => {
  const { on } = await c.req.json<{ on: boolean }>();
  await updateOrder(c.env, c.req.param("id"), { autopilot: on ? 1 : 0, next_step_at: on ? new Date(Date.now() + stepMs(c.env)).toISOString() : null });
  const o = await getOrder(c.env, c.req.param("id"));
  return o ? c.json(await orderDetail(c.env, o)) : c.json({ error: "Not found" }, 404);
});

app.post("/support/:id/resolve", async (c) => {
  await c.env.DB.prepare("UPDATE rollout_support SET status = 'resolved' WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

app.post("/demo/reset", async (c) => {
  await resetAndSeed(c.env);
  return c.json({ ok: true });
});

app.get("/program", async (c) => {
  await ensureSeeded(c.env);
  const orders = (await c.env.DB.prepare("SELECT * FROM rollout_orders").all<Order>()).results;
  const phones = await c.env.DB.prepare("SELECT status, COUNT(*) AS n FROM rollout_phones GROUP BY status").all<{ status: string; n: number }>();
  const carrierAlerts = await c.env.DB.prepare(
    `SELECT e.order_id, e.ts, e.detail FROM rollout_events e JOIN rollout_orders o ON o.id = e.order_id
     WHERE e.kind = 'alert' AND e.system = 'carrier' AND o.stage = 'shipped'`,
  ).all<{ order_id: string; ts: string; detail: string }>();
  const support = await c.env.DB.prepare("SELECT * FROM rollout_support WHERE status = 'open'").all<{ id: string; order_id: string; ts: string; category: string; message: string }>();

  const byId = new Map(orders.map((o) => [o.id, o]));
  const alerts: Alert[] = [];
  const base = (o: Order) => ({ order_id: o.id, order_number: o.order_number, store: o.store_name, region: o.region });
  const DAY = 86400000;
  for (const o of orders) {
    if (o.stage === "delivered" && o.delivered_at && Date.now() - Date.parse(o.delivered_at) > DAY) {
      alerts.push({ ...base(o), kind: "not_registered", message: "Devices not registered within 24 hrs of delivery", ts: o.delivered_at });
    }
    if (o.stage === "submitted" && Date.now() - Date.parse(o.created_at) > 3 * DAY) {
      alerts.push({ ...base(o), kind: "unsigned", message: "SOW unsigned for 3+ days", ts: o.created_at });
    }
  }
  for (const a of carrierAlerts.results) {
    const o = byId.get(a.order_id);
    if (o) alerts.push({ ...base(o), kind: "carrier_exception", message: a.detail, ts: a.ts });
  }
  for (const s of support.results) {
    const o = byId.get(s.order_id);
    if (o) alerts.push({ ...base(o), kind: "support_request", message: `${s.category}: ${s.message}`, ts: s.ts });
  }
  alerts.sort((a, b) => b.ts.localeCompare(a.ts));

  const liveLast14d = orders.filter((o) => o.live_at && Date.now() - Date.parse(o.live_at) < 14 * DAY).length;
  return c.json({ orders, phoneStatus: Object.fromEntries(phones.results.map((r) => [r.status, r.n])), alerts, liveLast14d });
});

export default app;
