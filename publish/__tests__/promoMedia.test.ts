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
  assertPostAssemblyFidelity,
  assertSubmittedOrderMatchesIntent,
  PostAssembly,
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

// ── CONSOLIDATED publish-assembly fidelity gate (#797 — the ONE funnel) ────
// The publish assembly previously called the fidelity checks ad-hoc and SEPARATELY, so it was
// trivial to wire one and forget another — the failure mode behind THREE misses this session
// (Threads dropped the video #792, the thread went out of order #793, the wrong aspect was posted
// #794). `assertPostAssemblyFidelity` runs ALL the hard checks in ONE call. These tests prove it
// THROWS on EACH violation form individually and is a NO-OP on a complete, correctly-ordered
// assembly. The hero video paths use the renderer's -<tag> filename convention so the hero-aspect
// check can read the aspect without probing pixels.
const HERO_9X16_VID = `${DEMO_DIR}/demo-9x16.mp4`;
const HERO_1X1_VID = `${DEMO_DIR}/demo-1x1.mp4`;
const HERO_4X5_VID = `${DEMO_DIR}/demo-4x5.mp4`;
const CARD_OVER_ART = "out/review/lfah/image/card-over-art-4x5.png";

/** A fully-correct X thread: hook=9:16 video, body=cards, no mixing, video leads. */
function correctXThread(): PromoThread {
  return {
    units: [
      { text: ["Hook tweet."], stills: [], videos: [{ path: HERO_9X16_VID }] },
      cardedUnit(2),
      cardedUnit(3),
    ],
  };
}

/** A fully-correct Threads post: 9:16 video leads (media[0]), card present, mixing allowed. */
function correctThreadsPost(): PlatformPrimaryPost {
  return {
    label: "Threads",
    text: ["We moved the heavy file-editing role onto a LOCAL model — launch data."],
    media: [
      { path: HERO_9X16_VID, kind: "video" },
      { path: CARD_OVER_ART, kind: "card-over-art" },
    ],
    mixAllowed: true,
  };
}

/** A fully-correct assembly: correct X thread + correct Threads post + 9:16 hero videos. */
function correctAssembly(): PostAssembly {
  return {
    xThread: correctXThread(),
    platformPosts: [correctThreadsPost()],
    heroVideos: [
      { videoPath: HERO_9X16_VID, label: "X tweet-1 hook" },
      { videoPath: HERO_9X16_VID, label: "Threads hero" },
    ],
    heroAspectTag: "9x16",
  };
}

describe("assertPostAssemblyFidelity (#797 — the ONE consolidated funnel)", () => {
  it("is a NO-OP on a complete, correctly-ordered assembly", () => {
    expect(() => assertPostAssemblyFidelity(correctAssembly())).not.toThrow();
  });

  it("THROWS on a video-LESS Threads post (the #792 dropped-video miss)", () => {
    const a = correctAssembly();
    a.platformPosts = [
      {
        label: "Threads",
        text: ["Card-only Threads post — no video."],
        media: [{ path: CARD_OVER_ART, kind: "card-over-art" }],
        mixAllowed: true,
      },
    ];
    expect(() => assertPostAssemblyFidelity(a)).toThrow(/Threads does not lead with video/);
  });

  it("THROWS when a worded thread unit carries NO media", () => {
    const a = correctAssembly();
    a.xThread = {
      units: [
        { text: ["Hook tweet."], stills: [], videos: [{ path: HERO_9X16_VID }] },
        { text: ["Tweet 2 — bare, no media."], stills: [] },
        cardedUnit(3),
      ],
    };
    expect(() => assertPostAssemblyFidelity(a)).toThrow(/unit 2 media-less/);
  });

  it("THROWS when a unit mixes image+video on the X thread (the EITHER/OR constraint)", () => {
    const a = correctAssembly();
    a.xThread = {
      units: [
        {
          text: ["Hook tweet — illegally carries BOTH an image and a video."],
          stills: [{ path: "out/review/lfah/image/card-tweet-1.png", kind: "card-over-art" }],
          videos: [{ path: HERO_9X16_VID }],
        },
        cardedUnit(2),
      ],
    };
    expect(() => assertPostAssemblyFidelity(a)).toThrow(/unit 1 mixes image\+video/);
  });

  it("THROWS naming the aspect when the hero video is 1:1 (square) — the #794 miss", () => {
    const a = correctAssembly();
    a.heroVideos = [{ videoPath: HERO_1X1_VID, label: "X tweet-1 hook" }];
    expect(() => assertPostAssemblyFidelity(a)).toThrow(
      /Hero-aspect FIDELITY violation — X tweet-1 hook leads with 1:1 \(1080x1080, square\)/,
    );
  });

  it("THROWS naming the aspect when the hero video is the secondary 4:5 cut", () => {
    const a = correctAssembly();
    a.heroVideos = [{ videoPath: HERO_4X5_VID, label: "Threads hero" }];
    expect(() => assertPostAssemblyFidelity(a)).toThrow(/leads with 4:5 \(1080x1350, portrait\)/);
  });

  it("THROWS when the SUBMITTED media array is out of order (image before the lead video) — #793", () => {
    const a = correctAssembly();
    // Card before the video on a video-capable Threads post → submit-order does not lead with video.
    a.platformPosts = [
      {
        label: "Threads",
        text: ["Threads post with the card assembled BEFORE the video."],
        media: [
          { path: CARD_OVER_ART, kind: "card-over-art" },
          { path: HERO_9X16_VID, kind: "video" },
        ],
        mixAllowed: true,
      },
    ];
    expect(() => assertPostAssemblyFidelity(a)).toThrow(/does not lead with video/);
  });

  it("covers EVERY platform post in the assembly (a second platform's miss still throws)", () => {
    const a = correctAssembly();
    a.platformPosts = [
      correctThreadsPost(),
      {
        label: "LinkedIn",
        text: ["A second platform whose post drops the video."],
        media: [{ path: CARD_OVER_ART, kind: "card-over-art" }],
        mixAllowed: true,
      },
    ];
    expect(() => assertPostAssemblyFidelity(a)).toThrow(/LinkedIn does not lead with video/);
  });
});

describe("assertSubmittedOrderMatchesIntent (#793 — assembly-layer order fidelity)", () => {
  it("is a NO-OP when the video leads (media[0])", () => {
    expect(() => assertSubmittedOrderMatchesIntent(correctThreadsPost())).not.toThrow();
  });

  it("THROWS naming the index when the video is present but NOT first", () => {
    const cardLeads: PlatformPrimaryPost = {
      label: "Threads",
      text: ["Card assembled before the video."],
      media: [
        { path: CARD_OVER_ART, kind: "card-over-art" },
        { path: HERO_9X16_VID, kind: "video" },
      ],
      mixAllowed: true,
    };
    expect(() => assertSubmittedOrderMatchesIntent(cardLeads)).toThrow(
      /Order-intent FIDELITY violation \(#793\).*the VIDEO is at index 1/,
    );
  });

  it("THROWS when the post carries no media at all", () => {
    const empty: PlatformPrimaryPost = {
      label: "Threads",
      text: ["No media."],
      media: [],
      mixAllowed: true,
    };
    expect(() => assertSubmittedOrderMatchesIntent(empty)).toThrow(/carries no media/);
  });

  it("is a NO-OP (not an order miss) when the post has NO video — completeness is a separate gate", () => {
    const noVideo: PlatformPrimaryPost = {
      label: "Threads",
      text: ["Card-only — no video at all."],
      media: [{ path: CARD_OVER_ART, kind: "card-over-art" }],
      mixAllowed: true,
    };
    expect(() => assertSubmittedOrderMatchesIntent(noVideo)).not.toThrow();
  });
});
