/**
 * P4b — captions plan (the RED acceptance test lfah must turn green).
 *
 * Scope (operator MCQ 2026-06-08): take the spoken script and the voice clip's REAL length, and cut the
 * script into on-screen caption chunks, each with a start/end time. No video, no rendering yet — just the
 * timed caption track that a renderer will later draw over the voiceover. Three rules the operator picked:
 *
 *   (1) TIMING = even split by words. Every word gets an equal slice of the clip's length, so each caption's
 *       on-screen time is proportional to how many words it holds (a 5-word caption lasts ~2.5x a 2-word one).
 *   (2) SIZE = few words per caption (phone-friendly). No caption holds more than MAX_WORDS_PER_CAPTION words
 *       (default 5); words are grouped in order and never cut, dropped, reordered, or invented.
 *   (3) LENGTH = read the REAL length from the voice clip (clip.durationSec) — NOT a word-count estimate.
 *       The same script with a different clip length must produce a track that spans exactly that length.
 *
 * The caption track must fully cover the clip with no gaps and no overlaps: the first caption starts at 0,
 * each caption's end is the next caption's start, and the last caption's end equals clip.durationSec.
 *
 * Do NOT modify this test.
 */
import {
  MAX_WORDS_PER_CAPTION,
  splitCaptionText,
  buildCaptions,
  buildCaptionTrack,
  assertCaptionsCoverClip,
  Caption,
  CaptionTrack,
  VoiceClipLike,
} from "../captions";

const SCRIPT = "Meet the local first agent harness it never loses a bug built"; // 12 words
const CLIP: VoiceClipLike = { durationSec: 6 };

const wordsOf = (s: string): string[] => s.trim().split(/\s+/);

describe("P4b captions — size cap constant", () => {
  test("the phone-friendly cap is a small whole number (5)", () => {
    expect(MAX_WORDS_PER_CAPTION).toBe(5);
  });
});

describe("P4b captions — splitCaptionText (group words, never alter them)", () => {
  test("no caption chunk holds more than the cap, and none is empty", () => {
    const chunks = splitCaptionText(SCRIPT);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      const n = wordsOf(chunk).length;
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(MAX_WORDS_PER_CAPTION);
    }
  });

  test("joining the chunks reproduces the script's words EXACTLY (no invent/drop/reorder)", () => {
    const chunks = splitCaptionText(SCRIPT);
    const rejoined = chunks.flatMap(wordsOf);
    expect(rejoined).toEqual(wordsOf(SCRIPT));
  });

  test("12 words with the default cap of 5 splits into chunks of 5, 5, 2", () => {
    const chunks = splitCaptionText(SCRIPT);
    expect(chunks.map((c) => wordsOf(c).length)).toEqual([5, 5, 2]);
  });

  test("honors an explicit smaller cap", () => {
    const chunks = splitCaptionText(SCRIPT, 3);
    for (const chunk of chunks) {
      expect(wordsOf(chunk).length).toBeLessThanOrEqual(3);
    }
    expect(chunks.flatMap(wordsOf)).toEqual(wordsOf(SCRIPT)); // 12 words → 3,3,3,3
    expect(chunks.length).toBe(4);
  });
});

describe("P4b captions — buildCaptions (time each caption by its share of the words)", () => {
  test("each caption carries its text, its word count, and a start/end time", () => {
    const caps: Caption[] = buildCaptions(SCRIPT, CLIP);
    expect(caps.length).toBe(3);
    for (const c of caps) {
      expect(typeof c.text).toBe("string");
      expect(c.text.length).toBeGreaterThan(0);
      expect(c.wordCount).toBe(wordsOf(c.text).length);
      expect(c.endSec).toBeGreaterThan(c.startSec); // time always moves forward
    }
  });

  test("the track starts at 0 and ends exactly at the clip's real length", () => {
    const caps = buildCaptions(SCRIPT, CLIP);
    expect(caps[0].startSec).toBeCloseTo(0, 6);
    expect(caps[caps.length - 1].endSec).toBeCloseTo(CLIP.durationSec, 6);
  });

  test("captions are back-to-back: no gaps and no overlaps", () => {
    const caps = buildCaptions(SCRIPT, CLIP);
    for (let i = 0; i < caps.length - 1; i++) {
      expect(caps[i].endSec).toBeCloseTo(caps[i + 1].startSec, 6);
    }
  });

  test("time is proportional to words: every caption gets the SAME seconds-per-word", () => {
    const caps = buildCaptions(SCRIPT, CLIP);
    const totalWords = wordsOf(SCRIPT).length; // 12
    const secPerWord = CLIP.durationSec / totalWords; // 0.5s
    for (const c of caps) {
      expect((c.endSec - c.startSec) / c.wordCount).toBeCloseTo(secPerWord, 6);
    }
    // concretely: chunks 5,5,2 over 6s → 2.5s, 2.5s, 1.0s
    expect(caps.map((c) => c.endSec - c.startSec)).toEqual([
      expect.closeTo(2.5, 6),
      expect.closeTo(2.5, 6),
      expect.closeTo(1.0, 6),
    ]);
  });

  test("reads the REAL clip length: a DIFFERENT durationSec stretches the track to match", () => {
    const longCaps = buildCaptions(SCRIPT, { durationSec: 12 });
    expect(longCaps[0].startSec).toBeCloseTo(0, 6);
    expect(longCaps[longCaps.length - 1].endSec).toBeCloseTo(12, 6); // spans the new length exactly
    // double the clip length → double every caption's duration (proves it is NOT a fixed word-count estimate)
    const baseCaps = buildCaptions(SCRIPT, CLIP);
    for (let i = 0; i < baseCaps.length; i++) {
      const baseDur = baseCaps[i].endSec - baseCaps[i].startSec;
      const longDur = longCaps[i].endSec - longCaps[i].startSec;
      expect(longDur).toBeCloseTo(baseDur * 2, 6);
    }
  });

  test("a script shorter than the cap becomes a single caption spanning the whole clip", () => {
    const caps = buildCaptions("hello there", { durationSec: 4 });
    expect(caps.length).toBe(1);
    expect(caps[0].startSec).toBeCloseTo(0, 6);
    expect(caps[0].endSec).toBeCloseTo(4, 6);
    expect(caps[0].text).toBe("hello there");
  });
});

describe("P4b captions — buildCaptionTrack (track + greppable proof line)", () => {
  test("bundles the captions, the clip length, and a CAPTION-PATH proof line", () => {
    const track: CaptionTrack = buildCaptionTrack(SCRIPT, CLIP);
    expect(track.captions).toHaveLength(3);
    expect(track.durationSec).toBeCloseTo(6, 6);
    // a machine-readable proof line, like the voiceover's VOICE-PATH: records the counts + that it covers cleanly
    expect(track.pathLine).toContain("CAPTION-PATH:");
    expect(track.pathLine).toContain("words=12");
    expect(track.pathLine).toContain("captions=3");
    expect(track.pathLine).toContain("clean=true");
  });
});

describe("P4b captions — assertCaptionsCoverClip (must fully cover the clip)", () => {
  test("passes silently for a real, gap-free track", () => {
    const caps = buildCaptions(SCRIPT, CLIP);
    expect(() => assertCaptionsCoverClip(caps, CLIP)).not.toThrow();
  });

  test("HARD-FAILS when there is a gap (last caption ends before the clip)", () => {
    const caps = buildCaptions(SCRIPT, CLIP);
    const broken = caps.map((c, i) =>
      i === caps.length - 1 ? { ...c, endSec: c.endSec - 1 } : c,
    );
    expect(() => assertCaptionsCoverClip(broken, CLIP)).toThrow();
  });

  test("HARD-FAILS when captions overlap", () => {
    const caps = buildCaptions(SCRIPT, CLIP);
    const broken = caps.map((c, i) =>
      i === 0 ? { ...c, endSec: c.endSec + 1 } : c,
    );
    expect(() => assertCaptionsCoverClip(broken, CLIP)).toThrow();
  });
});
