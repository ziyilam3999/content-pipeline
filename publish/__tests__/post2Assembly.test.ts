/**
 * Post #2 ("lfah is a BUILDER") publish-assembly fidelity test (#801).
 *
 * Post #2 differs from Post #1 in SHAPE: a 4-TWEET X thread (hook=video + 3 body cards) + a Threads
 * post, with the builder-demo-9x16.mp4 hero and card-post2-{A,B,C}.png body cards. This test proves
 * the Post #2 assembly — built the SAME way smoke/publish-typefully-post2.ts builds it — PASSES the
 * ONE consolidated #797 gate (`assertPostAssemblyFidelity`), and that the gate still THROWS on the
 * three regression forms (#792 dropped video, #794 wrong hero aspect, #793 out-of-order submit) for
 * the Post #2 shape. No live IO — pure assembly + assertion over the exported promoMedia primitives.
 */
import {
  PromoThread,
  PlatformPrimaryPost,
  PostAssembly,
  assertPostAssemblyFidelity,
  checkVideoFirst,
} from "../promoMedia";

// The Post #2 hero is the full-bleed 9:16 builder demo; the body cards are card-post2-{A,B,C}.png.
// Paths use the renderer's -<tag> filename convention so the hero-aspect check reads the aspect
// without probing pixels (no media file need exist on disk for the assertion).
const HERO_9X16 = "out/review/lfah/demo-builder/builder-demo-9x16.mp4";
const HERO_1X1 = "out/review/lfah/demo-builder/builder-demo-1x1.mp4";
const CARD_A = "out/review/lfah/image/card-post2-A.png";
const CARD_B = "out/review/lfah/image/card-post2-B.png";
const CARD_C = "out/review/lfah/image/card-post2-C.png";

const X_THREAD: string[] = [
  "Hook tweet — it doesn't just fix bugs, it BUILDS whole apps. 🧵",
  "13 build phases → all 13 shipped (100%). 11 on the first try.",
  "$12.56 total cloud spend — ~85% of phases solved by a free local model.",
  "Failing test → local model makes it green → ships when both gates agree. Try it.",
];

const THREADS_TEXT =
  "Our coding agent doesn't just fix bugs — it builds whole apps, test-first. Try it.";

/** Build the Post #2 X thread: tweet 1 = 9:16 video hook, tweets 2-4 = card-post2-{A,B,C}. */
function buildPost2Thread(): PromoThread {
  const cards = [CARD_A, CARD_B, CARD_C];
  return {
    units: X_THREAD.map((text, i) =>
      i === 0
        ? { text: [text], stills: [], videos: [{ path: HERO_9X16 }] }
        : {
            text: [text],
            stills: [{ path: cards[i - 1], kind: "card-over-art" as const }],
            videos: [],
          },
    ),
  };
}

/** Build the Post #2 Threads post: [9:16 video lead, card-post2-A], mixing allowed. */
function buildPost2ThreadsPost(): PlatformPrimaryPost {
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

/** The full, correctly-assembled Post #2 assembly handed to the #797 gate. */
function buildPost2Assembly(): PostAssembly {
  const threadsPost = buildPost2ThreadsPost();
  return {
    xThread: buildPost2Thread(),
    platformPosts: [threadsPost],
    heroVideos: [
      { videoPath: HERO_9X16, label: "X tweet-1 hook" },
      { videoPath: threadsPost.media[0].path, label: "Threads hero" },
    ],
    heroAspectTag: "9x16",
  };
}

describe("Post #2 publish assembly (#801) — #797 fidelity gate", () => {
  it("is a NO-OP on the correctly-assembled Post #2 layout (4-tweet thread + Threads post, 9:16 heroes)", () => {
    expect(() => assertPostAssemblyFidelity(buildPost2Assembly())).not.toThrow();
  });

  it("assembles exactly 4 X tweets: hook=video, 3 body=card-over-art (no mixing)", () => {
    const thread = buildPost2Thread();
    expect(thread.units).toHaveLength(4);
    // Tweet 1 is the video hook (no still).
    expect(thread.units[0].videos).toEqual([{ path: HERO_9X16 }]);
    expect(thread.units[0].stills).toEqual([]);
    // Tweets 2-4 each carry exactly one card-over-art still and no video.
    for (let i = 1; i < 4; i++) {
      expect(thread.units[i].videos ?? []).toEqual([]);
      expect(thread.units[i].stills).toHaveLength(1);
      expect(thread.units[i].stills[0].kind).toBe("card-over-art");
    }
  });

  it("the video leads the thread (soft video-first check passes — hook is the first media unit)", () => {
    const check = checkVideoFirst(buildPost2Thread());
    expect(check.videoUnitIsFirst).toBe(true);
    expect(check.videoUnitIndex).toBe(0);
    expect(check.firstMediaUnitIndex).toBe(0);
    expect(check.message).toBeUndefined();
  });

  it("the Threads post leads with the 9:16 hero VIDEO at media[0], card second", () => {
    const post = buildPost2ThreadsPost();
    expect(post.media[0].kind).toBe("video");
    expect(post.media[0].path).toBe(HERO_9X16);
    expect(post.media[1].kind).toBe("card-over-art");
  });

  it("THROWS on a video-LESS Threads post (the #792 dropped-video miss) for the Post #2 shape", () => {
    const a = buildPost2Assembly();
    a.platformPosts = [
      {
        label: "Threads",
        text: [THREADS_TEXT],
        media: [{ path: CARD_A, kind: "card-over-art" }],
        mixAllowed: true,
      },
    ];
    expect(() => assertPostAssemblyFidelity(a)).toThrow(/Threads does not lead with video/);
  });

  it("THROWS naming the aspect when the Post #2 hero is the SQUARE 1:1 cut (the #794 miss)", () => {
    const a = buildPost2Assembly();
    a.heroVideos = [{ videoPath: HERO_1X1, label: "X tweet-1 hook" }];
    expect(() => assertPostAssemblyFidelity(a)).toThrow(
      /Hero-aspect FIDELITY violation — X tweet-1 hook leads with 1:1 \(1080x1080, square\)/,
    );
  });

  it("THROWS when the Threads SUBMITTED media is out of order (card before the lead video) — #793", () => {
    const a = buildPost2Assembly();
    a.platformPosts = [
      {
        label: "Threads",
        text: [THREADS_TEXT],
        media: [
          { path: CARD_A, kind: "card-over-art" },
          { path: HERO_9X16, kind: "video" },
        ],
        mixAllowed: true,
      },
    ];
    expect(() => assertPostAssemblyFidelity(a)).toThrow(/does not lead with video/);
  });

  it("THROWS when a worded body tweet is bare (media-less) — every worded tweet must carry a card", () => {
    const a = buildPost2Assembly();
    a.xThread = {
      units: [
        { text: [X_THREAD[0]], stills: [], videos: [{ path: HERO_9X16 }] },
        { text: [X_THREAD[1]], stills: [] }, // bare body tweet
        { text: [X_THREAD[2]], stills: [{ path: CARD_B, kind: "card-over-art" }] },
        { text: [X_THREAD[3]], stills: [{ path: CARD_C, kind: "card-over-art" }] },
      ],
    };
    expect(() => assertPostAssemblyFidelity(a)).toThrow(/unit 2 media-less/);
  });
});
