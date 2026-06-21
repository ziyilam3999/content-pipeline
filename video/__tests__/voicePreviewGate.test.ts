/**
 * #1096a — paid-preview-before-lock gate. PURE both-ends test (no paid call, no ffmpeg, no disk):
 * the full paid VO render is BLOCKED without an approved preview and PROCEEDS with one.
 */
import { assertPreviewApprovedForLock, type VoPreviewRecord } from "../voicePreviewGate";

const SCRIPT = "Your AI agent plans, codes, and reviews its own work. agent-kanban — open-source, MIT.";

function approved(overrides: Partial<VoPreviewRecord> = {}): VoPreviewRecord {
  return {
    script: SCRIPT,
    deadAirPass: true,
    worstGapSec: 0.9,
    measuredSpokenSec: { 1: 6.3, 2: 5.5, 3: 7.9, 5: 8.3, 6: 5.4, 7: 11.0, 8: 14.2, 9: 7.4, 10: 3.6 },
    paid: true,
    createdAt: "2026-06-21T00:00:00.000Z",
    ...overrides,
  };
}

describe("assertPreviewApprovedForLock (#1096a paid-preview-before-lock)", () => {
  it("PROCEEDS: an approved, paid, matching, dead-air-clean preview does NOT throw", () => {
    expect(() => assertPreviewApprovedForLock(approved(), SCRIPT)).not.toThrow();
  });

  it("BLOCKS: no preview at all (null) → refuses the full paid render", () => {
    expect(() => assertPreviewApprovedForLock(null, SCRIPT)).toThrow(/BLOCKED — no audio-only preview/);
  });

  it("BLOCKS: a free-mock (non-paid) preview can NOT certify the paid timing", () => {
    expect(() => assertPreviewApprovedForLock(approved({ paid: false }), SCRIPT)).toThrow(/not a real PAID synth/);
  });

  it("BLOCKS: a preview for a DIFFERENT script is stale → refuses", () => {
    expect(() => assertPreviewApprovedForLock(approved(), "a different narration")).toThrow(/DIFFERENT narration script/);
  });

  it("BLOCKS: a preview that FAILED the dead-air gate → refuses (re-time the spine first)", () => {
    expect(() => assertPreviewApprovedForLock(approved({ deadAirPass: false, worstGapSec: 5.76 }), SCRIPT)).toThrow(
      /FAILED the dead-air gate \(worst internal gap 5\.76s\)/,
    );
  });
});
