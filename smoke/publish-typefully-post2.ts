/**
 * Publish-to-Typefully smoke for POST #2 ("lfah is a BUILDER") — #801. Assembles the Post #2 launch
 * DRAFT and either prints it (DRY-RUN, default) or actually creates it (LIVE, gated — orchestrator
 * only). This is a SIBLING of smoke/publish-typefully.ts (Post #1): it REUSES the SAME assembly
 * helpers (`PromoThread`, `PlatformPrimaryPost`) and the SAME consolidated #797 fidelity gate
 * (`assertPostAssemblyFidelity`) from publish/promoMedia — it does NOT fork the gate logic. The only
 * thing that differs from Post #1 is the COPY, the VIDEO bundle, and the CARDS:
 *
 *   - Post #1 = the bug-fixer launch (a 5-tweet X thread + a Threads post, demo-9x16.mp4 hero).
 *   - Post #2 = the BUILDER / dogfood story (a 4-TWEET X thread + a Threads post, builder-demo-9x16
 *     hero, card-post2-{A,B,C}.png body cards).
 *
 * THE PRINCIPLE (#792, baked in publish/promoMedia.ts): EVERY platform's primary worded post LEADS
 * WITH VIDEO and every worded unit ALSO carries its card-over-art infographic. Post #2 realization:
 *   - X (no image+video mixing in one tweet): SPLIT into a video HOOK tweet (builder-demo-9x16.mp4,
 *     the full-bleed 9:16 phone HERO — #794) + 3 card body tweets (card-post2-{A,B,C}.png). 4 tweets
 *     total. Modeled as a PromoThread.
 *   - Threads (mixed-media carousel): a SINGLE post whose media is ORDERED [builder-demo-9x16.mp4
 *     (HERO/lead, full-bleed 9:16), card-post2-A.png (second)]. VIDEO LEADS, CARD PRESENT. Modeled as
 *     a PlatformPrimaryPost so the gate can require media[0] to be the 9:16 hero video.
 *
 * #794: the hero video EVERYWHERE it leads is the full-bleed 9:16 phone-native cut, config-driven via
 * CONFIG.publish.heroVideoAspect and enforced by the #797 gate's hero-aspect check.
 *
 * The REAL assembled draft is checked through the ONE consolidated `assertPostAssemblyFidelity`
 * (#797) — so a check can NEVER be wired-one-forget-another. The SOFT `checkVideoFirst` ordering rule
 * is logged.
 *
 * DRY-RUN (default): print the per-tweet media map + the full draft JSON body (media ids shown as
 * placeholders like `<upload:builder-demo-9x16.mp4>`), assert every media file exists + print sizes,
 * run the gate, make ZERO network calls (no Typefully client is even constructed), and print:
 *     FIDELITY: PASS
 *     PUBLISH-TYPEFULLY-POST2: mode=dry-run posts=x:4,threads:1 media=6
 *
 * LIVE (TYPEFULLY_LIVE=1): upload the media via the presigned flow, then create the draft with the
 * real media ids. This path is for the ORCHESTRATOR to run AFTER explicit operator authorization — it
 * actually spends a live Typefully call. The dry-run path makes none, constructs no client, and never
 * touches the network.
 *
 * Run:
 *   npm run smoke:publish-typefully-post2        (dry-run, zero network)
 *   npm run smoke:publish-typefully-post2:live   (LIVE — orchestrator only, post operator go)
 *
 * social_set_id from env TYPEFULLY_SOCIAL_SET_ID (default 312308).
 */

import * as fs from "fs";
import * as path from "path";

import {
  TypefullyClient,
  type CreateDraftBody,
  type DraftPost,
} from "../adapters/typefully";
import {
  assertPostAssemblyFidelity,
  checkVideoFirst,
  type AspectTag,
  type PromoThread,
  type PlatformPrimaryPost,
} from "../publish/promoMedia";
import { assertCopyWithinPlatformLimits, heroVideoAdvisory } from "../publish/copyLimits";
import { threadLengthAdvisory } from "../publish/publishVerify";
import { CONFIG } from "../config";

// ── Sources ────────────────────────────────────────────────────────────

/**
 * The gitignored out/ artifacts live in the PRIMARY checkout, not in a worktree. Resolve them from
 * the primary repo root. Default to this machine's primary clone; override with
 * $CONTENT_PIPELINE_PRIMARY for portability (mirrors smoke/publish-typefully.ts).
 */
const PRIMARY_ROOT =
  process.env.CONTENT_PIPELINE_PRIMARY ?? "/Users/ansonlam/coding_projects/content-pipeline";

const POST2_COPY_JSON = path.join(PRIMARY_ROOT, "out", "copy", "lfah-post2-builder-content.json");
const IMAGE_DIR = path.join(PRIMARY_ROOT, "out", "review", "lfah", "image");
// Post #2's 3-aspect voiced builder demo lives in its own review dir (mirrors Post #1's
// demo-multi-aspect dir, but for the builder bundle).
const DEMO_DIR = path.join(PRIMARY_ROOT, "out", "review", "lfah", "demo-builder");

// HERO video aspect — config-driven (#794), NOT a magic hard-code. The lead video of every
// phone-first platform (X hook tweet, Threads hero post) is the full-bleed phone cut.
// `CONFIG.publish.heroVideoAspect` is "9:16"; the filename tag is the `WxH` form ("9x16").
const HERO_ASPECT_TAG = CONFIG.publish.heroVideoAspect.replace(":", "x") as AspectTag; // "9x16"
const DEMO_HERO = path.join(DEMO_DIR, `builder-demo-${HERO_ASPECT_TAG}.mp4`); // 9:16 hero — leads X + Threads
const CARD_POST2 = (letter: "A" | "B" | "C") => path.join(IMAGE_DIR, `card-post2-${letter}.png`);

const SOCIAL_SET_ID = process.env.TYPEFULLY_SOCIAL_SET_ID ?? "312308";
const DRAFT_TITLE = "lfah launch — Post 2 (builder)";

/**
 * Fallback Post #2 copy (used only if the gitignored runtime json is absent, e.g. in CI) so the
 * dry-run still assembles + asserts. Mirrors out/copy/lfah-post2-builder-content.json VERBATIM —
 * public benchmark facts only, brand-clean. x_thread is 4 strings (hook + 3 body), threads_post is
 * the single Threads post copy.
 */
const FALLBACK_X_THREAD: string[] = [
  "Last week: our coding agent fixes real bugs cheaply.\n\nThe bigger story — it doesn't just fix bugs. It BUILDS whole apps, test-first.\n\nProof: the pipeline that produced last week's launch video & cards was built by the agent itself, one phase at a time. All green. 🧵",
  "We handed it failing tests and let it build the thing.\n\n• 13 build phases → all 13 shipped (100%)\n• 11 passed on the first try\n• every phase graded by the project's REAL test suite (jest), never an LLM judge\n\n(13 build phases of one app — not last week's 13 bugs.)",
  "The cost is the punchline:\n\n• $12.56 total cloud spend for the entire build\n• ~85% of phases solved by a FREE local model\n• the cloud only stepped in for the 2 hardest phases\n• about $0.97 per phase\n\nHeavy lifting runs local. Cloud is the rescue, not the default.",
  "The loop in one line: failing test → a local model writes code until it's green → ships only when the real test suite AND an independent check both agree → next phase.\n\nSame local-first DNA as the bug-fixer, now building whole apps.\n\nTry it → pip install git+https://github.com/ziyilam3999/local-first-agent-harness",
];

const FALLBACK_THREADS_TEXT = `Our coding agent doesn't just fix bugs — it builds whole apps, test-first.

The proof: the pipeline that made last week's launch video was built by the agent itself. 13 build phases, all shipped, $12.56 total cloud spend — ~85% done by a free local model, the cloud only rescuing the 2 hardest.

Every phase had to pass the project's real test suite (jest), not an LLM judge. Same local-first DNA as the bug-fixer, pointed at greenfield work.

Try it: pip install git+https://github.com/ziyilam3999/local-first-agent-harness`;

// ── Helpers ────────────────────────────────────────────────────────────

interface Post2Copy {
  xThread: string[];
  threadsText: string;
}

/**
 * Read the Post #2 copy from the gitignored runtime json, falling back to the inline VERBATIM copy
 * when absent (CI / fresh checkout) so the dry-run still assembles + asserts. The x_thread MUST be
 * exactly 4 strings (hook + 3 body tweets); threads_post MUST be a non-empty string.
 */
function readPost2Copy(): Post2Copy {
  if (!fs.existsSync(POST2_COPY_JSON)) {
    console.log(`(post-2 copy json not found at ${POST2_COPY_JSON} — using inline fallback copy)`);
    return { xThread: FALLBACK_X_THREAD, threadsText: FALLBACK_THREADS_TEXT };
  }
  const raw = fs.readFileSync(POST2_COPY_JSON, "utf8");
  const json = JSON.parse(raw) as { x_thread?: unknown; threads_post?: unknown };
  const arr = json.x_thread;
  if (!Array.isArray(arr) || arr.length !== 4 || !arr.every((s) => typeof s === "string")) {
    throw new Error(
      `expected x_thread to be 4 strings in ${POST2_COPY_JSON}, got ${JSON.stringify(arr)?.slice(0, 120)}`,
    );
  }
  const threadsText = json.threads_post;
  if (typeof threadsText !== "string" || threadsText.trim().length === 0) {
    throw new Error(`expected a non-empty threads_post string in ${POST2_COPY_JSON}`);
  }
  return { xThread: arr as string[], threadsText };
}

function assertFile(label: string, p: string): number {
  if (!fs.existsSync(p)) {
    throw new Error(
      `SMOKE FAIL: missing ${label} at ${p} (render the Post #2 launch assets first in the primary checkout: ` +
        `builder demo videos under out/review/lfah/demo-builder/, cards via npm run smoke:launch-card-post2)`,
    );
  }
  return fs.statSync(p).size;
}

/**
 * The per-tweet media plan for the Post #2 X thread. `path` is the file PATH; `kind` distinguishes
 * video vs card-over-art for the promo-media gate. 4 tweets: hook=video, 3 body=cards.
 */
interface MediaSlot {
  label: string;
  path: string;
  kind: "video" | "card-over-art";
}

function xThreadSlots(): MediaSlot[] {
  return [
    { label: "X tweet 1 (HOOK)", path: DEMO_HERO, kind: "video" },
    { label: "X tweet 2", path: CARD_POST2("A"), kind: "card-over-art" },
    { label: "X tweet 3", path: CARD_POST2("B"), kind: "card-over-art" },
    { label: "X tweet 4", path: CARD_POST2("C"), kind: "card-over-art" },
  ];
}

/**
 * Build the PromoThread for the Post #2 X thread from the slots + the thread text. This is what the
 * #797 gate runs against — the canonical-layout check (hook=video, body=cards, no mixing).
 */
function buildPromoThread(xThread: string[], slots: MediaSlot[]): PromoThread {
  return {
    units: xThread.map((text, i) => {
      const slot = slots[i];
      return slot.kind === "video"
        ? { text: [text], stills: [], videos: [{ path: slot.path }] }
        : { text: [text], stills: [{ path: slot.path, kind: "card-over-art" as const }], videos: [] };
    }),
  };
}

/**
 * The ORDERED Threads media list — THE single source of truth for both the gate and the draft body
 * (so the gate runs on the EXACT media we upload). Threads supports a mixed-media carousel, so the
 * post leads with the full-bleed 9:16 HERO video (#794) then carries card-post2-A. Order is
 * significant: index 0 is the lead and MUST be the video (#792/#793); that lead is the 9:16 hero.
 */
const THREADS_ORDERED_MEDIA: { path: string; kind: "video" | "card-over-art" }[] = [
  { path: DEMO_HERO, kind: "video" }, // HERO / lead — full-bleed 9:16, video leads (#794)
  { path: CARD_POST2("A"), kind: "card-over-art" }, // second — the dogfood-headline infographic card
];

/**
 * The Threads single post as a PlatformPrimaryPost (#792) — ORDERED media so the gate can require
 * media[0] to be the 9:16 video. `mixAllowed:true` because Threads supports a video AND an image in
 * one post (the mixed-media carousel).
 */
function buildThreadsPrimaryPost(threadsText: string): PlatformPrimaryPost {
  return {
    label: "Threads",
    text: [threadsText],
    media: THREADS_ORDERED_MEDIA.map((m) => ({ path: m.path, kind: m.kind })),
    mixAllowed: true,
  };
}

/**
 * Build the Typefully draft body. `mediaIds` maps each media path → the media-id string to embed
 * (placeholders in dry-run, real uploaded ids in live). `threadsMediaIds` is the ORDERED Threads
 * carousel — index 0 (the lead) is the HERO video, so the Threads post LEADS WITH VIDEO (#792).
 */
function buildDraftBody(
  xThread: string[],
  threadsText: string,
  slots: MediaSlot[],
  mediaIds: Map<string, string>,
  threadsMediaIds: string[],
): CreateDraftBody {
  const xPosts: DraftPost[] = xThread.map((text, i) => ({
    text,
    media_ids: [mediaIds.get(slots[i].path)!],
  }));
  const threadsPosts: DraftPost[] = [{ text: threadsText, media_ids: threadsMediaIds }];

  // NOTE: publish_at is intentionally omitted ⇒ Typefully saves this as a DRAFT.
  return {
    platforms: {
      x: { enabled: true, posts: xPosts },
      threads: { enabled: true, posts: threadsPosts },
    },
    draft_title: DRAFT_TITLE,
    share: false,
  };
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const live = process.env.TYPEFULLY_LIVE === "1";
  const { xThread, threadsText } = readPost2Copy();
  const slots = xThreadSlots();

  console.log("POST #2 (lfah is a BUILDER) — publish assembly\n");

  // ── #809 COPY-LENGTH GATE — runs in BOTH dry-run and live, BEFORE any assembly/upload, so an
  // over-limit post (the Post #2 incident: X tweet 4 = 282 weighted vs 280; Threads = 524 vs 500)
  // can NEVER reach a live Typefully draft again. Each X tweet ≤280 X-weighted (URLs count as 23);
  // the Threads post ≤500 codepoints. Throws a clear per-unit message; no-op when within limits.
  assertCopyWithinPlatformLimits({ xThread, threadsText });
  console.log(
    `COPY-LIMITS: PASS — ${xThread.length} X tweets ≤${CONFIG.publish.copyLimits.xTweet} weighted ` +
      `(URLs=23), Threads post ≤${CONFIG.publish.copyLimits.threads} chars (#809)`,
  );

  // ── #809 VIDEO-DIMENSION ADVISORY (NON-FATAL) for the 9:16 phone HERO. We key on the config hero
  // aspect's canonical dimensions (the actual MP4 is gitignored / may be absent in CI); X applies
  // extra compression to anything taller than 1080 landscape, so we surface the deliberate 9:16
  // tradeoff here rather than letting it be a Typefully surprise. This NEVER fails the build.
  const heroDims = CONFIG.aspects[CONFIG.publish.heroVideoAspect];
  const advisory = heroVideoAdvisory(heroDims);
  if (advisory.flagged) console.log(advisory.message);

  // ── #793 SHORT-THREAD ADVISORY (NON-FATAL). A longer X thread raises same-second scramble risk
  // (Post #1 fired its tweets the same second → X chained the reply order by ingestion). This only
  // SURFACES the risk via the CONFIG soft cap; it NEVER fails the build (thread length is creative).
  const threadNote = threadLengthAdvisory(xThread);
  if (threadNote) console.log(threadNote);

  // Assert every media file exists + print the per-tweet media map (both modes — what we'd upload).
  console.log("X thread media map (4 tweets — hook=video, body=cards):");
  for (const slot of slots) {
    const size = assertFile(slot.label, slot.path);
    console.log(
      `  • ${slot.label.padEnd(16)} ${slot.kind.padEnd(13)} ${path.basename(slot.path)}  (${(size / 1024 / 1024).toFixed(2)} MB)`,
    );
  }
  // Threads is an ORDERED mixed-media post — video LEADS, card second.
  console.log("Threads post media map (mixed carousel — VIDEO LEADS, card second):");
  THREADS_ORDERED_MEDIA.forEach((m, i) => {
    const size = assertFile(`Threads media[${i}]`, m.path);
    console.log(
      `  • ${`Threads media[${i}]`.padEnd(16)} ${m.kind.padEnd(13)} ${path.basename(m.path)}  (${(size / 1024 / 1024).toFixed(2)} MB)`,
    );
  });

  // ── ONE publish-assembly fidelity gate (#797) on the REAL assembled draft (both modes, before any
  // network). This SINGLE call funnels: (a) video-leads + per-unit cards + no-mixing over the X thread
  // AND the Threads post; (b) hero-aspect — every lead video is the full-bleed 9:16 phone cut (#794);
  // (c) order-intent — each platform post's SUBMITTED media leads with the video (#793).
  const promoThread = buildPromoThread(xThread, slots);
  const threadsPost = buildThreadsPrimaryPost(threadsText);
  const xHookPath = slots[0].path; // X tweet-1 hook video
  const threadsHeroPath = threadsPost.media[0].path; // Threads lead/hero video
  assertPostAssemblyFidelity({
    xThread: promoThread,
    platformPosts: [threadsPost],
    heroVideos: [
      { videoPath: xHookPath, label: "X tweet-1 hook" },
      { videoPath: threadsHeroPath, label: "Threads hero" },
    ],
    heroAspectTag: HERO_ASPECT_TAG,
  });
  console.log(
    `\nassertPostAssemblyFidelity: PASS (#797 — ONE gate) — X thread (4 tweets) + Threads post lead ` +
      `with video, carry per-unit cards, no mixing; both lead videos are the full-bleed ` +
      `${CONFIG.publish.heroVideoAspect} phone cut (X hook = ${path.basename(xHookPath)}, Threads hero = ` +
      `${path.basename(threadsHeroPath)}); each platform post's SUBMITTED media leads with the video ✓`,
  );
  console.log(
    `Threads lead media: ${threadsPost.media[0].kind} (${path.basename(threadsPost.media[0].path)}) — video leads ✓`,
  );
  // Clear, greppable PASS line for the AC.
  console.log(
    `\nFIDELITY: PASS — Post #2 layout passes assertPostAssemblyFidelity (hero=${CONFIG.publish.heroVideoAspect} ` +
      `on X t1 + Threads lead, video-leads per platform, per-unit cards on t2-t4, no img+video mixing, intended order)`,
  );

  const vf = checkVideoFirst(promoThread);
  console.log(
    `video-first soft-check: videoUnitIsFirst=${vf.videoUnitIsFirst} ` +
      `(video on unit ${vf.videoUnitIndex + 1}, first media-bearing unit ${vf.firstMediaUnitIndex + 1})`,
  );
  if (!vf.videoUnitIsFirst && vf.message) console.warn(vf.message);

  // The ORDERED Threads carousel media-id list (index 0 = the lead HERO video).
  const threadsMediaPaths = THREADS_ORDERED_MEDIA.map((m) => m.path);

  if (!live) {
    // DRY-RUN: print the exact draft body with placeholder media ids; ZERO network calls. No
    // TypefullyClient is constructed on this path — nothing reaches the network.
    const mediaIds = new Map<string, string>(
      [...slots.map((s) => s.path), ...threadsMediaPaths].map((p) => [
        p,
        `<upload:${path.basename(p)}>`,
      ]),
    );
    const threadsMediaIds = threadsMediaPaths.map((p) => mediaIds.get(p)!);
    const body = buildDraftBody(xThread, threadsText, slots, mediaIds, threadsMediaIds);
    console.log(`\nsocial_set_id: ${SOCIAL_SET_ID}`);
    console.log("draft body (DRY-RUN — placeholders for media ids, no publish_at ⇒ DRAFT):");
    console.log(JSON.stringify(body, null, 2));

    const xCount = body.platforms.x?.posts.length ?? 0;
    const tCount = body.platforms.threads?.posts.length ?? 0;
    const mediaCount = slots.length + threadsMediaPaths.length; // 4 X media + 2 Threads media = 6
    console.log(`\nThreads post[0].media_ids[0] = ${threadsMediaIds[0]}  (the HERO video leads)`);
    console.log(
      `\nPUBLISH-TYPEFULLY-POST2: mode=dry-run posts=x:${xCount},threads:${tCount} media=${mediaCount}`,
    );
    process.exit(0);
  }

  // LIVE — ORCHESTRATOR ONLY, after explicit operator authorization. Real upload + draft create.
  console.log("\n→ LIVE mode: verifying auth, uploading media, creating the draft…");
  const client = new TypefullyClient();
  await client.verifyAuth();

  const mediaIds = new Map<string, string>();
  for (const slot of slots) {
    mediaIds.set(slot.path, await client.uploadMedia(SOCIAL_SET_ID, slot.path));
  }
  // Upload the ordered Threads carousel media (video first), preserving order.
  const threadsMediaIds: string[] = [];
  for (const p of threadsMediaPaths) {
    threadsMediaIds.push(await client.uploadMedia(SOCIAL_SET_ID, p));
  }

  const body = buildDraftBody(xThread, threadsText, slots, mediaIds, threadsMediaIds);
  const res = await client.createDraft(SOCIAL_SET_ID, body);
  console.log(
    `\nPUBLISH-TYPEFULLY-POST2: mode=live draft_id=${res.id} status=${res.status} posts=x:4,threads:1 ` +
      `media=${slots.length + threadsMediaPaths.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
