/**
 * The ROI builder's Excel download as plain data: sheets of typed cells
 * (a number or text plus a number-format kind). No DOM and no zip here; the
 * client's xlsx writer turns this into a workbook.
 *
 * Numbers are stored unrounded and Excel's number format does the display
 * rounding, except on the ROI table sheet, which carries exactly the rows and
 * 2-decimal values of the Copy-for-Excel table (`buildRoiTsv`). Non-finite
 * values (NaN, ±Infinity, e.g. with zero paid hours) become blank cells.
 */

import { buildRoiTsv } from "./excel.ts";
import { ROI_STEPS } from "./fields.ts";
import { fmt, sensDiscDigits } from "./format.ts";
import { MODEL_VERSION, SENSITIVITY_PLAN_COL, sensitivityPlanRow } from "./model.ts";
import type { RoiFieldType, RoiInputs, RoiResult } from "./types.ts";

export type RoiCellFormat =
  | "text"
  | "general"
  | "currency"
  | "currency2"
  | "integer"
  | "decimal1"
  | "percent"
  | "percent0"
  | "percent2"
  | "multiple"
  | "date";

/** Excel number format code for each format kind ("General" = no custom format). */
export const ROI_NUMBER_FORMATS: Record<RoiCellFormat, string> = {
  text: "@",
  general: "General",
  currency: '"$"#,##0;[Red]-"$"#,##0',
  currency2: '"$"#,##0.00;[Red]-"$"#,##0.00',
  integer: "#,##0",
  decimal1: "#,##0.0",
  percent: "0.0%",
  percent0: "0%",
  percent2: "0.00%",
  multiple: '0.0"×"',
  date: "mmmm d, yyyy",
};

/** header = navy fill, white bold text; title = large bold; plan = bold with a box. */
export type RoiCellStyle = "header" | "title" | "bold" | "plan";

export interface RoiCell {
  /** null = empty cell (it can still carry a style, e.g. a header fill). */
  v: string | number | null;
  fmt?: RoiCellFormat;
  style?: RoiCellStyle;
}

export interface RoiSheetData {
  /** Excel sheet name (≤ 31 chars, none of []:*?/\). */
  name: string;
  rows: RoiCell[][];
  /** Column widths in characters, column A first. */
  colWidths: number[];
  /** Rows frozen at the top (0 = none). */
  freezeRows: number;
}

export interface RoiWorkbookOptions {
  /** Report date (defaults to now); stored as a real Excel date. */
  date?: Date;
}

// ---------- cell helpers ----------

const fin = (v: number | null | undefined): number | null => (v != null && Number.isFinite(v) ? v : null);
const t = (v: string, style?: RoiCellStyle): RoiCell => ({ v, fmt: "text", style });
const n = (v: number | null | undefined, f: RoiCellFormat, style?: RoiCellStyle): RoiCell => ({ v: fin(v), fmt: f, style });
const blank = (): RoiCell => ({ v: null });
const headerRow = (...labels: string[]): RoiCell[] => labels.map((l) => t(l, "header"));

/** Excel serial date (1900 system) for the local calendar day of `d`. */
export function excelDateSerial(d: Date): number {
  return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000;
}

// ---------- Summary ----------

function summarySheet(P: RoiInputs, o: RoiResult, date: Date): RoiSheetData {
  const H = o.H, R = o.R;
  const rows: RoiCell[][] = [
    [t("AI Agent ROI Analysis", "title")],
    [t("Client", "bold"), t(P.client || "Client")],
    [t("Date", "bold"), n(excelDateSerial(date), "date")],
    [t("Model version", "bold"), t("v" + MODEL_VERSION)],
    [t("Prepared by", "bold"), t("Packet Fusion")],
    [],
    headerRow("Headline result", "Value"),
    // Same six tiles, in the same order, as the results page.
    [t("3-yr net savings vs. today (View A)"), n(H.saveA3, "currency")],
    [t("3-yr savings vs. human-only plan (View B)"), n(H.saveB3, "currency")],
    [t("3-yr ROI, View B ÷ AI investment"), n(H.roiB, "percent0")],
    [t("Year 3 agents offset vs. today"), n(H.offsetY3, "decimal1")],
    [t("Year 3 additional callers served"), n(H.addedY3, "integer")],
    [t("Loaded cost per productive agent hour"), n(H.perProdHour, "currency2")],
    [t("AI investment over 3 years"), n(H.aiInvest3, "currency")],
    [t("Return on AI spend (View B savings ÷ AI investment)"), n(H.roiB, "multiple")],
    [],
    headerRow("Key figures", "Today", "Year 1", "Year 2", "Year 3", "3-yr total"),
  ];
  const yr = (label: string, arr: (number | null)[], f: RoiCellFormat, total?: number) =>
    rows.push([t(label), ...[0, 1, 2, 3].map((i) => n(arr[i], f)), total == null ? blank() : n(total, f)]);
  yr("Annual calls offered", R.offered, "integer");
  yr("Calls fully resolved by AI", R.contained, "integer");
  yr("Additional callers served vs. today", R.added, "integer");
  yr("Human agents required", R.req, "decimal1");
  yr("Agents offset vs. today", R.offset, "decimal1");
  yr("Total cost with AI agent", R.total, "currency", H.tot.total);
  yr("Cost of human-only plan", R.humanOnly, "currency", H.tot.humanOnly);
  yr("Net savings vs. today (View A)", R.saveA, "currency", H.tot.saveA);
  yr("Net savings vs. human-only plan (View B)", R.saveB, "currency", H.tot.saveB);
  return { name: "Summary", rows, colWidths: [52, 16, 16, 16, 16, 16], freezeRows: 0 };
}

// ---------- Inputs ----------

/** Unit shown next to each input. Typed by key so a new field must get one. */
const INPUT_UNITS: Record<keyof RoiInputs, string> = {
  client: "",
  monthlyCalls: "calls / month",
  monthlyOutbound: "calls / month",
  growth: "% / year",
  abandon: "%",
  inhouse: "agents",
  bpo: "agents",
  bpoRate: "$ / agent hour",
  bpoHours: "hours / agent / year",
  wage: "$ / hour",
  hpw: "hours / week",
  weeks: "weeks / year",
  hpd: "hours / day",
  pto: "days / year",
  hol: "days / year",
  fica: "% of wages",
  pfml: "% of wages",
  sui: "% of wages",
  futa: "% of wages",
  health: "$ / agent / year",
  k403: "% of wages",
  life: "$ / paid hour",
  turnover: "% / year",
  trainWeeks: "weeks",
  recruit: "$ / hire",
  target: "%",
  aht: "minutes",
  occupancy: "%",
  route: "% of inbound calls",
  contain: "% of routed calls",
  outAI: "% of outbound calls",
  listPrice: "$ / conversation",
  price: "$ / conversation",
  digPrice: "$ / conversation",
  digVol: "conversations / month",
  billed: "% of routed calls",
  impl: "$ (one-time)",
  admin: "$ / year",
};

const INPUT_FORMAT: Record<RoiFieldType, RoiCellFormat> = {
  text: "text",
  int: "integer",
  num: "general",
  numOpt: "general",
  pct: "percent2",
  pct3: "percent2",
  money: "currency2",
  money0: "currency",
  money3: "currency2",
};

function inputsSheet(P: RoiInputs): RoiSheetData {
  const rows: RoiCell[][] = [headerRow("Step", "Field", "Value", "Unit", "To confirm")];
  for (const step of ROI_STEPS) {
    const stepName = `${step.eyebrow}: ${step.title}`;
    for (const f of step.fields) {
      const raw = P[f.k];
      const unit = t(INPUT_UNITS[f.k]);
      const confirm = t(f.flag ? "Yes" : "");
      const fm = INPUT_FORMAT[f.type];
      if (Array.isArray(raw)) {
        raw.forEach((v, i) => rows.push([t(stepName), t(`${f.label} (Year ${i + 1})`), n(v, fm), unit, confirm]));
      } else if (raw == null) {
        rows.push([t(stepName), t(f.label), t("Not set"), unit, confirm]);
      } else if (typeof raw === "string") {
        rows.push([t(stepName), t(f.label), t(raw), unit, confirm]);
      } else {
        rows.push([t(stepName), t(f.label), n(raw, fm), unit, confirm]);
      }
    }
  }
  return { name: "Inputs", rows, colWidths: [40, 54, 16, 22, 12], freezeRows: 1 };
}

// ---------- ROI table ----------

/** Number format for each Copy-for-Excel row, by its label. */
const ROI_ROW_FORMAT: Record<string, RoiCellFormat> = {
  "Annual calls offered": "integer",
  "Calls routed to AI agent": "integer",
  "Calls fully resolved by AI": "integer",
  "Calls still needing a human": "integer",
  "Calls answered (total)": "integer",
  "Calls abandoned": "integer",
  "Additional callers served vs. today": "integer",
  "Outbound calls placed": "integer",
  "Outbound calls placed by AI": "integer",
  "Outbound calls placed by agents": "integer",
  "Human agents required": "decimal1",
  "Agents needed without AI": "decimal1",
  "Agents offset vs. today": "decimal1",
  "Human labor": "currency",
  "Turnover / onboarding": "currency",
  "AI voice conversations": "currency",
  "AI digital conversations": "currency",
  "Implementation": "currency",
  "Managed services": "currency",
  "Total cost with AI agent": "currency",
  "Net savings vs. today (View A)": "currency",
  "Cost of human-only plan": "currency",
  "Net savings vs. human-only plan (View B)": "currency",
  "Human cost per handled call": "currency2",
  "AI cost per AI-handled call": "currency2",
  "Break-even containment": "percent",
};

const ROI_BOLD_ROWS = new Set(["Total cost with AI agent", "Net savings vs. today (View A)", "Net savings vs. human-only plan (View B)"]);

/**
 * Built from `buildRoiTsv` itself, so rows, labels and the 2-decimal rounding
 * can never drift from the Copy-for-Excel output. TSV cells are JS number
 * strings, so Number() recovers the exact value; "", "NaN" and "Infinity"
 * become blank cells.
 */
function roiTableSheet(o: RoiResult): RoiSheetData {
  const lines = buildRoiTsv(o).split("\n").map((l) => l.split("\t"));
  const [head, ...body] = lines;
  const rows: RoiCell[][] = [headerRow(...head)];
  for (const [label, ...vals] of body) {
    const f = ROI_ROW_FORMAT[label] ?? "general";
    const style = ROI_BOLD_ROWS.has(label) ? "bold" : undefined;
    rows.push([t(label, style), ...vals.map((s) => (s === "" ? blank() : n(Number(s), f, style)))]);
  }
  return { name: "ROI table", rows, colWidths: [44, 16, 16, 16, 16, 18], freezeRows: 1 };
}

// ---------- Cost per agent ----------

function costPerAgentSheet(P: RoiInputs, o: RoiResult): RoiSheetData {
  const L = o.L;
  const rows: RoiCell[][] = [headerRow("Cost component", "Per paid hour", "Per agent / yr", "Team / yr")];
  const parts: [string, number][] = [
    ["Base wages", L.base],
    ["Employer payroll taxes", L.tax],
    ["Health / dental / vision", L.health],
    ["Retirement match", L.k403],
    ["Life / disability", L.life],
  ];
  for (const [label, v] of parts) rows.push([t(label), n(v / L.paid, "currency2"), n(v, "currency"), n(v * P.inhouse, "currency")]);
  rows.push([t("In-house fully loaded cost", "bold"), n(L.perHour, "currency2", "bold"), n(L.loaded, "currency", "bold"), n(L.loaded * P.inhouse, "currency", "bold")]);
  rows.push([t(`BPO cost per agent (${fmt.usd2(P.bpoRate)}/hr × ${fmt.int(P.bpoHours)} hrs)`), n(P.bpoRate, "currency2"), n(L.bpoCost, "currency"), n(L.bpoCost * P.bpo, "currency")]);
  rows.push([t("In-house share of agents (team column: total agents)"), blank(), n(L.share, "percent"), n(L.agents, "integer")]);
  rows.push([t("Blended all-in cost per agent (incl. turnover)", "bold"), blank(), n(L.blendAll, "currency", "bold"), blank()]);
  rows.push([t("Loaded cost per productive hour (in-house)"), n(L.perProdHour, "currency2"), blank(), blank()]);
  rows.push([t("Calls handled per agent per year"), blank(), n(L.callsPerAgent, "integer"), blank()]);
  rows.push([t("Implied handle time (minutes)"), blank(), n(L.impliedAHT, "decimal1"), blank()]);
  rows.push([t("Turnover cost per departing agent"), blank(), n(L.turnPerDepart, "currency"), n(L.turnoverTeam, "currency")]);
  return { name: "Cost per agent", rows, colWidths: [52, 16, 18, 18], freezeRows: 1 };
}

// ---------- Sensitivity ----------

function sensitivitySheet(P: RoiInputs, o: RoiResult): RoiSheetData {
  const planRow = sensitivityPlanRow(o, P.contain[2]);
  const rows: RoiCell[][] = [
    [t("Containment ↓ / Discount →", "header"), ...o.sensD.map((d) => n(d, sensDiscDigits(d) ? "percent" : "percent0", "header"))],
  ];
  o.S.forEach((r, i) => {
    rows.push([
      n(o.sensC[i], "percent0", "bold"),
      ...r.map((v, j) => n(v, "currency", i === planRow && j === SENSITIVITY_PLAN_COL ? "plan" : undefined)),
    ]);
  });
  rows.push([]);
  rows.push([t("Year 3 savings vs. human-only plan (View B), by Year 3 containment (rows) and price discount off list (columns).")]);
  rows.push([
    t(
      planRow >= 0
        ? "Boxed bold cell = your Year 3 containment and price. The last column is your Year 3 discount."
        : "Your Year 3 containment isn't one of the rows above, so no cell is marked. The last column is your Year 3 discount.",
    ),
  ]);
  return { name: "Sensitivity", rows, colWidths: [28, 16, 16, 16, 16, 16], freezeRows: 1 };
}

// ---------- workbook ----------

export function buildRoiWorkbookData(inputs: RoiInputs, result: RoiResult, opts: RoiWorkbookOptions = {}): RoiSheetData[] {
  const date = opts.date ?? new Date();
  return [
    summarySheet(inputs, result, date),
    inputsSheet(inputs),
    roiTableSheet(result),
    costPerAgentSheet(inputs, result),
    sensitivitySheet(inputs, result),
  ];
}
