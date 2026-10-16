import { scansource } from "./scansource";
import type { Distributor } from "./types";

/** Every distributor Sales Ops can query. Add Jenne, CDW, etc. here once each
 *  has an adapter implementing `Distributor`. */
export const DISTRIBUTORS: Distributor[] = [scansource];

export * from "./types";
