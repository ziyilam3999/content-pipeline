/**
 * #765 — per-aspect layout params for the animated demo composition.
 *
 * The PROBLEM this solves: every demo scene used `justifyContent: center` around a
 * fixed ~900px content block. At 1080x1920 (9:16, the phone-native cut) that centred a
 * square island and left empty top/bottom bands — a 1:1 layout letterboxed inside a
 * taller frame. Rule `feedback_design_each_aspect_to_fill_its_frame`: each aspect must
 * FILL its own frame within safe margins; never letterbox a square inside a taller one.
 *
 * This module is the deterministic, React-free CONTRACT the Remotion scenes consume
 * (`remotion/index.tsx`). It lives as a plain `.ts` on purpose: `remotion/index.tsx`
 * is excluded from the project tsconfig (Remotion bundles it), so the only place we can
 * unit-test the "fill the frame" decision is here. See `video/__tests__/demoLayout.test.ts`.
 *
 * The decision is a pure function of the frame shape (height / width):
 *   - square-ish (ratio <= 1.05, e.g. 1:1): CENTER the block, no type scale-up — a
 *     near-square frame has little vertical waste to fill, so centring reads cleanly.
 *   - taller than square (4:5, 9:16): FILL — distribute the scene's vertical content
 *     across the frame within small safe margins, and scale type up. The taller the
 *     frame, the larger the usable span and the bigger the type (9:16 is the fullest).
 */

import { CONFIG } from "../config";

/** How a scene's vertical content is distributed inside the padded frame box. */
export type VerticalDistribution = "center" | "space-evenly" | "space-between";

export interface DemoLayout {
  /** height / width of the frame (1.0 = square, ~1.778 = 9:16, 1.25 = 4:5). */
  aspectRatio: number;
  /** true → spread content to fill the height; false → center it (square cut). */
  fill: boolean;
  /** flex justifyContent for the scene's full-height inner column. */
  justify: VerticalDistribution;
  /** top safe-margin as a fraction of frame height. */
  padTopFraction: number;
  /** bottom safe-margin as a fraction of frame height. */
  padBottomFraction: number;
  /** multiply base font sizes by this (1 = unchanged; >1 scales type up for tall cuts). */
  typeScale: number;
  /** multiply base inter-block gaps by this. */
  gapScale: number;
  /** convenience: 1 - padTopFraction - padBottomFraction (the usable vertical span). */
  usableSpanFraction: number;
  /**
   * HORIZONTAL title-safe band: max fraction of the frame WIDTH that text/tiles/cards/CTA may
   * occupy, so a full-screen tall-phone crop (~9-12%/side) never clips content. SSOT =
   * `CONFIG.demo.safeAreaXFraction`. The background art stays full-bleed (not constrained by this).
   */
  safeAreaXFraction: number;
  /** The px content width the scene's inner column uses: floor(width * safeAreaXFraction). */
  contentMaxWidthPx: number;
}

/** Frame ratios at/under this read as square — low crop risk, no horizontal-safe assertion. */
export const SAFE_SQUARE_MAX_RATIO = 1.05;

/**
 * The horizontal title-safe content width (px) for a frame `width`, given the band fraction.
 * Single source for both the renderer (inner-column width) and the assertion below.
 */
export function contentSafeWidthPx(width: number, safeAreaXFraction: number): number {
  if (!(width > 0)) throw new Error(`contentSafeWidthPx: width must be positive (got ${width})`);
  return Math.floor(width * safeAreaXFraction);
}

/**
 * MECHANICAL PREVENTION (both-ends boolean) — assert a layout's horizontal content extent stays
 * within the title-safe band for CROPPABLE (taller-than-square) aspects. A 9:16 / 4:5 cut played
 * full-screen on a tall phone is filled to height and cropped ~9-12% each side; content wider than
 * `safeAreaXFraction` of the frame width gets clipped. Throws so a too-wide layout HARD-FAILS in
 * the render path (wired in `adapters/video-post3.ts`). Square cuts (ratio ≤ SAFE_SQUARE_MAX_RATIO)
 * are not full-screen-cropped horizontally, so they pass regardless (the inset is still applied,
 * just not asserted). See feedback_vertical_video_needs_horizontal_titlesafe_band_for_fullscreen_crop.
 */
export function assertHorizontalSafeArea(args: {
  width: number;
  /** Widest horizontal content extent in px (inner-column width incl. padding/maxWidth). */
  contentExtentPx: number;
  safeAreaXFraction: number;
  /** height/width of the frame — decides whether the full-screen crop applies. */
  aspectRatio: number;
  label?: string;
}): void {
  const { width, contentExtentPx, safeAreaXFraction, aspectRatio } = args;
  const label = args.label ?? `${aspectRatio.toFixed(3)}:1`;
  if (!(width > 0)) throw new Error(`assertHorizontalSafeArea: width must be positive (got ${width})`);
  if (!(safeAreaXFraction > 0 && safeAreaXFraction <= 1)) {
    throw new Error(`assertHorizontalSafeArea: safeAreaXFraction must be in (0,1] (got ${safeAreaXFraction})`);
  }
  // Square (or wider) cuts are not horizontally cropped on full-screen playback — skip the assert.
  if (aspectRatio <= SAFE_SQUARE_MAX_RATIO) return;
  const bandPx = width * safeAreaXFraction;
  const EPS = 0.5; // sub-pixel slack (contentMaxWidthPx is floored)
  if (contentExtentPx > bandPx + EPS) {
    const marginPctEachSide = (((width - contentExtentPx) / 2) / width) * 100;
    throw new Error(
      `horizontal title-safe band violated for aspect "${label}": content extent ${contentExtentPx}px ` +
        `exceeds band ${bandPx.toFixed(0)}px (${(safeAreaXFraction * 100).toFixed(0)}% of ${width}px). ` +
        `Only ${marginPctEachSide.toFixed(1)}% margin each side — a full-screen tall-phone crop (~9-12%/side) ` +
        `would clip it. Inset content to ≤ ${(safeAreaXFraction * 100).toFixed(0)}% of width.`,
    );
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Anchor ratios: 4:5 (1350/1080 = 1.25) and 9:16 (1920/1080 ≈ 1.7778). Tall-cut params
// interpolate between these two anchors, clamped, so any tall aspect stays monotonic in
// tallness (a taller frame never fills LESS than a shorter one).
const RATIO_45 = 1350 / 1080; // 1.25
const RATIO_916 = 1920 / 1080; // ~1.7778
const SQUARE_MAX_RATIO = SAFE_SQUARE_MAX_RATIO; // 1.05 — one threshold for "square, low crop risk"

/**
 * Compute the layout params for a frame of the given pixel size.
 * Pure + deterministic — no React / Remotion / IO.
 */
export function demoLayout(width: number, height: number): DemoLayout {
  if (!(width > 0) || !(height > 0)) {
    throw new Error(`demoLayout: width and height must be positive (got ${width}x${height})`);
  }
  const aspectRatio = height / width;
  const safeAreaXFraction = CONFIG.demo.safeAreaXFraction;
  const contentMaxWidthPx = contentSafeWidthPx(width, safeAreaXFraction);

  // Square (or wider): center, no scale-up. The frame itself is ~square so there is
  // little vertical real estate to "fill"; centring the block reads as intentional.
  if (aspectRatio <= SQUARE_MAX_RATIO) {
    const pad = 0.18;
    return {
      aspectRatio,
      fill: false,
      justify: "center",
      padTopFraction: pad,
      padBottomFraction: pad,
      typeScale: 1,
      gapScale: 1,
      usableSpanFraction: 1 - 2 * pad, // 0.64
      safeAreaXFraction,
      contentMaxWidthPx,
    };
  }

  // Taller than square: FILL by GROWING the content (#773). The body blocks flex-grow to
  // divide the usable height so the cards STRETCH to fill instead of staying small and being
  // pushed apart by space-between (which the operator called "just increased spacing"). Type
  // also scales up the taller the frame, so the grown cards aren't mostly empty. Interpolate
  // from the 4:5 anchor (modest) to the 9:16 anchor (fullest), clamped. justify is unused in
  // fill mode (SceneShell uses flex-grow), kept only for completeness.
  const t = clamp((aspectRatio - RATIO_45) / (RATIO_916 - RATIO_45), 0, 1);
  const pad = lerp(0.06, 0.045, t); // 4:5 → 0.06 each; 9:16 → 0.045 each
  const typeScale = lerp(1.18, 1.34, t); // bigger so grown cards read full (was 1.08→1.18)
  const gapScale = lerp(0.9, 1.1, t); // modest gaps — the grow does the filling, not the gap
  return {
    aspectRatio,
    fill: true,
    justify: "space-between",
    padTopFraction: pad,
    padBottomFraction: pad,
    typeScale,
    gapScale,
    usableSpanFraction: 1 - 2 * pad, // 4:5 → 0.88 ; 9:16 → 0.91
    safeAreaXFraction,
    contentMaxWidthPx,
  };
}
