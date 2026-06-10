/**
 * #799 — narration for the BUILDER demo ("lfah builds an app, test-first"), as
 * ORDERED SEGMENTS that map 1:1 to the 8 builder scenes. Post #2's demo — DISTINCT
 * from Post #1's 4-way comparison (`video/demoNarration.ts`).
 *
 * The 8 segments are the script's `video_script_scenes` (out/copy/lfah-post2-builder-content.json)
 * used VERBATIM, with ONE brand-voice substitution: the displayed/written name is "lfah" but it is
 * PRONOUNCED "alpha" (lfah CONTRIBUTING.md "Brand voice"), so the SPOKEN script writes "alpha" where
 * the TTS would otherwise spell out the acronym. The DISPLAYED text (titles, captions, CTA) stays
 * "lfah" — those come from the builder timeline/spec, not this narration, so the two never collide.
 *
 * The same single-space join convention as `video/demoNarration.ts`: segments are concatenated with
 * a SINGLE space so the per-character end-times array (one entry per character of the concatenated
 * script) lines up with the segment boundaries exactly — this is what lets the SCENE transitions
 * follow the narrator via the SHARED `narrationSceneEndTimes` algorithm (`video/demoTimeline.ts`).
 *
 * Brand-safe (no employer brand). Numbers are the public dogfood facts
 * (`.ai-workspace/LFAH-BUILDER-DOGFOOD-METRICS.json`), mirrored in `inputs/builderSpec.ts`.
 */

import { type BuilderSceneId } from "./builderDemoTimeline";

/** One ordered narration segment, bound to the builder scene it narrates. */
export interface BuilderNarrationSegment {
  sceneId: BuilderSceneId;
  text: string;
}

/**
 * The ordered narration — one segment per builder scene, in scene order. The
 * spoken script is `builderNarrationScript()` (these joined by a single space).
 *
 * Each `text` is the corresponding entry of `video_script_scenes` VERBATIM,
 * except the very first sentence, which voices the displayed name "lfah" as its
 * pronunciation "Alpha" (brand voice) — the script's own opener already does this
 * ("say it 'alpha'"), so we keep that exact intent for the TTS.
 */
export const BUILDER_NARRATION: BuilderNarrationSegment[] = [
  {
    sceneId: "intro",
    text:
      "This is Alpha — short for local-first agent harness. Last week, it fixed real bugs cheaply. " +
      "But it does something bigger: it builds whole apps, from scratch, test-first.",
  },
  {
    sceneId: "testfirst",
    text:
      "It doesn't free-style code. Every feature starts life as a failing test — a plain-English goal, " +
      "plus a test that's only true when the feature actually works. The test is both the spec and the proof.",
  },
  {
    sceneId: "red",
    text:
      "You hand it a list of phases. It scaffolds an empty project and drops in the first failing test. " +
      "Red — there's no code yet.",
  },
  {
    sceneId: "green",
    text:
      "Then a local model, running free on your own machine, writes code until the project's real test " +
      "suite goes green. Not an LLM judge guessing — the actual test runner: jest, or pytest.",
  },
  {
    sceneId: "gate",
    text:
      "A phase ships only when the test is green AND an independent reviewer agrees. Then it commits and " +
      "moves on. If a phase can't go green, the build halts — so you never stack features on a broken one.",
  },
  {
    sceneId: "dogfood",
    text:
      "We pointed it at a real job: build the very pipeline that produced this video — the copy, the cards, " +
      "the render. Thirteen phases. Every single one shipped.",
  },
  {
    sceneId: "numbers",
    text:
      "All thirteen green. Eleven on the first try. Twelve dollars and fifty-six cents in total cloud cost — " +
      "and about eighty-five percent of the phases were solved by the free local model. The cloud only stepped " +
      "in to rescue the two hardest.",
  },
  {
    sceneId: "cta",
    text:
      "Your tests are the spec and the proof. This is local-first, pointed at greenfield. Try it — pip install " +
      "local-first agent harness, then alpha build.",
  },
];

/**
 * The spoken script: the ordered segments joined by a single space. This is the
 * EXACT string sent to the TTS provider — so a returned per-character end-times
 * array (length === this string's length) indexes 1:1 into it.
 */
export function builderNarrationScript(
  segments: BuilderNarrationSegment[] = BUILDER_NARRATION,
): string {
  return segments.map((s) => s.text).join(" ");
}
