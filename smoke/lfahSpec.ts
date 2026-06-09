/**
 * The lfah ContentSpec — REAL public numbers, brand-safe (no employer brand).
 *
 * Sourced verbatim from local-first-agent-harness/README.md "Early results
 * (n=13, SWE-bench Verified)". Public repo; safe to publish. Shared by the
 * end-to-end runner (smoke/e2e-lfah.ts) AND the demo-video smoke so there is
 * ONE source of these numbers — no divergent copies to drift apart.
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
      { label: "tasks evaluated", value: "13", scopeGuard: "n=13, SWE-bench Verified", source: README_SRC },
      { label: "full-cloud relay resolved", value: "77%", scopeGuard: "10/13", source: README_SRC },
      { label: "local-first hybrid resolved (with cloud fallback)", value: "62%", scopeGuard: "8/13", source: README_SRC },
      { label: "1-shot Opus resolved", value: "54%", scopeGuard: "7/13", source: README_SRC },
      { label: "full-cloud relay cost", value: "$35.0", scopeGuard: "n=13", source: README_SRC },
      { label: "local-first hybrid cost", value: "$15.7", scopeGuard: "n=13", source: README_SRC },
      { label: "cost saving vs full-cloud (same chain)", value: "55%", scopeGuard: "executor moved to local", source: README_SRC },
      { label: "executor (local) cost share", value: "0%", scopeGuard: "runs free on a local model", source: README_SRC },
    ],
    highlights: [
      "the heavy file-editing role runs free on a local model",
      "graded by the real SWE-bench Docker test oracle, never an LLM judge",
      "cloud fallback rescues the hardest bugs while keeping the honest local result",
    ],
    ctas: ["Try it: pip install git+https://github.com/ziyilam3999/local-first-agent-harness"],
    sourceFiles: [README_SRC],
  };
}
