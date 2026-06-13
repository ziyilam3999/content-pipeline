/**
 * REAL Typefully v2 posting client — "Phase D" (#786), the live client that #693 deferred.
 *
 * Three real operations against the Typefully v2 API:
 *   - verifyAuth()                       → GET /v2/me (key check)
 *   - uploadMedia(socialSetId, filePath) → the 3-step presigned flow (POST upload → PUT bytes → poll ready)
 *   - createDraft(socialSetId, body)     → POST /v2/social-sets/{id}/drafts (publish_at OMITTED ⇒ DRAFT)
 *
 * The API key is read at RUNTIME (env var, else macOS Keychain) and is NEVER logged or put
 * into a thrown error message. `fetch` is injected so tests can mock the whole network surface
 * with zero real calls.
 *
 * Endpoints/headers/body shapes are implemented EXACTLY to the v2 docs verified by the parent
 * session 2026-06-09. This module makes a live call only when its methods are invoked; the
 * dry-run smoke never invokes them.
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export const TYPEFULLY_API_BASE = "https://api.typefully.com/v2";

// ── Key sourcing (runtime only; never in repo/logs/errors) ─────────────

export interface KeySource {
  /** Env var checked first. Default TYPEFULLY_API_KEY. */
  envVar?: string;
  /** macOS Keychain generic-password service. Default TYPEFULLY_API_KEY. */
  keychainService?: string;
  /** Optional Keychain account (-a) to disambiguate. */
  keychainAccount?: string;
}

/**
 * Read the Typefully API key. Prefers an env var; otherwise a SINGLE targeted Keychain
 * lookup (no scanning). Throws a clear, actionable error (with NO key material) if neither
 * is present.
 */
export function readTypefullyKey(src?: KeySource): string {
  const envVar = src?.envVar ?? "TYPEFULLY_API_KEY";
  const fromEnv = process.env[envVar];
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  const service = src?.keychainService ?? "TYPEFULLY_API_KEY";
  try {
    const args = ["find-generic-password", "-s", service, "-w"];
    if (src?.keychainAccount) args.push("-a", src.keychainAccount);
    const out = execFileSync("security", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const key = out.trim();
    if (!key) throw new Error("empty key");
    return key;
  } catch {
    throw new Error(
      `Typefully API key not found. Set $${envVar}, or store it in the macOS Keychain ` +
        `as a generic password (service "${service}", value = the key). Never commit the key.`,
    );
  }
}

// ── Wire types (v2 schema) ─────────────────────────────────────────────

/** A single post in a platform thread. */
export interface DraftPost {
  text: string;
  /** Media ids to attach (omit / empty when no media on this post). */
  media_ids?: string[];
}

export interface PlatformBlock {
  enabled: boolean;
  posts: DraftPost[];
}

/**
 * The draft body. `publish_at` is intentionally NOT part of this type — omitting it is what
 * makes Typefully save the content as a DRAFT (status "draft") instead of scheduling a publish.
 */
export interface CreateDraftBody {
  platforms: {
    x?: PlatformBlock;
    threads?: PlatformBlock;
    [platform: string]: PlatformBlock | undefined;
  };
  draft_title?: string;
  /** Whether Typefully generates a public share link. Kept false for an internal draft. */
  share?: boolean;
}

export interface MeResponse {
  [k: string]: unknown;
}

export interface UploadInitResponse {
  media_id: string;
  upload_url: string;
}

export interface MediaStatusResponse {
  status: "processing" | "ready" | "failed" | string;
  [k: string]: unknown;
}

export interface CreateDraftResponse {
  id: string;
  status: string;
  [k: string]: unknown;
}

// ── Transport injection ────────────────────────────────────────────────

export type FetchLike = typeof fetch;

export interface TypefullyClientOpts {
  keySource?: KeySource;
  /** Inject the network transport (tests pass a mock). Defaults to the global `fetch`. */
  fetchImpl?: FetchLike;
  /** Per-request timeout. Default 120s. */
  timeoutMs?: number;
  /** Media-ready polling interval. Default 2s. */
  pollIntervalMs?: number;
  /** Max time to wait for media to become "ready". Default 5 min. */
  pollTimeoutMs?: number;
}

// ── The client ─────────────────────────────────────────────────────────

export class TypefullyClient {
  private readonly keySource?: KeySource;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;
  /** Cached so a multi-step flow does one Keychain lookup, not one per request. */
  private cachedKey?: string;

  constructor(opts?: TypefullyClientOpts) {
    this.keySource = opts?.keySource;
    // Bind so the global keeps its receiver; injected mocks are used as-is.
    this.fetchImpl = opts?.fetchImpl ?? ((...a: Parameters<FetchLike>) => fetch(...a));
    this.timeoutMs = opts?.timeoutMs ?? 120_000;
    this.pollIntervalMs = opts?.pollIntervalMs ?? 2_000;
    this.pollTimeoutMs = opts?.pollTimeoutMs ?? 300_000;
  }

  private key(): string {
    if (!this.cachedKey) this.cachedKey = readTypefullyKey(this.keySource);
    return this.cachedKey;
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.key()}` };
  }

  /**
   * Wrap a fetch in a timeout. The error message NEVER includes the key or any auth header —
   * only the method + URL + status + a short body slice.
   */
  private async timedFetch(url: string, init: RequestInit, label: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Typefully ${label} (${url}) failed: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async ensureOk(res: Response, label: string, url: string): Promise<void> {
    if (res.ok) return;
    const body = await res.text().catch(() => "");
    throw new Error(`Typefully ${label} HTTP ${res.status} ${res.statusText} (${url}): ${body.slice(0, 300)}`);
  }

  /** GET /v2/me — verify the key works. Returns the account JSON. */
  async verifyAuth(): Promise<MeResponse> {
    const url = `${TYPEFULLY_API_BASE}/me`;
    const res = await this.timedFetch(url, { method: "GET", headers: this.authHeaders() }, "verifyAuth");
    await this.ensureOk(res, "verifyAuth", url);
    return (await res.json()) as MeResponse;
  }

  /**
   * Upload a media file via the 3-step presigned flow and return its ready media id:
   *   1. POST /v2/social-sets/{id}/media/upload { file_name }  → { media_id, upload_url }
   *   2. PUT raw bytes to upload_url (NO auth header, no extra headers — it's a presigned URL)
   *   3. poll GET /v2/social-sets/{id}/media/{media_id} until status == "ready"
   *      (throws on "failed", throws on poll timeout)
   */
  async uploadMedia(socialSetId: string | number, filePath: string): Promise<string> {
    const fileName = path.basename(filePath);
    const bytes = fs.readFileSync(filePath);

    // Step 1 — request a presigned slot.
    const initUrl = `${TYPEFULLY_API_BASE}/social-sets/${socialSetId}/media/upload`;
    const initRes = await this.timedFetch(
      initUrl,
      {
        method: "POST",
        headers: { ...this.authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ file_name: fileName }),
      },
      "uploadMedia:init",
    );
    await this.ensureOk(initRes, "uploadMedia:init", initUrl);
    const init = (await initRes.json()) as UploadInitResponse;
    if (!init.media_id || !init.upload_url) {
      throw new Error(`Typefully uploadMedia:init missing media_id/upload_url for ${fileName}`);
    }

    // Step 2 — PUT the raw bytes to the presigned URL (no auth/extra headers).
    const putRes = await this.timedFetch(
      init.upload_url,
      { method: "PUT", body: bytes as unknown as RequestInit["body"] },
      "uploadMedia:put",
    );
    await this.ensureOk(putRes, "uploadMedia:put", init.upload_url);

    // Step 3 — poll until the asset is processed and ready.
    const ready = await this.pollMediaReady(socialSetId, init.media_id);
    if (!ready) {
      throw new Error(`Typefully media ${init.media_id} never reached "ready" within ${this.pollTimeoutMs}ms`);
    }
    return init.media_id;
  }

  /** Poll GET /media/{id} until status=="ready". Returns true on ready, throws on "failed". */
  private async pollMediaReady(socialSetId: string | number, mediaId: string): Promise<boolean> {
    const url = `${TYPEFULLY_API_BASE}/social-sets/${socialSetId}/media/${mediaId}`;
    const deadline = Date.now() + this.pollTimeoutMs;
    while (Date.now() <= deadline) {
      const res = await this.timedFetch(url, { method: "GET", headers: this.authHeaders() }, "uploadMedia:poll");
      await this.ensureOk(res, "uploadMedia:poll", url);
      const json = (await res.json()) as MediaStatusResponse;
      if (json.status === "ready") return true;
      if (json.status === "failed") {
        throw new Error(`Typefully media ${mediaId} processing failed`);
      }
      // "processing" (or any non-terminal status) — wait and retry.
      await this.sleep(this.pollIntervalMs);
    }
    return false;
  }

  /**
   * POST /v2/social-sets/{id}/drafts — create a DRAFT. The body MUST NOT carry `publish_at`
   * (the type forbids it); omitting it is what keeps the content a draft rather than a publish.
   */
  async createDraft(socialSetId: string | number, body: CreateDraftBody): Promise<CreateDraftResponse> {
    if ("publish_at" in (body as unknown as Record<string, unknown>)) {
      throw new Error("createDraft: refusing to send publish_at — omit it so the content stays a DRAFT");
    }
    const url = `${TYPEFULLY_API_BASE}/social-sets/${socialSetId}/drafts`;
    const res = await this.timedFetch(
      url,
      {
        method: "POST",
        headers: { ...this.authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      "createDraft",
    );
    await this.ensureOk(res, "createDraft", url);
    return (await res.json()) as CreateDraftResponse;
  }

  /**
   * GET /v2/social-sets/{id}/drafts/{draftId} — read a draft back (read-only, free). Returns the raw
   * draft JSON (callers read `.status` etc.). Goes THROUGH the client so the correct auth header
   * (`Authorization: Bearer`) is reused — never hand-roll a raw fetch with a guessed header (a raw
   * `X-API-KEY` guess returns 401; the auth scheme lives ONLY in `authHeaders()`).
   */
  async getDraft(socialSetId: string | number, draftId: string | number): Promise<Record<string, unknown>> {
    const url = `${TYPEFULLY_API_BASE}/social-sets/${socialSetId}/drafts/${draftId}`;
    const res = await this.timedFetch(url, { method: "GET", headers: this.authHeaders() }, "getDraft");
    await this.ensureOk(res, "getDraft", url);
    return (await res.json()) as Record<string, unknown>;
  }

  /**
   * DELETE /v2/social-sets/{id}/drafts/{draftId} — delete a draft (e.g. retire a stale draft after a
   * corrected one is created). Reuses `authHeaders()` (Bearer) so callers never re-specify auth. The
   * caller is responsible for confirming the draft is still an unpublished DRAFT (read it back via
   * `getDraft` and check `status === "draft"`) BEFORE calling this — this method only issues the DELETE.
   */
  async deleteDraft(socialSetId: string | number, draftId: string | number): Promise<void> {
    const url = `${TYPEFULLY_API_BASE}/social-sets/${socialSetId}/drafts/${draftId}`;
    const res = await this.timedFetch(url, { method: "DELETE", headers: this.authHeaders() }, "deleteDraft");
    await this.ensureOk(res, "deleteDraft", url);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
