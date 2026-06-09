/**
 * #748 — demo-video timeline spec (the honest 4-WAY comparison + verdict).
 *
 * The timeline is the deterministic source of truth the animated demo renders
 * from. These tests pin: scene tiling/coverage, proportional rescale, the
 * HOOK-FIRST ordering (cost-efficiency hook inside the first 30s), the full
 * 4-arm comparison (including the LOSING 1-shot Sonnet — no cherry-picking),
 * the per-role cost split (executor local = $0), the honest verdict (which
 * concedes the full-cloud relay's higher raw resolve %), number parsing, and
 * that every count-up number is sourced verbatim from a real fact.
 */

import {
  buildDemoTimeline,
  narrationSceneEndTimes,
  parseFactNumber,
  deriveTitle,
  buildArms,
  clampDemoDurationSec,
  MIN_DEMO_SEC,
  MAX_DEMO_SEC,
  DEFAULT_DEMO_SEC,
  HOOK_WINDOW_SEC,
} from "../demoTimeline";
import { DEMO_NARRATION, narrationScript, type NarrationSegment } from "../demoNarration";
import { lfahSpec } from "../../smoke/lfahSpec";
import { type ContentSpec } from "../../inputs/contentspec";

// The real shipped spec — these tests run against the ACTUAL 4-way fact set so
// the demo can never drift from the numbers it ships with.
const SPEC: ContentSpec = lfahSpec();

const factValues = SPEC.facts.map((f) => f.value);

describe("#748 demo timeline — structure", () => {
  test("hook-first scene order: hook → compare → costsplit → verdict → cta", () => {
    const t = buildDemoTimeline(SPEC, { durationSec: 60, fps: 30 });
    expect(t.scenes.map((s) => s.id)).toEqual([
      "hook",
      "compare",
      "costsplit",
      "verdict",
      "cta",
    ]);
  });

  test("scenes tile [0, durationSec) back-to-back with no gaps and end exactly at duration", () => {
    const DUR = 60; // in-range; below 45 would be clamped up
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
    const a = buildDemoTimeline(SPEC, { durationSec: 45 }); // both in-range so the
    const b = buildDemoTimeline(SPEC, { durationSec: 90 }); // clamp doesn't distort the ratio
    for (let i = 0; i < a.scenes.length; i++) {
      expect(b.scenes[i].durationSec).toBeCloseTo(a.scenes[i].durationSec * 2, 6);
    }
  });
});

describe("#748 demo timeline — HOOK-FIRST (cost-efficiency, free local executor)", () => {
  test("the hook scene is first and lives entirely inside the 30s hook window", () => {
    const t = buildDemoTimeline(SPEC, { durationSec: 60 });
    const hook = t.scenes.find((s) => s.id === "hook")!;
    expect(hook.fromSec).toBe(0);
    expect(hook.fromSec + hook.durationSec).toBeLessThanOrEqual(HOOK_WINDOW_SEC);
  });

  test("the hook headline lands the cost-efficiency angle + free local executor (no false 'best at everything')", () => {
    const t = buildDemoTimeline(SPEC, { durationSec: 60 });
    const h = t.hookHeadline.toLowerCase();
    // Cost-efficiency, not raw resolve %, is the honest hook.
    expect(h).toMatch(/cost|cheaper|value|\$/);
    expect(h).toMatch(/local|free/);
    // Must NOT overclaim being the best/highest on resolve rate.
    expect(h).not.toMatch(/best at everything|highest resolve|most bugs/);
    // HONESTY: any "half"/"55%"-style cheaper claim must be anchored on TOTAL cost
    // ($15.7 vs $35.0 = 55% less), never mis-applied to the per-fix figure
    // ($2.24 vs $3.50 ≈ 2/3, NOT half). If "half" appears it must sit next to a total.
    expect(h).toContain("total cost");
    expect(h).toContain("$15.7");
    expect(h).toContain("$35.0");
    if (/\bhalf\b/.test(h)) {
      // "half" is only honest about total cost — guard against the per-fix mis-anchor.
      expect(h).not.toMatch(/half[^.]*each|each[^.]*half/);
    }
  });

  test("every count-up number is sourced verbatim from a real fact (no invented values)", () => {
    const t = buildDemoTimeline(SPEC);
    expect(t.numbers.length).toBeGreaterThan(0);
    for (const n of t.numbers) {
      expect(factValues).toContain(n.value); // verbatim, verifier-consistent
    }
  });
});

describe("#748 demo timeline — the honest 4-WAY comparison (show ALL arms incl. the loser)", () => {
  test("buildArms returns exactly the 4 arms in canonical order", () => {
    const arms = buildArms(SPEC);
    expect(arms.map((a) => a.key)).toEqual([
      "opus",
      "sonnet",
      "fullcloud",
      "hybrid",
    ]);
  });

  test("all four arms are present on the timeline, including the LOSING 1-shot Sonnet", () => {
    const t = buildDemoTimeline(SPEC);
    const names = t.arms.map((a) => a.name.toLowerCase());
    expect(names.some((n) => n.includes("opus"))).toBe(true);
    expect(names.some((n) => n.includes("sonnet"))).toBe(true); // the loser — no cherry-picking
    expect(names.some((n) => n.includes("cloud"))).toBe(true);
    expect(names.some((n) => n.includes("hybrid") || n.includes("local-first"))).toBe(true);
    expect(t.arms.length).toBe(4);
  });

  test("each arm carries verbatim resolved %, total cost, and $/resolved sourced from real facts", () => {
    const t = buildDemoTimeline(SPEC);
    for (const arm of t.arms) {
      expect(factValues).toContain(arm.resolved);
      expect(factValues).toContain(arm.totalCost);
      expect(factValues).toContain(arm.perResolved);
    }
  });

  test("the full-cloud relay is flagged as the highest raw resolve %, hybrid is flagged as lfah", () => {
    const t = buildDemoTimeline(SPEC);
    const cloud = t.arms.find((a) => a.key === "fullcloud")!;
    const hybrid = t.arms.find((a) => a.key === "hybrid")!;
    expect(cloud.topResolve).toBe(true); // honest: cloud wins raw resolve %
    expect(hybrid.isLfah).toBe(true);
    expect(cloud.topResolve && cloud.isLfah).toBe(false); // lfah is NOT the resolve-% winner
  });

  test("the hybrid (lfah) has the best $/resolved among the relay-class arms (the value claim is true)", () => {
    const t = buildDemoTimeline(SPEC);
    const hybrid = t.arms.find((a) => a.key === "hybrid")!;
    const fullcloud = t.arms.find((a) => a.key === "fullcloud")!;
    const num = (v: string) => parseFactNumber(v)!.numeric;
    // $2.24 < $3.50 — the hybrid resolves bugs cheaper than the full-cloud relay.
    expect(num(hybrid.perResolved)).toBeLessThan(num(fullcloud.perResolved));
  });
});

describe("#748 demo timeline — per-role cost split (executor runs LOCAL at $0)", () => {
  test("the cost split includes the executor running local at 0% of spend", () => {
    const t = buildDemoTimeline(SPEC);
    const exec = t.costSplit.find((r) => /executor/i.test(r.role))!;
    expect(exec).toBeDefined();
    expect(exec.backend.toLowerCase()).toMatch(/local/);
    expect(exec.sharePct).toBe(0); // the honest selling point
  });

  test("the cost-split shares are sourced and sum to ~100%", () => {
    const t = buildDemoTimeline(SPEC);
    const total = t.costSplit.reduce((a, r) => a + r.sharePct, 0);
    expect(total).toBeGreaterThanOrEqual(95);
    expect(total).toBeLessThanOrEqual(105);
  });
});

describe("#748 demo timeline — the honest VERDICT (after the 30s mark)", () => {
  test("a verdict scene exists and starts at or after the 30s hook window", () => {
    const t = buildDemoTimeline(SPEC, { durationSec: 60 });
    const verdict = t.scenes.find((s) => s.id === "verdict")!;
    expect(verdict).toBeDefined();
    expect(verdict.fromSec).toBeGreaterThanOrEqual(HOOK_WINDOW_SEC);
  });

  test("the verdict CONCEDES the full-cloud relay's higher raw resolve % (no overclaim)", () => {
    const t = buildDemoTimeline(SPEC);
    const concession = t.verdict.concession.toLowerCase();
    expect(concession).toMatch(/cloud/);
    expect(concession).toMatch(/77%|highest|most|raw resolve|resolve/);
  });

  test("the verdict bottom line recommends lfah on VALUE / default, not raw resolve %", () => {
    const t = buildDemoTimeline(SPEC);
    const bl = t.verdict.bottomLine.toLowerCase();
    expect(bl).toMatch(/value|default|cost/);
  });

  test("the verdict has axis-by-axis rows, each naming an axis and a winner", () => {
    const t = buildDemoTimeline(SPEC);
    expect(t.verdict.axes.length).toBeGreaterThanOrEqual(2);
    for (const ax of t.verdict.axes) {
      expect(ax.axis.length).toBeGreaterThan(0);
      expect(ax.winner.length).toBeGreaterThan(0);
    }
    // At least one axis the cloud relay wins (honest), at least one the hybrid wins.
    const winners = t.verdict.axes.map((a) => a.winner.toLowerCase()).join(" ");
    expect(winners).toMatch(/cloud/);
    expect(winners).toMatch(/hybrid|local/);
  });
});

describe("#748 demo timeline — duration bounded to a launch-appropriate 45–90s", () => {
  test("bounds are 45s..90s with a 60s default, and a 30s hook window", () => {
    expect(MIN_DEMO_SEC).toBe(45);
    expect(MAX_DEMO_SEC).toBe(90);
    expect(DEFAULT_DEMO_SEC).toBe(60);
    // ~30% of viewers leave by 30s → the first 30s must be the hook (#748 design rule).
    expect(HOOK_WINDOW_SEC).toBe(30);
  });

  test("clampDemoDurationSec floors below-min, caps above-max, keeps in-range, defaults bad input", () => {
    expect(clampDemoDurationSec(18)).toBe(45); // the old too-short value is floored
    expect(clampDemoDurationSec(10)).toBe(45);
    expect(clampDemoDurationSec(120)).toBe(90);
    expect(clampDemoDurationSec(60)).toBe(60);
    expect(clampDemoDurationSec(45)).toBe(45);
    expect(clampDemoDurationSec(90)).toBe(90);
    expect(clampDemoDurationSec(undefined)).toBe(DEFAULT_DEMO_SEC);
    expect(clampDemoDurationSec(NaN)).toBe(DEFAULT_DEMO_SEC);
  });

  test("buildDemoTimeline never produces a timeline shorter than 45s, even if asked for 18s", () => {
    const t = buildDemoTimeline(SPEC, { durationSec: 18 });
    expect(t.durationSec).toBe(45);
    const last = t.scenes[t.scenes.length - 1];
    expect(last.fromSec + last.durationSec).toBeCloseTo(45, 6);
  });

  test("buildDemoTimeline caps at 90s and defaults to 60s, always inside [45,90]", () => {
    expect(buildDemoTimeline(SPEC, { durationSec: 300 }).durationSec).toBe(90);
    expect(buildDemoTimeline(SPEC).durationSec).toBe(DEFAULT_DEMO_SEC);
    const t = buildDemoTimeline(SPEC);
    expect(t.durationSec).toBeGreaterThanOrEqual(45);
    expect(t.durationSec).toBeLessThanOrEqual(90);
  });
});

describe("#763 demo timeline — scenes follow the narration (sceneEndTimesSec)", () => {
  const SCENE_COUNT = 5; // hook, compare, costsplit, verdict, cta

  test("narrationSceneEndTimes maps a known char-aligned fixture to the right per-scene end-times", () => {
    // Two tiny segments joined by a single space: "ab cd" (5 chars).
    // char idx: a=0 b=1 (space)=2 c=3 d=4. Segment 0 ends at the char BEFORE
    // segment 1's first char (idx 3) → idx 2 (the separator space). Segment 1
    // (last) ends at the final char (idx 4).
    const segs: NarrationSegment[] = [
      { sceneId: "hook", text: "ab" },
      { sceneId: "cta", text: "cd" },
    ];
    const charEnds = [0.1, 0.2, 0.3, 0.4, 0.5]; // one per char of "ab cd"
    expect(narrationSceneEndTimes(segs, charEnds)).toEqual([0.3, 0.5]);
  });

  test("narrationSceneEndTimes returns null on a length mismatch (alignment ≠ script)", () => {
    const segs: NarrationSegment[] = [{ sceneId: "hook", text: "ab" }];
    expect(narrationSceneEndTimes(segs, [0.1, 0.2, 0.3])).toBeNull(); // 3 ≠ 2 chars
    expect(narrationSceneEndTimes(segs, undefined)).toBeNull();
    expect(narrationSceneEndTimes([], [])).toBeNull();
  });

  test("narrationSceneEndTimes returns null on a non-monotonic / non-finite alignment", () => {
    const segs: NarrationSegment[] = [{ sceneId: "hook", text: "ab" }];
    expect(narrationSceneEndTimes(segs, [0.2, 0.1])).toBeNull(); // goes backwards
    expect(narrationSceneEndTimes(segs, [0.1, Number.NaN])).toBeNull();
  });

  test("on the real 5-segment narration, end-times line up with each scene and are ascending", () => {
    const script = narrationScript(DEMO_NARRATION);
    expect(DEMO_NARRATION.length).toBe(SCENE_COUNT);
    // Synthetic monotone alignment: one entry per character, last ≈ a realistic ~65s.
    const DUR = 65;
    const charEnds = Array.from({ length: script.length }, (_, i) =>
      ((i + 1) / script.length) * DUR,
    );
    const ends = narrationSceneEndTimes(DEMO_NARRATION, charEnds)!;
    expect(ends).not.toBeNull();
    expect(ends.length).toBe(SCENE_COUNT);
    for (let i = 1; i < ends.length; i++) expect(ends[i]).toBeGreaterThan(ends[i - 1]);
    expect(ends[ends.length - 1]).toBeCloseTo(DUR, 6);
  });

  test("#13 parity: narrationSceneEndTimes rejects a MIS-SCALED alignment when durationSec is known", () => {
    const script = narrationScript(DEMO_NARRATION);
    const DUR = 65;
    // Alignment scaled to only 30s for a 65s clip — ascending + in-range, but mis-synced.
    const underscaled = Array.from({ length: script.length }, (_, i) => ((i + 1) / script.length) * 30);
    // Without durationSec the helper can't know it's wrong (back-compat) → returns times.
    expect(narrationSceneEndTimes(DEMO_NARRATION, underscaled)).not.toBeNull();
    // With durationSec it catches the mis-scale (final 30s ≉ 65s) → null → weight-tiling fallback.
    expect(narrationSceneEndTimes(DEMO_NARRATION, underscaled, DUR)).toBeNull();
    // A well-scaled alignment (final ≈ duration) still passes with durationSec.
    const wellScaled = Array.from({ length: script.length }, (_, i) => ((i + 1) / script.length) * DUR);
    expect(narrationSceneEndTimes(DEMO_NARRATION, wellScaled, DUR)).not.toBeNull();
  });

  test("when sceneEndTimesSec is provided, scene boundaries equal those values (NOT weight-tiling)", () => {
    const DUR = 65;
    const sceneEndTimesSec = [12, 34, 44, 58, DUR]; // ascending, last = duration
    const t = buildDemoTimeline(SPEC, { durationSec: DUR, sceneEndTimesSec });
    const weight = buildDemoTimeline(SPEC, { durationSec: DUR }); // fallback for comparison

    expect(t.scenes[0].fromSec).toBe(0);
    for (let i = 0; i < t.scenes.length; i++) {
      const end = t.scenes[i].fromSec + t.scenes[i].durationSec;
      expect(end).toBeCloseTo(sceneEndTimesSec[i], 6); // each scene ends at the narration time
      expect(t.scenes[i].durationSec).toBeGreaterThan(0);
    }
    // Back-to-back, no gaps.
    for (let i = 0; i < t.scenes.length - 1; i++) {
      const end = t.scenes[i].fromSec + t.scenes[i].durationSec;
      expect(end).toBeCloseTo(t.scenes[i + 1].fromSec, 6);
    }
    // Proves the narration actually drove it: boundaries DIFFER from weight-tiling.
    const differs = t.scenes.some(
      (s, i) => Math.abs(s.durationSec - weight.scenes[i].durationSec) > 1e-3,
    );
    expect(differs).toBe(true);
  });

  test("the realistic ~65s narration timings keep the HOOK-FIRST invariants", () => {
    const DUR = 65;
    const sceneEndTimesSec = [22, 47, 53, 62, DUR]; // realistic-ish narration spans
    const t = buildDemoTimeline(SPEC, { durationSec: DUR, sceneEndTimesSec });
    const hook = t.scenes.find((s) => s.id === "hook")!;
    const verdict = t.scenes.find((s) => s.id === "verdict")!;
    expect(hook.fromSec + hook.durationSec).toBeLessThanOrEqual(HOOK_WINDOW_SEC);
    expect(verdict.fromSec).toBeGreaterThanOrEqual(HOOK_WINDOW_SEC);
  });

  test("an INVALID sceneEndTimesSec silently falls back to weight-tiling (unchanged)", () => {
    const DUR = 60;
    const weight = buildDemoTimeline(SPEC, { durationSec: DUR });
    const cases: number[][] = [
      [10, 20, 30, 40], // wrong length (4 ≠ 5)
      [10, 20, 15, 40, DUR], // not ascending
      [10, 20, 30, 40, DUR + 5], // last out of range
      [0, 20, 30, 40, DUR], // zero-length first scene
    ];
    for (const sceneEndTimesSec of cases) {
      const t = buildDemoTimeline(SPEC, { durationSec: DUR, sceneEndTimesSec });
      for (let i = 0; i < t.scenes.length; i++) {
        expect(t.scenes[i].fromSec).toBeCloseTo(weight.scenes[i].fromSec, 9);
        expect(t.scenes[i].durationSec).toBeCloseTo(weight.scenes[i].durationSec, 9);
      }
    }
  });

  test("when sceneEndTimesSec is ABSENT, weight-tiling is used (existing behavior preserved)", () => {
    const DUR = 60;
    const t = buildDemoTimeline(SPEC, { durationSec: DUR });
    // Match the documented weight-tiling math exactly.
    const weights = [4, 6, 4, 4, 2.5];
    const total = weights.reduce((a, b) => a + b, 0);
    let cursor = 0;
    for (let i = 0; i < t.scenes.length; i++) {
      const expectedDur =
        i === t.scenes.length - 1 ? DUR - cursor : (weights[i] / total) * DUR;
      expect(t.scenes[i].fromSec).toBeCloseTo(cursor, 9);
      expect(t.scenes[i].durationSec).toBeCloseTo(expectedDur, 9);
      cursor += expectedDur;
    }
  });
});

describe("#748 demo timeline — diagram + parsing + flow-through (carried from #743)", () => {
  test("diagram shows the local Fix node plus a cloud escalation edge", () => {
    const t = buildDemoTimeline(SPEC);
    const fix = t.diagram.nodes.find((n) => n.id === "fix");
    expect(fix?.lane).toBe("local");
    expect(t.diagram.nodes.some((n) => n.lane === "cloud")).toBe(true);
    const flow = t.diagram.edges.filter((e) => e.kind === "flow").map((e) => `${e.from}->${e.to}`);
    expect(flow).toEqual(["plan->fix", "fix->grade", "grade->tests"]);
    const esc = t.diagram.edges.filter((e) => e.kind === "escalate");
    expect(esc).toEqual([{ from: "fix", to: "cloud", kind: "escalate" }]);
  });

  test("title is derived from the product summary's first clause (no invented copy)", () => {
    expect(deriveTitle(SPEC)).toBe(
      "An AI coding agent that fixes real bugs",
    );
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
