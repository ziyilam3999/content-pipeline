/**
 * #824 — DEMONSTRATION timeline (the deterministic spec the `demo-frames` composition renders from).
 *
 * Parallel to `video/demoTimeline.ts` (the synthetic 4-way demo) and `builderDemoTimeline.ts`, but
 * the hero is REAL captured frames instead of data-driven infographic scenes. Each scene = one
 * captured step, held under one narration segment; the scene swaps exactly on the EXISTING
 * `narrationSceneEndTimes` boundaries (REUSED VERBATIM — not reimplemented). When the narration
 * alignment isn't available/valid, scenes tile by equal weight as the silent-cut fallback.
 *
 * Pure, no Remotion / no network. The Remotion composition (id="demo-frames") is the thin VIEW over
 * this spec; this module is unit-tested as the source of truth for timing + ordering. The hero
 * `<Img>` fit is locked to `UI_FRAME_FIT` ("contain") via the gated `assertUiFrameFit`.
 */

import { clampDemoDurationSec, narrationSceneEndTimes } from "./demoTimeline";
import { type FrameManifest, validateFrameManifest } from "../inputs/frames";

/** One frame scene: which manifest frame is the hero, plus its [fromSec, +durationSec) window. */
export interface FrameScene {
  /** Index into the frame manifest (and the narration segments) — the i-th frame/step. */
  frameIndex: number;
  /** The step label drawn as the annotation pill (carried from the manifest). */
  stepLabel: string;
  fromSec: number;
  durationSec: number;
}

export interface FrameDemoTimeline {
  durationSec: number;
  fps: number;
  scenes: FrameScene[];
}

/**
 * Equal-weight fallback tiling: N scenes split [0, durationSec) evenly, the last snapping to the
 * exact end (float-safe). Used when no usable narration alignment is supplied (the silent cut).
 */
function scenesFromEqualWeights(manifest: FrameManifest, durationSec: number): FrameScene[] {
  const n = manifest.length;
  const scenes: FrameScene[] = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const end = isLast ? durationSec : ((i + 1) / n) * durationSec;
    scenes.push({
      frameIndex: i,
      stepLabel: manifest[i].stepLabel,
      fromSec: cursor,
      durationSec: end - cursor,
    });
    cursor = end;
  }
  return scenes;
}

/**
 * Derive scenes from narration-aligned end-times: scene i ends at `ends[i]`, scene 0 starts at 0,
 * the FINAL scene snaps to `durationSec` (float-safe). `ends` has one ascending entry per frame.
 */
function scenesFromEndTimes(manifest: FrameManifest, ends: number[], durationSec: number): FrameScene[] {
  const n = manifest.length;
  const scenes: FrameScene[] = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const end = isLast ? durationSec : ends[i];
    scenes.push({
      frameIndex: i,
      stepLabel: manifest[i].stepLabel,
      fromSec: cursor,
      durationSec: end - cursor,
    });
    cursor = end;
  }
  return scenes;
}

/** Are these end-times usable for N frames? One per frame, strictly ascending, each in (0, dur]. */
function validFrameEndTimes(ends: number[] | null, n: number, durationSec: number): ends is number[] {
  if (!ends || ends.length !== n) return false;
  let prev = 0;
  for (const e of ends) {
    if (!Number.isFinite(e)) return false;
    if (e <= prev) return false; // strictly ascending — no zero-length scene
    if (e > durationSec + 1e-6) return false; // in range
    prev = e;
  }
  return true;
}

/**
 * Build the demonstration timeline from the ordered frame manifest + the narration segments.
 *
 * PARITY is enforced first (`validateFrameManifest`): exactly one frame per narration segment,
 * every frame has a path — else this THROWS (the scene↔frame invariant).
 *
 * Scene boundaries DERIVE from `narrationSceneEndTimes` (REUSED VERBATIM from `demoTimeline.ts`)
 * when `charEndTimesSec` lines up with the concatenated narration script — so the hero screens
 * follow the narrator. When the alignment is absent/invalid, scenes tile by equal weight (the
 * silent-cut fallback). A voiced render (alignment supplied) floors the duration at MIN but is not
 * MAX-capped, so a real ~90s narration flows through untruncated — same `clampDemoDurationSec`
 * policy the existing demo uses.
 */
export function buildFrameDemoTimeline(
  manifest: FrameManifest,
  segments: ReadonlyArray<{ text: string }>,
  opts?: { durationSec?: number; fps?: number; charEndTimesSec?: number[] },
): FrameDemoTimeline {
  // Parity FIRST — a mismatched count is a hard error, never a silently-padded timeline.
  validateFrameManifest(manifest, segments);

  const voiced = !!opts?.charEndTimesSec && opts.charEndTimesSec.length > 0;
  const durationSec = clampDemoDurationSec(opts?.durationSec, { voiced });
  const fps = opts?.fps ?? 30;

  // REUSE VERBATIM: scene boundaries from the real audio alignment (same helper the synthetic demo
  // uses). Returns null on any mismatch → we fall back to equal-weight tiling.
  const ends = narrationSceneEndTimes(segments, opts?.charEndTimesSec, durationSec);
  const scenes = validFrameEndTimes(ends, manifest.length, durationSec)
    ? scenesFromEndTimes(manifest, ends, durationSec)
    : scenesFromEqualWeights(manifest, durationSec);

  return { durationSec, fps, scenes };
}
