/**
 * #799 — committed producer for the BUILDER demo in ALL 3 aspects (1:1 / 9:16 / 4:5), each
 * frame-filling. The Post #2 twin of `smoke/demo-multi-aspect.ts`.
 *
 * Provenance is correct BY CONSTRUCTION: a voiced render uses ONE narration bundle (audioPath +
 * sceneEndTimesSec + durationSec + script + charEndTimesSec, all from the SAME synth), and
 * renderBuilderDemoVideo's guard (assertAudioMatchesSync) HARD-FAILS if the audio length disagrees
 * with the alignment. The same bundle drives all three aspects — audio is never re-picked per aspect.
 *
 * FREE (default / CI): renders 3 silent aspects — proves the multi-aspect render path + per-aspect
 *   frame-fill, and that the guard is a no-op when there is no alignment.
 * VOICED: defaults DEMO_BUNDLE to the bundle smoke:builder-demo-narrated writes; or set DEMO_BUNDLE
 *   to a bundle JSON carrying { audioPath, sceneEndTimesSec, durationSec, script, charEndTimesSec }.
 *
 * #817 ART-SOURCE-BOUND: this demo INTENDS generative art (CONFIG.demo.animatedBackgroundDefault).
 *   The art-base image (`_art-base-post2.png`) MUST exist and be bound to the render, OR you must set
 *   DEMO_BG=0 for an intentional solid. A missing/unbound art base HARD-FAILS (assertDemoArtBound)
 *   instead of silently shipping a solid background that the #807 motion gate cannot catch. The video
 *   bg + the post-2 cards must derive from the SAME _art-base-post2.png (assertSharedArtSource).
 *
 * Run: `npm run smoke:builder-demo-multi`  |  `DEMO_BUNDLE=<path> npm run smoke:builder-demo-multi`
 *      `DEMO_BG=0 npm run smoke:builder-demo-multi`  (intentional solid, no art needed)
 */
import * as fs from "fs";
import * as path from "path";

import { renderBuilderDemoVideo } from "../adapters/video";
import { audioDurationSec } from "../video/audioDuration";
import { clampDemoDurationSec, assertDemoDurationInWindow } from "../video/demoTimeline";
import {
  probeRender,
  assertVideoFrameCount,
  probeMobileProxy,
  assertMobileProxy,
} from "../video/renderProbe";
import { resolveDemoBackground } from "../video/demoBackground";
import { assertDemoArtBound, assertSharedArtSource } from "../video/demoArtBinding";
import { makeMobileProxy } from "../video/mobileProxy";
import { CONFIG } from "../config";
import { builderSpec } from "../inputs/builderSpec";
import { artBasePngPath } from "./launch-card";

/** Where smoke:builder-demo-narrated writes its full alignment bundle. */
const DEFAULT_BUNDLE_PATH = path.join("out", "review", "lfah", "demo-builder", "scene-sync-check.json");

interface NarrationBundle {
  audioPath: string;
  sceneEndTimesSec: number[];
  durationSec: number;
  script?: string;
  charEndTimesSec?: number[];
}

const ASPECTS = ["9:16", "1:1", "4:5"];

/**
 * #808 RULE 1 — the perceptible animated generative-art background ("the card art, animated") is the
 * DEFAULT: whenever the post-2 art-base image EXISTS, the moving background renders AUTOMATICALLY
 * (no env flag needed). Override the image with DEMO_BG_IMAGE; disable entirely with DEMO_BG=0/off.
 * Scrim defaults to CONFIG.demo.backgroundScrimOpacity (override DEMO_BG_SCRIM); blur via DEMO_BG_BLUR.
 * The default-on DECISION is the pure `resolveDemoBackground` (unit-tested in demoBackground.test.ts);
 * this wrapper only injects the fs/env reads.
 */
const DEFAULT_BG_IMAGE = path.join("out", "review", "lfah", "image", "_art-base-post2.png");

/**
 * #818 — resolve the bg-image path ONCE. Both loadBackground() and main()'s #817 art-bound guard
 * consume this value, so they MUST always agree; computing it in two places risked a future edit
 * silently desyncing them. Single source: DEMO_BG_IMAGE override, else the post-2 art base.
 */
function resolveBgImagePath(): string {
  return process.env.DEMO_BG_IMAGE ?? DEFAULT_BG_IMAGE;
}
function loadBackground(img: string): { backgroundImagePath: string; backgroundScrimOpacity: number; backgroundBlurPx: number } | null {
  const bg = resolveDemoBackground({
    artImageExists: fs.existsSync(img),
    artImagePath: img,
    demoBgEnv: process.env.DEMO_BG,
    demoBgScrimEnv: process.env.DEMO_BG_SCRIM,
    demoBgBlurEnv: process.env.DEMO_BG_BLUR,
  });
  if (!bg) {
    const off = ["0", "off", "false", "no"].includes((process.env.DEMO_BG ?? "").toLowerCase());
    if (off) {
      console.log("[builder-demo-multi] #808 animated bg disabled via DEMO_BG — solid bg.");
    } else if (!fs.existsSync(img)) {
      // #817 — do NOT claim "rendering solid bg" here: art is INTENDED, so assertDemoArtBound (run
      // in main, before any render) hard-fails on this missing art. Set DEMO_BG=0 for an intentional solid.
      console.warn(
        `[builder-demo-multi] art-base image not found (${img}); #817 art-source-bound guard will BLOCK ` +
          `(set DEMO_BG=0 for an intentional solid render, or generate the post art first).`,
      );
    }
  }
  return bg;
}

function loadBundle(): NarrationBundle | null {
  let p = process.env.DEMO_BUNDLE;
  if (!p && fs.existsSync(DEFAULT_BUNDLE_PATH)) {
    p = DEFAULT_BUNDLE_PATH;
    console.log(`[builder-demo-multi] DEMO_BUNDLE defaulted to ${p}`);
  }
  if (!p) return null;
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  const audioPath: string = raw.audioPath;
  const sceneEndTimesSec: number[] = raw.sceneEndTimesSec;
  if (!audioPath || !Array.isArray(sceneEndTimesSec) || sceneEndTimesSec.length === 0) {
    throw new Error(`DEMO_BUNDLE ${p} missing audioPath or sceneEndTimesSec`);
  }
  const durationSec: number = raw.durationSec ?? sceneEndTimesSec[sceneEndTimesSec.length - 1];
  if (!fs.existsSync(audioPath)) throw new Error(`bundle audioPath does not exist: ${audioPath}`);
  const script: string | undefined = typeof raw.script === "string" ? raw.script : undefined;
  const charEndTimesSec: number[] | undefined = Array.isArray(raw.charEndTimesSec) ? raw.charEndTimesSec : undefined;
  if (!script) {
    throw new Error(
      `DEMO_BUNDLE ${p} has no "script" — it's the old derived-only bundle. Re-run smoke:builder-demo-narrated(:paid) ` +
        `to write the full alignment bundle (script + charEndTimesSec) so captions can render.`,
    );
  }
  return { audioPath, sceneEndTimesSec, durationSec, script, charEndTimesSec };
}

async function main() {
  const bundle = loadBundle();
  const bgImage = resolveBgImagePath(); // #818 — single source, shared with loadBackground + the #817 guard
  const background = loadBackground(bgImage);
  const outDir = path.join(process.cwd(), "out", "review", "lfah", "demo-builder", "multi-aspect");
  fs.mkdirSync(outDir, { recursive: true });

  // #817 ART-SOURCE-BOUND guard (DISTINCT from the #807 motion gate). This demo INTENDS generative
  // art (CONFIG.demo.animatedBackgroundDefault); unless the operator opts out via DEMO_BG=0/off, the
  // render MUST be bound to a REAL, existing art base — else it would silently ship a SOLID background
  // and the motion gate would NOT catch it (a moving solid passes motion). Blocks BEFORE any render so
  // a render-video-before-cards run-order (which loses the bg) hard-fails instead of shipping solid.
  assertDemoArtBound({
    demoBgEnv: process.env.DEMO_BG,
    artImageExists: fs.existsSync(bgImage),
    artImagePath: bgImage,
    resolvedBackground: background,
  });

  // #817 ONE-SHARED-SOURCE: the post-2 demo video bg and the post-2 cards MUST derive from the SAME
  // _art-base-post2.png (one per-post art — prevents forgetting the video bg AND paying for art twice).
  // Skipped when DEMO_BG_IMAGE overrides to a custom (non-art-base) image, or when art is intentionally
  // disabled (background === null via DEMO_BG=0). The cards art path is the canonical post-scoped cache
  // key from launch-card.ts so this enforces the real convention, not a duplicate string.
  //
  // #818 — DEMO_BG_IMAGE override bypasses the shared-source guard BY DESIGN: an explicit custom-bg
  // override is, by definition, no longer the cards' art-base, the same opt-out class as DEMO_BG=0.
  // The skip is CORRECT — its only flaw was being SILENT, so it is now surfaced via console.warn so
  // it's never invisible. #818.
  if (background && !process.env.DEMO_BG_IMAGE) {
    const cardsOutDir = path.join(process.cwd(), "out", "review", "lfah", "image");
    const cardsArt = artBasePngPath(cardsOutDir, "post2");
    assertSharedArtSource(background.backgroundImagePath, cardsArt, "post2");
    console.log(
      `[builder-demo-multi] #817 shared-source OK — video bg + post-2 cards both derive from ` +
        `${path.basename(cardsArt)}`,
    );
  } else if (background && process.env.DEMO_BG_IMAGE) {
    // Active background, but an explicit DEMO_BG_IMAGE override → the shared-source guard is
    // intentionally skipped. Surface it (do NOT warn for the DEMO_BG=0 / background === null solid
    // path — that's the intentional-solid case, already logged below).
    console.warn(
      `[builder-demo-multi] #817 shared-source guard SKIPPED — DEMO_BG_IMAGE override ` +
        `(${process.env.DEMO_BG_IMAGE}) points at a custom bg, so video bg ≠ cards art-base by design. ` +
        `Unset DEMO_BG_IMAGE to enforce shared-source.`,
    );
  }

  if (background) {
    console.log(
      `[builder-demo-multi] #808 animated bg ON (DEFAULT) — image=${path.basename(background.backgroundImagePath)} ` +
        `scrim=${background.backgroundScrimOpacity} blur=${background.backgroundBlurPx}px`,
    );
  } else {
    console.log("[builder-demo-multi] #808 animated bg OFF — solid #0a0f1e background.");
  }

  if (bundle) {
    const audioDur = audioDurationSec(bundle.audioPath);
    console.log(
      `\n=== #799 builder multi-aspect demo (VOICED) — audio=${path.basename(bundle.audioPath)} ` +
        `dur=${audioDur?.toFixed(2)}s syncEnds=${bundle.sceneEndTimesSec[bundle.sceneEndTimesSec.length - 1]}s ===\n`,
    );
  } else {
    console.log("\n############################################################");
    console.log("### RENDERING FREE / SILENT CUT — set DEMO_BUNDLE for the voiced deliverable ###");
    console.log("############################################################\n");
  }

  const spec = builderSpec();
  const RENDER_FPS = 30;
  const expectedDurationSec = bundle
    ? clampDemoDurationSec(bundle.durationSec, { voiced: true })
    : clampDemoDurationSec(undefined);

  // #808 RULE 3 — the VOICED deliverable must land in the ~90s acceptance window [80,100] (config
  // SSOT). A ~99s real voiced cut passes; a future demo that silently drifts to 40s/130s FAILS here.
  // The free/silent CI cut clamps to [45,90] and is exempt (it's a fast no-render path, not a deliverable).
  if (bundle) {
    try {
      assertDemoDurationInWindow(expectedDurationSec, { label: "voiced builder demo" });
      console.log(
        `DURATION-WINDOW: voiced cut ${expectedDurationSec.toFixed(2)}s within ` +
          `[${CONFIG.demo.durationAcceptanceMinSec},${CONFIG.demo.durationAcceptanceMaxSec}]s (target ~${CONFIG.demo.durationTargetSec}s) OK`,
      );
    } catch (durErr) {
      console.error(`SMOKE FAIL: #808 ${durErr instanceof Error ? durErr.message : String(durErr)}`);
      process.exit(1);
    }
  }

  const results: { aspect: string; file: string; bytes: number }[] = [];
  for (const aspectName of ASPECTS) {
    const t0 = Date.now();
    const file = await renderBuilderDemoVideo(spec, {
      aspectName,
      outDir,
      ...(bundle
        ? {
            audioPath: bundle.audioPath,
            sceneEndTimesSec: bundle.sceneEndTimesSec,
            durationSec: bundle.durationSec,
            script: bundle.script,
            charEndTimesSec: bundle.charEndTimesSec,
          }
        : {}),
      ...(background ?? {}), // #805 — animated generative-art background (per-aspect cover-fill)
    });
    const bytes = fs.statSync(file).size;
    if (bytes <= 0) {
      console.error(`SMOKE FAIL: ${aspectName} render is empty`);
      process.exit(1);
    }
    console.log(`BUILDER-DEMO-PATH: aspect=${aspectName} file="${file}" bytes=${bytes} render=${((Date.now() - t0) / 1000).toFixed(1)}s`);

    const probe = probeRender(file);
    console.log(
      `RENDER-VERIFY: aspect=${aspectName} frames=${probe.videoFrames} dur=${probe.videoDurationSec.toFixed(2)}s ` +
        `audio=${probe.hasAudioStream} (expected ~${Math.round(expectedDurationSec * RENDER_FPS)} frames @ ${RENDER_FPS}fps)`,
    );
    try {
      assertVideoFrameCount(probe.videoFrames, expectedDurationSec, RENDER_FPS, { label: aspectName });
      if (bundle && !probe.hasAudioStream) {
        throw new Error(`voiced ${aspectName} render has NO audio stream — the voiceover was dropped.`);
      }
    } catch (verifyErr) {
      console.error(`SMOKE FAIL: #799 RENDER-VERIFY ${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}`);
      process.exit(1);
    }

    // #808 RULE 2 — every delivered review video auto-emits a phone-downloadable mobile proxy
    // (<name>-mobile.mp4) next to the master, then VERIFIES it meets the review-relay caps
    // (≤15MB, ≤720p short-edge, +faststart). A master too big for the phone download relay is
    // useless for remote review; this makes the small sibling mandatory + cap-enforced.
    try {
      const proxyPath = makeMobileProxy(file);
      const pp = probeMobileProxy(proxyPath);
      assertMobileProxy(
        pp,
        { maxBytes: CONFIG.demo.mobileProxy.maxBytes, maxEdgePx: CONFIG.demo.mobileProxy.maxEdgePx },
        { label: aspectName },
      );
      console.log(
        `MOBILE-PROXY: aspect=${aspectName} file="${proxyPath}" ` +
          `${(pp.bytes / 1048576).toFixed(2)}MB ${pp.widthPx}x${pp.heightPx} faststart=${pp.hasFaststart} ` +
          `(cap ${(CONFIG.demo.mobileProxy.maxBytes / 1048576).toFixed(0)}MB / ${CONFIG.demo.mobileProxy.maxEdgePx}p) OK`,
      );
    } catch (proxyErr) {
      console.error(`SMOKE FAIL: #808 MOBILE-PROXY ${proxyErr instanceof Error ? proxyErr.message : String(proxyErr)}`);
      process.exit(1);
    }

    results.push({ aspect: aspectName, file, bytes });
  }

  if (results.length !== ASPECTS.length) {
    console.error("SMOKE FAIL: not all aspects rendered");
    process.exit(1);
  }
  console.log(`\nSMOKE PASS: ${results.length}/3 builder aspects rendered${bundle ? " (voiced, provenance-guarded)" : " (free/silent)"}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("BUILDER MULTI-ASPECT SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
