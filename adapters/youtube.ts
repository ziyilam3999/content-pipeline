/**
 * REAL YouTube Data API v3 upload client — the live client for the YouTube SHORTS publish path.
 *
 * Three real operations against Google's OAuth2 + YouTube Data API v3:
 *   - verifyAuth()                       → POST oauth2.googleapis.com/token (refresh-token grant → access token)
 *   - uploadVideo({ filePath, metadata }) → the RESUMABLE upload protocol
 *       (POST .../upload/youtube/v3/videos?uploadType=resumable&part=snippet,status with the JSON
 *        metadata body → read the `location` upload URL → PUT the file bytes as video/mp4) → videoId
 *   - setThumbnail(videoId, filePath)    → POST .../upload/youtube/v3/thumbnails/set?videoId=… (optional)
 *
 * Auth: `videos.insert` REQUIRES OAuth2 (an API key is NOT sufficient). We use the long-lived
 * refresh-token flow — the app is published-to-production so the refresh token does not expire. The
 * three secrets (client id / client secret / refresh token) are read at RUNTIME (env var, else macOS
 * Keychain) and are NEVER logged or put into a thrown error message. `fetch` is injected so tests can
 * mock the whole network surface with zero real calls. This module makes a live call only when its
 * methods are invoked; the dry-run smoke never invokes them.
 *
 * Mirrors adapters/typefully.ts EXACTLY in shape (timedFetch / ensureOk / authHeaders / env-then-
 * Keychain secret sourcing / injected transport / cached creds) so the two publish adapters read the
 * same way.
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export const YOUTUBE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const YOUTUBE_UPLOAD_BASE = "https://www.googleapis.com/upload/youtube/v3";

// ── Secret sourcing (runtime only; never in repo/logs/errors) ───────────

export interface YouTubeKeySource {
  /** Env var for the OAuth client id. Default YOUTUBE_CLIENT_ID. */
  clientIdEnv?: string;
  /** Env var for the OAuth client secret. Default YOUTUBE_CLIENT_SECRET. */
  clientSecretEnv?: string;
  /** Env var for the OAuth refresh token. Default YOUTUBE_REFRESH_TOKEN. */
  refreshTokenEnv?: string;
  /** Optional macOS Keychain account (-a) to disambiguate generic-password lookups. */
  keychainAccount?: string;
}

export interface YouTubeOAuthCreds {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/**
 * Read ONE secret: prefers the env var; otherwise a SINGLE targeted macOS Keychain lookup (service =
 * the env-var name, so the operator stores each secret as a generic password under that name — no
 * scanning). Throws a clear, actionable error (with NO secret material) if neither is present.
 */
export function readSecret(envVar: string, keychainAccount?: string): string {
  const fromEnv = process.env[envVar];
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  try {
    const args = ["find-generic-password", "-s", envVar, "-w"];
    if (keychainAccount) args.push("-a", keychainAccount);
    const out = execFileSync("security", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const val = out.trim();
    if (!val) throw new Error("empty secret");
    return val;
  } catch {
    throw new Error(
      `YouTube OAuth secret not found. Set $${envVar}, or store it in the macOS Keychain as a ` +
        `generic password (service "${envVar}", value = the secret). Never commit the secret.`,
    );
  }
}

/**
 * Read all three YouTube OAuth secrets (client id / client secret / refresh token). Each is env-first
 * then a single Keychain lookup keyed on the env-var name.
 */
export function readYouTubeOAuthCreds(src?: YouTubeKeySource): YouTubeOAuthCreds {
  return {
    clientId: readSecret(src?.clientIdEnv ?? "YOUTUBE_CLIENT_ID", src?.keychainAccount),
    clientSecret: readSecret(src?.clientSecretEnv ?? "YOUTUBE_CLIENT_SECRET", src?.keychainAccount),
    refreshToken: readSecret(src?.refreshTokenEnv ?? "YOUTUBE_REFRESH_TOKEN", src?.keychainAccount),
  };
}

// ── Wire types (YouTube Data API v3 `videos.insert` resource) ───────────

/** The `snippet` half of a video resource. `categoryId` is a stringified int ("28" = Science & Tech). */
export interface VideoSnippet {
  title: string;
  description: string;
  tags?: string[];
  categoryId: string;
  defaultLanguage?: string;
}

/**
 * The `status` half of a video resource. `selfDeclaredMadeForKids` is set EXPLICITLY (never omitted) —
 * YouTube treats an omitted value as "unset", which blocks publishing and risks a wrong COPPA default.
 */
export interface VideoStatus {
  privacyStatus: "public" | "unlisted" | "private";
  selfDeclaredMadeForKids: boolean;
}

/** The full `videos.insert` resource body POSTed in the resumable-upload init request. */
export interface VideoInsertResource {
  snippet: VideoSnippet;
  status: VideoStatus;
}

/** The OAuth2 token endpoint response (refresh-token grant). */
export interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
  [k: string]: unknown;
}

/** The `videos.insert` response — `.id` is the new videoId. */
export interface VideoInsertResponse {
  id: string;
  snippet?: Record<string, unknown>;
  status?: Record<string, unknown>;
  [k: string]: unknown;
}

// ── Transport injection ────────────────────────────────────────────────

export type FetchLike = typeof fetch;

export interface YouTubeClientOpts {
  keySource?: YouTubeKeySource;
  /** Inject the network transport (tests pass a mock). Defaults to the global `fetch`. */
  fetchImpl?: FetchLike;
  /** Per-request timeout. Default 120s. */
  timeoutMs?: number;
  /** Upload (PUT bytes) timeout — larger since it streams the whole file. Default 10 min. */
  uploadTimeoutMs?: number;
}

// ── The client ─────────────────────────────────────────────────────────

export class YouTubeClient {
  private readonly keySource?: YouTubeKeySource;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly uploadTimeoutMs: number;
  /** Cached so a multi-step flow does ONE Keychain lookup, not one per request. */
  private cachedCreds?: YouTubeOAuthCreds;
  /** Cached access token (from the last refresh) so upload + thumbnail reuse one token. */
  private cachedAccessToken?: string;

  constructor(opts?: YouTubeClientOpts) {
    this.keySource = opts?.keySource;
    // Bind so the global keeps its receiver; injected mocks are used as-is.
    this.fetchImpl = opts?.fetchImpl ?? ((...a: Parameters<FetchLike>) => fetch(...a));
    this.timeoutMs = opts?.timeoutMs ?? 120_000;
    this.uploadTimeoutMs = opts?.uploadTimeoutMs ?? 600_000;
  }

  private creds(): YouTubeOAuthCreds {
    if (!this.cachedCreds) this.cachedCreds = readYouTubeOAuthCreds(this.keySource);
    return this.cachedCreds;
  }

  private authHeaders(): Record<string, string> {
    if (!this.cachedAccessToken) {
      throw new Error("YouTube authHeaders called before verifyAuth() — no access token yet");
    }
    return { Authorization: `Bearer ${this.cachedAccessToken}` };
  }

  /**
   * Wrap a fetch in a timeout. The error message NEVER includes any secret or auth header — only the
   * method label + URL + (in ensureOk) status + a short body slice.
   */
  private async timedFetch(
    url: string,
    init: RequestInit,
    label: string,
    timeoutMs = this.timeoutMs,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`YouTube ${label} (${url}) failed: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensureOk(res: Response, label: string, url: string): Promise<void> {
    if (res.ok) return;
    const body = await res.text().catch(() => "");
    throw new Error(`YouTube ${label} HTTP ${res.status} ${res.statusText} (${url}): ${body.slice(0, 300)}`);
  }

  /**
   * POST oauth2.googleapis.com/token with grant_type=refresh_token — exchange the long-lived refresh
   * token for a short-lived access token. Caches the access token on the client so the subsequent
   * upload + thumbnail calls reuse it. Returns the raw token JSON. The request body (which carries the
   * client secret + refresh token) is form-urlencoded and is NEVER logged.
   */
  async verifyAuth(): Promise<TokenResponse> {
    const { clientId, clientSecret, refreshToken } = this.creds();
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });
    const res = await this.timedFetch(
      YOUTUBE_TOKEN_URL,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      },
      "verifyAuth",
    );
    await this.ensureOk(res, "verifyAuth", YOUTUBE_TOKEN_URL);
    const json = (await res.json()) as TokenResponse;
    if (!json.access_token) {
      throw new Error("YouTube verifyAuth: token response had no access_token");
    }
    this.cachedAccessToken = json.access_token;
    return json;
  }

  /**
   * Upload a video via the RESUMABLE protocol and return the new videoId:
   *   1. POST /upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
   *      headers: Authorization Bearer, content-type application/json,
   *               X-Upload-Content-Type: video/mp4, X-Upload-Content-Length: <bytes>
   *      body: the videos.insert resource JSON ({ snippet, status })
   *      → read the `location` response header = the session upload URL
   *   2. PUT the raw file bytes to that location URL with content-type video/mp4
   *      → the response JSON is the inserted video resource; `.id` is the videoId
   *
   * Requires verifyAuth() to have run first (it sets the access token). Calls it lazily if not.
   */
  async uploadVideo(args: { filePath: string; metadata: VideoInsertResource }): Promise<string> {
    if (!this.cachedAccessToken) await this.verifyAuth();
    const { filePath, metadata } = args;
    const bytes = fs.readFileSync(filePath);

    // Step 1 — open a resumable session; the metadata goes in this init request's body.
    const initUrl = `${YOUTUBE_UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`;
    const initRes = await this.timedFetch(
      initUrl,
      {
        method: "POST",
        headers: {
          ...this.authHeaders(),
          "content-type": "application/json",
          "X-Upload-Content-Type": "video/mp4",
          "X-Upload-Content-Length": String(bytes.length),
        },
        body: JSON.stringify(metadata),
      },
      "uploadVideo:init",
    );
    await this.ensureOk(initRes, "uploadVideo:init", initUrl);
    const location = initRes.headers.get("location");
    if (!location) {
      throw new Error(
        `YouTube uploadVideo:init returned no 'location' upload URL for ${path.basename(filePath)}`,
      );
    }

    // Step 2 — PUT the bytes to the session URL (carries the auth via the signed session URL; we still
    // send the bearer header for parity with Google's reference flow). Larger timeout: streams the file.
    const putRes = await this.timedFetch(
      location,
      {
        method: "PUT",
        headers: { ...this.authHeaders(), "content-type": "video/mp4" },
        body: bytes as unknown as RequestInit["body"],
      },
      "uploadVideo:put",
      this.uploadTimeoutMs,
    );
    await this.ensureOk(putRes, "uploadVideo:put", location);
    const inserted = (await putRes.json()) as VideoInsertResponse;
    if (!inserted.id) {
      throw new Error(`YouTube uploadVideo: response had no video id for ${path.basename(filePath)}`);
    }
    return inserted.id;
  }

  /**
   * POST /upload/youtube/v3/thumbnails/set?videoId=… — set a custom thumbnail (optional; requires the
   * channel to be thumbnail-eligible). The image bytes are the request body; content-type is inferred
   * from the file extension (png/jpg). Reuses the cached access token (verifyAuth must have run).
   */
  async setThumbnail(videoId: string, filePath: string): Promise<void> {
    if (!this.cachedAccessToken) await this.verifyAuth();
    const bytes = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
    const url = `${YOUTUBE_UPLOAD_BASE}/thumbnails/set?videoId=${encodeURIComponent(videoId)}`;
    const res = await this.timedFetch(
      url,
      {
        method: "POST",
        headers: { ...this.authHeaders(), "content-type": contentType },
        body: bytes as unknown as RequestInit["body"],
      },
      "setThumbnail",
      this.uploadTimeoutMs,
    );
    await this.ensureOk(res, "setThumbnail", url);
  }
}
