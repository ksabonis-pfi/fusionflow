import { useState } from "react";
import { fmt } from "../../../../shared/roiModel/format";
import type { RoiInputs, RoiResult } from "../../../../shared/roiModel/types";
import { useToast } from "../../ui/ToastProvider";
import { coerceInputs, readSaved, writeSaved } from "./state";

type Props = {
  P: RoiInputs;
  o: RoiResult;
  userId: string;
  onOpen: (P: RoiInputs) => void;
};

/** The five live KPIs plus browser-only saved scenarios (stopgap until D1). */
export function LiveRail({ P, o, userId, onOpen }: Props) {
  const { showToast } = useToast();
  const [saved, setSaved] = useState(() => readSaved(userId));
  const names = Object.keys(saved);
  const [pick, setPick] = useState("");
  const selected = names.includes(pick) ? pick : (names[0] ?? "");
  const a = o.H.saveA3, b = o.H.saveB3;
  const name = P.client || "Scenario";

  function save() {
    try {
      const existed = Object.prototype.hasOwnProperty.call(saved, name);
      setSaved(writeSaved(userId, name, P));
      setPick(name);
      showToast(existed ? `Updated ${name}` : `Saved ${name}`, "success");
    } catch {
      showToast("This browser can't save scenarios", "error");
    }
  }

  function open() {
    const s = saved[selected];
    if (!selected || !s) return;
    onOpen(coerceInputs(s));
    showToast(`Opened ${selected}`, "success");
  }

  return (
    <aside className="roi-live" aria-live="polite">
      <div className="roi-card">
        <h3>{name}: live result</h3>
        <Kpi value={fmt.M1(a)} tone={a < 0 ? "bad" : "good"} label="3-year net savings vs. today's budget" />
        <Kpi value={fmt.M1(b)} tone={b < 0 ? "bad" : "good"} label="3-year savings vs. hiring to hit the same targets" />
        <Kpi value={`${fmt.one(o.R.offset[1] as number)} → ${fmt.one(o.R.offset[3] as number)}`} label="Agents offset, Year 1 → Year 3" />
        <Kpi value={fmt.int(o.R.added[3])} label="More callers answered per year by Year 3" />
        <Kpi value={`${fmt.usd2(o.L.costPerCall)} vs ${fmt.usd2(o.R.aiPerResolved[3] as number)}`} label="Cost per call: agent vs. AI-resolved (Year 3)" />
      </div>
      <div className="roi-card roi-saves">
        <h3>Saved scenarios</h3>
        <div className="roi-row">
          <select aria-label="Saved scenarios" value={selected} onChange={(e) => setPick(e.target.value)} disabled={!names.length}>
            {names.length ? names.map((n) => <option key={n} value={n}>{n}</option>) : <option value="">No saved scenarios yet</option>}
          </select>
          <button className="ms-btn-secondary" type="button" onClick={open} disabled={!selected}>Open</button>
        </div>
        <button className="ms-btn-secondary" type="button" onClick={save}>
          Save current as "{name}"
        </button>
        <p className="roi-note">Saved in this browser only. Saving again with the same client name replaces it.</p>
      </div>
    </aside>
  );
}

function Kpi({ value, label, tone }: { value: string; label: string; tone?: "good" | "bad" }) {
  return (
    <div className="roi-kpi">
      <b className={tone}>{value}</b>
      <span>{label}</span>
    </div>
  );
}
