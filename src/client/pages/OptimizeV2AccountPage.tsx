import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { optimizeV2Api, type Connection, type RunSummary } from "../lib/optimizeV2Api";
import { PLATFORM_LABEL, fmtDate } from "../components/optimizeV2/format";
import { GradePill } from "../components/optimizeV2/ui";

type AccountData = Awaited<ReturnType<typeof optimizeV2Api.account>>;

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export default function OptimizeV2AccountPage() {
  const { accountId = "" } = useParams<{ accountId: string }>();
  const [data, setData] = useState<AccountData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    optimizeV2Api.account(accountId).then(setData).catch((e) => setError(errMsg(e, "Couldn't load account")));
  }, [accountId]);
  useEffect(load, [load]);

  if (error) return <Page><div style={{ color: "#b91c1c", fontSize: 13 }}>{error}</div></Page>;
  if (!data) return <Page><div style={{ color: "#64748b", fontSize: 13 }}>Loading…</div></Page>;

  const zoom = data.connections.find((c) => c.platform === "zoom") ?? null;

  return (
    <Page>
      <div className="ms-page-header">
        <div>
          <h1 className="ms-page-title">{data.account.customer_name}</h1>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Optimizations V2 preview</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 24 }}>
        <ZoomConnectionCard accountId={accountId} connection={zoom} onChanged={load} />
        <div className="ms-card" style={{ background: "#f8fafc" }}>
          <div style={{ fontWeight: 700, color: "#64748b", marginBottom: 4 }}>RingCentral</div>
          <div style={{ fontSize: 13, color: "#94a3b8" }}>Coming in the next phase.</div>
        </div>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 12px" }}>Assessments</h2>
      <RunList runs={data.runs} />
    </Page>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <Link to="/optimize-v2" className="ms-btn-ghost" style={{ display: "inline-block", marginBottom: 16, padding: "4px 10px" }}>← All accounts</Link>
      {children}
    </div>
  );
}

function ZoomConnectionCard({ accountId, connection, onChanged }: { accountId: string; connection: Connection | null; onChanged: () => void }) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(!connection?.has_credentials);
  const [form, setForm] = useState({ accountId: "", clientId: "", clientSecret: "" });
  const [windowDays, setWindowDays] = useState(connection?.window_days ?? 30);
  const [rate, setRate] = useState(connection?.assumptions.agentLoadedRatePerHr?.toString() ?? "");
  const [autoCost, setAutoCost] = useState(connection?.assumptions.automationCostYr?.toString() ?? "");
  const [busy, setBusy] = useState<"save" | "run" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    setMessage(null);
    try {
      const creds = form.accountId || form.clientId || form.clientSecret ? form : undefined;
      if (!connection?.has_credentials && !creds) throw new Error("Enter the customer's Zoom Server-to-Server app credentials");
      const res = await optimizeV2Api.saveConnection(accountId, "zoom", {
        credentials: creds,
        window_days: windowDays,
        assumptions: {
          ...(rate ? { agentLoadedRatePerHr: Number(rate) } : {}),
          ...(autoCost ? { automationCostYr: Number(autoCost) } : {}),
        },
      });
      setForm({ accountId: "", clientId: "", clientSecret: "" });
      setEditing(false);
      setMessage({
        tone: "ok",
        text: res.grantedScopes ? `Connected. Zoom granted ${res.grantedScopes.length} scopes.` : "Saved.",
      });
      onChanged();
    } catch (err) {
      setMessage({ tone: "err", text: errMsg(err, "Couldn't save") });
    } finally {
      setBusy(null);
    }
  }

  async function run() {
    if (!connection) return;
    setBusy("run");
    setMessage(null);
    try {
      const res = await optimizeV2Api.runAssessment(connection.id);
      navigate(`/optimize-v2/runs/${res.runId}`);
    } catch (err) {
      setMessage({ tone: "err", text: errMsg(err, "Assessment failed") });
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  const field = (label: string, el: React.ReactNode) => (
    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 10 }}>
      {label}
      <div style={{ marginTop: 4 }}>{el}</div>
    </label>
  );

  return (
    <div className="ms-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: "#0f172a" }}>{PLATFORM_LABEL.zoom}</div>
        {connection?.has_credentials && !editing && (
          <button type="button" className="ms-btn-ghost" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => setEditing(true)}>Edit</button>
        )}
      </div>

      {connection?.has_credentials && !editing && (
        <>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 4 }}>
            Account <span style={{ fontFamily: "ui-monospace, monospace" }}>{connection.creds_hint.account_id ?? "—"}</span>
          </div>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 12 }}>
            {connection.window_days}-day window · last run {fmtDate(connection.last_run_at)}
          </div>
          {connection.last_error && (
            <div style={{ fontSize: 12, color: "#b91c1c", marginBottom: 12 }}>Last run failed: {connection.last_error}</div>
          )}
          <button type="button" className="ms-btn-primary" onClick={run} disabled={busy !== null}>
            {busy === "run" ? "Running… (up to a minute)" : "Run assessment"}
          </button>
        </>
      )}

      {editing && (
        <form onSubmit={save}>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, lineHeight: 1.5 }}>
            The customer creates a read-only Server-to-Server OAuth app in their Zoom tenant and shares its credentials.
            {connection?.has_credentials && " Leave these blank to keep the current credentials."}
          </div>
          {field("Account ID", <input className="ms-input" value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} autoComplete="off" />)}
          {field("Client ID", <input className="ms-input" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} autoComplete="off" />)}
          {field("Client secret", <input className="ms-input" type="password" value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} autoComplete="new-password" />)}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {field("Window (days)", <input className="ms-input" type="number" min={7} max={90} value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} />)}
            {field("Agent $/hr (loaded)", <input className="ms-input" type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="optional" />)}
            {field("Automation $/yr", <input className="ms-input" type="number" min={0} value={autoCost} onChange={(e) => setAutoCost(e.target.value)} placeholder="optional" />)}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="ms-btn-primary" disabled={busy !== null}>{busy === "save" ? "Verifying…" : "Save"}</button>
            {connection?.has_credentials && (
              <button type="button" className="ms-btn-secondary" onClick={() => setEditing(false)} disabled={busy !== null}>Cancel</button>
            )}
          </div>
        </form>
      )}

      {message && (
        <div style={{ marginTop: 10, fontSize: 12, color: message.tone === "ok" ? "#166534" : "#b91c1c" }}>{message.text}</div>
      )}
    </div>
  );
}

function RunList({ runs }: { runs: RunSummary[] }) {
  if (runs.length === 0) {
    return <div style={{ color: "#64748b", fontSize: 13, padding: "16px 0" }}>No assessments yet. Connect a platform and run one.</div>;
  }
  return (
    <div className="ms-card" style={{ padding: 0, overflowX: "auto" }}>
      <table className="ms-table">
        <thead>
          <tr>
            <th>Run</th>
            <th>Platform</th>
            <th>Window</th>
            <th>Score</th>
            <th style={{ textAlign: "right" }}>Red</th>
            <th style={{ textAlign: "right" }}>Amber</th>
            <th style={{ textAlign: "right", whiteSpace: "nowrap" }}>KPIs measured</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td style={{ whiteSpace: "nowrap" }}>
                <Link to={`/optimize-v2/runs/${r.id}`} style={{ fontWeight: 600 }}>{fmtDate(r.created_at)}</Link>
                {r.source !== "manual" && <span style={{ marginLeft: 6, fontSize: 11, color: "#64748b" }}>{r.source}</span>}
              </td>
              <td>{PLATFORM_LABEL[r.platform]}</td>
              <td style={{ whiteSpace: "nowrap", fontSize: 13 }}>{fmtDate(r.from_date)} – {fmtDate(r.to_date)}</td>
              <td><GradePill score={r.overall} grade={r.overall_grade} /></td>
              <td style={{ textAlign: "right" }}>{r.red_findings ?? "—"}</td>
              <td style={{ textAlign: "right" }}>{r.amber_findings ?? "—"}</td>
              <td style={{ textAlign: "right" }}>{r.kpis_populated ?? "—"} / {r.kpis_total ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
