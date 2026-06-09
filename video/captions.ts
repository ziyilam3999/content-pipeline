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
  /**
   * #742 — real per-character end-times from the TTS provider (ElevenLabs
   * `alignment.character_end_times_seconds[]`), one entry per character of the
   * spoken script. When present AND length-matched to the script, captions are
   * timed to the ACTUAL voice instead of an even-split-by-words estimate.
   */
  charEndTimesSec?: number[];
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
 * #742 — map each caption chunk's END time to the REAL voice timing using the
 * provider's per-character end-times. Returns null (→ caller falls back to
 * even-split) if no alignment was supplied or it doesn't line up with the
 * script character-for-character.
 *
 * Boundary rule: chunk k ends at the end-time of the last character BEFORE
 * chunk k+1's first character (a whitespace/punctuation gap), so captions stay
 * back-to-back with no gap; the final chunk snaps to clip.durationSec. The
 * first chunk starts at 0. This preserves the assertCaptionsCoverClip contract.
 */
function realChunkEndTimes(
  script: string,
  chunks: string[],
  clip: VoiceClipLike,
): number[] | null {
  const ends = clip.charEndTimesSec;
  // Alignment must exist and have exactly one entry per character of the script
  // that was sent to the TTS provider — otherwise indices don't correspond.
  if (!ends || ends.length !== script.length) return null;

  // Character span of each word in the RAW script (indices match `ends`).
  const spans = Array.from(script.matchAll(/\S+/g)).map((m) => ({
    start: m.index ?? 0,
  }));
  const wordsPerChunk = chunks.map((c) => c.trim().split(/\s+/).length);
  const totalWords = wordsPerChunk.reduce((a, b) => a + b, 0);
  if (spans.length !== totalWords) return null; // chunking ≠ raw tokenization

  // First word index of each chunk.
  const firstWordIdx: number[] = [];
  let acc = 0;
  for (const n of wordsPerChunk) {
    firstWordIdx.push(acc);
    acc += n;
  }

  const endTimes: number[] = [];
  for (let k = 0; k < chunks.length; k++) {
    if (k === chunks.length - 1) {
      endTimes.push(clip.durationSec); // final snaps to clip duration
    } else {
      const nextFirstChar = spans[firstWordIdx[k + 1]].start;
      endTimes.push(ends[nextFirstChar - 1]);
    }
  }
  return endTimes;
}

/**
 * Group the words via splitCaptionText, then TIME each chunk.
 *
 * Preferred: if the clip carries real per-character end-times
 * (`charEndTimesSec`, #742) that line up with the script, each caption is timed
 * to the ACTUAL voice. Otherwise fall back to EVEN-SPLIT-BY-WORDS:
 * seconds-per-word = clip.durationSec / totalWords. Either way captions run
 * back-to-back with no gaps — the first starts at 0, the last's endSec snaps to
 * clip.durationSec.
 */
export function buildCaptions(
  script: string,
  clip: VoiceClipLike,
  opts?: { maxWords?: number },
): Caption[] {
  const chunks = splitCaptionText(script, opts?.maxWords);
  const totalWords = chunks.flatMap((c) => c.trim().split(/\s+/)).length;
  const secPerWord = clip.durationSec / totalWords;

  // Real voice timing when available; null → even-split fallback.
  const realEnds = realChunkEndTimes(script, chunks, clip);

  const captions: Caption[] = [];
  let cursorSec = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const words = chunk.trim().split(/\s+/);
    const wordCount = words.length;
    const startSec = cursorSec;
    const endSec = realEnds
      ? realEnds[i]                                   // real per-character timing
      : i === chunks.length - 1
        ? clip.durationSec                            // snap final end to clip duration
        : cursorSec + wordCount * secPerWord;         // even-split, back-to-back
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
