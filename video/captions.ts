/**
 * P4b — captions plan
 *
 * Take a spoken-script string and the voice clip's REAL length, and cut the
 * script into on-screen caption chunks, each with a start/end time. Pure
 * deterministic functions — no network/API.
 */

// ── Constants ───────────────────────────────────────────────────────────
export const MAX_WORDS_PER_CAPTION = 5;

// ── Types ───────────────────────────────────────────────────────────────

export interface Caption {
  text: string;
  startSec: number;
  endSec: number;
  wordCount: number;
}

export interface VoiceClipLike {
  durationSec: number;
}

export interface CaptionTrack {
  captions: Caption[];
  durationSec: number;
  pathLine: string;
}

// ── splitCaptionText ────────────────────────────────────────────────────

/**
 * Split a script into whitespace-separated words and group them in order
 * into chunks of at most `maxWords` each. Join each chunk's words with a
 * single space. Never invent, drop, reorder, or cut a word; no empty chunk.
 */
export function splitCaptionText(
  script: string,
  maxWords: number = MAX_WORDS_PER_CAPTION,
): string[] {
  const words = script.trim().split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
  }
  return chunks;
}

// ── buildCaptions ────────────────────────────────────────────────────────

/**
 * Group the words via splitCaptionText, then TIME each chunk by even-split
 * by-words: seconds-per-word = clip.durationSec / totalWords, so each
 * caption's duration = its wordCount * secondsPerWord. Captions run
 * back-to-back with no gaps — the first starts at 0, the last's endSec
 * snaps to clip.durationSec.
 */
export function buildCaptions(
  script: string,
  clip: VoiceClipLike,
  opts?: { maxWords?: number },
): Caption[] {
  const chunks = splitCaptionText(script, opts?.maxWords);
  const totalWords = chunks.flatMap((c) => c.trim().split(/\s+/)).length;
  const secPerWord = clip.durationSec / totalWords;

  const captions: Caption[] = [];
  let cursorSec = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const words = chunk.trim().split(/\s+/);
    const wordCount = words.length;
    const duration = wordCount * secPerWord;
    const startSec = cursorSec;
    const endSec = i === chunks.length - 1
      ? clip.durationSec            // snap final end to clip duration (float drift)
      : cursorSec + duration;       // back-to-back, no gap
    captions.push({ text: chunk, startSec, endSec, wordCount });
    cursorSec = endSec;
  }
  return captions;
}

// ── assertCaptionsCoverClip ──────────────────────────────────────────────

const EPSILON = 1e-6;

/**
 * Throw if the track does NOT fully cover the clip: no captions, first
 * does not start at 0, any caption's endSec doesn't meet the next caption's
 * startSec (gap or overlap), or the last caption's endSec doesn't equal
 * clip.durationSec. Otherwise return.
 */
export function assertCaptionsCoverClip(
  captions: Caption[],
  clip: VoiceClipLike,
): void {
  if (captions.length === 0) {
    throw new Error("Captions are empty — cannot cover the clip.");
  }
  if (captions[0].startSec > 0 + EPSILON) {
    throw new Error(
      `First caption starts at ${captions[0].startSec}, expected 0.`,
    );
  }
  for (let i = 0; i < captions.length; i++) {
    const cap = captions[i];
    if (i === captions.length - 1) {
      // Last caption: endSec must equal clip duration
      if (Math.abs(cap.endSec - clip.durationSec) > EPSILON) {
        throw new Error(
          `Last caption ends at ${cap.endSec}, expected ${clip.durationSec}.`,
        );
      }
    } else {
      // Non-last: this endSec must equal next startSec (no gap, no overlap)
      const nextStart = captions[i + 1].startSec;
      if (Math.abs(cap.endSec - nextStart) > EPSILON) {
        throw new Error(
          `Gap/overlap: caption ${i} ends at ${cap.endSec}, next starts at ${nextStart}.`,
        );
      }
    }
  }
}

// ── buildCaptionTrack ────────────────────────────────────────────────────

const CLEAN = "true" as const;
const NOT_CLEAN = "false" as const;

/**
 * Build the captions, set durationSec to clip.durationSec, compute clean
 * by whether assertCaptionsCoverClip passes, and produce a greppable
 * pathLine of the form:
 *   CAPTION-PATH: words=<totalWords> captions=<count> dur=<dur>s clean=<clean>
 */
export function buildCaptionTrack(
  script: string,
  clip: VoiceClipLike,
  opts?: { maxWords?: number },
): CaptionTrack {
  const captions = buildCaptions(script, clip, opts);
  const totalWords = captions.reduce((sum, c) => sum + c.wordCount, 0);

  let clean: "true" | "false" = NOT_CLEAN;
  try {
    assertCaptionsCoverClip(captions, clip);
    clean = CLEAN;
  } catch {
    // clean stays "false"
  }

  const pathLine = `CAPTION-PATH: words=${totalWords} captions=${captions.length} dur=${clip.durationSec}s clean=${clean}`;
  return { captions, durationSec: clip.durationSec, pathLine };
}
