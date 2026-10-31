// Zoom readout model: one source for the Executive and Outcomes readouts.
// Ported from the standalone Zoom agent's report.js (buildReportModel), including
// the Essentials / Advanced track logic (docs/PROGRAM_TIERS.md in that repo):
// Essentials scopes the readout to UCaaS products, re-scores layers and overall
// from only those KPIs, drops the CC-only layers and hides the Outcomes readout.
import type { ConfigAuditRow, Finding, Grade, IndexScore, ScoredKpi } from "../../../../lib/optimizeV2Api";
import { letterGrade } from "../kit";
import type { Basis, ReportResult, ReportRun, ZoomReportData, ZoomTrack } from "../types";
import {
  BASIS_NOTE, LAYERS, NEXT_STEPS, STAKEHOLDER_META, VALUE_PROPS, WHY_THIS_MATTERS, adoptionSnapshot, basisForFinding, basisFromMode,
  execSummary, glossaryFor, nextReviewNote, openQuestions, outcomesInterpretation, outcomesSummary, type LayerNarrative,
} from "./content";

/** UCaaS products = the Essentials track scope; everything else (Contact Center, Virtual
 *  Agent, Revenue Accelerator, WFM) is CCaaS / Advanced-only. */
const UCAAS_PRODUCTS = new Set(["Platform", "Cross-product", "AI Companion", "Workplace", "Zoom Phone", "Zoom Rooms", "Meetings"]);

/** Default track: Advanced when the run shows Contact Center or Virtual Agent activity.
 *  The original also counted any CC report with an `opportunities` list, but the
 *  collectors always attach a placeholder entry, so that test was always true once
 *  CC was reachable; real activity is required here (same fix as feature adoption). */
export function hasContactCenter(r: ReportResult): boolean {
  const d = r.reportData?.platform === "zoom" ? (r.reportData as ZoomReportData) : null;
  return !!(r.cc?.available || r.zva?.available || (d?.ccOffered ?? 0) > 0);
}

type Layer = { layer: number; label: string; score: number | null; grade: Grade; kpis: ScoredKpi[]; populated: number; total: number };

export type RoadmapItem = {
  label: string; layer: number; layerLabel?: string; product?: string;
  current: number | string | null | undefined; target: number | string | null | undefined; unit?: string;
  reco: string; lever: string | null; steps: string[]; scoreLift: number | null; attainment: number | null | undefined;
  severity?: string; basis?: Basis;
};

export type PriorityFinding = Finding & { narrative: Partial<LayerNarrative>; basis: Basis; basisNote: string; value?: number | null; unit?: string; target?: number | null };

type Scorecard = ReportResult["scorecard"];
type StrengthRow = ReportResult["findings"]["strengths"][number];

/** What the content generators read (everything but the derived narrative blocks). */
export type ZoomReportModel = {
  kpiByKey: Record<string, ScoredKpi>;
  labelToKpi: Record<string, ScoredKpi>;
  kpisAll: ScoredKpi[];
  gaps: Scorecard["gaps"];
  configAll: ConfigAuditRow[];
  cover: { customer: string; accountId: string; window: { from?: string; to?: string }; generatedAt: string; generator: string; scheduled: boolean };
  scope: ZoomTrack;
  headline: {
    overall: number | null; grade: Grade; configAlignment: number | null; potentialGain: number; potentialOverall: number | null;
    coverage: Scorecard["coverage"]; redFindings: number; amberFindings: number; strengths: number; kpisPopulated: number; kpisTotal: number;
  };
  indices: IndexScore[];
  scoreByLayer: { layer: number; label: string; score: number | null; grade: Grade; narrative: Partial<LayerNarrative> }[];
  priorityFindings: PriorityFinding[];
  layerDeepDives: (Layer & { narrative: Partial<LayerNarrative> })[];
  configRemediation: ConfigAuditRow[];
  strengths: StrengthRow[];
  methodology: { coverage: Scorecard["coverage"]; scopes: string[]; subrequests: number; generator?: string; generatedAt: string };
  roadmap: { items: RoadmapItem[]; potentialGain: number; potentialOverall: number | null; synthesized?: boolean };
};

export type ZoomReadout = ReturnType<typeof buildZoomReportModel>;

export function buildZoomReportModel(r: ReportResult, run: ReportRun, scope: ZoomTrack) {
  const sc = r.scorecard, fnd = r.findings, meta = r.meta;
  const essentials = scope === "essentials";
  let layers: Layer[] = sc.layers;
  let findingsList = fnd.findings as (Finding & { value?: number | null; unit?: string; target?: number | null; attainment?: number | null })[];
  let strengthsList = fnd.strengths;
  let overall = sc.overall, overallGrade: Grade = sc.overallGrade || "N/A";
  if (essentials) {
    layers = layers.map((l) => {
      const ks = l.kpis.filter((k) => UCAAS_PRODUCTS.has(k.product));
      const scored = ks.filter((k) => k.available && k.attainment != null);
      const score = scored.length ? Math.round(scored.reduce((a, k) => a + (k.attainment ?? 0), 0) / scored.length) : null;
      return { ...l, kpis: ks, score, grade: letterGrade(score), populated: scored.length, total: ks.length };
    }).filter((l) => l.kpis.length);
    const sl = layers.filter((l) => l.score != null);
    overall = sl.length ? Math.round(sl.reduce((a, l) => a + (l.score ?? 0), 0) / sl.length) : null;
    overallGrade = letterGrade(overall);
    findingsList = findingsList.filter((f) => UCAAS_PRODUCTS.has(f.area) || f.area === "Platform" || /^config/i.test(f.kpi || ""));
    strengthsList = strengthsList.filter((s) => UCAAS_PRODUCTS.has(s.product));
  }
  const kpis = layers.flatMap((l) => l.kpis);
  const kpiByKey: Record<string, ScoredKpi> = {}, labelToKpi: Record<string, ScoredKpi> = {};
  kpis.forEach((k) => { kpiByKey[k.key] = k; labelToKpi[(k.label || "").toLowerCase()] = k; });
  const narrative = (n: number): Partial<LayerNarrative> => LAYERS[n] ?? {};

  const headline = {
    overall, grade: overallGrade,
    configAlignment: sc.configAlignment,
    potentialGain: essentials ? 0 : (sc.potentialGain || 0),
    potentialOverall: essentials ? null : sc.potentialOverall,
    coverage: sc.coverage,
    redFindings: essentials ? findingsList.filter((f) => f.severity === "Red").length : fnd.summary.red || 0,
    amberFindings: essentials ? findingsList.filter((f) => f.severity === "Amber").length : fnd.summary.amber || 0,
    strengths: strengthsList.length,
    kpisPopulated: essentials ? kpis.filter((k) => k.available).length : sc.coverage.populated || 0,
    kpisTotal: essentials ? kpis.length : sc.coverage.total || kpis.length,
  };
  const scoreByLayer = layers.map((l) => ({ layer: l.layer, label: l.label, score: l.score, grade: l.grade, narrative: narrative(l.layer) }));

  // Roadmap: prefer the scorecard's quantified improvements; else synthesize from findings.
  let imp = sc.improvements;
  if (essentials) imp = imp.filter((i) => UCAAS_PRODUCTS.has(i.product) || /^config/i.test(i.kpi || ""));
  let roadmap: ZoomReportModel["roadmap"];
  if (imp.length) {
    roadmap = {
      items: imp.map((i) => ({
        label: i.kpi, layer: i.layer, layerLabel: i.layerLabel, product: i.product,
        current: i.current, target: i.target, unit: i.unit, reco: i.reco, lever: i.lever,
        steps: i.steps || [], scoreLift: i.scoreLift, attainment: i.attainment,
      })),
      potentialGain: headline.potentialGain,
      potentialOverall: headline.potentialOverall,
    };
  } else {
    roadmap = {
      items: findingsList.filter((f) => f.severity !== "Green").map((f) => ({
        label: f.kpi, layer: f.layer, layerLabel: scoreByLayer.find((l) => l.layer === f.layer)?.label,
        current: f.value, target: f.target, unit: f.unit, reco: f.recommendation, lever: f.roiLever,
        steps: f.steps || [], scoreLift: null, attainment: f.attainment, severity: f.severity,
      })),
      potentialGain: 0, potentialOverall: null, synthesized: true,
    };
  }

  const model: ZoomReportModel = {
    kpiByKey, labelToKpi, kpisAll: kpis,
    gaps: sc.gaps,
    configAll: sc.configAudit.rows,
    cover: {
      customer: run.customer_name || meta.accountId || "Customer",
      accountId: meta.accountId || "—",
      window: meta.window || {},
      generatedAt: meta.generatedAt || new Date().toISOString(),
      generator: meta.generator || "Zoom Optimization",
      scheduled: !!run.schedule_enabled,
    },
    scope,
    headline,
    indices: essentials ? [] : sc.indices,
    scoreByLayer,
    priorityFindings: [],
    layerDeepDives: layers.map((l) => ({
      layer: l.layer, label: l.label, score: l.score, grade: l.grade,
      populated: l.populated, total: l.total, kpis: l.kpis, narrative: narrative(l.layer),
    })),
    configRemediation: sc.configAudit.rows.filter((a) => a.state === "Gap"),
    strengths: strengthsList,
    methodology: {
      coverage: sc.coverage, scopes: meta.grantedScopes || [],
      subrequests: meta.subrequestsUsed, generator: meta.generator, generatedAt: meta.generatedAt,
    },
    roadmap,
  };

  // Evidence basis (Confirmed/Observed/Modeled) on every finding + roadmap item.
  model.priorityFindings = findingsList.slice(0, 8).map((f) => {
    const basis = basisForFinding(f, model);
    return { ...f, narrative: narrative(f.layer), basis, basisNote: BASIS_NOTE[basis] };
  });
  model.roadmap.items.forEach((it) => {
    const k = labelToKpi[(it.label || "").toLowerCase()];
    it.basis = k ? basisFromMode(k.mode) : (/^config/i.test(it.label || "") ? "Confirmed" : "Observed");
  });

  // Value props that have real numbers.
  let valueProps = VALUE_PROPS.map((vp) => ({ ...vp, m: vp.metric(model) }))
    .filter((vp): vp is typeof vp & { m: NonNullable<typeof vp.m> } => !!vp.m);
  if (essentials) valueProps = valueProps.filter((vp) => !["cost_avoided", "agent_hours_saved", "automation", "cx"].includes(vp.key));

  const full = {
    ...model,
    valueProps,
    execSummary: execSummary(model),
    stakeholderValue: stakeholderValue(model.priorityFindings, scoreByLayer),
    whyThisMatters: WHY_THIS_MATTERS,
    nextSteps: NEXT_STEPS,
  };
  return {
    ...full,
    // Outcomes-readout blocks (evidence-led).
    outcomes: {
      summary: outcomesSummary(full),
      adoption: adoptionSnapshot(full),
      interpretation: outcomesInterpretation(full),
      openQuestions: openQuestions(full),
      glossary: glossaryFor(full),
      nextReview: nextReviewNote(full),
      gapsList: fnd.findings.filter((f) => f.severity !== "Green").slice(0, 8),
    },
  };
}

/** Concrete per-tier value items from the layers that have findings, falling back
 *  to the weakest scored layers so the map is never empty. */
function stakeholderValue(priorityFindings: { layer: number }[], scoreByLayer: { layer: number; score: number | null; narrative: Partial<LayerNarrative> }[]) {
  const focusLayers = [...new Set(priorityFindings.map((f) => f.layer))];
  if (focusLayers.length < 3) {
    const weak = [...scoreByLayer].filter((l) => l.score != null).sort((a, b) => (a.score ?? 0) - (b.score ?? 0)).map((l) => l.layer);
    for (const n of weak) if (!focusLayers.includes(n)) { focusLayers.push(n); if (focusLayers.length >= 4) break; }
  }
  const byNum = new Map(scoreByLayer.map((l) => [l.layer, l]));
  return STAKEHOLDER_META.map((tier) => {
    const seen = new Set<string>(), items: string[] = [];
    for (const n of focusLayers) {
      const line = byNum.get(n)?.narrative.stakeholders?.[tier.key];
      if (line && !seen.has(line)) { seen.add(line); items.push(line); }
      if (items.length >= 4) break;
    }
    return { ...tier, items };
  });
}
