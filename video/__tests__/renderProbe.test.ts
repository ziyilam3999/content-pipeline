/**
 * #784 — tests for the render PROBE helper.
 *
 * Strategy: generate a tiny REAL MP4 (no paid call, no remotion render) by piping a
 * handful of minimal PNG frames through the SAME vendored ffmpeg the probe uses, then
 * probe it and assert sane values. Separately, unit-test the frame-count assertion with
 * synthetic numbers (proving a too-short render is rejected) so the truncation guard is
 * covered even if generating a clip ever becomes heavy.
 */
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as zlib from "zlib";

import {
  probeRender,
  resolveVendoredFfmpeg,
  parseVideoFrames,
  parseDurationSec,
  parseHasAudioStream,
  assertVideoFrameCount,
  FRAME_COUNT_TOLERANCE,
} from "../renderProbe";

/** Build a minimal valid RGB PNG of size w×h (all-zero scanlines = black). */
function makePng(w: number, h: number): Buffer {
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
  const raw = Buffer.alloc(h * (1 + w * 3)); // each row: 1 filter byte + w*3 RGB, all 0
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

describe("#784 renderProbe — vendored ffmpeg resolution", () => {
  test("resolves a real vendored ffmpeg binary", () => {
    const { bin, dir } = resolveVendoredFfmpeg();
    expect(fs.existsSync(bin)).toBe(true);
    expect(dir).toBe(path.dirname(bin));
    expect(bin).toMatch(/compositor-/);
  });
});

describe("#784 renderProbe — parsers (pure)", () => {
  test("parseVideoFrames reads the LAST frame= token", () => {
    const out = "frame=  10 fps=0\nframe=   60 fps=0.0 q=-1.0 time=00:00:01.93";
    expect(parseVideoFrames(out)).toBe(60);
  });

  test("parseVideoFrames throws when no frame= present", () => {
    expect(() => parseVideoFrames("no frames here")).toThrow(/no "frame="/);
  });

  test("parseDurationSec parses HH:MM:SS.ss", () => {
    expect(parseDurationSec("  Duration: 00:01:43.50, start: 0")).toBeCloseTo(103.5, 2);
    expect(parseDurationSec("  Duration: 00:00:02.00, start: 0")).toBeCloseTo(2.0, 2);
  });

  test("parseHasAudioStream matches a real Audio stream line, not the banner word", () => {
    expect(parseHasAudioStream("  Stream #0:1(eng): Audio: aac (LC), 48000 Hz")).toBe(true);
    expect(parseHasAudioStream("  Stream #0:0: Video: h264")).toBe(false);
    // A stray "Audio" word that is NOT a stream declaration must NOT count.
    expect(parseHasAudioStream("configuration: --enable-encoder=Audiotoolbox")).toBe(false);
  });
});

describe("#784 assertVideoFrameCount — truncation guard", () => {
  const FPS = 30;

  test("accepts an exact frame count", () => {
    expect(() => assertVideoFrameCount(3110, 3110 / FPS, FPS)).not.toThrow();
  });

  test("accepts a count within tolerance", () => {
    expect(() => assertVideoFrameCount(3110 + FRAME_COUNT_TOLERANCE, 3110 / FPS, FPS)).not.toThrow();
  });

  test("REJECTS a truncated render (1800 measured vs 3110 expected)", () => {
    // 3110 expected frames = ~103.67s × 30fps (the real voiced deliverable).
    expect(() => assertVideoFrameCount(1800, 3110 / FPS, FPS)).toThrow(/frame-count mismatch/);
    expect(() => assertVideoFrameCount(1800, 3110 / FPS, FPS)).toThrow(/truncated or the wrong length/);
  });

  test("rejects just past the tolerance edge", () => {
    expect(() => assertVideoFrameCount(3110 + FRAME_COUNT_TOLERANCE + 1, 3110 / FPS, FPS)).toThrow(
      /frame-count mismatch/,
    );
  });

  test("includes the label in the message when provided", () => {
    expect(() => assertVideoFrameCount(10, 100, FPS, { label: "9:16" })).toThrow(/\(9:16\)/);
  });
});

describe("#784 probeRender — real generated clip", () => {
  const FPS = 30;
  const FRAMES = 60; // 2.0s clip
  let tmpDir: string;
  let clipPath: string;
  let generated = false;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "renderprobe-"));
    clipPath = path.join(tmpDir, "clip.mp4");
    const { bin, dir } = resolveVendoredFfmpeg();
    // Pipe FRAMES identical tiny PNGs through image2pipe → x264 MP4 (no audio track).
    const png = makePng(4, 4);
    const stream = Buffer.concat(Array.from({ length: FRAMES }, () => png));
    const env =
      process.platform === "darwin"
        ? { ...process.env, DYLD_FALLBACK_LIBRARY_PATH: dir }
        : process.platform === "linux"
          ? { ...process.env, LD_LIBRARY_PATH: dir }
          : { ...process.env };
    execFileSync(
      bin,
      [
        "-hide_banner",
        "-f",
        "image2pipe",
        "-c:v",
        "png", // tell the pipe demuxer the frames are PNG (stdin can't be sniffed)
        "-framerate",
        String(FPS),
        "-i",
        "-",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-r",
        String(FPS),
        "-y",
        clipPath,
      ],
      { input: stream, env, stdio: ["pipe", "ignore", "ignore"] },
    );
    generated = fs.existsSync(clipPath) && fs.statSync(clipPath).size > 0;
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  });

  test("the fixture clip was generated", () => {
    expect(generated).toBe(true);
  });

  test("probeRender returns the right frame count and duration, no audio", () => {
    const probe = probeRender(clipPath);
    expect(probe.videoFrames).toBe(FRAMES);
    expect(probe.videoDurationSec).toBeCloseTo(FRAMES / FPS, 1);
    expect(probe.hasAudioStream).toBe(false);
    // And the frame-count assertion passes for the true duration.
    expect(() => assertVideoFrameCount(probe.videoFrames, FRAMES / FPS, FPS)).not.toThrow();
  });

  test("probeRender throws (not a silent false-negative) on a missing file", () => {
    expect(() => probeRender(path.join(tmpDir, "nope.mp4"))).toThrow(/does not exist/);
  });
});
