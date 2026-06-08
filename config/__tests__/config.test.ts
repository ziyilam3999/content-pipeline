import { CONFIG, AspectRatio } from "../index";

describe("CONFIG (single source of truth)", () => {
  it("ships all four aspect presets with sane dimensions", () => {
    const aspects: AspectRatio[] = ["16:9", "9:16", "1:1", "4:5"];
    for (const a of aspects) {
      const p = CONFIG.aspects[a];
      expect(p.width).toBeGreaterThan(0);
      expect(p.height).toBeGreaterThan(0);
    }
    expect(CONFIG.aspects["16:9"].width).toBeGreaterThan(CONFIG.aspects["16:9"].height);
    expect(CONFIG.aspects["9:16"].height).toBeGreaterThan(CONFIG.aspects["9:16"].width);
    expect(CONFIG.aspects["1:1"].width).toBe(CONFIG.aspects["1:1"].height);
    expect(CONFIG.aspects["4:5"].height).toBeGreaterThan(CONFIG.aspects["4:5"].width); // portrait
  });

  it("defaults to the X-first shape set (1:1, 9:16, 4:5) and excludes landscape 16:9", () => {
    expect(CONFIG.defaultAspects).toEqual(["1:1", "9:16", "4:5"]);
    expect(CONFIG.defaultAspects).not.toContain("16:9");
    expect(CONFIG.image.generativeBackgroundDefault).toBe(false); // generative art opt-in, off by default
  });

  it("uses a subscription-token Claude for copy, never a pay-per-token API key", () => {
    expect(CONFIG.models.copy.provider).toBe("claude-max-oauth");
    expect(CONFIG.models.copy.localFallback).toContain("qwen");
  });

  it("defaults publishing to dry-run and reads the social-set id from the environment", () => {
    expect(CONFIG.publish.dryRunDefault).toBe(true);
    expect(CONFIG.publish.socialSetIdEnv).toBe("TYPEFULLY_SOCIAL_SET_ID");
    // no personal/account identifier is hardcoded in the committed config
    expect(JSON.stringify(CONFIG)).not.toMatch(/\b3123\d{2}\b/);
  });
});
