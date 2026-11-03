// Vendor adapter for the Zoom Retail Rollout module. Each system's base URL
// comes from an optional wrangler var (ROLLOUT_SCANSOURCE_API_BASE etc.):
//   unset or "mock" → answered in-process by ./mock (no network)
//   a URL   → real HTTP call (auth headers still TODO per vendor)
// Every call is written to the order's event log with request + response so
// the ops console can show exactly what was sent where.

import mock from "./mock";
import type { Bindings } from "../types";
import { logEvent } from "./db";

export type System = "scansource" | "zoom" | "carrier";

const BASE_VAR: Record<System, string> = {
  scansource: "ROLLOUT_SCANSOURCE_API_BASE",
  zoom: "ROLLOUT_ZOOM_API_BASE",
  carrier: "ROLLOUT_CARRIER_API_BASE",
};

// Not declared on Bindings: these are demo-only knobs that default to the mocks.
export const rolloutVar = (env: Bindings, name: string) => (env as unknown as Record<string, string | undefined>)[name];

export async function callVendor<T>(
  env: Bindings,
  orderId: string,
  system: System,
  method: "GET" | "POST",
  path: string,
  title: string,
  body?: unknown,
): Promise<T> {
  const base = rolloutVar(env, BASE_VAR[system]) ?? "mock";
  const init: RequestInit = {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
  const res = base === "mock" ? await mock.request(`/${system}${path}`, init) : await fetch(base + path, init);
  const text = await res.text();
  await logEvent(env, orderId, {
    kind: "integration",
    system,
    title,
    detail: `${method} ${path} → ${res.status}${base === "mock" ? " (mock)" : ""}`,
    request_json: body === undefined ? null : JSON.stringify(body, null, 2),
    response_json: text,
  });
  if (!res.ok) throw new Error(`${system} ${method} ${path} failed: ${res.status}`);
  return JSON.parse(text) as T;
}
