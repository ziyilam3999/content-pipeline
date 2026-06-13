/**
 * #867 Leg 1 — `npm run smoke:eyeball` (FREE; NO paid call, NO publish).
 *
 * PROVE-PRIMARY (not parse-only): render a tiny REAL silent demo MP4, then run the contact-sheet
 * generator with the SYSTEM ffmpeg (real `tile` extraction — not a parse of a fixture). Then exercise
 * the fail-closed eyeball-ack gate BOTH ENDS + the bypass forms, and the red-flag asserts on a clean
 * vs a dirty fixture.
 *
 * CI note (reviewer rec 3): this smoke needs the SYSTEM ffmpeg's tile filter, which a CI box may lack.
 * If system ffmpeg is ABSENT we print a LOUD "SKIP (no system ffmpeg)" and exit 0 — never a SILENT
 * pass, never a false green. The jest unit tests separately stub the ffmpeg-absent path so the
 * fail-closed behaviour is covered even without a real binary.
 *
 * Demonstrates (AC 3/6):
 *   1. real system-ffmpeg contact-sheet extraction → sheet.png bytes>0, manifest sha == sha256(mp4).
 *   2. requireEyeballAck THROWS pre-ack → record → PASSES → 1-byte mutation → THROWS again (stale).
 *   3. an ack for a DIFFERENT sha does NOT satisfy the gate (forged-ack bypass blocked).
 *   4. red-flag asserts: a dirty fixture (#748 / smoke / example.com) FAILS, a clean one PASSES.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { renderDemoVideo } from "../adapters/video";
import { lfahSpec } from "./lfahSpec";
import { buildDemoTimeline } from "../video/demoTimeline";
import {
  generateContactSheet,
  beatsFromScenes,
  hasSystemFfmpeg,
  sha256File,
} from "../video/contactSheet";
import { recordEyeballAck, requireEyeballAck, ackPath } from "../video/eyeballAck";
import {
  assertNoInternalDevTokens,
  assertNoPlaceholderUrls,
} from "../video/visualRedFlags";

function pass(msg: string): void {
  console.log(`  ✓ ${msg}`);
}
function fail(msg: string): never {
  console.error(`\n#867 SMOKE FAIL: ${msg}`);
  process.exit(1);
}
function expectThrow(fn: () => void, what: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) fail(`expected ${what} to THROW (fail-closed) but it returned.`);
  pass(`${what} threw (BLOCK) as required`);
}
function expectNoThrow(fn: () => void, what: string): void {
  try {
    fn();
  } catch (err) {
    fail(`expected ${what} to PASS but it threw: ${err instanceof Error ? err.message : String(err)}`);
  }
  pass(`${what} passed (ALLOW) as required`);
}

async function main(): Promise<void> {
  console.log("\n=== #867 eyeball-gate smoke — real system-ffmpeg extraction + fail-closed both-ends ===\n");

  // ── red-flag asserts (run regardless of ffmpeg — pure string checks) ──────────────────────────
  console.log("[red-flags] dirty fixture must FAIL, clean fixture must PASS:");
  const DIRTY = [
    "Phase D / #748 will add the real voiceover",
    "see github.com/example/lfah",
    "watch it and tell me what to change",
  ];
  const CLEAN = [
    "local-first-agent-harness resolved 62% of 13 real SWE-bench Verified bugs",
    "pip install git+https://github.com/ziyilam3999/local-first-agent-harness",
  ];
  expectThrow(() => assertNoInternalDevTokens(DIRTY), "assertNoInternalDevTokens(dirty)");
  expectThrow(() => assertNoPlaceholderUrls(DIRTY), "assertNoPlaceholderUrls(dirty)");
  expectNoThrow(() => assertNoInternalDevTokens(CLEAN), "assertNoInternalDevTokens(clean)");
  expectNoThrow(() => assertNoPlaceholderUrls(CLEAN), "assertNoPlaceholderUrls(clean)");

  // ── ffmpeg gate: LOUD skip if absent (never a silent pass) ────────────────────────────────────
  if (!hasSystemFfmpeg()) {
    console.log(
      "\n#867 SMOKE SKIP (LOUD): system ffmpeg not found — the contact-sheet half needs the system " +
        "ffmpeg's tile filter (the vendored Remotion ffmpeg is --disable-filters). The red-flag asserts " +
        "above PASSED. The fail-closed gate is covered by jest (ffmpeg-absent stub). Install ffmpeg to run " +
        "the full live extraction. Exiting 0 (this is a LOUD skip, NOT a green pass of the ffmpeg path).",
    );
    process.exit(0);
  }

  // ── isolate ack + review state in a throwaway tmp dir (don't pollute the repo) ────────────────
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eyeball-smoke-"));
  const reviewRoot = path.join(tmp, "review");
  const ackRoot = path.join(tmp, "ack");
  fs.mkdirSync(reviewRoot, { recursive: true });
  fs.mkdirSync(ackRoot, { recursive: true });

  // ── 1) render a tiny REAL silent demo + extract a real contact sheet (prove-primary) ──────────
  console.log("\n[extract] rendering a tiny real silent demo + real system-ffmpeg tile extraction:");
  const videoDir = path.join(tmp, "video");
  fs.mkdirSync(videoDir, { recursive: true });
  const videoPath = await renderDemoVideo(lfahSpec(), {
    durationSec: 8,
    outDir: videoDir,
    fileName: "eyeball-demo.mp4",
  });
  const bytes = fs.statSync(videoPath).size;
  if (bytes <= 0) fail("rendered demo MP4 is empty");
  pass(`rendered ${path.basename(videoPath)} (${bytes} bytes)`);

  const timeline = buildDemoTimeline(lfahSpec(), { durationSec: 8 });
  const beats = beatsFromScenes(timeline.scenes);
  const sheet = generateContactSheet(videoPath, beats, { slug: "eyeball-smoke", reviewRoot });
  if (!fs.existsSync(sheet.sheetPath) || fs.statSync(sheet.sheetPath).size <= 0) {
    fail(`contact sheet PNG missing/empty at ${sheet.sheetPath}`);
  }
  pass(`real tiled sheet.png (${fs.statSync(sheet.sheetPath).size} bytes, ${sheet.manifest.frameCount} beats)`);
  if (sheet.artifactSha !== sha256File(videoPath)) fail("manifest artifactSha != sha256(mp4)");
  pass(`manifest artifactSha == sha256(mp4) (${sheet.artifactSha.slice(0, 12)}…)`);
  if (!fs.existsSync(sheet.indexPath)) fail("index.json sidecar missing");
  pass("index.json sidecar present (beat labels live here, not burned into the PNG)");

  // ── 2) both-ends gate: THROW pre-ack → record → PASS → 1-byte mutate → THROW (stale) ──────────
  console.log("\n[gate] fail-closed both-ends:");
  const ackOpts = { ackRoot, reviewRoot };
  expectThrow(() => requireEyeballAck(videoPath, ackOpts), "requireEyeballAck pre-ack");
  recordEyeballAck(videoPath, ackOpts);
  expectNoThrow(() => requireEyeballAck(videoPath, ackOpts), "requireEyeballAck post-ack (exact bytes)");

  // mutate one byte → new sha → stale ack → BLOCK
  const buf = fs.readFileSync(videoPath);
  buf[Math.floor(buf.length / 2)] ^= 0xff;
  fs.writeFileSync(videoPath, buf);
  expectThrow(() => requireEyeballAck(videoPath, ackOpts), "requireEyeballAck after 1-byte mutation (stale)");

  // ── 3) forged-ack bypass: an ack file for a DIFFERENT sha must NOT satisfy the gate ───────────
  console.log("\n[bypass] forged ack for a different sha must still BLOCK:");
  // The mutated video now has a fresh sha with no ack; write a bogus ack for some OTHER sha.
  const otherSha = "0".repeat(64);
  fs.writeFileSync(
    ackPath(otherSha, ackOpts),
    JSON.stringify({ artifactPath: videoPath, sha: otherSha, ackedAt: new Date().toISOString(), sheetManifestPath: sheet.manifestPath }) + "\n",
  );
  expectThrow(() => requireEyeballAck(videoPath, ackOpts), "requireEyeballAck with only a different-sha ack");

  // cleanup
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log("\n#867 EYEBALL-GATE SMOKE: PASS — real extraction + fail-closed both-ends + red-flags proven (NO paid call, NO publish).");
  process.exit(0);
}

main().catch((err) => {
  console.error("#867 eyeball-gate smoke FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
