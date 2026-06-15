/**
 * #871 forge-demo VOICED — the spoken narration, as ORDERED SEGMENTS, one per NARRATED forge beat.
 *
 * This is the `forgeNarration.ts` analogue of `video/fableNarration.ts`. Where fable maps 1:1 onto its
 * 8 captured beats, forge has NINE captured beats but only EIGHT spoken lines — the beat-4 TRANSITION
 * is deliberately SILENT (its `FORGE_VO_LINES` entry is the empty string). So this module DERIVES the
 * narration by zipping `FORGE_BEATS` with `FORGE_VO_LINES` and dropping the silent transition: the
 * result is the ordered list of spoken segments the VO + caption track are built from.
 *
 * Single-sourced: the spoken text lives in `FORGE_VO_LINES` (the storyboard SSOT) and the beat metadata
 * in `FORGE_BEATS` — this module only joins them, so there is no second copy of the script to drift.
 *
 * Consumed EXACTLY like `FABLE_NARRATION`:
 *   - `forgeNarrationScript()` joins the segment texts with a SINGLE space (the `narrationScript`
 *     convention) so the per-character end-times of the concatenated script line up 1:1 with the
 *     segment boundaries (`narrationSceneEndTimes`).
 *   - `forgeCaptionDisplayText()` is the displayed-caption projection. The forge lines need no
 *     spoken→displayed substitution (no "Alpha"→"lfah" rewrite like fable), so it is an identity
 *     passthrough — present so `tools/voiceForge.ts` can call the SAME shape `voiceFable` calls.
 *
 * Pure data + helpers. No Playwright / ffmpeg / network / paid call in this module.
 */

import { FORGE_BEATS, FORGE_VO_LINES } from "./forgeStoryboard";

/** One ordered narration segment, bound to the 1-based beat it narrates. */
export interface ForgeNarrationSegment {
  /** 1-based beat number (matches `FORGE_BEATS[n-1]`). */
  beat: number;
  /** Short beat name (for logs / the sync bundle). */
  kind: string;
  /** The captured beat's intended rough-cut duration (seconds) — carried for provenance / logging. */
  clipSec: number;
  /** The spoken line for this beat. */
  text: string;
}

/**
 * The ordered forge narration — one segment per NARRATED beat, in beat order. Built by zipping the
 * storyboard's beats with their spoken lines and dropping any beat whose line is empty (the silent
 * beat-4 transition). `FORGE_VO_LINES[i]` is the line for `FORGE_BEATS[i]`.
 */
export const FORGE_NARRATION: ReadonlyArray<ForgeNarrationSegment> = FORGE_BEATS.map((b, i) => ({
  beat: b.n,
  kind: b.kind,
  clipSec: b.clipSec,
  text: (FORGE_VO_LINES[i] ?? "").trim(),
})).filter((s) => s.text.length > 0);

/**
 * The spoken script: the ordered segments joined by a single space. This is the EXACT string sent to
 * the TTS provider — so a returned per-character end-times array (length === this string's length)
 * indexes 1:1 into it (the shape `narrationSceneEndTimes` + `buildDemoCaptionCues` consume).
 */
export function forgeNarrationScript(
  segments: ReadonlyArray<{ text: string }> = FORGE_NARRATION,
): string {
  return segments.map((s) => s.text).join(" ");
}

/**
 * Displayed-caption text. The forge spoken lines carry no spoken≠displayed token (unlike fable's
 * `Alpha`→`lfah`), so the on-screen caption is the spoken chunk verbatim. Identity passthrough — kept
 * as a named helper so `voiceForge` calls the same caption-projection shape `voiceFable` does.
 */
export function forgeCaptionDisplayText(spokenChunk: string): string {
  return spokenChunk;
}
