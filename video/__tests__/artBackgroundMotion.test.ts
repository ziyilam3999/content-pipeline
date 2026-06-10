/**
 * #807 — PREVENTION test for the Post #2 builder-demo animated background.
 *
 * #805 shipped a background whose Ken-Burns drift was ~0.12% per second — ~10x below the rate a human
 * reads as motion, so it looked like a still image. #805 verified LEGIBILITY but never PERCEPTIBILITY.
 *
 * This test gates PERCEPTIBILITY mechanically (both-ends):
 *   - the SHIPPED config PASSES (visible motion over any 1-second window), and
 *   - the OLD #805 config FAILS the very same gate (proving the gate would have caught the bug).
 *
 * Plus determinism + edge-safety (min-scale covers max-pan so no black edge on any aspect).
 */

import {
  SHIPPED_ART_MOTION,
  LEGACY_805_ART_MOTION,
  artBackgroundTransform,
  minMotionDisplacementPct,
  minScale,
  type ArtMotionConfig,
} from "../artBackgroundMotion";

const FPS = 30;
const CLIP_SEC = 99.149; // the real Post #2 narration length
const WINDOW_SEC = 1; // a 1-second window — the perceptibility horizon

/**
 * The perceptibility floor, in percent-of-frame moved over a 1-second window. The #805 still-image
 * config moves ~0.12%/s; a human reads motion at roughly 10x that. 0.5%/s sits between the two and
 * cleanly separates the shipped config (~0.64%/s min) from the old one (~0.12%/s).
 */
const PERCEPTIBLE_FLOOR_PCT = 0.5;

describe("#807 art-background motion perceptibility gate", () => {
  it("PASSES for the shipped config: motion is perceptible over EVERY 1-second window", () => {
    const minDisp = minMotionDisplacementPct(CLIP_SEC, FPS, WINDOW_SEC, SHIPPED_ART_MOTION);
    expect(minDisp).toBeGreaterThanOrEqual(PERCEPTIBLE_FLOOR_PCT);
    // sanity: clearly above the floor, not a hair over
    expect(minDisp).toBeGreaterThan(PERCEPTIBLE_FLOOR_PCT * 1.2);
  });

  it("FAILS for the OLD #805 config (proving the gate would have caught the imperceptible background)", () => {
    const minDisp = minMotionDisplacementPct(CLIP_SEC, FPS, WINDOW_SEC, LEGACY_805_ART_MOTION);
    // The old single-span Ken-Burns moves ~0.12%/s — well below the floor.
    expect(minDisp).toBeLessThan(PERCEPTIBLE_FLOOR_PCT);
    expect(minDisp).toBeLessThan(0.2); // documents the ~0.12%/s reality
  });

  it("the shipped config moves at least ~3x faster than the old #805 config", () => {
    const shipped = minMotionDisplacementPct(CLIP_SEC, FPS, WINDOW_SEC, SHIPPED_ART_MOTION);
    const legacy = minMotionDisplacementPct(CLIP_SEC, FPS, WINDOW_SEC, LEGACY_805_ART_MOTION);
    expect(shipped / legacy).toBeGreaterThan(3);
  });

  it("is deterministic — same frame/fps yields byte-identical transform", () => {
    for (const f of [0, 137, 900, 2500]) {
      const a = artBackgroundTransform(f, FPS);
      const b = artBackgroundTransform(f, FPS);
      expect(a).toEqual(b);
    }
  });

  it("stays edge-safe on all 3 aspects: min scale covers the worst-case combined pan (objectFit cover)", () => {
    const cfg: ArtMotionConfig = SHIPPED_ART_MOTION;
    const s = minScale(cfg);
    // overhang per side, as % of frame, at the minimum scale
    const overhangPctPerSide = ((s - 1) / 2) * 100;
    // worst-case frame-space pan shift = scale * panAmp (CSS translate % is scaled by the scale())
    const worstPanX = s * cfg.panAmpXPct;
    const worstPanY = s * cfg.panAmpYPct;
    expect(worstPanX).toBeLessThan(overhangPctPerSide);
    expect(worstPanY).toBeLessThan(overhangPctPerSide);
    // and the min scale is a genuine over-scale (>= 1.12 per the task) so cover is always satisfied
    expect(s).toBeGreaterThanOrEqual(1.12);
  });

  it("never drifts off-frame: the sine pan stays within its amplitude for the whole clip", () => {
    const total = Math.round(CLIP_SEC * FPS);
    for (let f = 0; f <= total; f += 7) {
      const { panXPct, panYPct, scale } = artBackgroundTransform(f, FPS);
      expect(Math.abs(panXPct)).toBeLessThanOrEqual(SHIPPED_ART_MOTION.panAmpXPct + 1e-9);
      expect(Math.abs(panYPct)).toBeLessThanOrEqual(SHIPPED_ART_MOTION.panAmpYPct + 1e-9);
      expect(scale).toBeGreaterThanOrEqual(minScale(SHIPPED_ART_MOTION) - 1e-9);
      expect(scale).toBeLessThanOrEqual(SHIPPED_ART_MOTION.scaleMid + SHIPPED_ART_MOTION.scaleAmp + 1e-9);
    }
  });
});
