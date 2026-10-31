import { ROI_STEPS } from "../../../../shared/roiModel/fields";
import type { RoiInputs, RoiStep } from "../../../../shared/roiModel/types";
import { NumberField, TextField, TrioField } from "./RoiFields";
import { RESULTS } from "./state";

type Props = {
  step: RoiStep;
  P: RoiInputs;
  onSet: (k: keyof RoiInputs, v: string | number | null, i?: number) => void;
  onGo: (id: string) => void;
};

export function StepRail({ cur, visited, onGo }: { cur: string; visited: string[]; onGo: (id: string) => void }) {
  const items = [
    ...ROI_STEPS.map((s, i) => ({ id: s.id, label: s.title, n: String(i + 1) })),
    { id: RESULTS, label: "Results", n: "✓" },
  ];
  return (
    <nav className="roi-rail" aria-label="Steps">
      <div className="roi-label">Questions</div>
      {items.map((s) => {
        const on = s.id === cur;
        const done = !on && visited.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            className={"roi-step" + (on ? " on" : "") + (done ? " done" : "")}
            aria-current={on ? "step" : undefined}
            onClick={() => onGo(s.id)}
          >
            <span className="roi-dot">{s.n}</span>
            {s.label}
          </button>
        );
      })}
    </nav>
  );
}

export function StepForm({ step, P, onSet, onGo }: Props) {
  const idx = ROI_STEPS.indexOf(step);
  const prev = idx > 0 ? ROI_STEPS[idx - 1] : null;
  const next = idx < ROI_STEPS.length - 1 ? ROI_STEPS[idx + 1] : null;

  return (
    <section className="roi-card">
      <div className="roi-qhead">
        <span className="roi-eyebrow">{step.eyebrow} of {ROI_STEPS.length}</span>
        <h2>{step.title}</h2>
        <p>{step.intro}</p>
      </div>
      <form className="roi-fields" noValidate onSubmit={(e) => e.preventDefault()}>
        {step.fields.map((f) => {
          const multi = f.type.endsWith("3");
          let ctl;
          if (f.type === "text") ctl = <TextField field={f} value={(P[f.k] as string) || ""} onCommit={(v) => onSet(f.k, v)} />;
          else if (multi) ctl = <TrioField field={f} value={P[f.k] as number[]} onCommit={(i, v) => onSet(f.k, v, i)} />;
          else ctl = <NumberField field={f} value={P[f.k] as number | null} onCommit={(v) => onSet(f.k, v)} />;
          return (
            <div key={f.k} className={"roi-field" + (multi ? " multi" : "")}>
              <label htmlFor={multi ? `f-${f.k}-0` : `f-${f.k}`}>{f.label}</label>
              <div className="roi-ctl">{ctl}</div>
              <p className={"roi-help" + (f.flag ? " flag" : "")}>
                {f.flag && <b>To confirm. </b>}
                {f.help}
              </p>
            </div>
          );
        })}
      </form>
      <div className="roi-nav">
        <button className="ms-btn-secondary" type="button" disabled={!prev} onClick={() => prev && onGo(prev.id)}>
          Back
        </button>
        <button className="ms-btn-primary" type="button" onClick={() => onGo(next ? next.id : RESULTS)}>
          {next ? `Next: ${next.title}` : "See results"}
        </button>
      </div>
    </section>
  );
}
