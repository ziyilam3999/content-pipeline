/**
 * "agent-kanban-demo" CARD-OVER-ART generator.
 *
 * Mirrors smoke/launch-card-post4.ts / smoke/launch-card-ui-evolve.ts 1:1 (read those for the full
 * doctrine). The narrative is the agent-kanban demo: an AI agent that PLANS, CODES, and REVIEWS its
 * own work — shown live on a real-time Kanban board. The cards are the X thread BODY (ONE combined
 * card after #1063 "combine them") plus one 4:5 card-over-art infographic for the Threads carousel.
 *
 * It produces ONE combined X-aspect body card (1:1, 1080x1080) + ONE 4:5 Threads infographic (1080x1350):
 *   out/review/kanban/image/card-kanban-A.png         (tweet 2 — ONE dense card: 3-role columns + WORKING + deep timeline + CTA)
 *   out/review/kanban/image/card-kanban-overart-4x5.png (Threads — 4 points + the CTA url)
 *
 * NO FORK OF THE CARD COMPOSITION: it reuses the SAME proven machinery — `buildCardHtml` via
 * `renderImage` (#790 auto-fit + overflow throw) — through the shared `generateArtOnce`/render helpers
 * exported by `smoke/launch-card.ts`. Each card is a `ContentSpec` slice whose `product.summary` is the
 * card HEADLINE and whose `facts` are the card's sub-lines (split into a small `prefix` + a big
 * `value`). The split is lossless (`prefix + " " + value === <source line>`), asserted per line so the
 * rendered wording is mechanically gated against drift.
 *
 * PER-POST UNIQUE ART (#802): the cache key is POST-SCOPED (`postSlug="agent-kanban-demo"`) →
 * `_art-base-agent-kanban-demo.png`. SAFE (default, no paid spend): reuses this post's cached art when
 * present, else a deterministic 1x1 placeholder over the card's own branded dark-tile fill — ZERO paid
 * call, CI-safe. The PAID path (ONE fresh nano-banana gen with this post's OWN theme prompt) is gated
 * behind LAUNCH_CARD_PAID=1, mirroring the house *_PAID convention; a forced paid run that did not
 * produce real art HARD-FAILS (no false paid pass).
 *
 * Run: `npm run smoke:launch-card-kanban-demo`        (SAFE — cached art or placeholder, no paid call)
 *      `npm run smoke:launch-card-kanban-demo:paid`   (PAID — ONE fresh nano-banana gen + cache)
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

const REPO_URL = "https://github.com/ziyilam3999/agent-kanban";
const COPY_SRC = ".ai-workspace/plans/2026-06-20-agent-kanban-post.md";

/** agent-kanban-demo's stable slug — the post-scoped art cache key + cross-post registry key (#802). */
const KANBAN_SLUG = "agent-kanban-demo";

/**
 * agent-kanban-demo's OWN art-theme prompt (#802). Appended to the brand-safe base prompt so the gen is
 * DISTINCT from every other post's. PURELY ABSTRACT, NO-TEXT (#824): names NO labelable discrete
 * elements (no columns, no cards, no board — nano-banana would bake those as garbled text labels). Only
 * light, particles, and gradient on a cool slate "board" palette with ONE green signal accent (the
 * WORKING heartbeat motif).
 */
const KANBAN_PROMPT_EXTRA =
  "Pure abstract atmosphere only: soft luminous light moving steadily LEFT-TO-RIGHT through deep open " +
  "space (an unforced sense of work flowing forward), drifting fine particles, a gentle radial gradient " +
  "glow, and faint depth-of-field bokeh. Cool SLATE and ink-blue tones over a deep near-black field, " +
  "with ONE warm-but-alive GREEN signal accent pulsing softly (a single live heartbeat point). " +
  "Absolutely NO discrete objects — no columns, no panels, no cards, no boards, no screens, no " +
  "rectangles, no frames, no icons, no labels, no diagram — ONLY atmospheric light, particles, and " +
  "gradient on a dark field. Keep the center and upper-left calm and uncluttered for text overlaid " +
  "later. Distinct in motif from a data chart, a red-to-green test bar, or molten forge embers.";

const KANBAN_ART_OPTS: GenerateArtOnceOpts = {
  postSlug: KANBAN_SLUG,
  promptExtra: KANBAN_PROMPT_EXTRA,
};

/**
 * A minimal MASTER ContentSpec whose `product.summary` becomes the nano-banana art theme line. Only the
 * art generator consumes this; the cards carry their own per-card specs. Brand-clean, qualitative.
 */
function kanbanArtMasterSpec(): ContentSpec {
  return {
    product: {
      name: "agent-kanban",
      summary:
        "an abstract dark slate tech atmosphere of light flowing left-to-right, drifting particles, " +
        "and a single soft green heartbeat glow",
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
interface KanbanLine {
  prefix: string;
  value: string;
}
interface KanbanCard {
  id: "A" | "B" | "C" | "D";
  /** The X tweet this card backs (1-based index into the thread). */
  tweet: number;
  /** Short headline — shown as the card summary line. */
  title: string;
  /** Optional CTA line (the D card carries the real repo URL as its CTA). */
  cta?: string;
  lines: KanbanLine[];
}

/**
 * The SOURCE-OF-TRUTH X body card(s). #1063 re-cut: the operator rejected the prior FOUR single-point
 * cards ("each card only carries one point… combine them") — they were thin AND duplicated the Threads
 * over-art. Combined into ONE dense body card carrying all three feature points; the CTA renders once via
 * the template footer (product.repoUrl). The X thread is now tweet 1 = hero VIDEO, tweet 2 = this one
 * combined card. (Memory: feedback_match_card_count_to_content_density_dont_fragment_single_points.)
 */
export const KANBAN_CARDS: KanbanCard[] = [
  {
    id: "A",
    tweet: 2,
    title: "Watch your AI agent work — live",
    // "Open-source · MIT" tagline only — the repo URL renders once via the template footer (no dup, the
    // #1063 eyeball lesson).
    cta: "Open-source · MIT",
    lines: [
      { prefix: "Plan → Code → Review:", value: "the 3-role loop as columns" },
      { prefix: "🟢 WORKING shows", value: "the ticket in focus, live" },
      { prefix: "tap a ticket for the deep timeline:", value: "every step + the agent's verdict" },
    ],
  },
];

/**
 * The 4:5 Threads card-over-art — ONE infographic combining all four points + the CTA url. Same tile
 * machinery; more lines so the whole story reads on one card.
 */
export const KANBAN_OVERART: KanbanCard = {
  id: "A", // unused for the overart (its own file name), kept to satisfy the shape
  tweet: 0,
  title: "Watch your AI agent work — live",
  // "Open-source · MIT" tagline only — the repo URL renders once via the template footer (no dup).
  cta: "Open-source · MIT",
  lines: [
    { prefix: "Plan → Code → Review:", value: "the 3-role loop as columns" },
    { prefix: "🟢 WORKING shows", value: "the ticket in focus, live" },
    { prefix: "tap a ticket for the deep timeline:", value: "every step + the agent's verdict" },
    { prefix: "idle vs active", value: "reads at a glance" },
  ],
};

/** Reconstruct the full source line a `KanbanLine` encodes (lossless: prefix + " " + value). */
export function sourceLine(line: KanbanLine): string {
  return `${line.prefix} ${line.value}`;
}

function kanbanCardSpec(card: KanbanCard): ContentSpec {
  const facts: Fact[] = card.lines.map((line) => ({
    label: line.prefix,
    value: line.value,
    source: COPY_SRC,
  }));
  return {
    product: { name: "agent-kanban", summary: card.title, repoUrl: REPO_URL },
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

async function renderKanbanCard(
  card: KanbanCard,
  aspect: AspectRatio,
  outDir: string,
  fileName: string,
  artDataUri: string | undefined,
): Promise<{ outPath: string; bytes: number; fitScale: number }> {
  const spec = kanbanCardSpec(card);

  // Verbatim DOM check: buildCardHtml is what renderImage renders. Confirm every line's text is present.
  const html = buildCardHtml(spec, CONFIG.aspects[aspect], { maxFacts: card.lines.length });
  for (const line of card.lines) {
    if (!html.includes(esc(line.prefix)) || !html.includes(esc(line.value))) {
      throw new Error(
        `SMOKE FAIL: ${fileName} rendered HTML missing verbatim text "${sourceLine(line)}".`,
      );
    }
  }

  // BG choice: PAID ⇒ compose over the real nano-banana art (artDataUri present, generative:true, like
  // the sibling posts). SAFE (default) ⇒ generative:false so buildCardHtml uses its built-in DARK brand
  // radial-gradient (white text reads on it). The SAFE placeholder art is WHITE → using it as the
  // background would hide the white card text, so SAFE must NOT composite over the placeholder.
  const useArt = artDataUri !== undefined;
  let fitScale = 1;
  const outPath = await renderImage(
    { spec, copy: copyFor(spec) },
    {
      generative: useArt,
      aspect,
      outDir,
      fileName,
      maxFacts: card.lines.length,
      ...(useArt ? { genartDeps: { caller: async () => artDataUri! } } : {}), // fan the single shared art out
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
  const outDir = path.join(process.cwd(), "out", "review", "kanban", "image");
  fs.mkdirSync(outDir, { recursive: true });

  console.log(
    `→ Post 'agent-kanban-demo' card SET (${
      PAID
        ? "PAID — ONE fresh nano-banana gen for agent-kanban-demo"
        : "SAFE — reuses agent-kanban-demo cached art / placeholder, ZERO paid spend"
    })`,
  );

  // BG SOURCE. SAFE (default): the cards render over buildCardHtml's built-in DARK brand radial-gradient
  // (generative:false in renderKanbanCard) — fully branded, white text legible, ZERO paid spend. We do
  // NOT composite over the SAFE white placeholder (that would hide the white text). PAID: ONE fresh
  // nano-banana gen, fanned out behind every card (like the sibling posts).
  let artDataUri: string | undefined;
  let usedPath = "deterministic-brand-gradient";
  let kanbanSha: string | undefined;

  if (PAID) {
    artDataUri = await generateArtOnce(kanbanArtMasterSpec(), true, outDir, KANBAN_ART_OPTS);

    // CROSS-POST UNIQUENESS GUARD (#802). Hash the post-scoped art file and assert it is NOT any prior
    // post's; then register it.
    const artPng = artBasePngPath(outDir, KANBAN_SLUG);
    if (!fs.existsSync(artPng)) {
      throw new Error(
        `SMOKE FAIL: LAUNCH_CARD_PAID=1 but the real nano-banana art was not produced (no ${artPng}). ` +
          `The paid primary path did not run — refusing to report a false paid pass.`,
      );
    }
    kanbanSha = sha256File(artPng);
    const registry = loadRegistry();
    assertArtUnique(KANBAN_SLUG, kanbanSha, registry); // throws if this post would ship another post's art
    saveRegistry(registerArt(KANBAN_SLUG, kanbanSha, registry));
    usedPath = "nano-banana";
    console.log(`  art-file=${artPng}`);
    console.log(`  art-sha256(agent-kanban-demo)=${kanbanSha}`);
    console.log(`  cross-post uniqueness: PASS — agent-kanban-demo art ≠ any other post's; registered.`);
  } else {
    // SAFE: if this post's REAL nano-banana art is already cached on disk (from a prior paid run),
    // reuse it for FREE (generateArtOnce with paid=false reads the cache) so the combined card renders
    // over the operator-approved art, not the placeholder. Only switch off the dark gradient on a true
    // cache HIT — a cache miss returns a 1×1 placeholder, so we keep the legible dark gradient instead.
    const cachePng = artBasePngPath(outDir, KANBAN_SLUG);
    const cacheUri = cachePng.replace(/\.png$/i, "") + ".datauri.b64";
    if (fs.existsSync(cachePng) && fs.existsSync(cacheUri)) {
      artDataUri = await generateArtOnce(kanbanArtMasterSpec(), false, outDir, KANBAN_ART_OPTS);
      usedPath = "nano-banana-cached";
      kanbanSha = sha256File(cachePng);
      console.log(`  art-cache HIT: REUSE ${cachePng} (free — no paid call); art-sha256=${kanbanSha}`);
    } else {
      console.log("  bg: deterministic DARK brand radial-gradient (SAFE — no paid call, white text legible)");
    }
  }

  const written: { name: string; outPath: string; bytes: number }[] = [];

  // The ONE combined 1:1 body card (X tweet 2; #1063 "combine them").
  for (const card of KANBAN_CARDS) {
    const fileName = `card-kanban-${card.id}.png`;
    const { outPath, bytes, fitScale } = await renderKanbanCard(card, "1:1", outDir, fileName, artDataUri);
    written.push({ name: fileName, outPath, bytes });
    console.log(
      `  1:1 ${fileName} ("${card.title}", tweet ${card.tweet}): ${(bytes / 1024).toFixed(1)} KB → ${outPath}`,
    );
    console.log(
      `  ${fileName} fit: ${card.lines.length}/${card.lines.length} tiles within frame, scale=${fitScale.toFixed(3)}`,
    );
  }

  // The 4:5 Threads card-over-art — all four points + the CTA url on one card.
  {
    const fileName = "card-kanban-overart-4x5.png";
    const { outPath, bytes, fitScale } = await renderKanbanCard(KANBAN_OVERART, "4:5", outDir, fileName, artDataUri);
    written.push({ name: fileName, outPath, bytes });
    console.log(`  4:5 ${fileName} ("${KANBAN_OVERART.title}"): ${(bytes / 1024).toFixed(1)} KB → ${outPath}`);
    console.log(
      `  ${fileName} fit: ${KANBAN_OVERART.lines.length}/${KANBAN_OVERART.lines.length} tiles within frame, scale=${fitScale.toFixed(3)}`,
    );
  }

  console.log(
    `\nART-PATH: primary="nano-banana" used="${usedPath}" paid=${PAID ? "true" : "false"}` +
      (kanbanSha ? ` sha256="${kanbanSha}"` : ""),
  );
  console.log(`SMOKE-PATH: primary="nano-banana" used="${usedPath}" clean=true`);
  for (const w of written) console.log(`ARTIFACT: ${w.outPath} (${w.bytes} bytes)`);
  console.log(
    PAID
      ? `\nSMOKE PASS (PAID): ${written.length} agent-kanban-demo cards composed over ONE fresh nano-banana art ` +
          `(post-scoped, ≠ any other post); registered unique, real repo URL, brand-clean.`
      : `\nSMOKE PASS (SAFE): ${written.length} agent-kanban-demo cards composed over the cached art / ` +
          `placeholder; no paid call, real repo URL, brand-clean.`,
  );
}

/**
 * Only run the render when this file is the entrypoint — NOT when a unit test imports its exported
 * helpers. Without this guard, importing the module would fire a Playwright render as a side effect.
 */
function isEntrypoint(): boolean {
  const entry = process.argv[1] ?? "";
  return /(^|\/)launch-card-kanban-demo\.ts$/.test(entry) || entry.endsWith("launch-card-kanban-demo");
}

if (isEntrypoint()) {
  main().catch((err) => {
    console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
