// ScanSource Customer Quote API (/customer-quote/v1). Quotes are built by
// ScanSource reps in their Salesforce; this is read-only.
//
// The live response differs from the published spec: quote-detail returns an
// array with one quote, and QuoteLines is a plain array (the spec shows
// { records: [...] }). Some quotes 500 on detail (seen on a $0 quote).
// Lines often have no ItemDescription, so each line's ScanSource material
// number is looked up in product detail (PartNumberType 3) for a description,
// SKU and photo, and cached since those don't change.
import type { Bindings } from "../../types";
import { call } from "./scansource";
import type { QuoteDetail, QuoteLine, QuoteSummary } from "./types";

type ListQuote = {
  Name: string | null;
  QuoteNumber: string;
  ExpirationDate: string | null;
  CreatedDate: string | null;
  LastModifiedDate: string | null;
  TotalPrice: number | null;
  SAPQuoteCreatedBy: string | null;
  DealID: string | null;
};

type Address = { Street: string | null; City: string | null; StateCode: string | null; PostalCode: string | null; CountryCode: string | null };

type RawLine = {
  LineNumber: string;
  Quantity: number | string | null;
  ManufacturerNumber: string | null;
  ProductMaterialNumber: string | null;
  InventoryIndicator: string | null;
  ItemDescription: string | null;
  MSRPPrice: number | null;
  Price: number | null;
  Manufacturer: string | null;
  ProductType: string | null;
  ServiceStarts: string | null;
  ServiceEnds: string | null;
  ServiceType: string | null;
  Term: string | number | null;
  DealID1: string | null; DealID1ExpirationDate: string | null;
  DealID2: string | null; DealID2ExpirationDate: string | null;
  DealID3: string | null; DealID3ExpirationDate: string | null;
};

type RawQuote = {
  QuoteNumber: string;
  Name: string | null;
  ExpirationDate: string | null;
  CreatedDate: string | null;
  LastModifiedDate: string | null;
  ShippingAddress?: Address | null;
  Shipping?: Address | null; // spec's name for the same thing
  EndUserName: string | null;
  SapQuoteCreatedBy: string | null;
  ManufacturerDealID: string | null;
  SAPShippingMethod: string | null;
  QuoteNotes: string | null;
  Currency: string | null;
  OrderType: string | null;
  Opportunity?: { Primary_Reseller_Contact__r?: { Name?: string | null; Email?: string | null } | null } | null;
  QuoteLines?: RawLine[] | { records?: RawLine[] } | null;
};

type ProductDetail = {
  ScanSourceItemNumber: string | null;
  Description: string | null;
  ItemImage: string | null;
  ProductMedia?: { MediaType: string; URL: string }[] | null;
};

type MaterialInfo = { sku: string | null; description: string | null; imageUrl: string | null };

const MATERIAL_CACHE_PREFIX = "scansource:mat:";
const MATERIAL_TTL = 365 * 24 * 60 * 60;
// Lookups normally take ~0.2s, but one occasionally hangs ~25s before
// ScanSource 500s it. Cap it so one bad line can't stall the whole quote.
const MATERIAL_TIMEOUT_MS = 4000;

/** Quote names arrive as "Packet Fusion, Inc.-SAP Quote - End-User - AudioCodes-202410";
 *  our own company prefix is noise on our own screen. */
function tidyName(name: string | null): string {
  const cleaned = (name ?? "").replace(/^\s*Packet Fusion,?\s*Inc\.?\s*[-–]?\s*/i, "").replace(/^[-–\s]+/, "").trim();
  return cleaned || (name ?? "").trim() || "(untitled quote)";
}

const dateOnly = (v: string | null) => (v ? v.slice(0, 10) : null);
const num = (v: number | string | null | undefined) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function oneLineAddress(a: Address | null | undefined): string | null {
  if (!a) return null;
  const cityLine = [a.City, [a.StateCode, a.PostalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const out = [a.Street, cityLine].filter(Boolean).join(", ");
  return out || null;
}

async function getMaterialInfo(env: Bindings, material: string): Promise<MaterialInfo | null> {
  const key = MATERIAL_CACHE_PREFIX + material;
  const cached = await env.KV.get<MaterialInfo>(key, "json");
  if (cached) return cached;
  try {
    const d = await call<ProductDetail>(
      env, "/product/v2/detail", { itemNumber: material, partNumberType: "3", region: "0" }, undefined,
      { timeoutMs: MATERIAL_TIMEOUT_MS },
    );
    if (!d) return null;
    const info: MaterialInfo = {
      sku: d.ScanSourceItemNumber || null,
      description: d.Description || null,
      imageUrl: d.ProductMedia?.find((m) => m.MediaType === "Primary Image")?.URL || d.ItemImage || null,
    };
    await env.KV.put(key, JSON.stringify(info), { expirationTtl: MATERIAL_TTL });
    return info;
  } catch (err) {
    // Enrichment only; the quote still renders from its own fields.
    console.error(`[sales-ops] scansource material lookup failed for ${material}`, err);
    return null;
  }
}

function toLine(l: RawLine, info: MaterialInfo | null): QuoteLine {
  const quantity = num(l.Quantity) ?? 0;
  const unitPrice = num(l.Price);
  const deals = ([[l.DealID1, l.DealID1ExpirationDate], [l.DealID2, l.DealID2ExpirationDate], [l.DealID3, l.DealID3ExpirationDate]] as const)
    .filter(([id]) => !!id)
    .map(([id, exp]) => ({ id: id!, expiresOn: dateOnly(exp) }));
  return {
    lineNumber: l.LineNumber,
    mfrPart: l.ManufacturerNumber,
    sku: info?.sku ?? null,
    manufacturer: l.Manufacturer,
    description: l.ItemDescription || info?.description || null,
    productType: l.ProductType,
    quantity,
    unitPrice,
    msrp: num(l.MSRPPrice),
    extended: unitPrice === null ? null : Math.round(quantity * unitPrice * 100) / 100,
    stock: l.InventoryIndicator,
    serviceType: l.ServiceType,
    term: l.Term === null || l.Term === undefined || l.Term === "" ? null : String(l.Term),
    serviceStarts: dateOnly(l.ServiceStarts),
    serviceEnds: dateOnly(l.ServiceEnds),
    deals,
    imageUrl: info?.imageUrl ?? null,
  };
}

export async function listQuotes(env: Bindings): Promise<QuoteSummary[]> {
  const rows = await call<ListQuote[]>(env, "/customer-quote/v1/list/list", {}) ?? [];
  return rows.map((q) => ({
    quoteNumber: q.QuoteNumber,
    name: tidyName(q.Name),
    total: num(q.TotalPrice),
    currency: null, // not on the list endpoint; quotes so far are all USD
    createdAt: q.CreatedDate,
    updatedAt: q.LastModifiedDate,
    expiresOn: dateOnly(q.ExpirationDate),
    createdBy: q.SAPQuoteCreatedBy,
    dealId: q.DealID,
  }));
}

export async function getQuote(env: Bindings, quoteNumber: string): Promise<QuoteDetail | null> {
  const raw = await call<RawQuote[] | RawQuote>(env, "/customer-quote/v1/quote-detail", { QuoteNumber: quoteNumber });
  const q = Array.isArray(raw) ? raw[0] : raw;
  if (!q?.QuoteNumber) return null;

  const rawLines = Array.isArray(q.QuoteLines) ? q.QuoteLines : q.QuoteLines?.records ?? [];
  const materials = [...new Set(rawLines.map((l) => l.ProductMaterialNumber).filter((m): m is string => !!m))];
  const infos = new Map(await Promise.all(materials.map(async (m) => [m, await getMaterialInfo(env, m)] as const)));
  const lines = rawLines.map((l) => toLine(l, l.ProductMaterialNumber ? infos.get(l.ProductMaterialNumber) ?? null : null));

  const contact = q.Opportunity?.Primary_Reseller_Contact__r;
  return {
    quoteNumber: q.QuoteNumber,
    name: tidyName(q.Name),
    // Detail has no total; the lines sum to the list endpoint's TotalPrice.
    total: Math.round(lines.reduce((sum, l) => sum + (l.extended ?? 0), 0) * 100) / 100,
    currency: q.Currency,
    createdAt: q.CreatedDate,
    updatedAt: q.LastModifiedDate,
    expiresOn: dateOnly(q.ExpirationDate),
    createdBy: q.SapQuoteCreatedBy,
    dealId: q.ManufacturerDealID,
    endUser: q.EndUserName,
    shipTo: oneLineAddress(q.ShippingAddress ?? q.Shipping),
    shippingMethod: q.SAPShippingMethod,
    orderType: q.OrderType,
    notes: q.QuoteNotes,
    resellerContact: contact?.Name || contact?.Email ? { name: contact.Name ?? null, email: contact.Email ?? null } : null,
    lines,
  };
}
