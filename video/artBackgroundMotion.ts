/**
 * #807 — the MOTION CURVE for the Post #2 builder-demo animated generative-art background.
 *
 * Why this lives in `video/*.ts` and NOT inline in remotion/index.tsx: remotion/index.tsx is OUTSIDE
 * the project's tsc/jest gate (Remotion's own bundler compiles it), so any logic there is untested.
 * Factoring the pan/zoom curve into a pure function here makes it unit-testable — the prevention test
 * (`video/__tests__/artBackgroundMotion.test.ts`) asserts the motion is PERCEPTIBLE over any 1-second
 * window, so an imperceptibly-slow background (the #805 bug) can never ship again.
 *
 * The #805 background used a SINGLE-SPAN Ken-Burns (scale 1.0->1.12 + pan +/-2.2%/+/-1.6% spread over
 * the WHOLE ~99s clip) = ~0.12% zoom per second — ~10x below the rate a human reads as motion, so it
 * looked like a still image under the dark scrim. This module replaces it with OSCILLATING (sine)
 * pan + a breathing zoom: visible amplitude, multi-second periods, deterministic, and on-frame
 * forever (a sine sways back and forth so it never drifts off-frame the way a monotonic ramp would).
 */

/** A renderable background transform for one frame: a cover-scale plus a percent-of-frame pan. */
export interface ArtBackgroundTransform {
  /** CSS `scale()` factor applied to the cover-filled background image. */
  scale: number;
  /** Horizontal pan, as a percent of the frame width (the `translate()` X term). */
  panXPct: number;
  /** Vertical pan, as a percent of the frame height (the `translate()` Y term). */
  panYPct: number;
}

/**
 * The motion config. Sine oscillation keeps the art swaying back and forth forever (no monotonic
 * drift off-frame), at a rate a viewer clearly perceives within ~1-2 seconds while staying calm.
 *
 * Edge-safety (objectFit: cover): at the MIN scale (scaleMid - scaleAmp = 1.15) the image overhangs
 * each frame edge by (scale-1)/2 = 7.5% of the frame. The worst-case frame-space pan shift is
 * scale * panAmp = 1.15 * 6% = 6.9% < 7.5% -> a ~0.6% margin even when both pan axes AND the min
 * scale align. So no black edge is ever revealed on 9:16 / 1:1 / 4:5.
 */
export interface ArtMotionConfig {
  /** Pan amplitude X, percent of frame width. */
  panAmpXPct: number;
  /** Pan amplitude Y, percent of frame height. */
  panAmpYPct: number;
  /** Pan period X, seconds (one full back-and-forth sway). */
  panPeriodXSec: number;
  /** Pan period Y, seconds. */
  panPeriodYSec: number;
  /** Phase offset on the Y pan (radians) — a quarter turn makes X/Y a Lissajous loop, not a line. */
  panPhaseYRad: number;
  /** Centre of the breathing zoom. */
  scaleMid: number;
  /** Half-swing of the breathing zoom (scale ranges scaleMid +/- scaleAmp). */
  scaleAmp: number;
  /** Zoom period, seconds. */
  scalePeriodSec: number;
}

/**
 * The SHIPPED motion config (#807). Calm-but-clearly-moving: ~+/-6% pan over ~22-26s sways and a
 * 1.15<->1.25 breathe over ~24s. Min displacement over any 1s window ~= 0.64% of the frame — ~5.5x
 * the #805 config's 0.12%/s and well above the 0.5%/s perceptibility floor the prevention test gates.
 */
export const SHIPPED_ART_MOTION: ArtMotionConfig = {
  panAmpXPct: 6,
  panAmpYPct: 6,
  panPeriodXSec: 22,
  panPeriodYSec: 26,
  panPhaseYRad: Math.PI / 2,
  scaleMid: 1.2,
  scaleAmp: 0.05,
  scalePeriodSec: 24,
};

/**
 * The #805 config that READ AS A STILL IMAGE — kept ONLY so the prevention test can prove the old
 * curve FAILS the perceptibility gate (both-ends). Modelled as a degenerate "oscillation" whose
 * period is the full ~99s clip (a single-span monotonic ramp covers less than half a period, so a
 * full-period sine is a generous over-estimate of its motion — and it STILL fails the gate).
 */
export const LEGACY_805_ART_MOTION: ArtMotionConfig = {
  panAmpXPct: 2.2,
  panAmpYPct: 1.6,
  panPeriodXSec: 99,
  panPeriodYSec: 99,
  panPhaseYRad: 0,
  scaleMid: 1.06,
  scaleAmp: 0.06,
  scalePeriodSec: 99,
};

/** Compute the background transform for a given frame, fps, and motion config (default: shipped). */
export function artBackgroundTransform(
  frame: number,
  fps: number,
  config: ArtMotionConfig = SHIPPED_ART_MOTION,
): ArtBackgroundTransform {
  const f = Math.max(0, frame);
  const tau = Math.PI * 2;
  const panXPct = config.panAmpXPct * Math.sin((tau * f) / (config.panPeriodXSec * fps));
  const panYPct =
    config.panAmpYPct * Math.sin((tau * f) / (config.panPeriodYSec * fps) + config.panPhaseYRad);
  const scale = config.scaleMid + config.scaleAmp * Math.sin((tau * f) / (config.scalePeriodSec * fps));
  return { scale, panXPct, panYPct };
}

/**
 * The minimum scale this config ever reaches (= scaleMid - |scaleAmp|). The caller relies on this to
 * keep the panned cover-art edge-safe; the prevention test asserts min-scale covers max-pan.
 */
export function minScale(config: ArtMotionConfig = SHIPPED_ART_MOTION): number {
  return config.scaleMid - Math.abs(config.scaleAmp);
}

/**
 * The motion "displacement" over a window of `windowFrames` frames, as a percent of the frame, used
 * by the perceptibility gate. Combines the translation distance (Euclidean over panX/panY) with the
 * zoom-driven edge displacement (a change of `dScale` moves a point at the half-frame radius by
 * `dScale * 50`% of the frame). Both are in the same "% of frame" unit so they add.
 */
export function motionDisplacementPct(
  startFrame: number,
  windowFrames: number,
  fps: number,
  config: ArtMotionConfig = SHIPPED_ART_MOTION,
): number {
  const a = artBackgroundTransform(startFrame, fps, config);
  const b = artBackgroundTransform(startFrame + windowFrames, fps, config);
  const dx = b.panXPct - a.panXPct;
  const dy = b.panYPct - a.panYPct;
  const translation = Math.hypot(dx, dy);
  const zoomEdge = Math.abs(b.scale - a.scale) * 50;
  return translation + zoomEdge;
}

/**
 * The SMALLEST motion displacement over ANY window of `windowSec` seconds across `[0, durationSec]`.
 * If even the quietest moment moves at least the perceptibility threshold, the whole clip is moving
 * perceptibly. (A pure sine's quietest window straddles a turning point, so this is the true floor.)
 */
export function minMotionDisplacementPct(
  durationSec: number,
  fps: number,
  windowSec: number,
  config: ArtMotionConfig = SHIPPED_ART_MOTION,
): number {
  const total = Math.round(durationSec * fps);
  const w = Math.max(1, Math.round(windowSec * fps));
  let min = Infinity;
  for (let f = 0; f + w <= total; f++) {
    const d = motionDisplacementPct(f, w, fps, config);
    if (d < min) min = d;
  }
  return min === Infinity ? 0 : min;
}
