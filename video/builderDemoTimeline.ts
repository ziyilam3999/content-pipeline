/**
 * #799 — BUILDER demo TIMELINE (the deterministic spec the 8-scene builder animation renders from).
 *
 * Post #2's demo: "lfah builds an app, test-first" — DISTINCT from Post #1's 4-way comparison
 * (`video/demoTimeline.ts`). Pure, no Remotion / no network. Turns the brand-safe `builderSpec`
 * into an ordered set of 8 scenes plus the per-scene content (intro name-expand, the spec/proof
 * framing, a RED→GREEN test chip, the ship gate, the 13 phase chips with the 2 cloud-rescued ones
 * flagged, and a numbers panel). Every number is sourced VERBATIM from the spec's facts so the
 * moving demo stays consistent with the thread/cards and never invents a value.
 *
 * SHARED INFRASTRUCTURE REUSE (no divergent copies): the generic scene-sync algorithm
 * (`narrationSceneEndTimes`) and the duration clamp (`clampDemoDurationSec`) live in
 * `video/demoTimeline.ts` and are reused as-is — this module only adds the 8-scene SHAPE and its
 * builder-specific data. The Remotion composition (remotion/index.tsx, id="builder-demo") is the
 * VIEW over this spec; this module is unit-tested as the source of truth for timings + content.
 */

import { type ContentSpec, type Fact } from "../inputs/contentspec";
import { BUILDER_PHASES, type BuilderPhase } from "../inputs/builderSpec";
import { clampDemoDurationSec } from "./demoTimeline";

// ── Types ──────────────────────────────────────────────────────────────────

export type BuilderSceneId =
  | "intro"
  | "testfirst"
  | "red"
  | "green"
  | "gate"
  | "dogfood"
  | "numbers"
  | "cta";

export interface BuilderScene {
  id: BuilderSceneId;
  fromSec: number;
  durationSec: number;
}

/** A number shown in the numbers panel — the fact's value kept verbatim (what the verifier checks). */
export interface BuilderNumber {
  label: string;
  value: string;
  scopeGuard?: string;
}

export interface BuilderTimeline {
  durationSec: number;
  fps: number;
  /** Displayed product name (stays "lfah"-style — the spoken "Alpha" lives only in the narration). */
  title: string;
  /** The product name expanded for the intro card. */
  nameExpansion: string;
  /** The intro hook line (what it is + the test-first claim). */
  introHeadline: string;
  scenes: BuilderScene[];
  /** The 13 build phases (with the 2 cloud-rescued flagged) — for the dogfood-reveal scene. */
  phases: BuilderPhase[];
  /** The numbers panel rows, sourced verbatim from the spec facts. */
  numbers: BuilderNumber[];
  /** The CTA line (verb + install command). */
  cta: string;
  repoUrl?: string;
}

// ── Duration policy ─────────────────────────────────────────────────────────
// Reuses the Post #1 launch window (45–90s) + the voiced clamp (floor only, no 90s cap) from
// `video/demoTimeline.ts`. The builder script is ~90s of narration, so a VOICED render keeps its
// full length (captions + scenes stay synced to the real audio) and a FREE/silent cut stays in
// [45,90].

// ── Scene weights (silent-cut fallback only) ─────────────────────────────────
/**
 * Relative scene weights; actual seconds scale these to fill `durationSec` when NO real narration
 * alignment is supplied (the silent-cut fallback). With real narration the scene boundaries DERIVE
 * from the voice via `narrationSceneEndTimes` (see `buildBuilderTimeline`). The weights roughly
 * track each scene's spoken length so even the silent fallback reads naturally.
 */
const SCENE_WEIGHTS: { id: BuilderSceneId; weight: number }[] = [
  { id: "intro", weight: 4 },
  { id: "testfirst", weight: 4.5 },
  { id: "red", weight: 3 },
  { id: "green", weight: 4.5 },
  { id: "gate", weight: 5 },
  { id: "dogfood", weight: 4 },
  { id: "numbers", weight: 5 },
  { id: "cta", weight: 3.5 },
];

export const BUILDER_SCENE_COUNT = SCENE_WEIGHTS.length;

// ── fact lookup ──────────────────────────────────────────────────────────────

/** Look up a fact's verbatim value by an exact label; throws if the spec is missing it. */
function factValue(spec: ContentSpec, label: string): string {
  const f = spec.facts.find((x) => x.label === label);
  if (!f) {
    throw new Error(`builderSpec is missing required fact "${label}" — update inputs/builderSpec.ts`);
  }
  return f.value;
}

function toBuilderNumber(fact: Fact): BuilderNumber {
  return { label: fact.label, value: fact.value, scopeGuard: fact.scopeGuard };
}

/** The numbers panel: the dogfood headline + cost/local-split facts, verbatim from the spec. */
export function buildBuilderNumbers(spec: ContentSpec): BuilderNumber[] {
  const labels = [
    "phases shipped",
    "one-shot phases",
    "total cloud cost",
    "free local share",
    "cloud-rescued phases",
    "cost per phase",
  ];
  return labels.map((label) => {
    const f = spec.facts.find((x) => x.label === label);
    if (!f) throw new Error(`builderSpec is missing required fact "${label}" — update inputs/builderSpec.ts`);
    return toBuilderNumber(f);
  });
}

/** The intro hook line: what it is + the test-first claim (sourced from the product summary). */
export function buildIntroHeadline(): string {
  return "It doesn't just fix bugs — it builds whole apps, from scratch, test-first.";
}

// ── scene tiling (weight fallback vs narration-aligned) ──────────────────────

/** Tile scenes by fixed relative weights scaled to fill `durationSec` (silent-cut fallback). */
function scenesFromWeights(durationSec: number): BuilderScene[] {
  const totalWeight = SCENE_WEIGHTS.reduce((a, s) => a + s.weight, 0);
  const scenes: BuilderScene[] = [];
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
function scenesFromEndTimes(ends: number[], durationSec: number): BuilderScene[] {
  const scenes: BuilderScene[] = [];
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

// ── buildBuilderTimeline ─────────────────────────────────────────────────────

/**
 * Build the deterministic 8-scene builder timeline. Scenes tile [0, durationSec) back-to-back with
 * no gaps; the final scene ends exactly at durationSec. Numbers are sourced verbatim from the spec.
 *
 * When `sceneEndTimesSec` is supplied (one ascending value per scene, last ≈ durationSec) AND valid,
 * scene boundaries DERIVE from the narration timing so the screens follow the narrator. When absent
 * or invalid, weight-tiling drives the scenes (the silent-cut fallback). Supplying a NON-EMPTY
 * `sceneEndTimesSec` ALSO marks the render VOICED: the duration is floored at MIN but NOT capped at
 * MAX (the ~90s narration keeps its full length). Reuses `clampDemoDurationSec` (shared, #777).
 */
export function buildBuilderTimeline(
  spec: ContentSpec,
  opts?: { durationSec?: number; fps?: number; sceneEndTimesSec?: number[] },
): BuilderTimeline {
  const voiced = !!opts?.sceneEndTimesSec && opts.sceneEndTimesSec.length > 0;
  const durationSec = clampDemoDurationSec(opts?.durationSec, { voiced });
  const fps = opts?.fps ?? 30;

  const scenes: BuilderScene[] = validSceneEndTimes(opts?.sceneEndTimesSec, durationSec)
    ? scenesFromEndTimes(opts!.sceneEndTimesSec!, durationSec)
    : scenesFromWeights(durationSec);

  return {
    durationSec,
    fps,
    title: spec.product.name,
    nameExpansion: spec.product.name.replace(/-/g, " "),
    introHeadline: buildIntroHeadline(),
    scenes,
    phases: BUILDER_PHASES,
    numbers: buildBuilderNumbers(spec),
    cta: spec.ctas[0] ?? "",
    repoUrl: spec.product.repoUrl,
  };
}
