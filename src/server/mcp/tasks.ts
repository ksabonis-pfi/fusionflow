import { HTTPException } from "hono/http-exception";
import type { AppUser, AuthContext, Bindings } from "../types";
import { canEditProject, canViewProject } from "../services/accessService";
import { isStaffedEngineer, updateTask } from "../services/taskService";
import { writeAuditLog } from "../lib/auditLog";
import { pacificToday, addDays } from "../lib/pacificTime";
import type { ToolFailure } from "./timeWrites";

/**
 * Task tools for the Claude connector. "My tasks" matches the My Tasks page:
 * tasks where I'm the assignee or an additional resource (task_assignees).
 * Writes go through updateTask() in services/taskService, the same code as
 * PATCH /api/projects/:id/tasks/:taskId, so stage/project status, go-live
 * sync, PM emails and the Zoom go-live announcement all fire exactly as they
 * do from the UI.
 *
 * Not covered: MedVet's custom_plan_items, which My Tasks also lists. They live
 * in their own table with their own edit path.
 */

const fail = (error: string, extra: Record<string, unknown> = {}): ToolFailure => ({ error, ...extra });

export type TaskStatusFilter = "open" | "not_started" | "in_progress" | "blocked" | "completed" | "overdue";

type MyTaskRow = {
  id: string;
  project_id: string;
  title: string;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  completed_at: string | null;
  is_go_live_event: number | null;
  is_primary: number;
  project_name: string;
  customer_name: string | null;
  stage_name: string | null;
  comment_count: number;
  last_comment_author_id: string | null;
  last_comment_author: string | null;
  last_comment_at: string | null;
  last_comment_body: string | null;
};

const excerpt = (s: string | null, n = 200) => (s && s.length > n ? `${s.slice(0, n)}…` : s);

/** Tasks assigned to me, open ones by default, soonest-due first within status. */
export async function listMyTasks(
  env: Bindings,
  user: AppUser,
  opts: { projectIds?: string[]; status?: TaskStatusFilter; dueWithinDays?: number; limit?: number }
) {
  const today = pacificToday();
  const status = opts.status ?? "open";
  const where: string[] = [
    "(t.assignee_user_id = ? OR t.id IN (SELECT task_id FROM task_assignees WHERE user_id = ?))",
    "COALESCE(p.archived, 0) = 0",
  ];
  const binds: unknown[] = [user.id, user.id, user.id];

  // Same visibility as the UI. Matters for partner_ae, whose stale assignment
  // on a project they've since lost access to mustn't leak its tasks. Resolved
  // up front and applied in SQL, so LIMIT counts only visible tasks.
  const assignedProjectIds = ((await env.DB
    .prepare(
      `SELECT DISTINCT project_id FROM tasks
        WHERE assignee_user_id = ? OR id IN (SELECT task_id FROM task_assignees WHERE user_id = ?)`
    )
    .bind(user.id, user.id)
    .all<{ project_id: string }>()).results ?? []).map((r) => r.project_id);
  const visibleProjectIds = (await Promise.all(
    assignedProjectIds.map(async (id) => ((await canViewProject(env.DB, user, id)) ? id : null))
  )).filter((id): id is string => !!id);
  if (visibleProjectIds.length === 0) return [];
  // json_each rather than one placeholder per id: D1 caps bound parameters.
  where.push("t.project_id IN (SELECT value FROM json_each(?))");
  binds.push(JSON.stringify(visibleProjectIds));

  if (status === "open") {
    where.push("COALESCE(t.status, '') != 'completed'", "p.closed_at IS NULL");
  } else if (status === "overdue") {
    where.push("COALESCE(t.status, '') != 'completed'", "p.closed_at IS NULL", "t.due_date IS NOT NULL", "t.due_date < ?");
    binds.push(today);
  } else {
    where.push("t.status = ?");
    binds.push(status);
  }
  if (opts.dueWithinDays !== undefined) {
    where.push("t.due_date IS NOT NULL", "t.due_date <= ?");
    binds.push(addDays(today, opts.dueWithinDays));
  }
  if (opts.projectIds?.length) {
    where.push(`t.project_id IN (${opts.projectIds.map(() => "?").join(", ")})`);
    binds.push(...opts.projectIds);
  }

  const rows = (await env.DB
    .prepare(
      `SELECT t.id, t.project_id, t.title, t.status, t.priority, t.due_date, t.completed_at, t.is_go_live_event,
              CASE WHEN t.assignee_user_id = ? THEN 1 ELSE 0 END AS is_primary,
              p.name AS project_name, COALESCE(c.name, p.customer_name) AS customer_name,
              s.name AS stage_name,
              (SELECT COUNT(*) FROM task_comments WHERE task_id = t.id) AS comment_count,
              lc.author_user_id AS last_comment_author_id, lu.name AS last_comment_author,
              lc.created_at AS last_comment_at, lc.body AS last_comment_body
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         LEFT JOIN customers c ON c.id = p.customer_id
         LEFT JOIN stages s ON s.id = t.stage_id
         LEFT JOIN task_comments lc
                ON lc.id = (SELECT id FROM task_comments WHERE task_id = t.id ORDER BY created_at DESC LIMIT 1)
         LEFT JOIN users lu ON lu.id = lc.author_user_id
        WHERE ${where.join(" AND ")}
        ORDER BY CASE t.status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'not_started' THEN 2 ELSE 3 END,
                 t.due_date IS NULL, t.due_date,
                 CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
        LIMIT ?`
    )
    .bind(...binds, Math.min(Math.max(opts.limit ?? 50, 1), 200))
    .all<MyTaskRow>()).results ?? [];

  return rows.map((r) => ({
    task_id: r.id,
    title: r.title,
    customer: r.customer_name,
    project: r.project_name,
    project_id: r.project_id,
    stage: r.stage_name,
    status: r.status,
    priority: r.priority,
    due_date: r.due_date,
    overdue: !!r.due_date && r.status !== "completed" && r.due_date < today,
    completed_at: r.completed_at,
    is_go_live_event: r.is_go_live_event === 1,
    my_role: r.is_primary ? "assignee" : "additional_resource",
    comment_count: r.comment_count,
    // Someone else spoke last on this task: the clearest "waiting on me" signal.
    last_comment: r.last_comment_at
      ? {
          by: r.last_comment_author,
          from_me: r.last_comment_author_id === user.id,
          at: r.last_comment_at,
          excerpt: excerpt(r.last_comment_body),
        }
      : null,
  }));
}

type TaskRow = {
  id: string;
  project_id: string;
  stage_id: string | null;
  title: string;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  completed_at: string | null;
  is_go_live_event: number | null;
  notes: string | null;
  assignee_user_id: string | null;
};

async function loadVisibleTask(env: Bindings, user: AppUser, taskId: string): Promise<TaskRow | null> {
  const task = await env.DB
    .prepare(
      `SELECT id, project_id, stage_id, title, status, priority, due_date, completed_at, is_go_live_event, notes, assignee_user_id
         FROM tasks WHERE id = ? LIMIT 1`
    )
    .bind(taskId)
    .first<TaskRow>();
  if (!task || !(await canViewProject(env.DB, user, task.project_id))) return null;
  return task;
}

/** Mirrors updateTask's permission check, so the model knows what it may change. */
async function editAccess(env: Bindings, auth: AuthContext, task: TaskRow): Promise<"full" | "status_only" | "none"> {
  if (await canEditProject(env.DB, auth.user, task.project_id)) return "full";
  if (await isStaffedEngineer(env.DB, auth, task.project_id)) return "full";
  if (auth.role === "pf_engineer" && task.assignee_user_id === auth.user.id) return "status_only";
  return "none";
}

/** One task in full: notes, every assignee, comment thread, and what I may edit. */
export async function getTaskDetails(env: Bindings, auth: AuthContext, taskId: string) {
  const task = await loadVisibleTask(env, auth.user, taskId);
  if (!task) return fail(`No task you can see has id "${taskId}". Use list_my_tasks to find task ids.`);

  const [project, stage, assignees, comments, access] = await Promise.all([
    env.DB.prepare(
      `SELECT p.name, COALESCE(c.name, p.customer_name) AS customer_name, pm.name AS pm_name
         FROM projects p
         LEFT JOIN customers c ON c.id = p.customer_id
         LEFT JOIN users pm ON pm.id = p.pm_user_id
        WHERE p.id = ? LIMIT 1`
    ).bind(task.project_id).first<{ name: string; customer_name: string | null; pm_name: string | null }>(),
    task.stage_id
      ? env.DB.prepare("SELECT name FROM stages WHERE id = ? LIMIT 1").bind(task.stage_id).first<{ name: string }>()
      : Promise.resolve(null),
    env.DB.prepare(
      `SELECT u.name, u.email, 'assignee' AS role FROM tasks t JOIN users u ON u.id = t.assignee_user_id WHERE t.id = ?1
       UNION ALL
       SELECT u.name, u.email, 'additional_resource' FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id = ?1
       UNION ALL
       SELECT pc.name, pc.email, 'customer_contact' FROM tasks t JOIN project_contacts pc ON pc.id = t.assignee_contact_id WHERE t.id = ?1`
    ).bind(task.id).all<{ name: string | null; email: string | null; role: string }>(),
    env.DB.prepare(
      `SELECT u.name AS author, tc.author_user_id, tc.body, tc.created_at
         FROM task_comments tc LEFT JOIN users u ON u.id = tc.author_user_id
        WHERE tc.task_id = ? ORDER BY tc.created_at ASC`
    ).bind(task.id).all<{ author: string | null; author_user_id: string | null; body: string; created_at: string }>(),
    editAccess(env, auth, task),
  ]);

  return {
    task_id: task.id,
    title: task.title,
    customer: project?.customer_name ?? null,
    project: project?.name ?? null,
    project_id: task.project_id,
    pm: project?.pm_name ?? null,
    stage: stage?.name ?? null,
    status: task.status,
    priority: task.priority,
    due_date: task.due_date,
    completed_at: task.completed_at,
    is_go_live_event: task.is_go_live_event === 1,
    notes: task.notes,
    assignees: assignees.results ?? [],
    comments: (comments.results ?? []).map((c) => ({
      by: c.author, from_me: c.author_user_id === auth.user.id, at: c.created_at, body: c.body,
    })),
    my_edit_access: access,
  };
}

export type TaskChanges = {
  status?: "not_started" | "in_progress" | "blocked" | "completed";
  due_date?: string | null;
  priority?: "low" | "medium" | "high" | null;
  notes?: string | null;
  completed_on?: string;
};

/**
 * Change a task as the user. Only fields that actually differ are sent, and a
 * no-op returns without touching anything: updateTask re-stamps completed_at
 * and emails the PM on every call, so a retried "complete it" must not repeat
 * that.
 */
export async function updateTaskForUser(
  env: Bindings,
  ctx: ExecutionContext,
  auth: AuthContext,
  taskId: string,
  changes: TaskChanges,
  confirmGoLive: boolean
) {
  const task = await loadVisibleTask(env, auth.user, taskId);
  if (!task) return fail(`No task you can see has id "${taskId}". Use list_my_tasks to find task ids.`);

  const body: Record<string, unknown> = {};
  if (changes.status !== undefined && changes.status !== task.status) body.status = changes.status;
  if (changes.due_date !== undefined && (changes.due_date || null) !== task.due_date) body.due_date = changes.due_date ?? null;
  if (changes.priority !== undefined && changes.priority !== task.priority) body.priority = changes.priority;
  if (changes.notes !== undefined && (changes.notes || null) !== task.notes) body.notes = changes.notes;
  if (changes.completed_on !== undefined) {
    if ((body.status ?? task.status) !== "completed") {
      return fail("completed_on only applies when the task is being completed (or already is).");
    }
    if (changes.completed_on !== task.completed_at?.slice(0, 10)) body.completed_at = changes.completed_on;
  }

  // Completing without a date means today in Pacific. Left to updateTask, the
  // completion would get SQLite's UTC CURRENT_TIMESTAMP, which is already
  // tomorrow from 4/5 p.m. Pacific and would carry into actual_go_live_date
  // and the go-live announcement. Only on the transition itself: a retry on an
  // already-completed task must not move its date.
  if (body.status === "completed" && body.completed_at === undefined) {
    body.completed_at = pacificToday();
  }

  if (Object.keys(body).length === 0) {
    return { status: "no_change", task_id: task.id, title: task.title, current_status: task.status };
  }

  // Completing the canonical go-live task announces the go-live to the
  // company's Zoom channel. That can't be taken back, so it needs an explicit
  // yes from the user, not just the model inferring "done".
  const goingLive = body.status === "completed" && task.is_go_live_event === 1;
  if (goingLive && !confirmGoLive) {
    return fail(
      "This is the project's go-live task. Completing it marks the project live and posts a go-live " +
      "announcement to the company Zoom channel. Confirm with the user, then retry with confirm_go_live=true.",
      { task_id: task.id, title: task.title, requires: "confirm_go_live" }
    );
  }

  let updated: Awaited<ReturnType<typeof updateTask>>;
  try {
    updated = await updateTask(env, ctx, auth, task.project_id, task.id, body);
  } catch (err) {
    if (err instanceof HTTPException) {
      return fail(
        err.status === 403 && err.message === "Forbidden"
          ? "You don't have permission to change this task. Ask the project's PM."
          : err.message
      );
    }
    throw err;
  }

  audit(env, ctx, auth, task.project_id, `/api/projects/${task.project_id}/tasks/${task.id}`, "update");

  return {
    status: "updated",
    task_id: task.id,
    title: task.title,
    changed: Object.keys(body),
    task: {
      status: updated?.status ?? null,
      priority: updated?.priority ?? null,
      due_date: updated?.due_date ?? null,
      completed_at: updated?.completed_at ?? null,
    },
    go_live_announced: goingLive,
  };
}

/**
 * Post a comment on a task as the user. An identical comment from me on the
 * same task in the last 24 hours is treated as a retry, unless allowDuplicate.
 * Like the UI, anyone who can see the project may comment.
 */
export async function addTaskCommentForUser(
  env: Bindings,
  ctx: ExecutionContext,
  auth: AuthContext,
  taskId: string,
  text: string,
  allowDuplicate: boolean
) {
  const task = await loadVisibleTask(env, auth.user, taskId);
  if (!task) return fail(`No task you can see has id "${taskId}". Use list_my_tasks to find task ids.`);
  const body = text.trim();

  if (!allowDuplicate) {
    const dup = await env.DB
      .prepare(
        `SELECT id, created_at FROM task_comments
          WHERE task_id = ? AND author_user_id = ? AND body = ? AND created_at >= datetime('now', '-1 day')
          ORDER BY created_at DESC LIMIT 1`
      )
      .bind(task.id, auth.user.id, body)
      .first<{ id: string; created_at: string }>();
    if (dup) return { status: "duplicate", comment_id: dup.id, posted_at: dup.created_at, task_id: task.id, title: task.title };
  }

  const commentId = crypto.randomUUID();
  await env.DB
    .prepare(`INSERT INTO task_comments (id, task_id, project_id, author_user_id, body) VALUES (?, ?, ?, ?, ?)`)
    .bind(commentId, task.id, task.project_id, auth.user.id, body)
    .run();

  audit(env, ctx, auth, task.project_id, `/api/projects/${task.project_id}/tasks/${task.id}/comments`, "create");

  return { status: "posted", comment_id: commentId, task_id: task.id, title: task.title };
}

/**
 * Logged against the project, with the same path shape as the UI's request,
 * so the change shows up in the project's Activity log ("Updated a task").
 * method "MCP" marks it as done through the connector.
 */
function audit(env: Bindings, ctx: ExecutionContext, auth: AuthContext, projectId: string, path: string, action: string) {
  ctx.waitUntil(writeAuditLog(env.DB, {
    entityType: "project",
    entityId: projectId,
    action,
    method: "MCP",
    path,
    status: 200,
    actor: { id: auth.user.id, name: auth.user.name, email: auth.user.email },
  }));
}
