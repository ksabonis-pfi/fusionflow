import { Hono } from "hono";
import { z } from "zod";
import type { Bindings, Variables } from "../types";
import { DISTRIBUTORS, type DistributorOffer, type QuoteSummary } from "../services/distributors";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Exposes our distributor cost pricing, so admins do NOT get it implicitly —
// only the explicit per-user flag (migration 0153). Checked against D1 rather
// than the cached session (same as My Time) so a revoke cuts off cost data
// immediately instead of when the session expires. The nav item still follows
// the session, so a new grant shows up at next login.
app.use("*", async (c, next) => {
  const auth = c.get("auth");
  if (!auth?.user) return c.json({ error: "Unauthorized" }, 401);
  const row = await c.env.DB
    .prepare("SELECT is_sales_ops FROM users WHERE id = ? AND is_active = 1 LIMIT 1")
    .bind(auth.user.id)
    .first<{ is_sales_ops: number }>();
  if (!row || row.is_sales_ops !== 1) return c.json({ error: "Forbidden" }, 403);
  await next();
});

app.get("/distributors", (c) => {
  return c.json(DISTRIBUTORS.map((d) => ({ id: d.id, name: d.name, configured: d.isConfigured(c.env) })));
});

const lookupSchema = z.object({
  query: z.string().trim().min(2).max(100),
  includeServices: z.boolean().optional(),
});

type DistributorResult = {
  id: string;
  name: string;
  status: "ok" | "error" | "not_configured";
  error?: string;
  offers: DistributorOffer[];
  truncated: boolean;
};

/** Price + stock for a part number or keyword across every distributor.
 *  Each distributor runs independently: one being down or unconfigured shows
 *  as that column's status rather than failing the whole comparison. */
app.post("/lookup", async (c) => {
  const parsed = lookupSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Enter a part number or keyword (2-100 characters)" }, 400);
  const { query, includeServices = false } = parsed.data;

  const distributors = await Promise.all(DISTRIBUTORS.map(async (d): Promise<DistributorResult> => {
    if (!d.isConfigured(c.env)) return { id: d.id, name: d.name, status: "not_configured", offers: [], truncated: false };
    try {
      const { offers, truncated } = await d.lookup(c.env, query, { includeServices, limit: 25 });
      return { id: d.id, name: d.name, status: "ok", offers, truncated };
    } catch (err) {
      console.error(`[sales-ops] ${d.id} lookup failed`, err);
      return { id: d.id, name: d.name, status: "error", error: "Lookup failed — try again shortly", offers: [], truncated: false };
    }
  }));

  return c.json({ query, distributors });
});

type QuoteListResult = {
  id: string;
  name: string;
  status: "ok" | "error" | "not_configured";
  error?: string;
  quotes: QuoteSummary[];
};

/** Every quote from every distributor that exposes them. Filtering (open /
 *  expired) and search happen client-side; lists are a few hundred at most. */
app.get("/quotes", async (c) => {
  const quoting = DISTRIBUTORS.filter((d) => d.listQuotes);
  const distributors = await Promise.all(quoting.map(async (d): Promise<QuoteListResult> => {
    if (!d.isConfigured(c.env)) return { id: d.id, name: d.name, status: "not_configured", quotes: [] };
    try {
      return { id: d.id, name: d.name, status: "ok", quotes: await d.listQuotes!(c.env) };
    } catch (err) {
      console.error(`[sales-ops] ${d.id} quote list failed`, err);
      return { id: d.id, name: d.name, status: "error", error: "Couldn't load quotes — try again shortly", quotes: [] };
    }
  }));
  return c.json({ distributors });
});

app.get("/quotes/:distributor/:quoteNumber", async (c) => {
  const d = DISTRIBUTORS.find((x) => x.id === c.req.param("distributor"));
  const quoteNumber = c.req.param("quoteNumber");
  if (!d?.getQuote || !/^[A-Za-z0-9-]{1,40}$/.test(quoteNumber)) return c.json({ error: "Quote not found" }, 404);
  if (!d.isConfigured(c.env)) return c.json({ error: `${d.name} isn't connected` }, 503);
  try {
    const quote = await d.getQuote(c.env, quoteNumber);
    if (!quote) return c.json({ error: "Quote not found" }, 404);
    return c.json({ distributor: { id: d.id, name: d.name }, quote });
  } catch (err) {
    console.error(`[sales-ops] ${d.id} quote ${quoteNumber} failed`, err);
    return c.json({ error: `${d.name} couldn't load this quote. Some quotes (e.g. $0 ones) fail on their side — try again or check the ${d.name} portal.` }, 502);
  }
});

export default app;
