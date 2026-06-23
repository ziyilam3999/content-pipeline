/**
 * #1164 — aspect-per-videoType BY CONSTRUCTION. Asserts each videoType resolves to its declared aspect
 * (DEMO=16:9, INTRO=9:16) and that output pixel dimensions FOLLOW from it (config SSOT), so a demo can
 * never accidentally render 9:16. Pure data — no ffmpeg / network.
 */
import {
  VIDEO_TYPE_ASPECT,
  aspectForVideoType,
  dimensionsForVideoType,
} from "../demoCategoryRecipe";
import { renderAspectForVideoType } from "../renderSpec";
import { CONFIG } from "../../config";

describe("#1164 videoType -> declared aspect", () => {
  it("DEMO declares 16:9, INTRO declares 9:16", () => {
    expect(VIDEO_TYPE_ASPECT.demo).toBe("16:9");
    expect(VIDEO_TYPE_ASPECT.intro).toBe("9:16");
    expect(aspectForVideoType("demo")).toBe("16:9");
    expect(aspectForVideoType("intro")).toBe("9:16");
  });

  it("default (no arg) resolves to demo", () => {
    expect(aspectForVideoType()).toBe("16:9");
    expect(dimensionsForVideoType()).toEqual({ width: 1920, height: 1080 });
  });

  it("the SSOT lives in config and matches", () => {
    expect(CONFIG.videoTypeAspects.demo).toBe("16:9");
    expect(CONFIG.videoTypeAspects.intro).toBe("9:16");
    expect(VIDEO_TYPE_ASPECT).toEqual(CONFIG.videoTypeAspects);
  });
});

describe("#1164 output dimensions FOLLOW from the declared aspect", () => {
  it("demo -> 16:9 -> 1920x1080 (landscape)", () => {
    const d = dimensionsForVideoType("demo");
    expect(d).toEqual({ width: 1920, height: 1080 });
    expect(d.width).toBeGreaterThan(d.height); // a demo is ALWAYS landscape — never 9:16
  });

  it("intro -> 9:16 -> 1080x1920 (portrait)", () => {
    expect(dimensionsForVideoType("intro")).toEqual({ width: 1080, height: 1920 });
  });

  it("renderSpec.renderAspectForVideoType derives the same dims (name + pixels)", () => {
    expect(renderAspectForVideoType("demo")).toEqual({ name: "16:9", width: 1920, height: 1080 });
    expect(renderAspectForVideoType("intro")).toEqual({ name: "9:16", width: 1080, height: 1920 });
  });

  it("a demo can NEVER resolve to 9:16 by construction", () => {
    expect(dimensionsForVideoType("demo")).not.toEqual({ width: 1080, height: 1920 });
    expect(renderAspectForVideoType("demo").name).not.toBe("9:16");
  });
});
