/**
 * P4c bp10 — audio-visual WIRING (the RED acceptance test lfah must turn green).
 *
 * This is the piece that connects the others into one flow (operator MCQ 2026-06-08):
 *   the copy step's spoken script  →  the voiceover  →  the voice clip's REAL length  →  the captions read it.
 *
 * `buildAudioVisual` takes the spoken script (what the copy step produced) and the injected voice providers,
 * runs the voiceover (paid-primary first, free-fallback), then builds the caption track timed to the voice
 * clip's REAL length (clip.durationSec). The result bundles the script, the voiceover result, and the caption
 * track, and proves the captions used the SAME length the voice clip reported — no guessing, no mismatch.
 * Everything is stubbed; no real network/API and no video rendering.
 *
 * Do NOT modify this test.
 */
import {
  buildAudioVisual,
  assertAudioVisualConsistent,
  AudioVisualPlan,
} from "../audioVisual";

// the spoken script the copy step would have produced (12 words)
const SCRIPT = "Meet the local first agent harness it never loses a bug built";

// a stub TTS provider returning a clip tagged with a provider + a real measured length
const okCaller =
  (provider: string, durationSec: number) =>
  async (req: { voiceId: string; text: string }) => ({
    provider,
    voiceId: req.voiceId,
    audio: `AUDIO[${provider}:${req.text.length}]`,
    durationSec,
  });
const downCaller = async () => {
  throw new Error("TTS provider unavailable (stub)");
};

const wordsOf = (s: string): string[] => s.trim().split(/\s+/);

describe("P4c wiring — buildAudioVisual connects copy-script → voiceover → captions", () => {
  test("happy path: the paid voice is used and the captions read the clip's REAL length", async () => {
    const plan: AudioVisualPlan = await buildAudioVisual(SCRIPT, {
      primary: okCaller("elevenlabs", 6),
      fallback: okCaller("kokoro", 9),
    });

    // same script flowed all the way through
    expect(plan.script).toBe(SCRIPT);
    // voiceover used the paid primary and proved it
    expect(plan.voiceover.usedProvider).toBe("elevenlabs");
    expect(plan.voiceover.provedPrimary).toBe(true);
    expect(plan.voiceover.clip.durationSec).toBe(6);

    // THE WIRING PROOF: the captions were timed to the voice clip's real length, not a guess
    expect(plan.captions.durationSec).toBe(6);
    const caps = plan.captions.captions;
    expect(caps.length).toBeGreaterThan(0);
    expect(caps[0].startSec).toBeCloseTo(0, 6);
    expect(caps[caps.length - 1].endSec).toBeCloseTo(6, 6); // covers the whole clip

    // captions were built from the SAME words as the script (no invent/drop/reorder)
    const captionWords = caps.flatMap((c) => wordsOf(c.text));
    expect(captionWords).toEqual(wordsOf(SCRIPT));

    // a greppable combined proof line
    expect(plan.pathLine).toContain("AV-PATH:");
    expect(plan.pathLine).toContain('voice="elevenlabs"');
    expect(plan.pathLine).toContain("clean=true");
  });

  test("the caption track tracks the voice clip's actual length: a longer clip stretches the captions", async () => {
    const plan = await buildAudioVisual(SCRIPT, {
      primary: okCaller("elevenlabs", 12),
      fallback: okCaller("kokoro", 9),
    });
    expect(plan.voiceover.clip.durationSec).toBe(12);
    expect(plan.captions.durationSec).toBe(12);
    const caps = plan.captions.captions;
    expect(caps[caps.length - 1].endSec).toBeCloseTo(12, 6);
  });

  test("fallback path: paid voice down → free backup, captions read the BACKUP clip's length", async () => {
    const plan = await buildAudioVisual(SCRIPT, {
      primary: downCaller,
      fallback: okCaller("kokoro", 9),
    });
    expect(plan.voiceover.usedProvider).toBe("kokoro");
    expect(plan.voiceover.provedPrimary).toBe(false);
    expect(plan.voiceover.clip.durationSec).toBe(9);
    expect(plan.captions.durationSec).toBe(9); // captions follow whichever clip we actually got
    expect(plan.captions.captions[plan.captions.captions.length - 1].endSec).toBeCloseTo(9, 6);
  });

  test("passes an explicit caption word-cap through to the caption step", async () => {
    const plan = await buildAudioVisual(SCRIPT, {
      primary: okCaller("elevenlabs", 6),
      fallback: okCaller("kokoro", 9),
    }, { maxWords: 3 });
    for (const c of plan.captions.captions) {
      expect(wordsOf(c.text).length).toBeLessThanOrEqual(3);
    }
  });
});

describe("P4c wiring — assertAudioVisualConsistent (the pieces must agree)", () => {
  test("passes silently when the captions match the voice clip's length and cover it", async () => {
    const plan = await buildAudioVisual(SCRIPT, {
      primary: okCaller("elevenlabs", 6),
      fallback: okCaller("kokoro", 9),
    });
    expect(() => assertAudioVisualConsistent(plan)).not.toThrow();
  });

  test("HARD-FAILS when the captions were timed to a DIFFERENT length than the voice clip", async () => {
    const plan = await buildAudioVisual(SCRIPT, {
      primary: okCaller("elevenlabs", 6),
      fallback: okCaller("kokoro", 9),
    });
    // forge a mismatch: pretend the captions were built for a 10s clip while the voice is 6s
    const broken: AudioVisualPlan = {
      ...plan,
      captions: { ...plan.captions, durationSec: 10 },
    };
    expect(() => assertAudioVisualConsistent(broken)).toThrow();
  });
});
