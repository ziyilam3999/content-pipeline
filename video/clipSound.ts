/**
 * Row A57 — the sound lay: voice lines and one ducked music bed on a finished silent cut.
 *
 * The spec (schema clip-sound/1) names the silent picture, the voice lines with their start
 * times and one bed. apply measures each file with the system ffmpeg (an argument array, no
 * shell), builds the voice track, ducks the bed under it, copies the picture stream and writes
 * the film, the two tracks and a sound record. Spec text reaches the ffmpeg graph only as
 * checked numbers and generated labels; a file reaches ffmpeg as an absolute path.
 */

import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import { hasSystemFfmpeg, resolveSystemFfmpeg } from "./contactSheet";

export const SPEC_SCHEMA = "clip-sound/1";
export const RECORD_SCHEMA = "clip-sound-record/1";

// ── the numbers of the mix the operator passed on 2026-11-26 ─────────────────────────────

export const SAMPLE_RATE = 48000;
export const AAC_KBPS = 192;
export const LINE_LIMIT = 0.84;
export const LINE_ATTACK_MS = 2;
export const LINE_RELEASE_MS = 40;
export const DUCK_THRESHOLD = 0.03;
export const DUCK_RATIO = 4;
export const DUCK_ATTACK_MS = 20;
export const DUCK_RELEASE_MS = 500;
export const SUM_LIMIT = 0.84;
/** The passed script set no attack and no release on the sum; these are the ffmpeg 8.1.1 defaults. */
export const SUM_ATTACK_MS = 5;
export const SUM_RELEASE_MS = 50;
export const SILENCE_DB = -60;
export const SILENCE_MIN_SEC = 0.1;

// ── limits of the checks ─────────────────────────────────────────────────────────────────

export const MIN_WORDS_SEC = 1;
/** The floor of the loudness meter: a reading at it or below it counts as silent. */
export const MIN_LUFS = -70;
export const BED_SHORT_SEC = 0.05;
export const MAX_LINES = 40;
/** The longest bed fade of one side, in seconds; the step is that of `at`. */
export const MAX_FADE_SEC = 10;

// ── spec types (valid after validateSpec returns []) ─────────────────────────────────────

export interface FileRef {
  file: string;
  sha256: string;
}
export interface Window {
  from: number;
  to: number;
}
export interface Line extends FileRef {
  id: string;
  at: number;
  window?: Window;
}
export interface ClipSoundSpec {
  schema: string;
  slug: string;
  picture: FileRef;
  voice: { target_lufs: number; lines: Line[] };
  bed: FileRef & {
    level_lufs: number;
    /** A straight-line rise of the bed from its first sample, over this many seconds. */
    fade_in_sec?: number;
    /** A straight-line fall of the bed that ends with its last laid sample. */
    fade_out_sec?: number;
  };
}

// ── validator ────────────────────────────────────────────────────────────────────────────

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SHA_RE = /^[0-9a-f]{64}$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const isFileName = (v: unknown): boolean =>
  typeof v === "string" && v.length >= 1 && v.length <= 200 && !/[/\\]/.test(v) && !v.includes("..") && !/^[.-]/.test(v);

/** A short JSON view of a spec value for a refusal line (escaped, cut at 40 chars). */
function show(v: unknown): string {
  const s = JSON.stringify(v) ?? String(v);
  return s.length > 40 ? `${s.slice(0, 40)}...` : s;
}

/** Returns reason lines "<code>: <detail>"; [] means the spec is valid. Reads no file. */
export function validateSpec(spec: unknown): string[] {
  const out: string[] = [];
  const add = (code: string, detail: string): void => {
    out.push(`${code}: ${detail}`);
  };
  const keys = (o: Record<string, unknown>, allowed: string[], where: string): void => {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) add("unknown-key", `${where} has key ${show(k)}`);
  };
  const section = (v: unknown, allowed: string[], where: string): Record<string, unknown> | undefined => {
    if (!isObj(v)) {
      add("bad-schema", `${where} must be an object`);
      return undefined;
    }
    keys(v, allowed, where);
    return v;
  };
  const fileRef = (o: Record<string, unknown>, where: string): void => {
    if (!isFileName(o.file)) add("bad-file", `${where}.file is ${show(o.file)}`);
    if (typeof o.sha256 !== "string" || !SHA_RE.test(o.sha256)) add("bad-sha", `${where}.sha256 is ${show(o.sha256)}`);
  };
  const level = (v: unknown, min: number, max: number, where: string): void => {
    if (!isNum(v) || v < min || v > max) add("bad-level", `${where} is ${show(v)}, not a number from ${min} to ${max}`);
  };
  // A key that is not there means no fade; a key that is there is read as it stands
  const fade = (v: unknown, where: string): void => {
    if (v === undefined) return;
    if (!isNum(v) || v <= 0 || v > MAX_FADE_SEC || Number(v.toFixed(3)) !== v) {
      add("bad-fade", `${where} is ${show(v)}, not a number above 0 and up to ${MAX_FADE_SEC} with at most 3 decimals`);
    }
  };

  if (!isObj(spec)) {
    add("bad-schema", "the spec is not a JSON object");
    return out;
  }
  keys(spec, ["schema", "slug", "picture", "voice", "bed"], "spec");
  if (spec.schema !== SPEC_SCHEMA) add("bad-schema", `schema must be ${SPEC_SCHEMA}`);
  if (typeof spec.slug !== "string" || !NAME_RE.test(spec.slug)) add("bad-slug", `slug is ${show(spec.slug)}`);

  const picture = section(spec.picture, ["file", "sha256"], "picture");
  if (picture) fileRef(picture, "picture");

  const bed = section(spec.bed, ["file", "sha256", "level_lufs", "fade_in_sec", "fade_out_sec"], "bed");
  if (bed) {
    fileRef(bed, "bed");
    level(bed.level_lufs, -40, -18, "bed.level_lufs");
    fade(bed.fade_in_sec, "bed.fade_in_sec");
    fade(bed.fade_out_sec, "bed.fade_out_sec");
  }

  const voice = section(spec.voice, ["target_lufs", "lines"], "voice");
  if (!voice) return out;
  level(voice.target_lufs, -24, -12, "voice.target_lufs");
  if (!Array.isArray(voice.lines)) {
    add("bad-schema", "voice.lines must be a list");
    return out;
  }
  if (voice.lines.length === 0) add("no-lines", "voice.lines is empty");
  if (voice.lines.length > MAX_LINES) add("too-many-lines", `voice.lines holds ${voice.lines.length}, the limit is ${MAX_LINES}`);
  const ids = new Set<string>();
  let lastAt: number | undefined;
  voice.lines.forEach((v: unknown, i: number) => {
    const where = `voice.lines[${i}]`;
    const l = section(v, ["id", "file", "sha256", "at", "window"], where);
    if (!l) return;
    if (typeof l.id !== "string" || !NAME_RE.test(l.id)) add("bad-id", `${where}.id is ${show(l.id)}`);
    else if (ids.has(l.id)) add("id-twice", `line id ${l.id} is used twice`);
    else ids.add(l.id);
    fileRef(l, where);
    let at: number | undefined;
    if (!isNum(l.at) || l.at < 0 || Number(l.at.toFixed(3)) !== l.at) {
      add("bad-time", `${where}.at is ${show(l.at)}, not a number of 0 or more with at most 3 decimals`);
    } else {
      at = l.at;
      if (lastAt !== undefined && at <= lastAt) add("line-order", `${where}.at ${at} is not after ${lastAt}`);
      lastAt = at;
    }
    if (l.window === undefined) return;
    if (!isObj(l.window)) {
      add("bad-window", `${where}.window must be an object`);
      return;
    }
    keys(l.window, ["from", "to"], `${where}.window`);
    const { from, to } = l.window;
    if (!isNum(from) || !isNum(to) || from < 0 || to <= from || (at !== undefined && (at < from || at >= to))) {
      add("bad-window", `${where}.window needs 0 <= from <= at < to (got ${show(from)}, ${show(to)})`);
    }
  });
  return out;
}

// ── the graph ────────────────────────────────────────────────────────────────────────────

/** A number as plain decimal text for a filter option (no exponent form). */
function fmt(n: number): string {
  return String(Number(n.toFixed(6)));
}

/** The first steps of a sound input: float samples, 48 kHz, one layout, time from 0. */
const shape = (layout: "mono" | "stereo"): string =>
  `aformat=sample_fmts=fltp,aresample=${SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=${layout},asetpts=N/SR/TB`;

const limiter = (limit: number, attack: number, release: number): string =>
  `alimiter=limit=${limit}:attack=${attack}:release=${release}:level=false`;

/** One voice line at its level: mono, the plain gain, the line limiter. */
const lineChain = (gainDb: number): string =>
  `${shape("mono")},volume=${fmt(gainDb)}dB,${limiter(LINE_LIMIT, LINE_ATTACK_MS, LINE_RELEASE_MS)}`;

/** The end of the words is read on the line after its gain and limiter. */
const lineProbeChain = (gainDb: number): string =>
  `${lineChain(gainDb)},silencedetect=noise=${SILENCE_DB}dB:d=${SILENCE_MIN_SEC}`;

export interface GraphNumbers {
  lineGainsDb: number[];
  /** Length of each line up to the end of its words, in samples. */
  wordSamples: number[];
  bedGainDb: number;
  /** Length of the whole bed file, in samples. */
  bedSamples: number;
  pictureSamples: number;
}

export interface GraphPaths {
  picture: string;
  lines: string[];
  bed: string;
  voiceOut: string;
  bedOut: string;
  filmOut: string;
}

export interface SoundGraph {
  /** Per line, the chain that is run to find the end of its words. */
  lineProbes: string[];
  /** The -filter_complex text of the mix run. */
  mix: string;
  /** The line probes and the mix graph as one text. */
  text: string;
  /** The ffmpeg arguments of the mix run. */
  args: string[];
}

/** Seconds as a whole count of samples at 48 kHz. */
const toSamples = (sec: number): number => Math.round(sec * SAMPLE_RATE);

/** The graph text and the argument list for a checked spec. Runs nothing. */
export function buildSoundGraph(spec: ClipSoundSpec, nums: GraphNumbers, paths: GraphPaths): SoundGraph {
  const lines = spec.voice.lines;
  const N = nums.pictureSamples;
  const bedInput = lines.length + 1; // input 0 is the picture, then the lines, then the bed
  const chains: string[] = lines.map((l, i) => {
    const delay = Math.round(l.at * SAMPLE_RATE);
    return `[${i + 1}:a:0]${lineChain(nums.lineGainsDb[i])},atrim=end_sample=${nums.wordSamples[i]},adelay=delays=${delay}S:all=1[l${i}]`;
  });
  chains.push(
    `${lines.map((_, i) => `[l${i}]`).join("")}amix=inputs=${lines.length}:duration=longest:normalize=0,` +
      `apad=whole_len=${N},atrim=end_sample=${N},asplit=2[voiceout][voicemono]`,
  );
  chains.push("[voicemono]aformat=channel_layouts=stereo,asplit=2[keyshort][voicest]");
  // The key runs on past the bed, so the cut of the bed alone sets the length of the ducked bed
  chains.push(`[keyshort]apad=pad_len=${nums.bedSamples}[key]`);
  // The fades lie on the bed behind its resample, its gain and its cut, and before the duck
  const fades: string[] = [];
  if (spec.bed.fade_in_sec !== undefined) fades.push(`afade=t=in:ss=0:ns=${toSamples(spec.bed.fade_in_sec)}:curve=tri`);
  if (spec.bed.fade_out_sec !== undefined) {
    const n = toSamples(spec.bed.fade_out_sec);
    fades.push(`afade=t=out:ss=${Math.min(N, nums.bedSamples) - n}:ns=${n}:curve=tri`);
  }
  chains.push(`[${bedInput}:a:0]${shape("stereo")},volume=${fmt(nums.bedGainDb)}dB,atrim=end_sample=${N}${fades.map((f) => `,${f}`).join("")}[bed]`);
  chains.push(
    `[bed][key]sidechaincompress=threshold=${DUCK_THRESHOLD}:ratio=${DUCK_RATIO}:attack=${DUCK_ATTACK_MS}:release=${DUCK_RELEASE_MS},` +
      "asplit=2[bedout][bedsum]",
  );
  chains.push(
    `[voicest][bedsum]amix=inputs=2:duration=longest:normalize=0,${limiter(SUM_LIMIT, SUM_ATTACK_MS, SUM_RELEASE_MS)}[mix]`,
  );
  const mix = chains.join(";");
  const lineProbes = nums.lineGainsDb.map((g) => lineProbeChain(g));

  const args = ["-y", "-nostdin", "-hide_banner", "-loglevel", "error"];
  for (const input of [paths.picture, ...paths.lines, paths.bed]) args.push("-i", input);
  args.push("-filter_complex", mix);
  // The two tracks come before the film
  args.push("-map", "[voiceout]", "-map_metadata", "-1", "-c:a", "pcm_s16le", paths.voiceOut);
  args.push("-map", "[bedout]", "-map_metadata", "-1", "-c:a", "pcm_s16le", paths.bedOut);
  args.push(
    "-map",
    "0:v:0",
    "-map",
    "[mix]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    `${AAC_KBPS}k`,
    "-ar",
    String(SAMPLE_RATE),
    "-ac",
    "2",
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-movflags",
    "+faststart",
    paths.filmOut,
  );
  return { lineProbes, mix, text: [...lineProbes, mix].join("\n"), args };
}

// ── running ffmpeg ───────────────────────────────────────────────────────────────────────

export interface CliResult {
  code: number;
  out: string;
  err: string;
}

class Refusal extends Error {
  constructor(
    public readonly code: string,
    detail: string,
    public readonly extra: string[] = [],
  ) {
    super(`${code}: ${detail}`);
  }
}

interface Tools {
  ffmpeg: string;
  ffprobe: string;
}

function run(bin: string, args: string[]): { stdout: string; stderr: string } {
  const res = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env } });
  if (res.error && (res.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new Refusal("ffmpeg-missing", `no system ${path.basename(bin)}`);
  }
  if (res.status !== 0) {
    const tail = (res.stderr ?? "").slice(-300).replace(/\s+/g, " ");
    throw new Refusal("ffmpeg-failed", `${path.basename(bin)} exited ${res.status}: ${tail}`);
  }
  return { stdout: res.stdout, stderr: res.stderr };
}

function resolveTools(): Tools {
  if (!hasSystemFfmpeg()) throw new Refusal("ffmpeg-missing", "no system ffmpeg");
  const ffmpeg = resolveSystemFfmpeg();
  const name = process.platform === "win32" ? "ffprobe.exe" : "ffprobe";
  const sibling = path.join(path.dirname(ffmpeg), name);
  return { ffmpeg, ffprobe: fs.existsSync(sibling) ? sibling : name };
}

/** Run one filter chain over the first sound stream of a file; returns the log. */
function readSound(t: Tools, file: string, chain: string): string {
  return run(t.ffmpeg, ["-nostdin", "-hide_banner", "-nostats", "-i", file, "-map", "0:a:0", "-af", chain, "-f", "null", "-"]).stderr;
}

const METER = "ebur128=framelog=verbose";

/** The integrated loudness of the meter summary; NaN when it cannot be read. */
function integrated(log: string): number {
  const at = log.lastIndexOf("Integrated loudness:");
  const m = at < 0 ? null : /\bI:\s*(\S+)\s+LUFS/.exec(log.slice(at));
  return m ? Number(m[1]) : NaN;
}

function truePeak(log: string): number {
  const at = log.lastIndexOf("True peak:");
  const m = at < 0 ? null : /\bPeak:\s*(\S+)\s+dBFS/.exec(log.slice(at));
  return m ? Number(m[1]) : NaN;
}

/** The sample count per channel that astats logs. */
function sampleCount(log: string): number {
  const all = [...log.matchAll(/^\[[^\]\n]*astats[^\]\n]*\] Number of samples: (\d+)/gm)];
  return all.length > 0 ? Number(all[all.length - 1][1]) : NaN;
}

/** The start of the last silence that runs to the file end, else the file end. An ffmpeg that
 *  logs no silence_end at the end of the file leaves that silence open. */
function endOfWords(log: string, sec: number): number {
  let open: number | undefined;
  let tail: number | undefined;
  for (const m of log.matchAll(/^\[[^\]\n]*silencedetect[^\]\n]*\] silence_(start|end): (-?[0-9.eE+-]+)/gm)) {
    const t = Number(m[2]);
    if (m[1] === "start") open = t;
    else {
      if (open !== undefined && t >= sec - 0.005) tail = open;
      open = undefined;
    }
  }
  return Math.min(sec, Math.max(0, open ?? tail ?? sec));
}

interface Stream {
  codec_type?: string;
  duration?: string;
  nb_read_packets?: string;
}

function probeStreams(t: Tools, file: string, extra: string[] = []): { streams: Stream[]; formatSec: number } {
  const res = run(t.ffprobe, [
    "-v",
    "error",
    ...extra,
    "-show_entries",
    "stream=codec_type,duration,nb_read_packets:format=duration",
    "-of",
    "json",
    file,
  ]);
  const doc = JSON.parse(res.stdout) as { streams?: Stream[]; format?: { duration?: string } };
  return { streams: doc.streams ?? [], formatSec: Number(doc.format?.duration) };
}

interface PictureFacts {
  videoStreamSha256: string;
  frames: number;
  sec: number;
}

function readPicture(t: Tools, file: string): PictureFacts {
  const { streams, formatSec } = probeStreams(t, file, ["-count_packets"]);
  const video = streams.find((s) => s.codec_type === "video");
  if (!video) throw new Refusal("picture-no-video", "the picture file has no video stream");
  if (streams.some((s) => s.codec_type === "audio")) throw new Refusal("picture-has-sound", "the picture file holds a sound stream");
  if (streams.length > 1) throw new Refusal("picture-extra-stream", "the picture file holds a stream beside its one video stream");
  const own = Number(video.duration);
  const sec = Number.isFinite(own) && own > 0 ? own : formatSec;
  const frames = Number(video.nb_read_packets);
  const hash = run(t.ffmpeg, ["-nostdin", "-v", "error", "-i", file, "-map", "0:v:0", "-c", "copy", "-f", "streamhash", "-hash", "sha256", "-"]);
  const m = /SHA256=([0-9a-f]{64})/.exec(hash.stdout);
  if (!m || !(sec > 0) || !(frames > 0)) throw new Refusal("ffmpeg-failed", "the picture stream cannot be read");
  return { videoStreamSha256: m[1], frames, sec: round6(sec) };
}

function needSound(t: Tools, file: string, code: string, what: string): void {
  if (!probeStreams(t, file).streams.some((s) => s.codec_type === "audio")) throw new Refusal(code, `${what} has no sound stream`);
}

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
const round2 = (n: number): number => Math.round(n * 100) / 100;

interface LineFacts {
  sec: number;
  wordsEnd: number;
  inLufs: number;
  gainDb: number;
  outLufs: number;
}

function readLine(t: Tools, file: string, id: string, target: number): LineFacts {
  needSound(t, file, "line-no-sound", `line ${id}`);
  const raw = readSound(t, file, `${shape("mono")},astats,${METER}`);
  const sec = round6(sampleCount(raw) / SAMPLE_RATE);
  const tooShort = (n: number): Refusal => new Refusal("line-too-short", `the words of line ${id} are ${n} s, below ${MIN_WORDS_SEC} s`);
  if (sec < MIN_WORDS_SEC) throw tooShort(sec);
  const inLufs = integrated(raw);
  if (!(inLufs > MIN_LUFS)) throw new Refusal("line-silent", `line ${id} is silent or its loudness cannot be read`);
  const gainDb = round2(target - inLufs);
  const log = readSound(t, file, `${lineProbeChain(gainDb)},${METER}`);
  const wordsEnd = round6(endOfWords(log, sec));
  if (wordsEnd < MIN_WORDS_SEC) throw tooShort(wordsEnd);
  const outLufs = integrated(log);
  if (!Number.isFinite(sec) || !Number.isFinite(outLufs)) throw new Refusal("ffmpeg-failed", `line ${id} cannot be measured`);
  return { sec, wordsEnd, inLufs, gainDb, outLufs };
}

interface BedFacts {
  samples: number;
  sec: number;
  inLufs: number;
  gainDb: number;
}

function readBed(t: Tools, file: string, levelLufs: number, pictureSec: number): BedFacts {
  needSound(t, file, "bed-no-sound", "the bed");
  const log = readSound(t, file, `${shape("stereo")},astats,${METER}`);
  const samples = sampleCount(log);
  if (!Number.isFinite(samples)) throw new Refusal("ffmpeg-failed", "the length of the bed cannot be read");
  const sec = round6(samples / SAMPLE_RATE);
  if (sec < pictureSec - BED_SHORT_SEC) throw new Refusal("bed-too-short", `the bed ends at ${sec} s, the picture at ${pictureSec} s`);
  const inLufs = integrated(log);
  if (!(inLufs > MIN_LUFS)) throw new Refusal("line-silent", "the bed is silent or its loudness cannot be read");
  return { samples, sec, inLufs, gainDb: round2(levelLufs - inLufs) };
}

// ── files ────────────────────────────────────────────────────────────────────────────────

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

/** Is this real path inside a git work tree (a .git entry here or above)? A copy of the clip:edit rule. */
function insideGitWorkTree(start: string): boolean {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) return true;
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

function lstatOrNull(p: string): fs.Stats | null {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

/** Remove a plain file only (a folder planted at the name stays). */
function removeFile(p: string): void {
  if (lstatOrNull(p)?.isFile()) fs.unlinkSync(p);
}

function realFolder(p: string, flag: string): string {
  try {
    if (!fs.statSync(p).isDirectory()) throw new Error("not a folder");
    return fs.realpathSync.native(p);
  } catch {
    throw new Refusal("out-missing", `the ${flag} folder must already exist`);
  }
}

/** The names apply writes in --out, in the order of the renames: the record is the last one. */
function outputNames(slug: string): { final: string; tmp: string }[] {
  return [
    ["voice", "wav"],
    ["bed", "wav"],
    ["sound", "mp4"],
    ["sound", "json"],
  ].map(([part, ext]) => ({ final: `${slug}.${part}.${ext}`, tmp: `${slug}.${part}.tmp.${ext}` }));
}

// ── apply ────────────────────────────────────────────────────────────────────────────────

export interface ApplyOpts {
  spec: string;
  media: string;
  out: string;
  dry?: boolean;
}

/** Returns the stdout lines. A Refusal leaves no file of the run in --out. */
export function applySound(opts: ApplyOpts): string[] {
  let raw: Buffer;
  let parsed: unknown;
  try {
    raw = fs.readFileSync(opts.spec);
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Refusal("spec-invalid", "the spec file cannot be read as JSON", ["bad-schema: the spec file is not readable JSON"]);
  }
  const problems = validateSpec(parsed);
  if (problems.length > 0) throw new Refusal("spec-invalid", `${problems.length} problem(s)`, problems);
  const spec = parsed as ClipSoundSpec;

  const realMedia = realFolder(opts.media, "--media");
  const realOut = realFolder(opts.out, "--out");
  // resolve drops a trailing separator, with which lstat would follow the link
  if (fs.lstatSync(path.resolve(opts.out)).isSymbolicLink()) throw new Refusal("out-symlink", "--out is a symlink");
  const names = outputNames(spec.slug);
  for (const name of names.flatMap((n) => [n.tmp, n.final])) {
    if (lstatOrNull(path.join(realOut, name))?.isSymbolicLink()) throw new Refusal("out-symlink", `${name} in --out is a symlink`);
  }
  if (realMedia === realOut) throw new Refusal("same-folder", "--media and --out are one folder");
  if (insideGitWorkTree(realMedia)) throw new Refusal("inside-repo", "--media is inside a git work tree");
  if (insideGitWorkTree(realOut)) throw new Refusal("inside-repo", "--out is inside a git work tree");

  const source = (ref: FileRef, what: string): string => {
    const file = path.join(realMedia, ref.file);
    if (!lstatOrNull(file)?.isFile()) throw new Refusal("source-missing", `${what} is not a regular file in --media`);
    if (sha256Streamed(file) !== ref.sha256) throw new Refusal("source-changed", `${what} differs from the spec sha256`);
    return file;
  };
  const picturePath = source(spec.picture, "the picture");
  const linePaths = spec.voice.lines.map((l) => source(l, `line ${l.id}`));
  const bedPath = source(spec.bed, "the bed");

  const tools = resolveTools();
  const picture = readPicture(tools, picturePath);
  for (const l of spec.voice.lines) {
    if (l.window && l.window.to > picture.sec + 1e-6) {
      throw new Refusal("window-past-end", `the window of line ${l.id} ends at ${l.window.to} s, the picture at ${picture.sec} s`);
    }
  }
  const lines = spec.voice.lines.map((l, i) => readLine(tools, linePaths[i], l.id, spec.voice.target_lufs));
  spec.voice.lines.forEach((l, i) => {
    const end = round6(l.at + lines[i].wordsEnd);
    if (end > picture.sec + 1e-6) {
      throw new Refusal("line-past-end", `the words of line ${l.id} end at ${end} s, the picture at ${picture.sec} s`);
    }
    const next = spec.voice.lines[i + 1];
    if (next && end > next.at + 1e-6) {
      throw new Refusal("line-overlap", `the words of line ${l.id} end at ${end} s, line ${next.id} starts at ${next.at} s`);
    }
  });
  const bed = readBed(tools, bedPath, spec.bed.level_lufs, picture.sec);

  // The fades share the laid bed; the picture's length, or the bed's own when it is shorter
  const fadeIn = spec.bed.fade_in_sec === undefined ? 0 : toSamples(spec.bed.fade_in_sec);
  const fadeOut = spec.bed.fade_out_sec === undefined ? 0 : toSamples(spec.bed.fade_out_sec);
  const laidSamples = Math.min(bed.samples, toSamples(picture.sec));
  if (fadeIn + fadeOut > laidSamples) {
    throw new Refusal("fade-too-long", `the two fades take ${fadeIn + fadeOut} samples, the laid bed has ${laidSamples}`);
  }

  if (opts.dry) {
    return [
      "clip-sound: dry-run (nothing written)",
      ...spec.voice.lines.map(
        (l, i) =>
          `clip-sound: line id=${l.id} at=${l.at} sec=${lines[i].sec} words-end=${lines[i].wordsEnd} in-lufs=${lines[i].inLufs} gain-db=${lines[i].gainDb}`,
      ),
      `clip-sound: bed sec=${bed.sec} in-lufs=${bed.inLufs} gain-db=${bed.gainDb}`,
    ];
  }

  const version = run(tools.ffmpeg, ["-version"]).stdout.split(/\r?\n/)[0];
  const tmp = names.map((n) => path.join(realOut, n.tmp));
  const [voiceTmp, bedTmp, filmTmp, recordTmp] = tmp;
  const [voiceName, bedName, filmName] = names.map((n) => n.final);
  const graph = buildSoundGraph(
    spec,
    {
      lineGainsDb: lines.map((l) => l.gainDb),
      wordSamples: lines.map((l) => Math.round(l.wordsEnd * SAMPLE_RATE)),
      bedGainDb: bed.gainDb,
      bedSamples: bed.samples,
      pictureSamples: Math.round(picture.sec * SAMPLE_RATE),
    },
    { picture: picturePath, lines: linePaths, bed: bedPath, voiceOut: voiceTmp, bedOut: bedTmp, filmOut: filmTmp },
  );

  let measured: { voice_lufs: number; mix_lufs: number; mix_peak_db: number };
  try {
    for (const p of tmp) removeFile(p); // a leftover of an earlier run is not written into
    run(tools.ffmpeg, graph.args);
    const voiceLog = readSound(tools, voiceTmp, METER);
    const mixLog = readSound(tools, filmTmp, `${METER}:peak=true`);
    measured = { voice_lufs: integrated(voiceLog), mix_lufs: integrated(mixLog), mix_peak_db: truePeak(mixLog) };
    if (!Object.values(measured).every((v) => Number.isFinite(v))) throw new Refusal("ffmpeg-failed", "the outputs cannot be measured");
    const output = (file: string, written: string) => ({ file, sha256: sha256Streamed(written) });
    const record = {
      schema: RECORD_SCHEMA,
      spec_sha256: crypto.createHash("sha256").update(raw).digest("hex"),
      slug: spec.slug,
      picture: {
        file: spec.picture.file,
        sha256: spec.picture.sha256,
        video_stream_sha256: picture.videoStreamSha256,
        frames: picture.frames,
        sec: picture.sec,
      },
      lines: spec.voice.lines.map((l, i) => ({
        id: l.id,
        file: l.file,
        sha256: l.sha256,
        at: l.at,
        sec: lines[i].sec,
        words_end: lines[i].wordsEnd,
        in_lufs: lines[i].inLufs,
        gain_db: lines[i].gainDb,
        out_lufs: lines[i].outLufs,
        ...(l.window ? { window: { from: l.window.from, to: l.window.to } } : {}),
      })),
      bed: {
        file: spec.bed.file,
        sha256: spec.bed.sha256,
        sec: bed.sec,
        in_lufs: bed.inLufs,
        gain_db: bed.gainDb,
        ...(spec.bed.fade_in_sec === undefined ? {} : { fade_in_sec: spec.bed.fade_in_sec }),
        ...(spec.bed.fade_out_sec === undefined ? {} : { fade_out_sec: spec.bed.fade_out_sec }),
      },
      mix: {
        target_lufs: spec.voice.target_lufs,
        level_lufs: spec.bed.level_lufs,
        line_limit: LINE_LIMIT,
        line_attack_ms: LINE_ATTACK_MS,
        line_release_ms: LINE_RELEASE_MS,
        duck_threshold: DUCK_THRESHOLD,
        duck_ratio: DUCK_RATIO,
        duck_attack_ms: DUCK_ATTACK_MS,
        duck_release_ms: DUCK_RELEASE_MS,
        sum_limit: SUM_LIMIT,
        sum_attack_ms: SUM_ATTACK_MS,
        sum_release_ms: SUM_RELEASE_MS,
        sample_rate: SAMPLE_RATE,
        aac_kbps: AAC_KBPS,
      },
      measured,
      outputs: { film: output(filmName, filmTmp), voice: output(voiceName, voiceTmp), bed: output(bedName, bedTmp) },
      ffmpeg: version,
    };
    fs.writeFileSync(recordTmp, JSON.stringify(record, null, 2) + "\n");
    names.forEach((n, i) => fs.renameSync(tmp[i], path.join(realOut, n.final)));
  } finally {
    for (const p of tmp) removeFile(p); // gone after the renames; a leftover only after a failure
  }
  return [
    `clip-sound: wrote ${spec.slug} sec=${picture.sec} lines=${lines.length} voice-lufs=${measured.voice_lufs} ` +
      `mix-lufs=${measured.mix_lufs} mix-peak-db=${measured.mix_peak_db}`,
  ];
}

const USAGE = [
  "usage: clipSound apply --spec <file> --media <dir> --out <dir> [--dry]",
  "  --spec <file>  the clip-sound/1 spec",
  "  --media <dir>  the folder of the picture, the line files and the bed",
  "  --out <dir>    an existing folder for the four files, not --media; both outside a git work tree",
  "  --dry          the checks and the measurements only; nothing is written into --out",
  "",
].join("\n");

export function runCli(argv: string[]): CliResult {
  const usage: CliResult = { code: 2, out: "", err: USAGE };
  if (argv[0] !== "apply") return usage;
  const vals = new Map<string, string>();
  let dry = false;
  for (let i = 1; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--dry") {
      if (dry) return usage;
      dry = true;
      continue;
    }
    if (!["--spec", "--media", "--out"].includes(k) || vals.has(k) || i + 1 >= argv.length) return usage;
    vals.set(k, argv[++i]);
  }
  const spec = vals.get("--spec");
  const media = vals.get("--media");
  const out = vals.get("--out");
  if (!spec || !media || !out) return usage;
  try {
    const lines = applySound({ spec, media, out, dry });
    return { code: 0, out: lines.map((l) => `${l}\n`).join(""), err: "" };
  } catch (err) {
    if (err instanceof Refusal) {
      return { code: 2, out: "", err: [err.message, ...err.extra].map((l) => `${l}\n`).join("") };
    }
    return { code: 1, out: "", err: `clip-sound: error: ${err instanceof Error ? err.message : String(err)}\n` };
  }
}
