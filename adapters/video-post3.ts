/**
 * Post #3 — forge-harness demo video adapter (composition id="post3-demo").
 *
 * A SEPARATE adapter from `adapters/video.ts` (which a concurrent worktree is editing) — it renders
 * the Post #3 composition (`remotion/post3-index.tsx`) and is wired by the post3 smokes. It SHARES
 * every render mechanic with `renderBuilderDemoVideo` by importing the same pure modules: the audio↔
 * sync provenance guard (`assertAudioMatchesSync`), the per-aspect frame-fill layout (`demoLayout`),
 * and the synced-caption band + parity invariant (`buildDemoCaptionCues` / `assertVoicedDemoHasCaptions`
 * / `reserveCaptionBand` / `captionBandTopY`). The bundle+render+retry loop is replicated inline
 * (the one in `adapters/video.ts` is module-private) so this file never imports that module.
 *
 * Defaults to a free silent 9:16 cut; pass `audioPath` (+ `script`, `sceneEndTimesSec`,
 * `charEndTimesSec` from the SAME synth) for the paid voiceover cut. A voiced render's scene cuts +
 * captions follow the REAL narration; a wrong/old audio file is REFUSED by `assertAudioMatchesSync`.
 * `backgroundImagePath` embeds the SHARED card art as the dimmed, perceptibly-animated full-frame bg.
 */

import * as fs from "fs";
import * as path from "path";

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

import { buildPost3Timeline } from "../video/post3Timeline";
import { demoLayout } from "../video/demoLayout";
import {
  buildDemoCaptionCues,
  assertVoicedDemoHasCaptions,
  reserveCaptionBand,
  captionBandTopY,
} from "../video/demoCaptions";
import { assertAudioMatchesSync } from "../video/audioDuration";
import { ASPECTS, type Aspect } from "../video/renderSpec";
import { type ContentSpec } from "../inputs/contentspec";

export interface RenderPost3Opts {
  outDir?: string;
  fileName?: string;
  aspectName?: string; // "1:1" | "9:16" | "4:5"; default "9:16"
  durationSec?: number;
  fps?: number;
  audioPath?: string;
  sceneEndTimesSec?: number[];
  script?: string;
  charEndTimesSec?: number[];
  renderAttempts?: number;
  /** SHARED card art (`_art-base-forge-harness-post3.png`) embedded as the dimmed animated bg. */
  backgroundImagePath?: string;
  backgroundScrimOpacity?: number;
  backgroundBlurPx?: number;
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

/**
 * Bundle the post3 Remotion entry and render one composition to an MP4, retrying the select+render on
 * a transient headless-Chromium serve flake so a one-off hiccup never discards the (sometimes paid)
 * upstream artifacts. Mirrors the private `renderRemotion` in `adapters/video.ts`.
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

/**
 * Render the Post #3 forge-harness demo MP4 and return its absolute path.
 */
export async function renderPost3DemoVideo(spec: ContentSpec, opts?: RenderPost3Opts): Promise<string> {
  const fps = opts?.fps ?? 30;
  const timeline = buildPost3Timeline(spec, {
    durationSec: opts?.durationSec,
    fps,
    sceneEndTimesSec: opts?.sceneEndTimesSec,
  });
  const durationSec = timeline.durationSec;

  // #774 provenance guard — a voiced render's audio MUST be the synth the alignment came from.
  if (opts?.audioPath && opts?.sceneEndTimesSec && opts.sceneEndTimesSec.length > 0) {
    assertAudioMatchesSync(opts.audioPath, opts.sceneEndTimesSec);
  }

  const aspectName = opts?.aspectName ?? "9:16";
  const aspect: Aspect | undefined = ASPECTS.find((a) => a.name === aspectName);
  if (!aspect) throw new Error(`unknown aspect "${aspectName}"`);
  const width = aspect.width;
  const height = aspect.height;
  const baseLayout = demoLayout(width, height);
  const durationInFrames = Math.max(1, Math.round(durationSec * fps));

  // #775 parity — a voiced render (audioPath) MUST carry a script → non-empty captions spanning clip.
  const hasScript = typeof opts?.script === "string" && opts.script.trim().length > 0;
  if (opts?.audioPath && !hasScript) {
    throw new Error(
      "#775 parity: a voiced post3-demo render (audioPath set) must carry captions — pass opts.script (the spoken narration).",
    );
  }
  let layout = baseLayout;
  let captionCues: ReturnType<typeof buildDemoCaptionCues> = [];
  let captionBandY = 0;
  if (hasScript) {
    const clip = { durationSec, charEndTimesSec: opts!.charEndTimesSec };
    captionCues = buildDemoCaptionCues(opts!.script!, clip);
    assertVoicedDemoHasCaptions(captionCues, clip);
    layout = reserveCaptionBand(baseLayout);
    captionBandY = captionBandTopY(layout, height);
  }

  const inputProps = {
    title: timeline.title,
    tagline: timeline.tagline,
    scenes: timeline.scenes,
    foreman: timeline.foreman,
    problem: timeline.problem,
    flip: timeline.flip,
    receipt: timeline.receipt,
    determinism: timeline.determinism,
    cta: timeline.cta,
    audioSrc: opts?.audioPath ? toDataUri(opts.audioPath) : undefined,
    captions: captionCues,
    captionBandY,
    layout,
    width,
    height,
    fps,
    durationInFrames,
    backgroundSrc: opts?.backgroundImagePath ? toDataUri(opts.backgroundImagePath) : undefined,
    backgroundScrimOpacity: opts?.backgroundScrimOpacity,
    backgroundBlurPx: opts?.backgroundBlurPx,
  };

  const outDir = opts?.outDir ?? path.join(process.cwd(), "out", "video");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, opts?.fileName ?? `post3-demo-${aspectName.replace(":", "x")}.mp4`);

  const entryPoint = path.join(__dirname, "..", "remotion", "post3-index.tsx");
  return renderRemotion({
    entryPoint,
    id: "post3-demo",
    inputProps,
    outPath,
    maxAttempts: opts?.renderAttempts ?? 3,
  });
}
