/**
 * #824 — FREE silent CI smoke for the DEMONSTRATION composition (id="demo-frames").
 *
 * Renders the demo-frames hero from PLACEHOLDER captured frames (solid-color PNGs generated in a
 * tmp dir via Playwright — NO network, NO Adam synth, NO nano-banana), proves the frame-ingest →
 * timeline → Remotion path end-to-end, prints a `DEMO-FRAMES-PATH:` line, and asserts the output
 * MP4 exists with bytes > 0 (process.exit(1) on empty — mirrors smoke/demo-multi-aspect.ts).
 *
 * Run: `npm run smoke:demo-frames`
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { chromium } from "playwright";

import { renderFrameDemoVideo } from "../adapters/video";
import { buildFrameDemoTimeline } from "../video/demoFrameTimeline";
import { type FrameEntry } from "../inputs/frames";
import { probeRender, assertVideoFrameCount } from "../video/renderProbe";
import { toRepoRelative } from "./relpath";

// A small brand-clean demonstration narration — one segment per placeholder frame.
const NARRATION = [
  { text: "This is forge-harness. Eight composable tools, and only one ever costs anything." },
  { text: "forge_plan turns one sentence into a real plan with a binary test as its acceptance criterion." },
  { text: "forge_generate hands the agent a brief — the story, the test, the code context. Zero cost." },
  { text: "forge_evaluate runs the real shell test. There's the honest green PASS — same command, real exit code." },
];

const STEP_LABELS = [
  "forge — 8 tools",
  "forge_plan → execution-plan.json",
  "forge_generate → brief",
  "forge_evaluate → PASS",
];

const COLORS = ["#0a0f1e", "#13213b", "#1a2a4a", "#0f1c33"];

/** Render a solid-color placeholder PNG (16:9, like a real screen-capture) via Playwright — no network. */
async function makePlaceholderPng(outPath: string, color: string, label: string): Promise<void> {
  const w = 1280;
  const h = 720;
  const html =
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>` +
    `*{margin:0;padding:0;box-sizing:border-box}` +
    `body{width:${w}px;height:${h}px;background:${color};color:#cbd5e1;` +
    `font-family:monospace;display:flex;align-items:center;justify-content:center;font-size:42px}` +
    `</style></head><body>${label}</body></html>`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.screenshot({ path: outPath });
  } finally {
    await browser.close();
  }
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-frames-smoke-"));
  const manifest: FrameEntry[] = [];
  for (let i = 0; i < NARRATION.length; i++) {
    const p = path.join(tmpDir, `step-${i}.png`);
    await makePlaceholderPng(p, COLORS[i % COLORS.length], STEP_LABELS[i]);
    manifest.push({ path: p, stepLabel: STEP_LABELS[i], narrationSegmentIndex: i });
  }
  // tmpDir is an OS tmp path (/var/folders/…) — print a scrubbed form so the capture frame stays clean (#824).
  console.log(`[demo-frames] generated ${manifest.length} placeholder frames in ${toRepoRelative(tmpDir)}`);

  const outDir = path.join(process.cwd(), "out", "review", "demo-frames");
  fs.mkdirSync(outDir, { recursive: true });

  const RENDER_FPS = 30;
  // Silent / free cut — no audioPath, no script (no captions, no synth). Scenes tile by equal
  // weight (no alignment supplied) and the duration clamps to the free [45,90] window.
  const file = await renderFrameDemoVideo(manifest, NARRATION, { aspectName: "9:16", outDir, fps: RENDER_FPS });

  const bytes = fs.existsSync(file) ? fs.statSync(file).size : 0;
  // Repo-relative so the captured frame never shows an absolute /Users/<name> path (#824 publish-clean).
  console.log(`DEMO-FRAMES-PATH: file="${toRepoRelative(file)}" bytes=${bytes}`);
  if (!(bytes > 0)) {
    console.error("SMOKE FAIL: demo-frames render is empty (bytes <= 0)");
    process.exit(1);
  }

  // Verify the render produced the full cut (a truncated MP4 FAILS) — mirror demo-multi-aspect.
  const expectedDurationSec = buildFrameDemoTimeline(manifest, NARRATION, { fps: RENDER_FPS }).durationSec;
  const probe = probeRender(file);
  console.log(
    `RENDER-VERIFY: frames=${probe.videoFrames} dur=${probe.videoDurationSec.toFixed(2)}s ` +
      `audio=${probe.hasAudioStream} (expected ~${Math.round(expectedDurationSec * RENDER_FPS)} frames @ ${RENDER_FPS}fps)`,
  );
  try {
    assertVideoFrameCount(probe.videoFrames, expectedDurationSec, RENDER_FPS, { label: "demo-frames 9:16" });
  } catch (verifyErr) {
    console.error(`SMOKE FAIL: RENDER-VERIFY ${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}`);
    process.exit(1);
  }

  console.log("\nSMOKE PASS: demo-frames rendered from placeholder frames (free/silent).");
  process.exit(0);
}

main().catch((err) => {
  console.error("DEMO-FRAMES SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
