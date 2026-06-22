/**
 * #1156 — NODE-ONLY builder for the bundled-Inter `@font-face` CSS (base64 data URIs).
 *
 * WHY data URIs through inputProps: Remotion renders in a headless Chromium that REFUSES arbitrary
 * `file://` resources, so the repo already embeds local PNG/audio assets as base64 data URIs and passes
 * them through `inputProps` (see `toDataUri` in `adapters/video-post5.ts`). We MIRROR that proven pattern
 * for the font instead of a network `@remotion/google-fonts` fetch (offline + deterministic) or an
 * unproven `public/`+`staticFile` path. The Node adapter calls `buildInterFontFaceCss()` at render time
 * and hands the resulting CSS to the `<FontPreload>` component via `inputProps.fontFaceCss`.
 *
 * ⚠️ BROWSER-BUNDLE BOUNDARY: this module imports `fs`/`path` and MUST NEVER be imported by any
 * `remotion/*.tsx` entry (that would drag Node built-ins into the browser bundle). The Remotion side
 * imports only the pure `brandTokens.ts` + `fontGate.ts`. `video/__tests__/brandFontBundle.test.ts`
 * mechanically asserts no `remotion/*.tsx` imports this file.
 */

import * as fs from "fs";
import * as path from "path";

import { BRAND_FONT_FAMILY, INTER_WEIGHTS } from "./brandTokens";

/** Absolute path to the committed Inter woff2 directory (resolved from THIS file, worktree-safe). */
export function interFontDir(): string {
  return path.join(__dirname, "..", "assets", "fonts", "Inter");
}

/** The committed woff2 filename for a given weight (matches the files under assets/fonts/Inter/). */
export function interWoff2FileName(weight: number): string {
  return `Inter-${weight}.woff2`;
}

/**
 * Read every bundled Inter weight and return ONE block of `@font-face` rules whose `src` is a base64
 * `data:font/woff2` URI — self-contained, no network, embeddable straight into a `<style>` tag inside
 * the headless render. Throws (never silently emits an empty/partial sheet) if a weight's woff2 is
 * missing or empty, so a broken bundle fails at BUILD time too, not only at the render-side gate.
 */
export function buildInterFontFaceCss(opts?: { weights?: readonly number[]; family?: string }): string {
  const family = opts?.family ?? BRAND_FONT_FAMILY;
  const weights = opts?.weights ?? INTER_WEIGHTS;
  const dir = interFontDir();

  const rules: string[] = [];
  for (const weight of weights) {
    const file = path.join(dir, interWoff2FileName(weight));
    if (!fs.existsSync(file)) {
      throw new Error(
        `buildInterFontFaceCss: missing bundled font ${file} (weight ${weight}). ` +
          `Expected committed woff2 under assets/fonts/Inter/ — the Inter bundle is incomplete.`,
      );
    }
    const bytes = fs.readFileSync(file);
    if (bytes.length === 0) {
      throw new Error(`buildInterFontFaceCss: bundled font ${file} is empty (0 bytes).`);
    }
    const b64 = bytes.toString("base64");
    rules.push(
      `@font-face{` +
        `font-family:"${family}";` +
        `font-style:normal;` +
        `font-weight:${weight};` +
        `font-display:block;` +
        `src:url(data:font/woff2;base64,${b64}) format("woff2");` +
        `}`,
    );
  }
  return rules.join("\n");
}
