import { staticAspect } from "../image";
import { CONFIG, AspectRatio } from "../../config";

/**
 * #1319 — the WIRED static-default contract. `renderImage`'s omitted-aspect default now resolves from
 * `CONFIG.formatTargets.staticDefault` via the pure `staticAspect()` seam, so a static promo graphic with
 * NO explicit aspect comes out 4:5 1080×1350 (filename `card-4x5.png`); an explicit aspect passes through
 * unchanged. Unit-testable without launching Chromium — the seam is pure.
 */
describe("staticAspect() (#1319 — wired static default)", () => {
  // AC-5 — no explicit aspect → 4:5 1080×1350, reading the SSOT (not a fresh hardcode)
  it("with no explicit aspect resolves to the 4:5 1080×1350 static default", () => {
    expect(staticAspect(undefined)).toBe("4:5");
    expect(CONFIG.aspects[staticAspect(undefined)]).toEqual({ width: 1080, height: 1350 });
    // proves the default reads the SSOT, not a fresh literal
    expect(staticAspect(undefined)).toBe(CONFIG.formatTargets.staticDefault);
    // the default output filename derives `card-4x5.png`
    expect(staticAspect(undefined).replace(":", "x")).toBe("4x5");
  });

  // AC-6 — no-regression: explicit aspect passes through unchanged (only the default moved)
  it("passes an explicit aspect through unchanged for every aspect", () => {
    const all: AspectRatio[] = ["16:9", "9:16", "1:1", "4:5"];
    for (const a of all) {
      expect(staticAspect(a)).toBe(a);
    }
  });

  it("an explicit 1:1 caller (e.g. video-smoke) still gets exactly 1:1", () => {
    expect(staticAspect("1:1")).toBe("1:1");
  });
});
