// Zoom Retail Rollout — token links that open without a CloudConnect login:
// the franchisee's order tracker + SOW (/rollout/t/:token) and each phone's QR
// setup page (/rollout/s/:token). Mounted before authMiddleware. Tokens are
// 96-bit random, so these are capability links.
import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import type { Order, Phone } from "../../shared/rollout/types";
import { getOrder, getPhones, id, logEvent, now } from "../rollout/db";
import { registerPhone, signOrder, verifyPhone } from "../rollout/lifecycle";
import { orderDetail } from "./rollout";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const tokenOrder = (env: Bindings, t: string) => env.DB.prepare("SELECT * FROM rollout_orders WHERE access_token = ?").bind(t).first<Order>();

app.get("/track/:token", async (c) => {
  const o = await tokenOrder(c.env, c.req.param("token"));
  if (!o) return c.json({ error: "Not found" }, 404);
  const d = await orderDetail(c.env, o);
  // The store sees milestones, not vendor payloads.
  return c.json({ ...d, events: d.events.filter((e) => e.kind === "milestone").map((e) => ({ ...e, request_json: null, response_json: null })) });
});

app.post("/track/:token/sign", async (c) => {
  const o = await tokenOrder(c.env, c.req.param("token"));
  if (!o) return c.json({ error: "Not found" }, 404);
  const { name, title, agree } = await c.req.json<{ name: string; title: string; agree: boolean }>();
  if (!agree || !name?.trim()) return c.json({ error: "Name and agreement are required" }, 400);
  await signOrder(c.env, o.id, name.trim().slice(0, 120), (title ?? "").trim().slice(0, 80));
  return c.json({ ok: true });
});

async function setupContext(env: Bindings, t: string) {
  const phone = await env.DB.prepare("SELECT * FROM rollout_phones WHERE setup_token = ?").bind(t).first<Phone>();
  if (!phone) return null;
  return { phone, order: (await getOrder(env, phone.order_id))! };
}

app.get("/setup/:token", async (c) => {
  const ctx = await setupContext(c.env, c.req.param("token"));
  if (!ctx) return c.json({ error: "Not found" }, 404);
  const phones = await getPhones(c.env, ctx.order.id);
  const { order: o } = ctx;
  return c.json({
    phone: ctx.phone,
    siblings: phones.map((p) => ({ label: p.label, extension: p.extension, status: p.status })),
    order: { store_name: o.store_name, store_number: o.store_number, model_id: o.model_id, has_poe: o.has_poe, main_number: o.main_number, template_id: o.template_id, stage: o.stage, contact_name: o.contact_name },
  });
});

app.post("/setup/:token/:action", async (c) => {
  const ctx = await setupContext(c.env, c.req.param("token"));
  if (!ctx) return c.json({ error: "Not found" }, 404);
  const action = c.req.param("action");
  const { order, phone } = ctx;
  if (!["shipped", "delivered", "live", "verified"].includes(order.stage)) return c.json({ error: "This phone hasn't shipped yet." }, 400);
  if (action === "registered") await registerPhone(c.env, order, phone, "store");
  else if (action === "verified") await verifyPhone(c.env, order, phone);
  else if (action === "help") {
    const { category, message } = await c.req.json<{ category: string; message: string }>();
    await c.env.DB.prepare("INSERT INTO rollout_support (id, order_id, phone_id, ts, category, message) VALUES (?,?,?,?,?,?)")
      .bind(id("sr"), order.id, phone.id, now(), (category || "Other").slice(0, 60), (message || "").slice(0, 1000)).run();
    await logEvent(c.env, order.id, { kind: "alert", system: "store", title: `Support request from QR scan — ${phone.label}`, detail: `${category}: ${message}` });
  } else return c.json({ error: "Unknown action" }, 400);
  return c.json({ ok: true });
});

export default app;
