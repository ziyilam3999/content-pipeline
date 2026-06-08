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
import { buildCardHtml } from "../image/card";
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
}

/** Decode a `data:<mime>;base64,<bytes>` URI to a Buffer. */
function dataUriToBuffer(dataUri: string): Buffer {
  const comma = dataUri.indexOf(",");
  return Buffer.from(dataUri.slice(comma + 1), "base64");
}

/**
 * Render a result card to a PNG and return its absolute path. Defaults to a 1:1 card written
 * under `<cwd>/out/image`. The `copy` arg is part of the injected slot's contract; the card
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
  const aspect: AspectRatio = opts?.aspect ?? "1:1";
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
  });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: dims.width, height: dims.height },
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.screenshot({ path: outPath });
  } finally {
    await browser.close();
  }

  return outPath;
}
