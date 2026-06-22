/**
 * #1120 agent-kanban demo — the v2 storyboard SSOT ("Your agents, finally legible").
 *
 * A FROM-SCRATCH redesign (NOT a patch of the old #1063/#1091 cut) around agent-kanban v0.7.x's
 * SELF-EXPLAINING CARD: every card face carries a plain-words PHASE LINE —
 *   QUEUED · ▶ WORKING (mint, pulsing when live) · ▶ EXECUTOR (the role) · ◆ REVIEW · PASS · ✓ DONE · PASS.
 * The old demo filmed the board BEFORE that upgrade and was shaped like a "how you talk to the tool" ad
 * (you-type → terminal → board). The operator-approved 14-beat tool-demo (#1120 extended cut → 140s) shows
 * the agent-interface reframe AND the self-explaining card:
 *   1 hook · 2 chat · 3 tool · 4 transition(silent) · 5 picker(clip) · 6⭐ phase-line(committed still) ·
 *   7⭐ live heartbeat · 8 names the role · 9⭐ causal move · 10 epic chip · 11 depth on tap ·
 *   12 verdict pills · 13 payoff · 14 cta.
 * ⭐ = the three headline beats (face-verdict · live heartbeat · causal flip). Chat (beat 2) + agent-interface
 * tool (beat 3) + the explicit tool→board transition (beat 4) are PRESENT, so the strict recipe rules R3/R5
 * apply and PASS — NO `shape: "feature-tour"` carve-out (the spec leaves `shape` unset → strict R3/R5).
 *
 * Motion approach: the STILL board beats (2/3/5/6) are render-time pan/zoom over high-res board screenshots
 * (smooth at output fps by construction); the DYNAMIC board beats (4/7/8) are real Playwright captures
 * (heartbeat pulse, a card crossing + phase flip on land, the drawer sliding open). The board strip is
 * NEVER screen-recorded scrolling (the 25fps-undersampled jank the operator caught).
 *
 * Provenance: ONLY beat 6's still (`assets/kanban-demo/board-overview.png`, deviceScaleFactor 3) is COMMITTED
 * + provenance-hashed (sha256 + bytes + srcW/H, re-verified byte-for-byte by the provenance jest test, and
 * its IHDR pixel dims asserted == declared). Beats 2/3/5 reuse gitignored stills / the committed still with NO
 * provenance (camera moves only). The dynamic clips live under out/ (gitignored).
 *
 * Pure data + tsc/jest-gated. NO Playwright / ffmpeg / network / paid call in this module.
 */

import { BG_TOOL, BG_CHAT, BG_OUTPUT_A } from "./fableStoryboard";
import { FABLE_ASPECTS, type FableBeatLayout, type Rect } from "./fableLayout";
import type { DemoVideoSpec, DemoBeat, DemoBeatKind, DemoCaptions } from "./demoCategoryRecipe";

export const CAP_W = 1080;
export const CAP_H = 1920;

/**
 * DYNAMIC board-clip capture dimensions (px). The heartbeat (beat 4) + card-move (beat 7) clips are captured
 * PORTRAIT framed on COLUMNS 2–3 (In Progress + In Review) — a face-VERDICT renders only for in_review/done,
 * so every verdict beat frames In Progress + In Review (never cols 1–2). The drawer clip (beat 8) is a tall
 * portrait so the full deep-timeline (header → pipeline → verdict pills) is uncropped. Each clip's aspect ≈
 * its inset device-box aspect so it fills the frame (no thin strip, no L/R slice). Imported by
 * `captureKanbanAssets` (the capture viewport) AND used here to size each clip's inset device frame.
 */
export const KANBAN_PICKER_CLIP = { w: 900, h: 1050 } as const; // cols 2–3 portrait — open the session picker → filter sessions (beat 5)
export const KANBAN_HEARTBEAT_CLIP = { w: 900, h: 1050 } as const; // cols 2–3 portrait — the pulsing ▶ WORKING card (height tuned so the fuller board fills the frame)
export const KANBAN_CARD_CLIP = { w: 900, h: 1050 } as const; // cols 2–3 portrait — card lifts In Progress → lands In Review
export const KANBAN_DRAWER_CLIP = { w: 600, h: 1066 } as const; // tall portrait — tap card → drawer slides open (beat 11)

/**
 * The ENLARGED board "device" — a near-full-width window the board fills. 90% of the frame width (left 5% /
 * right 5% title-safe) and a height whose BOTTOM clears EVERY aspect's caption band (binding 1:1 band top is
 * 1240, so 1216 clears it AND the 9:16 band at 1430). 4-side title-safe on all edges. Used by the PAN-ZOOM
 * still beats (2/3/5/6) so the board fills the frame; the exact-aspect clips (4/7/8) size their device to the
 * clip aspect inside the same box (kanbanClipDeviceRect).
 */
export const WIDE_BOARD_DEVICE: Rect = { left: 54, top: 96, right: CAP_W - 54, bottom: 1216 };

/**
 * The max inset box (9:16 spine px) a board clip's device is fitted INTO: inside the 5% title-safe band AND
 * with its bottom clearing the lower-third caption band on every aspect (bottom ≤ 1216). The device is the
 * clip's aspect fitted into this box, CENTERED — a portrait clip yields a portrait device framed inset on the
 * cream output world.
 */
const CLIP_DEVICE_BOX = { left: 54, right: CAP_W - 54, top: 96, bottom: 1216 } as const;

/** The inset device rect (9:16 spine coords) for a board clip of the given pixel dimensions. */
export function kanbanClipDeviceRect(clipW: number, clipH: number): Rect {
  const boxW = CLIP_DEVICE_BOX.right - CLIP_DEVICE_BOX.left;
  const boxH = CLIP_DEVICE_BOX.bottom - CLIP_DEVICE_BOX.top;
  const aspect = clipW / clipH;
  let w = boxW;
  let h = w / aspect;
  if (h > boxH) {
    h = boxH;
    w = h * aspect;
  }
  const left = (CAP_W - w) / 2;
  const top = CLIP_DEVICE_BOX.top + (boxH - h) / 2;
  return { left, top, right: left + w, bottom: top + h };
}

/**
 * A pan-zoom focus point, NORMALIZED 0..1 on the SOURCE still (cx,cy = focus center; zoom = fraction of
 * source WIDTH visible, smaller = tighter). Consumed by captureKanban's pan-zoom-over-still builder
 * (mirrors `captureFable.panZoomBgGeom`, which CLAMPS so the image always COVERS the frame).
 */
export interface FocusRect {
  cx: number;
  cy: number;
  zoom: number;
}

/**
 * The builder-side ELABORATION highlight (the #871 forge `highlight` field). sx/sy/sw/sh are the narrated
 * element's measured bounding box, NORMALIZED 0..1 on the still/clip; `label` is the small caption drawn over
 * the ring (brand/owner/dev-token scrubbed by the capture gate); `labelBelow` puts the caption UNDER the ring.
 * The DemoVideoSpec does NOT model `highlight` — it is dropped in `buildKanbanSpec`, exactly how forge keeps
 * it builder-side.
 */
export interface KanbanHighlight {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  label: string;
  labelBelow?: boolean;
}

/** A pan-zoom still source (the camera keyframes over a high-res board screenshot). */
export interface KanbanStill {
  /** Repo-relative path to the board still PNG. */
  source: string;
  /** Source pixel dimensions of the PNG (viewport × deviceScaleFactor). */
  srcW: number;
  srcH: number;
  /** Hold `focusStart` this long (seconds) before easing to `focusEnd` — establishing before the push-in. */
  holdSec?: number;
  focusStart: FocusRect;
  focusEnd: FocusRect;
}

/** One ordered beat of the agent-kanban demonstration video (the SSOT the spec + the render derive from). */
export interface KanbanBeat {
  n: number;
  /** The generalized demonstration-beat role (drives the #870 recipe). */
  kind: DemoBeatKind;
  /** On-screen lower-third / pill label ("" for pure title beats). */
  stepLabel: string;
  /** Target rough-cut clip length (seconds). DESIGN target — re-locked via fitBeatsToVo after the paid preview. */
  clipSec: number;
  /** Title beats — the big headline + optional subtext + optional pill (CTA url). */
  headline?: string;
  sub?: string;
  url?: string;
  /** Chat beat — the genuine natural-language request the human types (the agent-interface reframe). */
  chatRequest?: string;
  /** Terminal/tool commands shown on screen ([] for non-tool beats). */
  commands: string[];
  isTerminal: boolean;
  isHeroOutput: boolean;
  /** The dominant background world color (tool / output). */
  backgroundColor: string;
  /**
   * COMMITTED hero still (beat 6 ONLY) — the committed high-res PNG + its provenance + the pan-zoom camera
   * keyframes. The deterministic both-ends AC anchor (provenance test + the ◆ REVIEW glyph probe).
   */
  hero?: KanbanStill & {
    /** sha256 of the committed PNG (re-verified by the provenance test). */
    sha256: string;
    /** Byte size of the committed PNG. */
    bytes: number;
  };
  /**
   * NON-committed (gitignored) still board beat (2/3/5) — pan-zoom over a gitignored capture under out/ (or a
   * camera move over the committed hero still). Same camera shape as `hero` but NO provenance (regenerated
   * each capture, not committed, not byte-checked, so the provenance test does not churn).
   */
  still?: KanbanStill;
  /** DYNAMIC board beat (4/7/8) — repo-relative path to the captured mp4 (under out/, gitignored). */
  clipSource?: string;
  /** The captured clip's pixel dims — needed to resolve the ring's object-fit:cover transform. */
  clipW?: number;
  clipH?: number;
  /** Animation-minimum seconds for a DYNAMIC clip beat (4/7/8) — the fitBeatsToVo floor (#1095) so a later
   *  VO re-lock can't shrink the beat below its on-screen motion. Carried metadata (not consumed this PR). */
  animMinSec?: number;
  /** The elaboration ring drawn over the narrated element (beats 4/5/6/8 — drawn at the settled framing). */
  highlight?: KanbanHighlight;
  /** Ken-Burns push-in over a CLIP beat (beats 4/7): hold wide, then ease toward (cx,cy) [clip-normalized]
   *  filling `zoom` fraction of the width. holdFrac = fraction of the beat held wide before the push. */
  clipPanZoom?: { cx: number; cy: number; zoom: number; holdFrac: number };
}

// ── VO-driven beat lengths — the spine↔voice sync SSOT ──────────────────────────────────────────────
// DESIGN-TARGET spoken durations per beat (the operator-approved 14-beat storyboard → ~140s). Each beat's
// clipSec MUST equal KANBAN_VO_SEG_SEC[n] (jest-gated). The spine has exactly ONE transition beat (beat 4,
// silent) → KANBAN_TRANSITION_SEC=1 and 1s of silence is spliced at the tool→board seam. These are RE-LOCKED
// via fitBeatsToVo after the cheap paid audio-only preview (the dynamic clip beats carry an animMinSec floor
// so the re-lock can't shrink them below their motion); until then they ride the storyboard's design targets.
// 14-beat tool-demo (#1120 extended cut → 140s). Beat 4 is the SILENT tool→board transition (its VO line is
// the empty string; the silence-gate keeps the splice ≤1.5s). Every OTHER beat's clipSec == its VO segment.
// #1120 NATURAL ORDER (VO-first, operator-directed 2026-06-22): storyboard → script → VO → build the video to
// the VO's length. These per-beat budgets are DERIVED by fitBeatsToVo from the MEASURED Adam VO
// (kanban-vo-preview.json) with breath=0 — i.e. clipSec == the beat's measured audio-segment length EXACTLY
// (clamped up to each clip beat's animMinSec motion floor). Why breath=0: the synthesized TTS segment ALREADY
// carries the speaker's natural trailing pause, so adding an extra breath DOUBLE-PADS and re-introduces the very
// dead-air we're avoiding (verified: breath 0.7 → 1.66–2.18s gaps; breath 0 → all gaps < 1.5s). The video TOTAL
// therefore FOLLOWS the voice (VO length + the 1s transition ≈ 141s ∈ demo band 110–180), instead of pinning the
// video to a fixed length and squeezing the VO in (the old video-first order that fought TTS jitter → dead-air).
// Regenerate after any script/VO change: paid preview → fitBeatsToVo(breath 0) → paste here → re-render spine →
// free-reuse the synth.
export const KANBAN_VO_SEG_SEC: Readonly<Record<number, number>> = {
  1: 7.71,
  2: 7.16,
  3: 9.03,
  4: 1,
  5: 12.31,
  6: 13.22,
  7: 11.85,
  8: 12.46,
  9: 11.59,
  10: 7.67,
  11: 13.21,
  12: 17.75,
  13: 10.73,
  14: 5.69,
};
/** The silent transition beat length (seconds). Beat 4 is a 1s tool→board handoff (board emerges, no VO). */
export const KANBAN_TRANSITION_SEC = 1;

// ── The #1120 14-beat tool-demo (extended cut → 140s; operator-approved storyboard 2026-06-22) ─────────
// 1 hook · 2 chat · 3 tool · 4 transition(silent) · 5 picker(clip) · 6 phase-line(COMMITTED still) ·
// 7 heartbeat(clip) · 8 role(still) · 9 lift·land(clip) · 10 epic-chip(still) · 11 drawer(clip) ·
// 12 verdict-pills(still) · 13 payoff · 14 cta. Terminal share = beat-3 only (8/140 = 5.7% ≤ 30%).
// Each beat's clipSec = KANBAN_VO_SEG_SEC[n]; beat 4 is the silent transition (empty VO line).

// The committed hero still (cols 2–3: In Progress + In Review). Beat 6 reads it as the provenance `hero`;
// beats 8 (role) + 10 (epic) read the SAME bytes as a non-provenance `still` with a different camera + ring
// (the ▶ EXECUTOR phase line and the parent-epic chip both render on these cols-2–3 cards).
const COMMITTED_STILL = "assets/kanban-demo/board-overview.png";
// Gitignored still (regenerated each capture, NOT byte-checked) — the open deep-timeline drawer (beat 12).
const VERDICT_STILL = "out/capture/kanban/drawer-verdicts.png"; // beat 12 — open drawer, multi-colored verdict pills

export const KANBAN_BEATS: ReadonlyArray<KanbanBeat> = [
  // 1 — HOOK (synth, no board).
  {
    n: 1, kind: "hook", stepLabel: "", clipSec: 7.71, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_TOOL,
    headline: "Watch your AI agent work.",
    sub: "It plans, codes, and reviews itself. Can you SEE it — and trust it?",
  },
  // 2 — CHAT. The HUMAN's interface: plain English to Claude Code; the agent picks up the task (R3 reframe).
  {
    n: 2, kind: "chat", stepLabel: "you → Claude Code · plain English", clipSec: 7.16, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_CHAT,
    chatRequest: "Plan and ship the board update — and show me every step.",
  },
  // 3 — TOOL. The agent's real pipeline (planner → plan-review → executor → exec-review) on the dark tool world.
  {
    n: 3, kind: "tool", stepLabel: "agent-kanban — the agent's interface, not yours", clipSec: 9.03,
    commands: ["claude  plan and ship the board update", "show the run on agent-kanban"],
    isTerminal: true, isHeroOutput: false, backgroundColor: BG_TOOL,
  },
  // 4 — TRANSITION (silent). The work surfaces from the tool onto the board (dark → cream).
  {
    n: 4, kind: "transition", stepLabel: "", clipSec: KANBAN_TRANSITION_SEC, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_OUTPUT_A,
  },
  // 5 — BOARD: SESSION PICKER (DYNAMIC clip, cols 2–3 → open the picker dropdown → filter between sessions).
  {
    n: 5, kind: "output", stepLabel: "the live board · agent-kanban", clipSec: 12.31, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_OUTPUT_A,
    clipSource: "out/capture/kanban/clip-session-picker.mp4",
    clipW: KANBAN_PICKER_CLIP.w, clipH: KANBAN_PICKER_CLIP.h, animMinSec: 8,
    // NO clip push-in (zoom 1.0) — the cols-2–3 board already fills the frame edge-to-edge; the dropdown OPENING
    // is the motion. Any horizontal zoom-in would crop the now-flush card text on the L/R (the #1120 clip-fix).
    clipPanZoom: { cx: 0.5, cy: 0.12, zoom: 1.0, holdFrac: 0.4 },
  },
  // 6 — PHASE LINE / SELF-EXPLAINING CARD (COMMITTED hero still, cols 2–3; column-locked vertical push-in onto
  // the top In-Review card's ◆ REVIEW · PASS phase line). The ONLY committed, provenance-hashed frame — the
  // both-ends AC anchor (the extracted-frame ◆ REVIEW glyph probe runs on these bytes).
  {
    n: 6, kind: "output", stepLabel: "every card says where it is", clipSec: 13.22, commands: [],
    isTerminal: false, isHeroOutput: true, backgroundColor: BG_OUTPUT_A,
    hero: {
      source: COMMITTED_STILL,
      // RE-BAKED 2026-06-22 from the re-capture (capture:kanban-assets prints sha256/bytes/srcW/srcH).
      sha256: "7dda50b747f6ebcdbe0acb55aa844820dea87dd99df82201d025f080ff8c188c",
      bytes: 373595,
      srcW: 2700, srcH: 3150, holdSec: 2.0,
      // FULL-WIDTH both columns (zoom 1.0→0.98 cx 0.5 → visible [0.0098, 0.990] ⊃ card text [0.018, 0.982] → NO
      // L/R crop, the #1120 clip-fix), with a gentle vertical settle toward the top rows. cx 0.5 both ends
      // satisfies the hero camera-framing guard; the ◆ REVIEW · PASS ring sits in the In Review (RIGHT) column.
      focusStart: { cx: 0.5, cy: 0.42, zoom: 1.0 },
      focusEnd: { cx: 0.5, cy: 0.34, zoom: 0.98 },
    },
    // Measured live (`.ak-phase` ◆ REVIEW · PASS element box). RE-BAKED by capture:kanban-assets. The glyph probe
    // (kanbanSpec.test) confirms verdict-green pixels live INSIDE this region on the committed PNG.
    highlight: { sx: 0.5233, sy: 0.1878, sw: 0.18, sh: 0.01, label: "in review · passed", labelBelow: true },
  },
  // 7 — THE LIVE HEARTBEAT (DYNAMIC clip, cols 2–3; push-in on the pulsing ▶ WORKING card). The pulse + push-in
  // IS the highlight — a STATIC ring would not track the zooming clip underneath it.
  {
    n: 7, kind: "output", stepLabel: "working right now", clipSec: 11.85, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_OUTPUT_A,
    clipSource: "out/capture/kanban/clip-heartbeat.mp4",
    clipW: KANBAN_HEARTBEAT_CLIP.w, clipH: KANBAN_HEARTBEAT_CLIP.h, animMinSec: 6,
    // LEFT-anchored push-in (cx 0.0 → scale origin at the left edge → visible [0, 0.62] = the In Progress column
    // with the breathing ▶ WORKING card; left edge stays put, no L/R crop). cy 0.16 keeps the top cards in view.
    clipPanZoom: { cx: 0.0, cy: 0.16, zoom: 0.62, holdFrac: 0.45 },
  },
  // 8 — NAMES THE ROLE (gitignored cols-2–3 still onto the ▶ EXECUTOR card in In Progress; settled ring).
  {
    n: 8, kind: "output", stepLabel: "the exact role on the job", clipSec: 12.46, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_OUTPUT_A,
    still: {
      source: COMMITTED_STILL, srcW: 2700, srcH: 3150, holdSec: 1.2,
      // The In Progress (LEFT) column. cx ≤ zoom/2 (0.31≤0.31, 0.25≤0.25) → posX clamps to 0 → the left edge
      // (source x=0) is always shown → the full In Progress column, NO left crop (the #1120 clip-fix).
      focusStart: { cx: 0.31, cy: 0.46, zoom: 0.62 },
      focusEnd: { cx: 0.25, cy: 0.5, zoom: 0.5 },
    },
    // Measured live 2026-06-22 (`.ak-phase` ▶ EXECUTOR box: sx 0.0189 sy 0.5053 sh 0.0112; sw tightened to hug the token).
    highlight: { sx: 0.0189, sy: 0.5053, sw: 0.16, sh: 0.0112, label: "the role on the job", labelBelow: true },
  },
  // 9 — CAUSAL MOVE (DYNAMIC clip, cols 2–3; card LIFTS from In Progress, crosses, LANDS in In Review; the phase
  // line flips ▶ WORKING → ◆ REVIEW · PASS on land — the verdict appears CAUSALLY as the card arrives).
  {
    n: 9, kind: "output", stepLabel: "lift · land · explained", clipSec: 11.59, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_OUTPUT_A,
    clipSource: "out/capture/kanban/clip-card-move.mp4",
    clipW: KANBAN_CARD_CLIP.w, clipH: KANBAN_CARD_CLIP.h, animMinSec: 8,
    // FULL-BOARD, no push-in (zoom 1.0) — the card visibly LIFTS from In Progress (left), crosses, and LANDS in
    // In Review (right) with both columns fully on screen the whole time. A push-in would crop the In Progress
    // column on the left (reading as the haircut); the cross + the verdict-flip-on-land IS the motion.
    clipPanZoom: { cx: 0.5, cy: 0.2, zoom: 1.0, holdFrac: 0.4 },
  },
  // 10 — PARENT / EPIC CHIP (gitignored cols-2–3 still; settled ring on the "↳ #NNNN" parent chip).
  {
    n: 10, kind: "output", stepLabel: "rolls up to its parent epic", clipSec: 7.67, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_OUTPUT_A,
    still: {
      source: COMMITTED_STILL, srcW: 2700, srcH: 3150, holdSec: 1.0,
      // The In Progress (LEFT) card carrying the "↳ #1063" parent chip (cy ≈ 0.52). cx ≤ zoom/2 → posX clamps
      // to 0 → full In Progress column, NO left crop (the #1120 clip-fix).
      focusStart: { cx: 0.31, cy: 0.5, zoom: 0.62 },
      focusEnd: { cx: 0.25, cy: 0.524, zoom: 0.5 },
    },
    // Measured live 2026-06-22 (`.ak-tag--parent` "↳ #1063" box: sx 0.0189 sy 0.5235 sw 0.0662 sh 0.0157; sw padded).
    highlight: { sx: 0.0189, sy: 0.5235, sw: 0.09, sh: 0.0157, label: "parent epic", labelBelow: true },
  },
  // 11 — DEPTH ON TAP (DYNAMIC drawer clip — tap the card → timeline drawer SLIDES OPEN → settle on the role
  // ledger rows + verdict pills + elapsed).
  {
    n: 11, kind: "output", stepLabel: "tap for the full timeline", clipSec: 13.21, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_OUTPUT_A,
    clipSource: "out/capture/kanban/clip-drawer-open.mp4",
    clipW: KANBAN_DRAWER_CLIP.w, clipH: KANBAN_DRAWER_CLIP.h, animMinSec: 7,
  },
  // 12 — THE VERDICTS (gitignored open-drawer still; settled ring on the MULTIPLE colored verdict pills + elapsed).
  {
    n: 12, kind: "output", stepLabel: "every step's verdict — passed, with-notes, blocked", clipSec: 17.75, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_OUTPUT_A,
    still: {
      source: VERDICT_STILL, srcW: 1200, srcH: 2132, holdSec: 1.4,
      // FULL-WIDTH drawer (zoom 1.0 cx 0.5 → posX=0 → no L/R crop); the narrow drawer over-fills vertically, so
      // the cy 0.6→0.66 settle pans DOWN onto the colored verdict pills (no horizontal zoom-in to crop them).
      focusStart: { cx: 0.5, cy: 0.6, zoom: 1.0 },
      focusEnd: { cx: 0.5, cy: 0.66, zoom: 1.0 },
    },
    // Measured live 2026-06-22 (the `.ak-pipeline` + `.ak-verdict` union over the open drawer).
    highlight: { sx: 0.0267, sy: 0.6931, sw: 0.9467, sh: 0.256, label: "each step's verdict" },
  },
  // 13 — PAYOFF (synth title, board pull-back read in the line).
  {
    n: 13, kind: "payoff", stepLabel: "", clipSec: 10.73, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_TOOL,
    headline: "Your AI agent — finally legible.",
    sub: "Every move, every verdict — right on the board, not in a black box.",
  },
  // 14 — CTA (synth, no board).
  {
    n: 14, kind: "cta", stepLabel: "", clipSec: 5.69, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_TOOL,
    headline: "agent-kanban",
    sub: "open-source · MIT · see your agent work",
    url: "github.com/ziyilam3999/agent-kanban",
  },
];

/**
 * The VO / caption text per beat (the caption-track SOURCE). Stored for the LATER (gated, PAID) VO leg;
 * deliberately NOT fed into the spec's `onScreenText` (R9 dev-token scan), exactly like forge/#824.
 * `KANBAN_VO_LINES[i]` is the line for `KANBAN_BEATS[i]`. Beat 4 (the tool→board transition) is SILENT —
 * its entry is the empty string (the narration module drops it). Each load-bearing line NAMES a thing you can
 * SEE in its shot (the phase line, the live heartbeat, the role, the on-face verdict, the parent epic).
 */
export const KANBAN_VO_LINES: ReadonlyArray<string> = [
  // 1 hook
  "Your AI agent plans, codes, and reviews its own work. But can you actually see it — and trust it?",
  // 2 chat
  "It starts how you already work: you just ask, in plain English, and the agent picks up the task.",
  // 3 tool
  "Behind the scenes it runs a real pipeline — planner, plan-review, executor, exec-review — each step checked before the next.",
  // 4 transition — SILENT (the work surfaces from the tool onto the board).
  "",
  // 5 picker
  "And here it all is, live, on a real Kanban board. Every work session your agent runs is just one tap away — open the picker and filter to any session you want to follow.",
  // 6 phase line
  "Every card says where it is, in plain words, right on its face — queued, working, in review, or done. No decoder ring, no digging through logs — the column and the label always agree.",
  // 7 heartbeat
  "The one card it is working on right now gently breathes, with a soft live pulse, so even on a busy board you can always see exactly where its attention is this second.",
  // 8 role
  "And for multi-step work, it names the exact role on the job — planner, reviewer, or executor — so here, you can see the executor is the one in the seat, doing the writing.",
  // 9 lift · land
  "Now watch a task actually move — it lifts off one column, slides across, and grows as it lands in review — and a green passed verdict appears the very instant it arrives.",
  // 10 epic chip
  "Every card also carries a parent-epic chip, so a small ticket always tells you which bigger goal it rolls up into.",
  // 11 drawer
  "Want the whole story behind a card? Just tap any task and its full timeline drawer slides open — every role that touched it, in order, with how long each one took, from first plan to final review.",
  // 12 verdict pills
  "And a colored verdict pill sits on every single step — green for passed, amber for approved-with-notes, red for blocked — so you see whether the agent's own reviews actually passed at each stage, not just that it did something. That is how you learn to trust the work.",
  // 13 payoff
  "You ask, in plain English. The agent plans, works, and reviews itself. And you watch every move and every verdict — never a black box.",
  // 14 cta
  "agent-kanban — it's open-source and free under MIT. See your agent work.",
];

// ── The DemoVideoSpec instance (fed to assertDemoCategoryRecipe — the build's test oracle) ─────────--

const RUNTIME_BAND = { min: 130, max: 165 } as const; // #1120 NATURAL ORDER: length FOLLOWS the VO (~150s ∈ demo {110,180}); KANBAN_VO_SEG_SEC is fitBeatsToVo-derived, not pinned
const MAX_TERMINAL_FRACTION = 0.3;

export const KANBAN_VO_BUNDLE = "out/review/kanban/kanban-vo-sync.json";
export const KANBAN_RUNTIME_SEC = KANBAN_BEATS.reduce((s, b) => s + b.clipSec, 0); // 140 (design target)

function kanbanCaptions(): DemoCaptions {
  return {
    present: true,
    syncBoundToRealAudio: true,
    audio: { source: KANBAN_VO_BUNDLE, real: true, durationSec: KANBAN_RUNTIME_SEC },
    lastCueEndSec: KANBAN_RUNTIME_SEC,
  };
}

/** The on-screen TEXT FIELDS a beat carries (label + title fields) — VO/caption + the elaboration
 *  highlight.label are authored separately and scrubbed in the capture gate (R9-exempt here). */
function kanbanOnScreenText(b: KanbanBeat): string[] {
  return [b.stepLabel, b.headline ?? "", b.sub ?? "", b.url ?? "", b.chatRequest ?? ""].filter((t) => t.length > 0);
}

/**
 * Title beats are centered (fill:false); the chat + tool beats fill the frame (fill:true, full-bleed like
 * fable/forge). The silent transition (beat 4) is a transient handoff — OMITTED from the layout array. ALL
 * board beats (5–12) sit INSET on the cream output world (fill:false — a framed object on a designed matte):
 * the STILL beats (6/8/10/12) pan-zoom inside a 90%-wide device; the DYNAMIC clip beats (5/7/9/11) play their
 * clip inside a device sized to the clip's EXACT aspect (kanbanClipDeviceRect) so the clip can NEVER slice L/R.
 */
export const KANBAN_BEAT_LAYOUTS: ReadonlyArray<FableBeatLayout> = [
  { beat: 1, kind: "title", content: { left: 120, top: 520, right: CAP_W - 120, bottom: 1400 }, fill: false },
  { beat: 2, kind: "terminal", content: { left: 90, top: 110, right: CAP_W - 90, bottom: CAP_H - 110 }, fill: true },
  { beat: 3, kind: "terminal", content: { left: 108, top: 120, right: CAP_W - 108, bottom: CAP_H - 120 }, fill: true },
  // beat 4 (silent transition) — transient handoff, omitted (no economy/safe-area subject to check).
  { beat: 5, kind: "viewer-video", content: kanbanClipDeviceRect(KANBAN_PICKER_CLIP.w, KANBAN_PICKER_CLIP.h), fill: false },
  { beat: 6, kind: "viewer-panzoom", content: { ...WIDE_BOARD_DEVICE }, fill: false },
  { beat: 7, kind: "viewer-video", content: kanbanClipDeviceRect(KANBAN_HEARTBEAT_CLIP.w, KANBAN_HEARTBEAT_CLIP.h), fill: false },
  { beat: 8, kind: "viewer-panzoom", content: { ...WIDE_BOARD_DEVICE }, fill: false },
  { beat: 9, kind: "viewer-video", content: kanbanClipDeviceRect(KANBAN_CARD_CLIP.w, KANBAN_CARD_CLIP.h), fill: false },
  { beat: 10, kind: "viewer-panzoom", content: { ...WIDE_BOARD_DEVICE }, fill: false },
  // beat 11 (drawer) — CONTAIN-framed in a device sized to the drawer clip's aspect (the #1120 / #1092 fix:
  // was COVER in WIDE_BOARD_DEVICE, which could slice the drawer sideways; kanbanClipDeviceRect can't).
  { beat: 11, kind: "viewer-video", content: kanbanClipDeviceRect(KANBAN_DRAWER_CLIP.w, KANBAN_DRAWER_CLIP.h), fill: false },
  { beat: 12, kind: "viewer-panzoom", content: { ...WIDE_BOARD_DEVICE }, fill: false },
  { beat: 13, kind: "title", content: { left: 120, top: 480, right: CAP_W - 120, bottom: 1440 }, fill: false },
  { beat: 14, kind: "title", content: { left: 120, top: 480, right: CAP_W - 120, bottom: 1440 }, fill: false },
];

function buildKanbanSpec(): DemoVideoSpec {
  const beats: DemoBeat[] = KANBAN_BEATS.map((b) => {
    const beat: DemoBeat = {
      n: b.n,
      kind: b.kind,
      // captured-footage spine: every board beat (still pan-zoom AND dynamic clip) is real captured footage;
      // the title overlay edits ride on top.
      vehicle: b.kind === "output" ? "captured-footage" : "overlay",
      backgroundColor: b.backgroundColor,
      label: b.stepLabel,
      onScreenText: kanbanOnScreenText(b),
      commands: [...b.commands],
      durationSec: b.clipSec,
      isTerminal: b.isTerminal,
      isHeroOutput: b.isHeroOutput,
    };
    // R6 provenance ONLY for the committed hero output beat (beat 6) — DROP `highlight`/`still` (DemoBeat
    // doesn't model them; the gitignored still beats carry no provenance so the provenance test doesn't churn).
    if (b.hero) {
      beat.provenance = { source: b.hero.source, real: true, sha256: b.hero.sha256, bytes: b.hero.bytes };
    }
    // #1092 — populate the CONTAIN-rule input (R18) from the REAL asset dims: a DYNAMIC clip beat
    // (clipSource → clipW/clipH, exact-fit rule b) or a still pan-zoom beat (hero/still srcW/srcH, rule a).
    // MANDATORY on every board beat so R18 is non-vacuous for kanban. The drawer hero is really 1200×2132.
    if (b.clipSource) {
      beat.insetAsset = { w: b.clipW!, h: b.clipH!, dynamic: true };
    } else if (b.hero ?? b.still) {
      const src = (b.hero ?? b.still)!;
      beat.insetAsset = { w: src.srcW, h: src.srcH, dynamic: false };
    }
    return beat;
  });

  return {
    task: 1120,
    // #1120 14-beat tool-demo: chat (beat 2) + agent-interface tool (beat 3) + transition (beat 4) are present,
    // so R3/R5 apply and PASS — NO feature-tour carve-out (an earlier tour cut dropped them; this 14-beat cut restores them).
    videoType: "demo", // #1137 — kanban is a demo-category video
    beats,
    aspects: FABLE_ASPECTS,
    beatLayouts: KANBAN_BEAT_LAYOUTS,
    runtimeWindowSec: { ...RUNTIME_BAND },
    maxTerminalFraction: MAX_TERMINAL_FRACTION,
    captions: kanbanCaptions(),
  };
}

/** The #1120 agent-kanban demonstration video, as one `DemoVideoSpec` — fed to `assertDemoCategoryRecipe`. */
export const kanbanSpec: DemoVideoSpec = buildKanbanSpec();
