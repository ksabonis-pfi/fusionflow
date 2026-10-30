import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type OptimizeAccount, type OptimizeEligible, type DynamicsAccount, type CrmAccountTeam } from "../lib/api";
import { humanize } from "../lib/format";
import { useToast } from "../components/ui/ToastProvider";
import { SolutionTypePicker } from "../components/ui/SolutionTypePicker";
import type { SolutionType } from "../../shared/solutionTypes";
import { vendorLabel } from "../../shared/vendors";
import { PLAN_DATE_MAX, PLAN_DATE_MIN } from "../../shared/planDates";

const STATUS_COLOR: Record<string, string> = {
  active: "#22c55e",
  paused: "#f59e0b",
  churned: "#d13438",
};

const METHOD_COLOR: Record<string, { color: string; bg: string; border: string }> = {
  auto:   { color: "#0b9aad", bg: "rgba(11,154,173,0.1)",   border: "rgba(11,154,173,0.3)"   },
  manual: { color: "#8764b8", bg: "rgba(135,100,184,0.1)", border: "rgba(135,100,184,0.3)" },
  direct: { color: "#059669", bg: "rgba(5,150,105,0.1)",   border: "rgba(5,150,105,0.3)"   },
};

const EMPTY_DIRECT: {
  customer_name: string;
  dynamics_account_id: string;
  vendor: string;
  solution_types: SolutionType[];
  actual_go_live_date: string;
  next_review_date: string;
  notes: string;
} = {
  customer_name: "",
  dynamics_account_id: "",
  vendor: "",
  solution_types: [],
  actual_go_live_date: "",
  next_review_date: "",
  notes: "",
};

export default function OptimizePage() {
  const [accounts, setAccounts] = useState<OptimizeAccount[]>([]);
  const [eligible, setEligible] = useState<OptimizeEligible[]>([]);
  const [loading, setLoading] = useState(true);
  const [graduating, setGraduating] = useState<string | null>(null);
  const [showGraduateModal, setShowGraduateModal] = useState(false);
  const [showDirectModal, setShowDirectModal] = useState(false);
  const [directForm, setDirectForm] = useState(EMPTY_DIRECT);
  const [directSaving, setDirectSaving] = useState(false);
  const [crmQuery, setCrmQuery] = useState("");
  const [crmResults, setCrmResults] = useState<DynamicsAccount[] | null>(null);
  const [crmSearching, setCrmSearching] = useState(false);
  const [selectedCrm, setSelectedCrm] = useState<DynamicsAccount | null>(null);
  const [crmTeam, setCrmTeam] = useState<CrmAccountTeam | null>(null);
  const [crmTeamLoading, setCrmTeamLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState<boolean | null>(null);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const visibleAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? accounts.filter((a) => a.customer_name.toLowerCase().includes(q))
      : accounts;
    if (sortAsc !== null) {
      list = [...list].sort((a, b) => {
        const an = a.customer_name.toLowerCase();
        const bn = b.customer_name.toLowerCase();
        return sortAsc ? an.localeCompare(bn) : bn.localeCompare(an);
      });
    }
    return list;
  }, [accounts, search, sortAsc]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      setLoading(true);
      const [accs, elig] = await Promise.all([api.optimizeAccounts(), api.optimizeEligible()]);
      setAccounts(accs);
      setEligible(elig);
    } catch {
      showToast("Failed to load Optimize accounts", "error");
    } finally {
      setLoading(false);
    }
  }

  function resetDirectModal() {
    setShowDirectModal(false);
    setDirectForm(EMPTY_DIRECT);
    setCrmQuery("");
    setCrmResults(null);
    setSelectedCrm(null);
    setCrmTeam(null);
  }

  async function handleCrmSearch() {
    if (!crmQuery.trim()) return;
    setCrmSearching(true);
    try {
      const results = await api.optimizeCrmSearch(crmQuery.trim());
      setCrmResults(results);
    } catch {
      setCrmResults([]);
    } finally {
      setCrmSearching(false);
    }
  }

  function selectCrmAccount(account: DynamicsAccount) {
    setSelectedCrm(account);
    setDirectForm((f) => ({ ...f, customer_name: account.name, dynamics_account_id: account.accountid }));
    setCrmResults(null);
    setCrmQuery("");
    setCrmTeam(null);
    setCrmTeamLoading(true);
    api.optimizeCrmAccountTeam(account.accountid)
      .then((team) => setCrmTeam(team))
      .catch(() => setCrmTeam(null))
      .finally(() => setCrmTeamLoading(false));
  }

  function clearCrmSelection() {
    setSelectedCrm(null);
    setDirectForm((f) => ({ ...f, customer_name: "", dynamics_account_id: "" }));
    setCrmTeam(null);
  }

  async function handleDirectEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!directForm.dynamics_account_id) return;
    setDirectSaving(true);
    try {
      const created = await api.optimizeCreateAccount({
        dynamics_account_id: directForm.dynamics_account_id,
        customer_name: directForm.customer_name.trim(),
        vendor: directForm.vendor.trim() || null,
        solution_types: directForm.solution_types,
        actual_go_live_date: directForm.actual_go_live_date || null,
        next_review_date: directForm.next_review_date || null,
        notes: directForm.notes.trim() || null,
      });
      setAccounts((prev) => [created, ...prev]);
      resetDirectModal();
      showToast("Optimize account created.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create account", "error");
    } finally {
      setDirectSaving(false);
    }
  }

  async function handleGraduate(projectId: string) {
    setGraduating(projectId);
    try {
      await api.optimizeGraduate(projectId);
      showToast("Project completed and linked to the customer's Optimize account.", "success");
      await load();
      setShowGraduateModal(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to complete project", "error");
    } finally {
      setGraduating(null);
    }
  }

  if (loading) return <div style={{ color: "#64748b", padding: 32 }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <div className="ms-page-header">
        <div>
          <h1 className="ms-page-title">Optimize</h1>
          <p style={{ color: "#94a3b8", fontSize: 13, margin: "4px 0 0" }}>
            Post-implementation accounts — assessments, utilization &amp; roadmap
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {eligible.length > 0 && (
            <button className="ms-btn-secondary" onClick={() => setShowGraduateModal(true)}>
              Complete Project ({eligible.length})
            </button>
          )}
          <button className="ms-btn-primary" onClick={() => setShowDirectModal(true)}>
            + New Account
          </button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="ms-card" style={{ textAlign: "center", padding: "48px 24px", color: "#94a3b8" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🎯</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#475569", marginBottom: 8 }}>No Optimize accounts yet</div>
          <div style={{ fontSize: 13 }}>
            Projects automatically appear here when all implementation stages are complete.
            {eligible.length > 0 && (
              <span> Or manually mark an eligible project complete using the button above.</span>
            )}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center" }}>
            <input
              className="ms-input"
              placeholder="Search customers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 280 }}
            />
            {search && (
              <button type="button" className="ms-btn-ghost" onClick={() => setSearch("")} style={{ fontSize: 12 }}>
                Clear
              </button>
            )}
          </div>
          {visibleAccounts.length === 0 ? (
            <div className="ms-card" style={{ textAlign: "center", padding: "32px 24px", color: "#94a3b8" }}>
              No customers match "{search}".
            </div>
          ) : (
        <div className="ms-card" style={{ overflow: "hidden" }}>
          <table className="ms-table">
            <thead>
              <tr>
                <th
                  onClick={() => setSortAsc((prev) => (prev === true ? false : true))}
                  style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                  title="Sort alphabetically"
                >
                  Account {sortAsc === true ? "▲" : sortAsc === false ? "▼" : ""}
                </th>
                <th>Vendor</th>
                <th>Completed</th>
                <th>Status</th>
                <th>AE</th>
                <th>SA</th>
                <th>CSM</th>
                <th>Next Review</th>
                <th>Last Score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleAccounts.map((a) => (
                <tr key={a.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/optimize/${a.id}`)}>
                  <td>
                    <div style={{ fontWeight: 600, color: "#1e293b" }}>{a.customer_name}</div>
                  </td>
                  <td style={{ color: "#475569", fontSize: 13 }}>{a.vendor ? vendorLabel(a.vendor) : "—"}</td>
                  <td style={{ color: "#64748b", fontSize: 12 }}>
                    {a.graduated_at ? a.graduated_at.slice(0, 10) : "—"}
                    {(() => { const m = METHOD_COLOR[a.graduation_method] ?? METHOD_COLOR.manual; return (
                      <span style={{ marginLeft: 6, fontSize: 10, color: m.color, background: m.bg, padding: "1px 5px", borderRadius: 4, border: `1px solid ${m.border}` }}>
                        {a.graduation_method}
                      </span>
                    ); })()}
                  </td>
                  <td>
                    <span className="ms-badge" style={{ background: (STATUS_COLOR[a.optimize_status] ?? "#94a3b8") + "1a", color: STATUS_COLOR[a.optimize_status] ?? "#94a3b8", border: `1px solid ${(STATUS_COLOR[a.optimize_status] ?? "#94a3b8")}40`, textTransform: "none" }}>
                      {humanize(a.optimize_status)}
                    </span>
                  </td>
                  <td style={{ color: "#475569", fontSize: 13 }}>{a.ae_name ?? "—"}</td>
                  <td style={{ color: "#475569", fontSize: 13 }}>{a.sa_name ?? "—"}</td>
                  <td style={{ color: "#475569", fontSize: 13 }}>{a.csm_name ?? "—"}</td>
                  <td style={{ color: "#64748b", fontSize: 12 }}>{a.next_review_date ?? "—"}</td>
                  <td>
                    {a.last_assessment_score != null ? (
                      <span style={{ fontWeight: 700, fontSize: 16, color: a.last_assessment_score >= 7 ? "#22c55e" : a.last_assessment_score >= 4 ? "#f59e0b" : "#d13438" }}>
                        {a.last_assessment_score}<span style={{ fontSize: 11, fontWeight: 400, color: "#94a3b8" }}>/10</span>
                      </span>
                    ) : "—"}
                  </td>
                  <td>
                    <button
                      className="ms-btn-ghost"
                      onClick={(e) => { e.stopPropagation(); navigate(`/optimize/${a.id}`); }}
                    >
                      Open →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          )}
        </>
      )}

      {/* Direct Enroll Modal */}
      {showDirectModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) resetDirectModal(); }}>
          <div className="ms-modal" style={{ maxWidth: 560 }}>
            <h2>New Optimize Account</h2>
            <p style={{ color: "#64748b", fontSize: 13, margin: "6px 0 16px" }}>
              Add a customer to Optimize. Pick their CRM account; the account team comes from CRM.
            </p>
            <form onSubmit={handleDirectEnroll} style={{ display: "grid", gap: 14 }}>

              {/* CRM search / selected / manual */}
              <div className="ms-label">
                <span>Customer *</span>

                {/* CRM search mode — no account selected yet */}
                {!selectedCrm && (
                  <>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        autoFocus
                        className="ms-input"
                        value={crmQuery}
                        onChange={(e) => setCrmQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCrmSearch(); } }}
                        placeholder="Search CRM by account name…"
                        style={{ flex: 1 }}
                      />
                      <button type="button" className="ms-btn-secondary" onClick={handleCrmSearch} disabled={crmSearching || !crmQuery.trim()} style={{ whiteSpace: "nowrap" }}>
                        {crmSearching ? "Searching…" : "Search"}
                      </button>
                    </div>

                    {/* Results list */}
                    {crmResults !== null && (
                      <div style={{ marginTop: 4, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, overflow: "hidden", background: "#021a2e" }}>
                        {crmResults.length === 0 ? (
                          <div style={{ padding: "10px 14px", fontSize: 13, color: "#94a3b8" }}>No accounts found in CRM.</div>
                        ) : (
                          crmResults.map((a) => (
                            <button
                              type="button"
                              key={a.accountid}
                              onClick={() => selectCrmAccount(a)}
                              style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 14px", background: "none", border: "none", borderBottom: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", color: "rgba(255,255,255,0.85)" }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(99,193,234,0.1)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                            >
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{a.name}</div>
                              {(a.address1_city || a.address1_stateorprovince) && (
                                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                                  {[a.address1_city, a.address1_stateorprovince].filter(Boolean).join(", ")}
                                </div>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* CRM account selected */}
                {selectedCrm && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(99,193,234,0.06)", border: "1px solid rgba(99,193,234,0.2)", borderRadius: 6 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b" }}>{selectedCrm.name}</div>
                      {(selectedCrm.address1_city || selectedCrm.address1_stateorprovince) && (
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
                          {[selectedCrm.address1_city, selectedCrm.address1_stateorprovince].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={clearCrmSelection} style={{ fontSize: 12, color: "#94a3b8", background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "3px 8px", cursor: "pointer" }}>
                      Change
                    </button>
                  </div>
                )}

              </div>

              {/* CRM team suggestion */}
              {(crmTeamLoading || crmTeam) && (
                <div style={{ padding: "10px 14px", background: "rgba(11,154,173,0.06)", border: "1px solid rgba(11,154,173,0.2)", borderRadius: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#0b9aad", marginBottom: 8 }}>
                    From CRM
                  </div>
                  {crmTeamLoading ? (
                    <div style={{ fontSize: 12, color: "#64748b" }}>Loading team…</div>
                  ) : crmTeam && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                      {[
                        { label: "AE", name: crmTeam.ae_name, email: crmTeam.ae_email },
                        { label: "SA", name: crmTeam.sa_name, email: crmTeam.sa_email },
                        { label: "CSM", name: crmTeam.csm_name, email: crmTeam.csm_email },
                      ].map(({ label, name, email }) => (
                        <div key={label}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>{label}</div>
                          {name ? (
                            <>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#1e293b" }}>{name}</div>
                              {email && <div style={{ fontSize: 11, color: "#64748b" }}>{email}</div>}
                            </>
                          ) : (
                            <div style={{ fontSize: 12, color: "#94a3b8" }}>—</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <label className="ms-label">
                  <span>Vendor</span>
                  <select className="ms-input" value={directForm.vendor} onChange={(e) => setDirectForm({ ...directForm, vendor: e.target.value })}>
                    <option value="">— Select —</option>
                    <option value="zoom">Zoom</option>
                    <option value="ringcentral">RingCentral</option>
                  </select>
                </label>
                <label className="ms-label">
                  <span>Solution Types</span>
                  <SolutionTypePicker value={directForm.solution_types} onChange={(next) => setDirectForm({ ...directForm, solution_types: next })} />
                </label>
                <label className="ms-label">
                  <span>Go-Live Date</span>
                  <input type="date" min={PLAN_DATE_MIN} max={PLAN_DATE_MAX} className="ms-input" value={directForm.actual_go_live_date}
                    onChange={(e) => setDirectForm({ ...directForm, actual_go_live_date: e.target.value })} />
                </label>
                <label className="ms-label">
                  <span>Next Review Date</span>
                  <input type="date" min={PLAN_DATE_MIN} max={PLAN_DATE_MAX} className="ms-input" value={directForm.next_review_date}
                    onChange={(e) => setDirectForm({ ...directForm, next_review_date: e.target.value })} />
                </label>
              </div>
              <label className="ms-label">
                <span>Notes</span>
                <textarea className="ms-input" rows={3} value={directForm.notes}
                  onChange={(e) => setDirectForm({ ...directForm, notes: e.target.value })}
                  placeholder="Optional context about this account…" style={{ resize: "vertical" }} />
              </label>
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button type="submit" className="ms-btn-primary" disabled={directSaving || !directForm.dynamics_account_id}>
                  {directSaving ? "Creating…" : "Create Account"}
                </button>
                <button type="button" className="ms-btn-secondary" onClick={resetDirectModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Complete Project Modal */}
      {showGraduateModal && (
        <div className="ms-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowGraduateModal(false); }}>
          <div className="ms-modal" style={{ maxWidth: 520 }}>
            <h2>Complete Project</h2>
            <p style={{ color: "#475569", fontSize: 13, margin: "8px 0 16px" }}>
              These projects have gone live. Completing one links it to its customer's Optimize account (created if the customer doesn't have one yet) for ongoing review and roadmap planning.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {eligible.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(99,193,234,0.04)", border: "1px solid rgba(99,193,234,0.12)", borderRadius: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, color: "#1e293b" }}>{p.name}</div>
                    {p.customer_name && <div style={{ fontSize: 12, color: "#94a3b8" }}>{p.customer_name}</div>}
                  </div>
                  <button
                    className="ms-btn-primary"
                    disabled={graduating === p.id}
                    onClick={() => handleGraduate(p.id)}
                    style={{ minWidth: 100 }}
                  >
                    {graduating === p.id ? "Completing…" : "Complete"}
                  </button>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <button className="ms-btn-secondary" onClick={() => setShowGraduateModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
