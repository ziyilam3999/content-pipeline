/**
 * Post #3 — forge-harness demo TIMELINE (the deterministic spec the 6-scene animation renders from).
 *
 * "only 1 of 8 ever talks to the model" — DISTINCT from Post #1's 4-way comparison
 * (`video/demoTimeline.ts`) and Post #2's builder story (`video/builderDemoTimeline.ts`). Pure, no
 * Remotion / no network. Turns the brand-safe `forgeHarnessSpec` into an ordered set of 6 scenes plus
 * the per-scene content (foreman intro, the everything-calls-the-model problem, the 8-tiles flip with
 * 1 lit, the receipt numbers panel, the deterministic-verdict scene, and the CTA). Every number is
 * sourced VERBATIM from the spec's facts so the moving demo stays consistent with the thread/cards.
 *
 * SHARED INFRASTRUCTURE REUSE (no divergent copies): the generic scene-sync algorithm
 * (`narrationSceneEndTimes`) and the duration clamp (`clampDemoDurationSec`) live in
 * `video/demoTimeline.ts` and are reused as-is — this module only adds the 6-scene SHAPE and its
 * forge-harness data. The Remotion composition (remotion/post3-index.tsx, id="post3-demo") is the
 * VIEW over this spec; this module is the source of truth for timings + content.
 */

import { type ContentSpec } from "../inputs/contentspec";
import { clampDemoDurationSec } from "./demoTimeline";

// ── Types ──────────────────────────────────────────────────────────────────

export type Post3SceneId =
  | "foreman"
  | "problem"
  | "flip"
  | "receipt"
  | "determinism"
  | "cta";

export interface Post3Scene {
  id: Post3SceneId;
  fromSec: number;
  durationSec: number;
}

/** A label/value row for the receipt numbers panel (values kept verbatim from the spec facts). */
export interface Post3Number {
  label: string;
  value: string;
}

export interface Post3Timeline {
  durationSec: number;
  fps: number;
  title: string;
  tagline: string;
  scenes: Post3Scene[];

  // Per-scene CONTENT (data-driven; the composition renders these, never hard-codes copy).
  foreman: { headline: string; sub: string; pill: string };
  problem: { kicker: string; headline: string; items: string[]; footer: string };
  flip: { kicker: string; total: number; lit: number; litLabel: string; caption: string; sub: string };
  receipt: { kicker: string; headline: string; rows: Post3Number[]; footer: string };
  determinism: { kicker: string; headline: string; pass: string; sub: string; footer: string };
  cta: { headline: string; lines: string[]; badge: string; cta: string; repoUrl?: string };
}

// ── Scene weights (silent-cut fallback only) ─────────────────────────────────
/**
 * Relative scene weights; actual seconds scale these to fill `durationSec` when NO real narration
 * alignment is supplied (the silent-cut fallback). With real narration the scene boundaries DERIVE
 * from the voice via `narrationSceneEndTimes`. The weights roughly track each scene's spoken length.
 */
const SCENE_WEIGHTS: { id: Post3SceneId; weight: number }[] = [
  { id: "foreman", weight: 4.5 },
  { id: "problem", weight: 4.2 },
  { id: "flip", weight: 4.6 },
  { id: "receipt", weight: 4.4 },
  { id: "determinism", weight: 4.8 },
  { id: "cta", weight: 4.2 },
];

export const POST3_SCENE_COUNT = SCENE_WEIGHTS.length;

// ── fact lookup ──────────────────────────────────────────────────────────────

/** Look up a fact's verbatim value by an exact label; throws if the spec is missing it. */
function factValue(spec: ContentSpec, label: string): string {
  const f = spec.facts.find((x) => x.label === label);
  if (!f) {
    throw new Error(`forgeHarnessSpec is missing required fact "${label}" — update inputs/forgeHarnessSpec.ts`);
  }
  return f.value;
}

// ── scene tiling (weight fallback vs narration-aligned) ──────────────────────

/** Tile scenes by fixed relative weights scaled to fill `durationSec` (silent-cut fallback). */
function scenesFromWeights(durationSec: number): Post3Scene[] {
  const totalWeight = SCENE_WEIGHTS.reduce((a, s) => a + s.weight, 0);
  const scenes: Post3Scene[] = [];
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
function scenesFromEndTimes(ends: number[], durationSec: number): Post3Scene[] {
  const scenes: Post3Scene[] = [];
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

// ── buildPost3Timeline ─────────────────────────────────────────────────────

/**
 * Build the deterministic 6-scene forge-harness timeline. Scenes tile [0, durationSec) back-to-back
 * with no gaps; the final scene ends exactly at durationSec. Numbers are sourced verbatim from the spec.
 *
 * When `sceneEndTimesSec` is supplied (one ascending value per scene, last ≈ durationSec) AND valid,
 * scene boundaries DERIVE from the narration timing so the screens follow the narrator. When absent or
 * invalid, weight-tiling drives the scenes (the silent-cut fallback). Supplying a NON-EMPTY
 * `sceneEndTimesSec` ALSO marks the render VOICED: floored at MIN, NOT capped at MAX (the ~90s
 * narration keeps its full length). Reuses `clampDemoDurationSec` (shared).
 */
export function buildPost3Timeline(
  spec: ContentSpec,
  opts?: { durationSec?: number; fps?: number; sceneEndTimesSec?: number[] },
): Post3Timeline {
  const voiced = !!opts?.sceneEndTimesSec && opts.sceneEndTimesSec.length > 0;
  const durationSec = clampDemoDurationSec(opts?.durationSec, { voiced });
  const fps = opts?.fps ?? 30;

  const scenes: Post3Scene[] = validSceneEndTimes(opts?.sceneEndTimesSec, durationSec)
    ? scenesFromEndTimes(opts!.sceneEndTimesSec!, durationSec)
    : scenesFromWeights(durationSec);

  const blocks = factValue(spec, "building blocks"); // "8"
  const talks = factValue(spec, "blocks that talk to the model"); // "1"
  const deterministic = factValue(spec, "deterministic blocks"); // "7"
  const calls = factValue(spec, "tool calls"); // "16"
  const paid = factValue(spec, "paid calls"); // "2"
  const free = factValue(spec, "free calls"); // "14"
  const wholePlan = factValue(spec, "whole-plan cost"); // "$0.80"
  const perStory = factValue(spec, "cost per story"); // "$0.20"
  const projectSize = factValue(spec, "project size"); // "13"

  return {
    durationSec,
    fps,
    title: spec.product.name, // "forge-harness"
    tagline: "the harness coordinates · your agent builds",
    scenes,

    foreman: {
      headline: "Like a foreman on a build site",
      sub: "it tells the builder what to do next — and checks the work",
      pill: `only ${talks} of ${blocks} ever talks to the model`,
    },
    problem: {
      kicker: "THE PROBLEM",
      headline: "Most agents call the model for everything",
      items: ["which step is next?", "did this work?", "what now?"],
      footer: "every call costs tokens — the bill keeps stacking up",
    },
    flip: {
      kicker: "THE FLIP",
      total: Number(blocks), // 8
      lit: Number(talks), // 1
      litLabel: "forge_plan",
      caption: `${blocks} building blocks · only ${talks} talks to the model`,
      sub: `the other ${deterministic} are deterministic code — they read files & run commands`,
    },
    receipt: {
      kicker: "THE RECEIPT",
      headline: `a real ${projectSize}-story project`,
      rows: [
        { label: "tool calls", value: calls },
        { label: "paid · free", value: `${paid} · ${free}` },
        { label: "whole plan", value: wholePlan },
        { label: "per story", value: `~${perStory}` },
      ],
      footer: "$0 out of pocket on a Max plan",
    },
    determinism: {
      kicker: "VERDICTS YOU CAN TRUST",
      headline: "forge_evaluate runs YOUR commands",
      pass: "test passes → story passes",
      sub: "your build, your tests — not an LLM judge",
      footer: "same inputs · same result · every run",
    },
    cta: {
      headline: `${blocks} composable primitives`,
      lines: ["use one, or snap them together", "your agent does the real implementation work"],
      badge: "MIT · public · early — feedback welcome",
      // Short verb only — the repo URL renders once, in the mono line below (avoids a double URL).
      cta: "Try it →",
      repoUrl: spec.product.repoUrl,
    },
  };
}
