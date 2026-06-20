/**
 * Publish-to-Typefully smoke for the "agent-kanban-demo" DEMONSTRATION post ("Your AI agent plans,
 * codes, and reviews its own work — live on a board"). Assembles the agent-kanban launch DRAFT and
 * either prints it (DRY-RUN, default) or actually creates it (LIVE, gated — orchestrator only). This is
 * a SIBLING of smoke/publish-typefully-ui-evolve.ts: it REUSES the SAME assembly helpers (`PromoThread`,
 * `PlatformPrimaryPost`) and the SAME consolidated #797 fidelity gate (`assertPostAssemblyFidelity`)
 * from publish/promoMedia — it does NOT fork the gate logic. The only things that differ from the
 * ui-evolve post are the COPY, the VIDEO bundle, the CARDS, and the X thread LENGTH:
 *
 *   - ui-evolve     = the band-inversion DEMONSTRATION (6-tweet thread: hook video + 3 cards + 2 stills).
 *   - agent-kanban  = the "watch your agent work live on a board" DEMONSTRATION; a 5-TWEET X thread + a
 *     Threads post, the kanban-demo-9x16 voiced cut as hero, card-kanban-{A,B,C,D}.png body cards.
 *
 * THE PRINCIPLE (#792, baked in publish/promoMedia.ts): EVERY platform's primary worded post LEADS
 * WITH VIDEO and every worded unit ALSO carries its own infographic/still. agent-kanban realization:
 *   - X (no image+video mixing in one tweet): a video HOOK tweet (kanban-demo-9x16.mp4, the full-bleed
 *     9:16 phone HERO — #794) + 4 still body tweets. 5 tweets total. Modeled as a PromoThread. The four
 *     body cards A/B/C/D are card-over-art.
 *   - Threads (mixed-media carousel): a SINGLE post whose media is ORDERED [kanban hero video
 *     (HERO/lead, full-bleed 9:16), card-kanban-overart-4x5.png (second — the infographic)]. VIDEO
 *     LEADS, CARD PRESENT. Modeled as a PlatformPrimaryPost so the gate can require media[0] to be the
 *     9:16 hero video.
 *
 * #794: the hero video EVERYWHERE it leads is the full-bleed 9:16 phone-native cut, config-driven via
 * CONFIG.publish.heroVideoAspect and enforced by the #797 gate's hero-aspect check (the filename
 * carries the `9x16` tag).
 *
 * #810 PROVENANCE: this smoke hard-fails (before any network) unless every file it uploads matches the
 * approved render frozen in publish/manifests/agent-kanban-demo.publish-manifest.json. Order of
 * operations: render the cards → copy the approved bundle → freeze the receipt → publish.
 *
 * #867 EYEBALL: the LIVE path additionally requires a fresh eyeball-ack for the hero video's EXACT
 * bytes (a human LOOKED at the pixels) — fail-closed before any network call.
 *
 * Run:
 *   npm run publish:freeze-manifest -- agent-kanban-demo               (freeze approved hashes — AFTER approval)
 *   npm run smoke:publish-typefully-kanban-demo                        (dry-run, zero network)
 *   npm run smoke:publish-typefully-kanban-demo:live                   (LIVE — orchestrator only, post operator go)
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
 * agent-kanban's renders were produced in THIS worktree's working dirs. Resolve them from the worktree
 * repo root by default; override with $CONTENT_PIPELINE_PRIMARY for portability (mirrors the siblings).
 */
const ROOT = process.env.CONTENT_PIPELINE_PRIMARY ?? path.resolve(__dirname, "..");

// The hero video lands under out/review/kanban/video/; the cards (incl. the 4:5 over-art) under
// out/review/kanban/image/ — distinct dirs, resolved per-role below.
const VIDEO_DIR = path.join(ROOT, "out", "review", "kanban", "video");
const IMAGE_DIR = path.join(ROOT, "out", "review", "kanban", "image");

// HERO video aspect — config-driven (#794), NOT a magic hard-code.
const HERO_ASPECT_TAG = CONFIG.publish.heroVideoAspect.replace(":", "x") as AspectTag; // "9x16"
const KANBAN_HERO = path.join(VIDEO_DIR, "kanban-demo-9x16.mp4"); // 9:16 voiced hero — leads X + Threads
const CARD = (letter: "A" | "B" | "C" | "D") => path.join(IMAGE_DIR, `card-kanban-${letter}.png`);
const OVERART = path.join(IMAGE_DIR, "card-kanban-overart-4x5.png"); // Threads infographic

const SOCIAL_SET_ID = process.env.TYPEFULLY_SOCIAL_SET_ID ?? "312308";
const DRAFT_TITLE = "agent-kanban — watch your AI agent plan, code, and review its own work, live";

const EXPECTED_X_TWEETS = 5;

/**
 * The agent-kanban copy — VERBATIM from the operator-approved set. x_thread is 5 strings (hook + 4
 * body); threads_text is the single Threads post copy. There is no separate copy JSON for this post;
 * the operator-approved copy IS this inline constant (the single source of truth the cards mirror).
 */
const X_THREAD: string[] = [
  "Your AI agent plans, codes, and reviews its own work — live on a board. 🧵",
  "Plan → Code → Review: the 3-role agent loop as Kanban columns. You watch the work move, not a spinner.",
  "The green ● WORKING heartbeat shows exactly which ticket your agent is focused on right now.",
  "Tap any ticket for the deep timeline — every step the agent took plus its own review verdict, replayed.",
  "Open-source, MIT. Point it at your own agent's work: github.com/ziyilam3999/agent-kanban",
];

const THREADS_TEXT =
  "Your AI agent plans, codes, and reviews its own work — live on a board. A real-time Kanban for " +
  "agent work: the green ● WORKING heartbeat shows what's in focus right now, tap any ticket for the " +
  "deep timeline (every step + the agent's own review verdict), and idle-vs-active reads at a glance. " +
  "Open-source, MIT 👇 github.com/ziyilam3999/agent-kanban";

// ── Helpers ────────────────────────────────────────────────────────────

interface KanbanCopy {
  xThread: string[];
  threadsText: string;
}

/** Return the inline VERBATIM copy, validating shape (5 X tweets + a non-empty Threads post). */
function readKanbanCopy(): KanbanCopy {
  if (X_THREAD.length !== EXPECTED_X_TWEETS || !X_THREAD.every((s) => typeof s === "string")) {
    throw new Error(`expected x_thread to be ${EXPECTED_X_TWEETS} strings, got ${JSON.stringify(X_THREAD).slice(0, 120)}`);
  }
  if (typeof THREADS_TEXT !== "string" || THREADS_TEXT.trim().length === 0) {
    throw new Error("expected a non-empty threads_text string");
  }
  return { xThread: X_THREAD, threadsText: THREADS_TEXT };
}

function assertFile(label: string, p: string): number {
  if (!fs.existsSync(p)) {
    throw new Error(
      `SMOKE FAIL: missing ${label} at ${p} (render the agent-kanban launch assets first: the hero ` +
        `kanban-demo-9x16.mp4 under out/review/kanban/video/, cards + over-art under out/review/kanban/image/)`,
    );
  }
  return fs.statSync(p).size;
}

/**
 * The per-tweet media plan for the agent-kanban X thread. 5 tweets: hook=video, tweets 2-5 = cards.
 */
interface MediaSlot {
  label: string;
  path: string;
  kind: "video" | StillKind;
}

function xThreadSlots(): MediaSlot[] {
  return [
    { label: "X tweet 1 (HOOK)", path: KANBAN_HERO, kind: "video" },
    { label: "X tweet 2 (loop)", path: CARD("A"), kind: "card-over-art" },
    { label: "X tweet 3 (heartbeat)", path: CARD("B"), kind: "card-over-art" },
    { label: "X tweet 4 (timeline)", path: CARD("C"), kind: "card-over-art" },
    { label: "X tweet 5 (CTA)", path: CARD("D"), kind: "card-over-art" },
  ];
}

/** Build the PromoThread for the X thread — what the #797 gate runs against. */
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
 * The ORDERED Threads media list — THE single source of truth for both the gate and the draft body.
 * Threads supports a mixed-media carousel, so the post leads with the full-bleed 9:16 HERO video (#794)
 * then carries the 4:5 card-over-art infographic. Index 0 is the lead and MUST be the video (#792/#793).
 */
const THREADS_ORDERED_MEDIA: { path: string; kind: "video" | StillKind }[] = [
  { path: KANBAN_HERO, kind: "video" }, // HERO / lead — full-bleed 9:16, video leads (#794)
  { path: OVERART, kind: "card-over-art" }, // second — the infographic (4 points + CTA url)
];

/** The Threads single post as a PlatformPrimaryPost (#792) — ORDERED media, video first. */
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
 * `threadsMediaIds` is the ORDERED Threads carousel — index 0 (the lead) is the HERO video.
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

  // NOTE: publish_at is omitted ⇒ Typefully saves this as a DRAFT.
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
  const { xThread, threadsText } = readKanbanCopy();
  const slots = xThreadSlots();

  console.log("agent-kanban-demo (watch your AI agent work live on a board) — publish assembly\n");
  const subsetNote = platformSubsetNote(platforms);
  if (subsetNote) console.log(subsetNote + "\n");

  const xMediaPaths = includeX ? slots.map((s) => s.path) : [];
  const threadsMediaPaths = includeThreads ? THREADS_ORDERED_MEDIA.map((m) => m.path) : [];
  const allUploadPaths = [...new Set([...xMediaPaths, ...threadsMediaPaths])];
  const usedBasenames = new Set(allUploadPaths.map((p) => path.basename(p)));

  // ── #810 PUBLISH-ASSET PROVENANCE GATE — both modes, BEFORE any assembly/upload. Re-hashes EVERY
  // file this smoke is about to upload FOR THE REQUESTED SUBSET (#828), resolved from POST_ASSETS, and
  // asserts each sha256 matches the operator-approved render frozen in the agent-kanban manifest.
  const provenanceAssets: PublishAsset[] = POST_ASSETS["agent-kanban-demo"].assets
    .filter((a) => usedBasenames.has(a.basename))
    .map((a) => ({
      role: a.role,
      path: path.join(a.role === "hero-video" ? VIDEO_DIR : IMAGE_DIR, a.basename),
    }));
  assertPublishAssetsMatchManifest(provenanceAssets, loadManifest("agent-kanban-demo"));
  console.log(
    `PROVENANCE: PASS — ${provenanceAssets.length} assets match the agent-kanban-demo approved manifest (#810)`,
  );

  // ── #809 COPY-LENGTH GATE — both modes, BEFORE any assembly/upload. Only the REQUESTED platforms are
  // checked (#828): X tweets ≤280 X-weighted (URLs=23); the Threads post ≤500.
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
    console.log("X thread media map (5 tweets — hook=video, body=cards, every tweet carries media):");
    for (const slot of slots) {
      const size = assertFile(slot.label, slot.path);
      console.log(
        `  • ${slot.label.padEnd(24)} ${slot.kind.padEnd(13)} ${path.basename(slot.path)}  (${(size / 1024 / 1024).toFixed(2)} MB)`,
      );
    }
  }
  if (includeThreads) {
    console.log("Threads post media map (mixed carousel — VIDEO LEADS, infographic second):");
    THREADS_ORDERED_MEDIA.forEach((m, i) => {
      const size = assertFile(`Threads media[${i}]`, m.path);
      console.log(
        `  • ${`Threads media[${i}]`.padEnd(16)} ${m.kind.padEnd(13)} ${path.basename(m.path)}  (${(size / 1024 / 1024).toFixed(2)} MB)`,
      );
    });
  }

  // ── ONE publish-assembly fidelity gate (#797) on the REAL assembled draft (both modes, before any
  // network) — over the REQUESTED subset only (#828).
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
    `\nFIDELITY: PASS — agent-kanban-demo layout passes assertPostAssemblyFidelity over [${platforms.join(", ")}] ` +
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

  // ── POST AUTO-ARCHIVE (both modes, non-fatal).
  const archived = safeArchivePostAll(buildArchiveRecord("agent-kanban-demo", { primaryRoot: ROOT }));
  if (archived)
    console.log(
      `ARCHIVE: agent-kanban-demo copy+metadata saved → ${archived.external.archiveDir} (+ in-repo ${archived.inRepo.archiveDir})`,
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
      `\nPUBLISH-TYPEFULLY-KANBAN-DEMO: mode=dry-run posts=x:${xCount},threads:${tCount} media=${mediaCount}`,
    );
    process.exit(0);
  }

  // LIVE — ORCHESTRATOR ONLY, after explicit operator authorization. Real upload + draft create.
  // ── #867 EYEBALL GATE — BEFORE any live publish. The hero VIDEO's EXACT bytes must carry an
  // eyeball-ack (a human LOOKED at the pixels). Fail-closed: no ack / stale ack → THROW.
  requireEyeballAck(KANBAN_HERO, { label: "agent-kanban hero video (pre-publish)" });
  console.log("\n→ LIVE mode: verifying auth, uploading media, creating the draft…");
  const client = new TypefullyClient();
  await client.verifyAuth();

  const mediaIds = new Map<string, string>();
  for (const p of xMediaPaths) {
    mediaIds.set(p, await client.uploadMedia(SOCIAL_SET_ID, p));
  }
  const threadsMediaIds: string[] = [];
  for (const p of threadsMediaPaths) {
    threadsMediaIds.push(await client.uploadMedia(SOCIAL_SET_ID, p));
  }

  const body = buildDraftBody(platforms, xThread, threadsText, slots, mediaIds, threadsMediaIds);
  const res = await client.createDraft(SOCIAL_SET_ID, body);
  const xCount = body.platforms.x?.posts.length ?? 0;
  const tCount = body.platforms.threads?.posts.length ?? 0;
  console.log(
    `\nPUBLISH-TYPEFULLY-KANBAN-DEMO: mode=live draft_id=${res.id} status=${res.status} ` +
      `posts=x:${xCount},threads:${tCount} media=${xMediaPaths.length + threadsMediaPaths.length}`,
  );

  // ── LIVE WRITEBACK (non-fatal).
  const liveArchived = safeArchivePostAll(
    buildArchiveRecord("agent-kanban-demo", {
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
      `ARCHIVE: agent-kanban-demo publish state written back → ${liveArchived.external.metaPath} (+ in-repo ${liveArchived.inRepo.metaPath})`,
    );
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
