/**
 * #1285 proof-first case-study — the build's test ORACLE (mirrors localBizPitchSpec.test.ts).
 *
 *  (2a) REGISTRATION: the new `proof` videoType resolves to a 9:16 1080×1920 master via the config SSOT
 *       (aspectForVideoType / dimensionsForVideoType / renderAspectForVideoType all DERIVE from it).
 *  (2b) ARC ORDER: the `arcRole` sequence, filtered to the four CORE roles, equals the canonical
 *       constraint→kpi→proof→cta order (keyed on `arcRole`, NOT the too-coarse `DemoBeatKind`).
 *  (2c) CTA: ≥1 CTA beat whose copy carries the literal business email `AnsonAndAI@gmail.com`.
 *  (2d) LEAD: `PROOF_VO_LINES[0]` is the RESULT — byte-equal to the result-hook headline + a hours/dollars
 *       figure (proof-first; NOT a generic "watch an AI do X" opener).
 *  (2e) RECIPE: `assertDemoCategoryRecipe(buildProofSpec())` does NOT throw (the `proof` arm accepts it).
 *  BOTH-ENDS: a reorder FAILS `assertProofArcOrder`; stripping the hook FAILS proof-recipe P1; dropping the
 *       CTA email FAILS proof-recipe P3 (each invariant proven ENFORCED, not vacuous).
 *  PRIVACY: the ONLY email anywhere in the storyboard copy + VO is the business address (no personal email).
 *
 * Pure data-structure — NO Playwright / ffmpeg / network / paid call.
 */

import {
  assertDemoCategoryRecipe,
  aspectForVideoType,
  dimensionsForVideoType,
  assertPhoneFullScreenAspectDiscipline,
  PROOF_CTA_EMAIL,
  type DemoVideoSpec,
} from "../demoCategoryRecipe";
import { renderAspectForVideoType } from "../renderSpec";
import { FABLE_ASPECTS } from "../fableLayout";
import {
  proofSpec,
  buildProofSpec,
  PROOF_BEATS,
  PROOF_ARC_ORDER,
  PROOF_CORE_ORDER,
  PROOF_VO_LINES,
  PROOF_RUNTIME_SEC,
  assertProofArcOrder,
  type ProofArcRole,
} from "../proofStoryboard";

// A concrete hours/dollars figure regex (AC2d). Matches "6 hours", "6 hrs", "$400", "30 min", etc.
const TIME_MONEY_RE = /\d+\s*(hours?|hrs?|minutes?|min|\$|dollars?)|\$\s*\d+/i;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

describe("#1285 proof-first case-study — demo-category recipe (proof videoType)", () => {
  // AC2a — the new videoType is REGISTERED and resolves to a 9:16 1080×1920 master (config-derived).
  test("the proof videoType resolves to a 9:16 1080×1920 master", () => {
    expect(aspectForVideoType("proof")).toBe("9:16");
    expect(dimensionsForVideoType("proof")).toEqual({ width: 1080, height: 1920 });
    expect(renderAspectForVideoType("proof").name).toBe("9:16");
    expect([renderAspectForVideoType("proof").width, renderAspectForVideoType("proof").height]).toEqual([
      1080, 1920,
    ]);
  });

  // AC2b — the core arc roles appear in EXACTLY constraint→kpi→proof→cta order (keyed on arcRole, SSOT).
  test("the four core arc roles are in exactly constraint→kpi→proof→cta order", () => {
    const roles = PROOF_BEATS.map((b) => b.arcRole);
    expect(roles).toEqual([...PROOF_ARC_ORDER]);
    const core = roles.filter((r) => (PROOF_CORE_ORDER as ReadonlyArray<string>).includes(r));
    expect(core).toEqual(["constraint", "kpi", "proof", "cta"]);
    // The order ORACLE accepts the real sequence (non-vacuous happy end).
    expect(() => assertProofArcOrder(roles)).not.toThrow();
    // The spec's beats preserve the SSOT order (1-based n is monotonic with the arc).
    expect(proofSpec.beats.map((b) => b.n)).toEqual([1, 2, 3, 4, 5]);
  });

  // AC2c — there is ≥1 CTA beat and its on-screen copy carries the literal business email.
  test("≥1 CTA beat whose copy contains the literal business email", () => {
    const ctaBeats = proofSpec.beats.filter((b) => b.kind === "cta");
    expect(ctaBeats.length).toBeGreaterThanOrEqual(1);
    expect(
      ctaBeats.some((b) => b.onScreenText.some((t) => t.includes(PROOF_CTA_EMAIL))),
    ).toBe(true);
    expect(PROOF_CTA_EMAIL).toBe("AnsonAndAI@gmail.com");
  });

  // AC2d — the LEAD line is the RESULT: byte-equal to the result-hook headline + a concrete figure.
  test("PROOF_VO_LINES[0] is the result-hook headline (a hours/dollars figure), not a generic opener", () => {
    const lead = PROOF_BEATS[0];
    expect(lead.arcRole).toBe("result-hook");
    expect(lead.kind).toBe("hook");
    expect(lead.headline).toBeDefined();
    // The opening VO line IS the result headline (stable marker — "lead with the outcome").
    expect(PROOF_VO_LINES[0]).toBe(lead.headline);
    // And that lead is a concrete result/KPI figure, not a generic "watch an AI do X" opener.
    expect(TIME_MONEY_RE.test(PROOF_VO_LINES[0])).toBe(true);
  });

  // AC2e — the validator's proof arm ACCEPTS the spec (does not throw).
  test("assertDemoCategoryRecipe(buildProofSpec()) does not throw", () => {
    expect(buildProofSpec().videoType).toBe("proof");
    expect(() => assertDemoCategoryRecipe(buildProofSpec())).not.toThrow();
    expect(() => assertDemoCategoryRecipe(proofSpec)).not.toThrow();
  });

  // BOTH-ENDS (order) — a reorder (kpi before constraint) FAILS the order oracle (enforced, not vacuous).
  test("BOTH-ENDS: reordering kpi before constraint FAILS assertProofArcOrder", () => {
    const roles = PROOF_BEATS.map((b) => b.arcRole);
    const i = roles.indexOf("constraint");
    const j = roles.indexOf("kpi");
    const reordered: ProofArcRole[] = [...roles];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    expect(reordered).not.toEqual([...PROOF_ARC_ORDER]);
    expect(() => assertProofArcOrder(reordered)).toThrow(/proof-arc-order/);
  });

  // BOTH-ENDS (P1) — a spec whose first beat is NOT a hook FAILS the proof-first lead rule.
  test("BOTH-ENDS: a non-hook first beat FAILS proof-recipe P1", () => {
    const noHook: DemoVideoSpec = {
      ...proofSpec,
      beats: proofSpec.beats.map((b, i) => (i === 0 ? { ...b, kind: "output" as const } : b)),
    };
    expect(() => assertDemoCategoryRecipe(noHook)).toThrow(/proof-recipe P1/);
  });

  // BOTH-ENDS (P3) — dropping the business email from the CTA beat FAILS the CTA-email rule.
  test("BOTH-ENDS: a CTA beat without the business email FAILS proof-recipe P3", () => {
    const noEmail: DemoVideoSpec = {
      ...proofSpec,
      beats: proofSpec.beats.map((b) =>
        b.kind === "cta"
          ? { ...b, onScreenText: b.onScreenText.map((t) => t.replace(PROOF_CTA_EMAIL, "our website")) }
          : b,
      ),
    };
    expect(() => assertDemoCategoryRecipe(noEmail)).toThrow(/proof-recipe P3/);
  });

  // PRIVACY — the ONLY email anywhere in the on-screen copy + VO is the business address.
  test("the business email is the ONLY email in the storyboard copy + VO (no personal email)", () => {
    const surfaces = proofSpec.beats
      .flatMap((b) => b.onScreenText)
      .concat([...PROOF_VO_LINES])
      .concat(PROOF_BEATS.flatMap((b) => [b.headline ?? "", b.sub ?? ""]));
    const emails = surfaces.flatMap((t) => t.match(EMAIL_RE) ?? []);
    expect(emails.length).toBeGreaterThan(0);
    for (const e of emails) expect(e).toBe(PROOF_CTA_EMAIL);
  });

  // AC4 (#1149) — FLAG + REQUIRE WIRED into the PROOF arm, mutation-proven on the REAL shipped spec.
  test("BOTH-ENDS: the real proofSpec opener PASSES P4; an anti-pattern mutant FAILS proof-recipe P4", () => {
    // Clean end: the shipped result-hook opener "This bakery owner got back 6 hours a week." passes P4
    // (result-first via figure + benefit verb, not the watch frame).
    expect(() => assertDemoCategoryRecipe(proofSpec)).not.toThrow();
    // Anti-pattern end: mutate the real opener (PROOF_BEATS[0].headline shape) to the "watch an AI" frame.
    const mutated: DemoVideoSpec = {
      ...proofSpec,
      beats: proofSpec.beats.map((b, i) =>
        i === 0
          ? { ...b, onScreenText: ["Watch an AI retype your orders.", ...b.onScreenText.slice(1)] }
          : b,
      ),
    };
    expect(() => assertDemoCategoryRecipe(mutated)).toThrow(/proof-recipe P4/);
  });

  // RUNTIME + SPINE — runtime in the declared band, terminal share 0%, 9:16 phone-full-screen discipline.
  test("runtime in band, terminal share 0%, 9:16 phone-full-screen discipline holds", () => {
    const total = proofSpec.beats.reduce((s, b) => s + b.durationSec, 0);
    expect(total).toBe(PROOF_RUNTIME_SEC);
    const band = proofSpec.runtimeWindowSec;
    expect(total).toBeGreaterThanOrEqual(band.min);
    expect(total).toBeLessThanOrEqual(band.max);
    const terminal = proofSpec.beats.filter((b) => b.isTerminal).reduce((s, b) => s + b.durationSec, 0);
    expect(terminal).toBe(0);
    expect(() => assertPhoneFullScreenAspectDiscipline(proofSpec.aspects)).not.toThrow();
    expect(proofSpec.aspects).toBe(FABLE_ASPECTS);
  });
});
