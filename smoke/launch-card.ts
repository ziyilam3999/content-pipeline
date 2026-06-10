/**
 * Launch CARD-OVER-ART generator (#787, #787-followup) — the lfah launch promo info-cards.
 *
 * Operator rule (#787-followup): EVERY worded post unit must carry its OWN distinct
 * card-over-art infographic. For an X THREAD that means EACH tweet gets its own card-over-art
 * (not one shared hero for the whole thread). "Infographic is more attractive." So this smoke
 * now produces a SET of per-tweet cards — one curated info-card per worded tweet — plus a 4:5
 * hero card for Threads.
 *
 * Produces, from the LOCKED n=13 facts in `lfahSpec()`:
 *   out/review/lfah/image/card-tweet-{1..5}.png   (1080x1080, the X aspect — one PER tweet)
 *   out/review/lfah/image/card-over-art-4x5.png   (1080x1350, the Threads hero)
 *
 * Each per-tweet card is a DERIVED ContentSpec slice: `lfahSpec().facts` filtered to exactly the
 * labels that tweet talks about, plus a tweet-specific headline (title) and highlight/cta. The
 * card text is therefore spec-driven and carries the n=13 numbers (13 / 54% / 62% / 77% / $15.7 /
 * $35.0 / 55%), never the retired 74-/27-bug figures. The existing card machinery is reused
 * verbatim (selectFacts / buildCardHtml via renderImage({generative:true})) — no new renderer.
 *
 * SHARED-ART mode (the operator's choice): the nano-banana background art is generated ONCE and
 * the SAME data URI is reused behind ALL the distinct info-cards — so it is ONE paid gen reused
 * behind 5+ cards, not one paid call per card. `generateArtOnce()` returns that single data URI;
 * the renders fan it out via an injected caller.
 *
 * SAFE BY DEFAULT (CI / no spend): in the default unpaid path the shared art is a DETERMINISTIC
 * 1x1 placeholder — proves the per-tweet composition path + asserts each card's n=13 facts, spends
 * nothing, calls no model. The PAID path (real nano-banana, ONE gen) is gated behind
 * LAUNCH_CARD_PAID=1, mirroring the house *_PAID convention.
 *
 * PRIMARY-ONLY: a failed real gen throws (genart has no silent gradient fallback by design) — the
 * real error surfaces; the GEMINI key is never printed or logged.
 *
 * LESSON (#787-followup, prevent the lost-PNG repeat): the PNGs this smoke writes land under the
 * gitignored `out/` tree — they are RUNTIME ARTIFACTS, never committed. If you ever clean/remove a
 * worktree, COPY any paid renders to a durable path FIRST; a `git worktree remove` or a quarantine
 * `mv` will take the un-copied PNGs with it.
 *
 * Run: `npm run smoke:launch-card`        (SAFE — no paid call)
 *      `npm run smoke:launch-card:paid`   (PAID — ONE real nano-banana gen reused for all cards)
 *        Key from $GEMINI_API_KEY or macOS Keychain (service "GEMINI_API_KEY").
 */

import * as fs from "fs";
import * as path from "path";

import { generateArt, type ArtCaller } from "../adapters/genart";
import { renderImage } from "../adapters/image";
import { CONFIG, type AspectRatio } from "../config";
import { selectFacts } from "../image/card";
import { type ContentSpec } from "../inputs/contentspec";
import { type CopyResult } from "../pipeline/run";
import { lfahSpec } from "./lfahSpec";

const PAID = process.env.LAUNCH_CARD_PAID === "1";

// Per-tweet cards are curated subsets, so each card shows just its own tweet's tiles. A small cap
// is plenty (the densest card, the comparison, has 6 tiles). The 4:5 hero shows the full story.
const MAX_FACTS_PER_CARD = 8;
const MAX_FACTS_HERO = 18;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A tiny VALID 1x1 PNG data URI — used ONLY in SAFE mode so no paid call is made. */
const PLACEHOLDER_ART_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function isPng(buf: Buffer): boolean {
  return buf.length > 8 && buf.subarray(0, 8).equals(PNG_MAGIC);
}

// ── Per-tweet card SET specs ─────────────────────────────────────────────
//
// Map ONE card per worded tweet of the launch X thread (out/copy/lfah-launch-content.json →
// x_thread, 5 tweets). Each spec names the LABELS from lfahSpec().facts that tweet talks about,
// plus a tweet-specific headline (becomes the card's product.summary) and a curated highlight/cta.

export interface CardSpec {
  /** Stable id → file name `card-tweet-{id}.png`. */
  id: number;
  /** The tweet's short headline — shown as the card summary line. */
  headline: string;
  /** Exact `Fact.label`s from lfahSpec() this card surfaces (the curated n=13 subset). */
  factLabels: string[];
  /** Optional highlight line (for the numberless rigor card). */
  highlight?: string;
  /** Optional CTA override (the CTA card). */
  cta?: string;
}

/** The launch thread's per-tweet card map — 5 cards, one per worded tweet. n=13 figures ONLY. */
export const LAUNCH_CARD_SET: CardSpec[] = [
  {
    id: 1,
    headline: "Executor runs LOCAL at 0% cost — still 62% on 13 SWE-bench Verified bugs",
    factLabels: [
      "executor (local) cost share",
      "local-first hybrid resolved (with cloud fallback)",
      "tasks evaluated",
    ],
  },
  {
    id: 2,
    headline: "The honest resolve rates on the same 13 tasks",
    factLabels: [
      "full-cloud relay resolved",
      "local-first hybrid resolved (with cloud fallback)",
      "1-shot Opus resolved",
    ],
  },
  {
    id: 3,
    headline: "$35.0 → $15.7: 55% cheaper on the same chain",
    factLabels: [
      "full-cloud relay total cost",
      "local-first hybrid total cost",
      "cost saving vs full-cloud (same chain)",
    ],
  },
  {
    id: 4,
    headline:
      "Graded by the real SWE-bench Docker oracle — not an LLM judge; executor runs free locally",
    factLabels: ["executor (local) cost share"],
    highlight: "graded by the real SWE-bench Docker test oracle, never an LLM judge",
  },
  {
    id: 5,
    headline: "Try it",
    factLabels: ["tasks evaluated"],
    cta: "pip install git+https://github.com/ziyilam3999/local-first-agent-harness",
  },
];

/**
 * Derive a per-tweet sub-spec from the master lfah spec: keep ONLY the facts whose label is in
 * `card.factLabels` (the curated n=13 slice for this tweet), set the card's headline as the
 * summary line, and curate the highlight/cta. Reuses the master product identity + sources so the
 * rendered card is the same proven card machinery, just fact-filtered per tweet.
 *
 * Throws if a named label is absent from lfahSpec() — that means the map drifted from the facts
 * (a stale-card guard: you cannot ship a card claiming a fact the spec doesn't carry).
 */
export function deriveCardSpec(master: ContentSpec, card: CardSpec): ContentSpec {
  const facts = card.factLabels.map((label) => {
    const f = master.facts.find((x) => x.label === label);
    if (!f) {
      throw new Error(
        `SMOKE FAIL: card-tweet-${card.id} references unknown fact label "${label}" — ` +
          `the per-tweet card map has drifted from lfahSpec().facts.`,
      );
    }
    return f;
  });
  return {
    product: {
      name: master.product.name,
      summary: card.headline,
      repoUrl: master.product.repoUrl,
    },
    facts,
    highlights: card.highlight ? [card.highlight] : [],
    ctas: [card.cta ?? master.ctas[0] ?? ""],
    sourceFiles: master.sourceFiles,
  };
}

/** The full per-tweet card SET as derived sub-specs (one ContentSpec slice per worded tweet). */
export function launchCardSet(
  master: ContentSpec = lfahSpec(),
): { card: CardSpec; spec: ContentSpec }[] {
  return LAUNCH_CARD_SET.map((card) => ({ card, spec: deriveCardSpec(master, card) }));
}

/**
 * Generate the shared background art ONCE. In PAID mode this is the single real nano-banana call
 * whose data URI is reused behind every info-card (one paid gen, N cards). In SAFE mode it returns
 * the deterministic placeholder — no model call, no spend.
 */
export async function generateArtOnce(master: ContentSpec, paid: boolean): Promise<string> {
  if (!paid) return PLACEHOLDER_ART_DATA_URI;
  console.log("→ generating ONE real creative background via nano-banana (PAID Gemini)…");
  // Generous per-attempt timeout: nano-banana image gen can run well past the 120s default.
  const art = await generateArt(master, undefined, { timeoutMs: 240_000 }); // primary-only: throws on failure
  console.log("  " + art.pathLine);
  const artBytes = Buffer.from(art.dataUri.slice(art.dataUri.indexOf(",") + 1), "base64").length;
  if (artBytes < 5000) {
    throw new Error(`SMOKE FAIL: nano-banana art suspiciously small (${artBytes} bytes)`);
  }
  console.log(`  art: ${(artBytes / 1024).toFixed(1)} KB (reused for all cards — single paid call)`);
  return art.dataUri;
}

/**
 * Assert a derived card sub-spec carries the n=13 facts it is supposed to (defense against a card
 * that silently drops or mutates its mapped figures). selectFacts is the exact selector
 * buildCardHtml uses, so checking it proves the rendered tiles carry the locked label+value pairs.
 */
function assertCardFacts(card: CardSpec, spec: ContentSpec): void {
  const fed = selectFacts(spec, MAX_FACTS_PER_CARD);
  for (const label of card.factLabels) {
    const got = fed.find((f) => f.label === label);
    if (!got) {
      throw new Error(
        `SMOKE FAIL: card-tweet-${card.id} missing mapped fact "${label}" in its rendered tiles.`,
      );
    }
  }
  // Guard against the retired figures sneaking into any card.
  const stale = fed.filter((f) => /\b(74|27)\b/.test(f.value) || /\b83\.8\b/.test(f.value));
  if (stale.length > 0) {
    throw new Error(
      `SMOKE FAIL: card-tweet-${card.id} carries a retired figure (${stale
        .map((f) => f.value)
        .join(", ")}) — must be n=13 only.`,
    );
  }
  const shown = card.factLabels.map((l) => {
    const f = spec.facts.find((x) => x.label === l)!;
    return `${f.value}`;
  });
  console.log(`  card-tweet-${card.id} facts verified: ${shown.join(", ")}`);
}

function copyFor(spec: ContentSpec): CopyResult {
  return {
    thread: spec.highlights.slice(),
    script: spec.product.summary,
    labels: spec.facts.slice(0, 3).map((f) => `${f.label} ${f.value}`),
  };
}

async function renderCard(
  spec: ContentSpec,
  aspect: AspectRatio,
  outDir: string,
  fileName: string,
  artDataUri: string,
  maxFacts: number,
): Promise<{ outPath: string; bytes: number }> {
  const caller: ArtCaller = async () => artDataUri; // fan the single art out — no further generation
  const outPath = await renderImage(
    { spec, copy: copyFor(spec) },
    { generative: true, aspect, outDir, fileName, maxFacts, genartDeps: { caller } },
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
  // Deliverable PNGs must be non-empty (>5KB). In SAFE mode the card sits over a deterministic 1x1
  // placeholder yet the rendered card itself (text tiles on a dark fill) is well over 5KB.
  if (buf.length < 5 * 1024) {
    throw new Error(`SMOKE FAIL: ${fileName} suspiciously small (${buf.length} bytes, want >5KB).`);
  }
  return { outPath, bytes: buf.length };
}

async function main(): Promise<void> {
  const master = lfahSpec();
  const outDir = path.join(process.cwd(), "out", "review", "lfah", "image");
  fs.mkdirSync(outDir, { recursive: true });

  console.log(
    `→ launch per-tweet card SET (${
      PAID
        ? "PAID — ONE real nano-banana gen reused for all cards"
        : "SAFE — deterministic placeholder art"
    })`,
  );

  // ONE generative source reused behind EVERY card → at most ONE paid call.
  const artDataUri = await generateArtOnce(master, PAID);

  const written: { name: string; outPath: string; bytes: number }[] = [];

  // The per-tweet card SET — one distinct info-card per worded tweet (1:1, the X aspect).
  for (const { card, spec } of launchCardSet(master)) {
    assertCardFacts(card, spec);
    const fileName = `card-tweet-${card.id}.png`;
    const { outPath, bytes } = await renderCard(
      spec,
      "1:1",
      outDir,
      fileName,
      artDataUri,
      MAX_FACTS_PER_CARD,
    );
    written.push({ name: fileName, outPath, bytes });
    console.log(`  1:1 ${fileName}: ${(bytes / 1024).toFixed(1)} KB → ${outPath}`);
  }

  // The 4:5 hero/Threads card — the whole honest n=13 story on one card.
  {
    const fileName = "card-over-art-4x5.png";
    const { outPath, bytes } = await renderCard(
      master,
      "4:5",
      outDir,
      fileName,
      artDataUri,
      MAX_FACTS_HERO,
    );
    written.push({ name: fileName, outPath, bytes });
    console.log(`  4:5 ${fileName}: ${(bytes / 1024).toFixed(1)} KB → ${outPath}`);
  }

  console.log(
    `\nSMOKE-PATH: primary="nano-banana" used="${PAID ? "nano-banana" : "placeholder"}" clean=true`,
  );
  for (const w of written) console.log(`ARTIFACT: ${w.outPath} (${w.bytes} bytes)`);
  console.log(
    PAID
      ? `\nSMOKE PASS: ${written.length} launch info-cards generated over ONE real nano-banana art (n=13 facts).`
      : `\nSMOKE PASS (SAFE): ${written.length} per-tweet info-cards composed with n=13 facts; set LAUNCH_CARD_PAID=1 for the real art.`,
  );
}

main().catch((err) => {
  // Never leak the key: genart's errors are key-free by design; print the message only.
  console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
