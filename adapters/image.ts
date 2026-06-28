/**
 * REAL image adapter — fulfils the orchestrator's injected `renderImage` slot.
 *
 * Renders the existing, already-tested result-card HTML (`buildCardHtml`) to a real PNG using
 * Playwright + headless Chromium. No card LAYOUT logic lives here; this adapter only drives the
 * browser: set the viewport to the card dimensions, load the HTML, screenshot.
 */

import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";

import { type ContentSpec } from "../inputs/contentspec";
import { type CopyResult } from "../pipeline/run";
import { buildCardHtml, assertCenterSafeLayout, type ArtMaskOverlay, type ContentBox } from "../image/card";
import { CONFIG, type AspectRatio } from "../config";
import { generateArt, type GenArtDeps, type GenArtOpts } from "./genart";

export interface RenderImageOpts {
  outDir?: string;
  aspect?: AspectRatio;
  fileName?: string;
  maxFacts?: number;
  /**
   * Opt-in creative art via nano-banana (Gemini 2.5 Flash Image). Default off
   * (CONFIG.image.generativeBackgroundDefault) → the deterministic code-drawn gradient.
   * When on, the generated art becomes the card background (or the whole image if `bareArt`).
   */
  generative?: boolean;
  /** When generative: emit the raw nano-banana art as the image (no card overlay). */
  bareArt?: boolean;
  genartDeps?: GenArtDeps;
  genartOpts?: GenArtOpts;
  /**
   * Called with the final auto-fit scale (1 = no shrink needed) after the card is laid
   * out and proven to fit. Lets callers (e.g. the launch-card smoke) log "N/N tiles fit,
   * scale=…" without changing the string return type used by the orchestrator slot.
   */
  onFit?: (scale: number) => void;
  /**
   * Art-text MASK overlays (#824 mask-art-text) — opaque chips painted over garbled baked-in art text,
   * each optionally carrying a clean rendered label. Card-space px. Used by the post-4 cards to cover
   * the misspelled labels nano-banana baked into the art ("imae card" → clean "image card", etc).
   */
  overlays?: ArtMaskOverlay[];
}

/**
 * #1319 — resolve the STATIC promo-graphic aspect. The OMITTED-aspect default reads the
 * `CONFIG.formatTargets.staticDefault` SSOT (4:5, the 2026 X+IG feed portrait standard) instead of a
 * hard-coded literal; an EXPLICIT aspect passes through UNCHANGED. Pure + exported so the default
 * resolution is unit-testable without launching Chromium (the seam the static-default contract asserts).
 */
export function staticAspect(explicit?: AspectRatio): AspectRatio {
  return explicit ?? CONFIG.formatTargets.staticDefault;
}

/** Decode a `data:<mime>;base64,<bytes>` URI to a Buffer. */
function dataUriToBuffer(dataUri: string): Buffer {
  const comma = dataUri.indexOf(",");
  return Buffer.from(dataUri.slice(comma + 1), "base64");
}

/**
 * Render a result card to a PNG and return its absolute path. With no explicit `opts.aspect` the
 * static default resolves from `CONFIG.formatTargets.staticDefault` via `staticAspect()` (#1319 — 4:5
 * 1080x1350, default filename `card-4x5.png`), written under `<cwd>/out/image`. An explicit `opts.aspect`
 * passes through unchanged. The `copy` arg is part of the injected slot's contract; the card
 * itself is spec-driven (the proven `buildCardHtml` path).
 *
 * With `generative: true` the background is a real nano-banana creative image (primary-only — a
 * failed generation throws, it never silently slides to the gradient). With `bareArt: true` the
 * raw art is written as the image with no card overlay.
 */
export async function renderImage(
  args: { spec: ContentSpec; copy: CopyResult },
  opts?: RenderImageOpts,
): Promise<string> {
  const aspect: AspectRatio = staticAspect(opts?.aspect);
  const dims = CONFIG.aspects[aspect];

  const generative = opts?.generative ?? CONFIG.image.generativeBackgroundDefault;
  let backgroundDataUri: string | undefined;
  if (generative) {
    const art = await generateArt(args.spec, opts?.genartDeps, opts?.genartOpts);
    backgroundDataUri = art.dataUri;
  }

  const outDir = opts?.outDir ?? path.join(process.cwd(), "out", "image");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, opts?.fileName ?? `card-${aspect.replace(":", "x")}.png`);

  // Pure-art mode: write nano-banana's image directly, no card overlay.
  if (generative && opts?.bareArt && backgroundDataUri) {
    fs.writeFileSync(outPath, dataUriToBuffer(backgroundDataUri));
    return outPath;
  }

  const html = buildCardHtml(args.spec, dims, {
    maxFacts: opts?.maxFacts ?? 4,
    backgroundDataUri,
    overlays: opts?.overlays,
  });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: dims.width, height: dims.height },
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: "networkidle" });

    // AUTO-FIT: shrink the facts grid (via the card's --fit CSS knob) until every
    // .fact tile AND the .cta/.repo fit inside the frame. Converts a silent bottom
    // clip into either a clean fit or a loud throw. See fitCardToFrame() below.
    const fitScale = await fitCardToFrame(page);
    opts?.onFit?.(fitScale);

    // #1326 — CENTER-SAFE LAYOUT gate. IG's profile grid center-crops the 4:5 feed STILL to a 3:4
    // centered thumbnail; assert every drawn element stays inside that safe area so nothing important is
    // grid-clipped. Runs AFTER fitCardToFrame converges (so it measures the FINAL fitted layout) and
    // BEFORE the screenshot. Scoped to the static-default (4:5) surface IG grid-crops — the 1:1 / 9:16
    // cards use near-full frame and are NOT IG profile-grid cropped, so the gate would false-fail them
    // (the pure assertion in image/card.ts stays callable for any dims; only this render hook is scoped).
    if (aspect === CONFIG.formatTargets.staticDefault) {
      assertCenterSafeLayout(await measureContentBoxes(page), dims);
    }

    await page.screenshot({ path: outPath });
  } finally {
    await browser.close();
  }

  return outPath;
}

/** The fit-loop tuning constants (also exported for tests). */
export const FIT_FLOOR = 0.5; // never shrink below half-scale
export const FIT_STEPS = 12; // max shrink iterations
const FIT_DECAY = 0.92; // multiplicative shrink per step (0.92^12 ≈ 0.37, below the 0.5 floor)

/** What the in-page overflow probe returns. The adapter decides fit/throw from it. */
export interface FitMeasure {
  /** Number of .fact tiles whose bottom edge exceeds the frame's inner box. */
  overflowingFacts: number;
  /** True if the .cta or .repo footer overflows the frame's inner box. */
  footerOverflows: boolean;
  /** The body inner-height boundary (frame height − bottom padding), in px. */
  innerBottom: number;
  /** The bottom edge of the lowest overflowing element (or last fact), in px. */
  worstBottom: number;
}

/**
 * Measure (in-page) whether the card's content overflows the frame's inner box. The
 * boundary is the body's content-box bottom (frame height − bottom padding); anything
 * whose bottom edge exceeds it would be clipped by `overflow: hidden`. A 1px slack
 * absorbs sub-pixel rounding so a pixel-exact fit is not falsely flagged.
 */
export async function measureCardFit(page: import("playwright").Page): Promise<FitMeasure> {
  // The callback runs IN THE BROWSER, so it uses DOM globals the node tsconfig lib doesn't declare.
  // `doc` is the browser document, typed loosely to keep this file node-only (no `dom` lib needed).
  return page.evaluate(() => {
    const doc = (globalThis as unknown as { document: any }).document;
    const getCS = (globalThis as unknown as { getComputedStyle: (e: any) => any }).getComputedStyle;
    const SLACK = 1;
    const body = doc.body;
    const padBottom = parseFloat(getCS(body).paddingBottom) || 0;
    const innerBottom = body.clientHeight - padBottom; // content-box bottom edge
    const limit = innerBottom + SLACK;

    let overflowingFacts = 0;
    let worstBottom = 0;
    doc.querySelectorAll(".fact").forEach((el: any) => {
      const b = el.getBoundingClientRect().bottom;
      worstBottom = Math.max(worstBottom, b);
      if (b > limit) overflowingFacts += 1;
    });

    let footerOverflows = false;
    doc.querySelectorAll(".cta, .repo").forEach((el: any) => {
      const b = el.getBoundingClientRect().bottom;
      worstBottom = Math.max(worstBottom, b);
      if (b > limit) footerOverflows = true;
    });

    return { overflowingFacts, footerOverflows, innerBottom, worstBottom };
  });
}

/**
 * #1326 — Collect the REAL rendered bbox (card-space px) of every DRAWN element, named for the
 * assertion message. Reads `getBoundingClientRect` (answers the cairn #871 "a DECLARED safe-area box is
 * a fiction" lesson — we MEASURE the rendered layout, we do not declare it; `getBoundingClientRect` is
 * unaffected by the body's `overflow:hidden` so it sees true, pre-clip coords). Feeds
 * `assertCenterSafeLayout`. Sibling of `measureCardFit` (which only checks VERTICAL bottom-overflow).
 *
 * SELECTOR NOTE: `.name,.summary,.fact,.cta,.repo,.art-overlay` are the drawn elements of the gated 4:5
 * DEFAULT layout. `.hero,.hero-value` are listed for completeness but only render in the tall (≥1.5)
 * layout the gate never reaches (harmless / dead in the 4:5 path). The `.facts` WRAPPER is intentionally
 * omitted — the finer-grained `.fact` tiles already bound it and the wrapper adds no margin beyond them
 * (don't "fix" the apparent omission). `.label/.value/.scope` are normal-flow children of `.fact`,
 * geometrically contained, so they need no separate entry.
 */
export async function measureContentBoxes(page: import("playwright").Page): Promise<ContentBox[]> {
  return page.evaluate(() => {
    const doc = (globalThis as unknown as { document: any }).document;
    const SELECTORS = ".name, .summary, .fact, .hero, .hero-value, .cta, .repo, .art-overlay";
    const boxes: ContentBox[] = [];
    doc.querySelectorAll(SELECTORS).forEach((el: any, i: number) => {
      const r = el.getBoundingClientRect();
      const cls = (el.className || "el").toString().trim().split(/\s+/)[0];
      boxes.push({ name: `${cls}#${i}`, left: r.left, top: r.top, right: r.right, bottom: r.bottom });
    });
    return boxes;
  });
}

/**
 * Progressively reduce the facts-grid scale (the card's `--fit` CSS variable) until the
 * content fits the frame, re-measuring each step. Stops as soon as it fits. If it still
 * overflows at the floor scale, THROWS naming how many tiles don't fit — turning a
 * previously-silent bottom clip into a mechanical failure (prevention gate).
 */
export async function fitCardToFrame(page: import("playwright").Page): Promise<number> {
  let scale = 1;
  let measure = await measureCardFit(page);
  if (measure.overflowingFacts === 0 && !measure.footerOverflows) return scale;

  for (let step = 0; step < FIT_STEPS; step++) {
    scale = Math.max(FIT_FLOOR, scale * FIT_DECAY);
    await page.evaluate((s: number) => {
      (globalThis as unknown as { document: any }).document.documentElement.style.setProperty(
        "--fit",
        String(s),
      );
    }, scale);
    measure = await measureCardFit(page);
    if (measure.overflowingFacts === 0 && !measure.footerOverflows) return scale;
    if (scale <= FIT_FLOOR) break; // can't shrink further
  }

  // Still overflowing at the floor → loud failure instead of a silent clip.
  if (measure.overflowingFacts > 0 || measure.footerOverflows) {
    const parts: string[] = [];
    if (measure.overflowingFacts > 0) parts.push(`${measure.overflowingFacts} fact tile(s)`);
    if (measure.footerOverflows) parts.push("the cta/repo footer");
    throw new Error(
      `renderImage: card content overflows the frame at minimum fit scale ${scale.toFixed(3)} — ` +
        `${parts.join(" and ")} fall below the frame inner-bottom ` +
        `(${Math.round(measure.worstBottom)}px > ${Math.round(measure.innerBottom)}px). ` +
        `Reduce the fact count or enlarge the frame.`,
    );
  }
  return scale;
}
