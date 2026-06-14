/**
 * Post #5 three-role-model demo — SCENE-SYNC + voiceover smoke (synth + sync-gate + bundle; NO render).
 *
 * The Post #3 twin of `smoke/post3-demo-narrated.ts`, for the 6-scene three-role-model story. It:
 *   1. synthesizes the Adam narration (PAID ElevenLabs when POST5_DEMO_PAID=1; else an injected MOCK),
 *   2. derives per-scene end-times from the REAL per-character alignment (`narrationSceneEndTimes`),
 *   3. proves `usedRealSceneSync` (scene boundaries EQUAL the narration timing AND DIFFER from the
 *      weight-tiling fallback — smoke-prove-primary-not-fallback for SCENE sync),
 *   4. builds + asserts the synced caption track (parity invariant), and
 *   5. writes the FULL alignment bundle (script + charEndTimesSec + sceneEndTimesSec + audioPath) to
 *      `out/review/lfah/demo-post5/scene-sync-check.json` so the multi-aspect render is FREE.
 *
 * The actual 3-aspect MP4 render happens in `smoke/post5-demo-multi-aspect.ts` (reads this bundle), so
 * the single PAID synth is done once here and reused for all aspects.
 *
 * Run (FREE, mock):  `npx tsx smoke/post5-demo-narrated.ts`
 * Run (REAL, PAID):  `POST5_DEMO_PAID=1 npx tsx smoke/post5-demo-narrated.ts`   ← ONE paid Adam synth.
 */

import * as fs from "fs";
import * as path from "path";

import { synthesizeVoiceToFile } from "../adapters/voice";
import { makeSilentWav } from "../adapters/video";
import { narrationSceneEndTimes, clampDemoDurationSec } from "../video/demoTimeline";
import { buildPost5Timeline } from "../video/post5Timeline";
import { POST5_NARRATION, post5NarrationScript } from "../video/post5Narration";
import { buildDemoCaptionCues, assertVoicedDemoHasCaptions } from "../video/demoCaptions";
import {
  type VoiceCaller,
  type VoiceClip,
  type SpeechRequest,
} from "../audio/voiceover";
import { threeRoleModelSpec } from "../inputs/threeRoleModelSpec";

const PAID = process.env.POST5_DEMO_PAID === "1";
const EPS = 1e-2; // 10ms tolerance on scene boundaries
const TARGET_DUR = 90; // realistic ~90s three-role-model narration
/**
 * Speaking-rate for the PAID synth. The reviewed copy is read by Adam at ~103s at speed 1.0 — just
 * over the [80,100]s demo window. ElevenLabs `speed` is non-linear near the top of its range (1.09 →
 * ~102s, 1.2 → ~75s), so 1.13 lands the FULL verbatim narration at ~87s — inside the window, near the
 * ~90s target — WITHOUT cutting a single reviewed word. Override with $POST5_DEMO_SPEED.
 */
const SPEED = Number(process.env.POST5_DEMO_SPEED ?? "1.13");

/** A MOCK ElevenLabs-shaped caller (NO paid call) — non-linear alignment so scene boundaries differ from weight-tiling. */
function mockVoiceCaller(durationSec: number): VoiceCaller {
  return async (req: SpeechRequest): Promise<VoiceClip> => {
    const n = req.text.length;
    const charEndTimesSec: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = (i + 1) / n;
      const eased = x * x * (3 - 2 * x); // smoothstep
      charEndTimesSec.push(Number((eased * durationSec).toFixed(4)));
    }
    charEndTimesSec[n - 1] = durationSec;
    const audio = makeSilentWav(durationSec).toString("base64");
    return { provider: req.provider, voiceId: req.voiceId, audio, durationSec, charEndTimesSec };
  };
}

async function main() {
  const reviewDir = path.join(process.cwd(), "out", "review", "lfah", "demo-post5");
  fs.mkdirSync(reviewDir, { recursive: true });

  const script = post5NarrationScript(POST5_NARRATION);
  console.log(
    `\n=== Post #5 three-role-model demo SCENE-SYNC smoke — ${POST5_NARRATION.length} segments, ` +
      `${script.length} chars, ${PAID ? "PAID (real Adam synth)" : "FREE (mock alignment, NO paid call)"} ===\n`,
  );

  // ── synth: PAID only when explicitly gated; otherwise an INJECTED mock ──────
  const audioFile = "post5-narration.mp3";
  const voice = await synthesizeVoiceToFile(
    { script },
    PAID ? undefined : { primary: mockVoiceCaller(TARGET_DUR) },
    { outDir: path.join(reviewDir, "audio"), fileName: audioFile, speed: PAID ? SPEED : undefined },
  );
  console.log(`  ${voice.pathLine}`);
  console.log(
    `  SMOKE-PATH: primary=elevenlabs used=${voice.usedProvider} clean=${voice.provedPrimary} paid=${PAID}`,
  );
  if (PAID && !(voice.usedProvider === "elevenlabs" && voice.provedPrimary)) {
    console.error("\nSMOKE FAIL: paid run did NOT prove the elevenlabs primary (fell to fallback).");
    process.exit(1);
  }

  const charEndTimesSec = voice.charEndTimesSec;
  if (!charEndTimesSec || charEndTimesSec.length === 0) {
    console.error("FAIL: no per-character alignment returned (cannot sync scenes).");
    process.exit(1);
  }
  const durationSec = voice.durationSec;

  // ── derive per-scene end-times from the alignment (SHARED algorithm) ────────
  const sceneEndTimesSec = narrationSceneEndTimes(POST5_NARRATION, charEndTimesSec, durationSec);
  if (!sceneEndTimesSec) {
    console.error("FAIL: narrationSceneEndTimes returned null — alignment did not line up with the script.");
    process.exit(1);
  }

  // ── usedRealSceneSync: narration-aligned timeline vs weight-tiling ─────────
  const narrated = buildPost5Timeline(threeRoleModelSpec(), { durationSec, sceneEndTimesSec });
  const weighted = buildPost5Timeline(threeRoleModelSpec(), { durationSec }); // fallback

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

  const syncCheck = {
    post: "three-role-model-post5",
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
    // FULL alignment bundle (SOURCE data) so the multi-aspect render is FREE.
    script,
    charEndTimesSec: charEndTimesSec.map((s) => Number(s.toFixed(4))),
    captionCount: captionCues.length,
    captionsClean,
    audioPath: voice.audioPath,
  };
  fs.writeFileSync(path.join(reviewDir, "scene-sync-check.json"), JSON.stringify(syncCheck, null, 2) + "\n");

  console.log("\n=== scene-sync-check.json (charEndTimesSec elided) ===");
  console.log(
    JSON.stringify(
      { ...syncCheck, charEndTimesSec: `[${charEndTimesSec.length} entries]`, script: `${script.length} chars` },
      null,
      2,
    ),
  );

  if (captionCues.length === 0) {
    console.error("\nCAPTION-PARITY: FAIL — caption track is EMPTY.");
    process.exit(1);
  }
  if (!usedRealSceneSync) {
    if (!equalsNarration) console.error("\nFAIL: rendered scene boundaries do NOT equal the narration-derived timings.");
    if (!differsFromWeights) console.error("\nFAIL: scenes fell back to WEIGHT-TILING — the real alignment path was NOT proven.");
    console.error("\nPost #5 SCENE-SYNC: FAIL");
    process.exit(1);
  }

  console.log(
    `\nPost #5 SCENE-SYNC + CAPTIONS: PASS — usedRealSceneSync=true, ${captionCues.length} synced captions ` +
      `(6 scenes follow the narration; max drift vs weight-tiling = ${maxDriftVsWeight.toFixed(2)}s` +
      `${PAID ? "" : "; NO paid call"}). dur=${durationSec.toFixed(2)}s → render clamp ${renderDurationSec.toFixed(2)}s.`,
  );
  console.log(`\nBUNDLE: ${path.join(reviewDir, "scene-sync-check.json")}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("post5-demo-narrated FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
