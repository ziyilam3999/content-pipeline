/**
 * Promo-media completeness gate.
 *
 * Operator STANDING RULE (#787): every launch / promo post MUST carry all three media types —
 * (a) non-empty TEXT (the thread / copy), (b) at least one CARD-OVER-ART still image, and (c) at
 * least one VIDEO. A post missing any of the three is incomplete and must not ship.
 *
 * This is a both-ends boolean gate: `assertPromoMediaComplete` THROWS on an incomplete set and is
 * a no-op on a complete one. Wire it at the publish-assembly boundary so a dropped card-over-art
 * still (the exact miss the operator caught) is mechanically impossible to ship silently — prose
 * doctrine alone is ~17% compliant; a hard throw is the backstop.
 *
 * Why a dedicated still TYPE (not just "an image"): a deterministic gradient card or a bare
 * background does not count as the promo hero — the rule is specifically about the
 * card-OVER-ART composite. Callers tag stills with their kind so the gate can require the right one.
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
 * A post's assembled media set. `text` is the thread/copy lines; `stills` and `videos` are the
 * rendered visual assets attached to the post.
 */
export interface PromoMediaSet {
  text: string[];
  stills: PromoStill[];
  videos: PromoVideo[];
}

/** The three media kinds a complete promo post must carry. */
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

/**
 * Return the list of REQUIRED media kinds MISSING from `media` (empty list ⇒ complete).
 * Pure predicate — useful for callers that want to report rather than throw.
 */
export function missingPromoMedia(media: PromoMediaSet): string[] {
  const missing: string[] = [];
  if (!hasNonEmptyText(media?.text)) missing.push("text");
  if (!hasCardOverArtStill(media?.stills)) missing.push("card-over-art still");
  if (!hasVideo(media?.videos)) missing.push("video");
  return missing;
}

/** True iff the post carries all three required media types. */
export function isPromoMediaComplete(media: PromoMediaSet): boolean {
  return missingPromoMedia(media).length === 0;
}

/**
 * Throw unless `media` carries ALL THREE required media types (text + card-over-art still +
 * video). The error names exactly what is missing so the caller (or CI log) is actionable.
 */
export function assertPromoMediaComplete(media: PromoMediaSet): void {
  const missing = missingPromoMedia(media);
  if (missing.length > 0) {
    throw new Error(
      `Promo media incomplete — every promo post must carry text + a card-over-art still + a ` +
        `video. Missing: ${missing.join(", ")}.`,
    );
  }
}
