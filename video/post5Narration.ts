/**
 * Post #5 — narration for the three-role-model demo ("four AI subagents, nobody grades their own
 * homework"), as ORDERED SEGMENTS that map 1:1 to the 6 demo scenes. DISTINCT from Post #1's 4-way
 * comparison (`video/demoNarration.ts`), Post #2's builder story (`video/builderDemoNarration.ts`)
 * and Post #3's forge-harness story (`video/post3Narration.ts`).
 *
 * The 6 segments are the reviewed `video_script_scenes` (out/copy/three-role-model-post-content.json)
 * used VERBATIM — ELI5, Adam voice. Every number is a STRUCTURAL count from the public README
 * (mirrored in `inputs/threeRoleModelSpec.ts`). Brand-safe (MIT, public; no employer brand).
 *
 * Same single-space join convention as the other demos: segments are concatenated with a SINGLE
 * space so the per-character end-times array (one entry per character of the concatenated script)
 * lines up with the segment boundaries exactly — this is what lets the SCENE transitions follow the
 * narrator via the SHARED `narrationSceneEndTimes` algorithm (`video/demoTimeline.ts`).
 *
 * The DISPLAYED text (titles, role chips, CTA URL) comes from the timeline/spec, NOT this narration,
 * so the spoken "github dot com, slash ziyi-lam three nine nine nine, slash three dash role dash
 * model" and the displayed "github.com/ziyilam3999/three-role-model" never collide.
 */

import { type Post5SceneId } from "./post5Timeline";

/** One ordered narration segment, bound to the demo scene it narrates. */
export interface Post5NarrationSegment {
  sceneId: Post5SceneId;
  text: string;
}

/**
 * The ordered narration — one segment per scene, in scene order. The spoken script is
 * `post5NarrationScript()` (these joined by a single space). Text is VERBATIM from the reviewed
 * copy's `video_script_scenes`.
 */
export const POST5_NARRATION: Post5NarrationSegment[] = [
  {
    sceneId: "kitchen",
    text:
      "This is the three-role model — a way to build software with AI where four helpers each do one " +
      "job, and nobody checks their own work. Think of a kitchen: a head chef plans the dish, a taster " +
      "checks the plan, a cook makes it, and a food critic judges the result. The cook never rates their own plate.",
  },
  {
    sceneId: "problem",
    text:
      "Here's the problem it fixes. Most AI coding setups use one agent for everything. It plans the " +
      "work, does the work, then decides the work is done. It grades its own homework — and when it's " +
      "wrong, it's confidently wrong.",
  },
  {
    sceneId: "roles",
    text:
      "The three-role model splits that across four separate subagents. A planner decides what to do. A " +
      "plan-reviewer checks that plan. An executor does the work. And an execution-reviewer checks the " +
      "result. The reviewer is never the one who wrote the thing.",
  },
  {
    sceneId: "knobs",
    text:
      "Two simple dials shape each task. One picks how the work gets done — a test loop, one helper, " +
      "several in parallel, or inline. The other picks how it's checked — a real passing test, an " +
      "independent reviewer, or both. Whenever a real test exists, it wins.",
  },
  {
    sceneId: "enforced",
    text:
      "Here's the part that makes it stick. It's not a polite suggestion — it's enforced by code. Hooks " +
      "and a tamper-resistant ledger record which roles actually ran, tied to real transcripts. So " +
      "saying we followed the process is something you can prove, not just claim.",
  },
  {
    sceneId: "cta",
    text:
      "It's now a Claude Code plugin — two commands to install. Open source, MIT licensed, and early, so " +
      "feedback is welcome. Find it at github dot com, slash ziyi-lam three nine nine nine, slash three " +
      "dash role dash model.",
  },
];

/**
 * The spoken script: the ordered segments joined by a single space. This is the EXACT string sent to
 * the TTS provider — so a returned per-character end-times array (length === this string's length)
 * indexes 1:1 into it.
 */
export function post5NarrationScript(
  segments: Post5NarrationSegment[] = POST5_NARRATION,
): string {
  return segments.map((s) => s.text).join(" ");
}
