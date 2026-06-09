/**
 * Launch CARD-OVER-ART generator (#787) — the lfah launch promo hero still.
 *
 * Produces the launch promo image as a CARD-OVER-ART composite (a real nano-banana generative
 * background with the result-card overlaid) in TWO aspects, from the LOCKED n=13 facts in
 * `lfahSpec()`:
 *   out/review/lfah/image/card-over-art-1x1.png   (1080x1080)
 *   out/review/lfah/image/card-over-art-4x5.png   (1080x1350)
 *
 * Reuses the EXISTING generative-card path verbatim (renderImage({generative:true}) over
 * adapters/genart.ts) — no new generator. The card text is spec-driven, so it carries the n=13
 * numbers (13 / 54% / 62% / 77% / $15.7 / $35.0 / 55%), never the retired 74-/27-bug figures.
 *
 * SAFE BY DEFAULT (CI / no spend): renders the card over a DETERMINISTIC 1x1 placeholder art via
 * an injected caller — proves the composition path, spends nothing, asserts the n=13 facts feed
 * the renderer. The PAID path (real nano-banana) is gated behind LAUNCH_CARD_PAID=1, mirroring the
 * house *_PAID convention (smoke:demo-narrated:paid). The paid path makes EXACTLY ONE nano-banana
 * gen and reuses that single art for BOTH aspects (one paid call, two composites).
 *
 * PRIMARY-ONLY: a failed real gen throws (genart has no silent gradient fallback by design) — the
 * real error surfaces; the GEMINI key is never printed or logged.
 *
 * Run: `npm run smoke:launch-card`        (SAFE — no paid call)
 *      `npm run smoke:launch-card:paid`   (PAID — one real nano-banana gen, ~8-12c for 2 images)
 *        Key from $GEMINI_API_KEY or macOS Keychain (service "GEMINI_API_KEY").
 */

import * as fs from "fs";
import * as path from "path";

import { generateArt, type ArtCaller } from "../adapters/genart";
import { renderImage } from "../adapters/image";
import { CONFIG, type AspectRatio } from "../config";
import { selectFacts } from "../image/card";
import { type CopyResult } from "../pipeline/run";
import { lfahSpec } from "./lfahSpec";

const PAID = process.env.LAUNCH_CARD_PAID === "1";

// Render the full honest n=13 story: all 18 guarded tiles — tasks(13), the 4-way comparison
// (1-shot Opus / 1-shot Sonnet / full-cloud relay / local-first hybrid, each resolved%/total$/
// per-resolved$), the per-role cost split, AND the bottom-line 55% saving. The card's .facts box
// flex-wraps, so a data-dense launch card shows the whole comparison rather than cherry-picking.
const MAX_FACTS = 18;

const ASPECTS: AspectRatio[] = ["1:1", "4:5"];

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A tiny VALID 1x1 PNG data URI — used ONLY in SAFE mode so no paid call is made. */
const PLACEHOLDER_ART_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Facts that MUST appear in the spec-fed tile set for the card to be the LOCKED n=13 card. */
const REQUIRED_FACT_VALUES = ["13", "54%", "62%", "77%", "$15.7", "$35.0", "55%"];

function isPng(buf: Buffer): boolean {
  return buf.length > 8 && buf.subarray(0, 8).equals(PNG_MAGIC);
}

/**
 * Assert the n=13 facts actually reach the renderer (defense against shipping a stale-number
 * card). selectFacts is the exact selector buildCardHtml uses, so checking it proves the rendered
 * card's tiles carry the locked figures.
 */
function assertN13FactsFed(): void {
  const spec = lfahSpec();
  const fed = selectFacts(spec, MAX_FACTS);
  const fedValues = fed.map((f) => f.value);
  const fedGuards = fed.map((f) => f.scopeGuard ?? "");
  const missing = REQUIRED_FACT_VALUES.filter(
    (want) => !fedValues.includes(want) && !fedGuards.some((g) => g.includes(want)),
  );
  if (missing.length > 0) {
    throw new Error(
      `SMOKE FAIL: the n=13 launch facts are not all fed to the card. Missing: ${missing.join(", ")}. ` +
        `Fed values: ${fedValues.join(" | ")}`,
    );
  }
  // Guard against the retired figures sneaking back in.
  const stale = ["74", "27"].filter((s) => fedValues.includes(s));
  if (stale.length > 0) {
    throw new Error(`SMOKE FAIL: retired figure(s) ${stale.join(", ")} present — must be n=13 only.`);
  }
  console.log(`  n=13 facts verified fed to card: ${REQUIRED_FACT_VALUES.join(", ")}`);
}

async function main(): Promise<void> {
  const spec = lfahSpec();
  const copy: CopyResult = {
    thread: spec.highlights.slice(),
    script: spec.product.summary,
    labels: spec.facts.slice(0, 3).map((f) => `${f.label} ${f.value}`),
  };

  const outDir = path.join(process.cwd(), "out", "review", "lfah", "image");
  fs.mkdirSync(outDir, { recursive: true });

  console.log(
    `→ launch card-over-art (${PAID ? "PAID — real nano-banana" : "SAFE — deterministic placeholder art"})`,
  );
  assertN13FactsFed();

  // ONE generative source for BOTH aspects → at most ONE paid call.
  let artDataUri: string;
  if (PAID) {
    console.log("→ generating ONE real creative background via nano-banana (PAID Gemini)…");
    // Generous per-attempt timeout: nano-banana image gen can run well past the 120s default.
    const art = await generateArt(spec, undefined, { timeoutMs: 240_000 }); // primary-only: throws on failure, never a silent gradient
    console.log("  " + art.pathLine);
    artDataUri = art.dataUri;
    const artBytes = Buffer.from(artDataUri.slice(artDataUri.indexOf(",") + 1), "base64").length;
    if (artBytes < 5000) {
      throw new Error(`SMOKE FAIL: nano-banana art suspiciously small (${artBytes} bytes)`);
    }
    console.log(`  art: ${(artBytes / 1024).toFixed(1)} KB (reused for both aspects — single paid call)`);
  } else {
    artDataUri = PLACEHOLDER_ART_DATA_URI;
  }

  // Inject the single art as the caller for every aspect → no further generation.
  const caller: ArtCaller = async () => artDataUri;

  const written: { aspect: AspectRatio; outPath: string; bytes: number }[] = [];
  for (const aspect of ASPECTS) {
    const fileName = `card-over-art-${aspect.replace(":", "x")}.png`;
    const outPath = await renderImage(
      { spec, copy },
      {
        generative: true,
        aspect,
        outDir,
        fileName,
        maxFacts: MAX_FACTS,
        genartDeps: { caller },
      },
    );
    const buf = fs.readFileSync(outPath);
    if (!isPng(buf)) throw new Error(`SMOKE FAIL: ${fileName} is not a valid PNG`);
    // The deliverable PNGs (PAID, real nano-banana art) must be >10KB. In SAFE mode the card sits
    // over a deterministic 1x1 placeholder, so a valid-PNG + correct-dims check is the bar there.
    const minBytes = PAID ? 10 * 1024 : 1024;
    if (buf.length < minBytes) {
      throw new Error(
        `SMOKE FAIL: ${fileName} suspiciously small (${buf.length} bytes, want >${minBytes}).`,
      );
    }
    const dims = CONFIG.aspects[aspect];
    const got = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (got.width !== dims.width || got.height !== dims.height) {
      throw new Error(
        `SMOKE FAIL: ${fileName} dims ${got.width}x${got.height} != ${dims.width}x${dims.height}`,
      );
    }
    written.push({ aspect, outPath, bytes: buf.length });
    console.log(`  ${aspect}: ${got.width}x${got.height}, ${(buf.length / 1024).toFixed(1)} KB → ${outPath}`);
  }

  console.log(`\nSMOKE-PATH: primary="nano-banana" used="${PAID ? "nano-banana" : "placeholder"}" clean=true`);
  for (const w of written) console.log(`ARTIFACT: ${w.outPath} (${w.bytes} bytes)`);
  console.log(
    PAID
      ? "\nSMOKE PASS: real card-over-art launch stills generated (n=13 facts) in 1:1 and 4:5."
      : "\nSMOKE PASS (SAFE): card-over-art composition proven with n=13 facts; set LAUNCH_CARD_PAID=1 for the real art.",
  );
}

main().catch((err) => {
  // Never leak the key: genart's errors are key-free by design; print the message only.
  console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
