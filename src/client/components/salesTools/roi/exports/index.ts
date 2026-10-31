/**
 * Entry point for the ROI builder's document exports. The UI loads this
 * module with a dynamic import, and each builder lazy-loads its own library
 * (`docx`, `pptxgenjs`), so neither lands in the main bundle.
 *
 * Both functions throw on failure; the caller shows the error toast.
 */

import { downloadBlob } from "../../../../lib/exportKit";
import type { RoiInputs, RoiResult } from "../../../../../shared/roiModel/types";
import { exportFileName } from "./brand";
import { chartPng } from "./chartPng";
import { buildRoiPptx } from "./ppt";
import { buildRoiWordDocument } from "./word";

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
