// RingCentral readout model, shared by the Executive and Outcomes readouts.
// Ported from the standalone RingCentral agent's report.js (buildReportModel).
// The original read the engine's native snapshot; V2 stores the normalized
// scorecard, so the native-only figures (window days, call volume, blocked
// counts, index inputs missing) come from the run's slim `reportData`.
import { reviewDays } from "../kit";
import type { LayerNarrative } from "../zoom/content";
import type { ReportResult, ReportRun, RingCentralReportData } from "../types";
import { RC_LAYERS } from "./content";

export type RcReadout = ReturnType<typeof buildRcReportModel>;

export function buildRcReportModel(r: ReportResult, run: ReportRun) {
  const sc = r.scorecard, meta = r.meta;
  const data: Partial<RingCentralReportData> = r.reportData?.platform === "ringcentral" ? r.reportData : {};
  const narrative = (n: number): Partial<LayerNarrative> => RC_LAYERS[n] ?? {};
  const findings = r.findings.findings;
  const window = { from: meta.window?.from, to: meta.window?.to, days: data.windowDays ?? reviewDays(meta.window) };

  return {
    cover: {
      customer: run.customer_name || "Customer",
      accountId: meta.accountId ?? "—",
      window,
      generatedAt: meta.generatedAt || new Date().toISOString(),
    },
    headline: {
      overall: sc.overall,
      grade: sc.overallGrade || "N/A",
      configAlignment: sc.configAlignment == null ? null : Math.round(sc.configAlignment),
      potentialGain: sc.potentialGain || 0,
      potentialOverall: sc.potentialOverall,
      kpisPopulated: sc.coverage.populated || 0,
      kpisMeasurable: data.kpisMeasurable ?? sc.coverage.apiTotal ?? sc.coverage.total,
      kpisBlocked: data.kpisBlocked ?? 0,
      redFindings: r.findings.summary.red || 0,
      amberFindings: r.findings.summary.amber || 0,
      sampleVolume: !!data.sampleVolume,
      callsInWindow: data.callsInWindow ?? null,
      callsPerDay: data.callsPerDay ?? null,
    },
    indices: sc.indices.map((i) => ({ ...i, missing: data.indexMissing?.[i.key] ?? 0 })),
    scoreByLayer: sc.layers.map((l) => ({
      layer: l.layer, label: l.label, score: l.score, grade: l.grade, populated: l.populated, total: l.total, narrative: narrative(l.layer),
    })),
    layerDeepDives: sc.layers.map((l) => ({
      layer: l.layer, label: l.label, score: l.score, grade: l.grade, populated: l.populated, total: l.total,
      kpis: l.kpis.map((k) => ({ ...k, blockedBy: data.kpiBlockedBy?.[k.key] ?? null })),
      narrative: narrative(l.layer),
    })),
    priorityFindings: findings.slice(0, 8).map((f) => ({ ...f, narrative: narrative(f.layer) })),
    roadmap: sc.improvements.slice(0, 12),
    configRemediation: sc.configAudit.rows.filter((a) => a.state === "Gap"),
    warnings: r.warnings ?? [],
    methodology: {
      scopes: meta.grantedScopes || [],
      subrequests: meta.subrequestsUsed,
      elapsedMs: data.elapsedMs ?? null,
      generatedAt: meta.generatedAt,
    },
  };
}
