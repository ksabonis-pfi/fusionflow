// Ported verbatim from the standalone RingCentral Optimization agent (scoring.js, v0.3.x).
// Kept as JavaScript so it stays identical to the validated original; only the
// config import paths changed (the JSON now lives in ./config).

// Scoring model — mirrors the Zoom optimization agent's maths so the two
// programs produce comparable numbers.
//
//   attainment  how close a KPI is to target, 0-100, direction-aware
//   layer score mean attainment of that layer's scored KPIs
//   overall     mean of the scored layer scores
//   grade       A >=90, B >=80, C >=70, D >=60, else F
//
// Deliberately identical to Zoom's so a customer moving between the two
// programs sees the same scale.

import layerConfig from "./config/layers.json";
import indexConfig from "./config/indices.json";

const clamp = (n) => Math.max(0, Math.min(100, n));
const r1 = (n) => Math.round(n * 10) / 10;

export const LAYERS = layerConfig.layers;
export const LAYER_NAME = Object.fromEntries(LAYERS.map((l) => [l.id, l.name]));

/** 0-100, direction-aware. null when either side is missing. */
export function attainment(v, target, dir) {
  if (v == null || target == null) return null;
  if (dir === "higher") {
    if (target <= 0) return v > 0 ? 100 : 0;
    return Math.round(clamp((v / target) * 100));
  }
  // "lower is better": at or below target is full marks; 0 is perfect.
  if (v <= 0) return 100;
  if (target <= 0) return 0;          // target 0 and value > 0 → no credit
  return Math.round(clamp((target / v) * 100));
}

export function grade(s) {
  return s == null ? "N/A" : s >= 90 ? "A" : s >= 80 ? "B" : s >= 70 ? "C" : s >= 60 ? "D" : "F";
}

/**
 * Score every layer in the model — including layers with no KPIs, which
 * render as N/A rather than vanishing.
 */
export function scoreLayers(rows) {
  const byLayer = new Map(LAYERS.map((l) => [l.id, []]));
  for (const r of rows) {
    if (!byLayer.has(r.layer)) byLayer.set(r.layer, []);
    byLayer.get(r.layer).push(r);
  }

  return [...byLayer.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, kpis]) => {
      // A flagged (sample-volume) or blocked KPI must not drag a layer down.
      const scored = kpis.filter((k) => k.attainment != null && !k.flagged && k.mode !== "blocked");
      const score = scored.length
        ? Math.round(scored.reduce((a, k) => a + k.attainment, 0) / scored.length)
        : null;
      return {
        layer: id,
        label: LAYER_NAME[id] ?? `Layer ${id}`,
        score,
        grade: grade(score),
        kpis,
        populated: kpis.filter((k) => k.available).length,
        scored: scored.length,
        blocked: kpis.filter((k) => k.mode === "blocked").length,
        total: kpis.length,
      };
    });
}

/** Composite indices — mean attainment of each index's available components. */
export function computeIndices(rows) {
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  return indexConfig.indices.map((ix) => {
    const parts = ix.components
      .map((k) => byKey[k])
      .filter((r) => r && r.attainment != null && !r.flagged && r.mode !== "blocked");
    const value = parts.length ? Math.round(parts.reduce((a, r) => a + r.attainment, 0) / parts.length) : null;
    return {
      key: ix.key,
      label: ix.label,
      value,
      target: ix.target,
      note: ix.note,
      components: parts.map((p) => p.key),
      missing: ix.components.filter((k) => !parts.find((p) => p.key === k)),
      status: value == null ? "—" : value >= ix.target ? "On Target" : "Below Target",
    };
  });
}

/** Overall = mean of scored layer scores. */
export function overallScore(layers) {
  const scored = layers.filter((l) => l.score != null);
  return scored.length ? Math.round(scored.reduce((a, l) => a + l.score, 0) / scored.length) : null;
}

/**
 * Projected point lift from bringing one KPI to target.
 *
 * overall = mean(layer scores); layer score = mean(its scored KPIs' attainment).
 * So one KPI reaching 100 lifts overall by
 *   (100 − attainment) ÷ (scored KPIs in its layer) ÷ (scored layers).
 */
export function scoreLift(row, layers) {
  const layer = layers.find((l) => l.layer === row.layer);
  const nKpi = layer?.scored || 1;
  const nScored = layers.filter((l) => l.score != null).length || 1;
  return r1(((100 - row.attainment) / nKpi) / nScored);
}

export { r1 };
