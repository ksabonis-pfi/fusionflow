import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { zPlanDateOrBlank, zPlanTimestamp } from "../lib/dateSchemas";
import type { AuthContext, Bindings } from "../types";
import { canEditProject } from "./accessService";
import { maybeSendEmail } from "./emailService";
import { taskAssigned, taskBlocked, pmTaskUpdate } from "../lib/emailTemplates";
import { createNotification, notifyGoLive } from "../lib/notifications";
import { syncStageStatus, maybeGraduateProject, syncProjectGoLiveDate, syncProjectStatus } from "../lib/teamUtils";
import { parseSolutionTypes, joinSolutionTypeLabels } from "../../shared/solutionTypes";

/**
 * Task updates, shared by PATCH /api/projects/:id/tasks/:taskId and the Claude
 * connector (src/server/mcp/tasks.ts). Everything a task change sets off lives
 * here (stage/project status sync, go-live date sync, assignee and PM emails,
 * the Zoom go-live announcement), so both callers behave identically.
 *
 * Throws HTTPException for 400/403/404, same as the route always has.
 */

// IEs (pf_engineer) staffed on a project can manage its tasks — create, assign,
// and complete — even without full project-edit rights. Scoped to projects they
// are actually staffed on (project_staff membership).
export async function isStaffedEngineer(db: D1Database, auth: { user: { id: string }; role: string }, projectId: string): Promise<boolean> {
  if (auth.role !== "pf_engineer") return false;
  const row = await db
    .prepare("SELECT 1 FROM project_staff WHERE project_id = ? AND user_id = ? LIMIT 1")
    .bind(projectId, auth.user.id)
    .first();
  return !!row;
}

export const TASK_SELECT = `
  SELECT id, project_id, stage_id, title, assignee_user_id, assignee_contact_id, due_date,
         completed_at, status, priority, is_go_live_event, notes, sort_order,
         scheduled_start, scheduled_end, pay_code_id, cost_code_id, crm_time_entry_id
  FROM tasks
`;

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  stage_id: z.string().nullable().optional(),
  assignee_user_id: z.string().max(255).nullable().optional(),
  /** Optional non-user contact tied to the task — currently used for the
   *  porting coordinator (project_contact with contact_role='Porting
   *  Coordinator'). Set by apply-template; cleared via PATCH. */
  assignee_contact_id: z.string().max(255).nullable().optional(),
  due_date: zPlanDateOrBlank.nullable().optional(),
  scheduled_start: zPlanDateOrBlank.nullable().optional(),
  scheduled_end: zPlanDateOrBlank.nullable().optional(),
  /** Manually-set completion date. When omitted on a status->completed transition,
   *  the server stamps CURRENT_TIMESTAMP; when provided, the explicit value wins. */
  completed_at: zPlanTimestamp.nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).nullable().optional(),
  status: z.enum(["not_started", "in_progress", "completed", "blocked"]).optional(),
  notes: z.string().max(10000).nullable().optional(),
  /** Tiebreaker among tasks in the same stage sharing a due_date — set via
   *  drag-and-drop on the Tasks tab (see the /reorder endpoint in routes/tasks.ts, which
   *  is what the drag handler actually calls). Meaningless (ignored by
   *  ORDER BY) across a date boundary. */
  sort_order: z.number().int().min(0).nullable().optional(),
});

export async function updateTask(
  env: Bindings,
  ctx: ExecutionContext,
  auth: AuthContext,
  projectId: string,
  taskId: string,
  rawBody: unknown
) {
  const db = env.DB;

  const existing = await db
    .prepare(`${TASK_SELECT} WHERE id = ? AND project_id = ? LIMIT 1`)
    .bind(taskId, projectId)
    .first<{ id: string; title: string; stage_id: string | null; assignee_user_id: string | null; assignee_contact_id: string | null; status: string | null; due_date: string | null; priority: string | null; is_go_live_event: number | null; completed_at: string | null }>();

  if (!existing) {
    throw new HTTPException(404, { message: "Task not found" });
  }

  // IEs staffed on the project may fully manage its tasks (assign + complete +
  // edit). A pf_engineer who isn't staffed but is the task's assignee keeps the
  // narrower "status only" ability (e.g. marking their own task done).
  const canEdit = await canEditProject(db, auth.user, projectId);
  const staffedEngineer = !canEdit && (await isStaffedEngineer(db, auth, projectId));
  const isEngineerOnOwnTask =
    !canEdit && !staffedEngineer && auth.role === "pf_engineer" && existing.assignee_user_id === auth.user.id;
  if (!canEdit && !staffedEngineer && !isEngineerOnOwnTask) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const parsed = updateTaskSchema.safeParse(rawBody);

  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid request body" });
  }

  // Engineers on own tasks may only change status
  if (isEngineerOnOwnTask && !canEdit) {
    const disallowed = Object.keys(parsed.data).filter(
      (k) => k !== "status" && parsed.data[k as keyof typeof parsed.data] !== undefined
    );
    if (disallowed.length > 0) {
      throw new HTTPException(403, { message: "Engineers may only update task status" });
    }
  }

  const updates = parsed.data;
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (!fields.length) {
    throw new HTTPException(400, { message: "No valid fields to update" });
  }

  // Auto-stamp completed_at on the status->completed transition only when the
  // caller didn't supply an explicit completed_at (which lets PMs backdate via
  // the date picker on the Tasks page). A status->anything-else transition still
  // clears completed_at unless the caller is explicitly setting it.
  if (updates.completed_at === undefined) {
    if (updates.status === "completed") {
      fields.push("completed_at = CURRENT_TIMESTAMP");
    } else if (updates.status !== undefined) {
      fields.push("completed_at = NULL");
    }
  }

  await db
    .prepare(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ? AND project_id = ?`)
    .bind(...values, taskId, projectId)
    .run();

  const updated = await db
    .prepare(`${TASK_SELECT} WHERE id = ? LIMIT 1`)
    .bind(taskId)
    .first<{ id: string; title: string; stage_id: string | null; assignee_user_id: string | null; assignee_contact_id: string | null; status: string | null; due_date: string | null; priority: string | null; is_go_live_event: number | null; completed_at: string | null }>();

  // Auto-derive stage status from the new task state. Sync both the old and
  // new stage when a task moved between stages.
  await syncStageStatus(db, existing.stage_id);
  if (updated && updated.stage_id !== existing.stage_id) {
    await syncStageStatus(db, updated.stage_id);
  }
  await maybeGraduateProject(db, projectId, auth.user.id);
  // If a go-live event task's due_date moves, the project's target_go_live_date
  // follows. Re-sync after any task update — cheap enough that we don't gate
  // on the specific fields that changed.
  await syncProjectGoLiveDate(db, projectId);

  const appUrl = env.APP_URL ?? "";
  const project = await db
    .prepare("SELECT name, customer_name, pm_user_id, vendor, solution_types, customer_id FROM projects WHERE id = ? LIMIT 1")
    .bind(projectId)
    .first<{ name: string; customer_name: string | null; pm_user_id: string | null; vendor: string | null; solution_types: string | null; customer_id: string | null }>();

  // Notify new assignee if assignee changed
  const assigneeChanged = updates.assignee_user_id !== undefined && updates.assignee_user_id !== existing.assignee_user_id;
  if (assigneeChanged && updated?.assignee_user_id) {
    const assignee = await db.prepare("SELECT email, name FROM users WHERE id = ? LIMIT 1").bind(updated.assignee_user_id).first<{ email: string; name: string }>();
    if (assignee && project) {
      ctx.waitUntil(maybeSendEmail(env, db, updated.assignee_user_id, "important", {
        to: assignee.email,
        subject: `You've been assigned: ${updated.title}`,
        html: taskAssigned({ assigneeName: assignee.name ?? assignee.email, taskTitle: updated.title, projectName: project.name, dueDate: updated.due_date, priority: updated.priority, appUrl, projectId }),
      }));
      ctx.waitUntil(createNotification(db, {
        recipientUserId: updated.assignee_user_id,
        type: "task_assigned",
        title: `You've been assigned: ${updated.title}`,
        body: project.name,
        entityType: "task",
        entityId: taskId,
        projectId,
        senderUserId: auth.user.id,
      }));
    }
  }

  // Notify a newly-assigned CONTACT (external / customer person). Contacts
  // aren't platform users, so there's no in-app feed or per-user email
  // preference — email them directly (recipientUserId null => always sends).
  // Without this, customer assignees got no task-assignment email at all.
  const contactChanged = updates.assignee_contact_id !== undefined && updates.assignee_contact_id !== existing.assignee_contact_id;
  if (contactChanged && updated?.assignee_contact_id && project) {
    const contact = await db
      .prepare("SELECT email, name FROM project_contacts WHERE id = ? LIMIT 1")
      .bind(updated.assignee_contact_id)
      .first<{ email: string | null; name: string | null }>();
    if (contact?.email) {
      ctx.waitUntil(maybeSendEmail(env, db, null, "important", {
        to: contact.email,
        subject: `You've been assigned: ${updated.title}`,
        html: taskAssigned({ assigneeName: contact.name ?? contact.email, taskTitle: updated.title, projectName: project.name, dueDate: updated.due_date, priority: updated.priority, appUrl, projectId }),
      }));
    }
  }

  // Notify PM of general task update (skip if PM made the change, skip if it's a blocked transition — handled separately below)
  const justBlocked = updates.status === "blocked" && existing.status !== "blocked";
  if (!justBlocked && project?.pm_user_id && project.pm_user_id !== auth.user.id && updated) {
    const pm = await db.prepare("SELECT email, name FROM users WHERE id = ? LIMIT 1").bind(project.pm_user_id).first<{ email: string; name: string }>();
    if (pm) {
      ctx.waitUntil(maybeSendEmail(env, db, project.pm_user_id, "routine", {
        to: pm.email,
        subject: `Task updated on ${project.name}: ${updated.title}`,
        html: pmTaskUpdate({ pmName: pm.name ?? pm.email, taskTitle: updated.title, projectName: project.name, updatedByName: auth.user.name ?? auth.user.email, status: updated.status, appUrl, projectId }),
      }));
    }
  }

  // Sync project.status whenever task status changes — picks up
  // blocked / in_progress / completed transitions from the stages we
  // just resynced above plus any blocked tasks / open risks.
  if (updates.status !== undefined) {
    await syncProjectStatus(db, projectId);
  }

  // Notify PM if task just became blocked
  if (justBlocked && project?.pm_user_id) {
    const pm = await db.prepare("SELECT email, name FROM users WHERE id = ? LIMIT 1").bind(project.pm_user_id).first<{ email: string; name: string }>();
    let assigneeName: string | null = null;
    if (updated?.assignee_user_id) {
      const a = await db.prepare("SELECT name FROM users WHERE id = ? LIMIT 1").bind(updated.assignee_user_id).first<{ name: string }>();
      assigneeName = a?.name ?? null;
    }
    if (pm && project) {
      ctx.waitUntil(maybeSendEmail(env, db, project.pm_user_id, "important", {
        to: pm.email,
        subject: `Task blocked: ${updated?.title ?? ""}`,
        html: taskBlocked({ pmName: pm.name ?? pm.email, taskTitle: updated?.title ?? "", projectName: project.name, assigneeName, appUrl, projectId }),
      }));
      if (project.pm_user_id !== auth.user.id) {
        ctx.waitUntil(createNotification(db, {
          recipientUserId: project.pm_user_id,
          type: "task_blocked",
          title: `Task blocked: ${updated?.title ?? ""}`,
          body: `${assigneeName ? `Assigned to ${assigneeName} · ` : ""}${project.name}`,
          entityType: "task",
          entityId: taskId,
          projectId,
          senderUserId: auth.user.id,
        }));
      }
    }
  }

  // Announce to the Zoom "Complete Go-Lives" channel the moment the project's
  // canonical go-live task is marked completed — not on any other field
  // change to it, and not on a non-go-live task completing.
  const justWentLive = updates.status === "completed" && existing.status !== "completed" && existing.is_go_live_event === 1;
  if (justWentLive && env.ZOOM_GOLIVE_WEBHOOK_URL && project) {
    const accountTeam = project.customer_id
      ? await db
          .prepare(
            `SELECT ae.name AS ae_name, sa.name AS sa_name, csm.name AS csm_name
             FROM customers c
             LEFT JOIN users ae ON ae.id = c.pf_ae_user_id
             LEFT JOIN users sa ON sa.id = c.pf_sa_user_id
             LEFT JOIN users csm ON csm.id = c.pf_csm_user_id
             WHERE c.id = ? LIMIT 1`
          )
          .bind(project.customer_id)
          .first<{ ae_name: string | null; sa_name: string | null; csm_name: string | null }>()
      : null;
    const pm = project.pm_user_id
      ? await db.prepare("SELECT name, email FROM users WHERE id = ? LIMIT 1").bind(project.pm_user_id).first<{ name: string; email: string }>()
      : null;
    // Implementation Engineers staffed on the project — 'engineer' is the
    // legacy staff_role value, 'ie' the current one (see ASSIGNEE_ROLE_LABEL
    // on the client, which maps both to "IE"). A project can have several.
    const ieStaff = await db
      .prepare(
        `SELECT u.name, u.email FROM project_staff ps
         JOIN users u ON u.id = ps.user_id
         WHERE ps.project_id = ? AND ps.staff_role IN ('ie', 'engineer')
         ORDER BY u.name`
      )
      .bind(projectId)
      .all<{ name: string | null; email: string }>();

    const accountTeamParts = [
      accountTeam?.ae_name ? `${accountTeam.ae_name} (AE)` : null,
      accountTeam?.sa_name ? `${accountTeam.sa_name} (SA)` : null,
      accountTeam?.csm_name ? `${accountTeam.csm_name} (CSM)` : null,
    ].filter((v): v is string => !!v);
    const projectTeamParts = [
      pm ? `${pm.name ?? pm.email} (PM)` : null,
      ...(ieStaff.results ?? []).map((ie) => `${ie.name ?? ie.email} (IE)`),
    ].filter((v): v is string => !!v);

    // "Phase N of M" — N/M count EVERY go-live-flagged task on the project
    // (technology go-lives and per-location go-lives alike, since both use
    // the same is_go_live_event flag), tracking overall rollout progress
    // regardless of what's driving the count on a given project. Omitted
    // entirely (not just blank) when there's only one — nothing to count.
    const goLiveCounts = await db
      .prepare(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
         FROM tasks WHERE project_id = ? AND is_go_live_event = 1`
      )
      .bind(projectId)
      .first<{ total: number; completed: number }>();
    const phaseSuffix = goLiveCounts && goLiveCounts.total > 1
      ? ` · Phase ${goLiveCounts.completed} of ${goLiveCounts.total}`
      : "";

    // Location suffix — only on genuinely multi-location projects. Rank is
    // computed rather than trusting display_order to be gap-free.
    let locationSuffix = "";
    if (existing.stage_id) {
      const phaseCount = await db.prepare("SELECT COUNT(*) AS n FROM phases WHERE project_id = ?").bind(projectId).first<{ n: number }>();
      if (phaseCount && phaseCount.n > 1) {
        const stagePhase = await db
          .prepare("SELECT phase_id FROM stages WHERE id = ? LIMIT 1")
          .bind(existing.stage_id)
          .first<{ phase_id: string | null }>();
        if (stagePhase?.phase_id) {
          const phase = await db
            .prepare(
              `SELECT name, display_order,
                      (SELECT COUNT(*) FROM phases WHERE project_id = ? AND display_order < p.display_order) + 1 AS rank
               FROM phases p WHERE id = ? LIMIT 1`
            )
            .bind(projectId, stagePhase.phase_id)
            .first<{ name: string; display_order: number; rank: number }>();
          if (phase) {
            locationSuffix = ` · Location: ${phase.name} (Campus ${phase.rank} of ${phaseCount.n})`;
          }
        }
      }
    }

    // M-D-YYYY, no leading zeros (e.g. "9-24-2026") — the whole "Go-Live
    // Date: ..." line is built here, phase/location suffixes folded in only
    // when meaningful, so a simple single-tech single-location project (the
    // common case) gets a plain, un-suffixed line rather than an empty
    // Phase/Location line left dangling — Zoom's workflow template can't
    // conditionally hide a line, only substitute a variable's value.
    const [goLiveYear, goLiveMonth, goLiveDay] = (updated?.completed_at ?? new Date().toISOString()).slice(0, 10).split("-");
    const goLiveDateLine = `Go-Live Date: ${Number(goLiveMonth)}-${Number(goLiveDay)}-${goLiveYear}${phaseSuffix}${locationSuffix}`;

    ctx.waitUntil(
      notifyGoLive(env.ZOOM_GOLIVE_WEBHOOK_URL, {
        customerName: project.customer_name ?? project.name,
        providerName: project.vendor ?? "—",
        technologyImplemented: joinSolutionTypeLabels(parseSolutionTypes(project.solution_types), " / ") || "—",
        goLiveDateLine,
        accountTeam: accountTeamParts.length ? accountTeamParts.join(" · ") : "—",
        projectTeam: projectTeamParts.length ? projectTeamParts.join(" · ") : "—",
      }).catch((err) => console.warn(`[tasks.patch] Go-live Zoom notification failed for project ${projectId}:`, err instanceof Error ? err.message : err))
    );
  }

  return updated;
}
