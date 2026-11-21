/**
 * Row A41-clip-cut — cut recorded clips to a silent 9:16 video from an edit spec.
 *
 * The spec (schema clip-edit/1) names, per source clip, the blur boxes and the cuts that hide
 * private data, and per video the beats and the pieces played. validateSpec refuses a bad
 * spec with reason-coded lines; apply builds ONE system ffmpeg graph per video (an argument
 * array, no shell), writes <slug>.mp4, <slug>.edit.json and a contact sheet under review/.
 * Spec text never reaches the graph or a path unchecked: labels are generated, slugs checked.
 */

import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import { resolveProbeTool } from "./clipIntake";
import { generateContactSheet, hasSystemFfmpeg, resolveSystemFfmpeg, type ContactSheetBeat } from "./contactSheet";

export const SPEC_SCHEMA = "clip-edit/1";
export const MANIFEST_SCHEMA = "clip-edit-manifest/1";
export const INTAKE_SCHEMA = "clip-intake/1";

/** The only filter names a graph may hold. */
export const ALLOWED_FILTERS = [
  "setpts",
  "split",
  "crop",
  "gblur",
  "overlay",
  "fps",
  "trim",
  "loop",
  "concat",
  "scale",
  "pad",
  "format",
] as const;

// ── spec types (valid after validateSpec returns []) ─────────────────────────────────────

export interface BlurBox {
  from: number;
  to: number;
  x: number;
  y: number;
  w: number;
  h: number;
  hides: string;
}
export interface Cut {
  from: number;
  to: number;
  hides: string;
  prove_absent?: { from: number; to: number };
}
export interface Source {
  id: string;
  file: string;
  sha256: string;
  width: number;
  height: number;
  blur: BlurBox[];
  cut: Cut[];
}
export type Piece = { src: string; from: number; to: number } | { src: string; still: number; sec: number };
export interface Beat {
  n: number;
  clip: string;
  dur: number;
  pieces: Piece[];
}
export interface VideoSpec {
  slug: string;
  beats: Beat[];
}
export interface OutputSpec {
  width: number;
  height: number;
  fps: number;
  crop_top: number;
  pad_color: string;
}
export interface ClipEditSpec {
  schema: string;
  output: OutputSpec;
  sources: Source[];
  videos: VideoSpec[];
}

// ── validator ────────────────────────────────────────────────────────────────────────────

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(mp4|mov)$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isEvenWhole = (v: number): boolean => Number.isInteger(v) && v % 2 === 0;

/** A short JSON view of a spec value for a refusal line (escaped, cut at 40 chars). */
function show(v: unknown): string {
  let s: string;
  try {
    s = JSON.stringify(v) ?? String(v);
  } catch {
    s = "?";
  }
  return s.length > 40 ? `${s.slice(0, 40)}...` : s;
}

/** Frames of one piece: a stretch has round(to*fps) - round(from*fps), a still round(sec*fps). */
export function pieceFrames(p: Piece, fps: number): number {
  if ("still" in p) return Math.round(p.sec * fps);
  return Math.round(p.to * fps) - Math.round(p.from * fps);
}

/** Height of the picture after the top crop and the scale to the output width (even when scaled). */
export function contentHeight(srcWidth: number, srcHeight: number, o: { width: number; crop_top: number }): number {
  const h = srcHeight - o.crop_top;
  if (srcWidth === o.width) return h;
  return 2 * Math.round((h * o.width) / srcWidth / 2);
}

/** Returns refusal lines, each starting with a reason code; [] means the spec is valid. */
export function validateSpec(spec: unknown): string[] {
  const out: string[] = [];
  const add = (code: string, detail: string): void => {
    out.push(`${code}: ${detail}`);
  };
  const keys = (o: Record<string, unknown>, allowed: string[], where: string): void => {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) add("unknown-key", `${where} has key ${show(k)}`);
  };
  const num = (o: Record<string, unknown>, k: string, where: string): number | undefined => {
    const v = o[k];
    if (isNum(v)) return v;
    add("bad-number", `${where}.${k} is ${show(v)}, not a finite number`);
    return undefined;
  };
  const text = (o: Record<string, unknown>, k: string, where: string): void => {
    if (typeof o[k] !== "string") add("bad-schema", `${where}.${k} must be a string`);
  };
  const range = (from: number | undefined, to: number | undefined, where: string): void => {
    if (from === undefined || to === undefined) return;
    if (from < 0 || to <= from) add("bad-time", `${where} needs 0 <= from < to (got ${from}, ${to})`);
  };

  if (!isObj(spec)) {
    add("bad-schema", "the spec is not a JSON object");
    return out;
  }
  keys(spec, ["schema", "output", "sources", "videos"], "spec");
  if (spec.schema !== SPEC_SCHEMA) add("bad-schema", `schema must be ${SPEC_SCHEMA}`);

  // output
  let W: number | undefined;
  let H: number | undefined;
  let CT: number | undefined;
  let FPS: number | undefined;
  if (!isObj(spec.output)) {
    add("bad-schema", "output must be an object");
  } else {
    const o = spec.output;
    keys(o, ["width", "height", "fps", "crop_top", "pad_color"], "output");
    for (const k of ["width", "height", "crop_top"]) {
      const v = num(o, k, "output");
      if (v === undefined) continue;
      if (!isEvenWhole(v) || v < 0 || (k !== "crop_top" && v < 2)) {
        add("bad-output", `output.${k} must be an even whole number (got ${v})`);
      } else if (k === "width") W = v;
      else if (k === "height") H = v;
      else CT = v;
    }
    const f = num(o, "fps", "output");
    if (f !== undefined) {
      if (!Number.isInteger(f) || f < 1 || f > 60) add("bad-output", `output.fps must be a whole number 1..60 (got ${f})`);
      else FPS = f;
    }
    if (typeof o.pad_color !== "string" || !COLOR_RE.test(o.pad_color)) {
      add("bad-output", `output.pad_color must look like #RRGGBB (got ${show(o.pad_color)})`);
    }
  }

  // sources
  const srcById = new Map<string, Source>();
  const sourceCuts = new Map<string, { from: number; to: number }[]>();
  if (!Array.isArray(spec.sources)) {
    add("bad-schema", "sources must be an array");
  } else {
    spec.sources.forEach((s: unknown, i: number) => {
      const where = `sources[${i}]`;
      if (!isObj(s)) {
        add("bad-schema", `${where} must be an object`);
        return;
      }
      keys(s, ["id", "file", "sha256", "width", "height", "blur", "cut"], where);
      const idOk = typeof s.id === "string" && ID_RE.test(s.id);
      if (!idOk) add("bad-id", `${where}.id is ${show(s.id)}`);
      if (typeof s.file !== "string" || !FILE_RE.test(s.file) || s.file.includes("..")) {
        add("bad-file", `${where}.file is ${show(s.file)}`);
      }
      if (typeof s.sha256 !== "string" || !SHA_RE.test(s.sha256)) add("bad-sha", `${where}.sha256 is ${show(s.sha256)}`);
      const sw = num(s, "width", where);
      const sh = num(s, "height", where);
      for (const [k, v] of [["width", sw], ["height", sh]] as const) {
        if (v !== undefined && (!Number.isInteger(v) || v <= 0)) add("bad-number", `${where}.${k} must be a positive whole number`);
      }
      if (idOk) {
        const id = s.id as string;
        if (srcById.has(id)) add("src-twice", `source id ${id} is used twice`);
        else srcById.set(id, s as unknown as Source);
      }

      if (!Array.isArray(s.blur)) add("bad-schema", `${where}.blur must be an array`);
      else {
        s.blur.forEach((b: unknown, j: number) => {
          const bw = `${where}.blur[${j}]`;
          if (!isObj(b)) {
            add("bad-schema", `${bw} must be an object`);
            return;
          }
          keys(b, ["from", "to", "x", "y", "w", "h", "hides"], bw);
          const from = num(b, "from", bw);
          const to = num(b, "to", bw);
          const x = num(b, "x", bw);
          const y = num(b, "y", bw);
          const w = num(b, "w", bw);
          const h = num(b, "h", bw);
          text(b, "hides", bw);
          range(from, to, bw);
          if (x !== undefined && y !== undefined && w !== undefined && h !== undefined) {
            if (w < 8 || h < 8) add("bad-box", `${bw} is smaller than 8 px (w ${w}, h ${h})`);
            else if (sw !== undefined && sh !== undefined && (x < 0 || y < 0 || x + w > sw || y + h > sh)) {
              add("bad-box", `${bw} is outside the ${sw}x${sh} source frame`);
            }
            if (CT !== undefined && y + h <= CT) add("box-above-crop", `${bw} sits inside the cropped top ${CT} rows`);
          }
        });
      }
      const cuts: { from: number; to: number }[] = [];
      if (!Array.isArray(s.cut)) add("bad-schema", `${where}.cut must be an array`);
      else {
        s.cut.forEach((c: unknown, j: number) => {
          const cw = `${where}.cut[${j}]`;
          if (!isObj(c)) {
            add("bad-schema", `${cw} must be an object`);
            return;
          }
          keys(c, ["from", "to", "hides", "prove_absent"], cw);
          const from = num(c, "from", cw);
          const to = num(c, "to", cw);
          text(c, "hides", cw);
          range(from, to, cw);
          if (from !== undefined && to !== undefined) cuts.push({ from, to });
          if (c.prove_absent !== undefined) {
            const pa = c.prove_absent;
            if (!isObj(pa)) add("bad-schema", `${cw}.prove_absent must be an object`);
            else {
              keys(pa, ["from", "to"], `${cw}.prove_absent`);
              range(num(pa, "from", `${cw}.prove_absent`), num(pa, "to", `${cw}.prove_absent`), `${cw}.prove_absent`);
            }
          }
        });
      }
      if (idOk) sourceCuts.set(s.id as string, cuts);

      if (sw !== undefined && sh !== undefined && W !== undefined && H !== undefined && CT !== undefined) {
        if (sh - CT <= 0) add("bad-output", `output.crop_top leaves no picture of ${where}`);
        else if (contentHeight(sw, sh, { width: W, crop_top: CT }) > H) {
          add("content-too-tall", `${where} is taller than ${H} px after the crop and the scale to ${W}`);
        }
      }
    });
  }

  // videos
  if (!Array.isArray(spec.videos)) {
    add("bad-schema", "videos must be an array");
  } else {
    const slugs = new Set<string>();
    spec.videos.forEach((v: unknown, i: number) => {
      const where = `videos[${i}]`;
      if (!isObj(v)) {
        add("bad-schema", `${where} must be an object`);
        return;
      }
      keys(v, ["slug", "beats"], where);
      if (typeof v.slug !== "string" || !ID_RE.test(v.slug)) add("bad-slug", `${where}.slug is ${show(v.slug)}`);
      else if (slugs.has(v.slug)) add("slug-twice", `slug ${v.slug} is used twice`);
      else slugs.add(v.slug);
      if (!Array.isArray(v.beats)) {
        add("bad-schema", `${where}.beats must be an array`);
        return;
      }
      v.beats.forEach((b: unknown, j: number) => {
        const bw = `${where}.beats[${j}]`;
        if (!isObj(b)) {
          add("bad-schema", `${bw} must be an object`);
          return;
        }
        keys(b, ["n", "clip", "dur", "pieces"], bw);
        const n = num(b, "n", bw);
        if (n !== undefined && n !== j + 1) add("beat-order", `${bw}.n is ${n}, expected ${j + 1}`);
        text(b, "clip", bw);
        const dur = num(b, "dur", bw);
        if (dur !== undefined && dur <= 0) add("bad-time", `${bw}.dur must be above 0`);
        if (!Array.isArray(b.pieces)) {
          add("bad-schema", `${bw}.pieces must be an array`);
          return;
        }
        let frames = 0;
        let framesOk = true;
        b.pieces.forEach((p: unknown, k: number) => {
          const pw = `${bw}.pieces[${k}]`;
          if (!isObj(p)) {
            add("bad-schema", `${pw} must be an object`);
            framesOk = false;
            return;
          }
          const still = "still" in p;
          keys(p, still ? ["src", "still", "sec"] : ["src", "from", "to"], pw);
          const known = typeof p.src === "string" && srcById.has(p.src);
          if (!known) add("unknown-src", `${pw}.src is ${show(p.src)}`);
          const cuts = known ? sourceCuts.get(p.src as string) ?? [] : [];
          let pf: number | undefined;
          if (still) {
            const at = num(p, "still", pw);
            const sec = num(p, "sec", pw);
            if (at !== undefined && at < 0) add("bad-time", `${pw}.still must not be negative`);
            if (sec !== undefined && sec <= 0) add("bad-time", `${pw}.sec must be above 0`);
            if (at !== undefined && cuts.some((c) => at >= c.from && at < c.to)) {
              add("still-in-cut", `${pw} holds a frame inside a cut`);
            }
            if (at !== undefined && sec !== undefined && sec > 0) pf = Math.round(sec * (FPS ?? 1));
          } else {
            const from = num(p, "from", pw);
            const to = num(p, "to", pw);
            range(from, to, pw);
            if (from !== undefined && to !== undefined && cuts.some((c) => from < c.to && to > c.from)) {
              add("piece-in-cut", `${pw} plays a stretch that overlaps a cut`);
            }
            if (from !== undefined && to !== undefined && to > from) {
              pf = FPS === undefined ? 1 : Math.round(to * FPS) - Math.round(from * FPS);
            }
          }
          if (pf === undefined) framesOk = false;
          else {
            if (pf < 1) {
              add("bad-time", `${pw} is shorter than one output frame`);
              framesOk = false;
            }
            frames += pf;
          }
        });
        if (FPS !== undefined && dur !== undefined && framesOk && frames !== Math.round(dur * FPS)) {
          add("beat-length", `${bw} has ${frames} frames, dur ${dur} at ${FPS} fps is ${Math.round(dur * FPS)}`);
        }
      });
    });
  }
  return out;
}

// ── the graph ────────────────────────────────────────────────────────────────────────────

/** A number as plain decimal text for a filter option (no exponent form). */
function fmt(n: number): string {
  return String(Number(n.toFixed(6)));
}

export interface BuiltGraph {
  /** Source ids in input order (the -i list). */
  inputs: string[];
  graph: string;
  /** Label of the final stream. */
  outLabel: string;
  frames: number;
}

/** One -filter_complex string for one video, in the order of the ticket (D4). */
export function buildGraph(spec: ClipEditSpec, video: VideoSpec): BuiltGraph {
  const o = spec.output;
  const byId = new Map(spec.sources.map((s) => [s.id, s]));
  const pieces: { src: string; piece: Piece }[] = [];
  for (const b of video.beats) for (const p of b.pieces) pieces.push({ src: p.src, piece: p });
  const inputs: string[] = [];
  for (const p of pieces) if (!inputs.includes(p.src)) inputs.push(p.src);

  let counter = 0;
  const lab = (prefix: "s" | "k"): string => `${prefix}${counter++}`;
  const chains: string[] = [];
  const partLabel = new Map<number, string>(); // piece index -> label of its part

  inputs.forEach((id, idx) => {
    const src = byId.get(id) as Source;
    let cur = lab("s");
    chains.push(`[${idx}:v]setpts=PTS-STARTPTS[${cur}]`);
    for (const b of src.blur) {
      const keep = lab("s");
      const cp = lab("s");
      const blurred = lab("s");
      const merged = lab("s");
      chains.push(`[${cur}]split=2[${keep}][${cp}]`);
      chains.push(`[${cp}]crop=${fmt(b.w)}:${fmt(b.h)}:${fmt(b.x)}:${fmt(b.y)},gblur=sigma=20:steps=3[${blurred}]`);
      chains.push(
        `[${keep}][${blurred}]overlay=${fmt(b.x)}:${fmt(b.y)}:enable='gte(t,${fmt(b.from)})*lt(t,${fmt(b.to)})'[${merged}]`,
      );
      cur = merged;
    }
    const fpsOut = lab("s");
    chains.push(`[${cur}]fps=${o.fps}[${fpsOut}]`);

    const mine = pieces.map((p, i) => ({ p, i })).filter((x) => x.p.src === id);
    const copies = mine.map(() => lab("k"));
    chains.push(`[${fpsOut}]split=${mine.length}${copies.map((c) => `[${c}]`).join("")}`);
    mine.forEach((m, j) => {
      const part = lab("s");
      const p = m.p.piece;
      let trim: string;
      if ("still" in p) {
        const at = Math.round(p.still * o.fps);
        trim = `trim=start_frame=${at}:end_frame=${at + 1},loop=loop=${Math.round(p.sec * o.fps) - 1}:size=1`;
      } else {
        trim = `trim=start_frame=${Math.round(p.from * o.fps)}:end_frame=${Math.round(p.to * o.fps)}`;
      }
      chains.push(`[${copies[j]}]${trim},setpts=N/${o.fps}/TB[${part}]`);
      partLabel.set(m.i, part);
    });
  });

  const joined = lab("s");
  const parts = pieces.map((_, i) => `[${partLabel.get(i)}]`).join("");
  chains.push(`${parts}concat=n=${pieces.length}:v=1:a=0[${joined}]`);

  const first = byId.get(inputs[0]) as Source;
  const ch = contentHeight(first.width, first.height, o);
  const padTop = Math.floor((o.height - ch) / 2);
  const cropped = lab("s");
  chains.push(`[${joined}]crop=${first.width}:${first.height - o.crop_top}:0:${o.crop_top}[${cropped}]`);
  let cur = cropped;
  if (first.width !== o.width) {
    const scaled = lab("s");
    chains.push(`[${cur}]scale=${o.width}:${ch}[${scaled}]`);
    cur = scaled;
  }
  const padded = lab("s");
  chains.push(`[${cur}]pad=${o.width}:${o.height}:0:${padTop}:color=0x${o.pad_color.slice(1)}[${padded}]`);
  const outLabel = lab("s");
  chains.push(`[${padded}]format=yuv420p[${outLabel}]`);

  const frames = pieces.reduce((n, p) => n + pieceFrames(p.piece, o.fps), 0);
  return { inputs, graph: chains.join(";"), outLabel, frames };
}

/** The filter names a graph string uses (quoted option text is skipped). */
export function filterNames(graph: string): string[] {
  const bare = graph.replace(/'[^']*'/g, "''");
  return bare
    .split(/[;,]/)
    .map((seg) => seg.replace(/\[[^\]]*\]/g, "").trim())
    .filter((seg) => seg !== "")
    .map((seg) => seg.split("=")[0]);
}

// ── the edit record ──────────────────────────────────────────────────────────────────────

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** <slug>.edit.json content: beats with out_start and dur, pieces with kind, source id and sha256. */
export function buildManifest(spec: ClipEditSpec, video: VideoSpec, specSha256: string): Record<string, unknown> {
  const o = spec.output;
  const byId = new Map(spec.sources.map((s) => [s.id, s]));
  let start = 0;
  let frames = 0;
  const beats = video.beats.map((b) => {
    const beatStart = round6(start);
    let pieceStart = beatStart;
    const pieces = b.pieces.map((p) => {
      const src = byId.get(p.src) as Source;
      const base = { kind: "recorded-clip", source: p.src, sha256: src.sha256 };
      const timing = "still" in p ? { still: p.still, sec: p.sec } : { from: p.from, to: p.to };
      const rec = { ...base, ...timing, out_start: round6(pieceStart) };
      pieceStart += pieceFrames(p, o.fps) / o.fps;
      frames += pieceFrames(p, o.fps);
      return rec;
    });
    start += b.dur;
    return { n: b.n, clip: b.clip, out_start: beatStart, dur: b.dur, pieces };
  });
  return {
    schema: MANIFEST_SCHEMA,
    slug: video.slug,
    spec_sha256: specSha256,
    output: {
      width: o.width,
      height: o.height,
      fps: o.fps,
      crop_top: o.crop_top,
      pad_color: o.pad_color,
      frames,
      sec: round6(frames / o.fps),
    },
    beats,
  };
}

// ── apply ────────────────────────────────────────────────────────────────────────────────

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

/** Is this real path inside a git work tree (a .git entry here or above)? */
function insideGitWorkTree(start: string): boolean {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) return true;
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

function realOrResolved(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

interface ProbeBin {
  bin: string;
  env: NodeJS.ProcessEnv;
}

/** System ffprobe next to the system ffmpeg, else the bundled one of clipIntake. */
function resolveProbe(ffmpeg: string): ProbeBin {
  const sibling = path.join(path.dirname(ffmpeg), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  if (fs.existsSync(sibling)) return { bin: sibling, env: { ...process.env } };
  try {
    const t = resolveProbeTool();
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (process.platform === "darwin") env.DYLD_FALLBACK_LIBRARY_PATH = t.dir;
    return { bin: t.bin, env };
  } catch (err) {
    throw new Refusal("ffprobe-missing", err instanceof Error ? err.message : String(err));
  }
}

interface SourceFacts {
  width: number;
  height: number;
  rotation: number;
  length: number;
}

function probeSource(p: ProbeBin, file: string): SourceFacts | null {
  const res = spawnSync(
    p.bin,
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,duration,start_time:stream_side_data=rotation:stream_tags=rotate:format=duration",
      "-of",
      "json",
      file,
    ],
    { env: p.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (res.status !== 0) return null;
  try {
    const doc = JSON.parse(res.stdout) as {
      streams?: {
        width?: unknown;
        height?: unknown;
        duration?: unknown;
        start_time?: unknown;
        side_data_list?: { rotation?: unknown }[];
        tags?: { rotate?: unknown };
      }[];
      format?: { duration?: unknown };
    };
    const s = doc.streams?.[0];
    if (!s) return null;
    let rotation = 0;
    for (const sd of s.side_data_list ?? []) {
      const r = Number(sd.rotation);
      if (Number.isFinite(r) && r !== 0) rotation = r;
    }
    const tagRot = Number(s.tags?.rotate);
    if (rotation === 0 && Number.isFinite(tagRot)) rotation = tagRot;
    const sd = Number(s.duration);
    const length = Number.isFinite(sd) && sd > 0 ? sd : Number(doc.format?.duration) - (Number(s.start_time) || 0);
    if (!Number.isFinite(length)) return null;
    return { width: Number(s.width), height: Number(s.height), rotation, length };
  } catch {
    return null;
  }
}

function countFrames(p: ProbeBin, file: string): number {
  const res = spawnSync(
    p.bin,
    ["-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", file],
    { env: p.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  return res.status === 0 ? Number(res.stdout.trim()) : NaN;
}

function writeAtomic(finalPath: string, text: string): void {
  const tmp = `${finalPath}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, finalPath);
}

export interface ApplyOpts {
  spec: string;
  clips: string;
  intake: string;
  out: string;
  only?: string;
}

/** Throws a Refusal before anything is written; returns the stdout lines. */
export function applyEdit(opts: ApplyOpts): string[] {
  let raw: string;
  let spec: unknown;
  try {
    raw = fs.readFileSync(opts.spec, "utf8");
    spec = JSON.parse(raw);
  } catch {
    throw new Refusal("spec-invalid", "the spec file cannot be read as JSON", ["bad-schema: the spec file is not readable JSON"]);
  }
  const problems = validateSpec(spec);
  if (problems.length > 0) throw new Refusal("spec-invalid", `${problems.length} problem(s)`, problems);
  const sp = spec as ClipEditSpec;
  const specSha = crypto.createHash("sha256").update(raw).digest("hex");

  const realClips = realOrResolved(opts.clips);
  let realOut: string;
  try {
    if (!fs.statSync(opts.out).isDirectory()) throw new Error("not a folder");
    realOut = fs.realpathSync(opts.out);
  } catch {
    throw new Refusal("out-missing", "the --out folder must already exist");
  }
  if (insideGitWorkTree(realClips)) throw new Refusal("inside-repo", "--clips is inside a git work tree");
  if (insideGitWorkTree(realOut)) throw new Refusal("inside-repo", "--out is inside a git work tree");

  let videos = sp.videos;
  if (opts.only !== undefined) {
    videos = sp.videos.filter((v) => v.slug === opts.only);
    if (videos.length === 0) throw new Refusal("usage", "--only names no slug of the spec");
  }

  // The source files: present, unchanged, and known to intake.
  const paths = new Map<string, string>();
  for (const s of sp.sources) {
    const file = path.join(realClips, s.file);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Refusal("source-missing", `source ${s.id} is not in --clips`);
    if (sha256Streamed(file) !== s.sha256) throw new Refusal("source-changed", `source ${s.id} differs from the spec sha256`);
    let known = false;
    try {
      const rec = JSON.parse(fs.readFileSync(path.join(opts.intake, `${s.sha256}.intake.json`), "utf8")) as {
        schema?: unknown;
        sha256?: unknown;
      };
      known = rec.schema === INTAKE_SCHEMA && rec.sha256 === s.sha256;
    } catch {
      known = false;
    }
    if (!known) throw new Refusal("not-in-intake", `source ${s.id} has no ${INTAKE_SCHEMA} record in --intake`);
    paths.set(s.id, file);
  }

  if (!hasSystemFfmpeg()) throw new Refusal("ffmpeg-missing", "no system ffmpeg (the bundled one lacks gblur, overlay, pad, fps, loop and setpts)");
  const ffmpeg = resolveSystemFfmpeg();
  const probe = resolveProbe(ffmpeg);

  const facts = new Map<string, SourceFacts>();
  for (const s of sp.sources) {
    const f = probeSource(probe, paths.get(s.id) as string);
    if (!f) throw new Refusal("shape-mismatch", `source ${s.id} cannot be probed`);
    if (f.rotation !== 0 || f.width !== s.width || f.height !== s.height) {
      throw new Refusal("shape-mismatch", `source ${s.id} is ${f.width}x${f.height} rotation ${f.rotation}, the spec says ${s.width}x${s.height} rotation 0`);
    }
    facts.set(s.id, f);
  }
  const tol = 1 / sp.output.fps;
  for (const v of videos) {
    const used = new Set<string>();
    for (const b of v.beats) {
      for (const p of b.pieces) {
        used.add(p.src);
        const len = (facts.get(p.src) as SourceFacts).length;
        const end = "still" in p ? p.still : p.to;
        if (end > len + tol) throw new Refusal("piece-past-end", `video ${v.slug} beat ${b.n} reaches ${end} s, source ${p.src} ends at ${round6(len)} s`);
      }
    }
    // concat joins parts of one size: the sources of a video must share it
    const sizes = new Set([...used].map((id) => {
      const s = sp.sources.find((x) => x.id === id) as Source;
      return `${s.width}x${s.height}`;
    }));
    if (sizes.size > 1) throw new Refusal("shape-mismatch", `video ${v.slug} mixes sources of different sizes`);
  }

  // Build every graph first, so a bad graph writes nothing.
  const built = videos.map((v) => {
    const g = buildGraph(sp, v);
    const bad = filterNames(g.graph).filter((n) => !(ALLOWED_FILTERS as readonly string[]).includes(n));
    if (bad.length > 0) throw new Refusal("spec-invalid", `graph holds a filter outside the list: ${bad.join(",")}`);
    return { v, g };
  });

  const lines: string[] = [];
  for (const { v, g } of built) {
    const finalMp4 = path.join(realOut, `${v.slug}.mp4`);
    const tmpMp4 = path.join(realOut, `${v.slug}.tmp.mp4`);
    const args = ["-y", "-hide_banner", "-loglevel", "error"];
    for (const id of g.inputs) args.push("-i", paths.get(id) as string);
    args.push(
      "-filter_complex",
      g.graph,
      "-map",
      `[${g.outLabel}]`,
      "-map_metadata",
      "-1",
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      tmpMp4,
    );
    const res = spawnSync(ffmpeg, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (res.status !== 0) {
      fs.rmSync(tmpMp4, { force: true });
      throw new Refusal("ffmpeg-failed", `ffmpeg exited ${res.status} for ${v.slug}: ${(res.stderr ?? "").slice(-300).replace(/\s+/g, " ")}`);
    }
    const counted = countFrames(probe, tmpMp4);
    if (counted !== g.frames) {
      fs.rmSync(tmpMp4, { force: true });
      throw new Refusal("ffmpeg-failed", `video ${v.slug} has ${counted} frames, expected ${g.frames}`);
    }
    fs.renameSync(tmpMp4, finalMp4);
    writeAtomic(path.join(realOut, `${v.slug}.edit.json`), JSON.stringify(buildManifest(sp, v, specSha), null, 2) + "\n");

    const sec = g.frames / sp.output.fps;
    const beats: ContactSheetBeat[] = [];
    for (let i = 0; i < Math.ceil(sec - 1e-9); i++) {
      beats.push({ label: `${i}s`, fromSec: i, durationSec: Math.min(1, sec - i) });
    }
    const log = console.log;
    console.log = () => undefined; // the sheet prints two breadcrumb lines; stdout here is one line per video
    try {
      generateContactSheet(finalMp4, beats, { slug: v.slug, reviewRoot: path.join(realOut, "review"), ffmpegBin: ffmpeg });
    } finally {
      console.log = log;
    }
    lines.push(`clip-edit: wrote ${v.slug} frames=${g.frames} sec=${round6(sec)}`);
  }
  return lines;
}

const USAGE =
  "usage: clipEdit apply --spec <file> --clips <dir> --intake <dir> --out <dir> [--only <slug>]\n";

export function runCli(argv: string[]): CliResult {
  if (argv[0] !== "apply") return { code: 2, out: "", err: USAGE };
  const vals: Record<string, string> = {};
  for (let i = 1; i < argv.length; i += 2) {
    const k = argv[i];
    if (!["--spec", "--clips", "--intake", "--out", "--only"].includes(k) || i + 1 >= argv.length) {
      return { code: 2, out: "", err: USAGE };
    }
    vals[k] = argv[i + 1];
  }
  if (!vals["--spec"] || !vals["--clips"] || !vals["--intake"] || !vals["--out"]) return { code: 2, out: "", err: USAGE };
  try {
    const lines = applyEdit({
      spec: vals["--spec"],
      clips: vals["--clips"],
      intake: vals["--intake"],
      out: vals["--out"],
      only: vals["--only"],
    });
    return { code: 0, out: lines.map((l) => `${l}\n`).join(""), err: "" };
  } catch (err) {
    if (err instanceof Refusal) {
      return { code: 2, out: "", err: [err.message, ...err.extra].map((l) => `${l}\n`).join("") };
    }
    return { code: 1, out: "", err: `clip-edit: error: ${err instanceof Error ? err.message : String(err)}\n` };
  }
}
