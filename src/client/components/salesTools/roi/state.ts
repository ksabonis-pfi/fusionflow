import { BLANK_INPUTS, EXAMPLE_INPUTS, cloneInputs } from "../../../../shared/roiModel/example";
import { ROI_STEPS } from "../../../../shared/roiModel/fields";
import type { RoiInputs } from "../../../../shared/roiModel/types";

export const RESULTS = "results";

export type RoiState = {
  P: RoiInputs;
  /** Current step id, or RESULTS. */
  cur: string;
  visited: string[];
  /** Bumped when inputs are replaced wholesale (load example / blank / scenario) so fields reset their drafts. */
  rev: number;
};

export type RoiAction =
  | { type: "set"; k: keyof RoiInputs; i?: number; v: string | number | null }
  | { type: "go"; id: string }
  | { type: "replace"; P: RoiInputs };

export function roiReducer(s: RoiState, a: RoiAction): RoiState {
  switch (a.type) {
    case "set": {
      const P = { ...s.P } as Record<string, unknown>;
      if (a.i != null) {
        const arr = [...(P[a.k] as number[])];
        arr[a.i] = a.v as number;
        P[a.k] = arr;
      } else {
        P[a.k] = a.v;
      }
      return { ...s, P: P as unknown as RoiInputs };
    }
    case "go":
      return { ...s, cur: a.id, visited: s.visited.includes(a.id) ? s.visited : [...s.visited, a.id] };
    case "replace":
      return { ...s, P: cloneInputs(a.P), rev: s.rev + 1 };
  }
}

// ── localStorage: per-user draft autosave (saved scenarios live in D1) ──────

const KEY = "pf-roi-builder-v1";
const draftKey = (userId: string) => `${KEY}:draft:${userId}`;
/** Pre-D1 saved scenarios; only read now, to offer a one-time import. */
const savedKey = (userId: string) => `${KEY}:saved:${userId}`;
const loadedKey = (userId: string) => `${KEY}:loaded:${userId}`;

const STEP_IDS = new Set([...ROI_STEPS.map((s) => s.id), RESULTS]);

/**
 * Shape check for inputs read back from storage (no zod here, to keep it out
 * of the bundle). Missing or wrongly typed keys fall back to the example.
 */
export function coerceInputs(raw: unknown): RoiInputs {
  const out = cloneInputs(EXAMPLE_INPUTS) as unknown as Record<string, unknown>;
  if (!raw || typeof raw !== "object") return out as unknown as RoiInputs;
  const src = raw as Record<string, unknown>;
  const fin = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  for (const k of Object.keys(out)) {
    const v = src[k], d = out[k];
    if (k === "aht") {
      if (v === null || (fin(v) && (v as number) > 0)) out[k] = v;
    } else if (typeof d === "string") {
      if (typeof v === "string") out[k] = v;
    } else if (Array.isArray(d)) {
      if (Array.isArray(v) && v.length === 3 && v.every(fin)) out[k] = [...v];
    } else if (fin(v)) {
      out[k] = v;
    }
  }
  return out as unknown as RoiInputs;
}

export function initialState(userId: string): RoiState {
  const first = ROI_STEPS[0].id;
  const fresh: RoiState = { P: cloneInputs(EXAMPLE_INPUTS), cur: first, visited: [first], rev: 0 };
  try {
    const s = JSON.parse(localStorage.getItem(draftKey(userId)) || "null");
    if (!s || !s.P) return fresh;
    const cur = typeof s.cur === "string" && STEP_IDS.has(s.cur) ? s.cur : first;
    const visited = Array.isArray(s.visited) ? s.visited.filter((v: unknown) => typeof v === "string" && STEP_IDS.has(v)) : [];
    if (!visited.includes(cur)) visited.push(cur);
    return { P: coerceInputs(s.P), cur, visited, rev: 0 };
  } catch {
    return fresh;
  }
}

export function persistDraft(userId: string, s: RoiState): void {
  try {
    localStorage.setItem(draftKey(userId), JSON.stringify({ P: s.P, cur: s.cur, visited: s.visited }));
  } catch {
    /* storage full or blocked: the draft just isn't kept */
  }
}

export type SavedScenarios = Record<string, RoiInputs>;

/** Scenarios saved in this browser before they moved to D1. */
export function readSaved(userId: string): SavedScenarios {
  try {
    const raw = JSON.parse(localStorage.getItem(savedKey(userId)) || "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

/** Replaces the legacy browser list (after an import); an empty list removes it. */
export function writeLegacySaved(userId: string, s: SavedScenarios): void {
  try {
    if (Object.keys(s).length) localStorage.setItem(savedKey(userId), JSON.stringify(s));
    else localStorage.removeItem(savedKey(userId));
  } catch {
    /* blocked storage: nothing to clean up */
  }
}

/**
 * The shared scenario the draft was opened from (or last saved as), so Save
 * can update it in place after a refresh. Null once the user starts over.
 */
export type LoadedScenario = {
  id: string;
  name: string;
  owner_name: string | null;
  can_edit: boolean;
  updated_at: string;
  model_version: string;
};

export function readLoaded(userId: string): LoadedScenario | null {
  try {
    const v = JSON.parse(localStorage.getItem(loadedKey(userId)) || "null");
    return v && typeof v.id === "string" && typeof v.updated_at === "string" && typeof v.name === "string"
      ? { ...v, can_edit: v.can_edit === true, model_version: String(v.model_version ?? "") }
      : null;
  } catch {
    return null;
  }
}

export function writeLoaded(userId: string, v: LoadedScenario | null): void {
  try {
    if (v) localStorage.setItem(loadedKey(userId), JSON.stringify(v));
    else localStorage.removeItem(loadedKey(userId));
  } catch {
    /* blocked storage: Save just creates a new scenario after a refresh */
  }
}

export { BLANK_INPUTS, EXAMPLE_INPUTS };
