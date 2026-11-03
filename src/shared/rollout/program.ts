// Program configuration — the one place to change what a franchisee can order.
//
// Everything a store sees (templates, phone models, prices, SOW scope text) is
// driven from here. Pricing and SKUs are PLACEHOLDERS until ScanSource cost and
// the program price sheet are confirmed — search for "PLACEHOLDER".

export const PROGRAM = {
  code: "UPS", // prefixes order + SOW numbers
  name: "Franchise Zoom Phone Program",
  client: "The UPS Store network",
  supportEmail: "rollout@packetfusion.com",
  supportPhone: "(800) 555-0142", // PLACEHOLDER
  targetStores: 150, // stores in the current wave plan — drives program % complete
};

export type TemplateId = "starter" | "standard" | "professional" | "enterprise";
export type ModelId = "essential" | "business" | "executive";

export interface StoreTemplate {
  id: TemplateId;
  name: string;
  phones: number; // default phone count; enterprise can go higher
  maxPhones: number;
  servicePrice: number; // fixed one-time deployment fee (PLACEHOLDER)
  features: string[];
  sowCode: string; // SOW-<code>-02 etc.
  callFlow: string; // what we build in Zoom for this tier
}

export const TEMPLATES: StoreTemplate[] = [
  {
    id: "starter",
    name: "Starter",
    phones: 2,
    maxPhones: 2,
    servicePrice: 495,
    sowCode: "02",
    callFlow: "Main number rings both phones simultaneously; unanswered calls go to the store voicemail.",
    features: ["2× Zoom desk phones", "1 main line + 1 backup", "Basic voicemail setup", "QR self-deploy kit", "Remote validation"],
  },
  {
    id: "standard",
    name: "Standard",
    phones: 3,
    maxPhones: 3,
    servicePrice: 645,
    sowCode: "03",
    callFlow: "Main number rings a hunt group of all counter phones; after-hours calls route to voicemail with a closed greeting.",
    features: ["3× Zoom desk phones", "Hunt group configuration", "After-hours routing", "QR self-deploy kit", "Remote validation"],
  },
  {
    id: "professional",
    name: "Professional",
    phones: 4,
    maxPhones: 4,
    servicePrice: 795,
    sowCode: "04",
    callFlow: "Auto-attendant answers (press 1 for shipping, 2 for mailbox services, 0 for the counter) and feeds a call queue.",
    features: ["4× Zoom desk phones", "Auto-attendant setup", "Call queuing", "QR self-deploy kit", "Remote validation"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    phones: 5,
    maxPhones: 12,
    servicePrice: 995,
    sowCode: "05",
    callFlow: "Multi-level IVR with business-hours, holiday and overflow routing to call queues, plus an operator fallback.",
    features: ["5+ Zoom desk phones", "Full IVR + auto-attendant", "Advanced call routing", "QR self-deploy kit", "Remote validation + field SLA"],
  },
];

/** Per-phone service fee for Enterprise stores above 5 phones (PLACEHOLDER). */
export const EXTRA_PHONE_SERVICE = 125;

export interface PhoneModel {
  id: ModelId;
  tier: "Good" | "Better" | "Best";
  name: string;
  manufacturer: string;
  mfrPart: string;
  scansourceSku: string; // PLACEHOLDER until we have the ScanSource item numbers
  price: number; // per-phone sell price (PLACEHOLDER)
  blurb: string;
  specs: string[];
  bestFor: string;
}

export const MODELS: PhoneModel[] = [
  {
    id: "essential",
    tier: "Good",
    name: "Yealink T33G",
    manufacturer: "Yealink",
    mfrPart: "SIP-T33G",
    scansourceSku: "YEA-T33G-ZM",
    price: 119,
    blurb: "Reliable counter phone for straightforward call handling.",
    specs: ["2.4\" color display", "4 line keys", "Gigabit PoE", "Wideband HD audio"],
    bestFor: "Front counter, low call volume",
  },
  {
    id: "business",
    tier: "Better",
    name: "Yealink T54W",
    manufacturer: "Yealink",
    mfrPart: "SIP-T54W",
    scansourceSku: "YEA-T54W-ZM",
    price: 219,
    blurb: "Larger screen with Bluetooth and Wi-Fi for busier stores.",
    specs: ["4.3\" color display", "Built-in Bluetooth + Wi-Fi", "Gigabit PoE", "USB headset port"],
    bestFor: "Busy counters, headset users",
  },
  {
    id: "executive",
    tier: "Best",
    name: "Yealink T57W",
    manufacturer: "Yealink",
    mfrPart: "SIP-T57W",
    scansourceSku: "YEA-T57W-ZM",
    price: 299,
    blurb: "7\" touchscreen — easiest for new staff to pick up and use.",
    specs: ["7\" adjustable touchscreen", "Bluetooth + Wi-Fi", "Gigabit PoE", "29 programmable keys"],
    bestFor: "Owner's office, high call volume",
  },
];

export const POWER_ADAPTER = { sku: "YEA-PS5V2000US", name: "Yealink power adapter (no PoE switch)", price: 12 };
export const LICENSE = { sku: "ZP-CAP", name: "Zoom Phone Common Area license", monthly: 10 }; // PLACEHOLDER
export const MAIN_NUMBER = { sku: "ZP-DID", name: "Zoom Phone main number (new or ported)", monthly: 0 };

export const getTemplate = (id: string) => TEMPLATES.find((t) => t.id === id);
export const getModel = (id: string) => MODELS.find((m) => m.id === id);

export interface BomLine {
  sku: string;
  description: string;
  qty: number;
  unit: number;
  total: number;
  billing: "one-time" | "monthly";
  category: "Hardware" | "Service" | "License";
}

export interface Quote {
  lines: BomLine[];
  oneTime: number;
  monthly: number;
}

export function buildQuote(templateId: string, modelId: string, qty: number, hasPoe: boolean): Quote {
  const t = getTemplate(templateId);
  const m = getModel(modelId);
  if (!t || !m) return { lines: [], oneTime: 0, monthly: 0 };
  const lines: BomLine[] = [];
  const add = (l: Omit<BomLine, "total">) => lines.push({ ...l, total: l.qty * l.unit });

  add({ sku: m.scansourceSku, description: `${m.name} desk phone`, qty, unit: m.price, billing: "one-time", category: "Hardware" });
  if (!hasPoe) add({ sku: POWER_ADAPTER.sku, description: POWER_ADAPTER.name, qty, unit: POWER_ADAPTER.price, billing: "one-time", category: "Hardware" });
  add({ sku: `PF-DEPLOY-${t.sowCode}`, description: `${t.name} store deployment (kitting, QR labels, Zoom provisioning, remote validation)`, qty: 1, unit: t.servicePrice, billing: "one-time", category: "Service" });
  const extra = Math.max(0, qty - 5);
  if (extra > 0) add({ sku: "PF-DEPLOY-ADDL", description: "Additional phone deployment", qty: extra, unit: EXTRA_PHONE_SERVICE, billing: "one-time", category: "Service" });
  add({ sku: LICENSE.sku, description: LICENSE.name, qty, unit: LICENSE.monthly, billing: "monthly", category: "License" });
  add({ sku: MAIN_NUMBER.sku, description: MAIN_NUMBER.name, qty: 1, unit: MAIN_NUMBER.monthly, billing: "monthly", category: "License" });

  const sum = (b: BomLine["billing"]) => lines.filter((l) => l.billing === b).reduce((s, l) => s + l.total, 0);
  return { lines, oneTime: sum("one-time"), monthly: sum("monthly") };
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

export type Stage = "submitted" | "signed" | "ordered" | "staged" | "shipped" | "delivered" | "live" | "verified";

export const STAGES: { id: Stage; label: string; short: string; detail: string }[] = [
  { id: "submitted", label: "SOW generated", short: "SOW", detail: "Order received; SOW waiting for signature" },
  { id: "signed", label: "SOW signed", short: "Signed", detail: "Store record created automatically" },
  { id: "ordered", label: "Equipment ordered", short: "Ordered", detail: "Phones ordered from ScanSource, licenses reserved" },
  { id: "staged", label: "Kit staged", short: "Staged", detail: "Phones configured, QR-labeled and kitted" },
  { id: "shipped", label: "Shipped", short: "Shipped", detail: "Tracking number logged, store notified" },
  { id: "delivered", label: "Delivered", short: "Delivered", detail: "Carrier confirmation captured" },
  { id: "live", label: "Phones live", short: "Live", detail: "Auto-detected when devices register" },
  { id: "verified", label: "Verified", short: "Verified", detail: "Test call completed and signed off" },
];

export const stageIndex = (s: Stage) => STAGES.findIndex((x) => x.id === s);

export const REGIONS = ["West", "Southwest", "Central", "Midwest", "Southeast", "Northeast"] as const;

export const STATE_REGION: Record<string, (typeof REGIONS)[number]> = {
  CA: "West", OR: "West", WA: "West", NV: "West", ID: "West", HI: "West", AK: "West",
  AZ: "Southwest", NM: "Southwest", TX: "Southwest", OK: "Southwest", UT: "Southwest", CO: "Southwest",
  KS: "Central", NE: "Central", SD: "Central", ND: "Central", MT: "Central", WY: "Central", MO: "Central", IA: "Central", MN: "Central",
  IL: "Midwest", IN: "Midwest", MI: "Midwest", OH: "Midwest", WI: "Midwest", KY: "Midwest",
  FL: "Southeast", GA: "Southeast", AL: "Southeast", MS: "Southeast", LA: "Southeast", AR: "Southeast", TN: "Southeast", SC: "Southeast", NC: "Southeast", VA: "Southeast", WV: "Southeast",
  NY: "Northeast", NJ: "Northeast", PA: "Northeast", MA: "Northeast", CT: "Northeast", RI: "Northeast", NH: "Northeast", VT: "Northeast", ME: "Northeast", MD: "Northeast", DE: "Northeast", DC: "Northeast",
};

export const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
