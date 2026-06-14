/**
 * Post #5 — three-role-model demo TIMELINE (the deterministic spec the 6-scene animation renders from).
 *
 * "four AI subagents, nobody grades their own homework" — DISTINCT from Post #1's 4-way comparison
 * (`video/demoTimeline.ts`), Post #2's builder story (`video/builderDemoTimeline.ts`) and Post #3's
 * forge-harness story (`video/post3Timeline.ts`). Pure, no Remotion / no network. Turns the brand-safe
 * `threeRoleModelSpec` into an ordered set of 6 scenes plus the per-scene content (kitchen analogy
 * intro, the grades-its-own-homework problem, the four-roles relay, the two-knobs dials, the
 * mechanically-enforced ledger, and the install CTA). Every NUMBER is sourced VERBATIM from the spec's
 * facts so the moving demo stays consistent with the thread/cards — and the visible role / option
 * COUNTS are asserted to equal those facts (an honest visual can't claim "4 roles" while drawing 3).
 *
 * SHARED INFRASTRUCTURE REUSE (no divergent copies): the generic scene-sync algorithm
 * (`narrationSceneEndTimes`) and the duration clamp (`clampDemoDurationSec`) live in
 * `video/demoTimeline.ts` and are reused as-is — this module only adds the 6-scene SHAPE and its
 * three-role-model data. The Remotion composition (remotion/post5-index.tsx, id="post5-demo") is the
 * VIEW over this spec; this module is the source of truth for timings + content.
 */

import { type ContentSpec } from "../inputs/contentspec";
import { clampDemoDurationSec } from "./demoTimeline";

// ── Types ──────────────────────────────────────────────────────────────────

export type Post5SceneId =
  | "kitchen"
  | "problem"
  | "roles"
  | "knobs"
  | "enforced"
  | "cta";

export interface Post5Scene {
  id: Post5SceneId;
  fromSec: number;
  durationSec: number;
}

/** One role chip in the four-roles relay (name + its one-line job). */
export interface Post5Role {
  name: string;
  job: string;
}

export interface Post5Timeline {
  durationSec: number;
  fps: number;
  title: string;
  tagline: string;
  scenes: Post5Scene[];

  // Per-scene CONTENT (data-driven; the composition renders these, never hard-codes copy).
  kitchen: { headline: string; sub: string; pill: string };
  problem: { kicker: string; headline: string; items: string[]; footer: string };
  roles: { kicker: string; headline: string; roles: Post5Role[]; footer: string };
  knobs: {
    kicker: string;
    headline: string;
    executorLabel: string;
    executorOptions: string[];
    evaluatorLabel: string;
    evaluatorOptions: string[];
    footer: string;
  };
  enforced: { kicker: string; headline: string; chip: string; sub: string; footer: string };
  cta: { headline: string; lines: string[]; badge: string; cta: string; repoUrl?: string };
}

// ── Scene weights (silent-cut fallback only) ─────────────────────────────────
/**
 * Relative scene weights; actual seconds scale these to fill `durationSec` when NO real narration
 * alignment is supplied (the silent-cut fallback). With real narration the scene boundaries DERIVE
 * from the voice via `narrationSceneEndTimes`. The weights roughly track each scene's spoken length.
 */
const SCENE_WEIGHTS: { id: Post5SceneId; weight: number }[] = [
  { id: "kitchen", weight: 5.0 },
  { id: "problem", weight: 4.2 },
  { id: "roles", weight: 4.6 },
  { id: "knobs", weight: 4.6 },
  { id: "enforced", weight: 4.6 },
  { id: "cta", weight: 4.4 },
];

export const POST5_SCENE_COUNT = SCENE_WEIGHTS.length;

// ── fact lookup ──────────────────────────────────────────────────────────────

/** Look up a fact's verbatim value by an exact label; throws if the spec is missing it. */
function factValue(spec: ContentSpec, label: string): string {
  const f = spec.facts.find((x) => x.label === label);
  if (!f) {
    throw new Error(`threeRoleModelSpec is missing required fact "${label}" — update inputs/threeRoleModelSpec.ts`);
  }
  return f.value;
}

// ── scene tiling (weight fallback vs narration-aligned) ──────────────────────

/** Tile scenes by fixed relative weights scaled to fill `durationSec` (silent-cut fallback). */
function scenesFromWeights(durationSec: number): Post5Scene[] {
  const totalWeight = SCENE_WEIGHTS.reduce((a, s) => a + s.weight, 0);
  const scenes: Post5Scene[] = [];
  let cursor = 0;
  for (let i = 0; i < SCENE_WEIGHTS.length; i++) {
    const { id, weight } = SCENE_WEIGHTS[i];
    const isLast = i === SCENE_WEIGHTS.length - 1;
    const fromSec = cursor;
    const durationThis = isLast ? durationSec - fromSec : (weight / totalWeight) * durationSec;
    scenes.push({ id, fromSec, durationSec: durationThis });
    cursor = fromSec + durationThis;
  }
  return scenes;
}

/**
 * Are these scene end-times usable? One per scene, strictly ascending, each in (0, durationSec],
 * so they can drive back-to-back, in-bounds scenes. Mirrors the #763 validator in demoTimeline.ts.
 */
function validSceneEndTimes(ends: number[] | undefined, durationSec: number): boolean {
  if (!ends || ends.length !== SCENE_WEIGHTS.length) return false;
  let prev = 0;
  for (const e of ends) {
    if (!Number.isFinite(e)) return false;
    if (e <= prev) return false; // strictly ascending (no zero-length scene)
    if (e > durationSec + 1e-6) return false; // in range
    prev = e;
  }
  return true;
}

/**
 * Derive scenes from narration-aligned end-times: scene 0 starts at 0, scene i ends at `ends[i]`,
 * and the FINAL scene snaps to `durationSec` (float-safe) so the timeline ends exactly at the clip
 * length. Mirrors the #763 `scenesFromEndTimes` in demoTimeline.ts.
 */
function scenesFromEndTimes(ends: number[], durationSec: number): Post5Scene[] {
  const scenes: Post5Scene[] = [];
  let cursor = 0;
  for (let i = 0; i < SCENE_WEIGHTS.length; i++) {
    const { id } = SCENE_WEIGHTS[i];
    const isLast = i === SCENE_WEIGHTS.length - 1;
    const endThis = isLast ? durationSec : ends[i];
    scenes.push({ id, fromSec: cursor, durationSec: endThis - cursor });
    cursor = endThis;
  }
  return scenes;
}

// ── buildPost5Timeline ─────────────────────────────────────────────────────

/**
 * Build the deterministic 6-scene three-role-model timeline. Scenes tile [0, durationSec) back-to-back
 * with no gaps; the final scene ends exactly at durationSec. Numbers are sourced verbatim from the spec.
 *
 * When `sceneEndTimesSec` is supplied (one ascending value per scene, last ≈ durationSec) AND valid,
 * scene boundaries DERIVE from the narration timing so the screens follow the narrator. When absent or
 * invalid, weight-tiling drives the scenes (the silent-cut fallback). Supplying a NON-EMPTY
 * `sceneEndTimesSec` ALSO marks the render VOICED: floored at MIN, NOT capped at MAX (the ~90s
 * narration keeps its full length). Reuses `clampDemoDurationSec` (shared).
 */
export function buildPost5Timeline(
  spec: ContentSpec,
  opts?: { durationSec?: number; fps?: number; sceneEndTimesSec?: number[] },
): Post5Timeline {
  const voiced = !!opts?.sceneEndTimesSec && opts.sceneEndTimesSec.length > 0;
  const durationSec = clampDemoDurationSec(opts?.durationSec, { voiced });
  const fps = opts?.fps ?? 30;

  const scenes: Post5Scene[] = validSceneEndTimes(opts?.sceneEndTimesSec, durationSec)
    ? scenesFromEndTimes(opts!.sceneEndTimesSec!, durationSec)
    : scenesFromWeights(durationSec);

  const roleCount = factValue(spec, "roles"); // "4"
  const selfGrade = factValue(spec, "roles that grade their own work"); // "0"
  const knobCount = factValue(spec, "knobs"); // "2"
  const execOptions = factValue(spec, "executor placement options"); // "4"
  const evalOptions = factValue(spec, "evaluator options"); // "3"
  const installCmds = factValue(spec, "install commands"); // "2"

  // The four roles — names + one-line jobs, mirroring the README header diagram.
  const roles: Post5Role[] = [
    { name: "planner", job: "what to do" },
    { name: "plan-review", job: "vet the plan" },
    { name: "executor", job: "do the work" },
    { name: "execution-review", job: "vet the result" },
  ];
  // The two knobs — executor placement (4 options) + evaluator (3 options).
  const executorOptions = ["test-loop", "one subagent", "in parallel", "inline"];
  const evaluatorOptions = ["a real test", "a reviewer", "both"];

  // HONESTY: the visible counts must equal the spec facts — a moving demo can't claim "4 roles"
  // while drawing 3, nor "4 / 3 options" while listing a different number. Fail loud on drift.
  if (roles.length !== Number(roleCount)) {
    throw new Error(`post5 timeline: drew ${roles.length} role chips but spec says "${roleCount}" roles.`);
  }
  if (executorOptions.length !== Number(execOptions)) {
    throw new Error(`post5 timeline: drew ${executorOptions.length} executor options but spec says "${execOptions}".`);
  }
  if (evaluatorOptions.length !== Number(evalOptions)) {
    throw new Error(`post5 timeline: drew ${evaluatorOptions.length} evaluator options but spec says "${evalOptions}".`);
  }

  return {
    durationSec,
    fps,
    title: "the 3-role model",
    tagline: "four AI subagents · nobody grades their own homework",
    scenes,

    kitchen: {
      headline: "Like a kitchen with four cooks",
      sub: "a chef plans · a taster checks the plan · a cook makes it · a critic judges — the cook never rates their own plate",
      pill: `${roleCount} roles · ${selfGrade} grade their own work`,
    },
    problem: {
      kicker: "THE PROBLEM",
      headline: "One agent does everything",
      items: ["plans the work", "does the work", "decides it's done"],
      footer: "it grades its own homework — and when it's wrong, it's confidently wrong",
    },
    roles: {
      kicker: "FOUR ROLES, NO SELF-REVIEW",
      headline: `${roleCount} separate subagents`,
      roles,
      footer: "the reviewer is never the one who wrote the thing",
    },
    knobs: {
      kicker: "TWO KNOBS PER TASK",
      headline: `${knobCount} dials shape each task`,
      executorLabel: "executor — how it runs",
      executorOptions,
      evaluatorLabel: "evaluator — how it's checked",
      evaluatorOptions,
      footer: "whenever a real test exists, it beats an opinion",
    },
    enforced: {
      kicker: "PROVABLE, NOT CLAIMED",
      headline: "Enforced by code, not honor",
      chip: "hooks + forgery-resistant ledger",
      sub: "roles are bound to real transcripts — which roles ran is recorded",
      footer: "“we followed the process” is provable, not just claimed",
    },
    cta: {
      headline: "Now a Claude Code plugin",
      lines: [`${installCmds} commands to install`, "open source · MIT · early — feedback welcome"],
      badge: "MIT · public · feedback welcome",
      // Short verb only — the repo URL renders once, in the mono line below (avoids a double URL).
      cta: "Install it →",
      repoUrl: spec.product.repoUrl,
    },
  };
}
