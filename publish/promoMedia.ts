/**
 * Promo-media completeness gate (#787, upgraded #787-followup → PER-POST-UNIT).
 *
 * Operator STANDING RULE: every WORDED post unit must carry its OWN card-over-art infographic.
 * For an X THREAD that means EACH tweet with non-empty text needs at least one card-over-art still
 * of ITS OWN (not one shared hero for the whole thread — "infographic is more attractive"; a thread
 * of bare tweets reads as incomplete). The post SET as a whole must also include at least one video.
 *
 * Two shapes are supported:
 *  - A single post (`PromoMediaSet`): text + a card-over-art still + a video, all on the one post.
 *  - A thread (`PromoThread`): an array of post units, each `{ text, stills }`, plus a set-level
 *    `videos`. The gate is PER-UNIT — every unit whose text is non-empty must carry its own
 *    card-over-art still; the set must carry ≥1 video. A thread where only tweet 1 has a card FAILS.
 *
 * This is a both-ends boolean gate: `assertPromoMediaComplete` THROWS on an incomplete set/thread
 * and is a no-op on a complete one. Wire it at the publish-assembly boundary so a dropped per-tweet
 * card-over-art (the exact miss the operator caught) is mechanically impossible to ship silently —
 * prose doctrine alone is ~17% compliant; a hard throw is the backstop.
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

/** One worded unit of a thread (a single tweet): its text lines + its OWN stills. */
export interface PromoPostUnit {
  text: string[];
  stills: PromoStill[];
}

/**
 * A thread (e.g. an X thread): an ordered list of post units, each carrying its own stills, plus
 * the set-level videos (a thread ships one video for the whole set, not one per tweet).
 */
export interface PromoThread {
  units: PromoPostUnit[];
  videos: PromoVideo[];
}

/** The three media kinds a complete single promo post must carry. */
export const REQUIRED_PROMO_MEDIA = ["text", "card-over-art still", "video"] as const;

function hasNonEmptyText(text: string[] | undefined): boolean {
  return Array.isArray(text) && text.some((t) => typeof t === "string" && t.trim().length > 0);
}

function hasCardOverArtStill(stills: PromoStill[] | undefined): boolean {
  return Array.isArray(stills) && stills.some((s) => s?.kind === "card-over-art");
}

function hasVideo(videos: PromoVideo[] | undefined): boolean {
  return Array.isArray(videos) && videos.length > 0;
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
 * Return the human-readable list of what's MISSING from a THREAD (empty list ⇒ complete):
 * one entry per worded unit lacking its own card-over-art still, plus "video" if the set has none.
 */
export function missingPromoThreadMedia(thread: PromoThread): string[] {
  const missing: string[] = [];
  const units = Array.isArray(thread?.units) ? thread.units : [];
  units.forEach((unit, i) => {
    // Only WORDED units are required to carry a card — an empty unit (e.g. a media-only reply) is
    // not a worded post unit, so it has nothing to caption.
    if (hasNonEmptyText(unit?.text) && !hasCardOverArtStill(unit?.stills)) {
      missing.push(`unit ${i + 1} card-over-art still`);
    }
  });
  if (!hasVideo(thread?.videos)) missing.push("video");
  return missing;
}

/** True iff the single post carries all three required media types. */
export function isPromoMediaComplete(media: PromoMediaSet): boolean {
  return missingPromoMedia(media).length === 0;
}

/** True iff every worded unit carries its own card-over-art still AND the set carries a video. */
export function isPromoThreadComplete(thread: PromoThread): boolean {
  return missingPromoThreadMedia(thread).length === 0;
}

/**
 * Throw unless the post/thread is complete.
 *  - Single post (`PromoMediaSet`): needs text + a card-over-art still + a video.
 *  - Thread (`PromoThread`): EVERY worded unit needs its OWN card-over-art still, and the set needs
 *    ≥1 video. A thread where any worded tweet lacks its own card-over-art still throws, naming the
 *    offending unit(s) so the caller (or CI log) is actionable.
 */
export function assertPromoMediaComplete(media: PromoMediaSet | PromoThread): void {
  if (isPromoThread(media)) {
    const missing = missingPromoThreadMedia(media);
    if (missing.length > 0) {
      throw new Error(
        `Promo thread incomplete — EVERY worded post unit (each tweet) must carry its OWN ` +
          `card-over-art still, and the set must include a video. Missing: ${missing.join(", ")}.`,
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
