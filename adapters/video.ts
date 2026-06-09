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
import { buildDemoTimeline } from "../video/demoTimeline";
import { type ContentSpec } from "../inputs/contentspec";

export interface RenderVideoOpts {
  outDir?: string;
  fileName?: string;
  aspectName?: string; // "1:1" | "9:16" | "4:5"; default "9:16"
  fps?: number; // default 30
  durationSec?: number; // explicit; else estimated from the script
  charEndTimesSec?: number[]; // #742 — real per-char end-times; syncs captions to the voice
  renderAttempts?: number; // retries on a transient Remotion serve flake; default 3
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
  args: {
    script: string;
    audioPath: string;
    imagePath: string;
    /**
     * #742 — real per-character end-times threaded from the voice stage by the
     * conductor (`runPipeline`). Takes precedence over `opts.charEndTimesSec`.
     * Lets the adapter be wired DIRECTLY as the injected `renderVideo` dep and
     * still receive the alignment, instead of needing a closure-smuggle wrapper.
     */
    charEndTimesSec?: number[];
  },
  opts?: RenderVideoOpts,
): Promise<string> {
  const aspectName = opts?.aspectName ?? "9:16";
  const aspect: Aspect | undefined = ASPECTS.find((a) => a.name === aspectName);
  if (!aspect) throw new Error(`unknown aspect "${aspectName}"`);
  const fps = opts?.fps ?? 30;
  const durationSec = opts?.durationSec ?? estimateDurationSec(args.script);

  // Build captions + render-spec from the REAL modules. When real per-character
  // timing is supplied (#742) — via the conductor-threaded `args.charEndTimesSec`
  // (preferred) or an explicit `opts.charEndTimesSec` — captions sync to the
  // actual voice instead of an even-split estimate.
  const captionTrack = buildCaptionTrack(args.script, {
    durationSec,
    charEndTimesSec: args.charEndTimesSec ?? opts?.charEndTimesSec,
  });
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
  return renderRemotion({
    entryPoint,
    id: "launch",
    inputProps,
    outPath,
    maxAttempts: opts?.renderAttempts ?? 3,
  });
}

/**
 * Bundle the Remotion entry and render one composition to an MP4, retrying the
 * select+render on a transient headless-Chromium serve flake ("got no response"
 * / net::ERR / Target closed / Timeout) so a one-off hiccup never discards the
 * (sometimes paid) upstream artifacts. The bundle is reused across attempts.
 */
async function renderRemotion(args: {
  entryPoint: string;
  id: string;
  inputProps: Record<string, unknown>;
  outPath: string;
  maxAttempts: number;
}): Promise<string> {
  const serveUrl = await bundle({ entryPoint: args.entryPoint });
  let lastErr: unknown;
  for (let attempt = 1; attempt <= args.maxAttempts; attempt++) {
    try {
      const composition = await selectComposition({ serveUrl, id: args.id, inputProps: args.inputProps });
      await renderMedia({
        composition,
        serveUrl,
        codec: "h264",
        outputLocation: args.outPath,
        inputProps: args.inputProps,
      });
      return args.outPath;
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const transient = /got no response|net::ERR|Target closed|Timeout|ECONNREFUSED/i.test(msg);
      if (!transient || attempt === args.maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export interface RenderDemoOpts {
  outDir?: string;
  fileName?: string;
  durationSec?: number; // default 18 (the free cut); set to the voiceover length for the paid cut
  fps?: number; // default 30
  audioPath?: string; // optional voiceover; omitted → silent (free)
  renderAttempts?: number;
}

/**
 * #748 — render the ANIMATED product-demo MP4 (composition id="demo"):
 * hook (cost-efficiency, free local executor) → 4-way comparison → per-role
 * cost split → honest verdict → CTA, driven by the data-driven
 * `buildDemoTimeline` (brand-safe, fact-sourced). HOOK-FIRST: the cost win lands
 * in the first 30s. Defaults to a free silent 9:16 cut; pass `audioPath` for the
 * paid voiceover cut.
 */
export async function renderDemoVideo(spec: ContentSpec, opts?: RenderDemoOpts): Promise<string> {
  const fps = opts?.fps ?? 30;
  // buildDemoTimeline hard-bounds the duration to the 45–90s launch window; read
  // the clamped value back so the frame count matches the actual timeline.
  const timeline = buildDemoTimeline(spec, { durationSec: opts?.durationSec, fps });
  const durationSec = timeline.durationSec;
  const width = 1080;
  const height = 1920;
  const durationInFrames = Math.max(1, Math.round(durationSec * fps));

  const inputProps = {
    title: timeline.title,
    hookHeadline: timeline.hookHeadline,
    scenes: timeline.scenes,
    nodes: timeline.diagram.nodes,
    edges: timeline.diagram.edges,
    numbers: timeline.numbers,
    arms: timeline.arms,
    costSplit: timeline.costSplit,
    verdict: timeline.verdict,
    cta: timeline.cta,
    repoUrl: timeline.repoUrl,
    audioSrc: opts?.audioPath ? toDataUri(opts.audioPath) : undefined,
    width,
    height,
    fps,
    durationInFrames,
  };

  const outDir = opts?.outDir ?? path.join(process.cwd(), "out", "video");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, opts?.fileName ?? "demo-9x16.mp4");

  const entryPoint = path.join(__dirname, "..", "remotion", "index.tsx");
  return renderRemotion({
    entryPoint,
    id: "demo",
    inputProps,
    outPath,
    maxAttempts: opts?.renderAttempts ?? 3,
  });
}
