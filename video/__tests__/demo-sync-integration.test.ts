/**
 * #778 — END-TO-END SYNC + CAPTION + PARITY INTEGRATION test (PURE jest — NO Remotion render).
 *
 * CI today runs only `npm run typecheck` + `npm test`; it does NOT run the video smokes
 * (smoke/demo-narrated.ts). So a future change could silently break scene-sync, drop captions,
 * or pair a mis-matched audio file and CI would stay green. This suite makes the sync+caption+
 * provenance invariants a CI GATE by mirroring the smoke's `usedRealSceneSync` proof in a pure,
 * fast, deterministic test — using DEMO_NARRATION + a realistic NON-LINEAR synthetic per-character
 * alignment (smoothstep over the concatenated narration script, final == durationSec — the SAME
 * mock shape as smoke/demo-narrated.ts).
 *
 * The four invariants (one describe block each):
 *   1. scene-sync (usedRealSceneSync)  — scenes follow the narrator, never silently weight-tile.
 *   2. caption coverage + parity        — captions are non-empty and span the clip; parity throws on bad input.
 *   3. provenance guard                 — audio duration must match the alignment within tolerance.
 *   4. no derived-only regression       — the persisted sync bundle keeps SOURCE data (#775 lesson).
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  buildDemoTimeline,
  narrationSceneEndTimes,
  clampDemoDurationSec,
} from "../demoTimeline";
import { DEMO_NARRATION, narrationScript } from "../demoNarration";
import { buildDemoCaptionCues, assertVoicedDemoHasCaptions } from "../demoCaptions";
import { assertAudioMatchesSync, AUDIO_SYNC_TOLERANCE_SEC } from "../audioDuration";
import { makeSilentWav } from "../../adapters/video";
import { lfahSpec } from "../../smoke/lfahSpec";

// Realistic ~65s narration target (mirrors TARGET_DUR in smoke/demo-narrated.ts).
const TARGET_DUR = 65;
const EPS = 1e-2; // 10ms tolerance on scene boundaries (mirrors the smoke)

const script = narrationScript(DEMO_NARRATION);

/**
 * A realistic NON-LINEAR per-character alignment for the concatenated narration script:
 * smoothstep (ease-in-out) over the character index so the pace varies through the script
 * (a real voice never speaks at a flat rate) — the EXACT mock shape from smoke/demo-narrated.ts.
 * The final entry is forced to exactly durationSec (mirrors a real clip's end).
 */
function syntheticAlignment(durationSec: number): number[] {
  const n = script.length;
  const align: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = (i + 1) / n; // 0..1
    const eased = x * x * (3 - 2 * x); // smoothstep
    align.push(Number((eased * durationSec).toFixed(4)));
  }
  align[n - 1] = durationSec;
  return align;
}

const align = syntheticAlignment(TARGET_DUR);

// ── 0. shape: 6 scenes / 6 narration segments (#780) ─────────────────────────
describe("#780 demo shape — 6 scenes / 6 narration segments, 1:1", () => {
  it("DEMO_NARRATION has 6 segments and the timeline has 6 scenes in 1:1 order", () => {
    expect(DEMO_NARRATION).toHaveLength(6);
    const t = buildDemoTimeline(lfahSpec(), { durationSec: 60 });
    expect(t.scenes).toHaveLength(6);
    // segment scene order matches the timeline scene order exactly.
    expect(DEMO_NARRATION.map((s) => s.sceneId)).toEqual(t.scenes.map((s) => s.id));
    // the new flow-diagram scene is the 2nd entry.
    expect(t.scenes[1].id).toBe("pipeline");
    expect(DEMO_NARRATION[1].sceneId).toBe("pipeline");
  });
});

// ── 1. usedRealSceneSync ─────────────────────────────────────────────────────
describe("#778 scene-sync invariant (usedRealSceneSync — scenes follow the narrator)", () => {
  it("derives non-null per-scene end-times from the narration alignment", () => {
    const sceneEnds = narrationSceneEndTimes(DEMO_NARRATION, align, TARGET_DUR);
    expect(sceneEnds).not.toBeNull();
    expect(sceneEnds).toHaveLength(DEMO_NARRATION.length);
    // strictly ascending, last ≈ durationSec
    for (let i = 1; i < sceneEnds!.length; i++) {
      expect(sceneEnds![i]).toBeGreaterThan(sceneEnds![i - 1]);
    }
    expect(sceneEnds![sceneEnds!.length - 1]).toBeCloseTo(TARGET_DUR, 4);
  });

  it("scene boundaries EQUAL the narration timing AND DIFFER from weight-tiling (max drift > epsilon)", () => {
    const sceneEndTimesSec = narrationSceneEndTimes(DEMO_NARRATION, align, TARGET_DUR);
    expect(sceneEndTimesSec).not.toBeNull();

    const narrated = buildDemoTimeline(lfahSpec(), { durationSec: TARGET_DUR, sceneEndTimesSec: sceneEndTimesSec! });
    const weighted = buildDemoTimeline(lfahSpec(), { durationSec: TARGET_DUR }); // fallback weight-tiling

    const narratedEnds = narrated.scenes.map((s) => s.fromSec + s.durationSec);
    const weightedEnds = weighted.scenes.map((s) => s.fromSec + s.durationSec);

    // (a) the rendered scene boundaries EQUAL the narration-derived timings
    //     (the final scene snaps to durationSec, which the derivation also targets).
    narratedEnds.forEach((e, i) => {
      const expected = i === narratedEnds.length - 1 ? TARGET_DUR : sceneEndTimesSec![i];
      expect(Math.abs(e - expected)).toBeLessThanOrEqual(EPS);
    });

    // (b) they DIFFER from weight-tiling — proving the alignment drove the scenes
    //     (if scenes ever silently fall back to weight-tiling, this fails the build).
    let maxDriftVsWeight = 0;
    for (let i = 0; i < narratedEnds.length; i++) {
      maxDriftVsWeight = Math.max(maxDriftVsWeight, Math.abs(narratedEnds[i] - weightedEnds[i]));
    }
    expect(maxDriftVsWeight).toBeGreaterThan(EPS);
  });
});

// ── 2. caption coverage + parity ─────────────────────────────────────────────
describe("#778 caption coverage + parity invariant", () => {
  // #777 — a voiced render uses the REAL narration length (voiced clamp: floor only, no 90s cap),
  // so the caption clip is measured with { voiced: true } to stay in lockstep with the render.
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
    expect(() => assertVoicedDemoHasCaptions([], { durationSec: renderDurationSec })).toThrow(
      /EMPTY caption track/,
    );
  });

  it("assertVoicedDemoHasCaptions DOES throw on a track that does not span the clip", () => {
    const notSpanning = [{ text: "hi", startSec: 0, endSec: renderDurationSec - 10 }];
    expect(() => assertVoicedDemoHasCaptions(notSpanning, { durationSec: renderDurationSec })).toThrow(
      /must span the audio/,
    );
  });
});

// ── 3. provenance guard ──────────────────────────────────────────────────────
describe("#778 audio/sync provenance guard (assertAudioMatchesSync)", () => {
  // Derive the scene timing once; its last entry is what the audio length is checked against.
  const sceneEndTimesSec = narrationSceneEndTimes(DEMO_NARRATION, align, TARGET_DUR)!;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-sync-prov-"));

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("PASSES when a generated WAV's real duration ≈ sceneEndTimesSec[last] within tolerance", () => {
    // makeSilentWav writes a real parseable WAV whose duration audioDurationSec reads back.
    const matchPath = path.join(tmpDir, "matching.wav");
    fs.writeFileSync(matchPath, makeSilentWav(TARGET_DUR));
    expect(() => assertAudioMatchesSync(matchPath, sceneEndTimesSec)).not.toThrow();
  });

  it("THROWS when the audio length is off by more than the tolerance (wrong/old file)", () => {
    // An audio file ~20s short of the alignment (the #744 incident shape) must be refused.
    const wrongDur = TARGET_DUR - (AUDIO_SYNC_TOLERANCE_SEC + 18);
    const wrongPath = path.join(tmpDir, "wrong-old.wav");
    fs.writeFileSync(wrongPath, makeSilentWav(wrongDur));
    expect(() => assertAudioMatchesSync(wrongPath, sceneEndTimesSec)).toThrow(
      /provenance mismatch/,
    );
  });
});

// ── 4. no derived-only regression (#775 — persist SOURCE not just derived) ───
describe("#778 persisted sync bundle keeps SOURCE data (#775 derived-only regression guard)", () => {
  const checkPath = path.join(
    process.cwd(),
    "out",
    "review",
    "lfah",
    "demo-narrated",
    "scene-sync-check.json",
  );
  const exists = fs.existsSync(checkPath);

  // Skip (don't fail CI) when the local smoke artifact isn't present — it's gitignored output.
  (exists ? it : it.skip)(
    "scene-sync-check.json carries a non-empty charEndTimesSec AND a script string",
    () => {
      const bundle = JSON.parse(fs.readFileSync(checkPath, "utf8"));
      expect(Array.isArray(bundle.charEndTimesSec)).toBe(true);
      expect(bundle.charEndTimesSec.length).toBeGreaterThan(0);
      expect(typeof bundle.script).toBe("string");
      expect(bundle.script.length).toBeGreaterThan(0);
    },
  );
});
