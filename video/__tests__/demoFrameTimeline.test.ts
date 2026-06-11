/**
 * #824 — gated tests for the DEMONSTRATION timeline (`video/demoFrameTimeline.ts`). Proves the
 * frame scenes DERIVE from the real narration sync (reusing `narrationSceneEndTimes` verbatim),
 * that parity is enforced, and that the silent fallback tiles cleanly. PURE jest — no Remotion.
 */

import { buildFrameDemoTimeline } from "../demoFrameTimeline";
import { narrationSceneEndTimes } from "../demoTimeline";
import { narrationScript } from "../demoNarration";
import { buildDemoCaptionCues, assertVoicedDemoHasCaptions } from "../demoCaptions";
import { type FrameManifest } from "../../inputs/frames";

// A 4-step demonstration narration (one segment per captured frame).
const NARRATION = [
  { text: "This is forge-harness. Eight composable tools — and watch which one actually costs." },
  { text: "We hand it one sentence. forge_plan turns it into a real plan with a binary test." },
  { text: "forge_generate hands the agent a brief: the story, the test, the code context." },
  { text: "We run the real test. There's the honest green PASS — same command, real exit code." },
];

const FRAMES: FrameManifest = NARRATION.map((_, i) => ({
  path: `/tmp/step-${i}.png`,
  stepLabel: `step ${i + 1}`,
  narrationSegmentIndex: i,
}));

const script = narrationScript(NARRATION);
const TARGET_DUR = 50;

/** Non-linear synthetic per-character alignment (smoothstep), final == durationSec. */
function syntheticAlignment(durationSec: number): number[] {
  const n = script.length;
  const align: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = (i + 1) / n;
    const eased = x * x * (3 - 2 * x);
    align.push(Number((eased * durationSec).toFixed(4)));
  }
  align[n - 1] = durationSec;
  return align;
}

describe("buildFrameDemoTimeline — scenes derive from narration sync", () => {
  it("THROWS on count mismatch (parity)", () => {
    expect(() => buildFrameDemoTimeline(FRAMES.slice(0, 3), NARRATION)).toThrow();
  });

  it("one frame scene per narration segment, in order, carrying the step label", () => {
    const t = buildFrameDemoTimeline(FRAMES, NARRATION, { durationSec: TARGET_DUR });
    expect(t.scenes).toHaveLength(FRAMES.length);
    expect(t.scenes.map((s) => s.frameIndex)).toEqual([0, 1, 2, 3]);
    expect(t.scenes.map((s) => s.stepLabel)).toEqual(["step 1", "step 2", "step 3", "step 4"]);
  });

  it("scene boundaries MATCH narrationSceneEndTimes when a valid alignment is supplied (real sync)", () => {
    const durationSec = TARGET_DUR; // voiced floors at MIN(45) — 50 passes through
    const align = syntheticAlignment(durationSec);
    const t = buildFrameDemoTimeline(FRAMES, NARRATION, { durationSec, charEndTimesSec: align });
    const ends = narrationSceneEndTimes(NARRATION, align, t.durationSec);
    expect(ends).not.toBeNull();
    // Each non-final scene ends exactly on the narration segment end (the screen follows the voice).
    for (let i = 0; i < t.scenes.length - 1; i++) {
      const sceneEnd = t.scenes[i].fromSec + t.scenes[i].durationSec;
      expect(sceneEnd).toBeCloseTo(ends![i], 3);
    }
    // Final scene snaps to the clip end (no gap, no overrun).
    const last = t.scenes[t.scenes.length - 1];
    expect(last.fromSec + last.durationSec).toBeCloseTo(t.durationSec, 6);
    // Back-to-back, ascending, no gaps.
    for (let i = 1; i < t.scenes.length; i++) {
      expect(t.scenes[i].fromSec).toBeCloseTo(t.scenes[i - 1].fromSec + t.scenes[i - 1].durationSec, 6);
    }
  });

  it("falls back to equal-weight tiling (still spans the clip) when no alignment is supplied", () => {
    const t = buildFrameDemoTimeline(FRAMES, NARRATION, { durationSec: TARGET_DUR });
    const last = t.scenes[t.scenes.length - 1];
    expect(last.fromSec + last.durationSec).toBeCloseTo(t.durationSec, 6);
    expect(t.scenes[0].fromSec).toBe(0);
  });

  it("the existing caption helpers (assertVoicedDemoHasCaptions) work unchanged on this script", () => {
    const t = buildFrameDemoTimeline(FRAMES, NARRATION, {
      durationSec: TARGET_DUR,
      charEndTimesSec: syntheticAlignment(TARGET_DUR),
    });
    const clip = { durationSec: t.durationSec, charEndTimesSec: syntheticAlignment(t.durationSec) };
    const cues = buildDemoCaptionCues(script, clip);
    expect(() => assertVoicedDemoHasCaptions(cues, clip)).not.toThrow();
    expect(cues.length).toBeGreaterThan(0);
  });
});
