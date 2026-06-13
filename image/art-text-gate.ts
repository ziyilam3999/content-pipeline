/**
 * ART TEXT-PRESENCE GATE (#824 ocr-gate) — fail-closed detection of legible words baked into a
 * generated art base.
 *
 * WHY THIS EXISTS. The post-4 art base prompt NAMED discrete, labelable elements ("three output
 * panels: copy / image card / captioned video"), so nano-banana rendered those referents as
 * (garbled) micro-text labels in the image ("copy", "imae card", "captioned video", an "ASK"
 * cursor). Garbled text can NEVER ship on a public post, and the prompt's soft "no text" negative
 * did not stop it. The previous mitigation (POST4_ART_MASKS chips painting over each garbled spot)
 * was eyeball-tuned per art — brittle, and it could silently miss a label. This gate is the
 * MECHANICAL backstop: run OCR on every generated art base and HARD-FAIL (throw) if a real, legible
 * word is detected, so a future texty art can never pass silently.
 *
 * DETECTOR. `tesseract.js` (a pure-JS/WASM Tesseract OCR) — the canonical JS OCR, no native build.
 * The English model is VENDORED into `smoke/fixtures/tessdata/eng.traineddata.gz` (tessdata_fast,
 * ~2 MB) and used by default, so the gate is fully OFFLINE / hermetic in CI and a fresh checkout
 * (no CDN fetch). Override the model dir with $ART_OCR_LANG_PATH; if the vendored dir is absent the
 * detector falls back to tesseract.js's CDN default.
 *
 * THRESHOLD (tuned to flag real words, not abstract noise). A detection counts as "text" only when a
 * word token is PURELY ALPHABETIC, at least `minWordLen` (default 3) letters long, AND recognized at
 * confidence >= `minConfidence` (default 70). This flags the old garbled base (card 95 / copy 89 /
 * captioned 88 / video 97) while ignoring the 1-2 char fragments and low-confidence specks an
 * abstract circuitry/particle background produces. Proven both-ends in
 * `image/__tests__/art-text-gate.test.ts` (OLD garbled base FAILS, NEW clean abstract base PASSES).
 */

import * as fs from "fs";
import * as path from "path";

import { createWorker } from "tesseract.js";

export const DEFAULT_MIN_WORD_LEN = 3;
export const DEFAULT_MIN_CONFIDENCE = 70;

/** A single OCR-detected word token + its recognition confidence (0-100). */
export interface ArtTextWord {
  text: string;
  confidence: number;
}

export interface ArtTextResult {
  /** True when at least one word clears the legible-word threshold (a real baked-in label). */
  hasText: boolean;
  /** The words that cleared the threshold (the offending legible labels). */
  words: ArtTextWord[];
  /** Every non-empty token Tesseract returned (for debugging / tuning). */
  allWords: ArtTextWord[];
}

export interface ArtTextGateOpts {
  /** Minimum alphabetic-token length to count as a word. Default 3. */
  minWordLen?: number;
  /** Minimum OCR confidence (0-100) to count as legible. Default 70. */
  minConfidence?: number;
  /** Tesseract language-model dir (holds eng.traineddata.gz). Default: vendored dir, else CDN. */
  langPath?: string;
}

/** Resolve the vendored tessdata dir if present (offline-first); else undefined (CDN fallback). */
export function defaultLangPath(): string | undefined {
  if (process.env.ART_OCR_LANG_PATH) return process.env.ART_OCR_LANG_PATH;
  const vendored = path.join(process.cwd(), "smoke", "fixtures", "tessdata");
  if (fs.existsSync(path.join(vendored, "eng.traineddata.gz"))) return vendored;
  return undefined; // tesseract.js falls back to its CDN default langPath
}

/** A token is a "word" if it is purely alphabetic (Latin letters) — filters punctuation/specks. */
function isAlphabeticWord(text: string, minWordLen: number): boolean {
  return new RegExp(`^[A-Za-z]{${minWordLen},}$`).test(text.trim());
}

/**
 * Run OCR over a PNG (path or Buffer) and report any legible words. Pure detection — does not throw.
 * A word counts only when it is purely alphabetic, >= minWordLen letters, and >= minConfidence.
 */
export async function detectArtText(
  image: string | Buffer,
  opts?: ArtTextGateOpts,
): Promise<ArtTextResult> {
  const minWordLen = opts?.minWordLen ?? DEFAULT_MIN_WORD_LEN;
  const minConfidence = opts?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const langPath = opts?.langPath ?? defaultLangPath();

  const workerOpts = langPath ? { langPath, gzip: true, cacheMethod: "none" as const } : {};
  const worker = await createWorker("eng", 1, workerOpts);
  try {
    const { data } = await worker.recognize(image);
    const allWords: ArtTextWord[] = (data.words ?? [])
      .map((w) => ({ text: (w.text ?? "").trim(), confidence: Math.round(w.confidence ?? 0) }))
      .filter((w) => w.text.length > 0);
    const words = allWords.filter(
      (w) => w.confidence >= minConfidence && isAlphabeticWord(w.text, minWordLen),
    );
    return { hasText: words.length > 0, words, allWords };
  } finally {
    await worker.terminate();
  }
}

/**
 * Fail-CLOSED assertion: throw if `image` contains any legible baked-in word. Wired into the art-gen
 * chokepoint so a generated art base carrying text is auto-rejected (never silently shipped).
 */
export async function assertNoArtText(
  image: string | Buffer,
  opts?: ArtTextGateOpts & { label?: string },
): Promise<ArtTextResult> {
  const result = await detectArtText(image, opts);
  if (result.hasText) {
    const where = opts?.label ?? (typeof image === "string" ? image : "<buffer>");
    const offenders = result.words
      .map((w) => `"${w.text}"(${w.confidence})`)
      .join(", ");
    throw new Error(
      `ART-TEXT GATE FAIL (#824 ocr-gate): generated art base ${where} contains legible baked-in ` +
        `text [${offenders}]. Art bases must be PURELY ABSTRACT (the card's rendered layer carries ` +
        `all words). Re-generate with a prompt that names NO labelable elements (no panels/cards/` +
        `screens/labels/UI) and a strong no-text negative.`,
    );
  }
  return result;
}
