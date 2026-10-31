/**
 * Starting points for the ROI builder. The example is a fictional, generic
 * mid-size contact center; it does not describe any real customer.
 */

import type { RoiInputs } from "./types.ts";

export const EXAMPLE_INPUTS: RoiInputs = {
  client: "Example contact center",
  monthlyCalls: 50000, monthlyOutbound: 5000, growth: 0, abandon: 0.12,
  inhouse: 120, bpo: 0, bpoRate: 20, bpoHours: 2080,
  wage: 19, hpw: 40, weeks: 52, hpd: 8, pto: 15, hol: 10,
  fica: 0.0765, pfml: 0, sui: 0.025, futa: 0.0175, health: 7500, k403: 0.03, life: 0.2,
  turnover: 0.4, trainWeeks: 3, recruit: 3000,
  target: [0.08, 0.06, 0.05], aht: null, occupancy: 0.75,
  route: [0.5, 0.75, 1], contain: [0.4, 0.5, 0.6], outAI: [0, 0, 0],
  listPrice: 1.99, price: [1.99, 1.99, 1.99], digPrice: 0.99, digVol: 0, billed: 1, impl: 0, admin: 0,
};

/** Everything zero / empty ("Start blank"). AHT stays unset. */
export const BLANK_INPUTS: RoiInputs = {
  client: "",
  monthlyCalls: 0, monthlyOutbound: 0, growth: 0, abandon: 0,
  inhouse: 0, bpo: 0, bpoRate: 0, bpoHours: 0,
  wage: 0, hpw: 0, weeks: 0, hpd: 0, pto: 0, hol: 0,
  fica: 0, pfml: 0, sui: 0, futa: 0, health: 0, k403: 0, life: 0,
  turnover: 0, trainWeeks: 0, recruit: 0,
  target: [0, 0, 0], aht: null, occupancy: 0,
  route: [0, 0, 0], contain: [0, 0, 0], outAI: [0, 0, 0],
  listPrice: 0, price: [0, 0, 0], digPrice: 0, digVol: 0, billed: 0, impl: 0, admin: 0,
};

/** Deep copy of a set of inputs (arrays are not shared). */
export function cloneInputs(p: RoiInputs): RoiInputs {
  return {
    ...p,
    target: [...p.target],
    route: [...p.route],
    contain: [...p.contain],
    outAI: [...p.outAI],
    price: [...p.price],
  };
}
