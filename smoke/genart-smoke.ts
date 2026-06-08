/**
 * REAL-key smoke for the nano-banana generative-art adapter — exercises the actual PAID
 * Gemini 2.5 Flash Image model ("nano banana").
 *
 * Proves the PRIMARY path (real nano-banana), never silently passes on the code-drawn gradient
 * (feedback_smoke_prove_primary_not_fallback): `generateArt` throws on a failed generation, and
 * this smoke asserts the returned data URI is a real, non-trivial image. Produces TWO artifacts so
 * the operator can compare: the BARE art, and the result-card composited over that art.
 *
 * This SPENDS real Gemini credits (a few cents per image).
 *
 * Run: `npm run smoke:genart`
 *   Requires the key in $GEMINI_API_KEY or the macOS Keychain (service "GEMINI_API_KEY",
 *   overridable via $GEMINI_KEYCHAIN_SERVICE).
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { generateArt } from "../adapters/genart";
import { renderImage } from "../adapters/image";
import { type ContentSpec } from "../inputs/contentspec";
import { type CopyResult } from "../pipeline/run";

const spec: ContentSpec = {
  product: {
    name: "lfah",
    summary: "a test-driven app builder that turns a failing test green",
  },
  facts: [
    { label: "bugs evaluated", value: "74", source: "PHASE-B-VERDICT" },
    { label: "resolved rate", value: "83.8%", source: "PHASE-B-VERDICT" },
  ],
  highlights: ["test-first", "real test oracle"],
  ctas: ["check out the repo"],
  sourceFiles: ["PHASE-B-VERDICT"],
};
const copy: CopyResult = { thread: ["lfah ships test-first."], script: "s", labels: ["83.8%"] };

function isPng(buf: Buffer): boolean {
  return buf.length > 8 && buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
}

async function main() {
  const stableDir = path.join(process.cwd(), "out", "image");
  fs.mkdirSync(stableDir, { recursive: true });

  console.log("→ [1/2] generating REAL creative art via nano-banana (PAID Gemini 2.5 Flash Image)…");
  const art = await generateArt(spec);
  console.log(art.pathLine);

  const artBuf = Buffer.from(art.dataUri.slice(art.dataUri.indexOf(",") + 1), "base64");
  if (artBuf.length < 5000) {
    console.error(`SMOKE FAIL: art suspiciously small (${artBuf.length} bytes)`);
    process.exit(1);
  }
  const bareOut = path.join(stableDir, "smoke-genart-bare.png");
  fs.writeFileSync(bareOut, artBuf);
  console.log(`  bare art: ${(artBuf.length / 1024).toFixed(1)} KB → ${bareOut}`);

  console.log("→ [2/2] compositing the result-card over the nano-banana background (Playwright)…");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lcp-genart-"));
  const cardPath = await renderImage(
    { spec, copy },
    { generative: true, aspect: "1:1", outDir: tmp, genartDeps: { caller: async () => art.dataUri } },
  );
  const cardBuf = fs.readFileSync(cardPath);
  if (!isPng(cardBuf)) {
    console.error("SMOKE FAIL: composited card is not a valid PNG");
    process.exit(1);
  }
  const cardOut = path.join(stableDir, "smoke-genart-card-1x1.png");
  fs.copyFileSync(cardPath, cardOut);
  console.log(`  composited card: ${(cardBuf.length / 1024).toFixed(1)} KB → ${cardOut}`);

  console.log("\nSMOKE PASS: real nano-banana art generated and composited into a result card.");
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
