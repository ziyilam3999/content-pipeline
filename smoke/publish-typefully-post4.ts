/**
 * Publish-to-Typefully DRY-RUN ASSEMBLY for POST #4 — content-pipeline DEMONSTRATION post (#824).
 *
 * Post #4 is a DEMONSTRATION-category post: the 85s voiced Fable-style demo IS the hero/demo. The
 * operator chose PER-TWEET CARDS for the body (like posts #1-#3) so the post passes the #797
 * consolidated fidelity gate — i.e. this is the standard VIDEO-HOOK + CARD-BODY shape:
 *   - X: a 4-tweet thread. Tweet 1 LEADS WITH the full-bleed 9:16 voiced hero video; tweets 2-4 each
 *     carry their OWN card-over-art still (card-post4-{A,B,C}.png) — the demo's branded body cards.
 *   - Threads: a single mixed-media post LED WITH the same 9:16 hero video, with card-post4-A as the
 *     second media item (video leads, card present — the Threads carousel realization of #792).
 *
 * THE BODY CARDS ARE FREE (#824 free-first): card-post4-{A,B,C}.png render over the demo's
 * deterministic BRANDED navy gradient (the demo VIDEO's visual language — navy "tool" world + teal
 * accent), NOT generated art — so there is NO paid nano-banana call. Render them with
 * `npx tsx smoke/launch-card-post4.ts` (zero spend). They satisfy the #797 card-over-art requirement.
 *
 * THIS SMOKE IS DRY-RUN ONLY. It NEVER creates a live Typefully draft and constructs NO network
 * client — that OUTWARD step is gated by the orchestrator on an explicit operator YES. It:
 *   1. runs the #810 publish-asset PROVENANCE gate over the hero video AND the three body cards (each
 *      hash-matches the operator-approved canonical render frozen in
 *      publish/manifests/content-pipeline-demo-post4.publish-manifest.json) — HARD-FAILS on drift;
 *   2. runs the #809/#827 PER-PLATFORM copy-length gate — HARD-FAILS over-limit;
 *   3. runs the #797 CONSOLIDATED post-assembly fidelity gate (assertPostAssemblyFidelity) over the
 *      assembled video-hook + card-body structure — now PASSES (every worded X tweet carries media +
 *      a card-over-art still; the Threads post leads with the 9:16 hero video and carries a card);
 *   4. emits the DRY-RUN draft body + a committed dry-run manifest (what the live draft WOULD contain).
 *
 * Run:
 *   npx tsx smoke/launch-card-post4.ts                 (render the 3 branded body cards — FREE)
 *   npm run publish:freeze-manifest -- content-pipeline-demo-post4 --from <out/review/fable dir>
 *   npm run smoke:publish-typefully-post4              (dry-run, zero network)
 *   npm run smoke:publish-typefully-post4:live         (LIVE DRAFT — orchestrator only, after operator YES)
 *
 * LIVE (TYPEFULLY_LIVE=1): runs the SAME provenance/length/fidelity gates, then verifies auth, uploads
 * the hero video + the 3 body cards via the presigned flow, and creates a Typefully DRAFT (publish_at
 * is NEVER sent ⇒ the content stays a DRAFT; the operator does the final Publish manually). After
 * creating it reads the draft back (#793) to confirm both platforms, the per-unit media, and the X
 * order, then auto-archives the draft id (#822). It NEVER schedules, sets publish_at, or auto-publishes.
 */

import * as fs from "fs";
import * as path from "path";

import {
  TypefullyClient,
  readTypefullyKey,
  TYPEFULLY_API_BASE,
  type CreateDraftBody,
  type DraftPost,
} from "../adapters/typefully";
import {
  assertPostAssemblyFidelity,
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
import { buildArchiveRecord, safeArchivePostAll } from "../publish/postArchive";
import { type FetchedDraft } from "../publish/publishVerify";
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

// The canonical voiced 3-aspect renders + the three branded body cards live in the gitignored
// out/review/fable working dir of THIS worktree (where the #824 capture+voice+caption pipeline and
// smoke/launch-card-post4.ts wrote them). Override with $FABLE_DIR.
const FABLE_DIR = process.env.FABLE_DIR ?? path.join(REPO_ROOT, "out", "review", "fable");

// HERO video aspect — config-driven (#794): the lead video everywhere is the full-bleed phone cut.
const HERO_ASPECT_TAG = CONFIG.publish.heroVideoAspect.replace(":", "x") as AspectTag; // "9x16"
const DEMO_HERO = path.join(FABLE_DIR, `fable-voiced-${HERO_ASPECT_TAG}.mp4`); // 9:16 voiced hero
const CARD_POST4 = (letter: "A" | "B" | "C") => path.join(FABLE_DIR, `card-post4-${letter}.png`);

const SOCIAL_SET_ID = process.env.TYPEFULLY_SOCIAL_SET_ID ?? "312308";
const DRAFT_TITLE = "content-pipeline demo — Post 4";
const POST_SLUG = "content-pipeline-demo-post4" as const;

// The durable archive copy source (out/copy/…) lives in the PRIMARY checkout, not this worktree.
const PRIMARY_ROOT =
  process.env.CONTENT_PIPELINE_PRIMARY ?? "/Users/ansonlam/coding_projects/content-pipeline";

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
      `SMOKE FAIL: missing ${label} at ${p} (render the #824 voiced Fable demo + the body cards first: ` +
        `the canonical 9:16 voiced hero is out/review/fable/fable-voiced-9x16.mp4; the body cards come ` +
        `from \`npx tsx smoke/launch-card-post4.ts\`)`,
    );
  }
  return fs.statSync(p).size;
}

// ── Assembly (VIDEO-HOOK + CARD-BODY — per-tweet cards) ───────────────────

/**
 * The per-tweet media plan for the Post #4 X thread. 4 tweets: hook=video, body=3 branded cards.
 */
interface MediaSlot {
  label: string;
  path: string;
  kind: "video" | "card-over-art";
}

function xThreadSlots(): MediaSlot[] {
  return [
    { label: "X tweet 1 (HOOK)", path: DEMO_HERO, kind: "video" },
    { label: "X tweet 2", path: CARD_POST4("A"), kind: "card-over-art" },
    { label: "X tweet 3", path: CARD_POST4("B"), kind: "card-over-art" },
    { label: "X tweet 4", path: CARD_POST4("C"), kind: "card-over-art" },
  ];
}

/**
 * The X thread as a PromoThread: tweet 1 carries the hero video; tweets 2-4 each carry their own
 * card-over-art still. This is the EXACT structure the #797 gate runs against (hook=video, body=cards,
 * no img+video mixing) — and it now PASSES.
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
 * The ORDERED Threads media list — the single source of truth for both the gate and the draft body.
 * Threads is a mixed-media carousel, so the post leads with the full-bleed 9:16 HERO video (#794) then
 * carries card-post4-A. Order is significant: index 0 is the lead and MUST be the video (#792/#793).
 */
const THREADS_ORDERED_MEDIA: { path: string; kind: "video" | "card-over-art" }[] = [
  { path: DEMO_HERO, kind: "video" }, // HERO / lead — full-bleed 9:16, video leads (#794)
  { path: CARD_POST4("A"), kind: "card-over-art" }, // second — the headline body card
];

/** The Threads single post: VIDEO-LED mixed carousel, TEXT copy, with card-post4-A. */
function buildThreadsPrimaryPost(threadsText: string): PlatformPrimaryPost {
  return {
    label: "Threads",
    text: [threadsText],
    media: THREADS_ORDERED_MEDIA.map((m) => ({ path: m.path, kind: m.kind })),
    mixAllowed: true,
  };
}

/** Build the DRY-RUN Typefully draft body (placeholder media ids). */
function buildDraftBody(
  platforms: Platform[],
  xThread: string[],
  threadsText: string,
  slots: MediaSlot[],
  mediaIds: Map<string, string>,
  threadsMediaIds: string[],
): CreateDraftBody {
  const xPosts: DraftPost[] = xThread.map((text, i) => ({
    text,
    media_ids: [mediaIds.get(slots[i].path)!], // tweet 1 = video; tweets 2-4 = their cards
  }));
  const threadsPosts: DraftPost[] = [{ text: threadsText, media_ids: threadsMediaIds }];
  return assembleDraftBody(platforms, {
    xPosts,
    threadsPosts,
    draftTitle: DRAFT_TITLE,
    share: false,
  });
}

// ── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const live = process.env.TYPEFULLY_LIVE === "1";
  const platforms: Platform[] = ["x", "threads"];
  const { xThread, threadsText } = readPost4Copy();
  const slots = xThreadSlots();

  console.log("POST #4 (content-pipeline — a content tool with no buttons) — DEMO publish assembly\n");
  console.log("category=demonstration structure=VIDEO-HOOK + CARD-BODY (hero video + per-tweet branded cards)\n");

  // The media paths this run would upload. The hero video is shared (deduped) across both platforms.
  const xMediaPaths = slots.map((s) => s.path);
  const threadsMediaPaths = THREADS_ORDERED_MEDIA.map((m) => m.path);
  const allUploadPaths = [...new Set([...xMediaPaths, ...threadsMediaPaths])];
  const usedBasenames = new Set(allUploadPaths.map((p) => path.basename(p)));

  // ── #810 PROVENANCE GATE. Re-hash every file this smoke would upload (hero video + the 3 body
  // cards, deduped) and assert each matches the approved frozen render.
  const provenanceAssets: PublishAsset[] = POST_ASSETS[POST_SLUG].assets
    .filter((a) => usedBasenames.has(a.basename))
    .map((a) => ({ role: a.role, path: path.join(FABLE_DIR, a.basename) }));
  assertPublishAssetsMatchManifest(provenanceAssets, loadManifest(POST_SLUG));
  console.log(
    `PROVENANCE: PASS — ${provenanceAssets.length} assets (1 hero video + 3 body cards) sha256-match the ` +
      `approved ${POST_SLUG} manifest (#810)`,
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

  // Assert every media file exists + print the per-unit media map.
  console.log("\nX thread media map (4 tweets — hook=video, body=cards):");
  for (const slot of slots) {
    const size = assertFile(slot.label, slot.path);
    console.log(
      `  • ${slot.label.padEnd(16)} ${slot.kind.padEnd(13)} ${path.basename(slot.path)}  (${(size / 1024 / 1024).toFixed(2)} MB)`,
    );
  }
  console.log("Threads post media map (mixed carousel — VIDEO LEADS, card second):");
  THREADS_ORDERED_MEDIA.forEach((m, i) => {
    const size = assertFile(`Threads media[${i}]`, m.path);
    console.log(
      `  • ${`Threads media[${i}]`.padEnd(16)} ${m.kind.padEnd(13)} ${path.basename(m.path)}  (${(size / 1024 / 1024).toFixed(2)} MB)`,
    );
  });

  // ── #797 CONSOLIDATED FIDELITY GATE on the REAL assembled draft. ONE call funnels: (a) video-leads
  // + per-unit cards + no-mixing over the X thread AND the Threads post; (b) hero-aspect — every lead
  // video is the full-bleed 9:16 phone cut (#794); (c) order-intent — Threads media leads with video.
  const promoThread = buildPromoThread(xThread, slots);
  const threadsPost = buildThreadsPrimaryPost(threadsText);
  const heroVideos: HeroVideoRef[] = [
    { videoPath: slots[0].path, label: "X tweet-1 hook" },
    { videoPath: threadsPost.media[0].path, label: "Threads hero" },
  ];

  // Hero-aspect sub-check (this PASSES — the hero IS the 9:16 cut).
  const heroTag = detectAspectTag(DEMO_HERO);
  console.log(`\n#797 sub-check hero-aspect: hero tag=${heroTag} (expected ${HERO_ASPECT_TAG}) — ${heroTag === HERO_ASPECT_TAG ? "PASS" : "FAIL"}`);

  assertPostAssemblyFidelity({
    xThread: promoThread,
    platformPosts: [threadsPost],
    heroVideos,
    heroAspectTag: HERO_ASPECT_TAG,
  });
  console.log(
    "\nFIDELITY: PASS — assertPostAssemblyFidelity accepted the video-hook + card-body demo layout " +
      "(every worded X tweet carries media + a card-over-art still; Threads leads with the 9:16 hero " +
      "video and carries a card; no img+video mixing; intended order).",
  );

  // Soft video-first ordering check (advisory).
  const vf = checkVideoFirst(promoThread);
  console.log(
    `\nvideo-first soft-check: videoUnitIsFirst=${vf.videoUnitIsFirst} ` +
      `(video on unit ${vf.videoUnitIndex + 1}, first media-bearing unit ${vf.firstMediaUnitIndex + 1})`,
  );
  if (!vf.videoUnitIsFirst && vf.message) console.warn(vf.message);

  // ── POST AUTO-ARCHIVE (both modes, non-fatal, #822). The post is assembled + gate-clean, so save its
  // canonical copy + metadata into the DURABLE + in-repo archive NOW — automatically, no human step.
  const archived = safeArchivePostAll(buildArchiveRecord(POST_SLUG, { primaryRoot: PRIMARY_ROOT }));
  if (archived)
    console.log(
      `\nARCHIVE: ${POST_SLUG} copy+metadata saved → ${archived.external.archiveDir} (+ in-repo ${archived.inRepo.archiveDir})`,
    );

  const mediaCount = xMediaPaths.length + threadsMediaPaths.length;

  if (!live) {
    // ── DRY-RUN draft body + committed manifest (what the LIVE draft WOULD contain). ZERO network
    // calls; no client. Placeholder media ids.
    const mediaIds = new Map<string, string>(
      allUploadPaths.map((p) => [p, `<upload:${path.basename(p)}>`]),
    );
    const threadsMediaIds = threadsMediaPaths.map((p) => mediaIds.get(p)!);
    const body = buildDraftBody(platforms, xThread, threadsText, slots, mediaIds, threadsMediaIds);
    console.log(`\nsocial_set_id: ${SOCIAL_SET_ID}`);
    console.log("draft body (DRY-RUN — placeholder media ids, no publish_at ⇒ DRAFT):");
    console.log(JSON.stringify(body, null, 2));
    console.log(`\nThreads post[0].media_ids[0] = ${threadsMediaIds[0]}  (the HERO video leads)`);

    const dryRunManifest = {
      postSlug: POST_SLUG,
      category: "demonstration",
      structure: "video-hook+card-body",
      generatedAt: new Date().toISOString(),
      mode: "dry-run",
      liveDraftCreated: false,
      socialSetId: SOCIAL_SET_ID,
      draftTitle: DRAFT_TITLE,
      heroAspect: CONFIG.publish.heroVideoAspect,
      gates: {
        provenance810: "PASS",
        copyLimits809: "PASS",
        fidelity797: "PASS",
      },
      platforms: {
        x: {
          posts: xThread.map((text, i) => ({
            unit: i + 1,
            media: [
              slots[i].kind === "video"
                ? { kind: "video", file: path.basename(slots[i].path) }
                : { kind: "card-over-art", file: path.basename(slots[i].path) },
            ],
            text,
          })),
        },
        threads: {
          posts: [
            {
              unit: 1,
              media: THREADS_ORDERED_MEDIA.map((m) => ({ kind: m.kind, file: path.basename(m.path) })),
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
        `threads:${body.platforms.threads?.posts.length ?? 0} media=${mediaCount} (hero shared) ` +
        `fidelity=PASS liveDraft=NONE`,
    );
    process.exit(0);
  }

  // ── LIVE — ORCHESTRATOR ONLY, after explicit operator authorization. Real upload + DRAFT create.
  // publish_at is NEVER sent (the client refuses it) ⇒ Typefully saves a DRAFT; the operator publishes.
  console.log("\n→ LIVE mode: verifying auth, uploading media, creating the DRAFT (no publish_at)…");
  const client = new TypefullyClient();
  await client.verifyAuth();

  // Upload the X media (hook video + 3 cards) into a path→id map. The hero is uploaded once for X.
  const mediaIds = new Map<string, string>();
  for (const p of xMediaPaths) {
    mediaIds.set(p, await client.uploadMedia(SOCIAL_SET_ID, p));
    console.log(`  uploaded ${path.basename(p)} → ${mediaIds.get(p)}`);
  }
  // Upload the ordered Threads carousel media (video FIRST), preserving order. The hero is uploaded
  // here independently of the X upload (mirrors posts #2/#3 per-platform upload semantics).
  const threadsMediaIds: string[] = [];
  for (const p of threadsMediaPaths) {
    const id = await client.uploadMedia(SOCIAL_SET_ID, p);
    threadsMediaIds.push(id);
    console.log(`  uploaded ${path.basename(p)} (threads) → ${id}`);
  }

  const body = buildDraftBody(platforms, xThread, threadsText, slots, mediaIds, threadsMediaIds);
  const res = await client.createDraft(SOCIAL_SET_ID, body);
  const xCount = body.platforms.x?.posts.length ?? 0;
  const tCount = body.platforms.threads?.posts.length ?? 0;
  console.log(
    `\nPUBLISH-TYPEFULLY-POST4: mode=live-draft draft_id=${res.id} status=${res.status} ` +
      `posts=x:${xCount},threads:${tCount} media=${mediaCount} publish_at=NONE`,
  );

  // ── READ BACK the live DRAFT (#793). A submitted/stored state is NOT verified until read back. The
  // draft is NOT published (status stays "draft", no live URLs yet) — so we do NOT call
  // assertPublishedDraftShape (it requires status=="published"). Instead we read the draft back and
  // confirm the DRAFT was stored correctly: both platforms present, the per-unit media attached, and
  // the X tweet ORDER matches what we submitted (hero on tweet 1, cards on 2-4).
  const expectedXIds = xMediaPaths.map((p) => mediaIds.get(p)!);
  await readBackDraft(res.id, expectedXIds, threadsMediaIds);

  // ── ARCHIVE WRITEBACK (#822, non-fatal). Record the draft id in the durable record. We do NOT set
  // publishedDate / liveUrls — the post is a DRAFT, not yet published; those fill on a post-publish
  // read-back after the operator's manual Publish.
  const liveArchived = safeArchivePostAll(
    buildArchiveRecord(POST_SLUG, {
      primaryRoot: PRIMARY_ROOT,
      dynamic: {
        note:
          `LIVE Typefully DRAFT created ${new Date().toISOString().slice(0, 10)} (#824) — draft_id=${res.id}, ` +
          `social_set=${SOCIAL_SET_ID}, video-hook + card-body (X 4-tweet thread: hero video + cards A/B/C; ` +
          `Threads: hero video + card A). NOT yet published — DRAFT ONLY; operator does the final manual ` +
          `Publish. publishedDate/liveUrls fill on a post-publish read-back.`,
      },
    }),
  );
  if (liveArchived) {
    console.log(
      `ARCHIVE: ${POST_SLUG} draft-id written back → ${liveArchived.external.metaPath} (+ in-repo ${liveArchived.inRepo.metaPath})`,
    );
  }
  console.log(
    `\nDONE — LIVE DRAFT ${res.id} created (DRAFT ONLY, no publish_at). Open it in Typefully to review ` +
      `and Publish manually. Edit link: https://typefully.com/?d=${res.id}`,
  );
  process.exit(0);
}

/**
 * Read a just-created Typefully DRAFT back (read-only GET, free) and confirm it was STORED correctly:
 * status is a draft (NOT yet published), both X + Threads platforms are present + enabled, every X
 * tweet carries its media id in the SUBMITTED order (hero on tweet 1, cards on 2-4), and the Threads
 * post carries the video-led carousel. Throws on any mismatch so a scrambled/partial draft is caught.
 */
async function readBackDraft(
  draftId: string,
  expectedXIds: string[],
  expectedThreadsIds: string[],
): Promise<void> {
  const key = readTypefullyKey();
  const url = `${TYPEFULLY_API_BASE}/social-sets/${SOCIAL_SET_ID}/drafts/${draftId}`;
  console.log(`\n→ reading back live draft ${draftId} (read-only GET, no paid call)…`);
  const res = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`read-back GET draft HTTP ${res.status} ${res.statusText}: ${t.slice(0, 300)}`);
  }
  const draft = (await res.json()) as FetchedDraft;

  // A DRAFT must NOT already be published (defends the draft-only contract).
  if (draft.status === "published" || draft.published_at) {
    throw new Error(
      `read-back: draft ${draftId} is already published (status=${JSON.stringify(draft.status)}) — ` +
        `expected a DRAFT. The draft-only contract was violated.`,
    );
  }

  const xBlock = draft.platforms?.x;
  const tBlock = draft.platforms?.threads;
  if (!xBlock?.enabled || !Array.isArray(xBlock.posts)) {
    throw new Error(`read-back: X platform missing/disabled in draft ${draftId}`);
  }
  if (!tBlock?.enabled || !Array.isArray(tBlock.posts)) {
    throw new Error(`read-back: Threads platform missing/disabled in draft ${draftId}`);
  }
  if (xBlock.posts.length !== expectedXIds.length) {
    throw new Error(
      `read-back: stored X thread has ${xBlock.posts.length} tweets, expected ${expectedXIds.length}`,
    );
  }
  expectedXIds.forEach((want, i) => {
    const got = xBlock.posts![i]?.media_ids?.[0];
    if (got !== want) {
      throw new Error(
        `read-back: stored X tweet ${i + 1} media id ${JSON.stringify(got)} != submitted ` +
          `${JSON.stringify(want)} (${i === 0 ? "hero video" : `card ${String.fromCharCode(64 + i)}`}) — ORDER SCRAMBLED`,
      );
    }
  });
  const tPost0 = tBlock.posts[0];
  if (!tPost0 || (tPost0.media_ids ?? []).length !== expectedThreadsIds.length) {
    throw new Error(
      `read-back: stored Threads post carries ${(tPost0?.media_ids ?? []).length} media, expected ` +
        `${expectedThreadsIds.length} (video + card A)`,
    );
  }
  if (tPost0.media_ids?.[0] !== expectedThreadsIds[0]) {
    throw new Error(`read-back: Threads lead media is not the hero video — order scrambled`);
  }

  console.log(
    `READ-BACK: status=${draft.status ?? "(draft)"} platforms=[x,threads] ` +
      `x-tweets=${xBlock.posts.length} (hero on 1, cards 2-4 in order) ` +
      `threads-media=${tPost0.media_ids?.length} (video leads, card A second) — VERIFIED STORED-CORRECT. ` +
      `live-per-tweet-order=UNVERIFIED(needs X API; draft not yet published).`,
  );
}

main().catch((err) => {
  console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
