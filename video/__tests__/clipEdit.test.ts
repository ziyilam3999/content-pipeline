/**
 * Row A41-clip-cut — clip:edit tests. Real system ffmpeg on a small clip made at test time:
 * a fake ffmpeg cannot show frame counts or blur. Tests that need it are skipped, with the
 * reason in the name, when it is missing.
 */

import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { buildGraph, buildManifest, filterNames, pixelShape, runCli, validateSpec, zoomAt, type ClipEditSpec } from "../clipEdit";
import {
  AI_ATTEMPT,
  OTHER_ATTEMPT,
  STILL_SERVICE,
  VIDEO_SERVICE,
  aiMixedSpec,
  fixtureSpec,
  makeAiMixedFixture,
  makeEditFixture,
  makeMixedFixture,
  makeSource,
  makeZoomFixture,
  mixedSpec,
  outcomeLine,
  twoAiSpec,
  writeLines,
  zoomSpec,
  type AiFixture,
  type EditFixture,
  type SpecFixture,
} from "../clipEditFixture";
import { hasSystemFfmpeg, resolveSystemFfmpeg } from "../contactSheet";

jest.setTimeout(120000);

const SHA = "ab".repeat(32);
const made: string[] = [];
const fixtures: EditFixture[] = [];

function fixture(): EditFixture {
  const f = makeEditFixture();
  fixtures.push(f);
  return f;
}
function mixed(): SpecFixture {
  const f = makeMixedFixture();
  fixtures.push(f);
  return f;
}
function zoomFx(): SpecFixture {
  const f = makeZoomFixture();
  fixtures.push(f);
  return f;
}
function aiMixed(): AiFixture {
  const f = makeAiMixedFixture();
  fixtures.push(f);
  return f;
}
/** The --spend arguments of a call, one pair for each file. */
function spendArgs(files: string[]): string[] {
  return files.flatMap((p) => ["--spend", p]);
}
function tmp(name: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `clip-edit-${name}-`));
  made.push(d);
  return d;
}
afterAll(() => {
  for (const f of fixtures) f.cleanup();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

function ffTest(name: string, fn: () => void): void {
  if (process.platform === "win32") test.skip(`${name} (win32)`, fn);
  else if (!hasSystemFfmpeg()) test.skip(`${name} (no-system-ffmpeg)`, fn);
  else test(name, fn);
}

function apply(f: EditFixture, extra: string[] = [], over: Partial<Record<string, string>> = {}) {
  return runCli([
    "apply",
    "--spec",
    over.spec ?? f.specPath,
    "--clips",
    over.clips ?? f.clipsDir,
    "--intake",
    over.intake ?? f.intakeDir,
    "--out",
    over.out ?? f.outDir,
    ...extra,
  ]);
}
function ffprobeBin(): string {
  return path.join(path.dirname(resolveSystemFfmpeg()), "ffprobe");
}
function clone(s: ClipEditSpec): ClipEditSpec {
  return JSON.parse(JSON.stringify(s)) as ClipEditSpec;
}
/** Gray bytes of output frame n. */
function frameBytes(mp4: string, n: number): Buffer {
  const r = spawnSync(
    resolveSystemFfmpeg(),
    ["-v", "error", "-i", mp4, "-vf", `trim=start_frame=${n}:end_frame=${n + 1},format=gray`, "-f", "rawvideo", "-"],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  return r.stdout as Buffer;
}
/** Output frame n of a video, gray, with a filter tail on the frame. */
function outGray(mp4: string, n: number, tail = ""): Buffer {
  const r = spawnSync(
    resolveSystemFfmpeg(),
    ["-v", "error", "-i", mp4, "-an", "-vf", `trim=start_frame=${n}:end_frame=${n + 1}${tail ? `,${tail}` : ""},format=gray`, "-f", "rawvideo", "-"],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  if (r.status !== 0) throw new Error(`the output read failed: ${r.stderr}`);
  return r.stdout as Buffer;
}
/** Output frame n of a video as rgb24. */
function outRgb(mp4: string, n: number): Buffer {
  return spawnSync(resolveSystemFfmpeg(), ["-v", "error", "-i", mp4, "-vf", `trim=start_frame=${n}:end_frame=${n + 1},format=rgb24`, "-f", "rawvideo", "-"], {
    maxBuffer: 64 * 1024 * 1024,
  }).stdout as Buffer;
}
/** Source frame k on apply's grid (setpts, fps), gray, with a filter tail on the frame. */
function srcGray(clip: string, fps: number, k: number, tail = ""): Buffer {
  const r = spawnSync(
    resolveSystemFfmpeg(),
    ["-v", "error", "-i", clip, "-an", "-vf", `setpts=PTS-STARTPTS,fps=${fps},trim=start_frame=${k}:end_frame=${k + 1}${tail ? `,${tail}` : ""},format=gray`, "-f", "rawvideo", "-"],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  if (r.status !== 0) throw new Error(`the source read failed: ${r.stderr}`);
  return r.stdout as Buffer;
}
function mad(a: Buffer, b0: Buffer): number {
  // a source read may hold the frame more than once (the muxer pads to a constant rate): the first copy is the frame
  const b = b0.subarray(0, a.length);
  expect(b.length).toBe(a.length);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}
function ff(args: string[]): void {
  const r = spawnSync(resolveSystemFfmpeg(), ["-y", "-v", "error", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
}
function sha(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}
function writeSpec(f: EditFixture, name: string, s: ClipEditSpec): string {
  const p = path.join(f.root, name);
  fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
  return p;
}

describe("clip:edit", () => {
  ffTest("(1) apply writes the mp4, the edit record and the contact sheet; ffprobe shows h264 yuv420p 360x640 30/1 75 frames, no audio", () => {
    const f = fixture();
    const r = apply(f);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(r.out).toBe("clip-edit: wrote test-cut frames=75 sec=2.5\n");
    const mp4 = path.join(f.outDir, "test-cut.mp4");
    const p = spawnSync(
      ffprobeBin(),
      ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height,r_frame_rate,avg_frame_rate,nb_read_frames", "-of", "json", mp4],
      { encoding: "utf8" },
    );
    const streams = (JSON.parse(p.stdout) as { streams: Record<string, string>[] }).streams;
    expect(streams).toHaveLength(1); // no audio stream
    expect(streams[0]).toMatchObject({
      codec_type: "video",
      codec_name: "h264",
      pix_fmt: "yuv420p",
      width: 360,
      height: 640,
      r_frame_rate: "30/1",
      avg_frame_rate: "30/1",
      nb_read_frames: "75",
    });
    const rec = JSON.parse(fs.readFileSync(path.join(f.outDir, "test-cut.edit.json"), "utf8")) as { schema: string; slug: string };
    expect(rec.schema).toBe("clip-edit-manifest/1");
    expect(rec.slug).toBe("test-cut");
    const eyeball = path.join(f.outDir, "review", "test-cut", "eyeball");
    const shaDir = fs.readdirSync(eyeball)[0];
    expect(fs.existsSync(path.join(eyeball, shaDir, "sheet.png"))).toBe(true);
    expect(fs.readdirSync(path.join(eyeball, shaDir)).filter((n) => n.startsWith("frame-"))).toHaveLength(3); // 2.5 s: one tile per second
  });

  ffTest("(3) the still frames are equal: first and last still frame differ by next to 0", () => {
    const f = fixture();
    expect(apply(f).code).toBe(0);
    const mp4 = path.join(f.outDir, "test-cut.mp4");
    // beat 1: frames 0..29 play [0,1), frames 30..44 hold the frame at 1.0 s
    const a = frameBytes(mp4, 30);
    const b = frameBytes(mp4, 44);
    const first = frameBytes(mp4, 0);
    expect(a.length).toBe(360 * 640);
    expect(b.length).toBe(a.length);
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
    // h264 is lossy: the repeats of one frame drift by a hair (0.012 measured), a wrong frame by far more
    expect(diff / a.length).toBeLessThan(0.1);
    // the check can fail: a playing frame differs from the held one
    let moving = 0;
    for (let i = 0; i < a.length; i++) moving += Math.abs(a[i] - first[i]);
    expect(moving / a.length).toBeGreaterThan(5);
  });

  test("(8) validateSpec gives each code for its planted fault, [] for the good spec", () => {
    const good = fixtureSpec(SHA);
    expect(validateSpec(good)).toEqual([]);
    // a piece [x, y) next to a cut [y, z) is not in the cut
    const touching = clone(good);
    touching.videos[0].beats[0].pieces[0] = { src: "a", from: 0.5, to: 1.5 };
    expect(validateSpec(touching)).toEqual([]);
    // a source crop_top of its own and a zoom piece on a source without boxes and cuts are valid
    const shaped = clone(good);
    shaped.sources[0].crop_top = 80;
    shaped.sources[0].blur = [];
    shaped.sources[0].cut = [];
    shaped.videos[0].beats[0].pieces[0] = { src: "a", from: 0, to: 1, zoom_to: 1.25 };
    expect(validateSpec(shaped)).toEqual([]);
    expect(validateSpec(mixedSpec(SHA, "cd".repeat(32)))).toEqual([]);
    expect(validateSpec(zoomSpec(SHA, 1.12, 1))).toEqual([]);

    const faults: [string, (s: ClipEditSpec) => void][] = [
      ["bad-schema", (s) => void (s.schema = "clip-edit/2")],
      ["unknown-key", (s) => void ((s as unknown as Record<string, unknown>).extra = 1)],
      ["unknown-key", (s) => void ((s.sources[0].blur[0] as unknown as Record<string, unknown>).extra = 1)],
      ["bad-number", (s) => void ((s.sources[0].blur[0] as unknown as Record<string, unknown>).x = "1,drawbox")],
      ["bad-number", (s) => void (s.output.fps = Infinity)],
      ["bad-id", (s) => void (s.sources[0].id = "A b")],
      ["bad-slug", (s) => void (s.videos[0].slug = "Bad Slug")],
      ["bad-file", (s) => void (s.sources[0].file = "../a.mp4")],
      ["bad-file", (s) => void (s.sources[0].file = "a..b.mp4")],
      ["bad-sha", (s) => void (s.sources[0].sha256 = "ABC")],
      ["src-twice", (s) => void s.sources.push(clone(s).sources[0])],
      ["slug-twice", (s) => void s.videos.push(clone(s).videos[0])],
      ["bad-output", (s) => void (s.output.width = 361)],
      ["bad-output", (s) => void (s.output.fps = 61)],
      ["bad-output", (s) => void (s.output.pad_color = "white")],
      ["bad-box", (s) => void (s.sources[0].blur[0].w = 4)],
      ["bad-box", (s) => void (s.sources[0].blur[0].x = 300)],
      ["box-above-crop", (s) => void Object.assign(s.sources[0].blur[0], { y: 10, h: 20 })],
      ["bad-time", (s) => void (s.sources[0].cut[0].to = s.sources[0].cut[0].from)],
      ["bad-time", (s) => void (s.sources[0].blur[0].from = -1)],
      ["unknown-src", (s) => void (s.videos[0].beats[0].pieces[0].src = "zz")],
      ["piece-in-cut", (s) => void (s.videos[0].beats[0].pieces[0] = { src: "a", from: 1.2, to: 2.2 })],
      ["still-in-cut", (s) => void (s.videos[0].beats[0].pieces[1] = { src: "a", still: 1.7, sec: 0.5 })],
      ["beat-order", (s) => void (s.videos[0].beats[0].n = 2)],
      ["beat-length", (s) => void (s.videos[0].beats[0].dur = 2)],
      ["content-too-tall", (s) => void (s.sources[0].height = 1708)],
      // the source crop
      ["bad-crop", (s) => void (s.sources[0].crop_top = 79)],
      ["bad-crop", (s) => void (s.sources[0].crop_top = -2)],
      ["bad-crop", (s) => void ((s.sources[0] as unknown as Record<string, unknown>).crop_top = "80")],
      ["bad-crop", (s) => void (s.sources[0].crop_top = 568)],
      // the crop of the source feeds the same two checks as output.crop_top
      ["content-too-tall", (s) => {
        s.sources[0].height = 700;
        s.sources[0].crop_top = 0;
      }],
      // also when output.crop_top is at or past the height of this source, which does not use it
      ["content-too-tall", (s) => {
        s.output.crop_top = 700;
        s.sources[0].height = 700;
        s.sources[0].crop_top = 0;
      }],
      ["box-above-crop", (s) => {
        s.sources[0].crop_top = 100; // the box sits at rows 10..30: above the source's own crop
        s.sources[0].blur[0].y = 10;
        s.sources[0].blur[0].h = 20;
      }],
      ["unknown-key", (s) => void ((s.sources[0] as unknown as Record<string, unknown>).source_kind = "ai-clip")],
      // the zoom piece
      ["zoom-on-still", (s) => void ((s.videos[0].beats[0].pieces[1] as unknown as Record<string, unknown>).zoom_to = 1.12)],
      ["bad-zoom", (s) => void ((s.videos[0].beats[0].pieces[0] as unknown as Record<string, unknown>).zoom_to = "1.12")],
      ["bad-zoom", (s) => void ((s.videos[0].beats[0].pieces[0] as unknown as Record<string, unknown>).zoom_to = 1)],
      ["bad-zoom", (s) => void ((s.videos[0].beats[0].pieces[0] as unknown as Record<string, unknown>).zoom_to = 1.26)],
      ["bad-zoom", (s) => void ((s.videos[0].beats[0].pieces[0] as unknown as Record<string, unknown>).zoom_to = 0.5)],
      ["bad-zoom", (s) => {
        s.sources[0].blur = [];
        s.sources[0].cut = [];
        s.videos[0].beats[0].pieces[0] = { src: "a", from: 0, to: 0.04, zoom_to: 1.12 }; // round(0.04*30) = 1 frame
      }],
      ["zoom-with-blur", (s) => void ((s.videos[0].beats[0].pieces[0] as unknown as Record<string, unknown>).zoom_to = 1.12)],
      ["zoom-with-cut", (s) => {
        s.sources[0].blur = [];
        s.videos[0].beats[0].pieces[0] = { src: "a", from: 0, to: 1, zoom_to: 1.12 };
      }],
    ];
    for (const [code, plant] of faults) {
      const s = clone(good);
      plant(s);
      const lines = validateSpec(s);
      expect(lines.some((l) => l.startsWith(`${code}:`))).toBe(true);
    }
  });

  test("(9) the graph holds only the allowed filter names and generated labels; a planted id and number are refused", () => {
    const spec = fixtureSpec(SHA);
    const g = buildGraph(spec, spec.videos[0]);
    const allowed = ["setpts", "split", "crop", "gblur", "overlay", "fps", "trim", "loop", "concat", "scale", "pad", "format"];
    const names = filterNames(g.graph);
    expect(names.length).toBeGreaterThan(10);
    for (const n of names) expect(allowed).toContain(n);
    const labels = [...g.graph.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]);
    expect(labels.length).toBeGreaterThan(10);
    for (const l of labels) expect(l).toMatch(/^([sk]\d+|\d+:v)$/);

    const planted = clone(spec);
    planted.sources[0].id = "a];movie=x[";
    (planted.sources[0].blur[0] as unknown as Record<string, unknown>).x = "1,drawbox";
    const lines = validateSpec(planted);
    expect(lines.some((l) => l.startsWith("bad-id:"))).toBe(true);
    expect(lines.some((l) => l.startsWith("bad-number:"))).toBe(true);
  });

  test("(10) out_start of beat k is the sum of earlier beat durs; pieces carry kind and source sha256", () => {
    const spec = fixtureSpec(SHA);
    const m = buildManifest(spec, spec.videos[0], "cd".repeat(32)) as {
      spec_sha256: string;
      beats: { n: number; out_start: number; dur: number; pieces: Record<string, unknown>[] }[];
    };
    expect(m.spec_sha256).toBe("cd".repeat(32));
    let sum = 0;
    m.beats.forEach((b, i) => {
      expect(b.out_start).toBeCloseTo(sum, 9);
      expect(b.dur).toBe(spec.videos[0].beats[i].dur);
      sum += b.dur;
      for (const p of b.pieces) {
        expect(p.kind).toBe("recorded-clip");
        expect(p.sha256).toBe(SHA);
        expect(p.source).toBe("a");
      }
    });
    expect(m.beats[1].out_start).toBeCloseTo(1.5, 9);
    expect(m.beats[0].pieces[1]).toMatchObject({ still: 1, sec: 0.5, out_start: 1 });
  });

  ffTest("(11) refusals exit 2 with nothing in --out", () => {
    const f = fixture();
    const expectRefused = (r: { code: number; out: string; err: string }, code: string, out: string) => {
      expect(r.code).toBe(2);
      expect(r.err.startsWith(`${code}:`)).toBe(true);
      expect(r.out).toBe("");
      expect(fs.readdirSync(out)).toEqual([]);
    };

    // --out inside a git work tree
    const work = tmp("work");
    fs.mkdirSync(path.join(work, ".git"));
    const inner = path.join(work, "o");
    fs.mkdirSync(inner);
    expectRefused(apply(f, [], { out: inner }), "inside-repo", inner);

    // --out a symlink into a git work tree
    if (process.platform !== "win32") {
      const linkDir = tmp("link");
      const link = path.join(linkDir, "out");
      fs.symlinkSync(inner, link);
      expectRefused(apply(f, [], { out: link }), "inside-repo", inner);
    }

    // --clips inside a git work tree (--out is outside, so the --out check is not what refuses)
    const clipsIn = path.join(work, "c");
    fs.mkdirSync(clipsIn);
    expectRefused(apply(f, [], { clips: clipsIn }), "inside-repo", f.outDir);

    // shape-mismatch: the spec source is wider than the probed clip
    const wide = clone(f.spec);
    wide.sources[0].width = 342;
    expect(validateSpec(wide)).toEqual([]);
    const widePath = path.join(f.root, "wide.json");
    fs.writeFileSync(widePath, JSON.stringify(wide));
    expectRefused(apply(f, [], { spec: widePath }), "shape-mismatch", f.outDir);

    // source-missing: the spec names a file that is not in --clips
    const missing = clone(f.spec);
    missing.sources[0].file = "gone.mp4";
    expect(validateSpec(missing)).toEqual([]);
    const missingPath = path.join(f.root, "missing.json");
    fs.writeFileSync(missingPath, JSON.stringify(missing));
    expectRefused(apply(f, [], { spec: missingPath }), "source-missing", f.outDir);

    // source-changed: the spec sha256 differs from the file
    const changed = clone(f.spec);
    changed.sources[0].sha256 = SHA;
    const changedPath = path.join(f.root, "changed.json");
    fs.writeFileSync(changedPath, JSON.stringify(changed));
    expectRefused(apply(f, [], { spec: changedPath }), "source-changed", f.outDir);

    // not-in-intake: no record for the source
    expectRefused(apply(f, [], { intake: tmp("empty-intake") }), "not-in-intake", f.outDir);

    // piece-past-end: a piece beyond the probed length
    const past = clone(f.spec);
    past.videos[0].beats[1] = { n: 2, clip: "second", dur: 6, pieces: [{ src: "a", from: 3, to: 9 }] };
    expect(validateSpec(past)).toEqual([]);
    const pastPath = path.join(f.root, "past.json");
    fs.writeFileSync(pastPath, JSON.stringify(past));
    expectRefused(apply(f, [], { spec: pastPath }), "piece-past-end", f.outDir);

    // one frame past the end of the 4.000 s source: a piece to 4.03, a still at 4.0
    const near = clone(f.spec);
    near.videos[0].beats[1] = { n: 2, clip: "second", dur: 1, pieces: [{ src: "a", from: 3.03, to: 4.03 }] };
    expect(validateSpec(near)).toEqual([]);
    const nearPath = path.join(f.root, "near.json");
    fs.writeFileSync(nearPath, JSON.stringify(near));
    expectRefused(apply(f, [], { spec: nearPath }), "piece-past-end", f.outDir);

    const still = clone(f.spec);
    still.videos[0].beats[1] = { n: 2, clip: "second", dur: 0.5, pieces: [{ src: "a", still: 4, sec: 0.5 }] };
    expect(validateSpec(still)).toEqual([]);
    const stillPath = path.join(f.root, "still.json");
    fs.writeFileSync(stillPath, JSON.stringify(still));
    expectRefused(apply(f, [], { spec: stillPath }), "piece-past-end", f.outDir);
  });

  ffTest("(14) a refusal after the first video was cut leaves nothing of the run in --out", () => {
    const f = fixture();
    const two = clone(f.spec);
    const second = clone(f.spec).videos[0];
    second.slug = "z-cut";
    two.videos.push(second);
    const twoPath = path.join(f.root, "two-fail.json");
    fs.writeFileSync(twoPath, JSON.stringify(two));
    // The means: a folder planted at the temp name of the second video, so ffmpeg cannot open
    // its output. The first video is cut by then.
    fs.mkdirSync(path.join(f.outDir, "z-cut.tmp.mp4"));
    const r = apply(f, [], { spec: twoPath });
    expect(r.code).toBe(2);
    expect(r.err.startsWith("ffmpeg-failed:")).toBe(true);
    expect(r.out).toBe("");
    expect(fs.readdirSync(f.outDir)).toEqual(["z-cut.tmp.mp4"]); // only the planted folder
  });

  test("(12) on a Linux CI run the system ffmpeg is there", () => {
    if (process.env.CI === "true" && process.platform === "linux") {
      expect(hasSystemFfmpeg()).toBe(true);
    } else {
      expect(typeof hasSystemFfmpeg()).toBe("boolean");
    }
  });

  ffTest("(13) --only writes only that slug", () => {
    const f = fixture();
    const two = clone(f.spec);
    const other = clone(f.spec).videos[0];
    other.slug = "other-cut";
    two.videos.push(other);
    const twoPath = path.join(f.root, "two.json");
    fs.writeFileSync(twoPath, JSON.stringify(two));
    const r = apply(f, ["--only", "other-cut"], { spec: twoPath });
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(r.out).toBe("clip-edit: wrote other-cut frames=75 sec=2.5\n");
    const names = fs.readdirSync(f.outDir).sort();
    expect(names).toEqual(["other-cut.edit.json", "other-cut.mp4", "review"]);
  });

  test("(15) zoomAt: 1 at frame 0, zoom_to at the last frame, a quarter of the way at the middle frame of an odd N", () => {
    expect(zoomAt(0, 97, 1.12)).toBe(1);
    expect(zoomAt(96, 97, 1.12)).toBeCloseTo(1.12, 9);
    expect(zoomAt(48, 97, 1.12)).toBeCloseTo(1.03, 9);
    expect(zoomAt(15, 31, 1.25)).toBeCloseTo(1.0625, 9); // 1 + (1.25 - 1)/4, below the straight line's 1.125
    expect(zoomAt(0, 30, 1.12)).toBe(1);
    expect(zoomAt(29, 30, 1.12)).toBeCloseTo(1.12, 9);
    expect(zoomAt(1, 30, 1.12)).toBeCloseTo(1 + 0.12 / (29 * 29), 9);
  });

  test("(15b) pixelShape: 1:1 at the output width; 240x426 scaled to 360 is 640:639 and 240x428 is 1:1", () => {
    const o = { width: 360, crop_top: 80 };
    const src = (w: number, h: number, cropTop: number): ClipEditSpec["sources"][number] => ({
      id: "a",
      file: "a.mp4",
      sha256: SHA,
      width: w,
      height: h,
      crop_top: cropTop,
      blur: [],
      cut: [],
    });
    expect(pixelShape(src(360, 568, 80), o)).toBe("1:1");
    expect(pixelShape(src(240, 426, 0), o)).toBe("640:639");
    expect(pixelShape(src(240, 428, 0), o)).toBe("1:1");
    // without its own crop_top the output's is used: 240x428 crop_top 80 is 240x348 scaled, 1.5 times 348 is whole
    const noOwnCrop = (h: number): ClipEditSpec["sources"][number] => {
      const s = src(240, h, 0);
      delete s.crop_top;
      return s;
    };
    expect(pixelShape(noOwnCrop(428), o)).toBe("1:1");
    // 240x426 keeps 346 rows under the output's 80: 519 rows scaled, brought to 520
    expect(pixelShape(noOwnCrop(426), o)).toBe("520:519");
  });

  /** The graph of the fixture spec as the tool built it before the per-source shapes: the crop, the
   *  scale and the pad after the join, with the size of the first source. */
  function oldOrderGraph(o: ClipEditSpec["output"]): { graph: string; outLabel: string } {
    const ch = o.width === 360 ? 488 : 2 * Math.round((488 * o.width) / 360 / 2);
    const padTop = Math.floor((o.height - ch) / 2);
    const head = [
      "[0:v]setpts=PTS-STARTPTS[s0]",
      "[s0]split=2[s1][s2]",
      "[s2]crop=160:120:20:100,gblur=sigma=20:steps=3[s3]",
      "[s1][s3]overlay=20:100:enable='gte(t,0)*lt(t,1.5)'[s4]",
      "[s4]split=2[s5][s6]",
      "[s6]crop=160:120:180:300,gblur=sigma=20:steps=3[s7]",
      "[s5][s7]overlay=180:300:enable='gte(t,2.2)*lt(t,2.8)'[s8]",
      "[s8]fps=30[s9]",
      "[s9]split=3[k0][k1][k2]",
      "[k0]trim=start_frame=0:end_frame=30,setpts=N/30/TB[s10]",
      "[k1]trim=start_frame=30:end_frame=31,loop=loop=14:size=1,setpts=N/30/TB[s11]",
      "[k2]trim=start_frame=60:end_frame=90,setpts=N/30/TB[s12]",
      "[s10][s11][s12]concat=n=3:v=1:a=0[s13]",
      "[s13]crop=360:488:0:80[s14]",
    ];
    const tail =
      o.width === 360
        ? ["[s14]pad=360:640:0:76:color=0xFFFFFF[s15]", "[s15]format=yuv420p[s16]"]
        : [`[s14]scale=${o.width}:${ch}[s15]`, `[s15]pad=${o.width}:${o.height}:0:${padTop}:color=0xFFFFFF[s16]`, "[s16]format=yuv420p[s17]"];
    return { graph: [...head, ...tail].join(";"), outLabel: o.width === 360 ? "s16" : "s17" };
  }

  ffTest("(16) a spec without a new key gives the file of the old graph (crop, scale and pad after the join): same sha256, also scaled to 270x480", () => {
    const f = fixture();
    const tall = { ...fixtureSpec(SHA).output, width: 270, height: 480 };
    for (const o of [fixtureSpec(SHA).output, tall]) {
      const spec = clone(f.spec);
      spec.output = o;
      const p = writeSpec(f, `old-${o.width}.json`, spec);
      const out = tmp(`old-${o.width}`);
      const r = apply(f, [], { spec: p, out });
      expect(r.code).toBe(0);
      const old = path.join(f.root, `old-${o.width}.mp4`);
      const g = oldOrderGraph(o);
      ff(["-i", f.clipFile, "-filter_complex", g.graph, "-map", `[${g.outLabel}]`, "-map_metadata", "-1", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", old]);
      expect(sha(old)).toBe(sha(path.join(out, "test-cut.mp4")));
    }
  });

  ffTest("(17) mixed: two sources that differ in size, frame rate and crop_top are cut, each with its own crop; the sound is dropped", () => {
    const f = mixed();
    expect(validateSpec(f.spec)).toEqual([]);
    const r = apply(f);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(r.out).toBe("clip-edit: wrote mixed-cut frames=90 sec=3\n");
    const mp4 = path.join(f.outDir, "mixed-cut.mp4");
    const p = spawnSync(
      ffprobeBin(),
      ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height,sample_aspect_ratio,r_frame_rate,avg_frame_rate,nb_read_frames", "-of", "json", mp4],
      { encoding: "utf8" },
    );
    const streams = (JSON.parse(p.stdout) as { streams: Record<string, string>[] }).streams;
    expect(streams).toHaveLength(1); // the sound track of the second source is not carried over
    expect(streams[0]).toMatchObject({
      codec_name: "h264",
      pix_fmt: "yuv420p",
      width: 360,
      height: 640,
      sample_aspect_ratio: "1:1",
      r_frame_rate: "30/1",
      avg_frame_rate: "30/1",
      nb_read_frames: "90",
    });

    // frames 0..29 play the first source: picture rows 110..530, the green band of 80 rows is cut
    for (const n of [0, 15, 29]) {
      const rgb = outRgb(mp4, n);
      expect(rgb.length).toBe(360 * 640 * 3);
      let green = 0;
      let padMin = 255;
      for (let px = 0; px < 360 * 640; px++) {
        const red = rgb[3 * px];
        const g = rgb[3 * px + 1];
        const b = rgb[3 * px + 2];
        if (g - red > 100 && g - b > 100) green++;
        const row = Math.floor(px / 360);
        if (row < 110 - 16 || row >= 530 + 16) padMin = Math.min(padMin, red, g, b); // the 16 rows next to the picture ring
      }
      expect(green).toBe(0);
      expect(padMin).toBeGreaterThanOrEqual(240);
      const top = outGray(mp4, n, "crop=360:32:0:110");
      const below = srcGray(f.clipOf.band, 30, n, "crop=360:32:0:80");
      const band = srcGray(f.clipOf.band, 30, n, "crop=360:32:0:0");
      const dBelow = mad(top, below);
      const dBand = mad(top, band);
      console.log(`(17) first source, frame ${n}: top rows against rows below crop_top ${dBelow.toFixed(2)}, against the band ${dBand.toFixed(2)}`);
      expect(dBelow).toBeLessThan(8);
      expect(dBand).toBeGreaterThan(15); // the band is flat gray 150 against noise around 128: the luma moves by about a twelfth of the range
      expect(dBand).toBeGreaterThan(2 * dBelow);
    }
    // frames 30..59 play the second source from 0 s: picture rows 20..620 start at source row 0
    for (const n of [30, 45, 59]) {
      const top = outGray(mp4, n, "crop=360:32:0:20,scale=32:8");
      const from0 = srcGray(f.clipOf.sound, 30, n - 30, "crop=240:22:0:0,scale=32:8");
      const from60 = srcGray(f.clipOf.sound, 30, n - 30, "crop=240:22:0:60,scale=32:8");
      const d0 = mad(top, from0);
      const d60 = mad(top, from60);
      console.log(`(17) second source, frame ${n}: top rows against source rows 0.. ${d0.toFixed(2)}, against rows 60.. ${d60.toFixed(2)}`);
      expect(d0).toBeLessThan(8);
      expect(d60).toBeGreaterThan(20);
    }
  });

  ffTest("(18) pixel-shape: a 240x426 source beside a 360 wide one is refused with shape-mismatch and nothing written; 240x428 beside it is cut", () => {
    const f = fixture();
    const base = clone(f.spec);
    base.output = { width: 360, height: 644, fps: 30, crop_top: 80, pad_color: "#FFFFFF" };
    base.videos[0].beats = [{ n: 1, clip: "first", dur: 1, pieces: [{ src: "a", from: 0, to: 0.5 }] }];
    for (const [name, h] of [["narrow", 426], ["even", 428]] as const) {
      const file = `${name}.mp4`;
      const sha256 = makeSource(f, file, ["-f", "lavfi", "-i", `testsrc2=size=240x${h}:rate=30:duration=1`, "-c:v", "libx264", "-pix_fmt", "yuv420p"]);
      const spec = clone(base);
      spec.sources.push({ id: "n", file, sha256, width: 240, height: h, crop_top: 0, blur: [], cut: [] });
      spec.videos[0].beats[0].pieces.push({ src: "n", from: 0, to: 0.5 });
      expect(validateSpec(spec)).toEqual([]);
      const out = tmp(`shape-${name}`);
      const r = apply(f, [], { spec: writeSpec(f, `${name}.json`, spec), out });
      if (h === 426) {
        expect(r.out).toBe("");
        expect(r.err.startsWith("shape-mismatch:")).toBe(true);
        expect(r.code).toBe(2);
        expect(fs.readdirSync(out)).toEqual([]);
      } else {
        expect(r.err).toBe("");
        expect(r.code).toBe(0);
        expect(r.out).toBe("clip-edit: wrote test-cut frames=30 sec=1\n");
      }
    }
  });

  ffTest("(19) zoom: the piece starts at zoom 1 and ends at zoom_to around the centre; the middle frame of an odd N follows the ease-in", () => {
    const f = zoomFx();
    /** Source frame k (the 360x480 picture) with a filter tail; the output picture area is the same size. */
    const pic = (k: number, tail: string): Buffer => srcGray(f.clipOf.z, 30, k, `crop=360:480:0:0,${tail}`);
    /** The source frame scaled by z (the size brought down to even pixels), then cut back to 360x480
     *  around the centre or at the top left corner. */
    const scaled = (z: number, where: "centre" | "corner"): string => {
      const w = 2 * Math.floor((360 * z) / 2);
      const h = 2 * Math.floor((480 * z) / 2);
      const [x, y] = where === "centre" ? [w / 2 - 180, h / 2 - 240] : [0, 0];
      return `scale=${w}:${h},crop=360:480:${x}:${y}`;
    };
    // 31 frames would end 1.03 s in: the contact sheet of a video that stops just past a full second
    // has no frame for that second, so the odd N here is 45 (1.5 s)
    for (const [zoomTo, to, frames] of [[1.12, 1, 30], [1.25, 1.5, 45]] as const) {
      const slug = `zoom-${Math.round(zoomTo * 100)}`;
      const out = tmp(slug);
      const r = apply(f, [], { spec: writeSpec(f, `${slug}.json`, zoomSpec(f.sha256, zoomTo, to, slug)), out });
      expect(r.err).toBe("");
      expect(r.code).toBe(0);
      expect(r.out).toBe(`clip-edit: wrote ${slug} frames=${frames} sec=${frames / 30}\n`);
      const mp4 = path.join(out, `${slug}.mp4`);
      // the zoom scales with both sizes set: the stream must still have square pixels
      const probe = spawnSync(ffprobeBin(), ["-v", "error", "-show_entries", "stream=width,height,sample_aspect_ratio", "-of", "json", mp4], { encoding: "utf8" });
      expect((JSON.parse(probe.stdout) as { streams: Record<string, string>[] }).streams[0]).toMatchObject({ width: 360, height: 640, sample_aspect_ratio: "1:1" });
      const frame = (n: number): Buffer => outGray(mp4, n, "crop=360:480:0:80");
      const last = frames - 1;
      const first = {
        plain: mad(frame(0), pic(0, "scale=360:480")),
        centre: mad(frame(0), pic(0, scaled(zoomTo, "centre"))),
      };
      const end = {
        centre: mad(frame(last), pic(last, scaled(zoomTo, "centre"))),
        plain: mad(frame(last), pic(last, "scale=360:480")),
        corner: mad(frame(last), pic(last, scaled(zoomTo, "corner"))),
      };
      console.log(`(19) zoom_to ${zoomTo}, ${frames} frames: first frame against no zoom ${first.plain.toFixed(2)}, against the zoom ${first.centre.toFixed(2)}; last frame against the centred zoom ${end.centre.toFixed(2)}, against no zoom ${end.plain.toFixed(2)}, against the top left zoom ${end.corner.toFixed(2)}`);
      expect(first.plain).toBeLessThan(8);
      expect(first.plain * 4).toBeLessThan(first.centre);
      expect(end.centre * 2).toBeLessThan(end.plain);
      expect(end.centre * 4).toBeLessThan(end.corner);
      if (frames % 2 === 1) {
        const mid = frames >> 1;
        const eased = mad(frame(mid), pic(mid, scaled(1 + (zoomTo - 1) / 4, "centre")));
        const straight = mad(frame(mid), pic(mid, scaled(1 + (zoomTo - 1) / 2, "centre")));
        console.log(`(19) zoom_to ${zoomTo}, middle frame ${mid} of ${frames}: against the eased zoom 1.0625 ${eased.toFixed(2)}, against the straight-line zoom 1.125 ${straight.toFixed(2)}`);
        expect(eased * 1.5).toBeLessThan(straight);
      }
    }
  });

  // ── the ai-clip source kind (A57) ────────────────────────────────────────────────────────

  test("(20) validateSpec: the kind and the attempt id of a source give bad-kind, bad-attempt-id, attempt-on-recorded and crop-on-ai for a planted fault; recorded-clip written out and crop_top 0 pass", () => {
    const good = aiMixedSpec(SHA, "cd".repeat(32));
    expect(validateSpec(good)).toEqual([]);
    const ai = (s: ClipEditSpec): Record<string, unknown> => s.sources[1] as unknown as Record<string, unknown>;
    const set =
      (over: Record<string, unknown>): ((s: ClipEditSpec) => void) =>
      (s) =>
        void Object.assign(ai(s), over);
    // The 32 hex characters of AI_ATTEMPT with the dashes moved (8-8-4-4-8): 36 characters of
    // lower-case hex and dashes, in a layout other than 8-4-4-4-12
    const movedDashes = "1a2b3c4d-5e6f4a7b-8c9d-0e1f-2a3b4c5d";
    expect(movedDashes).toMatch(/^[0-9a-f-]{36}$/);
    const faults: [string, (s: ClipEditSpec) => void][] = [
      ["bad-kind", set({ kind: "ai" })],
      ["bad-kind", set({ kind: "AI-CLIP" })],
      ["bad-kind", set({ kind: 1 })],
      ["bad-kind", set({ kind: null })],
      ["bad-attempt-id", (s) => void delete ai(s).attempt_id],
      ["bad-attempt-id", set({ attempt_id: AI_ATTEMPT.toUpperCase() })],
      ["bad-attempt-id", set({ attempt_id: AI_ATTEMPT.slice(1) })], // 35 characters
      ["bad-attempt-id", set({ attempt_id: AI_ATTEMPT.replace(/-/g, "") })], // 32 characters
      ["bad-attempt-id", set({ attempt_id: movedDashes })], // 36 characters, the dashes moved
      ["bad-attempt-id", set({ attempt_id: 42 })],
      ["attempt-on-recorded", set({ kind: "recorded-clip" })],
      ["attempt-on-recorded", (s) => void delete ai(s).kind],
      ["crop-on-ai", (s) => void (s.sources[1].crop_top = 80)],
      ["crop-on-ai", (s) => void (s.sources[1].crop_top = 2)],
      ["crop-on-ai", set({ crop_top: "0" })],
    ];
    for (const [code, plant] of faults) {
      const s = clone(good);
      plant(s);
      expect(validateSpec(s).some((l) => l.startsWith(`${code}:`))).toBe(true);
    }
    // the keys on a recorded take, and the crop_top 0 of an AI clip written out
    const spelled = clone(good);
    Object.assign(spelled.sources[0] as unknown as Record<string, unknown>, { kind: "recorded-clip" });
    spelled.sources[1].crop_top = 0;
    expect(validateSpec(spelled)).toEqual([]);
    // listed as a recorded take, the AI clip is one: cut by output.crop_top, no attempt id
    const asTake = clone(good);
    Object.assign(ai(asTake), { kind: "recorded-clip" });
    delete asTake.sources[1].attempt_id;
    expect(validateSpec(asTake)).toEqual([]);
  });

  test("(21) the crop of an ai-clip source is 0 in the validator: with output.crop_top 80 an AI clip 360x60 passes and a recorded one of that shape does not; 360x660 fits the output height only after the crop; a box in the top 80 rows", () => {
    const base = aiMixedSpec(SHA, "cd".repeat(32));
    expect(base.output.crop_top).toBe(80); // 80 of the 640 output rows
    expect(base.output.height).toBe(640);
    const spec = (aiSource: boolean, h: number, box?: boolean): ClipEditSpec => {
      const s = clone(base);
      s.sources = [
        {
          id: "s",
          file: "s.mp4",
          sha256: SHA,
          ...(aiSource ? { kind: "ai-clip" as const, attempt_id: AI_ATTEMPT } : {}),
          width: 360,
          height: h,
          blur: box ? [{ from: 0, to: 1, x: 20, y: 10, w: 100, h: 20, hides: "made-up test plate" }] : [],
          cut: [],
        },
      ];
      s.videos = [{ slug: "probe", beats: [{ n: 1, clip: "one", dur: 1, pieces: [{ src: "s", from: 0, to: 1 }] }] }];
      return s;
    };
    // 360x60: an AI clip is used whole; a recorded take of that shape has no picture under output.crop_top
    expect(validateSpec(spec(true, 60))).toEqual([]);
    expect(validateSpec(spec(false, 60))).toEqual(["bad-output: output.crop_top leaves no picture of sources[0]"]);
    // 360x660 at the output height 640: a recorded take fits after the crop, an AI clip is taller than the output
    expect(validateSpec(spec(false, 660))).toEqual([]);
    expect(validateSpec(spec(true, 660))).toEqual(["content-too-tall: sources[0] is taller than 640 px after the crop and the scale to 360"]);
    // a box at rows 10..30 sits inside the top 80 rows: above the crop of a recorded take, inside the picture of an AI clip
    expect(validateSpec(spec(false, 500, true))).toEqual(["box-above-crop: sources[0].blur[0] sits inside the cropped top 80 rows"]);
    expect(validateSpec(spec(true, 500, true))).toEqual([]);
  });

  test("(22) pixelShape of an ai-clip source 720x1278 at output width 1080 and output.crop_top 2 is not 1:1; the same source as a recorded take, cropped by 2, is", () => {
    const o = { width: 1080, crop_top: 2 };
    const src = (aiSource: boolean): ClipEditSpec["sources"][number] => ({
      id: "a",
      file: "a.mp4",
      sha256: SHA,
      ...(aiSource ? { kind: "ai-clip" as const, attempt_id: AI_ATTEMPT } : {}),
      width: 720,
      height: 1278,
      blur: [],
      cut: [],
    });
    expect(pixelShape(src(false), o)).toBe("1:1"); // 720x1276 scaled to 1080 is 1914 rows
    expect(pixelShape(src(true), o)).toBe("1918:1917"); // 720x1278 scaled to 1080 is brought to 1918 rows
    const cropped = src(true);
    cropped.crop_top = 2;
    expect(pixelShape(cropped, o)).toBe("1918:1917"); // the crop_top of an AI clip is not taken
  });

  ffTest("(23) ai-mixed: a recorded take cut by output.crop_top beside an ai-clip source with no intake record and a sound track; the edit record lists the kinds and the attempt id; no audio; the AI frames start at source row 0", () => {
    const f = aiMixed();
    expect(validateSpec(f.spec)).toEqual([]);
    expect(fs.existsSync(path.join(f.intakeDir, `${f.aiSha256}.intake.json`))).toBe(false); // an AI clip needs no intake record
    const spend = writeLines(f.spendDir, "record.jsonl", [outcomeLine(f.aiSha256)]);
    const spendText = fs.readFileSync(spend, "utf8");
    const r = apply(f, spendArgs([spend]));
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(r.out).toBe("clip-edit: wrote ai-mixed frames=90 sec=3\n");
    expect(fs.readFileSync(spend, "utf8")).toBe(spendText); // the record is only read
    const mp4 = path.join(f.outDir, "ai-mixed.mp4");
    const p = spawnSync(
      ffprobeBin(),
      ["-v", "error", "-count_frames", "-show_entries", "stream=codec_type,codec_name,pix_fmt,width,height,sample_aspect_ratio,r_frame_rate,avg_frame_rate,nb_read_frames", "-of", "json", mp4],
      { encoding: "utf8" },
    );
    const streams = (JSON.parse(p.stdout) as { streams: Record<string, string>[] }).streams;
    expect(streams).toHaveLength(1); // the aac track of the AI clip is not carried over
    expect(streams[0]).toMatchObject({
      codec_type: "video",
      codec_name: "h264",
      pix_fmt: "yuv420p",
      width: 360,
      height: 640,
      sample_aspect_ratio: "1:1",
      r_frame_rate: "30/1",
      avg_frame_rate: "30/1",
      nb_read_frames: "90",
    });
    const rec = JSON.parse(fs.readFileSync(path.join(f.outDir, "ai-mixed.edit.json"), "utf8")) as {
      schema: string;
      beats: { pieces: Record<string, unknown>[] }[];
    };
    expect(rec.schema).toBe("clip-edit-manifest/1");
    const pieces = rec.beats.flatMap((b) => b.pieces);
    // a piece of a recorded take is written as before; a piece of an AI clip with its kind and the attempt id
    expect(pieces[0]).toEqual({ kind: "recorded-clip", source: "take", sha256: f.sha256, from: 0, to: 1, out_start: 0 });
    expect(pieces[1]).toEqual({ kind: "ai-clip", source: "ai", sha256: f.aiSha256, attempt_id: AI_ATTEMPT, from: 0, to: 1, out_start: 1 });
    expect(pieces[2]).toEqual({ kind: "ai-clip", source: "ai", sha256: f.aiSha256, attempt_id: AI_ATTEMPT, from: 1, to: 2, out_start: 2 });

    // frames 0..29 play the take: picture rows 110..530, the green band of 80 rows is cut
    for (const n of [0, 15, 29]) {
      const rgb = outRgb(mp4, n);
      expect(rgb.length).toBe(360 * 640 * 3);
      let green = 0;
      let padMin = 255;
      for (let px = 0; px < 360 * 640; px++) {
        const red = rgb[3 * px];
        const g = rgb[3 * px + 1];
        const b = rgb[3 * px + 2];
        if (g - red > 100 && g - b > 100) green++;
        const row = Math.floor(px / 360);
        if (row < 110 - 16 || row >= 530 + 16) padMin = Math.min(padMin, red, g, b);
      }
      expect(green).toBe(0);
      expect(padMin).toBeGreaterThanOrEqual(240);
      const top = outGray(mp4, n, "crop=360:32:0:110");
      const below = srcGray(f.clipOf.take, 30, n, "crop=360:32:0:80");
      const band = srcGray(f.clipOf.take, 30, n, "crop=360:32:0:0");
      console.log(`(23) the take, frame ${n}: top rows against rows below crop_top 80 ${mad(top, below).toFixed(2)}, against the band ${mad(top, band).toFixed(2)}`);
      expect(mad(top, below)).toBeLessThan(8);
      expect(mad(top, band)).toBeGreaterThan(15);
    }
    // frames 30..60 play the AI clip at zoom 1: picture rows 20..620 start at source row 0, with
    // the blue band of its top 80 rows that output.crop_top would have cut
    for (const n of [30, 45, 59, 60]) {
      const top = outGray(mp4, n, "crop=360:32:0:20,scale=32:8");
      const from0 = srcGray(f.clipOf.ai, 30, n - 30, "crop=240:22:0:0,scale=32:8");
      const from80 = srcGray(f.clipOf.ai, 30, n - 30, "crop=240:22:0:80,scale=32:8");
      console.log(`(23) the AI clip, frame ${n}: top rows against source rows 0.. ${mad(top, from0).toFixed(2)}, against rows 80.. ${mad(top, from80).toFixed(2)}`);
      expect(mad(top, from0)).toBeLessThan(8);
      expect(mad(top, from80)).toBeGreaterThan(20);
    }
  });

  ffTest("(24) the spend rule of apply: each refusal code with a made-up record file gives exit 2, one line, and nothing in --out", () => {
    const f = aiMixed();
    /** One --spend file, or more than one, or none; the apply of the fixture spec is refused with `code`. */
    const refused = (files: string | string[] | undefined, code: string): void => {
      const out = tmp(`spend-${code}`);
      const r = apply(f, files === undefined ? [] : spendArgs(typeof files === "string" ? [files] : files), { out });
      expect(r.code).toBe(2);
      expect(r.out).toBe("");
      expect(r.err.split("\n").filter((l) => l !== "")).toEqual([expect.stringMatching(new RegExp(`^${code}: `))]);
      expect(fs.readdirSync(out)).toEqual([]);
    };
    /** A made-up record file with these lines; returns its path. */
    const record = (name: string, lines: unknown[]): string => writeLines(f.spendDir, name, lines);
    const noHash = outcomeLine(f.aiSha256);
    delete noHash.file_sha256; // the line of the video:gen tool carries a file name and no file_sha256

    // spend-missing: the spec holds an ai-clip source and no --spend was given
    refused(undefined, "spend-missing");

    // spend-unreadable: a missing file (not read as "no lines"); a line that is not JSON; a line
    // that is not an object; no final newline. Also when the clip is not in the other lines.
    refused([path.join(f.spendDir, "gone.jsonl")], "spend-unreadable");
    const torn = path.join(f.spendDir, "torn.jsonl");
    fs.writeFileSync(torn, `${JSON.stringify(outcomeLine(f.aiSha256))}\n{"kind": "outcome"`);
    refused([torn], "spend-unreadable");
    refused(record("array.jsonl", [[1, 2]]), "spend-unreadable");
    refused(record("number.jsonl", [42]), "spend-unreadable");
    const noNewline = path.join(f.spendDir, "no-newline.jsonl");
    fs.writeFileSync(noNewline, JSON.stringify(outcomeLine(f.aiSha256)));
    refused([noNewline], "spend-unreadable");
    const otherOnly = writeLines(f.spendDir, "other-only.jsonl", [outcomeLine("ef".repeat(32), { attempt_id: OTHER_ATTEMPT })]);
    refused([path.join(f.spendDir, "gone.jsonl"), otherOnly], "spend-unreadable"); // before not-in-spend

    // not-in-spend: no outcome line of status ok for the attempt id
    refused(record("zero-bytes.jsonl", []), "not-in-spend"); // a file of zero bytes reads as no lines
    refused(record("other-attempt.jsonl", [outcomeLine(f.aiSha256, { attempt_id: OTHER_ATTEMPT })]), "not-in-spend"); // the right hash under another attempt id
    refused(
      record("attempt.jsonl", [{ kind: "attempt", attempt_id: AI_ATTEMPT, service: VIDEO_SERVICE, cost_usd: 0.1, status: "attempted" }]),
      "not-in-spend",
    );
    refused(record("attempt-fits.jsonl", [outcomeLine(f.aiSha256, { kind: "attempt", status: "ok" })]), "not-in-spend"); // kind attempt, all else fits
    refused(record("failed.jsonl", [outcomeLine(f.aiSha256, { status: "failed" })]), "not-in-spend");
    refused(record("not-ok.jsonl", [outcomeLine(f.aiSha256, { status: "error" }), outcomeLine(f.aiSha256, { status: "timeout" })]), "not-in-spend");

    // spend-not-video: the outcome lines of the attempt are of a service outside the AI video group
    refused(record("still.jsonl", [outcomeLine(f.aiSha256, { service: STILL_SERVICE })]), "spend-not-video"); // the line of a still picture
    refused(record("unknown-service.jsonl", [outcomeLine(f.aiSha256, { service: "made-up-video-service" })]), "spend-not-video"); // not a key of the table
    refused(record("no-service.jsonl", [outcomeLine(f.aiSha256, { service: undefined })]), "spend-not-video");
    // before spend-hash-mismatch: a line outside the video group with another hash too
    refused(record("order.jsonl", [outcomeLine("ef".repeat(32), { service: STILL_SERVICE })]), "spend-not-video");

    // spend-hash-mismatch: no ok video line of the attempt has the sha256 of the clip file
    refused(record("other-hash.jsonl", [outcomeLine("ef".repeat(32))]), "spend-hash-mismatch");
    refused(record("no-hash.jsonl", [noHash]), "spend-hash-mismatch");
    refused(record("upper-hash.jsonl", [outcomeLine(f.aiSha256, { file_sha256: f.aiSha256.toUpperCase() })]), "spend-hash-mismatch");
    refused(record("hash-outside.jsonl", [outcomeLine("ef".repeat(32)), outcomeLine(f.aiSha256, { service: STILL_SERVICE })]), "spend-hash-mismatch");

    // ai-as-recorded: a spec that lists the AI clip as a recorded take, with an intake record
    // written by hand, and --spend named
    const asTake = clone(f.spec);
    const ai = asTake.sources[1] as unknown as Record<string, unknown>;
    delete ai.kind;
    delete ai.attempt_id;
    expect(validateSpec(asTake)).toEqual([]);
    fs.writeFileSync(
      path.join(f.intakeDir, `${f.aiSha256}.intake.json`),
      JSON.stringify({ schema: "clip-intake/1", file_name: "ai.mp4", sha256: f.aiSha256 }) + "\n",
    );
    const asTakePath = writeSpec(f, "as-take.json", asTake);
    const oneLine = (lines: unknown[], name: string): void => {
      const out = tmp(name);
      const r = apply(f, spendArgs([record(`${name}.jsonl`, lines)]), { spec: asTakePath, out });
      expect(r.code).toBe(2);
      expect(r.out).toBe("");
      expect(r.err).toBe(`ai-as-recorded: source ai is a recorded-clip source whose sha256 is the file_sha256 of a line in --spend\n`);
      expect(fs.readdirSync(out)).toEqual([]);
    };
    oneLine([outcomeLine(f.aiSha256)], "as-take-ok");
    oneLine([outcomeLine(f.aiSha256, { status: "failed" })], "as-take-failed"); // any line of the record
    oneLine([outcomeLine(f.aiSha256, { attempt_id: OTHER_ATTEMPT, service: STILL_SERVICE })], "as-take-other-attempt");
    // a record without a line for this file: the take is cut as a recorded one
    const otherOut = tmp("as-take-unlisted");
    const other = apply(f, spendArgs([record("as-take-unlisted.jsonl", [outcomeLine("ef".repeat(32))])]), { spec: asTakePath, out: otherOut });
    expect(other.err).toBe("");
    expect(other.code).toBe(0);
    expect(fs.readdirSync(otherOut)).toContain("ai-mixed.edit.json");
  });

  ffTest("(25) more than one --spend file is read: the outcome line alone in the first file, alone in the second, or in both; a zero-byte file and a blank line read as no lines; several outcome lines of one attempt", () => {
    const f = aiMixed();
    const cut = (files: string[], name: string): void => {
      const out = tmp(name);
      const r = apply(f, spendArgs(files), { out });
      expect(r.err).toBe("");
      expect(r.code).toBe(0);
      expect(fs.readdirSync(out)).toContain("ai-mixed.mp4");
    };
    const line = outcomeLine(f.aiSha256);
    const unrelated = outcomeLine("ef".repeat(32), { attempt_id: OTHER_ATTEMPT, service: STILL_SERVICE });
    const first = writeLines(f.spendDir, "first.jsonl", [line, unrelated]);
    const second = writeLines(f.spendDir, "second.jsonl", [line]);
    const rest = writeLines(f.spendDir, "rest.jsonl", [unrelated]);
    cut([first, rest], "first-only"); // the outcome line stands only in the FIRST of the two files
    cut([rest, second], "second-only"); // and only in the second
    cut([first, second], "both"); // the live record and its archive share lines
    const empty = path.join(f.spendDir, "empty.jsonl");
    fs.writeFileSync(empty, "");
    cut([empty, second], "zero-bytes");
    const blank = path.join(f.spendDir, "blank.jsonl");
    fs.writeFileSync(blank, `  \n${JSON.stringify(line)}\n\n`);
    cut([blank], "blank-line");
    // several outcome lines of the attempt: one of another status and one of another hash beside the one that fits
    const several = writeLines(f.spendDir, "several.jsonl", [outcomeLine(f.aiSha256, { status: "failed" }), outcomeLine("ef".repeat(32)), line]);
    cut([several], "several");
  });

  ffTest("(26) --intake stays required, also for a spec with ai-clip sources only; that spec is cut with --spend and an empty intake folder", () => {
    const f = aiMixed();
    const spend = writeLines(f.spendDir, "record.jsonl", [outcomeLine(f.aiSha256)]);
    const out = tmp("no-intake");
    const r = runCli(["apply", "--spec", f.specPath, "--clips", f.clipsDir, "--out", out, ...spendArgs([spend])]);
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
    expect(r.err.startsWith("usage:")).toBe(true);
    expect(fs.readdirSync(out)).toEqual([]);

    const only = clone(f.spec);
    only.sources = [only.sources[1]];
    only.videos[0].beats = [{ n: 1, clip: "two", dur: 2, pieces: only.videos[0].beats[1].pieces }];
    expect(validateSpec(only)).toEqual([]);
    const cut = apply(f, spendArgs([spend]), { spec: writeSpec(f, "only-ai.json", only), intake: tmp("empty-intake") });
    expect(cut.err).toBe("");
    expect(cut.code).toBe(0);
    expect(cut.out).toBe("clip-edit: wrote ai-mixed frames=60 sec=2\n");
  });

  ffTest("(27) a spec with no ai-clip source: it is cut as before; with --spend each named file is read, also here (spend-unreadable for a missing one)", () => {
    const f = fixture();
    const plain = apply(f);
    expect(plain.err).toBe("");
    expect(plain.code).toBe(0);
    const out = tmp("no-ai-spend");
    const missing = apply(f, spendArgs([path.join(f.root, "gone.jsonl")]), { out });
    expect(missing.code).toBe(2);
    expect(missing.out).toBe("");
    expect(missing.err).toBe("spend-unreadable: gone.jsonl cannot be read\n");
    expect(fs.readdirSync(out)).toEqual([]);
    const dir = tmp("spend-other");
    const other = apply(f, spendArgs([writeLines(dir, "record.jsonl", [outcomeLine("ef".repeat(32), { attempt_id: OTHER_ATTEMPT })])]));
    expect(other.err).toBe("");
    expect(other.code).toBe(0);
  });

  ffTest("(28) an ai-clip source that --only leaves unused is held to the spend rule: spend-missing without --spend, not-in-spend without its line", () => {
    const f = aiMixed();
    const two = clone(f.spec);
    const takeOnly = clone(f.spec).videos[0];
    takeOnly.slug = "take-only";
    takeOnly.beats = [takeOnly.beats[0]];
    two.videos.push(takeOnly);
    const twoPath = writeSpec(f, "two.json", two);
    expect(validateSpec(two)).toEqual([]);
    const missing = apply(f, ["--only", "take-only"], { spec: twoPath });
    expect(missing.code).toBe(2);
    expect(missing.out).toBe("");
    expect(missing.err.split("\n").filter((l) => l !== "")).toEqual([expect.stringMatching(/^spend-missing: /)]);
    const absent = apply(
      f,
      [...spendArgs([writeLines(f.spendDir, "other.jsonl", [outcomeLine(f.aiSha256, { attempt_id: OTHER_ATTEMPT })])]), "--only", "take-only"],
      { spec: twoPath },
    );
    expect(absent.code).toBe(2);
    expect(absent.out).toBe("");
    expect(absent.err.split("\n").filter((l) => l !== "")).toEqual([expect.stringMatching(/^not-in-spend: /)]);
    const good = apply(f, [...spendArgs([writeLines(f.spendDir, "good.jsonl", [outcomeLine(f.aiSha256)])]), "--only", "take-only"], { spec: twoPath });
    expect(good.err).toBe("");
    expect(good.code).toBe(0);
    expect(good.out).toBe("clip-edit: wrote take-only frames=30 sec=1\n");
  });

  // ── the order of the spend codes is over all ai-clip sources of the spec ───────────────────

  /** apply of twoAiSpec with a record of `lines(sha256 of the AI clip)`. */
  function applyTwoAi(lines: (aiSha: string) => unknown[]): { f: AiFixture; spec: string; r: ReturnType<typeof apply> } {
    const f = aiMixed();
    const two = twoAiSpec(f.sha256, f.aiSha256);
    expect(validateSpec(two)).toEqual([]);
    const spec = writeSpec(f, "two-ai.json", two);
    return { f, spec, r: apply(f, spendArgs([writeLines(f.spendDir, "record.jsonl", lines(f.aiSha256))]), { spec }) };
  }
  const WRONG_SHA = "ef".repeat(32);

  ffTest("(29) two ai-clip sources, the first with a wrong hash and the second with an attempt id in no line: not-in-spend, naming the second", () => {
    const { f, r } = applyTwoAi(() => [outcomeLine(WRONG_SHA)]);
    expect(r.err).toBe("not-in-spend: source ai2 has no outcome line of status ok for its attempt_id in --spend\n");
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
    expect(fs.readdirSync(f.outDir)).toEqual([]);
  });

  ffTest("(30) two ai-clip sources, the first with the line of a still service and the second with a wrong hash: spend-not-video, naming the first", () => {
    const { f, r } = applyTwoAi((aiSha) => [outcomeLine(aiSha, { service: STILL_SERVICE }), outcomeLine(WRONG_SHA, { attempt_id: OTHER_ATTEMPT })]);
    expect(r.err).toBe("spend-not-video: source ai has no outcome line of status ok of a service of the AI video group in --spend\n");
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
    expect(fs.readdirSync(f.outDir)).toEqual([]);
  });

  ffTest("(31) two ai-clip sources, both with a wrong hash: spend-hash-mismatch, naming the first; with both lines right the spec is cut", () => {
    const { f, spec, r } = applyTwoAi(() => [outcomeLine(WRONG_SHA), outcomeLine(WRONG_SHA, { attempt_id: OTHER_ATTEMPT })]);
    expect(r.err).toBe("spend-hash-mismatch: source ai has no outcome line of status ok with the sha256 of the clip file in --spend\n");
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
    expect(fs.readdirSync(f.outDir)).toEqual([]);
    const right = writeLines(f.spendDir, "right.jsonl", [outcomeLine(f.aiSha256), outcomeLine(f.aiSha256, { attempt_id: OTHER_ATTEMPT })]);
    const good = apply(f, spendArgs([right]), { spec });
    expect(good.err).toBe("");
    expect(good.code).toBe(0);
  });

  ffTest("(32) two ai-clip sources, the first with the line of a still service and the second with an attempt id in no line: not-in-spend, naming the second (before spend-not-video)", () => {
    const { f, r } = applyTwoAi((aiSha) => [outcomeLine(aiSha, { service: STILL_SERVICE })]);
    expect(r.err).toBe("not-in-spend: source ai2 has no outcome line of status ok for its attempt_id in --spend\n");
    expect(r.code).toBe(2);
    expect(r.out).toBe("");
    expect(fs.readdirSync(f.outDir)).toEqual([]);
  });
});
