/**
 * #800 — Post #2 "lfah is a BUILDER" card spec unit test.
 *
 * Proves, WITHOUT a Playwright render (fast, deterministic, no paid call):
 *   1. assertVerbatim passes — the smoke's inline lines reproduce the committed fixture's
 *      card_labels EXACTLY (number-verified wording is mechanically gated).
 *   2. Each card's derived ContentSpec carries exactly its four lines, in order, with the
 *      source line losslessly reconstructable from the tile's label + value.
 *   3. The number-bearing stats ($12.56, 100%, 11, ~85%, $0.97, 13) survive into the spec
 *      VERBATIM — no stat is mutated by the label/value split.
 *
 * The full Playwright render + overflow-gate proof lives in the smoke (smoke/launch-card-post2.ts),
 * which exercises renderImage's #790 auto-fit. This test guards the spec/wording contract.
 */

import {
  POST2_CARDS,
  assertVerbatim,
  post2CardSpec,
  readSourceLabels,
  sourceLine,
} from "../launch-card-post2";

describe("Post #2 builder cards — verbatim wording contract (#800)", () => {
  it("assertVerbatim passes — inline lines == committed fixture card_labels", () => {
    expect(() => assertVerbatim()).not.toThrow();
  });

  it("has exactly three cards A/B/C with the operator-set titles", () => {
    expect(POST2_CARDS.map((c) => c.id)).toEqual(["A", "B", "C"]);
    expect(POST2_CARDS.map((c) => c.title)).toEqual([
      "Built by the agent, test-first",
      "Where the money goes",
      "The loop",
    ]);
  });

  it("reconstructs each card's four source lines losslessly from label + value", () => {
    const src = readSourceLabels();
    for (const card of POST2_CARDS) {
      const reconstructed = card.lines.map(sourceLine);
      expect(reconstructed).toEqual(src[card.id]);
    }
  });

  it("derives a ContentSpec with exactly four facts per card, each tile = one source line", () => {
    for (const card of POST2_CARDS) {
      const spec = post2CardSpec(card);
      expect(spec.facts).toHaveLength(4);
      spec.facts.forEach((f, i) => {
        // label (small) + value (big) == the verbatim source line.
        expect(`${f.label} ${f.value}`).toBe(sourceLine(card.lines[i]));
      });
      expect(spec.product.summary).toBe(card.title);
      expect(spec.product.name).toBe("lfah is a BUILDER");
    }
  });

  it("carries every number-bearing stat into the spec VERBATIM (no stat mutated by the split)", () => {
    const allText = POST2_CARDS.flatMap((c) => post2CardSpec(c).facts).map(
      (f) => `${f.label} ${f.value}`,
    );
    const joined = allText.join(" || ");
    for (const stat of [
      "13 build phases — all 13 shipped (100%)",
      "11 phases passed on the first try",
      "$12.56 total cloud spend for the whole build",
      "~85% of phases solved by a FREE local model",
      "cloud rescued only the 2 hardest phases",
      "≈ $0.97 per phase",
    ]) {
      expect(joined).toContain(stat);
    }
  });

  it("never carries the retired Post-#1 SWE-bench figures (74 / 27 / 83.8 / n=13)", () => {
    const joined = POST2_CARDS.flatMap((c) => post2CardSpec(c).facts)
      .map((f) => `${f.label} ${f.value}`)
      .join(" ");
    // Post #2 is the dogfood BUILD story — it must not leak Post #1's bug-fix benchmark numbers.
    expect(joined).not.toMatch(/\b74\b/);
    expect(joined).not.toMatch(/\b27\b/);
    expect(joined).not.toMatch(/83\.8/);
    expect(joined).not.toMatch(/SWE-bench/i);
  });
});
