/**
 * #1285 proof-first case-study — the storyboard SSOT for a SHORT-FORM PROOF clip that sells custom
 * automation services to local small-business owners by LEADING WITH THE RESULT a real business got. This
 * is a NEW arc template (additive only; touches NO existing post) and the FIRST-CLASS `proof` videoType:
 * it resolves to the 9:16 phone-native vertical master (burned-in captions) BY CONSTRUCTION via
 * `CONFIG.videoTypeAspects.proof` — closing the #1243 TODO where a 9:16 short was mislabeled
 * `videoType:"demo"`.
 *
 * The arc = a RESULT hook (the outcome in the first 1–2s) → the fixed Constraint→KPI→Proof→CTA story:
 *   1. constraint — what was slow / painful / done by hand before.
 *   2. kpi        — the measurable win (hours saved per week, dollars saved a month).
 *   3. proof      — show the automation actually running and producing that result.
 *   4. cta        — book a custom build (business email AnsonAndAI@gmail.com).
 * The LEAD FRAME is the RESULT, not a generic "watch an AI do X" opener: `PROOF_VO_LINES[0]` is byte-equal
 * to the result-hook beat's headline (a concrete hours/dollars figure), encoding "lead with the outcome."
 *
 * Why this arc uses `shape: "feature-tour"` (mechanically exact): `feature-tour` skips ONLY R3 (chat +
 * agent-interface tool) and R5 (explicit tool→output transition) — every other recipe rule still runs. A
 * proof case-study is a SALES story, not an agent-tool demo: it has NO chat / tool / transition beat. The
 * proof path is validated by `assertProofRecipe` (the `proof` arm of `assertDemoCategoryRecipe`), which
 * runs the SHARED geometry/caption/copy legs + the proof band + the proof-first invariants.
 *
 * CTA email handling: the CTA beat commits CTA COPY that includes the publishable BUSINESS email
 * `PROOF_CTA_EMAIL` (`AnsonAndAI@gmail.com`) — NOT the operator's personal email, and NO real client names
 * (generic small-biz language only). The email is a real, non-placeholder address, so R10 passes.
 *
 * Status: DESIGN spec — the structure deliverable. R6 is N/A on the proof path (no `isHeroOutput` beat);
 * the BAKE is green on PURE DATA with NO committed asset. The publish leg (capture real before/after +
 * proof footage, commit a provenance-hashed KPI results card, paid VO, PostSlug registration, append the
 * real booking URL to the CTA beat) is OUT of this slice and stays operator-gated (mirrors #1243).
 *
 * Pure data + tsc/jest-gated. NO Playwright / ffmpeg / network / paid call in this module.
 */

import { BG_TOOL, BG_OUTPUT_A } from "./fableStoryboard";
import { FABLE_ASPECTS, type FableBeatLayout } from "./fableLayout";
import {
  PROOF_CTA_EMAIL,
  type DemoVideoSpec,
  type DemoBeat,
  type DemoBeatKind,
  type DemoVehicle,
  type DemoCaptions,
} from "./demoCategoryRecipe";

export { PROOF_CTA_EMAIL };

export const CAP_W = 1080;
export const CAP_H = 1920;

/**
 * The FINE-GRAINED role each beat plays in THIS proof arc. The coarse recipe `DemoBeatKind` maps
 * constraint/kpi/proof all to `output`, so it is too blunt to key the arc order on — the order (AC2b) is
 * asserted on `arcRole`, while `kind` is the recipe role each maps to. `result-hook` is the proof-first
 * lead (the outcome up front); the four CORE roles are constraint → kpi → proof → cta.
 */
export type ProofArcRole = "result-hook" | "constraint" | "kpi" | "proof" | "cta";

/** The FULL canonical arc order (the SSOT the beats follow). The lead is the result hook; then the core 4. */
export const PROOF_ARC_ORDER: ReadonlyArray<ProofArcRole> = [
  "result-hook",
  "constraint",
  "kpi",
  "proof",
  "cta",
];

/** The load-bearing CORE arc — the four beats that MUST appear in exactly this relative order (AC2b). */
export const PROOF_CORE_ORDER: ReadonlyArray<ProofArcRole> = ["constraint", "kpi", "proof", "cta"];

/**
 * The proof-first ORDER ORACLE (non-vacuous, both-ends). Filters an arbitrary arc-role sequence to the
 * four CORE roles and THROWS unless they appear in EXACTLY `PROOF_CORE_ORDER`. A reordered spec (e.g. kpi
 * before constraint) fails here — so the order check is proven ENFORCED, not merely satisfied by the
 * happy path.
 */
export function assertProofArcOrder(roles: ReadonlyArray<ProofArcRole>): void {
  const core = roles.filter((r) => (PROOF_CORE_ORDER as ReadonlyArray<string>).includes(r));
  const expected = [...PROOF_CORE_ORDER];
  if (core.length !== expected.length || core.some((r, i) => r !== expected[i])) {
    throw new Error(
      `proof-arc-order: the four core beats must appear in EXACTLY [${expected.join(", ")}] order; got ` +
        `[${core.join(", ")}].`,
    );
  }
}

/** One ordered beat of the proof case-study (the SSOT the spec + the render derive from). */
export interface ProofBeat {
  /** 1-based beat number. */
  n: number;
  /** The fine-grained arc role (AC2b keys order on this). */
  arcRole: ProofArcRole;
  /** The coarse recipe beat role this maps to (drives the #870 recipe). */
  kind: DemoBeatKind;
  /** On-screen lower-third / label ("" for none). */
  stepLabel: string;
  /** Target rough-cut clip length (seconds). DESIGN target — re-locked via fitBeatsToVo after the paid VO. */
  clipSec: number;
  /** The big on-screen headline. For the result hook this IS a concrete hours/dollars figure. */
  headline?: string;
  /** Optional sub-line of context. */
  sub?: string;
  /** The production vehicle (captured-footage spine on constraint/proof; overlay stat card otherwise). */
  vehicle: DemoVehicle;
  /** The dominant background world color (brand=dark / output=cream). */
  backgroundColor: string;
}

// ── The 5-beat proof arc (RESULT lead, then Constraint → KPI → Proof → CTA) ──────────────────────────--
// 1 result-hook (LEAD: headline IS the outcome) · 2 constraint (captured) · 3 kpi (stat card) ·
// 4 proof (captured: the automation running) · 5 cta (copy + business email).
export const PROOF_BEATS: ReadonlyArray<ProofBeat> = [
  // 1 — RESULT HOOK. The scroll-stopper IS the outcome (a concrete hours figure). Dark brand world.
  {
    n: 1, arcRole: "result-hook", kind: "hook", stepLabel: "", clipSec: 5,
    vehicle: "overlay", backgroundColor: BG_TOOL,
    headline: "This bakery owner got back 6 hours a week.",
    sub: "Same team, same orders — just none of the daily busywork done by hand.",
  },
  // 2 — CONSTRAINT. The painful, by-hand-every-day task before anything was automated. Captured footage.
  {
    n: 2, arcRole: "constraint", kind: "output", stepLabel: "before", clipSec: 12,
    vehicle: "captured-footage", backgroundColor: BG_OUTPUT_A,
    headline: "Every order, retyped by hand. Every single day.",
    sub: "The repetitive task that quietly ate hours, before any of it was automated.",
  },
  // 3 — KPI. The quantified win (hours + dollars). A designed stat card (overlay). Cream output world.
  {
    n: 3, arcRole: "kpi", kind: "output", stepLabel: "the result", clipSec: 10,
    vehicle: "overlay", backgroundColor: BG_OUTPUT_A,
    headline: "6 hours a week. About $400 a month, back.",
    sub: "What the busywork was costing — returned straight to the owner.",
  },
  // 4 — PROOF. Show the automation actually running and producing that result. Captured footage.
  {
    n: 4, arcRole: "proof", kind: "output", stepLabel: "see it run", clipSec: 18,
    vehicle: "captured-footage", backgroundColor: BG_OUTPUT_A,
    headline: "Here it is, running on its own.",
    sub: "The same job — now handled automatically, start to finish.",
  },
  // 5 — CTA. Book a custom build. COPY + the business email (no booking URL yet; appended at publish time).
  {
    n: 5, arcRole: "cta", kind: "cta", stepLabel: "", clipSec: 7,
    vehicle: "overlay", backgroundColor: BG_TOOL,
    headline: "Want hours like these back?",
    sub: `Email ${PROOF_CTA_EMAIL} to book a custom build.`,
  },
];

/**
 * The VO / caption text per beat (the caption-track SOURCE). Stored for the LATER (gated, PAID) VO leg;
 * deliberately NOT fed into the spec's `onScreenText` beyond the headline/sub (R9 dev-token scan), exactly
 * like fable/kanban/localBiz. `PROOF_VO_LINES[i]` is the line for `PROOF_BEATS[i]`.
 *
 * AC2d — `PROOF_VO_LINES[0]` is BYTE-EQUAL to the result-hook beat's headline: the opening line is the
 * RESULT a real business got (a concrete hours figure), NOT a generic "watch an AI do X" opener.
 */
export const PROOF_VO_LINES: ReadonlyArray<string> = [
  // 1 result-hook — lead with the outcome (byte-equal to PROOF_BEATS[0].headline, AC2d marker).
  "This bakery owner got back 6 hours a week.",
  // 2 constraint
  "Here's the task that used to eat those hours — every order, retyped by hand, every single day.",
  // 3 kpi
  "Six hours a week. Around four hundred dollars a month. That's what the busywork was costing — handed straight back to the owner.",
  // 4 proof
  "And here it is, running entirely on its own. The same job, now handled automatically from start to finish.",
  // 5 cta
  `Want hours like these back? Email ${PROOF_CTA_EMAIL} and we'll build the same thing for your business.`,
];

// ── Layout (reuse fable/localBiz geometry — no new boxes) ────────────────────────────────────────────--
// Title beats (result-hook / cta) are centered (fill:false). The captured-footage + stat-card beats are
// FULL-BLEED (fill:true). The 9:16-spine boxes below clear the 4-side title-safe band on every aspect.
const TITLE_BOX = { left: 120, top: 520, right: CAP_W - 120, bottom: 1400 } as const;
const FULL_BLEED_BOX = { left: 90, top: 110, right: CAP_W - 90, bottom: CAP_H - 110 } as const;

export const PROOF_BEAT_LAYOUTS: ReadonlyArray<FableBeatLayout> = [
  { beat: 1, kind: "title", content: { ...TITLE_BOX }, fill: false },
  { beat: 2, kind: "footage", content: { ...FULL_BLEED_BOX }, fill: true },
  { beat: 3, kind: "footage", content: { ...FULL_BLEED_BOX }, fill: true },
  { beat: 4, kind: "footage", content: { ...FULL_BLEED_BOX }, fill: true },
  { beat: 5, kind: "title", content: { ...TITLE_BOX }, fill: false },
];

// ── The DemoVideoSpec instance (fed to assertDemoCategoryRecipe — the build's test oracle) ────────────--

const RUNTIME_BAND = { min: 48, max: 58 } as const; // 52s design target ∈ proof band {30,60}
const MAX_TERMINAL_FRACTION = 0.3;

export const PROOF_VO_BUNDLE = "out/review/proof/proof-vo-sync.json";
export const PROOF_RUNTIME_SEC = PROOF_BEATS.reduce((s, b) => s + b.clipSec, 0); // 52 (design target)

function proofCaptions(): DemoCaptions {
  return {
    present: true,
    syncBoundToRealAudio: true,
    audio: { source: PROOF_VO_BUNDLE, real: true, durationSec: PROOF_RUNTIME_SEC },
    lastCueEndSec: PROOF_RUNTIME_SEC,
  };
}

/** The on-screen TEXT FIELDS a beat carries (label + headline + sub). NO standalone URL field is emitted. */
function proofOnScreenText(b: ProofBeat): string[] {
  return [b.stepLabel, b.headline ?? "", b.sub ?? ""].filter((t) => t.length > 0);
}

export function buildProofSpec(): DemoVideoSpec {
  const beats: DemoBeat[] = PROOF_BEATS.map((b) => {
    const beat: DemoBeat = {
      n: b.n,
      kind: b.kind,
      vehicle: b.vehicle,
      backgroundColor: b.backgroundColor,
      label: b.stepLabel,
      onScreenText: proofOnScreenText(b),
      commands: [],
      durationSec: b.clipSec,
      isTerminal: false,
      // The proof path declares NO hero output beat — R6 is N/A on this branch. The publish leg promotes
      // the kpi beat to a committed, provenance-hashed results card (deferred, operator-gated).
      isHeroOutput: false,
    };
    return beat;
  });

  return {
    task: 1285,
    // feature-tour: a sales case-study with NO chat/tool/transition beat (R3/R5 skipped; every other rule runs).
    shape: "feature-tour",
    // #1285 — first-class proof videoType → resolves to the 9:16 master BY CONSTRUCTION (config SSOT).
    videoType: "proof",
    beats,
    aspects: FABLE_ASPECTS,
    beatLayouts: PROOF_BEAT_LAYOUTS,
    runtimeWindowSec: { ...RUNTIME_BAND },
    maxTerminalFraction: MAX_TERMINAL_FRACTION,
    captions: proofCaptions(),
  };
}

/** The #1285 proof case-study, as one `DemoVideoSpec` — fed to `assertDemoCategoryRecipe`. */
export const proofSpec: DemoVideoSpec = buildProofSpec();
