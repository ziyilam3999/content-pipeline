/**
 * Row A41-clip-intake — tests for the clip intake tool (probe, sha256, personal-data check list).
 *
 * Every clip is MADE at test time with the bundled ffmpeg (as renderProbe.test.ts does) or
 * written as tiny bytes, in folders from os.tmpdir(), and removed afterwards; no recording,
 * clip or image is committed. The planted bad clips prove the tool FAILS CLOSED: each test
 * goes red if the tool takes the entry. The only skips are the seven win32/root tests named
 * in the criterion, each with its reason in the test name.
 */
import { execFileSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as zlib from "zlib";

import { runCli, CHECKLIST_KINDS } from "../clipIntake";
import { resolveVendoredFfmpeg } from "../renderProbe";

jest.setTimeout(120000);

const isWin = process.platform === "win32";
const isRoot = !isWin && typeof process.getuid === "function" && process.getuid() === 0;
/** Run only on POSIX (named win32 skips). */
const itPosix = (isWin ? it.skip : it) as typeof it;

// ── tiny PNG + bundled-ffmpeg clip factory ───────────────────────────────────────────────

/** Build a minimal valid RGB PNG of size w×h (black; or noisy rows when the frames must be large to encode). */
function makePng(w: number, h: number, noisy = false): Buffer {
  const crcTable: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf: Buffer): number => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const t = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const raw = Buffer.alloc(h * (1 + w * 3));
  if (noisy) {
    // random pixels (filter byte of each row stays 0): frames too big to compress, so a
    // truncated copy still holds many readable packets
    const rnd = crypto.randomBytes(raw.length);
    for (let i = 0; i < raw.length; i++) {
      if (i % (1 + w * 3) !== 0) raw[i] = rnd[i];
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

function loaderEnv(dir: string): NodeJS.ProcessEnv {
  if (process.platform === "darwin") return { ...process.env, DYLD_FALLBACK_LIBRARY_PATH: dir };
  if (process.platform === "linux") {
    const prev = process.env.LD_LIBRARY_PATH;
    return { ...process.env, LD_LIBRARY_PATH: prev ? `${dir}:${prev}` : dir };
  }
  return { ...process.env };
}

/** Run the bundled ffmpeg (a missing binary is a hard error — the tests go red, not skipped). */
function ffmpeg(args: string[], input?: Buffer): void {
  const { bin, dir } = resolveVendoredFfmpeg();
  execFileSync(bin, ["-hide_banner", ...args], {
    input,
    env: loaderEnv(dir),
    stdio: input ? ["pipe", "ignore", "pipe"] : ["ignore", "ignore", "pipe"],
  });
}

const frameStreams = new Map<string, Buffer>();

function frameStream(w: number, h: number, frames: number, noisy = false): Buffer {
  const key = `${w}x${h}x${frames}x${noisy}`;
  let buf = frameStreams.get(key);
  if (!buf) {
    buf = Buffer.concat(Array.from({ length: frames }, () => makePng(w, h, noisy)));
    frameStreams.set(key, buf);
  }
  return buf;
}

interface ClipOpts {
  w: number;
  h: number;
  frames: number;
  fps?: number;
  audio?: boolean;
  /** encoder fallback list, first that works wins (the bundled build picks its own encoders) */
  codecs?: string[];
  extraOut?: string[];
  /** random pixels: frames too big to compress (for truncation fixtures) */
  noisy?: boolean;
}

/** Make a real clip: PNG frames piped through image2pipe (the bundled ffmpeg cannot encode a lavfi video source). */
function encodeClip(outPath: string, o: ClipOpts): void {
  const fps = o.fps ?? 15;
  const input = frameStream(o.w, o.h, o.frames, o.noisy);
  const baseArgs = (codec: string): string[] => {
    const args = ["-f", "image2pipe", "-c:v", "png", "-framerate", String(fps), "-i", "-"];
    if (o.audio) args.push("-f", "lavfi", "-i", "sine=frequency=440:duration=3");
    args.push("-map", "0:v");
    if (o.audio) args.push("-map", "1:a");
    args.push("-c:v", codec, "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", String(fps));
    if (o.audio) args.push("-c:a", "aac", "-shortest");
    if (o.extraOut) args.push(...o.extraOut);
    args.push("-y", outPath);
    return args;
  };
  const codecs = o.codecs ?? ["libx264"];
  let lastErr: unknown = null;
  for (const codec of codecs) {
    try {
      ffmpeg(baseArgs(codec), input);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`no encoder worked for ${outPath}`);
}

// ── fixtures (made once, kept outside every repo, removed afterwards) ─────────────────────

const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "clipintake-fixture-"));
const fixture = (name: string): string => path.join(fixtureDir, name);
const createdDirs: string[] = [];

function tdir(tag: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), `clipintake-${tag}-`));
  createdDirs.push(d);
  return d;
}

const FPS = 15;
const FRAMES = 16; // 16 frames at 15 fps = 1.0667 s (past the 1 s floor, past 2 packets)

beforeAll(() => {
  encodeClip(fixture("good.mp4"), { w: 1080, h: 1920, frames: FRAMES, fps: FPS });
  encodeClip(fixture("goodAudio.mp4"), { w: 1080, h: 1920, frames: FRAMES, fps: FPS, audio: true });
  encodeClip(fixture("tall.mp4"), { w: 1080, h: 1708, frames: FRAMES, fps: FPS });
  encodeClip(fixture("small.mp4"), { w: 320, h: 568, frames: FRAMES, fps: FPS });
  encodeClip(fixture("oneFrame.mp4"), { w: 1080, h: 1920, frames: 1, fps: FPS });
  encodeClip(fixture("vp9.mp4"), {
    w: 1080, h: 1920, frames: FRAMES, fps: FPS, codecs: ["libvpx-vp9"],
    extraOut: ["-deadline", "realtime", "-cpu-used", "8", "-strict", "experimental"],
  });
  encodeClip(fixture("vp9Small.mp4"), {
    w: 320, h: 568, frames: FRAMES, fps: FPS, codecs: ["libvpx-vp9"],
    extraOut: ["-deadline", "realtime", "-cpu-used", "8", "-strict", "experimental"],
  });
  encodeClip(fixture("hevc.mp4"), { w: 1080, h: 1920, frames: FRAMES, fps: FPS, codecs: ["hevc", "libx265"] });
  // one frame at 1 fps: duration 1.0 s passes the duration rule, 1 packet breaks the packet rule
  encodeClip(fixture("oneFrame1fps.mp4"), { w: 1080, h: 1920, frames: 1, fps: 1 });
  // 8 packets at 30 fps: packets pass, duration 0.267 s breaks the duration rule
  encodeClip(fixture("short8.mp4"), { w: 1080, h: 1920, frames: 8, fps: 30 });
  // 720x1086: the raw pad height 1086*1080/720 = 1629 is ODD, so the even floor matters
  encodeClip(fixture("tallOdd.mp4"), { w: 720, h: 1086, frames: FRAMES, fps: FPS });
  // fragmented with an empty moov (no stsz): the stream carries no nb_frames
  ffmpeg(["-i", fixture("good.mp4"), "-c", "copy", "-movflags", "+frag_keyframe+empty_moov", "-y", fixture("frag.mp4")]);
  // audio-only clip (no video stream)
  ffmpeg(["-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "aac", "-y", fixture("audioOnly.mp4")]);
  // variable frame rate: concat demuxer with per-image durations
  fs.writeFileSync(fixture("v0.png"), makePng(1080, 1920));
  fs.writeFileSync(fixture("v1.png"), makePng(1080, 1920));
  fs.writeFileSync(
    fixture("vfr.txt"),
    "ffconcat version 1.0\nfile 'v0.png'\nduration 0.4\nfile 'v1.png'\nduration 0.6\nfile 'v0.png'\nduration 0.5\nfile 'v1.png'\n",
  );
  ffmpeg([
    "-f", "concat", "-safe", "0", "-i", fixture("vfr.txt"),
    "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-y", fixture("vfr.mp4"),
  ]);
  // rotation 90, stream copy (measured recipe)
  ffmpeg(["-display_rotation", "90", "-i", fixture("good.mp4"), "-c", "copy", "-y", fixture("rotated.mp4")]);
  // +faststart (index at the front) with big frames, then cut 40% off the end: the header
  // still reports the full clip while only -count_packets sees the truth (the B6 shape)
  encodeClip(fixture("fast.mp4"), { w: 1080, h: 1920, frames: 32, fps: FPS, noisy: true, extraOut: ["-movflags", "+faststart"] });
  const cutAt = (src: string, dst: string, fraction: number): void => {
    const bytes = fs.readFileSync(src);
    fs.writeFileSync(dst, bytes.subarray(0, Math.floor(bytes.length * fraction)));
  };
  cutAt(fixture("fast.mp4"), fixture("fastCut.mp4"), 0.6);
  cutAt(fixture("good.mp4"), fixture("moovCut.mp4"), 0.5);
  // a Matroska file named .mp4 (format_name matroska,webm)
  ffmpeg(["-i", fixture("good.mp4"), "-c", "copy", "-f", "matroska", "-y", fixture("mkv.mp4")]);
  // tagged clip: creation_time, location and a custom tag
  encodeClip(fixture("tagged.mp4"), {
    w: 1080, h: 1920, frames: FRAMES, fps: FPS,
    extraOut: [
      "-movflags", "use_metadata_tags",
      "-metadata", "creation_time=1999-01-02T03:04:05Z",
      "-metadata", "location=zz-loc",
      "-metadata", "zz=ZZTAG9",
    ],
  });
}, 600000);

afterAll(() => {
  for (const d of [fixtureDir, ...createdDirs]) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
});

// ── helpers ──────────────────────────────────────────────────────────────────────────────

interface RunResult {
  code: number;
  lines: Record<string, any>[];
  text: string;
  errText: string;
}

/** Drive the module CLI in-process, capturing the stdout lines and the stderr text it writes.
 *  Each run works from a temporary working folder, and that folder and the input folder(s)
 *  (an input file's parent; --out is not compared) must list the same before and after. */
function run(argv: string[], opts?: { probeBin?: string }): RunResult {
  const workDir = tdir("cwd");
  const rest = argv.slice(1);
  const inputPaths: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--out") {
      i++;
      continue;
    }
    inputPaths.push(rest[i]);
  }
  const listedDirs = [workDir];
  for (const p of inputPaths) {
    let isDir = false;
    try {
      isDir = fs.statSync(p).isDirectory();
    } catch {
      isDir = false;
    }
    if (isDir) listedDirs.push(p);
    else listedDirs.push(path.dirname(p));
  }
  const snap = (p: string): string => {
    try {
      return fs.readdirSync(p).sort().join("\n");
    } catch {
      return "<unreadable>";
    }
  };
  const before = listedDirs.map(snap);
  const capture = (sink: string[]) =>
    ((chunk: Uint8Array | string): boolean => {
      sink.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return true;
    }) as unknown as typeof process.stdout.write;
  const chunks: string[] = [];
  const errChunks: string[] = [];
  const outSpy = jest.spyOn(process.stdout, "write").mockImplementation(capture(chunks));
  const errSpy = jest.spyOn(process.stderr, "write").mockImplementation(capture(errChunks));
  let code = -1;
  const prevCwd = process.cwd();
  process.chdir(workDir);
  try {
    code = runCli(argv, opts);
  } finally {
    outSpy.mockRestore();
    errSpy.mockRestore();
    process.chdir(prevCwd);
  }
  listedDirs.forEach((p, i) => {
    expect([p, snap(p)]).toEqual([p, before[i]]); // [folder, listing after] vs [folder, listing before]
  });
  const text = chunks.join("");
  const lines = text.split("\n").filter((l) => l.length > 0).map((l) => JSON.parse(l));
  return { code, lines, text, errText: errChunks.join("") };
}

function shaOf(p: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

function copyIn(tag: string, fixtureName: string, fileName?: string): { inDir: string; clipPath: string } {
  const inDir = tdir(tag);
  const clipPath = path.join(inDir, fileName ?? path.basename(fixtureName));
  fs.copyFileSync(fixture(fixtureName), clipPath);
  return { inDir, clipPath };
}

function readJson(p: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, any>;
}

function answerChecklist(
  outDir: string,
  sha: string,
  opts: { looked_by?: string; cut?: string[]; present?: string[]; custom?: Record<string, string> } = {},
): void {
  const p = path.join(outDir, `${sha}.checklist.json`);
  const c = readJson(p);
  c.looked_by = opts.looked_by ?? "the operator";
  for (const line of c.lines) {
    if (opts.custom && opts.custom[line.kind] !== undefined) line.answer = opts.custom[line.kind];
    else if (opts.present?.includes(line.kind)) line.answer = "present";
    else if (opts.cut?.includes(line.kind)) line.answer = "cut";
    else line.answer = "clear";
  }
  fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
}

/** A taken clip in a fresh out folder: returns paths + the sha the tool recorded. */
function setupTakenClip(tag: string, fixtureName = "good.mp4"): { inDir: string; clipPath: string; outDir: string; sha: string } {
  const { inDir, clipPath } = copyIn(tag, fixtureName, "clip.mp4");
  const outDir = tdir(`${tag}out`);
  const r = run(["intake", "--out", outDir, clipPath]);
  expect(r.code).toBe(0);
  const sha = shaOf(clipPath);
  expect(r.lines[0]).toMatchObject({ file: "clip.mp4", result: "taken", sha256: sha });
  return { inDir, clipPath, outDir, sha };
}

const ALL_REFUSAL_REASONS = new Set([
  "bad-name", "symlink", "not-regular-file", "input-inside-repo", "unreadable", "empty-file",
  "probe-failed", "no-video-stream", "container-not-allowed", "codec-not-allowed", "too-small",
  "too-short", "incomplete-read", "duplicate-sha256",
]);

// ── planted bad clips: each test goes red if the tool TAKES the entry ─────────────────────

describe("clip-intake intake — planted refusals", () => {
  test("B1 a text file named .mp4 -> refused probe-failed", () => {
    const { inDir } = { inDir: tdir("b1") };
    fs.writeFileSync(path.join(inDir, "notes.mp4"), "this is not a video, just plain text bytes");
    const outDir = tdir("b1out");
    const r = run(["intake", "--out", outDir, path.join(inDir, "notes.mp4")]);
    expect(r.code).toBe(1);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toEqual({ file: "notes.mp4", result: "refused", reason: "probe-failed", sha256: null, flags: [] });
    expect(r.lines[1].summary).toEqual({ taken: 0, refused: 1, skipped: 0, reason: "no-clips" });
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  test("B2 a 0-byte .mp4 -> refused empty-file", () => {
    const inDir = tdir("b2");
    fs.writeFileSync(path.join(inDir, "empty.mp4"), Buffer.alloc(0));
    const outDir = tdir("b2out");
    const r = run(["intake", "--out", outDir, path.join(inDir, "empty.mp4")]);
    expect(r.code).toBe(1);
    expect(r.lines[0]).toMatchObject({ file: "empty.mp4", result: "refused", reason: "empty-file", sha256: null });
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  test("B3 an audio-only .mp4 -> refused no-video-stream", () => {
    const { clipPath } = copyIn("b3", "audioOnly.mp4", "clip.mp4");
    const outDir = tdir("b3out");
    const r = run(["intake", "--out", outDir, clipPath]);
    expect(r.code).toBe(1);
    expect(r.lines[0]).toMatchObject({ file: "clip.mp4", result: "refused", reason: "no-video-stream" });
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  test("B4 vp9 in .mp4 -> refused codec-not-allowed", () => {
    const { clipPath } = copyIn("b4", "vp9.mp4", "clip.mp4");
    const outDir = tdir("b4out");
    const r = run(["intake", "--out", outDir, clipPath]);
    expect(r.code).toBe(1);
    expect(r.lines[0]).toMatchObject({ file: "clip.mp4", result: "refused", reason: "codec-not-allowed" });
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  test("B4b a small vp9 clip (codec AND size) -> codec-not-allowed (order rule)", () => {
    const { clipPath } = copyIn("b4b", "vp9Small.mp4", "clip.mp4");
    const outDir = tdir("b4bout");
    const r = run(["intake", "--out", outDir, clipPath]);
    expect(r.code).toBe(1);
    expect(r.lines[0].reason).toBe("codec-not-allowed");
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  test("B4c a Matroska file named .mp4 -> container-not-allowed; a.mkv and a.webm -> bad-name", () => {
    const inDir = tdir("b4c");
    fs.copyFileSync(fixture("mkv.mp4"), path.join(inDir, "clip.mp4"));
    fs.copyFileSync(fixture("good.mp4"), path.join(inDir, "a.mkv"));
    fs.copyFileSync(fixture("good.mp4"), path.join(inDir, "a.webm"));
    const outDir = tdir("b4cout");
    const r = run(["intake", "--out", outDir, inDir]);
    expect(r.code).toBe(1);
    const byFile = new Map(r.lines.map((l) => [l.file, l]));
    expect(byFile.get("clip.mp4")).toMatchObject({ result: "refused", reason: "container-not-allowed" });
    expect(byFile.get("a.mkv")).toMatchObject({ result: "refused", reason: "bad-name" });
    expect(byFile.get("a.webm")).toMatchObject({ result: "refused", reason: "bad-name" });
    expect(r.lines[3].summary).toEqual({ taken: 0, refused: 3, skipped: 0, reason: "no-clips" });
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  test("B5 a clip with its moov box cut off -> refused probe-failed", () => {
    const { clipPath } = copyIn("b5", "moovCut.mp4", "clip.mp4");
    const outDir = tdir("b5out");
    const r = run(["intake", "--out", outDir, clipPath]);
    expect(r.code).toBe(1);
    expect(r.lines[0]).toMatchObject({ file: "clip.mp4", result: "refused", reason: "probe-failed" });
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  test("B6 +faststart clip with its tail cut off -> refused incomplete-read", () => {
    const { clipPath } = copyIn("b6", "fastCut.mp4", "clip.mp4");
    const outDir = tdir("b6out");
    const r = run(["intake", "--out", outDir, clipPath]);
    expect(r.code).toBe(1);
    expect(r.lines[0]).toMatchObject({ file: "clip.mp4", result: "refused", reason: "incomplete-read" });
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  test("B7 two byte-equal copies -> refused duplicate-sha256 for BOTH", () => {
    const inDir = tdir("b7");
    fs.copyFileSync(fixture("good.mp4"), path.join(inDir, "a.mp4"));
    fs.copyFileSync(fixture("good.mp4"), path.join(inDir, "b.mp4"));
    const outDir = tdir("b7out");
    const r = run(["intake", "--out", outDir, inDir]);
    expect(r.code).toBe(1);
    const sha = shaOf(fixture("good.mp4"));
    for (const l of [r.lines[0], r.lines[1]]) {
      expect(l).toMatchObject({ result: "refused", reason: "duplicate-sha256", sha256: sha });
    }
    expect(r.lines[2].summary).toEqual({ taken: 0, refused: 2, skipped: 0, reason: "no-clips" });
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  itPosix("B8 a symlink to a good clip -> refused symlink (skipped on win32: creating a symlink needs extra rights on Windows)", () => {
    const inDir = tdir("b8");
    fs.symlinkSync(fixture("good.mp4"), path.join(inDir, "link.mp4"));
    const outDir = tdir("b8out");
    const r = run(["intake", "--out", outDir, path.join(inDir, "link.mp4")]);
    expect(r.code).toBe(1);
    expect(r.lines[0]).toMatchObject({ file: "link.mp4", result: "refused", reason: "symlink" });
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  test("B9 a leading dash and a wrong extension -> refused bad-name", () => {
    const inDir = tdir("b9");
    fs.copyFileSync(fixture("good.mp4"), path.join(inDir, "-a.mp4"));
    fs.copyFileSync(fixture("good.mp4"), path.join(inDir, "a.mp4.txt"));
    const outDir = tdir("b9out");
    const r = run(["intake", "--out", outDir, path.join(inDir, "-a.mp4"), path.join(inDir, "a.mp4.txt")]);
    expect(r.code).toBe(1);
    expect(r.lines[0]).toMatchObject({ file: "-a.mp4", result: "refused", reason: "bad-name" });
    expect(r.lines[1]).toMatchObject({ file: "a.mp4.txt", result: "refused", reason: "bad-name" });
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  itPosix("B9n a name with a newline -> refused bad-name (skipped on win32: Windows file names cannot hold a newline)", () => {
    const inDir = tdir("b9n");
    const p = path.join(inDir, "bad\nname.mp4");
    fs.copyFileSync(fixture("good.mp4"), p);
    const outDir = tdir("b9nout");
    const r = run(["intake", "--out", outDir, p]);
    expect(r.code).toBe(1);
    expect(r.lines[0]).toMatchObject({ file: "bad\nname.mp4", result: "refused", reason: "bad-name" });
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  itPosix("B9t a name with a tab -> refused bad-name (skipped on win32: Windows file names cannot hold a tab)", () => {
    const inDir = tdir("b9t");
    const p = path.join(inDir, "bad\tname.mp4");
    fs.copyFileSync(fixture("good.mp4"), p);
    const outDir = tdir("b9tout");
    const r = run(["intake", "--out", outDir, p]);
    expect(r.code).toBe(1);
    expect(r.lines[0]).toMatchObject({ file: "bad\tname.mp4", result: "refused", reason: "bad-name" });
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  itPosix('B9q a name with a double quote -> taken with the name kept byte for byte (skipped on win32: Windows file names cannot hold a double quote)', () => {
    const inDir = tdir("b9q");
    const p = path.join(inDir, 'say "hi".mp4');
    fs.copyFileSync(fixture("good.mp4"), p);
    const outDir = tdir("b9qout");
    const r = run(["intake", "--out", outDir, p]);
    expect(r.code).toBe(0);
    const sha = shaOf(p);
    expect(r.lines[0]).toMatchObject({ file: 'say "hi".mp4', result: "taken", sha256: sha });
    expect(readJson(path.join(outDir, `${sha}.intake.json`)).file_name).toBe('say "hi".mp4');
  });

  test("B9g hard names are taken, the sha is right and the name is kept byte for byte", () => {
    const names = ["a b.mp4", "Rec [x] 1.mp4", "it's fine.mp4", "cost $HOME.mp4", "back`tick`.mp4", "héllo中文.mp4", "UPPER.MOV"];
    for (const name of names) {
      const inDir = tdir("b9g");
      const p = path.join(inDir, name);
      fs.copyFileSync(fixture("good.mp4"), p);
      const outDir = tdir("b9gout");
      const r = run(["intake", "--out", outDir, p]);
      expect(r.code).toBe(0);
      const sha = shaOf(p);
      expect(r.lines[0]).toEqual({ file: name, result: "taken", reason: null, sha256: sha, flags: ["no-audio"] });
      const intake = readJson(path.join(outDir, `${sha}.intake.json`));
      expect(intake.file_name).toBe(name);
      expect(intake.sha256).toBe(sha);
      expect(fs.readdirSync(outDir).sort()).toEqual([`${sha}.checklist.json`, `${sha}.intake.json`]);
    }
  });

  (isWin || isRoot ? it.skip : it)(
    "B10 no read permission -> refused unreadable (skipped on win32: chmod does not remove read rights on Windows; also skipped as root: chmod does not remove read rights for root)",
    () => {
      const inDir = tdir("b10");
      const p = path.join(inDir, "clip.mp4");
      fs.copyFileSync(fixture("good.mp4"), p);
      fs.chmodSync(p, 0o000);
      try {
        const outDir = tdir("b10out");
        const r = run(["intake", "--out", outDir, p]);
        expect(r.code).toBe(1);
        expect(r.lines[0]).toMatchObject({ file: "clip.mp4", result: "refused", reason: "unreadable" });
        expect(fs.readdirSync(outDir)).toEqual([]);
      } finally {
        fs.chmodSync(p, 0o644);
      }
    },
  );

  (isWin || isRoot ? it.skip : it)(
    "B10b an input folder with no read permission -> one refused unreadable line for the folder, counted, exit 1 (skipped on win32: chmod does not remove read rights on Windows; also skipped as root: chmod does not remove read rights for root)",
    () => {
      const { clipPath } = copyIn("b10b", "good.mp4", "clip.mp4");
      const holder = tdir("b10block");
      const locked = path.join(holder, "locked");
      fs.mkdirSync(locked);
      fs.copyFileSync(fixture("goodAudio.mp4"), path.join(locked, "inner.mp4"));
      fs.chmodSync(locked, 0o000);
      const outDir = tdir("b10bout");
      try {
        const r = run(["intake", "--out", outDir, clipPath, locked]);
        expect(r.code).toBe(1);
        expect(r.lines[0]).toMatchObject({ file: "clip.mp4", result: "taken" });
        expect(r.lines[1]).toEqual({ file: "locked", result: "refused", reason: "unreadable", sha256: null, flags: [] });
        expect(r.lines[2].summary).toEqual({ taken: 1, refused: 1, skipped: 0, reason: null });
        expect(fs.readdirSync(outDir)).toHaveLength(2); // only the good clip's two files
      } finally {
        fs.chmodSync(locked, 0o755); // so afterAll can remove the holder
      }
    },
  );

  test("B11 a 320x568 clip -> refused too-small", () => {
    const { clipPath } = copyIn("b11", "small.mp4", "clip.mp4");
    const outDir = tdir("b11out");
    const r = run(["intake", "--out", outDir, clipPath]);
    expect(r.code).toBe(1);
    expect(r.lines[0]).toMatchObject({ file: "clip.mp4", result: "refused", reason: "too-small" });
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  test("B12 a one-frame clip -> refused too-short", () => {
    const { clipPath } = copyIn("b12", "oneFrame.mp4", "clip.mp4");
    const outDir = tdir("b12out");
    const r = run(["intake", "--out", outDir, clipPath]);
    expect(r.code).toBe(1);
    expect(r.lines[0]).toMatchObject({ file: "clip.mp4", result: "refused", reason: "too-short" });
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  test("B12b one frame lasting 1 s (packets_read 1, duration 1.0) -> refused too-short by the packet rule alone", () => {
    const { clipPath } = copyIn("b12b", "oneFrame1fps.mp4", "clip.mp4");
    const outDir = tdir("b12bout");
    const r = run(["intake", "--out", outDir, clipPath]);
    expect(r.code).toBe(1);
    expect(r.lines[0]).toMatchObject({ file: "clip.mp4", result: "refused", reason: "too-short" });
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  test("B12c eight packets in 0.27 s (packets_read 8, duration under 1 s) -> refused too-short by the duration rule alone", () => {
    const { clipPath } = copyIn("b12c", "short8.mp4", "clip.mp4");
    const outDir = tdir("b12cout");
    const r = run(["intake", "--out", outDir, clipPath]);
    expect(r.code).toBe(1);
    expect(r.lines[0]).toMatchObject({ file: "clip.mp4", result: "refused", reason: "too-short" });
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  test("B6f a fragmented mp4, whose header carries no frame count -> refused incomplete-read", () => {
    const { clipPath } = copyIn("b6f", "frag.mp4", "clip.mp4");
    const outDir = tdir("b6fout");
    const r = run(["intake", "--out", outDir, clipPath]);
    expect(r.code).toBe(1);
    expect(r.lines[0]).toMatchObject({ file: "clip.mp4", result: "refused", reason: "incomplete-read" });
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  test("B13 a subfolder inside a folder argument -> refused not-regular-file, the good clip still taken", () => {
    const inDir = tdir("b13");
    fs.mkdirSync(path.join(inDir, "sub.mp4")); // a good NAME, so the not-regular-file rule (not bad-name) catches it
    fs.copyFileSync(fixture("good.mp4"), path.join(inDir, "clip.mp4"));
    const outDir = tdir("b13out");
    const r = run(["intake", "--out", outDir, inDir]);
    expect(r.code).toBe(1);
    const byFile = new Map(r.lines.map((l) => [l.file, l]));
    expect(byFile.get("sub.mp4")).toMatchObject({ result: "refused", reason: "not-regular-file", sha256: null });
    expect(byFile.get("clip.mp4")).toMatchObject({ result: "taken" });
    expect(r.lines[2].summary).toEqual({ taken: 1, refused: 1, skipped: 0, reason: null });
    expect(fs.readdirSync(outDir)).toHaveLength(2);
  });

  test("B14 a dot-file -> skipped-hidden, and it does not change the exit code", () => {
    const inDir = tdir("b14");
    fs.copyFileSync(fixture("good.mp4"), path.join(inDir, ".hidden.mp4"));
    fs.copyFileSync(fixture("good.mp4"), path.join(inDir, "clip.mp4"));
    const outDir = tdir("b14out");
    const r = run(["intake", "--out", outDir, inDir]);
    expect(r.code).toBe(0);
    const byFile = new Map(r.lines.map((l) => [l.file, l]));
    expect(byFile.get(".hidden.mp4")).toEqual({ file: ".hidden.mp4", result: "skipped-hidden", reason: null, sha256: null, flags: [] });
    expect(byFile.get("clip.mp4")).toMatchObject({ result: "taken" });
    expect(r.lines[2].summary).toEqual({ taken: 1, refused: 0, skipped: 1, reason: null });
  });

  test("B15 the same base name in two folder arguments -> both taken, in argument order", () => {
    const dir1 = tdir("b15a");
    const dir2 = tdir("b15b");
    fs.copyFileSync(fixture("good.mp4"), path.join(dir1, "a.mp4"));
    fs.copyFileSync(fixture("goodAudio.mp4"), path.join(dir2, "a.mp4"));
    const outDir = tdir("b15out");
    const r = run(["intake", "--out", outDir, dir1, dir2]);
    expect(r.code).toBe(0);
    const pair = r.lines.filter((l) => l.file === "a.mp4");
    expect(pair).toHaveLength(2);
    expect(pair[0].sha256).toBe(shaOf(path.join(dir1, "a.mp4")));
    expect(pair[1].sha256).toBe(shaOf(path.join(dir2, "a.mp4")));
    expect(fs.readdirSync(outDir)).toHaveLength(4);
  });

  test("B16 a clip inside a folder holding a package.json named content-pipeline -> refused input-inside-repo", () => {
    const inDir = tdir("b16");
    fs.writeFileSync(path.join(inDir, "package.json"), JSON.stringify({ name: "content-pipeline", version: "0.0.0" }));
    fs.copyFileSync(fixture("good.mp4"), path.join(inDir, "clip.mp4"));
    const outDir = tdir("b16out");
    const r = run(["intake", "--out", outDir, inDir]);
    expect(r.code).toBe(1);
    const byFile = new Map(r.lines.map((l) => [l.file, l]));
    expect(byFile.get("clip.mp4")).toMatchObject({ result: "refused", reason: "input-inside-repo" });
    expect(byFile.get("package.json")).toMatchObject({ result: "refused", reason: "bad-name" });
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  test("B17 a clip with container tags (creation_time, location, custom) -> taken and NO tag value leaks", () => {
    const { clipPath } = copyIn("b17", "tagged.mp4", "clip.mp4");
    const outDir = tdir("b17out");
    const r = run(["intake", "--out", outDir, clipPath]);
    expect(r.code).toBe(0);
    expect(r.lines[0].result).toBe("taken");
    const dumped = r.text + fs.readdirSync(outDir).map((n) => fs.readFileSync(path.join(outDir, n), "utf8")).join("");
    expect(dumped).not.toContain("1999");
    expect(dumped).not.toContain("ZZTAG9");
    expect(dumped).not.toContain("zz-loc");
  });
});

// ── run-level refusals (exit 2, nothing written) ─────────────────────────────────────────

describe("clip-intake intake — run level", () => {
  test("--out under a package.json named content-pipeline -> exit 2 out-inside-repo, folder stays empty", () => {
    const pkgDir = tdir("r1");
    fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({ name: "content-pipeline", version: "0.0.0" }));
    const outDir = path.join(pkgDir, "out");
    fs.mkdirSync(outDir);
    const r = run(["intake", "--out", outDir, fixture("good.mp4")]);
    expect(r.code).toBe(2);
    expect(r.errText).toContain("clip-intake: out-inside-repo");
    expect(r.text).toBe("");
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  test("--out under a .git folder -> exit 2 out-inside-repo", () => {
    const gitDir = tdir("r2");
    fs.mkdirSync(path.join(gitDir, ".git"));
    const outDir = path.join(gitDir, "o");
    fs.mkdirSync(outDir);
    const r = run(["intake", "--out", outDir, fixture("good.mp4")]);
    expect(r.code).toBe(2);
    expect(r.errText).toContain("clip-intake: out-inside-repo");
    expect(r.text).toBe("");
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  itPosix("--out a symlink pointing into a folder under a content-pipeline package.json -> exit 2, target stays empty (skipped on win32: creating a symlink needs extra rights on Windows)", () => {
    const pkgDir = tdir("r3");
    fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({ name: "content-pipeline", version: "0.0.0" }));
    const target = path.join(pkgDir, "out");
    fs.mkdirSync(target);
    const linkDir = tdir("r3link");
    const link = path.join(linkDir, "out");
    fs.symlinkSync(target, link);
    const r = run(["intake", "--out", link, fixture("good.mp4")]);
    expect(r.code).toBe(2);
    expect(r.errText).toContain("clip-intake: out-inside-repo");
    expect(r.text).toBe("");
    expect(fs.readdirSync(target)).toEqual([]);
  });

  test("a missing --out folder -> exit 2", () => {
    const r = run(["intake", "--out", path.join(tdir("r4"), "no-such-folder"), fixture("good.mp4")]);
    expect(r.code).toBe(2);
    expect(r.text).toBe("");
  });

  test("a probe path that does not exist -> exit 2 ffprobe-missing, nothing written", () => {
    const outDir = tdir("r5out");
    const r = run(["intake", "--out", outDir, fixture("good.mp4")], { probeBin: path.join(fixtureDir, "no-such-ffprobe") });
    expect(r.code).toBe(2);
    expect(r.errText).toContain("clip-intake: ffprobe-missing");
    expect(r.text).toBe("");
    expect(fs.readdirSync(outDir)).toEqual([]);
  });

  test("an empty input folder -> exit 1, summary reason no-clips", () => {
    const outDir = tdir("r6out");
    const r = run(["intake", "--out", outDir, tdir("r6")]);
    expect(r.code).toBe(1);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].summary).toEqual({ taken: 0, refused: 0, skipped: 0, reason: "no-clips" });
  });

  test("a folder of only hidden files -> exit 1, summary reason no-clips", () => {
    const inDir = tdir("r7");
    fs.copyFileSync(fixture("good.mp4"), path.join(inDir, ".only-hidden.mp4"));
    const outDir = tdir("r7out");
    const r = run(["intake", "--out", outDir, inDir]);
    expect(r.code).toBe(1);
    expect(r.lines[0].result).toBe("skipped-hidden");
    expect(r.lines[1].summary).toEqual({ taken: 0, refused: 0, skipped: 1, reason: "no-clips" });
    expect(fs.readdirSync(outDir)).toEqual([]);
  });
});

// ── runCli surface ───────────────────────────────────────────────────────────────────────

describe("clip-intake runCli", () => {
  test("no verb, an unknown verb and --out with no value -> exit 2", () => {
    expect(run([]).code).toBe(2);
    expect(run(["nonsense"]).code).toBe(2);
    expect(run(["intake", "--out"]).code).toBe(2);
    expect(run(["check", "--out"]).code).toBe(2);
    expect(run(["intake", fixture("good.mp4")]).code).toBe(2); // no --out at all
  });

  test("one intake then one check through runCli, with exit codes and parsed stdout lines", () => {
    const { clipPath } = copyIn("c2", "good.mp4", "clip.mp4");
    const outDir = tdir("c2out");
    const r1 = run(["intake", "--out", outDir, clipPath]);
    expect(r1.code).toBe(0);
    expect(r1.lines[0]).toMatchObject({ file: "clip.mp4", result: "taken" });
    expect(r1.lines[1].summary).toEqual({ taken: 1, refused: 0, skipped: 0, reason: null });
    const r2 = run(["check", "--out", outDir]);
    expect(r2.code).toBe(1);
    expect(r2.lines[0].sha256).toBe(shaOf(clipPath));
    expect(r2.lines[0].ready).toBe(false);
    expect(r2.lines[0].reasons).toEqual(["open-lines"]);
    expect(r2.lines[0].cut_tasks).toEqual([]);
    expect(r2.lines[1].summary).toEqual({ ready: 0, not_ready: 1, reason: null });
  });

  test("check with an extra argument after --out <folder> -> exit 2", () => {
    const outDir = tdir("c3out");
    const r = run(["check", "--out", outDir, "stray.mp4"]);
    expect(r.code).toBe(2);
    expect(r.text).toBe("");
  });
});

// ── shape of output ──────────────────────────────────────────────────────────────────────

describe("clip-intake — shape of output", () => {
  test("the .intake.json and .checklist.json key sets equal the listed keys (nested included)", () => {
    const { clipPath } = copyIn("s1", "tall.mp4", "clip.mp4");
    const outDir = tdir("s1out");
    const r = run(["intake", "--out", outDir, clipPath]);
    expect(r.code).toBe(0);
    const sha = shaOf(clipPath);
    const intake = readJson(path.join(outDir, `${sha}.intake.json`));
    expect(Object.keys(intake)).toEqual([
      "schema", "file_name", "source_path", "size_bytes", "sha256", "container", "video",
      "duration_sec", "bit_rate", "has_audio", "flags", "fit", "probe_tool",
    ]);
    expect(Object.keys(intake.video)).toEqual([
      "codec", "profile", "pix_fmt", "coded_width", "coded_height", "rotation", "width", "height",
      "frame_rate_kind", "r_frame_rate", "avg_frame_rate", "avg_fps", "frames_header", "packets_read",
    ]);
    expect(Object.keys(intake.fit)).toEqual(["pad", "crop"]);
    expect(Object.keys(intake.fit.pad)).toEqual(["scaled_width", "scaled_height", "bar_top", "bar_bottom", "bar_left", "bar_right"]);
    expect(Object.keys(intake.fit.crop)).toEqual(["scaled_width", "scaled_height", "cut_top", "cut_bottom", "cut_left", "cut_right"]);
    expect(intake.schema).toBe("clip-intake/1");
    expect(intake.source_path).toBe(fs.realpathSync(clipPath));
    expect(intake.probe_tool).toMatch(/^ffprobe \S+$/);
    expect(intake.probe_tool).not.toContain("/");

    const checklist = readJson(path.join(outDir, `${sha}.checklist.json`));
    expect(Object.keys(checklist)).toEqual(["schema", "sha256", "file_name", "looked_by", "lines"]);
    expect(checklist.schema).toBe("clip-checklist/1");
    expect(checklist.sha256).toBe(sha);
    expect(checklist.looked_by).toBe("");
    expect(checklist.lines.map((l: Record<string, unknown>) => l.kind)).toEqual([...CHECKLIST_KINDS]);
    for (const line of checklist.lines) {
      expect(Object.keys(line)).toEqual(["kind", "answer", "note"]);
      expect(line.answer).toBe("not checked");
      expect(line.note).toBe("");
    }
  });

  test("each stdout line parses, holds exactly the listed keys, no folder path, and the out folder holds only the two JSON files", () => {
    const { inDir, clipPath } = copyIn("s2", "good.mp4", "clip.mp4");
    const outDir = tdir("s2out");
    const before = fs.readdirSync(inDir);
    const r = run(["intake", "--out", outDir, clipPath]);
    expect(r.code).toBe(0);
    expect(fs.readdirSync(inDir)).toEqual(before); // the input folder lists the same
    for (const line of r.lines.slice(0, -1)) {
      expect(Object.keys(line)).toEqual(["file", "result", "reason", "sha256", "flags"]);
      expect(line.result === "taken" ? line.reason === null : ALL_REFUSAL_REASONS.has(line.reason) || line.result === "skipped-hidden" && line.reason === null).toBe(true);
      expect(line.file).not.toContain("/");
      expect(line.file).not.toContain("\\");
    }
    expect(Object.keys(r.lines[r.lines.length - 1])).toEqual(["summary"]);
    expect(r.text).not.toContain(outDir);
    expect(r.text).not.toContain(inDir);
    const outNames = fs.readdirSync(outDir);
    expect(outNames).toHaveLength(2);
    for (const n of outNames) {
      expect(n.endsWith(".intake.json") || n.endsWith(".checklist.json")).toBe(true);
    }
  });

  test("stdout lines are sorted by base name in byte order, not argument order and not locale order", () => {
    const inDir = tdir("s5");
    fs.copyFileSync(fixture("goodAudio.mp4"), path.join(inDir, "a.mp4"));
    fs.copyFileSync(fixture("good.mp4"), path.join(inDir, "B.mp4"));
    const outDir = tdir("s5out");
    // given in the other order: collection order a, B; a locale sort also puts a.mp4 first
    const r = run(["intake", "--out", outDir, path.join(inDir, "a.mp4"), path.join(inDir, "B.mp4")]);
    expect(r.code).toBe(0);
    expect(r.lines.map((l) => l.file)).toEqual(["B.mp4", "a.mp4"]); // 0x42 'B' < 0x61 'a'
  });

  test("a second intake run leaves both files byte-equal, and an answered check list keeps its answers", () => {
    const { clipPath } = copyIn("s3", "good.mp4", "clip.mp4");
    const outDir = tdir("s3out");
    expect(run(["intake", "--out", outDir, clipPath]).code).toBe(0);
    const sha = shaOf(clipPath);
    const intakePath = path.join(outDir, `${sha}.intake.json`);
    const checklistPath = path.join(outDir, `${sha}.checklist.json`);
    const intakeBytes1 = fs.readFileSync(intakePath);
    const checklistBytes1 = fs.readFileSync(checklistPath);
    expect(run(["intake", "--out", outDir, clipPath]).code).toBe(0);
    expect(fs.readFileSync(intakePath).equals(intakeBytes1)).toBe(true);
    expect(fs.readFileSync(checklistPath).equals(checklistBytes1)).toBe(true);
    answerChecklist(outDir, sha, { cut: ["phone-number"] });
    const answered = fs.readFileSync(checklistPath);
    expect(run(["intake", "--out", outDir, clipPath]).code).toBe(0);
    expect(fs.readFileSync(checklistPath).equals(answered)).toBe(true);
    expect(fs.readFileSync(intakePath).equals(intakeBytes1)).toBe(true);
  });

  test("a sha already recorded under another source_path -> refused duplicate-sha256", () => {
    const first = copyIn("s4a", "good.mp4", "one.mp4");
    const outDir = tdir("s4out");
    expect(run(["intake", "--out", outDir, first.clipPath]).code).toBe(0);
    const second = copyIn("s4b", "good.mp4", "two.mp4"); // same bytes, another path
    const r = run(["intake", "--out", outDir, second.clipPath]);
    expect(r.code).toBe(1);
    expect(r.lines[0]).toMatchObject({ file: "two.mp4", result: "refused", reason: "duplicate-sha256" });
    expect(fs.readdirSync(outDir)).toHaveLength(2); // only the first clip's two files
  });
});

// ── good clips ───────────────────────────────────────────────────────────────────────────

describe("clip-intake — good clips", () => {
  test("1080x1708 constant rate, no audio -> taken, flags shape-not-9x16 + no-audio, the fit numbers of the criterion", () => {
    const { clipPath } = copyIn("g1", "tall.mp4", "clip.mp4");
    const outDir = tdir("g1out");
    const r = run(["intake", "--out", outDir, clipPath]);
    expect(r.code).toBe(0);
    expect(r.lines[0].flags).toEqual(["shape-not-9x16", "no-audio"]);
    const sha = shaOf(clipPath);
    const intake = readJson(path.join(outDir, `${sha}.intake.json`));
    expect(intake.video).toMatchObject({ codec: "h264", width: 1080, height: 1708, frame_rate_kind: "cfr", frames_header: FRAMES, packets_read: FRAMES });
    expect(intake.video.r_frame_rate).toBe(`${FPS}/1`);
    expect(intake.video.avg_fps).toBe(FPS);
    expect(intake.has_audio).toBe(false);
    expect(String(intake.container)).toContain("mp4");
    expect(intake.fit).toEqual({
      pad: { scaled_width: 1080, scaled_height: 1708, bar_top: 106, bar_bottom: 106, bar_left: 0, bar_right: 0 },
      crop: { scaled_width: 1214, scaled_height: 1920, cut_top: 0, cut_bottom: 0, cut_left: 67, cut_right: 67 },
    });
  });

  test("1080x1920 with audio -> taken, no flags, no fit key", () => {
    const { clipPath } = copyIn("g2", "goodAudio.mp4", "clip.mp4");
    const outDir = tdir("g2out");
    const r = run(["intake", "--out", outDir, clipPath]);
    expect(r.code).toBe(0);
    expect(r.lines[0].flags).toEqual([]);
    const sha = shaOf(clipPath);
    const intake = readJson(path.join(outDir, `${sha}.intake.json`));
    expect(intake.has_audio).toBe(true);
    expect(Object.keys(intake)).not.toContain("fit");
  });

  test("a 1080x1920 clip with rotation 90 -> width 1920, height 1080, shape-not-9x16", () => {
    const { clipPath } = copyIn("g3", "rotated.mp4", "clip.mp4");
    const outDir = tdir("g3out");
    const r = run(["intake", "--out", outDir, clipPath]);
    expect(r.code).toBe(0);
    expect(r.lines[0].flags).toContain("shape-not-9x16");
    const sha = shaOf(clipPath);
    const intake = readJson(path.join(outDir, `${sha}.intake.json`));
    expect(intake.video.width).toBe(1920);
    expect(intake.video.height).toBe(1080);
    expect(Math.abs(intake.video.rotation)).toBe(90);
  });

  test("a variable-rate clip -> flag variable-frame-rate", () => {
    const { clipPath } = copyIn("g4", "vfr.mp4", "clip.mp4");
    const outDir = tdir("g4out");
    const r = run(["intake", "--out", outDir, clipPath]);
    expect(r.code).toBe(0);
    expect(r.lines[0].flags).toContain("variable-frame-rate");
    const sha = shaOf(clipPath);
    expect(readJson(path.join(outDir, `${sha}.intake.json`)).video.frame_rate_kind).toBe("vfr");
  });

  test('"Rec_[UAT] x.mp4" -> flag test-build-name; "latest.mp4" -> no test-build-name', () => {
    const a = copyIn("g5a", "good.mp4", "Rec_[UAT] x.mp4");
    const outA = tdir("g5aout");
    expect(run(["intake", "--out", outA, a.clipPath]).lines[0].flags).toContain("test-build-name");
    const b = copyIn("g5b", "good.mp4", "latest.mp4");
    const outB = tdir("g5bout");
    expect(run(["intake", "--out", outB, b.clipPath]).lines[0].flags).not.toContain("test-build-name");
  });

  test("an hevc clip -> taken", () => {
    const { clipPath } = copyIn("g6", "hevc.mp4", "clip.mp4");
    const outDir = tdir("g6out");
    const r = run(["intake", "--out", outDir, clipPath]);
    expect(r.code).toBe(0);
    const sha = shaOf(clipPath);
    expect(readJson(path.join(outDir, `${sha}.intake.json`)).video.codec).toBe("hevc");
  });

  test("720x1086 (raw pad height 1629, odd) -> the even floor gives 1628 with bars 146/146, crop 1272 with cuts 96/96", () => {
    const { clipPath } = copyIn("g7", "tallOdd.mp4", "clip.mp4");
    const outDir = tdir("g7out");
    const r = run(["intake", "--out", outDir, clipPath]);
    expect(r.code).toBe(0);
    const sha = shaOf(clipPath);
    const intake = readJson(path.join(outDir, `${sha}.intake.json`));
    expect(intake.fit).toEqual({
      pad: { scaled_width: 1080, scaled_height: 1628, bar_top: 146, bar_bottom: 146, bar_left: 0, bar_right: 0 },
      crop: { scaled_width: 1272, scaled_height: 1920, cut_top: 0, cut_bottom: 0, cut_left: 96, cut_right: 96 },
    });
  });
});

// ── the check verb ───────────────────────────────────────────────────────────────────────

describe("clip-intake check — ready rules", () => {
  test("a new check list -> not ready, open-lines", () => {
    const { outDir, sha } = setupTakenClip("k1");
    const r = run(["check", "--out", outDir]);
    expect(r.code).toBe(1);
    expect(r.lines[0]).toEqual({ sha256: sha, ready: false, reasons: ["open-lines"], cut_tasks: [] });
  });

  test("all clear with looked_by -> ready, exit 0, cut_tasks empty", () => {
    const { outDir, sha } = setupTakenClip("k2");
    answerChecklist(outDir, sha);
    const r = run(["check", "--out", outDir]);
    expect(r.code).toBe(0);
    expect(r.lines[0]).toEqual({ sha256: sha, ready: true, reasons: [], cut_tasks: [] });
    expect(r.lines[1].summary).toEqual({ ready: 1, not_ready: 0, reason: null });
  });

  test('two lines "cut", the rest clear -> ready, cut_tasks exactly those two kinds with the sha', () => {
    const { outDir, sha } = setupTakenClip("k3");
    answerChecklist(outDir, sha, { cut: ["phone-number", "credit-balance"] });
    const r = run(["check", "--out", outDir]);
    expect(r.code).toBe(0);
    expect(r.lines[0]).toEqual({
      sha256: sha,
      ready: true,
      reasons: [],
      cut_tasks: [
        { sha256: sha, kind: "phone-number" },
        { sha256: sha, kind: "credit-balance" },
      ],
    });
  });

  test('one line "present" -> not ready, present-lines', () => {
    const { outDir, sha } = setupTakenClip("k4");
    answerChecklist(outDir, sha, { present: ["email"] });
    const r = run(["check", "--out", outDir]);
    expect(r.code).toBe(1);
    expect(r.lines[0].reasons).toEqual(["present-lines"]);
  });

  test('one answer "yes" -> not ready, bad-answer', () => {
    const { outDir, sha } = setupTakenClip("k5");
    answerChecklist(outDir, sha, { custom: { email: "yes" } });
    const r = run(["check", "--out", outDir]);
    expect(r.code).toBe(1);
    expect(r.lines[0].reasons).toEqual(["bad-answer"]);
  });

  test("looked_by of only spaces -> not ready, no-looker", () => {
    const { outDir, sha } = setupTakenClip("k6");
    answerChecklist(outDir, sha, { looked_by: "   " });
    const r = run(["check", "--out", outDir]);
    expect(r.code).toBe(1);
    expect(r.lines[0].reasons).toEqual(["no-looker"]);
  });

  test("one line removed -> not ready, kinds-changed", () => {
    const { outDir, sha } = setupTakenClip("k7");
    answerChecklist(outDir, sha);
    const p = path.join(outDir, `${sha}.checklist.json`);
    const c = readJson(p);
    c.lines.pop();
    fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
    const r = run(["check", "--out", outDir]);
    expect(r.code).toBe(1);
    expect(r.lines[0].reasons).toEqual(["kinds-changed"]);
  });

  test("the clip changed by one byte -> not ready, source-changed", () => {
    const { clipPath, outDir, sha } = setupTakenClip("k8");
    fs.appendFileSync(clipPath, Buffer.from([0]));
    answerChecklist(outDir, sha);
    const r = run(["check", "--out", outDir]);
    expect(r.code).toBe(1);
    expect(r.lines[0].reasons).toEqual(["source-changed"]);
  });

  test("the clip moved away -> not ready, source-missing", () => {
    const { clipPath, outDir, sha } = setupTakenClip("k9");
    fs.rmSync(clipPath);
    answerChecklist(outDir, sha);
    const r = run(["check", "--out", outDir]);
    expect(r.code).toBe(1);
    expect(r.lines[0].reasons).toEqual(["source-missing"]);
  });

  test("the .intake.json removed -> not ready, intake-missing", () => {
    const { outDir, sha } = setupTakenClip("k10");
    answerChecklist(outDir, sha);
    fs.rmSync(path.join(outDir, `${sha}.intake.json`));
    const r = run(["check", "--out", outDir]);
    expect(r.code).toBe(1);
    expect(r.lines[0].reasons).toEqual(["intake-missing"]);
  });

  test("a check list that does not parse -> not ready, checklist-unreadable", () => {
    const { outDir, sha } = setupTakenClip("k11");
    fs.writeFileSync(path.join(outDir, `${sha}.checklist.json`), "{not json at all");
    const r = run(["check", "--out", outDir]);
    expect(r.code).toBe(1);
    expect(r.lines[0]).toEqual({ sha256: sha, ready: false, reasons: ["checklist-unreadable"], cut_tasks: [] });
  });

  test("a sha256 field edited -> not ready, sha-mismatch", () => {
    const { outDir, sha } = setupTakenClip("k12");
    answerChecklist(outDir, sha);
    const p = path.join(outDir, `${sha}.checklist.json`);
    const c = readJson(p);
    c.sha256 = "0".repeat(64);
    fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
    const r = run(["check", "--out", outDir]);
    expect(r.code).toBe(1);
    expect(r.lines[0].reasons).toEqual(["sha-mismatch"]);
  });

  test("an intake file with no check list next to it (a run stopped between the two writes) -> not ready, checklist-missing", () => {
    const { outDir, sha } = setupTakenClip("k14");
    fs.rmSync(path.join(outDir, `${sha}.checklist.json`));
    const r = run(["check", "--out", outDir]);
    expect(r.code).toBe(1);
    expect(r.lines[0]).toEqual({ sha256: sha, ready: false, reasons: ["checklist-missing"], cut_tasks: [] });
    expect(r.lines[1].summary).toEqual({ ready: 0, not_ready: 1, reason: null });
  });

  test("an empty folder -> exit 1, no-checklists", () => {
    const outDir = tdir("k13out");
    const r = run(["check", "--out", outDir]);
    expect(r.code).toBe(1);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].summary).toEqual({ ready: 0, not_ready: 0, reason: "no-checklists" });
  });
});
