import { Hono } from "hono";
import type { Bindings, Variables } from "../types";
import { requireRole } from "../middleware/requireRole";

// Client Success module, Phase 1 ("Renewal core") cross-customer views — My
// Book, Renewal Pipeline, Action Queue. Per-customer CRUD (platforms,
// renewals, engagements) lives in routes/customers.ts; this file is purely
// aggregation across customers, same split as dashboard.ts vs. projects.ts.

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const DAY_MS = 24 * 60 * 60 * 1000;
const daysUntil = (iso: string | null, from: number): number | null =>
  iso ? Math.round((Date.parse(iso) - from) / DAY_MS) : null;

type PlatformRenewalRow = {
  customer_id: string;
  platform_id: string;
  vendor: string;
  product: string;
  contract_end_date: string | null;
  arr: number | null;
  renewal_id: string;
  stage: string;
  forecast: string | null;
  expected_renewal_arr: number | null;
};

/** Every platform joined to its latest renewal row — the one building block
 *  all three views below need. */
async function loadPlatformRenewals(db: D1Database, customerIds?: string[]): Promise<PlatformRenewalRow[]> {
  const scope = customerIds ? `WHERE cp.customer_id IN (${customerIds.map(() => "?").join(",")})` : "";
  const rows = await db
    .prepare(
      `SELECT cp.customer_id, cp.id AS platform_id, cp.vendor, cp.product, cp.contract_end_date, cp.arr,
              r.id AS renewal_id, r.stage, r.forecast, r.expected_renewal_arr
       FROM customer_platforms cp
       JOIN customer_renewals r ON r.id = (
         SELECT id FROM customer_renewals WHERE customer_platform_id = cp.id ORDER BY created_at DESC LIMIT 1
       )
       ${scope}`
    )
    .bind(...(customerIds ?? []))
    .all<PlatformRenewalRow>();
  return rows.results ?? [];
}

// ── My Book ─────────────────────────────────────────────────────────────────────
// GET /api/client-success/my-book?scope=mine|all

app.get("/my-book", requireRole("admin", "pf_csm", "executive"), async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const scope = c.req.query("scope") === "all" ? "all" : "mine";

  let sql = "SELECT id, name, csm_tier, pf_csm_user_id, client_success_specialist_user_id FROM customers WHERE 1=1";
  const bindings: string[] = [];
  if (scope === "mine") {
    sql += " AND (pf_csm_user_id = ? OR client_success_specialist_user_id = ?)";
    bindings.push(auth.user.id, auth.user.id);
  }

  const customers = await db.prepare(sql).bind(...bindings).all<{
    id: string; name: string; csm_tier: string | null; pf_csm_user_id: string | null; client_success_specialist_user_id: string | null;
  }>();
  const rows = customers.results ?? [];
  if (rows.length === 0) return c.json([]);

  const customerIds = rows.map((r) => r.id);
  const [platformRenewals, lastTouches] = await Promise.all([
    loadPlatformRenewals(db, customerIds),
    db.prepare(
      `SELECT customer_id, MAX(engaged_at) AS last_touch FROM customer_engagements
       WHERE customer_id IN (${customerIds.map(() => "?").join(",")}) GROUP BY customer_id`
    ).bind(...customerIds).all<{ customer_id: string; last_touch: string }>(),
  ]);

  const byCustomer = new Map<string, PlatformRenewalRow[]>();
  for (const pr of platformRenewals) {
    if (!byCustomer.has(pr.customer_id)) byCustomer.set(pr.customer_id, []);
    byCustomer.get(pr.customer_id)!.push(pr);
  }
  const lastTouchMap = new Map((lastTouches.results ?? []).map((r) => [r.customer_id, r.last_touch]));
  const now = Date.now();

  const result = rows.map((cust) => {
    const platforms = byCustomer.get(cust.id) ?? [];
    const totalArr = platforms.reduce((sum, p) => sum + (p.arr ?? 0), 0);
    const active = platforms.filter((p) => p.stage !== "renewed" && p.stage !== "lost" && p.contract_end_date);
    const nearest = active.sort((a, b) => Date.parse(a.contract_end_date!) - Date.parse(b.contract_end_date!))[0] ?? null;
    return {
      ...cust,
      total_arr: totalArr,
      last_touch: lastTouchMap.get(cust.id) ?? null,
      next_renewal_date: nearest?.contract_end_date ?? null,
      next_renewal_days: nearest ? daysUntil(nearest.contract_end_date, now) : null,
      next_renewal_stage: nearest?.stage ?? null,
      next_renewal_vendor: nearest?.vendor ?? null,
    };
  });

  result.sort((a, b) => {
    const ad = a.next_renewal_days ?? Infinity;
    const bd = b.next_renewal_days ?? Infinity;
    return ad - bd;
  });

  return c.json(result);
});

// ── Renewal Pipeline ────────────────────────────────────────────────────────────
// GET /api/client-success/renewal-pipeline

app.get("/renewal-pipeline", requireRole("admin", "pf_csm", "executive"), async (c) => {
  const db = c.env.DB;
  const platformRenewals = await loadPlatformRenewals(db);
  if (platformRenewals.length === 0) return c.json({ cards: [], windows: { d30: 0, d60: 0, d90: 0, d120: 0, d180: 0 } });

  const customerIds = [...new Set(platformRenewals.map((p) => p.customer_id))];
  const customers = await db
    .prepare(`SELECT id, name FROM customers WHERE id IN (${customerIds.map(() => "?").join(",")})`)
    .bind(...customerIds)
    .all<{ id: string; name: string }>();
  const nameMap = new Map((customers.results ?? []).map((r) => [r.id, r.name]));

  const now = Date.now();
  const windows = { d30: 0, d60: 0, d90: 0, d120: 0, d180: 0 };
  const cards = platformRenewals.map((p) => {
    const days = daysUntil(p.contract_end_date, now);
    if (p.stage !== "renewed" && p.stage !== "lost" && days !== null) {
      if (days <= 30) windows.d30 += p.arr ?? 0;
      if (days <= 60) windows.d60 += p.arr ?? 0;
      if (days <= 90) windows.d90 += p.arr ?? 0;
      if (days <= 120) windows.d120 += p.arr ?? 0;
      if (days <= 180) windows.d180 += p.arr ?? 0;
    }
    return {
      renewal_id: p.renewal_id,
      platform_id: p.platform_id,
      customer_id: p.customer_id,
      customer_name: nameMap.get(p.customer_id) ?? "",
      vendor: p.vendor,
      product: p.product,
      stage: p.stage,
      forecast: p.forecast,
      arr: p.arr,
      expected_renewal_arr: p.expected_renewal_arr,
      contract_end_date: p.contract_end_date,
      days_to_renewal: days,
    };
  });

  return c.json({ cards, windows });
});

// ── Action Queue ────────────────────────────────────────────────────────────────
// GET /api/client-success/action-queue
// Phase 1 items only: renewals entering the 120-day window, QBRs due, overdue
// follow-ups. "No touch past cadence" / "health drop" need Phase 2's health score.

app.get("/action-queue", requireRole("admin", "pf_csm", "executive"), async (c) => {
  const db = c.env.DB;
  const now = Date.now();

  const [platformRenewals, customersWithQbr, overdueFollowUps] = await Promise.all([
    loadPlatformRenewals(db),
    db.prepare("SELECT id, name, next_qbr_date FROM customers WHERE next_qbr_date IS NOT NULL").all<{
      id: string; name: string; next_qbr_date: string;
    }>(),
    db.prepare(
      `SELECT ce.id, ce.customer_id, c.name AS customer_name, ce.follow_up_due_date, ce.follow_up_owner_user_id, ce.next_steps
       FROM customer_engagements ce
       JOIN customers c ON c.id = ce.customer_id
       WHERE ce.follow_up_due_date IS NOT NULL AND ce.follow_up_done = 0`
    ).all<{ id: string; customer_id: string; customer_name: string; follow_up_due_date: string; follow_up_owner_user_id: string | null; next_steps: string | null }>(),
  ]);

  const customerIds = [...new Set(platformRenewals.map((p) => p.customer_id))];
  const names = customerIds.length
    ? await db.prepare(`SELECT id, name FROM customers WHERE id IN (${customerIds.map(() => "?").join(",")})`).bind(...customerIds).all<{ id: string; name: string }>()
    : { results: [] as { id: string; name: string }[] };
  const nameMap = new Map(names.results.map((r) => [r.id, r.name]));

  const renewalsEntering120 = platformRenewals
    .filter((p) => p.stage !== "renewed" && p.stage !== "lost")
    .map((p) => ({ ...p, days: daysUntil(p.contract_end_date, now) }))
    .filter((p) => p.days !== null && p.days <= 120)
    .map((p) => ({
      type: "renewal" as const,
      customer_id: p.customer_id,
      customer_name: nameMap.get(p.customer_id) ?? "",
      renewal_id: p.renewal_id,
      vendor: p.vendor,
      days_to_renewal: p.days,
      stage: p.stage,
    }));

  const qbrsDue = (customersWithQbr.results ?? [])
    .map((cust) => ({ ...cust, days: daysUntil(cust.next_qbr_date, now) }))
    .filter((cust) => cust.days !== null && cust.days <= 14)
    .map((cust) => ({
      type: "qbr" as const,
      customer_id: cust.id,
      customer_name: cust.name,
      due_date: cust.next_qbr_date,
      days_until: cust.days,
    }));

  const followUps = (overdueFollowUps.results ?? [])
    .map((f) => ({ ...f, days: daysUntil(f.follow_up_due_date, now) }))
    .filter((f) => f.days !== null && f.days <= 0)
    .map((f) => ({
      type: "follow_up" as const,
      customer_id: f.customer_id,
      customer_name: f.customer_name,
      engagement_id: f.id,
      due_date: f.follow_up_due_date,
      days_overdue: f.days !== null ? -f.days : 0,
      owner_user_id: f.follow_up_owner_user_id,
      next_steps: f.next_steps,
    }));

  return c.json({ renewals: renewalsEntering120, qbrs: qbrsDue, follow_ups: followUps });
});

export default app;
