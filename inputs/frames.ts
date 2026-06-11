/**
 * #824 — frame-ingest manifest + invariants (the typed bridge from a captured-screenshot
 * bundle into the demonstration timeline).
 *
 * A DEMONSTRATION post's hero is an ORDERED set of REAL captured PNGs (one per narrated step),
 * not a synthetic data-driven scene. This module is the typed, validated manifest for that
 * bundle plus the GATED invariants the category depends on:
 *
 *   - parity   — exactly one frame per narration segment (`validateFrameManifest` HARD-THROWS
 *                on N≠M, or on a missing/empty path), so a screen can never drift from its line.
 *   - brand    — `assertBrandClean` throws on any employer token in a caption/label.
 *   - fit      — `assertUiFrameFit` throws on `"cover"` (a real UI frame must `contain`, never
 *                crop terminal text); returns void on `"contain"`.
 *
 * Pure + React-free ON PURPOSE: `remotion/index.tsx` is outside the tsc/jest gate, so these
 * assertions live HERE (a gated dir) where jest exercises them — never buried only in `remotion/`.
 * The `demo-frames` composition reads `assertUiFrameFit` through the SAME shared const it asserts,
 * so the ungated view and the gated test cannot drift (plan review amendment #2).
 */

// ── Frame manifest ───────────────────────────────────────────────────────────

/** One captured frame, bound to the narration segment / scene it is held under. */
export interface FrameEntry {
  /** Absolute or cwd-relative path to the captured PNG. */
  path: string;
  /** Short human step label (e.g. "forge_plan → execution-plan.json"). Drawn as the annotation pill. */
  stepLabel: string;
  /**
   * Which narration segment / scene this frame is the hero for. The i-th frame is held under the
   * i-th narration segment; this is the explicit binding (mirrors `NarrationSegment.sceneId`).
   */
  narrationSegmentIndex: number;
}

/** The ordered frame manifest — N entries, one per narrated step, in scene order. */
export type FrameManifest = ReadonlyArray<FrameEntry>;

/**
 * The hero `<Img>` fit for a real UI frame. SHARED const SSOT: the `demo-frames` composition drives
 * its `<Img objectFit>` from `UI_FRAME_FIT`, and `assertUiFrameFit` checks the same value — so view
 * and the gated AC-5 test can't drift to different fits.
 */
export const UI_FRAME_FIT = "contain" as const;
export type UiFrameFit = "contain" | "cover";

// ── Invariant: parity (frame count == narration segment count) ───────────────

/**
 * #824 parity invariant — HARD-THROW unless the manifest has exactly one frame per narration
 * segment AND every frame carries a non-empty path. A count mismatch (N≠M) means a screen would
 * have no line or a line would have no screen — the exact scene↔frame drift this guard forbids.
 *
 * `segments` is any ordered narration (only `.length` is read), so it accepts the Post-#1
 * `NarrationSegment[]` or any `{ text }[]` the demo carries.
 */
export function validateFrameManifest(
  frames: FrameManifest,
  segments: ReadonlyArray<unknown>,
): void {
  if (frames.length !== segments.length) {
    throw new Error(
      `#824 frame↔narration parity violated: ${frames.length} frame(s) but ${segments.length} narration ` +
        `segment(s). Each narrated step needs exactly one captured frame (and vice-versa) so the hero ` +
        `screen never drifts from the spoken line.`,
    );
  }
  frames.forEach((f, i) => {
    if (typeof f.path !== "string" || f.path.trim().length === 0) {
      throw new Error(`#824 frame manifest: frame[${i}] has a missing/empty path.`);
    }
  });
}

// ── Invariant: brand-scrub ───────────────────────────────────────────────────

/**
 * Case-insensitive employer-brand denylist. NEVER allowed in any caption / label / step text.
 * The allowed tokens (`lfah`, `forge-harness`, `forge`, `slugify`, `SWE-bench`, `ziyilam3999`)
 * are brand-neutral and pass.
 */
const BRAND_DENYLIST = ["shopee", "sea limited", "garena"];

/**
 * #824 brand-scrub — THROW on any case-insensitive employer token in `text` (a caption, step
 * label, or annotation). The mechanical backstop for the privacy rule: a forbidden brand can
 * never reach an on-screen caption/label. Passes for the allowed neutral tokens.
 */
export function assertBrandClean(text: string): void {
  const lower = (text ?? "").toLowerCase();
  for (const banned of BRAND_DENYLIST) {
    if (lower.includes(banned)) {
      throw new Error(
        `#824 brand-scrub: forbidden employer token detected in on-screen text (matched "${banned}"). ` +
          `Captions/labels must be brand-clean.`,
      );
    }
  }
}

// ── Invariant: UI-frame fit (contain, never cover) ───────────────────────────

/**
 * #824 contain-not-cover — a real UI frame must be rendered `objectFit: "contain"` (shrink-to-fit
 * inside the tall frame, on a calm brand panel) so no terminal text is cropped. `"cover"`
 * (crop-to-fill) THROWS; `"contain"` returns void. The `demo-frames` hero `<Img>` reads
 * `UI_FRAME_FIT` (= "contain") and passes it through this same check, so the ungated view and the
 * gated test stay locked to one fit.
 */
export function assertUiFrameFit(fit: UiFrameFit): void {
  if (fit === "cover") {
    throw new Error(
      `#824 contain-not-cover: a real UI frame must use objectFit "contain" (never "cover"). ` +
        `"cover" crop-fills the frame and would chop off terminal text. Use a calm brand panel + contain.`,
    );
  }
}
