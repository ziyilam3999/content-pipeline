/**
 * #744/#774 — committed producer for the demo in ALL 3 aspects (1:1 / 9:16 / 4:5),
 * each frame-filling (#765). Replaces the throwaway tmp/ one-off that hand-paired a
 * wrong audio file with a saved alignment and shipped 20s of drift (#744 incident).
 *
 * Provenance is correct BY CONSTRUCTION: a voiced render uses ONE narration bundle
 * (audioPath + sceneEndTimesSec + durationSec, all from the SAME synth), and
 * renderDemoVideo's guard (#774, assertAudioMatchesSync) HARD-FAILS if the audio length
 * disagrees with the alignment. The same bundle drives all three aspects — audio is
 * never re-picked per aspect.
 *
 * FREE (default / CI): renders 3 silent aspects — proves the multi-aspect render path,
 *   the per-aspect frame-fill, and that the guard is a no-op when there is no alignment.
 * VOICED: set DEMO_BUNDLE=<path to a bundle JSON> to render with a real voiceover. The
 *   bundle JSON must carry { audioPath, sceneEndTimesSec, durationSec } from one synth
 *   (e.g. the scene-sync-check.json that smoke/demo-narrated.ts writes). A wrong audio
 *   file is REFUSED by the guard, not silently drifted.
 *
 * Run: `npm run smoke:demo-multi`  |  `DEMO_BUNDLE=out/.../scene-sync-check.json npm run smoke:demo-multi`
 */
import * as fs from "fs";
import * as path from "path";

import { renderDemoVideo } from "../adapters/video";
import { audioDurationSec } from "../video/audioDuration";
import { clampDemoDurationSec } from "../video/demoTimeline";
import { probeRender, assertVideoFrameCount } from "../video/renderProbe";
import { lfahSpec } from "./lfahSpec";

/** #784 — where smoke:demo-narrated writes its full alignment bundle. */
const DEFAULT_BUNDLE_PATH = path.join(
  "out",
  "review",
  "lfah",
  "demo-narrated",
  "scene-sync-check.json",
);

interface NarrationBundle {
  audioPath: string;
  sceneEndTimesSec: number[];
  durationSec: number;
  /** #775 — the spoken script + per-character alignment, so the 3 aspects render SYNCED captions. */
  script?: string;
  charEndTimesSec?: number[];
}

const ASPECTS = ["9:16", "1:1", "4:5"];

function loadBundle(): NarrationBundle | null {
  // #784 — default DEMO_BUNDLE to the bundle smoke:demo-narrated writes, when present.
  // This means the FREE mock path (which writes scene-sync-check.json) feeds the voiced
  // multi-aspect render without an explicit env var — and crucially the smoke no longer
  // silently renders the free/silent cut just because DEMO_BUNDLE was unset.
  let p = process.env.DEMO_BUNDLE;
  if (!p && fs.existsSync(DEFAULT_BUNDLE_PATH)) {
    p = DEFAULT_BUNDLE_PATH;
    console.log(`[demo-multi] DEMO_BUNDLE defaulted to ${p}`);
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
  // #775 — a voiced bundle MUST carry the script so captions render (parity is enforced in
  // renderDemoVideo, but fail EARLY here with a clear message if the bundle is the old derived-only shape).
  if (!script) {
    throw new Error(
      `DEMO_BUNDLE ${p} has no "script" — it's the old derived-only bundle. Re-run smoke:demo-narrated(:paid) ` +
        `to write the full alignment bundle (script + charEndTimesSec) so captions can render.`,
    );
  }
  return { audioPath, sceneEndTimesSec, durationSec, script, charEndTimesSec };
}

async function main() {
  const bundle = loadBundle();
  const outDir = path.join(process.cwd(), "out", "review", "lfah", "demo-multi-aspect");
  fs.mkdirSync(outDir, { recursive: true });

  if (bundle) {
    const audioDur = audioDurationSec(bundle.audioPath);
    console.log(
      `\n=== #744 multi-aspect demo (VOICED) — audio=${path.basename(bundle.audioPath)} ` +
        `dur=${audioDur?.toFixed(2)}s syncEnds=${bundle.sceneEndTimesSec[bundle.sceneEndTimesSec.length - 1]}s ===\n`,
    );
  } else {
    // #784 — LOUD, unmistakable banner so a free/silent cut can NEVER be mistaken for the
    // real voiced deliverable (the silent-overwrite anti-pattern this task fixes).
    console.log("\n############################################################");
    console.log("### RENDERING FREE / SILENT CUT — set DEMO_BUNDLE for the voiced deliverable ###");
    console.log("############################################################\n");
  }

  const spec = lfahSpec();
  // #784 — the duration the render will actually use (the timeline clamps it): voiced uses
  // the real bundle length floored at MIN (no MAX cap); free uses the default cut clamped to
  // [MIN,MAX]. We assert the rendered frame count against this expected duration.
  const RENDER_FPS = 30;
  const expectedDurationSec = bundle
    ? clampDemoDurationSec(bundle.durationSec, { voiced: true })
    : clampDemoDurationSec(undefined);
  const results: { aspect: string; file: string; bytes: number }[] = [];
  for (const aspectName of ASPECTS) {
    const t0 = Date.now();
    const file = await renderDemoVideo(spec, {
      aspectName,
      outDir,
      ...(bundle
        ? {
            audioPath: bundle.audioPath,
            sceneEndTimesSec: bundle.sceneEndTimesSec,
            durationSec: bundle.durationSec,
            script: bundle.script, // #775 — opts the render into the synced caption band
            charEndTimesSec: bundle.charEndTimesSec,
          }
        : {}),
    });
    const bytes = fs.statSync(file).size;
    if (bytes <= 0) {
      console.error(`SMOKE FAIL: ${aspectName} render is empty`);
      process.exit(1);
    }
    console.log(`DEMO-PATH: aspect=${aspectName} file="${file}" bytes=${bytes} render=${((Date.now() - t0) / 1000).toFixed(1)}s`);

    // #784 — VERIFY each rendered aspect: right frame count (a truncated cut FAILS), and a
    // voiced render MUST carry an audio stream. Hard gate — never a silent false-negative.
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
      console.error(`SMOKE FAIL: #784 RENDER-VERIFY ${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}`);
      process.exit(1);
    }
    results.push({ aspect: aspectName, file, bytes });
  }

  if (results.length !== ASPECTS.length) {
    console.error("SMOKE FAIL: not all aspects rendered");
    process.exit(1);
  }
  console.log(`\nSMOKE PASS: ${results.length}/3 aspects rendered${bundle ? " (voiced, provenance-guarded)" : " (free/silent)"}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("MULTI-ASPECT SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
