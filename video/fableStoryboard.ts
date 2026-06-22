/**
 * #824 Fable — the storyboard SSOT (the 8-beat plan + the two visually-distinct world colors +
 * the OS-owner-leak detector), lifted out of `tools/captureFable.ts` so it can be shared WITHOUT a
 * circular import.
 *
 * Why this module exists (#870): the demonstration-category recipe contract (`video/demoCategoryRecipe.ts`)
 * re-expresses this storyboard as a `DemoVideoSpec` and is itself wired INTO `captureFable`'s pre-flight.
 * If the recipe imported `FABLE_BEATS` from `captureFable` while `captureFable` imported the validator
 * from the recipe, the two modules would form a load-time cycle (the recipe builds `fableSpec` at module
 * top-level, so it would read an undefined `FABLE_BEATS` when `captureFable` is the entry). Keeping the
 * pure storyboard data here — depended on by BOTH, depending on NEITHER — breaks the cycle cleanly.
 *
 * `tools/captureFable.ts` re-exports every symbol here for backward compatibility, so existing imports
 * (`import { FABLE_BEATS, FableBeat, ownerLeak, BG_TOOL, BG_OUTPUT_A } from "../captureFable"`) keep working.
 */

// ── The two VISUALLY DISTINCT worlds (the core of the agent-interface reframe) ─────────────────────
// #1156 — the world background VALUES now live in the brand SSOT (video/brandTokens.ts) so the future
// thumbnail (#1157) + every renderer import ONE source. Re-exported here so the existing importers
// (capture tools + storyboards, via tools/captureFable.ts re-export) keep working unchanged.
//   BG_TOOL    — THE TOOL: dark navy, teal accent (terminal / hook / payoff / cta).
//   BG_OUTPUT_A — THE OUTPUT: light warm cream (unmistakably different from the dark tool world).
//   BG_OUTPUT_B — deeper sand (cream gradient end).
//   BG_CHAT    — THE HUMAN's chat surface: warm clay, distinct from both tool and output.
export { BG_TOOL, BG_OUTPUT_A, BG_OUTPUT_B, BG_CHAT } from "./brandTokens";

// ── The 8-beat storyboard (the approved REVISED ~90s spine) ────────────────────────────────────────

export type BeatKind = "title" | "chat" | "terminal" | "transition" | "viewer-card" | "viewer-video";

export interface FableBeat {
  /** 1-based beat number. */
  n: number;
  kind: BeatKind;
  /** On-screen lower-third / label (brand-clean, owner-clean). "" for pure title beats. */
  stepLabel: string;
  /** REAL commands streamed live (terminal beats only); [] otherwise. */
  commands: string[];
  /** Target rough-cut clip length (seconds). */
  clipSec: number;
  /** Title beats — the big headline + optional subtext + optional url (CTA). */
  headline?: string;
  sub?: string;
  url?: string;
  /** Chat beat — the genuine natural-language request the human types. */
  chatRequest?: string;
}

export const FABLE_BEATS: ReadonlyArray<FableBeat> = [
  // 1 — HOOK. Clean title on the tool/neutral world.
  { n: 1, kind: "title", stepLabel: "", commands: [], clipSec: 6,
    headline: "This tool has no buttons.", sub: "Because you're not the one using it." },
  // 2 — CHAT. The HUMAN's interface: plain English to Claude Code. Honest chat-surface reconstruction.
  { n: 2, kind: "chat", stepLabel: "you → Claude Code · plain English", commands: [], clipSec: 12,
    chatRequest: "Build me a launch post about lfah — copy, a card, and a video." },
  // 3 — TOOL. The agent's interface runs for real (FREE producers → the real hero card + MP4).
  { n: 3, kind: "terminal", stepLabel: "content-pipeline — the agent's interface, not yours", clipSec: 15,
    commands: ["IMAGE_SMOKE_ASPECT=9:16 npm run smoke:image", "npm run smoke:demo"] },
  // 4 — TRANSITION. Explicit animated handoff: the output emerges from the tool, bg wipes tool → output.
  { n: 4, kind: "transition", stepLabel: "", commands: [], clipSec: 3 },
  // 5 — OUTPUT (card). Real produced card, FRAMED on the DISTINCT light output bg.
  { n: 5, kind: "viewer-card", stepLabel: "the output", commands: [], clipSec: 12 },
  // 6 — OUTPUT (video). Real produced MP4 playing, FRAMED on the DISTINCT light output bg.
  { n: 6, kind: "viewer-video", stepLabel: "the output", commands: [], clipSec: 15 },
  // 7 — PAYOFF. Recap the reframe.
  { n: 7, kind: "title", stepLabel: "", commands: [], clipSec: 12,
    headline: "You spoke. The agent built.", sub: "No UI to learn." },
  // 8 — CTA.
  { n: 8, kind: "title", stepLabel: "", commands: [], clipSec: 10,
    headline: "content-pipeline", sub: "open-source · MIT", url: "github.com/ziyilam3999/content-pipeline" },
];

// ── Owner/username-leak detector (the OS login name must never reach a public capture frame) ──────
// Mirrors the shipped #824 detector in tools/__tests__/captureTape.test.ts so beat commands stay clean.

/** True if an `ls` invocation's flags would print the owner column (long-format with no `-g`/`-o`). */
function lsShowsOwner(cmd: string): boolean {
  if (!/(^|[\s;&|])ls(\s|$)/.test(cmd)) return false;
  const clusters = (cmd.match(/(^|\s)-{1,2}[A-Za-z]+/g) ?? []).map((s) => s.trim().replace(/^-+/, ""));
  const longFormat = clusters.some((c) => c.includes("l"));
  const ownerSuppressed = clusters.some((c) => c.includes("g") || c.includes("o"));
  return longFormat && !ownerSuppressed;
}

const OWNER_LEAK_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "whoami", re: /(^|[\s;&|])whoami(\s|$|[;&|])/i },
  { name: "id (resolves uid/gid -> username)", re: /(^|[\s;&|])id(\s|$|[;&|])/i },
  { name: "stat with owner format (%Su/%u/%U)", re: /\bstat\b[^|]*%-?\d*\.?\d*S?[uU]\b/i },
  { name: "literal /Users/<name> path", re: /\/Users\/[^/\s"']+/i },
];

/** Returns the matched leak-rule name, or null if the command is owner-clean. */
export function ownerLeak(cmd: string): string | null {
  if (lsShowsOwner(cmd)) return "ls long-format (owner column)";
  for (const p of OWNER_LEAK_PATTERNS) if (p.re.test(cmd)) return p.name;
  return null;
}
