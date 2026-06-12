/**
 * #824 — VHS `.tape` GENERATOR (pure, CI-testable).
 *
 * Takes a narration spine + the typed-command list (one command-block per beat) and emits a
 * VHS `.tape` script string. The generator is the briefable, network-free half of the capture
 * harness: it never shells out, never touches the filesystem, never runs `vhs` — it only renders
 * a deterministic `.tape` string that the LOCAL-only runner (`tools/captureDemo.ts`) later feeds to
 * the `vhs` binary.
 *
 * Two hard-won VHS gotchas baked in (see the plan's "## Background"):
 *   1. The capture LOGIC lives here so CI can test it with FIXTURE frames (VHS needs loopback/network
 *      and can never run in a sandboxed CI step).
 *   2. **The final `Screenshot` is DROPPED unless followed by a trailing `Sleep`.** Every tape this
 *      generator emits ends with a `Sleep` AFTER the last `Screenshot`, so the last beat's frame writes.
 *
 * Parity invariant: exactly ONE `Screenshot step-NN.png` line per narration segment. N is DERIVED
 * from `narrationSegments.length` — never hardcoded — so the tape and the shipped
 * `validateFrameManifest(frames, narration)` agree by construction.
 *
 * Brand/privacy: the header uses a NEUTRAL cwd (`~/demo/...`, never `/Users/ansonlam`) and a minimal
 * `PS1`. Brand-scrub of the typed commands + step labels is the runner's pre-flight (`assertBrandClean`).
 */

/** One narration segment — only `.text`/`.length` is read (mirrors `NarrationSegment`). */
export interface TapeNarrationSegment {
  /** The spoken line this beat narrates. */
  text: string;
}

/** One beat's typed terminal interaction: the command(s) to type + the screenshot's step label. */
export interface TapeBeat {
  /**
   * The shell command(s) typed for this beat, in order. Each becomes a `Type "<cmd>"` + `Enter`.
   * These are the strings the runner's `PAID_COMMANDS` gate inspects — keep them free/inert.
   */
  commands: ReadonlyArray<string>;
  /** Short human label for the captured frame (drawn as the annotation pill downstream). */
  stepLabel: string;
  /**
   * Optional PER-BEAT settle pause (seconds) AFTER this beat's commands, BEFORE its Screenshot —
   * overrides the global `settleSleepSec` for THIS beat only. Heavy LIVE-render beats (e.g. a beat
   * that runs `npm run smoke:demo-frames`, ~18s) MUST set this ≥ the command's real runtime + margin,
   * or the screenshot fires mid-render AND the still-running command blocks the shell so every
   * following beat freezes on the same half-rendered screen (the #824 live-capture autopsy). Defaults
   * to the global `settleSleepSec` when omitted.
   */
  settleSleepSec?: number;
}

/** Generator options — neutral header knobs (all have safe defaults). */
export interface CaptureTapeOptions {
  /** Output dir VHS writes frames into (relative — lands `step-NN.png` here). Default `frames/`. */
  outputDir?: string;
  /** Minimal, neutral shell prompt. Default `"$ "`. NEVER embed a real username/host. */
  ps1?: string;
  /** Neutral working directory shown in the recording. Default `~/demo/pipeline`. Never `/Users/...`. */
  cwd?: string;
  /** Monospace font for the recorded terminal. Default `"JetBrains Mono"`. */
  fontFamily?: string;
  /** Font size. Default `22`. */
  fontSize?: number;
  /** VHS theme. Default `"Catppuccin Mocha"`. */
  theme?: string;
  /**
   * Recorded frame WIDTH in PIXELS (VHS `Set Width` is pixels, NOT terminal cells). Default `1280`
   * (clean 16:9 — `UI_FRAME_FIT="contain"` shrink-fits it into 9:16 downstream). VHS hard-minimum 120.
   */
  width?: number;
  /**
   * Recorded frame HEIGHT in PIXELS (VHS `Set Height` is pixels, NOT terminal rows). Default `720`.
   * VHS hard-minimum 120.
   */
  height?: number;
  /** Settle pause (seconds) AFTER each command before its Screenshot. Default `2`. */
  settleSleepSec?: number;
  /** The mandatory trailing pause (seconds) after the FINAL Screenshot. Default `2`. Must be > 0. */
  trailingSleepSec?: number;
}

const DEFAULTS: Required<CaptureTapeOptions> = {
  outputDir: "frames/",
  ps1: "$ ",
  cwd: "~/demo/pipeline",
  fontFamily: "JetBrains Mono",
  fontSize: 22,
  theme: "Catppuccin Mocha",
  width: 1280,
  height: 720,
  settleSleepSec: 2,
  trailingSleepSec: 2,
};

/** Zero-pad a 1-based step index to 2 digits (`step-01.png` … `step-NN.png`). */
function stepName(oneBasedIndex: number): string {
  return `step-${String(oneBasedIndex).padStart(2, "0")}.png`;
}

/** Escape a string for a VHS `Type "..."` literal (double-quote + backslash). */
function escapeTypeArg(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Render a VHS `.tape` string from a narration spine + per-beat typed commands.
 *
 * PURE: no IO, no `vhs`, no network. Throws if `beats.length !== narrationSegments.length` (the
 * generator refuses to emit a tape whose Screenshot count would not match the narration — the same
 * parity the shipped `validateFrameManifest` enforces downstream).
 *
 * Emits, in order:
 *   - a neutral header (`Output <outDir>/capture.gif`, `Set Shell`, minimal `PS1`, font/theme, neutral cwd);
 *   - per beat i (1-based): `Type "<cmd>"` + `Enter` for each command, a settle `Sleep`, then
 *     exactly one `Screenshot <outDir>/step-ii.png` (path prefixed so the runner finds the frames);
 *   - a MANDATORY trailing `Sleep` after the final `Screenshot` (the dropped-last-frame gotcha).
 */
export function generateCaptureTape(
  narrationSegments: ReadonlyArray<TapeNarrationSegment>,
  beats: ReadonlyArray<TapeBeat>,
  opts: CaptureTapeOptions = {},
): string {
  const o: Required<CaptureTapeOptions> = { ...DEFAULTS, ...opts };

  if (narrationSegments.length === 0) {
    throw new Error("#824 captureTape: narration is empty — a tape needs at least one beat.");
  }
  if (beats.length !== narrationSegments.length) {
    throw new Error(
      `#824 captureTape: beat↔narration parity violated: ${beats.length} beat(s) but ` +
        `${narrationSegments.length} narration segment(s). The Screenshot count is DERIVED from the ` +
        `narration length, so each narrated step needs exactly one typed beat.`,
    );
  }
  if (!(o.trailingSleepSec > 0)) {
    throw new Error(
      "#824 captureTape: trailingSleepSec must be > 0 — the final Screenshot is DROPPED without a " +
        "trailing Sleep after it (verified VHS gotcha).",
    );
  }
  // VHS `Set Width`/`Set Height` are PIXELS with a hard minimum of 120 — a too-small value makes VHS
  // abort with "Dimensions must be at least 120 x 120" (caught by a live-VHS run, not tape parsing).
  if (o.width < 120 || o.height < 120) {
    throw new Error(
      `#824 captureTape: width/height are PIXELS with a VHS minimum of 120 (got ${o.width}x${o.height}). ` +
        `Defaults are 1280x720 (16:9); do not pass terminal cell counts here.`,
    );
  }

  const lines: string[] = [];

  // The frames dir VHS writes Screenshots into, relative to the vhs process cwd. Normalized to NO
  // trailing slash so `${outDir}/step-NN.png` is well-formed. The runner reads `<workDir>/<outDir>/step-NN.png`
  // (vhs runs with cwd=workDir), so the Screenshot path MUST be prefixed with outDir — a bare
  // `Screenshot step-NN.png` writes to the cwd root and the runner finds nothing (verified by a live VHS run).
  const outDir = o.outputDir.replace(/\/+$/, "");

  // ── Neutral header ──────────────────────────────────────────────────────────
  lines.push(`# #824 VHS capture tape — generated by tools/captureTape.ts (do not hand-edit).`);
  lines.push(`# LOCAL-ONLY: VHS boots a localhost ttyd; this tape is NOT run in CI.`);
  // VHS requires an Output recording target; a throwaway gif inside outDir (the runner reads the named
  // step-NN.png by exact name, so the extra gif is harmless). Do NOT use a bare `Output <dir>/`.
  lines.push(`Output ${outDir}/capture.gif`);
  lines.push(``);
  lines.push(`Set Shell "bash"`);
  lines.push(`Set FontFamily "${o.fontFamily}"`);
  lines.push(`Set FontSize ${o.fontSize}`);
  lines.push(`Set Theme "${o.theme}"`);
  lines.push(`Set Width ${o.width}`);
  lines.push(`Set Height ${o.height}`);
  lines.push(``);
  // Neutral prompt + neutral cwd — never a real username/host or /Users/... path.
  lines.push(`Type "export PS1='${o.ps1}'"`);
  lines.push(`Enter`);
  lines.push(`Type "cd ${o.cwd} && clear"`);
  lines.push(`Enter`);
  lines.push(`Sleep ${o.settleSleepSec}s`);
  lines.push(``);

  // ── One beat per narration segment — exactly one Screenshot each ─────────────
  beats.forEach((beat, i) => {
    const oneBased = i + 1;
    lines.push(`# beat ${oneBased}/${beats.length} — ${beat.stepLabel}`);
    for (const cmd of beat.commands) {
      lines.push(`Type "${escapeTypeArg(cmd)}"`);
      lines.push(`Enter`);
    }
    // A heavy live-render beat overrides the global settle so its Screenshot waits for the render to
    // FINISH (else it snaps mid-render AND the still-running command blocks every following beat — #824).
    const settle = beat.settleSleepSec ?? o.settleSleepSec;
    lines.push(`Sleep ${settle}s`);
    lines.push(`Screenshot ${outDir}/${stepName(oneBased)}`);
    lines.push(``);
  });

  // ── MANDATORY trailing Sleep AFTER the final Screenshot (dropped-frame gotcha) ─
  lines.push(`# trailing Sleep — REQUIRED, or the final Screenshot is dropped.`);
  lines.push(`Sleep ${o.trailingSleepSec}s`);

  return lines.join("\n") + "\n";
}
