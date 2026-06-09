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

import { runPipeline, type PipelineInput, type PipelineDeps, type CopyResult } from "../pipeline/run";
import { writeCopy } from "../adapters/copy";
import { renderImage } from "../adapters/image";
import { synthesizeVoiceToFile } from "../adapters/voice";
import { renderVideo } from "../adapters/video";
import { lfahSpec } from "./lfahSpec";

// ---------------------------------------------------------------------------
// The lfah ContentSpec (REAL public numbers, brand-safe) is shared from
// ./lfahSpec so the demo-video smoke uses the SAME source — no divergent copies.
// ---------------------------------------------------------------------------

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

  let realDurationSec: number | undefined;
  let realCharEndTimesSec: number[] | undefined;

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

    synthVoice: async (args): Promise<string> => {
      console.log("→ [3/5] voice — real PAID ElevenLabs (primary-only, proven)…");
      const outcome = await synthesizeVoiceToFile(args, undefined, {
        outDir: path.join(reviewDir, "audio"),
      });
      realDurationSec = outcome.durationSec;
      realCharEndTimesSec = outcome.charEndTimesSec; // #742 — sync captions to the real voice
      console.log(`  ${outcome.pathLine}`);
      return outcome.audioPath;
    },

    renderVideo: async (args): Promise<string> => {
      console.log("→ [4/5] video — real Remotion MP4 (9:16, synced to real audio)…");
      const p = await renderVideo(args, {
        aspectName: "9:16",
        durationSec: realDurationSec, // sync to the true ElevenLabs clip length
        charEndTimesSec: realCharEndTimesSec, // #742 — sync captions to the real voice
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
