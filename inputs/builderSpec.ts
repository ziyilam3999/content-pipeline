/**
 * #799 — the BUILDER ContentSpec for Post #2's demo ("lfah builds an app, test-first").
 *
 * Numbers sourced VERBATIM from `.ai-workspace/LFAH-BUILDER-DOGFOOD-METRICS.json` (harvested
 * 2026-06-08 from the lfah greenfield build of THIS content-pipeline app) and number-verified in
 * `out/copy/lfah-post2-builder-content.json` → number_verification. Brand-safe (no employer brand);
 * public repo, safe to publish.
 *
 * This is the SINGLE source of the builder demo's numbers so the moving demo, the thread, and the
 * cards never drift apart — the same discipline `smoke/lfahSpec.ts` enforces for Post #1. If a number
 * here disagrees with the metrics JSON, the metrics JSON wins (update here, never invent).
 *
 * The honesty guards are baked into the facts' scopeGuards:
 *   - $12.56 = TOTAL CLOUD spend (planner+evaluator+handoffs); the local executor labor is free.
 *   - The "13" here is 13 BUILD PHASES of this app — NOT Post #1's 13 SWE-bench bugs.
 *   - bp2 + bp5 were the CLOUD-HANDOFF (rescued) phases — "the cloud rescued the 2 hardest".
 */

import { type ContentSpec } from "./contentspec";

export const METRICS_SRC = ".ai-workspace/LFAH-BUILDER-DOGFOOD-METRICS.json";

/** A build phase chip for the dogfood-reveal scene. `rescued` = solved by cloud-handoff (honest). */
export interface BuilderPhase {
  id: string;
  rescued: boolean;
}

/**
 * The 13 build phases (bp1..bp13), in order, with the 2 cloud-rescued phases (bp2, bp5) flagged —
 * straight from the metrics per_phase array (solved_by === "cloud-handoff").
 */
export const BUILDER_PHASES: BuilderPhase[] = [
  { id: "bp1", rescued: false },
  { id: "bp2", rescued: true },
  { id: "bp3", rescued: false },
  { id: "bp4", rescued: false },
  { id: "bp5", rescued: true },
  { id: "bp6", rescued: false },
  { id: "bp7", rescued: false },
  { id: "bp8", rescued: false },
  { id: "bp9", rescued: false },
  { id: "bp10", rescued: false },
  { id: "bp11", rescued: false },
  { id: "bp12", rescued: false },
  { id: "bp13", rescued: false },
];

export function builderSpec(): ContentSpec {
  return {
    product: {
      name: "local-first-agent-harness",
      summary:
        "an AI coding agent that doesn't just fix bugs — it builds whole apps from scratch, test-first: " +
        "a failing test is the spec, a free local model writes code until the real test suite is green, " +
        "and a phase ships only when the tests AND an independent reviewer agree",
      repoUrl: "https://github.com/ziyilam3999/local-first-agent-harness",
    },
    facts: [
      // ── the dogfood headline (13 build phases of THIS app) ────────────────
      { label: "build phases", value: "13", scopeGuard: "13 build phases of this app — not Post #1's 13 SWE-bench bugs", source: METRICS_SRC },
      { label: "phases shipped", value: "13", scopeGuard: "build_phases_shipped=13 — 100% ship rate", source: METRICS_SRC },
      { label: "ship rate", value: "100%", scopeGuard: "ship_rate_pct=100", source: METRICS_SRC },
      { label: "one-shot phases", value: "11", scopeGuard: "one_shot_phases=11 — passed on the first try", source: METRICS_SRC },
      // ── the cost / local-split punchline ─────────────────────────────────
      { label: "total cloud cost", value: "$12.56", scopeGuard: "total_cost_usd=12.56 — TOTAL CLOUD spend; local executor labor is free", source: METRICS_SRC },
      { label: "free local share", value: "85%", scopeGuard: "local_share_pct=84.6 — phases solved by the free local model", source: METRICS_SRC },
      { label: "cloud-rescued phases", value: "2", scopeGuard: "bp2 + bp5 — the cloud rescued the 2 hardest phases", source: METRICS_SRC },
      { label: "cost per phase", value: "$0.97", scopeGuard: "avg_cost_per_phase_usd=0.97", source: METRICS_SRC },
    ],
    highlights: [
      "every feature starts as a failing test — the spec AND the proof",
      "graded by the project's REAL test suite (jest / pytest), never an LLM judge",
      "a phase ships only when the test is green AND an independent reviewer agrees",
      "the pipeline that built this very post built itself — 13 phases, all shipped",
    ],
    ctas: ["Try it: pip install git+https://github.com/ziyilam3999/local-first-agent-harness"],
    sourceFiles: [METRICS_SRC],
  };
}
