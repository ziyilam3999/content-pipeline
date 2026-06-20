/**
 * voiceFit — pure timeline-fit math. A short VO read is FITTED onto a fixed beat spine: each
 * narrated segment plays at the start of its beat (silence pad for the rest), or is time-compressed
 * if it is longer than its beat; caption char-times are shifted/scaled onto the fitted timeline.
 */
import { planVoFit, BeatSlot } from "../voiceFit";

describe("planVoFit", () => {
  test("pure PAD: 2 narrated beats + a transition between them", () => {
    const beats: BeatSlot[] = [
      { n: 1, narrated: true, transition: false },
      { n: 2, narrated: false, transition: true },
      { n: 3, narrated: true, transition: false },
    ];
    // seg0 = raw 0-2s, seg1 = raw 2-5s (cumulative ends)
    const plan = planVoFit({
      rawSegEndsSec: [2, 5],
      // chars 0,1,2 in seg0 (raw 0-2); chars 3,4 in seg1 (raw 2-5); char 4 sits at raw 4.0s
      charEndTimesSec: [0.5, 1.5, 2.0, 3.0, 4.0],
      charRanges: [
        { start: 0, end: 3 },
        { start: 3, end: 5 },
      ],
      beats,
      targetBeatSec: { 1: 4, 3: 6 },
      transitionSec: 3,
    });

    expect(plan.totalSec).toBe(13);

    const seg0 = plan.segments[0];
    expect(seg0).toMatchObject({ newStartSec: 0, targetSec: 4, playSec: 2, scale: 1 });

    expect(plan.transitions).toEqual([{ atSec: 4, durSec: 3 }]);

    const seg1 = plan.segments[1];
    expect(seg1).toMatchObject({ newStartSec: 7, targetSec: 6, playSec: 3, scale: 1 });

    // char at raw 4.0s in seg1 (rawStart 2) → 7 + (4-2)/1 = 9.0
    expect(plan.newCharEndTimesSec[4]).toBe(9.0);
    // char at raw 2.0s lands in seg0 (rawStart 0, scale 1) → 0 + (2-0)/1 = 2.0
    expect(plan.newCharEndTimesSec[2]).toBe(2.0);
  });

  test("COMPRESS: a segment longer than its beat is time-compressed (scale > 1)", () => {
    const beats: BeatSlot[] = [{ n: 1, narrated: true, transition: false }];
    const plan = planVoFit({
      rawSegEndsSec: [6], // rawDur 6s onto a 3s beat
      charEndTimesSec: [1.5, 3.0, 6.0],
      charRanges: [{ start: 0, end: 3 }],
      beats,
      targetBeatSec: { 1: 3 },
      transitionSec: 0,
    });

    const seg = plan.segments[0];
    expect(seg.playSec).toBe(3); // = target (capped)
    expect(seg.scale).toBe(2); // rawDur/target = 6/3
    // char at raw 6.0s → newStart 0 + (6-0)/scale(2) = 3.0
    expect(plan.newCharEndTimesSec[2]).toBe(3.0);
    // char at raw 3.0s → 0 + (3-0)/2 = 1.5
    expect(plan.newCharEndTimesSec[1]).toBe(1.5);
    expect(plan.totalSec).toBe(3);
  });

  test("validation: rawSegEnds length must equal charRanges length", () => {
    const beats: BeatSlot[] = [
      { n: 1, narrated: true, transition: false },
      { n: 2, narrated: true, transition: false },
    ];
    expect(() =>
      planVoFit({
        rawSegEndsSec: [2, 5], // 2 narrated beats
        charEndTimesSec: [1.0],
        charRanges: [{ start: 0, end: 1 }], // only 1 range — mismatch
        beats,
        targetBeatSec: { 1: 4, 2: 4 },
        transitionSec: 0,
      }),
    ).toThrow(/length mismatch/);
  });
});

describe("planVoFit maxStretch (keep-length: slow speech to fill, #1046)", () => {
  // One narrated beat: raw segment 2s, beat target 4s, 3 chars.
  const base = {
    rawSegEndsSec: [2],
    charEndTimesSec: [0.7, 1.4, 2.0],
    charRanges: [{ start: 0, end: 3 }],
    beats: [{ n: 1, narrated: true, transition: false }],
    targetBeatSec: { 1: 4 },
    transitionSec: 0,
  };

  it("maxStretch=1 (default) pads: scale 1, last char stays at the natural 2.0s", () => {
    const p = planVoFit(base);
    expect(p.segments[0].scale).toBe(1);
    expect(p.segments[0].playSec).toBe(2);
    expect(p.newCharEndTimesSec[2]).toBeCloseTo(2.0, 2);
  });

  it("maxStretch=1.4 slows the speech to fill more of the beat (scale<1, last char later)", () => {
    const p = planVoFit({ ...base, maxStretch: 1.4 });
    expect(p.segments[0].playSec).toBeCloseTo(2.8, 2); // 2 * 1.4
    expect(p.segments[0].scale).toBeCloseTo(0.714, 2); // 2 / 2.8 (<1 = slowed)
    expect(p.newCharEndTimesSec[2]).toBeCloseTo(2.8, 1); // last word now lands at 2.8s
  });

  it("a large maxStretch fills the beat exactly (last char == beat end → caption real-sync)", () => {
    const p = planVoFit({ ...base, maxStretch: 5 });
    expect(p.segments[0].playSec).toBe(4); // capped by the 4s beat
    expect(p.newCharEndTimesSec[2]).toBeCloseTo(4.0, 2); // last char == duration
  });
});
