/**
 * #1046 agent-kanban demo VOICED — the spoken narration, as ORDERED SEGMENTS, one per NARRATED kanban beat.
 *
 * The `kanbanNarration.ts` analogue of `video/forgeNarration.ts`. Kanban has FOURTEEN beats but only THIRTEEN
 * spoken lines — beat 4 (the tool→board TRANSITION) is deliberately SILENT (its `KANBAN_VO_LINES` entry is the
 * empty string). So this module DERIVES the narration by zipping `KANBAN_BEATS` with `KANBAN_VO_LINES` and
 * dropping the silent transition: the result is the ordered list of spoken segments the VO + caption track
 * are built from.
 *
 * Single-sourced: the spoken text lives in `KANBAN_VO_LINES` (the storyboard SSOT) and the beat metadata in
 * `KANBAN_BEATS` — this module only joins them, so there is no second copy of the script to drift.
 *
 * Consumed EXACTLY like `FORGE_NARRATION`:
 *   - `kanbanNarrationScript()` joins the segment texts with a SINGLE space (the `narrationScript`
 *     convention) so the per-character end-times of the concatenated script line up 1:1 with the segment
 *     boundaries (`narrationSceneEndTimes`).
 *   - `kanbanCaptionDisplayText()` is the displayed-caption projection. The kanban lines need no
 *     spoken→displayed substitution, so it is an identity passthrough — present so `tools/voiceKanban.ts`
 *     can call the SAME shape `voiceFable`/`voiceForge` call.
 *
 * Pure data + helpers. No Playwright / ffmpeg / network / paid call in this module.
 */

import { KANBAN_BEATS, KANBAN_VO_LINES } from "./kanbanStoryboard";

/** One ordered narration segment, bound to the 1-based beat it narrates. */
export interface KanbanNarrationSegment {
  /** 1-based beat number (matches `KANBAN_BEATS[n-1]`). */
  beat: number;
  /** Short beat name (for logs / the sync bundle). */
  kind: string;
  /** The captured beat's intended rough-cut duration (seconds) — carried for provenance / logging. */
  clipSec: number;
  /** The spoken line for this beat. */
  text: string;
}

/**
 * The ordered kanban narration — one segment per NARRATED beat, in beat order. Built by zipping the
 * storyboard's beats with their spoken lines and dropping any beat whose line is empty (the silent
 * beat-4 transition). `KANBAN_VO_LINES[i]` is the line for `KANBAN_BEATS[i]`.
 */
export const KANBAN_NARRATION: ReadonlyArray<KanbanNarrationSegment> = KANBAN_BEATS.map((b, i) => ({
  beat: b.n,
  kind: b.kind,
  clipSec: b.clipSec,
  text: (KANBAN_VO_LINES[i] ?? "").trim(),
})).filter((s) => s.text.length > 0);

/**
 * The spoken script: the ordered segments joined by a single space. This is the EXACT string sent to the
 * TTS provider — so a returned per-character end-times array (length === this string's length) indexes 1:1
 * into it (the shape `narrationSceneEndTimes` + `buildDemoCaptionCues` consume).
 */
export function kanbanNarrationScript(
  segments: ReadonlyArray<{ text: string }> = KANBAN_NARRATION,
): string {
  return segments.map((s) => s.text).join(" ");
}

/**
 * Displayed-caption text. The kanban spoken lines carry no spoken≠displayed token, so the on-screen
 * caption is the spoken chunk verbatim. Identity passthrough — kept as a named helper so `voiceKanban`
 * calls the same caption-projection shape `voiceFable`/`voiceForge` do.
 */
export function kanbanCaptionDisplayText(spokenChunk: string): string {
  return spokenChunk;
}
