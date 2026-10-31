// The Reports list on a run's Reports page, in display order. To add a report
// (e.g. a product deep-dive): add its id to ReportKind (types.ts), write a view
// taking ReportViewProps (ReportViews.tsx), and add an entry here. The list
// never changes shape with the audience: a report the Zoom Essentials audience
// lacks is marked `advancedOnly` and shown greyed out, not hidden.
import type { ComponentType } from "react";
import type { ReportKind } from "./types";
import { ExecutiveReport, GrowthReport, OutcomesReport, type ReportViewProps } from "./ReportViews";

export type ReportDef = {
  id: ReportKind;
  label: string;
  /** Zoom only: not produced for the Essentials audience. */
  advancedOnly?: boolean;
  /** Browser-tab title stem (also the suggested "Save as PDF" file name); defaults to `label`. */
  docTitle?: (essentials: boolean) => string;
  View: ComponentType<ReportViewProps>;
};

export const REPORTS: ReportDef[] = [
  { id: "executive", label: "Executive", docTitle: (essentials) => (essentials ? "Communications" : "Executive"), View: ExecutiveReport },
  { id: "outcomes", label: "Outcomes", advancedOnly: true, View: OutcomesReport },
  { id: "growth", label: "Growth plan", View: GrowthReport },
];

export const DEFAULT_REPORT: ReportKind = "executive";

export function findReport(id: string | undefined): ReportDef | undefined {
  return REPORTS.find((r) => r.id === id);
}
