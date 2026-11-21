/**
 * Row A41-clip-cut — clip:edit check proves an edited clip from outside: the shape, blur, cut,
 * bars, crop and still parts read pixels of <out>/<slug>.mp4 with the system ffmpeg and hold
 * them against the spec. It reads the spec, the source clips and the mp4, and writes nothing.
 */

import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import { resolveProbeTool } from "./clipIntake";
import { hasSystemFfmpeg, resolveSystemFfmpeg } from "./contactSheet";
import {
  buildGraph,
  contentHeight,
  pieceFrames,
  validateSpec,
  type BlurBox,
  type ClipEditSpec,
  type CliResult,
  type Piece,
  type Source,
  type VideoSpec,
} from "./clipEdit";

// ── own copies of the two lookups apply holds too (clipEdit.ts keeps its own) ─────────────

class Refusal extends Error {
  constructor(
    public readonly code: string,
    detail: string,
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

// ── pixel reads (system ffmpeg, rawvideo to stdout, argument arrays) ─────────────────────

const RAW_MAX = 128 * 1024 * 1024;

/** One gray rawvideo read; throws when ffmpeg fails or gives fewer bytes than expected. */
function ffmpegRaw(ffmpeg: string, args: string[], expect: number, what: string): Buffer {
  const res = spawnSync(ffmpeg, ["-v", "error", ...args, "-f", "rawvideo", "-"], { maxBuffer: RAW_MAX });
  if (res.status !== 0) throw new Error(`the ffmpeg read of ${what} exited ${res.status}`);
  const b = res.stdout as Buffer;
  if (!Buffer.isBuffer(b) || b.length < expect) {
    throw new Error(`the ffmpeg read of ${what} gave ${b && b.length ? b.length : 0} bytes, ${expect} expected`);
  }
  return b;
}

/** Mean absolute horizontal neighbour difference of a gray box of a frame buffer. */
function hDiff(b: Buffer, fw: number, x: number, y: number, w: number, h: number): number {
  if (w < 2 || h < 1) return 0;
  let sum = 0;
  for (let r = 0; r < h; r++) {
    const base = (y + r) * fw + x;
    for (let c = 0; c < w - 1; c++) sum += Math.abs(b[base + c + 1] - b[base + c]);
  }
  return sum / (h * (w - 1));
}

/** Mean absolute difference of two equally sized gray reads. */
function mad(a: Buffer, b: Buffer): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

// ── per-video context and frame readers ──────────────────────────────────────────────────

interface PieceRun {
  p: Piece;
  start: number; // first output frame of the piece
  frames: number;
  midOut: number; // middle output frame of the piece
  midSrc: number; // source frame (apply's grid) the middle output frame shows
}

/** Piece timings on apply's grid: a stretch plays round(t*fps) - round(from*fps) frames from its
 *  start frame, a still holds source frame round(still*fps). */
function pieceRuns(video: VideoSpec, fps: number): PieceRun[] {
  const runs: PieceRun[] = [];
  let start = 0;
  for (const b of video.beats) {
    for (const p of b.pieces) {
      const frames = pieceFrames(p, fps);
      let midSrc: number;
      let midOut: number;
      if ("still" in p) {
        midSrc = Math.round(p.still * fps);
        midOut = start + Math.floor((frames - 1) / 2);
      } else {
        midSrc = Math.round(((p.from + p.to) / 2) * fps);
        midOut = start + midSrc - Math.round(p.from * fps);
      }
      runs.push({ p, start, frames, midOut, midSrc });
      start += frames;
    }
  }
  return runs;
}

interface Ctx {
  ffmpeg: string;
  probe: ProbeBin;
  spec: ClipEditSpec;
  slug: string;
  mp4: string;
  clip: (id: string) => string;
  w: number;
  h: number;
  fps: number;
  ch: number; // content height after crop and scale
  padTop: number;
  cropTop: number;
  totalFrames: number;
  padGray: number; // gray value of a solid pad_color frame
  sizeOk: boolean; // the mp4 has the spec size; set by the shape part
  cache: Map<string, Buffer>;
}

function srcOf(c: Ctx, id: string): Source {
  return c.spec.sources.find((s) => s.id === id) as Source;
}

/** Output frame n, the whole gray frame (tail "") or with a crop/scale tail. */
function outFrame(c: Ctx, n: number, tail: string, unit: number): Buffer {
  const key = `out:${n}:${tail}`;
  let b = c.cache.get(key);
  if (!b) {
    const vf = `trim=start_frame=${n}:end_frame=${n + 1}${tail ? `,${tail}` : ""},format=gray`;
    b = ffmpegRaw(c.ffmpeg, ["-i", c.mp4, "-vf", vf], unit, `${c.slug} frame ${n}`);
    c.cache.set(key, b);
  }
  return b;
}

/** Source frame k on apply's grid (setpts, fps), whole frame or with a crop/scale tail. */
function srcFrame(c: Ctx, id: string, k: number, tail: string, unit: number): Buffer {
  const key = `src:${id}:${k}:${tail}`;
  let b = c.cache.get(key);
  if (!b) {
    const vf = `setpts=PTS-STARTPTS,fps=${c.fps},trim=start_frame=${k}:end_frame=${k + 1}${tail ? `,${tail}` : ""},format=gray`;
    b = ffmpegRaw(c.ffmpeg, ["-i", c.clip(id), "-vf", vf], unit, `source ${id} frame ${k}`);
    c.cache.set(key, b);
  }
  return b;
}

/** The content area (between the pad bands) of each output frame as 32x32 gray, in one call. */
function outContentFrames(c: Ctx): Buffer {
  const key = "out:content";
  let b = c.cache.get(key);
  if (!b) {
    const vf = `crop=${c.w}:${c.ch}:0:${c.padTop},scale=32:32,format=gray`;
    b = ffmpegRaw(c.ffmpeg, ["-i", c.mp4, "-vf", vf], 1024, `the content frames of ${c.slug}`);
    c.cache.set(key, b);
  }
  return b;
}

/** The native source frames in [from, to), content area below crop_top, as 32x32 gray.
 *  -fps_mode passthrough: the rawvideo muxer otherwise pads to a constant rate. */
function srcNativeFrames(c: Ctx, id: string, from: number, to: number): Buffer {
  const s = srcOf(c, id);
  const vf = `crop=${s.width}:${s.height - c.cropTop}:0:${c.cropTop},trim=start=${from}:end=${to},scale=32:32,format=gray`;
  return ffmpegRaw(c.ffmpeg, ["-i", c.clip(id), "-vf", vf, "-fps_mode", "passthrough"], 0, `native frames ${from}-${to} of ${id}`);
}

/** A source box on output pixels: (x*W/srcW, (y-crop_top)*ch/(srcH-crop_top) + pad_top). */
function mapBox(c: Ctx, s: Source, box: BlurBox): { x: number; y: number; w: number; h: number } {
  const kx = s.width / c.w;
  const ky = (s.height - c.cropTop) / c.ch;
  const x = Math.min(Math.max(Math.round(box.x / kx), 0), c.w - 2);
  const y = Math.min(Math.max(Math.round((box.y - c.cropTop) / ky) + c.padTop, c.padTop), c.padTop + c.ch - 2);
  return { x, y, w: Math.min(Math.max(Math.round(box.w / kx), 2), c.w - x), h: Math.min(Math.max(Math.round(box.h / ky), 2), c.padTop + c.ch - y) };
}

/** The gray value the read path gives for a solid pad_color frame. */
function padGrayValue(ffmpeg: string, padColor: string): number {
  const b = ffmpegRaw(ffmpeg, ["-f", "lavfi", "-i", `color=c=0x${padColor.slice(1)}:s=64x64`, "-vf", "format=gray", "-frames:v", "1"], 64 * 64, "the pad color");
  let sum = 0;
  for (let i = 0; i < b.length; i++) sum += b[i];
  return sum / b.length;
}

// ── the six parts, each returns its PASS or FAIL line without the slug ────────────────────

function partShape(c: Ctx, video: VideoSpec): string {
  const expected = buildGraph(c.spec, video).frames;
  const res = spawnSync(
    c.probe.bin,
    ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height,r_frame_rate,avg_frame_rate,nb_read_frames", "-of", "json", c.mp4],
    { env: c.probe.env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  if (res.status !== 0) throw new Error(`ffprobe of ${c.slug} exited ${res.status}`);
  const doc = JSON.parse(res.stdout) as { streams?: Record<string, string>[] };
  const streams = doc.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video");
  if (!v) throw new Error(`ffprobe of ${c.slug} shows no video stream`);
  c.sizeOk = Number(v.width) === c.w && Number(v.height) === c.h;
  if (v.codec_name !== "h264" || v.pix_fmt !== "yuv420p") return "FAIL shape: codec";
  if (!c.sizeOk) return "FAIL shape: size";
  const rate = `${c.fps}/1`;
  if (v.r_frame_rate !== rate || v.avg_frame_rate !== rate) return "FAIL shape: fps";
  if (streams.some((s) => s.codec_type === "audio")) return "FAIL shape: audio";
  if (Number(v.nb_read_frames) !== expected) return "FAIL shape: frames";
  return "PASS shape";
}

/** Blur strength where each box plays: the neighbour difference of the box must drop on the
 *  output. A source box below 1.0 is flat and proves nothing; an overlap whose samples are each
 *  flat fails as flat-source, because a flat source cannot show the blur held. */
function partBlur(c: Ctx, video: VideoSpec, runs: PieceRun[]): string {
  const srcIds = [...new Set(runs.map((r) => r.p.src))];
  let flatOverlap = false;
  let weak = false;
  for (const id of srcIds) {
    const s = srcOf(c, id);
    for (const box of s.blur) {
      for (const run of runs) {
        if (run.p.src !== id) continue;
        const samples: { srcFrame: number; outFrame: number }[] = [];
        if ("still" in run.p) {
          if (run.p.still >= box.from && run.p.still < box.to) samples.push({ srcFrame: run.midSrc, outFrame: run.midOut });
        } else {
          const from = Math.max(run.p.from, box.from);
          const to = Math.min(run.p.to, box.to);
          if (to > from) {
            for (const pct of [0.1, 0.5, 0.9]) {
              const t = from + pct * (to - from);
              const srcFrame = Math.round(t * c.fps);
              const outFrame = Math.min(Math.max(run.start + srcFrame - Math.round(run.p.from * c.fps), 0), c.totalFrames - 1);
              samples.push({ srcFrame, outFrame });
            }
          }
        }
        if (samples.length === 0) continue;
        const m = mapBox(c, s, box);
        const vals = samples.map((sm) => ({
          sv: hDiff(srcFrame(c, id, sm.srcFrame, "", s.width * s.height), s.width, box.x, box.y, box.w, box.h),
          ov: hDiff(outFrame(c, sm.outFrame, "", c.w * c.h), c.w, m.x, m.y, m.w, m.h),
        }));
        if (vals.every((v) => v.sv < 1.0)) flatOverlap = true;
        if (vals.some((v) => v.sv >= 1.0 && v.ov / v.sv > 0.25)) weak = true;
      }
    }
  }
  if (weak) return "FAIL blur";
  if (flatOverlap) return "FAIL flat-source";
  return "PASS blur";
}

/** Absence of the prove_absent window: no output frame may look like a native frame inside it.
 *  Fails closed: a cut without a window, a window with no native frame and a shorter output read
 *  prove nothing (a longer read only adds frames to compare). Only the sources this video plays are looked at. */
function partCut(c: Ctx, video: VideoSpec): string {
  const srcIds = [...new Set(video.beats.flatMap((b) => b.pieces.map((p) => p.src)))];
  const out = outContentFrames(c);
  const nOut = Math.floor(out.length / 1024);
  if (nOut < c.totalFrames) return "FAIL cut: short-read"; // a longer read only adds frames to compare
  for (const id of srcIds) {
    for (const cut of srcOf(c, id).cut) {
      if (!cut.prove_absent) return "FAIL cut: unproven";
      const nat = srcNativeFrames(c, id, cut.prove_absent.from, cut.prove_absent.to);
      const nNat = Math.floor(nat.length / 1024);
      if (nNat === 0) return "FAIL cut: empty-window";
      for (let i = 0; i < nOut; i++) {
        const a = out.subarray(i * 1024, i * 1024 + 1024);
        for (let j = 0; j < nNat; j++) {
          if (mad(a, nat.subarray(j * 1024, j * 1024 + 1024)) < 20) return "FAIL cut";
        }
      }
    }
  }
  return "PASS cut";
}

/** The pad bands (minus the 16 rows next to the picture, which x264 rings) hold the pad color. */
function partBars(c: Ctx, runs: PieceRun[]): string {
  for (const run of runs) {
    const fr = outFrame(c, run.midOut, "", c.w * c.h);
    const bands: [number, number][] = [
      [0, c.padTop - 16],
      [c.padTop + c.ch + 16, c.h],
    ];
    for (const [r0, r1] of bands) {
      for (let r = r0; r < r1; r++) {
        let min = 255;
        let max = 0;
        let sum = 0;
        for (let x = 0; x < c.w; x++) {
          const v = fr[r * c.w + x];
          if (v < min) min = v;
          if (v > max) max = v;
          sum += v;
        }
        if (max !== min || Math.abs(sum / c.w - c.padGray) > 2) return "FAIL bars";
      }
    }
  }
  return "PASS bars";
}

/** The top of the picture shows source rows below crop_top, not rows 0..32 of the source. */
function partCrop(c: Ctx, runs: PieceRun[]): string {
  for (const run of runs) {
    const s = srcOf(c, run.p.src);
    const out = outFrame(c, run.midOut, `crop=${c.w}:32:0:${c.padTop},scale=32:8`, 256);
    const below = srcFrame(c, run.p.src, run.midSrc, `crop=${s.width}:32:0:${c.cropTop},scale=32:8`, 256);
    const top = srcFrame(c, run.p.src, run.midSrc, `crop=${s.width}:32:0:0,scale=32:8`, 256);
    const dBelow = mad(out, below);
    if (dBelow >= 8 || dBelow >= mad(out, top)) return "FAIL crop";
  }
  return "PASS crop";
}

/** Each still holds the source frame round(still*fps), at the middle of its hold. */
function partStill(c: Ctx, runs: PieceRun[]): string {
  for (const run of runs) {
    if (!("still" in run.p)) continue;
    const s = srcOf(c, run.p.src);
    const out = outFrame(c, run.midOut, `crop=${c.w}:${c.ch}:0:${c.padTop},scale=32:32`, 1024);
    const held = srcFrame(c, run.p.src, run.midSrc, `crop=${s.width}:${s.height - c.cropTop}:0:${c.cropTop},scale=32:32`, 1024);
    if (mad(out, held) >= 3) return "FAIL still";
  }
  return "PASS still";
}

// ── the run ──────────────────────────────────────────────────────────────────────────────

function checkVideo(
  sp: ClipEditSpec,
  video: VideoSpec,
  env: { ffmpeg: string; probe: ProbeBin; clips: Map<string, string>; outDir: string },
): { lines: string[]; fail: number } {
  const o = sp.output;
  const first = sp.sources.find((s) => s.id === video.beats[0].pieces[0].src) as Source;
  const ch = contentHeight(first.width, first.height, o);
  const runs = pieceRuns(video, o.fps);
  const c: Ctx = {
    ffmpeg: env.ffmpeg,
    probe: env.probe,
    spec: sp,
    slug: video.slug,
    mp4: path.join(env.outDir, `${video.slug}.mp4`),
    clip: (id: string) => env.clips.get(id) as string,
    w: o.width,
    h: o.height,
    fps: o.fps,
    ch,
    padTop: Math.floor((o.height - ch) / 2),
    cropTop: o.crop_top,
    totalFrames: runs.reduce((n, r) => n + r.frames, 0),
    padGray: padGrayValue(env.ffmpeg, o.pad_color),
    sizeOk: true,
    cache: new Map(),
  };
  const shape = partShape(c, video);
  // The pixel reads assume the spec size; on another size the shape line stands alone.
  const parts = c.sizeOk
    ? [shape, partBlur(c, video, runs), partCut(c, video), partBars(c, runs), partCrop(c, runs), partStill(c, runs)]
    : [shape];
  const lines = [`clip-edit check: ${video.slug} mp4 sha256=${sha256Streamed(c.mp4)}`];
  let fail = 0;
  for (const p of parts) {
    if (p.startsWith("FAIL")) fail++;
    lines.push(`${p} ${video.slug}`);
  }
  return { lines, fail };
}

export interface CheckOpts {
  spec: string;
  clips: string;
  out: string;
  only?: string;
}

function checkEdit(opts: CheckOpts): { lines: string[]; fail: number } {
  let spec: unknown;
  try {
    spec = JSON.parse(fs.readFileSync(opts.spec, "utf8"));
  } catch {
    throw new Refusal("spec-invalid", "the spec file cannot be read as JSON");
  }
  const problems = validateSpec(spec);
  if (problems.length > 0) throw new Refusal("spec-invalid", problems[0]);
  const sp = spec as ClipEditSpec;

  let videos = sp.videos;
  if (opts.only !== undefined) {
    videos = sp.videos.filter((v) => v.slug === opts.only);
    if (videos.length === 0) throw new Refusal("usage", "--only names no slug of the spec");
  }
  if (videos.length === 0) throw new Refusal("nothing-to-check", "the spec names no videos");
  for (const v of videos) {
    if (v.beats.length === 0) throw new Refusal("nothing-to-check", `video ${v.slug} has no beats`);
  }

  const clips = new Map<string, string>();
  for (const s of sp.sources) {
    const file = path.join(opts.clips, s.file);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Refusal("source-missing", `source ${s.id} is not in --clips`);
    if (sha256Streamed(file) !== s.sha256) throw new Refusal("source-changed", `source ${s.id} differs from the spec sha256`);
    clips.set(s.id, file);
  }

  try {
    if (!fs.statSync(opts.out).isDirectory()) throw new Error("not a folder");
  } catch {
    throw new Refusal("output-missing", "the --out folder must already exist");
  }
  for (const v of videos) {
    if (!fs.existsSync(path.join(opts.out, `${v.slug}.mp4`))) throw new Refusal("output-missing", `${v.slug}.mp4 is not in --out`);
  }

  if (!hasSystemFfmpeg()) throw new Refusal("ffmpeg-missing", "no system ffmpeg for the pixel reads");
  const ffmpeg = resolveSystemFfmpeg();
  let probe: ProbeBin;
  try {
    probe = resolveProbe(ffmpeg);
  } catch (err) {
    if (err instanceof Refusal) throw err;
    throw new Refusal("ffprobe-missing", err instanceof Error ? err.message : String(err));
  }

  const lines: string[] = [];
  let fail = 0;
  for (const v of videos) {
    const r = checkVideo(sp, v, { ffmpeg, probe, clips, outDir: opts.out });
    lines.push(...r.lines);
    fail += r.fail;
  }
  lines.push(`clip-edit check: videos=${videos.length} fail=${fail}`);
  return { lines, fail };
}

const USAGE = "usage: clipEdit check --spec <file> --clips <dir> --out <dir> [--only <slug>]\n";

export function runCheckCli(argv: string[]): CliResult {
  if (argv[0] !== "check") return { code: 2, out: "", err: USAGE };
  const vals: Record<string, string> = {};
  for (let i = 1; i < argv.length; i += 2) {
    const k = argv[i];
    if (!["--spec", "--clips", "--out", "--only"].includes(k) || i + 1 >= argv.length) {
      return { code: 2, out: "", err: USAGE };
    }
    vals[k] = argv[i + 1];
  }
  if (!vals["--spec"] || !vals["--clips"] || !vals["--out"]) return { code: 2, out: "", err: USAGE };
  try {
    const r = checkEdit({ spec: vals["--spec"], clips: vals["--clips"], out: vals["--out"], only: vals["--only"] });
    return { code: r.fail === 0 ? 0 : 1, out: r.lines.map((l) => `${l}\n`).join(""), err: "" };
  } catch (err) {
    if (err instanceof Refusal) return { code: 2, out: "", err: `${err.message}\n` };
    return { code: 1, out: "", err: `clip-edit check: error: ${err instanceof Error ? err.message : String(err)}\n` };
  }
}
