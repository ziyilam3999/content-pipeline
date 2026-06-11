/**
 * #793 — POST-PUBLISH READ-BACK VERIFIER + SHORT-THREAD ADVISORY.
 *
 * WHY this exists: an outward publish is NOT verified until you READ BACK the live result —
 * stored/submitted state is NOT the same as published state (the platform can reorder, transform,
 * or drop what you sent). Post #1's X thread came out SCRAMBLED even though the submitted +
 * Typefully-stored order was correct (5 tweets fired the same second + a heavy video on tweet 1 →
 * X chained the replies by ingestion order). The pipeline had no read-back, so it reported
 * "published" off the SUBMITTED state alone. See
 * feedback_verify_live_published_result_not_just_submitted_state.
 *
 * KEY FINDING (verified live 2026-06-10): Typefully's GET-draft response, AFTER a publish, populates
 * `status: "published"`, `published_at`, `x_published_url` (the ROOT tweet URL) and
 * `threads_published_url`. At DRAFT time these are absent. So a post-publish read-back IS now
 * possible. This module is the pure, unit-testable core of that read-back.
 *
 * LIMITATION (documented, NOT faked): Typefully's GET returns only the ROOT tweet URL — it does NOT
 * expose the per-reply ordering of the LIVE thread. So this module can verify the post is published,
 * the live URLs exist, and the STORED (submitted) per-tweet media order matches intent — but it
 * CANNOT confirm the LIVE per-tweet reply order. That full live-order check is a follow-up that needs
 * the X API (see smoke/verify-published.ts); callers must surface it as UNVERIFIED, never assert it.
 */

import { CONFIG } from "../config";

// ── Fetched-draft shape (the subset we read back from Typefully's GET) ──────────────────

/** One stored post in a platform thread, as returned by the GET-draft response. */
export interface FetchedDraftPost {
  /** Ordered media ids attached to this post (the submitted order Typefully stored). */
  media_ids?: string[];
  [k: string]: unknown;
}

/** A stored platform block (x / threads / …) in the GET-draft response. */
export interface FetchedDraftPlatformBlock {
  enabled?: boolean;
  posts?: FetchedDraftPost[];
  [k: string]: unknown;
}

/**
 * The subset of Typefully's GET-draft response this verifier reads. Extra fields are allowed
 * (index signature) — we only assert the publish-confirmation fields + the stored X post order.
 */
export interface FetchedDraft {
  status?: string;
  published_at?: string | null;
  /** The LIVE root tweet URL — present only after a successful publish. */
  x_published_url?: string | null;
  /** The LIVE Threads post URL — present only after a successful publish. */
  threads_published_url?: string | null;
  platforms?: {
    x?: FetchedDraftPlatformBlock;
    threads?: FetchedDraftPlatformBlock;
    [platform: string]: FetchedDraftPlatformBlock | undefined;
  };
  [k: string]: unknown;
}

// ── The intent we verify the live result AGAINST ───────────────────────────────────────

/** One intended X tweet: the media id we submitted for it + whether it is the video hero or a card. */
export interface PublishIntentTweet {
  /** The media id submitted for this tweet — matched against the stored draft's media_ids[0]. */
  mediaId: string;
  /** Hero video (the lead) vs a card-over-art body unit. Drives the human-readable error. */
  kind: "video" | "card-over-art";
}

/**
 * The INTENDED publish, passed in by the caller — NEVER re-derived from the fetched draft (that would
 * be circular). `xThread` is the ordered per-tweet media plan we SUBMITTED (index 0 = the video hero,
 * 1..n = the cards). The verifier asserts the stored draft's X posts carry these media ids IN THIS
 * ORDER, so a scrambled stored order (e.g. video not on tweet 1) is caught.
 */
export interface PublishIntent {
  /** Whether Threads was part of this publish ⇒ require a live `threads_published_url`. */
  threadsEnabled: boolean;
  /** The intended ordered X thread media plan (submit order). */
  xThread: PublishIntentTweet[];
}

// ── The pure read-back assertion ───────────────────────────────────────────────────────

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Assert a FETCHED (read-back) Typefully draft proves a successful, in-order publish of `intent`.
 * Both-ends boolean: a valid published draft returns; ANY mismatch THROWS a clear, specific Error.
 *
 * Checks, in order:
 *   1. `status === "published"` (NOT "draft"/"scheduled"/anything else).
 *   2. `x_published_url` is a non-empty string (the live root tweet URL exists).
 *   3. if `intent.threadsEnabled`, `threads_published_url` is a non-empty string.
 *   4. the STORED X posts order matches `intent.xThread`: same count, and each tweet's
 *      `media_ids[0]` equals the intended media id for that position — so the video hero is on
 *      tweet 1 and the cards on 2..n exactly as submitted.
 *
 * What this does NOT (and CANNOT) verify: the LIVE per-tweet reply order of the published thread.
 * Typefully returns only the root tweet URL; confirming the live reply chain needs the X API. The
 * caller MUST mark that UNVERIFIED — never infer it from a passing return here.
 */
export function assertPublishedDraftShape(draft: FetchedDraft, intent: PublishIntent): void {
  // 1 — published status.
  if (draft.status !== "published") {
    throw new Error(
      `#793 publish-verify: draft.status is ${JSON.stringify(draft.status)}, expected "published" — ` +
        `the post is NOT confirmed live (submitted/stored state is not published state).`,
    );
  }

  // 2 — live X root URL.
  if (!isNonEmptyString(draft.x_published_url)) {
    throw new Error(
      `#793 publish-verify: x_published_url is missing/empty — no live root tweet URL to read back. ` +
        `Cannot confirm the X post published; mark UNVERIFIED rather than "published".`,
    );
  }

  // 3 — live Threads URL when Threads was part of the publish.
  if (intent.threadsEnabled && !isNonEmptyString(draft.threads_published_url)) {
    throw new Error(
      `#793 publish-verify: Threads was enabled but threads_published_url is missing/empty — ` +
        `the Threads post is NOT confirmed live.`,
    );
  }

  // 4 — stored X post order matches intent (catches a scrambled/reordered stored thread).
  const storedPosts = draft.platforms?.x?.posts;
  if (!Array.isArray(storedPosts)) {
    throw new Error(
      `#793 publish-verify: fetched draft has no platforms.x.posts array — cannot verify the stored ` +
        `X thread order.`,
    );
  }
  if (storedPosts.length !== intent.xThread.length) {
    throw new Error(
      `#793 publish-verify: stored X thread has ${storedPosts.length} posts but intent expected ` +
        `${intent.xThread.length} — count mismatch (a tweet was dropped or added).`,
    );
  }
  intent.xThread.forEach((want, i) => {
    const got = storedPosts[i]?.media_ids?.[0];
    if (got !== want.mediaId) {
      throw new Error(
        `#793 publish-verify: stored X tweet ${i + 1} carries media id ${JSON.stringify(got)} but intent ` +
          `expected ${JSON.stringify(want.mediaId)} (the ${want.kind}) — STORED ORDER IS SCRAMBLED ` +
          `(e.g. the video hero is not on tweet 1).`,
      );
    }
  });
}

// ── Short-thread advisory (NON-FATAL) ──────────────────────────────────────────────────

/**
 * #793 — NON-FATAL short-thread advisory. Returns a NOTE string when the X thread exceeds the soft
 * cap (`CONFIG.publish.threadShape.xSoftMaxTweets`), else null. NEVER throws — thread length is a
 * creative call; this only SURFACES the same-second scramble risk a longer thread raises (Post #1
 * fired 5 tweets the same second → X chained the reply order by ingestion). Callers log the note if
 * present and proceed.
 */
export function threadLengthAdvisory(xThread: string[]): string | null {
  const softMax = CONFIG.publish.threadShape.xSoftMaxTweets;
  if (xThread.length <= softMax) return null;
  return (
    `NOTE: X thread has ${xThread.length} tweets (> soft max ${softMax}) — longer threads raise ` +
    `same-second scramble risk (Post #1 fired its tweets the same second and X chained the reply ` +
    `order by ingestion). Advisory only; not a failure.`
  );
}
