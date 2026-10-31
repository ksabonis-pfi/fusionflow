// One program questionnaire for one account and platform: scope chips filter
// the capability-gated sections, multi-part instruments get part tabs, and
// answers autosave. Rewritten from the standalone apps' renderForm().
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../lib/api";
import { optimizeV2Api, type Platform } from "../lib/optimizeV2Api";
import {
  groupInScope, hasScope, INSTRUMENT_LABEL, isAnswered, isInstrument, isSpecifyOption, loadQuestionnaire,
  type Answers, type Question, type QuestionnaireDef,
} from "../../shared/optimizeV2/questionnaires";
import { PLATFORM_LABEL, fmtDate } from "../components/optimizeV2/format";
import { ProgressBar, QuestionnaireStatus } from "../components/optimizeV2/QuestionnaireList";

const AUTOSAVE_MS = 800;

type SaveState = "idle" | "saving" | "saved" | "error" | "readonly";

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export default function OptimizeV2QuestionnairePage() {
  const { accountId = "", platform: platformParam = "", instrument: instrumentParam = "" } = useParams();
  const platform = platformParam === "zoom" || platformParam === "ringcentral" ? (platformParam as Platform) : null;
  const instrument = isInstrument(instrumentParam) ? instrumentParam : null;

  const [def, setDef] = useState<QuestionnaireDef | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  const [status, setStatus] = useState<"draft" | "complete">("draft");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [savedBy, setSavedBy] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activePart, setActivePart] = useState<string | null>(null);

  // Autosave bookkeeping. Every edit bumps `version`; a save records the
  // version it sent, and another save follows if edits landed meanwhile.
  const answersRef = useRef<Answers>({});
  const version = useRef(0);
  const savedVersion = useRef(0);
  const inFlight = useRef(false);
  const pendingStatus = useRef<"draft" | "complete" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readOnly = saveState === "readonly";

  useEffect(() => {
    if (!platform || !instrument) return;
    let cancelled = false;
    Promise.all([
      loadQuestionnaire(platform, instrument),
      optimizeV2Api.questionnaire(accountId, platform, instrument),
      optimizeV2Api.account(accountId),
    ]).then(([d, resp, acct]) => {
      if (cancelled) return;
      const initial = { ...resp.answers };
      if (d.caps.length && !hasScope(initial)) {
        // First open: start from the pre-SOW capability answers, else everything.
        initial.__scope = resp.suggested_scope ?? d.caps.map((c) => c.key);
      }
      answersRef.current = initial;
      setAnswers(initial);
      setDef(d);
      setStatus(resp.status);
      setSavedAt(resp.updated_at);
      setSavedBy(resp.updated_by_name);
      setActivePart(d.parts[0]?.key ?? null);
      setCustomerName(acct.account.customer_name);
    }).catch((e) => !cancelled && setLoadError(errMsg(e, "Couldn't load questionnaire")));
    return () => { cancelled = true; };
  }, [accountId, platform, instrument]);

  const flush = useCallback(async (nextStatus?: "draft" | "complete") => {
    if (!platform || !instrument) return;
    if (nextStatus) pendingStatus.current = nextStatus;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (inFlight.current) return; // the running save loops until nothing is left to send
    inFlight.current = true;
    setSaveState("saving");
    try {
      do {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        const sent = version.current;
        const sentStatus = pendingStatus.current ?? undefined;
        pendingStatus.current = null;
        const res = await optimizeV2Api.saveQuestionnaire(accountId, platform, instrument, { answers: answersRef.current, status: sentStatus });
        savedVersion.current = sent;
        setStatus(res.status);
        setSavedAt(res.updated_at);
        setSavedBy(res.updated_by_name);
      } while (version.current > savedVersion.current || pendingStatus.current);
      setSaveError(null);
      setSaveState("saved");
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setSaveState("readonly");
      } else {
        setSaveState("error");
        setSaveError(errMsg(e, "Couldn't save"));
      }
    } finally {
      inFlight.current = false;
    }
  }, [accountId, platform, instrument]);

  const update = useCallback((patch: Answers) => {
    if (readOnly) return;
    const next = { ...answersRef.current };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    answersRef.current = next;
    setAnswers(next);
    version.current += 1;
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, AUTOSAVE_MS);
  }, [flush, readOnly]);

  // Save pending edits when leaving the page; warn on tab close while unsaved.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (version.current > savedVersion.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timer.current && version.current > savedVersion.current) void flush();
    };
  }, [flush]);

  const scope = useMemo(() => new Set(Array.isArray(answers.__scope) ? (answers.__scope as string[]) : []), [answers.__scope]);
  const visibleGroups = useMemo(
    () => (def ? def.groups.filter((g) => (!def.caps.length || groupInScope(g, scope)) && (!activePart || g.part === activePart)) : []),
    [def, scope, activePart],
  );
  const inScope = useMemo(
    () => (def ? def.groups.filter((g) => !def.caps.length || groupInScope(g, scope)) : []),
    [def, scope],
  );
  const count = (groups: QuestionnaireDef["groups"]) => {
    const qs = groups.flatMap((g) => g.questions);
    return { answered: qs.filter((q) => isAnswered(answers[q.id])).length, total: qs.length };
  };

  if (!platform || !instrument) return <Page accountId={accountId}><div style={{ color: "#b91c1c", fontSize: 13 }}>Unknown questionnaire.</div></Page>;
  if (loadError) return <Page accountId={accountId}><div style={{ color: "#b91c1c", fontSize: 13 }}>{loadError}</div></Page>;
  if (!def) return <Page accountId={accountId}><div style={{ color: "#64748b", fontSize: 13 }}>Loading…</div></Page>;

  const total = count(inScope);
  const pct = total.total ? Math.round((100 * total.answered) / total.total) : 0;

  function toggleCap(key: string) {
    const next = new Set(scope);
    if (next.has(key)) next.delete(key); else next.add(key);
    // Keep the source order so the saved list is stable.
    update({ __scope: def!.caps.map((c) => c.key).filter((k) => next.has(k)) });
  }

  const savedLabel =
    saveState === "readonly" ? "View only: you don't have edit access, changes aren't saved"
      : saveState === "saving" ? "Saving…"
        : saveState === "error" ? `Not saved: ${saveError}`
          : savedAt ? `Saved ${fmtDate(savedAt)}${savedBy ? ` by ${savedBy}` : ""}` : "Not started";

  return (
    <Page accountId={accountId}>
      <div className="ms-page-header" style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 400px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>
            {customerName} · {PLATFORM_LABEL[platform]} · {INSTRUMENT_LABEL[instrument]}
          </div>
          <h1 className="ms-page-title" style={{ marginTop: 4 }}>{def.title}</h1>
          {def.lede && <div style={{ fontSize: 13, color: "#475569", marginTop: 6, lineHeight: 1.5, maxWidth: 760 }}>{def.lede}</div>}
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>{def.cadence} · {def.role}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <QuestionnaireStatus status={status} answered={total.answered} />
            <button
              type="button"
              className={status === "complete" ? "ms-btn-secondary" : "ms-btn-primary"}
              disabled={readOnly}
              onClick={() => { void flush(status === "complete" ? "draft" : "complete"); }}
            >
              {status === "complete" ? "Mark as draft" : "Mark complete"}
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ProgressBar pct={pct} width={160} />
            <span style={{ fontSize: 12, color: "#475569", whiteSpace: "nowrap" }}><b>{total.answered}</b> / {total.total} in scope</span>
          </div>
          <div style={{ fontSize: 12, color: saveState === "error" ? "#b91c1c" : saveState === "readonly" ? "#b45309" : "#64748b" }}>
            {savedLabel}
            {saveState === "error" && (
              <button type="button" className="ms-btn-ghost" style={{ marginLeft: 6, padding: "0 6px", fontSize: 12 }} onClick={() => { void flush(); }}>Retry</button>
            )}
          </div>
        </div>
      </div>

      {def.caps.length > 0 && (
        <div className="ms-card" style={{ padding: "10px 12px", marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>
            In scope <span style={{ fontWeight: 400, color: "#64748b" }}>· toggle to show only the sections that apply</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {def.caps.map((c) => {
              const on = scope.has(c.key);
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggleCap(c.key)}
                  disabled={readOnly}
                  aria-pressed={on}
                  style={{
                    fontSize: 12, padding: "3px 10px", borderRadius: 999, cursor: readOnly ? "default" : "pointer",
                    border: `1px solid ${on ? "#2563eb" : "#cbd5e1"}`, background: on ? "#eff6ff" : "#fff", color: on ? "#1d4ed8" : "#64748b",
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {def.parts.length > 1 && (
        <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e2e8f0", marginBottom: 16, overflowX: "auto" }}>
          {def.parts.map((p) => {
            const c = count(inScope.filter((g) => g.part === p.key));
            const on = p.key === activePart;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => { setActivePart(p.key); window.scrollTo(0, 0); }}
                style={{
                  padding: "8px 12px", fontSize: 13, fontWeight: on ? 700 : 500, background: "none", border: "none", cursor: "pointer",
                  borderBottom: `2px solid ${on ? "#2563eb" : "transparent"}`, color: on ? "#0f172a" : "#64748b", whiteSpace: "nowrap",
                }}
              >
                {p.label} <span style={{ fontSize: 11, color: "#94a3b8" }}>{c.answered}/{c.total}</span>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 220px) minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
        <nav style={{ position: "sticky", top: 16, maxHeight: "calc(100vh - 32px)", overflowY: "auto", fontSize: 13 }}>
          {visibleGroups.map((g) => {
            const c = count([g]);
            return (
              <a
                key={g.id}
                href={`#sec-${g.id}`}
                onClick={(e) => { e.preventDefault(); document.getElementById(`sec-${g.id}`)?.scrollIntoView({ block: "start", behavior: "smooth" }); }}
                style={{ display: "flex", justifyContent: "space-between", gap: 6, padding: "5px 8px", borderRadius: 6, color: "#334155", textDecoration: "none" }}
              >
                <span>{g.id} · {g.title}</span>
                <span style={{ color: c.answered === c.total ? "#16a34a" : "#94a3b8", fontSize: 11, whiteSpace: "nowrap" }}>{c.answered}/{c.total}</span>
              </a>
            );
          })}
        </nav>

        <fieldset disabled={readOnly} style={{ border: "none", padding: 0, margin: 0, minWidth: 0 }}>
          {visibleGroups.length === 0 && (
            <div style={{ color: "#64748b", fontSize: 13 }}>No sections in scope. Turn on a capability above.</div>
          )}
          {visibleGroups.map((g) => (
            <section key={g.id} id={`sec-${g.id}`} className="ms-card" style={{ marginBottom: 16, scrollMarginTop: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" }}>{g.id} · {g.title}</h2>
              {g.questions.map((q) => (
                <QuestionField key={q.id} q={q} platform={platform} answers={answers} update={update} />
              ))}
            </section>
          ))}
        </fieldset>
      </div>
    </Page>
  );
}

function Page({ accountId, children }: { accountId: string; children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <Link to={`/optimize-v2/${accountId}`} className="ms-btn-ghost" style={{ display: "inline-block", marginBottom: 16, padding: "4px 10px" }}>← Account</Link>
      {children}
    </div>
  );
}

const optionRow: React.CSSProperties = { display: "flex", alignItems: "flex-start", gap: 6, fontSize: 13, color: "#334155", padding: "3px 0", cursor: "pointer" };
const gridRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(140px, 220px)", gap: 8, alignItems: "center", fontSize: 13, color: "#334155" };

function QuestionField({ q, platform, answers, update }: {
  q: Question; platform: Platform; answers: Answers; update: (patch: Answers) => void;
}) {
  const v = answers[q.id];
  const note = typeof answers[`${q.id}__note`] === "string" ? (answers[`${q.id}__note`] as string) : "";
  const other = typeof answers[`${q.id}__other`] === "string" ? (answers[`${q.id}__other`] as string) : "";
  const [noteOpen, setNoteOpen] = useState(!!note);
  const opts = q.options ?? [];
  const specifyOpts = (q.type === "single" || q.type === "multiple") ? opts.filter((o) => isSpecifyOption(platform, o)) : [];
  const specifyChosen = specifyOpts.some((o) => (Array.isArray(v) ? v.includes(o) : v === o));
  const obj = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, string>;
  const setRow = (key: string, val: string) => {
    const next = { ...obj };
    if (val) next[key] = val; else delete next[key];
    update({ [q.id]: next });
  };
  /** Changing a choice clears the "Other — specify" text once no specify option is chosen. */
  const setChoice = (next: string | string[]) => {
    const stillSpecify = specifyOpts.some((o) => (Array.isArray(next) ? next.includes(o) : next === o));
    update({ [q.id]: next, ...(stillSpecify ? {} : { [`${q.id}__other`]: undefined }) });
  };

  // Fill questions keep their full text: the units ("____ sec", "____%") live only there.
  const text = q.text;

  let body: React.ReactNode;
  switch (q.type) {
    case "long":
      body = <textarea className="ms-input" rows={3} value={typeof v === "string" ? v : ""} onChange={(e) => update({ [q.id]: e.target.value })} style={{ resize: "vertical" }} />;
      break;
    case "single":
      body = (
        <div>
          {opts.map((o) => (
            <label key={o} style={optionRow}>
              <input type="radio" name={`q-${q.id}`} checked={v === o} onChange={() => setChoice(o)} style={{ marginTop: 3 }} />
              <span>{o}</span>
            </label>
          ))}
        </div>
      );
      break;
    case "multiple": {
      const list = Array.isArray(v) ? (v as string[]) : [];
      body = (
        <div>
          {opts.map((o) => (
            <label key={o} style={optionRow}>
              <input
                type="checkbox"
                checked={list.includes(o)}
                onChange={(e) => setChoice(e.target.checked ? opts.filter((x) => x === o || list.includes(x)) : list.filter((x) => x !== o))}
                style={{ marginTop: 3 }}
              />
              <span>{o}</span>
            </label>
          ))}
        </div>
      );
      break;
    }
    case "rating":
      body = (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Disagree</span>
          {[1, 2, 3, 4, 5].map((n) => {
            const on = Number(v) === n;
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                onClick={() => update({ [q.id]: on ? undefined : n })}
                style={{
                  width: 32, height: 32, borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: "pointer",
                  border: `1px solid ${on ? "#2563eb" : "#cbd5e1"}`, background: on ? "#2563eb" : "#fff", color: on ? "#fff" : "#334155",
                }}
              >
                {n}
              </button>
            );
          })}
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Agree</span>
        </div>
      );
      break;
    case "rank":
      // A rank list the engagement supplies (no options in the source) is free text.
      body = opts.length ? (
        <div style={{ display: "grid", gap: 4 }}>
          {opts.map((o) => (
            <div key={o} style={{ ...gridRow, gridTemplateColumns: "64px minmax(0, 1fr)" }}>
              <select className="ms-input" value={obj[o] ?? ""} onChange={(e) => setRow(o, e.target.value)} style={{ padding: "2px 4px" }}>
                <option value="">–</option>
                {opts.map((_, i) => <option key={i} value={String(i + 1)}>{i + 1}</option>)}
              </select>
              <span>{o}</span>
            </div>
          ))}
        </div>
      ) : (
        <textarea className="ms-input" rows={3} placeholder="One per line, in order" value={typeof v === "string" ? v : ""} onChange={(e) => update({ [q.id]: e.target.value })} />
      );
      break;
    case "matching":
      body = (
        <div style={{ display: "grid", gap: 4 }}>
          {(q.prompts ?? []).map((p) => (
            <div key={p} style={gridRow}>
              <span>{p}</span>
              <select className="ms-input" value={obj[p] ?? ""} onChange={(e) => setRow(p, e.target.value)} style={{ padding: "2px 4px" }}>
                <option value="">–</option>
                {(q.matchTo ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          ))}
        </div>
      );
      break;
    case "fill": {
      const blanks = q.blanks?.length ? q.blanks : ["Value"];
      body = (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
          {blanks.map((b) => (
            <label key={b} style={{ fontSize: 12, color: "#475569" }}>
              {b}
              <input className="ms-input" value={obj[b] ?? ""} onChange={(e) => setRow(b, e.target.value)} style={{ marginTop: 2 }} />
            </label>
          ))}
        </div>
      );
      break;
    }
    default:
      body = <input className="ms-input" value={typeof v === "string" ? v : ""} onChange={(e) => update({ [q.id]: e.target.value })} />;
  }


  return (
    <div style={{ padding: "14px 0", borderTop: "1px solid #f1f5f9" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#64748b", background: "#f1f5f9", borderRadius: 4, padding: "1px 5px" }}>{q.id}</span>
        {q.required && <span style={{ fontSize: 10, fontWeight: 700, color: "#b45309", textTransform: "uppercase" }}>Required</span>}
      </div>
      {text && <div style={{ fontSize: 14, color: "#0f172a", fontWeight: 500, marginBottom: 8, lineHeight: 1.45 }}>{text}</div>}
      {body}
      {specifyChosen && (
        <label style={{ display: "block", fontSize: 12, color: "#475569", marginTop: 6 }}>
          If “Other”, please specify
          <input className="ms-input" value={other} onChange={(e) => update({ [`${q.id}__other`]: e.target.value || undefined })} style={{ marginTop: 2 }} />
        </label>
      )}
      <div style={{ marginTop: 6 }}>
        <button type="button" className="ms-btn-ghost" style={{ padding: "0 6px", fontSize: 12 }} onClick={() => setNoteOpen(!noteOpen)}>
          {note ? "✎ Note" : "+ Note"}
        </button>
      </div>
      {noteOpen && (
        <textarea
          className="ms-input"
          rows={2}
          placeholder="Note for data collection…"
          value={note}
          onChange={(e) => update({ [`${q.id}__note`]: e.target.value || undefined })}
          style={{ marginTop: 4, fontSize: 13, resize: "vertical" }}
        />
      )}
      {q.logic && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#64748b", lineHeight: 1.5, borderLeft: "3px solid #e2e8f0", paddingLeft: 8 }}>{q.logic}</div>
      )}
    </div>
  );
}
