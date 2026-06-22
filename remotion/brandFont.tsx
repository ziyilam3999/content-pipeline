/**
 * #1156 — `<FontPreload>`: load the bundled Inter `@font-face`s BEFORE the first frame, then GATE.
 *
 * Mounted once at the top of a composition. It:
 *   1. injects the data-URI `@font-face` CSS (built Node-side by `buildInterFontFaceCss`, passed via
 *      `inputProps.fontFaceCss`) as a real `<style>` in the render DOM,
 *   2. HOLDS the render with `delayRender()` until every required weight has loaded
 *      (`document.fonts.load(...)`) and `document.fonts.ready` settles, then
 *   3. runs the fail-closed `assertBrandFontsLoaded` gate (loaded Inter FontFace MUST exist AND each
 *      weight's `check()` MUST pass), and finally
 *   4. `continueRender()` on success — or `cancelRender(err)` to FAIL the whole render LOUDLY if Inter
 *      did not load (the #1156 regression: a silent Helvetica fallback instead becomes a hard error).
 *
 * Idiomatic Remotion font loading is `delayRender` + `document.fonts` (this is what `@remotion/fonts`
 * does internally); we use it directly so the font bytes are the repo's OWN committed woff2, embedded
 * offline, with no network fetch.
 *
 * Imports ONLY pure modules (`brandTokens`, `fontGate`) + React + remotion — never the fs-bearing
 * `brandFonts.ts`. See `video/__tests__/brandFontBundle.test.ts`.
 */

import * as React from "react";
import { delayRender, continueRender, cancelRender } from "remotion";

import { BRAND_FONT_FAMILY, INTER_WEIGHTS } from "../video/brandTokens";
import { assertBrandFontsLoaded } from "../video/fontGate";

export interface FontPreloadProps {
  /** The `@font-face` CSS (data-URI woff2) from `buildInterFontFaceCss()`. */
  fontFaceCss?: string;
  /** Weights that must load. Defaults to the bundled `INTER_WEIGHTS`. */
  weights?: readonly number[];
  /** Brand family. Defaults to `BRAND_FONT_FAMILY`. */
  family?: string;
}

export const FontPreload: React.FC<FontPreloadProps> = ({ fontFaceCss, weights, family }) => {
  const fam = family ?? BRAND_FONT_FAMILY;
  const ws = weights ?? INTER_WEIGHTS;
  const [handle] = React.useState(() => delayRender(`#1156 loading brand font "${fam}"`));

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Request each weight (with sample text — Remotion's chrome-headless-shell can leave a weight
        // matched-but-"unloaded" when load() is called WITHOUT text, weight 600 in particular; passing
        // glyphs forces the actual decode), then wait for the set to settle. The <style> below is
        // already in the DOM (rendered synchronously) so the loads resolve against the injected rules.
        // Bounded retry: headless-shell occasionally needs a second settle before check() flips true.
        for (let attempt = 0; attempt < 12; attempt++) {
          await Promise.all(ws.map((w) => document.fonts.load(`${w} 100px "${fam}"`, "ABCabcg 0123")));
          await document.fonts.ready;
          if (cancelled) return;
          if (ws.every((w) => document.fonts.check(`${w} 100px ${fam}`))) break;
          await new Promise((r) => setTimeout(r, 60));
        }
        // Fail-closed: throws if Inter is STILL not genuinely loaded (would have silently been Helvetica).
        assertBrandFontsLoaded({
          faces: document.fonts as unknown as Iterable<{ family: string; status?: string }>,
          check: (spec) => document.fonts.check(spec),
          weights: ws,
          family: fam,
        });
        continueRender(handle);
      } catch (err) {
        cancelRender(err instanceof Error ? err : new Error(String(err)));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!fontFaceCss) return null;
  return <style dangerouslySetInnerHTML={{ __html: fontFaceCss }} />;
};
