/**
 * Minimal .xlsx writer for the ROI builder's Excel download: typed sheets in,
 * zipped OOXML out. Text cells are inline strings, numbers are real numbers
 * with a number format, and blank / non-finite values are left empty.
 *
 * `fflate` is loaded on demand so it stays out of the main bundle.
 */

import {
  ROI_NUMBER_FORMATS,
  type RoiCell,
  type RoiCellFormat,
  type RoiCellStyle,
  type RoiSheetData,
} from "../../../../../shared/roiModel/workbook";
import { EXPORT_FONT, XC } from "./brand";

export interface XlsxMeta {
  title: string;
  creator: string;
  created?: Date;
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships";

/** XML-escape text and drop characters XML 1.0 can't carry. */
function esc(s: string): string {
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 0 → "A", 25 → "Z", 26 → "AA". */
function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// ---------- styles ----------

/** Fonts: 0 normal, 1 bold, 2 bold white (header), 3 large bold navy (title). */
const FONT_FOR: Record<RoiCellStyle | "none", number> = { none: 0, bold: 1, plan: 1, header: 2, title: 3 };

/** Collects the distinct (format, style) pairs used and gives each a cellXfs index. */
class StyleTable {
  private ids = new Map<string, number>();
  readonly xfs: { fmt: RoiCellFormat | null; style: RoiCellStyle | null }[] = [{ fmt: null, style: null }];

  index(c: RoiCell): number {
    // Text cells are inline strings, so they need no "@" format.
    const fmt = c.fmt && c.fmt !== "general" && c.fmt !== "text" ? c.fmt : null;
    const style = c.style ?? null;
    if (!fmt && !style) return 0;
    const key = `${fmt}|${style}`;
    let id = this.ids.get(key);
    if (id == null) {
      id = this.xfs.length;
      this.xfs.push({ fmt, style });
      this.ids.set(key, id);
    }
    return id;
  }

  xml(): string {
    const kinds = Object.keys(ROI_NUMBER_FORMATS).filter((k) => k !== "general" && k !== "text") as RoiCellFormat[];
    const numFmtId = (k: RoiCellFormat | null) => (k == null ? 0 : 164 + kinds.indexOf(k));
    // Child order as Excel writes it: b, sz, color, name, family.
    const navy = `<color rgb="FF${XC.navy}"/>`;
    const font = (bold: boolean, size = 10, color = "") =>
      `<font>${bold ? "<b/>" : ""}<sz val="${size}"/>${color}<name val="${EXPORT_FONT}"/><family val="2"/></font>`;
    const xf = ({ fmt, style }: StyleTable["xfs"][number]) => {
      const f = FONT_FOR[style ?? "none"];
      const fill = style === "header" ? 2 : 0;
      const border = style === "plan" ? 1 : 0;
      const attrs = [
        `numFmtId="${numFmtId(fmt)}"`,
        `fontId="${f}"`,
        `fillId="${fill}"`,
        `borderId="${border}"`,
        `xfId="0"`,
        fmt ? `applyNumberFormat="1"` : "",
        f ? `applyFont="1"` : "",
        fill ? `applyFill="1"` : "",
        border ? `applyBorder="1"` : "",
      ].filter(Boolean).join(" ");
      return `<xf ${attrs}/>`;
    };
    const side = (n: string) => `<${n} style="medium">${navy}</${n}>`;
    return (
      XML_HEAD +
      `<styleSheet xmlns="${NS_MAIN}">` +
      `<numFmts count="${kinds.length}">${kinds.map((k) => `<numFmt numFmtId="${numFmtId(k)}" formatCode="${esc(ROI_NUMBER_FORMATS[k])}"/>`).join("")}</numFmts>` +
      `<fonts count="4">${font(false)}${font(true)}${font(true, 10, '<color rgb="FFFFFFFF"/>')}${font(true, 14, navy)}</fonts>` +
      `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FF${XC.navy}"/><bgColor indexed="64"/></patternFill></fill></fills>` +
      `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>` +
      `<border>${side("left")}${side("right")}${side("top")}${side("bottom")}<diagonal/></border></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="${this.xfs.length}">${this.xfs.map(xf).join("")}</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
      `</styleSheet>`
    );
  }
}

// ---------- sheets ----------

function cellXml(c: RoiCell, ref: string, styles: StyleTable): string {
  const s = styles.index(c);
  const sAttr = s ? ` s="${s}"` : "";
  if (typeof c.v === "number" && Number.isFinite(c.v)) return `<c r="${ref}"${sAttr}><v>${c.v}</v></c>`;
  if (typeof c.v === "string" && c.v !== "") return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
  // Empty (null, "", NaN, ±Infinity): keep the cell only if it carries a style.
  return s ? `<c r="${ref}"${sAttr}/>` : "";
}

function sheetXml(sheet: RoiSheetData, styles: StyleTable, selected: boolean): string {
  const width = Math.max(1, sheet.colWidths.length, ...sheet.rows.map((r) => r.length));
  const height = Math.max(1, sheet.rows.length);
  const freeze = sheet.freezeRows > 0;
  const topLeft = `A${sheet.freezeRows + 1}`;
  const view =
    `<sheetView workbookViewId="0"${selected ? ' tabSelected="1"' : ""}>` +
    (freeze
      ? `<pane ySplit="${sheet.freezeRows}" topLeftCell="${topLeft}" activePane="bottomLeft" state="frozen"/>` +
        `<selection pane="bottomLeft" activeCell="${topLeft}" sqref="${topLeft}"/>`
      : `<selection activeCell="A1" sqref="A1"/>`) +
    `</sheetView>`;
  const cols = sheet.colWidths.length
    ? `<cols>${sheet.colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const rows = sheet.rows
    .map((r, ri) => {
      const cells = r.map((c, ci) => cellXml(c, colName(ci) + (ri + 1), styles)).join("");
      return cells ? `<row r="${ri + 1}">${cells}</row>` : "";
    })
    .join("");
  return (
    XML_HEAD +
    `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    `<dimension ref="A1:${colName(width - 1)}${height}"/>` +
    `<sheetViews>${view}</sheetViews>` +
    `<sheetFormatPr defaultRowHeight="13.2"/>` +
    cols +
    `<sheetData>${rows}</sheetData>` +
    `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>` +
    `</worksheet>`
  );
}

// ---------- package ----------

const w3cdtf = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

/** Build the .xlsx file bytes for these sheets. */
export async function buildXlsx(sheets: RoiSheetData[], meta: XlsxMeta): Promise<Uint8Array> {
  const { zipSync, strToU8 } = await import("fflate");
  const styles = new StyleTable();
  const sheetFiles = sheets.map((s, i) => sheetXml(s, styles, i === 0));
  const created = w3cdtf(meta.created ?? new Date());

  const files: Record<string, string> = {
    "[Content_Types].xml":
      XML_HEAD +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
      `</Types>`,
    "_rels/.rels":
      XML_HEAD +
      `<Relationships xmlns="${NS_PKG_REL}">` +
      `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
      `</Relationships>`,
    "docProps/core.xml":
      XML_HEAD +
      `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
      `<dc:title>${esc(meta.title)}</dc:title><dc:creator>${esc(meta.creator)}</dc:creator><cp:lastModifiedBy>${esc(meta.creator)}</cp:lastModifiedBy>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>` +
      `</cp:coreProperties>`,
    "xl/workbook.xml":
      XML_HEAD +
      `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
      `<bookViews><workbookView activeTab="0"/></bookViews>` +
      `<sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>` +
      `</workbook>`,
    "xl/_rels/workbook.xml.rels":
      XML_HEAD +
      `<Relationships xmlns="${NS_PKG_REL}">` +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
      `<Relationship Id="rId${sheets.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>` +
      `</Relationships>`,
    // Written after the sheets so every style they use is registered.
    "xl/styles.xml": styles.xml(),
  };
  sheetFiles.forEach((xml, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = xml));

  const zipped: Record<string, Uint8Array> = {};
  for (const [path, xml] of Object.entries(files)) zipped[path] = strToU8(xml);
  return zipSync(zipped, { level: 6 });
}
