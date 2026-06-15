/**
 * #944 forge-demo VOICED sync — the PURE timeline-math oracle (video/forgeVoSync.ts).
 *
 * Proves the spine↔VO alignment math that fixes the operator's "voice drifts off the picture" defect:
 *   • the seam is located after the narrated segments that precede the silent transition beat,
 *   • the drift gate PASSES a VO whose segment lengths match the spine and THROWS when any beat drifts,
 *   • the transition-gap shift leaves pre-seam timestamps untouched, shifts every post-seam timestamp by
 *     exactly FORGE_TRANSITION_SEC, and grows the total to the spine length.
 * This is the COMMITTED end of the drift gate; the live end is `assertForgeVoMatchesSpine` inside
 * tools/voiceForge.ts, exercised by the real re-render.
 */

import {
  forgeSeamSegmentIndex,
  forgeSeamCharIndex,
  assertForgeVoMatchesSpine,
  applyForgeTransitionGap,
} from "../forgeVoSync";
import { FORGE_VO_SEG_SEC, FORGE_TRANSITION_SEC, FORGE_BEATS } from "../forgeStoryboard";
import { FORGE_NARRATION, forgeNarrationScript } from "../forgeNarration";

/** The per-narrated-segment END times of a RAW VO whose segments EXACTLY match the spine lengths. */
function matchingRawSceneEnds(): number[] {
  let acc = 0;
  return FORGE_NARRATION.map((s) => {
    acc += FORGE_VO_SEG_SEC[s.beat];
    return Number(acc.toFixed(4));
  });
}

describe("#944 forgeVoSync — seam location", () => {
  test("the seam sits after the narrated segments that precede the single transition beat", () => {
    const transitionN = FORGE_BEATS.find((b) => b.kind === "transition")!.n;
    const expected = FORGE_NARRATION.filter((s) => s.beat < transitionN).length;
    expect(forgeSeamSegmentIndex()).toBe(expected);
    expect(forgeSeamSegmentIndex()).toBe(4); // beats 1,2,3,4 precede the beat-5 transition
  });

  test("the seam char index is the first char of the segment after the seam (space-joined script)", () => {
    const seamSegIdx = forgeSeamSegmentIndex();
    let idx = 0;
    for (let k = 0; k < seamSegIdx; k++) idx += FORGE_NARRATION[k].text.length + 1;
    expect(forgeSeamCharIndex(seamSegIdx)).toBe(idx);
    // sanity: it points strictly inside the script, past the first segment.
    expect(forgeSeamCharIndex()).toBeGreaterThan(FORGE_NARRATION[0].text.length);
    expect(forgeSeamCharIndex()).toBeLessThan(forgeNarrationScript().length);
  });
});

describe("#944 forgeVoSync — spine↔VO drift gate (both directions)", () => {
  test("a VO whose segments match the spine PASSES", () => {
    expect(() => assertForgeVoMatchesSpine(matchingRawSceneEnds())).not.toThrow();
  });

  test("a VO that drifts >0.5s on any beat THROWS", () => {
    const ends = matchingRawSceneEnds();
    // stretch the 3rd segment by +1s (and carry the offset forward) → >0.5s drift on beat 3.
    for (let i = 2; i < ends.length; i++) ends[i] += 1.0;
    expect(() => assertForgeVoMatchesSpine(ends)).toThrow(/spine.{0,3}VO drift|drift/i);
  });

  test("a tiny <0.5s wobble still PASSES (tolerance, not exact-match)", () => {
    const ends = matchingRawSceneEnds().map((e) => e + 0.2);
    expect(() => assertForgeVoMatchesSpine(ends)).not.toThrow();
  });

  test("a wrong-length end-times array THROWS", () => {
    expect(() => assertForgeVoMatchesSpine(matchingRawSceneEnds().slice(0, -1))).toThrow();
  });
});

describe("#944 forgeVoSync — transition-gap shift", () => {
  const script = forgeNarrationScript();
  const n = script.length;
  const rawDurationSec = 90.882;
  const rawCharEnds = Array.from({ length: n }, (_, i) => Number((((i + 1) / n) * rawDurationSec).toFixed(4)));
  const rawSceneEnds = matchingRawSceneEnds();
  const synced = applyForgeTransitionGap(rawCharEnds, rawDurationSec, rawSceneEnds);
  const seamCharIdx = forgeSeamCharIndex();

  test("the synced total = raw + the transition silence", () => {
    expect(synced.durationSec).toBeCloseTo(rawDurationSec + FORGE_TRANSITION_SEC, 6);
  });

  test("the seam time is the end of the last pre-transition segment", () => {
    expect(synced.seamTimeSec).toBe(rawSceneEnds[forgeSeamSegmentIndex() - 1]);
  });

  test("pre-seam timestamps are unchanged; post-seam are shifted by exactly FORGE_TRANSITION_SEC", () => {
    expect(synced.charEndTimesSec).toHaveLength(n);
    expect(synced.charEndTimesSec[seamCharIdx - 1]).toBe(rawCharEnds[seamCharIdx - 1]); // last pre-seam char
    expect(synced.charEndTimesSec[seamCharIdx]).toBeCloseTo(rawCharEnds[seamCharIdx] + FORGE_TRANSITION_SEC, 6);
    expect(synced.charEndTimesSec[n - 1]).toBeCloseTo(rawCharEnds[n - 1] + FORGE_TRANSITION_SEC, 6);
  });

  test("the synced alignment stays non-decreasing (no inverted scene at the seam)", () => {
    for (let i = 1; i < synced.charEndTimesSec.length; i++) {
      expect(synced.charEndTimesSec[i]).toBeGreaterThanOrEqual(synced.charEndTimesSec[i - 1]);
    }
  });

  test("a char-timestamp array that is not 1:1 with the script THROWS", () => {
    expect(() => applyForgeTransitionGap(rawCharEnds.slice(0, -1), rawDurationSec, rawSceneEnds)).toThrow(/1:1|length/i);
  });
});
