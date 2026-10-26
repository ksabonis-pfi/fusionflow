// ScanSource partner API (APIM at api.scansource.com/scsc). Azure AD
// client-credentials token (cached in KV) plus the Ocp-Apim-Subscription-Key
// header on every call. Specs: docs/scansource/specs/.
//
// Manufacturer part numbers are ambiguous here: "82M89AA" maps to both
// HPP-82M89AA and HPP-82M89AARC, and pricing by mfr part (PartNumberType 2)
// returns nothing for those. So lookup always searches first, then prices the
// resulting ScanSource item numbers (PartNumberType 1), which is unambiguous.
import type { Bindings } from "../../types";
import type { Distributor, DistributorOffer, LookupOptions, LookupResult } from "./types";

// Paths passed to call() start with the API name, e.g. "/product/v2/search".
const API_BASE = "https://api.scansource.com/scsc";
// ScanSource's tenant and API app registration — fixed values, not secrets.
const TOKEN_URL = "https://login.microsoftonline.com/ce986101-0c52-4693-a383-9869e4eac48f/oauth2/v2.0/token";
const SCOPE = "a2eccdbd-b208-4e77-a82f-dddd1814309a/.default";
const TOKEN_CACHE_KEY = "scansource:token";
const WAREHOUSE_NA = "1710";
const BUSINESS_UNIT_NA = "1700";

type TokenCache = { access_token: string; expires_at: number };

export function isConfigured(env: Bindings): boolean {
  return !!(env.SCANSOURCE_CLIENT_ID && env.SCANSOURCE_CLIENT_SECRET
    && env.SCANSOURCE_SUBSCRIPTION_KEY && env.SCANSOURCE_CUSTOMER_NUMBER);
}

async function getToken(env: Bindings): Promise<string> {
  const cached = await env.KV.get<TokenCache>(TOKEN_CACHE_KEY, "json");
  if (cached && cached.expires_at > Date.now() + 60_000) return cached.access_token;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.SCANSOURCE_CLIENT_ID!,
      client_secret: env.SCANSOURCE_CLIENT_SECRET!,
      scope: SCOPE,
    }),
  });
  if (!res.ok) throw new Error(`ScanSource token fetch failed: ${res.status}`);
  const data = await res.json() as { access_token: string; expires_in: number };
  const cache: TokenCache = { access_token: data.access_token, expires_at: Date.now() + data.expires_in * 1000 };
  await env.KV.put(TOKEN_CACHE_KEY, JSON.stringify(cache), { expirationTtl: Math.max(60, data.expires_in - 60) });
  return data.access_token;
}

export async function call<T>(
  env: Bindings,
  path: string,
  params: Record<string, string>,
  body?: unknown,
  opts: { timeoutMs?: number } = {},
): Promise<T | null> {
  const token = await getToken(env);
  const qs = new URLSearchParams({ customerNumber: env.SCANSOURCE_CUSTOMER_NUMBER!, ...params });
  const res = await fetch(`${API_BASE}${path}?${qs}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Ocp-Apim-Subscription-Key": env.SCANSOURCE_SUBSCRIPTION_KEY!,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ScanSource ${path} failed: ${res.status} ${text.slice(0, 200)}`);
  }
  // Search answers an empty body (not []) when nothing matches.
  const text = await res.text();
  return text.trim() ? JSON.parse(text) as T : null;
}

type SearchResult = {
  ScanSourceItemNumber: string;
  ManufacturerItemNumber: string;
  Manufacturer: string | null;
  CategoryPath: string | null;
  Description: string | null;
};

// Several fields come back as strings ("0", "false") despite the spec.
type PricingResult = {
  ItemNumber: string;
  UnitPrice: number;
  UnitPriceCurrencyCode: string | null;
  MSRP: number;
  DealerAuthorized: boolean | string;
  SPA: boolean | string;
  SPADescription: string;
  SPARestriction: boolean | string;
  SPARestrictionDescription: string;
  QuantityAvailable: number | string;
  TotalInventory?: number | string;
  QuantityOnOrder: number | string;
  DropShipQuantityAvailable: number | string;
  PricingError: boolean | string;
  PricingErrorDesc: string;
};

const num = (v: number | string | undefined | null): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const bool = (v: boolean | string | undefined): boolean => v === true || v === "true";

const tidy = (s: string) => s.trim().replace(/\s+\.$/, "").trim();

/** SPA restriction text arrives as e.g. "20261101 Expiration Date." Turn the
 *  yyyymmdd into a readable date; 2100+ dates are ScanSource's "never expires"
 *  placeholder (seen on rebox SKUs as 21001231), so drop those entirely. */
function formatRestriction(raw: string): string | null {
  const text = raw.replace(/(\d{4})(\d{2})(\d{2})\s*Expiration Date\.?/gi, (_m, y: string, mo: string, d: string) => {
    if (Number(y) >= 2100) return "";
    const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
    return `Expires ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
  });
  const out = tidy(text);
  return out || null;
}

type ProductDetail = {
  ItemImage: string | null;
  ProductMedia?: { MediaType: string; URL: string }[] | null;
};

const IMAGE_CACHE_PREFIX = "scansource:img:";
// A SKU's product image effectively never changes; a missing one might get
// added later, so "no image" is remembered for less time.
const IMAGE_TTL_FOUND = 365 * 24 * 60 * 60;
const IMAGE_TTL_MISSING = 7 * 24 * 60 * 60;

/** Product image URL for a SKU, from product detail (search results carry no
 *  images). One detail call per SKU, so cached in KV. A failed lookup returns
 *  null without caching; a thumbnail is never worth failing the search over. */
async function getImageUrl(env: Bindings, sku: string): Promise<string | null> {
  const key = IMAGE_CACHE_PREFIX + sku.toUpperCase();
  const cached = await env.KV.get<{ url: string | null }>(key, "json");
  if (cached) return cached.url;
  try {
    const detail = await call<ProductDetail>(env, "/product/v2/detail", { itemNumber: sku, partNumberType: "1", region: "0" });
    // "Primary" is the manufacturer logo; "Primary Image" is the product photo.
    const url = detail?.ProductMedia?.find((m) => m.MediaType === "Primary Image")?.URL || detail?.ItemImage || null;
    await env.KV.put(key, JSON.stringify({ url }), { expirationTtl: url ? IMAGE_TTL_FOUND : IMAGE_TTL_MISSING });
    return url;
  } catch (err) {
    console.error(`[sales-ops] scansource image lookup failed for ${sku}`, err);
    return null;
  }
}

const SEARCH_PAGE_SIZE = 100;
// Pricing accepts 100 lines (~6s); two parallel calls of 50 take ~4s.
const PRICING_CHUNK = 50;

async function lookup(env: Bindings, query: string, opts: LookupOptions): Promise<LookupResult> {
  const hits = await call<SearchResult[]>(env, "/product/v2/search", {
    searchText: query,
    useAndOperator: "true",
    region: "0",
    pageSize: String(SEARCH_PAGE_SIZE),
  }) ?? [];

  // Price every hit before applying the limit: only pricing reveals which SKUs
  // are restricted, and those can fill the first page ahead of buyable ones.
  const matches = hits
    .filter((h) => opts.includeServices || !(h.CategoryPath ?? "").startsWith("Services"))
    .slice(0, SEARCH_PAGE_SIZE);
  if (matches.length === 0) return { offers: [], truncated: false };

  const chunks: SearchResult[][] = [];
  for (let i = 0; i < matches.length; i += PRICING_CHUNK) chunks.push(matches.slice(i, i + PRICING_CHUNK));
  const prices = (await Promise.all(chunks.map((chunk) =>
    call<PricingResult[]>(env, "/product/v2/pricing", {}, {
      Warehouse: WAREHOUSE_NA,
      BusinessUnit: BUSINESS_UNIT_NA,
      Lines: chunk.map((m) => ({ ItemNumber: m.ScanSourceItemNumber, PartNumberType: 1, Quantity: 1 })),
    }),
  ))).flatMap((p) => p ?? []);
  const priceBySku = new Map(prices.map((p) => [p.ItemNumber.toUpperCase(), p]));

  const offers = matches.map((m) => toOffer(m, priceBySku.get(m.ScanSourceItemNumber.toUpperCase())));
  const buyable = offers.filter((o) => !o.restricted);
  const restricted = offers.filter((o) => o.restricted);
  const shown = buyable.slice(0, opts.limit);
  // Thumbnails only for the buyable rows we return; restricted rows stay text-only.
  const images = await Promise.all(shown.map((o) => getImageUrl(env, o.sku)));
  shown.forEach((o, i) => { o.imageUrl = images[i]; });
  return {
    // Buyable first, then restricted (shown only on request); each capped.
    offers: [...shown, ...restricted.slice(0, opts.limit)],
    // Not exhaustive if we dropped buyable SKUs, or search filled its page and
    // may have more beyond it.
    truncated: buyable.length > opts.limit || hits.length >= SEARCH_PAGE_SIZE,
  };
}

function toOffer(m: SearchResult, p: PricingResult | undefined): DistributorOffer {
  // "Authorization failed" here is per SKU, not our credentials: carrier- or
  // program-specific SKUs (e.g. the "RC" RingCentral variants) are reserved
  // for other partners.
  const rawError = !p ? "No pricing returned" : bool(p.PricingError) ? (p.PricingErrorDesc || "Pricing error") : null;
  const restricted = rawError === "Authorization failed";
  const error = restricted ? "Restricted SKU — not sold to us" : rawError;
  const priced = p && !error;
  return {
    sku: m.ScanSourceItemNumber,
    mfrPart: m.ManufacturerItemNumber,
    manufacturer: m.Manufacturer,
    description: m.Description,
    category: m.CategoryPath,
    unitPrice: priced ? num(p.UnitPrice) : null,
    msrp: priced ? num(p.MSRP) : null,
    currency: priced ? p.UnitPriceCurrencyCode : null,
    qtyAvailable: priced ? num(p.QuantityAvailable) : null,
    totalInventory: priced ? num(p.TotalInventory) : null,
    qtyOnOrder: priced ? num(p.QuantityOnOrder) : null,
    dropShipQty: priced ? num(p.DropShipQuantityAvailable) : null,
    authorized: priced ? bool(p.DealerAuthorized) : null,
    specialPricing: priced && bool(p.SPA) ? (tidy(p.SPADescription) || "Special pricing applied") : null,
    restriction: priced && bool(p.SPARestriction) ? formatRestriction(p.SPARestrictionDescription || "Restricted") : null,
    error,
    restricted,
    imageUrl: null, // filled in for the returned buyable rows
  };
}

export const scansource: Distributor = {
  id: "scansource",
  name: "ScanSource",
  isConfigured,
  lookup,
};
