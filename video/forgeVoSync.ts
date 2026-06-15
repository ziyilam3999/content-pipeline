/**
 * #944 forge-demo VOICED sync — the PURE timeline math that locks the silent spine, the Adam VO, and the
 * captions onto ONE timeline. Extracted from `tools/voiceForge.ts` so it is unit-testable without running
 * the tool (which side-effects ffmpeg + Playwright on import).
 *
 * THE PROBLEM (the operator's "voice drifts off the picture" defect): the voiced cut muxes a CONTINUOUS
 * VO onto the pre-rendered silent spine and assumed each beat's DESIGNED length ≈ its SPOKEN length. It
 * didn't — Adam speaks each beat at a different length than the guessed clipSec, so audio/video/captions
 * slid apart (~8s by mid-video) and the CTA got truncated by `-shortest`.
 *
 * THE FIX (operator Option 1): the spine now renders each NARRATED beat at its MEASURED spoken length
 * (`FORGE_VO_SEG_SEC`) so every video beat lands exactly on its VO segment boundary, and the silent
 * tool→dashboard transition beat (no VO) renders `FORGE_TRANSITION_SEC` of black. The continuous VO has no
 * gap at that seam, so this module:
 *   1. DRIFT-GATES the cached VO against the spine's per-beat lengths (both-ends — throws if they diverge),
 *   2. computes the seam (the VO time + char index where the silent transition belongs), and
 *   3. SHIFTS every post-seam char-timestamp by `FORGE_TRANSITION_SEC`, yielding a synced alignment whose
 *      total equals the spine total (raw spoken + the inserted transition silence). `tools/voiceForge.ts`
 *      splices the matching silence into the audio file and renders captions from this synced alignment.
 *
 * Pure functions only — no Playwright / ffmpeg / network / paid call.
 */

import { FORGE_BEATS, FORGE_VO_SEG_SEC, FORGE_TRANSITION_SEC } from "./forgeStoryboard";
import { FORGE_NARRATION, forgeNarrationScript } from "./forgeNarration";

/** Default spine↔VO drift tolerance (seconds): each measured VO segment must match its spine beat length. */
export const FORGE_VO_DRIFT_TOL_SEC = 0.5;

/**
 * How many NARRATED segments play BEFORE the silent transition beat (so their VO precedes the inserted
 * silence). There must be exactly one transition beat — the seam is otherwise ambiguous.
 */
export function forgeSeamSegmentIndex(): number {
  const transitions = FORGE_BEATS.filter((b) => b.kind === "transition");
  if (transitions.length !== 1) {
    throw new Error(
      `forgeVoSync: expected exactly 1 transition beat, found ${transitions.length} — the #944 seam is ambiguous.`,
    );
  }
  const transitionN = transitions[0].n;
  return FORGE_NARRATION.filter((s) => s.beat < transitionN).length;
}

/**
 * The 0-based char index, in the single-space-joined narration script, of the FIRST character of the first
 * narrated segment AFTER the seam. Every char at or after this index is shifted by the transition silence.
 */
export function forgeSeamCharIndex(seamSegIdx: number = forgeSeamSegmentIndex()): number {
  let idx = 0;
  for (let k = 0; k < seamSegIdx; k++) {
    idx += FORGE_NARRATION[k].text.length + 1; // +1 for the single-space separator between segments
  }
  return idx;
}

/**
 * Both-ends drift gate. Given the per-narrated-segment END times of the RAW (un-shifted) VO alignment,
 * assert each measured segment DURATION matches the spine's beat length (`FORGE_VO_SEG_SEC[beat]`) within
 * `driftTolSec`. Throws otherwise — meaning the cached VO no longer matches the spine the storyboard
 * renders, so the spine + the `FORGE_VO_SEG_SEC` constants must be updated together before re-rendering.
 */
export function assertForgeVoMatchesSpine(
  rawSceneEndTimesSec: number[],
  driftTolSec: number = FORGE_VO_DRIFT_TOL_SEC,
): void {
  if (rawSceneEndTimesSec.length !== FORGE_NARRATION.length) {
    throw new Error(
      `#944 spine↔VO drift: got ${rawSceneEndTimesSec.length} VO segment end-times but the narration has ` +
        `${FORGE_NARRATION.length} segments — the alignment does not line up with the storyboard.`,
    );
  }
  let prev = 0;
  for (let i = 0; i < FORGE_NARRATION.length; i++) {
    const seg = FORGE_NARRATION[i];
    const spine = FORGE_VO_SEG_SEC[seg.beat];
    if (spine === undefined) {
      throw new Error(`#944 spine↔VO drift: no FORGE_VO_SEG_SEC entry for narrated beat ${seg.beat}.`);
    }
    const measured = rawSceneEndTimesSec[i] - prev;
    if (Math.abs(measured - spine) > driftTolSec) {
      throw new Error(
        `#944 spine↔VO drift: beat ${seg.beat} VO segment is ${measured.toFixed(3)}s but the spine renders it ` +
          `at ${spine}s (drift ${Math.abs(measured - spine).toFixed(3)}s > ${driftTolSec}s). The cached VO no ` +
          `longer matches the spine — update FORGE_VO_SEG_SEC in forgeStoryboard.ts (+ the beat clipSec) and ` +
          `re-render the silent spine, then re-run voiceForge.`,
      );
    }
    prev = rawSceneEndTimesSec[i];
  }
}

/** A VO alignment after the transition-silence gap has been spliced into the timeline. */
export interface SyncedForgeVo {
  /** Per-character end-times, with every char at/after the seam shifted by `FORGE_TRANSITION_SEC`. */
  charEndTimesSec: number[];
  /** The synced total = raw spoken duration + the inserted transition silence (≈ the spine total). */
  durationSec: number;
  /** The RAW VO time of the seam (end of the last pre-transition segment) — where silence is inserted. */
  seamTimeSec: number;
}

/**
 * Insert the silent transition gap into the VO timeline: shift every char-timestamp at/after the seam by
 * `FORGE_TRANSITION_SEC`. The result aligns the post-transition narration with the spine's hero beats and
 * makes the alignment total match the spine total, so captions + the audio file (silence spliced at
 * `seamTimeSec`) + the video all share one timeline.
 */
export function applyForgeTransitionGap(
  rawCharEndTimesSec: number[],
  rawDurationSec: number,
  rawSceneEndTimesSec: number[],
): SyncedForgeVo {
  const script = forgeNarrationScript();
  if (rawCharEndTimesSec.length !== script.length) {
    throw new Error(
      `#944 sync: char-timestamp count ${rawCharEndTimesSec.length} != script length ${script.length} — ` +
        `the alignment is not 1:1 with the narration script.`,
    );
  }
  const seamSegIdx = forgeSeamSegmentIndex();
  const seamCharIdx = forgeSeamCharIndex(seamSegIdx);
  const seamTimeSec = rawSceneEndTimesSec[seamSegIdx - 1];
  const charEndTimesSec = rawCharEndTimesSec.map((t, i) => (i >= seamCharIdx ? t + FORGE_TRANSITION_SEC : t));
  return {
    charEndTimesSec,
    durationSec: rawDurationSec + FORGE_TRANSITION_SEC,
    seamTimeSec,
  };
}
