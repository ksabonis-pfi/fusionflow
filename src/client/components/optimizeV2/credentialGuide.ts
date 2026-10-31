// Credential setup reference for the V2 connection card: which app to create in
// the customer's tenant and which read-only scopes the collectors need.
//
// Keep in step with the collectors (src/server/services/optimizeV2/providers/
// zoom/collectors.js and ringcentral/collectors.js): every scope below maps to
// an endpoint a run calls today. Ported from the standalone apps' setup pages,
// then corrected against those endpoints:
// - Zoom: new Server-to-Server OAuth apps only offer granular scopes, so the
//   list is granular (from Zoom's granular-scope reference, endpoint by
//   endpoint). The standalone list was classic names and included scopes V2
//   never uses (meeting, recording, webinar list) while missing ZVA's.
// - RingCentral: the standalone marked Presence and Video "not yet collected";
//   V2 collects both, so their scopes are required.

import type { Platform } from "../../lib/optimizeV2Api";

export type ScopeGroup = {
  area: string;
  /** What the run reads with these scopes. */
  unlocks: string;
  scopes: { scope: string; endpoint: string }[];
  /** Plan or add-on the area needs; without it the KPIs show as gaps. */
  requires?: string;
};

export const ZOOM_SCOPE_GROUPS: ScopeGroup[] = [
  {
    area: "Users & licensing",
    unlocks: "User list, license mix, active hosts",
    scopes: [
      { scope: "user:read:list_users:admin", endpoint: "GET /users" },
      { scope: "report:read:list_users:admin", endpoint: "GET /report/users" },
    ],
  },
  {
    area: "Account settings (config audit)",
    unlocks: "Security, recording and AI Companion settings for the configuration audit. Without it the config audit is empty and the run reports Zoom's scope error.",
    scopes: [{ scope: "account:read:settings:admin", endpoint: "GET /accounts/me/settings" }],
  },
  {
    area: "Dashboards",
    unlocks: "Meeting volume, meeting quality, webinars, Zoom Rooms utilization",
    requires: "Business plan or above",
    scopes: [
      { scope: "dashboard:read:list_meetings:admin", endpoint: "GET /metrics/meetings" },
      { scope: "dashboard:read:meeting_quality_score:admin", endpoint: "GET /metrics/quality" },
      { scope: "dashboard:read:list_webinars:admin", endpoint: "GET /metrics/webinars" },
      { scope: "dashboard:read:list_zoomrooms:admin", endpoint: "GET /metrics/zoomrooms" },
      { scope: "dashboard:read:zoomroom:admin", endpoint: "GET /metrics/zoomrooms/{id}" },
    ],
  },
  {
    area: "Zoom Rooms",
    unlocks: "Room inventory",
    requires: "Zoom Rooms",
    scopes: [{ scope: "zoom_rooms:read:list_rooms:admin", endpoint: "GET /rooms" }],
  },
  {
    area: "Zoom Phone",
    unlocks: "Phone users, numbers, devices, queues, call quality (MOS), phone settings",
    requires: "Zoom Phone",
    scopes: [
      { scope: "phone:read:list_users:admin", endpoint: "GET /phone/users" },
      { scope: "phone:read:list_numbers:admin", endpoint: "GET /phone/numbers" },
      { scope: "phone:read:list_devices:admin", endpoint: "GET /phone/devices" },
      { scope: "phone:read:list_call_queues:admin", endpoint: "GET /phone/call_queues" },
      { scope: "phone:read:list_call_logs:admin", endpoint: "GET /phone/metrics/call_logs" },
      { scope: "phone:read:list_account_settings:admin", endpoint: "GET /phone/account_settings" },
    ],
  },
  {
    area: "Contact Center",
    unlocks: "Agents and the CX Analytics datasets behind SLA, ASA, AHT, abandon rate and occupancy",
    requires: "Zoom Contact Center",
    scopes: [
      { scope: "contact_center:read:list_users:admin", endpoint: "GET /contact_center/users" },
      { scope: "contact_center:read:dataset_queue_performance:admin", endpoint: "…/dataset/historical/queue_performance" },
      { scope: "contact_center:read:dataset_engagement:admin", endpoint: "…/dataset/historical/engagement" },
      { scope: "contact_center:read:dataset_agent_performance:admin", endpoint: "…/dataset/historical/agent_performance" },
      { scope: "contact_center:read:dataset_agent_timecard:admin", endpoint: "…/dataset/historical/agent_timecard" },
      { scope: "contact_center:read:dataset_flow_performance:admin", endpoint: "…/dataset/historical/flow_performance" },
      { scope: "contact_center:read:dataset_disposition:admin", endpoint: "…/dataset/historical/disposition" },
      { scope: "contact_center:read:dataset_outbound_dialer_performance:admin", endpoint: "…/dataset/historical/outbound_dialer_performance" },
      { scope: "contact_center:read:call_journey_log:admin", endpoint: "…/log/historical/journey" },
    ],
  },
  {
    area: "Virtual Agent",
    unlocks: "Containment, intent accuracy, fallback, surveys",
    requires: "Zoom Virtual Agent",
    scopes: [
      { scope: "zva:read:list_engagements:admin", endpoint: "GET /virtual_agent/report/engagements" },
      { scope: "zva:read:list_queries:admin", endpoint: "…/engagements/query_details" },
      { scope: "zva:read:list_surveys:admin", endpoint: "…/report/surveys" },
      { scope: "zva:read:list_transcripts:admin", endpoint: "…/report/transcripts" },
      { scope: "zva:read:list_variables:admin", endpoint: "…/engagements/variables" },
    ],
  },
  {
    area: "Revenue Accelerator",
    unlocks: "Deals, conversations, indicators",
    requires: "Zoom Revenue Accelerator",
    scopes: [
      { scope: "zra:read:list_deals:admin", endpoint: "GET /zra/deals" },
      { scope: "zra:read:list_conversations:admin", endpoint: "GET /zra/conversations" },
      { scope: "zra:read:indicator:admin", endpoint: "GET /zra/settings/indicators" },
    ],
  },
];

/** Endpoints the Zoom run calls whose granular scope name isn't confirmed:
 *  found by searching the Scopes tab rather than pasted. */
export const ZOOM_SCOPE_SEARCHES: { area: string; search: string; endpoint: string; classic: string; requires?: string }[] = [
  { area: "Daily usage report", search: "Reports → \"Get daily usage report\"", endpoint: "GET /report/daily", classic: "report:read:admin" },
  {
    area: "Workforce Management", search: "Workforce Management → the View scopes for forecasts and agent adherence reports",
    endpoint: "/workforce-management/forecasts, …/reports/adherence/agents", classic: "workforce_management:read:admin", requires: "Zoom WFM",
  },
];

/** Classic equivalents, for an older app that still shows classic scopes. */
export const ZOOM_CLASSIC_SCOPES = [
  "user:read:admin", "report:read:admin", "account:read:admin", "dashboard:read:admin", "room:read:admin",
  "phone:read:admin", "contact_center_user:read:admin", "contact_center_report:read:admin",
  "iq_deal:read:admin", "iq_conversation:read:admin", "iq_account:read:admin", "workforce_management:read:admin",
];

export const RC_SCOPE_GROUPS: ScopeGroup[] = [
  {
    area: "Account inventory",
    unlocks: "Account, extensions, sites, queues and membership, numbers, devices, emergency locations, business hours, licenses; also the RingCX sign-in",
    scopes: [{ scope: "ReadAccounts", endpoint: "/restapi/v1.0/account/~/…, /restapi/v2/accounts/~/licenses" }],
  },
  {
    area: "Business Analytics",
    unlocks: "Call performance aggregate and timeline (at most 184 days)",
    scopes: [{ scope: "Analytics", endpoint: "/analytics/calls/v1/accounts/~/aggregation|timeline/fetch" }],
  },
  {
    area: "Call log",
    unlocks: "Recorded calls for the AI insight sample",
    scopes: [{ scope: "ReadCallLog", endpoint: "/restapi/v1.0/account/~/call-log" }],
  },
  {
    area: "Call recording",
    unlocks: "Recording policy and retention",
    scopes: [{ scope: "ReadCallRecording", endpoint: "/restapi/v1.0/account/~/call-recording" }],
  },
  {
    area: "RingSense / AI Conversation Expert",
    unlocks: "Post-call insights on a sample of recordings",
    requires: "AI Conversation Expert licenses; the JWT user's role needs \"AI Conversation Expert - Access Insights\"",
    scopes: [{ scope: "RingSense", endpoint: "/ai/ringsense/v1/public/accounts/~/domains/pbx/…/insights" }],
  },
  {
    area: "Presence",
    unlocks: "Offline share and call-refusing Do Not Disturb (a point-in-time read)",
    scopes: [{ scope: "ReadPresence", endpoint: "/restapi/v1.0/account/~/presence" }],
  },
  {
    area: "RingCentral Video",
    unlocks: "Meeting count and minutes in the window",
    scopes: [{ scope: "Video", endpoint: "/rcvideo/v1/history/meetings" }],
  },
];

const unique = (groups: ScopeGroup[]) => [...new Set(groups.flatMap((g) => g.scopes.map((s) => s.scope)))];

export const SCOPE_GROUPS: Record<Platform, ScopeGroup[]> = { zoom: ZOOM_SCOPE_GROUPS, ringcentral: RC_SCOPE_GROUPS };
export const SCOPE_LIST: Record<Platform, string[]> = { zoom: unique(ZOOM_SCOPE_GROUPS), ringcentral: unique(RC_SCOPE_GROUPS) };
