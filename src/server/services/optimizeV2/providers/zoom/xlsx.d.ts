// Types for xlsx.js (kept as JavaScript; see its header).
import type { Scorecard } from "../../engine/types";

/** Patch the embedded scorecard template with a run's values; returns .xlsx bytes. */
export function buildWorkbook(result: { scorecard: Scorecard }): Uint8Array;
