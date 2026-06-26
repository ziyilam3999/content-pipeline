/**
 * #1243 local-biz automation pitch — the storyboard SSOT for a SHORT-FORM SALES arc that sells custom
 * automation services to local small-business owners. This is a NEW arc template; it touches NO existing
 * post (additive only).
 *
 * Why this arc uses `shape: "feature-tour"` (a slight semantic stretch, mechanically exact): the recipe's
 * `feature-tour` shape (`video/demoCategoryRecipe.ts`) skips ONLY R3 (chat + agent-interface tool) and R5
 * (explicit tool→output transition) — every other recipe rule still runs. This is a SALES PITCH, not an
 * agent-tool demo: it legitimately has NO chat / tool / transition beat, so `feature-tour` is the intended,
 * already-existing escape hatch (NOT a new videoType, NOT an edit to the shared validator). The doc comment
 * on `DemoSpecShape` ties feature-tour to "a live product surface"; we reuse it for a sales arc because the
 * mechanical effect (skip R3/R5, keep R1/R2/R4/R6/R7/R8/R9/R10/R11/R12/R13) is exactly what this arc needs.
 *
 * The arc = hook → before/after → time+money saved → real use cases, with a payoff + CTA bookend. The LEAD
 * FRAME is a concrete time/money number: beat 1's headline IS a number (R2 forces the hook to be beat 1), and
 * a dedicated quantified time-money beat (beat 3) is the arc's hero emphasis — so the number both OPENS the
 * video and ANCHORS its middle.
 *
 * CTA URL handling (#1243 MED-1): `DemoBeat` has no `url` field — URLs live as strings inside `onScreenText`,
 * and R10 (`assertNoPlaceholderUrls`) scans every entry but is a no-op when no URL/placeholder token is
 * present. This arc has no operator-supplied booking URL yet, so the CTA beat commits CTA COPY ONLY ("Book a
 * free automation audit") with NO URL string in `onScreenText` — keeping R10 vacuously satisfied. The real
 * booking URL is appended to the CTA beat at PUBLISH time (operator-input, deferred). Do NOT add a stub /
 * `<...>` / `example.*` / `your-*` / `placeholder` / `TODO` URL (all denylisted by R10).
 *
 * Status: DESIGN spec — the structure deliverable. R6 is vacuous (the core slice declares NO `isHeroOutput`
 * beat), so the BAKE is green on PURE DATA with NO committed asset. The publish leg (capture real before/after
 * + use-case footage, generate + commit a provenance-hashed time-money results card, paid VO, PostSlug
 * registration) is OUT of this slice and stays operator-gated.
 *
 * Pure data + tsc/jest-gated. NO Playwright / ffmpeg / network / paid call in this module.
 */

import { BG_TOOL, BG_OUTPUT_A } from "./fableStoryboard";
import { FABLE_ASPECTS, type FableBeatLayout } from "./fableLayout";
import type { DemoVideoSpec, DemoBeat, DemoBeatKind, DemoVehicle, DemoCaptions } from "./demoCategoryRecipe";

export const CAP_W = 1080;
export const CAP_H = 1920;

/**
 * The FINE-GRAINED role each beat plays in THIS sales arc. The coarse recipe `DemoBeatKind` is too blunt to
 * key the arc order on — before-after / time-money / use-cases all map to `output` — so the arc's order
 * (AC2) is asserted on `arcRole`, while `kind` is the recipe role each maps to.
 */
export type LocalBizArcRole =
  | "hook"
  | "before-after"
  | "time-money"
  | "use-cases"
  | "payoff"
  | "cta";

/** The canonical arc order (AC2 oracle). Core arc = the first four; payoff/cta are the standard bookends. */
export const LOCALBIZ_ARC_ORDER: ReadonlyArray<LocalBizArcRole> = [
  "hook",
  "before-after",
  "time-money",
  "use-cases",
  "payoff",
  "cta",
];

/** One ordered beat of the local-biz automation pitch (the SSOT the spec + the render derive from). */
export interface LocalBizBeat {
  /** 1-based beat number. */
  n: number;
  /** The fine-grained arc role (AC2 keys order on this). */
  arcRole: LocalBizArcRole;
  /** The coarse recipe beat role this maps to (drives the #870 recipe). */
  kind: DemoBeatKind;
  /** On-screen lower-third / label ("" for none). */
  stepLabel: string;
  /** Target rough-cut clip length (seconds). DESIGN target — re-locked via fitBeatsToVo after the paid VO. */
  clipSec: number;
  /** The big on-screen headline (title/card beats). For the hook this IS a concrete time/money number. */
  headline?: string;
  /** Optional sub-line of context. */
  sub?: string;
  /** The production vehicle (captured-footage spine on before/after + use-cases; overlay otherwise). */
  vehicle: DemoVehicle;
  /** The dominant background world color (tool=dark / output=cream). */
  backgroundColor: string;
}

// ── The 6-beat sales arc (time+money is the LEAD frame AND the hero-emphasis middle) ───────────────────
// 1 hook (LEAD: headline IS a number) · 2 before/after (captured) · 3 time-money (hero emphasis) ·
// 4 use-cases (captured) · 5 payoff bookend · 6 cta bookend (copy only — NO url, R10 vacuous).
export const LOCALBIZ_BEATS: ReadonlyArray<LocalBizBeat> = [
  // 1 — HOOK. The scroll-stopper IS the number (a concrete time figure). Dark brand world.
  {
    n: 1, arcRole: "hook", kind: "hook", stepLabel: "", clipSec: 8,
    vehicle: "overlay", backgroundColor: BG_TOOL,
    headline: "This shop owner got back 5 hours a week.",
    sub: "Same staff. Same hours open. Just less busywork by hand.",
  },
  // 2 — BEFORE / AFTER. Real captured footage: the MANUAL before vs the AUTOMATED after. Cream output world.
  {
    n: 2, arcRole: "before-after", kind: "output", stepLabel: "before → after", clipSec: 18,
    vehicle: "captured-footage", backgroundColor: BG_OUTPUT_A,
    headline: "By hand, every day. Now it runs itself.",
    sub: "The repetitive task before — then the same job, automated.",
  },
  // 3 — TIME + MONEY (HERO emphasis). The quantified payoff card. Overlay (a designed stat card). Cream world.
  {
    n: 3, arcRole: "time-money", kind: "output", stepLabel: "time + money saved", clipSec: 18,
    vehicle: "overlay", backgroundColor: BG_OUTPUT_A,
    headline: "5 hrs a week. $320 a month, back.",
    sub: "What that busywork was quietly costing — returned to the owner.",
  },
  // 4 — USE CASES. 3–4 concrete real automations. Real captured footage. Cream world.
  {
    n: 4, arcRole: "use-cases", kind: "output", stepLabel: "real use cases", clipSec: 22,
    vehicle: "captured-footage", backgroundColor: BG_OUTPUT_A,
    headline: "Missed-call text-back. Review requests. Invoice follow-ups. Booking reminders.",
    sub: "Four everyday jobs, handled automatically.",
  },
  // 5 — PAYOFF bookend. Recap. Dark brand world.
  {
    n: 5, arcRole: "payoff", kind: "payoff", stepLabel: "", clipSec: 12,
    vehicle: "overlay", backgroundColor: BG_TOOL,
    headline: "Your time back. Their busywork, automated.",
    sub: "Custom automation, built for how your shop actually runs.",
  },
  // 6 — CTA bookend. COPY ONLY — NO url (the real booking URL is appended at publish time, operator-input).
  {
    n: 6, arcRole: "cta", kind: "cta", stepLabel: "", clipSec: 8,
    vehicle: "overlay", backgroundColor: BG_TOOL,
    headline: "Book a free automation audit.",
    sub: "See what an hour of your week is worth back.",
  },
];

/**
 * The VO / caption text per beat (the caption-track SOURCE). Stored for the LATER (gated, PAID) VO leg;
 * deliberately NOT fed into the spec's `onScreenText` (R9 dev-token scan), exactly like fable/kanban.
 * `LOCALBIZ_VO_LINES[i]` is the line for `LOCALBIZ_BEATS[i]`. Keep load-bearing lines lean.
 */
export const LOCALBIZ_VO_LINES: ReadonlyArray<string> = [
  // 1 hook — lead with the number
  "This shop owner got back five hours a week — same staff, same hours, just none of the repetitive work done by hand.",
  // 2 before / after
  "Here's the task that used to eat those hours, done by hand every single day. And here's the same job now — it just runs itself.",
  // 3 time-money (hero)
  "Five hours a week. Around three hundred and twenty dollars a month. That's what the busywork was quietly costing — handed straight back to the owner.",
  // 4 use-cases
  "And it's not one thing. Missed-call text-backs, review requests, invoice follow-ups, booking reminders — the everyday jobs, all handled automatically.",
  // 5 payoff
  "Your time back. Their busywork, automated. Custom-built for how your shop actually runs.",
  // 6 cta
  "Book a free automation audit, and see what an hour of your week is worth back to you.",
];

// ── Layout (reuse fable/kanban geometry — no new boxes) ────────────────────────────────────────────────
// Title beats (hook/payoff/cta) are centered (fill:false). The captured-footage + stat-card beats are
// FULL-BLEED (fill:true) — real footage / a designed card genuinely fills the frame (like fable's terminal
// beat), so they are NOT inset device-subject beats and carry NO `insetAsset` (R18 vacuous, frame-economy
// floor N/A). The 9:16-spine boxes below clear the 4-side title-safe band on every aspect.
const TITLE_BOX = { left: 120, top: 520, right: CAP_W - 120, bottom: 1400 } as const;
const FULL_BLEED_BOX = { left: 90, top: 110, right: CAP_W - 90, bottom: CAP_H - 110 } as const;

export const LOCALBIZ_BEAT_LAYOUTS: ReadonlyArray<FableBeatLayout> = [
  { beat: 1, kind: "title", content: { ...TITLE_BOX }, fill: false },
  { beat: 2, kind: "footage", content: { ...FULL_BLEED_BOX }, fill: true },
  { beat: 3, kind: "footage", content: { ...FULL_BLEED_BOX }, fill: true },
  { beat: 4, kind: "footage", content: { ...FULL_BLEED_BOX }, fill: true },
  { beat: 5, kind: "title", content: { ...TITLE_BOX }, fill: false },
  { beat: 6, kind: "title", content: { ...TITLE_BOX }, fill: false },
];

// ── The DemoVideoSpec instance (fed to assertDemoCategoryRecipe — the build's test oracle) ──────────────

const RUNTIME_BAND = { min: 78, max: 96 } as const; // ~86s design target ∈ demo band {110,180}'s spirit; sub-110 pinned like fable {85,92} / forge {92,100}
const MAX_TERMINAL_FRACTION = 0.3;

export const LOCALBIZ_VO_BUNDLE = "out/review/localbiz/localbiz-vo-sync.json";
export const LOCALBIZ_RUNTIME_SEC = LOCALBIZ_BEATS.reduce((s, b) => s + b.clipSec, 0); // 86 (design target)

function localBizCaptions(): DemoCaptions {
  return {
    present: true,
    syncBoundToRealAudio: true,
    audio: { source: LOCALBIZ_VO_BUNDLE, real: true, durationSec: LOCALBIZ_RUNTIME_SEC },
    lastCueEndSec: LOCALBIZ_RUNTIME_SEC,
  };
}

/** The on-screen TEXT FIELDS a beat carries (label + headline + sub). NO url field is EVER emitted (MED-1). */
function localBizOnScreenText(b: LocalBizBeat): string[] {
  return [b.stepLabel, b.headline ?? "", b.sub ?? ""].filter((t) => t.length > 0);
}

export function buildLocalBizSpec(): DemoVideoSpec {
  const beats: DemoBeat[] = LOCALBIZ_BEATS.map((b) => {
    const beat: DemoBeat = {
      n: b.n,
      kind: b.kind,
      vehicle: b.vehicle,
      backgroundColor: b.backgroundColor,
      label: b.stepLabel,
      onScreenText: localBizOnScreenText(b),
      commands: [],
      durationSec: b.clipSec,
      isTerminal: false,
      // Core slice declares NO hero output beat — R6 is vacuous (structurally honest; no committed stub). The
      // publish leg promotes the time-money beat to a committed, provenance-hashed results card (deferred).
      isHeroOutput: false,
    };
    return beat;
  });

  return {
    task: 1243,
    // feature-tour: a sales arc with NO chat/tool/transition beat, so R3/R5 are skipped (every other rule runs).
    shape: "feature-tour",
    // #1243 MED-2: mirror kanban — a 9:16 FABLE_ASPECTS short paired with videoType:"demo" (precedented, green).
    // The output-aspect/videoType canonicalization is a PUBLISH-leg follow-up, not a BAKE concern.
    videoType: "demo",
    beats,
    aspects: FABLE_ASPECTS,
    beatLayouts: LOCALBIZ_BEAT_LAYOUTS,
    runtimeWindowSec: { ...RUNTIME_BAND },
    maxTerminalFraction: MAX_TERMINAL_FRACTION,
    captions: localBizCaptions(),
  };
}

/** The #1243 local-biz automation pitch, as one `DemoVideoSpec` — fed to `assertDemoCategoryRecipe`. */
export const localBizSpec: DemoVideoSpec = buildLocalBizSpec();
