/**
 * Publish-to-Typefully smoke (#786 → #789 CANONICAL X-launch-thread layout) — assembles the lfah
 * launch DRAFT and either prints it (DRY-RUN, default) or actually creates it (LIVE, env-gated).
 *
 * Canonical X-launch-thread layout (baked in publish/promoMedia.ts, doctrine in README):
 *   - Tweet 1 (HOOK) leads with the VIDEO (demo-1x1.mp4) — highest-impression slot, ~10x engagement.
 *   - Tweets 2..5 each carry their OWN infographic card-over-art still (card-tweet-{2..5}.png).
 *   - The CTA lives in the last tweet (tweet 5, from the source copy).
 *   - X constraint: no tweet mixes an image and a video — the hook is video-only, the body is
 *     image-only.
 *   - Threads (single static post) carries the FULL 4:5 infographic (card-over-art-4x5.png).
 *
 * The assembled draft is checked through `assertPromoMediaComplete` (the hard canonical invariant)
 * and the SOFT `checkVideoFirst` ordering rule is logged — so the dry-run asserts the layout holds
 * before any upload.
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
  assertPromoMediaComplete,
  checkVideoFirst,
  type PromoThread,
  type PromoMediaSet,
} from "../publish/promoMedia";

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

// Tweet 1 (hook) = video; tweets 2..5 = their own card-over-art still.
const DEMO_1X1 = path.join(DEMO_DIR, "demo-1x1.mp4"); // X tweet[0] HOOK video
const CARD_TWEET = (i: number) => path.join(IMAGE_DIR, `card-tweet-${i}.png`); // X tweet[i-1] body card
const CARD_OVER_ART_4X5 = path.join(IMAGE_DIR, "card-over-art-4x5.png"); // Threads full infographic

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
    { label: "X tweet 1 (HOOK)", path: DEMO_1X1, kind: "video" },
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

/** The Threads single post as a PromoMediaSet (it carries the full 4:5 infographic + the video reused as the hero motion). */
function buildThreadsMediaSet(): PromoMediaSet {
  return {
    text: [THREADS_TEXT],
    stills: [{ path: CARD_OVER_ART_4X5, kind: "card-over-art" }],
    videos: [{ path: DEMO_1X1 }],
  };
}

/**
 * Build the Typefully draft body. `mediaIds` maps each MediaSlot path → the media-id string to embed
 * (placeholders in dry-run, real uploaded ids in live). `threadsMediaId` is the Threads still.
 */
function buildDraftBody(
  xThread: string[],
  slots: MediaSlot[],
  mediaIds: Map<string, string>,
  threadsMediaId: string,
): CreateDraftBody {
  const xPosts: DraftPost[] = xThread.map((text, i) => ({
    text,
    media_ids: [mediaIds.get(slots[i].path)!],
  }));
  const threadsPosts: DraftPost[] = [{ text: THREADS_TEXT, media_ids: [threadsMediaId] }];

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

  // Assert every media file exists + print the per-tweet media map (both modes — what we'd upload).
  console.log("canonical X-launch-thread media map:");
  for (const slot of slots) {
    const size = assertFile(slot.label, slot.path);
    console.log(
      `  • ${slot.label.padEnd(16)} ${slot.kind.padEnd(13)} ${path.basename(slot.path)}  (${(size / 1024 / 1024).toFixed(2)} MB)`,
    );
  }
  const t4x5Size = assertFile("Threads infographic", CARD_OVER_ART_4X5);
  console.log(
    `  • ${"Threads post".padEnd(16)} ${"card-over-art".padEnd(13)} ${path.basename(CARD_OVER_ART_4X5)}  (${(t4x5Size / 1024 / 1024).toFixed(2)} MB)`,
  );

  // ── Run the canonical-layout gate on the assembled draft (both modes, before any network) ──
  const promoThread = buildPromoThread(xThread, slots);
  const threadsSet = buildThreadsMediaSet();
  assertPromoMediaComplete(promoThread); // throws if the X thread violates the canonical layout
  assertPromoMediaComplete(threadsSet); // throws if the Threads post is incomplete
  console.log("\nassertPromoMediaComplete: PASS (X thread + Threads post satisfy the canonical layout)");

  const vf = checkVideoFirst(promoThread);
  console.log(
    `video-first soft-check: videoUnitIsFirst=${vf.videoUnitIsFirst} ` +
      `(video on unit ${vf.videoUnitIndex + 1}, first media-bearing unit ${vf.firstMediaUnitIndex + 1})`,
  );
  if (!vf.videoUnitIsFirst && vf.message) console.warn(vf.message);

  if (!live) {
    // DRY-RUN: print the exact draft body with placeholder media ids; ZERO network calls.
    const mediaIds = new Map<string, string>(
      slots.map((s) => [s.path, `<upload:${path.basename(s.path)}>`]),
    );
    const body = buildDraftBody(
      xThread,
      slots,
      mediaIds,
      `<upload:${path.basename(CARD_OVER_ART_4X5)}>`,
    );
    console.log(`\nsocial_set_id: ${SOCIAL_SET_ID}`);
    console.log("draft body (DRY-RUN — placeholders for media ids, no publish_at ⇒ DRAFT):");
    console.log(JSON.stringify(body, null, 2));

    const xCount = body.platforms.x?.posts.length ?? 0;
    const tCount = body.platforms.threads?.posts.length ?? 0;
    const mediaCount = slots.length + 1; // 5 X media + 1 Threads media
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
  const threadsMediaId = await client.uploadMedia(SOCIAL_SET_ID, CARD_OVER_ART_4X5);

  const body = buildDraftBody(xThread, slots, mediaIds, threadsMediaId);
  const res = await client.createDraft(SOCIAL_SET_ID, body);
  console.log(
    `\nPUBLISH-TYPEFULLY: mode=live draft_id=${res.id} status=${res.status} posts=x:5,threads:1 media=6`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
