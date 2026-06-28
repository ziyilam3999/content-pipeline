/**
 * #1149 — HOOK EFFECTIVENESS: the pure, unit-testable core that flags the "Watch an AI X" tool-centric
 * anti-pattern and (for the proof arm) requires a RESULT-FIRST opener.
 *
 * Encodes the #1239 content-pivot framing rule — a video must open on the RESULT / proof, in plain
 * language, in 1–2 seconds; NEVER "watch an AI use a tool". Until now NO arm of `assertDemoCategoryRecipe`
 * inspected the hook TEXT (demo R2 / intro R14 / proof P1 are all STRUCTURE-only), so a hook beat that
 * reads "Watch an AI retype your orders." sailed through every arm. This module is the testable seam the
 * validator wires in.
 *
 * De-conflated into two independent halves (each separately testable):
 *   • FLAG (`flagToolCentricOpener`) — the watch/process anti-pattern. Keys on the watch/process FRAME,
 *     NEVER the bare token "AI", so a result-first line that merely contains "AI" is NOT flagged. Safe to
 *     apply across ALL arms (demo / intro / proof) — no false-positive on a reach-keyword intro hook.
 *   • REQUIRE (`isResultFirstHook`) — the opener leads with a result/number or a who-we-help + benefit.
 *     Scoped to the PROOF arm only (a reach-keyword intro hook legitimately is NOT result-first).
 *
 * Pure functions over a plain `string`: no I/O, no network, no dependency on beat shape.
 */

// ── FLAG matchers (the "watch an AI X" / tool-process anti-pattern) ──────────────────────────────────--

/**
 * A watch/see/witness verb whose object is the tool/agent itself. Catches "Watch an AI X", "See the agent
 * run", "Check out this bot", "Watch a tool build…". The char class between the verb and the tool noun is
 * `[\s\w'’]` (NO comma/punctuation), so a run broken by a comma — e.g. kanban's "see and trust every plan,
 * review, and verdict." — does NOT reach a tool noun, and the verb keys on a FRAME, never the bare "AI".
 */
const WATCH_THE_TOOL_RE =
  /\b(watch|see|witness|check\s+out|look\s+at)\b[\s\w'’]{0,24}\b(a\.?i\.?|bot|agent|llm|model|robot|tool|automation|machine)\b/i;

/**
 * A tool/process-centric framing opener at the START of the line. Catches "In this video…", "Today I'll
 * show…", "Let me show you…", "Here's how to use the tool…". `today` MUST be followed by the narrator
 * subject `i|we` (the earlier bare `today[, ]` over-flagged a legit result line like
 * "Today, this bakery saved 6 hours.").
 */
const PROCESS_OPENER_RE =
  /^\s*(in this (video|clip|demo)|today\s+(i|we)\b|let me (show|walk)|here'?s how (to|i|we)|i'?m going to show|let'?s (watch|look|see)|using\s+\w+\s+to)\b/i;

// ── REQUIRE matchers (the opener leads with a result) ────────────────────────────────────────────────--

/**
 * A concrete outcome FIGURE: hours / minutes / days / weeks / months / percent / multiplier / dollars.
 * Mirrors the existing `TIME_MONEY_RE` in the proof test.
 */
const FIGURE_RE = /\d+\s*(hours?|hrs?|h\b|minutes?|mins?|days?|weeks?|months?|%|percent|x\b)|\$\s?\d/i;

/**
 * A who-we-help + outcome-VERB shape. Catches "Local shops are saving…", "This owner got back…",
 * "freed up…", without needing a number. The lone token `back` is deliberately ABSENT (it under-enforced —
 * matched "back office" / "back end" with no outcome); "got back 6 hours" still matches via the verb `got`.
 */
const BENEFIT_RE =
  /\b(got|get|gain(?:ed|s)?|sav(?:e|ed|es|ing)|cut|doubl\w+|tripl\w+|earn\w*|free(?:d|s)?\s+up|reclaim\w*|won|boost\w*|grew)\b/i;

// ── The three exported pure functions ───────────────────────────────────────────────────────────────--

/**
 * Returns a human-readable REASON when the opener is the watching/tool/process anti-pattern, else `null`.
 * Keys on the watch/process FRAME, never the bare token "AI" — a result-first line that merely contains
 * "AI" (e.g. "This shop's AI assistant saved 6 hours") returns `null`.
 */
export function flagToolCentricOpener(text: string): string | null {
  if (typeof text !== "string" || text.length === 0) return null;
  if (WATCH_THE_TOOL_RE.test(text)) return "watch-the-tool";
  if (PROCESS_OPENER_RE.test(text)) return "tool-process opener";
  return null;
}

/**
 * `true` when the opener leads with a result — EITHER a concrete outcome figure (FIGURE_RE) OR a
 * who-we-help + outcome-verb shape (BENEFIT_RE).
 */
export function isResultFirstHook(text: string): boolean {
  if (typeof text !== "string" || text.length === 0) return false;
  return FIGURE_RE.test(text) || BENEFIT_RE.test(text);
}

/**
 * The composed gate. Throws `Error("<prefix>: …")` when the opener is flagged OR is not result-first; no-op
 * otherwise. The two conditions are ANDed (PASS = `!flagged && isResultFirstHook`), so the FLAG takes
 * precedence — "Watch an AI save you 6 hours" is rejected even though it carries a number, because the
 * watching frame is the anti-pattern. The message names which rule failed and quotes the offending opener.
 */
export function assertResultFirstHook(text: string, prefix: string): void {
  const reason = flagToolCentricOpener(text);
  if (reason) {
    throw new Error(
      `${prefix}: hook text "${text}" is the "${reason}" anti-pattern — open on the RESULT, not "watch an AI".`,
    );
  }
  if (!isResultFirstHook(text)) {
    throw new Error(
      `${prefix}: hook text "${text}" does not lead with a result — open on a concrete outcome (a number, ` +
        `or who-we-help + benefit), per the proof-first framing rule.`,
    );
  }
}
