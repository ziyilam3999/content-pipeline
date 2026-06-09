/**
 * #774 — audio-duration reader + the audio↔sync provenance guard.
 *
 * Builds a known-length silent WAV (via the adapter's makeSilentWav) and asserts the
 * pure-Node reader recovers its duration, then that assertAudioMatchesSync refuses a
 * mismatched alignment (the #744 wrong-audio-file class) while allowing a matched one.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { audioDurationSec, assertAudioMatchesSync, AUDIO_SYNC_TOLERANCE_SEC } from "../audioDuration";
import { makeSilentWav } from "../../adapters/video";

function writeTmpWav(durationSec: number): string {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "audiodur-")), `a-${durationSec}.wav`);
  fs.writeFileSync(p, makeSilentWav(durationSec));
  return p;
}

describe("#774 audioDurationSec — WAV", () => {
  test("recovers a known WAV duration", () => {
    const p = writeTmpWav(10);
    const d = audioDurationSec(p);
    expect(d).not.toBeNull();
    expect(d as number).toBeCloseTo(10, 1);
  });

  test("recovers a non-round duration", () => {
    const p = writeTmpWav(84.85);
    expect(audioDurationSec(p) as number).toBeCloseTo(84.85, 1);
  });
});

describe("#774 assertAudioMatchesSync — provenance guard", () => {
  test("passes when audio length matches the alignment's last scene end", () => {
    const p = writeTmpWav(84.85);
    expect(() => assertAudioMatchesSync(p, [30, 55, 66, 81, 84.847])).not.toThrow();
  });

  test("passes within tolerance", () => {
    const p = writeTmpWav(85.2);
    // 85.2 vs 84.847 ≈ 0.35s < tolerance
    expect(AUDIO_SYNC_TOLERANCE_SEC).toBeGreaterThan(0.35);
    expect(() => assertAudioMatchesSync(p, [30, 55, 66, 81, 84.847])).not.toThrow();
  });

  test("THROWS on the #744 mismatch (a 64.8s audio paired with 84.847s timing)", () => {
    const p = writeTmpWav(64.86);
    expect(() => assertAudioMatchesSync(p, [30, 55, 66, 81, 84.847])).toThrow(/provenance mismatch/);
  });

  test("no-op when there is no alignment", () => {
    const p = writeTmpWav(10);
    expect(() => assertAudioMatchesSync(p, [])).not.toThrow();
  });
});
