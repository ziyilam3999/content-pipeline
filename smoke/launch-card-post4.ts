/**
 * Post #4 "content-pipeline DEMO" per-tweet CARD-OVER-ART generator (#824 per-tweet-cards).
 *
 * The operator chose per-tweet cards for the demonstration post (like posts #1-#3) so it passes the
 * #797 consolidated fidelity gate (every worded X tweet carries media + a card-over-art still, and the
 * Threads post carries a card alongside the hero video). This smoke produces the three X-aspect body
 * cards (1:1, 1080x1080), one per worded body tweet (tweets 2-4):
 *
 *   out/review/fable/card-post4-A.png   ("One ask → the whole post"      — tweet 2)
 *   out/review/fable/card-post4-B.png   ("A built-in fact-checker"       — tweet 3)
 *   out/review/fable/card-post4-C.png   ("Run by an agent, not a person" — tweet 4 / CTA)
 *
 * COST DISCIPLINE — FREE, NO PAID GENERATIVE ART (#824 brief, free-first):
 *   These cards render over the DETERMINISTIC BRANDED background `buildCardHtml` falls back to when no
 *   `backgroundDataUri` is supplied — the dark-navy radial gradient (#1a2a4a → #0a0f1e) with the teal
 *   accent (#38d39f). That IS the demo VIDEO's visual language (the navy "tool" world / clean modern
 *   type / teal accent), so the post stays coherent with the hero. `renderImage` is called with
 *   `generative: false` ⇒ NO nano-banana call, NO Gemini key, ZERO paid spend, fully deterministic.
 *   There is intentionally NO `:paid` variant and NO art-registry: these are branded-gradient cards,
 *   not card-over-generated-art, and the #797 gate is satisfied by a clean branded card.
 *
 * The card WORDS are defined inline here (the canonical card source) and are coherent with — never
 * contradict — the reviewed copy `.ai-workspace/posts/post4-content-pipeline-demo-copy.json`
 * (tweets 2-4). Every card carries the REAL repo URL (github.com/ziyilam3999/content-pipeline), is
 * brand-clean (no employer brand), MIT-honest, and qualitative (no invented metrics — the post claims
 * none). Each card's rendered HTML is asserted to contain its verbatim lines (a render-fidelity guard).
 *
 * Run: `npx tsx smoke/launch-card-post4.ts`   (SAFE — deterministic branded cards, ZERO paid spend)
 */

import * as fs from "fs";
import * as path from "path";

import { renderImage } from "../adapters/image";
import { CONFIG, type AspectRatio } from "../config";
import { buildCardHtml } from "../image/card";
import { type ContentSpec, type Fact } from "../inputs/contentspec";
import { type CopyResult } from "../pipeline/run";

const REPO_URL = "https://github.com/ziyilam3999/content-pipeline";
const COPY_SRC = ".ai-workspace/posts/post4-content-pipeline-demo-copy.json";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function isPng(buf: Buffer): boolean {
  return buf.length > 8 && buf.subarray(0, 8).equals(PNG_MAGIC);
}

/** A card line, split into a small `prefix` (label) + a big `value` — the proven card tile shape. */
interface Post4Line {
  prefix: string;
  value: string;
}
interface Post4Card {
  id: "A" | "B" | "C";
  /** The tweet this card backs (1-based index into the X thread). */
  tweet: number;
  /** Short human header (the card summary line). */
  title: string;
  /** Optional CTA line (the C card carries the real repo URL as its CTA). */
  cta?: string;
  lines: Post4Line[];
}

/**
 * The SOURCE-OF-TRUTH card lines. Coherent with post4 tweets 2-4 — qualitative, no metrics, MIT-honest,
 * real URL. These are the demonstration post's body cards (the hero video is tweet 1 / the Threads lead).
 */
export const POST4_CARDS: Post4Card[] = [
  {
    id: "A",
    tweet: 2,
    title: "One ask → the whole post",
    lines: [
      { prefix: "One plain-English ask", value: "becomes the whole post" },
      { prefix: "You get copy, an image card", value: "and a captioned video" },
      { prefix: "Every video in", value: "3 shapes" },
      { prefix: "Same facts in →", value: "pieces never contradict" },
    ],
  },
  {
    id: "B",
    tweet: 3,
    title: "A built-in fact-checker",
    lines: [
      { prefix: "Reads every", value: "number & claim" },
      { prefix: "Flags anything that", value: "doesn’t match your facts" },
      { prefix: "Fast — but it can’t", value: "quietly make things up" },
    ],
  },
  {
    id: "C",
    tweet: 4,
    title: "Run by an agent, not a person",
    cta: "Try it →",
    lines: [
      { prefix: "No UI to learn —", value: "just describe it" },
      { prefix: "Open-source ·", value: "MIT · free to use" },
    ],
  },
];

/** Reconstruct the full source line a `Post4Line` encodes (lossless: prefix + " " + value). */
export function sourceLine(line: Post4Line): string {
  return `${line.prefix} ${line.value}`;
}

function post4CardSpec(card: Post4Card): ContentSpec {
  const facts: Fact[] = card.lines.map((line) => ({
    label: line.prefix,
    value: line.value,
    source: COPY_SRC,
  }));
  return {
    product: { name: "content-pipeline", summary: card.title, repoUrl: REPO_URL },
    facts,
    highlights: [],
    ctas: [card.cta ?? ""],
    sourceFiles: [COPY_SRC],
  };
}

function copyFor(spec: ContentSpec): CopyResult {
  return {
    thread: spec.highlights.slice(),
    script: spec.product.summary,
    labels: spec.facts.slice(0, 3).map((f) => `${f.label} ${f.value}`),
  };
}

async function renderPost4Card(
  card: Post4Card,
  aspect: AspectRatio,
  outDir: string,
): Promise<{ outPath: string; bytes: number; fitScale: number }> {
  const spec = post4CardSpec(card);
  const fileName = `card-post4-${card.id}.png`;

  // Verbatim DOM check: buildCardHtml (with NO backgroundDataUri ⇒ the branded navy gradient) is what
  // renderImage renders in the generative:false path. Confirm every line's text is present.
  const html = buildCardHtml(spec, CONFIG.aspects[aspect], { maxFacts: card.lines.length });
  for (const line of card.lines) {
    if (!html.includes(esc(line.prefix)) || !html.includes(esc(line.value))) {
      throw new Error(
        `SMOKE FAIL: card-post4-${card.id} rendered HTML missing verbatim text "${sourceLine(line)}".`,
      );
    }
  }

  let fitScale = 1;
  // generative:false ⇒ deterministic branded navy gradient background, NO paid art call.
  const outPath = await renderImage(
    { spec, copy: copyFor(spec) },
    {
      generative: false,
      aspect,
      outDir,
      fileName,
      maxFacts: card.lines.length,
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

// Local copy of the card HTML escaper so the DOM-presence check compares against the escaped text the
// renderer actually emits (e.g. a literal apostrophe becomes &#39;).
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function main(): Promise<void> {
  // Render NEXT TO the hero video so the #810 freeze (one sourceDir) snapshots hero + cards together.
  const outDir = path.join(process.cwd(), "out", "review", "fable");
  fs.mkdirSync(outDir, { recursive: true });

  console.log("→ Post #4 'content-pipeline demo' body card SET (FREE — deterministic branded navy gradient, ZERO paid spend)");

  const written: { name: string; outPath: string; bytes: number }[] = [];
  for (const card of POST4_CARDS) {
    const { outPath, bytes, fitScale } = await renderPost4Card(card, "1:1", outDir);
    written.push({ name: `card-post4-${card.id}.png`, outPath, bytes });
    console.log(
      `  1:1 card-post4-${card.id}.png ("${card.title}", tweet ${card.tweet}): ${(bytes / 1024).toFixed(1)} KB → ${outPath}`,
    );
    console.log(`  card-post4-${card.id} fit: ${card.lines.length}/${card.lines.length} tiles within frame, scale=${fitScale.toFixed(3)}`);
  }

  console.log(`\nSMOKE-PATH: primary="branded-gradient" used="branded-gradient" paid=false clean=true`);
  for (const w of written) console.log(`ARTIFACT: ${w.outPath} (${w.bytes} bytes)`);
  console.log(
    `\nSMOKE PASS (FREE): ${written.length} Post-#4 demo body cards composed over the deterministic branded ` +
      `navy gradient (the demo's visual language); no paid call, real repo URL, brand-clean.`,
  );
}

function isEntrypoint(): boolean {
  const entry = process.argv[1] ?? "";
  return /(^|\/)launch-card-post4\.ts$/.test(entry) || entry.endsWith("launch-card-post4");
}

if (isEntrypoint()) {
  main().catch((err) => {
    console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
