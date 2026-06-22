import { assertBrandFontsLoaded, type FontFaceLike } from "../fontGate";
import { INTER_WEIGHTS, BRAND_FONT_FAMILY } from "../brandTokens";

// #1156 — the fonts-loaded gate is the TRIPWIRE that makes a future broken Inter bundle FAIL the
// Remotion render LOUDLY instead of silently rendering Helvetica. These tests prove BOTH ends:
// it PASSES when Inter is genuinely loaded, and it FAILS-CLOSED on every way the bundle can break —
// crucially including the silent-fallback trap where document.fonts.check() LIES (returns true for a
// missing family because the UA would satisfy the request from a system font).

/** A fully-loaded Inter set: one loaded FontFace per bundled weight. */
function loadedInterFaces(): FontFaceLike[] {
  return INTER_WEIGHTS.map(() => ({ family: BRAND_FONT_FAMILY, status: "loaded" }));
}

/** A check() that behaves like the spec when Inter IS loaded — true for any Inter request. */
const checkAlwaysTrue = (_spec: string) => true;

describe("#1156 fonts-loaded gate (assertBrandFontsLoaded)", () => {
  it("PASSES when the brand font is genuinely loaded (faces present + every weight checks true)", () => {
    expect(() =>
      assertBrandFontsLoaded({ faces: loadedInterFaces(), check: checkAlwaysTrue }),
    ).not.toThrow();
  });

  it("FAILS-CLOSED when NO Inter face is in the set even though check() lies true (the silent-fallback trap)", () => {
    // The exact #1156 regression: no @font-face loaded, so the UA would render Helvetica — but
    // FontFaceSet.check() returns TRUE because it would match a system font. The gate must STILL throw.
    expect(() =>
      assertBrandFontsLoaded({ faces: [], check: checkAlwaysTrue }),
    ).toThrow(/no LOADED "Inter" FontFace|family absent/i);
  });

  it("FAILS-CLOSED when the Inter face is present but NOT yet loaded (status !== loaded)", () => {
    const unloaded: FontFaceLike[] = INTER_WEIGHTS.map(() => ({
      family: BRAND_FONT_FAMILY,
      status: "unloaded",
    }));
    expect(() =>
      assertBrandFontsLoaded({ faces: unloaded, check: checkAlwaysTrue }),
    ).toThrow(/none status==="loaded"|no LOADED/i);
  });

  it("FAILS-CLOSED when a face is loaded but a required weight's check() is false (partial bundle)", () => {
    // Faces are loaded so check (1) passes, but weight 800 failed to load → check() false for it.
    const failWeight = 800;
    const partialCheck = (spec: string) => !spec.includes(`${failWeight} `);
    expect(() =>
      assertBrandFontsLoaded({ faces: loadedInterFaces(), check: partialCheck }),
    ).toThrow(new RegExp(`weight\\(s\\) ${failWeight}|${failWeight} —`));
  });

  it("ignores faces of OTHER families when deciding the brand is loaded", () => {
    const onlyOtherFamily: FontFaceLike[] = [{ family: "Roboto", status: "loaded" }];
    expect(() =>
      assertBrandFontsLoaded({ faces: onlyOtherFamily, check: checkAlwaysTrue }),
    ).toThrow(/no LOADED "Inter" FontFace|family absent/i);
  });

  it("defaults to the bundled INTER_WEIGHTS (400/600/700/800), so a missing 700 fails even if 400 is fine", () => {
    const checkMissing700 = (spec: string) => !spec.includes("700 ");
    expect(() =>
      assertBrandFontsLoaded({ faces: loadedInterFaces(), check: checkMissing700 }),
    ).toThrow(/700/);
  });
});
