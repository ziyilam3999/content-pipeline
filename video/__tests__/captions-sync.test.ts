/**
 * #742 — caption ↔ voiceover SYNC.
 *
 * The bug: real speech is non-uniform (fast words, slow words, pauses), but
 * `buildCaptions` timed each chunk by EVEN-SPLIT-BY-WORDS — so the on-screen
 * captions drift away from the voice. ElevenLabs hands us a real per-character
 * end-time array (`character_end_times_seconds[]`); when we pass it through,
 * each caption should land where the voice actually says it.
 *
 * Fixture is a SYNTHETIC but realistic non-uniform alignment with a deliberate
 * long pause, hand-computed so every expected boundary is independently known
 * (not derived from the implementation — no circularity).
 */

import {
  buildCaptions,
  buildCaptionTrack,
  assertCaptionsCoverClip,
  type Caption,
} from "../captions";

// ── Fixture ───────────────────────────────────────────────────────────────
// Script: 4 single-char words "a b c d". Raw indices:
//   0:'a' 1:' ' 2:'b' 3:' ' 4:'c' 5:' ' 6:'d'   (length 7)
const SCRIPT = "a b c d";

// Per-character END times in seconds (one per char of SCRIPT). Non-uniform:
// a long pause sits on the space AFTER 'b' (index 3 ends at 5.0s).
//        idx:  0    1    2    3    4    5    6
//        chr:  a    _    b    _    c    _    d
const CHAR_END = [1.0, 1.2, 2.0, 5.0, 6.0, 6.1, 9.0];
const DURATION = CHAR_END[CHAR_END.length - 1]; // 9.0

// With maxWords=1 → 4 chunks "a","b","c","d".
// REAL boundary rule = end-time of the last char before the next chunk's first char:
//   c0 "a": next "b" starts at idx 2 → CHAR_END[1] = 1.2  → [0,   1.2]
//   c1 "b": next "c" starts at idx 4 → CHAR_END[3] = 5.0  → [1.2, 5.0]
//   c2 "c": next "d" starts at idx 6 → CHAR_END[5] = 6.1  → [5.0, 6.1]
//   c3 "d": last → snaps to DURATION = 9.0                → [6.1, 9.0]
const EXPECTED_SYNCED_ENDS = [1.2, 5.0, 6.1, 9.0];
const EXPECTED_SYNCED_STARTS = [0, 1.2, 5.0, 6.1];

// Even-split (today's behaviour): 4 words, 9.0/4 = 2.25s each.
const EXPECTED_EVEN_ENDS = [2.25, 4.5, 6.75, 9.0];

const EPS = 1e-6;
const ends = (caps: Caption[]) => caps.map((c) => c.endSec);
const starts = (caps: Caption[]) => caps.map((c) => c.startSec);

describe("#742 caption↔voiceover sync", () => {
  test("RED: even-split (no alignment) drifts > 1.0s from the real voice timing", () => {
    const even = buildCaptions(SCRIPT, { durationSec: DURATION }, { maxWords: 1 });
    // Sanity: even-split is what it always was.
    even.forEach((c, i) => expect(c.endSec).toBeCloseTo(EXPECTED_EVEN_ENDS[i], 6));

    // Max boundary drift between even-split and the real alignment-true times,
    // over the INTERNAL boundaries (the final boundary is the clip end in both).
    let maxDrift = 0;
    for (let i = 0; i < even.length - 1; i++) {
      maxDrift = Math.max(maxDrift, Math.abs(even[i].endSec - EXPECTED_SYNCED_ENDS[i]));
    }
    expect(maxDrift).toBeGreaterThan(1.0); // the bug: captions visibly out of sync
  });

  test("GREEN: with real char end-times, every caption lands on the voice (< 0.05s)", () => {
    const synced = buildCaptions(
      SCRIPT,
      { durationSec: DURATION, charEndTimesSec: CHAR_END },
      { maxWords: 1 },
    );
    expect(synced).toHaveLength(4);
    synced.forEach((c, i) => {
      expect(c.startSec).toBeCloseTo(EXPECTED_SYNCED_STARTS[i], 6);
      expect(c.endSec).toBeCloseTo(EXPECTED_SYNCED_ENDS[i], 6);
    });

    // The drift the RED test measured is now essentially gone.
    let maxDrift = 0;
    for (let i = 0; i < synced.length - 1; i++) {
      maxDrift = Math.max(maxDrift, Math.abs(synced[i].endSec - EXPECTED_SYNCED_ENDS[i]));
    }
    expect(maxDrift).toBeLessThan(0.05);
  });

  test("coverage contract preserved: synced track still starts at 0, no gaps, ends at duration", () => {
    const track = buildCaptionTrack(
      SCRIPT,
      { durationSec: DURATION, charEndTimesSec: CHAR_END },
      { maxWords: 1 },
    );
    expect(track.durationSec).toBe(DURATION);
    expect(() =>
      assertCaptionsCoverClip(track.captions, { durationSec: DURATION }),
    ).not.toThrow();
    expect(track.pathLine).toContain("clean=true");
  });

  test("backward compatible: omitting alignment is byte-for-byte the old even-split", () => {
    const a = buildCaptions(SCRIPT, { durationSec: DURATION }, { maxWords: 1 });
    expect(ends(a)).toEqual(EXPECTED_EVEN_ENDS);
    expect(starts(a)[0]).toBe(0);
  });

  test("guard: an alignment whose length ≠ script length falls back to even-split (no throw)", () => {
    const bad = CHAR_END.slice(0, 3); // wrong length on purpose
    let caps: Caption[] = [];
    expect(() => {
      caps = buildCaptions(
        SCRIPT,
        { durationSec: DURATION, charEndTimesSec: bad },
        { maxWords: 1 },
      );
    }).not.toThrow();
    expect(ends(caps)).toEqual(EXPECTED_EVEN_ENDS); // even-split, not the (invalid) alignment
  });

  test("guard: a non-monotonic alignment falls back to even-split (never an inverted caption)", () => {
    // Right length, but time goes backwards at index 3 — malformed provider data.
    const nonMonotonic = [1.0, 1.2, 2.0, 0.5, 6.0, 6.1, 9.0];
    const caps = buildCaptions(
      SCRIPT,
      { durationSec: DURATION, charEndTimesSec: nonMonotonic },
      { maxWords: 1 },
    );
    expect(ends(caps)).toEqual(EXPECTED_EVEN_ENDS); // rejected → even-split
    // and no caption ever runs backwards
    caps.forEach((c) => expect(c.endSec).toBeGreaterThanOrEqual(c.startSec));
  });

  test("guard: a non-finite alignment entry falls back to even-split", () => {
    const withNaN = [1.0, 1.2, 2.0, NaN, 6.0, 6.1, 9.0];
    const caps = buildCaptions(
      SCRIPT,
      { durationSec: DURATION, charEndTimesSec: withNaN },
      { maxWords: 1 },
    );
    expect(ends(caps)).toEqual(EXPECTED_EVEN_ENDS);
  });
});
