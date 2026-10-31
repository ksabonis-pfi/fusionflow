import type { RcIndex, RcKpiRow, RcLayer } from "./types";

export const LAYERS: { id: number; name: string; description?: string }[];
export const LAYER_NAME: Record<number, string>;
export function attainment(v: number | null, target: number | null, dir: string): number | null;
export function grade(s: number | null): string;
export function scoreLayers(rows: RcKpiRow[]): RcLayer[];
export function computeIndices(rows: RcKpiRow[]): RcIndex[];
export function overallScore(layers: RcLayer[]): number | null;
