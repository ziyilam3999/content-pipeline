/**
 * #871 forge-demo VOICED — the compose-logic ORACLE for `tools/voiceForge.ts`.
 *
 * `voiceForge.ts` runs `main()` on import (side-effecting: ffmpeg + Playwright), so — exactly like the
 * fable tooling — the COMPOSE LOGIC is proven here through the SAME building blocks the tool wires
 * together, NOT by importing the tool. This is the MOCK-mode path: a free silent VO + real-shaped
 * per-character alignment over `FORGE_RUNTIME_SEC`, with NO network and NO paid call.
 *
 * Proven both-ends:
 *   • mock alignment shape (one char-time per script char, last == duration),
 *   • scene-end monotonicity (one ascending end per narrated segment, last ≈ audio end),
 *   • caption parity (cues span the audio: start at 0, last ends at the duration; every spoken word
 *     surfaces in a cue) — the #775 `assertVoicedDemoHasCaptions` invariant,
 *   • the audio↔alignment provenance bind (`assertAudioMatchesSync` on the real silent WAV),
 *   • the R12 captions contract (`assertDemoCategoryRecipe(forgeSpec)` + the bundle source wiring).
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { FORGE_NARRATION, forgeNarrationScript, forgeCaptionDisplayText } from "../../video/forgeNarration";
import { FORGE_RUNTIME_SEC, FORGE_VO_BUNDLE, forgeSpec } from "../../video/forgeStoryboard";
import { narrationSceneEndTimes } from "../../video/demoTimeline";
import { buildDemoCaptionCues, assertVoicedDemoHasCaptions } from "../../video/demoCaptions";
import { audioDurationSec, assertAudioMatchesSync } from "../../video/audioDuration";
import { makeSilentWav } from "../../adapters/video";
import { assertDemoCategoryRecipe } from "../../video/demoCategoryRecipe";

/** The SAME free mock the tool uses: smoothstep-eased per-char end-times over `durationSec`, last exact. */
function mockCharEndTimes(text: string, durationSec: number): number[] {
  const n = text.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = (i + 1) / n;
    const eased = x * x * (3 - 2 * x);
    out.push(Number((eased * durationSec).toFixed(4)));
  }
  out[n - 1] = durationSec;
  return out;
}

const SCRIPT = forgeNarrationScript();
const DURATION = FORGE_RUNTIME_SEC;
const CHAR_ENDS = mockCharEndTimes(SCRIPT, DURATION);

describe("#871 voiceForge MOCK alignment — shape", () => {
  it("produces one char-time per script character, last == duration (FORGE_RUNTIME_SEC)", () => {
    expect(CHAR_ENDS.length).toBe(SCRIPT.length);
    expect(CHAR_ENDS[CHAR_ENDS.length - 1]).toBe(DURATION);
    expect(DURATION).toBe(88);
  });

  it("char-times are finite and non-decreasing", () => {
    for (let i = 0; i < CHAR_ENDS.length; i++) {
      expect(Number.isFinite(CHAR_ENDS[i])).toBe(true);
      if (i > 0) expect(CHAR_ENDS[i]).toBeGreaterThanOrEqual(CHAR_ENDS[i - 1]);
    }
  });
});

describe("#871 voiceForge — scene-end times follow the narration (monotonic, one per segment)", () => {
  const ends = narrationSceneEndTimes(FORGE_NARRATION, CHAR_ENDS, DURATION);

  it("returns one ascending end per narrated segment, the last ≈ the audio end", () => {
    expect(ends).not.toBeNull();
    expect(ends!.length).toBe(FORGE_NARRATION.length);
    let prev = 0;
    for (const e of ends!) {
      expect(Number.isFinite(e)).toBe(true);
      expect(e).toBeGreaterThan(prev); // strictly ascending — no zero-length scene
      expect(e).toBeLessThanOrEqual(DURATION + 1e-6);
      prev = e;
    }
    expect(Math.abs(ends![ends!.length - 1] - DURATION)).toBeLessThan(0.5);
  });

  it("returns null when the alignment length does not match the script (guard intact)", () => {
    expect(narrationSceneEndTimes(FORGE_NARRATION, CHAR_ENDS.slice(0, -1), DURATION)).toBeNull();
  });
});

describe("#871 voiceForge — caption parity (cues span the audio, every spoken word surfaces)", () => {
  const cues = buildDemoCaptionCues(SCRIPT, { durationSec: DURATION, charEndTimesSec: CHAR_ENDS });

  it("emits a non-empty caption track", () => {
    expect(cues.length).toBeGreaterThan(0);
  });

  it("satisfies the #775 voiced-captions parity invariant (start 0, last cue ≈ audio end)", () => {
    expect(cues[0].startSec).toBeCloseTo(0, 6);
    expect(Math.abs(cues[cues.length - 1].endSec - DURATION)).toBeLessThanOrEqual(1e-3);
    expect(() => assertVoicedDemoHasCaptions(cues, { durationSec: DURATION })).not.toThrow();
  });

  it("every spoken WORD maps into the caption track (no chunk dropped)", () => {
    const capWords = new Set(
      cues
        .map((c) => forgeCaptionDisplayText(c.text))
        .join(" ")
        .split(/\s+/)
        .filter(Boolean),
    );
    for (const w of SCRIPT.split(/\s+/).filter(Boolean)) {
      expect(capWords.has(w)).toBe(true);
    }
  });
});

describe("#871 voiceForge — audio↔alignment provenance bind (real silent WAV)", () => {
  it("a silent WAV of the mock duration matches the scene-end alignment", () => {
    const ends = narrationSceneEndTimes(FORGE_NARRATION, CHAR_ENDS, DURATION)!;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "forge-vo-test-"));
    const wav = path.join(dir, "forge-vo.wav");
    fs.writeFileSync(wav, makeSilentWav(DURATION));
    try {
      expect(audioDurationSec(wav)).toBeCloseTo(DURATION, 1);
      expect(() => assertAudioMatchesSync(wav, ends)).not.toThrow();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("#871 voiceForge — R12 captions contract is satisfied by forgeSpec", () => {
  it("forgeSpec passes the whole demonstration recipe (R1–R12)", () => {
    expect(() => assertDemoCategoryRecipe(forgeSpec)).not.toThrow();
  });

  it("the caption track is provenance-bound to the forge VO sync bundle", () => {
    expect(forgeSpec.captions.present).toBe(true);
    expect(forgeSpec.captions.syncBoundToRealAudio).toBe(true);
    expect(forgeSpec.captions.audio.source).toBe(FORGE_VO_BUNDLE);
    expect(forgeSpec.captions.audio.real).toBe(true);
  });
});
