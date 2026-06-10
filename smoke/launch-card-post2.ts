/**
 * Post #2 "lfah is a BUILDER" CARD-OVER-ART generator (#800).
 *
 * Post #1 (smoke/launch-card.ts) is the STATS-TABLE shape: n=13 SWE-bench resolve rates as
 * label/value tiles. Post #2 is the BUILDER / dogfood STORY: short prose statements about the
 * agent building this very pipeline test-first. The card WORDS come VERBATIM from the reviewed
 * source of truth `out/copy/lfah-post2-builder-content.json` → `card_labels` — every stat there
 * is number-verified; this smoke MUST NOT invent or alter any of them.
 *
 * It produces three X-aspect card-over-art infographics (1:1, 1080x1080 — the same shape as Post
 * #1's `card-tweet-*.png` thread-body cards):
 *   out/review/lfah/image/card-post2-A.png   (dogfood headline)
 *   out/review/lfah/image/card-post2-B.png   (cost / local split)
 *   out/review/lfah/image/card-post2-C.png   (the how / the loop)
 *
 * NO FORK OF THE CARD COMPOSITION: it reuses the SAME proven machinery — `buildCardHtml`/
 * `selectFacts` (image/card.ts) via `renderImage` (#790 auto-fit + overflow throw) — through the
 * shared `generateArtOnce`/`renderCard` helpers exported by `smoke/launch-card.ts`. Each card is a
 * `ContentSpec` slice whose facts are the four verbatim `card_labels` lines, split into a small
 * `label` prefix + a big `value` suffix (the tile shows label small over value big). The split is
 * lossless: `label + " " + value === <source line>`, asserted per line so the verbatim wording is
 * mechanically gated.
 *
 * SHARED-ART, ZERO SPEND: the background is the SAME cached nano-banana art Post #1 already paid
 * for once. PER-POST UNIQUE ART (#802/#803): Post #2 has its OWN art, NOT Post #1's. The cache key
 * is POST-SCOPED — this smoke uses `postSlug="post2"` so its art lives at `_art-base-post2.png`,
 * distinct from Post #1's `_art-base.png`. The SAFE (free) path reuses `_art-base-post2.png` when
 * present, else a deterministic 1x1 placeholder — and NEVER inherits Post #1's art.
 *
 * PAID PATH (#803 — ONE authorized gen): with LAUNCH_CARD_PAID=1 this smoke makes ONE fresh
 * nano-banana gen using a POST-2 THEME prompt (a builder / test-first / red→green build-loop vibe,
 * brand-clean, no text-in-image) → writes `_art-base-post2.png` → asserts its sha256 ≠ Post #1's via
 * the committed art-registry (smoke/art-registry.ts — fail-loud cross-post guard) → registers it →
 * emits an ART-PATH line proving the REAL paid path ran (HARD-FAILS if it fell back to the
 * placeholder/cache). Point LAUNCH_CARD_ART_CACHE at a PNG to override the cache path entirely.
 *
 * Run: `npm run smoke:launch-card-post2`        (SAFE — no paid call; post-2 cached art or placeholder)
 *      `npm run smoke:launch-card-post2:paid`   (PAID — ONE fresh nano-banana gen for post #2 + cache)
 *        Key from $GEMINI_API_KEY or macOS Keychain (service "GEMINI_API_KEY").
 */

import * as fs from "fs";
import * as path from "path";

import { renderImage } from "../adapters/image";
import { CONFIG, type AspectRatio } from "../config";
import { buildCardHtml, selectFacts } from "../image/card";
import { type ContentSpec, type Fact } from "../inputs/contentspec";
import { type CopyResult } from "../pipeline/run";
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
import { lfahSpec } from "./lfahSpec";

const PAID = process.env.LAUNCH_CARD_PAID === "1";

/** Post #2's stable slug — the post-scoped art cache key + registry key. */
const POST2_SLUG = "post2";

/**
 * Post #2's OWN art-theme prompt (#802). Appended to the brand-safe base prompt so the gen is
 * DISTINCT from Post #1's (Post #1 used the bare lfah summary). Builder / test-first / red→green
 * build-loop vibe — abstract/tech, brand-clean, NO employer brand, NO text/letters/logos.
 */
const POST2_PROMPT_EXTRA =
  "Evoke an autonomous software BUILDER assembling an app test-first: a red-to-green build loop, " +
  "failing tests turning green, modular blocks snapping into place, forward build-momentum. " +
  "Emerald-green and warm-amber energy threading through the deep navy, like a passing test sweeping " +
  "a red bar to green — distinct in palette and motif from a pure data/benchmark chart.";

/** generateArtOnce opts for Post #2 — post-scoped cache key + its own distinct prompt. */
const POST2_ART_OPTS: GenerateArtOnceOpts = {
  postSlug: POST2_SLUG,
  promptExtra: POST2_PROMPT_EXTRA,
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function isPng(buf: Buffer): boolean {
  return buf.length > 8 && buf.subarray(0, 8).equals(PNG_MAGIC);
}

const REPO_URL = "https://github.com/ziyilam3999/local-first-agent-harness";

/**
 * DURABLE source of truth for the verbatim lines. The ORIGINAL authored copy lives in
 * out/copy/lfah-post2-builder-content.json, but out/ is GITIGNORED (runtime-only) so it never
 * reaches CI or a fresh checkout. We commit a fixture carrying the same card_labels (smoke/fixtures)
 * and assert this smoke's inline lines match it; when the live authored file is ALSO present we
 * cross-check the fixture against it too (defense-in-depth — catches fixture↔source drift). Lesson
 * #743/#760: carry the SOURCE data, don't depend on a derived/gitignored slice.
 */
const POST2_FIXTURE = path.join("smoke", "fixtures", "lfah-post2-card-labels.json");
const POST2_AUTHORED = path.join("out", "copy", "lfah-post2-builder-content.json");
const POST2_SRC = POST2_AUTHORED; // labels' Fact.source provenance string

/**
 * One Post-2 card: a short title plus its four VERBATIM `card_labels` lines, each pre-split into a
 * small `label` prefix and a big `value` suffix for the tile. The split is lossless — `prefix` +
 * " " + `value` MUST equal the source line (asserted below), so no wording is ever changed.
 */
interface Post2Line {
  /** Small text shown above the big value (the leading qualifier of the source line). */
  prefix: string;
  /** Big text shown below the prefix (the trailing emphasis of the source line). */
  value: string;
}
interface Post2Card {
  /** Stable id → file name `card-post2-{id}.png`. */
  id: "A" | "B" | "C";
  /** Short card header (shown as the card summary line). */
  title: string;
  /** The four verbatim source lines, pre-split. */
  lines: Post2Line[];
}

/**
 * The SOURCE-OF-TRUTH lines, VERBATIM from out/copy/lfah-post2-builder-content.json → card_labels.
 * Kept inline as the rendered text AND re-checked against the JSON file at runtime (assertVerbatim
 * below) so a drift between this smoke and the reviewed copy fails loudly rather than shipping a
 * silently-edited stat.
 */
export const POST2_CARDS: Post2Card[] = [
  {
    id: "A",
    title: "Built by the agent, test-first",
    lines: [
      { prefix: "13 build phases —", value: "all 13 shipped (100%)" },
      { prefix: "11 phases passed", value: "on the first try" },
      { prefix: "graded by the REAL jest test suite,", value: "never an LLM judge" },
      { prefix: "the pipeline that built this post", value: "built itself" },
    ],
  },
  {
    id: "B",
    title: "Where the money goes",
    lines: [
      { prefix: "$12.56 total cloud spend", value: "for the whole build" },
      { prefix: "~85% of phases solved", value: "by a FREE local model" },
      { prefix: "cloud rescued only", value: "the 2 hardest phases" },
      { prefix: "≈", value: "$0.97 per phase" },
    ],
  },
  {
    id: "C",
    title: "The loop",
    lines: [
      { prefix: "failing test →", value: "local model makes it green" },
      { prefix: "ships only when the test suite", value: "AND an independent check agree" },
      { prefix: "a broken phase", value: "halts the build" },
      { prefix: "same local-first DNA —", value: "now building whole apps" },
    ],
  },
];

/** Reconstruct the full source line a `Post2Line` encodes (lossless: prefix + " " + value). */
export function sourceLine(line: Post2Line): string {
  return `${line.prefix} ${line.value}`;
}

function labelsFrom(jsonPath: string): Record<"A" | "B" | "C", string[]> {
  const cl = JSON.parse(fs.readFileSync(jsonPath, "utf8")).card_labels;
  return { A: cl.A_dogfood_headline, B: cl.B_cost_local_split, C: cl.C_the_how };
}

/**
 * The exact verbatim `card_labels`, keyed A/B/C, read from the committed fixture. When the live
 * authored copy (gitignored out/) is ALSO present, the fixture is cross-checked against it so a
 * drift between the committed fixture and the operator's reviewed source fails loudly.
 */
export function readSourceLabels(repoRoot = process.cwd()): Record<"A" | "B" | "C", string[]> {
  const fixturePath = path.join(repoRoot, POST2_FIXTURE);
  const fixture = labelsFrom(fixturePath);

  const authoredPath = path.join(repoRoot, POST2_AUTHORED);
  if (fs.existsSync(authoredPath)) {
    const authored = labelsFrom(authoredPath);
    for (const key of ["A", "B", "C"] as const) {
      const a = JSON.stringify(authored[key]);
      const f = JSON.stringify(fixture[key]);
      if (a !== f) {
        throw new Error(
          `SMOKE FAIL: committed fixture card_labels[${key}] has DRIFTED from the authored source ` +
            `(${POST2_AUTHORED}). Re-sync ${POST2_FIXTURE}.\n  authored: ${a}\n  fixture : ${f}`,
        );
      }
    }
  }
  return fixture;
}

/**
 * Build the ContentSpec slice for one Post-2 card. Each verbatim line becomes a Fact whose
 * `value` is the big suffix and `label` is the small prefix. No scopeGuard (these are prose
 * statements, not n-scoped stats), so selectFacts keeps them in order.
 */
export function post2CardSpec(card: Post2Card): ContentSpec {
  const facts: Fact[] = card.lines.map((line) => ({
    label: line.prefix,
    value: line.value,
    source: POST2_SRC,
  }));
  return {
    product: { name: "lfah is a BUILDER", summary: card.title, repoUrl: REPO_URL },
    facts,
    highlights: [],
    ctas: ["Try it: pip install git+https://github.com/ziyilam3999/local-first-agent-harness"],
    sourceFiles: [POST2_SRC],
  };
}

/**
 * Assert this smoke's inline lines reproduce the reviewed source-of-truth `card_labels` VERBATIM,
 * line-for-line. A drift (a re-typed stat, a reordered line) fails loudly here, never ships.
 */
export function assertVerbatim(repoRoot = process.cwd()): void {
  const src = readSourceLabels(repoRoot);
  for (const card of POST2_CARDS) {
    const want = src[card.id];
    const got = card.lines.map(sourceLine);
    if (got.length !== want.length) {
      throw new Error(
        `SMOKE FAIL: card-post2-${card.id} has ${got.length} lines but source has ${want.length}.`,
      );
    }
    for (let i = 0; i < want.length; i++) {
      if (got[i] !== want[i]) {
        throw new Error(
          `SMOKE FAIL: card-post2-${card.id} line ${i + 1} not verbatim.\n` +
            `  source: ${JSON.stringify(want[i])}\n  card  : ${JSON.stringify(got[i])}`,
        );
      }
    }
  }
}

function copyFor(spec: ContentSpec): CopyResult {
  return {
    thread: spec.highlights.slice(),
    script: spec.product.summary,
    labels: spec.facts.slice(0, 3).map((f) => `${f.label} ${f.value}`),
  };
}

/**
 * Render one Post-2 card-over-art and verify it: valid PNG, correct dims, non-trivial size, AND
 * the rendered HTML carries all four source lines verbatim (label+value DOM text). Returns the
 * path, byte size, and final auto-fit scale (a clip would have THROWN inside renderImage, #790).
 */
async function renderPost2Card(
  card: Post2Card,
  aspect: AspectRatio,
  outDir: string,
  artDataUri: string,
): Promise<{ outPath: string; bytes: number; fitScale: number }> {
  const spec = post2CardSpec(card);
  const fileName = `card-post2-${card.id}.png`;

  // Verbatim DOM check: buildCardHtml is what renderImage renders, so proving the source lines are
  // present in its output proves the rendered card shows them (numbers + words unaltered).
  const html = buildCardHtml(spec, CONFIG.aspects[aspect], { maxFacts: card.lines.length });
  for (const line of card.lines) {
    if (!html.includes(line.prefix) || !html.includes(line.value)) {
      throw new Error(
        `SMOKE FAIL: card-post2-${card.id} rendered HTML missing verbatim text "${sourceLine(line)}".`,
      );
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
    throw new Error(
      `SMOKE FAIL: ${fileName} dims ${got.width}x${got.height} != ${dims.width}x${dims.height}`,
    );
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
    `→ Post #2 'lfah is a BUILDER' card SET (${
      PAID
        ? "PAID — ONE fresh nano-banana gen for post #2 (#803)"
        : "SAFE — reuses post-2 cached art / placeholder, ZERO paid spend"
    })`,
  );

  // ONE shared background reused behind all three cards of THIS post (#802 per-post sharing).
  // POST-SCOPED cache key (postSlug="post2") → its OWN `_art-base-post2.png`, NEVER post #1's art.
  // PAID=true makes the single #803 authorized nano-banana gen with post #2's distinct theme prompt.
  const artDataUri = await generateArtOnce(lfahSpec(), PAID, outDir, POST2_ART_OPTS);

  // CROSS-POST UNIQUENESS GUARD (#802). The art bytes live at the post-scoped cache file. When that
  // file exists (paid run just wrote it, or a prior post-2 paid run cached it) hash it and assert it
  // is NOT post #1's (or any other post's) art. Fail-loud on a cross-post reuse; register on pass.
  const artPng = artBasePngPath(outDir, POST2_SLUG);
  let post2Sha: string | undefined;
  let usedPath: string;
  if (fs.existsSync(artPng)) {
    post2Sha = sha256File(artPng);
    const registry = loadRegistry();
    assertArtUnique(POST2_SLUG, post2Sha, registry); // throws if post #2 would ship post #1's art
    saveRegistry(registerArt(POST2_SLUG, post2Sha, registry));
    usedPath = "nano-banana";
    console.log(`  art-sha256(post2)=${post2Sha}`);
    console.log(`  cross-post uniqueness: PASS — post2 art ≠ any other post's; registered.`);
  } else {
    // No real art file present (SAFE run with no post-2 cache) → deterministic placeholder path.
    usedPath = "placeholder";
  }

  // PAID-PATH PROOF (#803, feedback_smoke_prove_primary_not_fallback): under a paid invocation the
  // real nano-banana art MUST have been written + hashed. If we fell back to the placeholder, the
  // paid primary did NOT run — HARD-FAIL rather than report a false "paid ✓".
  if (PAID && usedPath !== "nano-banana") {
    throw new Error(
      "SMOKE FAIL: LAUNCH_CARD_PAID=1 but the real nano-banana art was not produced " +
        `(no ${artPng}). The paid primary path did not run — refusing to report a false paid pass.`,
    );
  }

  const written: { name: string; outPath: string; bytes: number }[] = [];

  for (const card of POST2_CARDS) {
    // Confirm the rendered tiles carry exactly the four mapped source lines (selectFacts is the
    // selector buildCardHtml uses — proving it keeps all four proves no tile silently dropped).
    const spec = post2CardSpec(card);
    const fed = selectFacts(spec, card.lines.length);
    if (fed.length !== card.lines.length) {
      throw new Error(
        `SMOKE FAIL: card-post2-${card.id} selectFacts kept ${fed.length}/${card.lines.length} tiles.`,
      );
    }

    const { outPath, bytes, fitScale } = await renderPost2Card(card, "1:1", outDir, artDataUri);
    written.push({ name: `card-post2-${card.id}.png`, outPath, bytes });
    console.log(
      `  1:1 card-post2-${card.id}.png ("${card.title}"): ${(bytes / 1024).toFixed(1)} KB → ${outPath}`,
    );
    // renderImage THREW if any tile clipped (#790), so reaching here means all 4 tiles fit.
    console.log(
      `  card-post2-${card.id} fit: ${card.lines.length}/${card.lines.length} tiles within frame, ` +
        `scale=${fitScale.toFixed(3)}`,
    );
  }

  // ART-PATH proof line (#803): primary=nano-banana, used=<actual>, paid=<bool>. On a paid run
  // usedPath is mechanically forced to nano-banana above (else we already threw).
  console.log(
    `\nART-PATH: primary="nano-banana" used="${usedPath}" paid=${PAID ? "true" : "false"}` +
      (post2Sha ? ` sha256="${post2Sha}"` : ""),
  );
  console.log(`SMOKE-PATH: primary="nano-banana" used="${usedPath}" clean=true`);
  for (const w of written) console.log(`ARTIFACT: ${w.outPath} (${w.bytes} bytes)`);
  console.log(
    PAID
      ? `\nSMOKE PASS (PAID): ${written.length} Post-#2 builder info-cards composed with verbatim ` +
          `card_labels over ONE fresh nano-banana art (post-scoped, ≠ post #1); registered unique.`
      : `\nSMOKE PASS (SAFE): ${written.length} Post-#2 builder info-cards composed with verbatim ` +
          `card_labels over the post-2 cached art / placeholder; no paid call.`,
  );
}

/**
 * Only run the render when this file is the entrypoint — NOT when the unit test imports its
 * exported helpers (post2CardSpec / assertVerbatim / sourceLine). Without this guard, importing
 * the module would fire a Playwright render as a side effect inside jest.
 */
function isEntrypoint(): boolean {
  const entry = process.argv[1] ?? "";
  return /(^|\/)launch-card-post2\.ts$/.test(entry) || entry.endsWith("launch-card-post2");
}

if (isEntrypoint()) {
  main().catch((err) => {
    console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
