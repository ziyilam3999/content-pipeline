/**
 * Post #3 forge-harness demo — committed producer for ALL 3 aspects (9:16 HERO / 1:1 / 4:5), each
 * frame-filling, over the SHARED dimmed ANIMATED card art. The Post #2 twin of
 * `smoke/builder-demo-multi-aspect.ts`, rendering the `post3-demo` composition via
 * `renderPost3DemoVideo` (NOT the shared `adapters/video.ts`, which a concurrent worktree edits).
 *
 * BINDS THE SHARED ART (the whole point — feedback_demo_video_must_bind_shared_art_background_not_silent_solid):
 * the video background is the SAME `_art-base-forge-harness-post3.png` the cards are composed over.
 * This smoke HARD-FAILS if that art file is missing — it NEVER silently renders a solid background.
 * Generate the art FIRST (`LAUNCH_CARD_PAID=1 npx tsx smoke/launch-card-post3.ts`), THEN this.
 *
 * Reads the voiced alignment bundle from `smoke/post3-demo-narrated.ts` (one paid synth, reused for
 * all 3 aspects — the render is FREE). Verifies each render: full frame count, audio stream present,
 * 9:16 in the ~90s acceptance window, the background is the bound art (not solid), the motion is
 * PERCEPTIBLE, and a ≤cap mobile proxy.
 *
 * Run: `npx tsx smoke/post3-demo-multi-aspect.ts`
 */

import * as fs from "fs";
import * as path from "path";

import { renderPost3DemoVideo } from "../adapters/video-post3";
import { audioDurationSec } from "../video/audioDuration";
import { clampDemoDurationSec, assertDemoDurationInWindow } from "../video/demoTimeline";
import {
  probeRender,
  assertVideoFrameCount,
  probeMobileProxy,
  assertMobileProxy,
} from "../video/renderProbe";
import { makeMobileProxy } from "../video/mobileProxy";
import { minMotionDisplacementPct } from "../video/artBackgroundMotion";
import { CONFIG } from "../config";
import { forgeHarnessSpec } from "../inputs/forgeHarnessSpec";

const BUNDLE_PATH = path.join("out", "review", "lfah", "demo-post3", "scene-sync-check.json");

/** The SHARED card art that MUST back the video (bound, not solid). */
const ART_BASE = path.join("out", "review", "lfah", "image", "_art-base-forge-harness-post3.png");

const ASPECTS = ["9:16", "1:1", "4:5"];
const RENDER_FPS = 30;
/** Perceptibility floor (% of frame over any 1s window) — the prevention-test threshold (#807). */
const PERCEPTIBILITY_FLOOR_PCT = 0.5;

interface NarrationBundle {
  audioPath: string;
  sceneEndTimesSec: number[];
  durationSec: number;
  script: string;
  charEndTimesSec?: number[];
}

function loadBundle(): NarrationBundle {
  if (!fs.existsSync(BUNDLE_PATH)) {
    throw new Error(
      `SMOKE FAIL: bundle ${BUNDLE_PATH} not found — run smoke/post3-demo-narrated.ts (POST3_DEMO_PAID=1) FIRST.`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(BUNDLE_PATH, "utf8"));
  const audioPath: string = raw.audioPath;
  const sceneEndTimesSec: number[] = raw.sceneEndTimesSec;
  if (!audioPath || !Array.isArray(sceneEndTimesSec) || sceneEndTimesSec.length === 0) {
    throw new Error(`SMOKE FAIL: bundle ${BUNDLE_PATH} missing audioPath or sceneEndTimesSec`);
  }
  if (!fs.existsSync(audioPath)) throw new Error(`SMOKE FAIL: bundle audioPath does not exist: ${audioPath}`);
  const script: string = raw.script;
  if (!script) throw new Error(`SMOKE FAIL: bundle ${BUNDLE_PATH} has no "script" — re-run post3-demo-narrated.`);
  const durationSec: number = raw.durationSec ?? sceneEndTimesSec[sceneEndTimesSec.length - 1];
  const charEndTimesSec: number[] | undefined = Array.isArray(raw.charEndTimesSec) ? raw.charEndTimesSec : undefined;
  return { audioPath, sceneEndTimesSec, durationSec, script, charEndTimesSec };
}

async function main() {
  const bundle = loadBundle();

  // ── BIND THE SHARED ART — HARD FAIL on missing (never a silent solid bg) ──────
  if (!fs.existsSync(ART_BASE)) {
    console.error(
      `SMOKE FAIL: shared art base ${ART_BASE} is MISSING. The forge-harness demo video MUST render ` +
        `over the SAME nano-banana art the cards use — refusing to ship a solid-background video. ` +
        `Generate it first: LAUNCH_CARD_PAID=1 npx tsx smoke/launch-card-post3.ts`,
    );
    process.exit(1);
  }
  const artBytes = fs.statSync(ART_BASE).size;
  if (artBytes < 5000) {
    console.error(`SMOKE FAIL: art base ${ART_BASE} is suspiciously small (${artBytes} bytes).`);
    process.exit(1);
  }
  console.log(`BG-SOURCE: bound art="${ART_BASE}" (${(artBytes / 1024).toFixed(1)} KB) — NOT solid.`);

  const outDir = path.join(process.cwd(), "out", "review", "lfah", "demo-post3", "multi-aspect");
  fs.mkdirSync(outDir, { recursive: true });

  const audioDur = audioDurationSec(bundle.audioPath);
  const expectedDurationSec = clampDemoDurationSec(bundle.durationSec, { voiced: true });
  console.log(
    `\n=== Post #3 multi-aspect demo (VOICED) — audio=${path.basename(bundle.audioPath)} ` +
      `dur=${audioDur?.toFixed(2)}s render=${expectedDurationSec.toFixed(2)}s ===\n`,
  );

  // #808 RULE 3 — the 9:16 voiced deliverable must land in the ~90s acceptance window.
  assertDemoDurationInWindow(expectedDurationSec, { label: "voiced forge-harness demo" });
  console.log(
    `DURATION-WINDOW: ${expectedDurationSec.toFixed(2)}s within ` +
      `[${CONFIG.demo.durationAcceptanceMinSec},${CONFIG.demo.durationAcceptanceMaxSec}]s (target ~${CONFIG.demo.durationTargetSec}s) OK`,
  );

  // PERCEPTIBILITY (#807) — the bound art's motion at the real duration/fps clears the floor.
  const minDisp = minMotionDisplacementPct(expectedDurationSec, RENDER_FPS, 1.0);
  if (minDisp < PERCEPTIBILITY_FLOOR_PCT) {
    console.error(`SMOKE FAIL: background motion ${minDisp.toFixed(3)}%/s < ${PERCEPTIBILITY_FLOOR_PCT}%/s floor (would read as a still).`);
    process.exit(1);
  }
  console.log(`PERCEPTIBILITY: min motion ${minDisp.toFixed(2)}%/s ≥ ${PERCEPTIBILITY_FLOOR_PCT}%/s floor OK`);

  const spec = forgeHarnessSpec();
  const results: { aspect: string; file: string; bytes: number }[] = [];

  for (const aspectName of ASPECTS) {
    const t0 = Date.now();
    const fileName = `post3-demo-${aspectName.replace(":", "x")}.mp4`;
    const file = await renderPost3DemoVideo(spec, {
      aspectName,
      outDir,
      fileName,
      audioPath: bundle.audioPath,
      sceneEndTimesSec: bundle.sceneEndTimesSec,
      durationSec: bundle.durationSec,
      script: bundle.script,
      charEndTimesSec: bundle.charEndTimesSec,
      backgroundImagePath: ART_BASE, // BIND the shared art as the dimmed animated bg
      backgroundScrimOpacity: CONFIG.demo.backgroundScrimOpacity,
    });
    const bytes = fs.statSync(file).size;
    if (bytes <= 0) {
      console.error(`SMOKE FAIL: ${aspectName} render is empty`);
      process.exit(1);
    }
    console.log(`POST3-DEMO-PATH: aspect=${aspectName} file="${file}" bytes=${bytes} render=${((Date.now() - t0) / 1000).toFixed(1)}s`);

    const probe = probeRender(file);
    console.log(
      `RENDER-VERIFY: aspect=${aspectName} frames=${probe.videoFrames} dur=${probe.videoDurationSec.toFixed(2)}s ` +
        `audio=${probe.hasAudioStream} (expected ~${Math.round(expectedDurationSec * RENDER_FPS)} frames @ ${RENDER_FPS}fps)`,
    );
    try {
      assertVideoFrameCount(probe.videoFrames, expectedDurationSec, RENDER_FPS, { label: aspectName });
      if (!probe.hasAudioStream) {
        throw new Error(`voiced ${aspectName} render has NO audio stream — the voiceover was dropped.`);
      }
    } catch (verifyErr) {
      console.error(`SMOKE FAIL: RENDER-VERIFY ${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}`);
      process.exit(1);
    }

    // Mobile proxy (per aspect) — emit + cap-verify.
    try {
      const proxyPath = makeMobileProxy(file);
      const pp = probeMobileProxy(proxyPath);
      assertMobileProxy(
        pp,
        { maxBytes: CONFIG.demo.mobileProxy.maxBytes, maxEdgePx: CONFIG.demo.mobileProxy.maxEdgePx },
        { label: aspectName },
      );
      console.log(
        `MOBILE-PROXY: aspect=${aspectName} file="${proxyPath}" ${(pp.bytes / 1048576).toFixed(2)}MB ` +
          `${pp.widthPx}x${pp.heightPx} faststart=${pp.hasFaststart} OK`,
      );
    } catch (proxyErr) {
      console.error(`SMOKE FAIL: MOBILE-PROXY ${proxyErr instanceof Error ? proxyErr.message : String(proxyErr)}`);
      process.exit(1);
    }

    results.push({ aspect: aspectName, file, bytes });
  }

  if (results.length !== ASPECTS.length) {
    console.error("SMOKE FAIL: not all aspects rendered");
    process.exit(1);
  }
  console.log(`\nSMOKE PASS: ${results.length}/3 forge-harness aspects rendered (voiced, shared-art-bound, provenance-guarded).`);
  for (const r of results) console.log(`ARTIFACT: ${r.file} (${r.bytes} bytes)`);
  process.exit(0);
}

main().catch((err) => {
  console.error("post3-demo-multi-aspect FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
