/**
 * #871 forge-demo VOICED — the narration SSOT (`video/forgeNarration.ts`).
 *
 * Pins the forge-specific twist over the fable narration: TEN captured beats, but only NINE spoken
 * segments (the beat-5 transition is silent). Proves the derived narration drops exactly that beat,
 * stays beat-ordered, single-sources the text from `FORGE_VO_LINES`, and joins into a script the
 * timeline/caption builders consume 1:1.
 */

import { FORGE_NARRATION, forgeNarrationScript, forgeCaptionDisplayText } from "../forgeNarration";
import { FORGE_BEATS, FORGE_VO_LINES } from "../forgeStoryboard";

describe("#871 forgeNarration — derived from the storyboard, transition dropped", () => {
  it("has one segment per NARRATED beat (the silent transition is skipped)", () => {
    const spokenCount = FORGE_VO_LINES.filter((l) => l.trim().length > 0).length;
    expect(FORGE_NARRATION.length).toBe(spokenCount);
    expect(FORGE_NARRATION.length).toBe(9); // 10 beats − 1 silent transition
  });

  it("excludes the silent transition beat (beat 5) and keeps every other beat, in order", () => {
    const beats = FORGE_NARRATION.map((s) => s.beat);
    expect(beats).toEqual([1, 2, 3, 4, 6, 7, 8, 9, 10]);
    expect(beats).not.toContain(5);
  });

  it("carries each beat's kind + clipSec verbatim from the storyboard (single-sourced)", () => {
    for (const seg of FORGE_NARRATION) {
      const beat = FORGE_BEATS.find((b) => b.n === seg.beat)!;
      expect(seg.kind).toBe(beat.kind);
      expect(seg.clipSec).toBe(beat.clipSec);
      expect(seg.text).toBe(FORGE_VO_LINES[beat.n - 1].trim());
      expect(seg.text.length).toBeGreaterThan(0);
    }
  });
});

describe("#871 forgeNarration — script + caption-display helpers", () => {
  it("forgeNarrationScript joins the segment texts with a single space", () => {
    const script = forgeNarrationScript();
    expect(script).toBe(FORGE_NARRATION.map((s) => s.text).join(" "));
    // length == sum(text lengths) + (n-1) separators — the invariant narrationSceneEndTimes relies on.
    const expectedLen = FORGE_NARRATION.reduce((a, s) => a + s.text.length, 0) + (FORGE_NARRATION.length - 1);
    expect(script.length).toBe(expectedLen);
  });

  it("forgeCaptionDisplayText is an identity passthrough (no spoken≠displayed token in forge lines)", () => {
    for (const seg of FORGE_NARRATION) {
      expect(forgeCaptionDisplayText(seg.text)).toBe(seg.text);
    }
    expect(forgeCaptionDisplayText("any chunk")).toBe("any chunk");
  });

  it("every non-empty FORGE_VO_LINES entry surfaces in the script (no spoken line dropped)", () => {
    const script = forgeNarrationScript();
    for (const line of FORGE_VO_LINES) {
      if (line.trim().length === 0) continue;
      expect(script).toContain(line.trim());
    }
  });
});
