/**
 * Promo-media completeness gate (#787 → #789 CANONICAL X-LAUNCH-THREAD invariant).
 *
 * Researched best-practice layout for an X (Twitter) LAUNCH THREAD (#789):
 *  1. The HOOK / lead tweet leads with the VIDEO — native video earns ~10x the engagement
 *     (1.9x favorites, 2.5x replies, 2.8x retweets vs avg) and tweet 1 is the highest-impression
 *     slot, so the strongest stop-power media goes there.
 *  2. Every OTHER worded tweet carries its OWN infographic CARD-over-art — cards/infographics are
 *     best for simplifying data in the body.
 *  3. CTA (and any hashtags) live in the LAST tweet.
 *  4. X PLATFORM CONSTRAINT: a single tweet carries EITHER images OR one video — NEVER both. So no
 *     post unit may mix an image and a video.
 *  Sources: https://avenuez.com/blog/2025-2026-x-twitter-organic-social-media-guide-for-brands/ ,
 *  https://business.twitter.com/en/blog/4-ways-to-use-video-during-product-launches-on-twitter.html ,
 *  https://usevisuals.com/blog/writing-effective-twitter-threads-2025 ,
 *  https://buffer.com/library/twitter-video/amp
 *
 * Two shapes are supported:
 *  - A single post (`PromoMediaSet`): text + a card-over-art still + a video, all on the one post.
 *    Back-compat with #787 — unchanged.
 *  - A thread (`PromoThread`): an ordered array of post units, each `{ text, stills, videos? }`. The
 *    canonical thread invariant (HARD — `assertPromoMediaComplete` THROWS unless ALL hold):
 *      (a) NO worded unit is media-less (every worded tweet carries its own image OR a video);
 *      (b) at least one unit carries a VIDEO (the hook leads with it);
 *      (c) at least one unit carries a card-over-art still (the body cards);
 *      (d) NO unit mixes an image AND a video (the X EITHER/OR constraint).
 *    Plus a SOFT best-practice check (a returned/exposed boolean — NEVER a throw): the video unit
 *    SHOULD be the FIRST media-bearing unit. Callers log it; the assembly is not blocked on it.
 *
 * This is a both-ends boolean gate: `assertPromoMediaComplete` THROWS on an incomplete set/thread
 * and is a no-op on a complete one. Wire it at the publish-assembly boundary so a layout violation
 * (the exact miss the operator catches) is mechanically impossible to ship silently — prose doctrine
 * alone is ~17% compliant; a hard throw is the backstop.
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
 * Throw unless the post/thread is complete.
 *  - Single post (`PromoMediaSet`): needs text + a card-over-art still + a video. (Back-compat.)
 *  - Thread (`PromoThread`): the canonical X-launch-thread invariant — (a) no worded unit is
 *    media-less, (b) ≥1 unit carries a video, (c) ≥1 unit carries a card-over-art still, (d) no unit
 *    mixes an image AND a video. Names the offending unit(s)/kind(s) so the caller (or CI log) is
 *    actionable. The SOFT video-first ordering rule is NOT enforced here — use `checkVideoFirst`.
 */
export function assertPromoMediaComplete(media: PromoMediaSet | PromoThread): void {
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
