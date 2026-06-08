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

export interface RenderImageOpts {
  outDir?: string;
  aspect?: AspectRatio;
  fileName?: string;
  maxFacts?: number;
}

/**
 * Render a result card to a PNG and return its absolute path. Defaults to a 1:1 card written
 * under `<cwd>/out/image`. The `copy` arg is part of the injected slot's contract; the card
 * itself is spec-driven (the proven `buildCardHtml` path).
 */
export async function renderImage(
  args: { spec: ContentSpec; copy: CopyResult },
  opts?: RenderImageOpts,
): Promise<string> {
  const aspect: AspectRatio = opts?.aspect ?? "1:1";
  const dims = CONFIG.aspects[aspect];
  const html = buildCardHtml(args.spec, dims, { maxFacts: opts?.maxFacts ?? 4 });

  const outDir = opts?.outDir ?? path.join(process.cwd(), "out", "image");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, opts?.fileName ?? `card-${aspect.replace(":", "x")}.png`);

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
