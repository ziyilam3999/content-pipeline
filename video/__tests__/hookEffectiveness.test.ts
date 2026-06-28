/**
 * #1149 — BOTH-ENDS oracle for the pure HOOK-EFFECTIVENESS core (`video/hookEffectiveness.ts`).
 *
 * The core splits the #1239 framing rule into two independently-testable halves:
 *   • FLAG (`flagToolCentricOpener`) — the "watch an AI X" / tool-process anti-pattern (AC1).
 *   • REQUIRE (`isResultFirstHook`) — the opener leads with a result/number or who-we-help + benefit (AC2).
 *   • composed (`assertResultFirstHook`) — FLAG-wins-precedence AND result-first (AC3).
 * Each AC is NON-VACUOUS: a vacuous/over-broad matcher fails the opposite-outcome sibling fixture.
 *
 * Pure functions over plain strings — NO Playwright / ffmpeg / network / paid call. All fixtures synthetic.
 */

import {
  flagToolCentricOpener,
  isResultFirstHook,
  assertResultFirstHook,
} from "../hookEffectiveness";

describe("#1149 AC1 — flagToolCentricOpener flags the anti-pattern (robust, not over-broad)", () => {
  test('"Watch an AI build your website." is flagged', () => {
    expect(flagToolCentricOpener("Watch an AI build your website.")).not.toBeNull();
  });

  test('"See the agent use the terminal." is flagged', () => {
    expect(flagToolCentricOpener("See the agent use the terminal.")).not.toBeNull();
  });

  test('"Check out this bot." is flagged', () => {
    expect(flagToolCentricOpener("Check out this bot.")).not.toBeNull();
  });

  test('"In this video I\'ll show you the tool." is flagged (process opener)', () => {
    expect(flagToolCentricOpener("In this video I'll show you the tool.")).not.toBeNull();
  });

  test('the result-first line containing "AI" is NOT flagged (no over-broad "contains AI")', () => {
    // Must NOT be flagged: contains "AI" but has no watch/process FRAME.
    expect(flagToolCentricOpener("This shop's AI assistant saved the owner 6 hours a week.")).toBeNull();
  });
});

describe("#1149 AC2 — isResultFirstHook requires a result-first opener", () => {
  test('"This bakery owner got back 6 hours a week." is result-first (figure + benefit verb)', () => {
    expect(isResultFirstHook("This bakery owner got back 6 hours a week.")).toBe(true);
  });

  test('"Local shops are saving about $400 a month." is result-first', () => {
    expect(isResultFirstHook("Local shops are saving about $400 a month.")).toBe(true);
  });

  test('"Let me walk you through the dashboard." is NOT result-first', () => {
    expect(isResultFirstHook("Let me walk you through the dashboard.")).toBe(false);
  });

  test('"In this clip we tour the product." is NOT result-first', () => {
    expect(isResultFirstHook("In this clip we tour the product.")).toBe(false);
  });
});

describe("#1149 AC3 — assertResultFirstHook composes FLAG (precedence) + REQUIRE", () => {
  test('THROWS for "Watch an AI use the terminal." (flagged)', () => {
    expect(() => assertResultFirstHook("Watch an AI use the terminal.", "test")).toThrow(/test:/);
  });

  test('THROWS for "Let me show you the new dashboard." (not result-first / process opener)', () => {
    expect(() => assertResultFirstHook("Let me show you the new dashboard.", "test")).toThrow(/test:/);
  });

  test('does NOT throw for "Local shops are saving 6 hours a week." (result-first, not flagged)', () => {
    expect(() => assertResultFirstHook("Local shops are saving 6 hours a week.", "test")).not.toThrow();
  });

  test('THROWS for "Watch an AI save you 6 hours." (FLAG precedence over the figure)', () => {
    // Carries "6 hours" but the watching frame is the anti-pattern — FLAG wins.
    expect(() => assertResultFirstHook("Watch an AI save you 6 hours.", "test")).toThrow(/anti-pattern/);
  });
});
