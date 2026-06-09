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
import { lfahSpec } from "./lfahSpec";

interface NarrationBundle {
  audioPath: string;
  sceneEndTimesSec: number[];
  durationSec: number;
}

const ASPECTS = ["9:16", "1:1", "4:5"];

function loadBundle(): NarrationBundle | null {
  const p = process.env.DEMO_BUNDLE;
  if (!p) return null;
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  const audioPath: string = raw.audioPath;
  const sceneEndTimesSec: number[] = raw.sceneEndTimesSec;
  if (!audioPath || !Array.isArray(sceneEndTimesSec) || sceneEndTimesSec.length === 0) {
    throw new Error(`DEMO_BUNDLE ${p} missing audioPath or sceneEndTimesSec`);
  }
  const durationSec: number = raw.durationSec ?? sceneEndTimesSec[sceneEndTimesSec.length - 1];
  if (!fs.existsSync(audioPath)) throw new Error(`bundle audioPath does not exist: ${audioPath}`);
  return { audioPath, sceneEndTimesSec, durationSec };
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
    console.log(`\n=== #744 multi-aspect demo (FREE / silent) — 3 aspects, frame-filling ===\n`);
  }

  const spec = lfahSpec();
  const results: { aspect: string; file: string; bytes: number }[] = [];
  for (const aspectName of ASPECTS) {
    const t0 = Date.now();
    const file = await renderDemoVideo(spec, {
      aspectName,
      outDir,
      ...(bundle
        ? { audioPath: bundle.audioPath, sceneEndTimesSec: bundle.sceneEndTimesSec, durationSec: bundle.durationSec }
        : {}),
    });
    const bytes = fs.statSync(file).size;
    if (bytes <= 0) {
      console.error(`SMOKE FAIL: ${aspectName} render is empty`);
      process.exit(1);
    }
    console.log(`DEMO-PATH: aspect=${aspectName} file="${file}" bytes=${bytes} render=${((Date.now() - t0) / 1000).toFixed(1)}s`);
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
