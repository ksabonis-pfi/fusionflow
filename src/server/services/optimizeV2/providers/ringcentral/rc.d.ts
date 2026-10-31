export function serverUrl(rcEnv: string): string;

export class RcClient {
  constructor(cfg: { clientId: string; clientSecret: string; jwt: string; rcEnv: string; accountId: string; budget?: number });
  readonly remaining: number;
  spent: number;
  /** Space/comma-separated scopes granted with the token (set by getToken). */
  scope?: string;
  getToken(force?: boolean): Promise<string>;
}
