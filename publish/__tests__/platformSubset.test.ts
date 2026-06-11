/**
 * #828 — PLATFORM-SUBSET publishing tests (partial-publish recovery).
 *
 * The bug: a multi-platform Typefully draft can PARTIALLY publish — X goes live, Threads is blocked
 * (over char limit). Recreating the FULL draft (both X + Threads) to fix the failed platform would
 * RE-POST the already-live X thread = a duplicate. The fix: a draft targeting ONLY the unpublished
 * platform(s). These tests pin the pure core: `parsePlatformsEnv` validates the subset, and
 * `assembleDraftBody` builds a body with ONLY the requested platforms (an excluded platform's block
 * is OMITTED ENTIRELY — no key at all). Plus: a Threads-only body still passes the Threads
 * copy-length (#809) + fidelity (#797) gates, and X assertions are simply not run when X is excluded.
 */

import {
  parsePlatformsEnv,
  assembleDraftBody,
  platformSubsetNote,
  isSubset,
  isPlatform,
  ALL_PLATFORMS,
  type Platform,
  type DraftBodyParts,
} from "../platformSubset";
import { assertCopyWithinPlatformLimits } from "../copyLimits";
import {
  assertPostAssemblyFidelity,
  type PlatformPrimaryPost,
  type PostAssembly,
} from "../promoMedia";
import type { DraftPost } from "../../adapters/typefully";

// ── parsePlatformsEnv ────────────────────────────────────────────────────

describe("parsePlatformsEnv (#828)", () => {
  it("returns BOTH platforms when PLATFORMS is unset", () => {
    expect(parsePlatformsEnv(undefined)).toEqual(["x", "threads"]);
  });

  it("returns BOTH platforms when PLATFORMS is empty / whitespace-only", () => {
    expect(parsePlatformsEnv("")).toEqual(["x", "threads"]);
    expect(parsePlatformsEnv("   ")).toEqual(["x", "threads"]);
    expect(parsePlatformsEnv(" , ")).toEqual(["x", "threads"]); // only separators ⇒ unset
  });

  it("parses a single-platform subset (threads only)", () => {
    expect(parsePlatformsEnv("threads")).toEqual(["threads"]);
  });

  it("parses a single-platform subset (x only)", () => {
    expect(parsePlatformsEnv("x")).toEqual(["x"]);
  });

  it("parses an explicit two-platform list", () => {
    expect(parsePlatformsEnv("x,threads")).toEqual(["x", "threads"]);
  });

  it("is case-insensitive and whitespace-tolerant", () => {
    expect(parsePlatformsEnv(" Threads ")).toEqual(["threads"]);
    expect(parsePlatformsEnv("X, ThReAdS")).toEqual(["x", "threads"]);
  });

  it("returns canonical order (x before threads) regardless of input order", () => {
    expect(parsePlatformsEnv("threads,x")).toEqual(["x", "threads"]);
  });

  it("de-duplicates repeated tokens", () => {
    expect(parsePlatformsEnv("threads,threads")).toEqual(["threads"]);
    expect(parsePlatformsEnv("x,threads,x")).toEqual(["x", "threads"]);
  });

  it("THROWS a clear error naming an unknown platform", () => {
    expect(() => parsePlatformsEnv("linkedin")).toThrow(
      /PLATFORMS contains unknown platform\(s\): linkedin/,
    );
    expect(() => parsePlatformsEnv("linkedin")).toThrow(/Valid platforms are: x, threads/);
  });

  it("THROWS naming the offending token when mixed with a valid one", () => {
    expect(() => parsePlatformsEnv("x,bogus")).toThrow(/unknown platform\(s\): bogus/);
  });
});

describe("isPlatform / isSubset / ALL_PLATFORMS", () => {
  it("isPlatform recognizes only x and threads", () => {
    expect(isPlatform("x")).toBe(true);
    expect(isPlatform("threads")).toBe(true);
    expect(isPlatform("linkedin")).toBe(false);
    expect(isPlatform("")).toBe(false);
  });

  it("isSubset is true only when a platform is excluded", () => {
    expect(isSubset(["threads"])).toBe(true);
    expect(isSubset(["x"])).toBe(true);
    expect(isSubset(["x", "threads"])).toBe(false);
    expect(isSubset([...ALL_PLATFORMS])).toBe(false);
  });
});

describe("platformSubsetNote (#828)", () => {
  it("returns null when publishing the full set", () => {
    expect(platformSubsetNote(["x", "threads"])).toBeNull();
  });

  it("flags a threads-only subset and names the excluded platform", () => {
    const note = platformSubsetNote(["threads"]);
    expect(note).toContain("PLATFORM-SUBSET: publishing only [threads]");
    expect(note).toContain("excluded: [x]");
  });

  it("flags an x-only subset and names the excluded platform", () => {
    const note = platformSubsetNote(["x"]);
    expect(note).toContain("publishing only [x]");
    expect(note).toContain("excluded: [threads]");
  });
});

// ── assembleDraftBody ─────────────────────────────────────────────────────

const X_POSTS: DraftPost[] = [
  { text: "hook", media_ids: ["<v>"] },
  { text: "body", media_ids: ["<c>"] },
];
const THREADS_POSTS: DraftPost[] = [{ text: "threads", media_ids: ["<v>", "<c>"] }];

function parts(over: Partial<DraftBodyParts> = {}): DraftBodyParts {
  return { xPosts: X_POSTS, threadsPosts: THREADS_POSTS, draftTitle: "T", share: false, ...over };
}

describe("assembleDraftBody (#828)", () => {
  it("PLATFORMS=threads ⇒ body has threads ONLY, NO x key at all", () => {
    const body = assembleDraftBody(["threads"], parts());
    expect("threads" in body.platforms).toBe(true);
    expect("x" in body.platforms).toBe(false); // the partial-publish fix — X is not re-posted
    expect(body.platforms.threads?.posts).toEqual(THREADS_POSTS);
    expect(body.platforms.threads?.enabled).toBe(true);
  });

  it("PLATFORMS unset (both) ⇒ body has BOTH x and threads", () => {
    const both = parsePlatformsEnv(undefined);
    const body = assembleDraftBody(both, parts());
    expect("x" in body.platforms).toBe(true);
    expect("threads" in body.platforms).toBe(true);
    expect(body.platforms.x?.posts).toEqual(X_POSTS);
    expect(body.platforms.threads?.posts).toEqual(THREADS_POSTS);
  });

  it("PLATFORMS=x ⇒ body has x ONLY, NO threads key", () => {
    const body = assembleDraftBody(["x"], parts());
    expect("x" in body.platforms).toBe(true);
    expect("threads" in body.platforms).toBe(false);
    expect(body.platforms.x?.posts).toEqual(X_POSTS);
  });

  it("carries draft_title and share through, and never sets publish_at (stays a DRAFT)", () => {
    const body = assembleDraftBody(["x", "threads"], parts({ draftTitle: "my-title", share: false }));
    expect(body.draft_title).toBe("my-title");
    expect(body.share).toBe(false);
    expect("publish_at" in (body as unknown as Record<string, unknown>)).toBe(false);
  });

  it("THROWS when no platform is requested (empty array)", () => {
    expect(() => assembleDraftBody([], parts())).toThrow(
      /no platforms requested — a draft must target at least one/,
    );
  });
});

// ── A threads-only subset still passes the per-platform gates ─────────────

const HERO_9X16 = "out/review/lfah/demo-post3/multi-aspect/post3-demo-9x16.mp4";
const HERO_1X1 = "out/review/lfah/demo-post3/multi-aspect/post3-demo-1x1.mp4";
const CARD_A = "out/review/lfah/image/card-post3-A.png";

const THREADS_TEXT =
  "forge-harness flips it: 8 primitives, only 1 ever talks to the model. Try it.";

function threadsOnlyPost(): PlatformPrimaryPost {
  return {
    label: "Threads",
    text: [THREADS_TEXT],
    media: [
      { path: HERO_9X16, kind: "video" },
      { path: CARD_A, kind: "card-over-art" },
    ],
    mixAllowed: true,
  };
}

/** The assembly a Threads-only subset publish hands to the #797 gate: NO xThread, NO X hero. */
function threadsOnlyAssembly(): PostAssembly {
  const post = threadsOnlyPost();
  return {
    // xThread omitted entirely — the partial-publish recovery excludes X.
    platformPosts: [post],
    heroVideos: [{ videoPath: post.media[0].path, label: "Threads hero" }],
    heroAspectTag: "9x16",
  };
}

describe("threads-only subset passes the per-platform gates (#828)", () => {
  it("the Threads-only copy passes the #809 copy-length gate with X omitted", () => {
    expect(() =>
      assertCopyWithinPlatformLimits({ threadsText: THREADS_TEXT }),
    ).not.toThrow();
  });

  it("an OVER-LIMIT Threads-only copy still HARD-FAILS (gate not skipped)", () => {
    const tooLong = "a".repeat(600); // well over the 500 Threads limit
    expect(() => assertCopyWithinPlatformLimits({ threadsText: tooLong })).toThrow(
      /Threads post is .* over the .* limit/,
    );
  });

  it("the Threads-only assembly passes the #797 fidelity gate (no xThread checked)", () => {
    expect(() => assertPostAssemblyFidelity(threadsOnlyAssembly())).not.toThrow();
  });

  it("the #797 gate STILL fails the Threads post when its hero is the wrong (1:1) aspect", () => {
    const a = threadsOnlyAssembly();
    a.heroVideos = [{ videoPath: HERO_1X1, label: "Threads hero" }];
    expect(() => assertPostAssemblyFidelity(a)).toThrow(/Hero-aspect FIDELITY violation/);
  });

  it("the #797 gate STILL fails a video-LESS Threads post in a subset publish", () => {
    const a = threadsOnlyAssembly();
    a.platformPosts = [
      { label: "Threads", text: [THREADS_TEXT], media: [{ path: CARD_A, kind: "card-over-art" }], mixAllowed: true },
    ];
    expect(() => assertPostAssemblyFidelity(a)).toThrow(/does not lead with video/);
  });
});
