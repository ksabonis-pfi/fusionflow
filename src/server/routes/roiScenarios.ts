/**
 * AI Agent ROI Builder: shared saved scenarios (migration 0163).
 *
 * Mounted under the Sales Tools router, so its gate (admin or is_sales_tools)
 * already applies. Within the gate everything is public: any user can list,
 * open and duplicate any scenario. Update and delete are owner or admin only.
 * Updates use `updated_at` as an optimistic-concurrency token (409 on a stale
 * token). Deletes are soft (deleted_at) so a mistaken delete can be undone.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import { MODEL_VERSION } from "../../shared/roiModel/model";
import { roiInputsSchema } from "../../shared/roiModel/schema";
import type { AuthContext, Bindings, Variables } from "../types";

type Env = { Bindings: Bindings; Variables: Variables };
const app = new Hono<Env>();

export const ROI_BODY_LIMIT = 32 * 1024;
export const ROI_NAME_MAX = 120;
const LIST_LIMIT = 500;

const nameSchema = z.string().trim().min(1, "Name is required").max(ROI_NAME_MAX);
const versionSchema = z.string().regex(/^\d{1,4}(\.\d{1,4}){0,2}$/);

const createSchema = z.object({
  name: nameSchema,
  inputs: roiInputsSchema,
  /** The model version the client computed with; defaults to the server's. */
  model_version: versionSchema.optional(),
});

const updateSchema = createSchema.extend({
  /** The updated_at the client loaded; a mismatch means someone else saved since. */
  updated_at: z.string().min(1).max(40),
});

const duplicateSchema = z.object({ name: nameSchema.optional() });

type ScenarioRow = {
  id: string;
  owner_user_id: string | null;
  owner_name: string | null;
  name: string;
  client_name: string;
  model_version: string;
  inputs_json?: string;
  created_at: string;
  updated_at: string;
};

const LIST_COLS = `s.id, s.owner_user_id, COALESCE(u.name, s.owner_name) AS owner_name, s.name,
  s.client_name, s.model_version, s.created_at, s.updated_at`;

function canEdit(auth: AuthContext, row: { owner_user_id: string | null }) {
  return auth.role === "admin" || (row.owner_user_id != null && row.owner_user_id === auth.user.id);
}

function present(auth: AuthContext, row: ScenarioRow) {
  const { inputs_json, ...rest } = row;
  const out: Record<string, unknown> = { ...rest, can_edit: canEdit(auth, row) };
  if (inputs_json !== undefined) out.inputs = JSON.parse(inputs_json);
  return out;
}

/** ISO timestamp with ms, guaranteed to differ from `prev` so a token always changes. */
function nowIso(prev?: string) {
  let t = new Date();
  if (prev && t.toISOString() <= prev) {
    const p = Date.parse(prev);
    if (Number.isFinite(p)) t = new Date(p + 1);
  }
  return t.toISOString();
}

type Parsed<T> = { ok: true; data: T } | { ok: false; res: Response };

/** Reads a JSON body with a hard size cap, then validates it. */
async function readBody<T>(c: Context<Env>, schema: z.ZodType<T>, allowEmpty = false): Promise<Parsed<T>> {
  const declared = Number(c.req.header("content-length") ?? "0");
  if (declared > ROI_BODY_LIMIT) return { ok: false, res: c.json({ error: "Scenario is too large" }, 413) };
  const text = await c.req.text();
  if (new TextEncoder().encode(text).length > ROI_BODY_LIMIT) {
    return { ok: false, res: c.json({ error: "Scenario is too large" }, 413) };
  }
  let raw: unknown;
  try {
    raw = text.trim() === "" && allowEmpty ? {} : JSON.parse(text);
  } catch {
    return { ok: false, res: c.json({ error: "Invalid JSON" }, 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    return { ok: false, res: c.json({ error: `Invalid scenario: ${where}${issue?.message ?? "bad input"}` }, 400) };
  }
  return { ok: true, data: parsed.data };
}

async function loadRow(db: D1Database, id: string, withInputs: boolean) {
  return db
    .prepare(`SELECT ${LIST_COLS}${withInputs ? ", s.inputs_json" : ""}
      FROM roi_scenarios s LEFT JOIN users u ON u.id = s.owner_user_id
      WHERE s.id = ? AND s.deleted_at IS NULL LIMIT 1`)
    .bind(id)
    .first<ScenarioRow>();
}

const notFound = (c: Context<Env>) => c.json({ error: "Scenario not found" }, 404);

async function insertScenario(
  c: Context<Env>,
  v: { name: string; client: string; model_version: string; inputs_json: string },
) {
  const auth = c.get("auth");
  const id = crypto.randomUUID();
  const now = nowIso();
  await c.env.DB
    .prepare(`INSERT INTO roi_scenarios
      (id, owner_user_id, owner_name, name, client_name, model_version, inputs_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, auth.user.id, auth.user.name ?? auth.user.email, v.name, v.client, v.model_version, v.inputs_json, now, now)
    .run();
  const row = await loadRow(c.env.DB, id, true);
  return c.json(present(auth, row!), 201);
}

// ── Routes ───────────────────────────────────────────────────────────────────

app.get("/", async (c) => {
  const auth = c.get("auth");
  const rows = await c.env.DB
    .prepare(`SELECT ${LIST_COLS}
      FROM roi_scenarios s LEFT JOIN users u ON u.id = s.owner_user_id
      WHERE s.deleted_at IS NULL
      ORDER BY s.updated_at DESC
      LIMIT ${LIST_LIMIT}`)
    .all<ScenarioRow>();
  return c.json({
    model_version: MODEL_VERSION,
    scenarios: (rows.results ?? []).map((r) => present(auth, r)),
  });
});

app.get("/:id", async (c) => {
  const row = await loadRow(c.env.DB, c.req.param("id"), true);
  if (!row) return notFound(c);
  return c.json(present(c.get("auth"), row));
});

app.post("/", async (c) => {
  const body = await readBody(c, createSchema);
  if (!body.ok) return body.res;
  const { name, inputs, model_version } = body.data;
  return insertScenario(c, {
    name,
    client: inputs.client.trim(),
    model_version: model_version ?? MODEL_VERSION,
    inputs_json: JSON.stringify(inputs),
  });
});

app.put("/:id", async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");
  const existing = await loadRow(c.env.DB, id, false);
  if (!existing) return notFound(c);
  if (!canEdit(auth, existing)) {
    return c.json({ error: "Only the owner or an admin can change this scenario. Save a copy instead." }, 403);
  }
  const body = await readBody(c, updateSchema);
  if (!body.ok) return body.res;
  const { name, inputs, model_version, updated_at } = body.data;

  const now = nowIso(existing.updated_at);
  const res = await c.env.DB
    .prepare(`UPDATE roi_scenarios
      SET name = ?, client_name = ?, model_version = ?, inputs_json = ?, updated_at = ?
      WHERE id = ? AND updated_at = ? AND deleted_at IS NULL`)
    .bind(name, inputs.client.trim(), model_version ?? MODEL_VERSION, JSON.stringify(inputs), now, id, updated_at)
    .run();
  if (!res.meta.changes) {
    const current = await loadRow(c.env.DB, id, false);
    if (!current) return notFound(c);
    return c.json({
      error: "Someone else updated this scenario. Reload it or save as a copy.",
      current: present(auth, current),
    }, 409);
  }
  const row = await loadRow(c.env.DB, id, true);
  return c.json(present(auth, row!));
});

app.delete("/:id", async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");
  const existing = await loadRow(c.env.DB, id, false);
  if (!existing) return notFound(c);
  if (!canEdit(auth, existing)) return c.json({ error: "Only the owner or an admin can delete this scenario." }, 403);
  await c.env.DB
    .prepare("UPDATE roi_scenarios SET deleted_at = ?, deleted_by = ? WHERE id = ? AND deleted_at IS NULL")
    .bind(nowIso(), auth.user.id, id)
    .run();
  return c.json({ ok: true });
});

app.post("/:id/duplicate", async (c) => {
  const src = await loadRow(c.env.DB, c.req.param("id"), true);
  if (!src) return notFound(c);
  const body = await readBody(c, duplicateSchema, true);
  if (!body.ok) return body.res;
  const name = body.data.name ?? `Copy of ${src.name}`.slice(0, ROI_NAME_MAX);
  return insertScenario(c, {
    name,
    client: src.client_name,
    model_version: src.model_version,
    inputs_json: src.inputs_json!,
  });
});

export default app;
