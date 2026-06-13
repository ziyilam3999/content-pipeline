/**
 * #824 Fable — CROSS-LAYER caption/media overlap gate (caption-overlap-fix).
 *
 * The operator found the synced captions overlapping the bottom row of the embedded output-beat media
 * (the card's stat pills, the demo's diagram row) DESPITE the existing within-layer safe-band checks.
 * Root cause: the caption band is sized in LEG 2 (voiceFable) and the media device in LEG 1
 * (captureFable); no check spanned the two layers. This test pins the cross-layer invariant BOTH ways:
 *   • the SHIPPED inset geometry PASSES (device bottom clears the band on every aspect), and
 *   • a media bbox that intersects the band FAILS — proving the gate actually catches the regression.
 */

import {
  FABLE_ASPECTS,
  CAP_BAND_H,
  OUTPUT_DEVICE,
  type FableAspect,
  type Rect,
  rectsIntersect,
  outputDeviceSpineRect,
  outputDeviceRectInAspect,
  captionBandRectInAspect,
  captionMediaOverlaps,
  assertNoCaptionMediaOverlap,
} from "../../video/fableLayout";

describe("#824 fableLayout — the SHIPPED layout has NO caption/media overlap (the PASS end)", () => {
  it("the inset output device clears the caption band on EVERY aspect", () => {
    expect(captionMediaOverlaps(FABLE_ASPECTS)).toEqual([]);
    expect(() => assertNoCaptionMediaOverlap(FABLE_ASPECTS)).not.toThrow();
    expect(() => assertNoCaptionMediaOverlap()).not.toThrow(); // default arg = FABLE_ASPECTS
  });

  it("on every aspect the device BOTTOM sits strictly above the caption-band TOP (clear gap)", () => {
    for (const a of FABLE_ASPECTS) {
      const dev = outputDeviceRectInAspect(a);
      const band = captionBandRectInAspect(a);
      expect(dev.bottom).toBeLessThan(band.top);
    }
  });

  it("the 1:1 aspect is the binding constraint and still clears (smallest gap, > 0)", () => {
    const a = FABLE_ASPECTS.find((x) => x.key === "1:1")!;
    const dev = outputDeviceRectInAspect(a);
    const band = captionBandRectInAspect(a);
    const gap = band.top - dev.bottom;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(80); // it IS the tightest — guards against silently over-shrinking the device
  });

  it("the device keeps the real card/video 9:16 portrait aspect, centered, inset into the upper region", () => {
    const s = outputDeviceSpineRect();
    expect(s.top).toBe(OUTPUT_DEVICE.top);
    expect(s.bottom).toBe(OUTPUT_DEVICE.bottom);
    expect((s.right - s.left) / (s.bottom - s.top)).toBeCloseTo(9 / 16, 4);
    expect((s.left + s.right) / 2).toBeCloseTo(540, 4); // horizontally centered in the 1080 spine
  });
});

describe("#824 fableLayout — the gate CATCHES an overlapping media bbox (the FAIL end)", () => {
  it("a caption band raised INTO the device span is flagged as an overlap", () => {
    // The pre-fix bug: a lower-third band high enough to cross the device. Device (9:16) spans y 150..1200,
    // so a band starting at y 1100 sits ON the device — must be caught.
    const overlapping: FableAspect = { key: "9:16-bad", width: 1080, height: 1920, cropY: 0, captionY: 1100, crop: "" };
    const hits = captionMediaOverlaps([overlapping]);
    expect(hits).toHaveLength(1);
    expect(hits[0].aspect).toBe("9:16-bad");
    expect(() => assertNoCaptionMediaOverlap([overlapping])).toThrow(/caption-overlap/i);
  });

  it("reproduces the SHIPPED-BUG geometry (full-height 86%-width device under a lower-third band) as a FAIL", () => {
    // The original captureFable device: top:54%/translate centered, aspect 9/16, width 86% → bottom ≈ 1862.
    // With the 9:16 caption band at y 1430 that device clearly intersected the band. Model it explicitly.
    const buggyDevice: Rect = { top: 211, bottom: 1862, left: 75, right: 1004 };
    const band9x16: Rect = { top: 1430, bottom: 1430 + CAP_BAND_H, left: 0, right: 1080 };
    expect(rectsIntersect(buggyDevice, band9x16)).toBe(true);
  });

  it("the assertion error names the offending aspect(s) so a future regression is debuggable", () => {
    const bad: FableAspect = { key: "1:1-bad", width: 1080, height: 1080, cropY: 420, captionY: 300, crop: "" };
    expect(() => assertNoCaptionMediaOverlap([bad])).toThrow(/1:1-bad/);
  });
});

describe("#824 fableLayout — rectsIntersect primitive (both ends)", () => {
  const base: Rect = { top: 0, bottom: 100, left: 0, right: 100 };
  it("returns true for genuinely overlapping rects", () => {
    expect(rectsIntersect(base, { top: 50, bottom: 150, left: 50, right: 150 })).toBe(true);
  });
  it("returns false for separated rects (and for merely touching edges — strict)", () => {
    expect(rectsIntersect(base, { top: 200, bottom: 300, left: 0, right: 100 })).toBe(false);
    expect(rectsIntersect(base, { top: 100, bottom: 200, left: 0, right: 100 })).toBe(false); // touching, not overlapping
  });
});
