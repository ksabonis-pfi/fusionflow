// Authored catalog for the RingCentral Growth & Enablement plan. Ported from the
// standalone RingCentral agent (public/growth-content.js); wording unchanged apart
// from markup (<strong> → **bold**). None of the Zoom content transfers:
// different products, different App Gallery, different integration story.
import type { Ecosystem, GrowthCategory } from "../types";

export type RcSignals = {
  ringex: boolean; ringcx: boolean; ringsense: boolean; recording: boolean; video: boolean; sms: boolean;
  rooms: boolean; hardPhones: boolean; offlinePct: number | null; dndBlocking: number; faxNumbers: number;
  ssoEnforced: boolean; crmName: string; ecosystem: Ecosystem["key"];
};

/** RingCentral's API can't reveal the collaboration suite, so this is inferred
 *  from whatever CRM or directory signal the assessment found, always Observed. */
export function ecosystemOf(hint: string): Ecosystem {
  const c = (hint || "").toLowerCase();
  if (/dynamics|microsoft|o365|office 365|outlook|entra|azure|teams/.test(c))
    return { key: "microsoft", label: "Microsoft 365 / Teams", basis: "Observed", note: `inferred from your ${hint || "Microsoft"} tooling` };
  if (/google|gsuite|workspace|gmail/.test(c))
    return { key: "google", label: "Google Workspace", basis: "Observed", note: `inferred from your ${hint || "Google"} tooling` };
  if (/salesforce|hubspot|zendesk|servicenow|freshdesk|epic|dynamics/.test(c))
    return { key: "saas", label: hint, basis: "Observed", note: `based on your ${hint} tooling` };
  return { key: "unknown", label: "your collaboration suite", basis: "Observed", note: "not detectable through the RingCentral API — confirm the customer's primary suite" };
}

export type GalleryPlay = {
  key: string; icon: string; ecosystem?: "microsoft" | "google"; title: string;
  why: string | ((s: RcSignals) => string); benefit: string; steps: string[]; when: (s: RcSignals) => boolean;
};

// Curated App Gallery / integration plays.
export const GALLERY: GalleryPlay[] = [
  { key: "teams", icon: "layers", ecosystem: "microsoft", title: "RingCentral for Microsoft Teams",
    why: "Your teams appear to run on Microsoft 365, so RingCentral sits in a separate window people have to remember to open.",
    benefit: "Dial, answer and transfer from inside Teams with presence in sync — the phone system moves into the app employees already keep open all day, which is usually what finally moves softphone adoption.",
    steps: ["App Gallery → install the RingCentral for Microsoft Teams app and approve it tenant-wide.", "Choose embedded dialer or Direct Routing depending on whether Teams Phone is already licensed.", "Announce it so users stop switching apps to make a call."],
    when: (s) => s.ringex },
  { key: "outlook", icon: "clock", ecosystem: "microsoft", title: "RingCentral for Outlook",
    why: "Scheduling and click-to-dial live in Outlook for a Microsoft shop.",
    benefit: "Schedule RingCentral Video from the calendar and click-to-dial any number in a contact or email — fewer steps and fewer mis-dials.",
    steps: ["App Gallery → deploy the RingCentral for Outlook add-in centrally from the Microsoft 365 admin center.", "Enable calendar and contact sync so availability and one-click join appear on every invite."],
    when: (s) => s.ringex || s.video },
  { key: "google", icon: "clock", ecosystem: "google", title: "RingCentral for Google Workspace",
    why: "Your teams appear to run on Google Workspace.",
    benefit: "Schedule and join from Google Calendar, click-to-dial from Gmail and Contacts, with availability on every event.",
    steps: ["App Gallery → install RingCentral for Google Workspace for the domain.", "Enable the Calendar and Gmail add-ons plus contact sync."],
    when: (s) => s.ringex || s.video },
  { key: "crm_cti", icon: "bot", title: "Embed RingCX in your CRM (screen pop + CTI)",
    why: (s) => `RingCX is in use${s.crmName ? ` alongside ${s.crmName}` : ""}, but agents are likely toggling between the agent desktop and the CRM.`,
    benefit: "Screen-pop the customer record on answer, click-to-dial, and write disposition and summary back to the CRM — lower handle time, cleaner records, one pane for agents.",
    steps: ["App Gallery → connect your CRM to RingCX (Salesforce, Dynamics, HubSpot, ServiceNow, Zendesk).", "Add a screen-pop step to the routing flow keyed on ANI or email.", "Enable activity and disposition write-back so every interaction logs to the record."],
    when: (s) => s.ringcx },
  { key: "phone_crm", icon: "trend", title: "RingEX ↔ CRM click-to-dial and call logging",
    why: (s) => `RingEX is carrying real call volume${s.crmName ? ` and ${s.crmName} is your system of record` : ""}.`,
    benefit: "Click-to-dial from the CRM and automatic call logging to the contact record — reps stop copy-pasting numbers and call history writes itself.",
    steps: ["App Gallery → install the RingCentral embedded dialer for your CRM.", "Map users and enable automatic call logging and click-to-dial."],
    when: (s) => s.ringex },
  { key: "ringsense", icon: "spark", title: "Extend RingSense to the conversations that matter",
    why: "Recording and AI insight are the evidence base for coaching, QA and dispute defence — without them, quality findings rest on impressions.",
    benefit: "Automatic transcription, summaries and trend analysis across the calls you care about, so supervisors coach from the actual conversation rather than a sample they happened to hear.",
    steps: ["Confirm automatic recording is on for the groups that require it, and that consent is documented.", "Assign RingSense licences to those teams.", "Review the first month's themes and pick one coaching focus."],
    when: (s) => s.recording || s.ringcx },
  { key: "rooms", icon: "building", title: "Connect RingCentral Rooms to calendars",
    why: "Meeting rooms without calendar resources are hard to find and harder to book.",
    benefit: "Rooms show real-time availability with one-tap join, and check-in releases no-shows — higher utilisation from hardware you already own.",
    steps: ["Connect each room to its Microsoft 365 or Google calendar resource.", "Enable check-in and auto-release to reclaim abandoned bookings."],
    when: (s) => s.rooms },
  { key: "sms", icon: "spark", title: "Wire SMS into the systems that trigger it",
    why: "SMS is already in use, but messages sent by hand do not scale and are not logged anywhere useful.",
    benefit: "Appointment reminders, delivery updates and confirmations fired from the system that already knows about them — the volume grows without anyone typing, and it lands in the customer record.",
    steps: ["App Gallery → connect SMS to your CRM or scheduling system.", "Confirm A2P 10DLC registration covers the sending numbers for the new volume.", "Start with one automated message type and measure the call deflection."],
    when: (s) => s.sms },
  { key: "archiver", icon: "shield", title: "Automate retention with RingCentral Archiver",
    why: "Retention obligations met by manual export are obligations met inconsistently.",
    benefit: "Recordings, messages and faxes archived automatically to your own storage on a schedule you set — the compliance position stops depending on someone remembering.",
    steps: ["Configure Archiver against your storage (Dropbox, Google Drive, SFTP or Box).", "Set the retention window to your stated policy and confirm the first export."],
    when: (s) => s.recording },
  { key: "sso", icon: "shield", title: "Enforce single sign-on and SCIM provisioning",
    why: "Single sign-on is not enforced, so access depends on standalone RingCentral passwords and offboarding depends on someone remembering.",
    benefit: "One secure login through your identity provider, and SCIM so leavers release their seat automatically — this is both a security control and a licence-reclaim mechanism.",
    steps: ["Admin → Single Sign-On: configure your IdP and require SSO for all users.", "Add SCIM provisioning so joiners, movers and leavers flow from the directory."],
    when: (s) => !s.ssoEnforced },
  { key: "gallery_review", icon: "search", title: "Review the RingCentral App Gallery for your stack",
    why: "The App Gallery has pre-built connectors for most business systems — an unused connector is value left on the table.",
    benefit: "A short pass to connect the handful of systems your teams touch daily, so RingCentral fits the workflow instead of sitting beside it.",
    steps: ["Browse the App Gallery by category: CRM, productivity, ITSM, collaboration.", "Shortlist the two or three connectors for the systems your teams use most, and pilot them."],
    when: () => true },
];

export const CATEGORIES: GrowthCategory[] = [
  { key: "untapped", icon: "layers", label: "Untapped platform", lede: "Capability you already own that is not returning activity yet. The fastest value in any engagement is switching on what has already been bought." },
  { key: "licensing", icon: "coins", label: "Licensing optimization", lede: "Spend you can reclaim or right-size so the renewal reflects real usage." },
  { key: "workflow", icon: "gears", label: "Workflow enablement", lede: "Settings and features to turn on for smoother day-to-day work." },
  { key: "cx", icon: "heart", label: "Customer experience", lede: "Moves that lift the experience your customers and your front line actually feel." },
  { key: "marketplace", icon: "spark", label: "Integrations & App Gallery", lede: "Connect RingCentral into the tools your teams already use, so it fits the workflow instead of sitting beside it." },
];

export function growthSummary(customer: string, untapped: number, reclaim: { seats: number; agents: number }, thinWindow: boolean): string[] {
  const paras: string[] = [];
  paras.push(`${customer} has a working RingCentral deployment. This plan looks at where to grow next: what you already own but are not using, what spend to right-size, the settings and integrations that would fit RingCentral into how your teams actually work, and the two or three moves worth starting with.`);
  const bits: string[] = [];
  if (untapped) bits.push(`**${untapped}** owned ${untapped === 1 ? "capability is" : "capabilities are"} under-used`);
  if (reclaim.seats) bits.push(`about **${reclaim.seats}** ${reclaim.seats === 1 ? "seat looks" : "seats look"} reclaimable`);
  if (reclaim.agents) bits.push(`**${reclaim.agents}** contact-centre ${reclaim.agents === 1 ? "seat is" : "seats are"} inactive`);
  if (bits.length) paras.push(`At a glance: ${bits.join(", ")}. None of this needs new spend to start — it is realising value from what is already in place.`);
  if (thinWindow) paras.push("One caveat worth stating up front: the measurement window carried too little call volume to support rate-based claims, so this plan leans on counts and configuration rather than percentages. Re-baseline on production volumes before presenting any rate as an outcome.");
  paras.push("**Top wins** below are the highest-leverage moves, chosen for impact against effort. Everything after that is the fuller opportunity map by category, each item with the steps to act on it.");
  return paras;
}

export const TOP_WINS_LEDE = "Chosen for the best impact against the least effort — start here.";
export const HOW_WE_PICKED = "Each opportunity is scored on business impact against the effort to deliver it, with quantified savings and score-lift weighted up. These are the moves most likely to be worth the next conversation.";
