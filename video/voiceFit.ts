/**
 * voiceFit — PURE timeline math that FITS a (possibly shorter) voiceover read onto the video's
 * FIXED beat spine. A real ElevenLabs read can narrate in 76s while the visual spine is 104s, so
 * per narrated beat we play that beat's spoken segment at the START of the beat and pad the rest
 * with silence; if a segment is LONGER than its beat we time-compress it (scale > 1). Caption
 * character-timestamps are shifted/scaled onto the fitted timeline so subtitles still track words.
 *
 * This module computes the PLAN only — a separate caller does the ffmpeg audio assembly from it.
 * No paid calls, no ffmpeg, no network, no Playwright. Pure functions.
 */

export interface BeatSlot {
  n: number;
  narrated: boolean;
  transition: boolean;
} // in render order

export interface FitSegment {
  segIdx: number; // index into the narrated-segments array (0-based)
  beatN: number; // the beat this segment fills
  rawStartSec: number;
  rawEndSec: number; // slice of the raw VO audio for this segment
  newStartSec: number; // where the segment begins on the fitted timeline
  targetSec: number; // the beat's duration (segment occupies [newStart, newStart+target])
  playSec: number; // spoken audio length after fitting (= min(rawDur,target); rest is silence pad)
  scale: number; // raw->fitted time scale for chars: 1 if padded, rawDur/target (>1) if compressed
}

export interface FitTransition {
  atSec: number;
  durSec: number;
} // a transition (silent) beat inserted at atSec

export interface VoFitPlan {
  segments: FitSegment[];
  transitions: FitTransition[];
  newCharEndTimesSec: number[]; // same length as input charEndTimesSec, shifted onto the fitted timeline
  totalSec: number; // sum of all beat durations (narrated targets + transitions)
}

const MIN_RAW_DUR_SEC = 0.05;

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

function round2(n: number): number {
  return Math.round(n * 1e2) / 1e2;
}

export function planVoFit(params: {
  rawSegEndsSec: number[];
  charEndTimesSec: number[];
  charRanges: { start: number; end: number }[];
  beats: BeatSlot[];
  targetBeatSec: Record<number, number>;
  transitionSec: number;
  /** Max slow-down factor for a short segment to FILL its beat before silence is padded.
   *  1.0 = pad-only (speak at natural speed, trailing silence). >1 = stretch the speech up to
   *  this factor (e.g. 1.4 = up to 40% slower) so the voice fills the beat and the last word
   *  lands near the beat end — keeping captions synced on a longer, dwell-heavy timeline. */
  maxStretch?: number;
}): VoFitPlan {
  const { rawSegEndsSec, charEndTimesSec, charRanges, beats, targetBeatSec, transitionSec } = params;
  const maxStretch = Math.max(1.0, params.maxStretch ?? 1.0);

  const narratedCount = beats.filter((b) => b.narrated).length;
  if (rawSegEndsSec.length !== narratedCount || charRanges.length !== narratedCount) {
    throw new Error(
      `voiceFit: length mismatch — rawSegEndsSec=${rawSegEndsSec.length}, charRanges=${charRanges.length}, narrated beats=${narratedCount} (all three must be equal)`,
    );
  }
  for (let c = 1; c < charEndTimesSec.length; c++) {
    if (charEndTimesSec[c] < charEndTimesSec[c - 1]) {
      throw new Error(`voiceFit: charEndTimesSec must be ascending (index ${c} < ${c - 1})`);
    }
  }

  const segments: FitSegment[] = [];
  const transitions: FitTransition[] = [];
  let cum = 0;
  let segIdx = 0;

  for (const beat of beats) {
    if (beat.transition) {
      transitions.push({ atSec: round4(cum), durSec: transitionSec });
      cum += transitionSec;
      continue;
    }
    if (!beat.narrated) continue;
    const rawStart = segIdx === 0 ? 0 : rawSegEndsSec[segIdx - 1];
    const rawEnd = rawSegEndsSec[segIdx];
    const rawDur = Math.max(rawEnd - rawStart, MIN_RAW_DUR_SEC);
    const target = targetBeatSec[beat.n];
    if (target === undefined) {
      throw new Error(`voiceFit: targetBeatSec missing duration for narrated beat n=${beat.n}`);
    }
    // Fill policy: a segment LONGER than its beat is compressed (scale>1). A SHORTER segment
    // stretches (slows) up to maxStretch to fill the beat, then pads the remainder with silence.
    // maxStretch=1 → pure pad (natural speed + trailing silence); >1 → slower speech, less dead-air.
    const playSec = rawDur >= target ? target : Math.min(target, rawDur * maxStretch);
    const scale = rawDur / playSec; // >1 compressed, =1 natural, <1 stretched (slowed)
    segments.push({
      segIdx,
      beatN: beat.n,
      rawStartSec: round4(rawStart),
      rawEndSec: round4(rawEnd),
      newStartSec: round4(cum),
      targetSec: target,
      playSec: round4(playSec),
      scale: round4(scale),
    });
    cum += target;
    segIdx++;
  }

  // Map every char onto the fitted timeline. Char c belongs to segment k where
  // c < charRanges[k+1].start for k < last, else k = last (separator after seg k stays with k).
  const newCharEndTimesSec: number[] = [];
  for (let c = 0; c < charEndTimesSec.length; c++) {
    let k = segments.length - 1;
    for (let s = 0; s < segments.length - 1; s++) {
      if (c < charRanges[s + 1].start) {
        k = s;
        break;
      }
    }
    const seg = segments[k];
    const newTime = seg.newStartSec + (charEndTimesSec[c] - seg.rawStartSec) / seg.scale;
    newCharEndTimesSec.push(round4(newTime));
  }

  return { segments, transitions, newCharEndTimesSec, totalSec: round4(cum) };
}

// ── #1095 fit-beats-to-VO — derive the BEAT spine FROM the measured voiceover ──────────────────────
// The SOURCE fix for dead-air + heavy-stretch. `planVoFit` (above) fits a short read onto a FIXED beat
// spine — it pads the shortfall, which is exactly the trailing silence the operator caught at 0:36 when
// a hand-guessed clipSec over-budgets the voice. This function inverts the dependency: given each beat's
// MEASURED spoken length (from a cheap paid audio-only preview, #1096a), it BUILDS the clipSec spine so
// each narrated beat is exactly its spoken length + a small breath (≤1.0s) — no padding to a hand
// constant (no dead-air) — clamped UP to a dynamic beat's animation minimum where the visual motion is
// genuinely longer than the words. Because clipSec ≥ measured for every beat the voice never has to be
// time-compressed (no stretch). PURE — unit-tested from a fixture of measured durations; no paid call.

export interface BeatToFit {
  n: number;
  /** This beat carries a spoken VO segment (its clipSec is driven by the measured spoken length). */
  narrated: boolean;
  /** This is the silent transition beat (fixed length = transitionSec; no voice). */
  transition: boolean;
  /** Animation-minimum seconds for a DYNAMIC clip beat (the on-screen motion can't be shorter than
   *  this — e.g. the card-move cross). 0 / undefined = no floor (still / title beats). clipSec is
   *  clamped UP to this even if the spoken line is shorter. */
  animMinSec?: number;
}

export interface FittedBeatLen {
  n: number;
  clipSec: number; // the derived beat length
  measuredSec: number; // measured spoken length (0 for transition / non-narrated)
  padSec: number; // clipSec - measuredSec — the trailing silence the fit leaves (the dead-air it can cost)
  clampedToAnimMin: boolean; // true ⇒ animMinSec forced clipSec ABOVE measured+breath (intentional visual dwell)
}

export interface BeatsToVoFit {
  beats: FittedBeatLen[];
  clipSecByBeat: Record<number, number>; // beatN -> derived clipSec (the new KANBAN_VO_SEG_SEC + transition)
  totalSec: number; // sum of all beat clipSecs (the runtime the spine will render)
  maxPadSec: number; // worst trailing silence across NARRATED beats — the dead-air the fit leaves
}

/** The hard ceiling on the breath added after each narrated beat's spoken length (the plan's "≤1.0s"). */
export const MAX_BREATH_SEC = 1.0;

export function fitBeatsToVo(params: {
  beats: BeatToFit[];
  /** narrated beat n -> measured spoken length (seconds), e.g. from the paid audio-only preview. */
  measuredSpokenSec: Record<number, number>;
  /** Trailing breath added after each narrated beat's spoken words. Clamped to [0, MAX_BREATH_SEC]. Default 0.7. */
  breathSec?: number;
  /** The silent transition beat's fixed length (also the silence voiceKanban splices at the seam). */
  transitionSec: number;
}): BeatsToVoFit {
  const breath = Math.min(MAX_BREATH_SEC, Math.max(0, params.breathSec ?? 0.7));
  const { beats, measuredSpokenSec, transitionSec } = params;

  const out: FittedBeatLen[] = [];
  const clipSecByBeat: Record<number, number> = {};
  let total = 0;
  let maxPad = 0;

  for (const beat of beats) {
    if (beat.transition) {
      const clipSec = round2(transitionSec);
      out.push({ n: beat.n, clipSec, measuredSec: 0, padSec: 0, clampedToAnimMin: false });
      clipSecByBeat[beat.n] = clipSec;
      total += clipSec;
      continue;
    }
    if (!beat.narrated) {
      // A non-narrated, non-transition beat (rare): no voice, so it can only be its animation floor.
      const clipSec = round2(beat.animMinSec ?? 0);
      out.push({ n: beat.n, clipSec, measuredSec: 0, padSec: clipSec, clampedToAnimMin: (beat.animMinSec ?? 0) > 0 });
      clipSecByBeat[beat.n] = clipSec;
      total += clipSec;
      continue;
    }
    const measured = measuredSpokenSec[beat.n];
    if (measured === undefined || !Number.isFinite(measured) || measured < 0) {
      throw new Error(`fitBeatsToVo: missing/invalid measured spoken length for narrated beat n=${beat.n} (got ${measured}). Run the paid audio-only preview so every narrated beat has a measured length.`);
    }
    const base = round2(measured + breath);
    const floor = round2(beat.animMinSec ?? 0);
    const clipSec = Math.max(base, floor);
    const clampedToAnimMin = floor > base + 1e-9;
    const padSec = round2(clipSec - measured);
    out.push({ n: beat.n, clipSec, measuredSec: round2(measured), padSec, clampedToAnimMin });
    clipSecByBeat[beat.n] = clipSec;
    total += clipSec;
    if (padSec > maxPad) maxPad = padSec;
  }

  return { beats: out, clipSecByBeat, totalSec: round2(total), maxPadSec: round2(maxPad) };
}
