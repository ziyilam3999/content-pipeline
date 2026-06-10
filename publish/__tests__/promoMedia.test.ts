/**
 * Promo-media completeness gate (#787, per-unit upgrade #787-followup).
 *
 * Operator standing rule: every WORDED post unit must carry its OWN card-over-art infographic.
 * Single post: text + card-over-art still + video. Thread: every worded tweet carries its own
 * card-over-art still + the set carries a video. The gate is a both-ends boolean: complete ⇒ no-op,
 * incomplete ⇒ throws naming what's missing.
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
} from "../promoMedia";

const complete: PromoMediaSet = {
  text: ["We built a local-first agent harness that fixes bugs test-first."],
  stills: [{ path: "out/review/lfah/image/card-over-art-1x1.png", kind: "card-over-art" }],
  videos: [{ path: "out/review/lfah/video/demo-1x1.mp4" }],
};

describe("assertPromoMediaComplete (single post)", () => {
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

// A 5-tweet X thread where EVERY worded tweet carries its OWN card-over-art still, plus one
// set-level video — the per-post-unit shape the operator rule mandates.
function cardedUnit(i: number) {
  return {
    text: [`Tweet ${i} of the launch thread.`],
    stills: [{ path: `out/review/lfah/image/card-tweet-${i}.png`, kind: "card-over-art" as const }],
  };
}
const completeThread: PromoThread = {
  units: [cardedUnit(1), cardedUnit(2), cardedUnit(3), cardedUnit(4), cardedUnit(5)],
  videos: [{ path: "out/review/lfah/video/demo-1x1.mp4" }],
};

describe("assertPromoMediaComplete (thread — PER POST UNIT)", () => {
  it("does NOT throw when EVERY worded tweet carries its own card-over-art still + a video", () => {
    expect(() => assertPromoMediaComplete(completeThread)).not.toThrow();
    expect(isPromoThreadComplete(completeThread)).toBe(true);
    expect(missingPromoThreadMedia(completeThread)).toEqual([]);
  });

  it("THROWS when one worded tweet is missing its own card (only tweet 1 has a card)", () => {
    const t: PromoThread = {
      units: [
        cardedUnit(1),
        { text: ["Tweet 2 — bare, no card."], stills: [] },
        cardedUnit(3),
        cardedUnit(4),
        cardedUnit(5),
      ],
      videos: completeThread.videos,
    };
    expect(() => assertPromoMediaComplete(t)).toThrow(/unit 2 card-over-art still/);
    expect(missingPromoThreadMedia(t)).toContain("unit 2 card-over-art still");
    expect(isPromoThreadComplete(t)).toBe(false);
  });

  it("lists EVERY worded unit missing a card (the one-shared-hero anti-pattern fails)", () => {
    // The exact pattern the rule forbids: one shared hero on tweet 1, the rest bare.
    const oneHero: PromoThread = {
      units: [
        cardedUnit(1),
        { text: ["Tweet 2 — bare."], stills: [] },
        { text: ["Tweet 3 — bare."], stills: [] },
      ],
      videos: completeThread.videos,
    };
    expect(missingPromoThreadMedia(oneHero)).toEqual([
      "unit 2 card-over-art still",
      "unit 3 card-over-art still",
    ]);
    expect(() => assertPromoMediaComplete(oneHero)).toThrow(/unit 2 .* unit 3/);
  });

  it("does NOT accept a plain card or bare-art in place of a per-tweet card-over-art", () => {
    const t: PromoThread = {
      units: [
        cardedUnit(1),
        { text: ["Tweet 2"], stills: [{ path: "p.png", kind: "card" }] },
        { text: ["Tweet 3"], stills: [{ path: "b.png", kind: "bare-art" }] },
      ],
      videos: completeThread.videos,
    };
    expect(() => assertPromoMediaComplete(t)).toThrow(/unit 2 .* unit 3/);
  });

  it("requires a set-level VIDEO even when every tweet is carded", () => {
    const t: PromoThread = { ...completeThread, videos: [] };
    expect(() => assertPromoMediaComplete(t)).toThrow(/video/);
    expect(missingPromoThreadMedia(t)).toContain("video");
  });

  it("ignores an EMPTY (media-only) unit — only WORDED units must be carded", () => {
    const t: PromoThread = {
      units: [cardedUnit(1), { text: ["   "], stills: [] }],
      videos: completeThread.videos,
    };
    expect(() => assertPromoMediaComplete(t)).not.toThrow();
    expect(missingPromoThreadMedia(t)).toEqual([]);
  });
});
