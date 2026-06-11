/**
 * #824 — frame-ingest adapter: load each captured PNG from a `FrameManifest` and embed it as a
 * data URI for the Remotion `demo-frames` composition (Remotion's Chromium refuses arbitrary
 * file:// resources, so every asset is inlined).
 *
 * REUSES `toDataUri` from `adapters/video.ts` (EXPORTED for this — plan review amendment #1): the
 * SAME base64 encoder the launch/demo renders use, never a second one. Each file is validated to
 * exist + be non-empty BEFORE embedding, and each step label is brand-scrubbed, so a missing
 * capture or a leaked employer token HARD-FAILS at ingest instead of silently shipping.
 */

import * as fs from "fs";
import * as path from "path";
import { chromium } from "playwright";

import { toDataUri } from "./video";
import { type FrameManifest, type FrameEntry, assertBrandClean } from "../inputs/frames";
import { buildFrameCardHtml } from "../image/frameCard";

/** One embedded frame ready for the composition: the inlined image + its brand-clean step label. */
export interface EmbeddedFrame {
  /** `data:image/png;base64,…` — the captured frame inlined for Remotion. */
  dataUri: string;
  /** The (brand-scrubbed) step label drawn as the annotation pill. */
  stepLabel: string;
  /** The narration segment / scene this frame is held under (carried through from the manifest). */
  narrationSegmentIndex: number;
}

/**
 * Load + validate + embed each frame in `manifest`, in order. THROWS if any path is missing or the
 * file is empty (0 bytes), or if a step label carries a forbidden employer token. The returned
 * array is 1:1 with the manifest (same order), ready to be threaded into the composition props.
 */
export function embedFrames(manifest: FrameManifest): EmbeddedFrame[] {
  return manifest.map((entry, i) => {
    assertBrandClean(entry.stepLabel);
    if (!fs.existsSync(entry.path)) {
      throw new Error(`#824 frame-ingest: frame[${i}] file does not exist: ${entry.path}`);
    }
    const bytes = fs.statSync(entry.path).size;
    if (!(bytes > 0)) {
      throw new Error(`#824 frame-ingest: frame[${i}] file is empty (0 bytes): ${entry.path}`);
    }
    return {
      dataUri: toDataUri(entry.path),
      stepLabel: entry.stepLabel,
      narrationSegmentIndex: entry.narrationSegmentIndex,
    };
  });
}

/**
 * #824 Phase 3 — render ONE annotated-still card cut from a captured frame, to a PNG. Embeds the
 * frame (validates exists + non-empty + brand-clean label, same as `embedFrames`), lays it
 * `contain`-fit on a calm brand panel with a step-label overlay (`buildFrameCardHtml`), and
 * screenshots it via the existing Playwright path (mirrors `adapters/image.ts renderImage`). The
 * hero video + these cards share ONE source frame. Returns the output PNG's absolute path.
 */
export async function renderFrameCard(
  entry: FrameEntry,
  dims: { width: number; height: number },
  opts?: { outDir?: string; fileName?: string },
): Promise<string> {
  assertBrandClean(entry.stepLabel);
  if (!fs.existsSync(entry.path)) {
    throw new Error(`#824 frame-card: frame file does not exist: ${entry.path}`);
  }
  if (!(fs.statSync(entry.path).size > 0)) {
    throw new Error(`#824 frame-card: frame file is empty (0 bytes): ${entry.path}`);
  }
  const html = buildFrameCardHtml(toDataUri(entry.path), entry.stepLabel, dims);

  const outDir = opts?.outDir ?? path.join(process.cwd(), "out", "image");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, opts?.fileName ?? `frame-card-${entry.narrationSegmentIndex}.png`);

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
