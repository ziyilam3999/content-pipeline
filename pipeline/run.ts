/**
 * Phase A — the pipeline CONDUCTOR.
 *
 * `runPipeline(input, deps, opts)` is the one "make me the launch content" button.
 * It chains the already-built stages in order:
 *
 *     input → ContentSpec → copy → image → voice → video → publish(dry-run)
 *
 * Every renderer is INJECTED as a dependency (a fake in tests, a real adapter
 * in production) so the conductor itself does zero real I/O and the test oracle
 * can run it. The conductor's job is the WIRING: feed each stage's output into
 * the next, assemble a ContentBundle, save it to a review folder, and keep
 * publish in dry-run by default.
 */

import * as fs from "fs";
import * as path from "path";

import { validateContentSpec, type ContentSpec } from "../inputs/contentspec";
import {
  buildPublishRequest,
  publish,
  assertDryRunSafe,
  type PublishClient,
  type PublishResult,
  type Platform,
} from "../publish/publish";

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

/** The copy stage output: X thread posts, the spoken video script, and infographic labels. */
export interface CopyResult {
  thread: string[];
  script: string;
  labels: string[];
}

/** A repo-selectable input that resolves to a ContentSpec on demand. */
export interface PipelineInput {
  repo: string;
  resolveSpec: () => ContentSpec;
}

/**
 * The voice stage's output. A bare string (the audio file path) stays accepted
 * for backward compatibility; the richer object additionally carries the REAL
 * per-character end-times (#742) so the conductor can thread them into the video
 * stage and guarantee captions sync to the actual voice on the LIVE path —
 * instead of only inside a smoke that smuggles them around via a closure.
 */
export interface VoiceStageResult {
  audioPath: string;
  /** #742 — real per-character end-times (seconds) from the TTS provider; omitted → even-split fallback. */
  charEndTimesSec?: number[];
}

/** The injected renderers; each string return is a file path. */
export interface PipelineDeps {
  writeCopy: (spec: ContentSpec) => Promise<CopyResult>;
  renderImage: (args: { spec: ContentSpec; copy: CopyResult }) => Promise<string>;
  /** Returns the audio path, or `{ audioPath, charEndTimesSec }` to thread real caption sync. */
  synthVoice: (args: { script: string }) => Promise<string | VoiceStageResult>;
  renderVideo: (args: {
    script: string;
    audioPath: string;
    imagePath: string;
    /**
     * #742 — real per-character end-times threaded from the voice stage so the
     * LIVE path syncs captions to the actual voice. Optional: when absent the
     * video stage falls back to an even-split-by-words estimate.
     */
    charEndTimesSec?: number[];
  }) => Promise<string>;
  publishClient: PublishClient;
}

/** The assembled review bundle. */
export interface ContentBundle {
  repo: string;
  thread: string[];
  script: string;
  imagePath: string;
  audioPath: string;
  videoPath: string;
  publishPreview: PublishResult;
}

/** Where to save the bundle, which publish targets, and whether to publish for real. */
export interface PipelineOptions {
  outDir: string;
  targets?: Platform[];
  live?: boolean;
}

/** The result returned by runPipeline. */
export interface PipelineRunResult {
  bundle: ContentBundle;
  bundlePath: string;
  pathLine: string;
}

// ---------------------------------------------------------------------------
// runPipeline — the one-conductor chain
// ---------------------------------------------------------------------------

/**
 * Chain the stages: resolve spec → copy → image → voice → video → publish.
 *
 * 1. Resolve the input spec and validate it; throw if errors.
 * 2. Run each stage in order, feeding output into the next.
 * 3. Publish in dry-run mode by default (opts.live ?? false).
 * 4. Assemble a ContentBundle and persist it to <outDir>/bundle.json.
 * 5. Return the bundle, its path, and a greppable proof line.
 */
export async function runPipeline(
  input: PipelineInput,
  deps: PipelineDeps,
  opts: PipelineOptions,
): Promise<PipelineRunResult> {
  // (a) Resolve the spec and validate it.
  const spec = input.resolveSpec();
  const errors = validateContentSpec(spec);
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }

  // (b) Run the stages strictly in order, awaiting each and feeding output in.
  const copy = await deps.writeCopy(spec);
  const imagePath = await deps.renderImage({ spec, copy });

  // The voice stage may return a bare path (legacy) or a richer object carrying
  // the REAL per-character end-times (#742). Normalise, then THREAD the alignment
  // into the video stage so the live path syncs captions to the actual voice —
  // not just inside the e2e smoke. When alignment is absent, the video stage's
  // even-split fallback stays intact.
  const voiceOut = await deps.synthVoice({ script: copy.script });
  const audioPath = typeof voiceOut === "string" ? voiceOut : voiceOut.audioPath;
  const charEndTimesSec =
    typeof voiceOut === "string" ? undefined : voiceOut.charEndTimesSec;

  const videoPath = await deps.renderVideo({
    script: copy.script,
    audioPath,
    imagePath,
    charEndTimesSec,
  });

  // (c) Publish in dry-run by default.
  const targets = opts.targets ?? ["x"];
  const request = buildPublishRequest(copy.thread, targets);
  const publishPreview = await publish(request, deps.publishClient, {
    live: opts.live ?? false,
  });
  assertDryRunSafe(publishPreview);

  // (d) Assemble the bundle.
  const bundle: ContentBundle = {
    repo: input.repo,
    thread: copy.thread,
    script: copy.script,
    imagePath,
    audioPath,
    videoPath,
    publishPreview,
  };

  // (e) Save the bundle to disk.
  const bundlePath = path.join(opts.outDir, "bundle.json");
  fs.mkdirSync(opts.outDir, { recursive: true });
  fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));

  // (f) Build the greppable proof line.
  const pathLine = [
    `PIPELINE-PATH: repo="${input.repo}"`,
    "stages=copy,image,voice,video,publish",
    `thread=${copy.thread.length}`,
    `mode=${publishPreview.mode}`,
    "saved=true",
  ].join(" ");

  // (g) Return the result.
  return { bundle, bundlePath, pathLine };
}
