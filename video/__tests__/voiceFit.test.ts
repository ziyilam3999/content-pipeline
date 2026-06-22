/**
 * voiceFit — pure timeline-fit math. A short VO read is FITTED onto a fixed beat spine: each
 * narrated segment plays at the start of its beat (silence pad for the rest), or is time-compressed
 * if it is longer than its beat; caption char-times are shifted/scaled onto the fitted timeline.
 */
import { planVoFit, fitBeatsToVo, MAX_BREATH_SEC, BeatSlot, BeatToFit } from "../voiceFit";

const MAX_BREATH_SEC_LIMIT = MAX_BREATH_SEC;

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

describe("fitBeatsToVo (#1095 — derive the beat spine FROM the measured VO)", () => {
  // A measured-VO fixture standing in for the cheap paid audio-only preview's per-segment spoken
  // lengths (real Adam pace). The kanban 10-beat shape: narrated 1/2/3/5/6/7/8/9/10, silent
  // transition beat 4. The three DYNAMIC clip beats (5/7/8) carry an animation minimum.
  const beats: BeatToFit[] = [
    { n: 1, narrated: true, transition: false },
    { n: 2, narrated: true, transition: false },
    { n: 3, narrated: true, transition: false },
    { n: 4, narrated: false, transition: true },
    { n: 5, narrated: true, transition: false, animMinSec: 9 },
    { n: 6, narrated: true, transition: false },
    { n: 7, narrated: true, transition: false, animMinSec: 12 },
    { n: 8, narrated: true, transition: false, animMinSec: 15 },
    { n: 9, narrated: true, transition: false },
    { n: 10, narrated: true, transition: false },
  ];
  const measuredSpokenSec: Record<number, number> = {
    1: 6.3, 2: 5.5, 3: 7.9, 5: 8.3, 6: 5.4, 7: 11.0, 8: 14.2, 9: 7.4, 10: 3.6,
  };
  const breathSec = 0.7;
  const transitionSec = 1;

  it("BOTH-ENDS / pads-removed: every narrated beat's trailing silence ≤ the breath, so the fit leaves NO dead-air (worst pad < the 1.5s dead-air gate)", () => {
    const fit = fitBeatsToVo({ beats, measuredSpokenSec, breathSec, transitionSec });
    // No narrated beat pads beyond the breath ceiling (the source of the #1063 0:36 dead-air was a
    // hand-guessed clipSec padding the shortfall — the fit derives the length from the voice instead).
    expect(fit.maxPadSec).toBeLessThanOrEqual(MAX_BREATH_SEC_LIMIT);
    expect(fit.maxPadSec).toBeLessThan(1.5); // strictly under the dead-air gate threshold
    for (const b of fit.beats) {
      if (b.n === 4) continue; // the silent transition is an intentional 1s beat
      expect(b.padSec).toBeLessThanOrEqual(MAX_BREATH_SEC_LIMIT + 1e-9);
    }
  });

  it("BOTH-ENDS / no-stretch: clipSec ≥ measured for EVERY beat, so the voice never has to be time-compressed (fill ratio ≤ 1.0)", () => {
    const fit = fitBeatsToVo({ beats, measuredSpokenSec, breathSec, transitionSec });
    for (const b of fit.beats) {
      expect(b.clipSec).toBeGreaterThanOrEqual(b.measuredSec); // never shorter than the words → no compression
      const fillRatio = b.measuredSec === 0 ? 0 : b.measuredSec / b.clipSec;
      expect(fillRatio).toBeLessThanOrEqual(1.0);
    }
  });

  it("exact: an UN-clamped narrated beat's clipSec == measured + breath (no hand constants)", () => {
    const fit = fitBeatsToVo({ beats, measuredSpokenSec, breathSec, transitionSec });
    const byN = Object.fromEntries(fit.beats.map((b) => [b.n, b]));
    expect(byN[1].clipSec).toBe(7.0); // 6.3 + 0.7
    expect(byN[2].clipSec).toBe(6.2); // 5.5 + 0.7
    expect(byN[6].clipSec).toBe(6.1); // 5.4 + 0.7
    expect(byN[1].clampedToAnimMin).toBe(false);
  });

  it("clamp: a dynamic beat whose animation outlasts the words is clamped UP to the animation minimum", () => {
    const fit = fitBeatsToVo({ beats, measuredSpokenSec, breathSec, transitionSec });
    const byN = Object.fromEntries(fit.beats.map((b) => [b.n, b]));
    // beat 8: 14.2 + 0.7 = 14.9 < animMin 15 → clamped to 15.
    expect(byN[8].clipSec).toBe(15);
    expect(byN[8].clampedToAnimMin).toBe(true);
    // beat 7: 11.0 + 0.7 = 11.7 < animMin 12 → clamped to 12.
    expect(byN[7].clipSec).toBe(12);
    expect(byN[7].clampedToAnimMin).toBe(true);
    // beat 5: 8.3 + 0.7 = 9.0 == animMin 9 → NOT clamped (the breath already reaches the floor).
    expect(byN[5].clipSec).toBe(9.0);
    expect(byN[5].clampedToAnimMin).toBe(false);
  });

  it("the silent transition beat is its fixed length; total sums every beat", () => {
    const fit = fitBeatsToVo({ beats, measuredSpokenSec, breathSec, transitionSec });
    const byN = Object.fromEntries(fit.beats.map((b) => [b.n, b]));
    expect(byN[4].clipSec).toBe(1); // = transitionSec
    expect(byN[4].measuredSec).toBe(0);
    // #1148 pre-transition-no-breath: beat 3 is RIGHT BEFORE the silent transition (beat 4), so it gets
    // breath 0 → 7.9 (not 7.9 + 0.7); every other narrated beat still gets the passed 0.7 breath.
    // 7.0+6.2+7.9+1+9.0+6.1+12+15+8.1+4.3 = 76.6
    expect(byN[3].clipSec).toBe(7.9); // pre-transition → no breath even though breathSec=0.7 is passed
    expect(fit.totalSec).toBe(76.6);
  });

  it("BOTH-ENDS contrast: the OLD hand-guessed clipSec pads beyond the gate; the fit-derived clipSec does NOT", () => {
    const fit = fitBeatsToVo({ beats, measuredSpokenSec, breathSec, transitionSec });
    const beat7 = fit.beats.find((b) => b.n === 7)!;
    // The #1063 defect: beat 7 was hand-budgeted to the 16s ANIMATION length while Adam spoke ~11.0s
    // → 5.0s of padded trailing silence (FAILS the 1.5s dead-air gate).
    const oldHandClipSec = 16;
    const oldHandPad = oldHandClipSec - measuredSpokenSec[7];
    expect(oldHandPad).toBeGreaterThan(1.5); // old spine: dead-air
    // The fit-derived clipSec for the same measured length leaves ≤1.0s (PASSES the gate).
    expect(beat7.padSec).toBeLessThanOrEqual(1.5);
  });

  it("refuses a narrated beat with no measured length (forces a real measure, not a guess)", () => {
    const { 5: _omit, ...partial } = measuredSpokenSec;
    expect(() => fitBeatsToVo({ beats, measuredSpokenSec: partial, breathSec, transitionSec })).toThrow(
      /missing\/invalid measured spoken length for narrated beat n=5/,
    );
  });
});

describe("fitBeatsToVo (#1148 — VO-first default: breath 0 + pre-transition-no-breath)", () => {
  // A minimal VO-first fixture: 3 narrated beats with a silent transition between beats 2 and 3, so beat 2
  // is the PRE-TRANSITION beat. NONE of the narrated beats sets animMinSec — so clipSec == measured is a
  // pure breath check (an animMin floor would push clipSec above measured for an UNRELATED reason).
  const beats: BeatToFit[] = [
    { n: 1, narrated: true, transition: false },
    { n: 2, narrated: true, transition: false }, // ← immediately before the transition
    { n: 3, narrated: false, transition: true },
    { n: 4, narrated: true, transition: false },
  ];
  const measuredSpokenSec: Record<number, number> = { 1: 6.3, 2: 5.5, 4: 7.9 };
  const transitionSec = 1;

  it("(a) DEFAULT breath is 0 — a normal narrated beat's clipSec == its measured spoken length (no pad)", () => {
    // No breathSec passed → exercises the #1148 default of 0.
    const fit = fitBeatsToVo({ beats, measuredSpokenSec, transitionSec });
    const byN = Object.fromEntries(fit.beats.map((b) => [b.n, b]));
    expect(byN[1].clipSec).toBe(6.3); // measured + 0 default breath → no trailing silence
    expect(byN[1].padSec).toBe(0);
    expect(byN[4].clipSec).toBe(7.9); // last narrated beat (next beat is none) — still measured + 0
    expect(fit.maxPadSec).toBe(0); // VO-first leaves zero dead-air by construction
  });

  it("(b) PRE-TRANSITION beat gets breath 0 (clipSec == measured) EVEN when breathSec=0.7 is passed", () => {
    const fit = fitBeatsToVo({ beats, measuredSpokenSec, breathSec: 0.7, transitionSec });
    const byN = Object.fromEntries(fit.beats.map((b) => [b.n, b]));
    // beat 1's NEXT beat (2) is narrated → it DOES get the 0.7 breath.
    expect(byN[1].clipSec).toBe(7.0); // 6.3 + 0.7
    // beat 2's NEXT beat (3) is the silent transition → breath forced to 0 → clipSec == measured.
    expect(byN[2].clipSec).toBe(5.5); // 5.5 + 0 (breath suppressed before the transition)
    expect(byN[2].padSec).toBe(0);
  });

  it("(AC#4 smoke) a measured-VO map incl. a pre-transition beat, fit at breath 0 → maxPadSec < 1.5", () => {
    // A kanban-shaped fixture with a transition (beat 4) + dynamic clip beats carrying an animMin floor.
    // VO-first (breath 0) must keep the worst trailing silence STRICTLY under the 1.5s dead-air gate.
    const smokeBeats: BeatToFit[] = [
      { n: 1, narrated: true, transition: false },
      { n: 2, narrated: true, transition: false },
      { n: 3, narrated: true, transition: false }, // ← pre-transition
      { n: 4, narrated: false, transition: true },
      { n: 5, narrated: true, transition: false, animMinSec: 9 },
      { n: 6, narrated: true, transition: false },
      { n: 7, narrated: true, transition: false, animMinSec: 12 },
      { n: 8, narrated: true, transition: false, animMinSec: 15 },
      { n: 9, narrated: true, transition: false },
      { n: 10, narrated: true, transition: false },
    ];
    const smokeMeasured: Record<number, number> = {
      1: 6.3, 2: 5.5, 3: 7.9, 5: 8.3, 6: 5.4, 7: 11.0, 8: 14.2, 9: 7.4, 10: 3.6,
    };
    const fit = fitBeatsToVo({ beats: smokeBeats, measuredSpokenSec: smokeMeasured, transitionSec: 1 });
    expect(fit.maxPadSec).toBeLessThan(1.5); // VO-first → no dead-air, first pass, zero hand-tuning
  });
});
