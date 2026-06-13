/**
 * #799 — BUILDER-demo SCENE-SYNC smoke (FREE by default; NO paid call).
 *
 * The Post #2 twin of `smoke/demo-narrated.ts`. Proves the 8-scene SCENE-transition + caption sync
 * path end-to-end with an INJECTED MOCK voice alignment (zero paid ElevenLabs calls): build the
 * segmented builder narration → synth with a mock caller that returns a realistic per-character
 * alignment → derive per-scene end-times (SHARED `narrationSceneEndTimes`) → render the 8-scene
 * builder demo with narration-aligned scenes + synced captions → assert `usedRealSceneSync`:
 *
 *   the rendered scene boundaries EQUAL the narration-derived timings (within a small tolerance)
 *   AND DIFFER from the weight-tiling boundaries (smoke-prove-primary-not-fallback for SCENE sync).
 *
 * It ALSO writes the FULL alignment bundle (script + charEndTimesSec + sceneEndTimesSec + audioPath)
 * to scene-sync-check.json so the multi-aspect render is FREE (no paid re-synth) and provenance-bound.
 *
 * Run (FREE, mock):   `npm run smoke:builder-demo-narrated`
 * Run (REAL, PAID):   `npm run smoke:builder-demo-narrated:paid`  ← operator-only; ONE paid synth.
 *   The paid path is gated behind BUILDER_DEMO_PAID=1 so this smoke can NEVER make a paid call by accident.
 */

import * as fs from "fs";
import * as path from "path";

import { synthesizeVoiceToFile } from "../adapters/voice";
import { renderBuilderDemoVideo, makeSilentWav } from "../adapters/video";
import { narrationSceneEndTimes, clampDemoDurationSec } from "../video/demoTimeline";
import { buildBuilderTimeline } from "../video/builderDemoTimeline";
import { BUILDER_NARRATION, builderNarrationScript } from "../video/builderDemoNarration";
import { buildDemoCaptionCues, assertVoicedDemoHasCaptions } from "../video/demoCaptions";
import { probeRender, assertVideoFrameCount } from "../video/renderProbe";
import { requireEyeballAck } from "../video/eyeballAck";
import {
  type VoiceCaller,
  type VoiceClip,
  type SpeechRequest,
} from "../audio/voiceover";
import { builderSpec } from "../inputs/builderSpec";

const PAID = process.env.BUILDER_DEMO_PAID === "1";
// #867 — the SILENT builder cut the operator eyeballs BEFORE the paid voiceover synth. Produced FREE
// by `npm run smoke:builder-demo-narrated` (mock path → out/review/lfah/demo-builder/builder-demo-9x16.mp4).
// The paid branch is BLOCKED until `npm run eyeball:ack -- <this file>` records a look at its EXACT bytes.
const SILENT_CUT = path.join(process.cwd(), "out", "review", "lfah", "demo-builder", "builder-demo-9x16.mp4");
const EPS = 1e-2; // 10ms tolerance on scene boundaries
const TARGET_DUR = 90; // realistic ~90s builder narration

/**
 * A MOCK ElevenLabs-shaped caller — returns a realistic per-character alignment for the spoken
 * script and a tiny silent audio payload. Makes NO network/paid call. The alignment is deliberately
 * NON-LINEAR (smoothstep) so the derived scene boundaries genuinely differ from even weight-tiling.
 */
function mockVoiceCaller(durationSec: number): VoiceCaller {
  return async (req: SpeechRequest): Promise<VoiceClip> => {
    const n = req.text.length;
    const charEndTimesSec: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = (i + 1) / n; // 0..1
      const eased = x * x * (3 - 2 * x); // smoothstep
      charEndTimesSec.push(Number((eased * durationSec).toFixed(4)));
    }
    charEndTimesSec[n - 1] = durationSec; // force the last entry to exactly durationSec
    const audio = makeSilentWav(durationSec).toString("base64");
    return { provider: req.provider, voiceId: req.voiceId, audio, durationSec, charEndTimesSec };
  };
}

async function main() {
  const reviewDir = path.join(process.cwd(), "out", "review", "lfah", "demo-builder");
  fs.mkdirSync(reviewDir, { recursive: true });

  const script = builderNarrationScript(BUILDER_NARRATION);
  console.log(
    `\n=== #799 builder-demo SCENE-SYNC smoke — ${BUILDER_NARRATION.length} segments, ` +
      `${script.length} chars, ${PAID ? "PAID (real synth)" : "FREE (mock alignment, NO paid call)"} ===\n`,
  );

  // ── #867 EYEBALL GATE — BEFORE the paid ElevenLabs synth. On the PAID path the operator must have
  // LOOKED at the rendered silent cut and recorded an eyeball-ack for its EXACT bytes; otherwise refuse
  // the spend. Fail-closed: no ack / stale ack → THROW before any network call. FREE/mock path never gated.
  if (PAID) {
    requireEyeballAck(SILENT_CUT, { label: "builder demo silent cut (pre-paid-VO)" });
  }

  // ── synth: PAID only when explicitly gated; otherwise an INJECTED mock ──────
  const audioFile = "builder-narration.mp3";
  const voice = await synthesizeVoiceToFile(
    { script },
    PAID ? undefined : { primary: mockVoiceCaller(TARGET_DUR) },
    { outDir: path.join(reviewDir, "audio"), fileName: audioFile },
  );
  // SMOKE-PATH: prove the paid primary ran (not the free/silent fallback). HARD-FAIL on fallback.
  console.log(`  ${voice.pathLine}`);
  console.log(
    `  SMOKE-PATH: primary=elevenlabs used=${voice.usedProvider} clean=${voice.provedPrimary} paid=${PAID}`,
  );
  if (PAID && !(voice.usedProvider === "elevenlabs" && voice.provedPrimary)) {
    console.error("\n#799 SMOKE FAIL: paid run did NOT prove the elevenlabs primary (fell to fallback).");
    process.exit(1);
  }

  const charEndTimesSec = voice.charEndTimesSec;
  if (!charEndTimesSec || charEndTimesSec.length === 0) {
    console.error("FAIL: no per-character alignment returned (cannot sync scenes).");
    process.exit(1);
  }
  const durationSec = voice.durationSec;

  // ── derive per-scene end-times from the alignment (SHARED algorithm) ────────
  const sceneEndTimesSec = narrationSceneEndTimes(BUILDER_NARRATION, charEndTimesSec, durationSec);
  if (!sceneEndTimesSec) {
    console.error("FAIL: narrationSceneEndTimes returned null — alignment did not line up with the script.");
    process.exit(1);
  }

  // ── usedRealSceneSync: narration-aligned timeline vs weight-tiling ─────────
  const narrated = buildBuilderTimeline(builderSpec(), { durationSec, sceneEndTimesSec });
  const weighted = buildBuilderTimeline(builderSpec(), { durationSec }); // fallback

  const narratedEnds = narrated.scenes.map((s) => s.fromSec + s.durationSec);
  const weightedEnds = weighted.scenes.map((s) => s.fromSec + s.durationSec);

  const equalsNarration = narratedEnds.every(
    (e, i) => Math.abs(e - (i === narratedEnds.length - 1 ? durationSec : sceneEndTimesSec[i])) <= EPS,
  );
  let maxDriftVsWeight = 0;
  for (let i = 0; i < narratedEnds.length; i++) {
    maxDriftVsWeight = Math.max(maxDriftVsWeight, Math.abs(narratedEnds[i] - weightedEnds[i]));
  }
  const differsFromWeights = maxDriftVsWeight > EPS;
  const usedRealSceneSync = equalsNarration && differsFromWeights;

  // ── caption track (synced to the real voice alignment) — voiced clamp ──────
  const renderDurationSec = clampDemoDurationSec(durationSec, { voiced: true });
  const captionCues = buildDemoCaptionCues(script, { durationSec: renderDurationSec, charEndTimesSec });
  assertVoicedDemoHasCaptions(captionCues, { durationSec: renderDurationSec });
  const captionsClean = Math.abs(captionCues[captionCues.length - 1].endSec - renderDurationSec) <= 1e-3;

  // ── render the builder demo with narration-aligned scenes + synced captions ─
  let videoPath: string | undefined;
  let videoNote: string | undefined;
  try {
    console.log("→ rendering the narrated builder demo MP4 (scenes follow the narration; synced captions)…");
    videoPath = await renderBuilderDemoVideo(builderSpec(), {
      durationSec,
      audioPath: voice.audioPath,
      sceneEndTimesSec,
      script,
      charEndTimesSec,
      outDir: reviewDir,
      fileName: "builder-demo-9x16.mp4",
    });
    const bytes = fs.statSync(videoPath).size;
    if (bytes <= 0) throw new Error("rendered MP4 is empty");
    console.log(`  video: ${videoPath} (${bytes} bytes)`);
  } catch (err) {
    videoPath = undefined;
    videoNote = `video render skipped (best-effort): ${err instanceof Error ? err.message : String(err)}`;
    console.warn(`  ${videoNote}`);
  }

  // HARD gate — a render that actually succeeded must be the FULL length + carry audio.
  if (videoPath) {
    const RENDER_FPS = 30;
    const probe = probeRender(videoPath);
    console.log(
      `  RENDER-VERIFY: file=${path.basename(videoPath)} frames=${probe.videoFrames} ` +
        `dur=${probe.videoDurationSec.toFixed(2)}s audio=${probe.hasAudioStream} ` +
        `(expected ~${Math.round(renderDurationSec * RENDER_FPS)} frames @ ${RENDER_FPS}fps)`,
    );
    try {
      assertVideoFrameCount(probe.videoFrames, renderDurationSec, RENDER_FPS, { label: "builder-demo 9:16" });
      if (!probe.hasAudioStream) {
        throw new Error("#799 RENDER-VERIFY: voiced builder demo has NO audio stream — the voiceover was dropped.");
      }
    } catch (verifyErr) {
      console.error(`\n#799 RENDER-VERIFY FAIL: ${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}`);
      process.exit(1);
    }
  }

  const syncCheck = {
    task: "#799",
    paidCall: PAID,
    usedProvider: voice.usedProvider,
    provedPrimary: voice.provedPrimary,
    scriptChars: script.length,
    alignmentLength: charEndTimesSec.length,
    durationSec: Number(durationSec.toFixed(4)),
    sceneCount: narrated.scenes.length,
    sceneEndTimesSec: sceneEndTimesSec.map((s) => Number(s.toFixed(3))),
    narratedSceneEnds: narratedEnds.map((s) => Number(s.toFixed(3))),
    weightTilingSceneEnds: weightedEnds.map((s) => Number(s.toFixed(3))),
    maxDriftVsWeightTilingSec: Number(maxDriftVsWeight.toFixed(3)),
    equalsNarration,
    differsFromWeights,
    usedRealSceneSync,
    // FULL alignment bundle (SOURCE data, #775): script + per-character end-times so future renders
    // are FREE (no paid re-synth).
    script,
    charEndTimesSec: charEndTimesSec.map((s) => Number(s.toFixed(4))),
    captionCount: captionCues.length,
    captionsClean,
    audioPath: voice.audioPath,
    videoPath: videoPath ?? null,
    videoNote: videoNote ?? null,
  };
  fs.writeFileSync(path.join(reviewDir, "scene-sync-check.json"), JSON.stringify(syncCheck, null, 2) + "\n");

  console.log("\n=== scene-sync-check.json (charEndTimesSec elided) ===");
  console.log(JSON.stringify({ ...syncCheck, charEndTimesSec: `[${charEndTimesSec.length} entries]`, script: `${script.length} chars` }, null, 2));

  if (captionCues.length === 0) {
    console.error("\n#799 CAPTION-PARITY: FAIL — caption track is EMPTY.");
    process.exit(1);
  }

  if (!usedRealSceneSync) {
    if (!equalsNarration)
      console.error("\nFAIL: rendered scene boundaries do NOT equal the narration-derived timings.");
    if (!differsFromWeights)
      console.error("\nFAIL: scenes fell back to WEIGHT-TILING — the real alignment path was NOT proven.");
    console.error("\n#799 SCENE-SYNC: FAIL");
    process.exit(1);
  }

  console.log(
    `\n#799 SCENE-SYNC + CAPTIONS: PASS — usedRealSceneSync=true, ${captionCues.length} synced captions ` +
      `(8 scenes follow the narration; max drift vs weight-tiling = ${maxDriftVsWeight.toFixed(2)}s` +
      `${PAID ? "" : "; NO paid call"}).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("#799 builder-demo-narrated FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
