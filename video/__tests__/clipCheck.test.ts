/**
 * Row A41-clip-cut — clip:edit check tests. The parts read pixels, so these need the system
 * ffmpeg on the fixture clip; they are skipped, with the reason in the name, when it is missing.
 */

import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { buildGraph, runCli, type ClipEditSpec } from "../clipEdit";
import { runCheckCli } from "../clipCheck";
import { fixtureSpec, makeEditFixture, makeMixedFixture, makeZoomFixture, mixedSpec, zoomSpec, type EditFixture, type SpecFixture } from "../clipEditFixture";
import { hasSystemFfmpeg, resolveSystemFfmpeg } from "../contactSheet";

jest.setTimeout(120000);

const made: string[] = [];
const fixtures: EditFixture[] = [];
let good: { f: EditFixture; specPa: string; out: string } | null = null;

afterAll(() => {
  for (const f of fixtures) f.cleanup();
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

function tmp(name: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `clip-check-${name}-`));
  made.push(d);
  return d;
}

function ffTest(name: string, fn: () => void): void {
  if (process.platform === "win32") test.skip(`${name} (win32)`, fn);
  else if (!hasSystemFfmpeg()) test.skip(`${name} (no-system-ffmpeg)`, fn);
  else test(name, fn);
}

function clone(s: ClipEditSpec): ClipEditSpec {
  return JSON.parse(JSON.stringify(s)) as ClipEditSpec;
}

function sha(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function ff(args: string[]): void {
  const r = spawnSync(resolveSystemFfmpeg(), ["-y", "-v", "error", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
}

function check(spec: string, clips: string, out: string, extra: string[] = []) {
  return runCheckCli(["check", "--spec", spec, "--clips", clips, "--out", out, ...extra]);
}

function applySpec(f: EditFixture, spec: string, out: string) {
  return runCli(["apply", "--spec", spec, "--clips", f.clipsDir, "--intake", f.intakeDir, "--out", out]);
}

/** One shared fixture with a good apply of spec-pa (prove_absent does not change the graph). */
function goodOnce(): { f: EditFixture; specPa: string; out: string } {
  if (!good) {
    const f = makeEditFixture();
    fixtures.push(f);
    const pa = clone(f.spec);
    pa.sources[0].cut[0].prove_absent = { from: 1.55, to: 1.95 };
    const specPa = path.join(f.root, "spec-pa.json");
    fs.writeFileSync(specPa, JSON.stringify(pa, null, 2) + "\n");
    const r = applySpec(f, specPa, f.outDir);
    if (r.code !== 0) throw new Error(`the good apply failed: ${r.err}`);
    good = { f, specPa, out: f.outDir };
  }
  return good;
}

/** A variant spec of spec-pa, written into the fixture root. */
function variant(g: { f: EditFixture; specPa: string }, name: string, plant: (s: ClipEditSpec) => void): string {
  const s = clone(JSON.parse(fs.readFileSync(g.specPa, "utf8")) as ClipEditSpec);
  plant(s);
  const p = path.join(g.f.root, name);
  fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
  return p;
}

/** An applied variant, cut into its own out folder so the good mp4 stays. */
function applied(g: { f: EditFixture; specPa: string }, name: string, plant: (s: ClipEditSpec) => void): { spec: string; out: string } {
  const spec = variant(g, name, plant);
  const out = tmp(name.replace(/\.json$/, ""));
  const r = applySpec(g.f, spec, out);
  if (r.code !== 0) throw new Error(`the variant apply failed: ${r.err}`);
  return { spec, out };
}

function expectFail(r: { code: number; out: string; err: string }, line: string, n?: number): void {
  expect(r.code).toBe(1);
  expect(r.out).toContain(`${line}\n`);
  const lines = r.out.split("\n").filter((l) => l !== "");
  expect(lines[lines.length - 1]).toMatch(n === undefined ? /^clip-edit check: videos=1 fail=[1-9][0-9]*$/ : new RegExp(`^clip-edit check: videos=1 fail=${n}$`));
}

/** The good output with a filter on top, re-encoded lossless so a planted pixel survives. */
function planted(g: { out: string }, vf: string): string {
  const out = tmp("planted");
  ff(["-i", path.join(g.out, "test-cut.mp4"), "-vf", vf, "-an", "-c:v", "libx264", "-crf", "0", "-pix_fmt", "yuv420p", path.join(out, "test-cut.mp4")]);
  return out;
}

/** The graph of spec-pa with the crop offset 80 replaced, run by the test. */
function cropAt(g: { f: EditFixture; specPa: string }, offset: number): string {
  const spec = clone(JSON.parse(fs.readFileSync(g.specPa, "utf8")) as ClipEditSpec);
  const gr = buildGraph(spec, spec.videos[0]);
  const s0 = spec.sources[0];
  const ct = spec.output.crop_top;
  const graph = gr.graph.replace(`crop=${s0.width}:${s0.height - ct}:0:${ct}`, `crop=${s0.width}:${s0.height - ct}:0:${offset}`);
  if (graph === gr.graph) throw new Error("the crop offset was not planted");
  const out = tmp(`crop${offset}`);
  ff(["-i", g.f.clipFile, "-filter_complex", graph, "-map", `[${gr.outLabel}]`, "-map_metadata", "-1", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(out, "test-cut.mp4")]);
  return out;
}

/** sha256 of the content of each file under a folder, by relative path. */
function snapshot(dir: string): Record<string, string> {
  const res: Record<string, string> = {};
  const walk = (d: string, pre: string): void => {
    for (const n of fs.readdirSync(d).sort()) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) {
        res[`${pre}${n}/`] = "dir";
        walk(p, `${pre}${n}/`);
      } else res[`${pre}${n}`] = sha(p);
    }
  };
  walk(dir, "");
  return res;
}

/** A test-made source whose rows are equal (a left-to-right ramp), a spec of its own and an
 *  output cut with the apply graph by the system ffmpeg. */
function rampCase(): { spec: string; clips: string; out: string } {
  const root = tmp("ramp");
  const clips = path.join(root, "clips");
  const out = path.join(root, "out");
  fs.mkdirSync(clips);
  fs.mkdirSync(out);
  const clip = path.join(clips, "fixture.mp4");
  ff(["-f", "lavfi", "-i", "nullsrc=size=360x568:rate=30:duration=1", "-vf", "format=yuv420p,geq=lum='X*255/359':cb=128:cr=128", "-c:v", "libx264", "-crf", "0", "-pix_fmt", "yuv420p", clip]);
  const s = fixtureSpec(sha(clip));
  s.sources[0].blur = [];
  s.sources[0].cut = [];
  s.videos[0].beats = [{ n: 1, clip: "first", dur: 1, pieces: [{ src: "a", from: 0, to: 1 }] }];
  const spec = path.join(root, "spec.json");
  fs.writeFileSync(spec, JSON.stringify(s, null, 2) + "\n");
  ff(["-i", clip, "-vf", "setpts=PTS-STARTPTS,fps=30,crop=360:488:0:80,pad=360:640:0:76:color=0xFFFFFF,format=yuv420p", "-frames:v", "30", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(out, "test-cut.mp4")]);
  return { spec, clips, out };
}

function expectRefused(r: { code: number; out: string; err: string }, code: string): void {
  expect(r.code).toBe(2);
  expect(r.err.startsWith(`${code}:`)).toBe(true);
  expect(r.out).toBe("");
}

function list(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, pre: string): void => {
    for (const n of fs.readdirSync(d).sort()) {
      out.push(pre + n);
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) walk(p, `${pre}${n}/`);
    }
  };
  walk(dir, "");
  return out;
}

// ── the per-source shape and the zoom: fixtures with sources of their own ───────────────────

/** A spec written into the fixture root. */
function specAt(f: SpecFixture, name: string, s: unknown): string {
  const p = path.join(f.root, name);
  fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
  return p;
}
function appliedTo(f: SpecFixture, spec: string, name: string): string {
  const out = tmp(name);
  const r = runCli(["apply", "--spec", spec, "--clips", f.clipsDir, "--intake", f.intakeDir, "--out", out]);
  if (r.code !== 0) throw new Error(`the apply of ${name} failed: ${r.err}`);
  return out;
}
function expectPass(r: { code: number; out: string; err: string }, slug: string, parts: string[]): void {
  expect(r.err).toBe("");
  expect(r.code).toBe(0);
  const lines = r.out.split("\n").filter((l) => l !== "");
  expect(lines).toHaveLength(parts.length + 2);
  for (const part of parts) expect(lines).toContain(`PASS ${part} ${slug}`);
  expect(lines[lines.length - 1]).toBe("clip-edit check: videos=1 fail=0");
}

let mixedGood: { f: SpecFixture; out: string } | null = null;
/** The mixed fixture with a good apply of its spec (makeMixedFixture says what it holds). */
function mixedOnce(): { f: SpecFixture; out: string } {
  if (!mixedGood) {
    const f = makeMixedFixture();
    fixtures.push(f);
    mixedGood = { f, out: appliedTo(f, f.specPath, "mixed-good") };
  }
  return mixedGood;
}

let zoomGood: { f: SpecFixture; spec: string; out: string } | null = null;
/** The zoom fixture with a good apply: the detail clip 0..1 s ending at zoom 1.12. */
function zoomOnce(): { f: SpecFixture; spec: string; out: string } {
  if (!zoomGood) {
    const f = makeZoomFixture();
    fixtures.push(f);
    zoomGood = { f, spec: f.specPath, out: appliedTo(f, f.specPath, "zoom-good") };
  }
  return zoomGood;
}

describe("clip:edit check", () => {
  ffTest("(2) good output: exit 0, fail=0, a PASS line for each of the six parts", () => {
    const g = goodOnce();
    const r = check(g.specPa, g.f.clipsDir, g.out);
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    const lines = r.out.split("\n").filter((l) => l !== "");
    expect(lines).toHaveLength(8);
    expect(lines[0]).toBe(`clip-edit check: test-cut mp4 sha256=${sha(path.join(g.out, "test-cut.mp4"))}`);
    for (const part of ["shape", "blur", "cut", "bars", "crop", "still"]) {
      expect(lines).toContain(`PASS ${part} test-cut`);
    }
    expect(lines[lines.length - 1]).toBe("clip-edit check: videos=1 fail=0");
  });

  ffTest("(4) FAIL blur: apply of spec-pa with blur: []", () => {
    const g = goodOnce();
    const v = applied(g, "no-blur.json", (s) => void (s.sources[0].blur = []));
    const r = check(g.specPa, g.f.clipsDir, v.out);
    expectFail(r, "FAIL blur test-cut");
  });

  ffTest("(5) FAIL cut: source 0-3 s played straight through the same crop and pad", () => {
    const g = goodOnce();
    const out = tmp("straight");
    ff([
      "-i",
      g.f.clipFile,
      "-vf",
      "setpts=PTS-STARTPTS,fps=30,crop=360:488:0:80,pad=360:640:0:76:color=0xFFFFFF,format=yuv420p",
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      path.join(out, "test-cut.mp4"),
    ]);
    const r = check(g.specPa, g.f.clipsDir, out);
    expectFail(r, "FAIL cut test-cut");
  });

  ffTest("(6) FAIL shape: fps on the good output retimed to 25 fps (75 frames, 25/1)", () => {
    const g = goodOnce();
    const out = tmp("fps25");
    ff(["-i", path.join(g.out, "test-cut.mp4"), "-vf", "setpts=N/25/TB", "-r", "25", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(out, "test-cut.mp4")]);
    const r = check(g.specPa, g.f.clipsDir, out);
    expectFail(r, "FAIL shape: fps test-cut");
    expect(r.out).not.toContain("FAIL shape: frames");
  });

  ffTest("(7) FAIL bars: output padded without the crop", () => {
    const g = goodOnce();
    const out = tmp("nocrop-pad");
    ff([
      "-i",
      g.f.clipFile,
      "-vf",
      "setpts=PTS-STARTPTS,fps=30,pad=360:640:0:36:color=0xFFFFFF,format=yuv420p",
      "-frames:v",
      "75",
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      path.join(out, "test-cut.mp4"),
    ]);
    const r = check(g.specPa, g.f.clipsDir, out);
    expectFail(r, "FAIL bars test-cut");
  });

  ffTest("(14) FAIL flat-source: a variant without the cut plays 1.4-2.1 with a box at 1.5-2.0 (only magenta under it)", () => {
    const g = goodOnce();
    const v = applied(g, "flat.json", (s) => {
      s.sources[0].cut = [];
      s.sources[0].blur = [{ from: 1.5, to: 2, x: 20, y: 100, w: 160, h: 120, hides: "made-up test plate" }];
      s.videos[0].beats = [{ n: 1, clip: "first", dur: 0.7, pieces: [{ src: "a", from: 1.4, to: 2.1 }] }];
    });
    const r = check(v.spec, g.f.clipsDir, v.out);
    expectFail(r, "FAIL flat-source test-cut");
  });

  ffTest("(15) FAIL shape: frames on an output one frame short", () => {
    const g = goodOnce();
    const out = tmp("short");
    ff(["-i", path.join(g.out, "test-cut.mp4"), "-frames:v", "74", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(out, "test-cut.mp4")]);
    const r = check(g.specPa, g.f.clipsDir, out);
    expectFail(r, "FAIL shape: frames test-cut");
  });

  ffTest("(16) refuses source-changed", () => {
    const g = goodOnce();
    const bad = variant(g, "changed.json", (s) => void (s.sources[0].sha256 = "ab".repeat(32)));
    expectRefused(check(bad, g.f.clipsDir, g.out), "source-changed");
  });

  ffTest("(17) refuses output-missing, spec-invalid and source-missing", () => {
    const g = goodOnce();
    expectRefused(check(g.specPa, g.f.clipsDir, tmp("empty-out")), "output-missing");
    const badJson = path.join(g.f.root, "bad.json");
    fs.writeFileSync(badJson, "{ not json");
    expectRefused(check(badJson, g.f.clipsDir, g.out), "spec-invalid");
    const missing = variant(g, "missing.json", (s) => void (s.sources[0].file = "gone.mp4"));
    expectRefused(check(missing, g.f.clipsDir, g.out), "source-missing");
  });

  ffTest("(18) refuses nothing-to-check for videos: [] and for beats: []", () => {
    const g = goodOnce();
    const noVideos = variant(g, "no-videos.json", (s) => void (s.videos = []));
    expectRefused(check(noVideos, g.f.clipsDir, g.out), "nothing-to-check");
    const noBeats = variant(g, "no-beats.json", (s) => void (s.videos[0].beats = []));
    expectRefused(check(noBeats, g.f.clipsDir, g.out), "nothing-to-check");
  });

  ffTest("(19) refuses usage for --only naming no slug and for a missing --spec", () => {
    const g = goodOnce();
    expectRefused(check(g.specPa, g.f.clipsDir, g.out, ["--only", "nope"]), "usage");
    expectRefused(runCheckCli(["check", "--clips", g.f.clipsDir, "--out", g.out]), "usage");
  });

  ffTest("(20) FAIL cut: apply and check of the leak variant (cut from 1.52, the still at 1.519)", () => {
    const g = goodOnce();
    const v = applied(g, "leak.json", (s) => {
      s.sources[0].cut[0].from = 1.52;
      s.videos[0].beats[0].pieces[1] = { src: "a", still: 1.519, sec: 0.5 };
    });
    const r = check(v.spec, g.f.clipsDir, v.out);
    expectFail(r, "FAIL cut test-cut");
  });

  ffTest("(21) FAIL crop: buildGraph's graph with the crop offset set to 0, run by the test", () => {
    const g = goodOnce();
    const spec = clone(JSON.parse(fs.readFileSync(g.specPa, "utf8")) as ClipEditSpec);
    const gr = buildGraph(spec, spec.videos[0]);
    const s0 = spec.sources[0];
    const ct = spec.output.crop_top;
    const planted = gr.graph.replace(`crop=${s0.width}:${s0.height - ct}:0:${ct}`, `crop=${s0.width}:${s0.height - ct}:0:0`);
    if (planted === gr.graph) throw new Error("the crop offset was not planted");
    const out = tmp("crop0");
    ff(["-i", g.f.clipFile, "-filter_complex", planted, "-map", `[${gr.outLabel}]`, "-map_metadata", "-1", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(out, "test-cut.mp4")]);
    const r = check(g.specPa, g.f.clipsDir, out);
    expectFail(r, "FAIL crop test-cut");
  });

  ffTest("(22) FAIL still: apply of spec-pa with the still at 0.667, checked against spec-pa", () => {
    const g = goodOnce();
    const v = applied(g, "early.json", (s) => void (s.videos[0].beats[0].pieces[1] = { src: "a", still: 0.667, sec: 0.5 }));
    const r = check(g.specPa, g.f.clipsDir, v.out);
    expectFail(r, "FAIL still test-cut");
  });

  ffTest("(23) writes nothing: names and file contents of <out>, the spec folder and the clips folder are the same before and after test 2's check", () => {
    const g = goodOnce();
    const names = list(g.f.root);
    const before = [snapshot(g.f.root), snapshot(g.out), snapshot(g.f.clipsDir)];
    const r = check(g.specPa, g.f.clipsDir, g.out);
    expect(r.code).toBe(0);
    expect(list(g.f.root)).toEqual(names);
    expect([snapshot(g.f.root), snapshot(g.out), snapshot(g.f.clipsDir)]).toEqual(before);
  });

  ffTest("(24) FAIL cut: unproven, the cut of a played source has no prove_absent", () => {
    const g = goodOnce();
    const spec = variant(g, "unproven.json", (s) => void delete s.sources[0].cut[0].prove_absent);
    expectFail(check(spec, g.f.clipsDir, g.out), "FAIL cut: unproven test-cut", 1);
  });

  ffTest("(25) FAIL cut: empty-window, a prove_absent window with no native frame", () => {
    const g = goodOnce();
    for (const [name, win] of [["narrow.json", { from: 1.551, to: 1.552 }], ["past-end.json", { from: 50, to: 51 }]] as const) {
      const spec = variant(g, name, (s) => void (s.sources[0].cut[0].prove_absent = { ...win }));
      expectFail(check(spec, g.f.clipsDir, g.out), "FAIL cut: empty-window test-cut", 1);
    }
  });

  ffTest("(26) FAIL cut: short-read, the output one frame short", () => {
    const g = goodOnce();
    const out = tmp("short-cut");
    ff(["-i", path.join(g.out, "test-cut.mp4"), "-frames:v", "74", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(out, "test-cut.mp4")]);
    expectFail(check(g.specPa, g.f.clipsDir, out), "FAIL cut: short-read test-cut");
  });

  ffTest("(27) FAIL shape: codec, one planted mp4 not h264 and one not yuv420p", () => {
    const g = goodOnce();
    for (const enc of [["-c:v", "mpeg4", "-pix_fmt", "yuv420p"], ["-c:v", "libx264", "-pix_fmt", "yuv444p"]]) {
      const out = tmp("codec");
      ff(["-i", path.join(g.out, "test-cut.mp4"), "-an", ...enc, path.join(out, "test-cut.mp4")]);
      expectFail(check(g.specPa, g.f.clipsDir, out), "FAIL shape: codec test-cut");
    }
  });

  ffTest("(28) FAIL shape: size, another size with the same frame count", () => {
    const g = goodOnce();
    const out = planted(g, "scale=320:568");
    expectFail(check(g.specPa, g.f.clipsDir, out), "FAIL shape: size test-cut", 1);
  });

  ffTest("(29) FAIL shape: audio, a silent track added to the good video", () => {
    const g = goodOnce();
    const out = tmp("audio");
    ff(["-i", path.join(g.out, "test-cut.mp4"), "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-shortest", path.join(out, "test-cut.mp4")]);
    expectFail(check(g.specPa, g.f.clipsDir, out), "FAIL shape: audio test-cut", 1);
  });

  ffTest("(30) FAIL bars: a flat band of the wrong colour (the mean test)", () => {
    const g = goodOnce();
    const out = planted(g, "drawbox=x=0:y=0:w=iw:h=60:color=0xE0E0E0:t=fill,drawbox=x=0:y=580:w=iw:h=60:color=0xE0E0E0:t=fill");
    expectFail(check(g.specPa, g.f.clipsDir, out), "FAIL bars test-cut", 1);
  });

  ffTest("(31) FAIL bars: one band pixel a few levels off, the row mean within 2 (the flat test)", () => {
    const g = goodOnce();
    const out = planted(g, "drawbox=x=100:y=10:w=1:h=1:color=0xF8F8F8:t=fill");
    expectFail(check(g.specPa, g.f.clipsDir, out), "FAIL bars test-cut", 1);
  });

  ffTest("(32) FAIL crop: crop offset 28, 8 or more from rows crop_top.. (11.2) but nearer them than rows 0.. (15.9)", () => {
    const g = goodOnce();
    expectFail(check(g.specPa, g.f.clipsDir, cropAt(g, 28)), "FAIL crop test-cut");
  });

  ffTest("(33) FAIL crop: rows 0..32 equal the rows below crop_top, so the difference to them is not below the other", () => {
    const r = rampCase();
    expectFail(check(r.spec, r.clips, r.out), "FAIL crop test-cut", 1);
  });

  ffTest("(34) FAIL cut: the straight-through source with brightness +0.06 (best pair score about 14, between 0.5 and 20)", () => {
    const g = goodOnce();
    const out = tmp("bright");
    ff(["-i", g.f.clipFile, "-vf", "setpts=PTS-STARTPTS,fps=30,eq=brightness=0.06,crop=360:488:0:80,pad=360:640:0:76:color=0xFFFFFF,format=yuv420p", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(out, "test-cut.mp4")]);
    expectFail(check(g.specPa, g.f.clipsDir, out), "FAIL cut test-cut");
  });

  ffTest("(35) a truncated output (10 frames) is an error line with no summary", () => {
    const g = goodOnce();
    const out = tmp("ten");
    ff(["-i", path.join(g.out, "test-cut.mp4"), "-frames:v", "10", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(out, "test-cut.mp4")]);
    const r = check(g.specPa, g.f.clipsDir, out);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/^clip-edit check: error: /);
    expect(r.out).toBe("");
    expect(r.err).not.toContain("videos=");
  });

  ffTest("(36) mixed: check on the good output exits 0 with fail=0; PASS blur, cut and still among the six parts, 8 lines", () => {
    const g = mixedOnce();
    const r = check(g.f.specPath, g.f.clipsDir, g.out);
    expectPass(r, "mixed-cut", ["shape", "blur", "cut", "bars", "crop", "still"]);
    expect(r.out).not.toContain("zoom");
  });

  ffTest("(37) mixed FAIL crop: an output applied with the second source's crop_top set to the first source's (80)", () => {
    const g = mixedOnce();
    const s = clone(g.f.spec);
    s.sources[1].crop_top = s.sources[0].crop_top;
    const out = appliedTo(g.f, specAt(g.f, "crop-80.json", s), "mixed-crop80");
    expectFail(check(g.f.specPath, g.f.clipsDir, out), "FAIL crop mixed-cut");
  });

  ffTest("(38) mixed FAIL blur: an output applied with blur: [] on the second source", () => {
    const g = mixedOnce();
    const s = clone(g.f.spec);
    s.sources[1].blur = [];
    const out = appliedTo(g.f, specAt(g.f, "no-blur.json", s), "mixed-noblur");
    const r = check(g.f.specPath, g.f.clipsDir, out);
    expectFail(r, "FAIL blur mixed-cut", 1);
    expect(r.out).toContain("PASS crop mixed-cut\n"); // the source's own crop_top (0) reads right
  });

  ffTest("(39) mixed FAIL cut: an output that plays the second source straight through its cut", () => {
    // The window is bands: it is found only when the cut part reads with the second source's own crop
    const g = mixedOnce();
    const out = tmp("mixed-straight");
    ff([
      "-i",
      path.join(g.f.clipsDir, "sound.mp4"),
      "-vf",
      "setpts=PTS-STARTPTS,fps=30,crop=240:400:0:0,scale=360:600,pad=360:640:0:20:color=0xFFFFFF,format=yuv420p",
      "-frames:v",
      "90",
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      path.join(out, "mixed-cut.mp4"),
    ]);
    expectFail(check(g.f.specPath, g.f.clipsDir, out), "FAIL cut mixed-cut");
  });

  ffTest("(40) mixed FAIL still: an output applied with the held frame of the second source moved (1.2 s to 1.3 s)", () => {
    const g = mixedOnce();
    const s = clone(g.f.spec);
    s.videos[0].beats[1].pieces[1] = { src: "sound", still: 1.3, sec: 0.5 };
    const out = appliedTo(g.f, specAt(g.f, "moved-still.json", s), "mixed-still");
    const r = check(g.f.specPath, g.f.clipsDir, out);
    expectFail(r, "FAIL still mixed-cut", 1);
  });

  ffTest("(41) zoom: check on the good output exits 0 with PASS zoom (9 lines); an output applied without zoom_to fails on zoom alone", () => {
    const g = zoomOnce();
    const r = check(g.spec, g.f.clipsDir, g.out);
    expectPass(r, "zoom-cut", ["shape", "blur", "cut", "bars", "crop", "still", "zoom"]);
    const s = clone(g.f.spec);
    delete (s.videos[0].beats[0].pieces[0] as { zoom_to?: number }).zoom_to;
    const out = appliedTo(g.f, specAt(g.f, "no-zoom.json", s), "zoom-none");
    expectFail(check(g.spec, g.f.clipsDir, out), "FAIL zoom zoom-cut", 1);
  });

  ffTest("(42) zoom on a source with a band and crop_top 110: the band is gone in the first and the last frame; PASS crop, bars and zoom; an output applied with crop_top 0 fails on crop", () => {
    const g = zoomOnce();
    const f = g.f;
    const bandSha = sha(path.join(f.clipsDir, "zoom-band.mp4"));
    const s = zoomSpec(bandSha, 1.12, 1, "band-zoom");
    s.sources[0] = { id: "z", file: "zoom-band.mp4", sha256: bandSha, width: 360, height: 590, crop_top: 110, blur: [], cut: [] };
    const spec = specAt(f, "band-zoom.json", s);
    const out = appliedTo(f, spec, "band-zoom");
    const mp4 = path.join(out, "band-zoom.mp4");
    for (const n of [0, 29]) {
      const rgb = spawnSync(resolveSystemFfmpeg(), ["-v", "error", "-i", mp4, "-an", "-vf", `trim=start_frame=${n}:end_frame=${n + 1},format=rgb24`, "-f", "rawvideo", "-"], {
        maxBuffer: 64 * 1024 * 1024,
      }).stdout as Buffer;
      expect(rgb.length).toBe(360 * 640 * 3);
      let green = 0;
      let padMin = 255;
      for (let px = 0; px < 360 * 640; px++) {
        const red = rgb[3 * px];
        const grn = rgb[3 * px + 1];
        const blu = rgb[3 * px + 2];
        if (grn - red > 100 && grn - blu > 100) green++;
        const row = Math.floor(px / 360);
        if (row < 80 - 16 || row >= 560 + 16) padMin = Math.min(padMin, red, grn, blu);
      }
      expect(green).toBe(0);
      expect(padMin).toBeGreaterThanOrEqual(240);
    }
    expectPass(check(spec, f.clipsDir, out), "band-zoom", ["shape", "blur", "cut", "bars", "crop", "still", "zoom"]);
    const flatCrop = clone(s);
    flatCrop.sources[0].crop_top = 0;
    const out0 = appliedTo(f, specAt(f, "band-zoom-0.json", flatCrop), "band-zoom0");
    expectFail(check(spec, f.clipsDir, out0), "FAIL crop band-zoom");
  });

  ffTest("(43) zoom-flat: check on a cut of a one-colour source with a zoom piece exits 1 with FAIL zoom", () => {
    const g = zoomOnce();
    const f = g.f;
    const flatSha = sha(path.join(f.clipsDir, "flat.mp4"));
    const s = zoomSpec(flatSha, 1.12, 1, "flat-cut");
    s.sources[0].file = "flat.mp4";
    const spec = specAt(f, "flat.json", s);
    const out = appliedTo(f, spec, "flat-cut");
    expectFail(check(spec, f.clipsDir, out), "FAIL zoom flat-cut", 1);
  });
});
