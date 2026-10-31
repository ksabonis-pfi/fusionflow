import { ROI_FIELDS } from "../../../../shared/roiModel/fields";
import { sensitivityPlanRow } from "../../../../shared/roiModel/model";
import type { RoiInputs, RoiResult } from "../../../../shared/roiModel/types";

export type RoiWarning = { id: string; text: string; /** Only relevant on the results page. */ resultsOnly?: boolean };

/**
 * Inputs that make the model produce misleading numbers. These only warn:
 * the model accepts anything (no range checks), and so does the UI.
 */
export function roiWarnings(P: RoiInputs, o: RoiResult): RoiWarning[] {
  const w: RoiWarning[] = [];
  const L = o.L;

  if (!L.callsPerAgent) {
    w.push({
      id: "cpa",
      text: P.aht == null
        ? "There are no agents and no handle time, so calls per agent is zero. Staffing and savings figures will be absurdly large. Enter agents (Step 2) or a handle time (Step 6)."
        : "Calls per agent works out to zero, so staffing and savings figures will be absurdly large. Check handle time, occupancy and hours.",
    });
  }
  if (P.aht != null && L.prod <= 0) {
    w.push({ id: "prod", text: "PTO and holiday hours are more than paid hours, so productive hours are zero or negative and staffing figures will be wrong. Check Step 3." });
  }
  if (P.listPrice === 0 && (P.price.some((v) => v !== 0) || P.digVol > 0)) {
    w.push({ id: "list0", text: "The list price per voice conversation is $0, so the price paid and the chat price are ignored and AI conversations cost nothing. Enter the list price in Step 8." });
  }

  const pctOver: string[] = [];
  const negative: string[] = [];
  for (const f of ROI_FIELDS) {
    if (f.type === "text") continue;
    const raw = P[f.k];
    const vals = (Array.isArray(raw) ? raw : [raw]).filter((v): v is number => typeof v === "number");
    if (f.type.startsWith("pct") && f.k !== "growth" && vals.some((v) => v > 1)) pctOver.push(f.label);
    if (vals.some((v) => v < 0) && !(f.k === "growth" && vals.every((v) => v > -1))) negative.push(f.label);
  }
  if (pctOver.length) w.push({ id: "pct", text: `Over 100%: ${pctOver.join(", ")}.` });
  if (negative.length) w.push({ id: "neg", text: `Negative values: ${negative.join(", ")}.` });

  const d2 = o.disc[2];
  if ([0, 0.1, 0.2, 0.3].some((d) => Math.abs(d - d2) < 1e-9)) {
    w.push({ id: "sens-dup", resultsOnly: true, text: "The Year 3 discount matches a fixed sensitivity column, so the last sensitivity column repeats an earlier one." });
  }
  if (sensitivityPlanRow(o, P.contain[2]) < 0) {
    w.push({ id: "sens-plan", resultsOnly: true, text: "Year 3 containment isn't one of 40%, 50% … 90%, so no sensitivity cell is outlined as your plan." });
  }
  return w;
}
