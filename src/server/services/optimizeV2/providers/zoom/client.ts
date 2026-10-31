// Zoom Server-to-Server OAuth client (read-only). Ported from the standalone
// Zoom Optimization agent. Each customer creates an S2S app in their own tenant
// and gives us its account id, client id and secret; nothing here writes to Zoom.

const OAUTH_URL = "https://zoom.us/oauth/token";
const API_BASE = "https://api.zoom.us/v2";

export type ZoomCredentials = { accountId: string; clientId: string; clientSecret: string };

export class ZoomError extends Error {
  status: number;
  code: string | number | undefined;
  path: string;
  constructor(message: string, status: number, code: string | number | undefined, path: string) {
    super(message);
    this.name = "ZoomError";
    this.status = status;
    this.code = code;
    this.path = path;
  }
}

export type ZoomToken = { accessToken: string; scopes: string[]; apiUrl: string; expiresIn: number };

export async function getToken({ accountId, clientId, clientSecret }: ZoomCredentials): Promise<ZoomToken> {
  const basic = btoa(`${clientId}:${clientSecret}`);
  const body = new URLSearchParams({ grant_type: "account_credentials", account_id: accountId });
  const res = await fetch(`${OAUTH_URL}?${body.toString()}`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
  });
  const json = await res.json().catch(() => ({})) as Record<string, string | number | undefined>;
  if (!res.ok) {
    throw new ZoomError(String(json.reason || json.error || "OAuth token request failed"), res.status, json.error, "oauth/token");
  }
  return {
    accessToken: String(json.access_token),
    scopes: String(json.scope || "").split(/\s+/).filter(Boolean),
    apiUrl: apiBaseFrom(json.api_url),
    expiresIn: Number(json.expires_in),
  };
}

/** Zoom returns the tenant's API host without the version (e.g. "https://api.zoom.us");
 *  the client's base needs the "/v2" path. */
export function apiBaseFrom(apiUrl: unknown): string {
  if (!apiUrl) return API_BASE;
  const host = String(apiUrl).replace(/\/+$/, "");
  return /\/v2$/.test(host) ? host : `${host}/v2`;
}

type Query = Record<string, string | number | boolean | null | undefined>;
// Zoom responses are loosely shaped JSON; collectors pick fields defensively.
export type ZoomJson = Record<string, unknown>;

export type ZoomClient = {
  get(path: string, query?: Query): Promise<ZoomJson>;
  paginate(path: string, query: Query, opts: { itemsKey: string; maxPages?: number; pageSize?: number }):
    Promise<{ items: ZoomJson[]; truncated: boolean; pages: number }>;
  remaining(): number;
  usage(): number;
};

/** Every call (including retries) counts against `budget`: Workers cap
 *  subrequests per invocation, and a full sweep is sized to fit inside it. */
export function makeClient(token: string, { base = API_BASE, budget = 45 } = {}): ZoomClient {
  let used = 0;
  const remaining = () => budget - used;

  async function get(path: string, query: Query = {}): Promise<ZoomJson> {
    if (used >= budget) throw new ZoomError("Subrequest budget exhausted", 0, "budget", path);
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }

    // Up to 3 attempts with backoff on 429 / transient 5xx.
    for (let attempt = 0; attempt < 3; attempt++) {
      used++;
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("Retry-After")) || attempt + 1;
        if (attempt < 2 && remaining() > 0) {
          await sleep(Math.min(retryAfter, 3) * 1000);
          continue;
        }
      }
      const json = await res.json().catch(() => ({})) as ZoomJson;
      if (!res.ok) {
        throw new ZoomError(String(json.message || `HTTP ${res.status}`), res.status, json.code as string | number | undefined, path);
      }
      return json;
    }
    throw new ZoomError("Exhausted retries", 429, "retry", path);
  }

  // Follow next_page_token, bounded by maxPages and the shared budget.
  async function paginate(path: string, query: Query, { itemsKey, maxPages = 5, pageSize = 300 }: { itemsKey: string; maxPages?: number; pageSize?: number }) {
    const items: ZoomJson[] = [];
    let next: string | undefined;
    let pages = 0;
    do {
      if (remaining() <= 1) break;
      const page = await get(path, { ...query, page_size: pageSize, next_page_token: next });
      const chunk = page[itemsKey];
      if (Array.isArray(chunk)) items.push(...(chunk as ZoomJson[]));
      next = (page.next_page_token as string) || "";
      pages++;
    } while (next && pages < maxPages);
    return { items, truncated: Boolean(next), pages };
  }

  return { get, paginate, remaining, usage: () => used };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
