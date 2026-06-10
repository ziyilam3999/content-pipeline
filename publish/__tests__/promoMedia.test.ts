/**
 * Promo-media completeness gate (#787 → #789 canonical X-launch-thread invariant).
 *
 * Single post (back-compat): text + card-over-art still + video.
 * Thread (canonical X-launch layout): (a) no worded unit media-less, (b) ≥1 unit carries a video,
 * (c) ≥1 unit carries a card-over-art still, (d) no unit mixes an image AND a video. The gate is a
 * both-ends boolean: complete ⇒ no-op, incomplete ⇒ throws naming what's wrong. A SOFT video-first
 * ordering rule (`checkVideoFirst`) warns but NEVER throws.
 */
import {
  PromoMediaSet,
  PromoThread,
  PlatformPrimaryPost,
  REQUIRED_PROMO_MEDIA,
  missingPromoMedia,
  missingPromoThreadMedia,
  missingPlatformPrimaryMedia,
  isPromoMediaComplete,
  isPromoThreadComplete,
  isPlatformPrimaryComplete,
  assertPromoMediaComplete,
  assertPlatformPrimaryLeadsWithVideo,
  assertHeroAspect,
  detectAspectTag,
  checkVideoFirst,
} from "../promoMedia";

const complete: PromoMediaSet = {
  text: ["We built a local-first agent harness that fixes bugs test-first."],
  stills: [{ path: "out/review/lfah/image/card-over-art-1x1.png", kind: "card-over-art" }],
  videos: [{ path: "out/review/lfah/video/demo-1x1.mp4" }],
};

describe("assertPromoMediaComplete (single post — back-compat)", () => {
  it("does not throw on a complete media set (text + card-over-art still + video)", () => {
    expect(() => assertPromoMediaComplete(complete)).not.toThrow();
    expect(isPromoMediaComplete(complete)).toBe(true);
    expect(missingPromoMedia(complete)).toEqual([]);
  });

  it("throws when TEXT is missing", () => {
    const m: PromoMediaSet = { ...complete, text: [] };
    expect(() => assertPromoMediaComplete(m)).toThrow(/text/);
    expect(missingPromoMedia(m)).toContain("text");
  });

  it("treats whitespace-only text as missing", () => {
    const m: PromoMediaSet = { ...complete, text: ["   ", "\n"] };
    expect(() => assertPromoMediaComplete(m)).toThrow(/text/);
  });

  it("throws when the CARD-OVER-ART still is missing", () => {
    const m: PromoMediaSet = { ...complete, stills: [] };
    expect(() => assertPromoMediaComplete(m)).toThrow(/card-over-art still/);
    expect(missingPromoMedia(m)).toContain("card-over-art still");
  });

  it("does NOT accept a plain card or bare-art still in place of card-over-art", () => {
    const m: PromoMediaSet = {
      ...complete,
      stills: [
        { path: "a.png", kind: "card" },
        { path: "b.png", kind: "bare-art" },
      ],
    };
    expect(() => assertPromoMediaComplete(m)).toThrow(/card-over-art still/);
  });

  it("throws when the VIDEO is missing", () => {
    const m: PromoMediaSet = { ...complete, videos: [] };
    expect(() => assertPromoMediaComplete(m)).toThrow(/video/);
    expect(missingPromoMedia(m)).toContain("video");
  });

  it("lists ALL missing kinds when several are absent", () => {
    const empty: PromoMediaSet = { text: [], stills: [], videos: [] };
    expect(missingPromoMedia(empty)).toEqual([...REQUIRED_PROMO_MEDIA]);
    expect(() => assertPromoMediaComplete(empty)).toThrow(/text.*card-over-art still.*video/);
    expect(isPromoMediaComplete(empty)).toBe(false);
  });
});

// ── Canonical X-launch thread ────────────────────────────────────────────
// Hook (tweet 1) = VIDEO. Every other worded tweet = its own card-over-art still. No unit mixes
// image + video.
function cardedUnit(i: number) {
  return {
    text: [`Tweet ${i} of the launch thread.`],
    stills: [{ path: `out/review/lfah/image/card-tweet-${i}.png`, kind: "card-over-art" as const }],
  };
}
function videoHookUnit() {
  return {
    text: ["Hook tweet of the launch thread."],
    stills: [],
    videos: [{ path: "out/review/lfah/demo-multi-aspect/demo-1x1.mp4" }],
  };
}
const canonicalThread: PromoThread = {
  units: [videoHookUnit(), cardedUnit(2), cardedUnit(3), cardedUnit(4), cardedUnit(5)],
};

describe("assertPromoMediaComplete (thread — CANONICAL X-launch layout)", () => {
  it("(i) PASSES a thread with hook=video + body=cards (no mixing, video leads)", () => {
    expect(() => assertPromoMediaComplete(canonicalThread)).not.toThrow();
    expect(isPromoThreadComplete(canonicalThread)).toBe(true);
    expect(missingPromoThreadMedia(canonicalThread)).toEqual([]);
  });

  it("(ii) THROWS when a worded tweet is bare (media-less)", () => {
    const t: PromoThread = {
      units: [
        videoHookUnit(),
        { text: ["Tweet 2 — bare, no media."], stills: [] },
        cardedUnit(3),
        cardedUnit(4),
        cardedUnit(5),
      ],
    };
    expect(() => assertPromoMediaComplete(t)).toThrow(/unit 2 media-less/);
    expect(missingPromoThreadMedia(t)).toContain("unit 2 media-less");
    expect(isPromoThreadComplete(t)).toBe(false);
  });

  it("(iii) THROWS when a unit mixes an image AND a video (the X EITHER/OR constraint)", () => {
    const t: PromoThread = {
      units: [
        {
          text: ["Hook tweet — illegally carries BOTH an image and a video."],
          stills: [{ path: "out/review/lfah/image/card-tweet-1.png", kind: "card-over-art" }],
          videos: [{ path: "out/review/lfah/demo-multi-aspect/demo-1x1.mp4" }],
        },
        cardedUnit(2),
        cardedUnit(3),
      ],
    };
    expect(() => assertPromoMediaComplete(t)).toThrow(/unit 1 mixes image\+video/);
    expect(missingPromoThreadMedia(t)).toContain("unit 1 mixes image+video");
    expect(isPromoThreadComplete(t)).toBe(false);
  });

  it("(iv) THROWS when the thread has cards but NO video", () => {
    const t: PromoThread = {
      units: [cardedUnit(1), cardedUnit(2), cardedUnit(3)],
    };
    expect(() => assertPromoMediaComplete(t)).toThrow(/video/);
    expect(missingPromoThreadMedia(t)).toContain("video");
    expect(isPromoThreadComplete(t)).toBe(false);
  });

  it("THROWS when the thread has a video but NO card-over-art still anywhere", () => {
    const t: PromoThread = {
      units: [videoHookUnit(), { text: ["Tweet 2"], stills: [{ path: "p.png", kind: "card" }] }],
    };
    expect(() => assertPromoMediaComplete(t)).toThrow(/card-over-art still/);
    expect(missingPromoThreadMedia(t)).toContain("card-over-art still");
  });

  it("ignores an EMPTY (media-only) unit — only WORDED units must carry media", () => {
    const t: PromoThread = {
      units: [videoHookUnit(), cardedUnit(2), { text: ["   "], stills: [] }],
    };
    expect(() => assertPromoMediaComplete(t)).not.toThrow();
    expect(missingPromoThreadMedia(t)).toEqual([]);
  });
});

// ── Per-platform video-first gate (#792 — the Threads regression) ──────────
// The bug the operator caught: a video-LESS Threads post passed the old AGGREGATE check because
// X carried the only video. The gate is now PER-PLATFORM: each video-capable platform's primary
// worded post must ITSELF lead with video. Threads allows a mixed carousel (video + image in one
// post), so the correct Threads post is [video (lead), card-over-art (second)].
const DEMO_4X5 = "out/review/lfah/demo-multi-aspect/demo-4x5.mp4";
const CARD_4X5 = "out/review/lfah/image/card-over-art-4x5.png";

/** A correctly-assembled Threads post: video leads, card present, mixing allowed. */
const threadsVideoLed: PlatformPrimaryPost = {
  label: "Threads",
  text: ["We moved the heavy file-editing role onto a LOCAL model — here's the launch data."],
  media: [
    { path: DEMO_4X5, kind: "video" },
    { path: CARD_4X5, kind: "card-over-art" },
  ],
  mixAllowed: true,
};

describe("assertPromoMediaComplete (platform primary post — #792 per-platform video-first)", () => {
  it("(vi) REJECTS a video-less Threads post (the exact regression operator caught)", () => {
    // The old broken Threads assembly: card ONLY, no video — passed the old aggregate gate.
    const videoLessThreads: PlatformPrimaryPost = {
      label: "Threads",
      text: ["We moved the heavy file-editing role onto a LOCAL model — here's the launch data."],
      media: [{ path: CARD_4X5, kind: "card-over-art" }],
      mixAllowed: true,
    };
    expect(() => assertPromoMediaComplete(videoLessThreads)).toThrow(/Threads does not lead with video/);
    expect(() => assertPlatformPrimaryLeadsWithVideo(videoLessThreads)).toThrow(/lead with video/i);
    expect(missingPlatformPrimaryMedia(videoLessThreads)).toContain(
      'Threads does not lead with video (first media is "card-over-art")',
    );
    expect(isPlatformPrimaryComplete(videoLessThreads)).toBe(false);
  });

  it("(vii) PASSES a correctly-assembled video-led Threads post (video first + card present)", () => {
    expect(() => assertPromoMediaComplete(threadsVideoLed)).not.toThrow();
    expect(() => assertPlatformPrimaryLeadsWithVideo(threadsVideoLed)).not.toThrow();
    expect(missingPlatformPrimaryMedia(threadsVideoLed)).toEqual([]);
    expect(isPlatformPrimaryComplete(threadsVideoLed)).toBe(true);
    // The lead media item is the video, not the still.
    expect(threadsVideoLed.media[0].kind).toBe("video");
  });

  it("REJECTS a video-bearing Threads post where the CARD leads (video not first)", () => {
    const cardLeads: PlatformPrimaryPost = {
      ...threadsVideoLed,
      media: [
        { path: CARD_4X5, kind: "card-over-art" },
        { path: DEMO_4X5, kind: "video" },
      ],
    };
    expect(() => assertPromoMediaComplete(cardLeads)).toThrow(/does not lead with video/);
  });

  it("REJECTS a worded video-only Threads post carrying NO card-over-art still", () => {
    const noCard: PlatformPrimaryPost = {
      ...threadsVideoLed,
      media: [{ path: DEMO_4X5, kind: "video" }],
    };
    expect(() => assertPromoMediaComplete(noCard)).toThrow(/carries no card-over-art still/);
  });

  it("REJECTS an empty (no-media) platform post", () => {
    const empty: PlatformPrimaryPost = { ...threadsVideoLed, media: [] };
    expect(() => assertPromoMediaComplete(empty)).toThrow(/Threads has no media/);
    expect(missingPlatformPrimaryMedia(empty)).toContain("Threads has no media");
  });

  it("REJECTS a no-mix (X-like) platform post that mixes image+video in one post", () => {
    const xLikeMixed: PlatformPrimaryPost = {
      label: "X",
      text: ["Hook tweet illegally carrying both."],
      media: [
        { path: DEMO_4X5, kind: "video" },
        { path: CARD_4X5, kind: "card-over-art" },
      ],
      mixAllowed: false,
    };
    expect(() => assertPromoMediaComplete(xLikeMixed)).toThrow(/X mixes image\+video in one post/);
  });
});

describe("checkVideoFirst (SOFT video-first ordering — warns, never throws)", () => {
  it("(v) the soft warning FIRES but does NOT throw when the video is not the first media unit", () => {
    // Card on tweet 1, video on tweet 2 → video is NOT the first media-bearing unit.
    const misordered: PromoThread = {
      units: [
        cardedUnit(1),
        { text: ["Tweet 2 — the video, but too late."], stills: [], videos: [{ path: "v.mp4" }] },
        cardedUnit(3),
      ],
    };
    // Hard invariant still holds (every worded unit has media, ≥1 video, ≥1 card, no mixing).
    expect(() => assertPromoMediaComplete(misordered)).not.toThrow();

    const check = checkVideoFirst(misordered);
    expect(check.videoUnitIsFirst).toBe(false);
    expect(check.videoUnitIndex).toBe(1);
    expect(check.firstMediaUnitIndex).toBe(0);
    expect(check.message).toMatch(/video should lead/i);
  });

  it("reports videoUnitIsFirst=true (no warning) for the canonical hook=video thread", () => {
    const check = checkVideoFirst(canonicalThread);
    expect(check.videoUnitIsFirst).toBe(true);
    expect(check.videoUnitIndex).toBe(0);
    expect(check.firstMediaUnitIndex).toBe(0);
    expect(check.message).toBeUndefined();
  });

  it("is vacuously OK (no warning) when the thread carries no video", () => {
    const noVideo: PromoThread = { units: [cardedUnit(1), cardedUnit(2)] };
    const check = checkVideoFirst(noVideo);
    expect(check.videoUnitIsFirst).toBe(true);
    expect(check.message).toBeUndefined();
  });
});

// ── Hero-aspect FIDELITY gate (#794 — the exact miss operator caught) ──────
// The bug: the publisher posted demo-1x1.mp4 (1080x1080 SQUARE) as the X hook and demo-4x5.mp4
// on Threads; the full-bleed demo-9x16.mp4 (1080x1920) we built was posted NOWHERE. The #792
// video-first gate only asserts a video LEADS — not WHICH aspect. This gate asserts the lead
// video is the full-bleed 9:16 phone cut, FAILING LOUDLY on a square 1:1 or secondary 4:5 hero.
const DEMO_DIR = "out/review/lfah/demo-multi-aspect";
const HERO_9X16 = `${DEMO_DIR}/demo-9x16.mp4`;
const HERO_1X1 = `${DEMO_DIR}/demo-1x1.mp4`;
const HERO_4X5 = `${DEMO_DIR}/demo-4x5.mp4`;

describe("detectAspectTag (filename aspect-tag convention)", () => {
  it("reads the aspect tag from the renderer's -<tag> filename convention", () => {
    expect(detectAspectTag(HERO_9X16)).toBe("9x16");
    expect(detectAspectTag(HERO_1X1)).toBe("1x1");
    expect(detectAspectTag(HERO_4X5)).toBe("4x5");
    expect(detectAspectTag("/abs/path/demo-16x9.mp4")).toBe("16x9");
  });

  it("returns null when no recognized aspect tag is present", () => {
    expect(detectAspectTag("out/review/lfah/demo.mp4")).toBeNull();
    expect(detectAspectTag("hero.mp4")).toBeNull();
  });
});

describe("assertHeroAspect (#794 hero-aspect fidelity)", () => {
  it("PASSES the full-bleed 9:16 phone hero (the cut we built, leads everywhere)", () => {
    expect(() => assertHeroAspect(HERO_9X16, "9x16", "X tweet-1 hook")).not.toThrow();
    expect(() => assertHeroAspect(HERO_9X16, "9x16", "Threads hero")).not.toThrow();
    // Default expected tag is "9x16".
    expect(() => assertHeroAspect(HERO_9X16)).not.toThrow();
  });

  it("THROWS when a SQUARE 1:1 cut is used as the hero (the exact #794 regression)", () => {
    expect(() => assertHeroAspect(HERO_1X1, "9x16", "X tweet-1 hook")).toThrow(
      /Hero-aspect FIDELITY violation — X tweet-1 hook leads with 1:1 \(1080x1080, square\) but the published hero MUST be the full-bleed 9:16/,
    );
  });

  it("THROWS when the SECONDARY 4:5 cut is used as the hero", () => {
    expect(() => assertHeroAspect(HERO_4X5, "9x16", "Threads hero")).toThrow(
      /published hero MUST be the full-bleed 9:16 \(1080x1920, full-bleed phone-native\) phone cut/,
    );
  });

  it("THROWS (fail closed) when the hero filename carries NO recognizable aspect tag", () => {
    expect(() => assertHeroAspect(`${DEMO_DIR}/demo.mp4`, "9x16", "X tweet-1 hook")).toThrow(
      /carries no recognizable aspect tag/,
    );
  });
});
