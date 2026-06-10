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

  // ── #808 — the three baked demo rules, as the config SSOT contract ──
  it("RULE 1: the perceptible animated background is the DEFAULT (not opt-in)", () => {
    expect(CONFIG.demo.animatedBackgroundDefault).toBe(true);
    expect(CONFIG.demo.backgroundScrimOpacity).toBeGreaterThan(0);
    expect(CONFIG.demo.backgroundScrimOpacity).toBeLessThanOrEqual(1);
  });

  it("RULE 2: the mobile-proxy caps are baked — ~15MB hard ceiling, ~8MB target, ≤720p", () => {
    const mp = CONFIG.demo.mobileProxy;
    expect(mp.maxBytes).toBe(15 * 1024 * 1024); // hard ceiling
    expect(mp.targetBytes).toBeLessThan(mp.maxBytes); // target under the ceiling
    expect(mp.targetBytes).toBe(8 * 1024 * 1024);
    expect(mp.maxEdgePx).toBe(720); // 720p class
    expect(mp.crf).toBeGreaterThan(0);
    expect(mp.audioBitrateK).toBeGreaterThan(0);
  });

  it("RULE 3: the ~90s target + acceptance window are baked, with target inside [min,max]", () => {
    expect(CONFIG.demo.durationTargetSec).toBe(90);
    expect(CONFIG.demo.durationAcceptanceMinSec).toBe(80);
    expect(CONFIG.demo.durationAcceptanceMaxSec).toBe(100);
    // the target sits inside the window, and the window admits the real ~99s voiced cut
    expect(CONFIG.demo.durationTargetSec).toBeGreaterThanOrEqual(CONFIG.demo.durationAcceptanceMinSec);
    expect(CONFIG.demo.durationTargetSec).toBeLessThanOrEqual(CONFIG.demo.durationAcceptanceMaxSec);
    expect(CONFIG.demo.durationAcceptanceMaxSec).toBeGreaterThanOrEqual(99.18); // ~99s cut not truncated
  });
});
