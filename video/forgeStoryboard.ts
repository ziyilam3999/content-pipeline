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
import { FABLE_ASPECTS, CHAT_CONTENT_BOX, type FableBeatLayout } from "./fableLayout";
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
  };
}

// ── The 9-beat storyboard (Phase-2 table of the parent plan, ~88s) ─────────────────────────────────
// 1 hook(7) · 2 chat/prd(13) · 3 tool(14,terminal) · 4 transition(3) · 5/6/7 hero dashboards(12/9/9) ·
// 8 payoff(11) · 9 cta(10) = 88s. Terminal = beat 3 = 14s = 15.9% (≤30%).

export const FORGE_BEATS: ReadonlyArray<ForgeBeat> = [
  // 1 — HOOK. Verification-debt framing (industry stat, sourced — NOT a forge metric).
  {
    n: 1, kind: "hook", stepLabel: "", clipSec: 7, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_TOOL,
    headline: "Your AI writes the code, then grades its own homework.",
    sub: "96% don't fully trust it — barely half ever check it.",
    chip: "Sonar State of Code, 2026",
  },
  // 2 — CHAT (/prd). The human answers a couple of plain multiple-choice prompts; a spec assembles.
  {
    n: 2, kind: "chat", stepLabel: "you → /prd · plain multiple-choice", clipSec: 13, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_CHAT,
    chatRequest: "Shape this into a spec — ask me a few multiple-choice questions.",
  },
  // 3 — TOOL. The spec feeds forge_plan; the agent implements; forge_evaluate RUNS the AC commands.
  {
    n: 3, kind: "tool", stepLabel: "forge-harness — the agent's interface, not yours", clipSec: 14,
    commands: ["forge_plan  --prd .forge/prd.md", "forge_evaluate  --story DEMO-2", "forge_status"],
    isTerminal: true, isHeroOutput: false, backgroundColor: BG_TOOL,
  },
  // 4 — TRANSITION. The verdict surfaces from the tool into the dashboard world (dark → cream).
  {
    n: 4, kind: "transition", stepLabel: "", clipSec: 3, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_OUTPUT_A,
  },
  // 5 — HERO #1. forge's REAL dashboard (working-green), LIVE: open on the WHOLE board (establishing —
  //     "see and feel the full kanban board") then PUSH into the breathing Forge Pulse (top-right). The
  //     live capture is what makes the three-hex respiration + ember actually breathe on screen.
  {
    n: 5, kind: "output", stepLabel: "the output — forge's live dashboard", clipSec: 12, commands: [],
    isTerminal: false, isHeroOutput: true, backgroundColor: BG_OUTPUT_A,
    hero: {
      source: "assets/forge-demo/dashboard-working-green.html",
      sha256: "b5871c30d6ffac005dce79b5cbbc7b982ab3e22a71b3fa1b777463795c7a2554",
      bytes: 22811,
      srcW: 680, srcH: 861, holdSec: 3.0,
      // ESTABLISHING → DETAIL. Start on the FULL board (zoom 1.0 = whole width, all 6 columns visible — no
      // empty-column risk because EVERYTHING is in frame), hold ~3s, then fly to the top-right breathing
      // Forge Pulse (the three respiring hexes + "live" caption). This is the ONE full-board shot ("show the
      // full screen once"); beats 6/7 go straight to detail.
      focusStart: { cx: 0.5, cy: 0.5, zoom: 1.0 },
      focusEnd: { cx: 0.825, cy: 0.06, zoom: 0.34 },
    },
  },
  // 6 — HERO #2. forge's REAL dashboard (idle/retry), LIVE: a column-locked push into the RETRY column
  //     DEMO-2 "1/3 retries / ✓ sum.js / 1 prior attempt(s), retrying" card (idle hexes breathe slow-grey).
  {
    n: 6, kind: "output", stepLabel: "the output — forge's live dashboard", clipSec: 9, commands: [],
    isTerminal: false, isHeroOutput: true, backgroundColor: BG_OUTPUT_A,
    hero: {
      source: "assets/forge-demo/dashboard-idle.html",
      sha256: "63c1e860ba00e47dc1278cac9aabaaa0ce4a442f53d3ce379f19ccaa8ab8d0be",
      bytes: 22473,
      srcW: 680, srcH: 861, holdSec: 1.0,
      // COLUMN-LOCKED detail (cx≈0.60, |Δcx|≈0): a gentle push-in onto the RETRY card. No full-board
      // re-establish (the operator wanted the whole board shown ONCE, in beat 5) and no horizontal sweep.
      focusStart: { cx: 0.6, cy: 0.4, zoom: 0.46 },
      focusEnd: { cx: 0.6, cy: 0.46, zoom: 0.32 },
    },
  },
  // 7 — HERO #3. forge's REAL dashboard (all-done), LIVE: a column-locked push into the DONE column DEMO-2
  //     "passed after 1 retry(ies)" payoff card (its yellow 1/3-retries badge proves the journey).
  {
    n: 7, kind: "output", stepLabel: "the output — forge's live dashboard", clipSec: 9, commands: [],
    isTerminal: false, isHeroOutput: true, backgroundColor: BG_OUTPUT_A,
    hero: {
      source: "assets/forge-demo/dashboard-all-done.html",
      sha256: "bf9ad323230371d30e23b2fe6b45bb222ded57b9e355982e530819cc56954339",
      bytes: 23216,
      srcW: 680, srcH: 985, holdSec: 1.0,
      // COLUMN-LOCKED detail (cx≈0.74, |Δcx|≈0): a push-in onto the DONE DEMO-2 payoff card. cx never
      // travels across columns; the left→right DEMO-2 journey is carried by the CUTS between beats 5/6/7.
      focusStart: { cx: 0.74, cy: 0.42, zoom: 0.48 },
      focusEnd: { cx: 0.74, cy: 0.5, zoom: 0.34 },
    },
  },
  // 8 — PAYOFF. The reframe lands.
  {
    n: 8, kind: "payoff", stepLabel: "", clipSec: 11, commands: [],
    isTerminal: false, isHeroOutput: false, backgroundColor: BG_TOOL,
    headline: "The model planned. Your tests judged.",
    sub: "No agent grading its own homework.",
  },
  // 9 — CTA. Repo + license.
  {
    n: 9, kind: "cta", stepLabel: "", clipSec: 10, commands: [],
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
  "First you shape the work. forge's /prd skill asks a few plain multiple-choice questions and writes the spec with you — no blank page.",
  "That spec feeds forge_plan. Eight building blocks — seven are plain code that never call the model; only planning does. Your shell commands are the pass/fail checks.",
  "", // beat 4 transition — no words
  "This is forge's own dashboard — not a mockup, the file it writes on every run. The whole board: real columns, real stories. And top-right, the Forge Pulse breathes green while it works — DEMO-2 is live right now.",
  "Watch DEMO-2. Retry means a check failed — forge shows you exactly which one and queues another attempt.",
  "Fix it, re-run, it passes and jumps to Done carrying its evidence. At a glance: same inputs, same verdict, every run.",
  "The model planned. Your tests judged. No agent grading its own homework.",
  "forge-harness. Open-source, MIT. Your tests decide what ships.",
];

// ── The DemoVideoSpec instance (fed to assertDemoCategoryRecipe — the build's test oracle) ─────────--

const RUNTIME_BAND = { min: 85, max: 92 } as const;
const MAX_TERMINAL_FRACTION = 0.3;

/** The proven #824 caption fallback shape (R12) — declared real until the gated VO leg produces the
 *  real sync JSON. Mirrors `demoCategoryRecipe.fableCaptions()` field-for-field. */
const FORGE_VO_BUNDLE = "out/review/forge-demo/forge-demo-vo-sync.json";
const FORGE_RUNTIME_SEC = FORGE_BEATS.reduce((s, b) => s + b.clipSec, 0); // 88

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
  { beat: 2, kind: "chat", content: CHAT_CONTENT_BOX, fill: true },
  { beat: 3, kind: "terminal", content: { left: 108, top: 120, right: CAP_W - 108, bottom: CAP_H - 120 }, fill: true },
  { beat: 5, kind: "viewer-panzoom", content: { left: 54, top: 96, right: CAP_W - 54, bottom: 1400 }, fill: false },
  { beat: 6, kind: "viewer-panzoom", content: { left: 54, top: 96, right: CAP_W - 54, bottom: 1400 }, fill: false },
  { beat: 7, kind: "viewer-panzoom", content: { left: 54, top: 96, right: CAP_W - 54, bottom: 1400 }, fill: false },
  { beat: 8, kind: "title", content: { left: 120, top: 480, right: CAP_W - 120, bottom: 1440 }, fill: false },
  { beat: 9, kind: "title", content: { left: 120, top: 480, right: CAP_W - 120, bottom: 1440 }, fill: false },
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
