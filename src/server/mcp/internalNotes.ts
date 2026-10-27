import type { AuthContext, Bindings } from "../types";
import { canLogTimeOnProject } from "../services/accessService";
import { appendCaseInternalNote, getCaseAndJob } from "../services/dynamicsService";
import { writeAuditLog } from "../lib/auditLog";
import { utcToPacific } from "../lib/pacificTime";
import { type ToolFailure } from "./timeWrites";

/**
 * Project Internal Notes: a PM progress/status log. CloudConnect is the
 * record — the row in `project_internal_notes` is the note, never a reparse
 * of CE — and a stamped copy is pushed to the linked case's Internal Notes
 * FIELD (incident.new_internalnotes) for leadership reading CE directly.
 * That push is best-effort and happens after the local insert, so a CE
 * outage or an unlinked case never loses the note, e.g.:
 *
 *   [2026-10-10 14:32 PT] Ryan Dyla: Customer confirmed go-live date.
 *
 * Not a "case note" — at Packet Fusion that means the separate note records
 * on the case Timeline (annotations), which this never creates; the naming
 * keeps the two apart for people and the model.
 */

const fail = (error: string, extra: Record<string, unknown> = {}): ToolFailure => ({ error, ...extra });

export type InternalNoteEntry = {
  id: string;
  timestamp_pacific: string;
  author: string;
  text: string;
  ce_pushed: boolean;
  ce_push_error: string | null;
};

type NoteRow = {
  id: string;
  author_name: string;
  text: string;
  created_at: string;
  ce_pushed_at: string | null;
  ce_push_error: string | null;
};

function toEntry(row: NoteRow): InternalNoteEntry {
  const stamp = utcToPacific(row.created_at);
  return {
    id: row.id,
    timestamp_pacific: `${stamp.date} ${stamp.time} PT`,
    author: row.author_name,
    text: row.text,
    ce_pushed: !!row.ce_pushed_at,
    ce_push_error: row.ce_pushed_at ? null : row.ce_push_error,
  };
}

/** A project's Internal Notes, newest first — read straight from CloudConnect, never from CE. */
export async function getProjectInternalNotes(db: D1Database, projectId: string): Promise<{ entries: InternalNoteEntry[] }> {
  const rows = (await db
    .prepare(
      `SELECT id, author_name, text, created_at, ce_pushed_at, ce_push_error
         FROM project_internal_notes WHERE project_id = ? ORDER BY created_at DESC`
    )
    .bind(projectId)
    .all<NoteRow>()).results ?? [];
  return { entries: rows.map(toEntry) };
}

type ProjectForNote = { id: string; name: string; crm_case_id: string | null; crm_ticket_number: string | null };

export async function addInternalNoteForUser(
  env: Bindings, ctx: ExecutionContext, auth: AuthContext,
  project: ProjectForNote, note: string, allowDuplicate: boolean
) {
  const db = env.DB;
  const user = auth.user;
  // Same people who can log time on the project: its editors, plus PMs and IEs.
  if (!(await canLogTimeOnProject(db, user, project.id))) return fail("You can't add notes on this project.");

  const text = note.trim().replace(/\r\n/g, "\n");
  if (!text) return fail("The note is empty.");
  const author = user.name ?? user.email;

  // Matched on this user's exact text, regardless of when — not a CE round
  // trip, since the note lives here now.
  if (!allowDuplicate) {
    const dup = await db
      .prepare(
        `SELECT id FROM project_internal_notes WHERE project_id = ? AND author_id = ? AND text = ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .bind(project.id, user.id, text)
      .first<{ id: string }>();
    if (dup) {
      return {
        status: "duplicate",
        message: "This exact note from you is already on this project, so it wasn't added again. Set allow_duplicate to add it anyway.",
        project: project.name,
      };
    }
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO project_internal_notes (id, project_id, author_id, author_name, text, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, project.id, user.id, author, text, now)
    .run();

  ctx.waitUntil(writeAuditLog(db, {
    entityType: "project",
    entityId: project.id,
    action: "internal_note_add",
    method: "MCP",
    path: "/mcp",
    status: 200,
    actor: { id: user.id, name: user.name, email: user.email },
  }));

  // The note is already saved; everything below is a best-effort mirror to CE.
  let cePush: { succeeded: boolean; error?: string; ce_case_id?: string };
  if (!project.crm_case_id) {
    cePush = { succeeded: false, error: "This project has no linked CE case, so the note wasn't pushed." };
    await db.prepare("UPDATE project_internal_notes SET ce_push_error = ? WHERE id = ?").bind(cePush.error, id).run();
  } else {
    const stamp = utcToPacific(now);
    const entry = `[${stamp.date} ${stamp.time} PT] ${author}: ${text}`;
    try {
      const found = await getCaseAndJob(env, project.crm_case_id);
      if (!found) throw new Error("Couldn't find the project's case in CE.");
      await appendCaseInternalNote(env, found.caseId, entry);
      await db
        .prepare("UPDATE project_internal_notes SET ce_pushed_at = ?, ce_push_error = NULL WHERE id = ?")
        .bind(new Date().toISOString(), id)
        .run();
      cePush = { succeeded: true, ce_case_id: found.caseId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.prepare("UPDATE project_internal_notes SET ce_push_error = ? WHERE id = ?").bind(message, id).run();
      cePush = { succeeded: false, error: message };
    }
  }

  const pushedAt = cePush.succeeded ? new Date().toISOString() : null;
  return {
    status: "added",
    added_at: now,
    note: toEntry({ id, author_name: author, text, created_at: now, ce_pushed_at: pushedAt, ce_push_error: cePush.succeeded ? null : cePush.error ?? null }),
    ce_push: cePush,
    project: project.name,
    ce_case_number: project.crm_ticket_number,
  };
}
