/**
 * Test fixture for the sound lay: a short silent picture, two noise lines of very different
 * loudness and a steady tone as bed, made at test time by the system ffmpeg in a folder under
 * the OS temp dir, plus a spec. No sound, picture or clip file lives in the repo.
 */

import { spawnSync } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import type { ClipSoundSpec } from "./clipSound";
import { resolveSystemFfmpeg } from "./contactSheet";

export interface SoundFixture {
  root: string;
  mediaDir: string;
  outDir: string;
  specPath: string;
  spec: ClipSoundSpec;
  cleanup: () => void;
}

export const PICTURE_SEC = 10;
/** The bed is 2 s longer than the picture. */
export const BED_SEC = 12;
/** The title tag planted on the fixture picture. */
export const PLANTED_TITLE = "planted-title";

export function sha256File(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** Make <dir>/<name> with these ffmpeg arguments (all but the output); returns its sha256. */
export function makeMedia(dir: string, name: string, args: string[]): string {
  const file = path.join(dir, name);
  const res = spawnSync(resolveSystemFfmpeg(), ["-y", "-nostdin", "-hide_banner", "-loglevel", "error", ...args, file], { encoding: "utf8" });
  if (res.status !== 0) throw new Error(`fixture file ${name} failed: ${res.stderr}`);
  return sha256File(file);
}

/** The arguments of a sound file made from one lavfi source. */
export function soundArgs(source: string, filter = "anull", codec = "pcm_s16le"): string[] {
  return ["-f", "lavfi", "-i", source, "-af", filter, "-c:a", codec];
}

/** Pink noise of sec seconds, then a silent tail. */
export function noiseArgs(amplitude: number, sec: number, tail = 0, rate = 48000, layout: "mono" | "stereo" = "mono"): string[] {
  return soundArgs(
    `anoisesrc=color=pink:amplitude=${amplitude}:duration=${sec}:sample_rate=${rate}:seed=7`,
    `apad=pad_dur=${tail},aformat=channel_layouts=${layout}`,
  );
}

/** A steady tone in both channels. */
export function toneArgs(sec: number): string[] {
  // 6 dB up, so that the raw tone is far from the bed level of the spec
  return soundArgs(`sine=frequency=440:sample_rate=48000:duration=${sec}`, "volume=6dB,aformat=channel_layouts=stereo");
}

/** The arguments of the silent picture. */
export function pictureArgs(sec: number): string[] {
  return ["-f", "lavfi", "-i", `testsrc2=size=160x284:rate=30:duration=${sec}`, "-c:v", "libx264", "-pix_fmt", "yuv420p"];
}

export function writeSpec(f: SoundFixture, name: string, spec: unknown): string {
  const file = path.join(f.root, name);
  fs.writeFileSync(file, JSON.stringify(spec, null, 2) + "\n");
  return file;
}

/** The fixture spec for files with these hashes. */
export function soundSpec(sha: { picture: string; a: string; b: string; bed: string }): ClipSoundSpec {
  return {
    schema: "clip-sound/1",
    slug: "test-sound",
    picture: { file: "picture.mp4", sha256: sha.picture },
    voice: {
      target_lufs: -16,
      lines: [
        { id: "line-a", file: "line-a.wav", sha256: sha.a, at: 1, window: { from: 0.5, to: 4 } },
        { id: "line-b", file: "line-b.wav", sha256: sha.b, at: 6.537 },
      ],
    },
    bed: { file: "bed.wav", sha256: sha.bed, level_lufs: -24 },
  };
}

/** Make the fixture folder: media/, an empty out/ and spec.json. Needs the system ffmpeg. */
export function makeSoundFixture(): SoundFixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clip-sound-"));
  const mediaDir = path.join(root, "media");
  const outDir = path.join(root, "out");
  for (const d of [mediaDir, outDir]) fs.mkdirSync(d);
  const spec = soundSpec({
    picture: makeMedia(mediaDir, "picture.mp4", [...pictureArgs(PICTURE_SEC), "-metadata", `title=${PLANTED_TITLE}`]),
    // line a is stereo and line b is mono at another rate: the voice track is mono at 48 kHz
    a: makeMedia(mediaDir, "line-a.wav", noiseArgs(0.5, 2, 0.5, 44100, "stereo")),
    b: makeMedia(mediaDir, "line-b.wav", noiseArgs(0.02, 2, 0, 24000)),
    bed: makeMedia(mediaDir, "bed.wav", toneArgs(BED_SEC)),
  });
  const f: SoundFixture = { root, mediaDir, outDir, specPath: path.join(root, "spec.json"), spec, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
  writeSpec(f, "spec.json", spec);
  return f;
}
