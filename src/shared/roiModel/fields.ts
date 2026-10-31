/**
 * The eight input steps of the AI Agent ROI builder.
 *
 * Labels, types and "To confirm" flags match the original builder; help text
 * is generic guidance (no customer-specific figures).
 */

import type { RoiField, RoiStep } from "./types.ts";

export const ROI_STEPS: RoiStep[] = [
  {
    id: "volume",
    title: "Calls and service today",
    eyebrow: "Step 1",
    intro: "Start with the client and how much call volume their contact center handles, both inbound and outbound.",
    fields: [
      { k: "client", type: "text", label: "Client name", help: "Shown on the results so you can tell scenarios apart." },
      { k: "monthlyCalls", type: "int", label: "Inbound calls offered per month", help: "Every inbound call that reaches the contact center, including abandoned ones. Take it from the phone system's queue reporting across all queues." },
      { k: "monthlyOutbound", type: "int", label: "Outbound calls placed per month", help: "Calls agents place: callbacks, scheduling, confirmations, follow-ups. Added to agent workload alongside answered inbound calls.", flag: true },
      { k: "growth", type: "pct", label: "Annual call volume growth", help: "Use 0% to stay conservative." },
      { k: "abandon", type: "pct", label: "Current abandonment rate", help: "Share of callers who hang up before an answer. Use the rate across all queues from the phone system's reporting." },
    ],
  },
  {
    id: "staff",
    title: "Who answers the phones today",
    eyebrow: "Step 2",
    intro: "Enter employed agents and outsourced (BPO) agents separately. The model blends their cost by headcount.",
    fields: [
      { k: "inhouse", type: "int", label: "In-house call center agents", help: "Agents on the client's payroll. Count agents, not phone system licenses, which often include supervisors, back office and inactive seats.", flag: true },
      { k: "bpo", type: "int", label: "BPO agents", help: "Outsourced agents working the client's queues.", flag: true },
      { k: "bpoRate", type: "money", label: "BPO cost per agent hour", help: "All-in rate paid to the BPO. Market: nearshore about $12–24, US-based about $28–42.", flag: true },
      { k: "bpoHours", type: "int", label: "BPO billed hours per agent per year", help: "Billed hours per week × 52 weeks, e.g. 40 × 52 = 2,080." },
    ],
  },
  {
    id: "pay",
    title: "In-house agent pay and time off",
    eyebrow: "Step 3",
    intro: "Wages and hours for agents on the client's payroll.",
    fields: [
      { k: "wage", type: "money", label: "Average hourly wage", help: "Average base wage for front-line agents. Public job postings for the role are a useful cross-check.", flag: true },
      { k: "hpw", type: "num", label: "Scheduled hours per week", help: "Scheduled hours per agent per week, e.g. 40 for full time." },
      { k: "weeks", type: "int", label: "Paid weeks per year", help: "Full-time agents are paid every week." },
      { k: "hpd", type: "num", label: "Paid hours per day", help: "Used to convert PTO and holiday days to hours." },
      { k: "pto", type: "int", label: "PTO days per year", help: "PTO is counted once, inside wages.", flag: true },
      { k: "hol", type: "int", label: "Paid holidays per year", help: "Paid holidays in the client's calendar.", flag: true },
    ],
  },
  {
    id: "benefits",
    title: "Employer taxes and benefits",
    eyebrow: "Step 4",
    intro: "What the client pays on top of wages for each in-house agent.",
    fields: [
      { k: "fica", type: "pct", label: "FICA (Social Security + Medicare)", help: "Federal rate: 7.65%." },
      { k: "pfml", type: "pct", label: "State paid family & medical leave", help: "Employer share of the state's paid family and medical leave program, if any. Use 0% if the state has none.", flag: true },
      { k: "sui", type: "pct", label: "State unemployment (effective rate)", help: "Industry estimate; depends on the client's rating.", flag: true },
      { k: "futa", type: "pct", label: "FUTA + workers' comp", help: "Industry estimate.", flag: true },
      { k: "health", type: "money0", label: "Health, dental and vision per agent per year", help: "Employer contribution, single coverage. Industry midpoint $7,500.", flag: true },
      { k: "k403", type: "pct", label: "Retirement match", help: "Employer match as a share of wages, e.g. 3%.", flag: true },
      { k: "life", type: "money", label: "Life and disability insurance per paid hour", help: "Industry estimate $0.20.", flag: true },
    ],
  },
  {
    id: "turn",
    title: "Turnover and hiring",
    eyebrow: "Step 5",
    intro: "Applies to in-house agents only. BPO turnover is the BPO's cost.",
    fields: [
      { k: "turnover", type: "pct", label: "Annual agent turnover", help: "Share of in-house agents who leave in a year. Ask HR for the client's actual figure.", flag: true },
      { k: "trainWeeks", type: "num", label: "Paid training weeks per new hire", help: "Paid weeks before a new hire takes calls on their own. Check the client's onboarding plan.", flag: true },
      { k: "recruit", type: "money0", label: "Recruiting cost per hire", help: "Ads, screening, background check, HR time.", flag: true },
    ],
  },
  {
    id: "service",
    title: "Service goals and agent workload",
    eyebrow: "Step 6",
    intro: "What abandonment rate should the client reach each year, and how many calls can an agent handle?",
    fields: [
      { k: "target", type: "pct3", label: "Target abandonment rate", help: "The model assumes each year's target is met. Common contact center goal: 5–8%.", flag: true },
      { k: "aht", type: "numOpt", label: "Average handle time in minutes (optional)", help: "Leave blank to calibrate calls per agent from today's answered inbound calls plus outbound calls ÷ agents. Enter real handle time from call analytics to override." },
      { k: "occupancy", type: "pct", label: "Agent occupancy", help: "Share of working time on calls. Only used when handle time is entered. Typical 70–85%." },
    ],
  },
  {
    id: "rollout",
    title: "AI rollout",
    eyebrow: "Step 7",
    intro: "How much volume goes to the AI agent each year, and how much of it the AI resolves on its own.",
    fields: [
      { k: "route", type: "pct3", label: "Share of calls routed to the AI", help: "Share of inbound calls sent to the AI each year. Often ramps up as more call types and queues are added." },
      { k: "contain", type: "pct3", label: "Containment (routed calls the AI fully resolves)", help: "The biggest driver of savings. Validate with skill-mining and pilot data.", flag: true },
      { k: "outAI", type: "pct3", label: "Share of outbound calls placed by the AI", help: "Reminders, confirmations and follow-ups the AI can make. 0% keeps all outbound with agents. Billed at the AI voice price.", flag: true },
    ],
  },
  {
    id: "pricing",
    title: "AI pricing and services",
    eyebrow: "Step 8",
    intro: "What the client pays for the AI agent.",
    fields: [
      { k: "listPrice", type: "money", label: "List price per voice conversation", help: "Vendor list price per AI voice conversation. Dialpad list: $1.99." },
      { k: "price", type: "money3", label: "Price paid per AI conversation", help: "What the client pays per AI conversation each year after any negotiated discount. Enter the list price if there's no discount." },
      { k: "billed", type: "pct", label: "Share of routed calls billed", help: "100% is conservative: warm transfers are billed; greet-and-route calls aren't." },
      { k: "digVol", type: "int", label: "Monthly chat conversations handled by AI", help: "0 if chat isn't in scope." },
      { k: "digPrice", type: "money", label: "List price per chat conversation", help: "Dialpad list: $0.99. The same yearly discount is applied." },
      { k: "impl", type: "money0", label: "One-time implementation (Year 1)", help: "One-time setup fee charged in Year 1. Use $0 if it's included in managed services." },
      { k: "admin", type: "money0", label: "Managed services per year", help: "Annual managed services or administration fee for the AI agent." },
    ],
  },
];

/** Every field across all steps, in step order. */
export const ROI_FIELDS: RoiField[] = ROI_STEPS.flatMap((s) => s.fields);
