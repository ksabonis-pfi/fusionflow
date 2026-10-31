// Ported from the standalone Zoom Optimization agent (xlsx.js, v3.2.0).
// Kept as JavaScript, close to the original; xlsx.d.ts types its surface.
// Changes: an appended KPI row with no target leaves the Target cell empty
// instead of writing "null" into a numeric cell.

// In-Worker .xlsx generation: patch the embedded scorecard template with a run's
// values (Scorecard, Config Audit, PrePost), preserving all formulas. Pure-JS via
// fflate — runs at the edge, no python. Mirrors tools/populate_workbook.py.

import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { TEMPLATE_B64 } from "./template_xlsx.js";

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const xesc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function sheetTargets(z) {
  const wb = strFromU8(z["xl/workbook.xml"]);
  const rels = strFromU8(z["xl/_rels/workbook.xml.rels"]);
  const relMap = Object.fromEntries([...rels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  const out = {};
  for (const m of wb.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g))
    out[m[1]] = "xl/" + (relMap[m[2]] || "").replace(/^\//, "");
  return out;
}
function parseSS(z) {
  if (!z["xl/sharedStrings.xml"]) return [];
  const xml = strFromU8(z["xl/sharedStrings.xml"]);
  return [...xml.matchAll(/<si>(.*?)<\/si>/gs)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((t) => t[1]).join("")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
}
const cellStr = (sheet, ss, ref) => {
  const m = sheet.match(new RegExp(`<c r="${ref}"[^>]*t="s"[^>]*>\\s*<v>(\\d+)</v>`));
  return m ? (ss[+m[1]] ?? "") : null;
};
function setCell(sheet, ref, inner /* "" clears */) {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(\\/>|>.*?</c>)`, "s");
  if (!re.test(sheet)) return sheet;
  return sheet.replace(re, (_, attrs) => {
    const s = (attrs.match(/ s="\d+"/) || [""])[0];
    return inner === "" ? `<c r="${ref}"${s}/>` : `<c r="${ref}"${s} ${inner}</c>`;
  });
}
const numCell = (sheet, ref, v) => setCell(sheet, ref, v == null || v === "" ? "" : `t="n"><v>${v}</v>`);
const strCell = (sheet, ref, t) => setCell(sheet, ref, t == null || t === "" ? "" : `t="inlineStr"><is><t>${xesc(t)}</t></is>`);

const valMap = (kpis) => {
  const m = {};
  for (const k of kpis) if (k.available && k.value != null) m[norm(k.label)] = k.value;
  return m;
};
const statusFormula = (r) =>
  `<c r="H${r}" s="22" t="str"><f aca="false">IF(D${r}="","—",IF(F${r}="higher_is_better",IF(D${r}&gt;=G${r},"On Target","Below Target"),IF(D${r}&lt;=G${r},"On Target","Off Target")))</f></c>`;

function appendedRow(r, k, layerLabel) {
  const dir = k.dir === "higher" ? "higher_is_better" : "lower_is_better";
  const d = k.available && k.value != null ? `<c r="D${r}" s="17" t="n"><v>${k.value}</v></c>` : `<c r="D${r}" s="17"/>`;
  return `<row r="${r}">` +
    `<c r="A${r}" s="15" t="inlineStr"><is><t>${xesc(k.layer + ". " + (layerLabel[k.layer] || ""))}</t></is></c>` +
    `<c r="B${r}" s="16" t="inlineStr"><is><t>${xesc(k.label)}</t></is></c>` +
    `<c r="C${r}" s="16" t="inlineStr"><is><t>${xesc(k.product || "")}</t></is></c>` + d +
    `<c r="E${r}" s="17" t="inlineStr"><is><t>${xesc(k.unit || "")}</t></is></c>` +
    `<c r="F${r}" s="16" t="inlineStr"><is><t>${dir}</t></is></c>` +
    (k.target == null ? `<c r="G${r}" s="17"/>` : `<c r="G${r}" s="17" t="n"><v>${k.target}</v></c>`) + statusFormula(r) + `</row>`;
}

function patchScorecard(sheet, ss, kpis, layerLabel) {
  const vals = valMap(kpis);
  const seen = new Set();
  let out = sheet, last = 0;
  for (const m of sheet.matchAll(/<row r="(\d+)"/g)) last = Math.max(last, +m[1]);
  for (const m of sheet.matchAll(/<row r="(\d+)"/g)) {
    const r = +m[1]; if (r < 4) continue;
    const label = cellStr(sheet, ss, "B" + r); if (!label) continue;
    seen.add(norm(label));
    out = norm(label) in vals ? numCell(out, "D" + r, vals[norm(label)]) : numCell(out, "D" + r, "");
  }
  let r = last, add = "";
  for (const k of kpis) { if (seen.has(norm(k.label))) continue; r++; add += appendedRow(r, k, layerLabel); }
  if (add) {
    out = out.replace("</sheetData>", add + "</sheetData>");
    out = out.replace(/<dimension ref="[^"]*"\s*\/>/, `<dimension ref="A1:H${r}"/>`);
  }
  return out;
}
function patchAudit(sheet, ss, rows) {
  const cur = {}; for (const a of rows) if (a.current) cur[norm(a.setting)] = a.current;
  let out = sheet;
  for (const m of sheet.matchAll(/<row r="(\d+)"/g)) {
    const r = +m[1]; const setting = cellStr(sheet, ss, "B" + r); if (!setting) continue;
    const v = cur[norm(setting)] || Object.entries(cur).find(([k]) => k.includes(norm(setting)) || norm(setting).includes(k))?.[1];
    if (v) out = strCell(out, "D" + r, v);
  }
  return out;
}
function patchPrePost(sheet, ss, kpis) {
  const vals = valMap(kpis);
  let out = sheet;
  for (const m of sheet.matchAll(/<row r="(\d+)"/g)) {
    const r = +m[1]; const label = cellStr(sheet, ss, "A" + r); if (!label) continue;
    const v = vals[norm(label)] ?? Object.entries(vals).find(([k]) => k.includes(norm(label)) || norm(label).includes(k))?.[1];
    if (v != null) out = numCell(out, "E" + r, v); // Post column
  }
  return out;
}

export function buildWorkbook(result) {
  const z = unzipSync(Uint8Array.from(atob(TEMPLATE_B64), (c) => c.charCodeAt(0)));
  const t = sheetTargets(z);
  const ss = parseSS(z);
  const kpis = result.scorecard.layers.flatMap((l) => l.kpis);
  const layerLabel = Object.fromEntries(result.scorecard.layers.map((l) => [l.layer, l.label]));
  if (t["Scorecard"]) z[t["Scorecard"]] = strToU8(patchScorecard(strFromU8(z[t["Scorecard"]]), ss, kpis, layerLabel));
  if (t["Config Audit"]) z[t["Config Audit"]] = strToU8(patchAudit(strFromU8(z[t["Config Audit"]]), ss, result.scorecard.configAudit?.rows || []));
  if (t["PrePost"]) z[t["PrePost"]] = strToU8(patchPrePost(strFromU8(z[t["PrePost"]]), ss, kpis));
  return zipSync(z, { level: 6 });
}
