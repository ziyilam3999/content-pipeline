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
 * for once — `generateArtOnce(..., paid=false, ...)` reuses `out/review/lfah/image/_art-base.png`
 * (free, no model call) when present, else a deterministic 1x1 placeholder. This smoke NEVER takes
 * the paid path. Point LAUNCH_CARD_ART_CACHE at the cached PNG when running from a worktree whose
 * own `out/` is empty (the cache lives in the primary clone under the gitignored out/ tree).
 *
 * Run: `npm run smoke:launch-card-post2`
 *   (SAFE — no paid call; reuses cached art if present, else deterministic placeholder.)
 */

import * as fs from "fs";
import * as path from "path";

import { renderImage } from "../adapters/image";
import { CONFIG, type AspectRatio } from "../config";
import { buildCardHtml, selectFacts } from "../image/card";
import { type ContentSpec, type Fact } from "../inputs/contentspec";
import { type CopyResult } from "../pipeline/run";
import { generateArtOnce } from "./launch-card";
import { lfahSpec } from "./lfahSpec";

const PAID_GUARD = process.env.LAUNCH_CARD_PAID === "1";

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
  // Defensive: this smoke is the FREE path by contract. If someone exports LAUNCH_CARD_PAID=1
  // they want the paid Post-1 smoke, not this one — refuse rather than make a surprise paid call.
  if (PAID_GUARD) {
    throw new Error(
      "SMOKE FAIL: launch-card-post2 is the FREE card smoke (reuses cached art). " +
        "LAUNCH_CARD_PAID=1 is not supported here — use smoke:launch-card:paid to regen the art.",
    );
  }

  assertVerbatim();

  const outDir = path.join(process.cwd(), "out", "review", "lfah", "image");
  fs.mkdirSync(outDir, { recursive: true });

  console.log("→ Post #2 'lfah is a BUILDER' card SET (SAFE — reuses cached art, ZERO paid spend)");

  // ONE shared background reused behind all three cards: cached real art (free) when present, else
  // a deterministic placeholder. paid=false ALWAYS — this smoke never makes a model call.
  const artDataUri = await generateArtOnce(lfahSpec(), false, outDir);

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

  console.log(`\nSMOKE-PATH: primary="nano-banana" used="cached-or-placeholder" clean=true`);
  for (const w of written) console.log(`ARTIFACT: ${w.outPath} (${w.bytes} bytes)`);
  console.log(
    `\nSMOKE PASS (SAFE): ${written.length} Post-#2 builder info-cards composed with verbatim ` +
      `card_labels over the cached art; no paid call.`,
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
