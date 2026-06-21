/**
 * PURE, unit-testable OAuth 2.0 helper logic for the YouTube Desktop-app loopback flow (#1069).
 *
 * This module has NO server, NO Keychain, NO process side-effects — only two pure functions over an
 * injected transport so the whole flow is testable with zero network:
 *   - buildAuthUrl(...)            → the Google consent URL (scope youtube.upload, access_type=offline,
 *                                    prompt=consent, a 127.0.0.1 loopback redirect_uri)
 *   - exchangeCodeForTokens(...)   → POST oauth2.googleapis.com/token (grant_type=authorization_code)
 *                                    → { refresh_token, access_token, ... }
 *
 * The operator-run wrapper that binds the loopback port, opens the browser, and stores the refresh
 * token into the Keychain lives in tools/youtube-auth.ts (it imports these two functions). Keeping the
 * URL-building + token-exchange logic here (pure, injected fetch) is what makes #1069's behaviour
 * verifiable in CI without a browser, a port bind, or a real credential.
 *
 * NEVER logs or returns a secret in an error message. The token-exchange POST body (which carries the
 * client secret + auth code) is form-urlencoded and is never logged.
 */

import type { FetchLike } from "./youtube";

/** Google's OAuth 2.0 endpoints. */
export const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
/** The single scope the upload path needs (`videos.insert`). */
export const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";

/** The loopback redirect URI for a Desktop-app client bound to an ephemeral 127.0.0.1 port. */
export function loopbackRedirectUri(port: number): string {
  return `http://127.0.0.1:${port}`;
}

export interface BuildAuthUrlArgs {
  clientId: string;
  /** The loopback redirect (default derived from `port`). */
  redirectUri?: string;
  /** The ephemeral loopback port (used only if `redirectUri` is not given). */
  port?: number;
  /** Override the scope (defaults to youtube.upload). */
  scope?: string;
  /** Optional CSRF `state` value echoed back on the redirect. */
  state?: string;
}

/**
 * Build the Google consent URL. `access_type=offline` + `prompt=consent` GUARANTEE a refresh token is
 * returned (Google only mints one on first consent OR when `prompt=consent` forces re-consent). The
 * `redirect_uri` is a 127.0.0.1 loopback (Desktop clients accept any loopback port — no pre-registration).
 */
export function buildAuthUrl(args: BuildAuthUrlArgs): string {
  if (!args.clientId || !args.clientId.trim()) {
    throw new Error("buildAuthUrl: clientId is required");
  }
  const redirectUri = args.redirectUri ?? loopbackRedirectUri(requirePort(args.port));
  const params = new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: args.scope ?? YOUTUBE_UPLOAD_SCOPE,
    access_type: "offline",
    prompt: "consent",
  });
  if (args.state) params.set("state", args.state);
  return `${GOOGLE_AUTH_BASE}?${params.toString()}`;
}

function requirePort(port?: number): number {
  if (!port || !Number.isInteger(port) || port <= 0) {
    throw new Error("buildAuthUrl: a positive integer `port` (or an explicit `redirectUri`) is required");
  }
  return port;
}

export interface ExchangeCodeArgs {
  /** The `?code=` value captured on the loopback redirect. */
  code: string;
  /** The OAuth client credentials (refreshToken is NOT needed for this exchange). */
  creds: { clientId: string; clientSecret: string };
  /** Must byte-match the redirect_uri used in buildAuthUrl. */
  redirectUri: string;
  /** Injected transport (tests pass a mock). Defaults to the global fetch. */
  fetchImpl?: FetchLike;
  /** Per-request timeout. Default 60s. */
  timeoutMs?: number;
}

/** The token endpoint response for an authorization-code grant. */
export interface AuthCodeTokenResponse {
  access_token: string;
  /** Present on first consent / with prompt=consent; absent if Google already consented silently. */
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  [k: string]: unknown;
}

/**
 * Exchange an authorization code for tokens (grant_type=authorization_code). Returns the parsed token
 * JSON including `refresh_token` (the long-lived secret the operator stores). Throws — with NO secret
 * material in the message — on a non-OK response, an unparseable body, or a missing access_token.
 */
export async function exchangeCodeForTokens(args: ExchangeCodeArgs): Promise<AuthCodeTokenResponse> {
  if (!args.code || !args.code.trim()) throw new Error("exchangeCodeForTokens: code is required");
  if (!args.creds?.clientId || !args.creds?.clientSecret) {
    throw new Error("exchangeCodeForTokens: clientId + clientSecret are required");
  }
  if (!args.redirectUri) throw new Error("exchangeCodeForTokens: redirectUri is required");

  const fetchImpl: FetchLike = args.fetchImpl ?? ((...a: Parameters<FetchLike>) => fetch(...a));
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    client_id: args.creds.clientId,
    client_secret: args.creds.clientSecret,
    redirect_uri: args.redirectUri,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 60_000);
  let res: Response;
  try {
    res = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
      signal: controller.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`YouTube OAuth code exchange (${GOOGLE_TOKEN_URL}) failed: ${msg}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `YouTube OAuth code exchange HTTP ${res.status} ${res.statusText}: ${body.slice(0, 300)}`,
    );
  }
  const json = (await res.json()) as AuthCodeTokenResponse;
  if (!json.access_token) {
    throw new Error("YouTube OAuth code exchange: token response had no access_token");
  }
  return json;
}
