/**
 * #1243 local-biz automation pitch — the build's test ORACLE (mirrors kanbanSpec.test.ts).
 *
 *  (1) RECIPE: the 6-beat local-biz `DemoVideoSpec` passes the #870 demonstration-category recipe under the
 *      `feature-tour` shape (R1/R2/R4/R6/R7/R8/R9/R10/R11/R12/R13 — R3/R5 skipped: a sales arc has no
 *      chat/tool/transition beat).
 *  (2) ARC ORDER (AC2): the fine-grained `arcRole` sequence equals the canonical hook→...→cta order; the
 *      core arc is the first four. Keyed on `arcRole`, NOT the too-coarse `DemoBeatKind` (before-after /
 *      time-money / use-cases all map to `output`).
 *  (3) LEAD FRAME (AC3): beat 1 is a hook whose headline carries a concrete time/money figure (regex), AND a
 *      `time-money` beat exists with a quantified label.
 *  (4) FEATURE-TOUR (AC4): shape === "feature-tour" and there is NO chat/tool/transition beat.
 *  (5) SPINE + BAND (AC5): ≥1 captured-footage beat; total runtime ∈ the declared band; terminal share = 0.
 *  (6) BOTH-ENDS (AC6): stripping the hook FAILS R2 (proves R2 is really enforced); a reorder that puts
 *      time-money before before-after FAILS the AC2 order assertion.
 *  (7) CTA hygiene (MED-1): the CTA beat carries NO URL string in onScreenText (R10 stays vacuous).
 *
 * Pure data-structure — NO Playwright / ffmpeg / network / paid call.
 */

import { assertDemoCategoryRecipe, assertPhoneFullScreenAspectDiscipline, type DemoVideoSpec } from "../demoCategoryRecipe";
import { FABLE_ASPECTS } from "../fableLayout";
import {
  localBizSpec,
  LOCALBIZ_BEATS,
  LOCALBIZ_ARC_ORDER,
  LOCALBIZ_RUNTIME_SEC,
} from "../localBizPitchStoryboard";

// The lead-frame time/money figure regex (AC3 / L3). Matches "5 hours", "5 hrs", "$320", "30 min", etc.
const TIME_MONEY_RE = /\d+\s*(hours?|hrs?|minutes?|min|\$|dollars?)|\$\s*\d+/i;

describe("#1243 local-biz automation pitch — demo-category recipe (feature-tour)", () => {
  // AC1 — recipe pass.
  test("localBizSpec PASSES the demonstration-category recipe (feature-tour shape)", () => {
    expect(localBizSpec.shape).toBe("feature-tour");
    expect(() => assertDemoCategoryRecipe(localBizSpec)).not.toThrow();
  });

  // AC2 — arc order keyed on the fine-grained arcRole (the core arc = the first four).
  test("the arcRole sequence equals the canonical hook→before-after→time-money→use-cases→payoff→cta order", () => {
    expect(LOCALBIZ_BEATS.map((b) => b.arcRole)).toEqual([
      "hook",
      "before-after",
      "time-money",
      "use-cases",
      "payoff",
      "cta",
    ]);
    // The exported canonical order matches the SSOT beats (single source).
    expect(LOCALBIZ_BEATS.map((b) => b.arcRole)).toEqual([...LOCALBIZ_ARC_ORDER]);
    // Core arc = the first four required segments, in that order.
    expect(LOCALBIZ_BEATS.slice(0, 4).map((b) => b.arcRole)).toEqual([
      "hook",
      "before-after",
      "time-money",
      "use-cases",
    ]);
  });

  // AC3 — the LEAD FRAME is a concrete time/money number on beat 1's headline, AND a quantified time-money beat.
  test("beat 1 is a hook whose headline carries a time/money figure; a quantified time-money beat exists", () => {
    const beat1 = LOCALBIZ_BEATS[0];
    expect(beat1.kind).toBe("hook");
    expect(beat1.arcRole).toBe("hook");
    // L3 — the regex is asserted on beat-1's headline string within onScreenText.
    expect(beat1.headline).toBeDefined();
    expect(TIME_MONEY_RE.test(beat1.headline!)).toBe(true);
    // And it actually reaches the rendered on-screen text (the headline is an onScreenText entry on the spec).
    const specBeat1 = localBizSpec.beats[0];
    expect(specBeat1.kind).toBe("hook");
    expect(specBeat1.onScreenText.some((t) => TIME_MONEY_RE.test(t))).toBe(true);
    // A dedicated time-money beat with a quantified label exists.
    const timeMoney = LOCALBIZ_BEATS.find((b) => b.arcRole === "time-money");
    expect(timeMoney).toBeDefined();
    expect(TIME_MONEY_RE.test(timeMoney!.headline ?? "")).toBe(true);
  });

  // AC4 — feature-tour, not a tool-demo: NO chat/tool/transition beat (legitimately opts out of R3/R5).
  test("the spec is a feature-tour with NO chat/tool/transition beat", () => {
    expect(localBizSpec.shape).toBe("feature-tour");
    for (const forbidden of ["chat", "tool", "transition"] as const) {
      expect(localBizSpec.beats.some((b) => b.kind === forbidden)).toBe(false);
    }
  });

  // AC5 — captured-footage spine + runtime in band + terminal share 0.
  test("≥1 captured-footage beat, runtime in the declared band, terminal share 0%", () => {
    expect(localBizSpec.beats.some((b) => b.vehicle === "captured-footage")).toBe(true);
    const total = localBizSpec.beats.reduce((s, b) => s + b.durationSec, 0);
    expect(total).toBe(LOCALBIZ_RUNTIME_SEC);
    const band = localBizSpec.runtimeWindowSec;
    expect(total).toBeGreaterThanOrEqual(band.min);
    expect(total).toBeLessThanOrEqual(band.max);
    const terminal = localBizSpec.beats.filter((b) => b.isTerminal).reduce((s, b) => s + b.durationSec, 0);
    expect(terminal).toBe(0);
  });

  // AC6 (both-ends, R2) — replacing beat 1 with a non-hook beat FAILS /demo-recipe R2/.
  test("BOTH-ENDS: stripping the hook beat FAILS R2 (proves the hook-first rule is really enforced)", () => {
    const noHook: DemoVideoSpec = {
      ...localBizSpec,
      beats: localBizSpec.beats.filter((b) => b.kind !== "hook"),
    };
    expect(() => assertDemoCategoryRecipe(noHook)).toThrow(/demo-recipe R2/);
  });

  // AC6 (both-ends, AC2) — a reorder that puts time-money before before-after FAILS the order assertion.
  test("BOTH-ENDS: reordering time-money before before-after breaks the canonical arc order", () => {
    const roles = LOCALBIZ_BEATS.map((b) => b.arcRole);
    const i = roles.indexOf("before-after");
    const j = roles.indexOf("time-money");
    const reordered = [...roles];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    expect(reordered).not.toEqual([...LOCALBIZ_ARC_ORDER]);
  });

  // MED-1 — the CTA beat is COPY ONLY: no URL token anywhere in its on-screen text (R10 stays vacuous).
  test("the CTA beat carries CTA copy but NO URL string in onScreenText (R10 vacuous)", () => {
    const cta = localBizSpec.beats.find((b) => b.kind === "cta")!;
    expect(cta.onScreenText.length).toBeGreaterThan(0);
    const URL_RE = /https?:\/\/|www\.|\.(com|org|net|io|co|app)\b|<[^>]+>/i;
    for (const t of cta.onScreenText) expect(URL_RE.test(t)).toBe(false);
  });

  // R13 — 9:16 phone full-screen aspect discipline (9:16 present, nothing taller).
  test("the publish aspects pass the 9:16 phone-full-screen discipline", () => {
    expect(() => assertPhoneFullScreenAspectDiscipline(localBizSpec.aspects)).not.toThrow();
    const hero = localBizSpec.aspects.find((a) => a.key === "9:16")!;
    expect([hero.width, hero.height]).toEqual([1080, 1920]);
    expect(localBizSpec.aspects).toBe(FABLE_ASPECTS);
  });
});
