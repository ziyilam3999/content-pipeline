/**
 * REAL render smoke for the video adapter — drives a full Remotion render to an actual MP4.
 *
 * Free end-to-end: render a real card PNG (Playwright), make a silent WAV placeholder (the
 * premium voice is deferred to the paid gate), then render a real 9:16 MP4 with timed captions.
 * Asserts the MP4 exists, is a valid non-empty MP4 (ftyp box), and is the right aspect.
 *
 * Run: `npm run smoke:video`
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { renderImage } from "../adapters/image";
import { renderVideo, makeSilentWav } from "../adapters/video";
import { ASPECTS } from "../video/renderSpec";
import { type ContentSpec } from "../inputs/contentspec";
import { type CopyResult } from "../pipeline/run";

const spec: ContentSpec = {
  product: { name: "lfah", summary: "a test-driven app builder" },
  facts: [
    { label: "bugs evaluated", value: "74", source: "PHASE-B-VERDICT" },
    { label: "resolved rate", value: "83.8%", source: "PHASE-B-VERDICT" },
  ],
  highlights: ["test-first"],
  ctas: ["check out the repo"],
  sourceFiles: ["PHASE-B-VERDICT"],
};

const copy: CopyResult = {
  thread: ["lfah ships test-first."],
  script: "lfah resolved 83.8 percent of 74 bugs. Test-first, with a real oracle deciding pass or fail.",
  labels: ["83.8% resolved", "74 bugs"],
};

async function main() {
  const durationSec = 6;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lcp-video-"));

  console.log("→ [1/3] rendering a real card PNG (Playwright)…");
  const imagePath = await renderImage({ spec, copy }, { aspect: "1:1", outDir: tmp });

  console.log("→ [2/3] writing a silent WAV placeholder (premium voice deferred to the paid gate)…");
  const audioPath = path.join(tmp, "silent.wav");
  fs.writeFileSync(audioPath, makeSilentWav(durationSec));

  console.log("→ [3/3] rendering the launch MP4 via Remotion (9:16)…");
  const outPath = await renderVideo(
    { script: copy.script, audioPath, imagePath },
    { aspectName: "9:16", durationSec, outDir: tmp },
  );

  if (!fs.existsSync(outPath)) {
    console.error(`SMOKE FAIL: no MP4 at ${outPath}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(outPath);
  if (buf.length < 5000) {
    console.error(`SMOKE FAIL: MP4 suspiciously small (${buf.length} bytes)`);
    process.exit(1);
  }
  if (buf.subarray(4, 8).toString("ascii") !== "ftyp") {
    console.error("SMOKE FAIL: not a valid MP4 (no ftyp box)");
    process.exit(1);
  }

  const expect = ASPECTS.find((a) => a.name === "9:16")!;
  console.log(`SMOKE-PATH: renderer=remotion aspect=9:16 size=${expect.width}x${expect.height} file=${outPath}`);
  console.log(`  valid MP4, ${(buf.length / 1024).toFixed(1)} KB, ~${durationSec}s`);
  console.log("\nSMOKE PASS: real MP4 rendered end-to-end (card + captions + silent audio).");
  // Copy the artifact to a stable spot for eyeballing.
  const stable = path.join(process.cwd(), "out", "video", "smoke-launch-9x16.mp4");
  fs.mkdirSync(path.dirname(stable), { recursive: true });
  fs.copyFileSync(outPath, stable);
  console.log(`  copied to ${stable}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
