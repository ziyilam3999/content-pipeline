/**
 * Publish-to-Typefully DRY-RUN ASSEMBLY for POST #4 — content-pipeline DEMONSTRATION post (#824).
 *
 * Post #4 is a DEMONSTRATION-category post: the 85s voiced Fable-style demo IS the hero/demo, so this
 * is a VIDEO-LED + TEXT post — NOT the introduction-post shape (video hook + per-tweet card body) used
 * by Posts #1-#3. Structure:
 *   - X: a 4-tweet thread. Tweet 1 LEADS WITH the full-bleed 9:16 voiced hero video; tweets 2-4 are
 *     TEXT (the video carries the visual — the demo IS the video, so the body tweets carry NO cards).
 *   - Threads: a single post LED WITH the same 9:16 hero video; the post copy is TEXT (no card).
 *
 * THIS SMOKE IS DRY-RUN ONLY. It NEVER creates a live Typefully draft and constructs NO network
 * client — that OUTWARD step is gated by the orchestrator on an explicit operator YES. It:
 *   1. runs the #810 publish-asset PROVENANCE gate (the hero video it would upload hash-matches the
 *      operator-approved canonical voiced render frozen in
 *      publish/manifests/content-pipeline-demo-post4.publish-manifest.json) — HARD-FAILS on drift;
 *   2. runs the #809/#827 PER-PLATFORM copy-length gate (every X tweet ≤ effective limit, Threads ≤
 *      effective limit) — HARD-FAILS over-limit;
 *   3. runs the #797 CONSOLIDATED post-assembly fidelity gate (assertPostAssemblyFidelity) over the
 *      assembled VIDEO-LED + TEXT structure and REPORTS the result. The #797 gate as written has NO
 *      demonstration-category exemption: its X-thread invariant requires EVERY worded tweet to carry
 *      media AND ≥1 card-over-art still, and its platform-primary invariant requires a worded Threads
 *      post to carry a card-over-art still. So a card-less demo post is BLOCKED by #797. Per the #824
 *      brief we do NOT generate cards to satisfy it — instead this smoke surfaces the EXACT gate
 *      requirement so the operator can decide whether demonstration-category posts use per-tweet cards
 *      or the gate gets a demo-category exemption. (We compute the precise violations via the gate's
 *      OWN pure predicates AND prove the hard gate throws — we do not fork or weaken the gate.)
 *   4. emits the DRY-RUN draft body + a committed dry-run manifest (what the live draft WOULD contain).
 *
 * Run:
 *   npm run smoke:publish-typefully-post4   (dry-run, zero network)
 *
 * There is intentionally NO `:live` variant — a card-less demo post cannot pass the #797 gate as it
 * stands, so going live is blocked on the structural decision above (not on this smoke).
 */

import * as fs from "fs";
import * as path from "path";

import { type CreateDraftBody, type DraftPost } from "../adapters/typefully";
import {
  assertPostAssemblyFidelity,
  missingPromoThreadMedia,
  missingPlatformPrimaryMedia,
  checkVideoFirst,
  detectAspectTag,
  type AspectTag,
  type PromoThread,
  type PlatformPrimaryPost,
  type HeroVideoRef,
} from "../publish/promoMedia";
import { assertCopyWithinPlatformLimits, heroVideoAdvisory } from "../publish/copyLimits";
import {
  assembleDraftBody,
  type Platform,
} from "../publish/platformSubset";
import {
  assertPublishAssetsMatchManifest,
  loadManifest,
  type PublishAsset,
} from "../publish/publishProvenance";
import { POST_ASSETS } from "../publish/publishAssets";
import { CONFIG } from "../config";

// ── Sources ────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "..");

// The copy lives in the GIT-TRACKED in-repo archive mirror (committed for #824), with an inline
// VERBATIM fallback so the dry-run still assembles in a fresh checkout / CI.
const POST4_COPY_JSON = path.join(
  REPO_ROOT,
  ".ai-workspace",
  "posts",
  "post4-content-pipeline-demo-copy.json",
);

// The canonical voiced 3-aspect renders live in the gitignored out/review/fable working dir of THIS
// worktree (where the #824 capture+voice+caption pipeline wrote them). Override with $FABLE_DIR.
const FABLE_DIR = process.env.FABLE_DIR ?? path.join(REPO_ROOT, "out", "review", "fable");

// HERO video aspect — config-driven (#794): the lead video everywhere is the full-bleed phone cut.
const HERO_ASPECT_TAG = CONFIG.publish.heroVideoAspect.replace(":", "x") as AspectTag; // "9x16"
const DEMO_HERO = path.join(FABLE_DIR, `fable-voiced-${HERO_ASPECT_TAG}.mp4`); // 9:16 voiced hero

const SOCIAL_SET_ID = process.env.TYPEFULLY_SOCIAL_SET_ID ?? "312308";
const DRAFT_TITLE = "content-pipeline demo — Post 4";
const POST_SLUG = "content-pipeline-demo-post4" as const;

// Where the committed dry-run manifest (the exact draft the live step WOULD create) is written.
const DRYRUN_MANIFEST_PATH = path.join(
  REPO_ROOT,
  "publish",
  "manifests",
  `${POST_SLUG}.dryrun-manifest.json`,
);

// ── Fallback copy (VERBATIM mirror of post4-content-pipeline-demo-copy.json) ──────────────────────

const FALLBACK_X_THREAD: string[] = [
  'Most software has buttons. This one has none.\n\nYou don\'t learn content-pipeline — you just ask Claude Code, in plain English: "build me a launch post." The AI agent drives the tool and hands back the finished assets.\n\nWatch 👇',
  "One plain-English ask becomes the whole post: the written copy, an image card, and a captioned video in 3 shapes — square, vertical, and portrait.\n\nEverything is built from the same facts you gave it, so the pieces never contradict each other.",
  "The part I like: a built-in checker reads every number and claim in the copy and flags anything that doesn't match the facts you provided.\n\nSo the agent moves fast, but it can't quietly make things up.",
  "It's a content tool built to be run by an AI agent, not a person — so there's no UI to learn. You just describe what you want and the agent builds it.\n\nIt's open-source, MIT licensed, and free to use 👇\ngithub.com/ziyilam3999/content-pipeline",
];

const FALLBACK_THREADS_TEXT = `Most software has buttons. content-pipeline has none.

You don't learn it — you ask Claude Code in plain English: "build me a launch post." The AI agent drives it and hands back the pieces: copy, an image card, and a captioned video in 3 shapes.

A built-in checker flags any number or claim that doesn't match your facts — fast, but it can't quietly make things up.

Open-source, MIT, free to use. No UI to learn — just describe what you want 👇
github.com/ziyilam3999/content-pipeline`;

interface Post4Copy {
  xThread: string[];
  threadsText: string;
}

function readPost4Copy(): Post4Copy {
  if (!fs.existsSync(POST4_COPY_JSON)) {
    console.log(`(post-4 copy json not found at ${POST4_COPY_JSON} — using inline fallback copy)`);
    return { xThread: FALLBACK_X_THREAD, threadsText: FALLBACK_THREADS_TEXT };
  }
  const json = JSON.parse(fs.readFileSync(POST4_COPY_JSON, "utf8")) as {
    x_thread?: unknown;
    threads_post?: unknown;
  };
  const arr = json.x_thread;
  if (!Array.isArray(arr) || arr.length !== 4 || !arr.every((s) => typeof s === "string")) {
    throw new Error(
      `expected x_thread to be 4 strings in ${POST4_COPY_JSON}, got ${JSON.stringify(arr)?.slice(0, 120)}`,
    );
  }
  const threadsText = json.threads_post;
  if (typeof threadsText !== "string" || threadsText.trim().length === 0) {
    throw new Error(`expected a non-empty threads_post string in ${POST4_COPY_JSON}`);
  }
  return { xThread: arr as string[], threadsText };
}

function assertFile(label: string, p: string): number {
  if (!fs.existsSync(p)) {
    throw new Error(
      `SMOKE FAIL: missing ${label} at ${p} (render the #824 voiced Fable demo first; the canonical ` +
        `9:16 voiced hero is out/review/fable/fable-voiced-9x16.mp4)`,
    );
  }
  return fs.statSync(p).size;
}

// ── Assembly (VIDEO-LED + TEXT — no cards) ───────────────────────────────

/**
 * The X thread as a PromoThread: tweet 1 carries the hero video; tweets 2-4 are TEXT (no media). This
 * is the EXACT structure the #797 gate runs against — and (deliberately, for a demo post) it is the
 * structure that gate BLOCKS, because its X-thread invariant requires every worded tweet to carry
 * media. We build it faithfully so the reported violations are the real ones.
 */
function buildPromoThread(xThread: string[]): PromoThread {
  return {
    units: xThread.map((text, i) =>
      i === 0
        ? { text: [text], stills: [], videos: [{ path: DEMO_HERO }] }
        : { text: [text], stills: [], videos: [] },
    ),
  };
}

/** The Threads single post: VIDEO-LED, TEXT copy, NO card. media = [hero video] only. */
function buildThreadsPrimaryPost(threadsText: string): PlatformPrimaryPost {
  return {
    label: "Threads",
    text: [threadsText],
    media: [{ path: DEMO_HERO, kind: "video" }],
    mixAllowed: true,
  };
}

/** Build the DRY-RUN Typefully draft body (placeholder media ids). */
function buildDraftBody(
  platforms: Platform[],
  xThread: string[],
  threadsText: string,
  heroMediaId: string,
): CreateDraftBody {
  const xPosts: DraftPost[] = xThread.map((text, i) => ({
    text,
    media_ids: i === 0 ? [heroMediaId] : [], // tweet 1 = video; tweets 2-4 = text (no media)
  }));
  const threadsPosts: DraftPost[] = [{ text: threadsText, media_ids: [heroMediaId] }];
  return assembleDraftBody(platforms, {
    xPosts,
    threadsPosts,
    draftTitle: DRAFT_TITLE,
    share: false,
  });
}

// ── Main ───────────────────────────────────────────────────────────────

function main(): void {
  const platforms: Platform[] = ["x", "threads"];
  const { xThread, threadsText } = readPost4Copy();

  console.log("POST #4 (content-pipeline — a content tool with no buttons) — DEMO publish assembly\n");
  console.log("category=demonstration structure=VIDEO-LED + TEXT (hero video carries the demo; no cards)\n");

  // ── #810 PROVENANCE GATE (BOTH the X hook video AND the Threads lead video are the SAME hero —
  // uploaded once). Re-hash the hero we would upload + assert it matches the approved frozen render.
  const heroSize = assertFile("9:16 voiced hero", DEMO_HERO);
  const provenanceAssets: PublishAsset[] = POST_ASSETS[POST_SLUG].assets.map((a) => ({
    role: a.role,
    path: path.join(FABLE_DIR, a.basename),
  }));
  assertPublishAssetsMatchManifest(provenanceAssets, loadManifest(POST_SLUG));
  console.log(
    `PROVENANCE: PASS — hero ${path.basename(DEMO_HERO)} (${(heroSize / 1024 / 1024).toFixed(2)} MB) ` +
      `sha256-matches the approved ${POST_SLUG} manifest (#810)`,
  );

  // ── #809/#827 COPY-LENGTH GATE.
  assertCopyWithinPlatformLimits({ xThread, threadsText });
  console.log(
    `COPY-LIMITS: PASS — 4 X tweets ≤${CONFIG.publish.copyLimits.xTweet - CONFIG.publish.copyLimits.safetyMargin} ` +
      `weighted (URLs=23, \\n=+1), Threads post ≤${CONFIG.publish.copyLimits.threads - CONFIG.publish.copyLimits.safetyMargin} ` +
      `chars (#809/#827)`,
  );

  // ── #809 hero-dimension advisory (non-fatal).
  const advisory = heroVideoAdvisory(CONFIG.aspects[CONFIG.publish.heroVideoAspect]);
  if (advisory.flagged) console.log(advisory.message);

  // Per-unit media map (what each unit would carry).
  console.log("\nX thread media map (4 tweets — tweet 1 = VIDEO, tweets 2-4 = TEXT, no cards):");
  console.log(`  • X tweet 1 (HOOK)  video         ${path.basename(DEMO_HERO)}  (${(heroSize / 1024 / 1024).toFixed(2)} MB)`);
  for (let i = 2; i <= 4; i++) console.log(`  • X tweet ${i}        text          (no media)`);
  console.log("Threads post media map (VIDEO LEADS, text copy, no card):");
  console.log(`  • Threads media[0]  video         ${path.basename(DEMO_HERO)}  (${(heroSize / 1024 / 1024).toFixed(2)} MB)`);

  // ── #797 CONSOLIDATED FIDELITY GATE. Build the real video-led+text assembly and REPORT the result.
  const promoThread = buildPromoThread(xThread);
  const threadsPost = buildThreadsPrimaryPost(threadsText);
  const heroVideos: HeroVideoRef[] = [
    { videoPath: DEMO_HERO, label: "X tweet-1 hook" },
    { videoPath: DEMO_HERO, label: "Threads hero" },
  ];

  // Hero-aspect sub-check (this PASSES — the hero IS the 9:16 cut).
  const heroTag = detectAspectTag(DEMO_HERO);
  console.log(`\n#797 sub-check hero-aspect: hero tag=${heroTag} (expected ${HERO_ASPECT_TAG}) — ${heroTag === HERO_ASPECT_TAG ? "PASS" : "FAIL"}`);

  // Compute the EXACT violations using the gate's OWN pure predicates (no fork, no weakening).
  const xViolations = missingPromoThreadMedia(promoThread);
  const threadsViolations = missingPlatformPrimaryMedia(threadsPost);

  let fidelityBlocked = false;
  try {
    assertPostAssemblyFidelity({
      xThread: promoThread,
      platformPosts: [threadsPost],
      heroVideos,
      heroAspectTag: HERO_ASPECT_TAG,
    });
    console.log("\nFIDELITY: PASS — assertPostAssemblyFidelity accepted the video-led+text demo layout.");
  } catch (err) {
    fidelityBlocked = true;
    console.log("\n────────────────────────────────────────────────────────────────────────────");
    console.log("FIDELITY: BLOCKED-PENDING-DECISION — #797 gate REJECTS this card-less demo post.");
    console.log("────────────────────────────────────────────────────────────────────────────");
    console.log("STRUCTURAL DECISION REQUIRED (operator). The #797 gate (publish/promoMedia.ts) has");
    console.log("NO demonstration-category exemption. As written it HARD-REQUIRES per-tweet cards:");
    console.log(`  • X thread violations:   ${xViolations.join(", ")}`);
    console.log(`  • Threads violations:    ${threadsViolations.join(", ")}`);
    console.log("Meaning, to pass #797 UNCHANGED this demo post would need:");
    console.log("  (a) a card-over-art still on EVERY worded X tweet (tweets 2-4 are currently text-only);");
    console.log("  (b) at least one card-over-art still in the X thread; and");
    console.log("  (c) a card-over-art still on the worded Threads post.");
    console.log("Per the #824 brief we did NOT generate cards. The operator decides: either");
    console.log("  (1) demonstration-category posts DO carry per-tweet cards (generate them), or");
    console.log("  (2) the #797 gate gets a demonstration-category exemption (video-led + text allowed).");
    console.log(`(gate threw: ${err instanceof Error ? err.message.split("\n")[0] : String(err)})`);
    console.log("────────────────────────────────────────────────────────────────────────────");
  }

  // Soft video-first ordering check (advisory).
  const vf = checkVideoFirst(promoThread);
  console.log(
    `\nvideo-first soft-check: videoUnitIsFirst=${vf.videoUnitIsFirst} ` +
      `(video on unit ${vf.videoUnitIndex + 1}, first media-bearing unit ${vf.firstMediaUnitIndex + 1})`,
  );

  // ── DRY-RUN draft body + committed manifest (what the LIVE draft WOULD contain). Emitted regardless
  // of the #797 decision so the operator can SEE the proposed draft. ZERO network calls; no client.
  const heroMediaId = `<upload:${path.basename(DEMO_HERO)}>`;
  const body = buildDraftBody(platforms, xThread, threadsText, heroMediaId);
  console.log(`\nsocial_set_id: ${SOCIAL_SET_ID}`);
  console.log("draft body (DRY-RUN — placeholder media id, no publish_at ⇒ DRAFT):");
  console.log(JSON.stringify(body, null, 2));

  const dryRunManifest = {
    postSlug: POST_SLUG,
    category: "demonstration",
    structure: "video-led+text",
    generatedAt: new Date().toISOString(),
    mode: "dry-run",
    liveDraftCreated: false,
    socialSetId: SOCIAL_SET_ID,
    draftTitle: DRAFT_TITLE,
    heroAspect: CONFIG.publish.heroVideoAspect,
    gates: {
      provenance810: "PASS",
      copyLimits809: "PASS",
      fidelity797: fidelityBlocked ? "BLOCKED-PENDING-DECISION" : "PASS",
      fidelity797Requires: fidelityBlocked
        ? { xThread: xViolations, threads: threadsViolations, exemption: "none" }
        : null,
    },
    platforms: {
      x: {
        posts: xThread.map((text, i) => ({
          unit: i + 1,
          media: i === 0 ? [{ kind: "video", file: path.basename(DEMO_HERO) }] : [],
          text,
        })),
      },
      threads: {
        posts: [
          {
            unit: 1,
            media: [{ kind: "video", file: path.basename(DEMO_HERO) }],
            text: threadsText,
          },
        ],
      },
    },
    draftBody: body,
  };
  fs.writeFileSync(DRYRUN_MANIFEST_PATH, JSON.stringify(dryRunManifest, null, 2) + "\n");
  console.log(`\nDRY-RUN MANIFEST: wrote ${DRYRUN_MANIFEST_PATH}`);

  console.log(
    `\nPUBLISH-TYPEFULLY-POST4: mode=dry-run posts=x:${body.platforms.x?.posts.length ?? 0},` +
      `threads:${body.platforms.threads?.posts.length ?? 0} media=2 (shared hero) ` +
      `fidelity=${fidelityBlocked ? "BLOCKED-PENDING-DECISION" : "PASS"} liveDraft=NONE`,
  );
  process.exit(0);
}

main();
