// Ported verbatim from the standalone RingCentral Optimization agent (rc.js, v0.3.x).
// Kept as JavaScript, close to the validated original. Changes: config import
// paths (the JSON now lives in ./config), and deliberate fixes from review —
// a public charge() so callers that bypass fetch() still count against the budget.

// RingCentral platform client for the Worker runtime.
//
// Mirrors shared/ts/rcAuth.ts but with no Node APIs and no filesystem cache —
// tokens are cached per-request in a plain Map keyed by customer.
//
// READ-ONLY: this client refuses any non-GET request other than the small
// allow-list of RingCentral read endpoints that happen to use POST
// (Analytics fetch). An assessment never mutates a customer tenant.

const HOSTS = {
  sandbox: "https://platform.devtest.ringcentral.com",
  production: "https://platform.ringcentral.com",
};

/** POST endpoints that are semantically reads. Anything else is refused. */
const POST_READ_ALLOWLIST = [
  /^\/analytics\/calls\/v1\/accounts\/[^/]+\/aggregation\/fetch/,
  /^\/analytics\/calls\/v1\/accounts\/[^/]+\/timeline\/fetch/,
];

export function serverUrl(rcEnv) {
  return HOSTS[rcEnv] || HOSTS.production;
}

export class RcClient {
  /** @param {{clientId:string, clientSecret:string, jwt:string, rcEnv:string, accountId:string, budget?:number}} cfg */
  constructor(cfg) {
    this.cfg = cfg;
    this.server = serverUrl(cfg.rcEnv);
    this.token = null;
    this.tokenExpiresAt = 0;
    this.budget = cfg.budget ?? 48;   // Workers cap subrequests; spend them deliberately
    this.spent = 0;
  }

  get remaining() {
    return this.budget - this.spent;
  }

  /** Count a request made outside fetch() (RingCX uses its own host and token)
   *  against the budget. Throws once the budget is spent. */
  charge(n = 1) {
    this.#spend(n);
  }

  #spend(n = 1) {
    if (this.spent + n > this.budget) {
      throw new Error(`Subrequest budget exhausted (${this.budget}). Narrow the collection or raise SUBREQUEST_BUDGET.`);
    }
    this.spent += n;
  }

  async getToken(force = false) {
    if (!force && this.token && this.tokenExpiresAt - 120_000 > Date.now()) return this.token;

    const basic = btoa(`${this.cfg.clientId}:${this.cfg.clientSecret}`);
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: this.cfg.jwt,
    });

    for (let attempt = 0; ; attempt++) {
      this.#spend();
      const res = await fetch(`${this.server}/restapi/oauth/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body,
      });

      if (res.ok) {
        const d = await res.json();
        this.token = d.access_token;
        this.tokenExpiresAt = Date.now() + d.expires_in * 1000;
        this.scope = d.scope || "";
        this.ownerId = d.owner_id;
        return this.token;
      }

      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        const ra = Number(res.headers.get("Retry-After"));
        await new Promise((r) => setTimeout(r, Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2 ** attempt * 1000));
        continue;
      }

      const text = await res.text();
      const hint = res.status === 400 || res.status === 401
        ? ` Check that the stored JWT matches rc_env=${this.cfg.rcEnv} and the client id/secret.`
        : "";
      throw new Error(`RingCentral token exchange failed (${res.status}).${hint} ${text.slice(0, 400)}`);
    }
  }

  async fetch(path, init = {}) {
    const method = (init.method || "GET").toUpperCase();
    if (method !== "GET") {
      const allowed = method === "POST" && POST_READ_ALLOWLIST.some((re) => re.test(path));
      if (!allowed) {
        throw new Error(`Refusing ${method} ${path} — the optimization agent is read-only.`);
      }
    }

    for (let attempt = 0; ; attempt++) {
      const token = await this.getToken(attempt > 0 && this.lastStatus === 401);
      this.#spend();
      const res = await fetch(path.startsWith("http") ? path : `${this.server}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.headers || {}),
        },
      });
      this.lastStatus = res.status;

      if (res.status === 401 && attempt === 0) continue;
      if ((res.status === 429 || res.status >= 500) && attempt < 2) {
        const ra = Number(res.headers.get("Retry-After"));
        await new Promise((r) => setTimeout(r, Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2 ** attempt * 1000));
        continue;
      }
      return res;
    }
  }

  async json(path, init = {}) {
    const res = await this.fetch(path, init);
    if (!res.ok) {
      const body = await res.text();
      const e = new Error(`RingCentral ${res.status} on ${path}: ${body.slice(0, 500)}`);
      e.status = res.status;
      e.path = path;
      throw e;
    }
    return res.status === 204 ? null : res.json();
  }

  post(path, body) {
    return this.json(path, { method: "POST", body: JSON.stringify(body) });
  }

  /** Collect a paginated collection, bounded by the subrequest budget. */
  async collect(path, maxPages = 5) {
    const out = [];
    let next = path;
    for (let i = 0; next && i < maxPages && this.remaining > 2; i++) {
      const data = await this.json(next);
      out.push(...(data.records || []));
      next = data.navigation?.nextPage?.uri || null;
    }
    return out;
  }
}
