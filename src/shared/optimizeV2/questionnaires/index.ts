// Optimizations V2 questionnaires: the three program instruments per platform,
// converted from the standalone apps' markdown (questionnaires/*.md) into the
// JSON next to this file. Shared by the client (renders them) and the worker
// (computes progress on save). See docs/optimize-v2/DESIGN.md.

export type QPlatform = "zoom" | "ringcentral";

export const INSTRUMENTS = ["pre-sow", "post-sow", "optimization-review"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

export const INSTRUMENT_LABEL: Record<Instrument, string> = {
  "pre-sow": "Pre-SOW scoping",
  "post-sow": "Post-SOW readiness & baseline",
  "optimization-review": "Optimization review",
};

export type QuestionType = "short" | "long" | "single" | "multiple" | "rating" | "rank" | "matching" | "fill";

export type Question = {
  /** Stable id from the source document (e.g. "P2.3", "A5.1b"); answers are keyed by it. */
  id: string;
  type: QuestionType;
  required: boolean;
  text: string;
  /** single / multiple / rank */
  options?: string[];
  /** matching: one row per prompt, each matched to one of matchTo */
  prompts?: string[];
  matchTo?: string[];
  /** fill: one input per blank */
  blanks?: string[];
  /** Guidance for the interviewer: why the question is asked, how to read the answer. */
  logic?: string;
};

export type QuestionGroup = {
  id: string;
  title: string;
  /** Leading letter(s) of the id: P, A, B, C, D, O. */
  part: string;
  /** Capabilities that make this section relevant; shown if ANY is in scope. Absent = always shown. */
  cap?: string[];
  questions: Question[];
};

export type QuestionnaireDef = {
  platform: QPlatform;
  key: Instrument;
  order: number;
  cadence: string;
  role: string;
  title: string;
  lede: string;
  meta: Record<string, string>;
  count: number;
  /** Tabs for multi-part instruments (post-SOW A–D); empty otherwise. */
  parts: { key: string; label: string }[];
  /** Scope chips. Empty when no section in the instrument is capability-gated. */
  caps: { key: string; label: string }[];
  groups: QuestionGroup[];
};

/** Saved answers. Question ids map to their value; reserved keys hold the rest:
 *  `__scope` (selected capability keys), `<id>__other` ("Other — specify" text),
 *  `<id>__note` (free-text note on a question). */
export type Answers = Record<string, unknown>;

/** Each instrument is its own chunk so a page loads only the one it renders. */
const LOADERS: Record<QPlatform, Record<Instrument, () => Promise<{ default: unknown }>>> = {
  zoom: {
    "pre-sow": () => import("./zoom/pre-sow.json"),
    "post-sow": () => import("./zoom/post-sow.json"),
    "optimization-review": () => import("./zoom/optimization-review.json"),
  },
  ringcentral: {
    "pre-sow": () => import("./ringcentral/pre-sow.json"),
    "post-sow": () => import("./ringcentral/post-sow.json"),
    "optimization-review": () => import("./ringcentral/optimization-review.json"),
  },
};

export async function loadQuestionnaire(platform: QPlatform, instrument: Instrument): Promise<QuestionnaireDef> {
  return (await LOADERS[platform][instrument]()).default as QuestionnaireDef;
}

export function isInstrument(v: string): v is Instrument {
  return (INSTRUMENTS as readonly string[]).includes(v);
}

/** Same rule as the originals: blank strings, empty lists and empty objects don't count. */
export function isAnswered(v: unknown): boolean {
  if (v == null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}

/** Whether a scope has been chosen (an empty list is a choice: only ungated sections). */
export function hasScope(answers: Answers): boolean {
  return Array.isArray(answers.__scope);
}

/** The selected scope; every capability when none has been chosen yet. */
export function scopeOf(def: QuestionnaireDef, answers: Answers): Set<string> {
  const s = answers.__scope;
  if (Array.isArray(s)) return new Set(s.filter((x): x is string => typeof x === "string"));
  return new Set(def.caps.map((c) => c.key));
}

export function groupInScope(g: QuestionGroup, scope: Set<string>): boolean {
  return !g.cap || g.cap.some((c) => scope.has(c));
}

/** Answered vs. total over the sections in scope. */
export function progressOf(def: QuestionnaireDef, answers: Answers): { answered: number; total: number; pct: number } {
  const scope = scopeOf(def, answers);
  const qs = def.groups.filter((g) => groupInScope(g, scope)).flatMap((g) => g.questions);
  const answered = qs.filter((q) => isAnswered(answers[q.id])).length;
  return { answered, total: qs.length, pct: qs.length ? Math.round((100 * answered) / qs.length) : 0 };
}

/** Options that mean "a value not in this list"; choosing one reveals a text field. */
const SPECIFY: Record<QPlatform, RegExp[]> = {
  zoom: [/\bother\b/i, /custom or in-house/i],
  ringcentral: [/\bother\b/i, /homegrown|in-house/i],
};
export function isSpecifyOption(platform: QPlatform, option: string): boolean {
  return SPECIFY[platform].some((re) => re.test(option));
}

/** Pre-SOW capability answers → scope keys, used to pre-select the scope of the
 *  other instruments the first time they're opened. Matching questions whose
 *  rows are answered "Phase 1" or "Later phase" put that capability in scope. */
const PRESOW_SCOPE: Record<QPlatform, { sources: string[]; map: Record<string, string> }> = {
  zoom: {
    sources: ["P6.1", "P3.2"],
    map: {
      "Voice": "voice", "Video": "video", "Email": "email", "SMS": "sms", "Social": "social", "Web chat": "webchat",
      // "Outbound dialer" is P3.2's wording; the original map missed it.
      "Outbound dialing": "outbound", "Outbound dialer": "outbound", "Outbound": "outbound", "Agentless outbound": "agentless", "Agentless dialer": "agentless",
      "SMS outbound campaigns": "sms-campaign", "SMS campaigns": "sms-campaign",
      "Virtual agent (voice)": "va-voice", "Virtual agent (chat)": "va-chat",
      "AI Expert Assist": "ai", "Engagement Briefs": "ai", "Live AI Interpreter": "ai", "AI intent-based routing": "ai",
      "Quality Management": "qm", "Workforce Management": "wfm", "CTI adapter": "cti", "Agent Mobile": "cti",
      "CoBrowse": "video", "Surveys and VoC": "surveys", "PII redaction": "pii",
    },
  },
  ringcentral: {
    sources: ["P6.1"],
    map: {
      "RingEX telephony": "ringex", "RingCentral Video": "video", "Team Chat": "chat",
      "RingCentral Rooms": "rooms", "Business SMS": "sms", "Fax": "fax",
      "RingCX voice queues": "ringcx-voice",
      "RingCX digital — email": "email", "RingCX digital — web chat": "webchat",
      "RingCX digital — SMS": "sms-campaign", "RingCX digital — social": "social",
      "RingCX outbound dialer": "outbound",
      "RingCX AI agent (voice)": "ai-voice", "RingCX AI agent (digital)": "ai-digital",
      "RingCX agent assist": "agent-assist", "RingSense conversation intelligence": "ringsense",
      "Quality Management": "qm", "Workforce Management": "wfm",
      "CRM embedded softphone": "cti", "Surveys and VoC": "surveys",
      "Call recording": "ringsense", "RingCentral Archiver": "archiver", "PII redaction": "pii",
    },
  },
};

export function deriveScope(platform: QPlatform, preSow: Answers, capKeys: string[]): string[] | null {
  const { sources, map } = PRESOW_SCOPE[platform];
  const found = new Set<string>();
  for (const src of sources) {
    const rows = preSow[src];
    if (!rows || typeof rows !== "object" || Array.isArray(rows)) continue;
    for (const [prompt, choice] of Object.entries(rows)) {
      if (typeof choice === "string" && /phase 1|later phase/i.test(choice) && map[prompt]) found.add(map[prompt]);
    }
  }
  const derived = capKeys.filter((k) => found.has(k));
  return derived.length ? derived : null;
}
