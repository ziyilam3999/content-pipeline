/**
 * #743 — demo-video timeline spec.
 *
 * The timeline is the deterministic source of truth the animated demo renders
 * from. These tests pin: scene tiling/coverage, proportional rescale, that every
 * count-up number is sourced verbatim from a real fact (no invented values), the
 * architecture diagram shape (local "Fix" + a cloud escalation), and number parsing.
 */

import {
  buildDemoTimeline,
  parseFactNumber,
  deriveTitle,
} from "../demoTimeline";
import { type ContentSpec } from "../../inputs/contentspec";

const SPEC: ContentSpec = {
  product: {
    name: "local-first-agent-harness",
    summary:
      "an AI coding agent that fixes real bugs — runs the heavy work on a cheap local model",
    repoUrl: "https://github.com/example/repo",
  },
  facts: [
    { label: "full-cloud resolved", value: "77%", scopeGuard: "10/13", source: "README" },
    { label: "hybrid resolved", value: "62%", scopeGuard: "8/13", source: "README" },
    { label: "1-shot resolved", value: "54%", scopeGuard: "7/13", source: "README" },
    { label: "full-cloud cost", value: "$35.0", scopeGuard: "n=13", source: "README" },
    { label: "hybrid cost", value: "$15.7", scopeGuard: "n=13", source: "README" },
    { label: "executor cost share", value: "0%", scopeGuard: "free local", source: "README" },
  ],
  highlights: ["heavy editing runs free on a local model"],
  ctas: ["Try it: pip install git+https://github.com/example/repo"],
  sourceFiles: ["README"],
};

const EPS = 1e-9;
const factValues = SPEC.facts.map((f) => f.value);

describe("#743 demo timeline", () => {
  test("five scenes in the documented order", () => {
    const t = buildDemoTimeline(SPEC, { durationSec: 18, fps: 30 });
    expect(t.scenes.map((s) => s.id)).toEqual([
      "hook",
      "pipeline",
      "escalation",
      "results",
      "cta",
    ]);
  });

  test("scenes tile [0, durationSec) back-to-back with no gaps and end exactly at duration", () => {
    const DUR = 18;
    const t = buildDemoTimeline(SPEC, { durationSec: DUR });
    expect(t.scenes[0].fromSec).toBe(0);
    for (let i = 0; i < t.scenes.length - 1; i++) {
      const end = t.scenes[i].fromSec + t.scenes[i].durationSec;
      expect(end).toBeCloseTo(t.scenes[i + 1].fromSec, 9);
      expect(t.scenes[i].durationSec).toBeGreaterThan(0);
    }
    const last = t.scenes[t.scenes.length - 1];
    expect(last.fromSec + last.durationSec).toBeCloseTo(DUR, 9);
  });

  test("scene durations rescale proportionally with total length", () => {
    const a = buildDemoTimeline(SPEC, { durationSec: 18 });
    const b = buildDemoTimeline(SPEC, { durationSec: 36 });
    for (let i = 0; i < a.scenes.length; i++) {
      expect(b.scenes[i].durationSec).toBeCloseTo(a.scenes[i].durationSec * 2, 6);
    }
  });

  test("every count-up number is sourced verbatim from a real fact (no invented values)", () => {
    const t = buildDemoTimeline(SPEC);
    expect(t.numbers.length).toBeGreaterThan(0);
    for (const n of t.numbers) {
      expect(factValues).toContain(n.value); // verbatim, verifier-consistent
    }
  });

  test("numbers carry parsed prefix/numeric/suffix for the count-up animation", () => {
    const t = buildDemoTimeline(SPEC);
    const pct = t.numbers.find((n) => n.value === "77%");
    expect(pct).toMatchObject({ prefix: "", numeric: 77, suffix: "%" });
    const cost = t.numbers.find((n) => n.value === "$35.0");
    expect(cost).toMatchObject({ prefix: "$", numeric: 35, suffix: "" });
  });

  test("diagram shows the local Fix node plus a cloud escalation edge", () => {
    const t = buildDemoTimeline(SPEC);
    const fix = t.diagram.nodes.find((n) => n.id === "fix");
    expect(fix?.lane).toBe("local");
    expect(t.diagram.nodes.some((n) => n.lane === "cloud")).toBe(true);
    // The documented main flow plan→fix→grade→tests is present...
    const flow = t.diagram.edges.filter((e) => e.kind === "flow").map((e) => `${e.from}->${e.to}`);
    expect(flow).toEqual(["plan->fix", "fix->grade", "grade->tests"]);
    // ...and a single "escalate when stuck" edge off the local Fix node.
    const esc = t.diagram.edges.filter((e) => e.kind === "escalate");
    expect(esc).toEqual([{ from: "fix", to: "cloud", kind: "escalate" }]);
  });

  test("title is derived from the product summary's first clause (no invented copy)", () => {
    expect(deriveTitle(SPEC)).toBe("An AI coding agent that fixes real bugs");
  });

  test("cta + repoUrl flow through from the spec", () => {
    const t = buildDemoTimeline(SPEC);
    expect(t.cta).toBe(SPEC.ctas[0]);
    expect(t.repoUrl).toBe(SPEC.product.repoUrl);
  });

  test("parseFactNumber handles %, $, plain, and rejects non-numeric", () => {
    expect(parseFactNumber("77%")).toEqual({ prefix: "", numeric: 77, suffix: "%" });
    expect(parseFactNumber("$15.7")).toEqual({ prefix: "$", numeric: 15.7, suffix: "" });
    expect(parseFactNumber("13")).toEqual({ prefix: "", numeric: 13, suffix: "" });
    expect(parseFactNumber("0%")).toEqual({ prefix: "", numeric: 0, suffix: "%" });
    expect(parseFactNumber("none")).toBeNull();
  });
});
