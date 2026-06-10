/**
 * #808 RULE 1 — the perceptible animated background is the DEFAULT, not opt-in.
 *
 * Proves the default-on contract of the pure resolver:
 *   - art exists + NO env flag → background ON (the #808 flip; #805's opt-in is dead).
 *   - DEMO_BG=0/off/false/no → OFF (the escape hatch survives).
 *   - art missing → OFF (can't animate a missing image).
 *   - env overrides for scrim/blur are honored; otherwise config defaults apply.
 */

import { resolveDemoBackground } from "../demoBackground";
import { CONFIG } from "../../config";

const ART = "/out/review/lfah/image/_art-base-post2.png";

describe("#808 resolveDemoBackground — animated bg is DEFAULT", () => {
  it("art exists + no DEMO_BG env → background ON automatically (the default flip)", () => {
    const bg = resolveDemoBackground({ artImageExists: true, artImagePath: ART });
    expect(bg).not.toBeNull();
    expect(bg!.backgroundImagePath).toBe(ART);
    expect(bg!.backgroundScrimOpacity).toBe(CONFIG.demo.backgroundScrimOpacity);
    expect(bg!.backgroundBlurPx).toBe(0);
  });

  it.each(["0", "off", "false", "no", "OFF", " Off "])(
    "DEMO_BG=%p disables the background (escape hatch survives)",
    (val) => {
      const bg = resolveDemoBackground({ artImageExists: true, artImagePath: ART, demoBgEnv: val });
      expect(bg).toBeNull();
    },
  );

  it("an unrelated DEMO_BG value (e.g. 'on') keeps the background ON", () => {
    const bg = resolveDemoBackground({ artImageExists: true, artImagePath: ART, demoBgEnv: "on" });
    expect(bg).not.toBeNull();
  });

  it("art missing → solid bg (null), regardless of env", () => {
    expect(resolveDemoBackground({ artImageExists: false, artImagePath: ART })).toBeNull();
    expect(
      resolveDemoBackground({ artImageExists: false, artImagePath: ART, demoBgEnv: "on" }),
    ).toBeNull();
  });

  it("honors DEMO_BG_SCRIM and DEMO_BG_BLUR overrides", () => {
    const bg = resolveDemoBackground({
      artImageExists: true,
      artImagePath: ART,
      demoBgScrimEnv: "0.85",
      demoBgBlurEnv: "4",
    });
    expect(bg!.backgroundScrimOpacity).toBe(0.85);
    expect(bg!.backgroundBlurPx).toBe(4);
  });
});
