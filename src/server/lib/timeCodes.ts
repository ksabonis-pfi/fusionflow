import { HTTPException } from "hono/http-exception";
import type { Bindings } from "../types";
import {
  findSystemUserIdByEmail, getPayCodes, getPayCodesForSystemUser,
  type DynamicsCostCode, type DynamicsPayCode,
} from "../services/dynamicsService";

/**
 * Which pay and cost codes a person logs time with. Shared by the project
 * time-entry form, My Time, and the Claude connector so all three agree —
 * and so nobody is ever handed the org-wide pay code list to pick from.
 */

// ── Pay codes ───────────────────────────────────────────────────────────────

export type UserPayCodes = {
  /** The codes this person may log with — never the org-wide list. */
  codes: DynamicsPayCode[];
  /** Pre-selected code, or null when they have several and none is marked default. */
  defaultId: string | null;
};

/**
 * Pay codes are per employee and live on their CE user record (the "Pay
 * Codes" panel). The CloudConnect default (Admin → Users) picks between
 * several, and stands in for anyone with none assigned in CE — but only once
 * CE has actually answered: a CRM failure throws rather than fall back.
 */
export async function getUserPayCodes(env: Bindings, user: { id: string; email: string }): Promise<UserPayCodes> {
  const [systemUserId, row] = await Promise.all([
    findSystemUserIdByEmail(env, user.email),
    env.DB.prepare("SELECT default_pay_code_id FROM users WHERE id = ?").bind(user.id).first<{ default_pay_code_id: string | null }>(),
  ]);
  const ccDefault = row?.default_pay_code_id ?? null;

  const assigned = systemUserId ? await getPayCodesForSystemUser(env, systemUserId) : [];
  if (assigned.length > 0) {
    const defaultId = assigned.length === 1
      ? assigned[0].amc_paycodeid
      : assigned.find((p) => p.amc_paycodeid === ccDefault)?.amc_paycodeid ?? null;
    return { codes: assigned, defaultId };
  }

  if (ccDefault) {
    const code = (await getPayCodes(env)).find((p) => p.amc_paycodeid === ccDefault);
    if (code) return { codes: [code], defaultId: code.amc_paycodeid };
  }
  return { codes: [], defaultId: null };
}

/** Reject a pay code that isn't one of this person's — payroll trusts what CE gets. */
export async function assertUserPayCode(env: Bindings, user: { id: string; email: string }, payCodeId: string): Promise<void> {
  let codes: DynamicsPayCode[];
  try {
    ({ codes } = await getUserPayCodes(env, user));
  } catch (err) {
    console.error("[timeCodes] pay code lookup failed:", err instanceof Error ? err.message : err);
    throw new HTTPException(503, { message: "Couldn't confirm your pay code with CE — nothing was logged. Try again in a minute." });
  }
  if (codes.length === 0) {
    throw new HTTPException(400, { message: "No pay code is assigned to you in CE. Ask an admin to add one to your CE user record." });
  }
  if (!codes.some((p) => p.amc_paycodeid === payCodeId)) {
    throw new HTTPException(400, { message: "That pay code isn't assigned to you." });
  }
}

// ── Cost codes ──────────────────────────────────────────────────────────────

/**
 * Cost codes are per job — every job carries its own copy, named like
 * "Labor-Direc-Proj -Mgmnt-1" — so a work type is matched on the name, with
 * spacing and punctuation ignored.
 */
export const WORK_TYPES = {
  project_management: "projmgmnt",
  software_config: "softwconfg",
  go_live: "golive",
  service_support: "srvcespprt",
} as const;
export type WorkType = keyof typeof WORK_TYPES;
export const DEFAULT_WORK_TYPE: WorkType = "project_management";

export const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function costCodeForWorkType(codes: DynamicsCostCode[], wt: WorkType): DynamicsCostCode | undefined {
  return codes.find((c) => squash(c.amc_name).includes(WORK_TYPES[wt]));
}

/**
 * The cost code to pre-select: whatever this person last logged on this
 * project (if the job still has it), else the job's project-management code.
 */
export async function defaultCostCode(
  env: Bindings, codes: DynamicsCostCode[], userId: string, projectId: string
): Promise<DynamicsCostCode | undefined> {
  if (codes.length === 0) return undefined;
  const last = await env.DB
    .prepare(
      `SELECT cost_code_id FROM (
         SELECT cost_code_id, created_at FROM project_time_entries WHERE project_id = ?1 AND user_id = ?2
         UNION ALL SELECT cost_code_id, created_at FROM stage_time_entries WHERE project_id = ?1 AND user_id = ?2
         UNION ALL SELECT cost_code_id, created_at FROM task_time_entries WHERE project_id = ?1 AND user_id = ?2
       ) WHERE cost_code_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`
    )
    .bind(projectId, userId)
    .first<{ cost_code_id: string }>();
  return (last && codes.find((c) => c.amc_costcodeid === last.cost_code_id))
    ?? costCodeForWorkType(codes, DEFAULT_WORK_TYPE);
}
