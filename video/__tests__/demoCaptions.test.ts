/**
 * #775 — unit tests for the demo caption module (pure; the Remotion composition that
 * consumes these is out of the jest gate, so this is where the caption timing + the
 * reserved-band geometry + the parity invariant are proven).
 */

import {
  CAPTION_RESERVE_FRACTION,
  reserveCaptionBand,
  captionBandTopY,
  buildDemoCaptionCues,
  assertVoicedDemoHasCaptions,
} from "../demoCaptions";
import { demoLayout } from "../demoLayout";
import { ASPECTS } from "../renderSpec";

describe("reserveCaptionBand", () => {
  it("grows the bottom padding by the reserve and shrinks the usable span; top pad unchanged", () => {
    const base = demoLayout(1080, 1920); // 9:16, fill
    const reserved = reserveCaptionBand(base);
    expect(reserved.padBottomFraction).toBeCloseTo(base.padBottomFraction + CAPTION_RESERVE_FRACTION, 10);
    expect(reserved.padTopFraction).toBe(base.padTopFraction);
    expect(reserved.usableSpanFraction).toBeCloseTo(
      1 - base.padTopFraction - (base.padBottomFraction + CAPTION_RESERVE_FRACTION),
      10,
    );
    // does not mutate the input
    expect(base.padBottomFraction).not.toBe(reserved.padBottomFraction);
  });

  it("works for the square cut too (centered layout still gets a bigger bottom pad)", () => {
    const base = demoLayout(1080, 1080); // 1:1, centered
    const reserved = reserveCaptionBand(base);
    expect(reserved.padBottomFraction).toBeCloseTo(base.padBottomFraction + CAPTION_RESERVE_FRACTION, 10);
    expect(reserved.fill).toBe(base.fill);
  });
});

describe("captionBandTopY", () => {
  it.each(ASPECTS)("places the band BELOW the content bottom and inside the frame ($name)", (aspect) => {
    const base = demoLayout(aspect.width, aspect.height);
    const reserved = reserveCaptionBand(base);
    const bandY = captionBandTopY(reserved, aspect.height);
    const contentBottom = aspect.height * (1 - reserved.padBottomFraction);
    // band sits strictly below the content area (no overlap) and within the frame
    expect(bandY).toBeGreaterThan(contentBottom);
    expect(bandY).toBeLessThan(aspect.height);
  });

  it("throws on a non-positive height", () => {
    const reserved = reserveCaptionBand(demoLayout(1080, 1920));
    expect(() => captionBandTopY(reserved, 0)).toThrow(/height must be positive/);
  });
});

describe("buildDemoCaptionCues", () => {
  const script = "one two three four five six seven eight nine ten";

  it("returns a non-empty track that covers the clip with even-split (no alignment)", () => {
    const cues = buildDemoCaptionCues(script, { durationSec: 20 });
    expect(cues.length).toBeGreaterThan(0);
    expect(cues[0].startSec).toBe(0);
    expect(cues[cues.length - 1].endSec).toBeCloseTo(20, 6);
  });

  it("syncs to the REAL per-character alignment when it lines up with the script", () => {
    // linear alignment: char i ends at (i+1)/len * durationSec; final == durationSec.
    const durationSec = 20;
    const charEndTimesSec = Array.from({ length: script.length }, (_, i) =>
      Number((((i + 1) / script.length) * durationSec).toFixed(4)),
    );
    charEndTimesSec[script.length - 1] = durationSec;
    const cues = buildDemoCaptionCues(script, { durationSec, charEndTimesSec });
    expect(cues.length).toBeGreaterThan(0);
    expect(cues[0].startSec).toBe(0);
    expect(cues[cues.length - 1].endSec).toBeCloseTo(durationSec, 6);
    // back-to-back, ascending
    for (let i = 1; i < cues.length; i++) {
      expect(cues[i].startSec).toBeCloseTo(cues[i - 1].endSec, 6);
    }
  });
});

describe("assertVoicedDemoHasCaptions (parity invariant)", () => {
  it("passes for a covering track", () => {
    const cues = buildDemoCaptionCues("alpha beta gamma delta", { durationSec: 10 });
    expect(() => assertVoicedDemoHasCaptions(cues, { durationSec: 10 })).not.toThrow();
  });

  it("throws on an EMPTY caption track (the silent-drop regression)", () => {
    expect(() => assertVoicedDemoHasCaptions([], { durationSec: 10 })).toThrow(/EMPTY caption track/);
  });

  it("throws when the track does not SPAN the clip (ends short)", () => {
    const cues = [{ text: "hi", startSec: 0, endSec: 4 }];
    expect(() => assertVoicedDemoHasCaptions(cues, { durationSec: 10 })).toThrow(/must span the audio/);
  });

  it("throws when the first caption does not start at 0", () => {
    const cues = [{ text: "hi", startSec: 1, endSec: 10 }];
    expect(() => assertVoicedDemoHasCaptions(cues, { durationSec: 10 })).toThrow(/expected 0/);
  });
});
