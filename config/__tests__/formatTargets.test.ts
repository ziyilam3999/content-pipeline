import { CONFIG, dimensionsForFormatTarget, AspectRatio } from "../index";
import {
  VIDEO_TYPE_ASPECT,
  aspectForVideoType,
} from "../../video/demoCategoryRecipe";

/**
 * #1319 — the format-targets SSOT contract: surface→shape defaults derive their pixel dims from
 * `CONFIG.aspects` (no magic numbers), the X-feed variant is a member of the always-produced bundle,
 * and the existing videoType / hero SSOTs do NOT regress. Pure data assertions — no Playwright / render.
 */
describe("CONFIG.formatTargets (#1319 — surface→shape SSOT)", () => {
  // AC-1
  it("video master == 9:16 1080×1920", () => {
    expect(CONFIG.formatTargets.videoMaster).toBe("9:16");
    expect(dimensionsForFormatTarget("videoMaster")).toEqual({ width: 1080, height: 1920 });
  });

  // AC-2
  it("X-feed video variant == 1:1 1080×1080", () => {
    expect(CONFIG.formatTargets.xFeedVideo).toBe("1:1");
    expect(dimensionsForFormatTarget("xFeedVideo")).toEqual({ width: 1080, height: 1080 });
  });

  // AC-3
  it("static default == 4:5 1080×1350", () => {
    expect(CONFIG.formatTargets.staticDefault).toBe("4:5");
    expect(dimensionsForFormatTarget("staticDefault")).toEqual({ width: 1080, height: 1350 });
  });

  // AC-4 — dims sourced from CONFIG.aspects for EVERY target (no magic numbers)
  it("resolver sources dims from CONFIG.aspects for every target", () => {
    const keys = Object.keys(CONFIG.formatTargets) as (keyof typeof CONFIG.formatTargets)[];
    for (const k of keys) {
      expect(dimensionsForFormatTarget(k)).toEqual(CONFIG.aspects[CONFIG.formatTargets[k]]);
    }
  });

  // AC-8 — always-produce LINKAGE (de-vacuumed): the X-feed target IS in the always-produced bundle
  it("the X-feed target is a member of the always-produced defaultAspects bundle", () => {
    expect(CONFIG.defaultAspects).toContain(CONFIG.formatTargets.xFeedVideo);
    expect(CONFIG.defaultAspects).not.toContain("16:9");
  });

  // AC-9 — master/hero SSOTs agree (no drift)
  it("publish.heroVideoAspect agrees with formatTargets.videoMaster", () => {
    expect(CONFIG.publish.heroVideoAspect).toBe(CONFIG.formatTargets.videoMaster);
    expect(CONFIG.formatTargets.videoMaster).toBe("9:16");
  });

  // AC-10 — static center-safe guidance present + sane
  it("staticCenterSafeFraction is a number in (0, 1]", () => {
    expect(typeof CONFIG.staticCenterSafeFraction).toBe("number");
    expect(CONFIG.staticCenterSafeFraction).toBeGreaterThan(0);
    expect(CONFIG.staticCenterSafeFraction).toBeLessThanOrEqual(1);
  });

  // #1326 — center-safe layout config shape (the cited IG-grid 3:4 premise + inset knob)
  it("staticSafeArea.aspectRatio is a positive number and insetFraction ∈ (0,1]", () => {
    expect(typeof CONFIG.staticSafeArea.aspectRatio).toBe("number");
    expect(CONFIG.staticSafeArea.aspectRatio).toBeGreaterThan(0);
    expect(typeof CONFIG.staticSafeArea.insetFraction).toBe("number");
    expect(CONFIG.staticSafeArea.insetFraction).toBeGreaterThan(0);
    expect(CONFIG.staticSafeArea.insetFraction).toBeLessThanOrEqual(1);
  });

  // AC-7 — no regression: existing videoType aspects unchanged
  it("does not regress the existing videoType aspect SSOT", () => {
    expect(CONFIG.videoTypeAspects).toEqual({ demo: "16:9", intro: "9:16", proof: "9:16" });
    expect(aspectForVideoType("demo")).toBe("16:9");
    expect(aspectForVideoType("intro")).toBe("9:16");
    expect(aspectForVideoType("proof")).toBe("9:16");
    // the SSOT identity holds — VIDEO_TYPE_ASPECT IS CONFIG.videoTypeAspects
    expect(VIDEO_TYPE_ASPECT).toBe(CONFIG.videoTypeAspects as unknown as typeof VIDEO_TYPE_ASPECT);
  });

  it("every format target value is a real AspectRatio key", () => {
    const valid: AspectRatio[] = ["16:9", "9:16", "1:1", "4:5"];
    for (const v of Object.values(CONFIG.formatTargets)) {
      expect(valid).toContain(v);
    }
  });
});
