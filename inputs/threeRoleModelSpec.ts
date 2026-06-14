/**
 * Post #5 — the three-role-model ContentSpec ("four AI subagents, nobody grades their own homework").
 *
 * Numbers sourced VERBATIM from the reviewed copy `out/copy/three-role-model-post-content.json`
 * → claim_verification (each cross-checked against the PUBLIC README of
 * github.com/ziyilam3999/three-role-model). Brand-safe (MIT, public repo; no employer brand).
 *
 * This is the SINGLE source of Post #4's numbers so the demo video, the thread, and the cards never
 * drift apart — the same discipline `inputs/forgeHarnessSpec.ts` (Post #3) and `inputs/builderSpec.ts`
 * (Post #2) enforce. If a number here disagrees with the copy JSON, the copy JSON wins (update here,
 * never invent).
 *
 * Honesty guards (mirrored from the copy's _honesty_guards) live in the facts' scopeGuards:
 *   - This is a WORKFLOW/methodology, not a benchmark — EVERY value here is a STRUCTURAL count from
 *     the README (4 roles, 2 knobs, 4 executor-placement options, 3 evaluator options). NO efficacy /
 *     performance number is claimed (no "X% fewer bugs"); we never imply measured quality gains.
 *   - "mechanically enforced / provable" is scoped: the role-ledger binds each role to a real subagent
 *     transcript so WHICH ROLES RAN is provable — NOT that the produced code is "provably correct".
 *   - "nobody grades their own homework" = the reviewer subagent is always independent of the executor;
 *     the orchestrator coordinates but does not do or grade the substantive work. README's own framing.
 *   - Public, MIT, early (new repo, no adoption claim) → framed "early — feedback welcome".
 */

import { type ContentSpec } from "./contentspec";

/** Provenance string for every fact (the reviewed, claim-verified copy). */
export const THREE_ROLE_CONTENT_SRC = "out/copy/three-role-model-post-content.json";

/** Stable repo URL — MIT, public, brand-clean. */
export const THREE_ROLE_REPO_URL = "https://github.com/ziyilam3999/three-role-model";

export function threeRoleModelSpec(): ContentSpec {
  return {
    product: {
      name: "three-role-model",
      // Drives the abstract art prompt (adapters/genart.ts buildArtPrompt) — evoke a relay / a small
      // orchestrated assembly line: four linked stations passing work forward with a verification loop
      // back, one coordinating hub. Purely abstract motif (light/flow/linked nodes), NO nameable UI
      // elements or text (the generative-art-adds-garbled-text lesson).
      summary:
        "a way of building software with AI where four separate subagents each do one job — a planner " +
        "decides what to do, a plan-reviewer vets that plan, an executor does the work, and an " +
        "execution-reviewer vets the result — so nobody ever grades their own homework; the " +
        "orchestrator only coordinates, and it is mechanically enforced so 'we followed the process' " +
        "is provable, not just claimed",
      repoUrl: THREE_ROLE_REPO_URL,
    },
    facts: [
      // ── the four roles (the headline) ────────────────────────────────────
      { label: "roles", value: "4", scopeGuard: "planner -> plan-review -> executor -> execution-review (README header diagram)", source: THREE_ROLE_CONTENT_SRC },
      { label: "roles that grade their own work", value: "0", scopeGuard: "never self-review — README 'nobody grades their own homework'", source: THREE_ROLE_CONTENT_SRC },
      // ── the two knobs ────────────────────────────────────────────────────
      { label: "knobs", value: "2", scopeGuard: "executor placement + evaluator — README 'Two knobs pick the shape per task'", source: THREE_ROLE_CONTENT_SRC },
      { label: "executor placement options", value: "4", scopeGuard: "test-loop / one subagent / parallel / inline (README)", source: THREE_ROLE_CONTENT_SRC },
      { label: "evaluator options", value: "3", scopeGuard: "a real passing test / an independent reviewer / both (README)", source: THREE_ROLE_CONTENT_SRC },
      // ── it's an installable public plugin ────────────────────────────────
      { label: "install commands", value: "2", scopeGuard: "marketplace add + plugin install — README Install section (2 commands)", source: THREE_ROLE_CONTENT_SRC },
    ],
    highlights: [
      "four separate subagents — planner, plan-review, executor, execution-review",
      "nobody grades their own homework; the reviewer is never the one who wrote the thing",
      "two knobs per task: how the executor runs, and how the result is checked",
      "mechanically enforced — a forgery-resistant ledger records which roles really ran",
    ],
    ctas: ["Install it → github.com/ziyilam3999/three-role-model"],
    sourceFiles: [THREE_ROLE_CONTENT_SRC],
  };
}
