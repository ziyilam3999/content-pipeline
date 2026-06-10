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
  REQUIRED_PROMO_MEDIA,
  missingPromoMedia,
  missingPromoThreadMedia,
  isPromoMediaComplete,
  isPromoThreadComplete,
  assertPromoMediaComplete,
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
