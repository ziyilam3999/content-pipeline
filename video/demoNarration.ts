/**
 * #763 — the demo narration, as ORDERED SEGMENTS that map 1:1 to the 6 demo
 * scenes (hook → pipeline → compare → costsplit → verdict → cta). #780 added the
 * `pipeline` segment (the lfah FLOW DIAGRAM scene) as the 2nd entry.
 *
 * Productizes what used to live in the one-off `tmp/produce-narrated-demo.ts`.
 * The concatenation (segments joined by a single space) is the spoken script
 * that gets sent to the TTS provider; the per-segment split is what lets the
 * SCENE transitions follow the narrator (see `narrationSceneEndTimes` in
 * `video/demoTimeline.ts`) instead of a fixed weight-tiling timer.
 *
 * Brand-safe (no employer brand). The copy is honest: it concedes the
 * full-cloud relay's 77% quality ceiling and recommends lfah on VALUE. Numbers
 * are the public lfah README facts (mirrored in `smoke/lfahSpec.ts`).
 *
 * Brand voice (lfah CONTRIBUTING.md "Brand voice"): "lfah" is PRONOUNCED "alpha",
 * so the SPOKEN script below writes the name as `Alpha` — the TTS voices "alpha".
 * The DISPLAYED text (titles, captions, the cta) stays `lfah`; those come from the
 * spec (`smoke/lfahSpec.ts`), NOT this narration, so the two never collide. The
 * intro EXPANDS the name ("short for local-first-agent-harness") and then leads
 * with the with-vs-without hook before any numbers — that is the required opening.
 *
 * Join convention: segments are concatenated with a SINGLE space — the same
 * single-space word-join `video/captions.ts` uses — so the per-character
 * end-times array (one entry per character of the concatenated script) lines up
 * with the segment boundaries exactly.
 */

import { type SceneId } from "./demoTimeline";

/** One ordered narration segment, bound to the scene it narrates. */
export interface NarrationSegment {
  sceneId: SceneId;
  text: string;
}

/**
 * The ordered narration — one segment per scene, in scene order. The spoken
 * script is `narrationScript()` (these joined by a single space).
 */
export const DEMO_NARRATION: NarrationSegment[] = [
  {
    sceneId: "hook",
    text:
      "Meet Alpha — short for local-first-agent-harness — an AI helper that fixes real software bugs, " +
      "test-first, right on your own machine. Why does that matter? Without it, every bug fix burns pricey " +
      "cloud tokens on a single blind guess. With Alpha, the heavy work runs free on a local model, and it " +
      "only calls the cloud when it's truly stuck. The headline: it fixes bugs at two dollars twenty-four " +
      "cents each — fifty-five percent less total cost than a full-cloud relay.",
  },
  {
    sceneId: "pipeline",
    text:
      "Here's the loop. A cloud planner writes the plan. Then the executor — running free, right on " +
      "your own machine — makes the fix. A cloud grader checks it against real tests. And only when the " +
      "local model gets stuck does it call the cloud for backup.",
  },
  {
    sceneId: "compare",
    text:
      "Here's the honest four-way picture, across thirteen real bugs. One-shot Opus fixes fifty-four " +
      "percent; Sonnet, forty-six. The full-cloud relay is the quality ceiling at seventy-seven percent — " +
      "but it's the priciest. Alpha, the local-first hybrid, reaches sixty-two percent with cloud fallback, " +
      "at less than half the cost.",
  },
  {
    sceneId: "costsplit",
    text:
      "Where does the money go? The planner and the grader run in the cloud. The executor — the part that " +
      "actually edits your code — runs locally, at zero dollars.",
  },
  {
    sceneId: "verdict",
    text:
      "So, honestly: need the highest fix rate? Pay for the full-cloud relay. Want the best value — strong " +
      "results at under half the cost, with a free local helper doing the heavy lifting? Alpha is the smart default.",
  },
  {
    sceneId: "cta",
    text: "Alpha. Local-first. Honest by default.",
  },
];

/**
 * The spoken script: the ordered segments joined by a single space. This is the
 * EXACT string sent to the TTS provider — so a returned per-character end-times
 * array (length === this string's length) indexes 1:1 into it.
 */
export function narrationScript(segments: NarrationSegment[] = DEMO_NARRATION): string {
  return segments.map((s) => s.text).join(" ");
}
