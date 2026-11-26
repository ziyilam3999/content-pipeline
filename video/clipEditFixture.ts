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

/** A root under the OS temp folder with the clips, intake and out folders of a fixture. */
function folders(): { root: string; clipsDir: string; intakeDir: string; outDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clip-edit-"));
  const clipsDir = path.join(root, "clips");
  const intakeDir = path.join(root, "intake");
  const outDir = path.join(root, "out");
  for (const d of [clipsDir, intakeDir, outDir]) fs.mkdirSync(d);
  return { root, clipsDir, intakeDir, outDir };
}

/** A small test clip (the ffmpeg arguments after the log level) with its intake record; returns its sha256. */
export function makeSource(f: { clipsDir: string; intakeDir: string }, file: string, args: string[]): string {
  const clipFile = path.join(f.clipsDir, file);
  const res = spawnSync(resolveSystemFfmpeg(), ["-y", "-hide_banner", "-loglevel", "error", ...args, clipFile], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`fixture clip ${file} failed: ${res.stderr}`);
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(clipFile)).digest("hex");
  fs.writeFileSync(
    path.join(f.intakeDir, `${sha256}.intake.json`),
    JSON.stringify({ schema: "clip-intake/1", file_name: file, sha256 }) + "\n",
  );
  return sha256;
}

/** The cut window of the second mixed source, 1.5 s up to (not including) 1.8 s: black and white
 *  bands of 50 rows down its 400 rows. A read with another crop moves the bands, so the cut proof
 *  of the check depends on the crop (a one-colour window would look the same under another crop). */
const BAND_WINDOW_VF = [0, 50, 100, 150, 200, 250, 300, 350]
  .map((y, i) => `drawbox=x=0:y=${y}:w=iw:h=50:color=${i % 2 === 0 ? "black" : "white"}:t=fill:enable='gte(t,1.5)*lt(t,1.8)'`)
  .join(",");

/** Two sources that differ in size, frame rate and crop_top, one video of 90 frames (3 s at 30 fps):
 *  a 360x500 25 fps gray noise clip with a green band on its top 80 rows (crop_top 80), and a 240x400
 *  24 fps noise clip with a sound track, a blur box that plays, a window of bands with prove_absent
 *  and a held frame (crop_top 0). output.crop_top (40) is neither source's crop. */
export function mixedSpec(bandSha: string, soundSha: string, slug = "mixed-cut"): ClipEditSpec {
  return {
    schema: "clip-edit/1",
    output: { width: 360, height: 640, fps: 30, crop_top: 40, pad_color: "#FFFFFF" },
    sources: [
      { id: "band", file: "band.mp4", sha256: bandSha, width: 360, height: 500, crop_top: 80, blur: [], cut: [] },
      {
        id: "sound",
        file: "sound.mp4",
        sha256: soundSha,
        width: 240,
        height: 400,
        crop_top: 0,
        blur: [{ from: 0, to: 1, x: 100, y: 150, w: 80, h: 80, hides: "made-up test plate" }],
        cut: [{ from: 1.5, to: 1.8, hides: "made-up test name", prove_absent: { from: 1.55, to: 1.75 } }],
      },
    ],
    videos: [
      {
        slug,
        beats: [
          { n: 1, clip: "first", dur: 1, pieces: [{ src: "band", from: 0, to: 1 }] },
          { n: 2, clip: "second", dur: 2, pieces: [{ src: "sound", from: 0, to: 1 }, { src: "sound", still: 1.2, sec: 0.5 }, { src: "sound", from: 2, to: 2.5 }] },
        ],
      },
    ],
  };
}

export interface SpecFixture extends EditFixture {
  /** The other clips of the fixture, by source id. */
  clipOf: Record<string, string>;
}

export function makeMixedFixture(): SpecFixture {
  const f = folders();
  const band = makeSource(f, "band.mp4", [
    "-f",
    "lavfi",
    "-i",
    "color=c=0x808080:s=360x500:r=25:d=3",
    "-vf",
    "noise=alls=20:allf=t,drawbox=x=0:y=0:w=iw:h=80:color=0x00FF00:t=fill",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
  ]);
  const sound = makeSource(f, "sound.mp4", [
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=240x400:rate=24:duration=4",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=4",
    "-vf",
    `noise=alls=40:allf=t+u,${BAND_WINDOW_VF}`,
    "-map",
    "0:v",
    "-map",
    "1:a",
    "-c:a",
    "aac",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
  ]);
  const spec = mixedSpec(band, sound);
  const specPath = path.join(f.root, "spec.json");
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + "\n");
  const clipOf = { band: path.join(f.clipsDir, "band.mp4"), sound: path.join(f.clipsDir, "sound.mp4") };
  return { ...f, specPath, spec, sha256: band, clipFile: clipOf.band, clipOf, cleanup: () => fs.rmSync(f.root, { recursive: true, force: true }) };
}

/** A zoom video of one piece: the detail clip 0 .. to s, ending at zoom_to. 30 fps. */
export function zoomSpec(sha256: string, zoomTo: number, to: number, slug = "zoom-cut"): ClipEditSpec {
  return {
    schema: "clip-edit/1",
    output: { width: 360, height: 640, fps: 30, crop_top: 0, pad_color: "#FFFFFF" },
    sources: [{ id: "z", file: "zoom.mp4", sha256, width: 360, height: 480, blur: [], cut: [] }],
    videos: [{ slug, beats: [{ n: 1, clip: "one", dur: to, pieces: [{ src: "z", from: 0, to, zoom_to: zoomTo }] }] }],
  };
}

/** The picture of the zoom clips: a dark gray base under a 16 px grid, with a red, a yellow and a
 *  blue box off centre (no green in it, so a green band can be told from the picture). */
const DETAIL_VF =
  "drawgrid=w=16:h=16:t=1:color=0x808080," +
  "drawbox=x=20:y=150:w=100:h=80:color=0xE02020:t=fill," +
  "drawbox=x=210:y=130:w=60:h=60:color=0xF0F000:t=fill," +
  "drawbox=x=250:y=380:w=90:h=90:color=0x2050E0:t=fill";

/** Three clips for the zoom tests: a 360x480 detail clip, the same 360x590 with a green band on
 *  its top 110 rows, and a flat gray 360x480 one. The spec is zoomSpec of the detail clip, zoom_to
 *  1.12 over one second. */
export function makeZoomFixture(): SpecFixture {
  const f = folders();
  const z = makeSource(f, "zoom.mp4", ["-f", "lavfi", "-i", "color=c=0x404040:s=360x480:r=30:d=2", "-vf", DETAIL_VF, "-c:v", "libx264", "-pix_fmt", "yuv420p"]);
  makeSource(f, "zoom-band.mp4", [
    "-f",
    "lavfi",
    "-i",
    "color=c=0x404040:s=360x590:r=30:d=2",
    "-vf",
    `${DETAIL_VF},drawbox=x=0:y=0:w=iw:h=110:color=0x00FF00:t=fill`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
  ]);
  makeSource(f, "flat.mp4", ["-f", "lavfi", "-i", "color=c=0x808080:s=360x480:r=30:d=2", "-c:v", "libx264", "-pix_fmt", "yuv420p"]);
  const spec = zoomSpec(z, 1.12, 1);
  const specPath = path.join(f.root, "spec.json");
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + "\n");
  const clipOf = {
    z: path.join(f.clipsDir, "zoom.mp4"),
    band: path.join(f.clipsDir, "zoom-band.mp4"),
    flat: path.join(f.clipsDir, "flat.mp4"),
  };
  return { ...f, specPath, spec, sha256: z, clipFile: clipOf.z, clipOf, cleanup: () => fs.rmSync(f.root, { recursive: true, force: true }) };
}
