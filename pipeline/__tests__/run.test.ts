/**
 * Phase A — the pipeline CONDUCTOR (`pipeline/run.ts`).
 *
 * `runPipeline(input, deps, opts)` is the one "make me the launch content" button.
 * It chains the already-built stages in order:
 *
 *     input → ContentSpec → copy → image → voice → video → publish(dry-run)
 *
 * Every renderer is INJECTED as a dependency (a fake in this test, a real adapter
 * in production) so the conductor itself does zero real I/O and the jest oracle can
 * run it. The conductor's job is the WIRING: feed each stage's output into the next,
 * assemble a ContentBundle, save it to a review folder, and keep publish in dry-run
 * by default.
 *
 * This test is the contract. Do NOT modify it to make an implementation pass.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  runPipeline,
  type CopyResult,
  type PipelineInput,
  type PipelineDeps,
} from "../run";
import { type ContentSpec } from "../../inputs/contentspec";
import { buildCaptions } from "../../video/captions";

// ── Fixtures ───────────────────────────────────────────────────────────────

function validSpec(): ContentSpec {
  return {
    product: {
      name: "lfah",
      summary: "A test-driven app builder",
      repoUrl: "https://example.test/lfah",
    },
    facts: [
      { label: "pass rate", value: "83.8%", source: "runs/PHASE-B-VERDICT.md" },
      { label: "bugs", value: "74", scopeGuard: "n=74", source: "runs/PHASE-B-VERDICT.md" },
    ],
    highlights: ["test-first", "real oracle"],
    ctas: ["star the repo"],
    sourceFiles: ["runs/PHASE-B-VERDICT.md"],
  };
}

function sampleCopy(): CopyResult {
  return {
    thread: ["lfah ships test-first.", "83.8% on the real oracle (n=74)."],
    script: "lfah is a test-driven app builder. It passed 83.8 percent.",
    labels: ["83.8% pass", "n=74"],
  };
}

/** A recording harness: fakes that log call order and capture their inputs. */
function makeDeps(opts?: { copy?: CopyResult; postId?: string }) {
  const calls: string[] = [];
  const seen: {
    copySpec?: ContentSpec;
    imageArgs?: { spec: ContentSpec; copy: CopyResult };
    voiceArgs?: { script: string };
    videoArgs?: {
      script: string;
      audioPath: string;
      imagePath: string;
      charEndTimesSec?: number[];
    };
  } = {};
  const copy = opts?.copy ?? sampleCopy();

  const deps: PipelineDeps = {
    writeCopy: jest.fn(async (spec: ContentSpec) => {
      calls.push("copy");
      seen.copySpec = spec;
      return copy;
    }),
    renderImage: jest.fn(async (args: { spec: ContentSpec; copy: CopyResult }) => {
      calls.push("image");
      seen.imageArgs = args;
      return "/review/card.png";
    }),
    synthVoice: jest.fn(async (args: { script: string }) => {
      calls.push("voice");
      seen.voiceArgs = args;
      return "/review/voice.mp3";
    }),
    renderVideo: jest.fn(
      async (args: {
        script: string;
        audioPath: string;
        imagePath: string;
        charEndTimesSec?: number[];
      }) => {
        calls.push("video");
        seen.videoArgs = args;
        return "/review/video.mp4";
      },
    ),
    publishClient: jest.fn(async (_payload) => {
      calls.push("publishClient");
      return { id: opts?.postId ?? "posted-123" };
    }),
  };

  return { deps, calls, seen, copy };
}

function makeInput(spec: ContentSpec): { input: PipelineInput; resolveSpy: jest.Mock } {
  const resolveSpy = jest.fn(() => spec);
  return { input: { repo: "lfah", resolveSpec: resolveSpy }, resolveSpy };
}

function tmpOutDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lcp-run-"));
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("runPipeline — repo-selectable input resolves to a ContentSpec", () => {
  it("resolves the spec from the input and feeds it to the copy stage", async () => {
    const spec = validSpec();
    const { input, resolveSpy } = makeInput(spec);
    const { deps, seen } = makeDeps();
    const outDir = tmpOutDir();

    await runPipeline(input, deps, { outDir });

    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(seen.copySpec).toBe(spec);
  });

  it("throws when the resolved spec is invalid (a fact with no number)", async () => {
    const bad = validSpec();
    bad.facts.push({ label: "vibe", value: "many", source: "x" });
    const { input } = makeInput(bad);
    const { deps } = makeDeps();
    const outDir = tmpOutDir();

    await expect(runPipeline(input, deps, { outDir })).rejects.toThrow();
  });
});

describe("runPipeline — each stage's output feeds the next", () => {
  it("runs the stages in order: copy → image → voice → video → publish", async () => {
    const spec = validSpec();
    const { input } = makeInput(spec);
    const { deps, calls } = makeDeps();
    const outDir = tmpOutDir();

    await runPipeline(input, deps, { outDir });

    const stageOrder = calls.filter((c) => c !== "publishClient");
    expect(stageOrder).toEqual(["copy", "image", "voice"].concat(["video"]));
  });

  it("renderImage receives both the resolved spec and the copy result", async () => {
    const spec = validSpec();
    const { input } = makeInput(spec);
    const { deps, seen, copy } = makeDeps();
    const outDir = tmpOutDir();

    await runPipeline(input, deps, { outDir });

    expect(seen.imageArgs?.spec).toBe(spec);
    expect(seen.imageArgs?.copy).toBe(copy);
  });

  it("synthVoice is fed the copy's video script (not the thread)", async () => {
    const spec = validSpec();
    const { input } = makeInput(spec);
    const { deps, seen, copy } = makeDeps();
    const outDir = tmpOutDir();

    await runPipeline(input, deps, { outDir });

    expect(seen.voiceArgs?.script).toBe(copy.script);
  });

  it("renderVideo is fed BOTH the audio path and the image path from the prior stages", async () => {
    const spec = validSpec();
    const { input } = makeInput(spec);
    const { deps, seen, copy } = makeDeps();
    const outDir = tmpOutDir();

    await runPipeline(input, deps, { outDir });

    expect(seen.videoArgs?.audioPath).toBe("/review/voice.mp3");
    expect(seen.videoArgs?.imagePath).toBe("/review/card.png");
    expect(seen.videoArgs?.script).toBe(copy.script);
  });
});

describe("runPipeline — assembles and saves a ContentBundle", () => {
  it("returns a bundle whose fields come from the right stage outputs", async () => {
    const spec = validSpec();
    const { input } = makeInput(spec);
    const { deps, copy } = makeDeps();
    const outDir = tmpOutDir();

    const { bundle } = await runPipeline(input, deps, { outDir });

    expect(bundle.repo).toBe("lfah");
    expect(bundle.thread).toEqual(copy.thread);
    expect(bundle.script).toBe(copy.script);
    expect(bundle.imagePath).toBe("/review/card.png");
    expect(bundle.audioPath).toBe("/review/voice.mp3");
    expect(bundle.videoPath).toBe("/review/video.mp4");
    expect(bundle.publishPreview).toBeDefined();
  });

  it("saves the bundle to <outDir>/bundle.json and it round-trips", async () => {
    const spec = validSpec();
    const { input } = makeInput(spec);
    const { deps } = makeDeps();
    const outDir = tmpOutDir();

    const { bundle, bundlePath } = await runPipeline(input, deps, { outDir });

    expect(bundlePath).toBe(path.join(outDir, "bundle.json"));
    expect(fs.existsSync(bundlePath)).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(bundlePath, "utf-8"));
    expect(onDisk).toEqual(bundle);
  });
});

describe("runPipeline — publish stays dry-run by default", () => {
  it("defaults to dry-run mode and never calls the publish client (zero network)", async () => {
    const spec = validSpec();
    const { input } = makeInput(spec);
    const { deps, calls } = makeDeps();
    const outDir = tmpOutDir();

    const { bundle } = await runPipeline(input, deps, { outDir });

    expect(bundle.publishPreview.mode).toBe("dry-run");
    expect(calls).not.toContain("publishClient");
    expect(deps.publishClient as jest.Mock).not.toHaveBeenCalled();
  });

  it("builds the publish preview from the copy thread, X-first, default target ['x']", async () => {
    const spec = validSpec();
    const { input } = makeInput(spec);
    const { deps, copy } = makeDeps();
    const outDir = tmpOutDir();

    const { bundle } = await runPipeline(input, deps, { outDir });

    const payloads = bundle.publishPreview.payloads;
    expect(payloads.map((p) => p.target)).toEqual(["x"]);
    // the thread is carried verbatim into the body
    for (const post of copy.thread) {
      expect(payloads[0].content).toContain(post);
    }
  });

  it("a dry-run preview carries no posted id (assertDryRunSafe holds)", async () => {
    const spec = validSpec();
    const { input } = makeInput(spec);
    const { deps } = makeDeps();
    const outDir = tmpOutDir();

    const { bundle } = await runPipeline(input, deps, { outDir });

    const anyId = bundle.publishPreview.outcomes.some((o) => o.id !== undefined);
    expect(anyId).toBe(false);
  });

  it("flips to live ONLY when opts.live is true, and then calls the client per target", async () => {
    const spec = validSpec();
    const { input } = makeInput(spec);
    const { deps, calls } = makeDeps({ postId: "real-id-9" });
    const outDir = tmpOutDir();

    const { bundle } = await runPipeline(input, deps, { outDir, live: true });

    expect(bundle.publishPreview.mode).toBe("live");
    expect(calls).toContain("publishClient");
    expect((deps.publishClient as jest.Mock).mock.calls.length).toBe(1); // one target (x)
    expect(bundle.publishPreview.outcomes[0].id).toBe("real-id-9");
  });
});

describe("runPipeline — greppable proof line", () => {
  it("emits a PIPELINE-PATH line naming the repo, the five stages, and the saved flag", async () => {
    const spec = validSpec();
    const { input } = makeInput(spec);
    const { deps } = makeDeps();
    const outDir = tmpOutDir();

    const { pathLine } = await runPipeline(input, deps, { outDir });

    expect(pathLine).toMatch(/^PIPELINE-PATH:/);
    expect(pathLine).toContain('repo="lfah"');
    expect(pathLine).toContain("copy,image,voice,video,publish");
    expect(pathLine).toContain("mode=dry-run");
    expect(pathLine).toContain("saved=true");
  });
});

// ── #762 — the LIVE path threads REAL caption sync voice → video ─────────────
//
// The gap this pins: the voice stage produces real per-character end-times
// (charEndTimesSec), but if the conductor drops them at the synthVoice→renderVideo
// boundary, production videos silently fall back to even-split captions even
// though the sync code exists. These tests would FAIL if runPipeline stopped
// threading the alignment.
describe("runPipeline — real caption sync reaches the video stage (#762)", () => {
  // Script of 4 single-char words; raw indices 0:'a' 2:'b' 4:'c' 6:'d' (len 7).
  // Non-uniform alignment with a deliberate long pause after 'b'.
  const SYNC_SCRIPT = "a b c d";
  const CHAR_END = [1.0, 1.2, 2.0, 5.0, 6.0, 6.1, 9.0];
  const DURATION = CHAR_END[CHAR_END.length - 1]; // 9.0

  function syncCopy(): CopyResult {
    return { thread: ["t1", "t2"], script: SYNC_SCRIPT, labels: ["a"] };
  }

  it("threads charEndTimesSec from a richer voice result into renderVideo", async () => {
    const spec = validSpec();
    const { input } = makeInput(spec);
    const { deps, seen } = makeDeps({ copy: syncCopy() });

    // Voice stage returns the RICHER object carrying real alignment.
    (deps.synthVoice as jest.Mock).mockImplementation(async () => ({
      audioPath: "/review/voice.mp3",
      charEndTimesSec: CHAR_END,
    }));

    await runPipeline(input, deps, { outDir: tmpOutDir() });

    // The conductor must hand the alignment to the video stage verbatim.
    expect(seen.videoArgs?.audioPath).toBe("/review/voice.mp3");
    expect(seen.videoArgs?.charEndTimesSec).toEqual(CHAR_END);
  });

  it("the threaded alignment yields REAL-synced captions, NOT even-split", async () => {
    const spec = validSpec();
    const { input } = makeInput(spec);
    const { deps, seen } = makeDeps({ copy: syncCopy() });

    (deps.synthVoice as jest.Mock).mockImplementation(async () => ({
      audioPath: "/review/voice.mp3",
      charEndTimesSec: CHAR_END,
    }));

    await runPipeline(input, deps, { outDir: tmpOutDir() });

    // Build captions exactly as the video adapter would, from what the conductor
    // threaded. With the alignment present they must follow REAL voice timing.
    const synced = buildCaptions(
      seen.videoArgs!.script,
      { durationSec: DURATION, charEndTimesSec: seen.videoArgs!.charEndTimesSec },
      { maxWords: 1 },
    );
    const even = buildCaptions(
      seen.videoArgs!.script,
      { durationSec: DURATION }, // no alignment → even-split
      { maxWords: 1 },
    );

    const syncedEnds = synced.map((c) => c.endSec);
    const evenEnds = even.map((c) => c.endSec);

    // Real timing (e.g. 1.2/5.0/6.1/9.0) must DIFFER from even-split (2.25/4.5/6.75/9.0).
    expect(syncedEnds).not.toEqual(evenEnds);
    // And land on the known real boundaries — proving real sync ran end-to-end.
    expect(syncedEnds).toEqual([1.2, 5.0, 6.1, 9.0]);
  });

  it("a bare-string voice result still works and leaves alignment undefined (fallback intact)", async () => {
    const spec = validSpec();
    const { input } = makeInput(spec);
    const { deps, seen } = makeDeps({ copy: syncCopy() });

    // Legacy voice stage returns just the path (no alignment).
    (deps.synthVoice as jest.Mock).mockImplementation(async () => "/review/voice.mp3");

    await runPipeline(input, deps, { outDir: tmpOutDir() });

    expect(seen.videoArgs?.audioPath).toBe("/review/voice.mp3");
    expect(seen.videoArgs?.charEndTimesSec).toBeUndefined();
  });
});
