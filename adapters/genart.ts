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
    "ABSOLUTELY NO text, NO words, NO letters, NO numbers, NO logos, NO brand names, NO UI screenshots —",
    "pure abstract art only. High resolution, cinematic lighting.",
    extra ?? "",
  ]
    .join(" ")
    .trim();
}

// ── Real nano-banana caller ────────────────────────────────────────────

export interface GenArtOpts {
  model?: string;
  keySource?: KeySource;
  timeoutMs?: number;
  /** Extra creative direction appended to the prompt. */
  promptExtra?: string;
}

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

/**
 * Build the real nano-banana caller. POSTs a text prompt and returns the first image part as a
 * base64 PNG data URI. Throws on any non-2xx or missing-image response (no silent fallback).
 */
export function geminiImageCaller(opts?: GenArtOpts): ArtCaller {
  return async (prompt: string): Promise<string> => {
    const key = readGeminiKey(opts?.keySource);
    const model = opts?.model ?? DEFAULT_MODEL;
    // v1beta, not v1: image-output `responseModalities` is only recognized on the v1beta surface
    // (the v1 endpoint returns 400 "Unknown name responseModalities"). Verified live 2026-06-08.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 120_000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Gemini HTTP ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as GeminiResponse;
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) {
      const inline = p.inlineData ?? p.inline_data;
      const data = (p.inlineData?.data ?? p.inline_data?.data) || undefined;
      if (inline && data) {
        const mime = p.inlineData?.mimeType ?? p.inline_data?.mime_type ?? "image/png";
        return `data:${mime};base64,${data}`;
      }
    }
    throw new Error("Gemini response contained no image part (inlineData).");
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
