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
import { narrationScript } from "./demoNarration";

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

export type SceneId = "hook" | "pipeline" | "compare" | "costsplit" | "verdict" | "cta";

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

/**
 * Clamp a requested demo duration into the launch window.
 *
 * SILENT / free cut (default): clamp to [MIN, MAX]; bad input → DEFAULT. The MAX cap keeps the
 * free promo short (the 45–90s sweet spot) and the MIN floor blocks the old under-baked 18s clip.
 *
 * #777 — VOICED cut (`opts.voiced === true`): the demo now carries 6 scenes + a 6th narration
 * segment, so the REAL spoken narration can run LONGER than MAX_DEMO_SEC. A voiced render must
 * use the ACTUAL audio length (not a 90s truncation) or the captions + scene cuts desync from
 * the voice — total-length-match ≠ sync (feedback_real_audio_alignment_drives_all_timed_visual_tracks).
 * So in voiced mode we keep the MIN floor (never under-baked) but DROP the MAX cap: the real
 * narration length flows straight through, and `assertAudioMatchesSync` (audio ≈ last scene end)
 * still binds the timeline to the synth it came from.
 */
export function clampDemoDurationSec(requested?: number, opts?: { voiced?: boolean }): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_DEMO_SEC;
  const floored = Math.max(MIN_DEMO_SEC, requested);
  // Voiced: real narration may exceed MAX — keep the full length so captions/scenes stay synced.
  return opts?.voiced ? floored : Math.min(MAX_DEMO_SEC, floored);
}

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * Relative scene weights; actual seconds scale these to fill `durationSec`.
 *
 * #780 — `pipeline` (the lfah FLOW DIAGRAM) is inserted as the 2nd scene, between the
 * hook and the comparison: after the cost-efficiency hook lands, SHOW the loop
 * (plan → fix → grade → tests, escalate-only-when-stuck) before the numbers.
 *
 * Tuned so HOOK-FIRST holds across the whole 45–90s window even with 6 scenes:
 *   - the `hook` scene ends well inside HOOK_WINDOW_SEC (30s) at every length
 *     (hook fraction 3.5/25 = 0.14 → at the 90s ceiling hook ends ≈12.6s, far under 30s), and
 *   - the `verdict` scene starts at/after HOOK_WINDOW_SEC at every length
 *     (cumulative weight before `verdict` = 18.5/25 = 0.74 → worst case is the 45s
 *      floor, where verdict starts ≈33.3s, still ≥30s).
 */
const SCENE_WEIGHTS: { id: SceneId; weight: number }[] = [
  { id: "hook", weight: 3.5 },
  { id: "pipeline", weight: 5 },
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

// ── narrationSceneEndTimes (scenes follow the narrator) ──────────────────────

/**
 * #763 — given the narration as ORDERED SEGMENTS (one per scene, in scene order)
 * and the REAL per-character end-times for the CONCATENATED spoken script
 * (`narrationScript(segments)` — segments joined by a single space), return the
 * end-time of each segment. The i-th value is when scene i's narration finishes,
 * so the demo can transition scene i exactly there instead of on a fixed timer.
 *
 * This is the SCENE-transition twin of `realChunkEndTimes` in `video/captions.ts`
 * and mirrors its conventions exactly:
 *   - the alignment must have one entry per character of the concatenated script
 *     (otherwise indices don't correspond → null),
 *   - every entry must be finite and the series non-decreasing (time only moves
 *     forward) → otherwise null (a malformed array would invert a scene),
 *   - segment k (not the last) ends at the end-time of the last character BEFORE
 *     segment k+1's first character — the single-space separator — so scenes stay
 *     back-to-back with no gap; the LAST segment ends at the final char's time.
 *
 * Returns null on any mismatch so the caller falls back to weight-tiling — the
 * same silent-cut fallback `buildCaptions` uses for captions.
 */
export function narrationSceneEndTimes(
  // #799 — accepts ANY ordered narration (the Post #1 `NarrationSegment[]` OR the Post #2
  // builder `BuilderNarrationSegment[]`): the algorithm only reads `.text` + `.length`, never
  // the `sceneId` literal type, so it stays single-sourced across both demos. Each segment must
  // carry a `text` (the structural shape `narrationScript` consumes).
  segments: ReadonlyArray<{ text: string }>,
  charEndTimesSec: number[] | undefined,
  durationSec?: number,
): number[] | null {
  if (!segments.length) return null;
  const script = narrationScript(segments);
  const ends = charEndTimesSec;
  // One entry per character of the concatenated script, or indices don't line up.
  if (!ends || ends.length !== script.length) return null;

  // Trust but verify: finite + non-decreasing (mirror realChunkEndTimes).
  for (let i = 0; i < ends.length; i++) {
    if (!Number.isFinite(ends[i])) return null;
    if (i > 0 && ends[i] < ends[i - 1]) return null;
  }

  // #13 parity (mirror realChunkEndTimes): when the clip length is known, reject a
  // MIS-SCALED alignment whose final char-time is far from the clip end. Without this
  // an under-scaled alignment (final time 30s for a 65s clip) would pass the ascending
  // + in-range gates yet drive in-bounds-but-mis-synced scenes — the exact "looks fine,
  // isn't synced" trap this whole fix exists to close. Generalizes the caption guard.
  if (durationSec !== undefined) {
    const finalEnd = ends[ends.length - 1];
    const tol = Math.max(0.1, durationSec * 0.01);
    if (Math.abs(finalEnd - durationSec) > tol) return null;
  }

  // First-character index of each segment in the single-space-joined script.
  // Segment k+1's first char = (chars of segments 0..k) + k separator spaces.
  const firstCharIdx: number[] = [];
  let acc = 0;
  for (let k = 0; k < segments.length; k++) {
    firstCharIdx.push(acc);
    acc += segments[k].text.length + 1; // +1 for the single-space separator
  }

  const endTimes: number[] = [];
  for (let k = 0; k < segments.length; k++) {
    if (k === segments.length - 1) {
      endTimes.push(ends[ends.length - 1]); // last segment → final char's time
    } else {
      const nextFirstChar = firstCharIdx[k + 1];
      endTimes.push(ends[nextFirstChar - 1]); // char before the next segment (the space)
    }
  }
  return endTimes;
}

// ── scene tiling (weight fallback vs narration-aligned) ──────────────────────

/** Existing behavior: tile scenes by fixed relative weights scaled to fill `durationSec`. */
function scenesFromWeights(durationSec: number): DemoScene[] {
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
  return scenes;
}

/**
 * #763 — are these scene end-times usable? One per scene, strictly ascending,
 * each in (0, durationSec], so they can drive back-to-back, in-bounds scenes.
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
 * #763 — derive scenes from narration-aligned end-times: scene 0 starts at 0,
 * scene i ends at `ends[i]`, and the FINAL scene snaps to `durationSec` (float-safe)
 * so the timeline still ends exactly at the clip length.
 */
function scenesFromEndTimes(ends: number[], durationSec: number): DemoScene[] {
  const scenes: DemoScene[] = [];
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

// ── buildDemoTimeline ──────────────────────────────────────────────────────

/**
 * Build the deterministic demo timeline. Scenes tile [0, durationSec) back-to-back
 * with no gaps; the final scene ends exactly at durationSec. Numbers are sourced
 * verbatim from the spec's facts (those that carry a parseable number), capped.
 *
 * #763 — when `sceneEndTimesSec` is supplied (one ascending value per scene, last
 * ≈ durationSec) AND valid, scene boundaries DERIVE from the narration timing so
 * the screens follow the narrator. When absent or invalid, the existing
 * weight-tiling drives the scenes (the silent-cut fallback — unchanged).
 *
 * #777 — supplying `sceneEndTimesSec` ALSO marks the render as VOICED: the duration is
 * floored at MIN but NOT capped at MAX, so a real narration that runs past 90s keeps its
 * full length (captions + scenes stay synced to the audio). The silent cut stays [45,90].
 */
export function buildDemoTimeline(
  spec: ContentSpec,
  opts?: { durationSec?: number; fps?: number; sceneEndTimesSec?: number[] },
): DemoTimeline {
  // #777 — a VOICED render (real narration alignment supplied via sceneEndTimesSec) uses the
  // ACTUAL audio length: with 6 scenes the spoken narration can run past MAX_DEMO_SEC(90), so
  // capping it would truncate the voice and desync captions/scenes. The silent/free cut (no
  // sceneEndTimesSec) stays clamped to [45,90]. We detect "voiced" by a NON-EMPTY sceneEndTimesSec
  // (the real-synth signal); whether those values are *valid* is checked separately below to pick
  // narration-tiling vs the weight-tiling fallback.
  const voiced = !!opts?.sceneEndTimesSec && opts.sceneEndTimesSec.length > 0;
  // Hard-bound the duration to the launch window. Voiced → floor only (no 90s cap); else [45,90].
  const durationSec = clampDemoDurationSec(opts?.durationSec, { voiced });
  const fps = opts?.fps ?? 30;

  const scenes: DemoScene[] = validSceneEndTimes(opts?.sceneEndTimesSec, durationSec)
    ? scenesFromEndTimes(opts!.sceneEndTimesSec!, durationSec)
    : scenesFromWeights(durationSec);

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
