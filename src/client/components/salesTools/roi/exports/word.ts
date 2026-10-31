/**
 * Word report for the AI Agent ROI builder: a port of the original builder's
 * `exportWord`. US Letter, about nine pages: cover tiles, executive summary,
 * today, how the model works, two charts, the three-year table, the
 * calculation walkthrough, sensitivity, assumptions and items to confirm.
 *
 * `docx` is loaded with a dynamic import so it stays out of the main bundle.
 * This module touches no DOM; the caller supplies the chart PNGs (see
 * chartPng.ts) and packs the returned Document.
 */

import type { Document as DocxDocument, Paragraph as DocxParagraph, Table as DocxTable, TextRun as DocxTextRun, ParagraphChild } from "docx";
import { ROI_STEPS } from "../../../../../shared/roiModel/fields";
import { showInput, sensDiscDigits, xf } from "../../../../../shared/roiModel/format";
import { buildStory } from "../../../../../shared/roiModel/story";
import type { RoiInputs, RoiResult } from "../../../../../shared/roiModel/types";
import { EXPORT_FONT, XC, clientLabel, exportDate } from "./brand";

export interface RoiChartImages {
  calls: Uint8Array;
  save: Uint8Array;
}

interface RunOpts {
  size?: number;
  bold?: boolean;
  italics?: boolean;
  color?: string;
}

type DataRow =
  | { band: string }
  | { c: string[]; bold?: boolean; key?: boolean; fill?: string };

export async function buildRoiWordDocument(
  p: RoiInputs,
  o: RoiResult,
  charts: RoiChartImages | null,
): Promise<DocxDocument> {
  const D = await import("docx");
  const {
    Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType,
    HeadingLevel, BorderStyle, ImageRun, Header, Footer, PageNumber, LevelFormat, TabStopType, VerticalAlign,
  } = D;
  type Align = (typeof AlignmentType)[keyof typeof AlignmentType];

  const R = o.R, H = o.H, S = buildStory(p, o);
  const F = EXPORT_FONT, W = 10080, client = clientLabel(p.client);

  const t = (text: unknown, x: RunOpts = {}): DocxTextRun =>
    new TextRun({ text: String(text), font: F, size: x.size || 20, bold: x.bold, italics: x.italics, color: x.color || XC.ink });
  const para = (
    runs: string | ParagraphChild[],
    x: RunOpts & { after?: number; before?: number; align?: Align; keepNext?: boolean } = {},
  ): DocxParagraph =>
    new Paragraph({
      children: Array.isArray(runs) ? runs : [t(runs, x)],
      spacing: { after: x.after ?? 140, before: x.before ?? 0, line: 276 },
      alignment: x.align,
      keepNext: x.keepNext,
    });
  const h1 = (s: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_1, keepNext: true, spacing: { before: 320, after: 120 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: XC.green, space: 4 } },
      children: [new TextRun({ text: s, font: F, bold: true, size: 32, color: XC.navy })],
    });
  const h2 = (s: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2, keepNext: true, spacing: { before: 240, after: 100 },
      children: [new TextRun({ text: s, font: F, bold: true, size: 24, color: XC.navy })],
    });
  const bullet = (runs: ParagraphChild[]) =>
    new Paragraph({ numbering: { reference: "b", level: 0 }, spacing: { after: 80, line: 276 }, children: runs });
  const bd = { style: BorderStyle.SINGLE, size: 4, color: XC.grey };
  const borders = { top: bd, bottom: bd, left: bd, right: bd };
  const cell = (text: string, w: number, x: RunOpts & { span?: number; fill?: string; align?: Align } = {}) =>
    new TableCell({
      width: { size: w, type: WidthType.DXA }, borders, verticalAlign: VerticalAlign.CENTER, columnSpan: x.span,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      shading: x.fill ? { type: ShadingType.CLEAR, color: "auto", fill: x.fill } : undefined,
      children: [new Paragraph({ alignment: x.align || AlignmentType.LEFT, children: [t(text, { size: x.size || 17, bold: x.bold, color: x.color })] })],
    });
  const table = (ws: number[], rows: InstanceType<typeof TableRow>[]): DocxTable =>
    new Table({ width: { size: ws.reduce((a, b) => a + b), type: WidthType.DXA }, columnWidths: ws, rows });
  const dataTable = (ws: number[], head: string[], rows: DataRow[], left: number[] = [0]) => {
    const al = (i: number) => (left.includes(i) ? AlignmentType.LEFT : AlignmentType.RIGHT);
    return table(ws, [
      new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, ws[i], { fill: XC.navy, color: "FFFFFF", bold: true, size: 16, align: al(i) })) }),
      ...rows.map((r) =>
        "band" in r
          ? new TableRow({ cantSplit: true, children: [cell(r.band.toUpperCase(), W, { span: ws.length, fill: XC.light, bold: true, color: XC.navy, size: 15 })] })
          : new TableRow({
              cantSplit: true,
              children: r.c.map((v, i) =>
                cell(v, ws[i], {
                  align: al(i), bold: r.bold || r.key, fill: r.fill,
                  color: r.key ? XC.greenInk : i && String(v).startsWith("-") ? XC.red : undefined,
                }),
              ),
            }),
      ),
    ]);
  };
  const tiles = (items: [string, string][]) => {
    const w = W / 3, rows: InstanceType<typeof TableRow>[] = [];
    const nb = { style: BorderStyle.SINGLE, size: 24, color: "FFFFFF" };
    for (let i = 0; i < items.length; i += 3)
      rows.push(new TableRow({
        children: items.slice(i, i + 3).map(([v, l]) => new TableCell({
          width: { size: w, type: WidthType.DXA },
          borders: { top: { style: BorderStyle.SINGLE, size: 18, color: XC.green }, bottom: nb, left: nb, right: nb },
          shading: { type: ShadingType.CLEAR, color: "auto", fill: XC.light },
          margins: { top: 140, bottom: 140, left: 160, right: 160 },
          children: [
            new Paragraph({ spacing: { after: 40 }, children: [t(v, { size: 32, bold: true, color: XC.navy })] }),
            new Paragraph({ children: [t(l, { size: 16, color: XC.muted })] }),
          ],
        })),
      }));
    return table([w, w, w], rows);
  };
  const callout = (lines: ParagraphChild[][]) => {
    const nb = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
    return table([W], [new TableRow({
      children: [new TableCell({
        width: { size: W, type: WidthType.DXA },
        shading: { type: ShadingType.CLEAR, color: "auto", fill: XC.light },
        borders: { left: { style: BorderStyle.SINGLE, size: 36, color: XC.green }, top: nb, bottom: nb, right: nb },
        margins: { top: 140, bottom: 140, left: 220, right: 220 },
        children: lines.map((r) => new Paragraph({ spacing: { after: 60, line: 276 }, children: r })),
      })],
    })]);
  };
  const img = (data: Uint8Array) =>
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new ImageRun({ type: "png", data, transformation: { width: 640, height: 295 } })] });
  const cap = (s: string) => para([t(s, { size: 16, color: XC.muted, italics: true })], { align: AlignmentType.CENTER, after: 200 });
  const yr = (arr: (number | null)[], f: (v: number) => string, tot?: number | null) =>
    [0, 1, 2, 3].map((i) => (arr[i] == null ? "—" : f(arr[i] as number))).concat([tot == null ? "—" : f(tot)]);
  const rr = (label: string, arr: (number | null)[], f: (v: number) => string, tot?: number | null, x: { bold?: boolean; key?: boolean } = {}): DataRow =>
    ({ c: [label, ...yr(arr, f, tot)], ...x });

  const c: (DocxParagraph | DocxTable)[] = [];
  c.push(para([t("PACKET FUSION", { size: 20, bold: true, color: XC.green })], { after: 200 }));
  c.push(para([t("AI Agent ROI Analysis", { size: 52, bold: true, color: XC.navy })], { after: 60 }));
  c.push(para([t(`${client} · AI agent business case · 3 years`, { size: 26, color: XC.navy })], { after: 60 }));
  c.push(para([t(`${exportDate()}  |  Prepared by Packet Fusion  |  For discussion`, { size: 18, color: XC.muted })], { after: 300 }));
  c.push(tiles(S.headline));
  c.push(h1("Executive summary"));
  c.push(para(S.intro));
  c.push(para(S.plan));
  S.bullets.forEach(([a, b]) => c.push(bullet([t(a, { bold: true }), t(b)])));
  if (S.confirm.length) {
    c.push(para("", { after: 60 }));
    c.push(callout([[t("Inputs still to confirm: ", { bold: true, color: XC.navy }), t(`${S.confirm.length} assumptions are placeholders or industry estimates. They're listed at the end of this report and should be validated before final decisions are made.`)]]));
  }
  c.push(h1(`Where ${client} is today`));
  c.push(dataTable([5080, 5000], ["Measure", "Today"], S.today.map((r, i) => ({ c: r, bold: i === S.today.length - 1 }))));
  c.push(h1("How the model works"));
  c.push(para("Each year, the model follows every call: how many go to the AI, how many the AI resolves on its own, how many still need an agent, and how many are abandoned. It assumes each year's abandonment target is met. It then sizes the agent team for the human workload, which is the inbound calls agents answer plus the outbound calls agents place, at today's calls per agent."));
  c.push(para("Savings are shown two ways:"));
  c.push(bullet([t("View A, vs. today's budget: ", { bold: true }), t("total cost with the AI agent compared with what is spent on agents today. This is the conservative, budget-to-budget number.")]));
  c.push(bullet([t("View B, vs. hiring to hit targets: ", { bold: true }), t("total cost with the AI agent compared with hiring enough agents to reach the same abandonment targets without AI. This is the fair comparison if service levels are going to be fixed either way.")]));
  c.push(h1("Results"));
  c.push(h2("What happens to every call"));
  if (charts) c.push(img(charts.calls));
  c.push(cap("Inbound calls by outcome each year."));
  c.push(h2("Net annual savings"));
  if (charts) c.push(img(charts.save));
  c.push(cap("Net savings each year under both views."));
  c.push(h2("Three-year ROI detail"));
  c.push(dataTable([3280, 1360, 1360, 1360, 1360, 1360], ["Line item", "Today", "Year 1", "Year 2", "Year 3", "3-yr total"], [
    { band: "Call volume" },
    rr("Inbound calls offered", R.offered, xf.int), rr("Calls routed to AI agent", R.routed, xf.int), rr("Calls fully resolved by AI", R.contained, xf.int), rr("Calls still needing a human", R.human, xf.int),
    rr("Calls answered (total)", R.answered, xf.int), rr("Calls abandoned", R.abandoned, xf.int), rr("Additional callers served vs. today", R.added, xf.int), rr("Outbound calls placed", R.outbound, xf.int), rr("Outbound calls placed by AI", R.outAIc, xf.int),
    { band: "Staffing" },
    rr("Human agents required", R.req, xf.one), rr("Agents needed to hit target without AI", R.needed, xf.one), rr("Agents offset vs. today", R.offset, xf.one, null, { key: true }),
    { band: "Annual cost" },
    rr("Human labor (fully loaded)", R.labor, xf.usd, H.tot.labor), rr("Turnover / onboarding", R.turn, xf.usd, H.tot.turn), rr("AI voice conversations", R.voice, xf.usd, H.tot.voice), rr("AI digital conversations", R.digital, xf.usd, H.tot.digital),
    rr("Implementation", R.impl, xf.usd, H.tot.impl), rr("Managed services", R.admin, xf.usd, H.tot.admin), rr("Total cost with AI agent", R.total, xf.usd, H.tot.total, { bold: true }),
    { band: "View A: savings vs. today's budget" },
    rr("Net savings vs. today's spend", R.saveA, xf.usd, H.tot.saveA, { key: true }),
    { band: "View B: savings vs. hiring to fix abandonment" },
    rr("Cost of human-only plan", R.humanOnly, xf.usd, H.tot.humanOnly), rr("Net savings vs. human-only plan", R.saveB, xf.usd, H.tot.saveB, { key: true }),
    { band: "Unit economics" },
    rr("Human cost per handled call", R.costPerCall, xf.usd2), rr("AI cost per AI-handled call", R.aiPerResolved, xf.usd2), rr("Break-even containment", R.breakeven, (v) => xf.pct(v)),
  ]));
  c.push(h1("How we got to these numbers"));
  c.push(para("Each step below uses the inputs in the assumptions section. Every result feeds the next step, so you can trace any headline figure back to its source."));
  S.calc.forEach((st) => {
    c.push(h2(st.t));
    c.push(para(st.d, { keepNext: true }));
    c.push(dataTable([2900, 5180, 2000], ["Item", "How it's calculated", "Result"], st.rows.map((r, i) => ({ c: r, bold: i === st.rows.length - 1 })), [0, 1]));
    c.push(para("", { after: 60 }));
  });
  c.push(h1("Sensitivity"));
  c.push(para(`How Year 3 savings vs. the human-only plan change with AI containment (rows) and the discount off the ${xf.usd2(p.listPrice)} list price (columns). The highlighted cell is the current plan.`));
  const sw = [2080, 1600, 1600, 1600, 1600, 1600];
  c.push(table(sw, [
    new TableRow({
      tableHeader: true,
      children: ["Containment / Discount", ...o.sensD.map((d) => xf.pct(d, sensDiscDigits(d)))].map((h, i) =>
        cell(h, sw[i], { fill: XC.navy, color: "FFFFFF", bold: true, size: 16, align: i ? AlignmentType.RIGHT : AlignmentType.LEFT })),
    }),
    ...o.S.map((r, i) => new TableRow({
      children: [
        cell(xf.pct(o.sensC[i], 0), sw[0], { bold: true }),
        ...r.map((v, j) => {
          const plan = Math.abs(o.sensC[i] - p.contain[2]) < 1e-9 && j === 4;
          return cell(xf.M1(v), sw[j + 1], { align: AlignmentType.RIGHT, fill: plan ? "D4F5E2" : undefined, bold: plan, color: v < 0 ? XC.red : plan ? XC.greenInk : undefined });
        }),
      ],
    })),
  ]));
  c.push(para("", { after: 60 }));
  c.push(para(`At ${xf.pct(o.sensC[0], 0)} containment and full list price, Year 3 savings would be ${xf.M1(o.S[0][0])}.`));
  c.push(h1("Assumptions"));
  c.push(para([t("Inputs marked "), t("To confirm", { bold: true, color: XC.red }), t(" are placeholders or industry estimates that should be validated.")]));
  ROI_STEPS.forEach((s) => {
    c.push(h2(`${s.eyebrow}: ${s.title}`));
    c.push(dataTable([3400, 1900, 3580, 1200], ["Input", "Value", "Source / note", "Status"],
      s.fields.filter((f) => f.k !== "client").map((f) => ({
        c: [f.label + (f.type.endsWith("3") ? " (Yr 1 / 2 / 3)" : ""), showInput(f, p[f.k]), f.help, f.flag ? "To confirm" : "Set"],
      })),
      [0, 2, 3]));
  });
  if (S.confirm.length) {
    c.push(h1("Items to confirm"));
    S.confirm.forEach(([a, b]) => c.push(bullet([t(a, { bold: true }), t(b)])));
  }
  c.push(para("", { after: 80 }));
  c.push(para([t("Source: Packet Fusion AI Agent ROI Builder. Figures are planning estimates, not a quote or a guarantee of results.", { size: 16, color: XC.muted, italics: true })]));

  return new Document({
    creator: "Packet Fusion",
    title: `AI Agent ROI Analysis – ${client}`,
    styles: { default: { document: { run: { font: F, size: 20, color: XC.ink } } } },
    numbering: {
      config: [{
        reference: "b",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 440, hanging: 260 } }, run: { color: XC.green } } }],
      }],
    },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
      headers: {
        default: new Header({
          children: [new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: W }],
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: XC.grey, space: 4 } },
            children: [t("Packet Fusion", { size: 16, bold: true, color: XC.navy }), t(`\tAI Agent ROI Analysis · ${client}`, { size: 16, color: XC.muted })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: W }],
            children: [new TextRun({ children: ["\tPage ", PageNumber.CURRENT], font: F, size: 16, color: XC.muted })],
          })],
        }),
      },
      children: c,
    }],
  });
}
