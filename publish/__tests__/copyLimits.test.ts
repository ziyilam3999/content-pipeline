/**
 * #809 — per-platform copy-length validator tests (both-ends booleans).
 *
 * The Post #2 incident: X tweet 4 was 282 X-weighted chars (2 over 280) and the Threads post was
 * 524 chars (24 over 500) — and both reached a LIVE Typefully draft because the copy verifier never
 * checked CHARACTER limits. These tests pin the prevention: over-limit FAILS, exactly-at-limit
 * PASSES, the URL discount (every URL = 23) is applied, and the video advisory flags a portrait
 * hero but is silent for a 1920×1080 landscape.
 */

import {
  xWeightedLength,
  codepointLength,
  assertCopyWithinPlatformLimits,
  heroVideoAdvisory,
} from "../copyLimits";
import { CONFIG } from "../../config";

const X_LIMIT = CONFIG.publish.copyLimits.xTweet; // 280
const THREADS_LIMIT = CONFIG.publish.copyLimits.threads; // 500
const URL_WEIGHT = CONFIG.publish.copyLimits.xUrlWeight; // 23

/** A tweet that weighs exactly `n` X-weighted chars (no URLs ⇒ codepoints == weight). */
function tweetOfWeight(n: number): string {
  return "a".repeat(n);
}

describe("xWeightedLength", () => {
  it("counts plain codepoints when there is no URL", () => {
    expect(xWeightedLength("hello")).toBe(5);
  });

  it("counts an emoji (astral codepoint) as one unit, not two", () => {
    // "🧵" is one codepoint but two UTF-16 code units — .length would say 2.
    expect(xWeightedLength("🧵")).toBe(1);
  });

  it("discounts every URL to the fixed t.co weight regardless of its real length", () => {
    const longUrl = "https://github.com/ziyilam3999/local-first-agent-harness/blob/main/x".repeat(2);
    expect(longUrl.length).toBeGreaterThan(URL_WEIGHT * 2);
    // The whole string is JUST two URLs (no separating space would merge them, so use a space).
    const text = `start ${longUrl} ${longUrl} end`;
    // "start " (6) + URL(23) + " " (1) + URL(23) + " end" (4) = 57
    expect(xWeightedLength(text)).toBe(6 + URL_WEIGHT + 1 + URL_WEIGHT + 4);
  });
});

describe("codepointLength", () => {
  it("counts codepoints (Threads does NOT discount URLs)", () => {
    const url = "https://example.com/abc";
    expect(codepointLength(url)).toBe(url.length);
  });
});

describe("assertCopyWithinPlatformLimits — X tweets", () => {
  it("THROWS for an over-limit X tweet, naming the tweet and how many over", () => {
    const over = tweetOfWeight(X_LIMIT + 2); // 282 — the Post #2 case
    expect(() =>
      assertCopyWithinPlatformLimits({ xThread: ["ok", over], threadsText: "" }),
    ).toThrow(/X tweet 2 is 2 over the 280 limit \(282 weighted\)/);
  });

  it("PASSES an exactly-280-weighted tweet (boundary is inclusive)", () => {
    const exactly = tweetOfWeight(X_LIMIT); // 280
    expect(() =>
      assertCopyWithinPlatformLimits({ xThread: [exactly], threadsText: "" }),
    ).not.toThrow();
  });

  it("PASSES a tweet whose RAW length exceeds 280 but weighs under 280 via the URL discount", () => {
    // ~270 visible chars of body + a long URL. Raw length ~300+, weighted ~270 (URL → 23).
    const body = "b".repeat(247); // 247 visible chars
    const url = "https://github.com/ziyilam3999/local-first-agent-harness"; // 56 raw chars
    const tweet = `${body} ${url}`; // raw length 247 + 1 + 56 = 304 (> 280)
    expect([...tweet].length).toBeGreaterThan(X_LIMIT);
    // weighted = 247 + 1 + 23 = 271 (< 280)
    expect(xWeightedLength(tweet)).toBe(247 + 1 + URL_WEIGHT);
    expect(() =>
      assertCopyWithinPlatformLimits({ xThread: [tweet], threadsText: "" }),
    ).not.toThrow();
  });
});

describe("assertCopyWithinPlatformLimits — Threads post", () => {
  it("THROWS for a Threads post over 500 codepoints", () => {
    const over = "t".repeat(THREADS_LIMIT + 24); // 524 — the Post #2 case
    expect(() => assertCopyWithinPlatformLimits({ xThread: [], threadsText: over })).toThrow(
      /Threads post is 24 over the 500 limit \(524 chars\)/,
    );
  });

  it("PASSES a Threads post of exactly 500 codepoints (boundary is inclusive)", () => {
    const exactly = "t".repeat(THREADS_LIMIT); // 500
    expect(() =>
      assertCopyWithinPlatformLimits({ xThread: [], threadsText: exactly }),
    ).not.toThrow();
  });

  it("does NOT discount URLs on Threads (a long URL counts every codepoint)", () => {
    // A Threads post that is under 500 by codepoint passes; one pushed over by a long URL fails.
    const longUrl = "https://example.com/" + "x".repeat(490);
    expect(() =>
      assertCopyWithinPlatformLimits({ xThread: [], threadsText: longUrl }),
    ).toThrow(/Threads post is .* over the 500 limit/);
  });
});

describe("heroVideoAdvisory (non-fatal)", () => {
  it("FLAGS a 1080×1920 portrait hero (the deliberate 9:16 phone cut)", () => {
    const a = heroVideoAdvisory({ width: 1080, height: 1920 });
    expect(a.flagged).toBe(true);
    expect(a.message).toMatch(/1080×1920/);
    expect(a.message).toMatch(/portrait/);
    expect(a.message).toMatch(/non-fatal/i);
  });

  it("is SILENT for a 1920×1080 landscape hero (within X's recommendation)", () => {
    const a = heroVideoAdvisory({ width: 1920, height: 1080 });
    expect(a.flagged).toBe(false);
    expect(a.message).toBe("");
  });
});
