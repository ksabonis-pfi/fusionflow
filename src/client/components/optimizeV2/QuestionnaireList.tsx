// Account page section: the three program questionnaires per platform, with
// status and progress.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { optimizeV2Api, type Platform, type QuestionnaireSummary } from "../../lib/optimizeV2Api";
import { INSTRUMENT_LABEL } from "../../../shared/optimizeV2/questionnaires";
import { PLATFORM_LABEL, fmtDate } from "./format";
import { Pill } from "./ui";

export function QuestionnaireStatus({ status, answered }: { status: QuestionnaireSummary["status"]; answered: number }) {
  if (status === "complete") return <Pill bg="#dcfce7" fg="#166534">Complete</Pill>;
  if (status || answered) return <Pill bg="#fef3c7" fg="#92400e">Draft</Pill>;
  return <Pill bg="#f1f5f9" fg="#64748b">Not started</Pill>;
}

export function ProgressBar({ pct, width = 120 }: { pct: number; width?: number | string }) {
  return (
    <div style={{ width, height: 6, borderRadius: 999, background: "#e2e8f0", overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", background: pct >= 100 ? "#16a34a" : "#2563eb" }} />
    </div>
  );
}

/** Shows the platforms this customer is on (vendor, a connection, or a started
 *  questionnaire); both when none of those say. */
export default function QuestionnaireList({ accountId, vendor, connected }: {
  accountId: string; vendor: string | null; connected: Platform[];
}) {
  const [rows, setRows] = useState<QuestionnaireSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    optimizeV2Api.questionnaires(accountId).then(setRows).catch((e) => setError(e instanceof Error ? e.message : "Couldn't load questionnaires"));
  }, [accountId]);

  if (error) return <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div>;
  if (!rows) return <div style={{ color: "#64748b", fontSize: 13 }}>Loading…</div>;

  const relevant = new Set<Platform>(connected);
  if (vendor === "zoom" || vendor === "ringcentral") relevant.add(vendor);
  for (const r of rows) if (r.status) relevant.add(r.platform);
  const all: Platform[] = ["zoom", "ringcentral"];
  const platforms = showAll || relevant.size === 0 ? all : all.filter((p) => relevant.has(p));
  const hidden = all.filter((p) => !platforms.includes(p));

  return (
    <div className="ms-card" style={{ padding: 0, overflowX: "auto" }}>
      <table className="ms-table">
        <thead>
          <tr>
            <th>Questionnaire</th>
            {platforms.length > 1 && <th>Platform</th>}
            <th>When</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Last saved</th>
          </tr>
        </thead>
        <tbody>
          {rows.filter((r) => platforms.includes(r.platform)).map((r) => (
            <tr key={`${r.platform}/${r.instrument}`}>
              <td>
                <Link to={`/optimize-v2/${accountId}/questionnaires/${r.platform}/${r.instrument}`} style={{ fontWeight: 600 }}>
                  {INSTRUMENT_LABEL[r.instrument]}
                </Link>
                {platforms.length === 1 && <span style={{ marginLeft: 6, fontSize: 11, color: "#64748b" }}>{PLATFORM_LABEL[r.platform]}</span>}
              </td>
              {platforms.length > 1 && <td>{PLATFORM_LABEL[r.platform]}</td>}
              <td style={{ fontSize: 13, color: "#475569" }}>{r.cadence}</td>
              <td><QuestionnaireStatus status={r.status} answered={r.answered} /></td>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ProgressBar pct={r.progress} width={90} />
                  <span style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>{r.answered} / {r.total}</span>
                </div>
              </td>
              <td style={{ fontSize: 13, color: "#475569", whiteSpace: "nowrap" }}>
                {r.updated_at ? <>{fmtDate(r.updated_at)}{r.updated_by_name ? ` · ${r.updated_by_name}` : ""}</> : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {hidden.length > 0 && (
        <div style={{ padding: "8px 12px", borderTop: "1px solid #e2e8f0" }}>
          <button type="button" className="ms-btn-ghost" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => setShowAll(true)}>
            Show {hidden.map((p) => PLATFORM_LABEL[p]).join(" and ")} questionnaires
          </button>
        </div>
      )}
    </div>
  );
}
