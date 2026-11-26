/**
 * Row A57 — sound lay tests. Real system ffmpeg on media made at test time: a fake ffmpeg
 * cannot show levels, ducking or a copied picture stream. Tests that need it are skipped, with
 * the reason in the name, when it is missing.
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { buildSoundGraph, runCli, validateSpec, type ClipSoundSpec, type Line } from "../clipSound";
import {
  BED_SEC,
  PICTURE_SEC,
  PLANTED_TITLE,
  makeMedia,
  makeSoundFixture,
  noiseArgs,
  pictureArgs,
  sha256File,
  soundArgs,
  soundSpec,
  toneArgs,
  writeSpec,
  type SoundFixture,
} from "../clipSoundFixture";
import { hasSystemFfmpeg, resolveSystemFfmpeg } from "../contactSheet";

jest.setTimeout(180000);

const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (() => {
    throw new Error("clip sound sends no request");
  }) as typeof fetch;
});

const fixtures: SoundFixture[] = [];
const made: string[] = [];
function fixture(): SoundFixture {
  const f = makeSoundFixture();
  fixtures.push(f);
  return f;
}
function tmp(name: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `clip-sound-${name}-`));
  made.push(d);
  return d;
}
afterAll(() => {
  globalThis.fetch = realFetch;
  for (const f of fixtures) f.cleanup();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

function ffTest(name: string, fn: () => void): void {
  if (process.platform === "win32") test.skip(`${name} (win32)`, fn);
  else if (!hasSystemFfmpeg()) test.skip(`${name} (no-system-ffmpeg)`, fn);
  else test(name, fn);
}

const SHA = "ab".repeat(32);
const goodSpec = (): ClipSoundSpec => soundSpec({ picture: SHA, a: SHA, b: SHA, bed: SHA });
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// ── running the tool ─────────────────────────────────────────────────────────────────────

interface Run {
  code: number;
  out: string;
  err: string;
  /** What the run left in its own, at the start empty, OS temp folder. */
  tmpLeft: string[];
}

/** A node script that loads the TypeScript files with the compiler of the repo and writes no cache. */
const CHILD = `
const fs = require("fs");
const ts = require(process.argv[1]);
require.extensions[".ts"] = (m, file) => m._compile(ts.transpileModule(fs.readFileSync(file, "utf8"),
  { compilerOptions: { module: 1, target: 8, esModuleInterop: true } }).outputText, file);
globalThis.fetch = () => { throw new Error("clip sound sends no request"); };
const cli = process.argv[2];
process.argv = ["node", cli, ...JSON.parse(process.argv[3])];
require(cli);
`;

/** The thin CLI in a process of its own, with the OS temp folder set to an empty folder. A temp
 *  folder set inside jest does not reach os.tmpdir(), so a process of its own is needed. */
function cli(args: string[]): Run {
  const osTmp = tmp("ostmp");
  const env: NodeJS.ProcessEnv = { ...process.env, TMPDIR: osTmp, TMP: osTmp, TEMP: osTmp };
  delete env.NODE_COMPILE_CACHE;
  const r = spawnSync(
    process.execPath,
    ["-e", CHILD, require.resolve("typescript"), path.resolve(__dirname, "../../tools/clipSound.ts"), JSON.stringify(args)],
    { encoding: "utf8", env, maxBuffer: 16 * 1024 * 1024 },
  );
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr, tmpLeft: fs.readdirSync(osTmp) };
}

function argsOf(f: SoundFixture, over: { spec?: string; media?: string; out?: string } = {}, extra: string[] = []): string[] {
  return ["apply", "--spec", over.spec ?? f.specPath, "--media", over.media ?? f.mediaDir, "--out", over.out ?? f.outDir, ...extra];
}

/** A run in this process that must pass. */
function lay(f: SoundFixture, over: { spec?: string; media?: string; out?: string } = {}) {
  const r = runCli(argsOf(f, over));
  expect(r.err).toBe("");
  expect(r.code).toBe(0);
  return r;
}

/** Names and bytes of a folder, folders by name. */
function snapshot(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .sort()
    .map((n) => {
      const s = fs.lstatSync(path.join(dir, n));
      return s.isFile() ? `${n} ${sha256File(path.join(dir, n))}` : `${n} ${s.isSymbolicLink() ? "link" : "folder"}`;
    });
}

/** Exit 2, the code first, empty stdout, the watched folder as before, the OS temp folder empty. */
function refused(args: string[], code: string, watched: string): Run {
  const before = snapshot(watched);
  const r = cli(args);
  expect(r.err.split("\n")[0]).toMatch(new RegExp(`^${code}: `));
  expect(r.code).toBe(2);
  expect(r.out).toBe("");
  expect(snapshot(watched)).toEqual(before);
  expect(r.tmpLeft).toEqual([]);
  return r;
}

// ── reading media ────────────────────────────────────────────────────────────────────────

function ff(args: string[]): { stdout: Buffer; stderr: string } {
  const r = spawnSync(resolveSystemFfmpeg(), ["-nostdin", "-hide_banner", "-nostats", ...args], { maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.toString()}`);
  return { stdout: r.stdout, stderr: r.stderr.toString() };
}
interface ProbeDoc {
  streams: Record<string, string>[];
  format: { duration: string; tags?: Record<string, string> };
}
function probe(file: string): ProbeDoc {
  const bin = path.join(path.dirname(resolveSystemFfmpeg()), "ffprobe");
  const r = spawnSync(bin, ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr}`);
  return JSON.parse(r.stdout) as ProbeDoc;
}
function streamHash(file: string): string {
  return ff(["-v", "error", "-i", file, "-map", "0:v:0", "-c", "copy", "-f", "streamhash", "-hash", "sha256", "-"]).stdout.toString().trim();
}

/** A sound file at 48 kHz, as a mono mix-down. */
function mono(file: string): Float32Array {
  const channels = Number(probe(file).streams.find((s) => s.codec_type === "audio")?.channels);
  const b = ff(["-v", "error", "-i", file, "-map", "0:a:0", "-f", "f32le", "-ar", "48000", "-"]).stdout;
  const out = new Float32Array(b.length / 4 / channels);
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += b.readFloatLE((i * channels + c) * 4);
    out[i] = sum / channels;
  }
  return out;
}
const db = (x: number): number => 20 * Math.log10(Math.max(x, 1e-10));
/** RMS level in dB over the stretches [from, to) in seconds. */
function level(pcm: Float32Array, ...spans: [number, number][]): number {
  let sum = 0;
  let n = 0;
  for (const [from, to] of spans) {
    for (let i = Math.round(from * 48000); i < Math.round(to * 48000); i++) {
      sum += pcm[i] * pcm[i];
      n++;
    }
  }
  expect(n).toBeGreaterThan(0);
  return db(Math.sqrt(sum / n));
}
function samplePeak(pcm: Float32Array): number {
  let peak = 0;
  for (const v of pcm) peak = Math.max(peak, Math.abs(v));
  return db(peak);
}
function meter(file: string, filter: string): { lufs: number; peak: number } {
  const log = ff(["-i", file, "-map", "0:a:0", "-af", `${filter}ebur128=peak=true:framelog=verbose`, "-f", "null", "-"]).stderr;
  const summary = log.slice(log.lastIndexOf("Integrated loudness:"));
  return {
    lufs: Number(/\bI:\s*(\S+)\s+LUFS/.exec(summary)?.[1]),
    peak: Number(/True peak:\s*Peak:\s*(\S+)\s+dBFS/.exec(summary)?.[1]),
  };
}

interface RecordDoc {
  spec_sha256: string;
  picture: Record<string, string | number>;
  lines: (Record<string, number | string> & { window?: unknown })[];
  bed: Record<string, string | number>;
  mix: Record<string, number>;
  measured: Record<string, number>;
  outputs: Record<string, { file: string; sha256: string }>;
  ffmpeg: string;
}
function recordOf(dir: string): RecordDoc {
  return JSON.parse(fs.readFileSync(path.join(dir, "test-sound.sound.json"), "utf8")) as RecordDoc;
}
const FOUR = ["test-sound.bed.wav", "test-sound.sound.json", "test-sound.sound.mp4", "test-sound.voice.wav"];
const out = (f: SoundFixture, part: "sound.mp4" | "voice.wav" | "bed.wav"): string => path.join(f.outDir, `test-sound.${part}`);

/** (d) of SEEN FROM OUTSIDE: each line, over its own stretch of the voice track, is at the target. */
function expectLevels(f: SoundFixture, spec: ClipSoundSpec): void {
  const rec = recordOf(f.outDir);
  spec.voice.lines.forEach((l, i) => {
    const end = l.at + Number(rec.lines[i].words_end);
    const m = meter(out(f, "voice.wav"), `atrim=start=${l.at}:end=${end},`);
    expect(Math.abs(m.lufs - spec.voice.target_lufs)).toBeLessThanOrEqual(1);
  });
}
/** (e): silent just before each "at", sound soon after it. */
function expectPlacement(f: SoundFixture, spec: ClipSoundSpec): void {
  const voice = mono(out(f, "voice.wav"));
  for (const l of spec.voice.lines) {
    expect(level(voice, [l.at - 0.2, l.at])).toBeLessThan(-60);
    expect(level(voice, [l.at + 0.1, l.at + 0.3])).toBeGreaterThan(-40);
  }
}
/** (a): one video stream and one sound stream, and no planted title. */
function expectTwoStreams(film: string): void {
  const doc = probe(film);
  expect(doc.streams.map((s) => s.codec_type).sort()).toEqual(["audio", "video"]);
  expect(JSON.stringify(doc)).not.toContain(PLANTED_TITLE);
}

/** One run of the good fixture, shared by the tests that read its outputs. */
let shared: { f: SoundFixture; stdout: string } | undefined;
function laid(): { f: SoundFixture; stdout: string } {
  if (!shared) {
    const f = fixture();
    shared = { f, stdout: lay(f).out };
  }
  return shared;
}

/** The good fixture with other media or spec values, written as a spec of its own. */
function variant(f: SoundFixture, change: (s: ClipSoundSpec) => void): { spec: ClipSoundSpec; specPath: string } {
  const spec = clone(f.spec);
  change(spec);
  return { spec, specPath: writeSpec(f, "variant.json", spec) };
}
/** Make a media file in the fixture and return its spec reference. */
function media(f: SoundFixture, file: string, args: string[]): { file: string; sha256: string } {
  return { file, sha256: makeMedia(f.mediaDir, file, args) };
}

describe("clip sound: what apply writes", () => {
  ffTest("lay: the four files and the printed line; (a) one video and one sound stream, no input tag", () => {
    const { f, stdout } = laid();
    expect(stdout).toMatch(/^clip-sound: wrote test-sound sec=10 lines=2 voice-lufs=-?[\d.]+ mix-lufs=-?[\d.]+ mix-peak-db=-?[\d.]+\n$/);
    expect(fs.readdirSync(f.outDir).sort()).toEqual(FOUR);
    expect(JSON.stringify(probe(path.join(f.mediaDir, "picture.mp4")).format.tags)).toContain(PLANTED_TITLE);
    expectTwoStreams(out(f, "sound.mp4"));
  });

  ffTest("lay: (b) picture copied: stream hash, frame count and start time are those of the silent picture", () => {
    const { f } = laid();
    const picture = path.join(f.mediaDir, "picture.mp4");
    expect(streamHash(out(f, "sound.mp4"))).toBe(streamHash(picture));
    const video = (file: string) => probe(file).streams.find((s) => s.codec_type === "video") as Record<string, string>;
    expect(video(out(f, "sound.mp4")).nb_read_frames).toBe(video(picture).nb_read_frames);
    expect(video(picture).nb_read_frames).toBe("300");
    expect(video(out(f, "sound.mp4")).start_time).toBe(video(picture).start_time);
  });

  ffTest("lay: (c) stereo AAC at 48 kHz; film sound, voice track and bed file are as long as the picture", () => {
    const { f } = laid();
    const sound = probe(out(f, "sound.mp4")).streams.find((s) => s.codec_type === "audio") as Record<string, string>;
    expect(sound).toMatchObject({ codec_name: "aac", channels: 2, sample_rate: "48000" });
    expect(Math.abs(Number(sound.duration) - PICTURE_SEC)).toBeLessThanOrEqual(0.05);
    for (const part of ["voice.wav", "bed.wav"] as const) {
      expect(Math.abs(Number(probe(out(f, part)).streams[0].duration) - PICTURE_SEC)).toBeLessThanOrEqual(0.05);
    }
  });

  ffTest("lay: (d) each line is within 1 LU of target_lufs in the voice track", () => {
    const { f } = laid();
    // the two raw lines are far apart in loudness
    const rec = recordOf(f.outDir);
    expect(Math.abs(Number(rec.lines[0].in_lufs) - Number(rec.lines[1].in_lufs))).toBeGreaterThan(20);
    expectLevels(f, f.spec);
  });

  ffTest("lay: (e) the lines sit at their at times", () => {
    const { f } = laid();
    expectPlacement(f, f.spec);
  });

  ffTest("lay: (f) the bed is ducked under a line and the voice is far above it", () => {
    const { f } = laid();
    const voice = mono(out(f, "voice.wav"));
    const bed = mono(out(f, "bed.wav"));
    const between = level(bed, [4.1, 5.5]);
    for (const span of [[1.2, 2.8], [6.8, 8.3]] as [number, number][]) {
      expect(between - level(bed, span)).toBeGreaterThanOrEqual(8);
      expect(level(voice, span) - level(bed, span)).toBeGreaterThanOrEqual(15);
    }
  });

  ffTest("lay: (g) between lines the bed reads what the steady bed reads alone at level_lufs", () => {
    const { f } = laid();
    const source = path.join(f.mediaDir, "bed.wav");
    const gain = f.spec.bed.level_lufs - meter(source, "").lufs;
    expect(Math.abs(gain)).toBeGreaterThan(3); // the check can fail: the raw bed is not at the level
    const alone = level(mono(source), [4.1, 5.5]) + gain;
    expect(Math.abs(level(mono(out(f, "bed.wav")), [4.1, 5.5], [9.6, 10]) - alone)).toBeLessThanOrEqual(1.5);
  });

  ffTest("lay: (h) the true peak of the film is at most -1 dB", () => {
    const { f } = laid();
    expect(meter(out(f, "sound.mp4"), "").peak).toBeLessThanOrEqual(-1);
  });

  ffTest("lay: (i) repeat: two runs in two empty folders give byte-equal files", () => {
    const { f } = laid();
    const second = tmp("second");
    lay(f, { out: second });
    expect(snapshot(second)).toEqual(snapshot(f.outDir));
    expect(snapshot(second)).toHaveLength(4);
  });

  ffTest("lay: (j) the OS temp folder is empty after a run of the CLI", () => {
    const f = fixture();
    const r = cli(argsOf(f));
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^clip-sound: wrote test-sound /);
    expect(r.tmpLeft).toEqual([]);
    expect(fs.readdirSync(f.outDir).sort()).toEqual(FOUR);
  });

  ffTest("lay: (k) the voice track is mono and the bed file stereo, both pcm_s16le", () => {
    const { f } = laid();
    expect(probe(out(f, "voice.wav")).streams).toEqual([expect.objectContaining({ codec_name: "pcm_s16le", channels: 1 })]);
    expect(probe(out(f, "bed.wav")).streams).toEqual([expect.objectContaining({ codec_name: "pcm_s16le", channels: 2 })]);
  });

  ffTest("line-peak: a line whose plain gain would pass full scale is held to -1.4 dB in the voice track", () => {
    const f = fixture();
    // a quiet tone with one burst of 1 ms near full scale
    const loud = media(f, "peaky.wav", soundArgs("aevalsrc='if(between(t,1,1.001),0.9,0.05*sin(2*PI*700*t))':s=48000:d=2"));
    const { specPath } = variant(f, (s) => Object.assign(s.voice.lines[0], loud));
    lay(f, { spec: specPath });
    const gain = Number(recordOf(f.outDir).lines[0].gain_db);
    expect(db(0.9) + gain).toBeGreaterThan(0);
    expect(samplePeak(mono(out(f, "voice.wav")))).toBeLessThanOrEqual(-1.4);
  });

  ffTest("hot sum: a hot bed does not take the film above 0 dB true peak", () => {
    const f = fixture();
    // hot bed: quiet between full-level bursts of 2 ms, in both channels
    const burst = "if(lt(mod(t,1),0.002),0.99*sin(2*PI*1000*t),0.001*sin(2*PI*440*t))";
    const hot = media(f, "hot.wav", soundArgs(`aevalsrc='${burst}|${burst}':s=48000:d=${BED_SEC}`));
    const { specPath } = variant(f, (s) => {
      Object.assign(s.bed, hot);
      s.bed.level_lufs = -18;
    });
    lay(f, { spec: specPath });
    expect(db(0.99) + Number(recordOf(f.outDir).bed.gain_db)).toBeGreaterThan(2);
    expect(meter(out(f, "sound.mp4"), "").peak).toBeLessThanOrEqual(0);
  });

  ffTest("tail: lines whose files overlap by a silent tail only are laid, with their ends of words", () => {
    const f = fixture();
    const first = media(f, "long-tail.wav", noiseArgs(0.3, 1.5, 1.5));
    const { spec, specPath } = variant(f, (s) => {
      Object.assign(s.voice.lines[0], first);
      s.voice.lines[1].at = 2.8; // the file of line a runs to 4 s, its words end at 2.5 s
    });
    lay(f, { spec: specPath });
    const rec = recordOf(f.outDir);
    expect(rec.lines[0].sec).toBe(3);
    expect(Math.abs(Number(rec.lines[0].words_end) - 1.5)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(Number(rec.lines[1].words_end) - 2)).toBeLessThanOrEqual(0.1);
    expect(spec.voice.lines[0].at + Number(rec.lines[0].sec)).toBeGreaterThan(spec.voice.lines[1].at);
    expectPlacement(f, spec);
  });

  ffTest("tail cut: what the file holds behind the end of the words is not laid", () => {
    const f = fixture();
    // 1.5 s of tone, then a faint tone below -60 dB that the end of the words leaves out
    const faint = media(f, "faint-tail.wav", soundArgs("aevalsrc='if(lt(t,1.5),0.2,0.0003)*sin(2*PI*700*t)':s=48000:d=3"));
    const { spec, specPath } = variant(f, (s) => Object.assign(s.voice.lines[0], faint));
    lay(f, { spec: specPath });
    expect(Math.abs(Number(recordOf(f.outDir).lines[0].words_end) - 1.5)).toBeLessThanOrEqual(0.1);
    expect(level(mono(path.join(f.mediaDir, faint.file)), [1.6, 2.9])).toBeGreaterThan(-80); // the check can fail
    const at = spec.voice.lines[0].at;
    expect(samplePeak(mono(out(f, "voice.wav")).subarray((at + 1.6) * 48000, (at + 2.9) * 48000))).toBeLessThan(-100);
  });

  ffTest("quiet line: a line at about -64 dB keeps its words", () => {
    const f = fixture();
    const quiet = media(f, "quiet.wav", soundArgs("anoisesrc=color=white:amplitude=0.0008:duration=2:sample_rate=48000:seed=3", "apad=pad_dur=1"));
    const { specPath } = variant(f, (s) => Object.assign(s.voice.lines[0], quiet));
    lay(f, { spec: specPath });
    const line = recordOf(f.outDir).lines[0];
    expect(Number(line.in_lufs)).toBeLessThan(-60);
    expect(Math.abs(Number(line.words_end) - 2)).toBeLessThanOrEqual(0.1);
  });

  ffTest("odd names: file names with filter and protocol signs are laid like plain names", () => {
    const f = fixture();
    fs.copyFileSync(path.join(f.mediaDir, "line-a.wav"), path.join(f.mediaDir, "a,b;[c]=d 'e'.wav"));
    fs.copyFileSync(path.join(f.mediaDir, "line-b.wav"), path.join(f.mediaDir, "x:y.wav"));
    const { spec, specPath } = variant(f, (s) => {
      s.voice.lines[0].file = "a,b;[c]=d 'e'.wav";
      s.voice.lines[1].file = "x:y.wav";
    });
    lay(f, { spec: specPath });
    expectLevels(f, spec);
    expectPlacement(f, spec);
  });

  ffTest("cover: a line and a bed with a cover picture are laid, and the picture does not reach the film", () => {
    const f = fixture();
    const png = path.join(f.root, "cover.png");
    makeMedia(f.root, "cover.png", ["-f", "lavfi", "-i", "color=c=red:s=64x64", "-frames:v", "1"]);
    const withCover = (name: string, from: string) =>
      media(f, name, ["-i", path.join(f.mediaDir, from), "-i", png, "-map", "0:a", "-map", "1:v", "-c:a", "aac", "-c:v", "png", "-disposition:v", "attached_pic"]);
    const line = withCover("cover-line.m4a", "line-a.wav");
    const bed = withCover("cover-bed.m4a", "bed.wav");
    expect(probe(path.join(f.mediaDir, line.file)).streams.map((s) => s.codec_type)).toContain("video");
    const { specPath } = variant(f, (s) => {
      Object.assign(s.voice.lines[0], line);
      Object.assign(s.bed, bed);
    });
    lay(f, { spec: specPath });
    expectTwoStreams(out(f, "sound.mp4"));
  });
});

describe("clip sound: the record, the dry run and the graph", () => {
  ffTest("record: the exact key set, the hashes, the constants, no path", () => {
    const { f } = laid();
    const rec = recordOf(f.outDir);
    const keys = (o: unknown): string[] => Object.keys(o as object).sort();
    const same = (o: unknown, list: string): void => expect(keys(o)).toEqual(list.split(" ").sort());
    same(rec, "schema spec_sha256 slug picture lines bed mix measured outputs ffmpeg");
    same(rec.picture, "file sha256 video_stream_sha256 frames sec");
    const lineKeys = "id file sha256 at sec words_end in_lufs gain_db out_lufs";
    expect(rec.lines).toHaveLength(2);
    same(rec.lines[0], `${lineKeys} window`);
    same(rec.lines[1], lineKeys);
    expect(rec.lines[0].window).toEqual({ from: 0.5, to: 4 });
    same(rec.lines[0].window, "from to");
    same(rec.bed, "file sha256 sec in_lufs gain_db");
    expect(rec.mix).toEqual({
      target_lufs: -16,
      level_lufs: -24,
      line_limit: 0.84,
      line_attack_ms: 2,
      line_release_ms: 40,
      duck_threshold: 0.03,
      duck_ratio: 4,
      duck_attack_ms: 20,
      duck_release_ms: 500,
      sum_limit: 0.84,
      sum_attack_ms: 5,
      sum_release_ms: 50,
      sample_rate: 48000,
      aac_kbps: 192,
    });
    same(rec.measured, "voice_lufs mix_lufs mix_peak_db");
    same(rec.outputs, "film voice bed");
    for (const o of Object.values(rec.outputs)) same(o, "file sha256");

    expect((rec as unknown as { schema: string }).schema).toBe("clip-sound-record/1");
    expect(rec.spec_sha256).toBe(sha256File(f.specPath));
    const input = (name: string): string => sha256File(path.join(f.mediaDir, name));
    expect(rec.picture).toMatchObject({ file: "picture.mp4", sha256: input("picture.mp4"), frames: 300, sec: PICTURE_SEC });
    expect(`0,v,SHA256=${rec.picture.video_stream_sha256}`).toBe(streamHash(path.join(f.mediaDir, "picture.mp4")));
    expect(rec.lines[0]).toMatchObject({ id: "line-a", file: "line-a.wav", sha256: input("line-a.wav"), at: 1, sec: 2.5 });
    expect(rec.lines[1]).toMatchObject({ id: "line-b", file: "line-b.wav", sha256: input("line-b.wav"), at: 6.537, sec: 2 });
    expect(rec.bed).toMatchObject({ file: "bed.wav", sha256: input("bed.wav"), sec: BED_SEC });
    expect(rec.outputs.film).toEqual({ file: "test-sound.sound.mp4", sha256: sha256File(out(f, "sound.mp4")) });
    expect(rec.outputs.voice).toEqual({ file: "test-sound.voice.wav", sha256: sha256File(out(f, "voice.wav")) });
    expect(rec.outputs.bed).toEqual({ file: "test-sound.bed.wav", sha256: sha256File(out(f, "bed.wav")) });
    expect(rec.ffmpeg).toMatch(/^ffmpeg version /);
    const files = [rec.picture, ...rec.lines, rec.bed, ...Object.values(rec.outputs)].map((o) => String(o.file));
    for (const file of files) expect(file).not.toContain("/");
    expect(JSON.stringify(rec)).not.toContain(f.root);
  });

  ffTest("dry: the printed lines, nothing in --out or the OS temp folder, the gains of a real run", () => {
    const f = fixture();
    const r = cli(argsOf(f, {}, ["--dry"]));
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(fs.readdirSync(f.outDir)).toEqual([]);
    expect(r.tmpLeft).toEqual([]);
    const rec = recordOf(laid().f.outDir);
    expect(r.out).toBe(
      [
        "clip-sound: dry-run (nothing written)",
        ...rec.lines.map((l) => `clip-sound: line id=${l.id} at=${l.at} sec=${l.sec} words-end=${l.words_end} in-lufs=${l.in_lufs} gain-db=${l.gain_db}`),
        `clip-sound: bed sec=${rec.bed.sec} in-lufs=${rec.bed.in_lufs} gain-db=${rec.bed.gain_db}`,
        "",
      ].join("\n"),
    );
  });

  test("graph: the numbers of the passed mix are in the graph text and the argument list", () => {
    const g = buildSoundGraph(
      goodSpec(),
      { lineGainsDb: [3, -4.5], wordSamples: [96000, 48000], bedGainDb: -6, bedSamples: 576000, pictureSamples: 480000 },
      { picture: "/m/p.mp4", lines: ["/m/a.wav", "/m/b.wav"], bed: "/m/bed.wav", voiceOut: "/o/v.wav", bedOut: "/o/b.wav", filmOut: "/o/f.mp4" },
    );
    const count = (part: string): number => g.mix.split(part).length - 1;
    expect(g.text).toContain("sidechaincompress=threshold=0.03:ratio=4:attack=20:release=500,");
    expect(count("alimiter=limit=0.84:attack=2:release=40:level=false,")).toBe(2); // one per line
    expect(count("alimiter=limit=0.84:attack=5:release=50:level=false[")).toBe(1); // the sum
    expect(g.text.match(/alimiter/g)).toHaveLength(g.text.match(/level=false/g)?.length ?? 0);
    expect(g.lineProbes).toHaveLength(2);
    for (const p of g.lineProbes) {
      expect(p).toContain("alimiter=limit=0.84:attack=2:release=40:level=false,silencedetect=noise=-60dB:d=0.1");
      expect(g.text).toContain(p);
    }
    expect(g.args.join(" ")).toContain("-c:v copy -c:a aac -b:a 192k -ar 48000 ");
    expect(g.args[g.args.indexOf("-filter_complex") + 1]).toBe(g.mix);
    expect(g.text).not.toMatch(/\.wav|\.mp4|line-a/);
  });
});

describe("clip sound: the bed fade", () => {
  /** The fade lengths of the tests: 2.4 s in (115200 samples) and 2.2 s out (105600 samples). */
  const FADE = { fade_in_sec: 2.4, fade_out_sec: 2.2 };
  const file = (dir: string, part: "sound.mp4" | "voice.wav" | "bed.wav"): string => path.join(dir, `test-sound.${part}`);

  const NUMS = { lineGainsDb: [3, -4.5], wordSamples: [96000, 48000], bedGainDb: -6, bedSamples: 576000, pictureSamples: 480000 };
  const PATHS = { picture: "/m/p.mp4", lines: ["/m/a.wav", "/m/b.wav"], bed: "/m/bed.wav", voiceOut: "/o/v.wav", bedOut: "/o/b.wav", filmOut: "/o/f.mp4" };
  /** The graph of the numbers of test "graph", with the spec changed and, if wanted, another bed length. */
  const graph = (change: (s: ClipSoundSpec) => void = () => undefined, bedSamples = NUMS.bedSamples) => {
    const spec = goodSpec();
    change(spec);
    return buildSoundGraph(spec, { ...NUMS, bedSamples }, PATHS);
  };
  const count = (text: string, part: string): number => text.split(part).length - 1;
  /** The chain of the bed input, up to its label [bed]. */
  const bedChain = (text: string): string => /\[3:a:0\][^;\n]*\[bed\]/.exec(text)?.[0] ?? "";
  const both = (s: ClipSoundSpec): void => void Object.assign(s.bed, FADE);

  test("fade keys: a fade key is a number above 0 and up to 10 with at most 3 decimals; no key is no fade", () => {
    const good: [string, number | undefined, number | undefined][] = [
      ["both at 0.001", 0.001, 0.001],
      ["both at 10", 10, 10],
      ["2.4 and 2.2", 2.4, 2.2],
      ["fade_in_sec alone", 2.4, undefined],
      ["fade_out_sec alone", undefined, 2.2],
    ];
    for (const [name, fadeIn, fadeOut] of good) {
      const s = clone(goodSpec());
      if (fadeIn !== undefined) s.bed.fade_in_sec = fadeIn;
      if (fadeOut !== undefined) s.bed.fade_out_sec = fadeOut;
      expect([name, validateSpec(s)]).toEqual([name, []]);
    }
    // the reason line names the key and the value
    const bad = clone(goodSpec());
    bad.bed.fade_out_sec = 0;
    expect(validateSpec(bad)).toEqual(["bad-fade: bed.fade_out_sec is 0, not a number above 0 and up to 10 with at most 3 decimals"]);
  });

  test("fade graph: the fades are two straight lines on the bed, behind its cut and before the duck", () => {
    const FADE_IN = "afade=t=in:ss=0:ns=115200:curve=tri";
    const FADE_OUT = "afade=t=out:ss=374400:ns=105600:curve=tri";
    const MONO = "aformat=sample_fmts=fltp,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono,asetpts=N/SR/TB";
    const STEREO = "aformat=sample_fmts=fltp,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=N/SR/TB";
    const LINE = "alimiter=limit=0.84:attack=2:release=40:level=false";
    const BED_HEAD = `[3:a:0]${STEREO},volume=-6dB,atrim=end_sample=480000`;
    // the text and the arguments this call gives without the keys, as the tool gave them before the fade keys
    const BASE_MIX = [
      `[1:a:0]${MONO},volume=3dB,${LINE},atrim=end_sample=96000,adelay=delays=48000S:all=1[l0]`,
      `[2:a:0]${MONO},volume=-4.5dB,${LINE},atrim=end_sample=48000,adelay=delays=313776S:all=1[l1]`,
      "[l0][l1]amix=inputs=2:duration=longest:normalize=0,apad=whole_len=480000,atrim=end_sample=480000,asplit=2[voiceout][voicemono]",
      "[voicemono]aformat=channel_layouts=stereo,asplit=2[keyshort][voicest]",
      "[keyshort]apad=pad_len=576000[key]",
      `${BED_HEAD}[bed]`,
      "[bed][key]sidechaincompress=threshold=0.03:ratio=4:attack=20:release=500,asplit=2[bedout][bedsum]",
      "[voicest][bedsum]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.84:attack=5:release=50:level=false[mix]",
    ].join(";");
    const BASE_TEXT = [`${MONO},volume=3dB,${LINE},silencedetect=noise=-60dB:d=0.1`, `${MONO},volume=-4.5dB,${LINE},silencedetect=noise=-60dB:d=0.1`, BASE_MIX].join("\n");
    const BASE_ARGS = [
      "-y",
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "/m/p.mp4",
      "-i",
      "/m/a.wav",
      "-i",
      "/m/b.wav",
      "-i",
      "/m/bed.wav",
      "-filter_complex",
      BASE_MIX,
      "-map",
      "[voiceout]",
      "-map_metadata",
      "-1",
      "-c:a",
      "pcm_s16le",
      "/o/v.wav",
      "-map",
      "[bedout]",
      "-map_metadata",
      "-1",
      "-c:a",
      "pcm_s16le",
      "/o/b.wav",
      "-map",
      "0:v:0",
      "-map",
      "[mix]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-map_metadata",
      "-1",
      "-map_chapters",
      "-1",
      "-movflags",
      "+faststart",
      "/o/f.mp4",
    ];
    const g = graph(both);
    expect(count(g.text, "afade=")).toBe(2);
    expect(count(g.text, FADE_IN)).toBe(1);
    expect(count(g.text, FADE_OUT)).toBe(1);
    const chain = bedChain(g.mix);
    const [cut, rest] = chain.split("atrim=end_sample=480000");
    expect(cut).toContain("aresample=48000");
    expect(rest).toBe(`,${FADE_IN},${FADE_OUT}[bed]`);
    // the duck and the sum take the faded bed; no fade stands behind the duck
    expect(g.mix.slice(g.mix.indexOf("sidechaincompress"), g.mix.indexOf("[mix]"))).not.toContain("afade");
    expect(g.mix.slice(0, g.mix.indexOf("[3:a:0]"))).not.toContain("afade");
    expect(g.args[g.args.indexOf("-filter_complex") + 1]).toBe(g.mix);

    // a bed 0.04 s short: the fade out ends with the bed, not with the picture
    const short = graph(both, 478080);
    expect(count(short.text, "afade=")).toBe(2);
    expect(bedChain(short.mix)).toBe(`${BED_HEAD},${FADE_IN},afade=t=out:ss=372480:ns=105600:curve=tri[bed]`);

    // one key, one fade
    const outOnly = graph((s) => void (s.bed.fade_out_sec = 2.2));
    expect(count(outOnly.text, "afade=")).toBe(1);
    expect(bedChain(outOnly.mix)).toBe(`${BED_HEAD},${FADE_OUT}[bed]`);
    const inOnly = graph((s) => void (s.bed.fade_in_sec = 2.4));
    expect(count(inOnly.text, "afade=")).toBe(1);
    expect(bedChain(inOnly.mix)).toBe(`${BED_HEAD},${FADE_IN}[bed]`);

    // 0.009 s is 432 samples: the count is rounded, not cut
    expect(bedChain(graph((s) => void (s.bed.fade_in_sec = 0.009)).mix)).toBe(`${BED_HEAD},afade=t=in:ss=0:ns=432:curve=tri[bed]`);

    // no key: no fade filter, and the text and the arguments are those of the tool before the fade
    const none = graph();
    expect(count(none.text, "afade")).toBe(0);
    expect(none.text).toBe(BASE_TEXT);
    expect(none.args).toEqual(BASE_ARGS);
  });

  ffTest("fade lay: 2.4 s in and 2.2 s out on the good fixture, beside the same run without the keys", () => {
    const f = fixture();
    const plain = tmp("plain");
    const faded = tmp("faded");
    lay(f, { out: plain });
    const v = variant(f, both);
    const r = runCli(argsOf(f, { spec: v.specPath, out: faded }));
    // (a) exit 0, the printed line of today, the four files
    expect([r.code, r.err]).toEqual([0, ""]);
    expect(r.out).toMatch(/^clip-sound: wrote test-sound sec=10 lines=2 voice-lufs=-?[\d.]+ mix-lufs=-?[\d.]+ mix-peak-db=-?[\d.]+\n$/);
    expect(fs.readdirSync(plain).sort()).toEqual(FOUR);
    expect(fs.readdirSync(faded).sort()).toEqual(FOUR);

    const bed = mono(file(faded, "bed.wav"));
    const plainBed = mono(file(plain, "bed.wav"));
    const middle = level(bed, [4.1, 5.5]);
    const under = (pcm: Float32Array, ref: number, span: [number, number]): number => ref - level(pcm, span);
    // (b) faded ends; the run without the keys is level there
    expect(under(bed, middle, [0, 0.4])).toBeGreaterThanOrEqual(12);
    expect(under(bed, middle, [9.6, 10])).toBeGreaterThanOrEqual(12);
    const plainMiddle = level(plainBed, [4.1, 5.5]);
    for (const span of [
      [0, 0.4],
      [9.6, 10],
    ] as [number, number][])
      expect(Math.abs(under(plainBed, plainMiddle, span))).toBeLessThanOrEqual(1.5);
    // (c) silent at the ends
    expect(under(bed, middle, [0, 0.005])).toBeGreaterThanOrEqual(45);
    expect(under(bed, middle, [9.995, 10])).toBeGreaterThanOrEqual(45);
    // (d) a straight line: the gain is 0.5 / 2.4 and 0.25 / 2.2 in the two spans
    expect(Math.abs(under(bed, middle, [0.45, 0.55]) - 13.61)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(under(bed, middle, [9.7, 9.8]) - 18.83)).toBeLessThanOrEqual(0.5);
    // (e) the middle is as before, sample by sample: the duck under the voice is the one of today
    const diff: number[] = [];
    for (let i = 2.4 * 48000; i < 7.8 * 48000; i++) if (bed[i] !== plainBed[i]) diff.push(i);
    expect(diff).toEqual([]);
    // (f) the voice file is byte-equal with and without the keys
    expect(fs.readFileSync(file(faded, "voice.wav")).equals(fs.readFileSync(file(plain, "voice.wav")))).toBe(true);
    // (g) the narrator is not faded in the film: line a plays from 1 to 3 s, inside the fade in
    const film = mono(file(faded, "sound.mp4"));
    const plainFilm = mono(file(plain, "sound.mp4"));
    expect(Math.abs(level(film, [1.2, 2.2]) - level(plainFilm, [1.2, 2.2]))).toBeLessThanOrEqual(1);
    // (h) the film has the fade
    const filmMiddle = level(film, [4.1, 5.5]);
    expect(under(film, filmMiddle, [0, 0.4])).toBeGreaterThanOrEqual(12);
    expect(under(film, filmMiddle, [9.6, 10])).toBeGreaterThanOrEqual(12);
    // (i) picture copied, lengths, peak: checks (b), (c), (h) and (k) of test "lay" on this run
    const picture = path.join(f.mediaDir, "picture.mp4");
    const filmFile = file(faded, "sound.mp4");
    expect(streamHash(filmFile)).toBe(streamHash(picture));
    const video = (p: string) => probe(p).streams.find((s) => s.codec_type === "video") as Record<string, string>;
    expect(video(picture).nb_read_frames).toBe("300");
    expect(video(filmFile).nb_read_frames).toBe(video(picture).nb_read_frames);
    expect(video(filmFile).start_time).toBe(video(picture).start_time);
    expect(probe(filmFile).streams.find((s) => s.codec_type === "audio")).toMatchObject({ codec_name: "aac", channels: 2, sample_rate: "48000" });
    for (const p of [filmFile, file(faded, "voice.wav"), file(faded, "bed.wav")]) {
      expect(Math.abs(Number(probe(p).streams[0].duration) - PICTURE_SEC)).toBeLessThanOrEqual(0.05);
    }
    expect(meter(filmFile, "").peak).toBeLessThanOrEqual(-1);
    expect(probe(file(faded, "voice.wav")).streams).toEqual([expect.objectContaining({ codec_name: "pcm_s16le", channels: 1 })]);
    expect(probe(file(faded, "bed.wav")).streams).toEqual([expect.objectContaining({ codec_name: "pcm_s16le", channels: 2 })]);
    // (j) repeat: two runs with the keys in two empty folders give four byte-equal files
    const again = [tmp("again"), tmp("again")];
    for (const dir of again) lay(f, { spec: v.specPath, out: dir });
    expect(snapshot(again[0])).toEqual(snapshot(again[1]));
    expect(snapshot(again[0])).toHaveLength(4);
  });

  ffTest("one fade: fade_out_sec alone fades the end only, fade_in_sec alone the start only", () => {
    const f = fixture();
    const sides: [string, (s: ClipSoundSpec) => void][] = [
      ["fade_out_sec", (s) => void (s.bed.fade_out_sec = 2.2)],
      ["fade_in_sec", (s) => void (s.bed.fade_in_sec = 2.4)],
    ];
    for (const [key, change] of sides) {
      const dir = tmp("one");
      lay(f, { spec: variant(f, change).specPath, out: dir });
      const bed = mono(file(dir, "bed.wav"));
      const middle = level(bed, [4.1, 5.5]);
      const start = middle - level(bed, [0, 0.4]);
      const end = middle - level(bed, [9.6, 10]);
      const [fadedStart, fadedEnd] = [start >= 12, end >= 12];
      const [levelStart, levelEnd] = [start <= 1.5, end <= 1.5];
      expect([key, key === "fade_out_sec" ? [levelStart, fadedEnd] : [fadedStart, levelEnd]]).toEqual([key, [true, true]]);
    }
  });

  const endsAndLine = (pcm: Float32Array): number[] => {
    const middle = level(pcm, [4.1, 5.5]);
    // (c) the first and the last 0.005 s; (d) the two spans of the straight line
    return [middle - level(pcm, [0, 0.005]), middle - level(pcm, [9.995, 10]), middle - level(pcm, [0.45, 0.55]), middle - level(pcm, [9.7, 9.8])];
  };

  ffTest("fade lay 44.1: a bed at 44.1 kHz is faded behind its resample: the marks do not move", () => {
    const f = fixture();
    // the bed of the fixture, made at another rate
    const slow = media(f, "bed-441.wav", soundArgs("sine=frequency=440:sample_rate=44100:duration=12", "volume=6dB,aformat=channel_layouts=stereo"));
    lay(f, { spec: variant(f, (s) => void Object.assign(s.bed, slow, FADE)).specPath });
    expect(Number(recordOf(f.outDir).bed.sec)).toBe(12);
    const [head, tail, rise, fall] = endsAndLine(mono(out(f, "bed.wav")));
    expect(head).toBeGreaterThanOrEqual(45);
    expect(tail).toBeGreaterThanOrEqual(45);
    expect(Math.abs(rise - 13.61)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(fall - 18.83)).toBeLessThanOrEqual(0.5);
  });

  ffTest("short bed fade: the fade out ends with a bed that is 0.04 s shorter than the picture", () => {
    const f = fixture();
    const short = media(f, "short-bed.wav", toneArgs(PICTURE_SEC - 0.04));
    lay(f, { spec: variant(f, (s) => void Object.assign(s.bed, short, { fade_out_sec: 1 })).specPath });
    const pcm = mono(out(f, "bed.wav"));
    expect(pcm).toHaveLength(478080);
    const bedEnd = 478080 / 48000;
    expect(level(pcm, [4.1, 5.5]) - level(pcm, [bedEnd - 0.005, bedEnd])).toBeGreaterThanOrEqual(45);
  });

  ffTest("fade record: the bed section holds a fade key when the spec gave it, and then only", () => {
    const f = fixture();
    const keys = (o: unknown): string[] => Object.keys(o as object).sort();
    const v = variant(f, both);
    // a dry run with the keys prints what a dry run without them prints, and writes nothing
    const dry = cli(argsOf(f, { spec: v.specPath }, ["--dry"]));
    const plainDry = cli(argsOf(f, {}, ["--dry"]));
    expect([dry.code, dry.err, dry.tmpLeft, plainDry.out]).toEqual([0, "", [], dry.out]);
    expect(fs.readdirSync(f.outDir)).toEqual([]);
    lay(f, { spec: v.specPath });
    const rec = recordOf(f.outDir);
    expect(keys(rec)).toEqual("schema spec_sha256 slug picture lines bed mix measured outputs ffmpeg".split(" ").sort());
    expect(keys(rec.picture)).toEqual("file sha256 video_stream_sha256 frames sec".split(" ").sort());
    expect(keys(rec.lines[0])).toEqual("id file sha256 at sec words_end in_lufs gain_db out_lufs window".split(" ").sort());
    expect(keys(rec.lines[1])).toEqual("id file sha256 at sec words_end in_lufs gain_db out_lufs".split(" ").sort());
    expect(rec.mix).toEqual(recordOf(laid().f.outDir).mix);
    expect(keys(rec.measured)).toEqual(["mix_lufs", "mix_peak_db", "voice_lufs"]);
    expect(keys(rec.outputs)).toEqual(["bed", "film", "voice"]);
    expect(keys(rec.bed)).toEqual("file sha256 sec in_lufs gain_db fade_in_sec fade_out_sec".split(" ").sort());
    expect(rec.bed).toMatchObject({ file: "bed.wav", sha256: f.spec.bed.sha256, sec: BED_SEC, fade_in_sec: 2.4, fade_out_sec: 2.2 });
    expect(rec.outputs.bed).toEqual({ file: "test-sound.bed.wav", sha256: sha256File(out(f, "bed.wav")) });
    expect((rec as unknown as { schema: string }).schema).toBe("clip-sound-record/1");
    // one key given: that key alone is written
    lay(f, { spec: variant(f, (s) => void (s.bed.fade_out_sec = 2.2)).specPath });
    const one = recordOf(f.outDir).bed;
    expect(keys(one)).toEqual("file sha256 sec in_lufs gain_db fade_out_sec".split(" ").sort());
    expect(one).toMatchObject({ fade_out_sec: 2.2 });
    // the run without the keys writes neither; a dry run prints the lines of today, with the keys or without
    expect(keys(recordOf(laid().f.outDir).bed)).toEqual("file sha256 sec in_lufs gain_db".split(" ").sort());
  });

  ffTest("fade-too-long: the two fades together are longer than the laid bed, with --dry too; the edge passes", () => {
    const f = fixture();
    const fades = (fade_in_sec: number, fade_out_sec: number) =>
      variant(f, (s) => void Object.assign(s.bed, { fade_in_sec, fade_out_sec })).specPath;
    refused(argsOf(f, { spec: fades(6, 4.001) }), "fade-too-long", f.outDir);
    refused(argsOf(f, { spec: fades(6, 4.001) }, ["--dry"]), "fade-too-long", f.outDir);
    // the edge: 10 s of fades on a laid bed of 480000 samples
    lay(f, { spec: fades(6, 4) });
    expect(recordOf(f.outDir).bed).toMatchObject({ fade_in_sec: 6, fade_out_sec: 4 });
    lay(f, { spec: variant(f, (s) => void (s.bed.fade_in_sec = 10)).specPath });
    expect(recordOf(f.outDir).bed).toMatchObject({ fade_in_sec: 10 });
    // a bed 0.04 s short: its own end is what the fades share
    const short = media(f, "short-bed.wav", toneArgs(PICTURE_SEC - 0.04));
    refused(argsOf(f, { spec: variant(f, (s) => void Object.assign(s.bed, short, { fade_in_sec: 6, fade_out_sec: 4 })).specPath }), "fade-too-long", f.outDir);
  });

  ffTest("bed-too-short: a bed 0.1 s short is refused with the fade keys given; it is not padded for a fade", () => {
    const f = fixture();
    const short = media(f, "short-bed.wav", toneArgs(PICTURE_SEC - 0.1));
    refused(argsOf(f, { spec: variant(f, (s) => void Object.assign(s.bed, short, FADE)).specPath }), "bed-too-short", f.outDir);
  });
});

describe("clip sound: fail closed", () => {
  /** One planted spec per listed case: [code, name, plant]. A text replaces the whole spec. */
  type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const set = (pick: (s: Loose) => Loose, key: string, value: unknown) => (s: Loose) => void (pick(s)[key] = value);
  const root = (s: Loose): Loose => s;
  const line = (i: number) => (s: Loose): Loose => s.voice.lines[i];
  const voice = (s: Loose): Loose => s.voice;
  const bed = (s: Loose): Loose => s.bed;
  const manyLines = (n: number): Line[] =>
    Array.from({ length: n }, (_, i) => ({ id: `l${i}`, file: "a.wav", sha256: SHA, at: i }));

  const cases: [string, string, ((s: Loose) => void) | string][] = [
    ["bad-schema", "not an object", "[1]"],
    ["bad-schema", "null", "null"],
    ["bad-schema", "another schema text", set(root, "schema", "clip-sound/2")],
    ["bad-schema", "picture not an object", set(root, "picture", "picture.mp4")],
    ["bad-schema", "voice not an object", set(root, "voice", [])],
    ["bad-schema", "bed not an object", set(root, "bed", null)],
    ["bad-schema", "lines not a list", set(voice, "lines", {})],
    ["bad-schema", "a line not an object", set((s) => s.voice.lines, "1", "line")],
    ["unknown-key", "a key beside the five of the spec", set(root, "extra", 1)],
    ["unknown-key", "a picture key", set((s) => s.picture, "extra", 1)],
    ["unknown-key", "a voice key", set(voice, "extra", 1)],
    ["unknown-key", "a bed key", set(bed, "extra", 1)],
    ["unknown-key", "a fifth key in a line", set(line(1), "gain", 1)],
    ["unknown-key", "a window key", set((s) => s.voice.lines[0].window, "extra", 1)],
    ["unknown-key", "the key constructor", set(line(1), "constructor", 1)],
    ["unknown-key", "the key __proto__", JSON.stringify(goodSpec()).replace('"slug"', '"__proto__":1,"slug"')],
    ["bad-slug", "upper case", set(root, "slug", "Test")],
    ["bad-slug", "a leading dash", set(root, "slug", "-a")],
    ["bad-slug", "65 characters", set(root, "slug", "a".repeat(65))],
    ["bad-slug", "empty", set(root, "slug", "")],
    ["bad-id", "a space", set(line(0), "id", "a b")],
    ["bad-id", "65 characters", set(line(0), "id", "a".repeat(65))],
    ["id-twice", "two lines with one id", set(line(1), "id", "line-a")],
    ["bad-file", "a slash", set(line(0), "file", "a/b.wav")],
    ["bad-file", "a backslash", set(line(0), "file", "a\\b.wav")],
    ["bad-file", "two dots", set(line(0), "file", "..")],
    ["bad-file", "two dots inside", set(line(0), "file", "a..wav")],
    ["bad-file", "a leading dot", set(line(0), "file", ".a.wav")],
    ["bad-file", "a leading dash", set(line(0), "file", "-a.wav")],
    ["bad-file", "empty", set(line(0), "file", "")],
    ["bad-file", "201 characters", set(line(0), "file", "a".repeat(201))],
    ["bad-file", "the picture file", set((s) => s.picture, "file", "a/p.mp4")],
    ["bad-file", "the bed file", set(bed, "file", "a/bed.wav")],
    ["bad-sha", "upper case", set(line(0), "sha256", SHA.toUpperCase())],
    ["bad-sha", "63 characters", set(line(0), "sha256", SHA.slice(1))],
    ["bad-sha", "65 characters", set(line(0), "sha256", `${SHA}a`)],
    ["bad-sha", "the picture hash", set((s) => s.picture, "sha256", "x")],
    ["bad-sha", "the bed hash", set(bed, "sha256", "x")],
    ["bad-level", "target -30", set(voice, "target_lufs", -30)],
    ["bad-level", "target -8", set(voice, "target_lufs", -8)],
    ["bad-level", "target a text", set(voice, "target_lufs", "-16")],
    ["bad-level", "target not finite", JSON.stringify(goodSpec()).replace('"target_lufs":-16', '"target_lufs":-1e999')],
    ["bad-level", "level -10", set(bed, "level_lufs", -10)],
    ["bad-level", "level -41", set(bed, "level_lufs", -41)],
    ["no-lines", "an empty list", set(voice, "lines", [])],
    ["too-many-lines", "41 lines", set(voice, "lines", manyLines(41))],
    ["bad-time", "at negative", set(line(0), "at", -1)],
    ["bad-time", "at a text", set(line(1), "at", "6")],
    ["bad-time", "at not finite", JSON.stringify(goodSpec()).replace('"at":6.537', '"at":1e999')],
    ["bad-time", "at 1.0005", set(line(0), "at", 1.0005)],
    ["line-order", "not rising", set(line(1), "at", 0.5)],
    ["line-order", "two lines with the same at", set(line(1), "at", 1)],
    ["bad-window", "to equal to from", set(line(0), "window", { from: 1, to: 1 })],
    ["bad-window", "to below from", set(line(0), "window", { from: 1, to: 0.5 })],
    ["bad-window", "at equal to to", set(line(0), "window", { from: 0, to: 1 })],
    ["bad-window", "at before the window", set(line(0), "window", { from: 2, to: 4 })],
    ["bad-window", "at after the window", set(line(0), "window", { from: 0, to: 0.9 })],
    ["bad-window", "from negative", set(line(0), "window", { from: -1, to: 4 })],
    ["bad-window", "not an object", set(line(0), "window", [0, 4])],
    ["bad-fade", "fade_in_sec 0", set(bed, "fade_in_sec", 0)],
    ["bad-fade", "fade_in_sec negative", set(bed, "fade_in_sec", -1)],
    ["bad-fade", "fade_in_sec 10.001", set(bed, "fade_in_sec", 10.001)],
    ["bad-fade", "fade_in_sec 11", set(bed, "fade_in_sec", 11)],
    ["bad-fade", "fade_in_sec a text", set(bed, "fade_in_sec", "2.4")],
    ["bad-fade", "fade_in_sec not finite", JSON.stringify(goodSpec()).replace('"level_lufs":-24', '"level_lufs":-24,"fade_in_sec":1e999')],
    ["bad-fade", "fade_in_sec 1.0005", set(bed, "fade_in_sec", 1.0005)],
    ["bad-fade", "fade_in_sec null", set(bed, "fade_in_sec", null)],
    ["bad-fade", "fade_in_sec true", set(bed, "fade_in_sec", true)],
    ["bad-fade", "fade_in_sec a list", set(bed, "fade_in_sec", [2.4])],
    ["bad-fade", "fade_out_sec 0", set(bed, "fade_out_sec", 0)],
    ["bad-fade", "fade_out_sec -0.5", set(bed, "fade_out_sec", -0.5)],
    ["bad-fade", "fade_out_sec 10.5", set(bed, "fade_out_sec", 10.5)],
    ["bad-fade", "fade_out_sec a text", set(bed, "fade_out_sec", "2")],
    ["bad-fade", "fade_out_sec 2.2004", set(bed, "fade_out_sec", 2.2004)],
    ["bad-fade", "a good fade_in_sec does not hide a bad fade_out_sec", (s) => void Object.assign(s.bed, { fade_in_sec: 2.4, fade_out_sec: 0 })],
    ["unknown-key", "fade_in in the bed", set(bed, "fade_in", 2.4)],
    ["unknown-key", "fadeInSec in the bed", set(bed, "fadeInSec", 2.4)],
    ["unknown-key", "fade_ms in the bed", set(bed, "fade_ms", 2400)],
    ["unknown-key", "fade_in_sec at the top of the spec", set(root, "fade_in_sec", 2.4)],
    ["unknown-key", "fade_in_sec in voice", set(voice, "fade_in_sec", 2.4)],
    ["unknown-key", "fade_out_sec in a line", set(line(0), "fade_out_sec", 2.2)],
  ];
  /** A plant that is a text stands for the whole spec file. */
  const planted = (plant: ((s: Loose) => void) | string, base: ClipSoundSpec = goodSpec()): string => {
    if (typeof plant === "string") return plant;
    const s = clone(base) as unknown as Loose;
    plant(s);
    return JSON.stringify(s);
  };

  test("spec-invalid: validateSpec gives the code for each planted spec, [] for the good spec and the bounds", () => {
    expect(validateSpec(goodSpec())).toEqual([]);
    const bounds = clone(goodSpec());
    bounds.slug = "a".repeat(64);
    bounds.picture.file = "a".repeat(200);
    bounds.voice = { target_lufs: -24, lines: manyLines(40) };
    bounds.bed.level_lufs = -40;
    expect(validateSpec(bounds)).toEqual([]);
    bounds.voice.target_lufs = -12;
    bounds.bed.level_lufs = -18;
    bounds.voice.lines[1].at = 1.5;
    bounds.voice.lines[39].at = 18000.001;
    expect(validateSpec(bounds)).toEqual([]);
    for (const [code, name, plant] of cases) {
      const lines = validateSpec(JSON.parse(planted(plant)));
      expect([name, lines.some((l) => l.startsWith(`${code}: `))]).toEqual([name, true]);
    }
  });

  ffTest("spec-invalid: apply refuses each planted spec with the reason lines", () => {
    const f = fixture();
    const specPath = path.join(f.root, "planted.json");
    for (const [code, name, plant] of cases) {
      // planted on the spec of the good fixture; runCli in this process, one run per case
      fs.writeFileSync(specPath, planted(plant, f.spec));
      const r = runCli(argsOf(f, { spec: specPath }));
      const err = r.err.split("\n");
      expect([name, r.code, r.out, err[0].startsWith("spec-invalid: "), err.slice(1).some((l) => l.startsWith(`${code}: `))]).toEqual([name, 2, "", true, true]);
      expect(fs.readdirSync(f.outDir)).toEqual([]);
    }
    fs.writeFileSync(specPath, "{not json");
    refused(argsOf(f, { spec: specPath }), "spec-invalid", f.outDir);
    fs.writeFileSync(specPath, planted(set(root, "slug", "Bad")));
    expect(refused(argsOf(f, { spec: specPath }), "spec-invalid", f.outDir).err).toContain("\nbad-slug: ");
  });

  ffTest("usage: a missing or unknown option, an option twice, another first argument", () => {
    const f = fixture();
    const good = argsOf(f);
    const bad = [
      [],
      ["check", ...good.slice(1)],
      good.slice(0, 5), // no --out
      ["apply", ...good.slice(3)], // no --spec
      [...good, "--loud"],
      [...good, "--out", f.outDir],
      [...good, "--dry", "--dry"],
      [...good.slice(0, 6)], // --out without a value
    ];
    for (const args of bad) {
      expect(refused(args, "usage", f.outDir).err).toContain("clipSound apply --spec <file> --media <dir> --out <dir> [--dry]");
    }
  });

  ffTest("out-missing: --out or --media is missing or is not a folder", () => {
    const f = fixture();
    for (const over of [{ out: path.join(f.root, "gone") }, { out: f.specPath }, { media: path.join(f.root, "gone") }, { media: f.specPath }]) {
      refused(argsOf(f, over), "out-missing", f.outDir);
    }
  });

  ffTest("out-symlink: --out is itself a symlink", () => {
    const f = fixture();
    const link = path.join(f.root, "out-link");
    fs.symlinkSync(f.outDir, link);
    refused(argsOf(f, { out: link }), "out-symlink", f.outDir);
    refused(argsOf(f, { out: `${link}${path.sep}` }), "out-symlink", f.outDir);
  });

  const linkedNames = (kind: string, names: string[]): void => {
    ffTest(`out-symlink: a symlink at a ${kind} name in --out; the file it points to stays`, () => {
      const f = fixture();
      const victim = path.join(f.root, "victim.txt");
      fs.writeFileSync(victim, "made-up text\n");
      const before = sha256File(victim);
      for (const name of names) {
        const link = path.join(f.outDir, name);
        fs.symlinkSync(victim, link);
        refused(argsOf(f), "out-symlink", f.outDir);
        expect(sha256File(victim)).toBe(before);
        fs.unlinkSync(link);
      }
    });
  };
  linkedNames("temp", ["test-sound.sound.tmp.mp4", "test-sound.voice.tmp.wav", "test-sound.bed.tmp.wav", "test-sound.sound.tmp.json"]);
  linkedNames("final", ["test-sound.sound.mp4", "test-sound.voice.wav", "test-sound.bed.wav", "test-sound.sound.json"]);

  ffTest("same-folder: --media and --out are one folder, by real path", () => {
    const f = fixture();
    refused(argsOf(f, { out: f.mediaDir }), "same-folder", f.mediaDir);
    const link = path.join(f.root, "media-link");
    fs.symlinkSync(f.mediaDir, link);
    refused(argsOf(f, { media: link, out: f.mediaDir }), "same-folder", f.mediaDir);
  });

  const workTree = (): string => {
    const work = tmp("work");
    fs.mkdirSync(path.join(work, ".git"));
    const inner = path.join(work, "inner");
    fs.mkdirSync(inner);
    return inner;
  };

  ffTest("inside-repo: --media in a git work tree", () => {
    const f = fixture();
    const inner = workTree();
    for (const n of fs.readdirSync(f.mediaDir)) fs.copyFileSync(path.join(f.mediaDir, n), path.join(inner, n));
    refused(argsOf(f, { media: inner }), "inside-repo", f.outDir);
  });

  ffTest("inside-repo: --out in a git work tree", () => {
    const f = fixture();
    const inner = workTree();
    refused(argsOf(f, { out: inner }), "inside-repo", inner);
  });

  ffTest("source-missing: a named file is not in --media, or is not a regular file", () => {
    const f = fixture();
    const gone = variant(f, (s) => void (s.bed.file = "gone.wav"));
    refused(argsOf(f, { spec: gone.specPath }), "source-missing", f.outDir);
    fs.mkdirSync(path.join(f.mediaDir, "folder.wav"));
    const folder = variant(f, (s) => void (s.voice.lines[0].file = "folder.wav"));
    refused(argsOf(f, { spec: folder.specPath }), "source-missing", f.outDir);
    // a symlink to a file with the right bytes is not followed
    fs.symlinkSync(path.join(f.mediaDir, "line-a.wav"), path.join(f.mediaDir, "link.wav"));
    const link = variant(f, (s) => void (s.voice.lines[0].file = "link.wav"));
    refused(argsOf(f, { spec: link.specPath }), "source-missing", f.outDir);
  });

  const otherHash = (h: string): string => `${h[0] === "0" ? "1" : "0"}${h.slice(1)}`;
  const targets: [string, (s: ClipSoundSpec) => { sha256: string }][] = [
    ["the picture", (s) => s.picture],
    ["a line", (s) => s.voice.lines[1]],
    ["the bed", (s) => s.bed],
  ];
  for (const [what, pick] of targets) {
    ffTest(`source-changed: one character of the sha256 of ${what}`, () => {
      const f = fixture();
      const v = variant(f, (s) => void (pick(s).sha256 = otherHash(pick(s).sha256)));
      refused(argsOf(f, { spec: v.specPath }), "source-changed", f.outDir);
    });
  }

  /** A refusal for one planted media file, in the place the pick gives. */
  function plantedMedia(code: string, file: string, args: (f: SoundFixture) => string[], pick: (s: ClipSoundSpec) => object): void {
    const f = fixture();
    const ref = media(f, file, args(f));
    const v = variant(f, (s) => void Object.assign(pick(s), ref));
    refused(argsOf(f, { spec: v.specPath }), code, f.outDir);
  }
  const picturePick = (s: ClipSoundSpec) => s.picture;
  const linePick = (s: ClipSoundSpec) => s.voice.lines[0];
  const bedPick = (s: ClipSoundSpec) => s.bed;
  const silentVideo = (): string[] => pictureArgs(PICTURE_SEC);
  const own = (f: SoundFixture): string => path.join(f.mediaDir, "picture.mp4");

  ffTest("picture-no-video: the picture file has no video stream", () => {
    plantedMedia("picture-no-video", "no-video.wav", () => toneArgs(PICTURE_SEC), picturePick);
  });
  ffTest("picture-has-sound: the picture file holds a sound stream", () => {
    plantedMedia(
      "picture-has-sound",
      "sounding.mp4",
      (f) => ["-i", own(f), "-i", path.join(f.mediaDir, "bed.wav"), "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-shortest"],
      picturePick,
    );
  });
  ffTest("picture-extra-stream: a second video stream", () => {
    plantedMedia("picture-extra-stream", "two-video.mp4", (f) => ["-i", own(f), "-map", "0:v", "-map", "0:v", "-c", "copy"], picturePick);
  });
  ffTest("picture-extra-stream: a subtitle stream", () => {
    plantedMedia(
      "picture-extra-stream",
      "subtitled.mp4",
      (f) => {
        const srt = path.join(f.root, "made-up.srt");
        fs.writeFileSync(srt, "1\n00:00:00,000 --> 00:00:01,000\nmade-up\n");
        return ["-i", own(f), "-i", srt, "-map", "0:v", "-map", "1:s", "-c:v", "copy", "-c:s", "mov_text"];
      },
      picturePick,
    );
  });
  ffTest("picture-extra-stream: a data stream", () => {
    const f = fixture();
    const ref = media(f, "data.mov", [...silentVideo(), "-timecode", "00:00:00:00"]);
    expect(probe(path.join(f.mediaDir, ref.file)).streams.map((s) => s.codec_type).sort()).toEqual(["data", "video"]);
    const v = variant(f, (s) => void Object.assign(s.picture, ref));
    refused(argsOf(f, { spec: v.specPath }), "picture-extra-stream", f.outDir);
  });

  const pictureOnly = (f: SoundFixture): string[] => ["-i", own(f), "-c", "copy"];
  ffTest("line-no-sound: a line file without a sound stream", () => {
    plantedMedia("line-no-sound", "mute-line.mp4", pictureOnly, linePick);
  });
  ffTest("bed-no-sound: a bed file without a sound stream", () => {
    plantedMedia("bed-no-sound", "mute-bed.mp4", pictureOnly, bedPick);
  });

  ffTest("line-too-short: the words of a line are shorter than 1 s", () => {
    plantedMedia("line-too-short", "short-words.wav", () => noiseArgs(0.3, 0.6, 1.4), linePick);
    plantedMedia("line-too-short", "short-file.wav", () => noiseArgs(0.3, 0.3), linePick);
  });

  const silence = (sec: number): string[] => soundArgs(`anullsrc=r=48000:cl=mono:d=${sec}`);
  ffTest("line-silent: a silent line", () => {
    plantedMedia("line-silent", "silent-line.wav", () => silence(2), linePick);
  });
  ffTest("line-silent: a silent bed", () => {
    plantedMedia("line-silent", "silent-bed.wav", () => silence(BED_SEC), bedPick);
  });

  const plantedSpec = (code: string, change: (s: ClipSoundSpec) => void): void => {
    const f = fixture();
    refused(argsOf(f, { spec: variant(f, change).specPath }), code, f.outDir);
  };
  ffTest("window-past-end: a window that ends beyond the picture's end", () => {
    plantedSpec("window-past-end", (s) => void (s.voice.lines[0].window = { from: 0.5, to: 10.001 }));
  });
  ffTest("window-past-end edge: a window that ends at the picture's end passes", () => {
    const f = fixture();
    const v = variant(f, (s) => void (s.voice.lines[0].window = { from: 0.5, to: PICTURE_SEC }));
    lay(f, { spec: v.specPath });
    expect(recordOf(f.outDir).lines[0].window).toEqual({ from: 0.5, to: PICTURE_SEC });
  });
  ffTest("line-past-end: the words of a line end beyond the picture's end", () => {
    plantedSpec("line-past-end", (s) => void (s.voice.lines[1].at = 8.2));
  });
  ffTest("line-past-end by the words: a silent tail may run past the picture's end", () => {
    const f = fixture();
    const long = media(f, "long-tail.wav", noiseArgs(0.3, 1.5, 1.5));
    const v = variant(f, (s) => void Object.assign(s.voice.lines[1], long, { at: 8 }));
    lay(f, { spec: v.specPath });
    const line = recordOf(f.outDir).lines[1];
    expect(8 + Number(line.sec)).toBeGreaterThan(PICTURE_SEC);
    expect(8 + Number(line.words_end)).toBeLessThan(PICTURE_SEC);
  });
  ffTest("line-overlap: the words of a line end after the next line starts", () => {
    plantedSpec("line-overlap", (s) => void (s.voice.lines[1].at = 2.8));
  });
  ffTest("bed-too-short: the bed ends before the picture does", () => {
    plantedMedia("bed-too-short", "short-bed.wav", () => toneArgs(PICTURE_SEC - 0.1), bedPick);
  });

  ffTest("ffmpeg-failed: a folder at the temp name of the film; --out holds the folder only", () => {
    const f = fixture();
    fs.mkdirSync(path.join(f.outDir, "test-sound.sound.tmp.mp4"));
    refused(argsOf(f), "ffmpeg-failed", f.outDir);
    expect(fs.readdirSync(f.outDir)).toEqual(["test-sound.sound.tmp.mp4"]);
  });

  ffTest("old files stay: a refused run leaves the four files of an earlier good run; a good run replaces them", () => {
    const f = fixture();
    lay(f);
    const first = snapshot(f.outDir);
    expect(first).toHaveLength(4);
    const changed = variant(f, (s) => void (s.bed.sha256 = otherHash(s.bed.sha256)));
    refused(argsOf(f, { spec: changed.specPath }), "source-changed", f.outDir);
    refused(argsOf(f, { spec: variant(f, (s) => void Object.assign(s.bed, { fade_in_sec: 6, fade_out_sec: 4.001 })).specPath }), "fade-too-long", f.outDir);
    fs.mkdirSync(path.join(f.outDir, "test-sound.sound.tmp.mp4"));
    refused(argsOf(f), "ffmpeg-failed", f.outDir);
    expect(snapshot(f.outDir).filter((n) => !n.endsWith(" folder"))).toEqual(first);
    fs.rmdirSync(path.join(f.outDir, "test-sound.sound.tmp.mp4"));
    const louder = variant(f, (s) => void (s.voice.target_lufs = -14));
    lay(f, { spec: louder.specPath });
    expect(fs.readdirSync(f.outDir).sort()).toEqual(FOUR);
    expect(recordOf(f.outDir).mix.target_lufs).toBe(-14);
  });

  test("on a Linux CI run the system ffmpeg is there", () => {
    if (process.env.CI === "true" && process.platform === "linux") expect(hasSystemFfmpeg()).toBe(true);
    else expect(typeof hasSystemFfmpeg()).toBe("boolean");
  });
});
