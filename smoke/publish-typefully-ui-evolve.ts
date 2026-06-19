/**
 * Publish-to-Typefully smoke for the #1026 "before/after ui-evolve" DEMONSTRATION post ("I caught my
 * AI design tool's own taste-judge rewarding emptiness — fixed it, proved it blind"). Assembles the
 * ui-evolve launch DRAFT and either prints it (DRY-RUN, default) or actually creates it (LIVE, gated —
 * orchestrator only). This is a SIBLING of smoke/publish-typefully-forge-demo.ts: it REUSES the SAME
 * assembly helpers (`PromoThread`, `PlatformPrimaryPost`) and the SAME consolidated #797 fidelity gate
 * (`assertPostAssemblyFidelity`) from publish/promoMedia — it does NOT fork the gate logic. The only
 * things that differ from the forge-demo post are the COPY, the VIDEO bundle, the CARDS, and the X
 * thread LENGTH:
 *
 *   - forge-demo = the forge-harness DEMONSTRATION (4-tweet thread: hook video + 3 cards).
 *   - ui-evolve  = the band-inversion discovery→fix→proof DEMONSTRATION; a 6-TWEET X thread + a
 *     Threads post, the ui-evolve-hero-9x16-voiced-subtitled cut as hero, card-ui-evolve-{A,B,C}.png
 *     body cards, and — because the thread is 6 tweets, NOT 4 — two extra on-message stills so EVERY
 *     worded tweet carries its own media (the #792 gate requires it): tweet 5 (before 4.8 → after 7.7)
 *     carries the editorial before/after hero, tweet 6 (CTA) carries the 3-redesign trio.
 *
 * THE PRINCIPLE (#792, baked in publish/promoMedia.ts): EVERY platform's primary worded post LEADS
 * WITH VIDEO and every worded unit ALSO carries its own infographic/still. ui-evolve realization:
 *   - X (no image+video mixing in one tweet): a video HOOK tweet (ui-evolve-hero-9x16-voiced-
 *     subtitled.mp4, the full-bleed 9:16 phone HERO — #794) + 5 still body tweets. 6 tweets total.
 *     Modeled as a PromoThread. The three body cards A/B/C are card-over-art; the two extra stills
 *     (before/after hero, redesign trio) are design comparison images that ILLUSTRATE their tweet.
 *   - Threads (mixed-media carousel): a SINGLE post whose media is ORDERED [ui-evolve hero video
 *     (HERO/lead, full-bleed 9:16), card-ui-evolve-C.png (second — the proof card, 4.8→7.7, 6/6)].
 *     VIDEO LEADS, CARD PRESENT. Modeled as a PlatformPrimaryPost so the gate can require media[0] to
 *     be the 9:16 hero video.
 *
 * #794: the hero video EVERYWHERE it leads is the full-bleed 9:16 phone-native cut, config-driven via
 * CONFIG.publish.heroVideoAspect and enforced by the #797 gate's hero-aspect check (the filename
 * carries the `9x16` tag).
 *
 * #810 PROVENANCE: this smoke hard-fails (before any network) unless every file it uploads matches the
 * approved render frozen in publish/manifests/ui-evolve.publish-manifest.json. Order of operations:
 * operator APPROVES the renders → eyeball-ack the hero → freeze the receipt → publish. Re-render +
 * re-approve ⇒ RE-FREEZE first.
 *
 * #867 EYEBALL: the LIVE path additionally requires a fresh eyeball-ack for the hero video's EXACT
 * bytes (a human LOOKED at the pixels) — fail-closed before any network call.
 *
 * Run:
 *   npm run publish:freeze-manifest -- ui-evolve --from <bundle>   (freeze approved hashes — AFTER approval)
 *   npm run smoke:publish-typefully-ui-evolve                       (dry-run, zero network)
 *   npm run smoke:publish-typefully-ui-evolve:live                  (LIVE — orchestrator only, post operator go)
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
  type StillKind,
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
 * ui-evolve's renders + copy were produced in THIS worktree's working dirs (the #1026 legs wrote
 * them), NOT in the primary clone. Resolve them from the worktree repo root by default; override with
 * $CONTENT_PIPELINE_PRIMARY for portability (mirrors smoke/publish-typefully-forge-demo.ts).
 */
const ROOT = process.env.CONTENT_PIPELINE_PRIMARY ?? path.resolve(__dirname, "..");

// The ui-evolve copy SSOT lives in the gitignored out/copy dir (the keystone copy JSON).
const UI_EVOLVE_COPY_JSON = path.join(ROOT, "out", "copy", "ui-evolve-content.json");
// The hero video lands under out/review/ui-evolve/video/; the cards + extra stills under
// out/review/ui-evolve/image/ — distinct dirs, resolved per-role below.
const VIDEO_DIR = path.join(ROOT, "out", "review", "ui-evolve", "video");
const IMAGE_DIR = path.join(ROOT, "out", "review", "ui-evolve", "image");

// HERO video aspect — config-driven (#794), NOT a magic hard-code. The lead video of every
// phone-first platform (X hook tweet, Threads hero post) is the full-bleed phone cut.
const HERO_ASPECT_TAG = CONFIG.publish.heroVideoAspect.replace(":", "x") as AspectTag; // "9x16"
const UI_HERO = path.join(VIDEO_DIR, "ui-evolve-hero-9x16-voiced-subtitled-safe.mp4"); // 9:16 safe-band hero — leads X + Threads
const CARD = (letter: "A" | "B" | "C") => path.join(IMAGE_DIR, `card-ui-evolve-${letter}.png`);
const BEFORE_AFTER_HERO = path.join(IMAGE_DIR, "before-after-hero-origin-terminal-9x16.png"); // tweet 5 — flat origin → dark terminal (max contrast)
const REDESIGN_TRIO = path.join(IMAGE_DIR, "redesign-trio-mobile-1x1.png"); // tweet 6 (CTA) — 3 MOBILE views

const SOCIAL_SET_ID = process.env.TYPEFULLY_SOCIAL_SET_ID ?? "312308";
const DRAFT_TITLE = "ui-evolve — I caught my AI design tool's judge rewarding emptiness";

const EXPECTED_X_TWEETS = 6;

/**
 * Fallback ui-evolve copy (used only if the copy json is absent, e.g. in CI) so the dry-run still
 * assembles + asserts. Mirrors out/copy/ui-evolve-content.json VERBATIM. x_thread is 6 strings (hook
 * + 5 body); threads_post is the single Threads post copy.
 */
const FALLBACK_X_THREAD: string[] = [
  "I built an AI tool to redesign my portfolio.\n\nThen I caught its own taste-judge scoring a nearly-blank page HIGHER than a clean one. It was rewarding emptiness.\n\nHere's how I caught it — and proved the fix blind. 🧵",
  "Its original judge scored looks on 6 legibility rules — hierarchy, spacing, alignment.\n\nBut a page can be flawlessly legible and say nothing. So it scored a nearly-empty draft 87.1 — ABOVE a clean page at 83.1.\n\nTop marks for doing the least.",
  "So I rebuilt the judge: 11 dimensions, 5 of them STRUCTURAL — depth, rhythm, hierarchy-contrast, distinctiveness.\n\nThe trick is a band that PEAKS in the middle. You can't max it by being empty OR by being cluttered. Genuinely-composed design is what scores high.",
  "Then I tested the fix honestly: ran the new judge BLIND on 6 real screenshots — no labels, no hints.\n\nIt scored my old generic site 4.8, and three new redesigns 7.7 — and sorted all six into the right buckets. 6 for 6.",
  "Same résumé. Before 4.8, after 7.7 — on the same ruler.\n\nThree redesigns, three directions (editorial / terminal / Swiss), all proven better — not just \"looks different.\"",
  "It's open source — a Claude Code skill that validates every UI change with objective metrics AND a vision-judge, and reverts anything that isn't genuinely better.\n\nReceipts, not vibes. Early — feedback welcome.\n\ngithub.com/ziyilam3999/ui-evolve",
];

const FALLBACK_THREADS_TEXT = `I built an AI tool to redesign my portfolio — and it taught me its own blind spot.

Its original judge scored 6 legibility rules. But a page can be perfectly legible and say nothing — so it scored a nearly-empty draft 87.1, above a clean page at 83.1.

So I rebuilt it: 11 dimensions, 5 structural. Ran it BLIND on 6 real screenshots: old site 4.8, three redesigns 7.7 — 6/6 correct.

Same résumé, 4.8 → 7.7. Open source, a Claude Code skill.
github.com/ziyilam3999/ui-evolve`;

// ── Helpers ────────────────────────────────────────────────────────────

interface UiEvolveCopy {
  xThread: string[];
  threadsText: string;
}

/**
 * Read the ui-evolve copy from the workspace json, falling back to the inline VERBATIM copy when
 * absent (CI / fresh checkout) so the dry-run still assembles + asserts. The x_thread MUST be exactly
 * 6 strings (hook + 5 body tweets); threads_post MUST be a non-empty string.
 */
function readUiEvolveCopy(): UiEvolveCopy {
  if (!fs.existsSync(UI_EVOLVE_COPY_JSON)) {
    console.log(`(ui-evolve copy json not found at ${UI_EVOLVE_COPY_JSON} — using inline fallback copy)`);
    return { xThread: FALLBACK_X_THREAD, threadsText: FALLBACK_THREADS_TEXT };
  }
  const raw = fs.readFileSync(UI_EVOLVE_COPY_JSON, "utf8");
  const json = JSON.parse(raw) as { x_thread?: unknown; threads_post?: unknown };
  const arr = json.x_thread;
  if (!Array.isArray(arr) || arr.length !== EXPECTED_X_TWEETS || !arr.every((s) => typeof s === "string")) {
    throw new Error(
      `expected x_thread to be ${EXPECTED_X_TWEETS} strings in ${UI_EVOLVE_COPY_JSON}, got ${JSON.stringify(arr)?.slice(0, 120)}`,
    );
  }
  const threadsText = json.threads_post;
  if (typeof threadsText !== "string" || threadsText.trim().length === 0) {
    throw new Error(`expected a non-empty threads_post string in ${UI_EVOLVE_COPY_JSON}`);
  }
  return { xThread: arr as string[], threadsText };
}

function assertFile(label: string, p: string): number {
  if (!fs.existsSync(p)) {
    throw new Error(
      `SMOKE FAIL: missing ${label} at ${p} (render the ui-evolve launch assets first: the hero ` +
        `ui-evolve-hero-9x16-voiced-subtitled.mp4 under out/review/ui-evolve/video/, cards + stills ` +
        `under out/review/ui-evolve/image/)`,
    );
  }
  return fs.statSync(p).size;
}

/**
 * The per-tweet media plan for the ui-evolve X thread. `path` is the file PATH; `kind` distinguishes
 * video vs card-over-art vs a plain still for the promo-media gate. 6 tweets: hook=video, tweets 2-4 =
 * cards, tweet 5 = before/after still, tweet 6 = trio still.
 */
interface MediaSlot {
  label: string;
  path: string;
  kind: "video" | StillKind;
}

function xThreadSlots(): MediaSlot[] {
  return [
    { label: "X tweet 1 (HOOK)", path: UI_HERO, kind: "video" },
    { label: "X tweet 2 (bug)", path: CARD("A"), kind: "card-over-art" },
    { label: "X tweet 3 (fix)", path: CARD("B"), kind: "card-over-art" },
    { label: "X tweet 4 (proof)", path: CARD("C"), kind: "card-over-art" },
    { label: "X tweet 5 (before/after)", path: BEFORE_AFTER_HERO, kind: "other" },
    { label: "X tweet 6 (CTA)", path: REDESIGN_TRIO, kind: "other" },
  ];
}

/**
 * Build the PromoThread for the ui-evolve X thread from the slots + the thread text. This is what the
 * #797 gate runs against — the canonical-layout check (hook=video, every worded tweet carries media,
 * ≥1 card-over-art among the body, no unit mixes image+video).
 */
function buildPromoThread(xThread: string[], slots: MediaSlot[]): PromoThread {
  return {
    units: xThread.map((text, i) => {
      const slot = slots[i];
      return slot.kind === "video"
        ? { text: [text], stills: [], videos: [{ path: slot.path }] }
        : { text: [text], stills: [{ path: slot.path, kind: slot.kind }], videos: [] };
    }),
  };
}

/**
 * The ORDERED Threads media list — THE single source of truth for both the gate and the draft body
 * (so the gate runs on the EXACT media we upload). Threads supports a mixed-media carousel, so the
 * post leads with the full-bleed 9:16 HERO video (#794) then carries card-ui-evolve-C (the proof card
 * — 4.8→7.7, 6/6, the single most self-contained summary still). Order is significant: index 0 is the
 * lead and MUST be the video (#792/#793).
 */
const THREADS_ORDERED_MEDIA: { path: string; kind: "video" | StillKind }[] = [
  { path: UI_HERO, kind: "video" }, // HERO / lead — full-bleed 9:16, video leads (#794)
  { path: CARD("C"), kind: "card-over-art" }, // second — the proof card (4.8 → 7.7, 6/6)
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
 * Build the Typefully draft body for the requested PLATFORM SUBSET (#828). `mediaIds` maps each media
 * path → the media-id string to embed (placeholders in dry-run, real uploaded ids in live).
 * `threadsMediaIds` is the ORDERED Threads carousel — index 0 (the lead) is the HERO video, so the
 * Threads post LEADS WITH VIDEO (#792).
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
  const platforms = parsePlatformsEnv(process.env.PLATFORMS);
  const includeX = platforms.includes("x");
  const includeThreads = platforms.includes("threads");
  const { xThread, threadsText } = readUiEvolveCopy();
  const slots = xThreadSlots();

  console.log("ui-evolve (#1026 — I caught my AI design tool's judge rewarding emptiness) — publish assembly\n");
  const subsetNote = platformSubsetNote(platforms);
  if (subsetNote) console.log(subsetNote + "\n");

  // The media paths this run will actually upload, per the requested subset. The hero video is shared
  // (deduped) across both platforms. Provenance + the upload loops key off these.
  const xMediaPaths = includeX ? slots.map((s) => s.path) : [];
  const threadsMediaPaths = includeThreads ? THREADS_ORDERED_MEDIA.map((m) => m.path) : [];
  const allUploadPaths = [...new Set([...xMediaPaths, ...threadsMediaPaths])];
  const usedBasenames = new Set(allUploadPaths.map((p) => path.basename(p)));

  // ── #810 PUBLISH-ASSET PROVENANCE GATE — runs in BOTH dry-run and live, BEFORE any assembly/upload.
  // Re-hashes EVERY file this smoke is about to upload FOR THE REQUESTED SUBSET (#828), resolved from
  // the POST_ASSETS SSOT, and asserts each sha256 matches the operator-approved render frozen in
  // publish/manifests/ui-evolve.publish-manifest.json. Freeze AFTER operator approval:
  // `npm run publish:freeze-manifest -- ui-evolve --from <bundle>`. The hero lives under VIDEO_DIR;
  // every still (cards + the two extra images) under IMAGE_DIR.
  const provenanceAssets: PublishAsset[] = POST_ASSETS["ui-evolve"].assets
    .filter((a) => usedBasenames.has(a.basename))
    .map((a) => ({
      role: a.role,
      path: path.join(a.role === "hero-video" ? VIDEO_DIR : IMAGE_DIR, a.basename),
    }));
  assertPublishAssetsMatchManifest(provenanceAssets, loadManifest("ui-evolve"));
  console.log(
    `PROVENANCE: PASS — ${provenanceAssets.length} assets match the ui-evolve approved manifest (#810)`,
  );

  // ── #809 COPY-LENGTH GATE — runs in BOTH dry-run and live, BEFORE any assembly/upload. Only the
  // REQUESTED platforms are checked (#828): X tweets ≤280 X-weighted (URLs=23); the Threads post ≤500.
  assertCopyWithinPlatformLimits({
    xThread: includeX ? xThread : undefined,
    threadsText: includeThreads ? threadsText : undefined,
  });
  console.log(
    `COPY-LIMITS: PASS — ${includeX ? `${xThread.length} X tweets ≤${CONFIG.publish.copyLimits.xTweet} weighted (URLs=23)` : "X excluded"}, ` +
      `${includeThreads ? `Threads post ≤${CONFIG.publish.copyLimits.threads} chars` : "Threads excluded"} (#809)`,
  );

  // ── #809 VIDEO-DIMENSION ADVISORY (NON-FATAL) for the 9:16 phone HERO.
  const heroDims = CONFIG.aspects[CONFIG.publish.heroVideoAspect];
  const advisory = heroVideoAdvisory(heroDims);
  if (advisory.flagged) console.log(advisory.message);

  // ── #793 SHORT-THREAD ADVISORY (NON-FATAL). Only relevant when X is in the subset.
  if (includeX) {
    const threadNote = threadLengthAdvisory(xThread);
    if (threadNote) console.log(threadNote);
  }

  // Assert every media file exists + print the per-tweet media map (both modes — what we'd upload).
  if (includeX) {
    console.log("X thread media map (6 tweets — hook=video, body=cards+stills, every tweet carries media):");
    for (const slot of slots) {
      const size = assertFile(slot.label, slot.path);
      console.log(
        `  • ${slot.label.padEnd(24)} ${slot.kind.padEnd(13)} ${path.basename(slot.path)}  (${(size / 1024 / 1024).toFixed(2)} MB)`,
      );
    }
  }
  if (includeThreads) {
    console.log("Threads post media map (mixed carousel — VIDEO LEADS, proof card second):");
    THREADS_ORDERED_MEDIA.forEach((m, i) => {
      const size = assertFile(`Threads media[${i}]`, m.path);
      console.log(
        `  • ${`Threads media[${i}]`.padEnd(16)} ${m.kind.padEnd(13)} ${path.basename(m.path)}  (${(size / 1024 / 1024).toFixed(2)} MB)`,
      );
    });
  }

  // ── ONE publish-assembly fidelity gate (#797) on the REAL assembled draft (both modes, before any
  // network) — over the REQUESTED subset only (#828). Funnels: (a) video-leads + per-unit media +
  // no-mixing; (b) hero-aspect — every lead video is the full-bleed 9:16 phone cut (#794); (c)
  // order-intent — each included platform post's SUBMITTED media leads with the video (#793).
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
      `platform(s) lead with video, every worded tweet carries media, no mixing; every lead video is ` +
      `the full-bleed ${CONFIG.publish.heroVideoAspect} phone cut; SUBMITTED media leads with the video ✓`,
  );
  if (threadsPost) {
    console.log(
      `Threads lead media: ${threadsPost.media[0].kind} (${path.basename(threadsPost.media[0].path)}) — video leads ✓`,
    );
  }
  console.log(
    `\nFIDELITY: PASS — ui-evolve layout passes assertPostAssemblyFidelity over [${platforms.join(", ")}] ` +
      `(hero=${CONFIG.publish.heroVideoAspect}, video-leads per included platform, per-unit media, no img+video mixing, intended order)`,
  );

  if (promoThread) {
    const vf = checkVideoFirst(promoThread);
    console.log(
      `video-first soft-check: videoUnitIsFirst=${vf.videoUnitIsFirst} ` +
        `(video on unit ${vf.videoUnitIndex + 1}, first media-bearing unit ${vf.firstMediaUnitIndex + 1})`,
    );
    if (!vf.videoUnitIsFirst && vf.message) console.warn(vf.message);
  }

  // ── POST AUTO-ARCHIVE (both modes, non-fatal). Save the canonical copy + metadata into the DURABLE,
  // non-repo archive NOW so a `git clean` of the gitignored out can never lose it.
  const archived = safeArchivePostAll(buildArchiveRecord("ui-evolve", { primaryRoot: ROOT }));
  if (archived)
    console.log(
      `ARCHIVE: ui-evolve copy+metadata saved → ${archived.external.archiveDir} (+ in-repo ${archived.inRepo.archiveDir})`,
    );

  if (!live) {
    // DRY-RUN: print the exact draft body with placeholder media ids; ZERO network calls.
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
    const mediaCount = xMediaPaths.length + threadsMediaPaths.length;
    if (includeThreads) {
      console.log(`\nThreads post[0].media_ids[0] = ${threadsMediaIds[0]}  (the HERO video leads)`);
    }
    console.log(
      `\nPUBLISH-TYPEFULLY-UI-EVOLVE: mode=dry-run posts=x:${xCount},threads:${tCount} media=${mediaCount}`,
    );
    process.exit(0);
  }

  // LIVE — ORCHESTRATOR ONLY, after explicit operator authorization. Real upload + draft create.
  // ── #867 EYEBALL GATE — BEFORE any live publish. The hero VIDEO's EXACT bytes must carry an
  // eyeball-ack (a human LOOKED at the pixels). Fail-closed: no ack / stale ack → THROW before any
  // network call. Only the LIVE path is gated; the free dry-run needs no ack.
  requireEyeballAck(UI_HERO, { label: "ui-evolve hero video (pre-publish)" });
  console.log("\n→ LIVE mode: verifying auth, uploading media, creating the draft…");
  const client = new TypefullyClient();
  await client.verifyAuth();

  // Upload the X media into the path→id map (only when X is in the subset).
  const mediaIds = new Map<string, string>();
  for (const p of xMediaPaths) {
    mediaIds.set(p, await client.uploadMedia(SOCIAL_SET_ID, p));
  }
  // Upload the ordered Threads carousel media (video first), preserving order.
  const threadsMediaIds: string[] = [];
  for (const p of threadsMediaPaths) {
    threadsMediaIds.push(await client.uploadMedia(SOCIAL_SET_ID, p));
  }

  const body = buildDraftBody(platforms, xThread, threadsText, slots, mediaIds, threadsMediaIds);
  const res = await client.createDraft(SOCIAL_SET_ID, body);
  const xCount = body.platforms.x?.posts.length ?? 0;
  const tCount = body.platforms.threads?.posts.length ?? 0;
  console.log(
    `\nPUBLISH-TYPEFULLY-UI-EVOLVE: mode=live draft_id=${res.id} status=${res.status} ` +
      `posts=x:${xCount},threads:${tCount} media=${xMediaPaths.length + threadsMediaPaths.length}`,
  );

  // ── LIVE WRITEBACK (non-fatal). MERGE the live draft pointer (id + status) + publish date into the
  // durable record so the archive points at the ACTUAL draft just created — #948.
  const liveArchived = safeArchivePostAll(
    buildArchiveRecord("ui-evolve", {
      primaryRoot: ROOT,
      dynamic: {
        publishedDate: new Date().toISOString().slice(0, 10),
        typefullyDraftId: Number(res.id),
        typefullyDraftStatus: res.status,
      },
    }),
  );
  if (liveArchived) {
    console.log(
      `ARCHIVE: ui-evolve publish state written back → ${liveArchived.external.metaPath} (+ in-repo ${liveArchived.inRepo.metaPath})`,
    );
    // #948 both-ends gate: a live publish MUST leave a numeric draft pointer in the persisted meta.
    for (const metaPath of [liveArchived.external.metaPath, liveArchived.inRepo.metaPath]) {
      const persisted = JSON.parse(fs.readFileSync(metaPath, "utf8")) as {
        typefullyDraftId?: unknown;
      };
      if (typeof persisted.typefullyDraftId !== "number" || !Number.isInteger(persisted.typefullyDraftId)) {
        throw new Error(
          `ARCHIVE WRITEBACK REGRESSION (#948): ${metaPath} has no numeric typefullyDraftId after a live ` +
            `publish (got ${JSON.stringify(persisted.typefullyDraftId)}). The draft pointer was not persisted.`,
        );
      }
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
