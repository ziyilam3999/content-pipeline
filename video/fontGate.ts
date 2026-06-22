/**
 * #1156 — the FAILS-CLOSED fonts-loaded gate.
 *
 * WHY: `remotion/*.tsx` declare `font-family: Inter, ...` but Remotion renders in a headless Chromium
 * that ships NO Inter, so the declared font SILENTLY fell back to Helvetica. The bundled-font fix
 * (`brandFonts.ts` → data-URI `@font-face` → `<FontPreload>`) loads Inter before the first frame; this
 * gate is the TRIPWIRE that makes a FUTURE broken bundle FAIL the render LOUDLY instead of quietly
 * rendering Helvetica again.
 *
 * THE SUBTLE TRAP (why `document.fonts.check()` alone is NOT enough): per the CSS Font Loading spec,
 * `FontFaceSet.check("800 100px Inter")` returns TRUE when NO matching face is in the set — because the
 * UA would then satisfy the request from a SYSTEM font, which is always "available". So if the Inter
 * bundle is entirely missing, `check()` lies and says "fine". This gate therefore ALSO requires that at
 * least one FontFace with the brand family is actually present AND `status === "loaded"` in the set.
 * Both conditions together are fail-closed: a missing/broken bundle has zero loaded Inter faces → throw.
 *
 * Pure + dependency-free (no `fs`, no React, no Remotion) so it is unit-testable in jest with fakes and
 * importable from the Remotion browser bundle. The `<FontPreload>` component calls it with the live
 * `document.fonts` set and `document.fonts.check`.
 */

import { BRAND_FONT_FAMILY, INTER_WEIGHTS } from "./brandTokens";

/** The shape of a `FontFace` we care about (matches the real `FontFace`; lets jest pass fakes). */
export interface FontFaceLike {
  family: string;
  status?: string;
}

export interface AssertBrandFontsOpts {
  /** The live font set (`document.fonts`) — iterable of FontFace. */
  faces: Iterable<FontFaceLike>;
  /** `document.fonts.check` (bound). Given a CSS font shorthand, returns whether it can render loaded. */
  check: (font: string) => boolean;
  /** Weights that MUST be loaded. Defaults to the bundled `INTER_WEIGHTS`. */
  weights?: readonly number[];
  /** Brand family name. Defaults to `BRAND_FONT_FAMILY` ("Inter"). */
  family?: string;
}

/**
 * Throw unless the brand font is genuinely loaded into the render's font set. Two independent checks,
 * both must pass (fail-closed):
 *   1. At least one FontFace with `family === family` is present AND `status === "loaded"`. This is the
 *      check `document.fonts.check()` CANNOT do (it returns true for a missing family via system fallback).
 *   2. For EVERY required weight, `check("<weight> 100px <family>")` is true (the face for that weight
 *      finished loading — a half-loaded bundle fails here).
 *
 * On failure the message names the brand explicitly and reminds the caller this means a silent Helvetica
 * fallback would otherwise have shipped — the exact regression #1156 fixes.
 */
export function assertBrandFontsLoaded(opts: AssertBrandFontsOpts): void {
  const family = opts.family ?? BRAND_FONT_FAMILY;
  const weights = opts.weights ?? INTER_WEIGHTS;

  // (1) The family must actually be in the set AND loaded — guards the system-fallback lie.
  const familyFaces = [...opts.faces].filter((f) => f.family === family);
  const loadedFaces = familyFaces.filter((f) => f.status === "loaded");
  if (loadedFaces.length === 0) {
    const present = familyFaces.length > 0;
    throw new Error(
      `#1156 fonts-loaded gate FAILED: no LOADED "${family}" FontFace in the render's font set ` +
        `(${present ? `${familyFaces.length} present but none status==="loaded"` : "family absent entirely"}). ` +
        `The bundled @font-face did not load — the render would SILENTLY fall back to Helvetica. ` +
        `Re-check the .woff2 under assets/fonts/Inter/ and the data-URI @font-face injection.`,
    );
  }

  // (2) Every required weight must pass check() — catches a partially-loaded bundle.
  const missing: number[] = [];
  for (const w of weights) {
    if (!opts.check(`${w} 100px ${family}`)) missing.push(w);
  }
  if (missing.length > 0) {
    throw new Error(
      `#1156 fonts-loaded gate FAILED: document.fonts.check is false for "${family}" weight(s) ` +
        `${missing.join(", ")} — those bundled weights did not finish loading. ` +
        `The render would mix Helvetica for the missing weights.`,
    );
  }
}
