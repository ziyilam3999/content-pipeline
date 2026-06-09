/**
 * #743 — demo-video smoke (FREE, no API calls).
 *
 * Renders the ANIMATED product-demo MP4 (composition id="demo") from the real
 * lfah numbers, silent (no voiceover → no paid call), and asserts a real,
 * non-empty MP4 was written. Saves it to out/review/lfah/demo for the operator
 * to watch and request creative iteration.
 *
 * Run: `npm run smoke:demo`
 */

import * as fs from "fs";
import * as path from "path";

import { renderDemoVideo } from "../adapters/video";
import { lfahSpec } from "./lfahSpec";

async function main() {
  const reviewDir = path.join(process.cwd(), "out", "review", "lfah", "demo");
  fs.mkdirSync(reviewDir, { recursive: true });

  const durationSec = Number(process.env.DEMO_DURATION_SEC ?? "18");

  console.log(`\n=== #743 demo-video smoke — animated lfah product demo (${durationSec}s, silent/free) ===\n`);
  const t0 = Date.now();
  const outPath = await renderDemoVideo(lfahSpec(), {
    durationSec,
    outDir: reviewDir,
    fileName: "demo-9x16.mp4",
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  const bytes = fs.statSync(outPath).size;
  if (bytes <= 0) {
    console.error("SMOKE FAIL: demo MP4 is empty.");
    process.exit(1);
  }

  console.log(`DEMO-PATH: file="${outPath}" bytes=${bytes} dur=${durationSec}s render=${secs}s`);
  console.log("\nSMOKE PASS: animated demo MP4 rendered.");
  console.log(`  video : ${outPath}`);
  console.log("\nWatch it and tell me what to change — Phase D / #744 will add the real voiceover.");
  process.exit(0);
}

main().catch((err) => {
  console.error("DEMO SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
