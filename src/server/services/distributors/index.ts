import { scansource } from "./scansource";
import { getQuote, listQuotes } from "./scansourceQuotes";
import type { Distributor } from "./types";

/** Every distributor Sales Ops can query. Add Jenne, CDW, etc. here once each
 *  has an adapter implementing `Distributor`. Quote support is optional. */
export const DISTRIBUTORS: Distributor[] = [
  { ...scansource, listQuotes, getQuote },
];

export * from "./types";
