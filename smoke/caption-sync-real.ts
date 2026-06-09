/**
 * #745 — REAL-CLIP caption↔voiceover sync check.
 *
 * Proves the REAL alignment path end-to-end: calls the PAID ElevenLabs voice ONCE
 * (with per-character timestamps), builds captions from the REAL alignment + the REAL
 * clip duration, then asserts the captions are actually synced to the voice (not the
 * even-split fallback). This is the smoke-prove-primary-not-fallback discipline applied
 * to caption SYNC: if captions silently fall back to even-split we HARD-FAIL.
 *
 * Cost: exactly ONE paid ElevenLabs synth call (~250 chars, ~6-9 cents). No retries.
 * No image / Gemini call — the video uses a solid background.
 *
 * Artifacts under out/review-745/:
 *   voiceover.mp3      the real paid audio
 *   captions.json      [{ text, startSec, endSec, wordCount }]
 *   sync-check.json     the machine-checkable verdict
 *   caption-sync.mp4   short MP4 (real audio + burned-in captions over a solid bg) — best-effort
 *
 * Run: `npm run smoke:caption-sync-real`
 *   Requires the ElevenLabs key in $ELEVENLABS_API_KEY or the macOS Keychain
 *   (service "ELEVENLABS_API_KEY"). The key is read at runtime and never logged.
 */

import * as fs from "fs";
import * as path from "path";

import { synthesizeVoiceToFile } from "../adapters/voice";
import { buildCaptions, type Caption } from "../video/captions";
import { renderVideo } from "../adapters/video";

// A real, PUBLIC, brand-safe lfah launch line (~250 chars). Numbers are public
// benchmark facts from the local-first-agent-harness README. No employer brand.
const SCRIPT =
  "local first agent harness fixes real bugs. The heavy editing runs free on a " +
  "local model, and it only calls the cloud when it gets stuck. It grades itself " +
  "with real tests, not a language model. On thirteen real bugs it resolved sixty " +
  "two percent for less than half the cost.";

const EPS = 1e-3;

/** Did the built captions use the REAL alignment, or did they fall back to even-split? */
function usedRealSync(script: string, durationSec: number, charEndTimesSec: number[]): boolean {
  const real = buildCaptions(script, { durationSec, charEndTimesSec });
  const even = buildCaptions(script, { durationSec });
  if (real.length !== even.length) return true;
  // If ANY internal boundary differs from even-split, the real alignment drove it.
  for (let i = 0; i < real.length - 1; i++) {
    if (Math.abs(real[i].endSec - even[i].endSec) > EPS) return true;
  }
  return false;
}

function isMonotonic(caps: Caption[]): boolean {
  for (let i = 0; i < caps.length; i++) {
    if (caps[i].endSec < caps[i].startSec - EPS) return false;
    if (i > 0 && caps[i].startSec < caps[i - 1].startSec - EPS) return false;
  }
  return true;
}

function allInRange(caps: Caption[], durationSec: number): boolean {
  return caps.every(
    (c) =>
      c.startSec >= -EPS &&
      c.startSec <= c.endSec + EPS &&
      c.endSec <= durationSec + EPS,
  );
}

/** Caption texts, concatenated word-by-word, must equal the script's words in order. */
function wordAligned(script: string, caps: Caption[]): boolean {
  const scriptWords = script.trim().split(/\s+/);
  const capWords = caps.flatMap((c) => c.text.trim().split(/\s+/));
  if (scriptWords.length !== capWords.length) return false;
  return scriptWords.every((w, i) => w === capWords[i]);
}

/** First start = 0, no gaps between captions, last end = duration. */
function coverage(caps: Caption[], durationSec: number): boolean {
  if (caps.length === 0) return false;
  if (Math.abs(caps[0].startSec - 0) > EPS) return false;
  for (let i = 0; i < caps.length - 1; i++) {
    if (Math.abs(caps[i].endSec - caps[i + 1].startSec) > EPS) return false;
  }
  return Math.abs(caps[caps.length - 1].endSec - durationSec) <= EPS;
}

/** Max boundary drift (seconds) between the real-synced captions and even-split. */
function maxDriftSecVsEvenSplit(
  script: string,
  durationSec: number,
  charEndTimesSec: number[],
): number {
  const real = buildCaptions(script, { durationSec, charEndTimesSec });
  const even = buildCaptions(script, { durationSec });
  let max = 0;
  const n = Math.min(real.length, even.length);
  for (let i = 0; i < n - 1; i++) {
    max = Math.max(max, Math.abs(real[i].endSec - even[i].endSec));
  }
  return max;
}

async function main() {
  const reviewDir = path.join(process.cwd(), "out", "review-745");
  fs.mkdirSync(reviewDir, { recursive: true });

  console.log(`#745 caption-sync-real — script length: ${SCRIPT.length} chars`);
  console.log("→ calling the REAL ElevenLabs voice (PAID, with-timestamps) ONCE…");

  // EXACTLY ONE paid call. No retry loop. If it throws, we STOP and report.
  const voice = await synthesizeVoiceToFile({ script: SCRIPT }, undefined, {
    outDir: reviewDir,
    fileName: "voiceover.mp3",
  });

  console.log(`  ${voice.pathLine}`);

  if (!voice.provedPrimary) {
    console.error("FAIL: voice did not come from the paid ElevenLabs primary.");
    process.exit(1);
  }
  const charEndTimesSec = voice.charEndTimesSec;
  if (!charEndTimesSec || charEndTimesSec.length === 0) {
    console.error("FAIL: ElevenLabs returned no per-character end-times (no alignment).");
    process.exit(1);
  }
  const durationSec = voice.durationSec;
  console.log(
    `  audio: ${voice.audioPath}  duration=${durationSec.toFixed(2)}s  ` +
      `chars=${SCRIPT.length}  alignment=${charEndTimesSec.length}`,
  );

  // Build captions from the REAL alignment + the REAL clip duration.
  const captions = buildCaptions(SCRIPT, { durationSec, charEndTimesSec });

  fs.writeFileSync(
    path.join(reviewDir, "captions.json"),
    JSON.stringify(
      captions.map((c) => ({
        text: c.text,
        startSec: c.startSec,
        endSec: c.endSec,
        wordCount: c.wordCount,
      })),
      null,
      2,
    ) + "\n",
  );

  // ── Build the machine-checkable verdict ──────────────────────────────────
  const checks = {
    usedRealSync: usedRealSync(SCRIPT, durationSec, charEndTimesSec),
    monotonic: isMonotonic(captions),
    allInRange: allInRange(captions, durationSec),
    wordAligned: wordAligned(SCRIPT, captions),
    coverage: coverage(captions, durationSec),
    maxDriftSecVsEvenSplit: Number(
      maxDriftSecVsEvenSplit(SCRIPT, durationSec, charEndTimesSec).toFixed(4),
    ),
  };

  // ── Best-effort: render a short MP4 (real audio + burned-in captions, solid bg) ──
  let videoPath: string | undefined;
  let videoNote: string | undefined;
  try {
    console.log("→ rendering a short MP4 (real audio + captions over a solid background)…");
    videoPath = await renderVideo(
      { script: SCRIPT, audioPath: voice.audioPath, imagePath: "" }, // "" → solid bg, no image
      {
        aspectName: "9:16",
        durationSec,
        charEndTimesSec, // #742/#745 — sync captions to the real voice
        outDir: reviewDir,
        fileName: "caption-sync.mp4",
      },
    );
    console.log(`  video: ${videoPath}`);
  } catch (err) {
    videoNote = `video render skipped (best-effort): ${err instanceof Error ? err.message : String(err)}`;
    console.warn(`  ${videoNote}`);
  }

  const syncCheck = {
    task: "#745",
    scriptChars: SCRIPT.length,
    alignmentLength: charEndTimesSec.length,
    durationSec: Number(durationSec.toFixed(4)),
    captionCount: captions.length,
    ...checks,
    audioPath: voice.audioPath,
    captionsPath: path.join(reviewDir, "captions.json"),
    videoPath: videoPath ?? null,
    videoNote: videoNote ?? null,
  };
  fs.writeFileSync(
    path.join(reviewDir, "sync-check.json"),
    JSON.stringify(syncCheck, null, 2) + "\n",
  );

  console.log("\n=== sync-check.json ===");
  console.log(JSON.stringify(syncCheck, null, 2));

  // ── Verdict ──────────────────────────────────────────────────────────────
  // HARD-FAIL if we did NOT use the real alignment — we must PROVE the real path,
  // never the even-split fallback (smoke-prove-primary-not-fallback).
  const pass =
    checks.usedRealSync &&
    checks.monotonic &&
    checks.allInRange &&
    checks.wordAligned &&
    checks.coverage;

  if (!checks.usedRealSync) {
    console.error(
      "\nFAIL: captions fell back to EVEN-SPLIT — the real alignment path was NOT proven.",
    );
  }
  if (!pass) {
    console.error("\n#745 CAPTION-SYNC: FAIL");
    process.exit(1);
  }
  console.log(
    `\n#745 CAPTION-SYNC: PASS — real sync proven, max drift vs even-split = ` +
      `${checks.maxDriftSecVsEvenSplit}s over ${captions.length} captions.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("#745 FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
