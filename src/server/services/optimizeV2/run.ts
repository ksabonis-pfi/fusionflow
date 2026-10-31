// Runs an assessment for one connection on whichever platform it targets and
// returns the stored-result shape. Shared by the "run now" route and, from
// phase 5, the monthly schedule.
import type { Bindings } from "../../types";
import { runRingCentralAssessment, RcCredentialError } from "./providers/ringcentral/assess";
import { toFindings, toScorecard } from "./providers/ringcentral/normalize";
import { runZoomAssessment } from "./providers/zoom/assess";
import { ZoomError } from "./providers/zoom/client";
import { readCredentials, toView, type ConnectionRow, type StoredResult } from "./store";

/** Credential problems the user can fix (vs. platform/API failures). */
export class RunInputError extends Error {}

export async function runConnection(env: Bindings, conn: ConnectionRow): Promise<StoredResult> {
  if (!conn.creds_enc) throw new RunInputError("Add credentials before running an assessment");
  const view = toView(conn);
  const { __audit: auditOverrides, ...kpiInputs } = view.inputs;

  if (conn.platform === "zoom") {
    const creds = await readCredentials<"zoom">(env, conn);
    try {
      const r = await runZoomAssessment({
        ...creds,
        windowDays: conn.window_days,
        assumptions: view.assumptions,
        inputs: { ...kpiInputs, ...(auditOverrides ? { __audit: auditOverrides } : {}) },
      });
      return { platform: "zoom", ...r };
    } catch (err) {
      if (err instanceof ZoomError && (err.status === 400 || err.status === 401)) throw new RunInputError(`Zoom: ${err.message}`);
      throw err;
    }
  }

  const creds = await readCredentials<"ringcentral">(env, conn);
  try {
    const snap = await runRingCentralAssessment({
      ...creds,
      windowDays: conn.window_days,
      timezone: conn.timezone,
      overrides: kpiInputs,
    });
    const scorecard = toScorecard(snap);
    return {
      platform: "ringcentral",
      meta: {
        generatedAt: snap.meta.generated_at,
        accountId: String(snap.meta.account_id ?? creds.rcAccountId ?? "~"),
        window: { from: snap.meta.window.from.slice(0, 10), to: snap.meta.window.to.slice(0, 10) },
        grantedScopes: snap.meta.scope_granted,
        subrequestsUsed: snap.meta.subrequests_used,
        generator: "PacketFusion CloudConnect — Optimizations (RingCentral)",
      },
      scorecard,
      findings: toFindings(snap, scorecard),
      warnings: snap.warnings,
      // The engine's native result, kept for the RingCentral reports (phase 4).
      native: snap,
    };
  } catch (err) {
    if (err instanceof RcCredentialError) throw new RunInputError(err.message);
    throw err;
  }
}
