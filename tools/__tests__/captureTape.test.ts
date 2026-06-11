/**
 * #824 — CI-SAFE tests for the VHS capture harness LOGIC. NO vhs, NO network.
 *
 * Proves (Binary AC 2/3/5):
 *   (a) a 7-beat narration → exactly 7 `Screenshot` lines AND the last non-empty line after the
 *       final Screenshot is a `Sleep` (the dropped-last-frame gotcha);
 *   (b) N fixture PNGs + N-beat narration → manifest PASSES validateFrameManifest; an N-1 vs N
 *       mismatch HARD-FAILS (asserts throw) — reusing the SHIPPED parity backstop, not a new check;
 *   (c) the PAID_COMMANDS gate THROWS for smoke:copy / smoke:genart / smoke:voice / caption-sync-real
 *       (and :paid/:live variants) and PASSES for the all-free DEFAULT_BEATS list;
 *   (d) brand-scrub: a tape line/label containing `garena` makes assertBrandClean throw.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { generateCaptureTape, type TapeBeat, type TapeNarrationSegment } from "../captureTape";
import {
  assertCaptureCommandsFree,
  assertCaptureBrandClean,
  buildAndValidateManifest,
  DEFAULT_BEATS,
  DEFAULT_NARRATION,
  PAID_COMMANDS,
} from "../captureDemo";
import { validateFrameManifest, assertBrandClean, type FrameEntry } from "../../inputs/frames";

// A 7-beat narration + matching inert beats (the shape the default surface uses).
const N7_NARRATION: TapeNarrationSegment[] = Array.from({ length: 7 }, (_, i) => ({
  text: `beat ${i + 1} narration line.`,
}));
const N7_BEATS: TapeBeat[] = Array.from({ length: 7 }, (_, i) => ({
  commands: [`echo "beat ${i + 1}"`],
  stepLabel: `step ${i + 1}`,
}));

describe("generateCaptureTape — Screenshot parity + trailing Sleep", () => {
  it("(a) emits exactly one Screenshot per narration beat (7 → 7), prefixed with the frames dir", () => {
    const tape = generateCaptureTape(N7_NARRATION, N7_BEATS);
    // Screenshot path MUST be prefixed with the output dir (`frames/step-NN.png`) — a bare
    // `Screenshot step-NN.png` writes to the vhs cwd root and the runner (which reads
    // <workDir>/frames/step-NN.png) finds nothing. Regression guard for the live-VHS path-mismatch bug.
    const shots = tape.split("\n").filter((l) => /^Screenshot\s+frames\/step-\d{2}\.png\s*$/.test(l));
    expect(shots).toHaveLength(7);
    // frames/step-01 … frames/step-07, in order
    expect(shots).toEqual([
      "Screenshot frames/step-01.png",
      "Screenshot frames/step-02.png",
      "Screenshot frames/step-03.png",
      "Screenshot frames/step-04.png",
      "Screenshot frames/step-05.png",
      "Screenshot frames/step-06.png",
      "Screenshot frames/step-07.png",
    ]);
  });

  it("(a) recorded dimensions are PIXELS ≥ 120 (VHS hard-minimum) — regression guard", () => {
    const tape = generateCaptureTape(N7_NARRATION, N7_BEATS);
    const w = Number(tape.match(/^Set Width (\d+)/m)?.[1]);
    const h = Number(tape.match(/^Set Height (\d+)/m)?.[1]);
    expect(w).toBeGreaterThanOrEqual(120);
    expect(h).toBeGreaterThanOrEqual(120);
    // a too-small dimension (terminal-cell thinking) must hard-throw, not emit a sub-120 tape
    expect(() => generateCaptureTape(N7_NARRATION, N7_BEATS, { width: 120, height: 30 })).toThrow();
  });

  it("(a) Screenshot count is DERIVED from narration length, not hardcoded (4 → 4)", () => {
    const n4 = N7_NARRATION.slice(0, 4);
    const b4 = N7_BEATS.slice(0, 4);
    const shots = generateCaptureTape(n4, b4).split("\n").filter((l) => l.startsWith("Screenshot "));
    expect(shots).toHaveLength(4);
  });

  it("(a) the last non-empty line after the final Screenshot is a Sleep (dropped-frame gotcha)", () => {
    const lines = generateCaptureTape(N7_NARRATION, N7_BEATS)
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    const lastShotIdx = lines.map((l) => l.startsWith("Screenshot ")).lastIndexOf(true);
    const after = lines.slice(lastShotIdx + 1);
    expect(after.length).toBeGreaterThan(0);
    expect(after[after.length - 1]).toMatch(/^Sleep\s+\d+s$/);
  });

  it("emits a neutral header (Output frames/, no /Users/ path)", () => {
    const tape = generateCaptureTape(N7_NARRATION, N7_BEATS);
    expect(tape).toContain("Output frames/");
    expect(tape).not.toContain("/Users/");
  });

  it("throws on beat↔narration count mismatch", () => {
    expect(() => generateCaptureTape(N7_NARRATION, N7_BEATS.slice(0, 6))).toThrow(/parity violated/);
  });

  it("throws if trailingSleepSec is 0 (would drop the final frame)", () => {
    expect(() => generateCaptureTape(N7_NARRATION, N7_BEATS, { trailingSleepSec: 0 })).toThrow(/trailingSleepSec/);
  });
});

describe("manifest wiring — reuses the shipped validateFrameManifest", () => {
  let tmpDir: string;
  const N = 5;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "capture-manifest-test-"));
    // Minimal 1x1 PNG bytes — validateFrameManifest only checks path non-empty (byte-check is embedFrames').
    const png = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100" +
        "5cc2d5b40000000049454e44ae426082",
      "hex",
    );
    for (let i = 1; i <= N; i++) {
      fs.writeFileSync(path.join(tmpDir, `step-${String(i).padStart(2, "0")}.png`), png);
    }
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("(b) N fixture PNGs + N-beat narration → manifest PASSES validateFrameManifest", () => {
    const narration: TapeNarrationSegment[] = Array.from({ length: N }, (_, i) => ({ text: `line ${i}` }));
    const beats: TapeBeat[] = Array.from({ length: N }, (_, i) => ({
      commands: ["ls"],
      stepLabel: `step ${i + 1}`,
    }));
    const manifest = buildAndValidateManifest(tmpDir, beats, narration);
    expect(manifest).toHaveLength(N);
    // and the manifest is independently valid against the shipped check
    expect(() => validateFrameManifest(manifest, narration)).not.toThrow();
  });

  it("(b) N-1 frames vs N beats HARD-FAILS (validateFrameManifest throws)", () => {
    const narration: TapeNarrationSegment[] = Array.from({ length: N }, (_, i) => ({ text: `line ${i}` }));
    const frames: FrameEntry[] = Array.from({ length: N - 1 }, (_, i) => ({
      path: path.join(tmpDir, `step-${String(i + 1).padStart(2, "0")}.png`),
      stepLabel: `step ${i + 1}`,
      narrationSegmentIndex: i,
    }));
    expect(() => validateFrameManifest(frames, narration)).toThrow(/parity violated/);
  });
});

describe("PAID_COMMANDS gate — free-by-gate, not by hope", () => {
  it("(c) PASSES for the all-free DEFAULT_BEATS list", () => {
    expect(() => assertCaptureCommandsFree(DEFAULT_BEATS)).not.toThrow();
  });

  it.each(["smoke:copy", "smoke:genart", "smoke:voice", "caption-sync-real"])(
    "(c) THROWS when a beat contains the paid script %s",
    (paid) => {
      const beats: TapeBeat[] = [{ commands: [`npm run ${paid}`], stepLabel: "x" }];
      expect(() => assertCaptureCommandsFree(beats)).toThrow(/PAID script/);
    },
  );

  it("(c) THROWS on a :paid / :live variant of any script", () => {
    expect(() =>
      assertCaptureCommandsFree([{ commands: ["npm run smoke:launch-card:paid"], stepLabel: "x" }]),
    ).toThrow(/PAID script/);
    expect(() =>
      assertCaptureCommandsFree([{ commands: ["npm run smoke:publish-typefully:live"], stepLabel: "x" }]),
    ).toThrow(/PAID script/);
  });

  it("(c) the default 7-beat narration/beat surface itself is free", () => {
    expect(DEFAULT_NARRATION).toHaveLength(7);
    expect(DEFAULT_BEATS).toHaveLength(7);
    expect(() => assertCaptureCommandsFree(DEFAULT_BEATS)).not.toThrow();
    // no paid token anywhere in the default beat commands
    const allCmds = DEFAULT_BEATS.flatMap((b) => b.commands).join(" ");
    for (const paid of PAID_COMMANDS) expect(allCmds).not.toContain(paid);
  });
});

describe("brand-scrub — reuses the shipped assertBrandClean", () => {
  it("(d) a tape line/label containing `garena` makes assertBrandClean throw", () => {
    expect(() => assertBrandClean("npm run smoke:image  # garena internal")).toThrow(/brand-scrub/);
    const dirtyBeats: TapeBeat[] = [{ commands: ["ls"], stepLabel: "garena cards" }];
    expect(() => assertCaptureBrandClean(dirtyBeats)).toThrow(/brand-scrub/);
  });

  it("(d) the all-free default beats are brand-clean", () => {
    expect(() => assertCaptureBrandClean(DEFAULT_BEATS)).not.toThrow();
  });
});
