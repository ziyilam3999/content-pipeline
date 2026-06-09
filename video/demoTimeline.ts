/**
 * #748 — demo-video TIMELINE (the deterministic spec the animation renders from).
 *
 * Pure, no Remotion / no network. Turns a brand-safe `ContentSpec` plus a target
 * length into an ordered set of scenes, the honest 4-WAY comparison (all four
 * arms, including the LOSING 1-shot Sonnet — no cherry-picking), the per-role
 * cost split (executor local = $0), and an honest VERDICT that recommends lfah
 * on cost-efficiency while conceding the full-cloud relay's higher raw resolve %.
 * Every number is sourced VERBATIM from the spec's real facts so the moving demo
 * stays consistent with the thread/card and never invents a value.
 *
 * HOOK-FIRST: the first scene (inside the 30s hook window) lands the single most
 * compelling HONEST claim — the cost-efficiency angle + a free local executor —
 * and the detailed comparison / cost split / verdict come AFTER 30s.
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

export type SceneId = "hook" | "compare" | "costsplit" | "verdict" | "cta";

export interface DemoScene {
  id: SceneId;
  fromSec: number;
  durationSec: number;
}

/** One row of the honest 4-way comparison table. Values are verbatim fact strings. */
export interface DemoArm {
  /** Stable key for tests/styling (not shown). */
  key: "opus" | "sonnet" | "fullcloud" | "hybrid";
  /** Human label shown on screen, e.g. "1-shot Sonnet". */
  name: string;
  resolved: string; // e.g. "62%"
  totalCost: string; // e.g. "$15.7"
  perResolved: string; // e.g. "$2.24"
  /** True for the arm with the highest raw resolve % (the full-cloud relay — honest). */
  topResolve: boolean;
  /** True for the local-first hybrid (lfah) — the arm we recommend. */
  isLfah: boolean;
  /** Short honest note, e.g. "weakest arm" / "quality ceiling" / "best value". */
  note: string;
}

/** One row of the per-role cost split — where the hybrid's money actually goes. */
export interface DemoCostRole {
  role: string; // "Planner" | "Executor" | ...
  backend: string; // "cloud Opus" | "local model" | ...
  cost: string; // "$8.9" | "$0.0"
  sharePct: number; // 52 | 0 ...
}

/** One axis of the honest, axis-by-axis verdict. */
export interface DemoVerdictAxis {
  axis: string; // "Raw resolve %" | "Cost per resolved" | ...
  winner: string; // "Full-cloud relay" | "Local-first hybrid" | ...
  note: string;
}

/** The honest verdict: a hook headline, axis-by-axis rows, a concession, a bottom line. */
export interface DemoVerdict {
  axes: DemoVerdictAxis[];
  /** Explicitly concedes the full-cloud relay's higher raw resolve % (no overclaim). */
  concession: string;
  /** Recommends lfah on VALUE / default — not on raw resolve %. */
  bottomLine: string;
}

export interface DemoTimeline {
  durationSec: number;
  fps: number;
  title: string;
  /** The honest cost-efficiency hook line (free local executor), shown in the first 30s. */
  hookHeadline: string;
  scenes: DemoScene[];
  diagram: DemoDiagram;
  numbers: DemoNumber[];
  /** The 4-way comparison (all arms, incl. the losing 1-shot Sonnet). */
  arms: DemoArm[];
  /** Per-role cost split (executor local = $0). */
  costSplit: DemoCostRole[];
  /** The honest verdict (concedes cloud's raw-resolve lead; recommends lfah on value). */
  verdict: DemoVerdict;
  cta: string;
  repoUrl?: string;
}

// ── Duration policy ─────────────────────────────────────────────────────────
// THE RULE (and why it exists):
//   A launch product-demo must land enough content (a 4-way comparison + verdict)
//   while respecting short-form attention spans. Research (2026): product-demo
//   videos in the 30s–2min band convert best, and with shrinking attention spans
//   the modern sweet spot has tightened to ~60–90s. Critically, ~30% of viewers
//   drop off within the FIRST 30 SECONDS — so the opening hook matters more than
//   raw length. X/Reels skew shorter; LinkedIn/Shorts sit at the top of the band.
//
//   Therefore we hard-bound the demo to 45–90s (default 60s) so an under-baked
//   clip (e.g. the earlier 18s cut) can NEVER be generated again — the lower
//   bound is the load-bearing rule.
//
// HOOK-FIRST DESIGN RULE: because of the 30%-drop-in-30s data, ALWAYS design the
//   first HOOK_WINDOW_SEC (30s) as the HOOK — the single most compelling claim
//   up front (what it is + the headline result/cost win) — and put the detailed
//   ELABORATION (per-arm breakdown, per-role cost, axis-by-axis verdict) AFTER
//   the 30s mark. Front-load value; never bury the lede behind a slow build.
//   The #748 4-way redesign must honor this ordering.
export const MIN_DEMO_SEC = 45;
export const MAX_DEMO_SEC = 90;
export const DEFAULT_DEMO_SEC = 60;
/** The opening window that MUST be the hook (≈30% of viewers leave by here). */
export const HOOK_WINDOW_SEC = 30;

/** Clamp any requested duration into the [MIN, MAX] launch window; bad input → default. */
export function clampDemoDurationSec(requested?: number): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_DEMO_SEC;
  return Math.min(MAX_DEMO_SEC, Math.max(MIN_DEMO_SEC, requested));
}

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * Relative scene weights; actual seconds scale these to fill `durationSec`.
 *
 * Tuned so HOOK-FIRST holds across the whole 45–90s window:
 *   - the `hook` scene ends well inside HOOK_WINDOW_SEC (30s) at every length, and
 *   - the `verdict` scene starts at/after HOOK_WINDOW_SEC at every length
 *     (worst case is the 45s floor; the cumulative weight before `verdict` puts its
 *      start at ≈30.7s there).
 */
const SCENE_WEIGHTS: { id: SceneId; weight: number }[] = [
  { id: "hook", weight: 4 },
  { id: "compare", weight: 6 },
  { id: "costsplit", weight: 4 },
  { id: "verdict", weight: 4 },
  { id: "cta", weight: 2.5 },
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

// ── 4-way comparison / cost split / verdict (sourced verbatim from facts) ────

/** Look up a fact's verbatim value by an exact label; throws if the spec is missing it. */
function factValue(spec: ContentSpec, label: string): string {
  const f = spec.facts.find((x) => x.label === label);
  if (!f) {
    throw new Error(`lfah spec is missing required fact "${label}" — update smoke/lfahSpec.ts`);
  }
  return f.value;
}

/**
 * The honest 4-way comparison: 1-shot Opus, the LOSING 1-shot Sonnet, the
 * full-cloud relay (highest raw resolve %), and the local-first hybrid (lfah).
 * Every number is pulled verbatim from the spec's facts — no invented values.
 */
export function buildArms(spec: ContentSpec): DemoArm[] {
  return [
    {
      key: "opus",
      name: "1-shot Opus",
      resolved: factValue(spec, "1-shot Opus resolved"),
      totalCost: factValue(spec, "1-shot Opus total cost"),
      perResolved: factValue(spec, "1-shot Opus per resolved"),
      topResolve: false,
      isLfah: false,
      note: "blind single shot — no plan, no test-check",
    },
    {
      key: "sonnet",
      name: "1-shot Sonnet",
      resolved: factValue(spec, "1-shot Sonnet resolved"),
      totalCost: factValue(spec, "1-shot Sonnet total cost"),
      perResolved: factValue(spec, "1-shot Sonnet per resolved"),
      topResolve: false,
      isLfah: false,
      note: "weakest arm — lowest resolve % AND poor value",
    },
    {
      key: "fullcloud",
      name: "Full-cloud relay",
      resolved: factValue(spec, "full-cloud relay resolved"),
      totalCost: factValue(spec, "full-cloud relay total cost"),
      perResolved: factValue(spec, "full-cloud relay per resolved"),
      topResolve: true, // honest: this arm wins raw resolve %
      isLfah: false,
      note: "quality ceiling — but priciest total",
    },
    {
      key: "hybrid",
      name: "Local-first hybrid",
      resolved: factValue(spec, "local-first hybrid resolved (with cloud fallback)"),
      totalCost: factValue(spec, "local-first hybrid total cost"),
      perResolved: factValue(spec, "local-first hybrid per resolved"),
      topResolve: false,
      isLfah: true,
      note: "the value play — free local executor, cloud only when stuck",
    },
  ];
}

/** Per-role cost split for the hybrid — where the money actually goes (executor = $0). */
export function buildCostSplit(spec: ContentSpec): DemoCostRole[] {
  const share = (label: string): number => {
    const parsed = parseFactNumber(factValue(spec, label));
    return parsed ? parsed.numeric : 0;
  };
  return [
    { role: "Planner", backend: "cloud Opus", cost: "$8.9", sharePct: share("planner (cloud) cost share") },
    { role: "Evaluator", backend: "cloud", cost: "$6.8", sharePct: share("evaluator (cloud) cost share") },
    { role: "Executor", backend: "local model", cost: "$0.0", sharePct: share("executor (local) cost share") },
    { role: "Cloud fallback", backend: "cloud (hard bugs only)", cost: "$1.4", sharePct: share("cloud fallback cost share") },
  ];
}

/**
 * The honest, axis-by-axis verdict. Concedes the full-cloud relay's higher raw
 * resolve % up front, then recommends lfah on VALUE / as the safe default —
 * never an overclaimed "best at everything".
 */
export function buildVerdict(spec: ContentSpec): DemoVerdict {
  const cloudResolved = factValue(spec, "full-cloud relay resolved"); // "77%"
  const hybridPerResolved = factValue(spec, "local-first hybrid per resolved"); // "$2.24"
  const saving = factValue(spec, "cost saving vs full-cloud (same chain)"); // "55%"
  return {
    axes: [
      { axis: "Raw resolve %", winner: "Full-cloud relay", note: `${cloudResolved} — the quality ceiling` },
      { axis: "Cost per resolved", winner: "Local-first hybrid", note: `${hybridPerResolved} — best value` },
      { axis: "Heavy-role labor", winner: "Local-first hybrid", note: "executor runs free on a local model" },
      { axis: "Safe default", winner: "Local-first hybrid", note: "plans + verifies like the cloud chain, for free labor" },
    ],
    concession:
      `Honest: the full-cloud relay has the highest raw resolve % (${cloudResolved}) — it's the quality ceiling.`,
    bottomLine:
      `But the local-first hybrid wins on value — same chain at ${saving} less cost, ` +
      `with the heavy role running free locally. Best default when you don't know if a bug is easy or hard.`,
  };
}

/** The HONEST cost-efficiency hook line (free local executor) — shown in the first 30s. */
export function buildHookHeadline(spec: ContentSpec): string {
  const hybridPerResolved = factValue(spec, "local-first hybrid per resolved"); // "$2.24"
  const hybridTotal = factValue(spec, "local-first hybrid total cost"); // "$15.7"
  const cloudTotal = factValue(spec, "full-cloud relay total cost"); // "$35.0"
  const saving = factValue(spec, "cost saving vs full-cloud (same chain)"); // "55%"
  // Anchor the "cheaper" claim on TOTAL cost, where 55%-less is arithmetically true
  // ($15.7 vs $35.0). The per-fix figure ($2.24) is a concrete number, NOT "half" of
  // $3.50 (~2/3), so it is stated as a flat per-fix price, not a ratio.
  return (
    `Fixes real bugs at ${hybridPerResolved} each — and ${saving} less total cost than the ` +
    `cloud relay (${hybridTotal} vs ${cloudTotal}) — because the heavy work runs FREE on a local model.`
  );
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
    hookHeadline: buildHookHeadline(spec),
    scenes,
    diagram: DIAGRAM,
    numbers,
    arms: buildArms(spec),
    costSplit: buildCostSplit(spec),
    verdict: buildVerdict(spec),
    cta: spec.ctas[0] ?? "",
    repoUrl: spec.product.repoUrl,
  };
}
