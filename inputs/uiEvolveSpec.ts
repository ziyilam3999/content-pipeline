/**
 * Post (#1026) — the ui-evolve ContentSpec ("I caught my AI design tool's own judge
 * rewarding empty pages, fixed it, and proved the fix blind").
 *
 * Numbers sourced VERBATIM from the reviewed copy `out/copy/ui-evolve-content.json`
 * → number_verification (each line cross-checked against ui-evolve/evals/LAYER2-FINDING.md,
 * the committed Rule-18 receipt at v0.6.0). Brand-safe (MIT, public repo
 * github.com/ziyilam3999/ui-evolve; no employer brand).
 *
 * This is the SINGLE source of this post's numbers so the demo video, the thread, and the
 * cards never drift apart — the same discipline inputs/forgeHarnessSpec.ts enforces. If a
 * number here disagrees with the copy JSON, the copy JSON wins (update here, never invent).
 *
 * Honesty guards (mirrored from the copy's _honesty_guards) live in the facts' scopeGuards:
 *   - TWO SCALES: 83.1 / 87.1 are the OLD 6-dim judge on a 0-100 roundScore scale; 4.8 / 7.7
 *     are the NEW 11-dim judge on a 0-10 overall scale. Never conflated — the bug fact uses the
 *     old scale to show the inversion, the before/after facts use the new judge apples-to-apples.
 *   - "6/6 blind" = six designs each judged by an INDEPENDENT agent blind to origin (A-F).
 *   - all three round-6 redesigns TIE at 7.7 — no "best design" claim; three valid directions.
 *   - ui-evolve is open source, MIT, public, EARLY — no adoption/stars claim.
 */

import { type ContentSpec } from "./contentspec";

/** Provenance string for every fact (the reviewed, number-verified copy). */
export const UI_EVOLVE_CONTENT_SRC = "out/copy/ui-evolve-content.json";

/** Stable repo URL — MIT, public, brand-clean. */
export const UI_EVOLVE_REPO_URL = "https://github.com/ziyilam3999/ui-evolve";

export function uiEvolveSpec(): ContentSpec {
  return {
    product: {
      name: "ui-evolve",
      // Drives the abstract art prompt (adapters/genart.ts buildArtPrompt) — evoke a quality
      // GAUGE/BAND that peaks in the middle (not empty, not cluttered), a blind judge weighing
      // screenshots, and a before->after lift. Restrained, editorial, instrument-like.
      summary:
        "a Claude Code skill that improves a website's design in a loop and proves each change is " +
        "actually better — it scores every round on objective metrics (speed, accessibility, layout) " +
        "AND an 11-dimension vision-judge, and reverts anything that does not genuinely improve. " +
        "Its first taste-judge had a blind spot: it rewarded near-empty pages; the rebuilt judge " +
        "uses a band that peaks in the middle and was proven blind on real screenshots",
      repoUrl: UI_EVOLVE_REPO_URL,
    },
    facts: [
      // ── the bug: the old judge rewarded emptiness [OLD 0-100 roundScore scale] ──────────
      { label: "old judge dimensions", value: "6", scopeGuard: "the old judge scored 6 legibility dims only (LAYER2-FINDING: 'old 6-dim legibility-only judge')", source: UI_EVOLVE_CONTENT_SRC },
      { label: "near-empty page score (old scale)", value: "87.1", scopeGuard: "OLD 6-dim roundScore, 0-100 scale — round-4 scored 87.1 (LAYER2-FINDING Result 1); NOT the new 0-10 scale", source: UI_EVOLVE_CONTENT_SRC },
      { label: "clean page score (old scale)", value: "83.1", scopeGuard: "OLD 6-dim roundScore, 0-100 scale — round-1 scored 83.1, BELOW the emptier page (the inversion bug)", source: UI_EVOLVE_CONTENT_SRC },
      // ── the fix: the rebuilt judge ──────────────────────────────────────────────────────
      { label: "new judge dimensions", value: "11", scopeGuard: "UPDATED 11-dimension vision-judge (LAYER2-FINDING Method)", source: UI_EVOLVE_CONTENT_SRC },
      { label: "structural dimensions", value: "5", scopeGuard: "5 structural dims: depth/cohesion/rhythm/hierarchyContrast/distinctiveness (the structuralBlock)", source: UI_EVOLVE_CONTENT_SRC },
      // ── the proof: blind run [NEW 0-10 overall scale] ───────────────────────────────────
      { label: "designs judged blind", value: "6", scopeGuard: "six designs, each judged by an independent agent blind to origin (anonymized A-F)", source: UI_EVOLVE_CONTENT_SRC },
      { label: "correct blind classification", value: "6/6", scopeGuard: "LAYER2-FINDING Result 1: 'Blind classification: 6/6 correct'", source: UI_EVOLVE_CONTENT_SRC },
      { label: "generic site score (new scale)", value: "4.8", scopeGuard: "NEW 11-dim overall, 0-10 scale — round-1 generic = 4.8 (LAYER2-FINDING Result 1)", source: UI_EVOLVE_CONTENT_SRC },
      { label: "redesign score (new scale)", value: "7.7", scopeGuard: "NEW 11-dim overall, 0-10 scale — editorial/terminal/swiss ALL = 7.7; three-way tie, no 'best' claim", source: UI_EVOLVE_CONTENT_SRC },
      { label: "redesign directions", value: "3", scopeGuard: "three frontend-design directions: editorial / terminal / swiss (LAYER2-FINDING Method)", source: UI_EVOLVE_CONTENT_SRC },
    ],
    highlights: [
      "the old taste-judge rewarded emptiness — it scored a near-empty page 87.1, above a clean one at 83.1",
      "the rebuilt judge has 11 dimensions, 5 structural, on a band that peaks in the middle (not empty, not cluttered)",
      "proven BLIND on 6 real screenshots — generic site 4.8, three redesigns 7.7, all classified correctly (6/6)",
      "validates every change with objective metrics AND a vision-judge, and reverts what isn't genuinely better",
    ],
    ctas: ["Open source, a Claude Code skill — try it → github.com/ziyilam3999/ui-evolve"],
    sourceFiles: [UI_EVOLVE_CONTENT_SRC],
  };
}
