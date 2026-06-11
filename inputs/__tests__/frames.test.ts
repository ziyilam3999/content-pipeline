/**
 * #824 — gated invariants for the frame-ingest manifest. The Remotion composition that consumes
 * these frames is outside the tsc/jest gate, so the parity / brand-scrub / contain-not-cover guards
 * are proven HERE (Binary AC 4/5/6).
 */

import {
  type FrameManifest,
  UI_FRAME_FIT,
  validateFrameManifest,
  assertBrandClean,
  assertUiFrameFit,
} from "../frames";

function frames(n: number): FrameManifest {
  return Array.from({ length: n }, (_, i) => ({
    path: `/tmp/frame-${i}.png`,
    stepLabel: `step ${i}`,
    narrationSegmentIndex: i,
  }));
}
function segments(m: number): { text: string }[] {
  return Array.from({ length: m }, (_, i) => ({ text: `segment ${i}` }));
}

describe("validateFrameManifest — parity (AC-4)", () => {
  it("THROWS when frame count != narration segment count (N != M)", () => {
    expect(() => validateFrameManifest(frames(5), segments(6))).toThrow();
    expect(() => validateFrameManifest(frames(7), segments(6))).toThrow();
  });

  it("passes when N == M", () => {
    expect(() => validateFrameManifest(frames(6), segments(6))).not.toThrow();
    expect(() => validateFrameManifest(frames(1), segments(1))).not.toThrow();
  });

  it("THROWS on a missing/empty path even when the count matches", () => {
    const bad: FrameManifest = [
      { path: "", stepLabel: "a", narrationSegmentIndex: 0 },
      { path: "/tmp/x.png", stepLabel: "b", narrationSegmentIndex: 1 },
    ];
    expect(() => validateFrameManifest(bad, segments(2))).toThrow();
    const blank: FrameManifest = [{ path: "   ", stepLabel: "a", narrationSegmentIndex: 0 }];
    expect(() => validateFrameManifest(blank, segments(1))).toThrow();
  });
});

describe("assertUiFrameFit — contain-not-cover (AC-5)", () => {
  it("THROWS on cover", () => {
    expect(() => assertUiFrameFit("cover")).toThrow();
  });
  it("returns void on contain", () => {
    expect(assertUiFrameFit("contain")).toBeUndefined();
  });
  it("the shared SSOT const is contain (so the view can't drift to cover)", () => {
    expect(UI_FRAME_FIT).toBe("contain");
    expect(() => assertUiFrameFit(UI_FRAME_FIT)).not.toThrow();
  });
});

describe("assertBrandClean — brand-scrub (AC-6)", () => {
  it.each(["shopee", "Shopee", "SHOPEE", "sea limited", "Sea Limited", "garena", "Garena"])(
    "THROWS on forbidden token %p (case-insensitive, anywhere in the text)",
    (token) => {
      expect(() => assertBrandClean(token)).toThrow();
      expect(() => assertBrandClean(`a caption mentioning ${token} mid-string`)).toThrow();
    },
  );

  it.each(["lfah", "forge-harness", "forge", "slugify", "SWE-bench", "ziyilam3999"])(
    "passes for the allowed neutral token %p",
    (token) => {
      expect(() => assertBrandClean(token)).not.toThrow();
      expect(() => assertBrandClean(`now forge_evaluate runs on ${token}`)).not.toThrow();
    },
  );
});
