/**
 * #1092 — BOTH-ENDS oracle for the shared capture-hygiene assert `assertNoStripSlice`.
 *
 * Generalized from #1120's private `resetStripScroll`: reset a horizontally-scrollable surface's scrollLeft
 * to 0, then probe the first/last visible column boxes and THROW on a left-edge slice (firstX < -1) or right
 * overflow (lastRight > viewportW + 1). The page is STUBBED (no real browser): `evaluate` is called twice —
 * first the scrollLeft set (return undefined), second the probe (return the controllable value); `waitForTimeout`
 * is a resolved no-op. Deterministic — no Playwright / ffmpeg / network / paid call.
 */

import { assertNoStripSlice } from "../captureSafety";

/** A stub Playwright `page`: the 1st `evaluate` is the scrollLeft set, the 2nd returns `probe`. */
function stubPage(probe: unknown): any {
  let calls = 0;
  return {
    async evaluate() {
      calls += 1;
      return calls === 1 ? undefined : probe; // 1st = set scrollLeft, 2nd = the probe
    },
    async waitForTimeout() {
      /* no-op */
    },
  };
}

describe("#1092 assertNoStripSlice — capture-hygiene both-ends", () => {
  test("FAILS (left slice): a leftmost column starting at x < -1 REJECTS with /left-edge SLICE/", async () => {
    const page = stubPage({ scrollLeft: 980, firstX: -412, lastRight: 1000 });
    await expect(assertNoStripSlice(page, 1080)).rejects.toThrow(/left-edge SLICE/);
  });

  test("FAILS (right overflow): a last column past viewportW+1 REJECTS with /OVERFLOW/", async () => {
    const page = stubPage({ scrollLeft: 0, firstX: 0, lastRight: 1110 });
    await expect(assertNoStripSlice(page, 1080)).rejects.toThrow(/OVERFLOW/);
  });

  test("PASSES (clean): a flush, in-bounds probe RESOLVES (no throw)", async () => {
    const page = stubPage({ scrollLeft: 0, firstX: 0, lastRight: 1072 });
    await expect(assertNoStripSlice(page, 1080)).resolves.toBeUndefined();
  });

  test("PASSES (no strip/cols): a null probe RESOLVES (defensive — matches the lifted behavior)", async () => {
    const page = stubPage(null);
    await expect(assertNoStripSlice(page, 1080)).resolves.toBeUndefined();
  });

  test("custom selectors are honored (label appears in the thrown error)", async () => {
    const page = stubPage({ scrollLeft: 50, firstX: -9, lastRight: 800 });
    await expect(
      assertNoStripSlice(page, 1080, { stripSel: ".x-strip", colSel: ".x-col", label: "myCapture" }),
    ).rejects.toThrow(/myCapture: left-edge SLICE/);
  });
});
