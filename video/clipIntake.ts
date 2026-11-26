/**
 * Row A41-clip-intake — probe, sha256 and a personal-data CHECK LIST per recorded clip.
 *
 * The capture tools in this repo film a web page or a terminal; none takes a recorded
 * clip file, so phone clips had no checked way in. This module takes clip FILES: it
 * probes each one with the BUNDLED ffprobe (the binary sitting next to the ffmpeg
 * resolveVendoredFfmpeg returns — this module spawns ffprobe only, not ffmpeg), hashes
 * the bytes as a stream, and writes two files per taken clip into --out:
 * <sha256>.intake.json (the measured facts) and <sha256>.checklist.json (the 15
 * personal-data lines a person answers by editing the file).
 *
 * Fail closed: a bad clip is refused with a named reason code, nothing is written for it,
 * and the check verb refuses to call a clip ready while a line is open. The honest limit
 * (also in the help text): the tool proves that a person answered every line, not that
 * the answers are true — the look itself is done by a person, outside this tool.
 *
 * The tool writes nothing outside --out; intake refuses --out / inputs inside this repo
 * or any git work tree (the repo is public; anything personal stays outside it).
 */

import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import { resolveVendoredFfmpeg } from "./renderProbe";

export const INTAKE_SCHEMA = "clip-intake/1";
export const CHECKLIST_SCHEMA = "clip-checklist/1";

/** The 15 personal-data lines of a check list, in order (plan draft "Not on screen, ever" + what the test clip showed). */
export const CHECKLIST_KINDS = [
  "status-bar-clock",
  "notification-banner",
  "recorder-overlay",
  "own-name",
  "other-user-name-rating-photo",
  "number-plate-vehicle",
  "phone-number",
  "email",
  "otp-or-login-screen",
  "map-position",
  "transaction-id",
  "dispute-id",
  "credit-balance",
  "test-build-mark",
  "service-name-or-endpoint",
];

/**
 * The answer "shown" (A59): the item is on frames of the take and is left readable in the level
 * three video by a recorded decision. The tool does not read the storyboard files when it runs;
 * these three values are fixed here and the tests hold them to the public storyboard files.
 */
/** The lines that may be answered shown: the kinds whose "Before every take" rule is blur. */
export const SHOWN_KINDS = [
  "own-name",
  "other-user-name-rating-photo",
  "number-plate-vehicle",
  "phone-number",
  "email",
  "map-position",
  "transaction-id",
  "dispute-id",
  "credit-balance",
  "test-build-mark",
  "service-name-or-endpoint",
];
/** The one video a shown note may name (the slug of its storyboard file). */
export const SHOWN_VIDEOS: string[] = ["getspace-level3"];
/** The clips a shown note may name: the rows with Asset clip in that storyboard, each under its phone. */
export const SHOWN_CLIPS: Record<string, "seeker" | "giver"> = {
  "C-01": "seeker",
  "C-05": "seeker",
  "C-06": "seeker",
  "C-07": "seeker",
  "C-11": "giver",
};
const SHOWN_SCOPE_KEYS = ["clips", "sha256", "video"]; // the three keys beside decision
const SHOWN_NOTE_KEYS = [...SHOWN_SCOPE_KEYS, "decision"];

/** Whole words (case-insensitive, split on non-alphanumerics) that mark a test build in a file name. */
const TEST_BUILD_WORDS = ["uat", "test", "staging", "debug", "beta", "dev", "qa"];
const ALLOWED_VIDEO_CODECS = ["h264", "hevc"];
const MIN_DISPLAYED_WIDTH = 720; // draft B5 floor
const FIT_W = 1080;
const FIT_H = 1920;

export type RefusalCode =
  | "bad-name"
  | "symlink"
  | "not-regular-file"
  | "input-inside-repo"
  | "unreadable"
  | "empty-file"
  | "probe-failed"
  | "no-video-stream"
  | "container-not-allowed"
  | "codec-not-allowed"
  | "too-small"
  | "too-short"
  | "incomplete-read"
  | "duplicate-sha256";

export type CheckReason =
  | "open-lines"
  | "present-lines"
  | "no-looker"
  | "bad-answer"
  | "shown-not-allowed"
  | "shown-no-decision"
  | "shown-bad-scope"
  | "kinds-changed"
  | "source-changed"
  | "source-missing"
  | "intake-missing"
  | "checklist-unreadable"
  | "checklist-missing"
  | "sha-mismatch";

export interface ClipIntakeOpts {
  /** Override the ffprobe binary (tests drive ffprobe-missing with a path that does not exist). */
  probeBin?: string;
}

// ── vendored ffprobe ─────────────────────────────────────────────────────────────────────

export interface ProbeTool {
  bin: string;
  dir: string;
  version: string;
}

/** The loader env a vendored darwin/linux ffprobe needs (sibling dylibs) — copied from renderProbe.ts, which is out of scope. */
function loaderEnv(dir: string): NodeJS.ProcessEnv {
  if (process.platform === "darwin") {
    return { ...process.env, DYLD_FALLBACK_LIBRARY_PATH: dir };
  }
  if (process.platform === "linux") {
    const prev = process.env.LD_LIBRARY_PATH;
    return { ...process.env, LD_LIBRARY_PATH: prev ? `${dir}:${prev}` : dir };
  }
  return { ...process.env };
}

/** The bundled ffprobe next to the ffmpeg resolveVendoredFfmpeg finds (ffprobe.exe on win32); no system ffprobe, no PATH lookup. */
export function resolveProbeTool(override?: string): ProbeTool {
  let bin: string;
  if (override) {
    bin = override;
  } else {
    const ff = resolveVendoredFfmpeg(); // throws when the vendored ffmpeg is missing (hard error, not a skip)
    bin = path.join(ff.dir, process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  }
  const dir = path.dirname(bin);
  const res = spawnSync(bin, ["-version"], {
    env: loaderEnv(dir),
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  const m = out.match(/ffprobe version (\S+)/);
  if (res.error || res.status !== 0 || !m) {
    throw new Error(`the bundled ffprobe cannot be found or run (tried ${bin})`);
  }
  return { bin, dir, version: m[1] };
}

/** Run ffprobe with an ARGUMENT ARRAY (no shell — a clip name can never read as an option or a protocol). */
function ffprobe(tool: ProbeTool, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync(tool.bin, args, {
    env: loaderEnv(tool.dir),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

// ── small filesystem helpers ─────────────────────────────────────────────────────────────

/** sha256 of a file's bytes, read in chunks (never the whole file in memory). */
function sha256Streamed(filePath: string): string {
  const fd = fs.openSync(filePath, "r");
  try {
    const hash = crypto.createHash("sha256");
    const buf = Buffer.alloc(1024 * 1024);
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (n <= 0) break;
      hash.update(buf.subarray(0, n));
    }
    return hash.digest("hex");
  } finally {
    fs.closeSync(fd);
  }
}

/** Does this real path sit inside a repo — a .git entry, or a package.json named content-pipeline, here or in any parent? */
function pathInsideRepo(start: string): boolean {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) return true;
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { name?: unknown };
        if (pkg && pkg.name === "content-pipeline") return true;
      } catch {
        /* an unreadable package.json is not evidence of this repo */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

/** A name is bad when it holds a control char, starts with a dash, or is not .mp4/.mov (any case). */
function isBadName(name: string): boolean {
  if (/[\x00-\x1f\x7f]/.test(name)) return true;
  if (name.startsWith("-")) return true;
  return !/\.(mp4|mov)$/i.test(name);
}

/** test-build-name: one of the marker words as a whole word, case-insensitive ("[UAT]" hits, "latest" does not). */
function hasTestBuildWord(name: string): boolean {
  const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words.some((w) => TEST_BUILD_WORDS.includes(w));
}

/** Byte-order compare of two names (not UTF-16 code-unit order). */
function byteCompare(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/** Write a JSON file atomically (temp file in the same folder, then a rename) — a stopped
 *  run leaves no half-written <sha>.*.json (at worst a .tmp file). */
function atomicWriteJson(dir: string, finalName: string, value: unknown): void {
  const tmp = path.join(dir, `${finalName}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(value) + "\n");
  fs.renameSync(tmp, path.join(dir, finalName));
}

// ── probe facts ──────────────────────────────────────────────────────────────────────────

export interface FitPad {
  scaled_width: number;
  scaled_height: number;
  bar_top: number;
  bar_bottom: number;
  bar_left: number;
  bar_right: number;
}
export interface FitCrop {
  scaled_width: number;
  scaled_height: number;
  cut_top: number;
  cut_bottom: number;
  cut_left: number;
  cut_right: number;
}
export interface Fit {
  pad: FitPad;
  crop: FitCrop;
}

export interface ProbeFacts {
  name: string;
  realPath: string;
  size: number;
  sha: string;
  container: string;
  codec: string;
  profile: string | number;
  pixFmt: string;
  codedWidth: number;
  codedHeight: number;
  rotation: number;
  width: number;
  height: number;
  frameRateKind: "cfr" | "vfr";
  rFrameRate: string;
  avgFrameRate: string;
  avgFps: number;
  framesHeader: number;
  packetsRead: number;
  durationSec: number;
  bitRate: number | null;
  hasAudio: boolean;
  flags: string[];
  fit: Fit | null;
}

function evenFloor(v: number): number {
  return Math.floor(v / 2) * 2;
}

/** Fit numbers for row A41-clip-cut: scale-to-fit 1080x1920 (pad, bars fill) and scale-to-cover (crop, the rest is cut). */
export function computeFit(width: number, height: number): Fit {
  // Exact integer cross-multiplication (a float scale factor rounds 1920 down to 1918 on tall clips).
  // The width binds for pad when 1080/width ≤ 1920/height; for crop the other edge binds.
  const widthBinds = FIT_W * height <= FIT_H * width;
  const padW = widthBinds ? FIT_W : evenFloor((width * FIT_H) / height);
  const padH = widthBinds ? evenFloor((height * FIT_W) / width) : FIT_H;
  const cropW = widthBinds ? evenFloor((width * FIT_H) / height) : FIT_W;
  const cropH = widthBinds ? FIT_H : evenFloor((height * FIT_W) / width);
  const dxPad = FIT_W - padW;
  const dyPad = FIT_H - padH;
  const dxCrop = cropW - FIT_W;
  const dyCrop = cropH - FIT_H;
  return {
    pad: {
      scaled_width: padW,
      scaled_height: padH,
      bar_top: Math.floor(dyPad / 2),
      bar_bottom: dyPad - Math.floor(dyPad / 2), // odd total: the extra pixel goes to the bottom
      bar_left: Math.floor(dxPad / 2),
      bar_right: dxPad - Math.floor(dxPad / 2), // ...and to the right
    },
    crop: {
      scaled_width: cropW,
      scaled_height: cropH,
      cut_top: Math.floor(dyCrop / 2),
      cut_bottom: dyCrop - Math.floor(dyCrop / 2),
      cut_left: Math.floor(dxCrop / 2),
      cut_right: dxCrop - Math.floor(dxCrop / 2),
    },
  };
}

interface RawStream {
  codec_type?: unknown;
  codec_name?: unknown;
  profile?: unknown;
  pix_fmt?: unknown;
  coded_width?: unknown;
  coded_height?: unknown;
  nb_frames?: unknown;
  r_frame_rate?: unknown;
  avg_frame_rate?: unknown;
  side_data_list?: unknown;
}

function parseFrac(s: unknown): { n: number; d: number } | null {
  if (typeof s !== "string") return null;
  const m = s.match(/^(\d+)\/(\d+)$/);
  if (!m) return null;
  return { n: Number(m[1]), d: Number(m[2]) };
}

/** vfr when r_frame_rate and avg_frame_rate differ AS FRACTIONS
 *  (30/1 vs 60/2 is cfr; 30/1 vs 30000/1001 is vfr). */
function frameRateKindOf(rFrameRate: unknown, avgFrameRate: unknown): "cfr" | "vfr" {
  const r = parseFrac(rFrameRate);
  const a = parseFrac(avgFrameRate);
  if (!r || !a) return "vfr";
  return r.n * a.d === a.n * r.d ? "cfr" : "vfr";
}

/** Degrees from the display-matrix side data, as ffprobe prints it (0 when absent). */
function rotationOf(stream: RawStream): number {
  const list = stream.side_data_list;
  if (!Array.isArray(list)) return 0;
  for (const sd of list) {
    if (sd && typeof sd === "object" && (sd as { side_data_type?: unknown }).side_data_type === "Display Matrix") {
      const r = Number((sd as { rotation?: unknown }).rotation);
      if (Number.isFinite(r)) return r;
    }
  }
  return 0;
}

// ── entry collection and the fail-closed checks ──────────────────────────────────────────

interface Entry {
  file: string;
  absPath: string;
}

type Outcome =
  | { entry: Entry; result: "taken"; facts: ProbeFacts }
  | { entry: Entry; result: "refused"; reason: RefusalCode; sha: string | null }
  | { entry: Entry; result: "skipped-hidden" };

/** Each input path is a clip file, or a folder whose TOP-LEVEL entries are taken (no recursion).
 *  A folder whose listing cannot be read is kept apart: it becomes one refused line, not silence. */
function collectEntries(inputPaths: string[]): { entries: Entry[]; unreadableFolders: Entry[] } {
  const entries: Entry[] = [];
  const unreadableFolders: Entry[] = [];
  for (const p of inputPaths) {
    let isDir = false;
    try {
      isDir = fs.lstatSync(p).isDirectory();
    } catch {
      isDir = false;
    }
    if (isDir) {
      let dirents: fs.Dirent[];
      try {
        dirents = fs.readdirSync(p, { withFileTypes: true });
      } catch {
        unreadableFolders.push({ file: path.basename(p), absPath: p });
        continue;
      }
      for (const d of dirents) entries.push({ file: d.name, absPath: path.join(p, d.name) });
    } else {
      entries.push({ file: path.basename(p), absPath: p });
    }
  }
  return { entries, unreadableFolders };
}

/** The per-entry fail-closed ladder; the FIRST reason that applies wins (this order is the contract). */
function evaluateEntry(entry: Entry, tool: ProbeTool): Outcome {
  const refused = (reason: RefusalCode, sha: string | null = null): Outcome => ({
    entry,
    result: "refused",
    reason,
    sha,
  });
  const name = entry.file;

  if (name.startsWith(".")) return { entry, result: "skipped-hidden" };
  if (isBadName(name)) return refused("bad-name");

  try {
    if (fs.lstatSync(entry.absPath).isSymbolicLink()) return refused("symlink");
  } catch {
    return refused("not-regular-file");
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(entry.absPath);
  } catch {
    return refused("not-regular-file");
  }
  if (!stat.isFile()) return refused("not-regular-file"); // a subfolder inside a folder argument, a device

  let realPath: string;
  try {
    realPath = fs.realpathSync(entry.absPath);
  } catch {
    return refused("not-regular-file");
  }
  if (pathInsideRepo(realPath)) return refused("input-inside-repo");
  try {
    fs.accessSync(realPath, fs.constants.R_OK);
  } catch {
    return refused("unreadable");
  }
  if (stat.size === 0) return refused("empty-file");

  // Probe facts: stream + container metadata (no container or stream tag is copied).
  const meta = ffprobe(tool, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    realPath,
  ]);
  if (meta.status !== 0) return refused("probe-failed");
  let doc: { format?: { format_name?: unknown; duration?: unknown; bit_rate?: unknown }; streams?: RawStream[] };
  try {
    doc = JSON.parse(meta.stdout);
  } catch {
    return refused("probe-failed");
  }
  if (!doc || typeof doc !== "object" || !doc.format || !Array.isArray(doc.streams)) return refused("probe-failed");

  const vstream = doc.streams.find((s) => s && s.codec_type === "video");
  if (!vstream) return refused("no-video-stream");

  const container = typeof doc.format.format_name === "string" ? doc.format.format_name : "";
  const containerParts = container.split(",");
  if (!containerParts.includes("mov") && !containerParts.includes("mp4")) return refused("container-not-allowed");

  const codec = typeof vstream.codec_name === "string" ? vstream.codec_name : "";
  if (!ALLOWED_VIDEO_CODECS.includes(codec)) return refused("codec-not-allowed");

  const codedWidth = Number(vstream.coded_width);
  const codedHeight = Number(vstream.coded_height);
  if (!Number.isFinite(codedWidth) || !Number.isFinite(codedHeight)) return refused("probe-failed");
  const rotation = rotationOf(vstream);
  const swap = Math.abs(rotation) % 180 === 90; // 90 or 270, either sign
  const width = swap ? codedHeight : codedWidth; // the DISPLAYED size
  const height = swap ? codedWidth : codedHeight;
  if (!(width >= MIN_DISPLAYED_WIDTH)) return refused("too-small");

  // Full packet read: the header-only probe lies on a truncated +faststart file (measured:
  // header says 60 frames / 2.0 s while only -count_packets shows the truth on stderr).
  const packets = ffprobe(tool, [
    "-v",
    "error",
    "-count_packets",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=nb_read_packets",
    "-print_format",
    "json",
    realPath,
  ]);
  let packetsRead: number | null = null;
  if (packets.status === 0 && packets.stdout) {
    try {
      const n = Number((JSON.parse(packets.stdout) as { streams?: { nb_read_packets?: unknown }[] }).streams?.[0]?.nb_read_packets);
      if (Number.isFinite(n)) packetsRead = n;
    } catch {
      packetsRead = null;
    }
  }
  const durationSec = Number(doc.format.duration);
  if ((packetsRead !== null && packetsRead < 2) || !(durationSec >= 1)) return refused("too-short");

  const framesHeader = Number(vstream.nb_frames);
  const readErrored = packets.status !== 0 || packets.stderr.trim() !== "";
  if (!Number.isFinite(framesHeader) || packetsRead === null || readErrored || packetsRead !== framesHeader) {
    return refused("incomplete-read");
  }

  // Only now (every check passed, duplicates pending) is the clip worth hashing.
  const sha = sha256Streamed(realPath);
  const rFrameRate = typeof vstream.r_frame_rate === "string" ? vstream.r_frame_rate : "";
  const avgFrameRate = typeof vstream.avg_frame_rate === "string" ? vstream.avg_frame_rate : "";
  const avg = parseFrac(avgFrameRate);
  const not916 = width * 16 !== height * 9;
  const flags: string[] = [];
  if (not916) flags.push("shape-not-9x16");
  const kind = frameRateKindOf(rFrameRate, avgFrameRate);
  if (kind === "vfr") flags.push("variable-frame-rate");
  const hasAudio = doc.streams.some((s) => s && s.codec_type === "audio");
  if (!hasAudio) flags.push("no-audio");
  if (hasTestBuildWord(name)) flags.push("test-build-name");
  const bitRateRaw = Number(doc.format.bit_rate);

  return {
    entry,
    result: "taken",
    facts: {
      name,
      realPath,
      size: stat.size,
      sha,
      container,
      codec,
      profile: (vstream.profile as string | number | undefined) ?? "",
      pixFmt: (vstream.pix_fmt as string | undefined) ?? "",
      codedWidth,
      codedHeight,
      rotation,
      width,
      height,
      frameRateKind: kind,
      rFrameRate,
      avgFrameRate,
      avgFps: avg ? Math.round((avg.n / avg.d) * 1000) / 1000 : 0,
      framesHeader,
      packetsRead,
      durationSec,
      bitRate: Number.isFinite(bitRateRaw) ? bitRateRaw : null,
      hasAudio,
      flags,
      fit: not916 ? computeFit(width, height) : null,
    },
  };
}

// ── the two output files ─────────────────────────────────────────────────────────────────

/** <sha256>.intake.json — the measured facts, keys in the contract's order, nothing copied from tags. */
function buildIntakeJson(f: ProbeFacts, tool: ProbeTool): Record<string, unknown> {
  const json: Record<string, unknown> = {
    schema: INTAKE_SCHEMA,
    file_name: f.name,
    source_path: f.realPath,
    size_bytes: f.size,
    sha256: f.sha,
    container: f.container,
    video: {
      codec: f.codec,
      profile: f.profile,
      pix_fmt: f.pixFmt,
      coded_width: f.codedWidth,
      coded_height: f.codedHeight,
      rotation: f.rotation,
      width: f.width,
      height: f.height,
      frame_rate_kind: f.frameRateKind,
      r_frame_rate: f.rFrameRate,
      avg_frame_rate: f.avgFrameRate,
      avg_fps: f.avgFps,
      frames_header: f.framesHeader,
      packets_read: f.packetsRead,
    },
    duration_sec: f.durationSec,
    bit_rate: f.bitRate,
    has_audio: f.hasAudio,
    flags: f.flags,
  };
  if (f.fit) json.fit = f.fit; // present only when the shape is not 9:16
  json.probe_tool = `ffprobe ${tool.version}`;
  return json;
}

/** <sha256>.checklist.json — the 15 personal-data lines, each answered by a person editing this file outside every repo. */
function buildChecklist(sha: string, fileName: string): Record<string, unknown> {
  return {
    schema: CHECKLIST_SCHEMA,
    sha256: sha,
    file_name: fileName,
    looked_by: "",
    lines: CHECKLIST_KINDS.map((kind) => ({ kind, answer: "not checked", note: "" })),
  };
}

// ── the check verb ───────────────────────────────────────────────────────────────────────

interface CheckResult {
  sha256: string;
  ready: boolean;
  reasons: CheckReason[];
  cut_tasks: { sha256: string; kind: string }[];
  /** The stdout key of a READY take that holds a shown line: sha256, video and clips as the decision
   *  note has them, and the kinds answered shown in line order. The decision text is not in it. */
  shown?: { sha256: string; video: string; clips: string[]; kinds: string[] };
}

interface ParsedChecklist {
  sha256: string;
  looked_by: string;
  lines: { kind: string; answer: string; note: string }[];
  /** The decision note of the shown lines; its shape is checked by shownVerdict. */
  shown?: unknown;
}

/** "does not parse as JSON of this shape" — a break in the checked shape is
 *  checklist-unreadable. */
function parseChecklistShape(raw: string): ParsedChecklist | null {
  let c: unknown;
  try {
    c = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!c || typeof c !== "object" || Array.isArray(c)) return null;
  const o = c as Record<string, unknown>;
  if (typeof o.sha256 !== "string" || typeof o.file_name !== "string" || typeof o.looked_by !== "string") return null;
  if (!Array.isArray(o.lines)) return null;
  for (const l of o.lines) {
    if (!l || typeof l !== "object" || Array.isArray(l)) return null;
    const lo = l as Record<string, unknown>;
    if (typeof lo.kind !== "string" || typeof lo.answer !== "string" || typeof lo.note !== "string") return null;
  }
  return o as unknown as ParsedChecklist;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** An own-key lookup: "constructor" or "__proto__" is not a clip id. */
function isShownClip(v: unknown): v is string {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(SHOWN_CLIPS, v);
}

/** A date written YYYY-MM-DD, not part of a longer run of digits (12026-01-02 is not a date).
 *  Only the first date shape in the text is read. */
function hasDatedText(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = /\d*(\d{4}-\d{2}-\d{2})\d*/.exec(v);
  return m !== null && m[0].length === 10 && /\p{L}/u.test(v); // ...and a letter somewhere in the text
}

/** The three faults of the shown lines. They are read apart from each other, so a check list
 *  can hold more than one; the reason order is fixed in evaluateChecklist. */
interface ShownVerdict {
  notAllowed: boolean;
  noDecision: boolean;
  badScope: boolean;
  /** The kinds answered shown, in line order (whatever the note says). */
  kinds: string[];
  /** The note, once it is complete and in scope; null otherwise. */
  note: { sha256: string; video: string; clips: string[] } | null;
}

function shownVerdict(c: ParsedChecklist, shaName: string): ShownVerdict {
  const kinds = c.lines.filter((l) => l.answer === "shown").map((l) => l.kind);
  const none: ShownVerdict = { notAllowed: false, noDecision: false, badScope: false, kinds, note: null };
  if (kinds.length === 0) return none; // no shown line: the note (if any) is not read
  const notAllowed = kinds.some((k) => !SHOWN_KINDS.includes(k));
  const note = c.shown;
  const noDecision = !isRecord(note) || !hasDatedText(note.decision);
  let badScope = false;
  let goodNote: ShownVerdict["note"] = null;
  if (isRecord(note)) {
    const clips: unknown[] = Array.isArray(note.clips) ? (note.clips as unknown[]) : [];
    const clipsOk =
      clips.length > 0 &&
      clips.every(isShownClip) &&
      new Set(clips).size === clips.length &&
      clips.every((id) => SHOWN_CLIPS[id as string] === SHOWN_CLIPS[clips[0] as string]); // one phone per take
    const video = note.video;
    // a missing decision is shown-no-decision (read apart, above); a fifth key or a missing scope key is bad scope
    const keys = Object.keys(note);
    badScope =
      keys.some((k) => !SHOWN_NOTE_KEYS.includes(k)) ||
      !SHOWN_SCOPE_KEYS.every((k) => Object.prototype.hasOwnProperty.call(note, k)) ||
      note.sha256 !== shaName ||
      typeof video !== "string" ||
      !SHOWN_VIDEOS.includes(video) ||
      !clipsOk;
    if (!noDecision && !badScope) {
      goodNote = { sha256: shaName, video: video as string, clips: clips.map((id) => id as string) };
    }
  }
  return { notAllowed, noDecision, badScope, kinds, note: goodNote };
}

/** Ready = all 15 lines clear/cut/shown under a good note, a real looker, the kinds in order, and the source bytes still hash to the recorded sha. */
function evaluateChecklist(outDir: string, fileName: string): CheckResult {
  const shaName = fileName.slice(0, -".checklist.json".length);
  let c: ParsedChecklist | null = null;
  try {
    c = parseChecklistShape(fs.readFileSync(path.join(outDir, fileName), "utf8"));
  } catch {
    c = null;
  }
  if (!c) return { sha256: shaName, ready: false, reasons: ["checklist-unreadable"], cut_tasks: [] };

  const kindsOk = c.lines.length === CHECKLIST_KINDS.length && c.lines.every((l, i) => l.kind === CHECKLIST_KINDS[i]);
  const answers = c.lines.map((l) => l.answer);
  const openLines = answers.includes("not checked");
  const presentLines = answers.includes("present");
  const badAnswer = answers.some(
    (a) => a !== "clear" && a !== "cut" && a !== "present" && a !== "shown" && a !== "not checked",
  );
  const shown = kindsOk ? shownVerdict(c, shaName) : null;
  const noLooker = c.looked_by.trim() === "";
  const shaMismatch = c.sha256 !== shaName;

  let intakeMissing = false;
  let sourceMissing = false;
  let sourceChanged = false;
  let sourcePath: string | null = null;
  try {
    const intake = JSON.parse(fs.readFileSync(path.join(outDir, `${shaName}.intake.json`), "utf8")) as {
      source_path?: unknown;
    };
    if (typeof intake.source_path === "string") sourcePath = intake.source_path;
    else intakeMissing = true;
  } catch {
    intakeMissing = true;
  }
  if (sourcePath !== null) {
    if (!fs.existsSync(sourcePath)) sourceMissing = true;
    else {
      let sha: string | null = null;
      try {
        sha = sha256Streamed(sourcePath);
      } catch {
        sha = null;
      }
      if (sha !== shaName) sourceChanged = true;
    }
  }

  const reasons: CheckReason[] = [];
  if (kindsOk && openLines) reasons.push("open-lines");
  if (kindsOk && presentLines) reasons.push("present-lines");
  if (!openLines && noLooker) reasons.push("no-looker"); // who looked matters once the lines are answered
  if (kindsOk && badAnswer) reasons.push("bad-answer");
  if (shown?.notAllowed) reasons.push("shown-not-allowed");
  if (shown?.noDecision) reasons.push("shown-no-decision");
  if (shown?.badScope) reasons.push("shown-bad-scope");
  if (!kindsOk) reasons.push("kinds-changed");
  if (sourceChanged) reasons.push("source-changed");
  if (sourceMissing) reasons.push("source-missing");
  if (intakeMissing) reasons.push("intake-missing");
  if (shaMismatch) reasons.push("sha-mismatch");

  // a shown line is a cut task too: the item is still to be hidden in the other videos cut from this take
  const cut_tasks = c.lines
    .filter((l) => l.answer === "cut" || l.answer === "shown")
    .map((l) => ({ sha256: shaName, kind: l.kind }));
  const ready = reasons.length === 0;
  // the decision text is not copied: it stays in the check list file, outside the repo
  const shownLine = ready && shown?.note && shown.kinds.length > 0 ? { ...shown.note, kinds: shown.kinds } : undefined;
  const result: CheckResult = { sha256: shaName, ready, reasons, cut_tasks };
  if (shownLine) result.shown = shownLine;
  return result;
}

// ── the CLI ──────────────────────────────────────────────────────────────────────────────

function writeLine(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function stderrLine(code: string, detail: string): void {
  process.stderr.write(`clip-intake: ${code}: ${detail}\n`);
}

function printUsage(): void {
  process.stderr.write(
    "usage: clipIntake intake --out <folder> <clip-or-folder> [<clip-or-folder> ...]\n" +
      "       clipIntake check --out <folder>\n" +
      "The --out folder must already exist; intake refuses an --out folder or an input clip\n" +
      "inside a repo (a .git entry or a content-pipeline package.json above it).\n" +
      "A check list is answered by editing the file outside every repo: each of the 15 lines is\n" +
      '"clear" (not on screen), "cut" (on frames, removed by the cut), "present" (retake or drop) or\n' +
      '"shown" (on frames, left readable in the level three video by a recorded decision),\n' +
      "and looked_by names who looked.\n" +
      '"shown" is taken on the lines whose shot list rule is blur, and only under a top-level\n' +
      '"shown" note with four keys: sha256 (the take\'s), video (getspace-level3), clips (its story 1\n' +
      "clip ids of one phone) and decision (a text with a YYYY-MM-DD date and a word beside it;\n" +
      "write in it who decided and where that is recorded). The cut does not read the note.\n" +
      "Honest limit: the tool proves that a person answered every line, not that the answers are true.\n",
  );
}

interface ParsedArgs {
  out?: string;
  paths: string[];
  usageError: boolean;
}

function parseArgs(rest: string[]): ParsedArgs {
  let out: string | undefined;
  const paths: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--out") {
      if (i + 1 >= rest.length) return { paths, usageError: true };
      out = rest[++i];
    } else {
      paths.push(a); // a clip path is taken as it is, even when it starts with a dash
    }
  }
  if (!out) return { paths, usageError: true };
  return { out, paths, usageError: false };
}

function resolveExistingDir(p: string): string | null {
  try {
    if (!fs.statSync(p).isDirectory()) return null;
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

function runIntake(realOut: string, inputPaths: string[], tool: ProbeTool): number {
  const collected = collectEntries(inputPaths);
  const outcomes: Outcome[] = collected.unreadableFolders.map((e) => ({
    entry: e,
    result: "refused" as const,
    reason: "unreadable" as RefusalCode,
    sha: null,
  }));
  for (const e of collected.entries) outcomes.push(evaluateEntry(e, tool));

  // duplicate-sha256 is decided across the whole run: same bytes twice → ALL copies refused;
  // a sha already recorded in --out under another source_path → refused too.
  const groups = new Map<string, number[]>();
  outcomes.forEach((o, i) => {
    if (o.result === "taken") {
      const g = groups.get(o.facts.sha) ?? [];
      g.push(i);
      groups.set(o.facts.sha, g);
    }
  });
  for (const [sha, idxs] of groups) {
    if (idxs.length > 1) {
      for (const i of idxs) {
        const o = outcomes[i];
        if (o.result === "taken") outcomes[i] = { entry: o.entry, result: "refused", reason: "duplicate-sha256", sha };
      }
      continue;
    }
    const o = outcomes[idxs[0]];
    if (o.result !== "taken") continue;
    const existing = path.join(realOut, `${sha}.intake.json`);
    if (fs.existsSync(existing)) {
      let recordedPath: string | null = null;
      try {
        const parsed = JSON.parse(fs.readFileSync(existing, "utf8")) as { source_path?: unknown };
        if (typeof parsed.source_path === "string") recordedPath = parsed.source_path;
      } catch {
        recordedPath = null;
      }
      if (recordedPath !== o.facts.realPath) {
        outcomes[idxs[0]] = { entry: o.entry, result: "refused", reason: "duplicate-sha256", sha };
      }
    }
  }

  // Writes: never overwrite an existing file, so a second run leaves both files byte-equal
  // (an answered check list keeps its answers).
  for (const o of outcomes) {
    if (o.result !== "taken") continue;
    const intakeName = `${o.facts.sha}.intake.json`;
    if (!fs.existsSync(path.join(realOut, intakeName))) {
      atomicWriteJson(realOut, intakeName, buildIntakeJson(o.facts, tool));
    }
    const checklistName = `${o.facts.sha}.checklist.json`;
    if (!fs.existsSync(path.join(realOut, checklistName))) {
      atomicWriteJson(realOut, checklistName, buildChecklist(o.facts.sha, o.facts.name));
    }
  }

  const sorted = [...outcomes].sort((a, b) => byteCompare(a.entry.file, b.entry.file)); // stable: equal names keep argument order
  const counts = { taken: 0, refused: 0, skipped: 0 };
  for (const o of sorted) {
    if (o.result === "taken") counts.taken++;
    else if (o.result === "refused") counts.refused++;
    else counts.skipped++;
    writeLine({
      file: o.entry.file, // the base name only — no stdout line holds a folder path
      result: o.result,
      reason: o.result === "refused" ? o.reason : null,
      sha256: o.result === "skipped-hidden" ? null : o.result === "taken" ? o.facts.sha : o.sha,
      flags: o.result === "taken" ? o.facts.flags : [],
    });
  }
  writeLine({
    summary: {
      taken: counts.taken,
      refused: counts.refused,
      skipped: counts.skipped,
      reason: counts.taken === 0 ? "no-clips" : null,
    },
  });
  return counts.refused > 0 || counts.taken === 0 ? 1 : 0;
}

function runCheck(realOut: string): number {
  let names: string[] = [];
  try {
    names = fs.readdirSync(realOut);
  } catch {
    names = [];
  }
  const results: CheckResult[] = [];
  for (const n of names) {
    if (n.endsWith(".checklist.json")) results.push(evaluateChecklist(realOut, n));
  }
  // an intake file with no check list next to it (a run stopped between the two writes):
  // the clip is not ready and check says so instead of passing over it in silence
  for (const n of names) {
    if (!n.endsWith(".intake.json")) continue;
    const sha = n.slice(0, -".intake.json".length);
    if (names.includes(`${sha}.checklist.json`)) continue;
    results.push({ sha256: sha, ready: false, reasons: ["checklist-missing"], cut_tasks: [] });
  }
  results.sort((a, b) => byteCompare(a.sha256, b.sha256));
  let ready = 0;
  let notReady = 0;
  for (const r of results) {
    if (r.ready) ready++;
    else notReady++;
    const line: Record<string, unknown> = { sha256: r.sha256, ready: r.ready, reasons: r.reasons, cut_tasks: r.cut_tasks };
    if (r.shown) line.shown = r.shown; // only a ready take that holds a shown line has the fifth key
    writeLine(line);
  }
  writeLine({
    summary: { ready, not_ready: notReady, reason: results.length === 0 ? "no-checklists" : null },
  });
  return results.length === 0 || notReady > 0 ? 1 : 0;
}

/** The clip-intake CLI. Returns the process exit code: 0 ok, 1 per-entry refusal / not ready, 2 run-level refusal. */
export function runCli(argv: string[], opts: ClipIntakeOpts = {}): number {
  const verb = argv[0];
  if (verb !== "intake" && verb !== "check") {
    printUsage();
    return 2;
  }
  const parsed = parseArgs(argv.slice(1));
  if (parsed.usageError || (verb === "check" && parsed.paths.length > 0)) {
    printUsage(); // check takes no input path; a stray argument is a usage error
    return 2;
  }
  const realOut = resolveExistingDir(parsed.out as string);
  if (!realOut) {
    stderrLine("out-missing", "the --out folder must already exist (the tool does not create it)");
    return 2;
  }
  if (verb === "check") return runCheck(realOut);
  if (pathInsideRepo(realOut)) {
    stderrLine("out-inside-repo", "the --out folder must sit outside every repo");
    return 2;
  }
  let tool: ProbeTool;
  try {
    tool = resolveProbeTool(opts.probeBin);
  } catch (err) {
    stderrLine("ffprobe-missing", err instanceof Error ? err.message : String(err));
    return 2;
  }
  return runIntake(realOut, parsed.paths, tool);
}
