import { MODEL_VERSION } from "../../../../shared/roiModel/model";
import type { RoiInputs } from "../../../../shared/roiModel/types";
import { request } from "../../../lib/api";

/** Shared saved scenario as listed (no inputs). See src/server/routes/roiScenarios.ts. */
export type RoiScenarioSummary = {
  id: string;
  owner_user_id: string | null;
  owner_name: string | null;
  name: string;
  client_name: string;
  model_version: string;
  created_at: string;
  updated_at: string;
  /** Owner or admin: may update and delete. */
  can_edit: boolean;
};

export type RoiScenario = RoiScenarioSummary & { inputs: RoiInputs };

const BASE = "/sales-tools/roi/scenarios";
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const roiScenarios = {
  list: () => request<{ model_version: string; scenarios: RoiScenarioSummary[] }>(BASE),
  get: (id: string) => request<RoiScenario>(`${BASE}/${encodeURIComponent(id)}`),
  create: (name: string, inputs: RoiInputs) =>
    request<RoiScenario>(BASE, json("POST", { name, inputs, model_version: MODEL_VERSION })),
  update: (id: string, name: string, inputs: RoiInputs, updatedAt: string) =>
    request<RoiScenario>(
      `${BASE}/${encodeURIComponent(id)}`,
      json("PUT", { name, inputs, model_version: MODEL_VERSION, updated_at: updatedAt }),
    ),
  remove: (id: string) => request<{ ok: true }>(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  duplicate: (id: string, name?: string) =>
    request<RoiScenario>(`${BASE}/${encodeURIComponent(id)}/duplicate`, json("POST", name ? { name } : {})),
};
