/**
 * REAL generative-art adapter — "nano banana" (Google Gemini 2.5 Flash Image).
 *
 * Fills the result-card's already-designed `backgroundDataUri` slot (image/card.ts) with a
 * creative, brand-safe abstract background, so post images can be art-forward instead of a plain
 * data card on a code-drawn gradient. The deterministic gradient remains the off-by-default
 * baseline (CONFIG.image.generativeBackgroundDefault); this adapter is the opt-in upgrade.
 *
 * Primary-only by design: there is NO silent slide to the gradient — when generative art is asked
 * for, a failed nano-banana call THROWS so a smoke proves the real model ran
 * (feedback_smoke_prove_primary_not_fallback). The GEMINI_API_KEY is read at runtime (env or
 * macOS Keychain) and never committed or logged.
 *
 * API verified against live docs 2026-06-08: model `gemini-2.5-flash-image`,
 * POST .../models/gemini-2.5-flash-image:generateContent, header `x-goog-api-key`,
 * body {contents:[{parts:[{text}]}], generationConfig:{responseModalities:["TEXT","IMAGE"]}},
 * image bytes at candidates[0].content.parts[].inlineData.{mimeType,data} (base64).
 */

import { execFileSync } from "child_process";

import { type ContentSpec } from "../inputs/contentspec";

export const PRIMARY_PROVIDER = "nano-banana";
export const DEFAULT_MODEL = "gemini-2.5-flash-image";

// ── Key sourcing (runtime only; never in repo/logs) ────────────────────

export interface KeySource {
  /** Env var checked first. Default GEMINI_API_KEY. */
  envVar?: string;
  /** macOS Keychain generic-password service. Default $GEMINI_KEYCHAIN_SERVICE or "GEMINI_API_KEY". */
  keychainService?: string;
  /** Optional Keychain account (-a) to disambiguate. */
  keychainAccount?: string;
}

/**
 * Read the Gemini API key. Prefers an env var; otherwise a SINGLE targeted Keychain lookup
 * (no scanning). Throws a clear, actionable error if neither is present.
 */
export function readGeminiKey(src?: KeySource): string {
  const envVar = src?.envVar ?? "GEMINI_API_KEY";
  const fromEnv = process.env[envVar];
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  const service = src?.keychainService ?? process.env.GEMINI_KEYCHAIN_SERVICE ?? "GEMINI_API_KEY";
  try {
    const args = ["find-generic-password", "-s", service, "-w"];
    if (src?.keychainAccount) args.push("-a", src.keychainAccount);
    const out = execFileSync("security", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const key = out.trim();
    if (!key) throw new Error("empty key");
    return key;
  } catch {
    throw new Error(
      `Gemini API key not found. Set $${envVar}, or store it in the macOS Keychain as a generic ` +
        `password (service "${service}", value = the key). Override with $GEMINI_KEYCHAIN_SERVICE. ` +
        `Never commit the key.`,
    );
  }
}

// ── Art prompt (brand-safe: no employer brand, no text, no logos) ──────

/**
 * Build a creative, brand-SAFE art prompt from the spec. Explicitly forbids text/letters/logos so
 * the card's own text overlays cleanly and no real brand name can leak into the pixels.
 */
export function buildArtPrompt(spec: ContentSpec, extra?: string): string {
  return [
    "Create a striking, modern ABSTRACT background illustration for a software product launch graphic.",
    `Theme to evoke: ${spec.product.summary}.`,
    "Mood: confident, technical, premium. Deep navy-to-black gradient with glowing teal and indigo",
    "accents, geometric light trails, subtle particle and circuitry motifs, soft cinematic depth-of-field.",
    "Leave the upper-left and center relatively calm/uncluttered for text overlaid later.",
    "ABSOLUTELY NO text, NO letters, NO words, NO numbers, NO typography, NO labels, NO logos, NO brand",
    "names, NO UI, NO UI screenshots, NO diagrams — pure abstract art only. High resolution, cinematic lighting.",
    extra ?? "",
  ]
    .join(" ")
    .trim();
}

// ── Real nano-banana caller ────────────────────────────────────────────

export interface GenArtOpts {
  model?: string;
  keySource?: KeySource;
  /** Per-attempt network timeout. Default 120s. */
  timeoutMs?: number;
  /** Extra creative direction appended to the prompt. */
  promptExtra?: string;
  /** Retries on a retryable status (429/500/503). Default 5. */
  maxRetries?: number;
  /** Upper bound on a single backoff wait (ms). Default 60s. */
  maxBackoffMs?: number;
}

/** Statuses worth retrying with backoff: rate limit + transient server errors. */
const RETRYABLE_STATUS = new Set([429, 500, 503]);

/**
 * Parse a Google `RetryInfo.retryDelay` (e.g. "9s", "1.5s") from a 429/503 error body, in ms.
 * Honoring the server's own delay is the reliable way to avoid re-tripping RPM/IPM limits without
 * hard-coding model-specific numbers (the docs don't publish per-model image RPM/RPD).
 */
export function parseRetryDelayMs(body: string): number | undefined {
  try {
    const j = JSON.parse(body);
    const info = (j?.error?.details ?? []).find((d: { [k: string]: unknown }) =>
      String(d["@type"] ?? "").includes("RetryInfo"),
    ) as { retryDelay?: string } | undefined;
    const m = info?.retryDelay?.match(/^([\d.]+)s$/);
    if (m) return Math.ceil(parseFloat(m[1]) * 1000);
  } catch {
    /* non-JSON body → no hint */
  }
  return undefined;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A raw prompt-in / data-URI-out caller (the real one hits Gemini; tests inject a fake). */
export type ArtCaller = (prompt: string) => Promise<string>;

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
}
interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
}

function extractImage(json: GeminiResponse): string | undefined {
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const inline = p.inlineData ?? p.inline_data;
    const data = (p.inlineData?.data ?? p.inline_data?.data) || undefined;
    if (inline && data) {
      const mime = p.inlineData?.mimeType ?? p.inline_data?.mime_type ?? "image/png";
      return `data:${mime};base64,${data}`;
    }
  }
  return undefined;
}

/**
 * Build the real nano-banana caller. POSTs a text prompt and returns the first image part as a
 * base64 PNG data URI.
 *
 * Rate-limit resilient: on a 429 (RPM/IPM/RPD) or transient 5xx it retries with backoff, HONORING
 * the server's `RetryInfo.retryDelay` when present (else exponential), up to `maxRetries`. This
 * avoids re-tripping the per-minute image limit on bursts without hard-coding undocumented numbers.
 * A non-retryable status, an exhausted-day quota that never clears, or a 200-with-no-image throws.
 */
export function geminiImageCaller(opts?: GenArtOpts): ArtCaller {
  return async (prompt: string): Promise<string> => {
    const key = readGeminiKey(opts?.keySource);
    const model = opts?.model ?? DEFAULT_MODEL;
    // v1beta, not v1: image-output `responseModalities` is only recognized on the v1beta surface
    // (the v1 endpoint returns 400 "Unknown name responseModalities"). Verified live 2026-06-08.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const maxRetries = opts?.maxRetries ?? 5;
    const maxBackoffMs = opts?.maxBackoffMs ?? 60_000;
    const reqBody = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    });

    let lastErr = "Gemini call failed";
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 120_000);
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "x-goog-api-key": key, "content-type": "application/json" },
          body: reqBody,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (res.ok) {
        const img = extractImage((await res.json()) as GeminiResponse);
        if (img) return img;
        throw new Error("Gemini response contained no image part (inlineData).");
      }

      const body = await res.text().catch(() => "");
      lastErr = `Gemini HTTP ${res.status} ${res.statusText}: ${body.slice(0, 300)}`;
      if (!RETRYABLE_STATUS.has(res.status) || attempt === maxRetries) throw new Error(lastErr);

      // Honor the server's retry hint when present; else exponential backoff with jitter.
      const serverDelay = res.status === 429 ? parseRetryDelayMs(body) : undefined;
      const backoff = Math.min(serverDelay ?? 1000 * 2 ** attempt, maxBackoffMs);
      await wait(backoff + Math.floor(backoff * 0.1 * attempt));
    }
    throw new Error(lastErr);
  };
}

// ── generateArt — the orchestrated entry ───────────────────────────────

export interface GenArtDeps {
  /** Injected caller (tests pass a fake); defaults to the real nano-banana caller. */
  caller?: ArtCaller;
}

export interface GenArtResult {
  /** A `data:image/...;base64,...` URI suitable for image/card.ts backgroundDataUri. */
  dataUri: string;
  provider: string;
  prompt: string;
  pathLine: string;
}

/**
 * Generate a creative background for a spec and return it as a data URI (+ provenance).
 * Primary-only: a failed nano-banana call throws; callers that want the gradient fallback
 * simply do not request generative art.
 */
export async function generateArt(
  spec: ContentSpec,
  deps?: GenArtDeps,
  opts?: GenArtOpts,
): Promise<GenArtResult> {
  const caller = deps?.caller ?? geminiImageCaller(opts);
  const provider = deps?.caller ? "injected" : PRIMARY_PROVIDER;
  const prompt = buildArtPrompt(spec, opts?.promptExtra);
  const dataUri = await caller(prompt);
  if (!dataUri.startsWith("data:")) {
    throw new Error("generateArt: caller did not return a data: URI");
  }
  const pathLine = `GENART-PATH: primary="${PRIMARY_PROVIDER}" used="${provider}" clean=true`;
  return { dataUri, provider, prompt, pathLine };
}
