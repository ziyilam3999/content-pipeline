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
import { makeEditFixture, type EditFixture } from "../clipEditFixture";
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

function expectFail(r: { code: number; out: string; err: string }, line: string): void {
  expect(r.code).toBe(1);
  expect(r.out).toContain(`${line}\n`);
  const lines = r.out.split("\n").filter((l) => l !== "");
  expect(lines[lines.length - 1]).toMatch(/^clip-edit check: videos=1 fail=[1-9][0-9]*$/);
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

  ffTest("(23) writes nothing: a recursive listing of <out> and of the spec folder is the same before and after test 2's check", () => {
    const g = goodOnce();
    const specDir = list(g.f.root);
    const outBefore = list(g.out);
    const r = check(g.specPa, g.f.clipsDir, g.out);
    expect(r.code).toBe(0);
    expect(list(g.f.root)).toEqual(specDir);
    expect(list(g.out)).toEqual(outBefore);
  });
});
