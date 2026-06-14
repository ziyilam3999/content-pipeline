/**
 * Post #5 "three-role-model" CARD-OVER-ART generator.
 *
 * The Post #3 twin (`smoke/launch-card-post3.ts`) for the three-role-model. Produces three X-aspect
 * card-over-art infographics (1:1, 1080x1080):
 *   out/image/card-post5-A.png   (FOUR ROLES, NO SELF-REVIEW)
 *   out/image/card-post5-B.png   (TWO KNOBS PER TASK)
 *   out/image/card-post5-C.png   (PROVABLE, NOT CLAIMED)
 *
 * The card WORDS come VERBATIM from the reviewed copy `out/copy/three-role-model-post-content.json`
 * → `card_labels`; this smoke MUST NOT invent or alter any of them. Each verbatim line is split
 * losslessly into a small `prefix` + a big `value` (prefix + " " + value === source).
 *
 * SHARED ART (the whole point — feedback_demo_video_must_bind_shared_art_background_not_silent_solid):
 * this smoke generates the ONE unique nano-banana art base ONCE (PAID), at slug
 * `three-role-model-post5` → `_art-base-three-role-model-post5.png`, and that SAME file is reused
 * behind all three cards AND (later) fed to the demo VIDEO background. PER-POST UNIQUE ART (#802):
 * the cache key is post-scoped and the committed art-registry guard asserts the hash is distinct from
 * every prior post.
 *
 * The art base is written under `out/image/` so the demo (`smoke/post5-demo-multi-aspect.ts`) binds
 * the exact path `out/image/_art-base-three-role-model-post5.png`.
 *
 * Run: `npx tsx smoke/launch-card-post5.ts`        (SAFE — reuses post-5 cached art / placeholder)
 *      `LAUNCH_CARD_PAID=1 npx tsx smoke/launch-card-post5.ts`   (PAID — ONE fresh nano-banana gen)
 *        Key from $GEMINI_API_KEY or macOS Keychain (service "GEMINI_API_KEY").
 */

import * as fs from "fs";
import * as path from "path";

import { renderImage } from "../adapters/image";
import { CONFIG, type AspectRatio } from "../config";
import { buildCardHtml, selectFacts } from "../image/card";
import { type ContentSpec, type Fact } from "../inputs/contentspec";
import { type CopyResult } from "../pipeline/run";
import { threeRoleModelSpec, THREE_ROLE_REPO_URL, THREE_ROLE_CONTENT_SRC } from "../inputs/threeRoleModelSpec";
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

/** Post #5's stable slug — the post-scoped art cache key + registry key. */
const POST5_SLUG = "three-role-model-post5";

/**
 * Post #5's OWN art-theme prompt (#802). Appended to the brand-safe base prompt so the gen is
 * DISTINCT from prior posts'. A RELAY / orchestrated assembly-line vibe — four linked luminous
 * waypoints passing light forward with a graceful verification loop arcing BACK, one coordinating
 * central nexus. PURELY ABSTRACT (light/flow/linked nodes), NO nameable UI elements, NO text/letters
 * (the generative-art-adds-garbled-text lesson — feedback_generative_art_adds_garbled_text...).
 */
const POST5_PROMPT_EXTRA =
  "Evoke an orchestrated RELAY: four evenly-spaced luminous waypoints strung along a single flowing " +
  "current of light, energy handed forward node to node, with one graceful arc looping BACK to verify " +
  "before moving on, and a brighter central nexus that quietly coordinates the flow. Cool palette — " +
  "electric teal and indigo with soft violet, glowing connective filaments over deep navy-to-black, " +
  "subtle particle drift and circuitry — distinct from a data chart, a red-to-green test bar, or a " +
  "warm forge of building blocks. Pure abstract motion of linked light; no panels, no cards, no icons.";

const POST5_ART_OPTS: GenerateArtOnceOpts = {
  postSlug: POST5_SLUG,
  promptExtra: POST5_PROMPT_EXTRA,
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function isPng(buf: Buffer): boolean {
  return buf.length > 8 && buf.subarray(0, 8).equals(PNG_MAGIC);
}

/**
 * Mirror image/card.ts `esc()` — buildCardHtml HTML-escapes every tile's text, so a verbatim
 * substring check must compare against the ESCAPED form (the card_labels use "->", which renders
 * to "-&gt;" in the HTML source even though the browser paints it back to "->" in the PNG).
 */
function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A verbatim card_labels line, pre-split into a small prefix + a big value (lossless). */
interface Post5Line {
  prefix: string;
  value: string;
}
interface Post5Card {
  id: "A" | "B" | "C";
  /** card_labels key in the copy JSON. */
  sourceKey: string;
  /** Short human header (the card summary line). */
  title: string;
  lines: Post5Line[];
}

/**
 * The SOURCE-OF-TRUTH lines, VERBATIM from card_labels. Kept inline as the rendered text AND
 * re-checked against the copy JSON at runtime (assertVerbatim) so any drift fails loudly.
 */
export const POST5_CARDS: Post5Card[] = [
  {
    id: "A",
    sourceKey: "A_four_roles_no_self_review",
    title: "Four roles, no self-review",
    lines: [
      { prefix: "FOUR ROLES,", value: "NO SELF-REVIEW" },
      { prefix: "planner ->", value: "plan-review" },
      { prefix: "executor ->", value: "execution-review" },
      { prefix: "nobody grades", value: "their own homework" },
    ],
  },
  {
    id: "B",
    sourceKey: "B_two_knobs_per_task",
    title: "Two knobs per task",
    lines: [
      { prefix: "TWO KNOBS", value: "PER TASK" },
      { prefix: "executor:", value: "test-loop / one / parallel / inline" },
      { prefix: "evaluator:", value: "real test / reviewer / both" },
      { prefix: "a real test", value: "beats an opinion" },
    ],
  },
  {
    id: "C",
    sourceKey: "C_provable_not_claimed",
    title: "Provable, not claimed",
    lines: [
      { prefix: "PROVABLE,", value: "NOT CLAIMED" },
      { prefix: "hooks +", value: "forgery-resistant ledger" },
      { prefix: "roles bound to", value: "real transcripts" },
      { prefix: "MIT - public -", value: "feedback welcome" },
    ],
  },
];

/** Reconstruct the full source line a `Post5Line` encodes (lossless: prefix + " " + value). */
export function sourceLine(line: Post5Line): string {
  return `${line.prefix} ${line.value}`;
}

/** Read card_labels keyed A/B/C from the reviewed copy JSON. */
function readSourceLabels(): Record<"A" | "B" | "C", string[]> {
  const p = path.join(process.cwd(), THREE_ROLE_CONTENT_SRC);
  if (!fs.existsSync(p)) {
    throw new Error(`SMOKE FAIL: reviewed copy not found at ${THREE_ROLE_CONTENT_SRC} — cannot verify card_labels.`);
  }
  const cl = JSON.parse(fs.readFileSync(p, "utf8")).card_labels;
  return {
    A: cl.A_four_roles_no_self_review,
    B: cl.B_two_knobs_per_task,
    C: cl.C_provable_not_claimed,
  };
}

/** Assert each card's inline lines reproduce the reviewed source-of-truth card_labels VERBATIM. */
export function assertVerbatim(): void {
  const src = readSourceLabels();
  for (const card of POST5_CARDS) {
    const want = src[card.id];
    const got = card.lines.map(sourceLine);
    if (got.length !== want.length) {
      throw new Error(`SMOKE FAIL: card-post5-${card.id} has ${got.length} lines but source has ${want.length}.`);
    }
    for (let i = 0; i < want.length; i++) {
      if (got[i] !== want[i]) {
        throw new Error(
          `SMOKE FAIL: card-post5-${card.id} line ${i + 1} not verbatim.\n` +
            `  source: ${JSON.stringify(want[i])}\n  card  : ${JSON.stringify(got[i])}`,
        );
      }
    }
  }
}

function post5CardSpec(card: Post5Card): ContentSpec {
  const facts: Fact[] = card.lines.map((line) => ({
    label: line.prefix,
    value: line.value,
    source: THREE_ROLE_CONTENT_SRC,
  }));
  return {
    product: { name: "three-role-model", summary: card.title, repoUrl: THREE_ROLE_REPO_URL },
    facts,
    highlights: [],
    ctas: ["Install it → github.com/ziyilam3999/three-role-model"],
    sourceFiles: [THREE_ROLE_CONTENT_SRC],
  };
}

function copyFor(spec: ContentSpec): CopyResult {
  return {
    thread: spec.highlights.slice(),
    script: spec.product.summary,
    labels: spec.facts.slice(0, 3).map((f) => `${f.label} ${f.value}`),
  };
}

async function renderPost5Card(
  card: Post5Card,
  aspect: AspectRatio,
  outDir: string,
  artDataUri: string,
): Promise<{ outPath: string; bytes: number; fitScale: number }> {
  const spec = post5CardSpec(card);
  const fileName = `card-post5-${card.id}.png`;

  // Verbatim DOM check: buildCardHtml is what renderImage renders.
  const html = buildCardHtml(spec, CONFIG.aspects[aspect], { maxFacts: card.lines.length });
  for (const line of card.lines) {
    if (!html.includes(escHtml(line.prefix)) || !html.includes(escHtml(line.value))) {
      throw new Error(`SMOKE FAIL: card-post5-${card.id} rendered HTML missing verbatim text "${sourceLine(line)}".`);
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

  // Art base + cards land under out/image so the demo binds the deliverable art path directly.
  const outDir = path.join(process.cwd(), "out", "image");
  fs.mkdirSync(outDir, { recursive: true });

  console.log(
    `→ Post #5 'three-role-model' card SET (${
      PAID
        ? "PAID — ONE fresh nano-banana gen for post #5"
        : "SAFE — reuses post-5 cached art / placeholder, ZERO paid spend"
    })`,
  );

  // ONE shared background reused behind all three cards of THIS post + (later) the demo video bg.
  // POST-SCOPED cache key (postSlug="three-role-model-post5") → its OWN art file.
  const artDataUri = await generateArtOnce(threeRoleModelSpec(), PAID, outDir, POST5_ART_OPTS);

  // CROSS-POST UNIQUENESS GUARD (#802). Hash the post-scoped art file and assert it is NOT any prior post.
  const artPng = artBasePngPath(outDir, POST5_SLUG);
  let post5Sha: string | undefined;
  let usedPath: string;
  if (fs.existsSync(artPng)) {
    post5Sha = sha256File(artPng);
    const registry = loadRegistry();
    assertArtUnique(POST5_SLUG, post5Sha, registry); // throws if post5 would ship another post's art
    saveRegistry(registerArt(POST5_SLUG, post5Sha, registry));
    usedPath = "nano-banana";
    console.log(`  art-file=${artPng}`);
    console.log(`  art-sha256(three-role-model-post5)=${post5Sha}`);
    console.log(`  cross-post uniqueness: PASS — post5 art ≠ any other post's; registered.`);
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
  for (const card of POST5_CARDS) {
    const spec = post5CardSpec(card);
    const fed = selectFacts(spec, card.lines.length);
    if (fed.length !== card.lines.length) {
      throw new Error(`SMOKE FAIL: card-post5-${card.id} selectFacts kept ${fed.length}/${card.lines.length} tiles.`);
    }
    const { outPath, bytes, fitScale } = await renderPost5Card(card, "1:1", outDir, artDataUri);
    written.push({ name: `card-post5-${card.id}.png`, outPath, bytes });
    console.log(`  1:1 card-post5-${card.id}.png ("${card.title}"): ${(bytes / 1024).toFixed(1)} KB → ${outPath}`);
    console.log(`  card-post5-${card.id} fit: ${card.lines.length}/${card.lines.length} tiles within frame, scale=${fitScale.toFixed(3)}`);
  }

  console.log(
    `\nART-PATH: primary="nano-banana" used="${usedPath}" paid=${PAID ? "true" : "false"}` +
      (post5Sha ? ` sha256="${post5Sha}"` : ""),
  );
  console.log(`SMOKE-PATH: primary="nano-banana" used="${usedPath}" clean=true`);
  for (const w of written) console.log(`ARTIFACT: ${w.outPath} (${w.bytes} bytes)`);
  console.log(
    PAID
      ? `\nSMOKE PASS (PAID): ${written.length} Post-#5 three-role-model cards composed with verbatim card_labels ` +
          `over ONE fresh nano-banana art (post-scoped, ≠ any prior post); registered unique.`
      : `\nSMOKE PASS (SAFE): ${written.length} Post-#5 three-role-model cards composed with verbatim card_labels ` +
          `over the post-5 cached art / placeholder; no paid call.`,
  );
}

function isEntrypoint(): boolean {
  const entry = process.argv[1] ?? "";
  return /(^|\/)launch-card-post5\.ts$/.test(entry) || entry.endsWith("launch-card-post5");
}

if (isEntrypoint()) {
  main().catch((err) => {
    console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
