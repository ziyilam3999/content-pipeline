/**
 * #1148 — fit-beats CLI core is runnable WITHOUT a paid render: it derives VO-first per-beat durations
 * from a committed fixture preview JSON (proves AC#2 in CI / a fresh checkout). PURE — no paid call.
 */
import * as path from "path";

import { readPreviewForFit, deriveFit, resolvePreviewPath, formatDerived } from "../fitBeats";

const FIXTURE = path.join(__dirname, "fixtures", "sample-vo-preview.json");

describe("#1148 fit-beats — derive VO-first durations from a committed fixture (no paid render)", () => {
  it("reads the fixture's measuredSpokenSec and derives the beat spine (breath 0 + pre-transition rule)", () => {
    const preview = readPreviewForFit(FIXTURE);
    const { fit } = deriveFit(preview);
    const byN = fit.clipSecByBeat;
    expect(byN[1]).toBe(6.3); // narrated, default breath 0 → measured (no pad)
    expect(byN[3]).toBe(7.9); // pre-transition (beat 4 is the silent transition) → no breath
    expect(byN[4]).toBe(1); // the silent transition beat == transitionSec
    expect(byN[5]).toBe(9); // 8.3 + 0 clamped UP to animMin 9
    expect(byN[7]).toBe(12); // 11.0 + 0 clamped UP to animMin 12
    expect(byN[8]).toBe(15); // 14.2 + 0 clamped UP to animMin 15
    expect(fit.totalSec).toBe(73.1);
  });

  it("leaves no dead-air: the worst trailing silence stays under the 1.5s gate (maxPadSec < 1.5)", () => {
    const { fit } = deriveFit(readPreviewForFit(FIXTURE));
    expect(fit.maxPadSec).toBeLessThan(1.5);
  });

  it("infers transition beats from gaps when transitionBeats is omitted (matches the real kanban preview shape)", () => {
    const preview = readPreviewForFit(FIXTURE);
    const { transitionBeats: _drop, ...noExplicit } = preview;
    const { fit } = deriveFit(noExplicit);
    expect(fit.clipSecByBeat[4]).toBe(1); // beat 4 (absent from measuredSpokenSec) inferred as a transition
    expect(fit.totalSec).toBe(73.1); // identical spine to the explicit-transition case
  });

  it("resolvePreviewPath: explicit --preview path and a slug both resolve sensibly", () => {
    expect(resolvePreviewPath({ previewPath: FIXTURE })).toBe(FIXTURE);
    // normalize separators so the assertion holds on Windows (path.join emits "\") as well as POSIX
    expect(resolvePreviewPath({ slug: "kanban" }).replace(/\\/g, "/")).toMatch(
      /out\/review\/kanban\/kanban-vo-preview\.json$/,
    );
  });

  it("formatDerived prints a paste-ready, VO-first-labeled block", () => {
    const out = formatDerived(deriveFit(readPreviewForFit(FIXTURE)), FIXTURE);
    expect(out).toMatch(/VO-first derived durations/);
    expect(out).toMatch(/CLIP_SEC_BY_BEAT/);
    expect(out).toMatch(/maxPadSec/);
  });
});
