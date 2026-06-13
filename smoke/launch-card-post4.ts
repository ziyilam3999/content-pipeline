/**
 * Post #4 "content-pipeline DEMO" per-tweet CARD-OVER-ART generator (#824 cards-generative-art).
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
 * GENERATIVE ART (#824 cards-generative-art — operator GO for ONE paid gen ~8-12¢):
 *   These cards render OVER a real nano-banana creative background — ONE unique per-post art base
 *   (`_art-base-content-pipeline-post4.png`), generated ONCE (PAID) and reused (fanned out) behind all
 *   three cards (within-post sharing is correct & cheap). The art is on-brand for the demo (dark navy
 *   "tool world" / agent-automation aesthetic / teal accent) but distinct in motif from the lfah/forge
 *   art. It is brand-clean (no employer brand, no text-in-art). The card text overlays the art with the
 *   established card translucent-tile contrast — the same legible card-over-art path posts #1-#3 use.
 *
 *   PER-POST UNIQUE ART (#802/#803): the art cache key is POST-SCOPED (`content-pipeline-post4`) and the
 *   committed cross-post art-registry guard (`smoke/art-registry.ts assertArtUnique`) HARD-FAILS if this
 *   post's art sha256 is already registered to any prior post (post1/post2/forge-harness-post3). One paid
 *   gen, fanned out, registered unique.
 *
 *   SAFE BY DEFAULT: the unpaid path reuses the post-scoped cached art if present (free) else a
 *   deterministic 1x1 placeholder — ZERO spend, CI-safe. The ONE paid nano-banana gen is gated behind
 *   LAUNCH_CARD_PAID=1, mirroring the house *_PAID convention. PRIMARY-ONLY: a forced paid run that did
 *   not produce real art THROWS (no false paid pass).
 *
 * The card WORDS are defined inline here (the canonical card source) and are coherent with — never
 * contradict — the reviewed copy `.ai-workspace/posts/post4-content-pipeline-demo-copy.json`
 * (tweets 2-4). Every card carries the REAL repo URL (github.com/ziyilam3999/content-pipeline), is
 * brand-clean (no employer brand), MIT-honest, and qualitative (no invented metrics — the post claims
 * none). Each card's rendered HTML is asserted to contain its verbatim lines (a render-fidelity guard).
 *
 * Run: `npx tsx smoke/launch-card-post4.ts`                  (SAFE — reuses post-4 cached art / placeholder)
 *      `LAUNCH_CARD_PAID=1 npx tsx smoke/launch-card-post4.ts` (PAID — ONE fresh nano-banana gen)
 *        Key from $GEMINI_API_KEY or macOS Keychain (service "GEMINI_API_KEY").
 */

import * as fs from "fs";
import * as path from "path";

import { renderImage } from "../adapters/image";
import { CONFIG, type AspectRatio } from "../config";
import { buildCardHtml } from "../image/card";
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

const PAID = process.env.LAUNCH_CARD_PAID === "1";

const REPO_URL = "https://github.com/ziyilam3999/content-pipeline";
const COPY_SRC = ".ai-workspace/posts/post4-content-pipeline-demo-copy.json";

/** Post #4's stable slug — the post-scoped art cache key + cross-post registry key (#802). */
const POST4_SLUG = "content-pipeline-post4";

/**
 * Post #4's OWN art-theme prompt (#802). Appended to the brand-safe base prompt so the gen is DISTINCT
 * from Post #1 (data/benchmark chart), Post #2 (red→green build loop) and Post #3 (forge embers / molten
 * blocks).
 *
 * PURELY ABSTRACT, NO-TEXT (#824 abstract-art). ROOT CAUSE of the prior garbled-text art: the old
 * prompt NAMED discrete labelable elements ("FANNING OUT into three softly glowing rectangular output
 * panels … a square, a tall vertical, a portrait", and the master summary literally listed
 * "copy, an image card, and a captioned video"). nano-banana renders such named referents as
 * (garbled) text labels in the image ("copy" / "imae card" / "captioned video" / an "ASK" cursor), and
 * the soft "no text" negative didn't stop it. The card's RENDERED layer carries ALL words; the art is
 * only an atmospheric backdrop (like the abstract bases used for posts #1-#3). So this prompt names NO
 * nameable discrete elements — only light, particles, and gradient on the navy "tool world" palette.
 */
const POST4_PROMPT_EXTRA =
  "Pure abstract atmosphere only: soft luminous light beams and flowing streams of fine particles " +
  "drifting left-to-right through deep open space, a gentle radial gradient glow, faint bokeh " +
  "depth-of-field, and the barest hint of fine circuitry texture dissolving into darkness. Cool " +
  "TEAL-GREEN and indigo light threading through deep NAVY-to-black (the demo's navy 'tool world'). " +
  "Absolutely NO discrete objects — no panels, no cards, no screens, no rectangles, no frames, no " +
  "icons, no cursors, no buttons, no labels, no diagram — ONLY atmospheric light, particles, and " +
  "gradient on a dark field. Keep the center and upper-left calm and uncluttered for text overlaid " +
  "later. Distinct in motif from a data chart, a red-to-green test bar, or molten forge embers.";

const POST4_ART_OPTS: GenerateArtOnceOpts = {
  postSlug: POST4_SLUG,
  promptExtra: POST4_PROMPT_EXTRA,
};

/**
 * A minimal MASTER ContentSpec whose `product.summary` becomes the nano-banana art theme line
 * (`buildArtPrompt` reads `spec.product.summary` as the "Theme to evoke"). Only the art generator
 * consumes this — the cards carry their own per-card specs (post4CardSpec). Brand-clean: no employer
 * brand, qualitative. #824 abstract-art: the summary is PURELY ATMOSPHERIC and names NO labelable
 * output elements (the old "one plain-English ask becomes copy, an image card, and a captioned video"
 * summary is what made nano-banana bake those exact words into the art).
 */
function post4ArtMasterSpec(): ContentSpec {
  return {
    product: {
      name: "content-pipeline",
      summary:
        "an abstract dark navy tech atmosphere of flowing light beams, drifting particles, and soft " +
        "gradient glow",
      repoUrl: REPO_URL,
    },
    facts: [],
    highlights: [],
    ctas: [],
    sourceFiles: [COPY_SRC],
  };
}

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
  artDataUri: string,
): Promise<{ outPath: string; bytes: number; fitScale: number }> {
  const spec = post4CardSpec(card);
  const fileName = `card-post4-${card.id}.png`;

  // Verbatim DOM check: buildCardHtml is what renderImage renders. Confirm every line's text is present.
  const html = buildCardHtml(spec, CONFIG.aspects[aspect], { maxFacts: card.lines.length });
  for (const line of card.lines) {
    if (!html.includes(esc(line.prefix)) || !html.includes(esc(line.value))) {
      throw new Error(
        `SMOKE FAIL: card-post4-${card.id} rendered HTML missing verbatim text "${sourceLine(line)}".`,
      );
    }
  }

  let fitScale = 1;
  // generative:true ⇒ compose the card over the ONE shared nano-banana art (fanned out via the
  // injected caller — no further generation). The card's translucent tiles keep the text legible.
  // #824 abstract-art: the art base is now PURELY ABSTRACT (no garbled labels), so NO art-text mask
  // overlays are applied here — the cards render their content tiles straight over the clean art.
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

  console.log(
    `→ Post #4 'content-pipeline demo' body card SET (${
      PAID
        ? "PAID — ONE fresh nano-banana gen for post #4"
        : "SAFE — reuses post-4 cached art / placeholder, ZERO paid spend"
    })`,
  );

  // ONE shared background reused behind all three cards of THIS post. POST-SCOPED cache key
  // (postSlug="content-pipeline-post4") → its OWN `_art-base-content-pipeline-post4.png`.
  const artDataUri = await generateArtOnce(post4ArtMasterSpec(), PAID, outDir, POST4_ART_OPTS);

  // CROSS-POST UNIQUENESS GUARD (#802/#803). Hash the post-scoped art file and assert it is NOT any
  // prior post's (post1/post2/forge-harness-post3); then register it.
  const artPng = artBasePngPath(outDir, POST4_SLUG);
  let post4Sha: string | undefined;
  let usedPath: string;
  if (fs.existsSync(artPng)) {
    post4Sha = sha256File(artPng);
    const registry = loadRegistry();
    assertArtUnique(POST4_SLUG, post4Sha, registry); // throws if post4 would ship another post's art
    saveRegistry(registerArt(POST4_SLUG, post4Sha, registry));
    usedPath = "nano-banana";
    console.log(`  art-file=${artPng}`);
    console.log(`  art-sha256(content-pipeline-post4)=${post4Sha}`);
    console.log(`  cross-post uniqueness: PASS — post4 art ≠ any other post's; registered.`);
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
  for (const card of POST4_CARDS) {
    const { outPath, bytes, fitScale } = await renderPost4Card(card, "1:1", outDir, artDataUri);
    written.push({ name: `card-post4-${card.id}.png`, outPath, bytes });
    console.log(
      `  1:1 card-post4-${card.id}.png ("${card.title}", tweet ${card.tweet}): ${(bytes / 1024).toFixed(1)} KB → ${outPath}`,
    );
    console.log(`  card-post4-${card.id} fit: ${card.lines.length}/${card.lines.length} tiles within frame, scale=${fitScale.toFixed(3)}`);
  }

  console.log(
    `\nART-PATH: primary="nano-banana" used="${usedPath}" paid=${PAID ? "true" : "false"}` +
      (post4Sha ? ` sha256="${post4Sha}"` : ""),
  );
  console.log(`SMOKE-PATH: primary="nano-banana" used="${usedPath}" clean=true`);
  for (const w of written) console.log(`ARTIFACT: ${w.outPath} (${w.bytes} bytes)`);
  console.log(
    PAID
      ? `\nSMOKE PASS (PAID): ${written.length} Post-#4 demo body cards composed over ONE fresh nano-banana art ` +
          `(post-scoped, ≠ post1/post2/post3); registered unique, real repo URL, brand-clean.`
      : `\nSMOKE PASS (SAFE): ${written.length} Post-#4 demo body cards composed over the post-4 cached art / ` +
          `placeholder; no paid call, real repo URL, brand-clean.`,
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
