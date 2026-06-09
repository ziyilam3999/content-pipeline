/**
 * #765 — per-aspect demo layout contract (the frame-fill assertion).
 *
 * The animated demo used to center a fixed square block in every frame, so the
 * phone-native 9:16 cut showed a 1:1 island with empty top/bottom bands. These tests
 * pin the fix at its only unit-testable seam (the TSX that consumes this is excluded
 * from the jest/tsc gate): the tall cuts FILL their frame, the square cut stays
 * centered, and "fill" is monotonic in tallness.
 */

import { demoLayout } from "../demoLayout";
import { ASPECTS } from "../renderSpec";

const byName = (name: string) => {
  const a = ASPECTS.find((x) => x.name === name);
  if (!a) throw new Error(`no aspect ${name}`);
  return a;
};

const SQUARE = byName("1:1"); // 1080x1080
const PHONE = byName("9:16"); // 1080x1920
const PORTRAIT = byName("4:5"); // 1080x1350

describe("#765 demoLayout — per-aspect frame fill", () => {
  test("9:16 (phone) FILLS the height with scaled-up type", () => {
    const l = demoLayout(PHONE.width, PHONE.height);
    expect(l.fill).toBe(true);
    // usable vertical content span must cover >= 85% of the frame height.
    expect(l.usableSpanFraction).toBeGreaterThanOrEqual(0.85);
    expect(l.typeScale).toBeGreaterThan(1);
    expect(l.justify).toBe("space-between");
    // the convenience span equals 1 - the two pads (kept in sync).
    expect(l.usableSpanFraction).toBeCloseTo(1 - l.padTopFraction - l.padBottomFraction, 10);
  });

  test("1:1 (square) stays CENTERED at base type scale", () => {
    const l = demoLayout(SQUARE.width, SQUARE.height);
    expect(l.fill).toBe(false);
    expect(l.justify).toBe("center");
    expect(l.typeScale).toBe(1);
  });

  test("4:5 (portrait) fills, but between square and phone (monotonic in tallness)", () => {
    const square = demoLayout(SQUARE.width, SQUARE.height);
    const portrait = demoLayout(PORTRAIT.width, PORTRAIT.height);
    const phone = demoLayout(PHONE.width, PHONE.height);

    expect(portrait.fill).toBe(true);
    // strictly between the square and phone usable spans.
    expect(portrait.usableSpanFraction).toBeGreaterThan(square.usableSpanFraction);
    expect(portrait.usableSpanFraction).toBeLessThan(phone.usableSpanFraction);
    // type scale-up is also monotonic with tallness.
    expect(portrait.typeScale).toBeGreaterThan(square.typeScale);
    expect(portrait.typeScale).toBeLessThan(phone.typeScale);
  });

  test("monotonic: taller frame never fills less than a shorter one", () => {
    const ratios = [SQUARE, PORTRAIT, PHONE].map((a) => demoLayout(a.width, a.height));
    for (let i = 1; i < ratios.length; i++) {
      expect(ratios[i].aspectRatio).toBeGreaterThan(ratios[i - 1].aspectRatio);
      expect(ratios[i].usableSpanFraction).toBeGreaterThanOrEqual(ratios[i - 1].usableSpanFraction);
      expect(ratios[i].typeScale).toBeGreaterThanOrEqual(ratios[i - 1].typeScale);
    }
  });

  test("rejects a non-positive frame", () => {
    expect(() => demoLayout(0, 1920)).toThrow();
    expect(() => demoLayout(1080, -1)).toThrow();
  });

  // Guard the tsc-excluded boundary: remotion/index.tsx hand-duplicates a DemoLayout
  // interface + a DEFAULT_LAYOUT_9X16 fallback (used by the Remotion preview when a
  // caller omits `layout`). That copy can silently drift from this contract since the
  // TSX is outside the jest/tsc gate. Pin the canonical 9:16 output here so any change
  // to demoLayout() that diverges from the TSX default trips this test — then update
  // DEFAULT_LAYOUT_9X16 in remotion/index.tsx to match.
  test("9:16 output is pinned (keep in sync with remotion/index.tsx DEFAULT_LAYOUT_9X16)", () => {
    expect(demoLayout(PHONE.width, PHONE.height)).toEqual({
      aspectRatio: 1920 / 1080,
      fill: true,
      justify: "space-between",
      padTopFraction: 0.05,
      padBottomFraction: 0.05,
      typeScale: 1.18,
      gapScale: 1.5,
      usableSpanFraction: 0.9,
    });
  });
});
