/**
 * The lfah ContentSpec — REAL public numbers, brand-safe (no employer brand).
 *
 * Sourced VERBATIM from local-first-agent-harness/README.md "Early results
 * (n=13, SWE-bench Verified)" — the honest 4-WAY comparison (1-shot Opus,
 * 1-shot Sonnet, full-cloud relay, local-first hybrid) plus the per-role cost
 * split. Public repo; safe to publish. Shared by the end-to-end runner
 * (smoke/e2e-lfah.ts) AND the demo-video smoke so there is ONE source of these
 * numbers — no divergent copies to drift apart.
 *
 * The README is the source of truth; if a number here disagrees with the README,
 * the README wins (update here, never invent).
 */

import { type ContentSpec } from "../inputs/contentspec";

export const README_SRC = "local-first-agent-harness/README.md";

export function lfahSpec(): ContentSpec {
  return {
    product: {
      name: "local-first-agent-harness",
      summary:
        "an AI coding agent that fixes real bugs — runs the heavy work on a cheap local model, " +
        "escalates to the cloud only when stuck, and grades itself with real tests, not an LLM",
      repoUrl: "https://github.com/ziyilam3999/local-first-agent-harness",
    },
    facts: [
      // ── corpus ──────────────────────────────────────────────────────────
      { label: "tasks evaluated", value: "13", scopeGuard: "n=13, SWE-bench Verified", source: README_SRC },

      // ── the honest 4-way comparison (resolved % / total cost / $ per resolved) ──
      // 1-shot Opus
      { label: "1-shot Opus resolved", value: "54%", scopeGuard: "7/13", source: README_SRC },
      { label: "1-shot Opus total cost", value: "$11.8", scopeGuard: "n=13", source: README_SRC },
      { label: "1-shot Opus per resolved", value: "$1.68", scopeGuard: "total ÷ resolved", source: README_SRC },
      // 1-shot Sonnet — the LOSER arm (shown, not cherry-picked away)
      { label: "1-shot Sonnet resolved", value: "46%", scopeGuard: "6/13 — weakest arm", source: README_SRC },
      { label: "1-shot Sonnet total cost", value: "$21.3", scopeGuard: "n=13", source: README_SRC },
      { label: "1-shot Sonnet per resolved", value: "$3.54", scopeGuard: "total ÷ resolved", source: README_SRC },
      // Full-cloud relay — highest raw resolve %, priciest total
      { label: "full-cloud relay resolved", value: "77%", scopeGuard: "10/13 — quality ceiling", source: README_SRC },
      { label: "full-cloud relay total cost", value: "$35.0", scopeGuard: "n=13", source: README_SRC },
      { label: "full-cloud relay per resolved", value: "$3.50", scopeGuard: "total ÷ resolved", source: README_SRC },
      // Local-first hybrid (lfah) — the value play
      { label: "local-first hybrid resolved (with cloud fallback)", value: "62%", scopeGuard: "8/13 — 54% local-only, 62% with fallback", source: README_SRC },
      { label: "local-first hybrid total cost", value: "$15.7", scopeGuard: "n=13", source: README_SRC },
      { label: "local-first hybrid per resolved", value: "$2.24", scopeGuard: "total ÷ resolved", source: README_SRC },

      // ── per-role cost split (where the hybrid's money actually goes) ──────
      { label: "planner (cloud) cost share", value: "52%", scopeGuard: "$8.9 — cloud Opus", source: README_SRC },
      { label: "evaluator (cloud) cost share", value: "40%", scopeGuard: "$6.8 — cloud", source: README_SRC },
      { label: "executor (local) cost share", value: "0%", scopeGuard: "$0.0 — runs free on a local model", source: README_SRC },
      { label: "cloud fallback cost share", value: "8%", scopeGuard: "$1.4 — hard bugs only", source: README_SRC },

      // ── the bottom-line honest selling point ─────────────────────────────
      { label: "cost saving vs full-cloud (same chain)", value: "55%", scopeGuard: "executor moved to local: $35.0 → $15.7", source: README_SRC },
    ],
    highlights: [
      "the heavy file-editing role (executor) runs free on a local model — 0% of spend",
      "graded by the real SWE-bench Docker test oracle, never an LLM judge",
      "matches single-shot Opus quality at ~45% of the full-cloud relay's cost",
      "cloud fallback rescues the hardest bugs while keeping the honest local result",
    ],
    ctas: ["Try it: pip install git+https://github.com/ziyilam3999/local-first-agent-harness"],
    sourceFiles: [README_SRC],
  };
}
