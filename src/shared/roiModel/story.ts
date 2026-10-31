/**
 * Narrative and calculation walkthrough shared by the Word and PowerPoint
 * exports. A line-by-line port of the original builder's `story()`: the
 * wording, number formats and conditional sentences match it exactly (the
 * external parity harness compares the two deep-equal).
 */

import { ROI_STEPS } from "./fields.ts";
import { showInput, xf } from "./format.ts";
import type { RoiInputs, RoiResult, RoiStep } from "./types.ts";

/** [figure, caption] */
export type StoryPair = [string, string];
/** [label, how it's calculated, result] */
export type StoryCalcRow = [string, string, string];

export interface StoryCalcStep {
  /** Title, numbered ("1. What one in-house agent costs"). */
  t: string;
  /** One-paragraph explanation. */
  d: string;
  rows: StoryCalcRow[];
}

export interface RoiStory {
  /** Six headline tiles: [value, caption]. */
  headline: StoryPair[];
  intro: string;
  plan: string;
  /** [bold lead-in, sentence] */
  bullets: StoryPair[];
  /** [measure, value] */
  today: StoryPair[];
  calc: StoryCalcStep[];
  /** "Items to confirm": [bold lead-in, sentence] */
  confirm: StoryPair[];
}

/** Year-only rows are typed nullable; indexes 1–3 always hold numbers. */
const n = (v: number | null): number => v as number;

export function buildStory(p: RoiInputs, o: RoiResult, steps: RoiStep[] = ROI_STEPS): RoiStory {
  const R = o.R, L = o.L, H = o.H, c = p.client || "The client", ag = L.agents, ob = p.monthlyOutbound || 0;
  const taxPct = p.fica + p.pfml + p.sui + p.futa;
  const work0 = R.answered[0] + R.outbound[0];
  const y3hum = Math.max(0, R.human[3] - R.abandoned[3]);
  const flagged = steps.flatMap((s) => s.fields.filter((f) => f.flag));
  return {
    headline: [
      [xf.M1(H.saveB3), "3-year savings vs. hiring to hit service targets (View B)"],
      [xf.M1(H.saveA3), "3-year net savings vs. today's budget (View A)"],
      [xf.x(H.roiB), "Return on AI spend over 3 years (View B savings ÷ AI investment)"],
      [xf.one(H.offsetY3), "Agent positions offset by Year 3"],
      [xf.int(H.addedY3), "More callers answered per year by Year 3"],
      [xf.usd2(L.costPerCall) + " vs " + xf.usd2(R.aiPerResolved[3]), "Cost per call: agent vs. AI-handled (Year 3)"],
    ],
    intro:
      `${c}'s contact center receives about ${xf.int(p.monthlyCalls)} inbound calls a month (${xf.int(R.offered[0])} a year)` +
      (ob ? ` and places about ${xf.int(ob)} outbound calls a month (${xf.int(R.outbound[0])} a year).` : ".") +
      ` Today ${xf.pctT(p.abandon)} of inbound callers hang up before reaching anyone, roughly ${xf.int(R.abandoned[0])} unanswered calls a year. Fixing that with people alone would mean hiring well beyond today's team of ${xf.int(ag)} agents.`,
    plan:
      `The AI agent takes ${xf.pct(p.route[0], 0)} of inbound calls in Year 1, ${xf.pct(p.route[1], 0)} in Year 2 and ${xf.pct(p.route[2], 0)} in Year 3, and fully resolves ${xf.pct(p.contain[0], 0)}, ${xf.pct(p.contain[1], 0)} and ${xf.pct(p.contain[2], 0)} of the calls it takes.` +
      (p.outAI.some((v) => v > 0) ? ` It also places ${p.outAI.map((v) => xf.pct(v, 0)).join(", ")} of outbound calls in Years 1–3.` : "") +
      ` Under those assumptions:`,
    bullets: [
      ["Service improves. ", `Abandonment falls from ${xf.pct(p.abandon, 1)} to ${p.target.map((v) => xf.pct(v, 0)).join(", ")} over three years, so ${xf.int(R.added[3])} more callers a year are answered by Year 3.`],
      ["Spend goes down. ", `Total contact center cost drops by ${xf.M1(H.saveA3)} over three years compared with today's budget (View A), even while service improves.`],
      ["Hiring is avoided. ", `Compared with hiring enough agents to hit the same targets without AI, ${c} avoids ${xf.M1(H.saveB3)} over three years (View B), ${xf.x(H.roiB)} the ${xf.M1(H.aiInvest3)} spent on AI.`],
      ["Capacity frees up. ", `Staffing needs fall by ${xf.one(R.offset[1])} agent positions in Year 1 and ${xf.one(R.offset[3])} by Year 3.` + (p.turnover >= 0.3 ? ` With ${xf.pct(p.turnover, 0)} annual turnover, this can come from attrition rather than layoffs.` : "")],
    ],
    today: [
      ["Inbound calls offered per year", xf.int(R.offered[0])],
      ["Calls answered", xf.int(R.answered[0])],
      ["Calls abandoned", `${xf.int(R.abandoned[0])} (${xf.pctT(p.abandon)})`],
      ["Outbound calls placed per year", xf.int(R.outbound[0])],
      ["Agents (in-house + BPO)", `${xf.int(p.inhouse)} + ${xf.int(p.bpo)}`],
      ["Calls handled per agent per year", xf.int(L.callsPerAgent)],
      ["Implied handle time", `${xf.one(L.impliedAHT)} minutes at ${xf.pct(p.occupancy, 0)} occupancy`],
      ["Fully loaded cost per in-house agent", xf.usd(L.loaded)],
      ["All-in cost per agent incl. turnover", xf.usd(L.blendAll)],
      ["Human cost per handled call", xf.usd2(L.costPerCall)],
      ["Annual labor + turnover cost today", xf.usd(R.total[0])],
    ],
    calc: [
      {
        t: "1. What one in-house agent costs",
        d: "Start with pay for every paid hour, then add employer taxes and benefits. Time off is already inside paid hours, so it isn't counted twice.",
        rows: [
          ["Paid hours per year", `${xf.one(p.hpw)} hrs/week × ${xf.int(p.weeks)} weeks`, xf.int(L.paid)],
          ["Base wages", `${xf.usd2(p.wage)}/hr × ${xf.int(L.paid)} hrs`, xf.usd(L.base)],
          ["Employer payroll taxes", `${xf.pctT(taxPct)} of wages (FICA ${xf.pctT(p.fica)}, PFML ${xf.pctT(p.pfml)}, SUI ${xf.pctT(p.sui)}, FUTA/WC ${xf.pctT(p.futa)})`, xf.usd(L.tax)],
          ["Health, dental, vision", "Employer contribution per agent", xf.usd(L.health)],
          ["Retirement match", `${xf.pctT(p.k403)} of wages`, xf.usd(L.k403)],
          ["Life and disability", `${xf.usd2(p.life)}/hr × ${xf.int(L.paid)} hrs`, xf.usd(L.life)],
          ["Fully loaded cost per agent", "Sum of the above", xf.usd(L.loaded)],
          ["Productive hours", `${xf.int(L.paid)} paid − ${xf.int(L.ptoHrs)} PTO and holiday hrs`, xf.int(L.prod)],
          ["Cost per productive hour", `${xf.usd(L.loaded)} ÷ ${xf.int(L.prod)} hrs`, xf.usd2(L.perProdHour)],
        ],
      },
      {
        t: "2. What turnover adds",
        d: "Every agent who leaves must be recruited and trained. Turnover cost is spread across the team as a per-agent cost.",
        rows: [
          ["Cost per departure", `${xf.one(p.trainWeeks)} training weeks × ${xf.one(p.hpw)} hrs × ${xf.usd2(L.perHour)}/hr + ${xf.usd(p.recruit)} recruiting`, xf.usd(L.turnPerDepart)],
          ["Turnover per agent per year", `${xf.pct(p.turnover, 0)} turnover × ${xf.usd(L.turnPerDepart)}`, xf.usd(p.turnover * L.turnPerDepart)],
          ...(p.bpo > 0
            ? ([
                ["BPO cost per agent", `${xf.usd2(p.bpoRate)}/hr × ${xf.int(p.bpoHours)} hrs`, xf.usd(L.bpoCost)],
                ["Blend", `${xf.pct(L.share, 0)} in-house, ${xf.pct(1 - L.share, 0)} BPO by headcount`, "—"],
              ] as StoryCalcRow[])
            : []),
          ["All-in cost per agent", "Loaded cost + turnover" + (p.bpo > 0 ? ", blended with BPO" : ""), xf.usd(L.blendAll)],
        ],
      },
      {
        t: "3. How many calls an agent handles",
        d: p.aht
          ? "Calculated from the handle time and occupancy entered."
          : "Calibrated from today's actual workload: every answered inbound call plus every outbound call, divided by today's agents.",
        rows: p.aht
          ? [
              ["Calls per agent per year", `${xf.int(L.prod)} productive hrs × ${xf.pct(p.occupancy, 0)} occupancy × 60 ÷ ${xf.one(p.aht)} min`, xf.int(L.callsPerAgent)],
              ["Human cost per handled call", `${xf.usd(L.blendLabor)} labor ÷ ${xf.int(L.callsPerAgent)} calls`, xf.usd2(L.costPerCall)],
            ]
          : [
              ["Agent workload today", `${xf.int(R.answered[0])} answered inbound + ${xf.int(R.outbound[0])} outbound`, xf.int(work0)],
              ["Calls per agent per year", `${xf.int(work0)} ÷ ${xf.int(ag)} agents`, xf.int(L.callsPerAgent)],
              ["Implied handle time", `${xf.int(L.prod)} hrs × ${xf.pct(p.occupancy, 0)} × 60 ÷ ${xf.int(L.callsPerAgent)} calls`, xf.one(L.impliedAHT) + " min"],
              ["Human cost per handled call", `${xf.usd(L.blendLabor)} labor ÷ ${xf.int(L.callsPerAgent)} calls`, xf.usd2(L.costPerCall)],
            ],
      },
      {
        t: "4. Year 3 call flow with the AI agent",
        d: "Each year the model follows every call. Here is Year 3; Years 1 and 2 work the same way with their own inputs.",
        rows: [
          ["Inbound calls offered", `${xf.int(p.monthlyCalls)}/month × 12` + (p.growth ? ` × ${xf.pctT(1 + p.growth)}³ growth` : ""), xf.int(R.offered[3])],
          ["Routed to the AI", `${xf.int(R.offered[3])} × ${xf.pct(p.route[2], 0)}`, xf.int(R.routed[3])],
          ["Fully resolved by the AI", `${xf.int(R.routed[3])} × ${xf.pct(p.contain[2], 0)} containment`, xf.int(R.contained[3])],
          ["Answered at target", `${xf.int(R.offered[3])} × (1 − ${xf.pct(p.target[2], 0)} abandonment)`, xf.int(R.answered[3])],
          ["Inbound calls agents answer", `${xf.int(R.answered[3])} answered − ${xf.int(R.contained[3])} resolved by AI`, xf.int(y3hum)],
          ["Outbound calls agents place", `${xf.int(R.outbound[3])} outbound − ${xf.int(R.outAIc[3])} placed by AI`, xf.int(R.outHuman[3])],
          ["Agents required", `(${xf.int(y3hum)} + ${xf.int(R.outHuman[3])}) ÷ ${xf.int(L.callsPerAgent)} calls per agent`, xf.one(R.req[3])],
          ["Agents offset vs. today", `${xf.int(ag)} − ${xf.one(R.req[3])}`, xf.one(R.offset[3])],
        ],
      },
      {
        t: "5. Year 3 cost with the AI agent",
        d: "Agents still needed, plus what the AI costs.",
        rows: [
          ["Agent labor", `${xf.one(R.req[3])} agents × ${xf.usd(L.blendLabor)}`, xf.usd(R.labor[3])],
          ["Turnover", `${xf.one(R.req[3])} agents × ${xf.usd(L.blendTurn)}`, xf.usd(R.turn[3])],
          ["AI voice conversations", `${xf.int(n(R.routed[3]) + n(R.outAIc[3]))} AI calls × ${xf.pct(p.billed, 0)} billed × ${xf.usd2(p.price[2])}`, xf.usd(R.voice[3])],
          ...(p.digVol
            ? ([["AI chat conversations", `${xf.int(p.digVol)}/month × 12 × ${xf.usd2(p.digPrice * (1 - o.disc[2]))}`, xf.usd(R.digital[3])]] as StoryCalcRow[])
            : []),
          ["Managed services", "Annual fee", xf.usd(R.admin[3])],
          ["Total Year 3 cost with AI", "Sum of the above", xf.usd(R.total[3])],
        ],
      },
      {
        t: "6. Year 3 savings, two ways",
        d: "View A compares against today's spend. View B compares against what it would cost to hit the same service target with people alone.",
        rows: [
          ["View A: vs. today's budget", `${xf.usd(R.total[0])} today − ${xf.usd(R.total[3])} with AI`, xf.usd(R.saveA[3])],
          ["Agents needed without AI", `(${xf.int(R.answered[3])} answered + ${xf.int(R.outbound[3])} outbound) ÷ ${xf.int(L.callsPerAgent)}`, xf.one(R.needed[3])],
          ["Cost of human-only plan", `${xf.one(R.needed[3])} agents × ${xf.usd(L.blendAll)}`, xf.usd(R.humanOnly[3])],
          ["View B: vs. human-only plan", `${xf.usd(R.humanOnly[3])} − ${xf.usd(R.total[3])}`, xf.usd(R.saveB[3])],
        ],
      },
      {
        t: "7. Break-even check",
        d: "The AI is billed on every call routed to it, so it pays for itself once it resolves enough of them to offset its price.",
        rows: [
          ["AI price per routed call", `${xf.usd2(p.price[2])} × ${xf.pct(p.billed, 0)} billed`, xf.usd2(p.price[2] * p.billed)],
          ["Break-even containment", `${xf.usd2(p.price[2] * p.billed)} ÷ ${xf.usd2(L.costPerCall)} agent cost per call`, xf.pct(R.breakeven[3])],
          ["Planned containment", "Year 3 input", xf.pct(p.contain[2], 0)],
        ],
      },
    ],
    confirm: [
      ...(ob === 0
        ? ([["Outbound calls. ", "Outbound volume is set to 0. Outbound calls add to agent workload, so a real figure changes calls per agent and every savings number."]] as StoryPair[])
        : []),
      ...flagged.map((f): StoryPair => [f.label + ". ", `Currently ${showInput(f, p[f.k])}. ${f.help}`]),
    ],
  };
}
