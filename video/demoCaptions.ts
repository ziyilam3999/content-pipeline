/**
 * #775 — synced captions for the ANIMATED demo composition (id="demo").
 *
 * The animated demo redesign (#743/#748) replaced the static "card" composition (which had
 * synced captions) and silently dropped the caption track — a regression that hid because the
 * new composition "worked" (see `feedback_carry_capabilities_and_source_data_across_redesign`).
 * This module restores captions for the demo and bakes the parity invariant so a voiced demo
 * can never silently ship without them again.
 *
 * Pure + React-free on purpose: `remotion/index.tsx` is out of the tsc/jest gate, so the only
 * place to unit-test the caption timing + the reserved-band geometry is here. See
 * `video/__tests__/demoCaptions.test.ts`.
 *
 * Caption sync uses the TTS engine's REAL per-character timestamps (`charEndTimesSec`,
 * ElevenLabs `alignment.character_end_times_seconds[]`) via the existing `buildCaptionTrack`
 * — the researched best method (not forced alignment, never even-split, which was removed in
 * #742). When no alignment is supplied (or it doesn't line up), `buildCaptionTrack` falls back
 * to even-split so the track still covers the clip — the parity invariant still holds.
 */

import { buildCaptionTrack, type VoiceClipLike } from "./captions";
import { type DemoLayout } from "./demoLayout";

/**
 * Fraction of the frame height reserved at the BOTTOM for the caption band. The operator's
 * rule: when captions are added, the video must "render to give space for the captions" — i.e.
 * the #773 grow-to-fill content must stop ABOVE the band, not render under it. We reserve the
 * band by GROWING the layout's bottom padding (`reserveCaptionBand`), which `SceneShell`
 * already honors, so the content fills only the area above the band.
 */
export const CAPTION_RESERVE_FRACTION = 0.18;

/** A timed on-screen caption chunk (the shape the Remotion `demo` composition consumes). */
export interface DemoCaptionCue {
  text: string;
  startSec: number;
  endSec: number;
}

/**
 * Return a copy of `layout` with the bottom safe-margin grown by `CAPTION_RESERVE_FRACTION`,
 * so the demo's content area ends above the caption band. `usableSpanFraction` is recomputed
 * to match. Works for both the tall (fill) cuts and the square (centered) cut — `SceneShell`
 * applies `padBottomFraction` the same way for both, so a bigger bottom pad lifts the content
 * clear of the band in every aspect.
 */
export function reserveCaptionBand(
  layout: DemoLayout,
  reserveFraction: number = CAPTION_RESERVE_FRACTION,
): DemoLayout {
  const padBottomFraction = layout.padBottomFraction + reserveFraction;
  return {
    ...layout,
    padBottomFraction,
    usableSpanFraction: Math.max(0, 1 - layout.padTopFraction - padBottomFraction),
  };
}

/**
 * The Y pixel (top of the caption box) for a frame of `height`, given the RESERVED layout
 * (the one returned by `reserveCaptionBand`). The band sits a quarter of the way down the
 * reserved strip, which is BELOW the content bottom edge BY CONSTRUCTION:
 *   content bottom = height * (1 - padBottomFraction)
 *   band top       = height * (1 - 0.75 * padBottomFraction)
 * and since padBottomFraction > 0, the band fraction is strictly larger (lower on screen) than
 * the content-bottom fraction — so the band can never overlap the content for any aspect.
 */
export function captionBandTopY(reservedLayout: DemoLayout, height: number): number {
  if (!(height > 0)) {
    throw new Error(`captionBandTopY: height must be positive (got ${height})`);
  }
  return Math.round(height * (1 - 0.75 * reservedLayout.padBottomFraction));
}

/**
 * Build the timed caption cues for the demo from the spoken `script` and the clip's real
 * timing. Delegates to `buildCaptionTrack` (real per-character sync when `charEndTimesSec`
 * lines up; even-split fallback otherwise) and projects to the cue shape the composition draws.
 */
export function buildDemoCaptionCues(script: string, clip: VoiceClipLike): DemoCaptionCue[] {
  const track = buildCaptionTrack(script, clip);
  return track.captions.map((c) => ({ text: c.text, startSec: c.startSec, endSec: c.endSec }));
}

/** Near-uniform cue durations are the fingerprint of the EVEN-SPLIT fallback — real
 *  per-character voice sync always yields uneven cues (words take different times). */
export function captionsAreEvenSplit(cues: ReadonlyArray<{ startSec: number; endSec: number }>): boolean {
  if (cues.length < 4) return false;
  const durs = cues.map((c) => c.endSec - c.startSec);
  const mean = durs.reduce((a, b) => a + b, 0) / durs.length;
  if (mean <= 0) return false;
  const variance = durs.reduce((a, d) => a + (d - mean) ** 2, 0) / durs.length;
  return Math.sqrt(variance) / mean < 0.03; // coefficient of variation < 3% → suspiciously uniform
}

/**
 * #1046 BAKE — catch a SILENT caption desync: when a REAL (timestamped) VO is used, the cues
 * MUST follow the voice and so be uneven. Near-uniform cues mean buildCaptionTrack fell back to
 * even-split (the char-times "didn't line up" — e.g. a spine padded to a guessed length, last
 * char ≠ duration), so the subtitles ignore the voice. Fail loudly instead of shipping the drift.
 */
export function assertCaptionsTrackRealVoice(
  cues: ReadonlyArray<{ startSec: number; endSec: number }>,
  realVoice: boolean,
): void {
  if (realVoice && captionsAreEvenSplit(cues)) {
    throw new Error(
      "captions: a real (timestamped) VO was used but the cues are near-uniform — buildCaptionTrack fell " +
        "back to EVEN-SPLIT, so subtitles ignore the voice (desync). VO-LOCK the spine to the real VO so its " +
        "per-character timestamps span the timeline (last char == clip duration); do not pad a guessed spine.",
    );
  }
}

/**
 * #775 PARITY INVARIANT — a voiced demo MUST carry a non-empty caption track that SPANS the
 * audio. Throws otherwise. This is the mechanical backstop for the silent-drop regression:
 * `renderDemoVideo` calls it on every voiced render, and the smoke + unit tests exercise both
 * the passing (covering) and failing (empty / not-spanning) cases.
 */
export function assertVoicedDemoHasCaptions(
  cues: DemoCaptionCue[],
  clip: { durationSec: number },
): void {
  const EPS = 1e-6;
  if (cues.length === 0) {
    throw new Error("#775 parity: a voiced demo has an EMPTY caption track — captions are required.");
  }
  if (cues[0].startSec > EPS) {
    throw new Error(`#775 parity: first caption starts at ${cues[0].startSec}, expected 0.`);
  }
  const last = cues[cues.length - 1];
  if (Math.abs(last.endSec - clip.durationSec) > 1e-3) {
    throw new Error(
      `#775 parity: captions end at ${last.endSec}s, expected ${clip.durationSec}s — the track must span the audio.`,
    );
  }
}
