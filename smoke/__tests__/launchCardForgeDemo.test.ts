/**
 * #871 — forge-demo card spec unit test.
 *
 * Proves, WITHOUT a Playwright render (fast, deterministic, no paid call / no network):
 *   1. Exactly three cards A/B/C with the operator-set titles.
 *   2. Each card has non-empty lines, and every source line round-trips losslessly from the
 *      tile's prefix + value (sourceLine).
 *   3. Each card's derived ContentSpec carries exactly its lines, in order.
 *   4. The C card (tweet 4 / CTA) carries the REAL forge repo URL.
 *   5. Honesty: no card text leaks a dev-token (#NN / "smoke" / "Phase" / "TODO") or a /Users/ home path.
 *
 * The full Playwright render + cross-post art-uniqueness proof lives in the smoke
 * (smoke/launch-card-forge-demo.ts). This test guards the spec/wording contract.
 */

import {
  FORGE_DEMO_CARDS,
  forgeDemoCardSpec,
  sourceLine,
} from "../launch-card-forge-demo";

const FORGE_REPO_HOST = "github.com/ziyilam3999/forge-harness";

describe("forge-demo cards — spec/wording contract (#871)", () => {
  it("has exactly three cards A/B/C with the operator-set titles", () => {
    expect(FORGE_DEMO_CARDS).toHaveLength(3);
    expect(FORGE_DEMO_CARDS.map((c) => c.id)).toEqual(["A", "B", "C"]);
    expect(FORGE_DEMO_CARDS.map((c) => c.title)).toEqual([
      "Watch the board: Retry → Done",
      "Only one block calls the model",
      "Your tests decide what ships",
    ]);
  });

  it("every card has non-empty lines, each with a non-empty prefix and value", () => {
    for (const card of FORGE_DEMO_CARDS) {
      expect(card.lines.length).toBeGreaterThan(0);
      for (const line of card.lines) {
        expect(line.prefix.trim().length).toBeGreaterThan(0);
        expect(line.value.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("reconstructs each line losslessly from prefix + value (sourceLine round-trip)", () => {
    for (const card of FORGE_DEMO_CARDS) {
      for (const line of card.lines) {
        expect(sourceLine(line)).toBe(`${line.prefix} ${line.value}`);
      }
    }
  });

  it("derives a ContentSpec with one fact per source line, each tile = one source line", () => {
    for (const card of FORGE_DEMO_CARDS) {
      const spec = forgeDemoCardSpec(card);
      expect(spec.facts).toHaveLength(card.lines.length);
      spec.facts.forEach((f, i) => {
        expect(`${f.label} ${f.value}`).toBe(sourceLine(card.lines[i]));
      });
      expect(spec.product.summary).toBe(card.title);
      expect(spec.product.name).toBe("forge-harness");
      expect(spec.product.repoUrl).toContain(FORGE_REPO_HOST);
    }
  });

  it("the C card (tweet 4 / CTA) carries the real forge repo URL", () => {
    const c = FORGE_DEMO_CARDS.find((card) => card.id === "C");
    expect(c).toBeDefined();
    expect(forgeDemoCardSpec(c!).product.repoUrl).toContain(FORGE_REPO_HOST);
  });

  it("no card text leaks a dev-token or a home path (cheap honesty)", () => {
    const allText = FORGE_DEMO_CARDS.flatMap((card) => [
      card.title,
      card.cta ?? "",
      ...card.lines.map(sourceLine),
    ]).join(" || ");
    expect(allText).not.toMatch(/#\d+/); // issue/PR dev-token
    expect(allText).not.toMatch(/smoke/i);
    expect(allText).not.toMatch(/\bPhase\b/);
    expect(allText).not.toMatch(/\bTODO\b/);
    expect(allText).not.toMatch(/\/Users\//); // absolute home path
  });
});
