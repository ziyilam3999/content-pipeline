import { verifyDraft, buildContext } from "../verifier";
import { ContentSpec } from "../../inputs/contentspec";

const SPEC: ContentSpec = {
  product: { name: "lfah", summary: "A local-first harness that makes a 30-second demo." },
  facts: [
    { label: "Resolved", value: "83.8%", scopeGuard: "n=74", source: "r.md" },
    { label: "Sample", value: "74", source: "r.md" },
    { label: "Cost", value: "0.69", scopeGuard: "1 instance", source: "r.json" },
    { label: "Suite size", value: "1000", source: "r.md" },
  ],
  highlights: [],
  ctas: [],
  sourceFiles: [],
};

describe("buildContext", () => {
  it("includes fact values, guards, and the product summary", () => {
    const ctx = buildContext(SPEC);
    expect(ctx).toContain("83.8%");
    expect(ctx).toContain("n=74");
    expect(ctx).toContain("30-second");
  });
});

describe("verifyDraft", () => {
  it("passes a draft whose every number comes from the context", () => {
    const draft = "We resolved 83.8% of bugs (n=74) for $0.69, all in a 30-second clip.";
    const r = verifyDraft(draft, SPEC);
    expect(r.ok).toBe(true);
    expect(r.unsupportedNumbers).toEqual([]);
  });

  it("rejects a hallucinated number not present in the context", () => {
    const draft = "We resolved 99% of bugs.";
    const r = verifyDraft(draft, SPEC);
    expect(r.ok).toBe(false);
    expect(r.unsupportedNumbers).toContain("99%");
  });

  it("supports numbers from labels, repoUrl, highlights, and CTAs (not just fact values)", () => {
    const spec: ContentSpec = {
      product: {
        name: "lfah",
        summary: "a local-first harness",
        repoUrl: "https://github.com/ziyilam3999/local-first-agent-harness",
      },
      facts: [{ label: "1-shot Opus resolved", value: "54%", scopeGuard: "7/13", source: "r.md" }],
      highlights: ["3 roles: planner, executor, evaluator"],
      ctas: ["pip install from github.com/ziyilam3999/..."],
      sourceFiles: [],
    };
    // "1" from the "1-shot" label, "3999" from the repo URL/CTA, "3" from a highlight.
    const r = verifyDraft("1-shot Opus hit 54% (7/13); 3 roles; see github.com/ziyilam3999/...", spec);
    expect(r.ok).toBe(true);
    expect(r.unsupportedNumbers).toEqual([]);
  });

  it("normalizes commas and percent so 1,000 matches a 1000 fact", () => {
    const draft = "Across 1,000 cases we hit 83.8%.";
    const r = verifyDraft(draft, SPEC);
    expect(r.ok).toBe(true);
  });

  it("flags superlatives for human review (case-insensitive, whole word)", () => {
    const draft = "It is the FASTEST and only harness; we resolved 83.8%.";
    const r = verifyDraft(draft, SPEC);
    expect(r.flaggedSuperlatives).toEqual(expect.arrayContaining(["fastest", "only"]));
    // 'only' inside 'lonely' must NOT trip the word-boundary check
    const r2 = verifyDraft("A lonely 74 bugs.", SPEC);
    expect(r2.flaggedSuperlatives).not.toContain("only");
  });

  it("a clean factual draft has no flags at all", () => {
    const draft = "Resolved 83.8% of 74 bugs for $0.69.";
    const r = verifyDraft(draft, SPEC);
    expect(r.ok).toBe(true);
    expect(r.flaggedSuperlatives).toEqual([]);
  });

  it("does NOT flag a superlative inside a hyphenated compound (#696: 'first' in 'test-first')", () => {
    const r = verifyDraft("A test-first, first-class harness resolved 83.8%.", SPEC);
    expect(r.flaggedSuperlatives).not.toContain("first");
    // but a standalone superlative in the same draft still flags
    const r2 = verifyDraft("It never lost a bug, and was first to ship.", SPEC);
    expect(r2.flaggedSuperlatives).toEqual(expect.arrayContaining(["never", "first"]));
  });

  it("still matches a whole-token superlative that itself contains a hyphen ('world-class')", () => {
    const r = verifyDraft("A world-class result of 83.8%.", SPEC);
    expect(r.flaggedSuperlatives).toContain("world-class");
  });
});
