/**
 * #867 Leg 1 — contact-sheet generator: sha keying, manifest shape, hash-bound output dir, and the
 * fail-LOUD behaviour when ffmpeg fails / is absent (never a silent skip).
 *
 * Uses a STUB ffmpeg (a tiny shell script that writes a non-empty PNG to the last arg) so the
 * generator's orchestration is unit-tested without a real render. The REAL system-ffmpeg `tile`
 * extraction is proven separately, prove-primary, in `smoke/eyeball-gate.ts`.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  generateContactSheet,
  beatsFromScenes,
  eyeballDir,
  findManifestForSha,
  sha256File,
  resolveSystemFfmpeg,
  hasSystemFfmpeg,
  type ContactSheetBeat,
} from "../contactSheet";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Write a stub ffmpeg that writes PNG bytes to whatever its LAST arg is (the output path). */
function writeStubFfmpeg(dir: string): string {
  const bin = path.join(dir, "stub-ffmpeg.sh");
  fs.writeFileSync(
    bin,
    [
      "#!/bin/sh",
      "# stub ffmpeg: last arg is the output path; write a non-empty PNG there.",
      'out=""',
      'for a in "$@"; do out="$a"; done',
      'printf "\\211PNG\\r\\n\\032\\n stub" > "$out"',
      "exit 0",
    ].join("\n") + "\n",
  );
  fs.chmodSync(bin, 0o755);
  return bin;
}

const BEATS: ContactSheetBeat[] = [
  { label: "hook", fromSec: 0, durationSec: 10 },
  { label: "compare", fromSec: 10, durationSec: 10 },
  { label: "verdict", fromSec: 20, durationSec: 10 },
  { label: "cta", fromSec: 30, durationSec: 10 },
];

describe("#867 generateContactSheet (stub ffmpeg)", () => {
  let root: string;
  let videoPath: string;
  let stub: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "eyeball-sheet-"));
    videoPath = path.join(root, "video.mp4");
    fs.writeFileSync(videoPath, Buffer.from("fake-mp4-bytes-for-hashing"));
    stub = writeStubFfmpeg(root);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test("hashes the artifact bytes and keys the output dir by sha", () => {
    const res = generateContactSheet(videoPath, BEATS, { slug: "demo", reviewRoot: path.join(root, "review"), ffmpegBin: stub });
    expect(res.artifactSha).toBe(sha256File(videoPath));
    expect(res.frameDir).toBe(eyeballDir(res.artifactSha, { slug: "demo", reviewRoot: path.join(root, "review") }));
    expect(res.frameDir).toContain(res.artifactSha);
  });

  test("manifest is hash-bound + well-shaped (one frame per beat)", () => {
    const res = generateContactSheet(videoPath, BEATS, { slug: "demo", reviewRoot: path.join(root, "review"), ffmpegBin: stub });
    const manifest = JSON.parse(fs.readFileSync(res.manifestPath, "utf8"));
    expect(manifest.artifactSha).toBe(res.artifactSha);
    expect(manifest.frameCount).toBe(BEATS.length);
    expect(manifest.frames).toHaveLength(BEATS.length);
    expect(manifest.frames.map((f: any) => f.label)).toEqual(["hook", "compare", "verdict", "cta"]);
    // midpoint timestamps: 5, 15, 25, 35
    expect(manifest.frames.map((f: any) => f.timestampSec)).toEqual([5, 15, 25, 35]);
    expect(fs.existsSync(res.sheetPath)).toBe(true);
    expect(fs.statSync(res.sheetPath).size).toBeGreaterThan(0);
  });

  test("writes the index.json sidecar (labels NOT burned into the PNG)", () => {
    const res = generateContactSheet(videoPath, BEATS, { slug: "demo", reviewRoot: path.join(root, "review"), ffmpegBin: stub });
    const idx = JSON.parse(fs.readFileSync(res.indexPath, "utf8"));
    expect(idx.artifactSha).toBe(res.artifactSha);
    expect(idx.tiles).toHaveLength(BEATS.length);
    expect(idx.tiles[0]).toMatchObject({ tileIndex: 0, label: "hook", timestampSec: 5 });
  });

  test("findManifestForSha locates the manifest by sha", () => {
    const reviewRoot = path.join(root, "review");
    const res = generateContactSheet(videoPath, BEATS, { slug: "demo", reviewRoot, ffmpegBin: stub });
    expect(findManifestForSha(res.artifactSha, { reviewRoot })).toBe(res.manifestPath);
    expect(findManifestForSha("f".repeat(64), { reviewRoot })).toBeNull();
  });

  test("a re-render (different bytes) lands in a FRESH hash dir", () => {
    const reviewRoot = path.join(root, "review");
    const a = generateContactSheet(videoPath, BEATS, { slug: "demo", reviewRoot, ffmpegBin: stub });
    fs.writeFileSync(videoPath, Buffer.from("DIFFERENT-bytes-after-rerender"));
    const b = generateContactSheet(videoPath, BEATS, { slug: "demo", reviewRoot, ffmpegBin: stub });
    expect(b.artifactSha).not.toBe(a.artifactSha);
    expect(b.frameDir).not.toBe(a.frameDir);
  });

  test("beatsFromScenes maps scene id → label + carries timings", () => {
    const beats = beatsFromScenes([
      { id: "hook", fromSec: 0, durationSec: 5 },
      { id: "cta", fromSec: 5, durationSec: 5 },
    ]);
    expect(beats).toEqual([
      { label: "hook", fromSec: 0, durationSec: 5 },
      { label: "cta", fromSec: 5, durationSec: 5 },
    ]);
  });
});

describe("#867 contactSheet fail-LOUD (no silent skip)", () => {
  let root: string;
  let videoPath: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "eyeball-loud-"));
    videoPath = path.join(root, "video.mp4");
    fs.writeFileSync(videoPath, Buffer.from("fake-mp4"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test("missing video → THROWS", () => {
    expect(() => generateContactSheet(path.join(root, "ghost.mp4"), BEATS, { ffmpegBin: "/bin/true" })).toThrow(
      /video does not exist/,
    );
  });

  test("empty beats → THROWS", () => {
    expect(() => generateContactSheet(videoPath, [], { ffmpegBin: "/bin/true" })).toThrow(/at least one beat/);
  });

  test("ffmpeg binary absent (ENOENT) → THROWS (hard error, not silent)", () => {
    expect(() =>
      generateContactSheet(videoPath, BEATS, {
        reviewRoot: path.join(root, "review"),
        ffmpegBin: path.join(root, "does-not-exist-ffmpeg"),
      }),
    ).toThrow(/failed to run system ffmpeg/);
  });

  test("ffmpeg exits non-zero → THROWS (no/empty PNG is a hard error)", () => {
    // A real executable that exits 1 and writes nothing → runSystemFfmpeg throws on the non-zero status
    // (distinct from the ENOENT case above). We can't rely on /bin/false existing on every host.
    const failBin = path.join(root, "fail.sh");
    fs.writeFileSync(failBin, "#!/bin/sh\nexit 1\n");
    fs.chmodSync(failBin, 0o755);
    expect(() =>
      generateContactSheet(videoPath, BEATS, { reviewRoot: path.join(root, "review"), ffmpegBin: failBin }),
    ).toThrow(/system ffmpeg exited/);
  });

  test("resolveSystemFfmpeg is consistent with hasSystemFfmpeg on this host", () => {
    if (hasSystemFfmpeg()) {
      expect(fs.existsSync(resolveSystemFfmpeg())).toBe(true);
    } else {
      expect(() => resolveSystemFfmpeg()).toThrow(/system ffmpeg not found/);
    }
  });
});
