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
