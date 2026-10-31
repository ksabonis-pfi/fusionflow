// Types for xlsx.js (kept as JavaScript; see its header).
import type { RcSnapshot } from "./assess";

/** Patch the embedded scorecard template with the engine's native snapshot; returns .xlsx bytes. */
export function buildWorkbook(scorecard: RcSnapshot, customerName: string): Uint8Array;
