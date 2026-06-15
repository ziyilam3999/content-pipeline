/**
 * Publish-to-Typefully smoke for the #871 forge-harness DEMONSTRATION post ("your tests decide what
 * ships"). Assembles the forge-demo launch DRAFT and either prints it (DRY-RUN, default) or actually
 * creates it (LIVE, gated — orchestrator only). This is a SIBLING of smoke/publish-typefully-post5.ts:
 * it REUSES the SAME assembly helpers (`PromoThread`, `PlatformPrimaryPost`) and the SAME consolidated
 * #797 fidelity gate (`assertPostAssemblyFidelity`) from publish/promoMedia — it does NOT fork the gate
 * logic. The only things that differ from Post #5 are the COPY, the VIDEO bundle, and the CARDS:
 *
 *   - Post #5 = the 3-role development model ("four AI subagents, nobody grades their own homework").
 *   - forge-demo = the forge-harness DEMONSTRATION ("your tests, not the agent, decide what's done");
 *     a 4-TWEET X thread + a Threads post, forge-demo-voiced-9x16 hero, card-forge-demo-{A,B,C}.png
 *     body cards.
 *
 * THE PRINCIPLE (#792, baked in publish/promoMedia.ts): EVERY platform's primary worded post LEADS
 * WITH VIDEO and every worded unit ALSO carries its card-over-art infographic. forge-demo realization:
 *   - X (no image+video mixing in one tweet): SPLIT into a video HOOK tweet
 *     (forge-demo-voiced-9x16.mp4, the full-bleed 9:16 phone HERO — #794) + 3 card body tweets
 *     (card-forge-demo-{A,B,C}.png). 4 tweets total. Modeled as a PromoThread.
 *   - Threads (mixed-media carousel): a SINGLE post whose media is ORDERED [forge-demo-voiced-9x16.mp4
 *     (HERO/lead, full-bleed 9:16), card-forge-demo-A.png (second)]. VIDEO LEADS, CARD PRESENT.
 *     Modeled as a PlatformPrimaryPost so the gate can require media[0] to be the 9:16 hero video.
 *
 * #794: the hero video EVERYWHERE it leads is the full-bleed 9:16 phone-native cut, config-driven via
 * CONFIG.publish.heroVideoAspect and enforced by the #797 gate's hero-aspect check.
 *
 * The REAL assembled draft is checked through the ONE consolidated `assertPostAssemblyFidelity`
 * (#797) — so a check can NEVER be wired-one-forget-another. The SOFT `checkVideoFirst` ordering rule
 * is logged.
 *
 * DRY-RUN (default): print the per-tweet media map + the full draft JSON body (media ids shown as
 * placeholders like `<upload:forge-demo-voiced-9x16.mp4>`), assert every media file exists + print
 * sizes, run the gate, make ZERO network calls (no Typefully client is even constructed), and print:
 *     FIDELITY: PASS
 *     PUBLISH-TYPEFULLY-FORGE-DEMO: mode=dry-run posts=x:4,threads:1 media=6
 *
 * LIVE (TYPEFULLY_LIVE=1): upload the media via the presigned flow, then create the draft with the
 * real media ids. This path is for the ORCHESTRATOR to run AFTER explicit operator authorization — it
 * actually spends a live Typefully call. The dry-run path makes none, constructs no client, and never
 * touches the network.
 *
 * #810 PROVENANCE: this smoke hard-fails (before any network) unless every file it uploads matches the
 * approved render frozen in publish/manifests/forge-demo-871.publish-manifest.json. Order of
 * operations: operator APPROVES the renders → freeze the receipt → publish. Re-render+re-approve ⇒
 * RE-FREEZE first.
 *
 * Run:
 *   npm run publish:freeze-manifest -- forge-demo-871   (freeze approved hashes — run AFTER approval)
 *   npm run smoke:publish-typefully-forge-demo          (dry-run, zero network)
 *   npm run smoke:publish-typefully-forge-demo:live     (LIVE — orchestrator only, post operator go)
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
  type HeroVideoRef,
} from "../publish/promoMedia";
import { assertCopyWithinPlatformLimits, heroVideoAdvisory } from "../publish/copyLimits";
import {
  parsePlatformsEnv,
  platformSubsetNote,
  assembleDraftBody,
  type Platform,
} from "../publish/platformSubset";
import { threadLengthAdvisory } from "../publish/publishVerify";
import {
  assertPublishAssetsMatchManifest,
  loadManifest,
  type PublishAsset,
} from "../publish/publishProvenance";
import { POST_ASSETS } from "../publish/publishAssets";
import { buildArchiveRecord, safeArchivePostAll } from "../publish/postArchive";
import { CONFIG } from "../config";
import { requireEyeballAck } from "../video/eyeballAck";

// ── Sources ────────────────────────────────────────────────────────────

/**
 * forge-demo's renders + copy were produced in THIS worktree's working dirs (the #871 art+video+card
 * legs wrote them), NOT in the primary clone. Resolve them from the worktree repo root by default;
 * override with $CONTENT_PIPELINE_PRIMARY for portability (mirrors smoke/publish-typefully-post5.ts).
 */
const ROOT = process.env.CONTENT_PIPELINE_PRIMARY ?? path.resolve(__dirname, "..");

// The forge-demo copy SSOT lives in the git-tracked workspace (NOT the gitignored out/copy dir).
const FORGE_COPY_JSON = path.join(ROOT, ".ai-workspace", "posts", "forge-demo-copy.json");
// The hero video lands under out/video/; the body cards under out/review/fable/ (where the #871 legs
// rendered them) — distinct dirs, resolved per-role below.
const VIDEO_DIR = path.join(ROOT, "out", "video");
const CARD_DIR = path.join(ROOT, "out", "review", "fable");

// HERO video aspect — config-driven (#794), NOT a magic hard-code. The lead video of every
// phone-first platform (X hook tweet, Threads hero post) is the full-bleed phone cut.
// `CONFIG.publish.heroVideoAspect` is "9:16"; the filename tag is the `WxH` form ("9x16").
const HERO_ASPECT_TAG = CONFIG.publish.heroVideoAspect.replace(":", "x") as AspectTag; // "9x16"
const DEMO_HERO = path.join(VIDEO_DIR, "forge-demo-voiced-9x16.mp4"); // 9:16 hero — leads X + Threads
const CARD_FORGE = (letter: "A" | "B" | "C") =>
  path.join(CARD_DIR, `card-forge-demo-${letter}.png`);

const SOCIAL_SET_ID = process.env.TYPEFULLY_SOCIAL_SET_ID ?? "312308";
const DRAFT_TITLE = "forge-harness demonstration — your tests decide what ships";

/**
 * Fallback forge-demo copy (used only if the copy json is absent, e.g. in CI) so the dry-run still
 * assembles + asserts. Mirrors .ai-workspace/posts/forge-demo-copy.json VERBATIM. x_thread is 4
 * strings (hook + 3 body), threads_post is the single Threads post copy.
 */
const FALLBACK_X_THREAD: string[] = [
  "96% of developers don't fully trust AI-written code. Barely half ever check it before they commit.\n\nHere's 90 seconds of forge-harness — where your tests, not the agent, decide what's done. 🧵",
  "It starts in Claude Code: forge's /prd skill asks a few plain questions and writes the spec with you — no blank page.\n\nThen forge_plan breaks that spec into phases, user stories, and binary pass-or-fail checks. Anything too big to verify gets split.",
  "Now it runs. forge_evaluate executes your real shell commands — your actual tests — and only a passing check moves a story forward.\n\nWatch its real dashboard: a story hits Retry (you see which check failed), then slides to Done with its evidence.",
  "The model planned. Your tests judged. No agent grading its own homework.\n\nOn a Max plan, that's $0 out of pocket. Open-source, MIT.\ngithub.com/ziyilam3999/forge-harness",
];

const FALLBACK_THREADS_TEXT = `96% of developers don't fully trust AI-written code — and barely half check it before committing (Sonar State of Code, 2026).

forge-harness gives the verdict to your tests, not the agent. Its /prd skill writes the spec with you, forge_plan splits it into binary pass-or-fail checks, and forge_evaluate runs your real shell commands. Watch its dashboard: a story hits Retry, then slides to Done — same verdict every run.

Open-source, MIT. github.com/ziyilam3999/forge-harness`;

// ── Helpers ────────────────────────────────────────────────────────────

interface ForgeCopy {
  xThread: string[];
  threadsText: string;
}

/**
 * Read the forge-demo copy from the workspace json, falling back to the inline VERBATIM copy when
 * absent (CI / fresh checkout) so the dry-run still assembles + asserts. The x_thread MUST be exactly
 * 4 strings (hook + 3 body tweets); threads_post MUST be a non-empty string.
 */
function readForgeCopy(): ForgeCopy {
  if (!fs.existsSync(FORGE_COPY_JSON)) {
    console.log(`(forge-demo copy json not found at ${FORGE_COPY_JSON} — using inline fallback copy)`);
    return { xThread: FALLBACK_X_THREAD, threadsText: FALLBACK_THREADS_TEXT };
  }
  const raw = fs.readFileSync(FORGE_COPY_JSON, "utf8");
  const json = JSON.parse(raw) as { x_thread?: unknown; threads_post?: unknown };
  const arr = json.x_thread;
  if (!Array.isArray(arr) || arr.length !== 4 || !arr.every((s) => typeof s === "string")) {
    throw new Error(
      `expected x_thread to be 4 strings in ${FORGE_COPY_JSON}, got ${JSON.stringify(arr)?.slice(0, 120)}`,
    );
  }
  const threadsText = json.threads_post;
  if (typeof threadsText !== "string" || threadsText.trim().length === 0) {
    throw new Error(`expected a non-empty threads_post string in ${FORGE_COPY_JSON}`);
  }
  return { xThread: arr as string[], threadsText };
}

function assertFile(label: string, p: string): number {
  if (!fs.existsSync(p)) {
    throw new Error(
      `SMOKE FAIL: missing ${label} at ${p} (render the forge-demo launch assets first: ` +
        `the hero forge-demo-voiced-9x16.mp4 under out/video/, cards card-forge-demo-{A,B,C}.png ` +
        `under out/review/fable/)`,
    );
  }
  return fs.statSync(p).size;
}

/**
 * The per-tweet media plan for the forge-demo X thread. `path` is the file PATH; `kind` distinguishes
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
    { label: "X tweet 2", path: CARD_FORGE("A"), kind: "card-over-art" },
    { label: "X tweet 3", path: CARD_FORGE("B"), kind: "card-over-art" },
    { label: "X tweet 4", path: CARD_FORGE("C"), kind: "card-over-art" },
  ];
}

/**
 * Build the PromoThread for the forge-demo X thread from the slots + the thread text. This is what the
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
 * post leads with the full-bleed 9:16 HERO video (#794) then carries card-forge-demo-A. Order is
 * significant: index 0 is the lead and MUST be the video (#792/#793); that lead is the 9:16 hero.
 */
const THREADS_ORDERED_MEDIA: { path: string; kind: "video" | "card-over-art" }[] = [
  { path: DEMO_HERO, kind: "video" }, // HERO / lead — full-bleed 9:16, video leads (#794)
  { path: CARD_FORGE("A"), kind: "card-over-art" }, // second — the headline infographic card
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
 * Build the Typefully draft body for the requested PLATFORM SUBSET (#828). `mediaIds` maps each
 * media path → the media-id string to embed (placeholders in dry-run, real uploaded ids in live).
 * `threadsMediaIds` is the ORDERED Threads carousel — index 0 (the lead) is the HERO video, so the
 * Threads post LEADS WITH VIDEO (#792). Only the requested platforms' posts are assembled; an
 * EXCLUDED platform is omitted from `body.platforms` ENTIRELY (via `assembleDraftBody`) so a
 * Threads-only recovery draft cannot re-post an already-live X thread.
 */
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
    media_ids: [mediaIds.get(slots[i].path)!],
  }));
  const threadsPosts: DraftPost[] = [{ text: threadsText, media_ids: threadsMediaIds }];

  // NOTE: publish_at is omitted ⇒ Typefully saves this as a DRAFT. assembleDraftBody omits any
  // platform NOT in `platforms` entirely (no disabled block) — the #828 partial-publish fix.
  return assembleDraftBody(platforms, {
    xPosts,
    threadsPosts,
    draftTitle: DRAFT_TITLE,
    share: false,
  });
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const live = process.env.TYPEFULLY_LIVE === "1";
  // ── #828 PLATFORM SUBSET. PLATFORMS unset ⇒ both (the normal full launch). A subset
  // (PLATFORMS=threads, PLATFORMS=x,threads) targets ONLY those platforms — the partial-publish
  // recovery path: a Threads-only draft cannot re-post an already-live X thread. Invalid ⇒ throws.
  const platforms = parsePlatformsEnv(process.env.PLATFORMS);
  const includeX = platforms.includes("x");
  const includeThreads = platforms.includes("threads");
  const { xThread, threadsText } = readForgeCopy();
  const slots = xThreadSlots();

  console.log("forge-demo (#871 — your tests decide what ships) — publish assembly\n");
  const subsetNote = platformSubsetNote(platforms);
  if (subsetNote) console.log(subsetNote + "\n");

  // The media paths this run will actually upload, per the requested subset. The hero video is
  // shared (deduped) across both platforms. Provenance + the upload loops key off these.
  const xMediaPaths = includeX ? slots.map((s) => s.path) : [];
  const threadsMediaPaths = includeThreads ? THREADS_ORDERED_MEDIA.map((m) => m.path) : [];
  const allUploadPaths = [...new Set([...xMediaPaths, ...threadsMediaPaths])];
  const usedBasenames = new Set(allUploadPaths.map((p) => path.basename(p)));

  // ── #810 PUBLISH-ASSET PROVENANCE GATE — runs in BOTH dry-run and live, BEFORE any assembly/upload.
  // Re-hashes EVERY file this smoke is about to upload FOR THE REQUESTED SUBSET (#828 — a Threads-only
  // recovery hashes only the hero video + card-forge-demo-A, the assets it actually uploads), resolved
  // from the POST_ASSETS SSOT, and asserts each sha256 matches the operator-approved render frozen in
  // publish/manifests/forge-demo-871.publish-manifest.json. Freeze AFTER operator approval:
  // `npm run publish:freeze-manifest -- forge-demo-871`.
  const provenanceAssets: PublishAsset[] = POST_ASSETS["forge-demo-871"].assets
    .filter((a) => usedBasenames.has(a.basename))
    .map((a) => ({
      role: a.role,
      path: path.join(a.role === "hero-video" ? VIDEO_DIR : CARD_DIR, a.basename),
    }));
  assertPublishAssetsMatchManifest(provenanceAssets, loadManifest("forge-demo-871"));
  console.log(
    `PROVENANCE: PASS — ${provenanceAssets.length} assets match the forge-demo-871 approved manifest (#810)`,
  );

  // ── #809 COPY-LENGTH GATE — runs in BOTH dry-run and live, BEFORE any assembly/upload, so an
  // over-limit post can NEVER reach a live Typefully draft. Only the REQUESTED platforms are checked
  // (#828): X tweets ≤280 X-weighted (URLs count as 23); the Threads post ≤500 codepoints. Throws a
  // clear per-unit message; no-op when within limits.
  assertCopyWithinPlatformLimits({
    xThread: includeX ? xThread : undefined,
    threadsText: includeThreads ? threadsText : undefined,
  });
  console.log(
    `COPY-LIMITS: PASS — ${includeX ? `${xThread.length} X tweets ≤${CONFIG.publish.copyLimits.xTweet} weighted (URLs=23)` : "X excluded"}, ` +
      `${includeThreads ? `Threads post ≤${CONFIG.publish.copyLimits.threads} chars` : "Threads excluded"} (#809)`,
  );

  // ── #809 VIDEO-DIMENSION ADVISORY (NON-FATAL) for the 9:16 phone HERO. We key on the config hero
  // aspect's canonical dimensions (the actual MP4 is gitignored / may be absent in CI); X applies
  // extra compression to anything taller than 1080 landscape, so we surface the deliberate 9:16
  // tradeoff here rather than letting it be a Typefully surprise. This NEVER fails the build.
  const heroDims = CONFIG.aspects[CONFIG.publish.heroVideoAspect];
  const advisory = heroVideoAdvisory(heroDims);
  if (advisory.flagged) console.log(advisory.message);

  // ── #793 SHORT-THREAD ADVISORY (NON-FATAL). Only relevant when X is in the subset. A longer X
  // thread raises same-second scramble risk (Post #1 fired its tweets the same second → X chained the
  // reply order by ingestion). This only SURFACES the risk via the CONFIG soft cap; never fatal.
  if (includeX) {
    const threadNote = threadLengthAdvisory(xThread);
    if (threadNote) console.log(threadNote);
  }

  // Assert every media file exists + print the per-tweet media map (both modes — what we'd upload).
  // Only the requested platforms' maps are printed (#828).
  if (includeX) {
    console.log("X thread media map (4 tweets — hook=video, body=cards):");
    for (const slot of slots) {
      const size = assertFile(slot.label, slot.path);
      console.log(
        `  • ${slot.label.padEnd(16)} ${slot.kind.padEnd(13)} ${path.basename(slot.path)}  (${(size / 1024 / 1024).toFixed(2)} MB)`,
      );
    }
  }
  if (includeThreads) {
    // Threads is an ORDERED mixed-media post — video LEADS, card second.
    console.log("Threads post media map (mixed carousel — VIDEO LEADS, card second):");
    THREADS_ORDERED_MEDIA.forEach((m, i) => {
      const size = assertFile(`Threads media[${i}]`, m.path);
      console.log(
        `  • ${`Threads media[${i}]`.padEnd(16)} ${m.kind.padEnd(13)} ${path.basename(m.path)}  (${(size / 1024 / 1024).toFixed(2)} MB)`,
      );
    });
  }

  // ── ONE publish-assembly fidelity gate (#797) on the REAL assembled draft (both modes, before any
  // network) — over the REQUESTED subset only (#828). This SINGLE call funnels: (a) video-leads +
  // per-unit cards + no-mixing over whichever of the X thread / Threads post is included; (b)
  // hero-aspect — every included lead video is the full-bleed 9:16 phone cut (#794); (c) order-intent
  // — each included platform post's SUBMITTED media leads with the video (#793).
  const promoThread = includeX ? buildPromoThread(xThread, slots) : undefined;
  const threadsPost = includeThreads ? buildThreadsPrimaryPost(threadsText) : undefined;
  const heroVideos: HeroVideoRef[] = [];
  if (promoThread) heroVideos.push({ videoPath: slots[0].path, label: "X tweet-1 hook" });
  if (threadsPost) heroVideos.push({ videoPath: threadsPost.media[0].path, label: "Threads hero" });
  assertPostAssemblyFidelity({
    xThread: promoThread,
    platformPosts: threadsPost ? [threadsPost] : [],
    heroVideos,
    heroAspectTag: HERO_ASPECT_TAG,
  });
  console.log(
    `\nassertPostAssemblyFidelity: PASS (#797 — ONE gate) over [${platforms.join(", ")}] — included ` +
      `platform(s) lead with video, carry per-unit cards, no mixing; every lead video is the ` +
      `full-bleed ${CONFIG.publish.heroVideoAspect} phone cut; SUBMITTED media leads with the video ✓`,
  );
  if (threadsPost) {
    console.log(
      `Threads lead media: ${threadsPost.media[0].kind} (${path.basename(threadsPost.media[0].path)}) — video leads ✓`,
    );
  }
  // Clear, greppable PASS line for the AC.
  console.log(
    `\nFIDELITY: PASS — forge-demo layout passes assertPostAssemblyFidelity over [${platforms.join(", ")}] ` +
      `(hero=${CONFIG.publish.heroVideoAspect}, video-leads per included platform, per-unit cards, no img+video mixing, intended order)`,
  );

  if (promoThread) {
    const vf = checkVideoFirst(promoThread);
    console.log(
      `video-first soft-check: videoUnitIsFirst=${vf.videoUnitIsFirst} ` +
        `(video on unit ${vf.videoUnitIndex + 1}, first media-bearing unit ${vf.firstMediaUnitIndex + 1})`,
    );
    if (!vf.videoUnitIsFirst && vf.message) console.warn(vf.message);
  }

  // ── POST AUTO-ARCHIVE (both modes, non-fatal). forge-demo is assembled + passed the fidelity gate,
  // so save its canonical copy + metadata into the DURABLE, non-repo archive NOW — automatically, no
  // human step — so a `git clean` of the gitignored out can never lose it. Non-fatal-wrapped.
  const archived = safeArchivePostAll(
    buildArchiveRecord("forge-demo-871", { primaryRoot: ROOT }),
  );
  if (archived)
    console.log(
      `ARCHIVE: forge-demo-871 copy+metadata saved → ${archived.external.archiveDir} (+ in-repo ${archived.inRepo.archiveDir})`,
    );

  if (!live) {
    // DRY-RUN: print the exact draft body with placeholder media ids; ZERO network calls. No
    // TypefullyClient is constructed on this path — nothing reaches the network. Only the requested
    // subset's media is mapped (#828).
    const mediaIds = new Map<string, string>(
      allUploadPaths.map((p) => [p, `<upload:${path.basename(p)}>`]),
    );
    const threadsMediaIds = threadsMediaPaths.map((p) => mediaIds.get(p)!);
    const body = buildDraftBody(platforms, xThread, threadsText, slots, mediaIds, threadsMediaIds);
    console.log(`\nsocial_set_id: ${SOCIAL_SET_ID}`);
    console.log("draft body (DRY-RUN — placeholders for media ids, no publish_at ⇒ DRAFT):");
    console.log(JSON.stringify(body, null, 2));

    const xCount = body.platforms.x?.posts.length ?? 0;
    const tCount = body.platforms.threads?.posts.length ?? 0;
    // Per-platform media count (matches the live upload count below — the shared hero is uploaded
    // once per platform, mirroring the pre-#828 semantics): X media + Threads media for the subset.
    const mediaCount = xMediaPaths.length + threadsMediaPaths.length;
    if (includeThreads) {
      console.log(`\nThreads post[0].media_ids[0] = ${threadsMediaIds[0]}  (the HERO video leads)`);
    }
    console.log(
      `\nPUBLISH-TYPEFULLY-FORGE-DEMO: mode=dry-run posts=x:${xCount},threads:${tCount} media=${mediaCount}`,
    );
    process.exit(0);
  }

  // LIVE — ORCHESTRATOR ONLY, after explicit operator authorization. Real upload + draft create.
  // Uploads ONLY the requested subset's media (#828); the hero video is uploaded once and reused.
  // ── #867 EYEBALL GATE — BEFORE any live publish. The hero VIDEO's EXACT bytes must carry an
  // eyeball-ack (a human LOOKED at the pixels). Fail-closed: no ack / stale ack → THROW before any
  // network call. Only the LIVE path is gated; the free dry-run needs no ack.
  requireEyeballAck(DEMO_HERO, { label: "forge-demo-871 hero video (pre-publish)" });
  console.log("\n→ LIVE mode: verifying auth, uploading media, creating the draft…");
  const client = new TypefullyClient();
  await client.verifyAuth();

  // Upload the X media into the path→id map (only when X is in the subset).
  const mediaIds = new Map<string, string>();
  for (const p of xMediaPaths) {
    mediaIds.set(p, await client.uploadMedia(SOCIAL_SET_ID, p));
  }
  // Upload the ordered Threads carousel media (video first), preserving order. The hero is uploaded
  // here independently of the X upload (mirrors the pre-#828 per-platform upload semantics).
  const threadsMediaIds: string[] = [];
  for (const p of threadsMediaPaths) {
    threadsMediaIds.push(await client.uploadMedia(SOCIAL_SET_ID, p));
  }

  const body = buildDraftBody(platforms, xThread, threadsText, slots, mediaIds, threadsMediaIds);
  const res = await client.createDraft(SOCIAL_SET_ID, body);
  const xCount = body.platforms.x?.posts.length ?? 0;
  const tCount = body.platforms.threads?.posts.length ?? 0;
  console.log(
    `\nPUBLISH-TYPEFULLY-FORGE-DEMO: mode=live draft_id=${res.id} status=${res.status} ` +
      `posts=x:${xCount},threads:${tCount} media=${xMediaPaths.length + threadsMediaPaths.length}`,
  );

  // ── LIVE URL WRITEBACK (non-fatal). forge-demo was NOT yet live; once published, MERGE the publish
  // date + live x/threads URLs into the durable record (fresh URLs come from a read-back via
  // smoke/verify-published.ts — pass them here). Merge — never erase the rest of the record.
  const liveArchived = safeArchivePostAll(
    buildArchiveRecord("forge-demo-871", {
      primaryRoot: ROOT,
      dynamic: { publishedDate: new Date().toISOString().slice(0, 10) },
    }),
  );
  if (liveArchived) {
    console.log(
      `ARCHIVE: forge-demo-871 publish state written back → ${liveArchived.external.metaPath} (+ in-repo ${liveArchived.inRepo.metaPath})`,
    );
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
