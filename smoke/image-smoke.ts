/**
 * REAL render smoke for the image adapter — drives headless Chromium to produce an actual PNG.
 *
 * Asserts the file exists, is a valid non-empty PNG, and has the exact card dimensions
 * (read from the PNG IHDR header). Exits non-zero on any failure.
 *
 * Run: `npm run smoke:image`
 */

import * as fs from "fs";
import { renderImage } from "../adapters/image";
import { CONFIG } from "../config";
import { type ContentSpec } from "../inputs/contentspec";
import { type CopyResult } from "../pipeline/run";

const spec: ContentSpec = {
  product: { name: "lfah", summary: "a test-driven app builder", repoUrl: "https://github.com/example/lfah" },
  facts: [
    { label: "bugs evaluated", value: "74", source: "PHASE-B-VERDICT" },
    { label: "resolved rate", value: "83.8%", source: "PHASE-B-VERDICT" },
    { label: "lift over 1-shot", value: "+9.5pp", source: "PHASE-B-VERDICT" },
  ],
  highlights: ["test-first"],
  ctas: ["check out the repo"],
  sourceFiles: ["PHASE-B-VERDICT"],
};

const copy: CopyResult = {
  thread: ["lfah ships test-first."],
  script: "lfah resolved 83.8% of 74 bugs.",
  labels: ["83.8% resolved", "74 bugs"],
};

/** Read width/height from a PNG's IHDR (bytes 16..24, big-endian uint32). */
function pngDims(buf: Buffer): { width: number; height: number } {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function main() {
  const aspect = "1:1" as const;
  const expect = CONFIG.aspects[aspect];

  console.log("→ rendering the result card to a real PNG via headless Chromium…");
  const outPath = await renderImage({ spec, copy }, { aspect });

  if (!fs.existsSync(outPath)) {
    console.error(`SMOKE FAIL: no file at ${outPath}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(outPath);
  if (buf.length < 1000) {
    console.error(`SMOKE FAIL: PNG suspiciously small (${buf.length} bytes)`);
    process.exit(1);
  }
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) {
    console.error("SMOKE FAIL: not a valid PNG (bad magic bytes)");
    process.exit(1);
  }
  const dims = pngDims(buf);
  if (dims.width !== expect.width || dims.height !== expect.height) {
    console.error(
      `SMOKE FAIL: dimensions ${dims.width}x${dims.height} != expected ${expect.width}x${expect.height}`,
    );
    process.exit(1);
  }

  console.log(`SMOKE-PATH: renderer=playwright-chromium file=${outPath}`);
  console.log(`  valid PNG, ${dims.width}x${dims.height}, ${(buf.length / 1024).toFixed(1)} KB`);
  console.log("\nSMOKE PASS: real PNG card rendered at the correct dimensions.");
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
