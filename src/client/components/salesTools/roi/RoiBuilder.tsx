import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ROI_STEPS } from "../../../../shared/roiModel/fields";
import { compute } from "../../../../shared/roiModel/model";
import type { RoiInputs } from "../../../../shared/roiModel/types";
import { api } from "../../../lib/api";
import { useToast } from "../../ui/ToastProvider";
import { LiveRail } from "./LiveRail";
import { ResultsView } from "./ResultsView";
import { StepForm, StepRail } from "./StepForm";
import {
  BLANK_INPUTS,
  EXAMPLE_INPUTS,
  RESULTS,
  initialState,
  persistDraft,
  readLoaded,
  roiReducer,
  writeLoaded,
  type LoadedScenario,
} from "./state";
import { roiWarnings } from "./validation";
import "./roi.css";

/**
 * AI Agent ROI Builder: 8-step input wizard with a live result rail, and a
 * results page. Lazy-loaded from the Sales Tools launcher.
 *
 * The draft autosaves to this browser per user, so a refresh never loses work.
 * Saved scenarios are shared in D1 (see ScenariosPanel).
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

  // The shared scenario the draft came from, kept with the draft across refreshes.
  const [loaded, setLoadedState] = useState<LoadedScenario | null>(() => readLoaded(userId));
  function setLoaded(v: LoadedScenario | null) {
    setLoadedState(v);
    writeLoaded(userId, v);
  }

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
    setLoaded(null);
    showToast(kind === "example" ? "Loaded the example" : "Started blank", "success");
  }

  function open(next: RoiInputs, meta: LoadedScenario) {
    dispatch({ type: "replace", P: next });
    setLoaded(meta);
  }

  const [excelBusy, setExcelBusy] = useState(false);
  async function downloadExcel() {
    if (excelBusy) return;
    setExcelBusy(true);
    try {
      const m = await import("./exports");
      await m.exportRoiExcel(P, o);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Export failed", "error");
    } finally {
      setExcelBusy(false);
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
        <button className="ms-btn-secondary" type="button" disabled={excelBusy} onClick={downloadExcel}>
          {excelBusy ? "Building…" : "Download Excel"}
        </button>
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
        {!onResults && <LiveRail
            key={userId}
            P={P}
            o={o}
            userId={userId}
            loaded={loaded}
            onOpen={open}
            onSaved={setLoaded}
            onDetach={() => setLoaded(null)}
          />}
      </div>
    </div>
  );
}
