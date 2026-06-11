/**
 * Post #3 "forge-harness" CARD-OVER-ART generator.
 *
 * The Post #2 twin (`smoke/launch-card-post2.ts`) for forge-harness. Produces three X-aspect
 * card-over-art infographics (1:1, 1080x1080):
 *   out/review/lfah/image/card-post3-A.png   (ONLY 1 OF 8 COSTS TOKENS — the receipt)
 *   out/review/lfah/image/card-post3-B.png   (VERDICTS YOU CAN TRUST — determinism)
 *   out/review/lfah/image/card-post3-C.png   (8 COMPOSABLE PRIMITIVES — the CTA)
 *
 * The card WORDS come VERBATIM from the reviewed copy `out/copy/forge-harness-post3-content.json`
 * → `card_labels` (number-verified); this smoke MUST NOT invent or alter any of them. Each verbatim
 * line is split losslessly into a small `prefix` + a big `value` (prefix + " " + value === source).
 *
 * SHARED ART (the whole point — feedback_demo_video_must_bind_shared_art_background_not_silent_solid):
 * this smoke generates the ONE unique nano-banana art base ONCE (PAID), at slug
 * `forge-harness-post3` → `_art-base-forge-harness-post3.png`, and that SAME file is reused behind all
 * three cards AND (later) fed to the demo VIDEO background. PER-POST UNIQUE ART (#802/#803): the cache
 * key is post-scoped and the committed art-registry guard asserts the hash is distinct from post1/post2.
 *
 * Run: `npx tsx smoke/launch-card-post3.ts`        (SAFE — reuses post-3 cached art / placeholder)
 *      `LAUNCH_CARD_PAID=1 npx tsx smoke/launch-card-post3.ts`   (PAID — ONE fresh nano-banana gen)
 *        Key from $GEMINI_API_KEY or macOS Keychain (service "GEMINI_API_KEY").
 */

import * as fs from "fs";
import * as path from "path";

import { renderImage } from "../adapters/image";
import { CONFIG, type AspectRatio } from "../config";
import { buildCardHtml, selectFacts } from "../image/card";
import { type ContentSpec, type Fact } from "../inputs/contentspec";
import { type CopyResult } from "../pipeline/run";
import { forgeHarnessSpec, FORGE_REPO_URL, FORGE_CONTENT_SRC } from "../inputs/forgeHarnessSpec";
import {
  artBasePngPath,
  generateArtOnce,
  type GenerateArtOnceOpts,
} from "./launch-card";
import {
  assertArtUnique,
  loadRegistry,
  registerArt,
  saveRegistry,
  sha256File,
} from "./art-registry";

const PAID = process.env.LAUNCH_CARD_PAID === "1";

/** Post #3's stable slug — the post-scoped art cache key + registry key. */
const POST3_SLUG = "forge-harness-post3";

/**
 * Post #3's OWN art-theme prompt (#802). Appended to the brand-safe base prompt so the gen is
 * DISTINCT from Post #1's (data/benchmark chart) and Post #2's (red→green build loop). Forge /
 * composable-blocks / harness vibe — abstract/tech, brand-clean, NO employer brand, NO text/logos.
 */
const POST3_PROMPT_EXTRA =
  "Evoke a FORGE and a foreman's scaffold: modular glowing blocks/cubes snapping together into a " +
  "framework lattice, ONE block lit far brighter than the rest (a single spark of intelligence among " +
  "deterministic machinery), a steel build-rig / harness structure, drifting forge embers. Warm " +
  "amber-ember and molten-orange highlights threading through cool steel-blue and deep navy — distinct " +
  "in palette and motif from a data chart or a red-to-green test bar.";

const POST3_ART_OPTS: GenerateArtOnceOpts = {
  postSlug: POST3_SLUG,
  promptExtra: POST3_PROMPT_EXTRA,
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function isPng(buf: Buffer): boolean {
  return buf.length > 8 && buf.subarray(0, 8).equals(PNG_MAGIC);
}

/** A verbatim card_labels line, pre-split into a small prefix + a big value (lossless). */
interface Post3Line {
  prefix: string;
  value: string;
}
interface Post3Card {
  id: "A" | "B" | "C";
  /** card_labels key in the copy JSON. */
  sourceKey: string;
  /** Short human header (the card summary line). */
  title: string;
  lines: Post3Line[];
}

/**
 * The SOURCE-OF-TRUTH lines, VERBATIM from card_labels. Kept inline as the rendered text AND
 * re-checked against the copy JSON at runtime (assertVerbatim) so any drift fails loudly.
 */
export const POST3_CARDS: Post3Card[] = [
  {
    id: "A",
    sourceKey: "A_only_1_of_8_costs_tokens",
    title: "Only 1 of 8 costs tokens",
    lines: [
      { prefix: "ONLY 1 OF 8", value: "COSTS TOKENS" },
      { prefix: "16 tool calls ·", value: "2 paid · 14 free" },
      { prefix: "$0.80 for the", value: "whole plan" },
      { prefix: "~$0.20", value: "per story so far" },
    ],
  },
  {
    id: "B",
    sourceKey: "B_verdicts_you_can_trust",
    title: "Verdicts you can trust",
    lines: [
      { prefix: "VERDICTS YOU", value: "CAN TRUST" },
      { prefix: "forge_evaluate runs", value: "YOUR commands" },
      { prefix: "test passes →", value: "story passes" },
      { prefix: "no LLM grading ·", value: "same in, same out" },
    ],
  },
  {
    id: "C",
    sourceKey: "C_8_composable_primitives",
    title: "8 composable primitives",
    lines: [
      { prefix: "8 COMPOSABLE", value: "PRIMITIVES" },
      { prefix: "use one, or", value: "snap them together" },
      { prefix: "your agent does", value: "the real work" },
      { prefix: "MIT · public ·", value: "feedback welcome" },
    ],
  },
];

/** Reconstruct the full source line a `Post3Line` encodes (lossless: prefix + " " + value). */
export function sourceLine(line: Post3Line): string {
  return `${line.prefix} ${line.value}`;
}

/** Read card_labels keyed A/B/C from the reviewed copy JSON. */
function readSourceLabels(): Record<"A" | "B" | "C", string[]> {
  const p = path.join(process.cwd(), FORGE_CONTENT_SRC);
  if (!fs.existsSync(p)) {
    throw new Error(`SMOKE FAIL: reviewed copy not found at ${FORGE_CONTENT_SRC} — cannot verify card_labels.`);
  }
  const cl = JSON.parse(fs.readFileSync(p, "utf8")).card_labels;
  return {
    A: cl.A_only_1_of_8_costs_tokens,
    B: cl.B_verdicts_you_can_trust,
    C: cl.C_8_composable_primitives,
  };
}

/** Assert each card's inline lines reproduce the reviewed source-of-truth card_labels VERBATIM. */
export function assertVerbatim(): void {
  const src = readSourceLabels();
  for (const card of POST3_CARDS) {
    const want = src[card.id];
    const got = card.lines.map(sourceLine);
    if (got.length !== want.length) {
      throw new Error(`SMOKE FAIL: card-post3-${card.id} has ${got.length} lines but source has ${want.length}.`);
    }
    for (let i = 0; i < want.length; i++) {
      if (got[i] !== want[i]) {
        throw new Error(
          `SMOKE FAIL: card-post3-${card.id} line ${i + 1} not verbatim.\n` +
            `  source: ${JSON.stringify(want[i])}\n  card  : ${JSON.stringify(got[i])}`,
        );
      }
    }
  }
}

function post3CardSpec(card: Post3Card): ContentSpec {
  const facts: Fact[] = card.lines.map((line) => ({
    label: line.prefix,
    value: line.value,
    source: FORGE_CONTENT_SRC,
  }));
  return {
    product: { name: "forge-harness", summary: card.title, repoUrl: FORGE_REPO_URL },
    facts,
    highlights: [],
    ctas: ["Try it → github.com/ziyilam3999/forge-harness"],
    sourceFiles: [FORGE_CONTENT_SRC],
  };
}

function copyFor(spec: ContentSpec): CopyResult {
  return {
    thread: spec.highlights.slice(),
    script: spec.product.summary,
    labels: spec.facts.slice(0, 3).map((f) => `${f.label} ${f.value}`),
  };
}

async function renderPost3Card(
  card: Post3Card,
  aspect: AspectRatio,
  outDir: string,
  artDataUri: string,
): Promise<{ outPath: string; bytes: number; fitScale: number }> {
  const spec = post3CardSpec(card);
  const fileName = `card-post3-${card.id}.png`;

  // Verbatim DOM check: buildCardHtml is what renderImage renders.
  const html = buildCardHtml(spec, CONFIG.aspects[aspect], { maxFacts: card.lines.length });
  for (const line of card.lines) {
    if (!html.includes(line.prefix) || !html.includes(line.value)) {
      throw new Error(`SMOKE FAIL: card-post3-${card.id} rendered HTML missing verbatim text "${sourceLine(line)}".`);
    }
  }

  let fitScale = 1;
  const outPath = await renderImage(
    { spec, copy: copyFor(spec) },
    {
      generative: true,
      aspect,
      outDir,
      fileName,
      maxFacts: card.lines.length,
      genartDeps: { caller: async () => artDataUri }, // fan the single shared art out
      onFit: (s) => {
        fitScale = s;
      },
    },
  );

  const buf = fs.readFileSync(outPath);
  if (!isPng(buf)) throw new Error(`SMOKE FAIL: ${fileName} is not a valid PNG`);
  const dims = CONFIG.aspects[aspect];
  const got = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (got.width !== dims.width || got.height !== dims.height) {
    throw new Error(`SMOKE FAIL: ${fileName} dims ${got.width}x${got.height} != ${dims.width}x${dims.height}`);
  }
  if (buf.length < 5 * 1024) {
    throw new Error(`SMOKE FAIL: ${fileName} suspiciously small (${buf.length} bytes, want >5KB).`);
  }
  return { outPath, bytes: buf.length, fitScale };
}

async function main(): Promise<void> {
  assertVerbatim();

  const outDir = path.join(process.cwd(), "out", "review", "lfah", "image");
  fs.mkdirSync(outDir, { recursive: true });

  console.log(
    `→ Post #3 'forge-harness' card SET (${
      PAID
        ? "PAID — ONE fresh nano-banana gen for post #3"
        : "SAFE — reuses post-3 cached art / placeholder, ZERO paid spend"
    })`,
  );

  // ONE shared background reused behind all three cards of THIS post + (later) the demo video bg.
  // POST-SCOPED cache key (postSlug="forge-harness-post3") → its OWN `_art-base-forge-harness-post3.png`.
  const artDataUri = await generateArtOnce(forgeHarnessSpec(), PAID, outDir, POST3_ART_OPTS);

  // CROSS-POST UNIQUENESS GUARD (#802). Hash the post-scoped art file and assert it is NOT post1/post2.
  const artPng = artBasePngPath(outDir, POST3_SLUG);
  let post3Sha: string | undefined;
  let usedPath: string;
  if (fs.existsSync(artPng)) {
    post3Sha = sha256File(artPng);
    const registry = loadRegistry();
    assertArtUnique(POST3_SLUG, post3Sha, registry); // throws if post3 would ship another post's art
    saveRegistry(registerArt(POST3_SLUG, post3Sha, registry));
    usedPath = "nano-banana";
    console.log(`  art-file=${artPng}`);
    console.log(`  art-sha256(forge-harness-post3)=${post3Sha}`);
    console.log(`  cross-post uniqueness: PASS — post3 art ≠ any other post's; registered.`);
  } else {
    usedPath = "placeholder";
  }

  // PAID-PATH PROOF (#803, feedback_smoke_prove_primary_not_fallback).
  if (PAID && usedPath !== "nano-banana") {
    throw new Error(
      `SMOKE FAIL: LAUNCH_CARD_PAID=1 but the real nano-banana art was not produced (no ${artPng}). ` +
        `The paid primary path did not run — refusing to report a false paid pass.`,
    );
  }

  const written: { name: string; outPath: string; bytes: number }[] = [];
  for (const card of POST3_CARDS) {
    const spec = post3CardSpec(card);
    const fed = selectFacts(spec, card.lines.length);
    if (fed.length !== card.lines.length) {
      throw new Error(`SMOKE FAIL: card-post3-${card.id} selectFacts kept ${fed.length}/${card.lines.length} tiles.`);
    }
    const { outPath, bytes, fitScale } = await renderPost3Card(card, "1:1", outDir, artDataUri);
    written.push({ name: `card-post3-${card.id}.png`, outPath, bytes });
    console.log(`  1:1 card-post3-${card.id}.png ("${card.title}"): ${(bytes / 1024).toFixed(1)} KB → ${outPath}`);
    console.log(`  card-post3-${card.id} fit: ${card.lines.length}/${card.lines.length} tiles within frame, scale=${fitScale.toFixed(3)}`);
  }

  console.log(
    `\nART-PATH: primary="nano-banana" used="${usedPath}" paid=${PAID ? "true" : "false"}` +
      (post3Sha ? ` sha256="${post3Sha}"` : ""),
  );
  console.log(`SMOKE-PATH: primary="nano-banana" used="${usedPath}" clean=true`);
  for (const w of written) console.log(`ARTIFACT: ${w.outPath} (${w.bytes} bytes)`);
  console.log(
    PAID
      ? `\nSMOKE PASS (PAID): ${written.length} Post-#3 forge-harness cards composed with verbatim card_labels ` +
          `over ONE fresh nano-banana art (post-scoped, ≠ post1/post2); registered unique.`
      : `\nSMOKE PASS (SAFE): ${written.length} Post-#3 forge-harness cards composed with verbatim card_labels ` +
          `over the post-3 cached art / placeholder; no paid call.`,
  );
}

function isEntrypoint(): boolean {
  const entry = process.argv[1] ?? "";
  return /(^|\/)launch-card-post3\.ts$/.test(entry) || entry.endsWith("launch-card-post3");
}

if (isEntrypoint()) {
  main().catch((err) => {
    console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
