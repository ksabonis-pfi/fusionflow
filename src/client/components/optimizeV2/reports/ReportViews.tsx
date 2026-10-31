// One component per report in the Reports list (see catalog.ts). Each takes the
// run + result + Zoom audience and picks the platform's readout.
import { useMemo } from "react";
import type { ReportResult, ReportRun, ZoomTrack } from "./types";
import { buildZoomReportModel } from "./zoom/model";
import { ZoomExecutive, ZoomGrowth, ZoomOutcomes } from "./zoom/ZoomReadouts";
import { buildRcReportModel } from "./ringcentral/model";
import { RcExecutive, RcGrowth, RcOutcomes } from "./ringcentral/RcReadouts";

export type ReportViewProps = { result: ReportResult; run: ReportRun; isZoom: boolean; track: ZoomTrack };

function useReadoutModel({ result, run, isZoom, track }: ReportViewProps) {
  return useMemo(
    () => (isZoom
      ? { zoom: buildZoomReportModel(result, run, track), rc: null }
      : { zoom: null, rc: buildRcReportModel(result, run) }),
    [result, run, isZoom, track],
  );
}

export function ExecutiveReport(p: ReportViewProps) {
  const { zoom, rc } = useReadoutModel(p);
  return zoom ? <ZoomExecutive m={zoom} /> : <RcExecutive m={rc!} />;
}

export function OutcomesReport(p: ReportViewProps) {
  const { zoom, rc } = useReadoutModel(p);
  return zoom ? <ZoomOutcomes m={zoom} /> : <RcOutcomes m={rc!} />;
}

export function GrowthReport({ result, run, isZoom }: ReportViewProps) {
  return isZoom ? <ZoomGrowth result={result} run={run} /> : <RcGrowth result={result} run={run} />;
}
