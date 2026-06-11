/**
 * #817 — ART-SOURCE-BOUND guard for the demo video background.
 *
 * DISTINCT from the #807 perceptible-MOTION gate (artBackgroundMotion.test.ts). #807 proves the
 * background, IF present, moves enough to read as motion — it says NOTHING about whether that
 * background is the post's real generative ART vs a plain solid fill (a moving solid gradient
 * satisfies #807). This module closes that gap.
 *
 * THE BUG IT PREVENTS: when a post's demo INTENDS generative art
 * (CONFIG.demo.animatedBackgroundDefault === true and no explicit DEMO_BG opt-out) but the art base
 * image `_art-base-<slug>.png` is MISSING — or was resolved away before the Remotion call — the
 * render silently omits the background and Remotion draws a SOLID colour. No error. The #807 motion
 * test still passes. So a demo that was supposed to carry the post's card art ships solid and nothing
 * catches it. This is also how the implicit run-order binding (cards smoke writes _art-base-<slug>.png,
 * video smoke reads it) breaks: render the video FIRST and the bg is lost — silently.
 *
 * Two assertions, both PURE (all fs/env reads are injected by the caller so the contract stays
 * unit-testable per the video/*.ts convention; remotion/index.tsx stays out of the jest/tsc gate):
 *
 *   1. assertDemoArtBound — art INTENDED but NOT BOUND (the art-base file is missing OR the render
 *      was handed a null/empty backgroundImagePath) → throw. The existing DEMO_BG=0/off/false/no
 *      escape hatch (see demoBackground.ts) makes it a NO-OP for an intentional solid render.
 *
 *   2. assertSharedArtSource — the demo VIDEO background and the post's CARDS must derive from the
 *      SAME `_art-base-<slug>.png` (one per-post art, shared). A different slug/source → throw. This
 *      prevents (a) forgetting the video bg, and (b) generating/paying for the art twice.
 */

import * as path from "path";

import { CONFIG } from "../config";

/** The off-switch values that disable the animated background (mirrors demoBackground.ts). */
const OFF_VALUES = new Set(["0", "off", "false", "no"]);

/** True when DEMO_BG explicitly opts OUT of the animated art (an intentional solid render). */
export function isSolidRenderOptOut(demoBgEnv?: string): boolean {
  const v = demoBgEnv?.trim().toLowerCase();
  return v !== undefined && OFF_VALUES.has(v);
}

/** Inputs the art-source-bound assertion reads — injected so the assertion stays pure (no fs/env). */
export interface DemoArtBindingInputs {
  /**
   * Does THIS post intend generative art? Defaults to the SSOT `CONFIG.demo.animatedBackgroundDefault`.
   * Pass `false` to model a post that genuinely renders solid by design (then the guard is a no-op).
   */
  intendedDefault?: boolean;
  /** Raw DEMO_BG env value (undefined = unset). The escape hatch: 0/off/false/no = intentional solid. */
  demoBgEnv?: string;
  /** Does the post's art-base image exist on disk? (the caller stats the path). */
  artImageExists: boolean;
  /** The art-base path the caller checked — surfaced in the error so the operator knows what to gen. */
  artImagePath: string;
  /**
   * The background config the render will ACTUALLY be handed (the `resolveDemoBackground` result, or
   * the `{ backgroundImagePath }` the adapter passes to Remotion). null / empty path = a solid bg →
   * a bound-art intent is UNMET even if the file exists (it was resolved away before the render).
   */
  resolvedBackground: { backgroundImagePath?: string } | null;
}

/**
 * ART-SOURCE-BOUND assertion. HARD-FAILS when generative art is INTENDED but NOT BOUND. A no-op when
 * art is not intended, or when DEMO_BG explicitly opts out (intentional solid render). DISTINCT from
 * the #807 perceptible-MOTION gate — this checks the art SOURCE is real + bound, not that it moves.
 */
export function assertDemoArtBound(inputs: DemoArtBindingInputs): void {
  const intended = inputs.intendedDefault ?? CONFIG.demo.animatedBackgroundDefault;
  if (!intended) return; // art not intended at all → nothing to bind
  if (isSolidRenderOptOut(inputs.demoBgEnv)) return; // explicit solid opt-out → no-op (escape hatch)

  if (!inputs.artImageExists) {
    throw new Error(
      `#817 ART-SOURCE-BOUND VIOLATION: this demo INTENDS generative art ` +
        `(CONFIG.demo.animatedBackgroundDefault) but the art-base image is MISSING: ` +
        `"${inputs.artImagePath}". The video would silently render a SOLID background and the ` +
        `#807 motion gate would NOT catch it (a moving solid passes motion). Generate/cache the ` +
        `post art FIRST (run the post's launch-card smoke so it writes _art-base-<slug>.png), or ` +
        `set DEMO_BG=0 for an INTENTIONAL solid render.`,
    );
  }
  const boundPath = inputs.resolvedBackground?.backgroundImagePath;
  if (!boundPath || !boundPath.trim()) {
    throw new Error(
      `#817 ART-SOURCE-BOUND VIOLATION: this demo INTENDS generative art and the art base ` +
        `"${inputs.artImagePath}" EXISTS, but the render was NOT handed a background image ` +
        `(resolved background is null/empty). The art was resolved away before the Remotion call — ` +
        `the video would render a SOLID background. Pass the resolved backgroundImagePath through to ` +
        `the render, or set DEMO_BG=0 for an intentional solid render.`,
    );
  }
}

/**
 * Extract the per-post slug from an `_art-base[-<slug>].png` path. Legacy `_art-base.png` (post #1)
 * yields "" ; a path that is NOT an art-base file yields null. Matches on the basename only so a
 * repo-relative video bg path and an absolute cards cache path with the same file name compare equal.
 */
export function artBaseSlug(artBasePath: string): string | null {
  const m = path.basename(artBasePath).match(/^_art-base(?:-(.+))?\.png$/i);
  if (!m) return null;
  return m[1] ?? "";
}

/**
 * ONE-SHARED-SOURCE binding. The demo VIDEO background and the post's CARDS must derive from the SAME
 * `_art-base-<slug>.png`. Throws when the two paths resolve to different art bases (different slug),
 * when either is not a recognizable art-base path, or when the bound slug disagrees with the expected
 * post slug (a cross-post reuse). A no-op when both share the one per-post art. Prevents forgetting
 * the video bg AND prevents generating/paying for the art twice.
 */
export function assertSharedArtSource(videoBgPath: string, cardsArtPath: string, slug: string): void {
  const want = slug.trim();
  const vSlug = artBaseSlug(videoBgPath);
  const cSlug = artBaseSlug(cardsArtPath);

  if (vSlug === null) {
    throw new Error(
      `#817 SHARED-SOURCE: the video background path "${videoBgPath}" is not a recognizable ` +
        `_art-base-<slug>.png — the demo bg must derive from the post's shared art base.`,
    );
  }
  if (cSlug === null) {
    throw new Error(
      `#817 SHARED-SOURCE: the cards art path "${cardsArtPath}" is not a recognizable ` +
        `_art-base-<slug>.png — the cards must derive from the post's shared art base.`,
    );
  }
  if (vSlug !== cSlug) {
    throw new Error(
      `#817 SHARED-SOURCE VIOLATION: the demo video background derives from "_art-base-${vSlug}.png" ` +
        `but the cards derive from "_art-base-${cSlug}.png". Both must share ONE per-post art ` +
        `(slug "${want}") — a single _art-base-${want}.png behind the video AND the cards. This ` +
        `prevents forgetting the video bg and prevents generating/paying for the art twice.`,
    );
  }
  if (vSlug !== want) {
    throw new Error(
      `#817 SHARED-SOURCE VIOLATION: the bound art slug "${vSlug}" does not match the expected post ` +
        `slug "${want}". The video + cards share an art base, but it is the WRONG post's art (a ` +
        `cross-post reuse — see smoke/art-registry.ts for the cross-post uniqueness guard).`,
    );
  }
}
