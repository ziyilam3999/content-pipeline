/**
 * #1120 agent-kanban demo — the v2 storyboard SSOT ("Your agents, finally legible").
 *
 * A FROM-SCRATCH redesign (NOT a patch of the old #1063/#1091 cut) around agent-kanban v0.7.x's
 * SELF-EXPLAINING CARD: every card face carries a plain-words PHASE LINE —
 *   QUEUED · ▶ WORKING (mint, pulsing when live) · ▶ EXECUTOR (the role) · ◆ REVIEW · PASS · ✓ DONE · PASS.
 * The old demo filmed the board BEFORE that upgrade and was shaped like a "how you talk to the tool" ad
 * (you-type → terminal → board). The operator-approved v2 is a FEATURE TOUR of the self-explaining card:
 *   1 hook · 2 reveal board · 3 lanes pan · 4⭐ live heartbeat · 5 names the role · 6⭐ verdict on the face ·
 *   7⭐ causal move · 8 depth on tap · 9 payoff · 10 cta.
 * ⭐ = the three headline beats (live heartbeat · face-verdict · causal flip). There is NO chat / tool /
 * transition beat — so the spec opts into the demonstration recipe's `shape: "feature-tour"` carve-out
 * (R3/R5 not asserted; every other rule still applies).
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

import { BG_TOOL, BG_OUTPUT_A } from "./fableStoryboard";
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
export const KANBAN_HEARTBEAT_CLIP = { w: 900, h: 1050 } as const; // cols 2–3 portrait — the pulsing ▶ WORKING card (height tuned so the fuller board fills the frame)
export const KANBAN_CARD_CLIP = { w: 900, h: 1050 } as const; // cols 2–3 portrait — card lifts In Progress → lands In Review
export const KANBAN_DRAWER_CLIP = { w: 600, h: 1066 } as const; // tall portrait — tap card → drawer slides open (beat 8)

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
  /** Terminal/tool commands shown on screen — always [] in v2 (no tool beat). Kept for the shared gate shape. */
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
// DESIGN-TARGET spoken durations per beat (the operator-approved storyboard's ~76–80s). Each beat's clipSec
// MUST equal KANBAN_VO_SEG_SEC[n] (jest-gated). The v2 spine has NO transition beat → KANBAN_TRANSITION_SEC=0
// and no silence is spliced. These are RE-LOCKED via fitBeatsToVo after the cheap paid audio-only preview
// (the dynamic beats 4/7/8 carry an animMinSec floor so the re-lock can't shrink them below their motion);
// until then they ride the storyboard's design targets. Spine total = 77s (74–84s band).
export const KANBAN_VO_SEG_SEC: Readonly<Record<number, number>> = {
  1: 7,
  2: 7,
  3: 9,
  4: 8,
  5: 7,
  6: 9,
  7: 10,
  8: 9,
  9: 6,
  10: 5,
};
/** The silent transition beat length (seconds). v2 has NO transition beat → 0 (no seam splice). */
export const KANBAN_TRANSITION_SEC = 0;

// ── The v2 10-beat storyboard (operator-approved 2026-06-21) ────────────────────────────────────────
// 1 hook · 2 reveal-board(still) · 3 lanes-pan(still) · 4⭐ heartbeat(clip) · 5 role(still) ·
// 6⭐ verdict-on-face(COMMITTED still) · 7⭐ causal-move(clip) · 8 drawer(clip) · 9 payoff · 10 cta.
// NO chat / tool / transition. Terminal share = 0% (≤30%). Each beat's clipSec = KANBAN_VO_SEG_SEC[n].

// The gitignored wide-board still (all 4 columns) shared by the reveal (beat 2) + lanes pan (beat 3).
const WIDE_BOARD_STILL = "out/capture/kanban/wide-board.png";
// The committed hero still (cols 2–3: In Progress + In Review) — beat 6's source, REUSED by beat 5's camera.
const COMMITTED_STILL = "assets/kanban-demo/board-overview.png";

export const KANBAN_BEATS: ReadonlyArray<KanbanBeat> = [
  // 1 — HOOK (synth, no board).
  {
    n: 1, kind: "hook", stepLabel: "", clipSec: 7, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_TOOL,
    headline: "You hand work to AI agents.",
    sub: "Then you're flying blind — which one's stuck, which is done, which is waiting on you?",
  },
  // 2 — REVEAL THE BOARD (gitignored wide still, all 4 columns, slow push-in).
  {
    n: 2, kind: "output", stepLabel: "the live board · agent-kanban", clipSec: 7, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_OUTPUT_A,
    still: {
      source: WIDE_BOARD_STILL, srcW: 2160, srcH: 2560, holdSec: 1.0,
      // Pure vertical settle + a gentle push-in: establish the whole board, ease toward the columns.
      focusStart: { cx: 0.5, cy: 0.42, zoom: 1.0 },
      focusEnd: { cx: 0.5, cy: 0.34, zoom: 0.92 },
    },
  },
  // 3 — SELF-EXPLAINING LANES (same wide still, slow L→R pan across QUEUED → ▶ WORKING → ◆ REVIEW · PASS → ✓ DONE).
  {
    n: 3, kind: "output", stepLabel: "every card says where it is", clipSec: 9, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_OUTPUT_A,
    still: {
      source: WIDE_BOARD_STILL, srcW: 2160, srcH: 2560, holdSec: 0.6,
      // Horizontal sweep across the lanes (NOT a hero beat → not column-locked; the lanes ARE the subject).
      focusStart: { cx: 0.22, cy: 0.4, zoom: 0.66 },
      focusEnd: { cx: 0.8, cy: 0.4, zoom: 0.66 },
    },
  },
  // 4 ⭐ — THE LIVE HEARTBEAT (DYNAMIC clip, cols 2–3; push-in on the pulsing ▶ WORKING card). Ring on the
  // active card (the breathing card; the phase line itself scales with the pulse, so the ring frames the card).
  {
    n: 4, kind: "output", stepLabel: "working right now", clipSec: 8, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_OUTPUT_A,
    clipSource: "out/capture/kanban/clip-heartbeat.mp4",
    clipW: KANBAN_HEARTBEAT_CLIP.w, clipH: KANBAN_HEARTBEAT_CLIP.h, animMinSec: 6,
    // Push in toward the top of In Progress (the focus card) so the breathing ▶ WORKING pill reads clearly.
    // Holds wide first, then eases in. The pulse + push-in IS the highlight — a STATIC ring would not track
    // the zooming clip underneath it (rings live only on the settled STILL beats 5/6 + the no-zoom drawer 8).
    clipPanZoom: { cx: 0.28, cy: 0.2, zoom: 0.6, holdFrac: 0.45 },
  },
  // 5 — NAMES THE ROLE (camera move over the COMMITTED cols-2–3 still onto the ▶ EXECUTOR card in In Progress).
  {
    n: 5, kind: "output", stepLabel: "the exact role on the job", clipSec: 7, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_OUTPUT_A,
    still: {
      source: COMMITTED_STILL, srcW: 2700, srcH: 3150, holdSec: 0.6,
      // Tight on the In Progress (LEFT) column's ▶ EXECUTOR card. NOT a hero beat → free to frame the left
      // column (cx locked to ~0.27 so it is a vertical settle, no cross-column sweep).
      focusStart: { cx: 0.27, cy: 0.46, zoom: 0.7 },
      focusEnd: { cx: 0.27, cy: 0.51, zoom: 0.46 },
    },
    // Measured live (`.ak-phase` ▶ EXECUTOR element box: sx 0.0344 sy 0.5051 sh 0.0115); ring width tightened
    // to hug the "▶ EXECUTOR" text (the element box is the full column width). Baked by capture:kanban-assets.
    highlight: { sx: 0.034, sy: 0.5051, sw: 0.14, sh: 0.0115, label: "the role on the job", labelBelow: true },
  },
  // 6 ⭐ — VERDICT ON THE FACE (COMMITTED hero still, cols 2–3; column-locked vertical push-in onto the top
  // In-Review card's ◆ REVIEW · PASS face line). The ONLY committed, provenance-hashed frame — the both-ends
  // AC anchor (the extracted-frame ◆ REVIEW glyph probe runs on these bytes).
  {
    n: 6, kind: "output", stepLabel: "the verdict, on the face", clipSec: 9, commands: [],
    isTerminal: false, isHeroOutput: true, backgroundColor: BG_OUTPUT_A,
    hero: {
      source: COMMITTED_STILL,
      // RE-BAKED from the re-capture (capture:kanban-assets prints sha256/bytes/srcW/srcH).
      sha256: "b9d2a1043affa3df7b765da9dc73f2be4c6ad596eaf934f202a975c914eae9a2",
      bytes: 376916,
      srcW: 2700, srcH: 3150, holdSec: 1.6,
      // Column-locked vertical pan (cx 0.5 both ends — the camera-framing guard) + a gentle push-in that
      // settles on the top row where the ◆ REVIEW · PASS face line sits in the In Review (RIGHT) column.
      focusStart: { cx: 0.5, cy: 0.3, zoom: 1.0 },
      focusEnd: { cx: 0.5, cy: 0.18, zoom: 0.86 },
    },
    // Measured live (`.ak-phase` ◆ REVIEW · PASS element box: sx 0.5233 sy 0.1878 sh 0.01); ring width
    // tightened to hug the "◆ REVIEW · PASS" text (the element box is the full column width). The glyph probe
    // (kanbanSpec.test) confirms verdict-green pixels live INSIDE this region on the committed PNG.
    highlight: { sx: 0.5233, sy: 0.1878, sw: 0.18, sh: 0.01, label: "review · passed", labelBelow: true },
  },
  // 7 ⭐ — CAUSAL MOVE (DYNAMIC clip, cols 2–3; card LIFTS from In Progress, crosses, LANDS in In Review;
  // the phase line flips ▶ WORKING → ◆ REVIEW · PASS on land — the verdict appears CAUSALLY as the card arrives).
  {
    n: 7, kind: "output", stepLabel: "lift · land · explained", clipSec: 10, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_OUTPUT_A,
    clipSource: "out/capture/kanban/clip-card-move.mp4",
    clipW: KANBAN_CARD_CLIP.w, clipH: KANBAN_CARD_CLIP.h, animMinSec: 8,
    // Hold wide for the cross, then push in on the LANDED card (top of In Review, RIGHT column) so the
    // newly-lit ◆ REVIEW · PASS face line reads clearly.
    clipPanZoom: { cx: 0.74, cy: 0.22, zoom: 0.6, holdFrac: 0.55 },
  },
  // 8 — DEPTH ON TAP (DYNAMIC drawer clip — tap the card → timeline drawer SLIDES OPEN → settle on the role
  // ledger rows + verdict pills + elapsed; ring on the pipeline+verdict union).
  {
    n: 8, kind: "output", stepLabel: "the agent's own reviews", clipSec: 9, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_OUTPUT_A,
    clipSource: "out/capture/kanban/clip-drawer-open.mp4",
    clipW: KANBAN_DRAWER_CLIP.w, clipH: KANBAN_DRAWER_CLIP.h, animMinSec: 7,
    // Measured live (the `.ak-pipeline` + `.ak-verdict` union) over the drawer clip; baked by capture:kanban-assets.
    highlight: { sx: 0.0267, sy: 0.6931, sw: 0.9467, sh: 0.256, label: "each step's verdict" },
  },
  // 9 — PAYOFF (synth title, board pull-back read in the line).
  {
    n: 9, kind: "payoff", stepLabel: "", clipSec: 6, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_TOOL,
    headline: "Your AI agents — finally legible.",
    sub: "Every card says where it is, and why — right on its face.",
  },
  // 10 — CTA (synth, no board).
  {
    n: 10, kind: "cta", stepLabel: "", clipSec: 5, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_TOOL,
    headline: "agent-kanban",
    sub: "open-source · MIT · see your agents work",
    url: "github.com/ziyilam3999/agent-kanban",
  },
];

/**
 * The VO / caption text per beat (the caption-track SOURCE). Stored for the LATER (gated, PAID) VO leg;
 * deliberately NOT fed into the spec's `onScreenText` (R9 dev-token scan), exactly like forge/#824.
 * `KANBAN_VO_LINES[i]` is the line for `KANBAN_BEATS[i]`. v2 has NO silent beat — all 10 are narrated.
 * Each load-bearing line NAMES a thing you can SEE in its shot (the live heartbeat, the role, the on-face verdict).
 */
export const KANBAN_VO_LINES: ReadonlyArray<string> = [
  "You hand real work to your AI agents — and then you're flying blind. Which one's stuck? Which is done? Which is quietly waiting on you?",
  "This board answers that at a glance — every agent and every task it's running, laid out in one live place.",
  "Because every card says where it is, in plain words, right on its own face — queued, working, in review, or done. No decoder ring, no digging through logs.",
  "The one card it is working on right now gently breathes, with a live pulse, so you can always see exactly where the agent's focus is this second.",
  "And for multi-step work, it names the exact role on the job right now — here, you can see the executor is the one in the seat.",
  "When something reaches review, the verdict sits right there on the card's face — passed, approved with notes, or blocked — so you never dig to find out why.",
  "Now watch a card actually move — it lifts off one column, crosses, and lands in review — and it explains itself the instant it arrives, the passed verdict appearing right as it lands.",
  "And when you want the whole story, just tap any card — its full timeline opens up, showing every role that touched it, every verdict it earned, and every timing, in order.",
  "Your AI agents — finally legible. You always know who did what, and whether their own review actually passed.",
  "agent-kanban — it's open-source and free under MIT. The link is in the replies.",
];

// ── The DemoVideoSpec instance (fed to assertDemoCategoryRecipe — the build's test oracle) ─────────--

const RUNTIME_BAND = { min: 74, max: 84 } as const; // v2 design-target spine ≈ 77s (re-locked via fitBeatsToVo post-preview)
const MAX_TERMINAL_FRACTION = 0.3;

export const KANBAN_VO_BUNDLE = "out/review/kanban/kanban-vo-sync.json";
export const KANBAN_RUNTIME_SEC = KANBAN_BEATS.reduce((s, b) => s + b.clipSec, 0); // 77 (design target)

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
  return [b.stepLabel, b.headline ?? "", b.sub ?? "", b.url ?? ""].filter((t) => t.length > 0);
}

/**
 * Title beats are centered (fill:false). ALL board beats sit INSET on the cream output world (fill:false —
 * a framed object on a designed matte): the STILL beats (2/3/5/6) pan-zoom inside a device, the DYNAMIC beats
 * (4/7/8) play their clip inside a device sized to the clip's aspect.
 */
export const KANBAN_BEAT_LAYOUTS: ReadonlyArray<FableBeatLayout> = [
  { beat: 1, kind: "title", content: { left: 120, top: 520, right: CAP_W - 120, bottom: 1400 }, fill: false },
  { beat: 2, kind: "viewer-panzoom", content: { ...WIDE_BOARD_DEVICE }, fill: false },
  { beat: 3, kind: "viewer-panzoom", content: { ...WIDE_BOARD_DEVICE }, fill: false },
  { beat: 4, kind: "viewer-video", content: kanbanClipDeviceRect(KANBAN_HEARTBEAT_CLIP.w, KANBAN_HEARTBEAT_CLIP.h), fill: false },
  { beat: 5, kind: "viewer-panzoom", content: { ...WIDE_BOARD_DEVICE }, fill: false },
  { beat: 6, kind: "viewer-panzoom", content: { ...WIDE_BOARD_DEVICE }, fill: false },
  { beat: 7, kind: "viewer-video", content: kanbanClipDeviceRect(KANBAN_CARD_CLIP.w, KANBAN_CARD_CLIP.h), fill: false },
  // beat 8 — drawer clip framed COVER in the 90%-wide board device, BOTTOM-anchored so the deep timeline
  // (pipeline header + verdict pills, in the LOWER drawer) stays on screen + big and the ring lands on the pills.
  { beat: 8, kind: "viewer-video", content: { ...WIDE_BOARD_DEVICE }, fill: false },
  { beat: 9, kind: "title", content: { left: 120, top: 480, right: CAP_W - 120, bottom: 1440 }, fill: false },
  { beat: 10, kind: "title", content: { left: 120, top: 480, right: CAP_W - 120, bottom: 1440 }, fill: false },
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
    return beat;
  });

  return {
    task: 1120,
    shape: "feature-tour", // #1120 v2 — 10-beat tour: R3/R5 carved out at merge baseline (dropped in the 14-beat re-cut)
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
