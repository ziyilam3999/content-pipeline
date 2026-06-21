/**
 * #1096a — PAID-PREVIEW-BEFORE-LOCK gate.
 *
 * The free `say` proxy reads at a DIFFERENT pace than the paid ElevenLabs Adam voice, so timing
 * validated on the proxy can pass while the FIRST real paid render fails the dead-air gate — exactly
 * what bit the kanban cut. This gate REFUSES (not nudges) the full PAID VO render until a cheap PAID
 * audio-only PREVIEW has been produced AND has passed the dead-air / silence gate for the CURRENT
 * narration script.
 *
 * The preview run (`KANBAN_VOICE_PAID=1 KANBAN_VOICE_PREVIEW=1 npm run voice:kanban`) synthesizes the
 * real voice, runs the silence gate on it audio-only (no remotion video render), and writes a small
 * record here; the FULL paid render reads it and refuses to proceed unless it is present, paid, for
 * THIS script, and dead-air-clean. The record also caches the real per-segment MEASURED spoken lengths
 * — the input to `fitBeatsToVo` (#1095) — so the operator pays for the measure ONCE and re-fits free.
 *
 * The gate check is PURE (unit-tested both-ends from a fixture; no paid call, no ffmpeg, no I/O); only
 * the read/write helpers touch disk.
 */
import * as fs from "fs";

export interface VoPreviewRecord {
  /** The exact narration script the preview was synthesized from — the staleness key. */
  script: string;
  /** The cheap paid AUDIO-ONLY preview passed the dead-air (silence-gap) gate. */
  deadAirPass: boolean;
  /** The worst internal silence gap measured on the preview audio (seconds) — for the log / error. */
  worstGapSec: number;
  /** Real measured spoken length per NARRATED beat (the #1095 fit-beats-to-VO input). */
  measuredSpokenSec: Record<number, number>;
  /** true ⇒ produced by a real PAID synth (a free-mock preview can NOT unlock the paid render). */
  paid: boolean;
  createdAt: string;
}

/**
 * REFUSE-gate (#1096a). Throws unless an APPROVED paid preview exists for THIS script. Both-ends:
 *  - null / missing            → throws (blocked — no preview ran)
 *  - not a real paid synth     → throws (a free-mock pace can't certify the paid render)
 *  - synthesized from a different script → throws (stale — re-preview the current narration)
 *  - failed the dead-air gate  → throws (re-time the spine, fit beats to VO, re-preview)
 *  - approved + paid + matching + dead-air-clean → returns (the full paid render proceeds)
 */
export function assertPreviewApprovedForLock(preview: VoPreviewRecord | null | undefined, script: string): void {
  if (!preview) {
    throw new Error(
      "#1096a paid-preview gate: BLOCKED — no audio-only preview found. Run the cheap paid preview first " +
        "(KANBAN_VOICE_PAID=1 KANBAN_VOICE_PREVIEW=1 npm run voice:kanban) so the REAL voice is dead-air-checked " +
        "BEFORE the full paid render.",
    );
  }
  if (!preview.paid) {
    throw new Error(
      "#1096a paid-preview gate: BLOCKED — the preview was not a real PAID synth (the free mock/`say` pace ≠ the " +
        "paid Adam pace, so it can't certify the paid timing). Re-run the preview with KANBAN_VOICE_PAID=1.",
    );
  }
  if (preview.script !== script) {
    throw new Error(
      "#1096a paid-preview gate: BLOCKED — the approved preview was synthesized from a DIFFERENT narration script. " +
        "Re-run the preview for the current narration before the full paid render.",
    );
  }
  if (preview.deadAirPass !== true) {
    throw new Error(
      `#1096a paid-preview gate: BLOCKED — the preview FAILED the dead-air gate (worst internal gap ` +
        `${preview.worstGapSec.toFixed(2)}s). Fit the beats to the measured VO (fitBeatsToVo) + re-lock the spine, ` +
        `then re-preview before the full paid render.`,
    );
  }
}

/** Read a preview record from disk; null if missing / unparseable. */
export function readPreviewRecord(filePath: string): VoPreviewRecord | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const j = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (typeof j?.script !== "string") return null;
    return j as VoPreviewRecord;
  } catch {
    return null;
  }
}

/** Write a preview record (the paid audio-only preview's result + cached measured lengths). */
export function writePreviewRecord(filePath: string, rec: VoPreviewRecord): void {
  fs.writeFileSync(filePath, JSON.stringify(rec, null, 2) + "\n", "utf8");
}
