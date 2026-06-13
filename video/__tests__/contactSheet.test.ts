/**
 * #867 Leg 1 — contact-sheet generator: sha keying, manifest shape, hash-bound output dir, and the
 * fail-LOUD behaviour when ffmpeg fails / is absent (never a silent skip).
 *
 * Uses an in-process FAKE ffmpeg: we spy on `child_process.spawnSync` (the single call production
 * makes) and emulate ffmpeg from the args — the success fake writes a non-empty PNG to the last arg
 * (the output path), the fail fake returns a non-zero status, and a missing binary returns an ENOENT
 * error. This is CROSS-PLATFORM by construction (no shell script / no executable bit / no `.cmd`
 * shim): production runs ffmpeg via a NO-SHELL `spawnSync`, and on Windows (Node >=20, post
 * CVE-2024-27980) such a spawn can ONLY launch a real `.exe` — a `.sh` errors UNKNOWN and a
 * `.cmd`/`.bat` errors EINVAL — so a real-subprocess stub is not portable. The generator's
 * orchestration (hashing, hash-keyed dir, per-beat frame loop, tiling, manifest + sidecar, and the
 * fail-LOUD error paths) is exercised exactly as before. The REAL system-ffmpeg `tile`/extract path
 * is proven separately, prove-primary, in `smoke/eyeball-gate.ts`.
 */

import * as childProcess from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// Replace child_process.spawnSync with a fresh jest.fn so we can serve an in-process fake ffmpeg.
// (jest.spyOn can't be used here: Node's child_process.spawnSync is a NON-CONFIGURABLE property, so
// spyOn's defineProperty throws "Cannot redefine property". A module-factory mock sidesteps that —
// the returned object literal's spawnSync is a plain, writable jest.fn. All OTHER child_process
// exports are passed through via requireActual, so resolveSystemFfmpeg's real `sh` probe still works.)
jest.mock("child_process", () => {
  const actual = jest.requireActual<typeof import("child_process")>("child_process");
  return { ...actual, spawnSync: jest.fn() };
});

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

/** Marker the FAIL fake-ffmpeg file carries so the spawnSync spy returns a non-zero exit for it. */
const STUB_FAIL_MARKER = "STUB_FFMPEG_FAIL";

/**
 * Write a SUCCESS fake-ffmpeg marker file and return its path. The file is NEVER executed as a
 * subprocess — the spawnSync spy (installed below) interprets it in-process and, for the success
 * marker, writes a non-empty PNG to spawnSync's last arg (the output path). A plain marker file is
 * cross-platform (no shebang / no chmod / no `.cmd` — none of which a no-shell spawnSync can run on
 * Windows).
 */
function writeStubFfmpeg(dir: string): string {
  const bin = path.join(dir, "stub-ffmpeg");
  fs.writeFileSync(bin, "STUB_FFMPEG_OK\n");
  return bin;
}

/**
 * The in-process fake ffmpeg the spawnSync spy runs. `bin` is the ffmpegBin path production was
 * pointed at; `args` are the exact ffmpeg args (last element is always the output path). Behaviour
 * keys off the marker file at `bin` so it mirrors a real binary's spawnSync result shape:
 *   - bin file ABSENT   → return an ENOENT error object (the "ffmpeg binary absent" case → production
 *     throws "failed to run system ffmpeg").
 *   - file marked FAIL  → return a non-zero status, write nothing (the "exits non-zero" case →
 *     production throws "system ffmpeg exited").
 *   - otherwise success → write a non-empty PNG to the LAST arg (the output path), status 0.
 */
function fakeFfmpeg(bin: string, args: string[]): any {
  if (!fs.existsSync(bin)) {
    const error: any = new Error(`spawnSync ${bin} ENOENT`);
    error.code = "ENOENT";
    error.errno = -2;
    error.syscall = `spawnSync ${bin}`;
    error.path = bin;
    return { pid: 0, output: [null, "", ""], stdout: "", stderr: "", status: null, signal: null, error };
  }
  if (fs.readFileSync(bin, "utf8").includes(STUB_FAIL_MARKER)) {
    const stderr = "fake ffmpeg: forced non-zero exit (wrote no PNG)";
    return { pid: 1, output: [null, "", stderr], stdout: "", stderr, status: 1, signal: null, error: undefined };
  }
  const outPath = args[args.length - 1];
  fs.writeFileSync(outPath, Buffer.concat([PNG_MAGIC, Buffer.from(" fake")]));
  return { pid: 1, output: [null, "", ""], stdout: "", stderr: "", status: 0, signal: null, error: undefined };
}

/**
 * Wire the mocked spawnSync for every test in this file. ffmpeg invocations are served by the
 * in-process fake; the `sh -c "command -v ffmpeg"` PATH probe used by resolveSystemFfmpeg() is
 * delegated to the REAL spawnSync so the host-consistency test (resolveSystemFfmpeg ⇔
 * hasSystemFfmpeg) stays honest.
 */
const realSpawnSync = jest.requireActual<typeof import("child_process")>("child_process").spawnSync;
beforeEach(() => {
  (childProcess.spawnSync as jest.Mock).mockImplementation((cmd: any, args?: any, options?: any) =>
    cmd === "sh"
      ? (realSpawnSync as any)(cmd, args, options)
      : fakeFfmpeg(String(cmd), Array.isArray(args) ? args.map(String) : []),
  );
});
afterEach(() => {
  (childProcess.spawnSync as jest.Mock).mockReset();
});

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
    // The fake ffmpeg returns a non-zero status and writes nothing → runSystemFfmpeg throws on the
    // non-zero status (distinct from the ENOENT case above). The FAIL marker file is what the
    // spawnSync spy keys off; this is cross-platform (no /bin/false, no executable bit).
    const failBin = path.join(root, "fail-ffmpeg");
    fs.writeFileSync(failBin, `${STUB_FAIL_MARKER}\n`);
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
