import { useState } from "react";
import { fmt } from "../../../../shared/roiModel/format";
import type { RoiInputs, RoiResult } from "../../../../shared/roiModel/types";
import { useToast } from "../../ui/ToastProvider";
import { CallOutcomesChart, SavingsChart } from "./RoiCharts";
import { CostPerAgentTable, RoiTable, SensitivityTable } from "./RoiTables";
import type { RoiWarning } from "./validation";

type ExportKind = "docx" | "pptx";

type Props = {
  P: RoiInputs;
  o: RoiResult;
  notes: RoiWarning[];
  onEdit: () => void;
};

export function ResultsView({ P, o, notes, onEdit }: Props) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const H = o.H;
  const name = P.client || "Scenario";

  async function runExport(kind: ExportKind) {
    if (busy) return;
    setBusy(kind);
    try {
      const m = await import("./exports");
      if (kind === "docx") await m.exportRoiWord(P, o);
      else await m.exportRoiPpt(P, o);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Export failed", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="roi-results">
      <div className="roi-sec-title">
        <h2>{name}: ROI summary</h2>
        <button className="ms-btn-secondary" type="button" onClick={onEdit}>Edit answers</button>
      </div>

      <div className="roi-export">
        <div>
          <b>Export for your team or customer</b>
          <span>A report built from these results, with charts, the full ROI table and a step-by-step explanation of how each number was calculated.</span>
        </div>
        <div className="roi-export-btns">
          <button className="ms-btn-primary" type="button" disabled={!!busy} onClick={() => runExport("docx")}>
            {busy === "docx" ? "Building…" : "Word report (.docx)"}
          </button>
          <button className="ms-btn-primary" type="button" disabled={!!busy} onClick={() => runExport("pptx")}>
            {busy === "pptx" ? "Building…" : "PowerPoint deck (.pptx)"}
          </button>
        </div>
      </div>

      <div className="roi-tiles">
        <Tile value={fmt.M1(H.saveA3)} label="3-yr net savings vs. today (View A)" neg={H.saveA3 < 0} />
        <Tile value={fmt.M1(H.saveB3)} label="3-yr savings vs. human-only plan (View B)" neg={H.saveB3 < 0} />
        <Tile value={fmt.pct(H.roiB, 0)} label="3-yr ROI, View B ÷ AI investment" neg={H.roiB < 0} />
        <Tile value={fmt.one(H.offsetY3)} label="Year 3 agents offset vs. today" />
        <Tile value={fmt.int(H.addedY3)} label="Year 3 additional callers served" />
        <Tile value={fmt.usd2(H.perProdHour)} label="Loaded cost per productive agent hour" />
      </div>

      <div className="roi-charts">
        <div className="roi-chart"><h3>What happens to every call</h3><CallOutcomesChart o={o} /></div>
        <div className="roi-chart"><h3>Net annual savings</h3><SavingsChart o={o} /></div>
      </div>

      <RoiTable o={o} />

      <div className="roi-sec-title"><h2>Cost per agent</h2></div>
      <CostPerAgentTable P={P} o={o} />

      <div className="roi-sec-title">
        <h2>Sensitivity: Year 3 savings vs. human-only plan</h2>
        <span className="roi-note">Outlined cell = your Year 3 containment and price</span>
      </div>
      <SensitivityTable P={P} o={o} />
      {notes.map((n) => <p key={n.id} className="roi-note">{n.text}</p>)}
    </section>
  );
}

function Tile({ value, label, neg }: { value: string; label: string; neg?: boolean }) {
  return (
    <div className="roi-tile">
      <b className={neg ? "bad" : undefined}>{value}</b>
      <span>{label}</span>
    </div>
  );
}
