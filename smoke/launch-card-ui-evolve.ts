/**
 * Post (#1026) "ui-evolve" CARD-OVER-ART generator.
 *
 * Mirrors smoke/launch-card-post2.ts 1:1 (read that file for the full doctrine). The narrative is
 * the ui-evolve discovery→fix→proof story: I caught my AI design tool's own taste-judge rewarding
 * near-empty pages, rebuilt the judge on a band that peaks in the middle, and proved the fix BLIND.
 * The card WORDS come VERBATIM from the reviewed source of truth `out/copy/ui-evolve-content.json` →
 * `card_labels` — every number there is verified vs ui-evolve/evals/LAYER2-FINDING.md; this smoke
 * MUST NOT invent or alter any of them.
 *
 * It produces three X-aspect card-over-art infographics (1:1, 1080x1080):
 *   out/review/ui-evolve/image/card-ui-evolve-A.png   (the judge rewarded emptiness)
 *   out/review/ui-evolve/image/card-ui-evolve-B.png   (a band you can't game)
 *   out/review/ui-evolve/image/card-ui-evolve-C.png   (proven blind, 6/6)
 *
 * card_labels SHAPE (differs from post2): each A/B/C value is a 4-element array where element[0] is
 * the card HEADER/title (caps) and elements[1..3] are the three stat lines. So this smoke maps
 * element[0]→the card title and elements[1..3]→three pre-split tiles (vs post2 where all four
 * elements were stat lines + a separate hardcoded title).
 *
 * NO FORK OF THE CARD COMPOSITION: it reuses the SAME proven machinery — `buildCardHtml`/`selectFacts`
 * (image/card.ts) via `renderImage` (#790 auto-fit + overflow throw) — through the shared
 * `generateArtOnce`/`renderCard` helpers exported by `smoke/launch-card.ts`. Each card is a
 * `ContentSpec` slice whose facts are the three verbatim `card_labels` stat lines, split into a small
 * `prefix` + a big `value`. The split is lossless: `prefix + " " + value === <source line>`, asserted
 * per line so the verbatim wording is mechanically gated.
 *
 * PER-POST UNIQUE ART (#802/#803): ui-evolve has its OWN art, NEVER another post's. The cache key is
 * POST-SCOPED — `postSlug="ui-evolve"` → `_art-base-ui-evolve.png`. The SAFE (free) path reuses
 * `_art-base-ui-evolve.png` when present, else a deterministic 1x1 placeholder — and NEVER inherits
 * another post's art.
 *
 * PAID PATH (ONE authorized gen): with LAUNCH_CARD_PAID=1 this smoke makes ONE fresh nano-banana gen
 * using ui-evolve's OWN theme prompt (a precision quality GAUGE / scoring BAND peaking in the middle,
 * a blind judge weighing screenshots, a before→after lift; brand-clean, no text-in-image) → writes
 * `_art-base-ui-evolve.png` → asserts its sha256 ≠ any other post's via the committed art-registry →
 * registers it → emits an ART-PATH line (HARD-FAILS if it fell back to the placeholder/cache).
 *
 * Run: `npm run smoke:launch-card-ui-evolve`        (SAFE — no paid call; cached art or placeholder)
 *      `npm run smoke:launch-card-ui-evolve:paid`   (PAID — ONE fresh nano-banana gen + cache)
 *        Key from $GEMINI_API_KEY or macOS Keychain (service "GEMINI_API_KEY").
 */

import * as fs from "fs";
import * as path from "path";

import { renderImage } from "../adapters/image";
import { CONFIG, type AspectRatio } from "../config";
import { buildCardHtml, selectFacts } from "../image/card";
import { type ContentSpec, type Fact } from "../inputs/contentspec";
import { type CopyResult } from "../pipeline/run";
import { uiEvolveSpec, UI_EVOLVE_REPO_URL } from "../inputs/uiEvolveSpec";
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

/** ui-evolve's stable slug — the post-scoped art cache key + registry key (MUST be unique). */
const UI_EVOLVE_SLUG = "ui-evolve";

/**
 * ui-evolve's OWN art-theme prompt. Appended to the brand-safe base prompt so the gen is DISTINCT
 * from every other post's. Abstract/tech, brand-clean, NO text/letters/logos, NO employer brand:
 * a precision QUALITY GAUGE / scoring BAND that peaks in the MIDDLE (a curve cresting at center —
 * not empty, not cluttered), a blind judge weighing rendered screenshots, and a before→after lift
 * from flat to composed. Restrained, editorial, instrument-like. Palette distinct from other posts:
 * cool slate/ink with a single warm signal accent, deep background. Purely abstract.
 */
const UI_EVOLVE_PROMPT_EXTRA =
  "Evoke a precision QUALITY GAUGE — a scoring BAND or measurement curve that CRESTS in the MIDDLE " +
  "(peaks at center, falling off toward both the empty and the cluttered extremes), a blind judge " +
  "weighing rendered screenshots on a balance, and a before→after lift from flat to composed. " +
  "Instrument-like, editorial, restrained — clean dials, calibration ticks, a single bell-shaped " +
  "ridge of light. Cool slate and ink-blue tones over a deep background, with ONE warm signal accent " +
  "(amber/coral) marking the peak — distinct in palette and motif from a busy data/benchmark chart. " +
  "Purely abstract: no text, no letters, no numbers, no logos.";

/** generateArtOnce opts for ui-evolve — post-scoped cache key + its own distinct prompt. */
const UI_EVOLVE_ART_OPTS: GenerateArtOnceOpts = {
  postSlug: UI_EVOLVE_SLUG,
  promptExtra: UI_EVOLVE_PROMPT_EXTRA,
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function isPng(buf: Buffer): boolean {
  return buf.length > 8 && buf.subarray(0, 8).equals(PNG_MAGIC);
}

const REPO_URL = UI_EVOLVE_REPO_URL;

/**
 * DURABLE source of truth for the verbatim lines. The ORIGINAL authored copy lives in
 * out/copy/ui-evolve-content.json, but out/ is GITIGNORED (runtime-only) so it never reaches CI or a
 * fresh checkout. We commit a fixture carrying the same card_labels (smoke/fixtures) and assert this
 * smoke's inline lines match it; when the live authored file is ALSO present we cross-check the
 * fixture against it too (defense-in-depth — catches fixture↔source drift).
 */
const UI_EVOLVE_FIXTURE = path.join("smoke", "fixtures", "ui-evolve-card-labels.json");
const UI_EVOLVE_AUTHORED = path.join("out", "copy", "ui-evolve-content.json");
const UI_EVOLVE_SRC = UI_EVOLVE_AUTHORED; // labels' Fact.source provenance string

/**
 * One ui-evolve card: a caps HEADER (element[0]) plus its three VERBATIM stat lines (elements[1..3]),
 * each pre-split into a small `prefix` and a big `value` for the tile. The split is lossless —
 * `prefix + " " + value` MUST equal the source line (asserted below), so no wording is ever changed.
 */
interface UiEvolveLine {
  /** Small text shown above the big value (the leading qualifier of the source line). */
  prefix: string;
  /** Big text shown below the prefix (the trailing emphasis of the source line). */
  value: string;
}
interface UiEvolveCard {
  /** Stable id → file name `card-ui-evolve-{id}.png`. */
  id: "A" | "B" | "C";
  /** The caps card HEADER — VERBATIM card_labels element[0] (shown as the card summary line). */
  title: string;
  /** The three verbatim stat lines (card_labels elements[1..3]), pre-split. */
  lines: UiEvolveLine[];
}

/**
 * The SOURCE-OF-TRUTH cards, VERBATIM from out/copy/ui-evolve-content.json → card_labels.
 * `title` is element[0]; `lines` are elements[1..3] split losslessly. Kept inline as the rendered
 * text AND re-checked against the JSON file at runtime (assertVerbatim below) so a drift between this
 * smoke and the reviewed copy fails loudly rather than shipping a silently-edited stat.
 */
export const UI_EVOLVE_CARDS: UiEvolveCard[] = [
  {
    id: "A",
    title: "THE JUDGE REWARDED EMPTINESS",
    lines: [
      { prefix: "old judge:", value: "6 legibility rules only" },
      { prefix: "near-empty page scored", value: "87.1" },
      { prefix: "above a clean page at", value: "83.1" },
    ],
  },
  {
    id: "B",
    title: "A BAND YOU CAN'T GAME",
    lines: [
      { prefix: "11 dimensions ·", value: "5 structural" },
      { prefix: "depth · rhythm ·", value: "contrast · distinctiveness" },
      { prefix: "peaks in the middle:", value: "not empty, not cluttered" },
    ],
  },
  {
    id: "C",
    title: "PROVEN BLIND · 6 / 6",
    lines: [
      { prefix: "blind judge,", value: "no labels" },
      { prefix: "generic 4.8 →", value: "redesigns 7.7" },
      { prefix: "same résumé ·", value: "receipts, not vibes" },
    ],
  },
];

/** Reconstruct the full source line a `UiEvolveLine` encodes (lossless: prefix + " " + value). */
export function sourceLine(line: UiEvolveLine): string {
  return `${line.prefix} ${line.value}`;
}

function labelsFrom(jsonPath: string): Record<"A" | "B" | "C", string[]> {
  const cl = JSON.parse(fs.readFileSync(jsonPath, "utf8")).card_labels;
  return {
    A: cl.A_the_judge_rewarded_emptiness,
    B: cl.B_a_band_you_cant_game,
    C: cl.C_proven_blind,
  };
}

/**
 * The exact verbatim `card_labels`, keyed A/B/C, read from the committed fixture. When the live
 * authored copy (gitignored out/) is ALSO present, the fixture is cross-checked against it so a drift
 * between the committed fixture and the operator's reviewed source fails loudly.
 */
export function readSourceLabels(repoRoot = process.cwd()): Record<"A" | "B" | "C", string[]> {
  const fixturePath = path.join(repoRoot, UI_EVOLVE_FIXTURE);
  const fixture = labelsFrom(fixturePath);

  const authoredPath = path.join(repoRoot, UI_EVOLVE_AUTHORED);
  if (fs.existsSync(authoredPath)) {
    const authored = labelsFrom(authoredPath);
    for (const key of ["A", "B", "C"] as const) {
      const a = JSON.stringify(authored[key]);
      const f = JSON.stringify(fixture[key]);
      if (a !== f) {
        throw new Error(
          `SMOKE FAIL: committed fixture card_labels[${key}] has DRIFTED from the authored source ` +
            `(${UI_EVOLVE_AUTHORED}). Re-sync ${UI_EVOLVE_FIXTURE}.\n  authored: ${a}\n  fixture : ${f}`,
        );
      }
    }
  }
  return fixture;
}

/**
 * Build the ContentSpec slice for one ui-evolve card. Each verbatim stat line becomes a Fact whose
 * `value` is the big suffix and `label` is the small prefix. No scopeGuard (these are prose
 * statements, not n-scoped stats), so selectFacts keeps them in order.
 */
export function uiEvolveCardSpec(card: UiEvolveCard): ContentSpec {
  const facts: Fact[] = card.lines.map((line) => ({
    label: line.prefix,
    value: line.value,
    source: UI_EVOLVE_SRC,
  }));
  return {
    product: { name: "ui-evolve", summary: card.title, repoUrl: REPO_URL },
    facts,
    highlights: [],
    ctas: ["Open source, a Claude Code skill — try it → github.com/ziyilam3999/ui-evolve"],
    sourceFiles: [UI_EVOLVE_SRC],
  };
}

/**
 * Assert this smoke's inline cards reproduce the reviewed source-of-truth `card_labels` VERBATIM:
 * the title equals element[0] and the three split stat lines equal elements[1..3], in order. A drift
 * (a re-typed stat, a reordered line, a changed header) fails loudly here, never ships.
 */
export function assertVerbatim(repoRoot = process.cwd()): void {
  const src = readSourceLabels(repoRoot);
  for (const card of UI_EVOLVE_CARDS) {
    const want = src[card.id];
    const wantHeader = want[0];
    const wantLines = want.slice(1);
    if (card.title !== wantHeader) {
      throw new Error(
        `SMOKE FAIL: card-ui-evolve-${card.id} header not verbatim.\n` +
          `  source: ${JSON.stringify(wantHeader)}\n  card  : ${JSON.stringify(card.title)}`,
      );
    }
    const got = card.lines.map(sourceLine);
    if (got.length !== wantLines.length) {
      throw new Error(
        `SMOKE FAIL: card-ui-evolve-${card.id} has ${got.length} stat lines but source has ${wantLines.length}.`,
      );
    }
    for (let i = 0; i < wantLines.length; i++) {
      if (got[i] !== wantLines[i]) {
        throw new Error(
          `SMOKE FAIL: card-ui-evolve-${card.id} stat line ${i + 1} not verbatim.\n` +
            `  source: ${JSON.stringify(wantLines[i])}\n  card  : ${JSON.stringify(got[i])}`,
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
 * Render one ui-evolve card-over-art and verify it: valid PNG, correct dims, non-trivial size, AND
 * the rendered HTML carries all three source stat lines verbatim (label+value DOM text). Returns the
 * path, byte size, and final auto-fit scale (a clip would have THROWN inside renderImage, #790).
 */
async function renderUiEvolveCard(
  card: UiEvolveCard,
  aspect: AspectRatio,
  outDir: string,
  artDataUri: string,
): Promise<{ outPath: string; bytes: number; fitScale: number }> {
  const spec = uiEvolveCardSpec(card);
  const fileName = `card-ui-evolve-${card.id}.png`;

  // Verbatim DOM check: buildCardHtml is what renderImage renders, so proving the source lines are
  // present in its output proves the rendered card shows them (numbers + words unaltered).
  const html = buildCardHtml(spec, CONFIG.aspects[aspect], { maxFacts: card.lines.length });
  for (const line of card.lines) {
    if (!html.includes(line.prefix) || !html.includes(line.value)) {
      throw new Error(
        `SMOKE FAIL: card-ui-evolve-${card.id} rendered HTML missing verbatim text "${sourceLine(line)}".`,
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

  const outDir = path.join(process.cwd(), "out", "review", "ui-evolve", "image");
  fs.mkdirSync(outDir, { recursive: true });

  console.log(
    `→ Post 'ui-evolve' card SET (${
      PAID
        ? "PAID — ONE fresh nano-banana gen for ui-evolve"
        : "SAFE — reuses ui-evolve cached art / placeholder, ZERO paid spend"
    })`,
  );

  // ONE shared background reused behind all three cards of THIS post (#802 per-post sharing).
  // POST-SCOPED cache key (postSlug="ui-evolve") → its OWN `_art-base-ui-evolve.png`, NEVER another
  // post's art. PAID=true makes the single authorized nano-banana gen with ui-evolve's theme prompt.
  const artDataUri = await generateArtOnce(uiEvolveSpec(), PAID, outDir, UI_EVOLVE_ART_OPTS);

  // CROSS-POST UNIQUENESS GUARD (#802). The art bytes live at the post-scoped cache file. When that
  // file exists (paid run just wrote it, or a prior ui-evolve paid run cached it) hash it and assert
  // it is NOT another post's art. Fail-loud on a cross-post reuse; register on pass.
  const artPng = artBasePngPath(outDir, UI_EVOLVE_SLUG);
  let uiEvolveSha: string | undefined;
  let usedPath: string;
  if (fs.existsSync(artPng)) {
    uiEvolveSha = sha256File(artPng);
    const registry = loadRegistry();
    assertArtUnique(UI_EVOLVE_SLUG, uiEvolveSha, registry); // throws if ui-evolve would ship another post's art
    saveRegistry(registerArt(UI_EVOLVE_SLUG, uiEvolveSha, registry));
    usedPath = "nano-banana";
    console.log(`  art-sha256(ui-evolve)=${uiEvolveSha}`);
    console.log(`  cross-post uniqueness: PASS — ui-evolve art ≠ any other post's; registered.`);
  } else {
    // No real art file present (SAFE run with no ui-evolve cache) → deterministic placeholder path.
    usedPath = "placeholder";
  }

  // PAID-PATH PROOF: under a paid invocation the real nano-banana art MUST have been written +
  // hashed. If we fell back to the placeholder, the paid primary did NOT run — HARD-FAIL rather than
  // report a false "paid ✓".
  if (PAID && usedPath !== "nano-banana") {
    throw new Error(
      "SMOKE FAIL: LAUNCH_CARD_PAID=1 but the real nano-banana art was not produced " +
        `(no ${artPng}). The paid primary path did not run — refusing to report a false paid pass.`,
    );
  }

  const written: { name: string; outPath: string; bytes: number }[] = [];

  for (const card of UI_EVOLVE_CARDS) {
    // Confirm the rendered tiles carry exactly the three mapped source lines (selectFacts is the
    // selector buildCardHtml uses — proving it keeps all three proves no tile silently dropped).
    const spec = uiEvolveCardSpec(card);
    const fed = selectFacts(spec, card.lines.length);
    if (fed.length !== card.lines.length) {
      throw new Error(
        `SMOKE FAIL: card-ui-evolve-${card.id} selectFacts kept ${fed.length}/${card.lines.length} tiles.`,
      );
    }

    const { outPath, bytes, fitScale } = await renderUiEvolveCard(card, "1:1", outDir, artDataUri);
    written.push({ name: `card-ui-evolve-${card.id}.png`, outPath, bytes });
    console.log(
      `  1:1 card-ui-evolve-${card.id}.png ("${card.title}"): ${(bytes / 1024).toFixed(1)} KB → ${outPath}`,
    );
    // renderImage THREW if any tile clipped (#790), so reaching here means all 3 tiles fit.
    console.log(
      `  card-ui-evolve-${card.id} fit: ${card.lines.length}/${card.lines.length} tiles within frame, ` +
        `scale=${fitScale.toFixed(3)}`,
    );
  }

  // ART-PATH proof line: primary=nano-banana, used=<actual>, paid=<bool>. On a paid run usedPath is
  // mechanically forced to nano-banana above (else we already threw).
  console.log(
    `\nART-PATH: primary="nano-banana" used="${usedPath}" paid=${PAID ? "true" : "false"}` +
      (uiEvolveSha ? ` sha256="${uiEvolveSha}"` : ""),
  );
  console.log(`SMOKE-PATH: primary="nano-banana" used="${usedPath}" clean=true`);
  for (const w of written) console.log(`ARTIFACT: ${w.outPath} (${w.bytes} bytes)`);
  console.log(
    PAID
      ? `\nSMOKE PASS (PAID): ${written.length} ui-evolve info-cards composed with verbatim ` +
          `card_labels over ONE fresh nano-banana art (post-scoped, ≠ any other post); registered unique.`
      : `\nSMOKE PASS (SAFE): ${written.length} ui-evolve info-cards composed with verbatim ` +
          `card_labels over the ui-evolve cached art / placeholder; no paid call.`,
  );
}

/**
 * Only run the render when this file is the entrypoint — NOT when a unit test imports its exported
 * helpers (uiEvolveCardSpec / assertVerbatim / sourceLine). Without this guard, importing the module
 * would fire a Playwright render as a side effect inside jest.
 */
function isEntrypoint(): boolean {
  const entry = process.argv[1] ?? "";
  return /(^|\/)launch-card-ui-evolve\.ts$/.test(entry) || entry.endsWith("launch-card-ui-evolve");
}

if (isEntrypoint()) {
  main().catch((err) => {
    console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
