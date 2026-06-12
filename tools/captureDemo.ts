/**
 * #824 — VHS capture RUNNER (LOCAL-ONLY, network-needing — NOT a CI smoke).
 *
 * ┌─ WHY THIS IS NOT CI ────────────────────────────────────────────────────────┐
 * │ VHS boots a local `ttyd` + a headless browser over localhost. It runs on a   │
 * │ laptop (or a CI runner WITH network) but CANNOT run in a network-sandboxed    │
 * │ step. So the REAL capture is this local authoring command (`npm run          │
 * │ capture:demo`), never a CI smoke. CI validates the harness LOGIC against      │
 * │ FIXTURE frames (see tools/__tests__/captureTape.test.ts) and NEVER runs vhs.  │
 * └──────────────────────────────────────────────────────────────────────────────┘
 *
 * Flow (the `vhs` shell-out is gated behind an env flag and is NOT exercised in Phase 1):
 *   1. Build the tape from the FREE beat table (`DEFAULT_NARRATION` + `DEFAULT_BEATS`).
 *   2. assertCaptureCommandsFree(beats)  — REFUSE if any typed command matches a known-paid script.
 *   3. assertBrandClean over every typed line + every step label (reused from inputs/frames.ts).
 *   4. generateCaptureTape(...)          — the pure `.tape` string.
 *   5. (LOCAL ONLY) shell out to `vhs`, land `step-01..NN.png`, build FrameEntry[],
 *      run validateFrameManifest(frames, narration) + assertBrandClean post-flight.
 *
 * Step 5 is the operator's manual take. This module exports the pure pieces (gate + beat table +
 * tape builder + manifest builder) so jest can prove them with NO vhs and NO network.
 *
 * Install VHS as a DEV/TOOLING dependency: `brew install vhs` (a Go binary — NOT an npm dep, does
 * not touch package.json/package-lock.json). See README.
 */

import * as fs from "fs";
import * as path from "path";

import {
  generateCaptureTape,
  type TapeBeat,
  type TapeNarrationSegment,
  type CaptureTapeOptions,
} from "./captureTape";
import {
  validateFrameManifest,
  assertBrandClean,
  type FrameEntry,
  type FrameManifest,
} from "../inputs/frames";

// ── Paid-command denylist (the GATE that makes "free run" mechanical, not a hope) ─

/**
 * Known scripts that bill an external provider — NONE may ever appear in a captured tape:
 *   - smoke:copy            → Claude Max (copy-smoke.ts)
 *   - smoke:genart          → nano-banana (genart-smoke.ts)
 *   - smoke:voice           → ElevenLabs (voice-smoke.ts)
 *   - caption-sync-real     → ElevenLabs (caption-sync-real.ts)
 * PLUS any `:paid` / `:live` variant of ANY script (matched as a suffix on the command string).
 */
export const PAID_COMMANDS: ReadonlyArray<string> = [
  "smoke:copy",
  "smoke:genart",
  "smoke:voice",
  "caption-sync-real",
];

/** A typed command is paid if it names a denylisted script OR carries a `:paid` / `:live` variant. */
function isPaidCommand(cmd: string): boolean {
  const lower = cmd.toLowerCase();
  if (PAID_COMMANDS.some((p) => lower.includes(p))) return true;
  // any `:paid` / `:live` script variant (e.g. `npm run smoke:launch-card:paid`)
  if (/[\w:-]+:(paid|live)\b/.test(lower)) return true;
  return false;
}

/**
 * #824 paid-command refusal gate — THROW if ANY typed command in ANY beat matches a paid script.
 * "The captured run is free" becomes a mechanical GATE (Rule 18), not an assertion in prose.
 * CI-testable with no vhs / no network.
 */
export function assertCaptureCommandsFree(beats: ReadonlyArray<TapeBeat>): void {
  for (const beat of beats) {
    for (const cmd of beat.commands) {
      if (isPaidCommand(cmd)) {
        throw new Error(
          `#824 capture refusal: typed command "${cmd}" matches a PAID script (denylist: ` +
            `${PAID_COMMANDS.join(", ")}, plus any :paid/:live variant). The captured demo run MUST be ` +
            `free/deterministic — re-point this beat at a free smoke or a committed fixture cat.`,
        );
      }
    }
  }
}

/** Brand-scrub every typed command + every step label before a real take (reuses assertBrandClean). */
export function assertCaptureBrandClean(beats: ReadonlyArray<TapeBeat>): void {
  for (const beat of beats) {
    assertBrandClean(beat.stepLabel);
    for (const cmd of beat.commands) assertBrandClean(cmd);
  }
}

// ── The chosen FREE / deterministic 7-beat surface (content-pipeline demos itself) ─
//
// EVERY captured command is a VERIFIED-FREE smoke (smoke:image = free Playwright; smoke:demo-frames =
// free silent) or inert shell (ls/cat/tree). Beats 2 (copy) + 4 (voice/sync) `cat` COMMITTED FIXTURES
// (fixtures/demo-capture/*.json) — NEVER smoke:copy / smoke:genart / smoke:voice / caption-sync-real.

// ── Per-beat settle floors for the LIVE-render beats ─────────────────────────────
//
// A live render BLOCKS the shell while it runs. If the screenshot fires before the render finishes,
// (a) the captured frame shows a half-rendered screen AND (b) the still-running command starves every
// following beat — its typed command is queued but never executes (the #824 live-capture autopsy: with
// the 2s default, beats 5/6/7 all froze on the same mid-render screen). So each heavy live beat carries
// a per-beat settle ≥ its OBSERVED runtime + margin. These constants ARE the regression contract — the
// settle-config test asserts the render beats keep a settle ≥ the runtime they encode.

/** `smoke:demo-frames` renders a 45–90s MP4 (Remotion + Playwright). Observed ~18s on the capture run. */
export const DEMO_FRAMES_RUNTIME_SEC = 18;
/** Settle for the VIDEO beat — observed runtime + generous margin so the MP4 listing lands cleanly. */
export const DEMO_FRAMES_SETTLE_SEC = 30;

/** `smoke:image` renders a card PNG via headless Chromium (cold browser launch). Observed ~8s. */
export const IMAGE_SMOKE_RUNTIME_SEC = 8;
/** Settle for the CARDS beat — observed runtime + margin so the PNG `ls` lands after render. */
export const IMAGE_SMOKE_SETTLE_SEC = 15;

export const DEFAULT_NARRATION: ReadonlyArray<TapeNarrationSegment> = [
  { text: "This is content-pipeline. One command turns a repo's numbers into a launch post." },
  { text: "First it writes the copy." },
  { text: "Then it lays out the cards." },
  { text: "It syncs captions to the real voice timing." },
  { text: "Then it renders the MP4." },
  { text: "One bundle: copy, cards, captions, video — every stage free and deterministic in this run." },
  { text: "content-pipeline. Open and MIT — link below." },
];

export const DEFAULT_BEATS: ReadonlyArray<TapeBeat> = [
  // 1 HOOK — inert
  { commands: ["ls", "cat package.json | head -5"], stepLabel: "content-pipeline" },
  // 2 COPY — cat a COMMITTED fixture (FREE; never smoke:copy)
  { commands: ["cat fixtures/demo-capture/copy.json"], stepLabel: "copy → copy.json" },
  // 3 CARDS — smoke:image is VERIFIED FREE (pure Playwright), then ls the PNGs. LIVE render → settle override.
  {
    commands: ["npm run smoke:image", "ls out/image/*.png"],
    stepLabel: "cards → out/image",
    settleSleepSec: IMAGE_SMOKE_SETTLE_SEC,
  },
  // 4 VOICE/SYNC — cat a COMMITTED alignment fixture (FREE; never smoke:voice/caption-sync-real)
  { commands: ["cat fixtures/demo-capture/alignment.json"], stepLabel: "captions ↔ voice timing" },
  // 5 VIDEO — smoke:demo-frames is VERIFIED FREE (silent), then list the MP4. HEAVY live render → big settle
  // override (else beats 5/6/7 freeze mid-render — #824). Stays GENUINELY LIVE (not a cat of a pre-baked file).
  // List with `ls -gh` (NOT `ls -la`): BSD `ls -g` SUPPRESSES the owner column (the OS login name — a privacy
  // leak on a PUBLIC demo frame), keeps the non-sensitive group + `-h` human-size. Payoff preserved ("a real
  // rendered MP4 with a real size"), username gone. Enforced by the owner-leak denylist test (#824 residual).
  {
    commands: ["npm run smoke:demo-frames", "ls -gh out/review/demo-frames/*.mp4"],
    stepLabel: "video → MP4",
    settleSleepSec: DEMO_FRAMES_SETTLE_SEC,
  },
  // 6 RECEIPT — inert
  { commands: ["tree out/review"], stepLabel: "one free deterministic bundle" },
  // 7 CTA — inert
  { commands: ["cat README.md | head -3"], stepLabel: "open + MIT — link below" },
];

// ── Manifest builder (emitted step-NN.png → FrameEntry[], validated) ─────────────

/**
 * Build the validated frame manifest from frames VHS would have emitted (`framesDir/step-01..NN.png`),
 * one per beat, then HARD-THROW via the shipped `validateFrameManifest(frames, narration)` on any
 * count mismatch or empty path. The harness only PRODUCES what `embedFrames` already consumes.
 */
export function buildAndValidateManifest(
  framesDir: string,
  beats: ReadonlyArray<TapeBeat>,
  narration: ReadonlyArray<TapeNarrationSegment>,
): FrameManifest {
  const frames: FrameEntry[] = beats.map((beat, i) => ({
    path: path.join(framesDir, `step-${String(i + 1).padStart(2, "0")}.png`),
    stepLabel: beat.stepLabel,
    narrationSegmentIndex: i,
  }));
  validateFrameManifest(frames, narration); // reused parity backstop — hard-throws on N≠M
  return frames;
}

/** Render the default FREE tape (gate + brand-scrub run first). Pure — no vhs, no network. */
export function buildDefaultTape(opts?: CaptureTapeOptions): string {
  assertCaptureCommandsFree(DEFAULT_BEATS);
  assertCaptureBrandClean(DEFAULT_BEATS);
  return generateCaptureTape(DEFAULT_NARRATION, DEFAULT_BEATS, opts);
}

// ── LOCAL-ONLY entrypoint (network-needing; NOT a CI smoke) ──────────────────────

/**
 * The local authoring run. Generates + validates the tape, then (only with VHS_CAPTURE_RUN=1, the
 * operator's manual take) shells out to `vhs`. Phase 1 ships WITHOUT exercising vhs — the env gate
 * keeps the shell-out off by default so `node`/CI can import this module safely.
 */
async function main(): Promise<void> {
  const tape = buildDefaultTape();
  console.log(`CAPTURE-TAPE: ${DEFAULT_BEATS.length} beats, ${DEFAULT_NARRATION.length} narration segments (free/gated).`);

  if (process.env.VHS_CAPTURE_RUN !== "1") {
    console.log(
      "capture:demo is LOCAL-ONLY (VHS needs loopback/network) — it is NOT a CI smoke.\n" +
        "Set VHS_CAPTURE_RUN=1 on a networked laptop with `vhs` installed (`brew install vhs`) to take the real capture.",
    );
    return;
  }

  // ── LOCAL real take (operator only) ────────────────────────────────────────
  const { execFileSync } = await import("child_process");
  const os = await import("os");
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "vhs-capture-"));
  const tapePath = path.join(workDir, "demo.tape");
  const framesDir = path.join(workDir, "frames");
  fs.mkdirSync(framesDir, { recursive: true });
  fs.writeFileSync(tapePath, tape, "utf8");

  console.log(`VHS: running on ${tapePath} (frames → ${framesDir})`);
  execFileSync("vhs", [tapePath], { cwd: workDir, stdio: "inherit" });

  const manifest = buildAndValidateManifest(framesDir, DEFAULT_BEATS, DEFAULT_NARRATION);
  for (const f of manifest) {
    assertBrandClean(f.stepLabel);
    if (!fs.existsSync(f.path)) throw new Error(`#824 capture: expected frame missing: ${f.path}`);
  }
  console.log(`CAPTURE-PATH: framesDir="${framesDir}" frames=${manifest.length} (validated, brand-clean).`);
}

// Only run when invoked directly (so jest can import the pure exports without side effects).
if (require.main === module) {
  main().catch((err) => {
    console.error("CAPTURE FAIL:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
