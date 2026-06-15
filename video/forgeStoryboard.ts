/**
 * #871 forge-demo — the storyboard SSOT (the 9-beat plan + the focus-rect data for the pan-zoom hero
 * beats), the `forgeStoryboard.ts` analogue of `video/fableStoryboard.ts`.
 *
 * This is a DEMONSTRATION-category promo video for forge-harness. It REUSES content-pipeline's #824/#870
 * demo machinery (the `DemoVideoSpec` recipe contract + the Playwright capture/render harness) and adds
 * exactly ONE net-new piece: a directed PAN-ZOOM over three pre-captured REAL `.forge/dashboard.html`
 * screenshots, so a WIDE landscape board reads legibly on a tall phone and DEMO-2 visibly moves
 * Retry → Done across the cut.
 *
 * Provenance: the 3 hero PNGs under `assets/forge-demo/*.png` are the genuine captured forge dashboard
 * (see `.ai-workspace/plans/2026-06-14-871-forge-demo.md` Phase-2). Their sha256 + byte size are wired
 * into the hero beats' `provenance` here and re-verified byte-for-byte by the provenance jest test.
 *
 * FOCUS-RECT data field (the tunable knob): every hero beat carries `focusStart` / `focusEnd`, each a
 * normalized `{cx, cy, zoom}` on the SOURCE image (cx,cy = focus-point center 0..1; zoom = fraction of
 * source WIDTH visible, smaller = tighter). These are FIRST GUESSES — the orchestrator eyeballs the
 * rendered frames and tunes them here, NOT in the builder. The pan-zoom builder
 * (`tools/captureForge.ts → buildViewerPanZoomHtml`) consumes them.
 *
 * Pure data + tsc/jest-gated. NO Playwright / ffmpeg / network / paid call in this module.
 */

import { BG_TOOL, BG_OUTPUT_A, BG_CHAT } from "./fableStoryboard";
import { FABLE_ASPECTS, type FableBeatLayout } from "./fableLayout";
import type { DemoVideoSpec, DemoBeat, DemoBeatKind, DemoCaptions } from "./demoCategoryRecipe";

export const CAP_W = 1080;
export const CAP_H = 1920;

/** The source dashboard PNGs are 2880×2048 landscape. Board content fills the top ~70%; bottom ~30% is
 *  empty cream — a focus rect must stay ON the board content, never frame the empty cream. */
export const FORGE_SOURCE_W = 2880;
export const FORGE_SOURCE_H = 2048;

/**
 * A pan-zoom focus point, NORMALIZED 0..1 on the SOURCE image.
 *  - cx, cy: the focus-point CENTER (fraction of source width / height).
 *  - zoom:   the fraction of source WIDTH visible in the frame (smaller = tighter). The builder CLAMPS
 *            this so the image always COVERS the output frame (no letterbox / no empty-cream island).
 */
export interface FocusRect {
  cx: number;
  cy: number;
  zoom: number;
}

/** One ordered beat of the forge demonstration video (the SSOT the spec + the render derive from). */
export interface ForgeBeat {
  n: number;
  /** The generalized demonstration-beat role (drives the #870 recipe). */
  kind: DemoBeatKind;
  /** On-screen lower-third / pill label ("" for pure title beats). */
  stepLabel: string;
  /** Target rough-cut clip length (seconds). */
  clipSec: number;
  /** Title beats — the big headline + optional subtext + optional pill (CTA url / source chip). */
  headline?: string;
  sub?: string;
  url?: string;
  /** Chat beat — the plain-English / multiple-choice request the human supplies. */
  chatRequest?: string;
  /** Terminal/tool beat — the forge commands typed on screen ([] otherwise). */
  commands: string[];
  /** Extra on-screen chip text (e.g. the beat-1 stat-source citation). */
  chip?: string;
  isTerminal: boolean;
  isHeroOutput: boolean;
  /** The dominant background world color (tool / output / chat). */
  backgroundColor: string;
  /** HERO beat only — the real dashboard HTML (LIVE-captured so the CSS Forge-Pulse breathing renders)
   *  + its provenance + the pan-zoom camera keyframes. */
  hero?: {
    /** Repo-relative path to the REAL self-contained `.forge/dashboard.html` (the file forge writes on
     *  every run). Rendered LIVE in Playwright so its CSS animations (the breathing hexagon pulse) run —
     *  a static screenshot would freeze the breathing, which is exactly why it never showed before. */
    source: string;
    /** sha256 of the committed dashboard HTML (re-verified by the provenance test). */
    sha256: string;
    /** Byte size of the committed dashboard HTML. */
    bytes: number;
    /** The iframe RENDER size (CSS px). The board is a wide-and-short landscape (~1.9:1); rendering it at a
     *  NARROWER width reflows the 6 columns TALLER so the dashboard's aspect (~0.7–0.8:1) fills the 9:16
     *  portrait frame instead of floating as a short island. srcH is the dashboard's measured height at srcW. */
    srcW: number;
    srcH: number;
    /** Hold the `focusStart` framing this long (seconds) before easing to `focusEnd` — gives the FULL-BOARD
     *  establishing shot time to land before the camera pushes into the detail. */
    holdSec?: number;
    /** Camera keyframes, NORMALIZED on the (srcW × srcH) render (tunable — the orchestrator iterates these). */
    focusStart: FocusRect;
    focusEnd: FocusRect;
    /** R3/R4 (operator 2026-06-15) — an "elaboration" highlight ring drawn over the narrated element AFTER
     *  the camera settles on `focusEnd`. sx/sy/sw/sh are normalized 0..1 on the (srcW × srcH) render (the
     *  element's measured bounding box); `label` is the small on-screen caption (brand/dev-token scrubbed);
     *  `labelBelow` puts the label under the ring (for a top-of-board element like the Forge Pulse). */
    highlight?: {
      sx: number;
      sy: number;
      sw: number;
      sh: number;
      label: string;
      labelBelow?: boolean;
    };
  };
}

// ── #944 VO-driven beat lengths — the spine↔voice sync SSOT (operator Option 1, 2026-06-15) ─────────
// The voiced cut drifted because the spine cut each beat to a GUESSED length while Adam speaks each beat at
// a DIFFERENT length → audio + video + captions slide apart (by ~8s mid-video) and the CTA got truncated.
// The fix: render each NARRATED beat at its MEASURED spoken length so every video beat lands exactly on its
// VO segment boundary. These are the per-narrated-beat spoken durations (seconds) — the deltas of the cached
// Adam VO's sceneEndTimesSec [11.564,23.301,38.231,50.352,62.577,69.95,79.597,85.054,90.882], from
// out/audio/forge-vo.mp3 / out/review/forge-demo/forge-demo-vo-sync.json (2026-06-15). The transition beat (no
// VO) renders FORGE_TRANSITION_SEC of silence, which tools/voiceForge.ts splices into the VO at the
// tool→dashboard seam (+ shifts the post-seam char-timestamps) so the audio total == the spine total and the
// captions stay locked. SSOT: each narrated beat's clipSec MUST equal FORGE_VO_SEG_SEC[n] (jest-gated in
// forgeSpec.test.ts) and the cached VO MUST match it within 0.5s (runtime-gated in voiceForge — assertForgeVoMatchesSpine).
export const FORGE_VO_SEG_SEC: Readonly<Record<number, number>> = {
  1: 11.564,
  2: 11.737,
  3: 14.93,
  4: 12.121,
  6: 12.225,
  7: 7.373,
  8: 9.647,
  9: 5.457,
  10: 5.828,
};
/** The silent tool→dashboard transition beat length (seconds) — also the silence voiceForge inserts at the seam. */
export const FORGE_TRANSITION_SEC = 3.0;

// ── The 10-beat storyboard (#927-rev → #944 VO-locked, ~93.9s) ──────────────────────────────────────
// 1 hook · 2 chat/prd · 3 decomposition · 4 tool(terminal) · 5 transition(silent) · 6/7/8 hero dashboards ·
// 9 payoff · 10 cta. Each narrated beat's clipSec = FORGE_VO_SEG_SEC[n]; the transition = FORGE_TRANSITION_SEC;
// total ≈ 93.9s (90.88s spoken + 3s silent transition). Terminal = beat 4 = 12.12s ≈ 12.9% (≤30%).
// The hero boards render at srcW 440 (< the 640px mobile breakpoint) → the board reflows TALLER than the
// frame, giving real vertical pan room to PUSH to each narrated element (operator R3/R4 2026-06-15) + bigger
// on-screen text. The crop-safe gate locks horizontal zoom to ~1.17–1.20 (no side-crop), so element emphasis =
// vertical pan + a highlight ring drawn on the element after the camera settles.

export const FORGE_BEATS: ReadonlyArray<ForgeBeat> = [
  // 1 — HOOK. Verification-debt framing (industry stat, sourced — NOT a forge metric).
  {
    n: 1, kind: "hook", stepLabel: "", clipSec: 11.564, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_TOOL,
    headline: "Your AI writes the code, then grades its own homework.",
    sub: "96% don't fully trust it — barely half ever check it.",
    chip: "Sonar State of Code, 2026",
  },
  // 2 — CHAT (/prd). Rebuilt (R1) as an AUTHENTIC Claude Code TERMINAL running /prd: the human types the
  //     request, Claude asks a couple of plain multiple-choice questions, the spec lands. Big mono, legible.
  {
    n: 2, kind: "chat", stepLabel: "you → Claude Code · /prd", clipSec: 11.737, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_CHAT,
    chatRequest: "Shape this into a spec — ask me a few multiple-choice questions.",
  },
  // 3 — DECOMPOSITION (R3, NEW). forge_plan breaks the work down — HONEST hierarchy (verified vs forge-harness
  //     execution-plan schema v3.0.0 + planner.ts): PRD → phases → user stories (a flat dependency graph; a big
  //     story is SPLIT into SIBLING stories, never nested under a parent, no "sub-task") → binary shell checks.
  {
    n: 3, kind: "title", stepLabel: "forge_plan — breaks the work down", clipSec: 14.93, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_TOOL,
  },
  // 4 — TOOL. The spec feeds forge_plan; the agent implements; forge_evaluate RUNS the AC commands.
  {
    n: 4, kind: "tool", stepLabel: "forge-harness — the agent's interface, not yours", clipSec: 12.121,
    commands: ["forge_plan  --prd .forge/prd.md", "forge_evaluate  --story DEMO-2", "forge_status"],
    isTerminal: true, isHeroOutput: false, backgroundColor: BG_TOOL,
  },
  // 5 — TRANSITION. The verdict surfaces from the tool into the dashboard world (dark → cream). R2: the card
  //     is a LIVE screenshot of the MOBILE board (not the old desktop PNG) → no desktop→mobile flip.
  {
    n: 5, kind: "transition", stepLabel: "", clipSec: FORGE_TRANSITION_SEC, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_OUTPUT_A,
  },
  // 6 — HERO #1 (working-green), LIVE on the shipped MOBILE layout (v0.47.0 vertical grouped-by-status list).
  //     Establishing, then PUSH UP to the Forge Pulse (up top — on mobile the top-bar wraps, so the pulse sits
  //     top-LEFT of the second row, NOT top-right) with a highlight ring. DEMO-2 is live in In Progress.
  {
    n: 6, kind: "output", stepLabel: "the output — forge's live dashboard", clipSec: 12.225, commands: [],
    isTerminal: false, isHeroOutput: true, backgroundColor: BG_OUTPUT_A,
    hero: {
      source: "assets/forge-demo/dashboard-working-green.html",
      sha256: "a234f06ff1f6c2da9bf5951206002bb2d499402392f7552a0cd9f086c1bf3bdc",
      bytes: 23813,
      // srcW 440 → board reflows ~1364px tall (taller than the 931px visible window at zoom≈1.19) → real
      // vertical pan room. Establishing (cy 0.42) eases UP to the top-bar (cy 0.10 → ty clamps to board top, the
      // Forge Pulse at frame top) + a tiny zoom-in (1.20→1.17, still crop-safe: left ≥0.09). cx 0.5 both ends.
      srcW: 440, srcH: 1364, holdSec: 2.0,
      focusStart: { cx: 0.5, cy: 0.42, zoom: 1.2 },
      focusEnd: { cx: 0.5, cy: 0.1, zoom: 1.17 },
      // Forge Pulse box measured at srcW 440 (sx 0.075, sy 0.048, sw 0.317, sh 0.022); label sits BELOW it.
      highlight: { sx: 0.075, sy: 0.048, sw: 0.317, sh: 0.022, label: "Forge Pulse — breathing while it works", labelBelow: true },
    },
  },
  // 7 — HERO #2 (idle/retry): DEMO-2 now sits in RETRY ("1/3 retries", "AC failed: sum.test.js — 1 prior
  //     attempt, retrying"). Establishing eases DOWN to the retry card (mid-lower board) with a highlight ring.
  {
    n: 7, kind: "output", stepLabel: "the output — forge's live dashboard", clipSec: 7.373, commands: [],
    isTerminal: false, isHeroOutput: true, backgroundColor: BG_OUTPUT_A,
    hero: {
      source: "assets/forge-demo/dashboard-idle.html",
      sha256: "114ec073d4c41cf2b78135610dd82f8475a1e3bf422e8c51d98ebaab40e4eeed",
      bytes: 23626,
      srcW: 440, srcH: 1281, holdSec: 1.5,
      focusStart: { cx: 0.5, cy: 0.46, zoom: 1.19 },
      focusEnd: { cx: 0.5, cy: 0.64, zoom: 1.17 },
      // DEMO-2 retry card measured at srcW 440 (sx 0.075, sy 0.598, sw 0.85, sh 0.087); label ABOVE.
      highlight: { sx: 0.075, sy: 0.598, sw: 0.85, sh: 0.087, label: "Retry — a check failed" },
    },
  },
  // 8 — HERO #3 (all-done): DEMO-2 has passed after 1 retry and joined DONE, carrying its "1/3 retries" badge
  //     (proof of the journey). Establishing eases DOWN to the DONE card with a highlight ring.
  {
    n: 8, kind: "output", stepLabel: "the output — forge's live dashboard", clipSec: 9.647, commands: [],
    isTerminal: false, isHeroOutput: true, backgroundColor: BG_OUTPUT_A,
    hero: {
      source: "assets/forge-demo/dashboard-all-done.html",
      sha256: "ebcca9d8416785fd0457eaffae93c0fd88a90a05d018b9e70a4b3251d4d2e93e",
      bytes: 23862,
      srcW: 440, srcH: 1284, holdSec: 1.5,
      focusStart: { cx: 0.5, cy: 0.45, zoom: 1.19 },
      focusEnd: { cx: 0.5, cy: 0.631, zoom: 1.17 },
      // DEMO-2 done card measured at srcW 440 (sx 0.075, sy 0.587, sw 0.85, sh 0.087); label ABOVE.
      highlight: { sx: 0.075, sy: 0.587, sw: 0.85, sh: 0.087, label: "Done — passed after 1 retry" },
    },
  },
  // 9 — PAYOFF. The reframe lands.
  {
    n: 9, kind: "payoff", stepLabel: "", clipSec: 5.457, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_TOOL,
    headline: "The model planned. Your tests judged.",
    sub: "No agent grading its own homework.",
  },
  // 10 — CTA. Repo + license.
  {
    n: 10, kind: "cta", stepLabel: "", clipSec: 5.828, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_TOOL,
    headline: "forge-harness",
    sub: "open-source · MIT · your tests decide what ships",
    url: "github.com/ziyilam3999/forge-harness",
  },
];

/**
 * The VO / caption text per beat (the caption-track SOURCE — the words shown/spoken). Stored for the
 * LATER (gated, PAID) VO leg; deliberately NOT fed into the spec's `onScreenText` (R9 dev-token scan),
 * exactly like #824 excludes the narration prose from `beatTextFields`.
 */
export const FORGE_VO_LINES: ReadonlyArray<string> = [
  "Ninety-six percent of us don't fully trust AI-written code — and barely half ever check it. forge-harness closes that gap: your tests decide what's done.",
  "First you shape the work. In Claude Code, forge's /prd skill asks a few plain multiple-choice questions and writes the spec with you — no blank page.",
  "Then forge_plan breaks the work down. Your spec becomes ordered phases, phases become user stories, and any story too big to verify is split into smaller ones — each ending in binary, pass-or-fail checks.",
  "Now watch it run. forge_evaluate executes your real shell commands — not a vibe check, your actual tests — and only a passing check moves a story forward.",
  "", // beat 5 transition — no words
  "This is forge's own dashboard — not a mockup, the file it writes on every run. Up top, the Forge Pulse breathes green while it works, and DEMO-2 is live right now.",
  "Watch DEMO-2. Retry means a check failed — forge shows you exactly which one and queues another attempt.",
  "Fix it, re-run, it passes and jumps to Done carrying its evidence. At a glance: same inputs, same verdict, every run.",
  "The model planned. Your tests judged. No agent grading its own homework.",
  "forge-harness. Open-source, MIT. Your tests decide what ships.",
];

// ── The DemoVideoSpec instance (fed to assertDemoCategoryRecipe — the build's test oracle) ─────────--

const RUNTIME_BAND = { min: 92, max: 100 } as const; // #944: VO-locked spine ≈ 93.9s (90.88s spoken + 3s transition)
const MAX_TERMINAL_FRACTION = 0.3;

/** The proven #824 caption fallback shape (R12) — declared real until the gated VO leg produces the
 *  real sync JSON. Mirrors `demoCategoryRecipe.fableCaptions()` field-for-field. */
export const FORGE_VO_BUNDLE = "out/review/forge-demo/forge-demo-vo-sync.json";
export const FORGE_RUNTIME_SEC = FORGE_BEATS.reduce((s, b) => s + b.clipSec, 0); // ≈ 93.882 (#944 VO-locked)

function forgeCaptions(): DemoCaptions {
  return {
    present: true,
    syncBoundToRealAudio: true,
    audio: { source: FORGE_VO_BUNDLE, real: true, durationSec: FORGE_RUNTIME_SEC },
    lastCueEndSec: FORGE_RUNTIME_SEC,
  };
}

/** The on-screen TEXT FIELDS a beat carries (label + title fields + chat request + chip) — mirrors
 *  #824's `demoOnScreenText`; the VO caption track is excluded (authored separately, R9-exempt). */
function forgeOnScreenText(b: ForgeBeat): string[] {
  return [b.stepLabel, b.headline ?? "", b.sub ?? "", b.url ?? "", b.chatRequest ?? "", b.chip ?? ""].filter(
    (t) => t.length > 0,
  );
}

/**
 * The forge hero beats are FULL-BLEED pan-zoom images that COVER the frame (no cream matte), so the
 * modeled key-content box is the 4-side title-safe band ending ABOVE the 9:16 caption band (the focus
 * rects keep the legible column inside it). Title beats are centered (fill:false); chat + terminal are
 * full-bleed (fill:true) reusing the proven #824 boxes so the shared fill / interior / caption-clear
 * cross-checks all hold.
 */
export const FORGE_BEAT_LAYOUTS: ReadonlyArray<FableBeatLayout> = [
  { beat: 1, kind: "title", content: { left: 120, top: 520, right: CAP_W - 120, bottom: 1400 }, fill: false },
  // beat 2 — the R1 Claude Code /prd TERMINAL (kind "terminal", NOT "chat": the messenger-fill checks no
  // longer model the rendered structure; the box still fills + is 4-side-safe).
  { beat: 2, kind: "terminal", content: { left: 90, top: 110, right: CAP_W - 90, bottom: CAP_H - 110 }, fill: true },
  // beat 3 — the R3 decomposition diagram (kind "diagram"; full-bleed dark tier flow).
  { beat: 3, kind: "diagram", content: { left: 72, top: 120, right: CAP_W - 72, bottom: 1700 }, fill: true },
  // beat 4 — the forge tool terminal.
  { beat: 4, kind: "terminal", content: { left: 108, top: 120, right: CAP_W - 108, bottom: CAP_H - 120 }, fill: true },
  // beats 6/7/8 — the live-dashboard pan-zoom heroes (beat 5 transition is transient → omitted, as before).
  { beat: 6, kind: "viewer-panzoom", content: { left: 54, top: 96, right: CAP_W - 54, bottom: 1400 }, fill: false },
  { beat: 7, kind: "viewer-panzoom", content: { left: 54, top: 96, right: CAP_W - 54, bottom: 1400 }, fill: false },
  { beat: 8, kind: "viewer-panzoom", content: { left: 54, top: 96, right: CAP_W - 54, bottom: 1400 }, fill: false },
  { beat: 9, kind: "title", content: { left: 120, top: 480, right: CAP_W - 120, bottom: 1440 }, fill: false },
  { beat: 10, kind: "title", content: { left: 120, top: 480, right: CAP_W - 120, bottom: 1440 }, fill: false },
];

function buildForgeSpec(): DemoVideoSpec {
  const beats: DemoBeat[] = FORGE_BEATS.map((b) => {
    const beat: DemoBeat = {
      n: b.n,
      kind: b.kind,
      // captured-footage spine: the tool beat is the real forge session and the hero beats are the real
      // captured dashboard; the title/chat/transition overlay edits ride on top.
      vehicle: b.kind === "tool" || b.isHeroOutput ? "captured-footage" : "overlay",
      backgroundColor: b.backgroundColor,
      label: b.stepLabel,
      onScreenText: forgeOnScreenText(b),
      commands: [...b.commands],
      durationSec: b.clipSec,
      isTerminal: b.isTerminal,
      isHeroOutput: b.isHeroOutput,
    };
    if (b.hero) {
      beat.provenance = { source: b.hero.source, real: true, sha256: b.hero.sha256, bytes: b.hero.bytes };
    }
    return beat;
  });

  return {
    task: 871,
    beats,
    aspects: FABLE_ASPECTS,
    beatLayouts: FORGE_BEAT_LAYOUTS,
    runtimeWindowSec: { ...RUNTIME_BAND },
    maxTerminalFraction: MAX_TERMINAL_FRACTION,
    captions: forgeCaptions(),
  };
}

/** The #871 forge demonstration video, as one `DemoVideoSpec` — fed to `assertDemoCategoryRecipe`. */
export const forgeSpec: DemoVideoSpec = buildForgeSpec();
