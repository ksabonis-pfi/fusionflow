import type { RcAuditRow, RcFinding, RcImprovement, RcKpiRow, RcLayer } from "./types";

export function buildFindings(rows: RcKpiRow[], auditRows: RcAuditRow[], layers: RcLayer[]):
  { findings: RcFinding[]; summary: { red: number; amber: number; green: number; total: number } };
export function buildImprovements(rows: RcKpiRow[], auditRows: RcAuditRow[], layers: RcLayer[]):
  { improvements: RcImprovement[]; potentialGain: number };
