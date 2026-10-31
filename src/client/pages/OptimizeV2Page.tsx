import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { optimizeV2Api, type ConnectionSummary, type OptimizeV2Account } from "../lib/optimizeV2Api";
import { PLATFORM_LABEL, fmtDate } from "../components/optimizeV2/format";
import { GradePill } from "../components/optimizeV2/ui";

/** Optimizations V2: every Optimize account with its platform connections and latest score. */
export default function OptimizeV2Page() {
  const [accounts, setAccounts] = useState<OptimizeV2Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    optimizeV2Api.accounts().then(setAccounts).catch((e) => setError(e instanceof Error ? e.message : "Couldn't load accounts"));
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (accounts ?? []).filter((a) => !q || a.customer_name.toLowerCase().includes(q));
  }, [accounts, search]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="ms-page-header">
        <div>
          <h1 className="ms-page-title">Optimizations <span style={{ fontSize: 13, fontWeight: 700, color: "#0b9aad", verticalAlign: "middle" }}>V2 preview</span></h1>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
            Connect a customer's Zoom tenant, run an assessment, and get the 11-layer scorecard, findings and improvement plan.
          </div>
        </div>
      </div>

      <input
        className="ms-input"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search customers"
        style={{ maxWidth: 360, marginBottom: 16 }}
      />

      {error && <div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div>}
      {!accounts && !error && <div style={{ color: "#64748b", fontSize: 13 }}>Loading…</div>}

      {accounts && (
        <div className="ms-card" style={{ padding: 0, overflowX: "auto" }}>
          <table className="ms-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Connections</th>
                <th style={{ whiteSpace: "nowrap" }}>Latest score</th>
                <th style={{ whiteSpace: "nowrap" }}>Last run</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => {
                const latest = latestRun(a.connections);
                return (
                  <tr key={a.id}>
                    <td><Link to={`/optimize-v2/${a.id}`} style={{ fontWeight: 600 }}>{a.customer_name}</Link></td>
                    <td>
                      {a.connections.length === 0
                        ? <span style={{ color: "#94a3b8", fontSize: 13 }}>Not connected</span>
                        : a.connections.map((c) => (
                          <span key={c.id} style={{ fontSize: 12, fontWeight: 600, marginRight: 8, color: c.last_error ? "#b91c1c" : "#334155" }}>
                            {PLATFORM_LABEL[c.platform]}{c.last_error ? " (error)" : ""}
                          </span>
                        ))}
                    </td>
                    <td>{latest ? <GradePill score={latest.overall} grade={latest.overall_grade} /> : <span style={{ color: "#94a3b8" }}>—</span>}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{latest ? fmtDate(latest.latest_run_at) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function latestRun(conns: ConnectionSummary[]): ConnectionSummary | null {
  return conns.filter((c) => c.latest_run_at).sort((a, b) => (b.latest_run_at ?? "").localeCompare(a.latest_run_at ?? ""))[0] ?? null;
}
