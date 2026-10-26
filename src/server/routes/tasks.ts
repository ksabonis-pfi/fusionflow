import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
// Time-entry schemas below use zPlanTimestamp, not zPlanDate: their
// scheduled_start / scheduled_end are full ISO datetimes bound for D365
// msdyn_timeentry ("2026-07-30T15:00:00.000Z"), whereas tasks.scheduled_* and
// due_date are date-only values that drive the Gantt.
import { zPlanDateOrBlank, zPlanTimestamp } from "../lib/dateSchemas";
import type { Bindings, Variables } from "../types";
import { canEditProject, canLogTimeOnProject, canViewProject, visiblePhaseIds } from "../services/accessService";
import { maybeSendEmail } from "../services/emailService";
import { taskAssigned } from "../lib/emailTemplates";
import { createNotification } from "../lib/notifications";
import { getCaseAndJob, getCostCodesForJob } from "../services/dynamicsService";
import { assertUserPayCode, defaultCostCode, getUserPayCodes, type UserPayCodes } from "../lib/timeCodes";
import { pushTimeEntryToCrm, removeTimeEntryFromCrm, resolveCaseForTime } from "../services/timeEntryService";
import { syncStageStatus, maybeGraduateProject, syncProjectGoLiveDate, syncProjectStatus } from "../lib/teamUtils";
import { TASK_SELECT, isStaffedEngineer, updateTask } from "../services/taskService";

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();


app.get("/:id/tasks", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  // Phase-scoped clients see only tasks on their phases' stages (+ shared
  // stages, + tasks with no stage). Internal roles get vp === "ALL" → no filter.
  const vp = await visiblePhaseIds(db, auth.user, projectId);
  const vpIds = vp === "ALL" ? [] : vp;
  const phaseClause = vp === "ALL"
    ? ""
    : ` AND (stage_id IS NULL OR stage_id IN (SELECT id FROM stages WHERE project_id = ? AND (phase_id IS NULL OR phase_id IN (${vpIds.map(() => "?").join(",")}))))`;
  const phaseBinds = vp === "ALL" ? [] : [projectId, ...vpIds];

  // sort_order only ever breaks ties within the same due_date — it's never
  // a primary sort key, so two tasks due on different dates are unaffected
  // by it either way.
  const rows = await db
    .prepare(`${TASK_SELECT} WHERE project_id = ?${phaseClause} ORDER BY due_date ASC, sort_order ASC`)
    .bind(projectId, ...phaseBinds)
    .all();

  // Attach additional resources (beyond the primary assignee) to each task.
  const extra = await db
    .prepare(
      `SELECT ta.id, ta.task_id, ta.user_id, ta.contact_id
         FROM task_assignees ta
         JOIN tasks t ON t.id = ta.task_id
        WHERE t.project_id = ?`
    )
    .bind(projectId)
    .all<{ id: string; task_id: string; user_id: string | null; contact_id: string | null }>();
  const byTask = new Map<string, Array<{ id: string; user_id: string | null; contact_id: string | null }>>();
  for (const a of extra.results ?? []) {
    const list = byTask.get(a.task_id) ?? [];
    list.push({ id: a.id, user_id: a.user_id, contact_id: a.contact_id });
    byTask.set(a.task_id, list);
  }
  const tasks = (rows.results ?? []).map((t) => ({ ...(t as Record<string, unknown>), assignees: byTask.get((t as { id: string }).id) ?? [] }));

  return c.json(tasks);
});

const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  stage_id: z.string().nullable().optional(),
  assignee_user_id: z.string().max(255).nullable().optional(),
  due_date: zPlanDateOrBlank.nullable().optional(),
  scheduled_start: zPlanDateOrBlank.nullable().optional(),
  scheduled_end: zPlanDateOrBlank.nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).nullable().optional(),
  status: z.enum(["not_started", "in_progress", "completed", "blocked"]).default("not_started"),
});

app.post("/:id/tasks", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = (await canEditProject(db, auth.user, projectId)) || (await isStaffedEngineer(db, auth, projectId));
  if (!allowed) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const rawBody = await c.req.json();
  const parsed = createTaskSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  const { title, stage_id, assignee_user_id, due_date, scheduled_start, scheduled_end, priority, status } = parsed.data;
  const taskId = crypto.randomUUID();

  // New task goes to the end of its stage's order — only matters as a
  // due_date tiebreaker, so "end" just means "after whatever's already
  // there" rather than implying anything about the date itself.
  const nextSortOrder = stage_id
    ? await db.prepare("SELECT COALESCE(MAX(sort_order) + 1, 0) AS n FROM tasks WHERE stage_id = ?").bind(stage_id).first<{ n: number }>()
    : null;

  await db
    .prepare(
      `
      INSERT INTO tasks (id, project_id, stage_id, title, assignee_user_id, due_date, scheduled_start, scheduled_end, status, priority, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .bind(taskId, projectId, stage_id ?? null, title, assignee_user_id ?? null, due_date ?? null, scheduled_start ?? null, scheduled_end ?? null, status, priority ?? null, nextSortOrder?.n ?? null)
    .run();

  // Re-derive the parent stage's status now that a new task lives under it.
  await syncStageStatus(db, stage_id ?? null);
  await syncProjectGoLiveDate(db, projectId);
  await syncProjectStatus(db, projectId);

  const created = await db
    .prepare(`${TASK_SELECT} WHERE id = ? LIMIT 1`)
    .bind(taskId)
    .first<{ id: string; title: string; assignee_user_id: string | null; due_date: string | null; priority: string | null }>();

  // Notify assignee if one was set
  if (created?.assignee_user_id) {
    const [assignee, project] = await Promise.all([
      db.prepare("SELECT email, name FROM users WHERE id = ? LIMIT 1").bind(created.assignee_user_id).first<{ email: string; name: string }>(),
      db.prepare("SELECT name FROM projects WHERE id = ? LIMIT 1").bind(projectId).first<{ name: string }>(),
    ]);
    if (assignee && project) {
      const appUrl = c.env.APP_URL ?? "";
      c.executionCtx.waitUntil(maybeSendEmail(c.env, db, created.assignee_user_id, "important", {
        to: assignee.email,
        subject: `You've been assigned: ${created.title}`,
        html: taskAssigned({ assigneeName: assignee.name ?? assignee.email, taskTitle: created.title, projectName: project.name, dueDate: created.due_date, priority: created.priority, appUrl, projectId }),
      }));
      c.executionCtx.waitUntil(createNotification(db, {
        recipientUserId: created.assignee_user_id,
        type: "task_assigned",
        title: `You've been assigned: ${created.title}`,
        body: project.name,
        entityType: "task",
        entityId: created.id,
        projectId,
        senderUserId: auth.user.id,
      }));
    }
  }

  return c.json(created, 201);
});

// Bulk due-date update: lets a PM select several tasks that share a due date
// (within one stage, in the Tasks tab UI) and move them all to a new date in
// one action, instead of editing each task individually.
//
// Registered ahead of the generic PATCH /:id/tasks/:taskId route below —
// Hono matches routes in registration order, so if this came after it, a
// request to .../tasks/bulk-due-date would be captured by :taskId first
// (taskId = "bulk-due-date") and 404 as "no such task".
const bulkDueDateSchema = z.object({
  task_ids: z.array(z.string().min(1)).min(1).max(200),
  due_date: zPlanDateOrBlank.nullable(),
});

app.patch("/:id/tasks/bulk-due-date", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = (await canEditProject(db, auth.user, projectId)) || (await isStaffedEngineer(db, auth, projectId));
  if (!allowed) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const rawBody = await c.req.json();
  const parsed = bulkDueDateSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }
  const { task_ids, due_date } = parsed.data;

  // Only touch tasks that actually belong to this project — a stray id from
  // another project (or a stale client) is silently dropped rather than
  // erroring the whole batch.
  const existing = await db
    .prepare(`SELECT id, stage_id FROM tasks WHERE project_id = ? AND id IN (${task_ids.map(() => "?").join(",")})`)
    .bind(projectId, ...task_ids)
    .all<{ id: string; stage_id: string | null }>();
  const rows = existing.results ?? [];
  if (!rows.length) {
    throw new HTTPException(404, { message: "No matching tasks found" });
  }

  await db.batch(
    rows.map((t) =>
      db.prepare("UPDATE tasks SET due_date = ? WHERE id = ?").bind(due_date, t.id)
    )
  );

  // due_date alone doesn't change task status, but a moved go-live-event task
  // can shift the project's target date, so re-sync once for the whole batch.
  await syncProjectGoLiveDate(db, projectId);

  const updated = await db
    .prepare(`${TASK_SELECT} WHERE project_id = ? AND id IN (${rows.map(() => "?").join(",")})`)
    .bind(projectId, ...rows.map((t) => t.id))
    .all();

  return c.json(updated.results ?? []);
});

// Reorder: PM drags tied (same due_date, same stage) tasks into a new
// relative order. Body carries the full ordered id list for that tied group;
// sort_order is rewritten to match array position (0-based). Also registered
// ahead of the generic :taskId route for the same reason as bulk-due-date above.
const reorderTasksSchema = z.object({
  task_ids: z.array(z.string().min(1)).min(1).max(200),
});

app.patch("/:id/tasks/reorder", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = (await canEditProject(db, auth.user, projectId)) || (await isStaffedEngineer(db, auth, projectId));
  if (!allowed) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const rawBody = await c.req.json();
  const parsed = reorderTasksSchema.safeParse(rawBody);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }
  const { task_ids } = parsed.data;

  const existing = await db
    .prepare(`SELECT id FROM tasks WHERE project_id = ? AND id IN (${task_ids.map(() => "?").join(",")})`)
    .bind(projectId, ...task_ids)
    .all<{ id: string }>();
  const validIds = new Set((existing.results ?? []).map((t) => t.id));
  const orderedIds = task_ids.filter((id) => validIds.has(id));
  if (!orderedIds.length) {
    throw new HTTPException(404, { message: "No matching tasks found" });
  }

  await db.batch(
    orderedIds.map((id, index) =>
      db.prepare("UPDATE tasks SET sort_order = ? WHERE id = ?").bind(index, id)
    )
  );

  const updated = await db
    .prepare(`${TASK_SELECT} WHERE project_id = ? AND id IN (${orderedIds.map(() => "?").join(",")})`)
    .bind(projectId, ...orderedIds)
    .all();

  return c.json(updated.results ?? []);
});

app.patch("/:id/tasks/:taskId", async (c) => {
  const updated = await updateTask(c.env, c.executionCtx, c.get("auth"), c.req.param("id"), c.req.param("taskId"), await c.req.json());
  return c.json(updated);
});

// ── Task Comments ─────────────────────────────────────────────────────────────

app.get("/:id/tasks/:taskId/comments", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const taskId = c.req.param("taskId");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await db
    .prepare(
      `SELECT tc.id, tc.task_id, tc.project_id, tc.author_user_id, tc.body, tc.created_at,
              u.name AS author_name, u.email AS author_email
       FROM task_comments tc
       LEFT JOIN users u ON u.id = tc.author_user_id
       WHERE tc.task_id = ? AND tc.project_id = ?
       ORDER BY tc.created_at ASC`
    )
    .bind(taskId, projectId)
    .all();

  return c.json(rows.results ?? []);
});

app.post("/:id/tasks/:taskId/comments", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const taskId = c.req.param("taskId");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const task = await db
    .prepare("SELECT id FROM tasks WHERE id = ? AND project_id = ? LIMIT 1")
    .bind(taskId, projectId)
    .first();
  if (!task) throw new HTTPException(404, { message: "Task not found" });

  const { body } = await c.req.json<{ body: string }>();
  if (!body?.trim()) throw new HTTPException(400, { message: "Comment body required" });

  const commentId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO task_comments (id, task_id, project_id, author_user_id, body)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(commentId, taskId, projectId, auth.user.id, body.trim())
    .run();

  const created = await db
    .prepare(
      `SELECT tc.id, tc.task_id, tc.project_id, tc.author_user_id, tc.body, tc.created_at,
              u.name AS author_name, u.email AS author_email
       FROM task_comments tc
       LEFT JOIN users u ON u.id = tc.author_user_id
       WHERE tc.id = ? LIMIT 1`
    )
    .bind(commentId)
    .first();

  return c.json(created, 201);
});

app.delete("/:id/tasks/:taskId/comments/:commentId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const taskId = c.req.param("taskId");
  const commentId = c.req.param("commentId");

  const comment = await db
    .prepare("SELECT id, author_user_id FROM task_comments WHERE id = ? AND task_id = ? AND project_id = ? LIMIT 1")
    .bind(commentId, taskId, projectId)
    .first<{ id: string; author_user_id: string | null }>();

  if (!comment) throw new HTTPException(404, { message: "Comment not found" });

  // Only author, admins, or PMs can delete
  const isOwner = comment.author_user_id === auth.user.id;
  const isPrivileged = auth.role === "admin" || auth.role === "pm";
  if (!isOwner && !isPrivileged) throw new HTTPException(403, { message: "Forbidden" });

  await db.prepare("DELETE FROM task_comments WHERE id = ?").bind(commentId).run();
  return c.json({ success: true });
});

// ── Time Entry ────────────────────────────────────────────────────────────────

/** Temporary: return lookup field names on amc_timeentry for discovery. Admin only. */
app.get("/time-entry/metadata", async (c) => {
  const auth = c.get("auth");
  if (auth.role !== "admin") throw new HTTPException(403, { message: "Forbidden" });
  const { getTimeEntryLookupFields } = await import("../services/dynamicsService");
  const fields = await getTimeEntryLookupFields(c.env);
  return c.json(fields);
});

/** Return the caller's own pay code(s) + the cost codes for the project's CRM job, each with a
 *  pre-selected default. Used to populate the time entry form and My Time. */
app.get("/:id/time-entry/setup", async (c) => {
  const auth = c.get("auth");
  const projectId = c.req.param("id");
  // Optional: when the client passes ?stage_id=… we use the stage's parent
  // phase CRM case (if set) instead of the project-level case. This is how
  // phase-scoped projects (LACCD-style) route time entries to per-campus
  // Dynamics cases. Falls back to the project's case when the phase has
  // no override OR the stage has no parent phase.
  const stageId = c.req.query("stage_id") ?? null;
  const allowed = await canViewProject(c.env.DB, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const project = await c.env.DB
    .prepare("SELECT crm_case_id, phase_scoped_visibility FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first<{ crm_case_id: string | null; phase_scoped_visibility: number | null }>();

  // Resolve phase case override if a stage was supplied AND the project
  // currently has phase-scoped visibility on. Without the visibility gate,
  // a PM could enable scoping, link per-phase cases, then disable scoping —
  // and time entries would silently keep routing to the now-hidden phase
  // cases. The flag is the source of truth for "this project tracks per
  // phase"; without it we always use the project-level case.
  let phaseCaseId: string | null = null;
  if (stageId && project?.phase_scoped_visibility) {
    const stageRow = await c.env.DB
      .prepare(`SELECT p.crm_case_id AS phase_case_id
                FROM stages s LEFT JOIN phases p ON p.id = s.phase_id
                WHERE s.id = ? AND s.project_id = ? LIMIT 1`)
      .bind(stageId, projectId)
      .first<{ phase_case_id: string | null }>();
    phaseCaseId = stageRow?.phase_case_id ?? null;
  }

  const effectiveCaseId = phaseCaseId ?? project?.crm_case_id ?? null;
  console.log("[time-entry/setup] case_id:", effectiveCaseId ?? "(null)", "source:", phaseCaseId ? "phase" : "project");

  let payCodes: UserPayCodes = { codes: [], defaultId: null };
  let caseAndJob: Awaited<ReturnType<typeof getCaseAndJob>> = null;
  let caseError: string | null = null;

  try {
    [payCodes, caseAndJob] = await Promise.all([
      getUserPayCodes(c.env, auth.user),
      effectiveCaseId ? getCaseAndJob(c.env, effectiveCaseId) : Promise.resolve(null),
    ]);
  } catch (err) {
    caseError = err instanceof Error ? err.message : String(err);
    console.error("[time-entry/setup] CRM lookup failed:", caseError);
    // still try pay codes alone
    try { payCodes = await getUserPayCodes(c.env, auth.user); } catch { /* ignore */ }
  }

  console.log("[time-entry/setup] caseAndJob:", JSON.stringify(caseAndJob), "error:", caseError);

  const costCodes = caseAndJob?.jobId
    ? await getCostCodesForJob(c.env, caseAndJob.jobId)
    : [];

  const defaultCost = await defaultCostCode(c.env, costCodes, auth.user.id, projectId);

  return c.json({
    pay_codes: payCodes.codes,
    default_pay_code_id: payCodes.defaultId,
    cost_codes: costCodes,
    default_cost_code_id: defaultCost?.amc_costcodeid ?? null,
    case_id: caseAndJob?.caseId ?? null,
    job_id: caseAndJob?.jobId ?? null,
    account_id: caseAndJob?.accountId ?? null,
    _debug: {
      crm_case_id: effectiveCaseId,
      case_source: phaseCaseId ? "phase" : "project",
      case_found: !!caseAndJob,
      case_error: caseError,
    },
  });
});

const logTimeSchema = z.object({
  scheduled_start: zPlanTimestamp,
  scheduled_end: zPlanTimestamp,
  pay_code_id: z.string(),
  cost_code_id: z.string().nullable().optional(),
  case_id: z.string(),
  job_id: z.string(),
  account_id: z.string().nullable().optional(),
});

/** List time entries for a task. */
app.get("/:id/tasks/:taskId/time-entries", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const taskId = c.req.param("taskId");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await db
    .prepare(`
      SELECT tte.*, u.name AS user_name
      FROM task_time_entries tte
      LEFT JOIN users u ON u.id = tte.user_id
      WHERE tte.task_id = ? AND tte.project_id = ?
      ORDER BY tte.scheduled_start ASC
    `)
    .bind(taskId, projectId)
    .all();

  return c.json(rows.results ?? []);
});

/** Log a time entry against a task and ship it to Dynamics CRM. Does not change task status. */
app.post("/:id/tasks/:taskId/time-entries", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const taskId = c.req.param("taskId");

  const task = await db
    .prepare(`${TASK_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`)
    .bind(taskId, projectId)
    .first<{ id: string; title: string; assignee_user_id: string | null; status: string | null }>();
  if (!task) throw new HTTPException(404, { message: "Task not found" });

  // Project editors, plus any PM/IE — see canLogTimeOnProject. Supersedes the
  // old "engineer on their own task" carve-out, which the pf_engineer branch of
  // that helper now covers.
  const canLogTime = await canLogTimeOnProject(db, auth.user, projectId);
  if (!canLogTime) throw new HTTPException(403, { message: "Forbidden" });

  const body = await c.req.json();
  const parsed = logTimeSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid time entry data" });

  const { scheduled_start, scheduled_end, pay_code_id, cost_code_id, case_id, job_id, account_id } = parsed.data;
  await assertUserPayCode(c.env, auth.user, pay_code_id);

  // Create-then-close in CRM; throws before the local insert on any failure.
  const crmTimeEntryId = await pushTimeEntryToCrm(c.env, {
    subject: task.title,
    scheduledStart: scheduled_start,
    scheduledEnd: scheduled_end,
    caseId: case_id,
    jobId: job_id,
    payCodeId: pay_code_id,
    costCodeId: cost_code_id ?? null,
    companyId: account_id ?? null,
    ownerEmail: auth.user.email,
  }, "task");

  const entryId = crypto.randomUUID();
  await db
    .prepare(`
      INSERT INTO task_time_entries (id, task_id, project_id, crm_time_entry_id, scheduled_start, scheduled_end, pay_code_id, cost_code_id, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(entryId, taskId, projectId, crmTimeEntryId, scheduled_start, scheduled_end, pay_code_id, cost_code_id ?? null, auth.user.id)
    .run();

  const created = await db
    .prepare(`SELECT tte.*, u.name AS user_name FROM task_time_entries tte LEFT JOIN users u ON u.id = tte.user_id WHERE tte.id = ? LIMIT 1`)
    .bind(entryId)
    .first();

  return c.json(created, 201);
});

// ── Stage-level time entry ──────────────────────────────────────────────────
// Time is logged per STAGE (one Log Time action per stage group) rather than
// per task. The CRM submission is identical to the task path — related to the
// project's case + job — only the subject (stage name) and local table differ.
// Both pay code (labor) and cost code are REQUIRED here.

const logStageTimeSchema = z.object({
  scheduled_start: zPlanTimestamp,
  scheduled_end: zPlanTimestamp,
  pay_code_id: z.string().min(1),
  cost_code_id: z.string().min(1),
  /** Optional free-text note; combined into the CRM subject as
   *  "{project} ({stage}) {note}". */
  note: z.string().max(500).optional(),
  case_id: z.string(),
  job_id: z.string(),
  account_id: z.string().nullable().optional(),
});

/** List time entries for a stage. */
app.get("/:id/stages/:stageId/time-entries", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const stageId = c.req.param("stageId");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await db
    .prepare(`
      SELECT ste.*, u.name AS user_name
      FROM stage_time_entries ste
      LEFT JOIN users u ON u.id = ste.user_id
      WHERE ste.stage_id = ? AND ste.project_id = ?
      ORDER BY ste.scheduled_start ASC
    `)
    .bind(stageId, projectId)
    .all();

  return c.json(rows.results ?? []);
});

/** Log a time entry against a stage and ship it to Dynamics CRM. */
app.post("/:id/stages/:stageId/time-entries", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const stageId = c.req.param("stageId");

  const stage = await db
    .prepare("SELECT id, name FROM stages WHERE id = ? AND project_id = ? LIMIT 1")
    .bind(stageId, projectId)
    .first<{ id: string; name: string }>();
  if (!stage) throw new HTTPException(404, { message: "Stage not found" });

  // Project editors, plus any PM/IE — see canLogTimeOnProject. Replaces the old
  // "engineer must be on project_staff" gate: PMs and IEs log stage time on
  // projects they aren't staffed on, and the hours belong in CRM either way.
  const canLogTime = await canLogTimeOnProject(db, auth.user, projectId);
  if (!canLogTime) throw new HTTPException(403, { message: "Forbidden" });

  const body = await c.req.json();
  const parsed = logStageTimeSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid time entry data — pay code and cost code are required" });

  const { scheduled_start, scheduled_end, pay_code_id, cost_code_id, note, case_id, job_id, account_id } = parsed.data;
  await assertUserPayCode(c.env, auth.user, pay_code_id);

  // CRM subject: "{stage} | {note}" — e.g. "Initiate | Kick off meeting with
  // client". The entry is related to the project's CRM case, which already
  // identifies the project, so the project name isn't repeated here.
  const noteTrimmed = (note ?? "").trim();
  const subject = noteTrimmed ? `${stage.name} | ${noteTrimmed}` : stage.name;

  const crmTimeEntryId = await pushTimeEntryToCrm(c.env, {
    subject,
    scheduledStart: scheduled_start,
    scheduledEnd: scheduled_end,
    caseId: case_id,
    jobId: job_id,
    payCodeId: pay_code_id,
    costCodeId: cost_code_id,
    companyId: account_id ?? null,
    ownerEmail: auth.user.email,
  }, "stage");

  const entryId = crypto.randomUUID();
  await db
    .prepare(`
      INSERT INTO stage_time_entries (id, stage_id, project_id, crm_time_entry_id, scheduled_start, scheduled_end, pay_code_id, cost_code_id, note, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(entryId, stageId, projectId, crmTimeEntryId, scheduled_start, scheduled_end, pay_code_id, cost_code_id, noteTrimmed || null, auth.user.id)
    .run();

  const created = await db
    .prepare(`SELECT ste.*, u.name AS user_name FROM stage_time_entries ste LEFT JOIN users u ON u.id = ste.user_id WHERE ste.id = ? LIMIT 1`)
    .bind(entryId)
    .first();

  return c.json(created, 201);
});

/** Delete a stage time entry — removes it from Dynamics CRM and locally. */
app.delete("/:id/stages/:stageId/time-entries/:entryId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const stageId = c.req.param("stageId");
  const entryId = c.req.param("entryId");

  const entry = await db
    .prepare("SELECT id, crm_time_entry_id, user_id FROM stage_time_entries WHERE id = ? AND stage_id = ? AND project_id = ? LIMIT 1")
    .bind(entryId, stageId, projectId)
    .first<{ id: string; crm_time_entry_id: string | null; user_id: string | null }>();
  if (!entry) throw new HTTPException(404, { message: "Time entry not found" });

  // PMs (project editors) may remove any entry; an engineer may remove their own.
  const canEdit = await canEditProject(db, auth.user, projectId);
  const isOwnEntry = entry.user_id === auth.user.id;
  if (!canEdit && !isOwnEntry) throw new HTTPException(403, { message: "Forbidden" });

  // CRM record first, so the local row never points at a CRM entry we failed to remove.
  await removeTimeEntryFromCrm(c.env, entry.crm_time_entry_id, "stage");

  await db.prepare("DELETE FROM stage_time_entries WHERE id = ?").bind(entryId).run();

  return c.json({ ok: true });
});

// ── Project-level "admin time" entry ────────────────────────────────────────
// General project/admin time that isn't tied to any task or stage. It logs
// against the project's CRM case + job exactly like the stage path — same
// create-then-close contract, same authz — only the CRM subject
// ("Project Admin | {note}") and the local shadow table (project_time_entries)
// differ. v1 is PROJECT-LEVEL ONLY (no per-phase routing). Case/job/account are
// resolved server-side from the project's crm_case_id — never trusted from the
// client. Both pay code (labor) and cost code are REQUIRED here.

const logProjectTimeSchema = z.object({
  scheduled_start: zPlanTimestamp,
  scheduled_end: zPlanTimestamp,
  pay_code_id: z.string().min(1),
  cost_code_id: z.string().min(1),
  /** Optional free-text note; combined into the CRM subject as
   *  "Project Admin | {note}". */
  note: z.string().max(500).optional(),
});

// Shadow-row hours (client display / block total). Kept out of the compliance
// rollup — the CRM read-back already counts these entries against the case.
const PROJECT_TIME_SELECT = `
  SELECT pte.*, u.name AS user_name,
         (julianday(pte.scheduled_end) - julianday(pte.scheduled_start)) * 24 AS hours
  FROM project_time_entries pte
  LEFT JOIN users u ON u.id = pte.user_id
`;

/** List project-level admin time entries. */
app.get("/:id/time-entries", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const allowed = await canViewProject(db, auth.user, projectId);
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const rows = await db
    .prepare(`${PROJECT_TIME_SELECT} WHERE pte.project_id = ? ORDER BY pte.scheduled_start ASC`)
    .bind(projectId)
    .all();

  return c.json(rows.results ?? []);
});

/** Log a project-level admin time entry and ship it to Dynamics CRM. */
app.post("/:id/time-entries", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");

  const project = await db
    .prepare("SELECT id, crm_case_id FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first<{ id: string; crm_case_id: string | null }>();
  if (!project) throw new HTTPException(404, { message: "Project not found" });

  // Same gate as the stage-level path — see canLogTimeOnProject.
  const canLogTime = await canLogTimeOnProject(db, auth.user, projectId);
  if (!canLogTime) throw new HTTPException(403, { message: "Forbidden" });

  if (!project.crm_case_id) throw new HTTPException(400, { message: "Project has no linked CRM case." });

  const body = await c.req.json();
  const parsed = logProjectTimeSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid time entry data — pay code and cost code are required" });

  const { scheduled_start, scheduled_end, pay_code_id, cost_code_id, note } = parsed.data;
  await assertUserPayCode(c.env, auth.user, pay_code_id);

  // Resolve case/job/account from the project's linked case SERVER-SIDE — never
  // trust client-supplied ids.
  const caseAndJob = await resolveCaseForTime(c.env, project.crm_case_id);

  // CRM subject: "Project Admin | {note}" — e.g. "Project Admin | weekly
  // internal sync". The entry is related to the project's CRM case, which
  // already identifies the project, so the project name isn't repeated here.
  const noteTrimmed = (note ?? "").trim();
  const subject = noteTrimmed ? `Project Admin | ${noteTrimmed}` : "Project Admin";

  const crmTimeEntryId = await pushTimeEntryToCrm(c.env, {
    subject,
    scheduledStart: scheduled_start,
    scheduledEnd: scheduled_end,
    caseId: caseAndJob.caseId,
    jobId: caseAndJob.jobId,
    payCodeId: pay_code_id,
    costCodeId: cost_code_id,
    companyId: caseAndJob.accountId,
    ownerEmail: auth.user.email,
  }, "project admin");

  const entryId = crypto.randomUUID();
  await db
    .prepare(`
      INSERT INTO project_time_entries (id, project_id, crm_time_entry_id, scheduled_start, scheduled_end, pay_code_id, cost_code_id, note, user_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(entryId, projectId, crmTimeEntryId, scheduled_start, scheduled_end, pay_code_id, cost_code_id, noteTrimmed || null, auth.user.id)
    .run();

  const created = await db
    .prepare(`${PROJECT_TIME_SELECT} WHERE pte.id = ? LIMIT 1`)
    .bind(entryId)
    .first();

  return c.json(created, 201);
});

/** Delete a project-level admin time entry — removes it from Dynamics CRM and locally. */
app.delete("/:id/time-entries/:entryId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const entryId = c.req.param("entryId");

  const entry = await db
    .prepare("SELECT id, crm_time_entry_id, user_id FROM project_time_entries WHERE id = ? AND project_id = ? LIMIT 1")
    .bind(entryId, projectId)
    .first<{ id: string; crm_time_entry_id: string | null; user_id: string | null }>();
  if (!entry) throw new HTTPException(404, { message: "Time entry not found" });

  // Project editors may remove any entry; anyone else may remove their own —
  // same rule as the stage-level delete. Deliberately narrower than the POST:
  // an unstaffed PM/IE can log time here and undo their own mistake, but not
  // reach into someone else's hours on a project they don't run.
  const canEdit = await canEditProject(db, auth.user, projectId);
  const isOwnEntry = entry.user_id === auth.user.id;
  if (!canEdit && !isOwnEntry) throw new HTTPException(403, { message: "Forbidden" });

  // CRM record first, so the local row never points at a CRM entry we failed to remove.
  await removeTimeEntryFromCrm(c.env, entry.crm_time_entry_id, "project admin");

  await db.prepare("DELETE FROM project_time_entries WHERE id = ?").bind(entryId).run();

  return c.json({ ok: true });
});

app.delete("/:id/tasks/:taskId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const taskId = c.req.param("taskId");

  const allowed = (await canEditProject(db, auth.user, projectId)) || (await isStaffedEngineer(db, auth, projectId));
  if (!allowed) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const existing = await db
    .prepare(`SELECT id, stage_id FROM tasks WHERE id = ? AND project_id = ? LIMIT 1`)
    .bind(taskId, projectId)
    .first<{ id: string; stage_id: string | null }>();

  if (!existing) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  await db
    .prepare(`DELETE FROM tasks WHERE id = ? AND project_id = ?`)
    .bind(taskId, projectId)
    .run();

  // Removing a task may flip the parent stage's status (e.g. it was the
  // only un-completed task → stage is now fully done) AND, if the deleted
  // task was the go-live event, the project's target_go_live_date.
  await syncStageStatus(db, existing.stage_id);
  await maybeGraduateProject(db, projectId, auth.user.id);
  await syncProjectGoLiveDate(db, projectId);
  await syncProjectStatus(db, projectId);

  return c.json({ success: true });
});

// ── Additional task resources (beyond the primary assignee) ──────────────────

const addAssigneeSchema = z.object({
  user_id: z.string().max(255).nullable().optional(),
  contact_id: z.string().max(255).nullable().optional(),
});

// Add an extra resource to a task. Exactly one of user_id / contact_id. Managing
// assignments is a manage action, so it needs full edit or staffed-engineer.
app.post("/:id/tasks/:taskId/assignees", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const taskId = c.req.param("taskId");

  const allowed = (await canEditProject(db, auth.user, projectId)) || (await isStaffedEngineer(db, auth, projectId));
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  const task = await db
    .prepare(`SELECT id, title, due_date, priority, assignee_user_id, assignee_contact_id FROM tasks WHERE id = ? AND project_id = ? LIMIT 1`)
    .bind(taskId, projectId)
    .first<{ id: string; title: string; due_date: string | null; priority: string | null; assignee_user_id: string | null; assignee_contact_id: string | null }>();
  if (!task) throw new HTTPException(404, { message: "Task not found" });

  const parsed = addAssigneeSchema.safeParse(await c.req.json());
  if (!parsed.success) throw new HTTPException(400, { message: "Invalid request body" });
  const userId = parsed.data.user_id ?? null;
  const contactId = parsed.data.contact_id ?? null;
  if ((userId && contactId) || (!userId && !contactId)) {
    throw new HTTPException(400, { message: "Provide exactly one of user_id or contact_id" });
  }

  // Skip if this person is already the primary assignee.
  if ((userId && userId === task.assignee_user_id) || (contactId && contactId === task.assignee_contact_id)) {
    throw new HTTPException(409, { message: "Already the primary assignee" });
  }

  // Idempotent: return the existing row if this person is already an extra.
  const dup = await db
    .prepare(`SELECT id, user_id, contact_id FROM task_assignees WHERE task_id = ? AND ${userId ? "user_id = ?" : "contact_id = ?"} LIMIT 1`)
    .bind(taskId, userId ?? contactId)
    .first<{ id: string; user_id: string | null; contact_id: string | null }>();
  if (dup) return c.json(dup);

  const id = crypto.randomUUID();
  await db
    .prepare(`INSERT INTO task_assignees (id, task_id, user_id, contact_id) VALUES (?, ?, ?, ?)`)
    .bind(id, taskId, userId, contactId)
    .run();

  // Notify an added resource exactly like the primary assignee. Internal users
  // get email (pref-gated) + an in-app notification. Contacts (external /
  // customer people) aren't platform users, so they get the email directly
  // (no in-app feed, no per-user preference).
  const projectRow = await db.prepare("SELECT name FROM projects WHERE id = ? LIMIT 1").bind(projectId).first<{ name: string }>();
  const appUrl = c.env.APP_URL ?? "";
  if (userId && projectRow) {
    const assignee = await db.prepare("SELECT email, name FROM users WHERE id = ? LIMIT 1").bind(userId).first<{ email: string; name: string }>();
    if (assignee) {
      c.executionCtx.waitUntil(maybeSendEmail(c.env, db, userId, "important", {
        to: assignee.email,
        subject: `You've been assigned: ${task.title}`,
        html: taskAssigned({ assigneeName: assignee.name ?? assignee.email, taskTitle: task.title, projectName: projectRow.name, dueDate: task.due_date, priority: task.priority, appUrl, projectId }),
      }));
      c.executionCtx.waitUntil(createNotification(db, {
        recipientUserId: userId,
        type: "task_assigned",
        title: `You've been assigned: ${task.title}`,
        body: projectRow.name,
        entityType: "task",
        entityId: taskId,
        projectId,
        senderUserId: auth.user.id,
      }));
    }
  } else if (contactId && projectRow) {
    const contact = await db.prepare("SELECT email, name FROM project_contacts WHERE id = ? LIMIT 1").bind(contactId).first<{ email: string | null; name: string | null }>();
    if (contact?.email) {
      c.executionCtx.waitUntil(maybeSendEmail(c.env, db, null, "important", {
        to: contact.email,
        subject: `You've been assigned: ${task.title}`,
        html: taskAssigned({ assigneeName: contact.name ?? contact.email, taskTitle: task.title, projectName: projectRow.name, dueDate: task.due_date, priority: task.priority, appUrl, projectId }),
      }));
    }
  }

  return c.json({ id, user_id: userId, contact_id: contactId });
});

// Remove an extra resource from a task.
app.delete("/:id/tasks/:taskId/assignees/:assigneeId", async (c) => {
  const auth = c.get("auth");
  const db = c.env.DB;
  const projectId = c.req.param("id");
  const taskId = c.req.param("taskId");
  const assigneeId = c.req.param("assigneeId");

  const allowed = (await canEditProject(db, auth.user, projectId)) || (await isStaffedEngineer(db, auth, projectId));
  if (!allowed) throw new HTTPException(403, { message: "Forbidden" });

  // Scope the delete to a task that actually belongs to this project.
  await db
    .prepare(
      `DELETE FROM task_assignees
        WHERE id = ? AND task_id = ?
          AND task_id IN (SELECT id FROM tasks WHERE project_id = ?)`
    )
    .bind(assigneeId, taskId, projectId)
    .run();

  return c.json({ success: true });
});

export default app;
