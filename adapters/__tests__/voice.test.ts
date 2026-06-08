/**
 * Unit test for the real voice adapter — uses an INJECTED fake caller (no real ElevenLabs).
 * The real-paid path is exercised separately by `smoke/voice-smoke.ts`.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  synthVoice,
  synthesizeVoiceToFile,
  type SynthVoiceDeps,
} from "../voice";
import { type VoiceCaller } from "../../audio/voiceover";

const SAMPLE = Buffer.from("ID3 fake mp3 bytes for a unit test", "utf8");

/** A fake "paid" primary that returns a fixed clip without any network/key. */
const fakePrimary: VoiceCaller = async (req) => ({
  provider: "elevenlabs",
  voiceId: "test-voice",
  audio: SAMPLE.toString("base64"),
  durationSec: 4.2,
  // echo text length so a test could assert wiring if needed
  ...(req.text ? {} : {}),
});

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lcp-voice-test-"));
}

describe("synthVoice adapter (injected fake caller)", () => {
  it("writes the decoded audio bytes to a real .mp3 and returns its path", async () => {
    const outDir = tmpDir();
    const deps: SynthVoiceDeps = { primary: fakePrimary };
    const audioPath = await synthVoice({ script: "hello world" }, deps, { outDir });

    expect(audioPath.endsWith(".mp3")).toBe(true);
    expect(fs.existsSync(audioPath)).toBe(true);
    expect(fs.readFileSync(audioPath)).toEqual(SAMPLE);
  });

  it("proves the paid primary and reports the real duration", async () => {
    const outDir = tmpDir();
    const out = await synthesizeVoiceToFile({ script: "hello" }, { primary: fakePrimary }, { outDir });

    expect(out.provedPrimary).toBe(true);
    expect(out.usedProvider).toBe("elevenlabs");
    expect(out.durationSec).toBeCloseTo(4.2);
    expect(out.pathLine).toContain('used="elevenlabs"');
    expect(out.pathLine).toContain("clean=true");
  });

  it("does NOT silently slide to a fallback — primary failure throws by default", async () => {
    const outDir = tmpDir();
    const failingPrimary: VoiceCaller = async () => {
      throw new Error("paid primary unavailable");
    };
    await expect(
      synthesizeVoiceToFile({ script: "hello" }, { primary: failingPrimary }, { outDir }),
    ).rejects.toThrow();
  });

  it("allows an explicit fallback only when allowFallback is set", async () => {
    const outDir = tmpDir();
    const failingPrimary: VoiceCaller = async () => {
      throw new Error("paid primary down");
    };
    const fallback: VoiceCaller = async () => ({
      provider: "kokoro",
      voiceId: "free",
      audio: SAMPLE.toString("base64"),
      durationSec: 3.0,
    });

    // Without allowFallback → still throws (assertPrimaryVoiceProven blocks it).
    await expect(
      synthesizeVoiceToFile({ script: "hi" }, { primary: failingPrimary, fallback }, { outDir }),
    ).rejects.toThrow();

    // With allowFallback → the free backup is accepted, marked not-proved-primary.
    const out = await synthesizeVoiceToFile(
      { script: "hi" },
      { primary: failingPrimary, fallback },
      { outDir, allowFallback: true },
    );
    expect(out.provedPrimary).toBe(false);
    expect(out.usedProvider).toBe("kokoro");
  });
});
