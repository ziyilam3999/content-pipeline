/**
 * #824 Fable VOICED — the 8-beat Adam narration, as ORDERED SEGMENTS that map 1:1 to the
 * 8 captured beats (hook → chat → tool → transition → card → video → payoff → cta).
 *
 * This is the spoken twin of the captured storyboard in `tools/captureFable.ts`. Each segment's
 * spoken length re-times its captured beat clip (see `tools/voiceFable.ts`), so the footage holds
 * for exactly as long as its narration line — real audio alignment drives the timing
 * (feedback_real_audio_alignment_drives_all_timed_visual_tracks).
 *
 * The operator-shown 8-line script is preserved in MEANING; the wording is expanded only to FIT
 * each beat's target duration so the whole runs ~85s of Adam speech (the approved silent cut's
 * length). Brand-clean (no employer brand).
 *
 * Brand voice (lfah CONTRIBUTING.md): "lfah" is PRONOUNCED "alpha", so the SPOKEN script writes the
 * name as `Alpha` — the Adam voice then says "alpha". The DISPLAYED captions substitute it back to
 * `lfah` (see `fableCaptionDisplayText`) so the on-screen caption matches the chat bubble in the
 * captured footage (which shows `lfah`). Same displayed=lfah / spoken=Alpha split the #763 demo uses.
 *
 * Join convention: segments are concatenated with a SINGLE space — the same single-space word-join
 * `video/captions.ts` uses — so the per-character end-times array (one entry per character of the
 * concatenated script) lines up with the segment boundaries exactly (`narrationSceneEndTimes`).
 */

/** One ordered narration segment, bound to the 1-based beat it narrates. */
export interface FableNarrationSegment {
  /** 1-based beat number (matches `FABLE_BEATS[n]`). */
  beat: number;
  /** Short beat name (for logs / the sync bundle). */
  kind: string;
  /** The spoken line — `Alpha` spelled so the voice pronounces "alpha". */
  text: string;
}

/** The ordered Adam narration — one segment per captured beat, in beat order. */
export const FABLE_NARRATION: ReadonlyArray<FableNarrationSegment> = [
  {
    beat: 1,
    kind: "hook",
    text: "This tool has no buttons. No menus, no dashboard. And that is the point — because you are not the one using it.",
  },
  {
    beat: 2,
    kind: "chat",
    text:
      "You just ask, in plain English. You say: build me a launch post about Alpha — the copy, a card, and a video. " +
      "No commands to memorize. You simply talk, and it gets to work.",
  },
  {
    beat: 3,
    kind: "tool",
    text:
      "Behind the scenes, Claude Code drives content-pipeline for you. This is the agent's interface — not yours. " +
      "It runs the real producers, streams the logs, and turns your one sentence into finished, ready-to-ship assets, all on its own.",
  },
  {
    beat: 4,
    kind: "transition",
    text: "And then — out comes the real thing.",
  },
  {
    beat: 5,
    kind: "card",
    text:
      "Here is the card it made. Real numbers, a real layout, pulled straight from the project. " +
      "Nothing faked, nothing placeholder — it is polished and ready to post the moment it lands.",
  },
  {
    beat: 6,
    kind: "video",
    text:
      "And here is the video — fully rendered, captioned, and timed to a real voiceover. " +
      "The same plain-English request you typed became a finished, shareable clip. " +
      "You could publish it right now, without ever touching a single setting.",
  },
  {
    beat: 7,
    kind: "payoff",
    text:
      "So that is the whole idea. You spoke, and the agent built. There were no buttons to find, no menus to learn — " +
      "just a request, and a finished result waiting for you.",
  },
  {
    beat: 8,
    kind: "cta",
    text:
      "content-pipeline. It is open-source, MIT licensed, and free to use. " +
      "If you want an agent that builds while you just talk, the link is below.",
  },
];

/**
 * The spoken script: the ordered segments joined by a single space. This is the EXACT string sent
 * to the TTS provider — so a returned per-character end-times array (length === this string's
 * length) indexes 1:1 into it.
 */
export function fableNarrationScript(
  segments: ReadonlyArray<{ text: string }> = FABLE_NARRATION,
): string {
  return segments.map((s) => s.text).join(" ");
}

/**
 * Displayed-caption text: substitute the spoken `Alpha` back to the DISPLAYED `lfah` so an
 * on-screen caption matches the chat bubble in the captured footage. Word-boundary, case-sensitive
 * on the capitalized spoken token only (never touches ordinary words). Pure.
 */
export function fableCaptionDisplayText(spokenChunk: string): string {
  return spokenChunk.replace(/\bAlpha\b/g, "lfah");
}
