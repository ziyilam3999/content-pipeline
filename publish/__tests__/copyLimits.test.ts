/**
 * #809/#827 — per-platform copy-length validator tests (both-ends booleans).
 *
 * The Post #2 incident: X tweet 4 was 282 X-weighted chars (2 over 280) and the Threads post was
 * 524 chars (24 over 500) — and both reached a LIVE Typefully draft because the copy verifier never
 * checked CHARACTER limits.
 *
 * #827 — the codepoint-only count UNDER-counted multi-paragraph posts: Threads/Typefully (and X)
 * count each LINE BREAK as 2 chars (CRLF), so Post #3's 497-codepoint / 7-newline Threads post was
 * really 504 and the gate wrongly PASSED it. The validator now counts each `\n` as 2 (codepoints +
 * newlineCount) for BOTH platforms, and reserves a CONFIG `safetyMargin` below each limit so a
 * borderline post is flagged. These tests pin all of it: over-limit FAILS, the margin boundary is
 * exact, the URL discount (every URL = 23) is applied, newlines count as 2, and the video advisory
 * flags a portrait hero but is silent for a 1920×1080 landscape.
 */

import {
  xWeightedLength,
  codepointLength,
  threadsLength,
  assertCopyWithinPlatformLimits,
  heroVideoAdvisory,
} from "../copyLimits";
import { CONFIG } from "../../config";

const X_LIMIT = CONFIG.publish.copyLimits.xTweet; // 280
const THREADS_LIMIT = CONFIG.publish.copyLimits.threads; // 500
const URL_WEIGHT = CONFIG.publish.copyLimits.xUrlWeight; // 23
const MARGIN = CONFIG.publish.copyLimits.safetyMargin; // 5
const X_EFF = X_LIMIT - MARGIN; // 275 — effective per-tweet cap (#827)
const THREADS_EFF = THREADS_LIMIT - MARGIN; // 495 — effective Threads cap (#827)

/** A tweet that weighs exactly `n` X-weighted chars (no URLs, no newlines ⇒ codepoints == weight). */
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

  it("#827 — counts each newline as 2 chars, so a multi-line tweet weighs MORE than its codepoints", () => {
    const text = "line one\n\nline two"; // 18 codepoints, 2 newlines
    expect(codepointLength(text)).toBe(18);
    // weighted = 18 codepoints + 2 newlines = 20 (> the 18 codepoints)
    expect(xWeightedLength(text)).toBe(20);
    expect(xWeightedLength(text)).toBeGreaterThan(codepointLength(text));
  });
});

describe("codepointLength", () => {
  it("counts codepoints, NOT doubling newlines (pure codepoints)", () => {
    const text = "a\nb\nc"; // 5 codepoints (a, \n, b, \n, c)
    expect(codepointLength(text)).toBe(5);
  });

  it("counts codepoints (URLs are NOT discounted)", () => {
    const url = "https://example.com/abc";
    expect(codepointLength(url)).toBe(url.length);
  });
});

describe("threadsLength (#827 — codepoints + newlines)", () => {
  it("equals codepoints when there are no newlines", () => {
    expect(threadsLength("hello world")).toBe(11);
  });

  it("adds 1 per newline (each line break = 2 chars: codepoint + 1)", () => {
    const text = "a\nb\nc"; // 5 codepoints, 2 newlines → 5 + 2 = 7
    expect(threadsLength(text)).toBe(7);
    expect(threadsLength(text)).toBe(codepointLength(text) + 2);
  });

  it("computes Post #3's pre-fix copy shape as OVER 500 (497 codepoints + 7 newlines = 504)", () => {
    const body = "x".repeat(490); // 490 visible chars
    const sevenNewlines = "\n".repeat(7);
    const text = body + sevenNewlines; // 497 codepoints, 7 newlines
    expect(codepointLength(text)).toBe(497);
    expect(threadsLength(text)).toBe(504); // the real Typefully count that the old gate missed
    expect(threadsLength(text)).toBeGreaterThan(THREADS_LIMIT);
  });
});

describe("assertCopyWithinPlatformLimits — X tweets", () => {
  it("THROWS for an over-limit X tweet, naming the tweet and how many over (vs the effective cap)", () => {
    const over = tweetOfWeight(X_LIMIT); // 280 — over the 275 effective cap by 5
    expect(() =>
      assertCopyWithinPlatformLimits({ xThread: ["ok", over], threadsText: "" }),
    ).toThrow(new RegExp(`X tweet 2 is 5 over the ${X_EFF} limit \\(${X_LIMIT} weighted\\)`));
  });

  it("PASSES a tweet exactly at the effective cap (275) and FAILS one char over (276)", () => {
    expect(() =>
      assertCopyWithinPlatformLimits({ xThread: [tweetOfWeight(X_EFF)], threadsText: "" }),
    ).not.toThrow();
    expect(() =>
      assertCopyWithinPlatformLimits({ xThread: [tweetOfWeight(X_EFF + 1)], threadsText: "" }),
    ).toThrow(new RegExp(`X tweet 1 is 1 over the ${X_EFF} limit`));
  });

  it("PASSES a tweet whose RAW length exceeds 280 but weighs under the cap via the URL discount", () => {
    // ~240 visible chars of body + a long URL. Raw length ~300+, weighted ~265 (URL → 23).
    const body = "b".repeat(241); // 241 visible chars
    const url = "https://github.com/ziyilam3999/local-first-agent-harness"; // 56 raw chars
    const tweet = `${body} ${url}`; // raw length 241 + 1 + 56 = 298 (> 280)
    expect([...tweet].length).toBeGreaterThan(X_LIMIT);
    // weighted = 241 + 1 + 23 = 265 (< 275 effective cap)
    expect(xWeightedLength(tweet)).toBe(241 + 1 + URL_WEIGHT);
    expect(() =>
      assertCopyWithinPlatformLimits({ xThread: [tweet], threadsText: "" }),
    ).not.toThrow();
  });
});

describe("assertCopyWithinPlatformLimits — Threads post", () => {
  it("THROWS for a Threads post over the effective cap, reporting the effective limit", () => {
    const over = "t".repeat(THREADS_LIMIT + 24); // 524 — the Post #2 case
    expect(() => assertCopyWithinPlatformLimits({ xThread: [], threadsText: over })).toThrow(
      new RegExp(`Threads post is ${524 - THREADS_EFF} over the ${THREADS_EFF} limit \\(524 chars\\)`),
    );
  });

  it("#827 — FAILS a post of 498 visible chars + 2 newlines (computes as 502, over the limit)", () => {
    // 498 visible codepoints + 2 newlines = 500 codepoints, 2 newlines → threadsLength 502.
    const text = "t".repeat(498) + "\n\n";
    expect(codepointLength(text)).toBe(500);
    expect(threadsLength(text)).toBe(502);
    expect(() => assertCopyWithinPlatformLimits({ xThread: [], threadsText: text })).toThrow(
      new RegExp(`Threads post is ${502 - THREADS_EFF} over the ${THREADS_EFF} limit \\(502 chars\\)`),
    );
  });

  it("#827 — margin boundary: effective == (limit - margin) PASSES, == (limit - margin + 1) FAILS", () => {
    expect(() =>
      assertCopyWithinPlatformLimits({ xThread: [], threadsText: "t".repeat(THREADS_EFF) }), // 495
    ).not.toThrow();
    expect(() =>
      assertCopyWithinPlatformLimits({ xThread: [], threadsText: "t".repeat(THREADS_EFF + 1) }), // 496
    ).toThrow(new RegExp(`Threads post is 1 over the ${THREADS_EFF} limit \\(496 chars\\)`));
  });

  it("PASSES a multi-paragraph Threads post comfortably under the effective cap", () => {
    // 491 visible chars + 1 newline → threadsLength 493 (< 495 effective cap).
    const text = "t".repeat(491) + "\n";
    expect(threadsLength(text)).toBe(493);
    expect(() =>
      assertCopyWithinPlatformLimits({ xThread: [], threadsText: text }),
    ).not.toThrow();
  });

  it("does NOT discount URLs on Threads (a long URL counts every codepoint)", () => {
    // A long URL with no newlines pushes the post over the effective cap.
    const longUrl = "https://example.com/" + "x".repeat(490);
    expect(() =>
      assertCopyWithinPlatformLimits({ xThread: [], threadsText: longUrl }),
    ).toThrow(new RegExp(`Threads post is .* over the ${THREADS_EFF} limit`));
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
