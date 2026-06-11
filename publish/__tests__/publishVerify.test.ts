/**
 * #793 — post-publish read-back verifier + short-thread advisory tests (both-ends booleans).
 *
 * assertPublishedDraftShape: PASSES on a well-formed published draft whose stored X order matches
 * intent; FAILS when status != "published", when x_published_url is missing, and when the stored
 * order is scrambled (the video hero is not on tweet 1). threadLengthAdvisory: null for a 4-tweet
 * thread, a NOTE for a 7-tweet thread (the soft-cap is 5 in the CONFIG SSOT).
 */

import {
  assertPublishedDraftShape,
  threadLengthAdvisory,
  type FetchedDraft,
  type PublishIntent,
} from "../publishVerify";
import { CONFIG } from "../../config";

const SOFT_MAX = CONFIG.publish.threadShape.xSoftMaxTweets; // 5

// A 4-tweet intent: tweet 1 = the video hero, tweets 2..4 = cards.
const INTENT: PublishIntent = {
  threadsEnabled: true,
  xThread: [
    { mediaId: "vid-hero", kind: "video" },
    { mediaId: "card-A", kind: "card-over-art" },
    { mediaId: "card-B", kind: "card-over-art" },
    { mediaId: "card-C", kind: "card-over-art" },
  ],
};

/** A correctly-published, in-order fetched draft matching INTENT. */
function publishedDraft(): FetchedDraft {
  return {
    status: "published",
    published_at: "2026-06-10T12:00:00Z",
    x_published_url: "https://x.com/ziyilam3999/status/123",
    threads_published_url: "https://www.threads.net/@user/post/abc",
    platforms: {
      x: {
        enabled: true,
        posts: [
          { media_ids: ["vid-hero"] },
          { media_ids: ["card-A"] },
          { media_ids: ["card-B"] },
          { media_ids: ["card-C"] },
        ],
      },
      threads: { enabled: true, posts: [{ media_ids: ["vid-hero", "card-A"] }] },
    },
  };
}

describe("assertPublishedDraftShape", () => {
  it("PASSES a well-formed published draft whose stored X order matches intent", () => {
    expect(() => assertPublishedDraftShape(publishedDraft(), INTENT)).not.toThrow();
  });

  it("FAILS when status is not 'published'", () => {
    const d = publishedDraft();
    d.status = "draft";
    expect(() => assertPublishedDraftShape(d, INTENT)).toThrow(/status is "draft", expected "published"/);
  });

  it("FAILS when x_published_url is missing", () => {
    const d = publishedDraft();
    delete d.x_published_url;
    expect(() => assertPublishedDraftShape(d, INTENT)).toThrow(/x_published_url is missing\/empty/);
  });

  it("FAILS when Threads is enabled but threads_published_url is missing", () => {
    const d = publishedDraft();
    delete d.threads_published_url;
    expect(() => assertPublishedDraftShape(d, INTENT)).toThrow(/threads_published_url is missing\/empty/);
  });

  it("FAILS when the stored order is scrambled (video not on tweet 1)", () => {
    const d = publishedDraft();
    // Swap tweet 1 (video) and tweet 2 (card) in the STORED order — intent still expects video first.
    d.platforms!.x!.posts = [
      { media_ids: ["card-A"] },
      { media_ids: ["vid-hero"] },
      { media_ids: ["card-B"] },
      { media_ids: ["card-C"] },
    ];
    expect(() => assertPublishedDraftShape(d, INTENT)).toThrow(/STORED ORDER IS SCRAMBLED/);
  });

  it("FAILS when the stored X thread count differs from intent", () => {
    const d = publishedDraft();
    d.platforms!.x!.posts = d.platforms!.x!.posts!.slice(0, 3); // dropped a tweet
    expect(() => assertPublishedDraftShape(d, INTENT)).toThrow(/count mismatch/);
  });
});

describe("threadLengthAdvisory (non-fatal)", () => {
  it("returns null for a 4-tweet thread (within the soft cap)", () => {
    expect(threadLengthAdvisory(["a", "b", "c", "d"])).toBeNull();
  });

  it("returns a NOTE for a 7-tweet thread (over the soft cap)", () => {
    const note = threadLengthAdvisory(["1", "2", "3", "4", "5", "6", "7"]);
    expect(note).not.toBeNull();
    expect(note).toMatch(/7 tweets/);
    expect(note).toMatch(new RegExp(`soft max ${SOFT_MAX}`));
    expect(note).toMatch(/scramble risk/);
  });

  it("returns null at exactly the soft cap (boundary is inclusive)", () => {
    const exactly = Array.from({ length: SOFT_MAX }, (_, i) => String(i));
    expect(threadLengthAdvisory(exactly)).toBeNull();
  });
});
