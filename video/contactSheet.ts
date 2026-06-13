/**
 * #867 Leg 1 — AUTO CONTACT-SHEET generator (the EYEBALL GATE's frame extractor).
 *
 * THE LESSON (feedback_eyeball_rendered_pixels_gate_before_paid_or_publish, 2026-06-13): a green
 * test suite / frame-count / provenance hash is necessary-not-sufficient — it can NOT see wrong
 * content (a terminal where the product should be), letterboxing, a placeholder shown as real,
 * internal dev-text leaking onto a public frame, an "island" layout, a fake/example URL, or "too
 * much text". ONLY a human looking at the actual rendered pixels catches those. This module makes
 * that look CHEAP and AUTOMATIC: after a demo/post video is produced, it chops out one representative
 * mid-beat frame PER beat and stitches them into a single tiled contact sheet you can scan in 2
 * seconds, plus a sidecar `index.json` (tile position → beat label/timestamp) and a hash-bound
 * `contact-sheet-manifest.json`. The eyeball-ack gate (`video/eyeballAck.ts`) then keys on the same
 * artifact sha so a re-render forces a fresh look.
 *
 * ffmpeg REALITY (verified live #824): the VENDORED Remotion ffmpeg is built `--disable-filters`, so
 * it CANNOT do `tile`/`scale`. We therefore call the SYSTEM ffmpeg (`/opt/homebrew/bin/ffmpeg` or
 * PATH `ffmpeg`) for the tiling step. The system ffmpeg on this machine ALSO lacks `drawtext` (no
 * libfreetype) and ImageMagick is not installed — so beat LABELS are NOT burned into the image; they
 * live in the sidecar `index.json`. If the system ffmpeg is absent we HARD-FAIL (never silently skip)
 * — that is the design rule shared with `renderProbe.ts`: a missing tool fails LOUDLY, and because a
 * missing sheet means no ack can be recorded, the downstream paid/publish gate stays blocked
 * (fail-closed by construction).
 *
 * Pure-ish + React-free: no `remotion/index.tsx` import, so this is inside the tsc/jest gate.
 */

import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

/** A single beat the contact sheet samples one representative frame from. */
export interface ContactSheetBeat {
  /** Human label (e.g. a scene id like "hook" / "compare"). NOT burned into the image — sidecar only. */
  label: string;
  /** Beat start time in seconds. */
  fromSec: number;
  /** Beat duration in seconds. The sampled frame is at the MIDPOINT (fromSec + durationSec/2). */
  durationSec: number;
}

/** One frame record in the manifest / sidecar index. */
export interface ContactSheetFrame {
  /** Tile position (0-based, row-major) in the stitched sheet. */
  tileIndex: number;
  /** The beat label this frame represents. */
  label: string;
  /** The exact timestamp (seconds) the frame was extracted at. */
  timestampSec: number;
  /** Absolute path to the extracted per-beat PNG. */
  path: string;
}

/** The hash-bound contact-sheet manifest written alongside the frames + tiled sheet. */
export interface ContactSheetManifest {
  /** The video the frames were extracted from. */
  artifactPath: string;
  /** sha256 of the artifact's EXACT bytes — the key the eyeball-ack gate binds to. */
  artifactSha: string;
  /** Number of frames / beats. */
  frameCount: number;
  /** Per-frame records (tile position → label + timestamp + path). */
  frames: ContactSheetFrame[];
  /** Absolute path to the stitched tiled sheet PNG. */
  sheetPath: string;
  /** Tile grid used. */
  grid: { cols: number; rows: number };
  /** ISO timestamp. */
  generatedAt: string;
}

export interface GenerateContactSheetResult {
  sheetPath: string;
  frameDir: string;
  framePaths: string[];
  manifestPath: string;
  indexPath: string;
  artifactSha: string;
  manifest: ContactSheetManifest;
}

export interface GenerateContactSheetOpts {
  /** Slug the review dir is keyed under (out/review/<slug>/eyeball/<sha>/). Default "demo". */
  slug?: string;
  /** Override the review root (default <cwd>/out/review). Tests point this at a tmp dir. */
  reviewRoot?: string;
  /** Per-tile scaled width in px (height auto, aspect preserved). Default 480. */
  tileWidthPx?: number;
  /** Force a system-ffmpeg binary path (tests). Default = resolveSystemFfmpeg(). */
  ffmpegBin?: string;
}

/**
 * Locate the SYSTEM ffmpeg — the one with `tile`/`scale` filters (the vendored Remotion ffmpeg is
 * `--disable-filters` and CANNOT tile). Prefer the homebrew path, else `ffmpeg` on PATH. HARD-FAILS
 * (throws) if neither is present — a missing binary is a loud error, never a silent skip. (When this
 * throws upstream, no contact sheet is written, so no ack can be recorded, so the paid/publish gate
 * stays blocked — fail-closed by construction.)
 */
export function resolveSystemFfmpeg(): string {
  const HOMEBREW = "/opt/homebrew/bin/ffmpeg";
  if (fs.existsSync(HOMEBREW)) return HOMEBREW;
  // Fall back to PATH lookup via `command -v` (portable; covers /usr/local/bin & Linux CI).
  const which = spawnSync("sh", ["-c", "command -v ffmpeg"], { encoding: "utf8" });
  const found = (which.stdout ?? "").trim();
  if (found && fs.existsSync(found)) return found;
  throw new Error(
    `contactSheet: system ffmpeg not found (looked for ${HOMEBREW} and \`ffmpeg\` on PATH). ` +
      `The contact sheet needs the SYSTEM ffmpeg's tile/scale filters — the vendored Remotion ffmpeg ` +
      `is built --disable-filters and CANNOT tile. Install ffmpeg (\`brew install ffmpeg\`) to ` +
      `generate the eyeball contact sheet. Until then no contact sheet ⇒ no eyeball-ack ⇒ the ` +
      `paid/publish gate stays BLOCKED (fail-closed).`,
  );
}

/** True iff a system ffmpeg is available — for smokes that want a LOUD skip rather than a hard error. */
export function hasSystemFfmpeg(): boolean {
  try {
    resolveSystemFfmpeg();
    return true;
  } catch {
    return false;
  }
}

/** sha256 of a file's exact bytes as lower-case hex. Throws if the file is missing. */
export function sha256File(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`contactSheet: file does not exist: ${filePath}`);
  }
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** The per-artifact eyeball review dir: out/review/<slug>/eyeball/<sha>/. */
export function eyeballDir(artifactSha: string, opts?: GenerateContactSheetOpts): string {
  const reviewRoot = opts?.reviewRoot ?? path.join(process.cwd(), "out", "review");
  const slug = opts?.slug ?? "demo";
  return path.join(reviewRoot, slug, "eyeball", artifactSha);
}

/** Run the system ffmpeg with args; throw a clear error on a non-zero exit (the tile/extract steps
 *  produce a file, so a non-zero exit is a real failure — unlike renderProbe's `-i`-only probe). */
function runSystemFfmpeg(bin: string, args: string[], label: string): void {
  const res = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (res.error) {
    throw new Error(`contactSheet: failed to run system ffmpeg for ${label}: ${res.error.message}`);
  }
  if (res.status !== 0) {
    const tail = `${res.stderr ?? ""}`.slice(-600);
    throw new Error(
      `contactSheet: system ffmpeg exited ${res.status} for ${label} (args: ${args.join(" ")}). Tail: ${tail}`,
    );
  }
}

/**
 * Generate the contact sheet for a produced video:
 *   1. hash the artifact's exact bytes → `artifactSha` (the eyeball-ack key).
 *   2. for each beat, extract ONE frame at the beat midpoint (input-seek `-ss`, no filter needed —
 *      runs on the system ffmpeg but only because we already require it for tiling).
 *   3. tile every frame into ONE sheet PNG (`scale=W:-1,tile=cols x rows` — system ffmpeg).
 *   4. write `index.json` (sidecar: tile position → {label, timestampSec}) and
 *      `contact-sheet-manifest.json` (hash-bound).
 *   5. print greppable `EYEBALL-SHEET:<path>` + `EYEBALL-HASH:<sha>`.
 *
 * Output dir keyed by hash so a re-render lands in a FRESH dir and a stale sheet is never reused.
 */
export function generateContactSheet(
  videoPath: string,
  beats: ContactSheetBeat[],
  opts?: GenerateContactSheetOpts,
): GenerateContactSheetResult {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`contactSheet: video does not exist: ${videoPath}`);
  }
  if (!Array.isArray(beats) || beats.length === 0) {
    throw new Error(`contactSheet: at least one beat is required to extract frames (got ${beats?.length ?? 0}).`);
  }
  const bin = opts?.ffmpegBin ?? resolveSystemFfmpeg();
  const tileWidthPx = opts?.tileWidthPx ?? 480;

  const artifactSha = sha256File(videoPath);
  const frameDir = eyeballDir(artifactSha, opts);
  fs.mkdirSync(frameDir, { recursive: true });

  // (1) Extract one frame per beat at the beat MIDPOINT.
  const framePaths: string[] = [];
  const frames: ContactSheetFrame[] = [];
  beats.forEach((beat, i) => {
    const mid = beat.fromSec + beat.durationSec / 2;
    const tileIndex = i;
    // Zero-padded so the `frame-%02d.png` glob the tiler reads is ordered.
    const frameName = `frame-${String(i).padStart(2, "0")}.png`;
    const framePath = path.join(frameDir, frameName);
    // Input-seek (`-ss` before `-i`) is fast + accurate enough for a review thumbnail.
    runSystemFfmpeg(
      bin,
      ["-y", "-hide_banner", "-loglevel", "error", "-ss", mid.toFixed(3), "-i", videoPath, "-frames:v", "1", "-q:v", "2", framePath],
      `frame extract beat[${i}] "${beat.label}" @ ${mid.toFixed(2)}s`,
    );
    if (!fs.existsSync(framePath) || fs.statSync(framePath).size <= 0) {
      throw new Error(
        `contactSheet: frame extraction produced no/empty PNG for beat[${i}] "${beat.label}" at ${mid.toFixed(2)}s ` +
          `(${framePath}). The video may be shorter than the beat timestamp.`,
      );
    }
    framePaths.push(framePath);
    frames.push({ tileIndex, label: beat.label, timestampSec: Number(mid.toFixed(3)), path: framePath });
  });

  // (2) Tile into one sheet. Grid: ceil(sqrt(N)) cols, enough rows to hold N.
  const cols = Math.ceil(Math.sqrt(frames.length));
  const rows = Math.ceil(frames.length / cols);
  const sheetPath = path.join(frameDir, "sheet.png");
  // `tile` consumes a SEQUENCE — feed the zero-padded glob via the image2 demuxer pattern. We scale
  // each frame to `tileWidthPx` wide (height auto, aspect kept), then tile cols×rows.
  runSystemFfmpeg(
    bin,
    [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      path.join(frameDir, "frame-%02d.png"),
      "-vf",
      `scale=${tileWidthPx}:-1,tile=${cols}x${rows}`,
      "-frames:v",
      "1",
      sheetPath,
    ],
    `tile ${cols}x${rows} sheet`,
  );
  if (!fs.existsSync(sheetPath) || fs.statSync(sheetPath).size <= 0) {
    throw new Error(`contactSheet: tiling produced no/empty sheet PNG at ${sheetPath}.`);
  }

  // (3) Sidecar index.json (tile position → label + timestamp; labels are NOT burned into the PNG).
  const indexPath = path.join(frameDir, "index.json");
  fs.writeFileSync(
    indexPath,
    JSON.stringify(
      {
        artifactSha,
        grid: { cols, rows },
        tiles: frames.map((f) => ({ tileIndex: f.tileIndex, label: f.label, timestampSec: f.timestampSec })),
      },
      null,
      2,
    ) + "\n",
  );

  // (4) Hash-bound manifest.
  const manifest: ContactSheetManifest = {
    artifactPath: path.resolve(videoPath),
    artifactSha,
    frameCount: frames.length,
    frames,
    sheetPath,
    grid: { cols, rows },
    generatedAt: new Date().toISOString(),
  };
  const manifestPath = path.join(frameDir, "contact-sheet-manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  // (5) Greppable breadcrumbs.
  console.log(`EYEBALL-SHEET:${sheetPath}`);
  console.log(`EYEBALL-HASH:${artifactSha}`);

  return { sheetPath, frameDir, framePaths, manifestPath, indexPath, artifactSha, manifest };
}

/** Derive contact-sheet beats from a demo/builder timeline's scenes (id → label, fromSec/durationSec). */
export function beatsFromScenes(
  scenes: ReadonlyArray<{ id?: string; fromSec: number; durationSec: number }>,
): ContactSheetBeat[] {
  return scenes.map((s, i) => ({
    label: s.id ?? `beat-${i}`,
    fromSec: s.fromSec,
    durationSec: s.durationSec,
  }));
}

/** Find the contact-sheet manifest for a given artifact sha, if one was generated (any slug). Returns
 *  the manifest path or null. Used by the ack gate to require a sheet exists for THESE exact bytes. */
export function findManifestForSha(
  artifactSha: string,
  opts?: { reviewRoot?: string },
): string | null {
  const reviewRoot = opts?.reviewRoot ?? path.join(process.cwd(), "out", "review");
  if (!fs.existsSync(reviewRoot)) return null;
  // out/review/<slug>/eyeball/<sha>/contact-sheet-manifest.json
  for (const slug of safeReaddir(reviewRoot)) {
    const candidate = path.join(reviewRoot, slug, "eyeball", artifactSha, "contact-sheet-manifest.json");
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function safeReaddir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}
