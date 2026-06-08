/**
 * P4d — render-spec plan (the RED acceptance test lfah must turn green).
 *
 * This is the BLUEPRINT for the video (operator MCQ 2026-06-08). It takes the audio-visual plan from the
 * wiring step (the spoken script + the voice clip + the timed captions) plus a handle to the result-card
 * picture, and produces one render spec PER screen shape. No real video is rendered here — it is a plan a
 * renderer (e.g. Remotion) would follow.
 *
 * Picks:
 *   SHAPES = the three settled: square 1:1 (1080x1080), tall 9:16 (1080x1920), portrait 4:5 (1080x1350).
 *   DETAIL = layers + caption safe-band. Each shape carries: its pixel size, the three layers (the card
 *            picture centered, the voice audio track, the caption cues with their start/end times), and the
 *            captions sit in a SAFE BAND near the bottom (anchored at CAPTION_BAND_Y of the height) that
 *            stays clear of where a phone app paints its buttons.
 *
 * Do NOT modify this test.
 */
import {
  ASPECTS,
  CAPTION_BAND_Y,
  buildRenderSpecs,
  assertRenderSpecValid,
  Aspect,
  CaptionCue,
  RenderSpec,
  AudioVisualLike,
} from "../renderSpec";

// a stand-in audio-visual plan, shaped like what the wiring step (P4c) produces
const PLAN: AudioVisualLike = {
  script: "Meet the local first agent harness it never loses a bug built",
  voiceover: { clip: { durationSec: 6, audio: "AUDIO[elevenlabs:V1:60]" } },
  captions: {
    durationSec: 6,
    captions: [
      { text: "Meet the local first agent", startSec: 0, endSec: 2.5 },
      { text: "harness it never loses a", startSec: 2.5, endSec: 5.0 },
      { text: "bug built", startSec: 5.0, endSec: 6.0 },
    ],
  },
};
const IMAGE_REF = "card://result-card-9b47f49.png";

describe("P4d render-spec — shape + safe-band constants", () => {
  test("the three settled shapes are present with the right pixel sizes", () => {
    const byName: Record<string, Aspect> = Object.fromEntries(ASPECTS.map((a) => [a.name, a]));
    expect(byName["1:1"]).toMatchObject({ width: 1080, height: 1080 });
    expect(byName["9:16"]).toMatchObject({ width: 1080, height: 1920 });
    expect(byName["4:5"]).toMatchObject({ width: 1080, height: 1350 });
    expect(ASPECTS).toHaveLength(3);
  });

  test("the caption safe-band sits in the lower portion of the frame, not at the very edge", () => {
    expect(CAPTION_BAND_Y).toBeGreaterThan(0.5); // below the middle
    expect(CAPTION_BAND_Y).toBeLessThan(1); // not off-screen
    expect(CAPTION_BAND_Y).toBeCloseTo(0.78, 2); // the phone-friendly default
  });
});

describe("P4d render-spec — buildRenderSpecs (one spec per shape)", () => {
  test("produces one spec for each settled shape by default", () => {
    const specs: RenderSpec[] = buildRenderSpecs(PLAN, IMAGE_REF);
    expect(specs).toHaveLength(3);
    expect(specs.map((s) => s.aspect.name).sort()).toEqual(["1:1", "4:5", "9:16"]);
  });

  test("each spec carries its shape's size and the video's real length", () => {
    const specs = buildRenderSpecs(PLAN, IMAGE_REF);
    for (const s of specs) {
      expect(s.width).toBe(s.aspect.width);
      expect(s.height).toBe(s.aspect.height);
      expect(s.durationSec).toBe(6); // = the voice clip's real length
    }
  });

  test("the picture layer is CENTERED in each shape", () => {
    const specs = buildRenderSpecs(PLAN, IMAGE_REF);
    for (const s of specs) {
      expect(s.image.ref).toBe(IMAGE_REF);
      expect(s.image.x).toBeCloseTo(s.width / 2, 6);
      expect(s.image.y).toBeCloseTo(s.height / 2, 6);
    }
  });

  test("the audio layer points at the voice clip and matches its length", () => {
    const specs = buildRenderSpecs(PLAN, IMAGE_REF);
    for (const s of specs) {
      expect(s.audio.ref).toBe("AUDIO[elevenlabs:V1:60]");
      expect(s.audio.durationSec).toBe(6);
    }
  });

  test("the caption layer carries the SAME timed cues, in a bottom safe-band per shape", () => {
    const specs = buildRenderSpecs(PLAN, IMAGE_REF);
    for (const s of specs) {
      const cues: CaptionCue[] = s.captions.cues;
      expect(cues).toHaveLength(3);
      expect(cues.map((c) => c.text)).toEqual([
        "Meet the local first agent",
        "harness it never loses a",
        "bug built",
      ]);
      // cues cover the whole clip (start at 0, end at the real length)
      expect(cues[0].startSec).toBeCloseTo(0, 6);
      expect(cues[cues.length - 1].endSec).toBeCloseTo(6, 6);
      // the safe band is a real pixel row in the lower portion, clear of the very bottom
      const expectedBandY = Math.round(s.height * CAPTION_BAND_Y);
      expect(s.captions.bandY).toBe(expectedBandY);
      expect(s.captions.bandY).toBeGreaterThan(s.height / 2); // below the middle
      expect(s.captions.bandY).toBeLessThan(s.height); // on-screen
    }
  });

  test("honors an explicit shape list (e.g. only the tall shape)", () => {
    const tall: Aspect = { name: "9:16", width: 1080, height: 1920 };
    const specs = buildRenderSpecs(PLAN, IMAGE_REF, { aspects: [tall] });
    expect(specs).toHaveLength(1);
    expect(specs[0].aspect.name).toBe("9:16");
  });

  test("each spec has a greppable RENDER-PATH proof line", () => {
    const specs = buildRenderSpecs(PLAN, IMAGE_REF);
    const tall = specs.find((s) => s.aspect.name === "9:16")!;
    expect(tall.pathLine).toContain("RENDER-PATH:");
    expect(tall.pathLine).toContain('aspect="9:16"');
    expect(tall.pathLine).toContain("size=1080x1920");
    expect(tall.pathLine).toContain("cues=3");
  });
});

describe("P4d render-spec — assertRenderSpecValid (a spec must be coherent)", () => {
  test("passes silently for a real spec", () => {
    const specs = buildRenderSpecs(PLAN, IMAGE_REF);
    for (const s of specs) {
      expect(() => assertRenderSpecValid(s)).not.toThrow();
    }
  });

  test("HARD-FAILS when the caption band would fall outside the frame", () => {
    const specs = buildRenderSpecs(PLAN, IMAGE_REF);
    const broken: RenderSpec = {
      ...specs[0],
      captions: { ...specs[0].captions, bandY: specs[0].height + 50 }, // off the bottom edge
    };
    expect(() => assertRenderSpecValid(broken)).toThrow();
  });

  test("HARD-FAILS when the audio length does not match the spec length", () => {
    const specs = buildRenderSpecs(PLAN, IMAGE_REF);
    const broken: RenderSpec = {
      ...specs[0],
      audio: { ...specs[0].audio, durationSec: specs[0].durationSec + 3 },
    };
    expect(() => assertRenderSpecValid(broken)).toThrow();
  });
});
