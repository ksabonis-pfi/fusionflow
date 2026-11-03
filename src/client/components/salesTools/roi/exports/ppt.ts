/**
 * PowerPoint deck for the AI Agent ROI builder: a port of the original
 * builder's `exportPPT`. 18 widescreen slides with native (editable) charts:
 * title, bottom line, executive summary, today, how the model works, call
 * outcomes, savings, ROI summary, seven "how we got the numbers" slides,
 * sensitivity, key assumptions and next steps.
 *
 * `pptxgenjs` is loaded with a dynamic import so it stays out of the main
 * bundle. This module touches no DOM; the caller writes the returned deck.
 */

import type PptxGenJS from "pptxgenjs";
import { ROI_FIELDS } from "../../../../../shared/roiModel/fields";
import { showInput, sensDiscDigits, xf } from "../../../../../shared/roiModel/format";
import { buildStory } from "../../../../../shared/roiModel/story";
import type { RoiField, RoiInputs, RoiResult } from "../../../../../shared/roiModel/types";
import { EXPORT_FONT, XC, clientLabel, exportDate } from "./brand";

type Cell = PptxGenJS.TableCell;
type TextProps = PptxGenJS.TextProps;

export async function buildRoiPptx(p: RoiInputs, o: RoiResult): Promise<PptxGenJS> {
  const PG = (await import("pptxgenjs")).default;
  const R = o.R, H = o.H, S = buildStory(p, o), client = clientLabel(p.client);
  const pp = new PG();
  pp.layout = "LAYOUT_WIDE";
  pp.author = "Packet Fusion";
  pp.title = `AI Agent ROI Analysis – ${client}`;
  const F = EXPORT_FONT, N = XC.navy, G = XC.green;

  pp.defineSlideMaster({
    title: "PF",
    background: { color: "FFFFFF" },
    objects: [
      { rect: { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: N } } },
      { rect: { x: 0, y: 0.12, w: 13.33, h: 0.04, fill: { color: G } } },
      { text: { text: "Packet Fusion", options: { x: 0.5, y: 7.0, w: 4, h: 0.3, fontFace: F, fontSize: 10, bold: true, color: N } } },
      { text: { text: `AI Agent ROI Analysis · ${client}`, options: { x: 6.3, y: 7.0, w: 6.5, h: 0.3, fontFace: F, fontSize: 10, color: XC.muted, align: "right" } } },
    ],
    slideNumber: { x: 12.75, y: 7.0, w: 0.4, h: 0.3, fontFace: F, fontSize: 10, color: XC.muted },
  });
  const slide = (title: string, sub?: string) => {
    const s = pp.addSlide({ masterName: "PF" });
    s.addText(title, { x: 0.5, y: 0.35, w: 12.3, h: 0.7, fontFace: F, fontSize: 28, bold: true, color: N });
    if (sub) s.addText(sub, { x: 0.5, y: 1.0, w: 12.3, h: 0.45, fontFace: F, fontSize: 14, color: XC.muted });
    return s;
  };
  const hdr = (cells: string[]): Cell[] =>
    cells.map((x, i) => ({ text: x, options: { bold: true, color: "FFFFFF", fill: { color: N }, align: i ? "right" : "left" } }));
  const tblOpts = (colW: number[], fs = 11): PptxGenJS.TableProps => ({
    x: 0.5, colW, fontFace: F, fontSize: fs, color: XC.ink, border: { type: "solid", pt: 0.5, color: XC.grey }, valign: "middle", margin: [3, 6, 3, 6],
  });
  const heading = (text: string): TextProps => ({ text, options: { bold: true, color: N, fontSize: 16, breakLine: true } });
  const line = (text: string): TextProps => ({ text, options: { breakLine: true } });
  const gap: TextProps = { text: " ", options: { breakLine: true } };

  // 1 Title
  let s = pp.addSlide();
  s.background = { color: N };
  s.addShape(pp.ShapeType.rect, { x: 0.6, y: 2.2, w: 0.12, h: 2.6, fill: { color: G }, line: { color: G } });
  s.addText("PACKET FUSION", { x: 1.0, y: 2.1, w: 10, h: 0.5, fontFace: F, fontSize: 16, bold: true, color: G, charSpacing: 4 });
  s.addText("AI Agent ROI Analysis", { x: 1.0, y: 2.6, w: 11, h: 1.1, fontFace: F, fontSize: 46, bold: true, color: "FFFFFF" });
  s.addText(`${client} · 3-year business case`, { x: 1.0, y: 3.7, w: 11, h: 0.6, fontFace: F, fontSize: 22, color: XC.blue });
  s.addText(exportDate(), { x: 1.0, y: 4.3, w: 11, h: 0.5, fontFace: F, fontSize: 14, color: "D9E1E2" });

  // 2 Headline numbers
  s = slide("The bottom line", `What an AI agent means for ${client} over three years`);
  S.headline.forEach(([v, l], i) => {
    const x = 0.5 + (i % 3) * 4.15, y = 1.7 + Math.floor(i / 3) * 2.45;
    s.addShape(pp.ShapeType.rect, { x, y, w: 3.95, h: 2.2, fill: { color: XC.light }, line: { color: XC.light } });
    s.addShape(pp.ShapeType.rect, { x, y, w: 3.95, h: 0.08, fill: { color: G }, line: { color: G } });
    s.addText(v, { x: x + 0.25, y: y + 0.35, w: 3.5, h: 0.9, fontFace: F, fontSize: v.length > 12 ? 26 : 36, bold: true, color: N });
    s.addText(l, { x: x + 0.25, y: y + 1.25, w: 3.5, h: 0.8, fontFace: F, fontSize: 13, color: XC.muted, valign: "top" });
  });

  // 3 Executive summary
  s = slide("Executive summary");
  s.addText(S.intro + " " + S.plan, { x: 0.5, y: 1.2, w: 12.3, h: 1.5, fontFace: F, fontSize: 15, color: XC.ink, valign: "top" });
  s.addText(
    S.bullets.flatMap(([a, b]): TextProps[] => [{ text: a, options: { bold: true, color: N } }, { text: b, options: { breakLine: true } }]),
    { x: 0.5, y: 2.85, w: 12.3, h: 3.9, fontFace: F, fontSize: 15, color: XC.ink, valign: "top", paraSpaceAfter: 10, bullet: false },
  );

  // 4 Today
  s = slide(`Where ${client} is today`, "Current volume, service level and cost");
  s.addTable(
    [hdr(["Measure", "Today"]), ...S.today.map((r, i) => r.map((x, j): Cell => ({ text: x, options: { align: j ? "right" : "left", bold: i === S.today.length - 1 } })))],
    { ...tblOpts([7.3, 5.0], 13), y: 1.6, rowH: 0.4 },
  );

  // 5 How the model works
  s = slide("How the model works");
  const steps: [string, string][] = [
    ["Follow every call", "Each year: routed to AI, resolved by AI, answered by an agent, or abandoned. Each year's abandonment target is assumed met."],
    ["Size the team", "Agents needed = inbound calls agents answer + outbound calls agents place, divided by today's calls per agent."],
    ["Cost both paths", "With AI: remaining agents + turnover + AI conversations + managed services. Without AI: enough agents to hit the same target."],
    ["Compare two ways", "View A: vs. today's budget (conservative). View B: vs. hiring to hit the same service target without AI."],
  ];
  steps.forEach(([a, b], i) => {
    const x = 0.5 + i * 3.13;
    s.addShape(pp.ShapeType.ellipse, { x: x + 0.05, y: 1.5, w: 0.7, h: 0.7, fill: { color: i === 3 ? G : N }, line: { color: i === 3 ? G : N } });
    s.addText(String(i + 1), { x: x + 0.05, y: 1.5, w: 0.7, h: 0.7, fontFace: F, fontSize: 20, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
    s.addText(a, { x, y: 2.4, w: 2.9, h: 0.5, fontFace: F, fontSize: 17, bold: true, color: N });
    s.addText(b, { x, y: 2.95, w: 2.9, h: 2.6, fontFace: F, fontSize: 13, color: XC.ink, valign: "top" });
  });

  // 6 Call outcomes chart
  s = slide("What happens to every call", "Inbound calls by outcome, millions per year");
  const per = ["Today", "Year 1", "Year 2", "Year 3"];
  const ai = [0, R.contained[1] as number, R.contained[2] as number, R.contained[3] as number];
  s.addChart(pp.ChartType.bar, [
    { name: "Resolved by AI", labels: per, values: ai.map((v) => v / 1e6) },
    { name: "Answered by an agent", labels: per, values: R.answered.map((a, i) => (a - ai[i]) / 1e6) },
    { name: "Abandoned", labels: per, values: R.abandoned.map((v) => v / 1e6) },
  ], {
    x: 0.5, y: 1.5, w: 8.2, h: 5.3, barDir: "col", barGrouping: "stacked", chartColors: [G, N, XC.aband], showLegend: true, legendPos: "b",
    legendFontFace: F, legendFontSize: 12, catAxisLabelFontFace: F, valAxisLabelFontFace: F, catAxisLabelFontSize: 12, valAxisLabelFontSize: 11,
    valAxisLabelFormatCode: "0.0", valGridLine: { color: "E3E9EB", size: 0.5 },
  });
  s.addText([
    heading("Abandonment"), ...per.map((label, i) => line(`${label}: ${xf.pct(R.abandoned[i] / R.offered[i], 0)}`)),
    gap, heading("Resolved by AI in Year 3"), line(`${xf.int(R.contained[3])} calls`),
    gap, heading("More callers answered"), { text: `${xf.int(R.added[3])} a year by Year 3` },
  ], { x: 9.0, y: 1.6, w: 3.8, h: 5, fontFace: F, fontSize: 14, color: XC.ink, valign: "top" });

  // 7 Savings chart
  s = slide("Net annual savings", "Both views, by year");
  const yrs3 = ["Year 1", "Year 2", "Year 3"];
  s.addChart(pp.ChartType.bar, [
    { name: "View A: vs. today's budget", labels: yrs3, values: [1, 2, 3].map((i) => (R.saveA[i] as number) / 1e6) },
    { name: "View B: vs. hiring to hit targets", labels: yrs3, values: [1, 2, 3].map((i) => (R.saveB[i] as number) / 1e6) },
  ], {
    x: 0.5, y: 1.5, w: 8.2, h: 5.3, barDir: "col", barGapWidthPct: 60, chartColors: [N, G], showLegend: true, legendPos: "b", legendFontFace: F, legendFontSize: 12,
    showValue: true, dataLabelFormatCode: '"$"0.0"M"', dataLabelFontSize: 11, dataLabelFontFace: F, catAxisLabelFontFace: F, valAxisLabelFontFace: F,
    valAxisLabelFormatCode: '"$"0"M"', valGridLine: { color: "E3E9EB", size: 0.5 },
  });
  s.addText([
    heading("3-year totals"), line(`View A: ${xf.M1(H.saveA3)}`), line(`View B: ${xf.M1(H.saveB3)}`),
    gap, heading("AI investment"), line(`${xf.M1(H.aiInvest3)} over 3 years`),
    gap, heading("Return on AI spend"), { text: `${xf.x(H.roiB)} (View B)` },
  ], { x: 9.0, y: 1.6, w: 3.8, h: 5, fontFace: F, fontSize: 14, color: XC.ink, valign: "top" });

  // 8 ROI summary table
  s = slide("Three-year ROI summary");
  const yrs = (arr: (number | null)[], f: (v: number) => string, tot?: number | null) =>
    [0, 1, 2, 3].map((i) => (arr[i] == null ? "—" : f(arr[i] as number))).concat([tot == null ? "—" : f(tot)]);
  const trow = (l: string, arr: (number | null)[], f: (v: number) => string, tot?: number | null, x: { b?: boolean; k?: boolean } = {}): Cell[] => [
    { text: l, options: { bold: x.b, color: x.k ? XC.greenInk : XC.ink } },
    ...yrs(arr, f, tot).map((v): Cell => ({ text: v, options: { align: "right", bold: x.b || x.k, color: x.k ? XC.greenInk : XC.ink } })),
  ];
  const band = (l: string): Cell[] => [{ text: l.toUpperCase(), options: { colspan: 6, bold: true, color: N, fill: { color: XC.light }, fontSize: 10 } }];
  s.addTable([
    hdr(["Line item", "Today", "Year 1", "Year 2", "Year 3", "3-yr total"]),
    band("Calls and staffing"),
    trow("Calls resolved by AI", R.contained, xf.int), trow("Calls abandoned", R.abandoned, xf.int), trow("Human agents required", R.req, xf.one), trow("Agents offset vs. today", R.offset, xf.one, null, { k: true }),
    band("Annual cost"),
    trow("Agent labor + turnover", R.labor.map((v, i) => v + R.turn[i]), xf.usd, H.tot.labor + H.tot.turn),
    trow("AI conversations", R.voice.map((v, i) => (v == null ? null : v + (R.digital[i] as number))), xf.usd, H.tot.voice + H.tot.digital),
    trow("Managed services + implementation", R.admin.map((v, i) => (v == null ? null : v + (R.impl[i] as number))), xf.usd, H.tot.admin + H.tot.impl),
    trow("Total cost with AI", R.total, xf.usd, H.tot.total, { b: true }),
    band("Savings"),
    trow("View A: vs. today's budget", R.saveA, xf.usd, H.tot.saveA, { k: true }), trow("Cost of human-only plan", R.humanOnly, xf.usd, H.tot.humanOnly), trow("View B: vs. human-only plan", R.saveB, xf.usd, H.tot.saveB, { k: true }),
  ], { ...tblOpts([3.9, 1.68, 1.68, 1.68, 1.68, 1.68], 12), y: 1.25, rowH: 0.34 });

  // 9–15 How we got the numbers
  const headCell = (text: string, right = false): Cell => ({ text, options: { bold: true, color: "FFFFFF", fill: { color: N }, align: right ? "right" : undefined } });
  S.calc.forEach((st) => {
    s = slide("How we got the numbers: " + st.t.replace(/^\d+\.\s*/, ""), st.d);
    s.addTable([
      [headCell("Item"), headCell("How it's calculated"), headCell("Result", true)],
      ...st.rows.map((r, j): Cell[] => {
        const last = j === st.rows.length - 1;
        return [
          { text: r[0], options: { bold: last, color: last ? XC.greenInk : XC.ink } },
          { text: r[1], options: { color: XC.muted } },
          { text: r[2], options: { align: "right", bold: true, color: last ? XC.greenInk : N } },
        ];
      }),
    ], { ...tblOpts([3.3, 6.8, 2.2], 13), y: 1.65, rowH: 0.48 });
  });

  // 16 Sensitivity
  s = slide("Sensitivity: Year 3 savings", `View B savings by containment (rows) and discount off the ${xf.usd2(p.listPrice)} list price (columns). Outlined = current plan.`);
  s.addTable([
    hdr(["Containment", ...o.sensD.map((d) => xf.pct(d, sensDiscDigits(d)))]),
    ...o.S.map((r, i): Cell[] => [
      { text: xf.pct(o.sensC[i], 0), options: { bold: true } },
      ...r.map((v, j): Cell => {
        const plan = Math.abs(o.sensC[i] - p.contain[2]) < 1e-9 && j === 4;
        return { text: xf.M1(v), options: { align: "right", bold: plan, color: v < 0 ? XC.red : plan ? XC.greenInk : XC.ink, fill: plan ? { color: "D4F5E2" } : undefined } };
      }),
    ]),
  ], { ...tblOpts([2.3, 2.0, 2.0, 2.0, 2.0, 2.0], 14), y: 1.7, rowH: 0.55 });
  s.addText(`Break-even containment in Year 3 is ${xf.pct(R.breakeven[3])}; the plan assumes ${xf.pct(p.contain[2], 0)}.`, { x: 0.5, y: 5.8, w: 12.3, h: 0.5, fontFace: F, fontSize: 14, color: XC.ink });

  // 17 Key assumptions
  s = slide("Key assumptions", "The inputs behind these results");
  const key: (keyof RoiInputs)[] = ["monthlyCalls", "monthlyOutbound", "abandon", "inhouse", "bpo", "wage", "turnover", "target", "route", "contain", "outAI", "price", "admin"];
  s.addTable([
    [headCell("Input"), headCell("Value", true), headCell("Status")],
    ...key
      .map((k) => ROI_FIELDS.find((f) => f.k === k))
      .filter((f): f is RoiField => Boolean(f))
      .map((f): Cell[] => [
        { text: f.label + (f.type.endsWith("3") ? " (Yr 1/2/3)" : "") },
        { text: showInput(f, p[f.k]), options: { align: "right", bold: true } },
        { text: f.flag ? "To confirm" : "Set", options: { color: f.flag ? XC.red : XC.greenInk, bold: f.flag } },
      ]),
  ], { ...tblOpts([6.6, 3.6, 2.1], 12), y: 1.55, rowH: 0.36 });

  // 18 Next steps
  s = slide("Next steps");
  const conf = S.confirm.slice(0, 8).map(([a]) => a.replace(/\.\s*$/, ""));
  const item = (text: string): TextProps => ({ text, options: { bullet: { indent: 18 }, breakLine: true } });
  s.addText([
    { text: "Validate the inputs", options: { bold: true, color: N, fontSize: 18, breakLine: true } },
    ...(conf.length ? conf : ["All inputs confirmed"]).map(item),
  ], { x: 0.5, y: 1.3, w: 6.0, h: 5.4, fontFace: F, fontSize: 14, color: XC.ink, valign: "top", paraSpaceAfter: 4 });
  s.addText([
    { text: "Prove it out", options: { bold: true, color: N, fontSize: 18, breakLine: true } },
    item("Run skill-mining on real call recordings to confirm which calls the AI can resolve"),
    item("Pilot on the Year 1 call types to measure actual containment"),
    item("Re-run this model with pilot results before expanding to all calls"),
    gap,
    { text: "Figures are planning estimates, not a quote or a guarantee of results.", options: { italic: true, color: XC.muted, fontSize: 12 } },
  ], { x: 6.9, y: 1.3, w: 5.9, h: 5.4, fontFace: F, fontSize: 14, color: XC.ink, valign: "top", paraSpaceAfter: 4 });

  return pp;
}
