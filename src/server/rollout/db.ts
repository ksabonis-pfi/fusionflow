import type { Bindings } from "../types";
import type { Order, OrderEvent, Phone, SupportRequest } from "../../shared/rollout/types";

export const now = () => new Date().toISOString();

export function id(prefix: string): string {
  const b = crypto.getRandomValues(new Uint8Array(9));
  return prefix + "_" + Array.from(b, (x) => x.toString(36).padStart(2, "0")).join("").slice(0, 14);
}

export function token(): string {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function getOrder(env: Bindings, orderId: string) {
  return env.DB.prepare("SELECT * FROM rollout_orders WHERE id = ?").bind(orderId).first<Order>();
}

export async function getPhones(env: Bindings, orderId: string) {
  const r = await env.DB.prepare("SELECT * FROM rollout_phones WHERE order_id = ? ORDER BY seq").bind(orderId).all<Phone>();
  return r.results;
}

export async function getEvents(env: Bindings, orderId: string) {
  const r = await env.DB.prepare("SELECT * FROM rollout_events WHERE order_id = ? ORDER BY ts, rowid").bind(orderId).all<OrderEvent>();
  return r.results;
}

export async function getSupport(env: Bindings, orderId: string) {
  const r = await env.DB.prepare("SELECT * FROM rollout_support WHERE order_id = ? ORDER BY ts DESC").bind(orderId).all<SupportRequest>();
  return r.results;
}

export async function updateOrder(env: Bindings, orderId: string, fields: Partial<Order>) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  await env.DB
    .prepare(`UPDATE rollout_orders SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`)
    .bind(...keys.map((k) => (fields as Record<string, unknown>)[k] ?? null), now(), orderId)
    .run();
}

export async function updatePhone(env: Bindings, phoneId: string, fields: Partial<Phone>) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  await env.DB
    .prepare(`UPDATE rollout_phones SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
    .bind(...keys.map((k) => (fields as Record<string, unknown>)[k] ?? null), phoneId)
    .run();
}

export async function logEvent(
  env: Bindings,
  orderId: string,
  e: Pick<OrderEvent, "kind" | "system" | "title"> & Partial<Pick<OrderEvent, "detail" | "request_json" | "response_json" | "ts">>,
) {
  await env.DB
    .prepare("INSERT INTO rollout_events (id, order_id, ts, kind, system, title, detail, request_json, response_json) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(id("ev"), orderId, e.ts ?? now(), e.kind, e.system, e.title, e.detail ?? null, e.request_json ?? null, e.response_json ?? null)
    .run();
}
