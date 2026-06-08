/**
 * P4c bp8 — voiceover plan, now reporting a REAL clip length (durationSec).
 *
 * Same as the P4a voiceover plan (turn a script into a text-to-speech request, prefer the PAID primary voice
 * with a FREE backup, prove which voice was used) — PLUS one new thing the wiring needs: the voice clip now
 * carries a real length number, `durationSec`, that the provider reports. The captions step reads this length.
 * The text-to-speech provider is INJECTED (a stub in the test) — no real network/API.
 *
 * Do NOT modify this test.
 */
import {
  PRIMARY_PROVIDER,
  FALLBACK_PROVIDER,
  buildSpeechRequest,
  synthesizeVoiceover,
  assertPrimaryVoiceProven,
  SpeechRequest,
  VoiceClip,
  VoiceCaller,
  VoiceoverResult,
} from "../voiceover";

const SCRIPT = "Meet the local-first agent harness. It never loses a bug. Built test-first.";

// A stub TTS provider: returns a deterministic clip tagged with the provider AND a real length the provider
// "measured" for the audio. No real API.
const okCaller =
  (provider: string, durationSec: number): VoiceCaller =>
  async (req: SpeechRequest): Promise<VoiceClip> => ({
    provider,
    voiceId: req.voiceId,
    audio: `AUDIO[${provider}:${req.voiceId}:${req.text.length}]`,
    durationSec,
  });
// A stub provider that is DOWN — throws like a real failure.
const downCaller: VoiceCaller = async () => {
  throw new Error("TTS provider unavailable (stub)");
};

describe("P4c voiceover — provider constants", () => {
  test("primary is the paid ElevenLabs voice, fallback is the free Kokoro voice", () => {
    expect(PRIMARY_PROVIDER).toBe("elevenlabs");
    expect(FALLBACK_PROVIDER).toBe("kokoro");
  });
});

describe("P4c voiceover — buildSpeechRequest (unchanged from P4a)", () => {
  test("builds a primary paid speak-request whose words are EXACTLY the script", () => {
    const req = buildSpeechRequest(SCRIPT);
    expect(req.provider).toBe(PRIMARY_PROVIDER);
    expect(req.voiceId.length).toBeGreaterThan(0);
    expect(req.modelId.length).toBeGreaterThan(0);
    expect(req.format.length).toBeGreaterThan(0);
    expect(req.text).toBe(SCRIPT);
  });

  test("honors explicit voiceId / modelId / format overrides", () => {
    const req = buildSpeechRequest(SCRIPT, { voiceId: "V1", modelId: "m9", format: "mp3_22050_32" });
    expect(req.voiceId).toBe("V1");
    expect(req.modelId).toBe("m9");
    expect(req.format).toBe("mp3_22050_32");
  });
});

describe("P4c voiceover — synthesizeVoiceover carries the clip's REAL length", () => {
  test("uses the paid primary when it works, marks it proven, and surfaces durationSec", async () => {
    const result: VoiceoverResult = await synthesizeVoiceover(SCRIPT, {
      primary: okCaller(PRIMARY_PROVIDER, 6.5),
      fallback: okCaller(FALLBACK_PROVIDER, 9.0),
    });
    expect(result.usedProvider).toBe(PRIMARY_PROVIDER);
    expect(result.provedPrimary).toBe(true);
    expect(result.clip.provider).toBe(PRIMARY_PROVIDER);
    expect(result.clip.audio.length).toBeGreaterThan(0);
    // the NEW bit: the clip reports a real length, taken from the provider (not invented, not zero)
    expect(typeof result.clip.durationSec).toBe("number");
    expect(result.clip.durationSec).toBe(6.5);
    expect(result.pathLine).toContain(`used="${PRIMARY_PROVIDER}"`);
    expect(result.pathLine).toContain("clean=true");
  });

  test("falls back to the free backup only when the primary fails, keeping the backup's length", async () => {
    const result = await synthesizeVoiceover(SCRIPT, {
      primary: downCaller,
      fallback: okCaller(FALLBACK_PROVIDER, 9.0),
    });
    expect(result.usedProvider).toBe(FALLBACK_PROVIDER);
    expect(result.provedPrimary).toBe(false);
    expect(result.clip.durationSec).toBe(9.0); // the length comes from whichever clip we actually got
    expect(result.pathLine).toContain("clean=false");
  });

  test("if BOTH providers are down it throws (no silent empty clip)", async () => {
    await expect(
      synthesizeVoiceover(SCRIPT, { primary: downCaller, fallback: downCaller }),
    ).rejects.toThrow();
  });
});

describe("P4c voiceover — assertPrimaryVoiceProven (unchanged from P4a)", () => {
  test("passes when the primary was proven", async () => {
    const result = await synthesizeVoiceover(SCRIPT, {
      primary: okCaller(PRIMARY_PROVIDER, 6.5),
      fallback: okCaller(FALLBACK_PROVIDER, 9.0),
    });
    expect(() => assertPrimaryVoiceProven(result)).not.toThrow();
  });

  test("HARD-FAILS when only the fallback was proven and fallback was not explicitly allowed", async () => {
    const result = await synthesizeVoiceover(SCRIPT, {
      primary: downCaller,
      fallback: okCaller(FALLBACK_PROVIDER, 9.0),
    });
    expect(() => assertPrimaryVoiceProven(result)).toThrow();
    expect(() => assertPrimaryVoiceProven(result, { allowFallback: true })).not.toThrow();
  });
});
