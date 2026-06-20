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

export function planVoFit(params: {
  rawSegEndsSec: number[];
  charEndTimesSec: number[];
  charRanges: { start: number; end: number }[];
  beats: BeatSlot[];
  targetBeatSec: Record<number, number>;
  transitionSec: number;
}): VoFitPlan {
  const { rawSegEndsSec, charEndTimesSec, charRanges, beats, targetBeatSec, transitionSec } = params;

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
    const playSec = Math.min(rawDur, target);
    const scale = rawDur / playSec; // 1 when padded (rawDur<=target), >1 when compressed
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
