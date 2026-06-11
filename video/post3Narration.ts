/**
 * Post #3 — narration for the forge-harness demo ("only 1 of 8 talks to the model"), as ORDERED
 * SEGMENTS that map 1:1 to the 6 demo scenes. DISTINCT from Post #1's 4-way comparison
 * (`video/demoNarration.ts`) and Post #2's builder story (`video/builderDemoNarration.ts`).
 *
 * The 6 segments are the reviewed `video_script_scenes` (out/copy/forge-harness-post3-content.json)
 * used VERBATIM — ELI5, Adam voice. Numbers are the public README facts (mirrored in
 * `inputs/forgeHarnessSpec.ts`). Brand-safe (MIT, public; no employer brand).
 *
 * Same single-space join convention as the other demos: segments are concatenated with a SINGLE
 * space so the per-character end-times array (one entry per character of the concatenated script)
 * lines up with the segment boundaries exactly — this is what lets the SCENE transitions follow the
 * narrator via the SHARED `narrationSceneEndTimes` algorithm (`video/demoTimeline.ts`).
 *
 * The DISPLAYED text (titles, stat chips, CTA URL) comes from the timeline/spec, NOT this narration,
 * so the spoken "github dot com slash ziyilam three-nine-nine-nine slash forge dash harness" and the
 * displayed "github.com/ziyilam3999/forge-harness" never collide.
 */

import { type Post3SceneId } from "./post3Timeline";

/** One ordered narration segment, bound to the demo scene it narrates. */
export interface Post3NarrationSegment {
  sceneId: Post3SceneId;
  text: string;
}

/**
 * The ordered narration — one segment per scene, in scene order. The spoken script is
 * `post3NarrationScript()` (these joined by a single space). Text is VERBATIM from the reviewed
 * copy's `video_script_scenes`.
 */
export const POST3_NARRATION: Post3NarrationSegment[] = [
  {
    sceneId: "foreman",
    text:
      "This is forge-harness. Think of it as the foreman on a build site — it doesn't lay the bricks, " +
      "it tells the builder what to do next and checks the work. The harness coordinates; your coding agent does the actual building.",
  },
  {
    sceneId: "problem",
    text:
      "Here's the problem it fixes. Most AI coding helpers phone the big language model for every little thing — " +
      "which step is next, did this work, what now. Each call costs tokens, and the bill just keeps stacking up.",
  },
  {
    sceneId: "flip",
    text:
      "forge-harness flips that around. It has 8 building blocks. Seven of them are plain, predictable code that never " +
      "calls the model — they just read files and run commands. Only one block, the planning step, ever talks to the model.",
  },
  {
    sceneId: "receipt",
    text:
      "So what does that cost? On a real thirteen-story project, the whole thing ran 16 tool calls. Only 2 of them cost " +
      "tokens — both the planning step. That's eighty cents for the entire plan, about twenty cents a story.",
  },
  {
    sceneId: "determinism",
    text:
      "And it doesn't guess whether your work passed. The grading block runs the exact commands you wrote — your build, " +
      "your tests. If your test passes, the story passes. Same inputs, same answer, every single time. No model having a bad day.",
  },
  {
    sceneId: "cta",
    text:
      "It's eight blocks you can use one at a time or snap together. It's open source, MIT licensed, and early — so feedback " +
      "is welcome. Grab it at github dot com slash ziyilam three-nine-nine-nine slash forge dash harness.",
  },
];

/**
 * The spoken script: the ordered segments joined by a single space. This is the EXACT string sent to
 * the TTS provider — so a returned per-character end-times array (length === this string's length)
 * indexes 1:1 into it.
 */
export function post3NarrationScript(
  segments: Post3NarrationSegment[] = POST3_NARRATION,
): string {
  return segments.map((s) => s.text).join(" ");
}
