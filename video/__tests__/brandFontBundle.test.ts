import * as fs from "fs";
import * as path from "path";

import { INTER_WEIGHTS, BRAND_FONT_FAMILY, BG_TOOL, BG_CHAT, BG_OUTPUT_A, BG_OUTPUT_B } from "../brandTokens";
import { buildInterFontFaceCss, interFontDir, interWoff2FileName } from "../brandFonts";

const REMOTION_DIR = path.join(__dirname, "..", "..", "remotion");
const WOFF2_MAGIC = Buffer.from("wOF2", "ascii"); // WOFF2 files start with this signature.

describe("#1156 bundled Inter assets", () => {
  it("commits a NON-EMPTY, valid woff2 for every bundled weight", () => {
    for (const w of INTER_WEIGHTS) {
      const file = path.join(interFontDir(), interWoff2FileName(w));
      expect(fs.existsSync(file)).toBe(true);
      const bytes = fs.readFileSync(file);
      expect(bytes.length).toBeGreaterThan(1000); // a real subset, not a stub
      expect(bytes.subarray(0, 4).equals(WOFF2_MAGIC)).toBe(true); // genuine WOFF2 magic
    }
  });

  it("ships the SIL OFL license text alongside the fonts (OFL redistribution requirement)", () => {
    const ofl = path.join(interFontDir(), "OFL.txt");
    expect(fs.existsSync(ofl)).toBe(true);
    expect(fs.readFileSync(ofl, "utf8")).toMatch(/SIL OPEN FONT LICENSE/i);
  });
});

describe("#1156 buildInterFontFaceCss", () => {
  it("emits one data-URI @font-face per bundled weight for the brand family", () => {
    const css = buildInterFontFaceCss();
    for (const w of INTER_WEIGHTS) {
      expect(css).toContain(`font-weight:${w}`);
    }
    expect(css.match(/@font-face\{/g)?.length).toBe(INTER_WEIGHTS.length);
    expect(css).toContain(`font-family:"${BRAND_FONT_FAMILY}"`);
    expect(css).toContain("src:url(data:font/woff2;base64,"); // self-contained, no network
    expect(css).not.toContain("file://"); // never a file:// ref (Chromium refuses those)
  });
});

describe("#1156 browser-bundle boundary", () => {
  // brandFonts.ts imports fs/path. If any remotion/*.tsx entry imported it (directly or via a barrel),
  // Node built-ins would leak into the browser bundle. The Remotion side may import ONLY the pure
  // brandTokens.ts + fontGate.ts (+ the brandFont.tsx component). This is the mechanical guard the
  // plan-review flagged as the key risk.
  it("no remotion/*.tsx entry imports the fs-bearing brandFonts module", () => {
    const entries = fs.readdirSync(REMOTION_DIR).filter((f) => f.endsWith(".tsx"));
    expect(entries.length).toBeGreaterThan(0);
    for (const f of entries) {
      const src = fs.readFileSync(path.join(REMOTION_DIR, f), "utf8");
      expect(src).not.toMatch(/from\s+["'][^"']*\/brandFonts["']/);
      expect(src).not.toMatch(/require\(["'][^"']*\/brandFonts["']\)/);
    }
  });
});

describe("#1156 brand-token SSOT consistency", () => {
  it("fableStoryboard re-exports the SAME world-bg values as brandTokens (no drift)", () => {
    // fableStoryboard.ts now re-exports these from brandTokens; assert the values round-trip.
    const fable = require("../fableStoryboard");
    expect(fable.BG_TOOL).toBe(BG_TOOL);
    expect(fable.BG_CHAT).toBe(BG_CHAT);
    expect(fable.BG_OUTPUT_A).toBe(BG_OUTPUT_A);
    expect(fable.BG_OUTPUT_B).toBe(BG_OUTPUT_B);
  });
});
