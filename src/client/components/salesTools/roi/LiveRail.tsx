import { fmt } from "../../../../shared/roiModel/format";
import type { RoiInputs, RoiResult } from "../../../../shared/roiModel/types";
import { ScenariosPanel } from "./ScenariosPanel";
import type { LoadedScenario } from "./state";

type Props = {
  P: RoiInputs;
  o: RoiResult;
  userId: string;
  loaded: LoadedScenario | null;
  onOpen: (P: RoiInputs, meta: LoadedScenario) => void;
  onSaved: (meta: LoadedScenario) => void;
  onDetach: () => void;
};

/** The five live KPIs plus the shared saved scenarios. */
export function LiveRail({ P, o, userId, loaded, onOpen, onSaved, onDetach }: Props) {
  const a = o.H.saveA3, b = o.H.saveB3;
  const name = P.client || "Scenario";

  return (
    <aside className="roi-live">
      <div className="roi-card" aria-live="polite">
        <h3>{name}: live result</h3>
        <Kpi value={fmt.M1(a)} tone={a < 0 ? "bad" : "good"} label="3-year net savings vs. today's budget" />
        <Kpi value={fmt.M1(b)} tone={b < 0 ? "bad" : "good"} label="3-year savings vs. hiring to hit the same targets" />
        <Kpi value={`${fmt.one(o.R.offset[1] as number)} → ${fmt.one(o.R.offset[3] as number)}`} label="Agents offset, Year 1 → Year 3" />
        <Kpi value={fmt.int(o.R.added[3])} label="More callers answered per year by Year 3" />
        <Kpi value={`${fmt.usd2(o.L.costPerCall)} vs ${fmt.usd2(o.R.aiPerResolved[3] as number)}`} label="Cost per call: agent vs. AI-resolved (Year 3)" />
      </div>
      <ScenariosPanel P={P} userId={userId} loaded={loaded} onOpen={onOpen} onSaved={onSaved} onDetach={onDetach} />
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
