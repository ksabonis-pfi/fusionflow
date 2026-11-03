/**
 * AI Agent ROI model, v5.0.
 *
 * A line-by-line transliteration of the original builder's `compute(p)`.
 * Operand order, Math.pow (not `**`), `||` fallbacks and truthiness checks
 * are kept exactly so results match the original bit-for-bit (verified by
 * an external parity harness). Nothing is rounded here; rounding happens
 * only in the formatters.
 *
 * Known behaviours that are intentionally NOT "fixed" (changing any of them
 * is a model-version change, not a refactor):
 * - 0 agents and no AHT: calls per agent falls back to 1e-9, so staffing
 *   figures explode.
 * - listPrice 0: discount is 0 and voice/chat cost is 0 (price is ignored).
 * - Voice cost round-trips through the discount: listPrice*(1-disc).
 * - The chat list price gets the voice discount ratio.
 * - `req` clamps (human - abandoned) at 0; the sensitivity grid does not.
 * - Today's total (View A baseline) is not grown with `growth`.
 * - No range checks on any input.
 */

import type {
  RoiAgentBlock,
  RoiHeadline,
  RoiInputs,
  RoiResult,
  RoiRowKey,
  RoiRows,
  RoiTotalKey,
} from "./types.ts";

export const MODEL_VERSION = "5.0";

const TOTAL_KEYS: RoiTotalKey[] = [
  "labor",
  "turn",
  "voice",
  "digital",
  "impl",
  "admin",
  "total",
  "saveA",
  "humanOnly",
  "saveB",
];

export function compute(p: RoiInputs): RoiResult {
  const L = {} as RoiAgentBlock;
  L.paid = p.hpw * p.weeks; L.ptoHrs = (p.pto + p.hol) * p.hpd; L.prod = L.paid - L.ptoHrs;
  L.base = p.wage * L.paid; L.tax = L.base * (p.fica + p.pfml + p.sui + p.futa); L.health = p.health; L.k403 = L.base * p.k403; L.life = p.life * L.paid;
  L.loaded = L.base + L.tax + L.health + L.k403 + L.life; L.perHour = L.paid ? L.loaded / L.paid : 0; L.perProdHour = L.prod ? L.loaded / L.prod : 0;
  const agents = p.inhouse + p.bpo; L.agents = agents;
  L.callsPerAgent = p.aht ? (L.prod * p.occupancy * 60) / p.aht : (agents > 0 ? (p.monthlyCalls * 12 * (1 - p.abandon) + p.monthlyOutbound * 12) / agents : 0);
  L.turnPerDepart = p.trainWeeks * p.hpw * L.perHour + p.recruit;
  L.share = agents > 0 ? p.inhouse / agents : 1; L.bpoCost = p.bpoRate * p.bpoHours;
  L.blendLabor = L.share * L.loaded + (1 - L.share) * L.bpoCost; L.blendTurn = L.share * p.turnover * L.turnPerDepart; L.blendAll = L.blendLabor + L.blendTurn;
  L.costPerCall = L.callsPerAgent ? L.blendLabor / L.callsPerAgent : 0; L.turnoverTeam = p.inhouse * p.turnover * L.turnPerDepart;
  L.impliedAHT = L.callsPerAgent ? (L.prod * p.occupancy * 60) / L.callsPerAgent : 0;
  const disc = p.price.map((x) => (p.listPrice ? 1 - x / p.listPrice : 0)); const cpa = L.callsPerAgent || 1e-9;

  // Year-only rows start with null at index 0 (Today).
  const R: RoiRows = { outbound: [], outAIc: [null], outHuman: [], offered: [], routed: [null], contained: [null], human: [], answered: [], abandoned: [], added: [null], req: [], needed: [null], offset: [null], labor: [], turn: [], voice: [null], digital: [null], impl: [null], admin: [null], total: [], saveA: [null], humanOnly: [null], saveB: [null], costPerCall: [null], aiPerResolved: [null], breakeven: [null] };
  // Inside the year loop every year-only cell has just been assigned a number.
  const n = (k: RoiRowKey, i: number): number => R[k][i] as number;

  R.offered[0] = p.monthlyCalls * 12; R.human[0] = R.offered[0]; R.answered[0] = R.offered[0] * (1 - p.abandon); R.abandoned[0] = R.offered[0] - R.answered[0]; R.outbound[0] = p.monthlyOutbound * 12; R.outHuman[0] = R.outbound[0];
  R.req[0] = agents; R.labor[0] = agents * L.blendLabor; R.turn[0] = agents * L.blendTurn; R.total[0] = R.labor[0] + R.turn[0];
  for (let i = 1; i <= 3; i++) {
    const o = p.monthlyCalls * 12 * Math.pow(1 + p.growth, i);
    R.offered[i] = o; const ob = p.monthlyOutbound * 12 * Math.pow(1 + p.growth, i); R.outbound[i] = ob; R.outAIc[i] = ob * p.outAI[i - 1]; R.outHuman[i] = ob - n("outAIc", i); R.routed[i] = o * p.route[i - 1]; R.contained[i] = n("routed", i) * p.contain[i - 1];
    R.human[i] = o - n("contained", i); R.answered[i] = o * (1 - p.target[i - 1]); R.abandoned[i] = o - R.answered[i]; R.added[i] = R.answered[i] - R.answered[0];
    R.req[i] = (Math.max(0, R.human[i] - R.abandoned[i]) + R.outHuman[i]) / cpa; R.needed[i] = (R.answered[i] + ob) / cpa; R.offset[i] = agents - R.req[i];
    R.labor[i] = R.req[i] * L.blendLabor; R.turn[i] = R.req[i] * L.blendTurn;
    R.voice[i] = (n("routed", i) + n("outAIc", i)) * p.billed * p.listPrice * (1 - disc[i - 1]); R.digital[i] = p.digVol * 12 * p.digPrice * (1 - disc[i - 1]);
    R.impl[i] = i === 1 ? p.impl : 0; R.admin[i] = p.admin;
    R.total[i] = R.labor[i] + R.turn[i] + n("voice", i) + n("digital", i) + n("impl", i) + n("admin", i);
    R.saveA[i] = R.total[0] - R.total[i]; R.humanOnly[i] = n("needed", i) * L.blendAll; R.saveB[i] = n("humanOnly", i) - R.total[i];
    R.costPerCall[i] = L.costPerCall; R.aiPerResolved[i] = (n("contained", i) + n("outAIc", i)) ? n("voice", i) / (n("contained", i) + n("outAIc", i)) : 0;
    R.breakeven[i] = L.costPerCall ? (p.listPrice * (1 - disc[i - 1]) * p.billed) / L.costPerCall : 0;
  }
  const sum = (k: RoiRowKey): number => n(k, 1) + n(k, 2) + n(k, 3);
  const H = { saveA3: sum("saveA"), saveB3: sum("saveB"), aiInvest3: sum("voice") + sum("digital") + sum("impl") + sum("admin") } as RoiHeadline;
  H.roiB = H.aiInvest3 ? H.saveB3 / H.aiInvest3 : 0; H.offsetY3 = n("offset", 3); H.addedY3 = n("added", 3); H.perProdHour = L.perProdHour;
  H.tot = {} as RoiHeadline["tot"]; TOTAL_KEYS.forEach((k) => (H.tot[k] = sum(k)));
  const o3 = p.monthlyCalls * 12 * Math.pow(1 + p.growth, 3); const ob3 = p.monthlyOutbound * 12 * Math.pow(1 + p.growth, 3) * p.outAI[2]; const sensC = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9], sensD = [0, 0.1, 0.2, 0.3, disc[2]];
  const S = sensC.map((c) => sensD.map((d) => o3 * p.route[2] * c * L.blendAll / cpa - o3 * p.route[2] * p.billed * p.listPrice * (1 - d) - p.digVol * 12 * p.digPrice * (1 - d) - p.admin + ob3 * (L.blendAll / cpa - p.billed * p.listPrice * (1 - d))));
  return { L, R, H, S, sensC, sensD, disc };
}

/** Index of the sensitivity row matching Year 3 containment, or -1 if none. */
export function sensitivityPlanRow(r: RoiResult, contain3: number): number {
  return r.sensC.findIndex((c) => Math.abs(c - contain3) < 1e-9);
}

/** Sensitivity plan column: the last column (Year 3 actual discount). */
export const SENSITIVITY_PLAN_COL = 4;
