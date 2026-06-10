/**
 * Promo-media completeness gate (#787 → #789 → #792 PLATFORM-AGNOSTIC video-first PRINCIPLE).
 *
 * THE DURABLE PRINCIPLE (#792 — generalized from the X-thread SHAPE that #789 over-fitted to):
 *   EVERY platform's PRIMARY worded post LEADS WITH VIDEO. Native video is the highest-attention
 *   medium (~10x engagement) and is native on X, Threads, and LinkedIn — so the strongest stop-power
 *   media goes FIRST on the lead post. AND every worded unit ALSO carries its own card-over-art
 *   infographic (cards best simplify data in the body). This is platform-agnostic: it is NOT "tweet1
 *   = video, tweets2-5 = cards" — that is merely the X-specific CONSEQUENCE of the principle under
 *   the X constraint below.
 *
 *   X-specific CONSEQUENCE: a single X tweet carries EITHER images OR one video — NEVER both. So on
 *   X the principle is realized by SPLITTING the lead into a video-hook tweet + separate card body
 *   tweets (hook=video, body=cards, CTA last, no unit mixes image+video).
 *
 *   Threads/LinkedIn CONSEQUENCE: these platforms allow a MIXED-MEDIA carousel (a video AND an image
 *   in one post — Threads API supports 2-20 mixed items, verified 2026-06-10). So the principle is
 *   realized in a SINGLE post whose FIRST media item is the video and which also carries the card.
 *
 *  Sources: https://avenuez.com/blog/2025-2026-x-twitter-organic-social-media-guide-for-brands/ ,
 *  https://business.twitter.com/en/blog/4-ways-to-use-video-during-product-launches-on-twitter.html ,
 *  https://usevisuals.com/blog/writing-effective-twitter-threads-2025 ,
 *  https://buffer.com/library/twitter-video/amp ,
 *  https://www.threads.com/@threadsapi.changelog/post/DAWFiK2BE6m (Threads mixed-media carousel)
 *
 * Three shapes are supported:
 *  - A single post (`PromoMediaSet`): text + a card-over-art still + a video. Back-compat with #787.
 *  - A thread (`PromoThread`): the X-launch realization — an ordered array of post units, each
 *    `{ text, stills, videos? }`. The canonical thread invariant (HARD — `assertPromoMediaComplete`
 *    THROWS unless ALL hold):
 *      (a) NO worded unit is media-less (every worded tweet carries its own image OR a video);
 *      (b) at least one unit carries a VIDEO (the hook leads with it);
 *      (c) at least one unit carries a card-over-art still (the body cards);
 *      (d) NO unit mixes an image AND a video (the X EITHER/OR constraint).
 *    Plus a SOFT best-practice check (`checkVideoFirst`, NEVER a throw): the video unit SHOULD be the
 *    FIRST media-bearing unit.
 *  - A platform primary post with ORDERED media (`PlatformPrimaryPost`, #792): the Threads/LinkedIn
 *    realization — a single worded post carrying an ORDERED media list. The PER-PLATFORM invariant
 *    (HARD — `assertPlatformPrimaryLeadsWithVideo` / `assertPromoMediaComplete` THROWS unless ALL hold):
 *      (a) the post carries at least one media item;
 *      (b) the post's FIRST media item is a VIDEO (lead with video);
 *      (c) if the post is WORDED, it ALSO carries a card-over-art still;
 *      (d) if the platform does NOT allow mixing (`mixAllowed:false`), the post carries at most one
 *          media of image-or-video, never both (the X EITHER/OR constraint).
 *
 * This is a both-ends boolean gate: the assert THROWS on an incomplete set/thread/post and is a no-op
 * on a complete one. Wire it at the publish-assembly boundary so a layout violation (the exact miss
 * the operator caught — a video-LESS Threads post passing the old AGGREGATE check because X carried
 * the only video) is mechanically impossible to ship silently. The fix makes the check PER-PLATFORM:
 * an aggregate "≥1 video anywhere" is NOT enough — each video-capable platform's lead post must itself
 * lead with video.
 *
 * Why a dedicated still TYPE (not just "an image"): a deterministic gradient card or a bare
 * background does not count as the promo hero — the rule is specifically about the card-OVER-ART
 * composite. Callers tag stills with their kind so the gate can require the right one.
 */

/** The kind of a still image attached to a promo post. */
export type StillKind = "card-over-art" | "card" | "bare-art" | "other";

export interface PromoStill {
  /** Absolute or repo-relative path to the rendered PNG (informational). */
  path: string;
  kind: StillKind;
}

export interface PromoVideo {
  /** Path to the rendered video (informational). */
  path: string;
}

/**
 * A single post's assembled media set. `text` is the post/copy lines; `stills` and `videos` are the
 * rendered visual assets attached to the post.
 */
export interface PromoMediaSet {
  text: string[];
  stills: PromoStill[];
  videos: PromoVideo[];
}

/**
 * One worded unit of a thread (a single tweet): its text lines + its OWN media. A unit carries
 * EITHER stills OR a video — never both (the X platform constraint). `videos` is optional; the hook
 * tweet carries the video, the body tweets carry stills.
 */
export interface PromoPostUnit {
  text: string[];
  stills: PromoStill[];
  videos?: PromoVideo[];
}

/**
 * A thread (e.g. an X thread): an ordered list of post units. Each unit carries its own media; the
 * video lives on whichever unit is the hook (per-unit `videos`), NOT at the thread level.
 */
export interface PromoThread {
  units: PromoPostUnit[];
}

/**
 * One ORDERED media item on a platform primary post (#792). `kind` distinguishes the video hero
 * from the card-over-art infographic; `path` is informational. Order is significant — index 0 is the
 * lead, which MUST be the video on a video-capable platform.
 */
export interface OrderedMediaItem {
  path: string;
  kind: StillKind | "video";
}

/**
 * A single platform's PRIMARY worded post with ORDERED media (#792) — the Threads/LinkedIn
 * realization of the video-first principle. Unlike `PromoMediaSet` (which splits stills/videos and
 * loses order), `media` is an ORDERED list so the gate can require the LEAD item to be the video.
 *
 *  - `label`: a human name for the platform/post (used in error messages, e.g. "Threads").
 *  - `text`: the post copy lines.
 *  - `media`: the ordered media list; `media[0]` is the lead.
 *  - `mixAllowed`: true on platforms that allow a video AND an image in ONE post (Threads/LinkedIn);
 *    false on X (a single tweet is image-only OR video-only). When false, the gate forbids the post
 *    carrying both an image and a video.
 */
export interface PlatformPrimaryPost {
  label: string;
  text: string[];
  media: OrderedMediaItem[];
  mixAllowed: boolean;
}

/** The three media kinds a complete single promo post must carry. */
export const REQUIRED_PROMO_MEDIA = ["text", "card-over-art still", "video"] as const;

function hasNonEmptyText(text: string[] | undefined): boolean {
  return Array.isArray(text) && text.some((t) => typeof t === "string" && t.trim().length > 0);
}

function hasCardOverArtStill(stills: PromoStill[] | undefined): boolean {
  return Array.isArray(stills) && stills.some((s) => s?.kind === "card-over-art");
}

function hasAnyStill(stills: PromoStill[] | undefined): boolean {
  return Array.isArray(stills) && stills.length > 0;
}

function hasVideo(videos: PromoVideo[] | undefined): boolean {
  return Array.isArray(videos) && videos.length > 0;
}

/** True iff a unit carries any media at all (a still or a video). */
function unitHasMedia(unit: PromoPostUnit | undefined): boolean {
  return hasAnyStill(unit?.stills) || hasVideo(unit?.videos);
}

/** Type guard: is this a thread (per-unit) shape rather than a single post? */
export function isPromoThread(media: PromoMediaSet | PromoThread): media is PromoThread {
  return Array.isArray((media as PromoThread).units);
}

/**
 * Return the list of REQUIRED media kinds MISSING from a SINGLE post (empty list ⇒ complete).
 * Pure predicate — useful for callers that want to report rather than throw.
 */
export function missingPromoMedia(media: PromoMediaSet): string[] {
  const missing: string[] = [];
  if (!hasNonEmptyText(media?.text)) missing.push("text");
  if (!hasCardOverArtStill(media?.stills)) missing.push("card-over-art still");
  if (!hasVideo(media?.videos)) missing.push("video");
  return missing;
}

/**
 * Return the human-readable list of CANONICAL-INVARIANT violations for a THREAD (empty ⇒ complete):
 *   - one `unit N media-less` entry per worded unit carrying NO media (violates (a));
 *   - one `unit N mixes image+video` entry per unit carrying BOTH a still and a video (violates (d));
 *   - `video` if no unit carries a video (violates (b));
 *   - `card-over-art still` if no unit carries a card-over-art still (violates (c)).
 */
export function missingPromoThreadMedia(thread: PromoThread): string[] {
  const missing: string[] = [];
  const units = Array.isArray(thread?.units) ? thread.units : [];

  units.forEach((unit, i) => {
    const worded = hasNonEmptyText(unit?.text);
    const still = hasAnyStill(unit?.stills);
    const vid = hasVideo(unit?.videos);
    // (d) NO unit (worded or not) may mix an image AND a video — the X EITHER/OR constraint.
    if (still && vid) missing.push(`unit ${i + 1} mixes image+video`);
    // (a) NO worded unit may be media-less. An empty (media-only reply) unit is exempt.
    if (worded && !still && !vid) missing.push(`unit ${i + 1} media-less`);
  });

  // (b) the set must carry at least one video (the hook leads with it).
  if (!units.some((u) => hasVideo(u?.videos))) missing.push("video");
  // (c) the set must carry at least one card-over-art still (the body cards).
  if (!units.some((u) => hasCardOverArtStill(u?.stills))) missing.push("card-over-art still");

  return missing;
}

/** Type guard: is this a platform primary post (ordered-media, #792) shape? */
export function isPlatformPrimaryPost(
  media: PromoMediaSet | PromoThread | PlatformPrimaryPost,
): media is PlatformPrimaryPost {
  return (
    Array.isArray((media as PlatformPrimaryPost).media) &&
    typeof (media as PlatformPrimaryPost).mixAllowed === "boolean"
  );
}

/**
 * Return the human-readable list of PER-PLATFORM video-first violations for a `PlatformPrimaryPost`
 * (empty ⇒ complete). The post's `label` prefixes each violation so the caller/CI log is actionable:
 *   - `<label> has no media` if the post carries no media item at all (violates (a));
 *   - `<label> does not lead with video (first media is "<kind>")` if media[0] is not a video (b);
 *   - `<label> is worded but carries no card-over-art still` if worded but no card present (c);
 *   - `<label> mixes image+video in one post` if `mixAllowed` is false yet the post holds both (d).
 */
export function missingPlatformPrimaryMedia(post: PlatformPrimaryPost): string[] {
  const missing: string[] = [];
  const label = post?.label ?? "platform post";
  const media = Array.isArray(post?.media) ? post.media : [];

  // (a) the post must carry at least one media item.
  if (media.length === 0) {
    missing.push(`${label} has no media`);
    return missing; // the rest can't be evaluated without media
  }

  const hasVid = media.some((m) => m?.kind === "video");
  const hasImg = media.some((m) => m?.kind !== "video");

  // (b) the lead media item must be the VIDEO (lead with video).
  if (media[0]?.kind !== "video") {
    missing.push(`${label} does not lead with video (first media is "${media[0]?.kind ?? "none"}")`);
  }

  // (c) a WORDED post must ALSO carry a card-over-art still.
  if (hasNonEmptyText(post?.text) && !media.some((m) => m?.kind === "card-over-art")) {
    missing.push(`${label} is worded but carries no card-over-art still`);
  }

  // (d) on a no-mix platform, the post may carry image XOR video, never both.
  if (post?.mixAllowed === false && hasVid && hasImg) {
    missing.push(`${label} mixes image+video in one post`);
  }

  return missing;
}

/** True iff the platform primary post satisfies the per-platform video-first invariant (#792). */
export function isPlatformPrimaryComplete(post: PlatformPrimaryPost): boolean {
  return missingPlatformPrimaryMedia(post).length === 0;
}

/** True iff the single post carries all three required media types. */
export function isPromoMediaComplete(media: PromoMediaSet): boolean {
  return missingPromoMedia(media).length === 0;
}

/** True iff the thread satisfies the canonical X-launch-thread invariant (hard rules a–d). */
export function isPromoThreadComplete(thread: PromoThread): boolean {
  return missingPromoThreadMedia(thread).length === 0;
}

/**
 * SOFT best-practice check (NEVER throws): result of the video-first ordering rule for a thread.
 *  - `videoUnitIsFirst`: true iff the FIRST media-bearing unit is the one carrying the video (the
 *    hook should lead with the video). Also true (vacuously) when no media or no video is present —
 *    there is no ordering violation to warn about in that case.
 *  - `videoUnitIndex` / `firstMediaUnitIndex`: 0-based indices (−1 when absent) for logging.
 *  - `message`: a human-readable warning when the rule is violated, else undefined.
 */
export interface VideoFirstCheck {
  videoUnitIsFirst: boolean;
  videoUnitIndex: number;
  firstMediaUnitIndex: number;
  message?: string;
}

/**
 * Evaluate the SOFT video-first ordering rule for a thread. Pure, never throws. Callers SHOULD log
 * the result (e.g. `if (!check.videoUnitIsFirst) console.warn(check.message)`); the canonical
 * assembly is not blocked on it.
 */
export function checkVideoFirst(thread: PromoThread): VideoFirstCheck {
  const units = Array.isArray(thread?.units) ? thread.units : [];
  const firstMediaUnitIndex = units.findIndex((u) => unitHasMedia(u));
  const videoUnitIndex = units.findIndex((u) => hasVideo(u?.videos));

  // Vacuously OK when there's no video or no media-bearing unit to order against.
  if (videoUnitIndex < 0 || firstMediaUnitIndex < 0) {
    return { videoUnitIsFirst: true, videoUnitIndex, firstMediaUnitIndex };
  }
  const videoUnitIsFirst = videoUnitIndex === firstMediaUnitIndex;
  return {
    videoUnitIsFirst,
    videoUnitIndex,
    firstMediaUnitIndex,
    message: videoUnitIsFirst
      ? undefined
      : `SOFT WARNING: the video should lead the thread — video is on media-bearing unit ` +
        `${videoUnitIndex + 1}, but the first media-bearing unit is ${firstMediaUnitIndex + 1}. ` +
        `Best practice: put the video on the hook (first) tweet for the highest-impression slot.`,
  };
}

/**
 * Throw unless a single platform PRIMARY post (#792) leads with video. PER-PLATFORM enforcement —
 * this is the gate that the AGGREGATE `assertPromoMediaComplete(PromoThread)` could NOT provide:
 * each video-capable platform's lead post must ITSELF lead with video, not merely have a video
 * somewhere in the batch. (a) carries media, (b) media[0] is the video, (c) worded ⇒ has a
 * card-over-art still, (d) no-mix platform ⇒ image XOR video. Names the offending platform so the
 * caller/CI log is actionable.
 */
export function assertPlatformPrimaryLeadsWithVideo(post: PlatformPrimaryPost): void {
  const missing = missingPlatformPrimaryMedia(post);
  if (missing.length > 0) {
    throw new Error(
      `Platform primary post violates the video-first principle — every platform's primary worded ` +
        `post must LEAD WITH VIDEO (media[0] is the video) and, if worded, also carry a card-over-art ` +
        `still. Violations: ${missing.join(", ")}.`,
    );
  }
}

/**
 * Throw unless the post/thread/platform-post is complete.
 *  - Single post (`PromoMediaSet`): needs text + a card-over-art still + a video. (Back-compat.)
 *  - Thread (`PromoThread`): the X-launch-thread invariant — (a) no worded unit is media-less,
 *    (b) ≥1 unit carries a video, (c) ≥1 unit carries a card-over-art still, (d) no unit mixes an
 *    image AND a video. The SOFT video-first ordering rule is NOT enforced here — use `checkVideoFirst`.
 *  - Platform primary post (`PlatformPrimaryPost`, #792): the per-platform video-first invariant —
 *    media[0] is the video, worded ⇒ also a card-over-art still, no-mix platform ⇒ image XOR video.
 *  Names the offending unit(s)/kind(s)/platform so the caller (or CI log) is actionable.
 */
export function assertPromoMediaComplete(
  media: PromoMediaSet | PromoThread | PlatformPrimaryPost,
): void {
  if (isPlatformPrimaryPost(media)) {
    assertPlatformPrimaryLeadsWithVideo(media);
    return;
  }
  if (isPromoThread(media)) {
    const missing = missingPromoThreadMedia(media);
    if (missing.length > 0) {
      throw new Error(
        `Promo thread violates the canonical X-launch-thread layout — every worded tweet must carry ` +
          `its own media (image OR video, never both), the set must include a video (the hook) and a ` +
          `card-over-art still (the body). Violations: ${missing.join(", ")}.`,
      );
    }
    return;
  }
  const missing = missingPromoMedia(media);
  if (missing.length > 0) {
    throw new Error(
      `Promo media incomplete — every promo post must carry text + a card-over-art still + a ` +
        `video. Missing: ${missing.join(", ")}.`,
    );
  }
}

// ── Hero-aspect FIDELITY gate (#794) ─────────────────────────────────────
//
// THE BUG (operator caught on the live launch post): the publisher posted demo-1x1.mp4
// (1080x1080 SQUARE) as the X hook video and demo-4x5.mp4 on Threads. The full-bleed
// demo-9x16.mp4 (1080x1920, phone-native, most-watched cut we deliberately built in
// #765/#773) was posted NOWHERE. The "9:16 is the hero" decision was baked at the RENDER
// layer (the asset is correct) but never enforced at the PUBLISH/assembly layer, and no
// assertion caught a wrong-aspect hero.
//
// THE FIX: a post-assembly fidelity assertion. The lead/hero video of every phone-first
// platform (X hook tweet, Threads/LinkedIn hero post) MUST be the full-bleed phone cut
// (9:16 / 1080x1920). This FAILS LOUDLY if a square (1:1) or secondary (4:5) aspect is
// used as the hero — making the #794 miss mechanically impossible to ship silently.
//
// We detect the aspect from the FILENAME CONVENTION (`-9x16` / `-1x1` / `-4x5`) rather
// than probing pixel dimensions: the 3 aspect files are named by this convention
// (out/review/lfah/demo-multi-aspect/demo-{1x1,4x5,9x16}.mp4), it needs no vendored
// ffprobe + DYLD shim, and it is CI-portable (no media file need exist on disk).

/** A filename aspect tag, in the `WxH`-style convention the renderer emits. */
export type AspectTag = "9x16" | "1x1" | "4x5" | "16x9";

/** Map a filename aspect tag → its canonical `W:H` AspectRatio form (for clear errors). */
const ASPECT_TAG_TO_RATIO: Record<AspectTag, string> = {
  "9x16": "9:16 (1080x1920, full-bleed phone-native)",
  "1x1": "1:1 (1080x1080, square)",
  "4x5": "4:5 (1080x1350, portrait)",
  "16x9": "16:9 (1920x1080, landscape)",
};

/**
 * Detect the aspect tag embedded in a media filename by the renderer's `-<tag>` convention
 * (e.g. `demo-9x16.mp4` → `"9x16"`). Returns `null` when no recognized tag is present, so
 * callers can decide whether an untagged file is acceptable. Matches the FIRST recognized tag
 * in the basename, anchored to a `-`/`_` boundary or start, case-insensitively. The convention
 * places exactly one aspect tag per filename, so first vs last is moot in practice.
 */
export function detectAspectTag(filePath: string): AspectTag | null {
  const base = filePath.split(/[\\/]/).pop() ?? filePath;
  const m = base.toLowerCase().match(/(?:^|[-_])(9x16|1x1|4x5|16x9)(?=[-_.]|$)/);
  return (m?.[1] as AspectTag | undefined) ?? null;
}

/**
 * Throw unless the hero/lead video at `videoPath` is the expected full-bleed phone-native
 * aspect (default `"9x16"`). This is the #794 fidelity gate: the lead video of every
 * phone-first platform (X hook tweet, Threads/LinkedIn hero post) MUST be the 9:16
 * full-bleed cut — never a square (1:1) or secondary (4:5) crop.
 *
 *  - `videoPath`: the hero video file path (aspect read from its filename convention).
 *  - `expectedTag`: the required aspect tag (default `"9x16"` — the full-bleed phone cut).
 *  - `label`: a human name for the slot (e.g. "X tweet-1 hook") used in the error message.
 *
 * THROWS when the filename carries a DIFFERENT aspect tag (the #794 miss — a 1:1 hero), and
 * also when NO aspect tag is present (an untagged hero is unverifiable → fail closed, so a
 * silently-renamed file can't slip past the gate).
 */
export function assertHeroAspect(
  videoPath: string,
  expectedTag: AspectTag = "9x16",
  label = "hero video",
): void {
  const tag = detectAspectTag(videoPath);
  if (tag === null) {
    throw new Error(
      `Hero-aspect FIDELITY violation — ${label} "${videoPath}" carries no recognizable ` +
        `aspect tag in its filename (expected the full-bleed ${ASPECT_TAG_TO_RATIO[expectedTag]} ` +
        `cut, e.g. demo-${expectedTag}.mp4). An untagged hero is unverifiable; name the file by ` +
        `the renderer's -<aspect> convention so the gate can confirm it leads with the phone cut.`,
    );
  }
  if (tag !== expectedTag) {
    throw new Error(
      `Hero-aspect FIDELITY violation — ${label} leads with ${ASPECT_TAG_TO_RATIO[tag]} but the ` +
        `published hero MUST be the full-bleed ${ASPECT_TAG_TO_RATIO[expectedTag]} phone cut ` +
        `(#794: the square 1:1 was posted as the hero and the 9:16 full-screen cut we built went ` +
        `nowhere). Select the demo-${expectedTag}.mp4 render for the lead slot. Got "${videoPath}".`,
    );
  }
}
