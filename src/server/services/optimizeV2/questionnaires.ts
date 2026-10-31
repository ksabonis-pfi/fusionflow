// Questionnaire responses for Optimizations V2: one row per account, platform
// and instrument in opt2_questionnaire_responses. Definitions live in
// src/shared/optimizeV2/questionnaires.
import type { Bindings } from "../../types";
import {
  deriveScope, hasScope, INSTRUMENTS, loadQuestionnaire, progressOf,
  type Answers, type Instrument, type QPlatform, type QuestionnaireDef,
} from "../../../shared/optimizeV2/questionnaires";

export type ResponseRow = {
  id: string;
  optimize_account_id: string;
  platform: QPlatform;
  instrument: Instrument;
  answers: string;
  status: "draft" | "complete";
  progress: number;
  updated_by: string | null;
  updated_by_name?: string | null;
  created_at: string;
  updated_at: string;
};

export const PLATFORMS: QPlatform[] = ["zoom", "ringcentral"];

const parseAnswers = (s: string | null | undefined): Answers => {
  try {
    const v = s ? JSON.parse(s) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Answers) : {};
  } catch { return {}; }
};

/** Status and progress for every platform × instrument, including ones not started. */
export async function listResponses(env: Bindings, accountId: string) {
  const rows = await env.DB.prepare(
    `SELECT r.*, u.name AS updated_by_name FROM opt2_questionnaire_responses r
       LEFT JOIN users u ON u.id = r.updated_by WHERE r.optimize_account_id = ?`,
  ).bind(accountId).all<ResponseRow>();
  const byKey = new Map((rows.results ?? []).map((r) => [`${r.platform}/${r.instrument}`, r]));

  const out = [];
  for (const platform of PLATFORMS) {
    for (const instrument of INSTRUMENTS) {
      const def = await loadQuestionnaire(platform, instrument);
      const row = byKey.get(`${platform}/${instrument}`);
      // Recomputed rather than read from `progress`, so a scope change in the
      // definitions is reflected without re-saving every response.
      const p = progressOf(def, parseAnswers(row?.answers));
      out.push({
        platform,
        instrument,
        title: def.title,
        cadence: def.cadence,
        status: row?.status ?? null,
        answered: p.answered,
        total: p.total,
        progress: p.pct,
        updated_at: row?.updated_at ?? null,
        updated_by_name: row?.updated_by_name ?? null,
      });
    }
  }
  return out;
}

export async function getResponse(env: Bindings, accountId: string, platform: QPlatform, instrument: Instrument) {
  return env.DB.prepare(
    `SELECT r.*, u.name AS updated_by_name FROM opt2_questionnaire_responses r
       LEFT JOIN users u ON u.id = r.updated_by
      WHERE r.optimize_account_id = ? AND r.platform = ? AND r.instrument = ?`,
  ).bind(accountId, platform, instrument).first<ResponseRow>();
}

/** One response for the form, with the scope to start from when none is saved:
 *  derived from the same platform's pre-SOW capability answers, as the originals did. */
export async function responseView(env: Bindings, accountId: string, platform: QPlatform, instrument: Instrument) {
  const def = await loadQuestionnaire(platform, instrument);
  const row = await getResponse(env, accountId, platform, instrument);
  const answers = parseAnswers(row?.answers);
  let suggestedScope: string[] | null = null;
  if (def.caps.length && !hasScope(answers)) {
    const pre = instrument === "pre-sow" ? row : await getResponse(env, accountId, platform, "pre-sow");
    suggestedScope = deriveScope(platform, parseAnswers(pre?.answers), def.caps.map((c) => c.key));
  }
  return {
    answers,
    status: row?.status ?? "draft",
    progress: progressOf(def, answers),
    updated_at: row?.updated_at ?? null,
    updated_by_name: row?.updated_by_name ?? null,
    suggested_scope: suggestedScope,
  };
}

const MAX_TEXT = 20_000;
const MAX_ITEMS = 100;
const str = (v: unknown, max = MAX_TEXT): string | undefined => (typeof v === "string" ? v.slice(0, max) : undefined);

/** Keep only answers the definition knows about, in the shape its question type
 *  stores. Anything else is dropped rather than rejected, so a form open across
 *  a definition change still saves what it can. */
export function sanitizeAnswers(def: QuestionnaireDef, raw: Record<string, unknown>): Answers {
  const out: Answers = {};
  const caps = new Set(def.caps.map((c) => c.key));
  if (Array.isArray(raw.__scope)) out.__scope = raw.__scope.filter((c): c is string => typeof c === "string" && caps.has(c));

  for (const q of def.groups.flatMap((g) => g.questions)) {
    const v = raw[q.id];
    const other = str(raw[`${q.id}__other`], 2000);
    const note = str(raw[`${q.id}__note`]);
    if (other) out[`${q.id}__other`] = other;
    if (note) out[`${q.id}__note`] = note;
    if (v == null) continue;

    switch (q.type) {
      case "multiple": {
        if (!Array.isArray(v)) break;
        const allowed = new Set(q.options ?? []);
        out[q.id] = v.filter((x): x is string => typeof x === "string" && allowed.has(x));
        break;
      }
      case "single": {
        if (typeof v === "string" && (v === "" || (q.options ?? []).includes(v))) out[q.id] = v;
        break;
      }
      case "rating": {
        const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
        if (Number.isInteger(n) && n >= 1 && n <= 5) out[q.id] = n;
        break;
      }
      case "rank":
      case "matching":
      case "fill": {
        // Questions without rows (e.g. a rank list the engagement fills in) store free text.
        const rows = q.type === "rank" ? q.options : q.type === "matching" ? q.prompts : q.blanks;
        if (typeof v === "string" && !(rows ?? []).length) { out[q.id] = str(v); break; }
        if (!v || typeof v !== "object" || Array.isArray(v)) break;
        const obj: Record<string, string> = {};
        for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, MAX_ITEMS)) {
          const s = typeof x === "number" ? String(x) : str(x, 2000);
          if (s) obj[k.slice(0, 500)] = s;
        }
        out[q.id] = obj;
        break;
      }
      default: {
        const s = str(v);
        if (s != null) out[q.id] = s;
      }
    }
  }
  return out;
}

export async function saveResponse(
  env: Bindings,
  accountId: string,
  platform: QPlatform,
  instrument: Instrument,
  answers: Answers,
  status: "draft" | "complete" | undefined,
  userId: string,
) {
  const def = await loadQuestionnaire(platform, instrument);
  const progress = progressOf(def, answers);
  await env.DB.prepare(
    `INSERT INTO opt2_questionnaire_responses (id, optimize_account_id, platform, instrument, answers, status, progress, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (optimize_account_id, platform, instrument) DO UPDATE SET
       answers = excluded.answers,
       status = COALESCE(?, opt2_questionnaire_responses.status),
       progress = excluded.progress,
       updated_by = excluded.updated_by,
       updated_at = datetime('now')`,
  ).bind(
    crypto.randomUUID(), accountId, platform, instrument, JSON.stringify(answers), status ?? "draft", progress.pct, userId,
    status ?? null,
  ).run();
  const row = await getResponse(env, accountId, platform, instrument);
  return { status: row?.status ?? "draft", progress, updated_at: row?.updated_at ?? null, updated_by_name: row?.updated_by_name ?? null };
}
