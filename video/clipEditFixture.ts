/**
 * Test fixture for clip:edit — a small clip made at test time by the system ffmpeg in a folder
 * under the OS temp dir, plus a spec and a minimal intake record. No clip file lives in the repo.
 */

import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import type { ClipEditSpec } from "./clipEdit";
import { resolveSystemFfmpeg } from "./contactSheet";

export interface EditFixture {
  root: string;
  clipsDir: string;
  intakeDir: string;
  outDir: string;
  specPath: string;
  spec: ClipEditSpec;
  sha256: string;
  clipFile: string;
  cleanup: () => void;
}

/** The fixture spec for a clip with this sha256: 2 beats, 75 frames, 2.5 s at 30 fps. */
export function fixtureSpec(sha256: string, slug = "test-cut"): ClipEditSpec {
  return {
    schema: "clip-edit/1",
    output: { width: 360, height: 640, fps: 30, crop_top: 80, pad_color: "#FFFFFF" },
    sources: [
      {
        id: "a",
        file: "fixture.mp4",
        sha256,
        width: 360,
        height: 568,
        blur: [
          { from: 0, to: 1.5, x: 20, y: 100, w: 160, h: 120, hides: "made-up test plate" },
          { from: 2.2, to: 2.8, x: 180, y: 300, w: 160, h: 120, hides: "made-up test name" },
        ],
        cut: [{ from: 1.5, to: 2, hides: "made-up test plate" }],
      },
    ],
    videos: [
      {
        slug,
        beats: [
          { n: 1, clip: "first", dur: 1.5, pieces: [{ src: "a", from: 0, to: 1 }, { src: "a", still: 1, sec: 0.5 }] },
          { n: 2, clip: "second", dur: 1, pieces: [{ src: "a", from: 2, to: 3 }] },
        ],
      },
    ],
  };
}

/** Make the fixture folder. Needs the system ffmpeg (drawbox, noise, select, testsrc2). */
export function makeEditFixture(): EditFixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clip-edit-"));
  const clipsDir = path.join(root, "clips");
  const intakeDir = path.join(root, "intake");
  const outDir = path.join(root, "out");
  for (const d of [clipsDir, intakeDir, outDir]) fs.mkdirSync(d);
  const clipFile = path.join(clipsDir, "fixture.mp4");
  // Noise on a test pattern, magenta over the whole frame from 1.5 s up to (not including) 2 s,
  // then two of three frames kept: a variable-frame-rate clip.
  const vf =
    "noise=alls=40:allf=t+u," +
    "drawbox=x=0:y=0:w=iw:h=ih:color=magenta:t=fill:enable='gte(t,1.5)*lt(t,2)'," +
    "select='not(eq(mod(n,3),1))'";
  const res = spawnSync(
    resolveSystemFfmpeg(),
    ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=360x568:rate=25:duration=4", "-vf", vf, "-fps_mode", "vfr", "-c:v", "libx264", "-pix_fmt", "yuv420p", clipFile],
    { encoding: "utf8" },
  );
  if (res.status !== 0) throw new Error(`fixture clip failed: ${res.stderr}`);
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(clipFile)).digest("hex");
  fs.writeFileSync(
    path.join(intakeDir, `${sha256}.intake.json`),
    JSON.stringify({ schema: "clip-intake/1", file_name: "fixture.mp4", sha256, video: { width: 360, height: 568, rotation: 0 } }) + "\n",
  );
  const spec = fixtureSpec(sha256);
  const specPath = path.join(root, "spec.json");
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + "\n");
  return { root, clipsDir, intakeDir, outDir, specPath, spec, sha256, clipFile, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
