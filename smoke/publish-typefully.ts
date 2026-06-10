/**
 * Publish-to-Typefully smoke (#786 → #789 → #792 PLATFORM-AGNOSTIC video-first layout) — assembles
 * the lfah launch DRAFT and either prints it (DRY-RUN, default) or actually creates it (LIVE, gated).
 *
 * THE PRINCIPLE (#792, baked in publish/promoMedia.ts, doctrine in README): EVERY platform's primary
 * worded post LEADS WITH VIDEO (highest-attention medium, ~10x engagement) and every worded unit ALSO
 * carries its card-over-art infographic. Per-platform realization:
 *   - X (no image+video mixing in one tweet): SPLIT into a video HOOK tweet (demo-9x16.mp4, the
 *     full-bleed 9:16 phone HERO — #794) + card body tweets (card-tweet-{2..5}.png), CTA last.
 *     Modeled as a PromoThread.
 *   - Threads (mixed-media carousel SUPPORTED — verified 2026-06-10): a SINGLE post whose media is
 *     ORDERED [demo-9x16.mp4 (HERO/lead, full-bleed 9:16 — #794), card-over-art-4x5.png (second)].
 *     VIDEO LEADS, CARD PRESENT. Modeled as a PlatformPrimaryPost so the gate can require media[0]
 *     to be the video AND the #794 fidelity gate can require that lead to be the 9:16 hero.
 *
 * #794: the hero video EVERYWHERE it leads is the full-bleed 9:16 phone-native cut (most-watched),
 * config-driven via CONFIG.publish.heroVideoAspect and enforced by assertHeroAspect. Previously the
 * X hook used the square 1:1 and Threads used the 4:5 cut, so the 9:16 hero got posted NOWHERE.
 *
 * The REAL assembled draft is checked through `assertPromoMediaComplete` (the hard invariant) — for
 * X the thread invariant, for Threads the PER-PLATFORM video-first invariant — and the SOFT
 * `checkVideoFirst` ordering rule is logged. So the dry-run asserts the layout holds before any upload,
 * and a video-LESS Threads post (the #792 regression) is mechanically rejected.
 *
 * DRY-RUN (default): print the per-tweet media map + the full draft JSON body (media ids shown as
 * placeholders like `<upload:demo-1x1.mp4>`), assert every media file exists + print sizes, run the
 * gate, make ZERO network calls, and print the greppable line:
 *     PUBLISH-TYPEFULLY: mode=dry-run posts=x:5,threads:1 media=6
 *
 * LIVE (TYPEFULLY_LIVE=1): upload the 6 media files via the presigned flow, then create the draft
 * with the real media ids. This path is for the PARENT session to run — it actually spends a live
 * Typefully call. The dry-run path makes none.
 *
 * Run:
 *   npm run smoke:publish-typefully        (dry-run, zero network)
 *   npm run smoke:publish-typefully:live   (LIVE — parent only)
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
import { CONFIG } from "../config";

// ── Sources ────────────────────────────────────────────────────────────

/**
 * The gitignored out/ artifacts live in the PRIMARY checkout, not in a worktree. Resolve them
 * from the primary repo root. Default to this machine's primary clone; override with
 * $CONTENT_PIPELINE_PRIMARY for portability.
 */
const PRIMARY_ROOT =
  process.env.CONTENT_PIPELINE_PRIMARY ?? "/Users/ansonlam/coding_projects/content-pipeline";

const X_THREAD_JSON = path.join(PRIMARY_ROOT, "out", "copy", "lfah-launch-content.json");
const IMAGE_DIR = path.join(PRIMARY_ROOT, "out", "review", "lfah", "image");
const DEMO_DIR = path.join(PRIMARY_ROOT, "out", "review", "lfah", "demo-multi-aspect");

// HERO video aspect — config-driven (#794), NOT a magic hard-code. The lead video of every
// phone-first platform (X hook tweet, Threads hero post) is the full-bleed phone-native cut.
// `CONFIG.publish.heroVideoAspect` is "9:16"; the filename tag is the `WxH` form ("9x16").
// The #794 bug: a square 1:1 (demo-1x1.mp4) led the X hook and demo-4x5.mp4 led Threads, so the
// full-screen 9:16 cut we built got posted NOWHERE. Now BOTH leads select the same 9:16 hero.
const HERO_ASPECT_TAG = CONFIG.publish.heroVideoAspect.replace(":", "x") as AspectTag; // "9x16"
const DEMO_HERO = path.join(DEMO_DIR, `demo-${HERO_ASPECT_TAG}.mp4`); // full-bleed 9:16 hero — leads X + Threads
const CARD_TWEET = (i: number) => path.join(IMAGE_DIR, `card-tweet-${i}.png`); // X tweet[i-1] body card
const CARD_OVER_ART_4X5 = path.join(IMAGE_DIR, "card-over-art-4x5.png"); // Threads infographic card

const SOCIAL_SET_ID = process.env.TYPEFULLY_SOCIAL_SET_ID ?? "312308";
const DRAFT_TITLE = "lfah launch";

/**
 * Fallback x_thread copy (used only if the gitignored runtime json is absent, e.g. in CI) so the
 * dry-run still assembles + asserts. Mirrors out/copy/lfah-launch-content.json — public benchmark
 * facts only, no employer brand.
 */
const FALLBACK_X_THREAD: string[] = [
  "We moved the heavy file-editing role of an AI coding agent onto a LOCAL model. It runs at 0% cost share. On 13 real SWE-bench Verified bugs, the local-first hybrid still resolved 62%. Here's how the numbers shook out 🧵",
  "The honest comparison on the same 13 tasks:\n• Full-cloud relay: 77% resolved (10/13)\n• Local-first hybrid: 62% resolved (8/13)\n• 1-shot Opus: 54% resolved (7/13)\n\nCloud fallback rescues the hardest bugs while keeping the honest local result.",
  "Now the part that matters: cost.\n• Full-cloud relay: $35.0\n• Local-first hybrid: $15.7\n\nThat's a 55% cost saving vs full-cloud on the same chain — because the executor runs free on a local model.",
  "No grading shortcuts. Every fix is graded by the real SWE-bench Docker test oracle — actual tests, never an LLM judge. The heavy file-editing role runs free locally; cloud only steps in for the bugs that need it.",
  "Try it:\npip install git+https://github.com/ziyilam3999/local-first-agent-harness",
];

/**
 * The single Threads post. A static post benefits from the COMPLETE 4:5 infographic, so it carries
 * card-over-art-4x5.png. ~430-char post derived from the lfah spec — public benchmark facts only.
 */
const THREADS_TEXT = `We moved the heavy file-editing role of an AI coding agent onto a LOCAL model — 0% cost share for the hardest-working part.

On 13 real SWE-bench Verified bugs:
• Local-first hybrid: 62% resolved, $15.7
• Full-cloud relay: 77%, $35.0

55% cheaper on the same chain, graded by the real SWE-bench Docker oracle — not an LLM judge.

Try it: pip install git+https://github.com/ziyilam3999/local-first-agent-harness`;

// ── Helpers ────────────────────────────────────────────────────────────

function readXThread(): string[] {
  if (!fs.existsSync(X_THREAD_JSON)) {
    console.log(`(x_thread json not found at ${X_THREAD_JSON} — using inline fallback copy)`);
    return FALLBACK_X_THREAD;
  }
  const raw = fs.readFileSync(X_THREAD_JSON, "utf8");
  const json = JSON.parse(raw) as { x_thread?: unknown };
  const arr = json.x_thread;
  if (!Array.isArray(arr) || arr.length !== 5 || !arr.every((s) => typeof s === "string")) {
    throw new Error(
      `expected x_thread to be 5 strings in ${X_THREAD_JSON}, got ${JSON.stringify(arr)?.slice(0, 120)}`,
    );
  }
  return arr as string[];
}

function assertFile(label: string, p: string): number {
  if (!fs.existsSync(p)) {
    throw new Error(`SMOKE FAIL: missing ${label} at ${p} (render the launch assets first in the primary checkout)`);
  }
  return fs.statSync(p).size;
}

/**
 * The per-tweet media plan for the canonical X thread + Threads post. `media` is the file PATH;
 * `kind` distinguishes video vs card-over-art for the promo-media gate.
 */
interface MediaSlot {
  label: string;
  path: string;
  kind: "video" | "card-over-art";
}

function xThreadSlots(): MediaSlot[] {
  return [
    { label: "X tweet 1 (HOOK)", path: DEMO_HERO, kind: "video" },
    { label: "X tweet 2", path: CARD_TWEET(2), kind: "card-over-art" },
    { label: "X tweet 3", path: CARD_TWEET(3), kind: "card-over-art" },
    { label: "X tweet 4", path: CARD_TWEET(4), kind: "card-over-art" },
    { label: "X tweet 5 (CTA)", path: CARD_TWEET(5), kind: "card-over-art" },
  ];
}

/**
 * Build the PromoThread for the X thread from the slots + the thread text. This is what
 * `assertPromoMediaComplete` / `checkVideoFirst` run against — the canonical-layout check.
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
 * (so the gate runs on the EXACT media we upload, not an idealized set). Threads supports a
 * mixed-media carousel, so the post leads with the full-bleed 9:16 HERO video (#794 — config-driven,
 * was wrongly the 4:5 cut) then carries the infographic card. Order is significant: index 0 is the
 * lead and MUST be the video (#792 per-platform video-first); that lead is the 9:16 hero (#794).
 */
const THREADS_ORDERED_MEDIA: { path: string; kind: "video" | "card-over-art" }[] = [
  { path: DEMO_HERO, kind: "video" }, // HERO / lead — full-bleed 9:16, video leads (#794)
  { path: CARD_OVER_ART_4X5, kind: "card-over-art" }, // second — the infographic card
];

/**
 * The Threads single post as a PlatformPrimaryPost (#792) — ORDERED media so the gate can require
 * media[0] to be the video. `mixAllowed:true` because Threads supports a video AND an image in one
 * post (the mixed-media carousel verified 2026-06-10).
 */
function buildThreadsPrimaryPost(): PlatformPrimaryPost {
  return {
    label: "Threads",
    text: [THREADS_TEXT],
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
  slots: MediaSlot[],
  mediaIds: Map<string, string>,
  threadsMediaIds: string[],
): CreateDraftBody {
  const xPosts: DraftPost[] = xThread.map((text, i) => ({
    text,
    media_ids: [mediaIds.get(slots[i].path)!],
  }));
  const threadsPosts: DraftPost[] = [{ text: THREADS_TEXT, media_ids: threadsMediaIds }];

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
  const xThread = readXThread();
  const slots = xThreadSlots();

  // ── #809 COPY-LENGTH GATE — runs in BOTH dry-run and live, BEFORE any assembly/upload, so an
  // over-limit post can NEVER reach a live Typefully draft (the Post #2 incident). Each X tweet
  // ≤280 X-weighted (URLs count as 23 — t.co); the Threads post ≤500 codepoints. Throws a clear
  // per-unit message; no-op when within limits.
  assertCopyWithinPlatformLimits({ xThread, threadsText: THREADS_TEXT });
  console.log(
    `COPY-LIMITS: PASS — ${xThread.length} X tweets ≤${CONFIG.publish.copyLimits.xTweet} weighted ` +
      `(URLs=23), Threads post ≤${CONFIG.publish.copyLimits.threads} chars (#809)`,
  );

  // ── #809 VIDEO-DIMENSION ADVISORY (NON-FATAL) for the 9:16 phone HERO. Keyed on the config hero
  // aspect's canonical dimensions (the MP4 is gitignored / absent in CI). X applies extra
  // compression beyond 1920×1080 landscape, so we surface the deliberate 9:16 tradeoff here. NEVER
  // fails the build.
  const heroDims = CONFIG.aspects[CONFIG.publish.heroVideoAspect];
  const advisory = heroVideoAdvisory(heroDims);
  if (advisory.flagged) console.log(advisory.message);

  // Assert every media file exists + print the per-tweet media map (both modes — what we'd upload).
  console.log("X-launch-thread media map (hook=video, body=cards):");
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

  // ── ONE publish-assembly fidelity gate (#797) on the REAL assembled draft (both modes, before
  // any network). This SINGLE call replaces the previously-scattered assertPromoMediaComplete /
  // assertHeroAspect calls — so a check can NEVER be wired-one-forget-another (the failure mode
  // behind #792 video-dropped, #793 out-of-order, #794 wrong-aspect). It funnels: (a) video-leads +
  // per-unit cards + no-mixing over the X thread AND the Threads post; (b) hero-aspect — every lead
  // video is the full-bleed 9:16 phone cut (#794); (c) order-intent — each platform post's SUBMITTED
  // media leads with the video (#793, assembly-layer half).
  const promoThread = buildPromoThread(xThread, slots);
  const threadsPost = buildThreadsPrimaryPost();
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
    `\nassertPostAssemblyFidelity: PASS (#797 — ONE gate) — X thread + Threads post lead with video, ` +
      `carry per-unit cards, no mixing; both lead videos are the full-bleed ${CONFIG.publish.heroVideoAspect} ` +
      `phone cut (X hook = ${path.basename(xHookPath)}, Threads hero = ${path.basename(threadsHeroPath)}); ` +
      `each platform post's SUBMITTED media leads with the video ✓`,
  );
  console.log(
    `Threads lead media: ${threadsPost.media[0].kind} (${path.basename(threadsPost.media[0].path)}) — video leads ✓`,
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
    // DRY-RUN: print the exact draft body with placeholder media ids; ZERO network calls.
    const mediaIds = new Map<string, string>(
      [...slots.map((s) => s.path), ...threadsMediaPaths].map((p) => [
        p,
        `<upload:${path.basename(p)}>`,
      ]),
    );
    const threadsMediaIds = threadsMediaPaths.map((p) => mediaIds.get(p)!);
    const body = buildDraftBody(xThread, slots, mediaIds, threadsMediaIds);
    console.log(`\nsocial_set_id: ${SOCIAL_SET_ID}`);
    console.log("draft body (DRY-RUN — placeholders for media ids, no publish_at ⇒ DRAFT):");
    console.log(JSON.stringify(body, null, 2));

    const xCount = body.platforms.x?.posts.length ?? 0;
    const tCount = body.platforms.threads?.posts.length ?? 0;
    const mediaCount = slots.length + threadsMediaPaths.length; // 5 X media + 2 Threads media
    console.log(
      `\nThreads post[0].media_ids[0] = ${threadsMediaIds[0]}  (the HERO video leads)`,
    );
    console.log(
      `\nPUBLISH-TYPEFULLY: mode=dry-run posts=x:${xCount},threads:${tCount} media=${mediaCount}`,
    );
    process.exit(0);
  }

  // LIVE — parent session only. Real upload + draft create.
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

  const body = buildDraftBody(xThread, slots, mediaIds, threadsMediaIds);
  const res = await client.createDraft(SOCIAL_SET_ID, body);
  console.log(
    `\nPUBLISH-TYPEFULLY: mode=live draft_id=${res.id} status=${res.status} posts=x:5,threads:1 media=${slots.length + threadsMediaPaths.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
