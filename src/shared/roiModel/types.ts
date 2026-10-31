/**
 * Types for the AI Agent ROI model (model v5.0).
 *
 * Percent fields (`pct`/`pct3`) are stored as fractions (0.12 = 12%).
 * `Yr3` fields hold Year 1, Year 2 and Year 3 values.
 */

export type Yr3 = [number, number, number];

export interface RoiInputs {
  client: string;
  // Step 1: calls and service today
  monthlyCalls: number;
  monthlyOutbound: number;
  growth: number;
  abandon: number;
  // Step 2: staffing
  inhouse: number;
  bpo: number;
  bpoRate: number;
  bpoHours: number;
  // Step 3: pay and time off
  wage: number;
  hpw: number;
  weeks: number;
  hpd: number;
  pto: number;
  hol: number;
  // Step 4: taxes and benefits
  fica: number;
  pfml: number;
  sui: number;
  futa: number;
  health: number;
  k403: number;
  life: number;
  // Step 5: turnover
  turnover: number;
  trainWeeks: number;
  recruit: number;
  // Step 6: service goals
  target: Yr3;
  /** Average handle time in minutes; null = calibrate from today's workload. */
  aht: number | null;
  occupancy: number;
  // Step 7: AI rollout
  route: Yr3;
  contain: Yr3;
  outAI: Yr3;
  // Step 8: AI pricing
  listPrice: number;
  price: Yr3;
  digPrice: number;
  digVol: number;
  billed: number;
  impl: number;
  admin: number;
}

/** Per-agent cost and workload block. */
export interface RoiAgentBlock {
  paid: number;
  ptoHrs: number;
  prod: number;
  base: number;
  tax: number;
  health: number;
  k403: number;
  life: number;
  loaded: number;
  perHour: number;
  perProdHour: number;
  agents: number;
  callsPerAgent: number;
  turnPerDepart: number;
  share: number;
  bpoCost: number;
  blendLabor: number;
  blendTurn: number;
  blendAll: number;
  costPerCall: number;
  turnoverTeam: number;
  impliedAHT: number;
}

/** Row with a value for Today (index 0) and Years 1–3. */
export type RowAll = number[];
/** Row that only exists for Years 1–3; index 0 (Today) is null. */
export type RowYears = (number | null)[];

export interface RoiRows {
  outbound: RowAll;
  outAIc: RowYears;
  outHuman: RowAll;
  offered: RowAll;
  routed: RowYears;
  contained: RowYears;
  human: RowAll;
  answered: RowAll;
  abandoned: RowAll;
  added: RowYears;
  req: RowAll;
  needed: RowYears;
  offset: RowYears;
  labor: RowAll;
  turn: RowAll;
  voice: RowYears;
  digital: RowYears;
  impl: RowYears;
  admin: RowYears;
  total: RowAll;
  saveA: RowYears;
  humanOnly: RowYears;
  saveB: RowYears;
  costPerCall: RowYears;
  aiPerResolved: RowYears;
  breakeven: RowYears;
}

export type RoiRowKey = keyof RoiRows;

export type RoiTotalKey =
  | "labor"
  | "turn"
  | "voice"
  | "digital"
  | "impl"
  | "admin"
  | "total"
  | "saveA"
  | "humanOnly"
  | "saveB";

export interface RoiHeadline {
  saveA3: number;
  saveB3: number;
  aiInvest3: number;
  roiB: number;
  offsetY3: number;
  addedY3: number;
  perProdHour: number;
  tot: Record<RoiTotalKey, number>;
}

export interface RoiResult {
  L: RoiAgentBlock;
  R: RoiRows;
  H: RoiHeadline;
  /** Sensitivity grid: rows = sensC (containment), columns = sensD (discount). */
  S: number[][];
  sensC: number[];
  sensD: number[];
  disc: number[];
}

export type RoiFieldType =
  | "text"
  | "int"
  | "num"
  | "numOpt"
  | "pct"
  | "pct3"
  | "money"
  | "money0"
  | "money3";

export interface RoiField {
  k: keyof RoiInputs;
  type: RoiFieldType;
  label: string;
  help: string;
  /** "To confirm": an estimate that should be validated with the client. */
  flag?: boolean;
}

export interface RoiStep {
  id: string;
  title: string;
  eyebrow: string;
  intro: string;
  fields: RoiField[];
}
