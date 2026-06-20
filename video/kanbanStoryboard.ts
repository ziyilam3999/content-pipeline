/**
 * #1046 agent-kanban demo — the storyboard SSOT (the 10-beat plan + the pan-zoom focus rects + the
 * builder-side elaboration-highlight data), the `kanbanStoryboard.ts` analogue of `video/forgeStoryboard.ts`.
 *
 * This is a DEMONSTRATION-category promo video for agent-kanban (the live board that gives an operator
 * visibility into agent / 3-role-model work). It REUSES content-pipeline's #824/#870 demo machinery (the
 * `DemoVideoSpec` recipe contract + the Playwright capture/render harness) — exactly like the #871 forge
 * demo — with a new subject: the live kanban board.
 *
 * Motion approach (the smoothness fix, see the plan): the two STILL board beats (6 idle/active badge, 8 deep
 * timeline drawer) are render-time pan/zoom over high-res board screenshots (smooth at output fps by
 * construction); the two DYNAMIC board beats (5 session-picker switch, 7 a task moving columns) are real
 * Playwright captures framed on the output world. Each board beat is an ELABORATED feature beat — beats 6/8
 * draw a highlight ring + caption over the narrated element after the camera settles (the forge `highlight`
 * pattern). The board strip is NEVER screen-recorded scrolling (the 25fps-undersampled jank the operator caught).
 *
 * Provenance: the 2 board stills under `assets/kanban-demo/*.png` are genuine high-res captures of the live
 * board (deviceScaleFactor 3). Their sha256 + byte size are wired into the hero beats' `provenance` here and
 * re-verified byte-for-byte by the provenance jest test.
 *
 * Pure data + tsc/jest-gated. NO Playwright / ffmpeg / network / paid call in this module.
 */

import { BG_TOOL, BG_OUTPUT_A, BG_CHAT } from "./fableStoryboard";
import { FABLE_ASPECTS, type FableBeatLayout, type Rect } from "./fableLayout";
import type { DemoVideoSpec, DemoBeat, DemoBeatKind, DemoCaptions } from "./demoCategoryRecipe";

export const CAP_W = 1080;
export const CAP_H = 1920;

/**
 * DYNAMIC board-clip capture dimensions (px). Beat 5 (session picker) is captured PORTRAIT (≈ 9:16) so the
 * picker button + dropdown menu at the TOP of the board are NOT cropped when framed. Beat 7 (a task moving)
 * is ALSO captured PORTRAIT (#1071 frame-economy fix — operator 2026-06-20): the v3 LANDSCAPE all-4-columns
 * capture scaled a wide strip into 9:16 → the board filled only ~⅓ of the frame height with big empty cream
 * bands. The portrait beat-7 viewport shows the To Do + In Progress columns (the two the card crosses) side
 * by side via a capture-time 2-column flex override, so the card visibly leaves To Do and arrives in In
 * Progress while the board FILLS the frame. Its aspect ≈ WIDE_BOARD_DEVICE's content-box aspect so the clip
 * cover-fits the full-width board device with effectively no crop. Imported by `captureKanbanAssets` (the
 * capture viewport) AND used here to size each clip's inset device frame.
 */
export const KANBAN_PICKER_CLIP = { w: 390, h: 844 } as const; // MOBILE 390-wide (matches the beat-6 overview still's viewport) so beats 5+6 show the SAME responsive layout — coherent establishing shots (#1082)
export const KANBAN_CARD_CLIP = { w: 900, h: 1040 } as const; // portrait — To Do + In Progress side by side (card crosses, board fills)
export const KANBAN_DRAWER_CLIP = { w: 600, h: 1066 } as const; // portrait — board → tap #1053 → drawer opens (beat 8)

/**
 * The ENLARGED board "device" — a near-full-width window the board fills (#1046 v3 fix-2: the v2 device was
 * only ~55% wide with a big empty lower half). 90% of the frame width (left 5% / right 5% title-safe) and a
 * height whose BOTTOM clears EVERY aspect's caption band (the binding 1:1 band top in spine coords is 1240,
 * so 1216 clears it AND the 9:16 band at 1430). 4-side title-safe on all edges. Used by the PAN-ZOOM still
 * beat (6) and the COVER-framed picker clip (5) so the board fills the frame; the LANDSCAPE/portrait
 * exact-aspect clips (7/8) size their device to the clip aspect inside the same box (kanbanClipDeviceRect).
 */
export const WIDE_BOARD_DEVICE: Rect = { left: 54, top: 96, right: CAP_W - 54, bottom: 1216 };

/**
 * The max inset box (9:16 spine px) a board clip's device is fitted INTO: inside the 5% title-safe band AND
 * with its bottom clearing the lower-third caption band on every aspect (bottom ≤ 1216 — clears the binding
 * 1:1 band top 1240). The device is the clip's aspect fitted into this box, CENTERED — a portrait clip
 * yields a portrait device, a landscape clip a landscape device, each framed inset on the cream output world.
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
 * element's measured bounding box, NORMALIZED 0..1 on the (srcW × srcH) still; `label` is the small caption
 * drawn over the ring (brand/owner/dev-token scrubbed by the capture gate); `labelBelow` puts the caption
 * UNDER the ring (for a top-of-board element like the LIVE/IDLE badge). The DemoVideoSpec does NOT model
 * `highlight` — it is dropped in `buildKanbanSpec`, exactly how forge keeps it builder-side.
 */
export interface KanbanHighlight {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  label: string;
  labelBelow?: boolean;
}

/** One ordered beat of the agent-kanban demonstration video (the SSOT the spec + the render derive from). */
export interface KanbanBeat {
  n: number;
  /** The generalized demonstration-beat role (drives the #870 recipe). */
  kind: DemoBeatKind;
  /** On-screen lower-third / pill label ("" for pure title beats). */
  stepLabel: string;
  /** Target rough-cut clip length (seconds). */
  clipSec: number;
  /** Title beats — the big headline + optional subtext + optional pill (CTA url). */
  headline?: string;
  sub?: string;
  url?: string;
  /** Chat beat — the plain-English request the human supplies. */
  chatRequest?: string;
  /** Terminal/tool beat — the commands typed on screen ([] otherwise). */
  commands: string[];
  isTerminal: boolean;
  isHeroOutput: boolean;
  /** The dominant background world color (tool / output / chat). */
  backgroundColor: string;
  /** STILL board beat (6/8) — the committed high-res PNG + its provenance + the pan-zoom camera keyframes. */
  hero?: {
    /** Repo-relative path to the committed board still. */
    source: string;
    /** sha256 of the committed PNG (re-verified by the provenance test). */
    sha256: string;
    /** Byte size of the committed PNG. */
    bytes: number;
    /** Source pixel dimensions of the committed PNG (deviceScaleFactor 3 over a 390-wide mobile clip). */
    srcW: number;
    srcH: number;
    /** Hold `focusStart` this long (seconds) before easing to `focusEnd` — establishing before the push-in. */
    holdSec?: number;
    focusStart: FocusRect;
    focusEnd: FocusRect;
  };
  /** DYNAMIC board beat (5/7) — repo-relative path to the captured mp4 (under out/, gitignored). */
  clipSource?: string;
  /** The elaboration ring drawn over the narrated element (beats 6/8 — drawn at the settled `focusEnd`). */
  highlight?: KanbanHighlight;
  /** Ken-Burns push-in over a CLIP beat (beat 7): hold wide while the card crosses, then zoom toward
   *  (cx,cy) [clip-normalized] filling `zoom` fraction of the width — enlarges the small "● WORKING"
   *  breathing indicator on the landed card. holdFrac = fraction of the beat held wide before the push. */
  clipPanZoom?: { cx: number; cy: number; zoom: number; holdFrac: number };
}

// ── VO-driven beat lengths — the spine↔voice sync SSOT (forge's #944 pattern) ───────────────────────
// FIRST-GUESS spoken durations per NARRATED beat (the orchestrator VO-LOCKS these from the mock VO's
// measured per-segment lengths before any paid synth, so captions never drift). Each narrated beat's
// clipSec MUST equal KANBAN_VO_SEG_SEC[n] (jest-gated in kanbanSpec.test.ts); the silent transition beat
// renders KANBAN_TRANSITION_SEC of silence, which voiceKanban splices into the VO at the tool→board seam.
// VO-LOCKED to the measured paid Adam read (#1046, operator picked the ~90s cut over the slower 104s):
// each narrated beat ≈ Adam's actual segment length (still beats), clamped to the dynamic clip length
// where the animation is longer (beat 5 picker 14s, beat 7 card-move 16s). The LAST beat (4s ≈ Adam-exact)
// keeps the VO's last word at ≈clip end so captions REAL-sync (no even-split). Spine 87s + 3s transition = 90s.
export const KANBAN_VO_SEG_SEC: Readonly<Record<number, number>> = {
  1: 7,
  2: 7,
  3: 10,
  5: 14,
  6: 6,
  7: 16,
  8: 15,
  9: 8,
  10: 4,
};
/** The silent tool→board transition beat length (seconds) — also the silence voiceKanban splices at the seam. */
export const KANBAN_TRANSITION_SEC = 3;

// ── The 10-beat storyboard (operator-approved 2026-06-20, ~104s) ────────────────────────────────────
// 1 hook · 2 chat · 3 tool(terminal) · 4 transition(silent) · 5 board:session-picker(dynamic) ·
// 6 board:idle/active badge(still) · 7 board:task-moving(dynamic) · 8 board:deep drawer(still) · 9 payoff · 10 cta.
// Terminal = beat 3 = 13s ≈ 12.5% (≤30%). Each narrated beat's clipSec = KANBAN_VO_SEG_SEC[n].

export const KANBAN_BEATS: ReadonlyArray<KanbanBeat> = [
  // 1 — HOOK.
  {
    n: 1, kind: "hook", stepLabel: "", clipSec: 7, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_TOOL,
    headline: "Watch your AI agent work.",
    sub: "It plans, codes, and reviews itself. Can you see it — and trust it?",
  },
  // 2 — CHAT. The HUMAN's interface: plain English to Claude Code; the agent picks up the task.
  {
    n: 2, kind: "chat", stepLabel: "you → Claude Code · plain English", clipSec: 7, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_CHAT,
    chatRequest: "Plan and ship the board update — and show me every step.",
  },
  // 3 — TOOL. The agent's real pipeline (planner → plan-review → executor → exec-review) on the dark tool world.
  {
    n: 3, kind: "tool", stepLabel: "the agent's interface, not yours", clipSec: 10,
    commands: ["claude  plan and ship the board update", "show the run on agent-kanban"],
    isTerminal: true, isHeroOutput: false, backgroundColor: BG_TOOL,
  },
  // 4 — TRANSITION (silent). The work surfaces from the tool onto the board (dark → cream).
  {
    n: 4, kind: "transition", stepLabel: "", clipSec: KANBAN_TRANSITION_SEC, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_OUTPUT_A,
  },
  // 5 — BOARD: session picker (DYNAMIC capture — open picker → switch session → board changes + LIVE→IDLE).
  {
    n: 5, kind: "output", stepLabel: "the live board · agent-kanban", clipSec: 14, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_OUTPUT_A,
    clipSource: "out/capture/kanban/clip-session-picker.mp4",
  },
  // 6 — BOARD: idle/active badge (STILL pan/zoom → ring the LIVE/IDLE badge after the camera settles).
  {
    n: 6, kind: "output", stepLabel: "active or idle, at a glance", clipSec: 6, commands: [],
    isTerminal: false, isHeroOutput: true, backgroundColor: BG_OUTPUT_A,
    hero: {
      source: "assets/kanban-demo/board-overview.png",
      sha256: "a4f184f58144069977eaa96591de74d527d1644d1fdb1ca1bd0197f03df82bd4",
      bytes: 293104,
      srcW: 1170, srcH: 2532, holdSec: 2.0,
      // The board still is framed INSET in the portrait device (outputDeviceSpineRect) on the cream world — a
      // MODEST vertical pan UP that SETTLES on the header + the LIVE/IDLE badge (cy 0.04, device top). Pure
      // column-locked vertical pan (cx 0.5 both ends); the inset device gives the badge + ring clear margin
      // on all 4 sides (defect-3 fix — no full-bleed over-zoom, nothing clips the frame edge).
      focusStart: { cx: 0.5, cy: 0.4, zoom: 1.0 },
      focusEnd: { cx: 0.5, cy: 0.04, zoom: 1.0 },
    },
    // .ak-live badge LIVE-MEASURED via getBoundingClientRect at the REAL still dims (390×844 CSS → 1170×2532 px),
    // normalized over the TRUE 844-tall image. The pre-fix coords (sy 0.0103, sh 0.0231) were normalized over a
    // PHANTOM 1180-tall clip that Playwright had silently clamped to the 844 viewport — so the ring landed ~40%
    // too HIGH (1180/844 = 1.398× off on the y-axis). srcH is now the true 2532 (see assertHeroStillDimsMatchPng).
    highlight: { sx: 0.795, sy: 0.0144, sw: 0.1691, sh: 0.0322, label: "live or idle", labelBelow: true },
  },
  // 7 — BOARD: a task moving live (DYNAMIC capture — a card crossing To Do → In Progress, PORTRAIT). #1071
  // frame-economy fix: the v3 capture was landscape all-4-columns → a thin strip in cream; this is a portrait
  // two-column (To Do + In Progress) capture so the card visibly crosses while the board fills the frame. The
  // VO narrates the full to-do→done journey, so one clear cross-column move is the right single illustration.
  {
    n: 7, kind: "output", stepLabel: "lift · land · then working, live", clipSec: 16, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_OUTPUT_A,
    clipSource: "out/capture/kanban/clip-card-move.mp4",
    // Push in on the landed WORKING card (top of In Progress) so the tiny "● WORKING" breathing
    // heartbeat reads clearly (operator: too small at full-board framing). Holds wide for the cross.
    clipPanZoom: { cx: 0.73, cy: 0.26, zoom: 0.55, holdFrac: 0.55 },
  },
  // 8 — BOARD: deep timeline drawer (DYNAMIC capture — board → tap #1053 → drawer SLIDES OPEN → settle on the
  // pipeline header + verdict pills + ring). #1046 v3 fix-3: the v2 cut to a PRE-OPEN drawer (a still) so the
  // drawer "appeared from nowhere"; this captures the real tap→open MOTION, then rings the settled pills.
  {
    n: 8, kind: "output", stepLabel: "the agent's own reviews", clipSec: 15, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_OUTPUT_A,
    clipSource: "out/capture/kanban/clip-drawer-open.mp4",
    // The pipeline header + verdict-pills UNION, measured at capture time on the SETTLED drawer (the
    // KANBAN_DRAWER_CLIP 600×1066 viewport) via getBoundingClientRect → normalized over the clip; baked by
    // capture:kanban-assets. The clip frames exact-aspect (no crop) so this maps 1:1 onto the device.
    // The ring animates in AFTER the drawer settles (captureKanban DRAWER_RING_DELAY_SEC).
    highlight: { sx: 0.0267, sy: 0.6931, sw: 0.9467, sh: 0.256, label: "each step's verdict" },
  },
  // 9 — PAYOFF.
  {
    n: 9, kind: "payoff", stepLabel: "", clipSec: 8, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_TOOL,
    headline: "You ask. The agent works.",
    sub: "You watch every move — and every verdict. Not a black box.",
  },
  // 10 — CTA.
  {
    n: 10, kind: "cta", stepLabel: "", clipSec: 4, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_TOOL,
    headline: "agent-kanban",
    sub: "open-source · MIT · see your agent work",
    url: "github.com/ziyilam3999/agent-kanban",
  },
];

/**
 * The VO / caption text per beat (the caption-track SOURCE). Stored for the LATER (gated, PAID) VO leg;
 * deliberately NOT fed into the spec's `onScreenText` (R9 dev-token scan), exactly like forge/#824.
 * `KANBAN_VO_LINES[i]` is the line for `KANBAN_BEATS[i]`; the silent transition beat is the empty string.
 */
export const KANBAN_VO_LINES: ReadonlyArray<string> = [
  "Your AI agent plans, codes, and reviews its own work. But can you actually see it — and trust it?",
  "It starts the way you already work: you just ask, in plain English, and the agent picks up the task.",
  "Behind the scenes it runs a real pipeline — planner, plan-review, executor, exec-review — each step checked before the next.",
  "", // beat 4 transition — no words
  "Here it all is, live. Every work session your agent runs is one tap away — open the session picker and jump between them.",
  "And a badge tells you at a glance: is the agent working right now, or idle?",
  "Watch a task move in real time — it lifts off one column and lands in the next, to-do all the way to done. And the ticket it's working on right now breathes, so you always see its focus.",
  "Tap any task for its deep timeline: every role that touched it, and a colored verdict pill — green passed, amber approved-with-notes, red blocked. You see whether its own reviews passed, not just that it did something.",
  "You ask. The agent works. And you watch it — every move, every verdict. Not a black box.",
  "agent-kanban — open-source, MIT.",
];

// ── The DemoVideoSpec instance (fed to assertDemoCategoryRecipe — the build's test oracle) ─────────--

const RUNTIME_BAND = { min: 84, max: 94 } as const; // VO-LOCKED to the measured ~78.6s Adam read → ~90s spine (#1046)
const MAX_TERMINAL_FRACTION = 0.3;

export const KANBAN_VO_BUNDLE = "out/review/kanban/kanban-vo-sync.json";
export const KANBAN_RUNTIME_SEC = KANBAN_BEATS.reduce((s, b) => s + b.clipSec, 0); // 90 (VO-locked)

function kanbanCaptions(): DemoCaptions {
  return {
    present: true,
    syncBoundToRealAudio: true,
    audio: { source: KANBAN_VO_BUNDLE, real: true, durationSec: KANBAN_RUNTIME_SEC },
    lastCueEndSec: KANBAN_RUNTIME_SEC,
  };
}

/** The on-screen TEXT FIELDS a beat carries (label + title fields + chat request) — VO/caption + the
 *  elaboration highlight.label are authored separately and scrubbed in the capture gate (R9-exempt here). */
function kanbanOnScreenText(b: KanbanBeat): string[] {
  return [b.stepLabel, b.headline ?? "", b.sub ?? "", b.url ?? "", b.chatRequest ?? ""].filter((t) => t.length > 0);
}

/**
 * Title beats are centered (fill:false); the chat + tool terminals are full-bleed (fill:true). ALL FOUR
 * board beats now sit INSET on the cream output world (fill:false — a framed object on a designed matte,
 * not full-bleed): the two STILL beats (6/8) pan-zoom inside the portrait device, the two DYNAMIC beats
 * (5/7) play their clip inside a device sized to the clip's aspect. The silent transition (beat 4) is
 * transient → omitted (as forge/#824).
 */
export const KANBAN_BEAT_LAYOUTS: ReadonlyArray<FableBeatLayout> = [
  { beat: 1, kind: "title", content: { left: 120, top: 520, right: CAP_W - 120, bottom: 1400 }, fill: false },
  // beat 2 — the Claude Code chat surface (kind "terminal" NOT "chat": the chat interior-fill contract is
  // bound to the #824 fable chat CSS, which this kanban surface does not reproduce; the box still fills + is safe).
  { beat: 2, kind: "terminal", content: { left: 90, top: 110, right: CAP_W - 90, bottom: CAP_H - 110 }, fill: true },
  // beat 3 — the agent's pipeline terminal.
  { beat: 3, kind: "terminal", content: { left: 108, top: 120, right: CAP_W - 108, bottom: CAP_H - 120 }, fill: true },
  // beat 5 — session-picker clip, framed COVER in the 90%-wide board device (#1046 v3 fix-2): the picker +
  // dropdown live at the TOP, so cover top-aligns and crops only the sparse lower board → fills the frame width.
  { beat: 5, kind: "viewer-video", content: { ...WIDE_BOARD_DEVICE }, fill: false },
  // beat 7 — the PORTRAIT To-Do→In-Progress card-move clip, sized exact-aspect into the board device (#1071
  // frame-economy fix): the clip aspect ≈ the device box aspect so it fills nearly the full WIDE_BOARD_DEVICE
  // (board fills the frame, no thin-strip cream bands), with the card visibly crossing the two columns.
  { beat: 7, kind: "viewer-video", content: kanbanClipDeviceRect(KANBAN_CARD_CLIP.w, KANBAN_CARD_CLIP.h), fill: false },
  // beat 6 — STILL board pan-zoom hero, framed in the ENLARGED 90%-wide board device (#1046 v3 fix-2 — the
  // board fills the frame width, no empty lower half); the LIVE/IDLE badge ring sits inside the safe band.
  { beat: 6, kind: "viewer-panzoom", content: { ...WIDE_BOARD_DEVICE }, fill: false },
  // beat 8 — DYNAMIC drawer-open clip, framed COVER in the 90%-wide board device, BOTTOM-anchored so the deep
  // timeline (pipeline header + verdict pills, in the LOWER drawer) stays on screen + big and the ring lands
  // on the pills; only the ticket title/board above is cropped (#1046 v3 fix-2/fix-3).
  { beat: 8, kind: "viewer-video", content: { ...WIDE_BOARD_DEVICE }, fill: false },
  { beat: 9, kind: "title", content: { left: 120, top: 480, right: CAP_W - 120, bottom: 1440 }, fill: false },
  { beat: 10, kind: "title", content: { left: 120, top: 480, right: CAP_W - 120, bottom: 1440 }, fill: false },
];

function buildKanbanSpec(): DemoVideoSpec {
  const beats: DemoBeat[] = KANBAN_BEATS.map((b) => {
    const beat: DemoBeat = {
      n: b.n,
      kind: b.kind,
      // captured-footage spine: the tool terminal + every board beat (still pan-zoom AND dynamic clip) are
      // real captured footage; the title/chat/transition overlay edits ride on top.
      vehicle: b.kind === "tool" || b.kind === "output" ? "captured-footage" : "overlay",
      backgroundColor: b.backgroundColor,
      label: b.stepLabel,
      onScreenText: kanbanOnScreenText(b),
      commands: [...b.commands],
      durationSec: b.clipSec,
      isTerminal: b.isTerminal,
      isHeroOutput: b.isHeroOutput,
    };
    // R6 provenance ONLY for the hero (still) output beats — DROP `highlight` (DemoBeat doesn't model it).
    if (b.hero) {
      beat.provenance = { source: b.hero.source, real: true, sha256: b.hero.sha256, bytes: b.hero.bytes };
    }
    return beat;
  });

  return {
    task: 1046,
    beats,
    aspects: FABLE_ASPECTS,
    beatLayouts: KANBAN_BEAT_LAYOUTS,
    runtimeWindowSec: { ...RUNTIME_BAND },
    maxTerminalFraction: MAX_TERMINAL_FRACTION,
    captions: kanbanCaptions(),
  };
}

/** The #1046 agent-kanban demonstration video, as one `DemoVideoSpec` — fed to `assertDemoCategoryRecipe`. */
export const kanbanSpec: DemoVideoSpec = buildKanbanSpec();
