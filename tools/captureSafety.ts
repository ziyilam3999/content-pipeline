/**
 * #1092 SHARED capture-hygiene assert — generalized from #1120's private `resetStripScroll`.
 *
 * DOCTRINE: any board/strip/clip capture of a LIVE horizontally-scrollable surface MUST call
 * `assertNoStripSlice` BEFORE measuring rings / screenshotting / recording. It resets the strip's
 * `scrollLeft` to 0 (the 88vw mount-snap leaves a stale scrollLeft → the leftmost column is shaved on
 * the LEFT under overflow-x:hidden) AND asserts no content is sliced L/R — a stale scroll re-introducing
 * a slice FAILS the capture. Paired with the storyboard-side `assertContainRule` (R18) the L/R edge-crop
 * class is closed by construction. The eyeball is the LAST check, not the only one. See memory
 * `feedback_board_edge_clip_needs_general_contain_scroll_gate_not_pointwise` (the L/R board-slice defect
 * class: #1091 aspect/scale + #1120 stale 2-col scrollLeft, both previously caught by eyeball + fixed
 * point-wise). fable/forge today build their own `overflow:hidden` static HTML — no scrollable strip —
 * so they need NOT call it now; this helper is the standing tripwire for the next live-app capture.
 *
 * Playwright-`page` helper (capture-side). No ffmpeg / network / paid call.
 */

/**
 * Reset a horizontally-scrollable capture surface's `scrollLeft` to 0 AND assert no content is sliced
 * L/R, BEFORE measuring rings / screenshotting / recording. THROWS on a left-edge slice (firstX < -1) or
 * right overflow (lastRight > viewportW + 1). The scroll-container + column selectors are parameterized
 * (defaults `.ak-strip` / `.ak-col`) so any live scrollable surface can reuse it.
 */
export async function assertNoStripSlice(
  page: any,
  viewportW: number,
  opts: { stripSel?: string; colSel?: string; label?: string } = {},
): Promise<void> {
  const stripSel = opts.stripSel ?? ".ak-strip";
  const colSel = opts.colSel ?? ".ak-col";
  const label = opts.label ?? "captureSafety";
  await page.evaluate((sel: string) => {
    const s = (globalThis as any).document.querySelector(sel);
    if (s) s.scrollLeft = 0;
  }, stripSel);
  await page.waitForTimeout(150);
  const probe = await page.evaluate(
    (sels: { stripSel: string; colSel: string }) => {
      const doc = (globalThis as any).document;
      const strip = doc.querySelector(sels.stripSel);
      const cols = Array.prototype.slice
        .call(doc.querySelectorAll(sels.colSel))
        .filter((c: any) => c.offsetParent !== null) as any[];
      if (!strip || cols.length === 0) return null;
      const first = cols[0].getBoundingClientRect();
      const last = cols[cols.length - 1].getBoundingClientRect();
      return { scrollLeft: strip.scrollLeft, firstX: first.x, lastRight: last.x + last.width };
    },
    { stripSel, colSel },
  );
  if (probe) {
    if (probe.firstX < -1) {
      throw new Error(
        `${label}: left-edge SLICE — leftmost visible column starts at x=${probe.firstX.toFixed(1)} < 0 ` +
          `(stale scrollLeft=${probe.scrollLeft}).`,
      );
    }
    if (probe.lastRight > viewportW + 1) {
      throw new Error(
        `${label}: right OVERFLOW — content right edge ${probe.lastRight.toFixed(1)} > viewport ${viewportW}.`,
      );
    }
    // eslint-disable-next-line no-console
    console.log(
      `[clip-fix] strip scrollLeft=${probe.scrollLeft}, leftCol x=${probe.firstX.toFixed(1)}, rightEdge=${probe.lastRight.toFixed(1)} ≤ ${viewportW} (no L/R slice)`,
    );
  }
}
