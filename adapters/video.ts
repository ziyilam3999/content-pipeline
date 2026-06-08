/**
 * REAL video adapter — fulfils the orchestrator's injected `renderVideo` slot.
 *
 * Wires the already-built caption + render-spec modules to a real Remotion render:
 *   script + audio duration → buildCaptionTrack → buildRenderSpecs → Remotion bundle()+renderMedia() → MP4.
 *
 * No caption/timing/layout maths live here; this adapter only drives Remotion. The premium voice
 * is deferred to the paid gate — for a free run, pass a silent WAV (see `makeSilentWav`).
 */

import * as fs from "fs";
import * as path from "path";

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

import { type CopyResult } from "../pipeline/run";
import { buildCaptionTrack } from "../video/captions";
import { buildRenderSpecs, ASPECTS, type Aspect } from "../video/renderSpec";

export interface RenderVideoOpts {
  outDir?: string;
  fileName?: string;
  aspectName?: string; // "1:1" | "9:16" | "4:5"; default "9:16"
  fps?: number; // default 30
  durationSec?: number; // explicit; else estimated from the script
}

/** A minimal valid 16-bit mono PCM WAV of pure silence — a free placeholder track for smokes. */
export function makeSilentWav(durationSec: number, sampleRate = 8000): Buffer {
  const numSamples = Math.max(1, Math.floor(durationSec * sampleRate));
  const dataSize = numSamples * 2; // 16-bit mono
  const buf = Buffer.alloc(44 + dataSize); // alloc zero-fills → silence
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

/** Embed a local asset as a data URI — Remotion's Chromium refuses arbitrary file:// resources. */
function toDataUri(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mime =
    ext === ".png" ? "image/png"
    : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
    : ext === ".wav" ? "audio/wav"
    : ext === ".mp3" ? "audio/mpeg"
    : "application/octet-stream";
  return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
}

function estimateDurationSec(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(20, Math.max(3, words * 0.4));
}

/**
 * Render the launch video to a real MP4 and return its absolute path.
 * Defaults to a 9:16 vertical video under `<cwd>/out/video`.
 */
export async function renderVideo(
  args: { script: string; audioPath: string; imagePath: string },
  opts?: RenderVideoOpts,
): Promise<string> {
  const aspectName = opts?.aspectName ?? "9:16";
  const aspect: Aspect | undefined = ASPECTS.find((a) => a.name === aspectName);
  if (!aspect) throw new Error(`unknown aspect "${aspectName}"`);
  const fps = opts?.fps ?? 30;
  const durationSec = opts?.durationSec ?? estimateDurationSec(args.script);

  // Build captions + render-spec from the REAL modules.
  const captionTrack = buildCaptionTrack(args.script, { durationSec });
  const renderSpec = buildRenderSpecs(
    {
      script: args.script,
      voiceover: { clip: { durationSec, audio: args.audioPath } },
      captions: { captions: captionTrack.captions, durationSec },
    },
    args.imagePath,
    { aspects: [aspect] },
  )[0];

  const durationInFrames = Math.max(1, Math.round(durationSec * fps));
  const outDir = opts?.outDir ?? path.join(process.cwd(), "out", "video");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, opts?.fileName ?? `launch-${aspectName.replace(":", "x")}.mp4`);

  const inputProps = {
    imageSrc: args.imagePath ? toDataUri(args.imagePath) : "",
    audioSrc: args.audioPath ? toDataUri(args.audioPath) : undefined,
    captions: renderSpec.captions.cues,
    bandY: renderSpec.captions.bandY,
    width: renderSpec.width,
    height: renderSpec.height,
    fps,
    durationInFrames,
  };

  const entryPoint = path.join(__dirname, "..", "remotion", "index.tsx");
  const serveUrl = await bundle({ entryPoint });
  const composition = await selectComposition({ serveUrl, id: "launch", inputProps });
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: outPath,
    inputProps,
  });

  return outPath;
}
