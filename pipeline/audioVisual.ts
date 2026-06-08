/**
 * P4c bp10 — audio-visual WIRING
 *
 * Thin orchestrator that plugs together the voiceover and captions modules:
 *   script → synthesizeVoiceover → clip.durationSec → buildCaptionTrack
 *
 * No voiceover or caption logic is reimplemented here; all calls go to
 * the real modules already built in this project.
 */

import {
  synthesizeVoiceover,
  type VoiceCaller,
  type VoiceoverResult,
} from "../audio/voiceover";

import {
  buildCaptionTrack,
  type CaptionTrack,
  assertCaptionsCoverClip,
} from "../video/captions";

// ── Types ────────────────────────────────────────────────────────────────

export interface AudioVisualPlan {
  script: string;
  voiceover: VoiceoverResult;
  captions: CaptionTrack;
  pathLine: string;
}

// ── buildAudioVisual ─────────────────────────────────────────────────────

/**
 * Wire the copy-script → voiceover → caption-track flow.
 *
 * 1. Call synthesizeVoiceover(script, callers) to get the voiceover result
 *    (uses the primary provider first, falls back on failure).
 * 2. Build the caption track timed to the voice clip's REAL length
 *    (voiceover.clip.durationSec).
 * 3. Produce a greppable pathLine summarising the chain and whether
 *    everything is clean.
 */
export async function buildAudioVisual(
  script: string,
  callers: { primary: VoiceCaller; fallback: VoiceCaller },
  opts?: { maxWords?: number },
): Promise<AudioVisualPlan> {
  // Step 1: get the voice clip (primary → fallback behind the scenes).
  const voiceover = await synthesizeVoiceover(script, callers);

  // Step 2: build captions timed to the clip's REAL length.
  const captions = buildCaptionTrack(script, { durationSec: voiceover.clip.durationSec }, opts);

  // Step 3: derive the greppable pathLine.
  const clean =
    voiceover.clip.durationSec === captions.durationSec
      ? (() => {
          try {
            assertCaptionsCoverClip(
              captions.captions,
              { durationSec: voiceover.clip.durationSec },
            );
            return true;
          } catch {
            return false;
          }
        })()
      : false;

  const pathLine =
    `AV-PATH: voice="${voiceover.usedProvider}" ` +
    `durationSec=${voiceover.clip.durationSec}s ` +
    `captions=${captions.captions.length} ` +
    `clean=${clean}`;

  return { script, voiceover, captions, pathLine };
}

// ── assertAudioVisualConsistent ───────────────────────────────────────────

/**
 * Throw if the captions were timed to a DIFFERENT length than the voice clip
 * reports.  Otherwise verify that the caption track covers the clip (via
 * assertCaptionsCoverClip) and return.
 */
export function assertAudioVisualConsistent(plan: AudioVisualPlan): void {
  if (plan.captions.durationSec !== plan.voiceover.clip.durationSec) {
    throw new Error(
      `Audio-visual inconsistency: captions duration (${plan.captions.durationSec}s) ` +
      `differs from voice clip duration (${plan.voiceover.clip.durationSec}s).`,
    );
  }
  // The clip also covers it.
  assertCaptionsCoverClip(plan.captions.captions, {
    durationSec: plan.voiceover.clip.durationSec,
  });
}
