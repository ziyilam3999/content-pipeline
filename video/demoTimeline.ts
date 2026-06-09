/**
 * #743 — demo-video TIMELINE (the deterministic spec the animation renders from).
 *
 * Pure, no Remotion / no network. Turns a brand-safe `ContentSpec` plus a target
 * length into an ordered set of scenes, an architecture diagram, and a set of
 * count-up numbers — all sourced from the spec's real facts so the moving demo
 * stays consistent with the thread/card and never invents a value.
 *
 * The Remotion composition (remotion/index.tsx, id="demo") is the VIEW over this
 * spec; this module is unit-tested as the source of truth for timings + content.
 */

import { type ContentSpec, type Fact } from "../inputs/contentspec";

// ── Types ──────────────────────────────────────────────────────────────────

export type Lane = "local" | "cloud" | "test";

export interface DemoNode {
  id: string;
  label: string;
  lane: Lane;
  badge: string;
}

export interface DemoEdge {
  from: string;
  to: string;
  /** A normal flow edge vs the dashed "escalate when stuck" edge. */
  kind: "flow" | "escalate";
}

export interface DemoDiagram {
  nodes: DemoNode[];
  edges: DemoEdge[];
}

/** A number that counts up on screen, parsed from a real fact (value kept verbatim). */
export interface DemoNumber {
  label: string;
  /** The fact's value verbatim (e.g. "77%", "$35.0") — what the verifier checks. */
  value: string;
  prefix: string; // e.g. "$"
  numeric: number; // e.g. 77, 35.0
  suffix: string; // e.g. "%"
  scopeGuard?: string;
}

export type SceneId = "hook" | "pipeline" | "escalation" | "results" | "cta";

export interface DemoScene {
  id: SceneId;
  fromSec: number;
  durationSec: number;
}

export interface DemoTimeline {
  durationSec: number;
  fps: number;
  title: string;
  scenes: DemoScene[];
  diagram: DemoDiagram;
  numbers: DemoNumber[];
  cta: string;
  repoUrl?: string;
}

// ── Duration policy ─────────────────────────────────────────────────────────
// A launch product-demo needs room to land its content (a 4-way comparison +
// verdict) but must respect short-form attention spans. Research (2026): the
// product-demo sweet spot is ~60–90s; X/Reels skew shorter. We hard-bound the
// demo to 45–90s so an under-baked clip (e.g. the earlier 18s cut) can NEVER be
// generated again — the lower bound is the load-bearing rule.
export const MIN_DEMO_SEC = 45;
export const MAX_DEMO_SEC = 90;
export const DEFAULT_DEMO_SEC = 60;

/** Clamp any requested duration into the [MIN, MAX] launch window; bad input → default. */
export function clampDemoDurationSec(requested?: number): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_DEMO_SEC;
  return Math.min(MAX_DEMO_SEC, Math.max(MIN_DEMO_SEC, requested));
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Relative scene weights; actual seconds scale these to fill `durationSec`. */
const SCENE_WEIGHTS: { id: SceneId; weight: number }[] = [
  { id: "hook", weight: 2.5 },
  { id: "pipeline", weight: 6 },
  { id: "escalation", weight: 3 },
  { id: "results", weight: 5 },
  { id: "cta", weight: 2 },
];

/** lfah's pipeline, as a fixed flow (the architecture this product demonstrates). */
const DIAGRAM: DemoDiagram = {
  nodes: [
    { id: "plan", label: "Plan", lane: "cloud", badge: "writes the plan" },
    { id: "fix", label: "Fix the code", lane: "local", badge: "runs free · local" },
    { id: "grade", label: "Grade the fix", lane: "cloud", badge: "checks the work" },
    { id: "tests", label: "Real tests", lane: "test", badge: "real test oracle" },
    { id: "cloud", label: "Cloud helper", lane: "cloud", badge: "only when stuck" },
  ],
  edges: [
    { from: "plan", to: "fix", kind: "flow" },
    { from: "fix", to: "grade", kind: "flow" },
    { from: "grade", to: "tests", kind: "flow" },
    { from: "fix", to: "cloud", kind: "escalate" },
  ],
};

const MAX_RESULT_NUMBERS = 6;

// ── Number parsing ─────────────────────────────────────────────────────────

/** Split a fact value like "$35.0" or "77%" into prefix / numeric / suffix. */
export function parseFactNumber(
  value: string,
): { prefix: string; numeric: number; suffix: string } | null {
  const m = value.match(/^(\D*?)(-?\d+(?:\.\d+)?)(.*)$/);
  if (!m) return null;
  const numeric = Number(m[2]);
  if (!Number.isFinite(numeric)) return null;
  return { prefix: m[1] ?? "", numeric, suffix: m[3] ?? "" };
}

function toDemoNumber(fact: Fact): DemoNumber | null {
  const parsed = parseFactNumber(fact.value);
  if (!parsed) return null;
  return {
    label: fact.label,
    value: fact.value,
    prefix: parsed.prefix,
    numeric: parsed.numeric,
    suffix: parsed.suffix,
    scopeGuard: fact.scopeGuard,
  };
}

// ── Title ──────────────────────────────────────────────────────────────────

/** A short hook line derived from the product summary (first clause), capitalised. */
export function deriveTitle(spec: ContentSpec): string {
  const first = spec.product.summary.split(/[—\-–,]/)[0].trim();
  const clause = first.length ? first : spec.product.name;
  return clause.charAt(0).toUpperCase() + clause.slice(1);
}

// ── buildDemoTimeline ──────────────────────────────────────────────────────

/**
 * Build the deterministic demo timeline. Scenes tile [0, durationSec) back-to-back
 * with no gaps; the final scene ends exactly at durationSec. Numbers are sourced
 * verbatim from the spec's facts (those that carry a parseable number), capped.
 */
export function buildDemoTimeline(
  spec: ContentSpec,
  opts?: { durationSec?: number; fps?: number },
): DemoTimeline {
  // Hard-bound the duration to the 45–90s launch window (no more 18s clips).
  const durationSec = clampDemoDurationSec(opts?.durationSec);
  const fps = opts?.fps ?? 30;

  const totalWeight = SCENE_WEIGHTS.reduce((a, s) => a + s.weight, 0);
  const scenes: DemoScene[] = [];
  let cursor = 0;
  for (let i = 0; i < SCENE_WEIGHTS.length; i++) {
    const { id, weight } = SCENE_WEIGHTS[i];
    const isLast = i === SCENE_WEIGHTS.length - 1;
    const fromSec = cursor;
    const durationThis = isLast
      ? durationSec - fromSec // snap final scene to the exact end (float-safe)
      : (weight / totalWeight) * durationSec;
    scenes.push({ id, fromSec, durationSec: durationThis });
    cursor = fromSec + durationThis;
  }

  const numbers = spec.facts
    .map(toDemoNumber)
    .filter((n): n is DemoNumber => n !== null)
    .slice(0, MAX_RESULT_NUMBERS);

  return {
    durationSec,
    fps,
    title: deriveTitle(spec),
    scenes,
    diagram: DIAGRAM,
    numbers,
    cta: spec.ctas[0] ?? "",
    repoUrl: spec.product.repoUrl,
  };
}
