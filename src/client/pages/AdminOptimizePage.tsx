import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type OptimizeAccount } from "../lib/api";
import { humanize } from "../lib/format";
import { useToast } from "../components/ui/ToastProvider";
import { PLAN_DATE_MAX, PLAN_DATE_MIN } from "../../shared/planDates";

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  paused: "#f59e0b",
  churned: "#d13438",
};

const GRADUATION_LABELS: Record<string, string> = {
  auto: "Auto",
  manual: "Manual",
  direct: "Direct",
};

const HEALTH_COLORS: Record<string, string> = {
  at_risk: "#d13438",
  limited_value: "#f59e0b",
  emerging_value: "#0b9aad",
  realized_value: "#22c55e",
};

function getHealthBand(score: number): string {
  if (score >= 80) return "realized_value";
  if (score >= 60) return "emerging_value";
  if (score >= 40) return "limited_value";
  return "at_risk";
}

// SA / CSM aren't edited here: they come from the customer's CRM account team.
type EditForm = {
  optimize_status: "active" | "paused" | "churned";
  next_review_date: string;
  notes: string;
};

export default function AdminOptimizePage() {
  const [accounts, setAccounts] = useState<OptimizeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAccount, setEditingAccount] = useState<OptimizeAccount | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ optimize_status: "active", next_review_date: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      setLoading(true);
      setAccounts(await api.optimizeAccounts());
    } catch {
      showToast("Failed to load optimize accounts", "error");
    } finally {
      setLoading(false);
    }
  }

  function openEdit(account: OptimizeAccount) {
    setEditingAccount(account);
    setEditForm({
      optimize_status: account.optimize_status,
      next_review_date: account.next_review_date ?? "",
      notes: account.notes ?? "",
    });
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAccount) return;
    setSaving(true);
    try {
      await api.optimizeUpdateAccount(editingAccount.id, {
        optimize_status: editForm.optimize_status,
        next_review_date: editForm.next_review_date || null,
        notes: editForm.notes || null,
      });
      await loadData();
      setEditingAccount(null);
      showToast("Account updated.", "success");
    } catch {
      showToast("Failed to update account", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(account: OptimizeAccount) {
    if (!window.confirm(`Remove "${account.customer_name}" from Optimize? This deletes its assessments, tech stack, roadmap and utilization history. Projects and the customer are not affected.`)) return;
    try {
      await api.optimizeDeleteAccount(account.id);
      setAccounts((prev) => prev.filter((a) => a.id !== account.id));
      showToast("Account removed from Optimize.", "success");
    } catch {
      showToast("Failed to remove account", "error");
    }
  }

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading...</div>;

  const active = accounts.filter((a) => a.optimize_status !== "churned");
  const churned = accounts.filter((a) => a.optimize_status === "churned");

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="ms-page-header">
        <h1 className="ms-page-title">Optimize Accounts</h1>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>
          {active.length} active · {churned.length} churned
        </span>
      </div>

      <AccountTable
        accounts={active}
        onEdit={openEdit}
        onRemove={handleRemove}
        onNavigate={(id) => navigate(`/optimize/${id}`)}
      />

      {churned.length > 0 && (
        <>
          <div style={{ margin: "28px 0 12px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#94a3b8" }}>
            Churned
          </div>
          <AccountTable
            accounts={churned}
            onEdit={openEdit}
            onRemove={handleRemove}
            onNavigate={(id) => navigate(`/optimize/${id}`)}
            dimmed
          />
        </>
      )}

      {/* Edit modal */}
      {editingAccount && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditingAccount(null); }}>
          <div className="ms-modal" style={{ maxWidth: 520 }}>
            <h2 style={{ marginBottom: 20 }}>{editingAccount.customer_name}</h2>
            <form onSubmit={handleSaveEdit} style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <label className="ms-label">
                  <span>Status</span>
                  <select className="ms-input" value={editForm.optimize_status} onChange={(e) => setEditForm({ ...editForm, optimize_status: e.target.value as EditForm["optimize_status"] })}>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="churned">Churned</option>
                  </select>
                </label>
                <label className="ms-label">
                  <span>Next Review</span>
                  <input type="date" min={PLAN_DATE_MIN} max={PLAN_DATE_MAX} className="ms-input" value={editForm.next_review_date} onChange={(e) => setEditForm({ ...editForm, next_review_date: e.target.value })} />
                </label>
              </div>
              <label className="ms-label">
                <span>Notes</span>
                <textarea className="ms-input" rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} style={{ resize: "vertical" }} />
              </label>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="submit" className="ms-btn-primary" disabled={saving}>{saving ? "Saving..." : "Save"}</button>
                <button type="button" className="ms-btn-secondary" onClick={() => setEditingAccount(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function AccountTable({
  accounts,
  onEdit,
  onRemove,
  onNavigate,
  dimmed,
}: {
  accounts: OptimizeAccount[];
  onEdit: (a: OptimizeAccount) => void;
  onRemove: (a: OptimizeAccount) => void;
  onNavigate: (accountId: string) => void;
  dimmed?: boolean;
}) {
  return (
    <div className="ms-card" style={{ overflow: "hidden", opacity: dimmed ? 0.6 : 1 }}>
      <table className="ms-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Status</th>
            <th>SA</th>
            <th>CSM</th>
            <th>Last Score</th>
            <th>Next Review</th>
            <th>Completed</th>
            <th>Method</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {accounts.length === 0 ? (
            <tr>
              <td colSpan={9} style={{ textAlign: "center", color: "#64748b", padding: "28px 16px" }}>No accounts.</td>
            </tr>
          ) : (
            accounts.map((a) => {
              const scoreColor = a.last_assessment_score != null
                ? HEALTH_COLORS[getHealthBand(a.last_assessment_score)]
                : "#94a3b8";
              return (
                <tr key={a.id}>
                  <td>
                    <button
                      onClick={() => onNavigate(a.id)}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#0b9aad", fontWeight: 600, fontSize: 13, textAlign: "left" }}
                    >
                      {a.customer_name}
                    </button>
                  </td>
                  <td>
                    <span className="ms-badge" style={{ background: `${STATUS_COLORS[a.optimize_status]}1a`, color: STATUS_COLORS[a.optimize_status], border: `1px solid ${STATUS_COLORS[a.optimize_status]}40`, textTransform: "none" }}>
                      {humanize(a.optimize_status)}
                    </span>
                  </td>
                  <td style={{ color: "#475569", fontSize: 13 }}>{a.sa_name ?? "—"}</td>
                  <td style={{ color: "#475569", fontSize: 13 }}>{a.csm_name ?? "—"}</td>
                  <td style={{ fontWeight: 700, color: scoreColor }}>{a.last_assessment_score != null ? a.last_assessment_score : "—"}</td>
                  <td style={{ color: "#64748b", fontSize: 12 }}>{a.next_review_date ?? "—"}</td>
                  <td style={{ color: "#94a3b8", fontSize: 12 }}>{a.graduated_at?.slice(0, 10) ?? "—"}</td>
                  <td>
                    {a.graduation_method && (
                      <span className="ms-badge" style={{ background: "rgba(148,163,184,0.1)", color: "#94a3b8", border: "1px solid rgba(148,163,184,0.2)" }}>
                        {GRADUATION_LABELS[a.graduation_method] ?? a.graduation_method}
                      </span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="ms-btn-ghost" onClick={() => onEdit(a)}>Edit</button>
                      <button className="ms-btn-ghost" onClick={() => onRemove(a)} style={{ color: "#d13438", borderColor: "rgba(209,52,56,0.35)" }}>Remove</button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
