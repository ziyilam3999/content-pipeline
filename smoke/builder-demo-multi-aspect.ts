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
 * Run: `npm run smoke:builder-demo-multi`  |  `DEMO_BUNDLE=<path> npm run smoke:builder-demo-multi`
 */
import * as fs from "fs";
import * as path from "path";

import { renderBuilderDemoVideo } from "../adapters/video";
import { audioDurationSec } from "../video/audioDuration";
import { clampDemoDurationSec } from "../video/demoTimeline";
import { probeRender, assertVideoFrameCount } from "../video/renderProbe";
import { builderSpec } from "../inputs/builderSpec";

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
  const outDir = path.join(process.cwd(), "out", "review", "lfah", "demo-builder", "multi-aspect");
  fs.mkdirSync(outDir, { recursive: true });

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
