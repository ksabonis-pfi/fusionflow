import type { ReactNode } from "react";
import { fmt, sensDiscDigits } from "../../../../shared/roiModel/format";
import { SENSITIVITY_PLAN_COL, sensitivityPlanRow } from "../../../../shared/roiModel/model";
import type { RoiInputs, RoiResult } from "../../../../shared/roiModel/types";

type F = (v: number) => string;

function Row({ label, arr, f, cls, total }: { label: string; arr: (number | null)[]; f: F; cls?: string; total?: number }) {
  return (
    <tr className={cls}>
      <td>{label}</td>
      {[0, 1, 2, 3].map((i) => {
        const v = arr[i];
        return (
          <td key={i} className={v != null && v < 0 ? "neg" : undefined}>
            {v == null ? "—" : f(v)}
          </td>
        );
      })}
      <td className={total != null && total < 0 ? "neg" : undefined}>{total == null ? "—" : f(total)}</td>
    </tr>
  );
}

function Band({ children }: { children: ReactNode }) {
  return (
    <tr className="band">
      <td colSpan={6}>{children}</td>
    </tr>
  );
}

const pct1: F = (v) => fmt.pct(v);

/** The full ROI table: six bands, Today + Years 1–3 + 3-year total; negatives in red. */
export function RoiTable({ o }: { o: RoiResult }) {
  const { R, H } = o;
  return (
    <div className="roi-tbl-wrap">
      <table className="roi-table">
        <thead>
          <tr><th>Line item</th><th>Today</th><th>Year 1</th><th>Year 2</th><th>Year 3</th><th>3-yr total</th></tr>
        </thead>
        <tbody>
          <Band>Call volume</Band>
          <Row label="Annual calls offered" arr={R.offered} f={fmt.int} />
          <Row label="Calls routed to AI agent" arr={R.routed} f={fmt.int} />
          <Row label="Calls fully resolved by AI (contained)" arr={R.contained} f={fmt.int} />
          <Row label="Calls still needing a human" arr={R.human} f={fmt.int} />
          <Row label="Calls answered (total)" arr={R.answered} f={fmt.int} />
          <Row label="Calls abandoned" arr={R.abandoned} f={fmt.int} />
          <Row label="Additional callers served vs. today" arr={R.added} f={fmt.int} />
          <Row label="Outbound calls placed" arr={R.outbound} f={fmt.int} />
          <Row label="Outbound calls placed by AI" arr={R.outAIc} f={fmt.int} />
          <Row label="Outbound calls placed by agents" arr={R.outHuman} f={fmt.int} />
          <Band>Staffing</Band>
          <Row label="Human agents required" arr={R.req} f={fmt.one} />
          <Row label="Agents needed to hit target without AI" arr={R.needed} f={fmt.one} />
          <Row label="Agents offset vs. today" arr={R.offset} f={fmt.one} cls="key" />
          <Band>Annual cost</Band>
          <Row label="Human labor (fully loaded, blended)" arr={R.labor} f={fmt.usd} total={H.tot.labor} />
          <Row label="Turnover / onboarding" arr={R.turn} f={fmt.usd} total={H.tot.turn} />
          <Row label="AI voice conversations" arr={R.voice} f={fmt.usd} total={H.tot.voice} />
          <Row label="AI digital conversations" arr={R.digital} f={fmt.usd} total={H.tot.digital} />
          <Row label="Implementation / integration" arr={R.impl} f={fmt.usd} total={H.tot.impl} />
          <Row label="Managed services" arr={R.admin} f={fmt.usd} total={H.tot.admin} />
          <Row label="Total cost with AI agent" arr={R.total} f={fmt.usd} cls="tot" total={H.tot.total} />
          <Band>View A: savings vs. today's budget</Band>
          <Row label="Net savings vs. today's spend" arr={R.saveA} f={fmt.usd} cls="key" total={H.tot.saveA} />
          <Band>View B: savings vs. hiring to fix abandonment</Band>
          <Row label="Cost of human-only plan" arr={R.humanOnly} f={fmt.usd} total={H.tot.humanOnly} />
          <Row label="Net savings vs. human-only plan" arr={R.saveB} f={fmt.usd} cls="key" total={H.tot.saveB} />
          <Band>Unit economics</Band>
          <Row label="Human cost per handled call" arr={R.costPerCall} f={fmt.usd2} />
          <Row label="Effective AI cost per AI-handled call" arr={R.aiPerResolved} f={fmt.usd2} />
          <Row label="Break-even containment" arr={R.breakeven} f={pct1} />
        </tbody>
      </table>
    </div>
  );
}

export function CostPerAgentTable({ P, o }: { P: RoiInputs; o: RoiResult }) {
  const L = o.L;
  const parts: [string, number][] = [
    ["Base wages", L.base],
    ["Employer payroll taxes", L.tax],
    ["Health / dental / vision", L.health],
    ["Retirement match", L.k403],
    ["Life / disability", L.life],
  ];
  return (
    <div className="roi-tbl-wrap">
      <table className="roi-table">
        <thead>
          <tr><th>Cost component</th><th>Per paid hour</th><th>Per agent / yr</th><th>Team / yr</th></tr>
        </thead>
        <tbody>
          {parts.map(([n, v]) => (
            <tr key={n}><td>{n}</td><td>{fmt.usd2(v / L.paid)}</td><td>{fmt.usd(v)}</td><td>{fmt.usd(v * P.inhouse)}</td></tr>
          ))}
          <tr className="tot"><td>In-house fully loaded cost</td><td>{fmt.usd2(L.perHour)}</td><td>{fmt.usd(L.loaded)}</td><td>{fmt.usd(L.loaded * P.inhouse)}</td></tr>
          <tr><td>BPO cost per agent ({fmt.usd2(P.bpoRate)}/hr × {fmt.int(P.bpoHours)} hrs)</td><td>{fmt.usd2(P.bpoRate)}</td><td>{fmt.usd(L.bpoCost)}</td><td>{fmt.usd(L.bpoCost * P.bpo)}</td></tr>
          <tr><td>In-house share of agents</td><td>—</td><td>{fmt.pct(L.share)}</td><td>{fmt.int(L.agents)} agents</td></tr>
          <tr className="tot"><td>Blended all-in cost per agent (incl. turnover)</td><td>—</td><td>{fmt.usd(L.blendAll)}</td><td>—</td></tr>
          <tr><td>Loaded cost per productive hour (in-house)</td><td>{fmt.usd2(L.perProdHour)}</td><td>—</td><td>—</td></tr>
          <tr><td>Calls handled per agent per year</td><td>—</td><td>{fmt.int(L.callsPerAgent)}</td><td>—</td></tr>
          <tr><td>Implied handle time (minutes)</td><td>—</td><td>{fmt.one(L.impliedAHT)}</td><td>—</td></tr>
          <tr><td>Turnover cost per departing agent</td><td>—</td><td>{fmt.usd(L.turnPerDepart)}</td><td>{fmt.usd(L.turnoverTeam)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

/** Year 3 savings (View B) by containment × discount; the plan cell is outlined. */
export function SensitivityTable({ P, o }: { P: RoiInputs; o: RoiResult }) {
  const planRow = sensitivityPlanRow(o, P.contain[2]);
  return (
    <div className="roi-tbl-wrap">
      <table className="roi-table roi-sens">
        <thead>
          <tr>
            <th>Containment ↓ / Discount →</th>
            {o.sensD.map((d, j) => <th key={j}>{fmt.pct(d, sensDiscDigits(d))}</th>)}
          </tr>
        </thead>
        <tbody>
          {o.S.map((r, i) => (
            <tr key={i}>
              <td>{fmt.pct(o.sensC[i], 0)}</td>
              {r.map((v, j) => {
                const cls = [v < 0 ? "neg" : "", i === planRow && j === SENSITIVITY_PLAN_COL ? "plan" : ""].filter(Boolean).join(" ");
                return <td key={j} className={cls || undefined}>{fmt.M1(v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
