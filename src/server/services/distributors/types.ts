import type { Bindings } from "../../types";

/** One distributor's price + stock for one of its SKUs. Every distributor
 *  adapter normalizes to this shape so the UI can compare side by side; the
 *  join key across distributors is `mfrPart` (see normalizeMfrPart). */
export interface DistributorOffer {
  sku: string;               // the distributor's own item number
  mfrPart: string;           // manufacturer part number as the distributor reports it
  manufacturer: string | null;
  description: string | null;
  category: string | null;
  unitPrice: number | null;  // our cost, after any special pricing
  msrp: number | null;
  currency: string | null;
  qtyAvailable: number | null;  // available to promise / sell now
  totalInventory: number | null; // on hand, including any not yet promisable
  qtyOnOrder: number | null;     // inbound from the manufacturer
  dropShipQty: number | null;
  authorized: boolean | null;    // are we authorized to buy it
  specialPricing: string | null; // SPA / deal description, when one applied
  restriction: string | null;    // expiration, min/max qty, etc.
  error: string | null;          // per-SKU pricing error (e.g. "Material not found")
  restricted: boolean;           // SKU reserved for other partners (carrier/program SKUs); hidden by default
  imageUrl: string | null;       // product photo, when the distributor has one
}

export type DistributorId = "scansource";

export interface Distributor {
  id: DistributorId;
  name: string;
  isConfigured(env: Bindings): boolean;
  /** Find SKUs matching a part number or keyword and return their price + stock. */
  lookup(env: Bindings, query: string, opts: LookupOptions): Promise<LookupResult>;
  /** Quotes the distributor has issued us. Optional: not every distributor exposes them. */
  listQuotes?(env: Bindings): Promise<QuoteSummary[]>;
  /** One quote with its lines; null when the distributor has no such quote. */
  getQuote?(env: Bindings, quoteNumber: string): Promise<QuoteDetail | null>;
}

export interface QuoteSummary {
  quoteNumber: string;
  name: string;               // display name, our own company prefix stripped
  total: number | null;
  currency: string | null;
  createdAt: string | null;   // ISO timestamp
  updatedAt: string | null;
  expiresOn: string | null;   // YYYY-MM-DD
  createdBy: string | null;   // distributor rep who built it
  dealId: string | null;      // manufacturer deal / special pricing ID
}

export interface QuoteLine {
  lineNumber: string;
  mfrPart: string | null;
  sku: string | null;           // distributor item number, when it could be resolved
  manufacturer: string | null;
  description: string | null;
  productType: string | null;   // e.g. "HW/SW", "Service"
  quantity: number;
  unitPrice: number | null;     // our quoted cost per unit
  msrp: number | null;
  extended: number | null;      // quantity × unitPrice
  stock: string | null;         // distributor's stock indicator as given ("Yes", "Call", "N/A")
  serviceType: string | null;   // "New", "Renewal", ...
  term: string | null;
  serviceStarts: string | null;
  serviceEnds: string | null;
  deals: { id: string; expiresOn: string | null }[];
  imageUrl: string | null;
}

export interface QuoteDetail extends QuoteSummary {
  endUser: string | null;
  shipTo: string | null;        // one-line address
  shippingMethod: string | null;
  orderType: string | null;
  notes: string | null;
  resellerContact: { name: string | null; email: string | null } | null;
  lines: QuoteLine[];
}

export interface LookupOptions {
  includeServices: boolean;
  /** Max buyable offers to return; restricted offers are capped separately. */
  limit: number;
}

export interface LookupResult {
  offers: DistributorOffer[];
  /** More matches exist than were returned, so "none found" isn't final. */
  truncated: boolean;
}

/** Comparison key: distributors format the same part differently
 *  ("89B53AA#ABA" vs "89B53AA #ABA" vs "89b53aa#aba"). */
export function normalizeMfrPart(part: string): string {
  return part.toUpperCase().replace(/[\s-]/g, "");
}
