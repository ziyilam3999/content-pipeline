/**
 * Phase C — the REAL end-to-end run for #721.
 *
 * Feeds local-first-agent-harness ("lfah")'s real, public, brand-safe launch numbers
 * (from its published README) into the conductor with ALL FIVE real renderers wired:
 *
 *   words  → real Claude (Max OAuth, free)
 *   image  → CARD-OVER-ART: nano-banana creative art (PAID Gemini) BEHIND the data card
 *   voice  → real PAID ElevenLabs (primary-only, proven)
 *   video  → real Remotion MP4 (synced to the real audio duration)
 *   publish→ DRY-RUN only (nothing is posted — Phase D is a separate operator yes)
 *
 * It SPENDS real ElevenLabs + Gemini credits (a few cents). It writes a full ContentBundle
 * to a review folder and then STOPS for the operator to review. Nothing goes out.
 *
 * Run: `npm run e2e:lfah`
 *   Requires: ambient `claude` login (Max OAuth, ANTHROPIC_API_KEY unset),
 *             ELEVENLABS_API_KEY + GEMINI_API_KEY in the macOS Keychain.
 */

import * as fs from "fs";
import * as path from "path";

import { type ContentSpec } from "../inputs/contentspec";
import { runPipeline, type PipelineInput, type PipelineDeps, type CopyResult } from "../pipeline/run";
import { writeCopy } from "../adapters/copy";
import { renderImage } from "../adapters/image";
import { synthVoiceStage } from "../adapters/voice";
import { renderVideo } from "../adapters/video";

// ---------------------------------------------------------------------------
// (1) The lfah ContentSpec — REAL public numbers, brand-safe (no employer brand).
//     Sourced verbatim from local-first-agent-harness/README.md "Early results
//     (n=13, SWE-bench Verified)". Public repo; safe to publish.
// ---------------------------------------------------------------------------

const README_SRC = "local-first-agent-harness/README.md";

function lfahSpec(): ContentSpec {
  return {
    product: {
      name: "local-first-agent-harness",
      summary:
        "an AI coding agent that fixes real bugs — runs the heavy work on a cheap local model, " +
        "escalates to the cloud only when stuck, and grades itself with real tests, not an LLM",
      repoUrl: "https://github.com/ziyilam3999/local-first-agent-harness",
    },
    facts: [
      { label: "tasks evaluated", value: "13", scopeGuard: "n=13, SWE-bench Verified", source: README_SRC },
      { label: "full-cloud relay resolved", value: "77%", scopeGuard: "10/13", source: README_SRC },
      { label: "local-first hybrid resolved (with cloud fallback)", value: "62%", scopeGuard: "8/13", source: README_SRC },
      { label: "1-shot Opus resolved", value: "54%", scopeGuard: "7/13", source: README_SRC },
      { label: "full-cloud relay cost", value: "$35.0", scopeGuard: "n=13", source: README_SRC },
      { label: "local-first hybrid cost", value: "$15.7", scopeGuard: "n=13", source: README_SRC },
      { label: "cost saving vs full-cloud (same chain)", value: "55%", scopeGuard: "executor moved to local", source: README_SRC },
      { label: "executor (local) cost share", value: "0%", scopeGuard: "runs free on a local model", source: README_SRC },
    ],
    highlights: [
      "the heavy file-editing role runs free on a local model",
      "graded by the real SWE-bench Docker test oracle, never an LLM judge",
      "cloud fallback rescues the hardest bugs while keeping the honest local result",
    ],
    ctas: ["Try it: pip install git+https://github.com/ziyilam3999/local-first-agent-harness"],
    sourceFiles: [README_SRC],
  };
}

// ---------------------------------------------------------------------------
// (2) Wire the real adapters into the conductor's injected slots.
//     The video duration is synced to the REAL audio: the voice wrapper stashes
//     the true ElevenLabs clip length and the video wrapper reads it.
// ---------------------------------------------------------------------------

async function main() {
  // Refuse pay-as-you-go billing — Max OAuth only.
  if (process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is set — refusing. Unset it and use the Claude Max OAuth login.");
    process.exit(1);
  }

  const reviewDir = path.join(process.cwd(), "out", "review", "lfah");
  fs.mkdirSync(reviewDir, { recursive: true });

  // Only the video DURATION still needs the closure (it isn't part of the
  // conductor's dep boundary). The caption ALIGNMENT (#742) now flows through
  // runPipeline itself: synthVoiceStage returns charEndTimesSec → the conductor
  // threads it into renderVideo. No closure smuggle for the alignment.
  let realDurationSec: number | undefined;

  const deps: PipelineDeps = {
    writeCopy: async (spec): Promise<CopyResult> => {
      console.log("→ [1/5] copy — real Claude (Max OAuth)…");
      const out = await writeCopy(spec);
      console.log(
        `  copy: thread=${out.thread.length} pathUsed=${out.pathUsed} attempts=${out.attempts} ` +
          `verifyOk=${out.verify.ok} unsupported=[${out.verify.unsupportedNumbers.join(",")}]`,
      );
      if (!out.verify.ok) {
        throw new Error(
          `copy number-verify FAILED — unsupported numbers: ${out.verify.unsupportedNumbers.join(", ")}`,
        );
      }
      return { thread: out.thread, script: out.script, labels: out.labels };
    },

    renderImage: async (args): Promise<string> => {
      console.log("→ [2/5] image — CARD-OVER-ART (nano-banana art behind the data card, PAID Gemini)…");
      const p = await renderImage(args, {
        generative: true, // card-over-art: art is the background, card overlays it
        bareArt: false,
        aspect: "1:1",
        outDir: path.join(reviewDir, "image"),
      });
      console.log(`  image: ${p}`);
      return p;
    },

    synthVoice: async (args) => {
      console.log("→ [3/5] voice — real PAID ElevenLabs (primary-only, proven)…");
      const stage = await synthVoiceStage(args, undefined, {
        outDir: path.join(reviewDir, "audio"),
      });
      // Stash only the duration for the video stage (not a conductor dep field).
      // The video duration is recovered from the audio file when re-derived; here
      // we read it back off the same synth call via a follow-up not needed —
      // instead capture it from the alignment array's last entry when present.
      realDurationSec =
        stage.charEndTimesSec && stage.charEndTimesSec.length
          ? stage.charEndTimesSec[stage.charEndTimesSec.length - 1]
          : undefined;
      console.log(`  voice audio: ${stage.audioPath}`);
      // #742 — return charEndTimesSec so the CONDUCTOR threads it to the video
      // stage. Captions sync to the real voice via the live runPipeline path.
      return stage;
    },

    renderVideo: async (args): Promise<string> => {
      console.log("→ [4/5] video — real Remotion MP4 (9:16, synced to real audio)…");
      // args.charEndTimesSec arrives THREADED FROM THE CONDUCTOR (#742) — no closure.
      const p = await renderVideo(args, {
        aspectName: "9:16",
        durationSec: realDurationSec, // sync to the true ElevenLabs clip length
        outDir: path.join(reviewDir, "video"),
      });
      console.log(`  video: ${p}`);
      return p;
    },

    // Dry-run never calls the client; this stub is a safety tripwire if `live` ever flips on here.
    publishClient: async () => {
      throw new Error("publishClient must not be called in Phase C (dry-run only). Posting is Phase D.");
    },
  };

  const input: PipelineInput = {
    repo: "local-first-agent-harness",
    resolveSpec: lfahSpec,
  };

  console.log("\n=== Phase C: REAL end-to-end run (lfah) — spends ElevenLabs + Gemini ===\n");
  const result = await runPipeline(input, deps, {
    outDir: reviewDir,
    targets: ["x"],
    live: false, // STOP before posting; Phase D is a separate operator yes
  });

  console.log("\n=== [5/5] publish — DRY-RUN (nothing posted) ===");
  console.log(`  ${result.bundle.publishPreview.pathLine}`);

  // Save the rendered thread as readable markdown next to the JSON bundle.
  const threadMd = result.bundle.thread.map((t, i) => `**${i + 1}/${result.bundle.thread.length}**\n\n${t}`).join("\n\n---\n\n");
  fs.writeFileSync(path.join(reviewDir, "thread.md"), threadMd + "\n");
  fs.writeFileSync(path.join(reviewDir, "video-script.txt"), result.bundle.script + "\n");

  console.log(`\n${result.pathLine}`);
  console.log("\nSMOKE PASS: complete ContentBundle written for review:");
  console.log(`  folder : ${reviewDir}`);
  console.log(`  bundle : ${result.bundlePath}`);
  console.log(`  thread : ${path.join(reviewDir, "thread.md")} (${result.bundle.thread.length} posts)`);
  console.log(`  image  : ${result.bundle.imagePath}`);
  console.log(`  audio  : ${result.bundle.audioPath}`);
  console.log(`  video  : ${result.bundle.videoPath}`);
  console.log("\nSTOP — review the folder. Nothing is posted until you say yes (Phase D).");
  process.exit(0);
}

main().catch((err) => {
  console.error("E2E FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
