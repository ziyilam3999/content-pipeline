/**
 * #799 — BUILDER demo END-TO-END SYNC + CAPTION + PARITY INTEGRATION test (PURE jest — NO Remotion).
 *
 * The Post #2 twin of `demo-sync-integration.test.ts` (#778). CI runs only typecheck + jest, not the
 * video smokes, so this suite makes the 8-scene builder's sync+caption+provenance invariants a CI
 * GATE — mirroring the smoke's `usedRealSceneSync` proof in a pure, fast, deterministic test using
 * BUILDER_NARRATION + a realistic NON-LINEAR synthetic per-character alignment (smoothstep, final ==
 * durationSec — the SAME mock shape as smoke/builder-demo-narrated.ts).
 *
 * Invariants:
 *   0. shape — 8 scenes / 8 narration segments in builder order.
 *   1. scene-sync (usedRealSceneSync) — scenes follow the narrator, never silently weight-tile.
 *   2. caption coverage + parity — captions non-empty and span the clip; parity throws on bad input.
 *   3. provenance guard — audio duration must match the alignment within tolerance.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { narrationSceneEndTimes, clampDemoDurationSec } from "../demoTimeline";
import { buildBuilderTimeline, BUILDER_SCENE_COUNT } from "../builderDemoTimeline";
import { BUILDER_NARRATION, builderNarrationScript } from "../builderDemoNarration";
import { buildDemoCaptionCues, assertVoicedDemoHasCaptions } from "../demoCaptions";
import { assertAudioMatchesSync, AUDIO_SYNC_TOLERANCE_SEC } from "../audioDuration";
import { makeSilentWav } from "../../adapters/video";
import { builderSpec } from "../../inputs/builderSpec";

const TARGET_DUR = 90; // realistic ~90s builder narration (mirrors the smoke)
const EPS = 1e-2;

const script = builderNarrationScript(BUILDER_NARRATION);

function syntheticAlignment(durationSec: number): number[] {
  const n = script.length;
  const align: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = (i + 1) / n;
    const eased = x * x * (3 - 2 * x); // smoothstep
    align.push(Number((eased * durationSec).toFixed(4)));
  }
  align[n - 1] = durationSec;
  return align;
}

const align = syntheticAlignment(TARGET_DUR);

// ── 0. shape: 8 scenes / 8 narration segments ────────────────────────────────
describe("#799 builder demo shape — 8 scenes / 8 narration segments", () => {
  it("BUILDER_NARRATION has 8 segments and the timeline has 8 scenes in order", () => {
    expect(BUILDER_NARRATION).toHaveLength(8);
    expect(BUILDER_SCENE_COUNT).toBe(8);
    const t = buildBuilderTimeline(builderSpec(), { durationSec: 90 });
    expect(t.scenes).toHaveLength(8);
    expect(BUILDER_NARRATION.map((s) => s.sceneId)).toEqual(t.scenes.map((s) => s.id));
    expect(t.scenes.map((s) => s.id)).toEqual([
      "intro",
      "testfirst",
      "red",
      "green",
      "gate",
      "dogfood",
      "numbers",
      "cta",
    ]);
  });

  it("scenes tile [0, durationSec) back-to-back with no gaps, ending exactly at duration", () => {
    const DUR = 90;
    const t = buildBuilderTimeline(builderSpec(), { durationSec: DUR });
    expect(t.scenes[0].fromSec).toBe(0);
    for (let i = 0; i < t.scenes.length - 1; i++) {
      const end = t.scenes[i].fromSec + t.scenes[i].durationSec;
      expect(end).toBeCloseTo(t.scenes[i + 1].fromSec, 9);
      expect(t.scenes[i].durationSec).toBeGreaterThan(0);
    }
    const last = t.scenes[t.scenes.length - 1];
    expect(last.fromSec + last.durationSec).toBeCloseTo(DUR, 9);
  });

  it("the numbers panel + phases are sourced from the builder spec (13 phases, 2 cloud-rescued)", () => {
    const t = buildBuilderTimeline(builderSpec(), { durationSec: 90 });
    expect(t.phases).toHaveLength(13);
    expect(t.phases.filter((p) => p.rescued).map((p) => p.id)).toEqual(["bp2", "bp5"]);
    expect(t.numbers.length).toBeGreaterThan(0);
    // every number value comes verbatim from a spec fact
    const factValues = new Set(builderSpec().facts.map((f) => f.value));
    for (const num of t.numbers) expect(factValues.has(num.value)).toBe(true);
  });
});

// ── 1. usedRealSceneSync ──────────────────────────────────────────────────────
describe("#799 scene-sync invariant (usedRealSceneSync — scenes follow the narrator)", () => {
  it("derives non-null per-scene end-times from the narration alignment", () => {
    const sceneEnds = narrationSceneEndTimes(BUILDER_NARRATION, align, TARGET_DUR);
    expect(sceneEnds).not.toBeNull();
    expect(sceneEnds).toHaveLength(BUILDER_NARRATION.length);
    for (let i = 1; i < sceneEnds!.length; i++) {
      expect(sceneEnds![i]).toBeGreaterThan(sceneEnds![i - 1]);
    }
    expect(sceneEnds![sceneEnds!.length - 1]).toBeCloseTo(TARGET_DUR, 4);
  });

  it("scene boundaries EQUAL the narration timing AND DIFFER from weight-tiling (max drift > epsilon)", () => {
    const sceneEndTimesSec = narrationSceneEndTimes(BUILDER_NARRATION, align, TARGET_DUR);
    expect(sceneEndTimesSec).not.toBeNull();

    const narrated = buildBuilderTimeline(builderSpec(), { durationSec: TARGET_DUR, sceneEndTimesSec: sceneEndTimesSec! });
    const weighted = buildBuilderTimeline(builderSpec(), { durationSec: TARGET_DUR });

    const narratedEnds = narrated.scenes.map((s) => s.fromSec + s.durationSec);
    const weightedEnds = weighted.scenes.map((s) => s.fromSec + s.durationSec);

    narratedEnds.forEach((e, i) => {
      const expected = i === narratedEnds.length - 1 ? TARGET_DUR : sceneEndTimesSec![i];
      expect(Math.abs(e - expected)).toBeLessThanOrEqual(EPS);
    });

    let maxDriftVsWeight = 0;
    for (let i = 0; i < narratedEnds.length; i++) {
      maxDriftVsWeight = Math.max(maxDriftVsWeight, Math.abs(narratedEnds[i] - weightedEnds[i]));
    }
    expect(maxDriftVsWeight).toBeGreaterThan(EPS);
  });
});

// ── 2. caption coverage + parity ──────────────────────────────────────────────
describe("#799 caption coverage + parity invariant", () => {
  const renderDurationSec = clampDemoDurationSec(TARGET_DUR, { voiced: true });

  it("builds a non-empty caption track that starts at 0 and spans the clip", () => {
    const cues = buildDemoCaptionCues(script, { durationSec: renderDurationSec, charEndTimesSec: align });
    expect(cues.length).toBeGreaterThan(0);
    expect(cues[0].startSec).toBe(0);
    expect(cues[cues.length - 1].endSec).toBeCloseTo(renderDurationSec, 3);
  });

  it("assertVoicedDemoHasCaptions does NOT throw on a covering track", () => {
    const cues = buildDemoCaptionCues(script, { durationSec: renderDurationSec, charEndTimesSec: align });
    expect(() => assertVoicedDemoHasCaptions(cues, { durationSec: renderDurationSec })).not.toThrow();
  });

  it("assertVoicedDemoHasCaptions DOES throw on an empty track (the silent-drop regression)", () => {
    expect(() => assertVoicedDemoHasCaptions([], { durationSec: renderDurationSec })).toThrow(/EMPTY caption track/);
  });
});

// ── 3. provenance guard ───────────────────────────────────────────────────────
describe("#799 audio/sync provenance guard (assertAudioMatchesSync)", () => {
  const sceneEndTimesSec = narrationSceneEndTimes(BUILDER_NARRATION, align, TARGET_DUR)!;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "builder-sync-prov-"));

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("PASSES when a generated WAV's real duration ≈ sceneEndTimesSec[last] within tolerance", () => {
    const matchPath = path.join(tmpDir, "matching.wav");
    fs.writeFileSync(matchPath, makeSilentWav(TARGET_DUR));
    expect(() => assertAudioMatchesSync(matchPath, sceneEndTimesSec)).not.toThrow();
  });

  it("THROWS when the audio length is off by more than the tolerance (wrong/old file)", () => {
    const wrongDur = TARGET_DUR - (AUDIO_SYNC_TOLERANCE_SEC + 18);
    const wrongPath = path.join(tmpDir, "wrong-old.wav");
    fs.writeFileSync(wrongPath, makeSilentWav(wrongDur));
    expect(() => assertAudioMatchesSync(wrongPath, sceneEndTimesSec)).toThrow(/provenance mismatch/);
  });
});
