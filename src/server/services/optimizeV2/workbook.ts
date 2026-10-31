// Downloadable scorecard workbook (.xlsx) for a stored run. Each provider keeps
// the standalone app's template and builder; this picks the right one and names
// the file. Built on demand from result.json (a template patch, no API calls),
// so the workbook always matches the run and the current builder.
import { buildWorkbook as buildRingCentralWorkbook } from "./providers/ringcentral/xlsx";
import type { RcSnapshot } from "./providers/ringcentral/assess";
import { buildWorkbook as buildZoomWorkbook } from "./providers/zoom/xlsx";
import type { RunRow, StoredResult } from "./store";

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export class WorkbookUnavailableError extends Error {}

export function buildRunWorkbook(run: RunRow, result: StoredResult, customerName: string): Uint8Array {
  if (run.platform === "zoom") return buildZoomWorkbook(result);
  // The RingCentral builder reads the engine's native snapshot, as the original did.
  const native = result.native as RcSnapshot | undefined;
  if (!native) throw new WorkbookUnavailableError("This run has no RingCentral snapshot to build a workbook from");
  return buildRingCentralWorkbook(native, customerName);
}

const PLATFORM_LABEL: Record<RunRow["platform"], string> = { zoom: "Zoom", ringcentral: "RingCentral" };

/** `<customer>-<platform>-scorecard-<date>.xlsx`, reduced to filename-safe ASCII. */
export function workbookFilename(run: RunRow, customerName: string): string {
  const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const customer = slug(customerName).slice(0, 60) || "customer";
  const date = /^\d{4}-\d{2}-\d{2}/.test(run.created_at) ? run.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
  return `${customer}-${PLATFORM_LABEL[run.platform] ?? slug(run.platform)}-scorecard-${date}.xlsx`;
}
