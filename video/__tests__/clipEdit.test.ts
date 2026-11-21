/**
 * Row A41-clip-cut — clip:edit tests. Real system ffmpeg on a small clip made at test time:
 * a fake ffmpeg cannot show frame counts or blur. Tests that need it are skipped, with the
 * reason in the name, when it is missing.
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { buildGraph, buildManifest, filterNames, runCli, validateSpec, type ClipEditSpec } from "../clipEdit";
import { fixtureSpec, makeEditFixture, type EditFixture } from "../clipEditFixture";
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
});
