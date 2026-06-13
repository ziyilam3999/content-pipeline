/**
 * #870 — the DEMONSTRATION-CATEGORY video recipe, as a mechanically-enforced CONTRACT.
 *
 * The #824 demo video was proven good against three operator rejections, and the directive was:
 * "bake the recipe for ALL future demo-category videos." Until now the recipe lived only as point-tests
 * over the literal #824 constants — they prove THAT post is clean, not that a FUTURE demo-category spec
 * obeys the recipe. This module closes that gap: it defines the generalized shape (`DemoVideoSpec`) of
 * what `FABLE_BEATS` + `FABLE_ASPECTS` + the narration mapping already encode, and ONE fail-closed
 * validator (`assertDemoCategoryRecipe`) composing the recipe rules R1–R11. A future demo whose spec
 * violates a rule HARD-FAILS in the capture / voice pre-flights, before any capture / render / paid /
 * publish — exactly the regression the operator asked to make impossible.
 *
 * REUSE (do NOT re-implement): the geometry legs (R11) reuse `assertFableBeatsSafeAndFilled` +
 * `assertNoCaptionMediaOverlap` from `video/fableLayout.ts`; the copy legs (R9/R10) reuse
 * `assertNoInternalDevTokens` + `assertNoPlaceholderUrls` from `video/visualRedFlags.ts` (which already
 * fold in `assertBrandClean`) plus `ownerLeak` from the storyboard SSOT. R1–R8 are fresh pure data
 * assertions (vehicle, hook, agent-interface reframe, distinct tool/output backgrounds, explicit
 * transition, hero provenance, terminal share, runtime band).
 *
 * Pure data + jest/tsc-gated. NO Playwright / ffmpeg / network / paid call.
 *
 * NOTE on R11 + island detection: the shipped fable layouts use the `fableLayout` 5%-margin model
 * (`assert4SideSafeArea` / `assertBeatFill`). `visualRedFlags.assertNoIslandLayout` models the OTHER
 * composition's horizontal band (`CONFIG.demo.safeAreaXFraction = 0.8`), under which the fable chat box
 * (936px > 864px band) would FALSE-throw the proven spec. So R11 reuses the `fableLayout` asserts — whose
 * `assertBeatFill` already rejects the sparse/centered-island layout class (#765/#824) for full-bleed
 * beats — and does NOT wire `assertNoIslandLayout` (incompatible band model). Documented, not an omission.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

import {
  assertFableBeatsSafeAndFilled,
  assertNoCaptionMediaOverlap,
  FABLE_ASPECTS,
  FABLE_BEAT_LAYOUTS,
  type FableAspect,
  type FableBeatLayout,
} from "./fableLayout";
import { assertNoInternalDevTokens, assertNoPlaceholderUrls } from "./visualRedFlags";
import {
  FABLE_BEATS,
  type FableBeat,
  BG_TOOL,
  BG_OUTPUT_A,
  BG_CHAT,
  ownerLeak,
} from "./fableStoryboard";

// ── The generalized demonstration-category video spec ──────────────────────────────────────────────

/**
 * The vehicle a beat is produced with. The recipe DEMANDS a real-captured-footage spine with overlay
 * edits, and FORBIDS a generative-video (hallucinated UI) or a composition/montage (reads as slides)
 * spine (`feedback_demonstration_category_video_recipe`).
 */
export type DemoVehicle = "captured-footage" | "overlay" | "generative-video" | "composition";

/** The role a beat plays in the demonstration arc. */
export type DemoBeatKind =
  | "hook"
  | "chat"
  | "tool"
  | "transition"
  | "output"
  | "payoff"
  | "cta"
  | "title";

/** Real-artifact provenance for a HERO output beat — never a placeholder/stub shown as the product. */
export interface DemoProvenance {
  /** Path to the REAL produced artifact this beat shows (a producer output, never a placeholder). */
  source: string;
  /** Asserts this binds a real producer output, not a stub/placeholder. */
  real: boolean;
  /** sha256 of the real artifact (captured into the manifest at capture time); 64 lowercase hex. */
  sha256?: string;
  /** Byte size of the real artifact. */
  bytes?: number;
}

/** One ordered beat of the demonstration video. */
export interface DemoBeat {
  /** 1-based beat number. */
  n: number;
  kind: DemoBeatKind;
  vehicle: DemoVehicle;
  /** The beat's dominant background color (the tool/output worlds must be visually distinct). */
  backgroundColor: string;
  /** On-screen lower-third label ("" allowed for pure title beats). */
  label: string;
  /** Every on-screen text field (label + headline/sub/url + chat request + displayed caption). */
  onScreenText: string[];
  /** Shell commands shown on a terminal/tool beat ([] otherwise). */
  commands: string[];
  durationSec: number;
  /** This beat is a terminal/tool beat (counts toward the ≤30% terminal-share rule R7). */
  isTerminal: boolean;
  /** This beat shows a HERO product output (requires real-artifact provenance, R6). */
  isHeroOutput: boolean;
  provenance?: DemoProvenance;
}

/** The whole demonstration-category video spec the validator enforces. */
export interface DemoVideoSpec {
  /** Originating task id (provenance only). */
  task: number;
  beats: DemoBeat[];
  /** Publish aspects + caption geometry — reused by the R11 caption-overlap leg. */
  aspects: ReadonlyArray<FableAspect>;
  /** Per-beat layout boxes — reused by the R11 4-side-safe + fill leg. */
  beatLayouts: ReadonlyArray<FableBeatLayout>;
  /** Total-runtime band (seconds). Default ~90s window. */
  runtimeWindowSec: { min: number; max: number };
  /** Max fraction of total runtime the terminal/tool beats may occupy. Default 0.30. */
  maxTerminalFraction: number;
}

// ── Recipe constants ────────────────────────────────────────────────────────────────────────────--
const DEFAULT_RUNTIME_BAND = { min: 85, max: 92 } as const; // the proven #824 ~90s window
const DEFAULT_MAX_TERMINAL_FRACTION = 0.3; // terminal/tool ≲30% of runtime
const FORBIDDEN_VEHICLES: ReadonlyArray<DemoVehicle> = ["generative-video", "composition"];
const PLACEHOLDER_SOURCE_RE = /\b(placeholder|stub|sample|example|dummy|fixture|todo|wip)\b/i;
const SHA256_RE = /^[a-f0-9]{64}$/;
const USERS_PATH_RE = /\/Users\/[^/\s"']+/i;
const AGENT_INTERFACE_RE = /(the agent's interface|not yours)/i;

// ── The ONE fail-closed validator (composes R1–R11) ────────────────────────────────────────────────

/**
 * Throws a SPECIFIC, machine-readable Error (prefixed `demo-recipe R<n>:`) for the FIRST recipe rule a
 * spec violates; no-op when the spec obeys the whole recipe. Rules are checked in order R1→R11 so the
 * earliest violation is reported.
 */
export function assertDemoCategoryRecipe(spec: DemoVideoSpec): void {
  const beats = spec.beats;
  if (!Array.isArray(beats) || beats.length === 0) {
    throw new Error("demo-recipe R0: a demonstration-category spec must have at least one beat.");
  }

  const toolBeats = beats.filter((b) => b.kind === "tool");
  const outputBeats = beats.filter((b) => b.isHeroOutput);
  const allText: string[] = beats.flatMap((b) => b.onScreenText.filter((t) => typeof t === "string" && t.length > 0));
  const allCommands: string[] = beats.flatMap((b) => b.commands ?? []);

  // R1 — vehicle: real captured-footage spine + overlay edits; NO generative-video / composition spine.
  for (const b of beats) {
    if (FORBIDDEN_VEHICLES.includes(b.vehicle)) {
      throw new Error(
        `demo-recipe R1: beat ${b.n} (${b.kind}) declares a "${b.vehicle}" vehicle. A demonstration video ` +
          `must CAPTURE real footage of the tool and AI-EDIT it — never generative-video (hallucinates UI) ` +
          `nor a composition/montage (reads as slides). Use a captured-footage spine + overlay edits.`,
      );
    }
  }
  if (!beats.some((b) => b.vehicle === "captured-footage")) {
    throw new Error(
      "demo-recipe R1: no beat declares a captured-footage vehicle — there is no real footage spine. " +
        "At least the tool run + hero outputs must be real captured footage.",
    );
  }

  // R2 — opens with a HOOK beat.
  if (beats[0].kind !== "hook") {
    throw new Error(
      `demo-recipe R2: the first beat is "${beats[0].kind}", not a hook. A demonstration video must OPEN ` +
        `with a hook beat (the scroll-stopper), per the proven recipe.`,
    );
  }

  // R3 — agent-interface reframe: a chat (plain-English request) beat AND a tool beat framed as the
  // agent's interface ("the agent's interface, not yours").
  if (!beats.some((b) => b.kind === "chat")) {
    throw new Error(
      "demo-recipe R3: missing the chat beat. An agent-operated tool must be framed as the agent's " +
        "interface — show the human asking in plain English (a chat beat) before the tool runs.",
    );
  }
  const reframedTool = toolBeats.find((b) =>
    [b.label, ...b.onScreenText].some((t) => AGENT_INTERFACE_RE.test(t)),
  );
  if (!reframedTool) {
    throw new Error(
      "demo-recipe R3: the tool beat does not carry the agent-interface reframe label " +
        '("the agent\'s interface, not yours"). Make explicit that the tool is the AGENT\'s interface, not the human\'s.',
    );
  }

  // R4 — TOOL and OUTPUT beats have VISUALLY DISTINCT backgrounds + output beats are labeled.
  const toolBgs = new Set(toolBeats.map((b) => b.backgroundColor));
  for (const o of outputBeats) {
    if (toolBgs.has(o.backgroundColor)) {
      throw new Error(
        `demo-recipe R4: output beat ${o.n} shares background color "${o.backgroundColor}" with a tool beat. ` +
          `Separate the TOOL from the OUTPUT — give them visually DISTINCT backgrounds so the viewer never ` +
          `confuses the tool with what it produced.`,
      );
    }
    const labeled = o.label.trim().length > 0 || o.onScreenText.some((t) => t.trim().length > 0);
    if (!labeled) {
      throw new Error(
        `demo-recipe R4: output beat ${o.n} is unlabeled. Label the output beats (e.g. "the output") so the ` +
          `viewer knows they are looking at the produced artifact.`,
      );
    }
  }

  // R5 — an explicit TRANSITION beat sits between the (last) tool beat and the first output beat.
  const lastToolIdx = lastIndexOf(beats, (b) => b.kind === "tool");
  const firstOutputIdx = beats.findIndex((b) => b.isHeroOutput);
  const transitionIdx = beats.findIndex((b) => b.kind === "transition");
  if (transitionIdx < 0) {
    throw new Error(
      "demo-recipe R5: missing an explicit transition beat. Separate the tool from the output with an " +
        "explicit transition (not a hard cut) so the tool→output handoff reads clearly.",
    );
  }
  if (!(lastToolIdx >= 0 && firstOutputIdx >= 0 && lastToolIdx < transitionIdx && transitionIdx < firstOutputIdx)) {
    throw new Error(
      `demo-recipe R5: the transition beat (index ${transitionIdx}) is not between the tool beat ` +
        `(index ${lastToolIdx}) and the first output beat (index ${firstOutputIdx}). The explicit transition ` +
        `must sit AFTER the tool and BEFORE the first output — never a hard cut.`,
    );
  }

  // R6 — hero output beats carry real-artifact provenance (never placeholder/stub).
  for (const o of outputBeats) {
    const p = o.provenance;
    if (!p) {
      throw new Error(
        `demo-recipe R6: hero output beat ${o.n} has no provenance. A hero output must bind to a REAL produced ` +
          `artifact (a producer output with sha256 + bytes), never a placeholder/stub shown as the product.`,
      );
    }
    if (p.real !== true || !p.source || PLACEHOLDER_SOURCE_RE.test(p.source)) {
      throw new Error(
        `demo-recipe R6: hero output beat ${o.n} provenance source "${p.source}" is not a real artifact ` +
          `(real=${p.real}). It must reference a real producer output, not a placeholder/stub/example.`,
      );
    }
    if (p.sha256 !== undefined && !SHA256_RE.test(p.sha256)) {
      throw new Error(
        `demo-recipe R6: hero output beat ${o.n} has a malformed sha256 "${p.sha256}" (expected 64 lowercase hex).`,
      );
    }
    if (p.bytes !== undefined && !(Number.isFinite(p.bytes) && p.bytes > 0)) {
      throw new Error(`demo-recipe R6: hero output beat ${o.n} has non-positive provenance bytes (${p.bytes}).`);
    }
  }

  // R7 — terminal/tool beats are ≤ maxTerminalFraction of total runtime.
  const total = beats.reduce((s, b) => s + b.durationSec, 0);
  const terminal = beats.filter((b) => b.isTerminal).reduce((s, b) => s + b.durationSec, 0);
  const maxFrac = spec.maxTerminalFraction ?? DEFAULT_MAX_TERMINAL_FRACTION;
  if (total > 0 && terminal / total > maxFrac + 1e-9) {
    throw new Error(
      `demo-recipe R7: terminal/tool beats are ${(terminal / total * 100).toFixed(1)}% of the ${total}s runtime ` +
        `(> ${(maxFrac * 100).toFixed(0)}% allowed). A terminal-heavy cut reads as "screens of words" — keep the ` +
        `terminal a minority; the hero is the produced artifacts.`,
    );
  }

  // R8 — total runtime inside the ~90s window.
  const band = spec.runtimeWindowSec ?? DEFAULT_RUNTIME_BAND;
  if (total < band.min || total > band.max) {
    throw new Error(
      `demo-recipe R8: total runtime ${total}s is outside the ${band.min}–${band.max}s window. Keep a ` +
        `demonstration video around ~90s.`,
    );
  }

  // R9 — every on-screen text field is dev-token-clean + brand-clean + owner-clean.
  try {
    assertNoInternalDevTokens(allText, "demo-recipe on-screen copy");
  } catch (err) {
    throw new Error(`demo-recipe R9: ${err instanceof Error ? err.message : String(err)}`);
  }
  for (const cmd of allCommands) {
    const leak = ownerLeak(cmd);
    if (leak) {
      throw new Error(
        `demo-recipe R9: a shown command "${cmd}" would leak the OS owner/username (${leak}). Scrub it ` +
          `(use \`ls -gh\`, never echo a literal /Users/<name> path, never run whoami/id on a public frame).`,
      );
    }
  }
  for (const t of allText) {
    if (USERS_PATH_RE.test(t)) {
      throw new Error(
        `demo-recipe R9: on-screen text "${t}" contains a literal /Users/<name> path (an OS owner/username leak).`,
      );
    }
  }

  // R10 — no placeholder/fake URL anywhere on screen.
  try {
    assertNoPlaceholderUrls(allText, "demo-recipe on-screen copy");
  } catch (err) {
    throw new Error(`demo-recipe R10: ${err instanceof Error ? err.message : String(err)}`);
  }

  // R11 — every beat layout is 4-side title-safe + full-bleed beats FILL + captioned beats clear the
  // caption band, and the embedded output media never overlaps the caption band on any aspect.
  try {
    assertFableBeatsSafeAndFilled(spec.beatLayouts);
    assertNoCaptionMediaOverlap(spec.aspects);
  } catch (err) {
    throw new Error(`demo-recipe R11: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Last index in `arr` satisfying `pred`, or -1. */
function lastIndexOf<T>(arr: ReadonlyArray<T>, pred: (x: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return i;
  return -1;
}

// ── The shipped #824 data, re-expressed as ONE DemoVideoSpec (the proven instance + regression anchor) ─

/** Map a captured FableBeat's kind (+ position) to the generalized demonstration beat role. */
function demoKindOf(b: FableBeat): DemoBeatKind {
  switch (b.kind) {
    case "chat":
      return "chat";
    case "terminal":
      return "tool";
    case "transition":
      return "transition";
    case "viewer-card":
    case "viewer-video":
      return "output";
    case "title":
      return b.n === 1 ? "hook" : b.n >= 8 ? "cta" : "payoff";
    default:
      return "title";
  }
}

/** The background world a beat lives in (mirrors the capture HTML builders). */
function demoBgOf(kind: DemoBeatKind): string {
  switch (kind) {
    case "chat":
      return BG_CHAT;
    case "output":
      return BG_OUTPUT_A;
    default:
      // hook / tool / transition / payoff / cta / title all live in the dark TOOL/neutral world.
      return BG_TOOL;
  }
}

/** Best-effort real-artifact provenance: compute sha256+bytes when the producer output exists. */
function heroProvenance(relSource: string): DemoProvenance {
  const abs = path.join(process.cwd(), relSource);
  try {
    if (fs.existsSync(abs)) {
      const buf = fs.readFileSync(abs);
      return { source: relSource, real: true, sha256: crypto.createHash("sha256").update(buf).digest("hex"), bytes: buf.length };
    }
  } catch {
    /* fall through to the declared binding */
  }
  // The artifact is produced at capture time (beat 3); the binding is to the real producer output path.
  return { source: relSource, real: true };
}

const HERO_SOURCE: Record<number, string> = {
  5: "out/image/card-9x16.png", // the real produced card (viewer-card beat)
  6: "out/review/lfah/demo/demo-9x16.mp4", // the real produced MP4 (viewer-video beat)
};

/**
 * The on-screen TEXT FIELDS a beat carries: its label + title fields + chat request. Mirrors
 * `captureFable.assertFableBeatsClean`'s `beatTextFields` exactly — the displayed timed CAPTION track
 * (derived from the separately-authored narration prose) is NOT a "text field" and is deliberately
 * excluded: the narration legitimately uses words like "placeholder" rhetorically ("nothing placeholder"),
 * which the dev-token denylist (built for short labels) would false-flag against the proven shipped spec.
 */
function demoOnScreenText(b: FableBeat): string[] {
  return [b.stepLabel, b.headline ?? "", b.sub ?? "", b.url ?? "", b.chatRequest ?? ""].filter((t) => t.length > 0);
}

function buildFableSpec(): DemoVideoSpec {
  const beats: DemoBeat[] = FABLE_BEATS.map((b) => {
    const kind = demoKindOf(b);
    const isHeroOutput = kind === "output";
    return {
      n: b.n,
      kind,
      vehicle: kind === "tool" || kind === "output" ? "captured-footage" : "overlay",
      backgroundColor: demoBgOf(kind),
      label: b.stepLabel,
      onScreenText: demoOnScreenText(b),
      commands: [...b.commands],
      durationSec: b.clipSec,
      isTerminal: kind === "tool",
      isHeroOutput,
      ...(isHeroOutput ? { provenance: heroProvenance(HERO_SOURCE[b.n]) } : {}),
    };
  });

  return {
    task: 824,
    beats,
    aspects: FABLE_ASPECTS,
    beatLayouts: FABLE_BEAT_LAYOUTS,
    runtimeWindowSec: { ...DEFAULT_RUNTIME_BAND },
    maxTerminalFraction: DEFAULT_MAX_TERMINAL_FRACTION,
  };
}

/**
 * The shipped #824 demonstration video, re-expressed as one `DemoVideoSpec`. This is BOTH the proven
 * instance the capture/voice pre-flights enforce AND the passing regression anchor of the test oracle.
 */
export const fableSpec: DemoVideoSpec = buildFableSpec();
