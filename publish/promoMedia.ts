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
