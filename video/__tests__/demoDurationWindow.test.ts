/**
 * #808 RULE 3 — the ~90s acceptance-window guard.
 *
 * Proves (both-ends): the real ~90/99s voiced cut PASSES the window assertion, while a 40s under-bake
 * and a 130s over-run FAIL it. The window comes from the config SSOT — a future config drift moves
 * the gate, not a magic number. Also proves the VOICED clamp does NOT truncate the ~99s cut.
 */

import {
  assertDemoDurationInWindow,
  clampDemoDurationSec,
  DEMO_DURATION_TARGET_SEC,
  DEMO_ACCEPTANCE_MIN_SEC,
  DEMO_ACCEPTANCE_MAX_SEC,
} from "../demoTimeline";
import { CONFIG } from "../../config";

const VOICED_CUT_SEC = 99.18; // the confirmed Post #2 voiced length

describe("#808 demo duration acceptance window", () => {
  it("window constants come from the config SSOT", () => {
    expect(DEMO_DURATION_TARGET_SEC).toBe(CONFIG.demo.durationTargetSec);
    expect(DEMO_ACCEPTANCE_MIN_SEC).toBe(CONFIG.demo.durationAcceptanceMinSec);
    expect(DEMO_ACCEPTANCE_MAX_SEC).toBe(CONFIG.demo.durationAcceptanceMaxSec);
  });

  it("PASSES the ~90s target and the real ~99s voiced cut", () => {
    expect(() => assertDemoDurationInWindow(90)).not.toThrow();
    expect(() => assertDemoDurationInWindow(VOICED_CUT_SEC)).not.toThrow();
    expect(() => assertDemoDurationInWindow(DEMO_ACCEPTANCE_MIN_SEC)).not.toThrow(); // inclusive
    expect(() => assertDemoDurationInWindow(DEMO_ACCEPTANCE_MAX_SEC)).not.toThrow(); // inclusive
  });

  it("FAILS a 40s under-bake (the old truncation-class drift)", () => {
    expect(() => assertDemoDurationInWindow(40)).toThrow(/acceptance window/i);
  });

  it("FAILS a 130s over-run", () => {
    expect(() => assertDemoDurationInWindow(130)).toThrow(/acceptance window/i);
  });

  it("FAILS non-finite durations (NaN/Infinity) — never a silent pass", () => {
    expect(() => assertDemoDurationInWindow(NaN)).toThrow();
    expect(() => assertDemoDurationInWindow(Infinity)).toThrow();
  });

  it("does NOT truncate the voiced ~99s cut — the clamp keeps the full length (floor-only)", () => {
    const clamped = clampDemoDurationSec(VOICED_CUT_SEC, { voiced: true });
    expect(clamped).toBeCloseTo(VOICED_CUT_SEC, 5); // unchanged — no 90s cap applied in voiced mode
    // and that un-truncated length still lands in the acceptance window
    expect(() => assertDemoDurationInWindow(clamped)).not.toThrow();
  });
});
