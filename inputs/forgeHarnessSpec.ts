/**
 * Post #3 — the forge-harness ContentSpec ("only 1 of 8 ever talks to the model").
 *
 * Numbers sourced VERBATIM from the reviewed copy `out/copy/forge-harness-post3-content.json`
 * → number_verification (each line cross-checked against forge-harness/README.md). Brand-safe
 * (MIT, public repo github.com/ziyilam3999/forge-harness; no employer brand).
 *
 * This is the SINGLE source of Post #3's numbers so the demo video, the thread, and the cards
 * never drift apart — the same discipline `inputs/builderSpec.ts` enforces for Post #2. If a
 * number here disagrees with the copy JSON, the copy JSON wins (update here, never invent).
 *
 * Honesty guards (mirrored from the copy's _honesty_guards) live in the facts' scopeGuards:
 *   - "1 of 8 talks to the model" = the README's headline framing (the dominant path); edge
 *     modes exist (footnoted) — wording stays "ever talks to the model" / "on the normal path".
 *   - the receipt is ONE real dogfood project (monday-bot, 4/13 stories shipped at README time)
 *     → "a real 13-story project", framed early; no broad-adoption claim.
 *   - $0.80 is API-equivalent cost, $0 out-of-pocket on a Max plan.
 */

import { type ContentSpec } from "./contentspec";

/** Provenance string for every fact (the reviewed, number-verified copy). */
export const FORGE_CONTENT_SRC = "out/copy/forge-harness-post3-content.json";

/** Stable repo URL — MIT, public, brand-clean. */
export const FORGE_REPO_URL = "https://github.com/ziyilam3999/forge-harness";

export function forgeHarnessSpec(): ContentSpec {
  return {
    product: {
      name: "forge-harness",
      // Drives the abstract art prompt (adapters/genart.ts buildArtPrompt) — evoke a foreman /
      // composable building-blocks / harness motif with a single lit block (the planning step).
      summary:
        "a coding-agent harness that flips the usual cost model: 8 composable building blocks, " +
        "and only 1 ever talks to the language model — the other 7 are plain deterministic code " +
        "that just reads files and runs your real tests, so a whole phase plan costs cents and " +
        "verdicts come from your tests, not the model's mood",
      repoUrl: FORGE_REPO_URL,
    },
    facts: [
      // ── the cost-inversion headline ──────────────────────────────────────
      { label: "building blocks", value: "8", scopeGuard: "8 MCP primitives (README line 7/51)", source: FORGE_CONTENT_SRC },
      { label: "blocks that talk to the model", value: "1", scopeGuard: "only forge_plan talks to the model on the normal path (README line 15/51)", source: FORGE_CONTENT_SRC },
      { label: "deterministic blocks", value: "7", scopeGuard: "the other 7 primitives are deterministic code — $0/call", source: FORGE_CONTENT_SRC },
      // ── the receipt (monday-bot, a real 13-story project) ────────────────
      { label: "tool calls", value: "16", scopeGuard: "README line 21 — 16 tool calls on the real dogfood project", source: FORGE_CONTENT_SRC },
      { label: "paid calls", value: "2", scopeGuard: "both were forge_plan invocations (README line 21)", source: FORGE_CONTENT_SRC },
      { label: "free calls", value: "14", scopeGuard: "14 of 16 calls cost no tokens (README line 21)", source: FORGE_CONTENT_SRC },
      { label: "whole-plan cost", value: "$0.80", scopeGuard: "README line 22 — $0.80 for the entire phase plan; $0 out-of-pocket on Max", source: FORGE_CONTENT_SRC },
      { label: "cost per story", value: "$0.20", scopeGuard: "README line 22 — ~$0.20 per story so far", source: FORGE_CONTENT_SRC },
      { label: "project size", value: "13", scopeGuard: "a real 13-story project (monday-bot, 4 shipped at README time) — framed early", source: FORGE_CONTENT_SRC },
    ],
    highlights: [
      "8 composable primitives — use one, or snap them together",
      "only 1 of 8 ever talks to the model; the other 7 are deterministic code",
      "forge_evaluate runs YOUR commands — test passes → story passes, same in, same out",
      "your Claude Code session does the real implementation work — forge plans, grades, coordinates",
    ],
    ctas: ["Try it → github.com/ziyilam3999/forge-harness"],
    sourceFiles: [FORGE_CONTENT_SRC],
  };
}
