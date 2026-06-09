/**
 * #763 — NARRATED-demo SCENE-SYNC smoke (FREE by default; NO paid call).
 *
 * Proves the SCENE-transition sync path end-to-end with an INJECTED MOCK voice
 * alignment (zero paid ElevenLabs calls): build the segmented narration → synth
 * with a mock caller that returns a realistic per-character alignment → derive
 * per-scene end-times from that alignment (`narrationSceneEndTimes`) → render the
 * demo with narration-aligned scenes → assert `usedRealSceneSync`:
 *
 *   the rendered scene boundaries EQUAL the narration-derived timings (within a
 *   small tolerance) AND DIFFER from the weight-tiling boundaries.
 *
 * That second clause is the smoke-prove-primary-not-fallback discipline applied
 * to SCENE sync: if the scenes silently fell back to weight-tiling we HARD-FAIL.
 * Mirrors the `usedRealSync` assertion in `smoke/caption-sync-real.ts`.
 *
 * Run (FREE, mock):   `npm run smoke:demo-narrated`
 * Run (REAL, PAID):   `npm run smoke:demo-narrated:paid`  ← operator-only; one paid synth.
 *   The paid path is gated behind DEMO_NARRATED_PAID=1 so this smoke can NEVER
 *   make a paid call by accident.
 */

import * as fs from "fs";
import * as path from "path";

import { synthesizeVoiceToFile } from "../adapters/voice";
import { renderDemoVideo, makeSilentWav } from "../adapters/video";
import { buildDemoTimeline, narrationSceneEndTimes, clampDemoDurationSec } from "../video/demoTimeline";
import { DEMO_NARRATION, narrationScript } from "../video/demoNarration";
import { buildDemoCaptionCues, assertVoicedDemoHasCaptions } from "../video/demoCaptions";
import {
  type VoiceCaller,
  type VoiceClip,
  type SpeechRequest,
} from "../audio/voiceover";
import { lfahSpec } from "./lfahSpec";

const PAID = process.env.DEMO_NARRATED_PAID === "1";
const EPS = 1e-2; // 10ms tolerance on scene boundaries
const TARGET_DUR = 65; // realistic ~65s narration

/**
 * A MOCK ElevenLabs-shaped caller — returns a realistic per-character alignment
 * for the spoken script and a tiny silent audio payload. Makes NO network/paid
 * call. The alignment is deliberately NON-LINEAR (slower in the middle) so the
 * derived scene boundaries genuinely differ from even weight-tiling.
 */
function mockVoiceCaller(durationSec: number): VoiceCaller {
  return async (req: SpeechRequest): Promise<VoiceClip> => {
    const n = req.text.length;
    // Non-linear cumulative timing: ease-in-out over the character index so the
    // pace varies through the script (a real voice never speaks at a flat rate).
    const charEndTimesSec: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = (i + 1) / n; // 0..1
      const eased = x * x * (3 - 2 * x); // smoothstep
      charEndTimesSec.push(Number((eased * durationSec).toFixed(4)));
    }
    // Force the last entry to exactly durationSec (mirrors a real clip's end).
    charEndTimesSec[n - 1] = durationSec;
    const audio = makeSilentWav(durationSec).toString("base64");
    return {
      provider: req.provider,
      voiceId: req.voiceId,
      audio,
      durationSec,
      charEndTimesSec,
    };
  };
}

async function main() {
  const reviewDir = path.join(process.cwd(), "out", "review", "lfah", "demo-narrated");
  fs.mkdirSync(reviewDir, { recursive: true });

  const script = narrationScript(DEMO_NARRATION);
  console.log(
    `\n=== #763 demo-narrated SCENE-SYNC smoke — ${DEMO_NARRATION.length} segments, ` +
      `${script.length} chars, ${PAID ? "PAID (real synth)" : "FREE (mock alignment, NO paid call)"} ===\n`,
  );

  // ── synth: PAID only when explicitly gated; otherwise an INJECTED mock ──────
  const audioFile = "demo-narration.wav";
  const voice = await synthesizeVoiceToFile(
    { script },
    PAID ? undefined : { primary: mockVoiceCaller(TARGET_DUR) },
    { outDir: path.join(reviewDir, "audio"), fileName: audioFile },
  );
  console.log(`  ${voice.pathLine}`);

  const charEndTimesSec = voice.charEndTimesSec;
  if (!charEndTimesSec || charEndTimesSec.length === 0) {
    console.error("FAIL: no per-character alignment returned (cannot sync scenes).");
    process.exit(1);
  }
  const durationSec = voice.durationSec;

  // ── derive per-scene end-times from the alignment ──────────────────────────
  const sceneEndTimesSec = narrationSceneEndTimes(DEMO_NARRATION, charEndTimesSec, durationSec);
  if (!sceneEndTimesSec) {
    console.error("FAIL: narrationSceneEndTimes returned null — alignment did not line up with the script.");
    process.exit(1);
  }

  // ── usedRealSceneSync: narration-aligned timeline vs weight-tiling ─────────
  const narrated = buildDemoTimeline(lfahSpec(), { durationSec, sceneEndTimesSec });
  const weighted = buildDemoTimeline(lfahSpec(), { durationSec }); // fallback

  const narratedEnds = narrated.scenes.map((s) => s.fromSec + s.durationSec);
  const weightedEnds = weighted.scenes.map((s) => s.fromSec + s.durationSec);

  // (a) rendered scene boundaries EQUAL the narration-derived timings (the final
  //     scene snaps to durationSec, which the derivation also targets).
  const equalsNarration = narratedEnds.every(
    (e, i) => Math.abs(e - (i === narratedEnds.length - 1 ? durationSec : sceneEndTimesSec[i])) <= EPS,
  );
  // (b) they DIFFER from weight-tiling (proves the alignment drove the scenes).
  let maxDriftVsWeight = 0;
  for (let i = 0; i < narratedEnds.length; i++) {
    maxDriftVsWeight = Math.max(maxDriftVsWeight, Math.abs(narratedEnds[i] - weightedEnds[i]));
  }
  const differsFromWeights = maxDriftVsWeight > EPS;
  const usedRealSceneSync = equalsNarration && differsFromWeights;

  // ── #775 — caption track (synced to the real voice alignment). Build it here so the
  //     bundle records its size + we can FAIL the smoke if a voiced demo would ship empty
  //     captions (the parity invariant, proven FREE on the mock path). The caption clip's
  //     duration is the CLAMPED demo duration the render actually uses (45–90s window).
  const renderDurationSec = clampDemoDurationSec(durationSec);
  const captionCues = buildDemoCaptionCues(script, { durationSec: renderDurationSec, charEndTimesSec });
  assertVoicedDemoHasCaptions(captionCues, { durationSec: renderDurationSec });
  const captionsClean = Math.abs(captionCues[captionCues.length - 1].endSec - renderDurationSec) <= 1e-3;

  // ── render the demo with the narration-aligned scenes + synced captions ────
  let videoPath: string | undefined;
  let videoNote: string | undefined;
  try {
    console.log("→ rendering the narrated demo MP4 (scenes follow the narration; synced captions)…");
    videoPath = await renderDemoVideo(lfahSpec(), {
      durationSec,
      audioPath: voice.audioPath,
      sceneEndTimesSec,
      script,
      charEndTimesSec,
      outDir: reviewDir,
      fileName: "demo-narrated-9x16.mp4",
    });
    const bytes = fs.statSync(videoPath).size;
    if (bytes <= 0) throw new Error("rendered MP4 is empty");
    console.log(`  video: ${videoPath} (${bytes} bytes)`);
  } catch (err) {
    videoNote = `video render skipped (best-effort): ${err instanceof Error ? err.message : String(err)}`;
    console.warn(`  ${videoNote}`);
  }

  const syncCheck = {
    task: "#763/#775",
    paidCall: PAID,
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
    // #775 — the FULL alignment bundle (SOURCE data, not just the derived sceneEndTimesSec):
    // persist the spoken script + the per-character end-times so future caption renders are
    // FREE (no paid re-synth) — the lesson from feedback_carry_capabilities_and_source_data_across_redesign.
    script,
    charEndTimesSec: charEndTimesSec.map((s) => Number(s.toFixed(4))),
    captionCount: captionCues.length,
    captionsClean,
    audioPath: voice.audioPath,
    videoPath: videoPath ?? null,
    videoNote: videoNote ?? null,
  };
  fs.writeFileSync(
    path.join(reviewDir, "scene-sync-check.json"),
    JSON.stringify(syncCheck, null, 2) + "\n",
  );

  console.log("\n=== scene-sync-check.json (charEndTimesSec elided) ===");
  console.log(JSON.stringify({ ...syncCheck, charEndTimesSec: `[${charEndTimesSec.length} entries]`, script: `${script.length} chars` }, null, 2));

  // #775 — a voiced demo MUST carry captions; the parity assertion above already threw on empty,
  // but guard the recorded count too so a silent regression can't pass the smoke.
  if (captionCues.length === 0) {
    console.error("\n#775 CAPTION-PARITY: FAIL — caption track is EMPTY.");
    process.exit(1);
  }

  if (!usedRealSceneSync) {
    if (!equalsNarration)
      console.error("\nFAIL: rendered scene boundaries do NOT equal the narration-derived timings.");
    if (!differsFromWeights)
      console.error(
        "\nFAIL: scenes fell back to WEIGHT-TILING — the real alignment path was NOT proven.",
      );
    console.error("\n#763 SCENE-SYNC: FAIL");
    process.exit(1);
  }

  console.log(
    `\n#763/#775 SCENE-SYNC + CAPTIONS: PASS — usedRealSceneSync=true, ${captionCues.length} synced captions ` +
      `(scenes follow the narration; max drift vs weight-tiling = ${maxDriftVsWeight.toFixed(2)}s` +
      `${PAID ? "" : "; NO paid call"}).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("#763 demo-narrated FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
