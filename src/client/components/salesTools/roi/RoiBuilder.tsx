import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { buildRoiTsv } from "../../../../shared/roiModel/excel";
import { ROI_STEPS } from "../../../../shared/roiModel/fields";
import { compute } from "../../../../shared/roiModel/model";
import type { RoiInputs } from "../../../../shared/roiModel/types";
import { api } from "../../../lib/api";
import { useToast } from "../../ui/ToastProvider";
import { LiveRail } from "./LiveRail";
import { ResultsView } from "./ResultsView";
import { StepForm, StepRail } from "./StepForm";
import { BLANK_INPUTS, EXAMPLE_INPUTS, RESULTS, initialState, persistDraft, roiReducer } from "./state";
import { roiWarnings } from "./validation";
import "./roi.css";

/**
 * AI Agent ROI Builder: 8-step input wizard with a live result rail, and a
 * results page. Lazy-loaded from the Sales Tools launcher.
 *
 * The draft autosaves to this browser per user, so a refresh never loses work.
 */
export default function RoiBuilder() {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    api.me()
      .then((r) => live && setUserId(r.user.id))
      .catch(() => live && setUserId("anon"));
    return () => {
      live = false;
    };
  }, []);
  if (!userId) return <div className="roi-loading">Loading…</div>;
  return <Builder userId={userId} />;
}

type Armed = "example" | "blank" | null;

function Builder({ userId }: { userId: string }) {
  const { showToast } = useToast();
  const [state, dispatch] = useReducer(roiReducer, userId, initialState);
  const { P, cur, visited, rev } = state;
  const o = useMemo(() => compute(P), [P]);
  const warnings = useMemo(() => roiWarnings(P, o), [P, o]);

  useEffect(() => {
    persistDraft(userId, state);
  }, [userId, state]);

  // Two-click confirm for actions that replace every answer.
  const [armed, setArmed] = useState<Armed>(null);
  const armTimer = useRef<number | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => window.clearTimeout(armTimer.current), []);

  function go(id: string) {
    dispatch({ type: "go", id });
    // The app scrolls inside <main>, not the window.
    const scroller = rootRef.current?.closest("main");
    if (scroller) scroller.scrollTo({ top: 0 });
    else window.scrollTo({ top: 0 });
  }

  function replace(kind: Exclude<Armed, null>) {
    window.clearTimeout(armTimer.current);
    if (armed !== kind) {
      setArmed(kind);
      armTimer.current = window.setTimeout(() => setArmed(null), 3500);
      return;
    }
    setArmed(null);
    dispatch({ type: "replace", P: kind === "example" ? EXAMPLE_INPUTS : BLANK_INPUTS });
    showToast(kind === "example" ? "Loaded the example" : "Started blank", "success");
  }

  function open(next: RoiInputs) {
    dispatch({ type: "replace", P: next });
  }

  async function copyForExcel() {
    const text = buildRoiTsv(o);
    const done = () => showToast("Copied. Paste into Excel", "success");
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(text);
      done();
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        if (!document.execCommand("copy")) throw new Error("copy refused");
        done();
      } catch {
        showToast("Couldn't copy. Select the table and copy it instead", "error");
      }
      ta.remove();
    }
  }

  const onResults = cur === RESULTS;
  const step = ROI_STEPS.find((s) => s.id === cur) ?? ROI_STEPS[0];
  const banner = warnings.filter((w) => !w.resultsOnly);

  return (
    <div className="roi" ref={rootRef}>
      <div className="roi-tools">
        <button className="ms-btn-secondary" type="button" onClick={() => replace("example")}>
          {armed === "example" ? "Click again to replace your answers" : "Load example"}
        </button>
        <button className="ms-btn-secondary" type="button" onClick={() => replace("blank")}>
          {armed === "blank" ? "Click again to clear your answers" : "Start blank"}
        </button>
        <button className="ms-btn-secondary" type="button" onClick={copyForExcel}>Copy results for Excel</button>
        {!onResults && <button className="ms-btn-primary" type="button" onClick={() => go(RESULTS)}>See results</button>}
      </div>

      <div className={"roi-shell" + (onResults ? " wide" : "")}>
        <StepRail cur={cur} visited={visited} onGo={go} />
        <div className="roi-main">
          {banner.length > 0 && (
            <div className="roi-banner" aria-live="polite">
              <b>Check these inputs</b>
              <ul>{banner.map((w) => <li key={w.id}>{w.text}</li>)}</ul>
            </div>
          )}
          {onResults ? (
            <ResultsView P={P} o={o} notes={warnings.filter((w) => w.resultsOnly)} onEdit={() => go(ROI_STEPS[0].id)} />
          ) : (
            <StepForm
              key={`${step.id}:${rev}`}
              step={step}
              P={P}
              onSet={(k, v, i) => dispatch({ type: "set", k, v, i })}
              onGo={go}
            />
          )}
        </div>
        {!onResults && <LiveRail key={userId} P={P} o={o} userId={userId} onOpen={open} />}
      </div>
    </div>
  );
}
