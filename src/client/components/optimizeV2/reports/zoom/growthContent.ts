// Authored catalog for the Zoom Growth & Enablement plan. Ported from the
// standalone Zoom agent (public/growth-content.js); wording unchanged apart
// from markup (<strong> → **bold**).
import type { Ecosystem, GrowthCategory } from "../types";

export type ZoomSignals = {
  cc: boolean; phone: boolean; meetings: boolean; rooms: boolean; zva: boolean;
  crm: boolean; crmName: string; ssoEnforced: boolean; aiCompanion: boolean; ecosystem: Ecosystem["key"];
};

/** Ecosystem inference from the detected CRM name (the API can't reveal the real suite). */
export function ecosystemOf(crmName: string): Ecosystem {
  const c = (crmName || "").toLowerCase();
  if (/dynamics|microsoft|o365|office 365|outlook|entra|azure/.test(c)) return { key: "microsoft", label: "Microsoft 365 / Teams", basis: "Observed", note: `inferred from your ${crmName || "Microsoft"} tooling` };
  if (/google|gsuite|workspace|gmail/.test(c)) return { key: "google", label: "Google Workspace", basis: "Observed", note: `inferred from your ${crmName || "Google"} tooling` };
  if (/salesforce|hubspot|zendesk|servicenow|freshdesk/.test(c)) return { key: "saas", label: crmName, basis: "Observed", note: `based on your ${crmName} CRM` };
  return { key: "unknown", label: "your collaboration suite", basis: "Observed", note: "not detectable via the Zoom API — confirm the customer's primary suite" };
}

export type MarketplacePlay = {
  key: string; icon: string; ecosystem?: "microsoft" | "google" | null; title: string;
  why: string | ((s: ZoomSignals) => string); benefit: string; steps: string[]; when: (s: ZoomSignals) => boolean;
};

// Curated Marketplace / integration plays.
export const MARKETPLACE: MarketplacePlay[] = [
  { key: "teams", icon: "layers", ecosystem: "microsoft", title: "Zoom for Microsoft Teams",
    why: "Your teams appear to run on Microsoft 365, so Zoom lives in a separate window they have to remember to open.",
    benefit: "Start Zoom meetings and calls from inside Teams and sync presence — the phone and meeting experience moves into the tool employees already keep open all day.",
    steps: ["Zoom App Marketplace → install 'Zoom for Microsoft Teams' and approve it account-wide.", "Enable the Teams calling/meeting tabs and presence sync in the app settings.", "Announce it so users start Zoom from Teams instead of switching apps."],
    when: (s) => s.meetings || s.phone },
  { key: "outlook", icon: "clock", ecosystem: "microsoft", title: "Zoom for Outlook add-in",
    why: "Scheduling and joining lives in Outlook for a Microsoft shop.",
    benefit: "One-click schedule-a-Zoom and join-from-the-invite inside Outlook and the Microsoft calendar — fewer steps, fewer mis-scheduled meetings.",
    steps: ["Marketplace → install the 'Zoom for Outlook' add-in (admin-deployed via Microsoft 365 admin center).", "Enable calendar & contacts integration so availability and one-click join appear on every invite."],
    when: (s) => s.meetings },
  { key: "google", icon: "clock", ecosystem: "google", title: "Zoom for Google Workspace",
    why: "Your teams appear to run on Google Workspace.",
    benefit: "Schedule and join Zoom from Google Calendar and Gmail, with availability and one-click join on every event.",
    steps: ["Marketplace → install 'Zoom for Google Workspace' (admin-installed for the domain).", "Enable the Calendar & Gmail add-on and calendar/contacts integration."],
    when: (s) => s.meetings },
  { key: "crm_cti", icon: "bot", title: "Embed Contact Center in your CRM (screen pop + CTI)",
    why: (s) => `Contact Center is in use${s.crmName ? ` alongside ${s.crmName}` : ""}, but agents likely toggle between the console and the CRM.`,
    benefit: "Screen-pop the customer record on answer, click-to-dial, and write disposition/summary back to the CRM — less handle time, cleaner records, a single pane for agents.",
    steps: ["Marketplace → connect your CRM to Zoom Contact Center (Salesforce / Dynamics / HubSpot / ServiceNow / Zendesk).", "In the flow, add a screen-pop/CRM action keyed on ANI/email.", "Enable activity + disposition write-back so every interaction logs to the record."],
    when: (s) => s.cc },
  { key: "phone_crm", icon: "trend", title: "Zoom Phone ↔ CRM click-to-dial & logging",
    why: (s) => `Zoom Phone is active${s.crmName ? ` and ${s.crmName} is your system of record` : ""}.`,
    benefit: "Click-to-dial from the CRM and automatic call logging / notes to the contact — reps stop copy-pasting numbers and call history writes itself.",
    steps: ["Marketplace → install the Zoom Phone connector for your CRM (or the Power Pack CRM integration).", "Map users and enable automatic call logging + click-to-dial."],
    when: (s) => s.phone && s.crm },
  { key: "scheduler", icon: "clock", title: "Zoom Scheduler (bookable availability)",
    why: "Meetings are in active use; booking back-and-forth is friction you can remove.",
    benefit: "Share a booking link that respects real calendar availability — cuts scheduling email threads and no-shows, and works with Microsoft 365 or Google calendars.",
    steps: ["Enable Zoom Scheduler for the account and connect each user's calendar.", "Publish booking pages for customer-facing roles (sales, support, CSMs)."],
    when: (s) => s.meetings },
  { key: "rooms_cal", icon: "building", title: "Connect Zoom Rooms to calendars",
    why: "Zoom Rooms are deployed; without calendar resources they're hard to find and book.",
    benefit: "Rooms show real-time availability and one-tap join from the calendar — higher room utilization and fewer ghost meetings.",
    steps: ["Rooms & Workspaces → connect each room to its Exchange/Microsoft 365 or Google calendar resource.", "Enable check-in / auto-release to reclaim no-show bookings."],
    when: (s) => s.rooms },
  { key: "itsm", icon: "gears", ecosystem: null, title: "Connect ITSM / ticketing (e.g. ServiceNow)",
    why: "Support interactions in Contact Center should create and update tickets automatically.",
    benefit: "Auto-create and update cases from calls/chats and surface ticket context to agents — fewer dropped follow-ups, faster resolution.",
    steps: ["Marketplace → connect your ITSM (ServiceNow / Zendesk / Jira) to Zoom Contact Center.", "Map interaction → case creation and write-back of outcome/disposition."],
    when: (s) => s.cc },
  { key: "sso", icon: "shield", title: "Enforce SSO through your identity provider",
    why: "Single sign-on isn't enforced, so access depends on standalone Zoom passwords.",
    benefit: "One secure login through your IdP (Entra / Okta / Google), plus SCIM to auto-reclaim licenses when people leave.",
    steps: ["Admin → Single Sign-On: configure your IdP and require SSO.", "Add SCIM provisioning so leavers are auto-deprovisioned and seats return."],
    when: (s) => !s.ssoEnforced },
  { key: "marketplace_review", icon: "search", title: "Review the Zoom App Marketplace for your stack",
    why: "The Marketplace has pre-built connectors for most business tools — unused connectors are value left on the table.",
    benefit: "A quick pass to connect the handful of systems your teams use daily so Zoom fits your workflows instead of sitting beside them.",
    steps: ["Browse marketplace.zoom.us by category (CRM, productivity, ITSM, collaboration).", "Shortlist the 2–3 connectors for the systems your teams use most and pilot them."],
    when: () => true },
];

export const CATEGORIES: GrowthCategory[] = [
  { key: "untapped", icon: "layers", label: "Untapped platform", lede: "Workloads you already own that aren't returning activity yet — the fastest value is turning on what you've already bought." },
  { key: "licensing", icon: "coins", label: "Licensing optimization", lede: "Spend you can reclaim or right-size so the renewal reflects real usage." },
  { key: "workflow", icon: "gears", label: "Workflow enablement", lede: "Features and settings to switch on for smoother day-to-day work." },
  { key: "cx", icon: "heart", label: "Customer experience", lede: "Plays that lift the experience your customers and employees feel." },
  { key: "marketplace", icon: "spark", label: "Marketplace & integrations", lede: "Connect Zoom into the tools your teams already use, so it fits your workflows instead of sitting beside them." },
];

export function growthSummary(customer: string, untapped: number, reclaimSeats: number): string[] {
  const paras: string[] = [];
  paras.push(`${customer} has a working Zoom deployment — this plan looks at where to grow next: what you already own but aren't using yet, what spend to right-size, the features and integrations that would fit Zoom into how your teams actually work, and a couple of wins to start with.`);
  const bits: string[] = [];
  if (untapped) bits.push(`**${untapped}** owned ${untapped === 1 ? "workload is" : "workloads are"} under-used`);
  if (reclaimSeats) bits.push(`about **${reclaimSeats}** ${reclaimSeats === 1 ? "licence" : "licenses"} look reclaimable`);
  if (bits.length) paras.push(`At a glance: ${bits.join(", ")}. None of this requires new spend to start — it's realizing value from what's already in place.`);
  paras.push("The **Top Wins** below are the two or three highest-leverage moves, chosen for impact against effort. Everything after is the fuller opportunity map by category, each item with the concrete steps to act on it.");
  return paras;
}

export const TOP_WINS_LEDE = "Chosen for the best impact against the least effort — start here.";
export const HOW_WE_PICKED = "Each opportunity is scored on business impact against the effort to deliver it; quantified savings and score-lift are weighted up. These are the highest-leverage moves to open the next conversation.";
