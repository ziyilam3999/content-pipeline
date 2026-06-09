/**
 * #763 — the demo narration, as ORDERED SEGMENTS that map 1:1 to the 5 demo
 * scenes (hook → compare → costsplit → verdict → cta).
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
      "lfah is a local-first agent that fixes real software bugs — test-first, on your own machine. " +
      "The headline: it resolves bugs at two dollars twenty-four cents each, and fifty-five percent less " +
      "total cost than a full-cloud relay — because the heavy work runs free, on a local model.",
  },
  {
    sceneId: "compare",
    text:
      "Here's the honest four-way picture, across thirteen real bugs. One-shot Opus resolves fifty-four " +
      "percent; Sonnet, forty-six. The full-cloud relay is the quality ceiling at seventy-seven percent — " +
      "but it's the priciest. lfah, the local-first hybrid, reaches sixty-two percent with cloud fallback, " +
      "at less than half the cost.",
  },
  {
    sceneId: "costsplit",
    text:
      "Where does the money go? The planner and evaluator run in the cloud. The executor — the heavy " +
      "lifter — runs locally, at zero dollars.",
  },
  {
    sceneId: "verdict",
    text:
      "So, honestly: need the highest resolve rate? Pay for the full-cloud relay. Want the best value — " +
      "strong results at half the cost, with a free local executor? lfah is the smart default.",
  },
  {
    sceneId: "cta",
    text: "lfah. Local-first. Honest by default.",
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
