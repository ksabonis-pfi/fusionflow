// Ported verbatim from the standalone RingCentral Optimization agent (xlsx.js, v0.3.x).
// Kept as JavaScript, close to the validated original; xlsx.d.ts types its
// surface. No changes: it is fed the engine's native snapshot (`result.native`),
// which is the same shape the original stored as a run's scorecard.

// In-Worker .xlsx generation: patch the embedded scorecard template with a run's
// values, preserving every formula, style and conditional format. Pure JS via
// fflate — runs at the edge, no Python, no exceljs in the Worker bundle.
//
// The template and its cell map are generated from config/*.json by
// tools/build_xlsx_template.mjs, so this file never needs to know a metric
// name: it patches by KPI id through MAP.

import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { TEMPLATE_B64, MAP } from "./template_xlsx.js";

const xesc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Map sheet name -> part path, resolving workbook relationships. */
function sheetTargets(z) {
  const wb = strFromU8(z["xl/workbook.xml"]);
  const rels = {};
  for (const m of strFromU8(z["xl/_rels/workbook.xml.rels"]).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = (m[0].match(/Id="([^"]+)"/) || [])[1];
    const tg = (m[0].match(/Target="([^"]+)"/) || [])[1];
    if (id && tg) rels[id] = tg.replace(/^\//, "").replace(/^xl\//, "");
  }
  const out = {};
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = (m[0].match(/name="([^"]+)"/) || [])[1];
    const rid = (m[0].match(/r:id="([^"]+)"/) || [])[1];
    if (name && rels[rid]) out[name] = "xl/" + rels[rid];
  }
  return out;
}

/**
 * Replace a cell's contents, keeping its style index. `inner` is the XML that
 * follows the opening tag's attributes; "" clears the cell to an empty shell.
 * Returns the sheet unchanged when the cell is not in the template.
 */
function setCell(sheet, ref, inner) {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(\\/>|>[\\s\\S]*?<\\/c>)`);
  if (!re.test(sheet)) return sheet;
  return sheet.replace(re, (_, attrs) => {
    const s = (attrs.match(/ s="\d+"/) || [""])[0];
    return inner === "" ? `<c r="${ref}"${s}/>` : `<c r="${ref}"${s} ${inner}</c>`;
  });
}
const numCell = (sheet, ref, v) =>
  setCell(sheet, ref, v == null || v === "" || !Number.isFinite(Number(v)) ? "" : `t="n"><v>${Number(v)}</v>`);
const strCell = (sheet, ref, t) =>
  setCell(sheet, ref, t == null || t === "" ? "" : `t="inlineStr"><is><t xml:space="preserve">${xesc(t)}</t></is>`);

/** Flatten a run's layered KPIs into { id: kpi }. */
function kpiIndex(scorecard) {
  const flat = Array.isArray(scorecard.kpis) && scorecard.kpis.length
    ? scorecard.kpis
    : (scorecard.layers || []).flatMap((l) => l.kpis || []);
  const out = {};
  for (const k of flat) if (k && k.key) out[k.key] = k;
  return out;
}

function patchCover(sheet, scorecard, customerName) {
  const m = scorecard.meta || {};
  const s = scorecard.summary || {};
  const win = m.window || {};
  const from = (win.from || win.timeFrom || m.from_date || "").slice(0, 10);
  const to = (win.to || win.timeTo || m.to_date || "").slice(0, 10);
  let out = sheet;
  out = strCell(out, MAP.cover.customer, customerName || m.customer || "");
  out = strCell(out, MAP.cover.window, from && to ? `${from} → ${to}${win.days ? ` (${win.days} days)` : ""}` : "");
  out = strCell(out, MAP.cover.generated, (m.generated_at || "").replace("T", " ").slice(0, 16) + (m.generated_at ? " UTC" : ""));
  out = strCell(out, MAP.cover.overall,
    s.overall == null ? "Not scored" : `${s.overall} / 100  ·  ${s.overall_grade || ""}`.trim());
  return out;
}

function patchScorecard(sheet, byId) {
  let out = sheet;
  for (const [id, row] of Object.entries(MAP.scorecard)) {
    const k = byId[id];
    const measured = k && k.available && k.value != null;
    out = numCell(out, `D${row}`, measured ? k.value : "");
    out = strCell(out, `J${row}`, k && k.flagged ? k.flagReason || "sample-volume artifact — re-baseline on production volumes"
      : k && k.blockedBy ? `Not measurable: ${k.blockedBy}` : "");
  }
  return out;
}

function patchPrePost(sheet, byId) {
  let out = sheet;
  for (const [id, row] of Object.entries(MAP.prepost)) {
    const k = byId[id];
    // Flagged KPIs are excluded: a rate from too thin a window must not become
    // the "Post" side of a movement claim.
    const usable = k && k.available && k.value != null && !k.flagged;
    out = numCell(out, `E${row}`, usable ? k.value : "");
  }
  return out;
}

function patchAudit(sheet, scorecard) {
  const rows = Array.isArray(scorecard.audit) ? scorecard.audit : [];
  const byId = Object.fromEntries(rows.filter((a) => a && a.id).map((a) => [a.id, a]));
  let out = sheet;
  for (const [id, row] of Object.entries(MAP.audit)) {
    const a = byId[id];
    if (!a) { out = strCell(out, `D${row}`, ""); continue; }
    // "Current State" is what was actually observed; detail is the evidence.
    out = strCell(out, `D${row}`, a.status === "aligned" ? a.recommended : (a.detail || a.status || ""));
  }
  return out;
}

/**
 * Build the populated workbook for a stored run.
 * @param {object} scorecard the run's scorecard snapshot
 * @param {string} customerName
 * @returns {Uint8Array} .xlsx bytes
 */
export function buildWorkbook(scorecard, customerName) {
  if (!scorecard || typeof scorecard !== "object") throw new Error("No scorecard on this run.");
  const z = unzipSync(Uint8Array.from(atob(TEMPLATE_B64), (c) => c.charCodeAt(0)));
  const t = sheetTargets(z);
  const byId = kpiIndex(scorecard);

  const patch = (name, fn) => {
    if (!t[name] || !z[t[name]]) return;
    z[t[name]] = strToU8(fn(strFromU8(z[t[name]])));
  };
  patch("Cover", (s) => patchCover(s, scorecard, customerName));
  patch("Scorecard", (s) => patchScorecard(s, byId));
  patch("PrePost", (s) => patchPrePost(s, byId));
  patch("Config Audit", (s) => patchAudit(s, scorecard));

  return zipSync(z, { level: 6 });
}
