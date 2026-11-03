/**
 * Entry point for the ROI builder's document exports. The UI loads this
 * module with a dynamic import, and each builder lazy-loads its own library
 * (`docx`, `pptxgenjs`, `fflate`), so none lands in the main bundle.
 *
 * Every function throws on failure; the caller shows the error toast.
 */

import { downloadBlob } from "../../../../lib/exportKit";
import type { RoiInputs, RoiResult } from "../../../../../shared/roiModel/types";
import { buildRoiWorkbookData } from "../../../../../shared/roiModel/workbook";
import { exportDataFileName, exportFileName } from "./brand";
import { chartPng } from "./chartPng";
import { buildRoiPptx } from "./ppt";
import { buildRoiWordDocument } from "./word";
import { buildXlsx } from "./xlsx";

export async function exportRoiWord(inputs: RoiInputs, result: RoiResult): Promise<void> {
  const charts = { calls: chartPng("calls", result), save: chartPng("save", result) };
  const doc = await buildRoiWordDocument(inputs, result, charts);
  const { Packer } = await import("docx");
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, exportFileName(inputs.client, "docx"));
}

export async function exportRoiPpt(inputs: RoiInputs, result: RoiResult): Promise<void> {
  const deck = await buildRoiPptx(inputs, result);
  const blob = (await deck.write({ outputType: "blob" })) as Blob;
  downloadBlob(blob, exportFileName(inputs.client, "pptx"));
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Real numbers with Excel formats, for pulling ROI figures into proposals. */
export async function exportRoiExcel(inputs: RoiInputs, result: RoiResult): Promise<void> {
  const created = new Date();
  const sheets = buildRoiWorkbookData(inputs, result, { date: created });
  const bytes = await buildXlsx(sheets, {
    title: `${inputs.client || "Client"}: AI Agent ROI Analysis`,
    creator: "Packet Fusion",
    created,
  });
  downloadBlob(new Blob([bytes as BlobPart], { type: XLSX_MIME }), exportDataFileName(inputs.client));
}
