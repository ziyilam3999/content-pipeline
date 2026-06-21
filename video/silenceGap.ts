/**
 * #1063 — DEAD-AIR (silence-gap) gate.
 *
 * A still-frame / contact-sheet eyeball and the aspect / fidelity / caption-sync / audibility gates are all
 * BLIND to long INTERNAL silence gaps — the narrator pausing too long mid-cut. Only listening to / MEASURING
 * the played audio catches them. (#1063: the shipped kanban hero had a 5.76s silence at 0:36 + 3.7s + 4.1s
 * gaps — ~13.6s dead air in 90s — and passed every gate + my 6-beat-sheet eyeball.)
 *
 * This gate runs ffmpeg `silencedetect` over a rendered VO/clip and FAILS when any INTERNAL gap exceeds
 * maxGapSec. The recurrence-condition (worst internal gap > threshold) and the fix-landed signal (≤ threshold)
 * are both objective numbers — Rule-17 mechanical, both-ends-boolean.
 *
 * Split: `parseSilenceGaps` + `worstInternalGap` + the threshold check are PURE (unit-tested in CI, which has
 * no ffmpeg — see audioDuration.ts #774); only `detectSilenceGaps` shells out to ffmpeg (local render-time).
 * Source lesson: feedback_watch_and_listen_played_cut_stills_blind_to_deadair_and_edgecrop.
 */
import { spawnSync } from "child_process";
import * as fs from "fs";

export interface SilenceGap {
  startSec: number;
  endSec: number;
  durationSec: number;
}

/** Parse ffmpeg `silencedetect` stderr text into gaps. PURE — no I/O. */
export function parseSilenceGaps(silencedetectText: string): SilenceGap[] {
  const gaps: SilenceGap[] = [];
  let pendingStart: number | null = null;
  for (const line of silencedetectText.split(/\r?\n/)) {
    const startM = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (startM) {
      pendingStart = parseFloat(startM[1]);
      continue;
    }
    const endM = line.match(/silence_end:\s*(-?[\d.]+)(?:\s*\|\s*silence_duration:\s*([\d.]+))?/);
    if (endM) {
      const endSec = parseFloat(endM[1]);
      const dur = endM[2] !== undefined ? parseFloat(endM[2]) : null;
      const startSec = pendingStart ?? (dur !== null ? endSec - dur : endSec);
      const durationSec = dur !== null ? dur : Math.max(0, endSec - startSec);
      gaps.push({ startSec, endSec, durationSec });
      pendingStart = null;
    }
  }
  return gaps;
}

/**
 * The longest INTERNAL gap. A gap that starts within `ignoreLeadSec` of t=0 is an intro hold (fine); a gap
 * whose end is within `ignoreTailSec` of the clip end is an outro hold (fine). Everything else is dead air.
 */
export function worstInternalGap(
  gaps: SilenceGap[],
  opts?: { ignoreLeadSec?: number; ignoreTailSec?: number; durationSec?: number },
): SilenceGap | null {
  const ignoreLead = opts?.ignoreLeadSec ?? 0.5;
  const total = opts?.durationSec;
  const ignoreTail = opts?.ignoreTailSec ?? 0.5;
  const internal = gaps.filter((g) => {
    if (g.startSec <= ignoreLead) return false;
    if (total !== undefined && g.endSec >= total - ignoreTail) return false;
    return true;
  });
  if (internal.length === 0) return null;
  return internal.reduce((m, g) => (g.durationSec > m.durationSec ? g : m));
}

export interface SilenceGateOpts {
  noiseDb?: number; // silencedetect noise floor in dB (default -30)
  minGapSec?: number; // silencedetect min gap to report (default 0.45)
  ignoreLeadSec?: number;
  ignoreTailSec?: number;
  durationSec?: number;
}

function resolveFfmpeg(): string {
  const env = process.env.FFMPEG_PATH;
  if (env && fs.existsSync(env)) return env;
  for (const c of ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"]) {
    if (fs.existsSync(c)) return c;
  }
  return "ffmpeg";
}

/** Run ffmpeg silencedetect over an audio/video file. Local render-time only (CI has no ffmpeg). */
export function detectSilenceGaps(filePath: string, opts?: SilenceGateOpts): SilenceGap[] {
  if (!fs.existsSync(filePath)) throw new Error(`silence gate: file not found: ${filePath}`);
  const noiseDb = opts?.noiseDb ?? -30;
  const minGap = opts?.minGapSec ?? 0.45;
  const r = spawnSync(
    resolveFfmpeg(),
    ["-hide_banner", "-nostats", "-i", filePath, "-af", `silencedetect=noise=${noiseDb}dB:d=${minGap}`, "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  // silencedetect prints to stderr; some builds exit non-zero — read both streams either way.
  const text = `${r.stderr ?? ""}\n${r.stdout ?? ""}`;
  return parseSilenceGaps(text);
}

/**
 * FAIL if any INTERNAL silence gap exceeds maxGapSec. Accepts a file path (runs ffmpeg) OR pre-parsed gaps
 * (pure — used by the unit test). Default 1.5s: a deliberate beat-to-beat breath is fine; a multi-second hold
 * reads as "the narrator paused too long" / dead air.
 */
export function assertNoLongSilenceGap(
  input: string | SilenceGap[],
  maxGapSec = 1.5,
  opts?: SilenceGateOpts,
): void {
  const gaps = typeof input === "string" ? detectSilenceGaps(input, opts) : input;
  const worst = worstInternalGap(gaps, opts);
  if (worst && worst.durationSec > maxGapSec) {
    throw new Error(
      `#1063 dead-air gate: an internal silence gap of ${worst.durationSec.toFixed(2)}s at ${worst.startSec.toFixed(1)}s ` +
        `exceeds the ${maxGapSec}s max — the narrator pauses too long. Re-time the spine so the VO fills the beat ` +
        `(or shorten the silent visual stretch).`,
    );
  }
}
