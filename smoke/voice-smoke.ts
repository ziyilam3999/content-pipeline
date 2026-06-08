/**
 * REAL-key smoke for the voice adapter — exercises the actual PAID ElevenLabs voice.
 *
 * Proves the PRIMARY path (the paid premium voice), never silently passes on the free
 * fallback (feedback_smoke_prove_primary_not_fallback): the adapter's default fallback is
 * unwired and `assertPrimaryVoiceProven` runs by default, so a non-primary result throws.
 * Emits a greppable `VOICE-PATH:` line and exits non-zero on any failure.
 *
 * This SPENDS real ElevenLabs credits (billed per character) — the script is kept short.
 *
 * Run: `npm run smoke:voice`
 *   Requires the ElevenLabs key in $ELEVENLABS_API_KEY or the macOS Keychain
 *   (service "ELEVENLABS_API_KEY", overridable via $ELEVENLABS_KEYCHAIN_SERVICE).
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { synthesizeVoiceToFile } from "../adapters/voice";

// A short, PUBLIC line about lfah (no employer brand; numbers are public benchmark facts).
const SCRIPT = "lfah resolved eighty-four percent of real bugs, test first.";

function looksLikeMp3(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  // ID3v2 tag, or an MPEG audio frame sync (0xFFE...).
  if (buf.subarray(0, 3).toString("ascii") === "ID3") return true;
  return buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
}

async function main() {
  const allowFallback = process.env.SMOKE_ALLOW_FALLBACK === "1";
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lcp-voice-"));

  console.log("→ calling the REAL ElevenLabs voice (PAID) to synthesize a short line…");
  const out = await synthesizeVoiceToFile({ script: SCRIPT }, undefined, {
    outDir: tmp,
    allowFallback,
  });

  console.log(out.pathLine);

  if (!out.provedPrimary && !allowFallback) {
    console.error(
      `SMOKE FAIL: voice came from "${out.usedProvider}", not the paid ElevenLabs primary. ` +
        `(set SMOKE_ALLOW_FALLBACK=1 only if you explicitly want to accept the free fallback.)`,
    );
    process.exit(1);
  }

  if (!fs.existsSync(out.audioPath)) {
    console.error(`SMOKE FAIL: no audio at ${out.audioPath}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(out.audioPath);
  if (buf.length < 2000) {
    console.error(`SMOKE FAIL: audio suspiciously small (${buf.length} bytes)`);
    process.exit(1);
  }
  if (!looksLikeMp3(buf)) {
    console.error("SMOKE FAIL: not a valid MP3 (no ID3 tag or MPEG frame sync)");
    process.exit(1);
  }
  if (!(out.durationSec > 0)) {
    console.error("SMOKE FAIL: ElevenLabs returned no positive clip duration");
    process.exit(1);
  }

  console.log(`  valid MP3, ${(buf.length / 1024).toFixed(1)} KB, ${out.durationSec.toFixed(2)}s`);

  // Copy the artifact to a stable spot for eyeballing.
  const stable = path.join(process.cwd(), "out", "audio", "smoke-voiceover.mp3");
  fs.mkdirSync(path.dirname(stable), { recursive: true });
  fs.copyFileSync(out.audioPath, stable);
  console.log(`  copied to ${stable}`);

  console.log("\nSMOKE PASS: real paid ElevenLabs voice proved, MP3 written, duration captured.");
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
