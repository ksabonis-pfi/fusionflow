import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  optimizeV2Api, type Connection, type Platform, type RingCentralCredentialsInput, type RunSummary, type ZoomCredentialsInput,
} from "../lib/optimizeV2Api";
import { PLATFORM_LABEL, fmtDate } from "../components/optimizeV2/format";
import { GradePill } from "../components/optimizeV2/ui";

type AccountData = Awaited<ReturnType<typeof optimizeV2Api.account>>;

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Credential fields per platform, and the help shown above them. */
const CRED_FIELDS: Record<Platform, { help: string; fields: { key: string; label: string; secret?: boolean; multiline?: boolean }[] }> = {
  zoom: {
    help: "The customer creates a read-only Server-to-Server OAuth app in their Zoom tenant and shares its credentials.",
    fields: [
      { key: "accountId", label: "Account ID" },
      { key: "clientId", label: "Client ID" },
      { key: "clientSecret", label: "Client secret", secret: true },
    ],
  },
  ringcentral: {
    help: "The customer creates a read-only JWT app in the RingCentral developer console and issues a JWT for an admin user.",
    fields: [
      { key: "clientId", label: "Client ID" },
      { key: "clientSecret", label: "Client secret", secret: true },
      { key: "jwt", label: "JWT credential", secret: true, multiline: true },
    ],
  },
};

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

  const conn = (p: Platform) => data.connections.find((c) => c.platform === p) ?? null;

  return (
    <Page>
      <div className="ms-page-header">
        <div>
          <h1 className="ms-page-title">{data.account.customer_name}</h1>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>Optimizations V2 preview</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 24 }}>
        {(["zoom", "ringcentral"] as const).map((p) => (
          // Keyed by connection id so a new or replaced connection resets the form.
          <ConnectionCard key={`${p}-${conn(p)?.id ?? "new"}`} platform={p} accountId={accountId} connection={conn(p)} onChanged={load} />
        ))}
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

function ConnectionCard({ platform, accountId, connection, onChanged }: {
  platform: Platform; accountId: string; connection: Connection | null; onChanged: () => void;
}) {
  const navigate = useNavigate();
  const spec = CRED_FIELDS[platform];
  const connected = !!connection?.has_credentials;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [windowDays, setWindowDays] = useState(connection?.window_days ?? 30);
  const [rate, setRate] = useState(connection?.assumptions.agentLoadedRatePerHr?.toString() ?? "");
  const [autoCost, setAutoCost] = useState(connection?.assumptions.automationCostYr?.toString() ?? "");
  const [busy, setBusy] = useState<"save" | "run" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const showForm = editing || (!connected && open);
  const anyCreds = spec.fields.some((f) => creds[f.key]?.trim());

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    setMessage(null);
    try {
      if (!connected && !anyCreds) throw new Error(`Enter the customer's ${PLATFORM_LABEL[platform]} app credentials`);
      if (anyCreds && spec.fields.some((f) => !creds[f.key]?.trim())) throw new Error("Fill in every credential field");
      const res = await optimizeV2Api.saveConnection(accountId, platform, {
        // Field keys come from CRED_FIELDS, which mirrors each platform's credential type.
        credentials: anyCreds
          ? (Object.fromEntries(spec.fields.map((f) => [f.key, creds[f.key].trim()])) as unknown as ZoomCredentialsInput | RingCentralCredentialsInput)
          : undefined,
        window_days: windowDays,
        assumptions: {
          ...(rate ? { agentLoadedRatePerHr: Number(rate) } : {}),
          ...(autoCost ? { automationCostYr: Number(autoCost) } : {}),
        },
      });
      setCreds({});
      setEditing(false);
      setMessage({ tone: "ok", text: res.grantedScopes ? `Connected. ${PLATFORM_LABEL[platform]} granted ${res.grantedScopes.length} scopes.` : "Saved." });
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

  const hint = connection?.creds_hint ?? {};
  const jwtExpires = hint.jwt_expires_at ? new Date(hint.jwt_expires_at) : null;
  const jwtDaysLeft = jwtExpires ? Math.round((jwtExpires.getTime() - Date.now()) / 86_400_000) : null;

  return (
    <div className="ms-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontWeight: 700, color: "#0f172a" }}>{PLATFORM_LABEL[platform]}</div>
        {connected && !editing && (
          <button type="button" className="ms-btn-ghost" style={{ padding: "2px 8px", fontSize: 12 }} onClick={() => setEditing(true)}>Edit</button>
        )}
      </div>

      {!connected && !open && (
        <>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 12 }}>Not connected.</div>
          <button type="button" className="ms-btn-secondary" onClick={() => setOpen(true)}>Connect {PLATFORM_LABEL[platform]}</button>
        </>
      )}

      {connected && !editing && (
        <>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 4 }}>
            {platform === "zoom" ? "Account " : "Client "}
            <span style={{ fontFamily: "ui-monospace, monospace" }}>{(platform === "zoom" ? hint.account_id : hint.client_id) ?? "—"}</span>
          </div>
          {jwtDaysLeft != null && (
            <div style={{ fontSize: 13, color: jwtDaysLeft < 30 ? "#b45309" : "#475569", marginBottom: 4 }}>
              JWT {jwtDaysLeft < 0 ? `expired ${fmtDate(hint.jwt_expires_at)}` : `expires ${fmtDate(hint.jwt_expires_at)}`}
            </div>
          )}
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

      {showForm && (
        <form onSubmit={save}>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, lineHeight: 1.5 }}>
            {spec.help}
            {connected && " Leave these blank to keep the current credentials."}
          </div>
          {spec.fields.map((f) => field(f.label, f.multiline ? (
            <textarea
              className="ms-input"
              rows={3}
              value={creds[f.key] ?? ""}
              onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })}
              autoComplete="off"
              spellCheck={false}
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, resize: "vertical" }}
            />
          ) : (
            <input
              className="ms-input"
              type={f.secret ? "password" : "text"}
              value={creds[f.key] ?? ""}
              onChange={(e) => setCreds({ ...creds, [f.key]: e.target.value })}
              autoComplete={f.secret ? "new-password" : "off"}
            />
          )))}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {field("Window (days)", <input className="ms-input" type="number" min={7} max={90} value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} />)}
            {field("Agent $/hr (loaded)", <input className="ms-input" type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="optional" />)}
            {field("Automation $/yr", <input className="ms-input" type="number" min={0} value={autoCost} onChange={(e) => setAutoCost(e.target.value)} placeholder="optional" />)}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="ms-btn-primary" disabled={busy !== null}>{busy === "save" ? "Verifying…" : "Save"}</button>
            <button type="button" className="ms-btn-secondary" onClick={() => { setEditing(false); setOpen(false); setCreds({}); }} disabled={busy !== null}>Cancel</button>
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
