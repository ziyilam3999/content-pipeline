/**
 * #784 — pure-TS render PROBE for the MP4s the pipeline produces.
 *
 * WHY this exists: the repo renders MP4 deliverables but had NO committed way to
 * verify them. The parent (#784) reached for the system `ffprobe` — it is NOT
 * installed on this machine, and under `2>/dev/null` its *absence* read identically
 * to a real "no audio stream" result, nearly reporting a perfectly good voiced video
 * as silent (a silent false-NEGATIVE). That is the anti-pattern this module kills.
 *
 * Remotion ships its OWN ffmpeg at `node_modules/@remotion/compositor-<platform>/ffmpeg`
 * (e.g. `compositor-darwin-arm64`), bundled with the sibling dylibs it needs. That
 * binary is ALWAYS present wherever remotion is installed, so the probe never depends
 * on a system tool. On darwin it runs with `DYLD_FALLBACK_LIBRARY_PATH=<bindir>` so the
 * loader finds `libavformat.dylib` &c next to the binary.
 *
 * The module is React-free (no remotion/index.tsx import), so it IS in the tsc/jest
 * gate and is unit-testable, unlike the render path itself.
 *
 * Design rule: NEVER return a silent false-negative. If the vendored ffmpeg cannot be
 * found, or the probe command fails, or the output is unparseable, THROW a clear error.
 * A thrown error fails loudly; a wrong `hasAudioStream:false` would pass quietly.
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export interface RenderProbe {
  /** Decoded video frame count (the authoritative truncation check). */
  videoFrames: number;
  /** Container/stream duration in seconds (from the `Duration:` line). */
  videoDurationSec: number;
  /** Whether the file carries at least one audio stream. */
  hasAudioStream: boolean;
}

/**
 * Locate the vendored remotion ffmpeg matching this platform/arch. Remotion installs
 * exactly one `@remotion/compositor-<platform>-<arch>` package; we resolve from THIS
 * module's location so it works from the worktree's symlinked node_modules too.
 * Throws (never returns null) if it cannot be found — a missing binary is a hard error,
 * not a silent skip.
 */
export function resolveVendoredFfmpeg(): { bin: string; dir: string } {
  // Walk up from this file to find the nearest node_modules/@remotion dir.
  const candidates: string[] = [];
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    candidates.push(path.join(dir, "node_modules", "@remotion"));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Also try resolving via require (handles hoisted/symlinked layouts).
  try {
    const rendererPkg = require.resolve("@remotion/renderer/package.json");
    candidates.push(path.join(path.dirname(path.dirname(rendererPkg))));
  } catch {
    /* best-effort */
  }

  const platform = process.platform; // "darwin" | "linux" | "win32"
  const arch = process.arch; // "arm64" | "x64" | ...
  const exe = platform === "win32" ? "ffmpeg.exe" : "ffmpeg";

  for (const remotionDir of candidates) {
    if (!fs.existsSync(remotionDir)) continue;
    let entries: string[];
    try {
      entries = fs.readdirSync(remotionDir);
    } catch {
      continue;
    }
    // Prefer the package matching this platform+arch; fall back to any compositor-*.
    const preferred = `compositor-${platform}-${arch}`;
    const ordered = [
      ...entries.filter((e) => e === preferred),
      ...entries.filter((e) => e.startsWith("compositor-") && e !== preferred),
    ];
    for (const name of ordered) {
      const bin = path.join(remotionDir, name, exe);
      if (fs.existsSync(bin)) {
        return { bin, dir: path.dirname(bin) };
      }
    }
  }

  throw new Error(
    `renderProbe: could not locate the vendored remotion ffmpeg ` +
      `(looked for node_modules/@remotion/compositor-${platform}-${arch}/${exe} and siblings). ` +
      `It ships with @remotion/renderer — is remotion installed where this module runs? ` +
      `Searched: ${candidates.join(", ")}`,
  );
}

/** Build the loader env a vendored darwin ffmpeg needs (sibling dylibs). */
function ffmpegEnv(dir: string): NodeJS.ProcessEnv {
  if (process.platform === "darwin") {
    return { ...process.env, DYLD_FALLBACK_LIBRARY_PATH: dir };
  }
  if (process.platform === "linux") {
    const prev = process.env.LD_LIBRARY_PATH;
    return { ...process.env, LD_LIBRARY_PATH: prev ? `${dir}:${prev}` : dir };
  }
  return { ...process.env };
}

/**
 * Run the vendored ffmpeg and return its STDOUT+STDERR merged. ffmpeg writes ALL of its
 * informational output — the `Duration:`/`Stream:` lines AND the `frame=` progress stats —
 * to STDERR (the `null` muxer produces no stdout), and the `-i`-only probe exits NON-ZERO
 * ("At least one output file must be specified") while still printing the stream info.
 *
 * We use spawnSync (not execFileSync) precisely because it captures BOTH streams regardless
 * of exit code — execFileSync discards stderr on a clean exit, which would drop the entire
 * `frame=` count. We therefore do NOT treat a non-zero exit as failure here; instead we
 * throw only when there is no parseable output at all (a genuinely broken invocation), so a
 * missing binary / unreadable file fails LOUDLY rather than returning a silent false value.
 */
function runFfmpeg(args: string[], dir: string, bin: string): string {
  const res = spawnSync(bin, args, {
    env: ffmpegEnv(dir),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) {
    throw new Error(`renderProbe: failed to run vendored ffmpeg (${bin}): ${res.error.message}`);
  }
  const combined = `${res.stdout ?? ""}\n${res.stderr ?? ""}`.trim();
  if (!combined) {
    throw new Error(
      `renderProbe: ffmpeg produced no output (exit ${res.status}, signal ${res.signal ?? "none"}) for args: ${args.join(" ")}`,
    );
  }
  return combined;
}

/** Parse the final `frame=<n>` token from an ffmpeg progress/stats dump. */
export function parseVideoFrames(ffmpegOutput: string): number {
  // The progress line is repeated; the LAST `frame=<n>` is the total decoded count.
  // Tolerate the variable whitespace ffmpeg uses (`frame=   60`).
  const matches = [...ffmpegOutput.matchAll(/frame=\s*(\d+)/g)];
  if (matches.length === 0) {
    throw new Error(
      `renderProbe: no "frame=" count in ffmpeg output (cannot verify frame count). ` +
        `Output tail: ${ffmpegOutput.slice(-400)}`,
    );
  }
  return Number(matches[matches.length - 1][1]);
}

/** Parse the `Duration: HH:MM:SS.ss` line into seconds. Returns NaN if absent. */
export function parseDurationSec(ffmpegOutput: string): number {
  const m = ffmpegOutput.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return NaN;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/**
 * Detect an audio stream. We ONLY match a real per-stream declaration
 * (`Stream #0:1...: Audio: ...`) — NEVER scan for a bare "Audio" substring (the ffmpeg
 * config banner contains the word), and we run with `-hide_banner` besides.
 */
export function parseHasAudioStream(ffmpegOutput: string): boolean {
  return /Stream #\d+:\d+[^\n]*:\s*Audio:/.test(ffmpegOutput);
}

/**
 * #808 — parse the coded video frame dimensions (`... Video: h264 ... 1280x720 ...`) from an ffmpeg
 * stream dump. Returns null if no `Video:` stream line with a WxH token is present. We anchor on the
 * `Video:` stream declaration so we never pick up an unrelated WxH elsewhere in the banner/metadata.
 */
export function parseVideoDimensions(ffmpegOutput: string): { width: number; height: number } | null {
  const line = ffmpegOutput.split("\n").find((l) => /Stream #\d+:\d+[^\n]*:\s*Video:/.test(l));
  if (!line) return null;
  const m = line.match(/\b(\d{2,5})x(\d{2,5})\b/);
  if (!m) return null;
  return { width: Number(m[1]), height: Number(m[2]) };
}

/**
 * Probe an MP4 (or any container the vendored ffmpeg can demux). Returns the decoded
 * video frame count, the container duration, and whether an audio stream exists.
 *
 * Throws (never a silent false-negative) when: the file is missing, the vendored ffmpeg
 * can't be found, or the output is unparseable for the frame count.
 */
export function probeRender(filePath: string): RenderProbe {
  if (!fs.existsSync(filePath)) {
    throw new Error(`renderProbe: file does not exist: ${filePath}`);
  }
  const { bin, dir } = resolveVendoredFfmpeg();

  // (1) Frame count + stats: re-mux the first video stream to the null sink. The final
  //     `frame=` is the decoded total — the truncation check (1800 vs 3110 → fails).
  const frameOut = runFfmpeg(
    ["-hide_banner", "-i", filePath, "-map", "0:v:0", "-c", "copy", "-f", "null", "-"],
    dir,
    bin,
  );
  const videoFrames = parseVideoFrames(frameOut);

  // (2) Container metadata: `-i` only. ffmpeg exits non-zero ("At least one output
  //     file must be specified") but still prints Duration + Stream lines to stderr,
  //     which runFfmpeg recovers.
  const metaOut = runFfmpeg(["-hide_banner", "-i", filePath], dir, bin);
  const videoDurationSec = parseDurationSec(`${frameOut}\n${metaOut}`);
  const hasAudioStream = parseHasAudioStream(metaOut);

  if (!Number.isFinite(videoDurationSec)) {
    throw new Error(
      `renderProbe: could not parse a Duration from ffmpeg output for ${filePath}. ` +
        `Tail: ${metaOut.slice(-400)}`,
    );
  }

  return { videoFrames, videoDurationSec, hasAudioStream };
}

/** Default frame-count tolerance: a render may be ±2 frames off the exact expectation. */
export const FRAME_COUNT_TOLERANCE = 2;

/**
 * Assert a measured frame count matches what the render duration implies, within a small
 * tolerance. A truncated cut (e.g. 1800 frames when 3110 expected) THROWS with a clear
 * message — this is the assertion that turns a quiet half-rendered MP4 into a smoke FAIL.
 *
 * @param videoFrames        measured decoded frames (from probeRender)
 * @param expectedDurationSec the clamped render duration the smoke actually used
 * @param fps                frames per second the render used (smoke default 30)
 */
export function assertVideoFrameCount(
  videoFrames: number,
  expectedDurationSec: number,
  fps: number,
  opts?: { toleranceFrames?: number; label?: string },
): void {
  const expectedFrames = Math.round(expectedDurationSec * fps);
  const tol = opts?.toleranceFrames ?? FRAME_COUNT_TOLERANCE;
  const drift = Math.abs(videoFrames - expectedFrames);
  if (drift > tol) {
    const where = opts?.label ? ` (${opts.label})` : "";
    throw new Error(
      `renderProbe: frame-count mismatch${where}: measured ${videoFrames} frames but expected ` +
        `~${expectedFrames} (=${expectedDurationSec.toFixed(2)}s × ${fps}fps, tolerance ±${tol}). ` +
        `A drift this large means the MP4 is truncated or the wrong length — the render did NOT ` +
        `produce the full deliverable.`,
    );
  }
}

// ── #808 RULE 2: mobile-proxy probe + enforced caps ───────────────────────────────────────────

/**
 * #808 — does this MP4 have its `moov` atom BEFORE `mdat` (i.e. was it muxed with `+faststart`)?
 *
 * +faststart moves the index (`moov`) to the front so a phone can start playback before the whole
 * file downloads — required for the review-relay proxy. We detect it by scanning the top-level ISO
 * BMFF box order directly from the file's bytes (no ffmpeg dependency, deterministic): walk the box
 * headers and report true iff `moov` appears before `mdat`. A streamed/non-faststart file places
 * `moov` at the END, so `mdat` is seen first. We only read the first chunk needed to settle the
 * order — once we hit either box we have the answer.
 */
export function hasFaststartMoov(filePath: string): boolean {
  const fd = fs.openSync(filePath, "r");
  try {
    const stat = fs.fstatSync(fd);
    const fileSize = stat.size;
    let offset = 0;
    const header = Buffer.alloc(16);
    while (offset + 8 <= fileSize) {
      const read = fs.readSync(fd, header, 0, 16, offset);
      if (read < 8) break;
      let boxSize = header.readUInt32BE(0);
      const boxType = header.toString("ascii", 4, 8);
      // 64-bit largesize (boxSize === 1): real size is the next 8 bytes.
      let headerLen = 8;
      if (boxSize === 1) {
        if (read < 16) break;
        // High 32 bits are ~always 0 for these files; use the low 32 to stay in JS safe ints.
        boxSize = header.readUInt32BE(12);
        headerLen = 16;
      }
      if (boxType === "moov") return true; // moov first → faststart
      if (boxType === "mdat") return false; // mdat first → NOT faststart
      if (boxSize <= 0) break; // box-to-end-of-file (size 0) or malformed → stop
      offset += boxSize < headerLen ? headerLen : boxSize;
    }
    return false;
  } finally {
    fs.closeSync(fd);
  }
}

export interface MobileProxyProbe {
  bytes: number;
  widthPx: number;
  heightPx: number;
  /** Smaller of width/height. */
  shortEdgePx: number;
  /** Larger of width/height. */
  longEdgePx: number;
  hasFaststart: boolean;
}

/**
 * #808 — probe a mobile-proxy MP4: file size, video dimensions, and faststart. Throws (never a
 * silent false value, per this module's design rule) if the file is missing or its video dimensions
 * are unparseable.
 */
export function probeMobileProxy(filePath: string): MobileProxyProbe {
  if (!fs.existsSync(filePath)) {
    throw new Error(`probeMobileProxy: file does not exist: ${filePath}`);
  }
  const { bin, dir } = resolveVendoredFfmpeg();
  const metaOut = runFfmpeg(["-hide_banner", "-i", filePath], dir, bin);
  const dims = parseVideoDimensions(metaOut);
  if (!dims) {
    throw new Error(
      `probeMobileProxy: could not parse video dimensions for ${filePath}. Tail: ${metaOut.slice(-400)}`,
    );
  }
  const bytes = fs.statSync(filePath).size;
  return {
    bytes,
    widthPx: dims.width,
    heightPx: dims.height,
    shortEdgePx: Math.min(dims.width, dims.height),
    longEdgePx: Math.max(dims.width, dims.height),
    hasFaststart: hasFaststartMoov(filePath),
  };
}

export interface VideoGeometry { width: number; height: number; durationSec: number; }
/** Probe a video's frame WxH + duration in ONE vendored-ffmpeg `-i` call. Throws (never a silent
 *  false value, per this module's design rule) if the file is missing or dims/duration are unparseable. */
export function probeVideoGeometry(filePath: string): VideoGeometry {
  if (!fs.existsSync(filePath)) throw new Error(`probeVideoGeometry: file does not exist: ${filePath}`);
  const { bin, dir } = resolveVendoredFfmpeg();
  const metaOut = runFfmpeg(["-hide_banner", "-i", filePath], dir, bin);
  const dims = parseVideoDimensions(metaOut);
  if (!dims) throw new Error(`probeVideoGeometry: could not parse video dimensions for ${filePath}. Tail: ${metaOut.slice(-400)}`);
  const durationSec = parseDurationSec(metaOut);
  if (!Number.isFinite(durationSec)) throw new Error(`probeVideoGeometry: could not parse a Duration for ${filePath}. Tail: ${metaOut.slice(-400)}`);
  return { width: dims.width, height: dims.height, durationSec };
}

/** The enforced mobile-proxy caps (config SSOT — `CONFIG.demo.mobileProxy`). */
export interface MobileProxyCaps {
  maxBytes: number;
  maxEdgePx: number;
}

/**
 * #808 — assert a mobile proxy meets the REVIEW-DELIVERY caps: ≤ maxBytes (download-relay ceiling),
 * ≤ maxEdgePx on its short/long edge (720p class), AND faststart (moov-before-mdat). Throws a clear
 * aggregated error listing every breached cap so the producer's render-verify fails LOUDLY.
 */
export function assertMobileProxy(
  probe: MobileProxyProbe,
  caps: MobileProxyCaps,
  opts?: { label?: string },
): void {
  const where = opts?.label ? ` (${opts.label})` : "";
  const fails: string[] = [];
  if (probe.bytes > caps.maxBytes) {
    fails.push(
      `size ${(probe.bytes / 1048576).toFixed(2)}MB > cap ${(caps.maxBytes / 1048576).toFixed(2)}MB ` +
        `(the phone download relay silently fails on files this large)`,
    );
  }
  // 720p class: the SHORT edge of a portrait/landscape proxy must be ≤ maxEdgePx. (For a 9:16 proxy
  // the short edge is the width; for a 16:9 proxy it is the height. Either way the constraining
  // dimension that controls pixel count + bitrate is the short edge.)
  if (probe.shortEdgePx > caps.maxEdgePx) {
    fails.push(`short edge ${probe.shortEdgePx}px > ${caps.maxEdgePx}px (not 720p class)`);
  }
  if (!probe.hasFaststart) {
    fails.push("no +faststart moov atom (moov is not before mdat — phone can't stream it)");
  }
  if (fails.length > 0) {
    throw new Error(`#808 mobile-proxy cap violation${where}: ${fails.join("; ")}.`);
  }
}
