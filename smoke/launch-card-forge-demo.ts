/**
 * forge-demo DEMONSTRATION per-tweet CARD-OVER-ART generator (#871 forge-harness demo post).
 *
 * Mirrors the proven post-#4 card template (smoke/launch-card-post4.ts) exactly in shape: art-once +
 * cross-post uniqueness guard + per-card DOM-fidelity check + SAFE/PAID gating + PRIMARY-only paid
 * proof. Only the CONTENT differs (forge cards + a new abstract art prompt + a new post slug).
 *
 * The operator chose per-tweet cards for the demonstration post (like posts #1-#5) so it passes the
 * #797 consolidated fidelity gate (every worded X tweet carries media + a card-over-art still, and the
 * Threads post carries a card alongside the hero video). This smoke produces the three X-aspect body
 * cards (1:1, 1080x1080), one per worded body tweet (tweets 2-4):
 *
 *   out/review/fable/card-forge-demo-A.png   ("Watch the board: Retry → Done"      — tweet 2)
 *   out/review/fable/card-forge-demo-B.png   ("Only one block calls the model"     — tweet 3)
 *   out/review/fable/card-forge-demo-C.png   ("Your tests decide what ships"       — tweet 4 / CTA)
 *
 * GENERATIVE ART:
 *   These cards render OVER a real nano-banana creative background — ONE unique per-post art base
 *   (`_art-base-forge-demo-871.png`), generated ONCE (PAID) and reused (fanned out) behind all three
 *   cards (within-post sharing is correct & cheap). The art evokes forge's green "liveness pulse"
 *   (emerald/teal rings rippling on a near-black field) but is distinct in motif from every prior
 *   post's art. It is brand-clean (no employer brand, no text-in-art). The card text overlays the art
 *   with the established card translucent-tile contrast — the same legible card-over-art path posts
 *   #1-#5 use.
 *
 *   PER-POST UNIQUE ART (#802/#803): the art cache key is POST-SCOPED (`forge-demo-871`) and the
 *   committed cross-post art-registry guard (`smoke/art-registry.ts assertArtUnique`) HARD-FAILS if
 *   this post's art sha256 is already registered to any prior post. One paid gen, fanned out,
 *   registered unique.
 *
 *   SAFE BY DEFAULT: the unpaid path reuses the post-scoped cached art if present (free) else a
 *   deterministic 1x1 placeholder — ZERO spend, CI-safe. The ONE paid nano-banana gen is gated behind
 *   LAUNCH_CARD_PAID=1, mirroring the house *_PAID convention. PRIMARY-ONLY: a forced paid run that
 *   did not produce real art THROWS (no false paid pass).
 *
 * The card WORDS are defined inline here (the canonical card source) and are coherent with — never
 * contradict — the reviewed copy `.ai-workspace/posts/forge-demo-copy.json` (tweets 2-4). Every card
 * is brand-clean (no employer brand), MIT-honest, qualitative (no invented forge metric), and the C
 * card carries the REAL repo URL (github.com/ziyilam3999/forge-harness). Each card's rendered HTML is
 * asserted to contain its verbatim lines (a render-fidelity guard).
 *
 * Run: `npx tsx smoke/launch-card-forge-demo.ts`                  (SAFE — reuses cached art / placeholder)
 *      `LAUNCH_CARD_PAID=1 npx tsx smoke/launch-card-forge-demo.ts` (PAID — ONE fresh nano-banana gen)
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

const REPO_URL = "https://github.com/ziyilam3999/forge-harness";
const COPY_SRC = ".ai-workspace/posts/forge-demo-copy.json";

/** Forge-demo's stable slug — the post-scoped art cache key + cross-post registry key (#802/#871). */
const FORGE_DEMO_SLUG = "forge-demo-871";

/**
 * Forge-demo's OWN art-theme prompt (#802). Appended to the brand-safe base prompt so the gen is
 * DISTINCT from Post #1 (data/benchmark chart), Post #2 (red→green test bar), Post #3 (molten forge
 * embers/blocks) and Post #4 (drifting particle light-beams).
 *
 * PURELY ABSTRACT, NO-TEXT (#824 abstract-art). ROOT CAUSE of the earlier garbled-text art: a prompt
 * that NAMED discrete labelable elements (panels / cards / screens / columns / boards / checkmarks /
 * cursors / labels) makes nano-banana render those referents as (garbled) text labels in the image,
 * and a soft "no text" negative doesn't stop it. The card's RENDERED layer carries ALL words; the art
 * is only an atmospheric backdrop. So this prompt names NO nameable discrete elements — only light,
 * rings, ripples, and bokeh on the deep-green-on-black palette (forge's green liveness pulse).
 */
const FORGE_DEMO_PROMPT_EXTRA =
  "Pure abstract atmosphere only: a slow luminous pulse — soft concentric rings and ripples of light " +
  "radiating outward from a gentle glowing core, overlapping into delicate wave-interference, with " +
  "fine bokeh depth-of-field dissolving into darkness. EMERALD and TEAL-GREEN light blooming across a " +
  "deep near-black field (forge's green liveness pulse). Absolutely NO discrete objects — no panels, " +
  "no cards, no screens, no columns, no boards, no rectangles, no frames, no icons, no checkmarks, no " +
  "cursors, no buttons, no labels, no diagram — ONLY atmospheric light, rings, ripples, and bokeh on " +
  "a dark field. Keep the center and upper-left calm and uncluttered for text overlaid later. Distinct " +
  "in motif from a data chart, a red-to-green test bar, molten forge embers, or drifting light beams.";

const FORGE_DEMO_ART_OPTS: GenerateArtOnceOpts = {
  postSlug: FORGE_DEMO_SLUG,
  promptExtra: FORGE_DEMO_PROMPT_EXTRA,
};

/**
 * A minimal MASTER ContentSpec whose `product.summary` becomes the nano-banana art theme line
 * (`buildArtPrompt` reads `spec.product.summary` as the "Theme to evoke"). Only the art generator
 * consumes this — the cards carry their own per-card specs. Brand-clean: no employer brand,
 * qualitative. #824 abstract-art: the summary is PURELY ATMOSPHERIC and names NO labelable elements.
 */
function forgeDemoArtMasterSpec(): ContentSpec {
  return {
    product: {
      name: "forge-harness",
      summary:
        "an abstract deep-green-on-black atmosphere of slow concentric light rings and ripples " +
        "pulsing outward from a soft glowing core, with fine bokeh depth",
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
interface ForgeDemoLine {
  prefix: string;
  value: string;
}
interface ForgeDemoCard {
  id: "A" | "B" | "C";
  /** The tweet this card backs (1-based index into the X thread). */
  tweet: number;
  /** Short human header (the card summary line). */
  title: string;
  /** Optional CTA line (the C card carries the real repo URL as its CTA). */
  cta?: string;
  lines: ForgeDemoLine[];
}

/**
 * The SOURCE-OF-TRUTH card lines. Coherent with forge-demo tweets 2-4 — qualitative, no invented
 * forge metric, MIT-honest, real URL. These are the demonstration post's body cards (the hero video
 * is tweet 1 / the Threads lead).
 */
export const FORGE_DEMO_CARDS: ForgeDemoCard[] = [
  {
    id: "A",
    tweet: 2,
    title: "Watch the board: Retry → Done",
    lines: [
      { prefix: "A check fails →", value: "the story lands in Retry" },
      { prefix: "The board shows you", value: "exactly which check" },
      { prefix: "Fix it, re-run →", value: "it slides to Done" },
      { prefix: "Same inputs →", value: "same verdict, every run" },
    ],
  },
  {
    id: "B",
    tweet: 3,
    title: "Only one block calls the model",
    lines: [
      { prefix: "8 building blocks,", value: "only one calls the model" },
      { prefix: "The other seven are", value: "plain deterministic code" },
      { prefix: "Your shell commands", value: "are the pass/fail checks" },
      { prefix: "No agent grading", value: "its own homework" },
    ],
  },
  {
    id: "C",
    tweet: 4,
    title: "Your tests decide what ships",
    cta: "Try it →",
    lines: [
      { prefix: "Plan, build, verdict —", value: "on a Max plan, $0 out of pocket" },
      { prefix: "Open-source ·", value: "MIT · your tests decide" },
    ],
  },
];

/** Reconstruct the full source line a `ForgeDemoLine` encodes (lossless: prefix + " " + value). */
export function sourceLine(line: ForgeDemoLine): string {
  return `${line.prefix} ${line.value}`;
}

export function forgeDemoCardSpec(card: ForgeDemoCard): ContentSpec {
  const facts: Fact[] = card.lines.map((line) => ({
    label: line.prefix,
    value: line.value,
    source: COPY_SRC,
  }));
  return {
    product: { name: "forge-harness", summary: card.title, repoUrl: REPO_URL },
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

async function renderForgeDemoCard(
  card: ForgeDemoCard,
  aspect: AspectRatio,
  outDir: string,
  artDataUri: string,
): Promise<{ outPath: string; bytes: number; fitScale: number }> {
  const spec = forgeDemoCardSpec(card);
  const fileName = `card-forge-demo-${card.id}.png`;

  // Verbatim DOM check: buildCardHtml is what renderImage renders. Confirm every line's text is present.
  const html = buildCardHtml(spec, CONFIG.aspects[aspect], { maxFacts: card.lines.length });
  for (const line of card.lines) {
    if (!html.includes(esc(line.prefix)) || !html.includes(esc(line.value))) {
      throw new Error(
        `SMOKE FAIL: card-forge-demo-${card.id} rendered HTML missing verbatim text "${sourceLine(line)}".`,
      );
    }
  }

  let fitScale = 1;
  // generative:true ⇒ compose the card over the ONE shared nano-banana art (fanned out via the
  // injected caller — no further generation). The card's translucent tiles keep the text legible.
  // #824 abstract-art: the art base is PURELY ABSTRACT (no garbled labels), so NO art-text mask
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
    `→ forge-demo body card SET (${
      PAID
        ? "PAID — ONE fresh nano-banana gen for the forge-demo post"
        : "SAFE — reuses forge-demo cached art / placeholder, ZERO paid spend"
    })`,
  );

  // ONE shared background reused behind all three cards of THIS post. POST-SCOPED cache key
  // (postSlug="forge-demo-871") → its OWN `_art-base-forge-demo-871.png`.
  const artDataUri = await generateArtOnce(forgeDemoArtMasterSpec(), PAID, outDir, FORGE_DEMO_ART_OPTS);

  // CROSS-POST UNIQUENESS GUARD (#802/#803). Hash the post-scoped art file and assert it is NOT any
  // prior post's; then register it.
  const artPng = artBasePngPath(outDir, FORGE_DEMO_SLUG);
  let forgeSha: string | undefined;
  let usedPath: string;
  if (fs.existsSync(artPng)) {
    forgeSha = sha256File(artPng);
    const registry = loadRegistry();
    assertArtUnique(FORGE_DEMO_SLUG, forgeSha, registry); // throws if this would ship another post's art
    saveRegistry(registerArt(FORGE_DEMO_SLUG, forgeSha, registry));
    usedPath = "nano-banana";
    console.log(`  art-file=${artPng}`);
    console.log(`  art-sha256(forge-demo-871)=${forgeSha}`);
    console.log(`  cross-post uniqueness: PASS — forge-demo art ≠ any other post's; registered.`);
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
  for (const card of FORGE_DEMO_CARDS) {
    const { outPath, bytes, fitScale } = await renderForgeDemoCard(card, "1:1", outDir, artDataUri);
    written.push({ name: `card-forge-demo-${card.id}.png`, outPath, bytes });
    console.log(
      `  1:1 card-forge-demo-${card.id}.png ("${card.title}", tweet ${card.tweet}): ${(bytes / 1024).toFixed(1)} KB → ${outPath}`,
    );
    console.log(`  card-forge-demo-${card.id} fit: ${card.lines.length}/${card.lines.length} tiles within frame, scale=${fitScale.toFixed(3)}`);
  }

  console.log(
    `\nART-PATH: primary="nano-banana" used="${usedPath}" paid=${PAID ? "true" : "false"}` +
      (forgeSha ? ` sha256="${forgeSha}"` : ""),
  );
  console.log(`SMOKE-PATH: primary="nano-banana" used="${usedPath}" clean=true`);
  for (const w of written) console.log(`ARTIFACT: ${w.outPath} (${w.bytes} bytes)`);
  console.log(
    PAID
      ? `\nSMOKE PASS (PAID): ${written.length} forge-demo body cards composed over ONE fresh nano-banana art ` +
          `(post-scoped, ≠ any prior post); registered unique, real repo URL, brand-clean.`
      : `\nSMOKE PASS (SAFE): ${written.length} forge-demo body cards composed over the forge-demo cached art / ` +
          `placeholder; no paid call, real repo URL, brand-clean.`,
  );
}

function isEntrypoint(): boolean {
  const entry = process.argv[1] ?? "";
  return /(^|\/)launch-card-forge-demo\.ts$/.test(entry) || entry.endsWith("launch-card-forge-demo");
}

if (isEntrypoint()) {
  main().catch((err) => {
    console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
