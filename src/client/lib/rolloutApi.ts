import { request } from "./api";

/** Zoom Retail Rollout calls. `path` is relative to /api (e.g. "/rollout/orders"). */
export function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  return request<T>(path, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}
