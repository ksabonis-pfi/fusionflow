/**
 * Zod schema for stored/submitted ROI inputs.
 *
 * Deliberately permissive on ranges: the model accepts any finite number
 * (negative growth, >100% values etc.) and the UI warns rather than blocks.
 * This only guarantees shape and finiteness.
 */

import { z } from "zod";
import type { RoiInputs } from "./types.ts";

const num = z.number().finite();
const yr3 = z.tuple([num, num, num]);

export const roiInputsSchema = z.object({
  client: z.string().max(200),
  monthlyCalls: num,
  monthlyOutbound: num,
  growth: num,
  abandon: num,
  inhouse: num,
  bpo: num,
  bpoRate: num,
  bpoHours: num,
  wage: num,
  hpw: num,
  weeks: num,
  hpd: num,
  pto: num,
  hol: num,
  fica: num,
  pfml: num,
  sui: num,
  futa: num,
  health: num,
  k403: num,
  life: num,
  turnover: num,
  trainWeeks: num,
  recruit: num,
  target: yr3,
  aht: num.positive().nullable(),
  occupancy: num,
  route: yr3,
  contain: yr3,
  outAI: yr3,
  listPrice: num,
  price: yr3,
  digPrice: num,
  digVol: num,
  billed: num,
  impl: num,
  admin: num,
});

// Compile-time check that the schema and the RoiInputs type stay in sync.
type SchemaOut = z.infer<typeof roiInputsSchema>;
const _schemaMatchesType: [SchemaOut, RoiInputs] extends [RoiInputs, SchemaOut] ? true : never = true;
void _schemaMatchesType;
