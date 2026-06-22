/**
 * #1120 agent-kanban demo (v2 "feature tour") — the build's test ORACLE.
 *
 *  (1) RECIPE: the v2 kanban `DemoVideoSpec` passes the #870 demonstration-category recipe under the
 *      FEATURE-TOUR shape (R1/R2/R4/R6–R13); R3/R5 (chat/tool/transition) are carved out for this shape ONLY.
 *      BOTH-ENDS: toggling kanban back to the strict "tool-demo" shape FAILS on R3 (proves the carve-out is
 *      per-spec opt-in, not a gate weakening) — fableSpec/forgeSpec (strict) stay green in their own tests.
 *  (2) SAFE-AREA + FRAME-ECONOMY: every kanban beat layout is 4-side title-safe; the board-subject beats fill
 *      the frame.
 *  (3) PROVENANCE: the ONE committed hero still (beat 6) byte-for-byte matches its declared sha256 + bytes, and
 *      the declared srcW/srcH equal the committed PNG's IHDR pixel dimensions (the bbox-truthful-dims gate).
 *  (4) SHAPE: 10 beats, hook first, captured-footage spine, exactly 1 hero output (beat 6), beats 4/7/8 dynamic
 *      non-hero, runtime in the 74–84s band, terminal share 0%.
 *  (5) GLYPH (Rule-19 pixels): the ◆ REVIEW · PASS verdict text is actually DRAWN on the committed PNG's In
 *      Review region (a dependency-free pixel decode), not merely declared — discriminated against the gray
 *      subject line directly below it.
 *
 * Pure data-structure + filesystem + a stdlib (zlib) PNG decode — NO Playwright / ffmpeg / network / paid call.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

import { assertDemoCategoryRecipe, assertPhoneFullScreenAspectDiscipline, type DemoVideoSpec } from "../demoCategoryRecipe";
import {
  assertFableBeatsSafeAndFilled,
  assertFrameEconomy,
  isDeviceSubjectBeat,
  safeAreaBox,
  MIN_SUBJECT_FILL_HEIGHT_FRACTION,
  FABLE_ASPECTS,
  type FableBeatLayout,
} from "../fableLayout";
import {
  kanbanSpec,
  KANBAN_BEATS,
  KANBAN_BEAT_LAYOUTS,
  kanbanClipDeviceRect,
  KANBAN_CARD_CLIP,
  KANBAN_DRAWER_CLIP,
  KANBAN_VO_SEG_SEC,
  KANBAN_TRANSITION_SEC,
  KANBAN_RUNTIME_SEC,
} from "../kanbanStoryboard";
import { decodePng, countMatching, isVerdictGreen } from "../pngProbe";

const REPO_ROOT = process.cwd();

describe("#1120 kanban demo-category recipe (14-beat tool-demo)", () => {
  test("kanbanSpec PASSES the strict tool-demo recipe (chat + tool + transition present)", () => {
    expect(kanbanSpec.shape).toBeUndefined(); // NOT feature-tour — the strict R3/R5 path applies
    expect(() => assertDemoCategoryRecipe(kanbanSpec)).not.toThrow();
  });

  test("BOTH-ENDS: stripping the chat beat FAILS R3 (proves R3/R5 are really enforced, not carved out)", () => {
    const noChat: DemoVideoSpec = { ...kanbanSpec, beats: kanbanSpec.beats.filter((b) => b.kind !== "chat") };
    expect(() => assertDemoCategoryRecipe(noChat)).toThrow(/demo-recipe R3/);
  });

  test("every kanban beat layout is 4-side title-safe + the full-bleed beats FILL", () => {
    expect(() => assertFableBeatsSafeAndFilled(KANBAN_BEAT_LAYOUTS)).not.toThrow();
  });

  test("kanbanSpec has the 14-beat tool-demo shape (hook first, chat/tool/transition present, 1 hero = beat 6)", () => {
    expect(kanbanSpec.beats.length).toBe(14);
    expect(kanbanSpec.beats[0].kind).toBe("hook");
    expect(kanbanSpec.beats.some((b) => b.vehicle === "captured-footage")).toBe(true);
    // The 14-beat cut RESTORES the agent-interface reframe: chat (beat 2) + tool (beat 3) + transition (beat 4).
    expect(kanbanSpec.beats.some((b) => b.kind === "chat")).toBe(true);
    expect(kanbanSpec.beats.some((b) => b.kind === "tool")).toBe(true);
    expect(kanbanSpec.beats.some((b) => b.kind === "transition")).toBe(true);
    // Exactly ONE hero (committed still) output = beat 6; the clip beats (5/7/9/11) are NON-hero dynamic clips.
    const heroes = kanbanSpec.beats.filter((b) => b.isHeroOutput);
    expect(heroes.map((b) => b.n)).toEqual([6]);
    for (const h of heroes) expect(h.provenance?.real).toBe(true);
    for (const n of [5, 7, 9, 11]) expect(KANBAN_BEATS.find((b) => b.n === n)!.isHeroOutput).toBe(false);
    // Only beat 6 carries the committed `hero`; beats 8/10/12 are gitignored stills (no provenance churn).
    expect(KANBAN_BEATS.filter((b) => b.hero).map((b) => b.n)).toEqual([6]);
    for (const n of [8, 10, 12]) expect(KANBAN_BEATS.find((b) => b.n === n)!.still).toBeDefined();
    for (const n of [5, 7, 9, 11]) expect(KANBAN_BEATS.find((b) => b.n === n)!.clipSource).toBeDefined();
  });

  test("runtime is in the 130–150s band and terminal share is the single tool beat (≤30%)", () => {
    const total = kanbanSpec.beats.reduce((s, b) => s + b.durationSec, 0);
    expect(total).toBe(140);
    expect(total).toBeGreaterThanOrEqual(130);
    expect(total).toBeLessThanOrEqual(150);
    const terminal = kanbanSpec.beats.filter((b) => b.isTerminal).reduce((s, b) => s + b.durationSec, 0);
    expect(terminal).toBe(8); // beat 3 only
    expect(terminal / total).toBeLessThanOrEqual(0.3);
  });

  test("captions carry the R12 fallback shape (durationSec == runtime, lastCue bound)", () => {
    const c = kanbanSpec.captions;
    expect(c.present).toBe(true);
    expect(c.syncBoundToRealAudio).toBe(true);
    expect(c.audio.real).toBe(true);
    expect(c.audio.durationSec).toBe(140);
    expect(Math.abs(c.lastCueEndSec - c.audio.durationSec)).toBeLessThanOrEqual(0.5);
  });
});

// ── frame-economy gate (board subjects fill the frame — no thin strip in empty cream) ─────────────────
describe("#1120 kanban frame-economy gate", () => {
  const safe = safeAreaBox();
  const SAFE_H = safe.bottom - safe.top;

  test("every shipped kanban board-subject beat passes the frame-economy band", () => {
    expect(() => assertFrameEconomy(KANBAN_BEAT_LAYOUTS)).not.toThrow();
  });

  test("the board-subject beats (viewer-*) are economy-checked; title beats are exempt", () => {
    const subjects = KANBAN_BEAT_LAYOUTS.filter((l) => isDeviceSubjectBeat(l.kind)).map((l) => l.beat);
    expect(subjects.sort((a, b) => a - b)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
    expect(isDeviceSubjectBeat("title")).toBe(false);
  });

  // BOTH-ENDS (#1071 carried in): the OLD landscape geometry FAILS the gate, the NEW portrait clip PASSES.
  test("BOTH-ENDS: OLD landscape (~⅓ fill) FAILS, NEW portrait clip (≥60% fill) PASSES", () => {
    const oldLandscape = kanbanClipDeviceRect(1280, 800);
    const oldFill = (oldLandscape.bottom - oldLandscape.top) / SAFE_H;
    expect(oldFill).toBeLessThan(MIN_SUBJECT_FILL_HEIGHT_FRACTION);
    const oldLayout: FableBeatLayout = { beat: 7, kind: "viewer-video", content: oldLandscape, fill: false };
    expect(() => assertFrameEconomy([oldLayout])).toThrow(/#1071 frame-economy/);

    const newPortrait = kanbanClipDeviceRect(KANBAN_CARD_CLIP.w, KANBAN_CARD_CLIP.h);
    const newFill = (newPortrait.bottom - newPortrait.top) / SAFE_H;
    expect(newFill).toBeGreaterThanOrEqual(MIN_SUBJECT_FILL_HEIGHT_FRACTION);
    const newLayout: FableBeatLayout = { beat: 7, kind: "viewer-video", content: newPortrait, fill: false };
    expect(() => assertFrameEconomy([newLayout])).not.toThrow();
    // eslint-disable-next-line no-console
    console.log(`[frame-economy both-ends] OLD landscape fill=${(oldFill * 100).toFixed(1)}% (FAILS) → NEW portrait fill=${(newFill * 100).toFixed(1)}% (PASSES); floor=${(MIN_SUBJECT_FILL_HEIGHT_FRACTION * 100).toFixed(0)}%`);
  });
});

// ── #1120 / #1092 CONTAIN-assert: no board beat can slice the board L/R ───────────────────────────────
// The recurring left-edge "haircut" bug: a board asset COVER-framed in a device of a DIFFERENT aspect crops
// sideways. The both-ends lock: (a) every board beat's asset aspect ≤ its device-box aspect (so a cover fit
// only ever crops VERTICALLY, never L/R); (b) every DYNAMIC clip beat's device is the EXACT contain-fit of the
// clip (kanbanClipDeviceRect) so device-aspect == clip-aspect — a cover-framed clip (the old beat-8 drawer in
// WIDE_BOARD_DEVICE) FAILS by construction.
describe("#1120 kanban CONTAIN-assert (no L/R board slice)", () => {
  const EPS = 0.01;
  const deviceAspect = (n: number): number => {
    const l = KANBAN_BEAT_LAYOUTS.find((x) => x.beat === n)!;
    return (l.content.right - l.content.left) / (l.content.bottom - l.content.top);
  };
  const boardBeats = KANBAN_BEATS.filter((b) => b.kind === "output");

  test("every board beat's asset aspect ≤ its device-box aspect (cover crops only vertically, never L/R)", () => {
    for (const b of boardBeats) {
      const da = deviceAspect(b.n);
      const assetAspect = b.clipSource
        ? b.clipW! / b.clipH!
        : (b.hero ?? b.still)!.srcW / (b.hero ?? b.still)!.srcH;
      expect(assetAspect).toBeLessThanOrEqual(da + EPS);
    }
  });

  test("every DYNAMIC clip board beat is CONTAIN-framed (device aspect == clip aspect — no L/R slice)", () => {
    for (const b of boardBeats.filter((x) => x.clipSource)) {
      const da = deviceAspect(b.n);
      const ca = b.clipW! / b.clipH!;
      expect(Math.abs(da - ca)).toBeLessThanOrEqual(EPS);
    }
  });

  test("BOTH-ENDS: a clip COVER-framed in WIDE_BOARD_DEVICE FAILS; kanbanClipDeviceRect PASSES", () => {
    const clipAspect = KANBAN_DRAWER_CLIP.w / KANBAN_DRAWER_CLIP.h;
    // the OLD bug: drawer clip in the 90%-wide board device (a different, wider aspect) → cover-frame.
    const wide = KANBAN_BEAT_LAYOUTS.find((x) => x.beat === 6)!.content; // WIDE_BOARD_DEVICE-shaped panzoom box
    const wideAspect = (wide.right - wide.left) / (wide.bottom - wide.top);
    expect(Math.abs(wideAspect - clipAspect)).toBeGreaterThan(EPS); // FAILS the contain check
    // the FIX: a device sized to the clip's exact aspect.
    const fit = kanbanClipDeviceRect(KANBAN_DRAWER_CLIP.w, KANBAN_DRAWER_CLIP.h);
    const fitAspect = (fit.right - fit.left) / (fit.bottom - fit.top);
    expect(Math.abs(fitAspect - clipAspect)).toBeLessThanOrEqual(EPS); // PASSES
  });
});

// ── spine↔VO sync SSOT consistency ────────────────────────────────────────────────────────────────────
describe("#1120 kanban spine↔VO sync SSOT", () => {
  test("every beat's clipSec equals KANBAN_VO_SEG_SEC[n] (beat 4 is the 1s silent transition)", () => {
    expect(KANBAN_TRANSITION_SEC).toBe(1);
    const transition = KANBAN_BEATS.find((b) => b.kind === "transition")!;
    expect(transition.n).toBe(4);
    expect(transition.clipSec).toBe(KANBAN_TRANSITION_SEC);
    for (const b of KANBAN_BEATS) {
      expect(KANBAN_VO_SEG_SEC[b.n]).toBeDefined();
      expect(b.clipSec).toBe(KANBAN_VO_SEG_SEC[b.n]);
    }
  });

  test("KANBAN_RUNTIME_SEC == the sum of every beat's VO segment (140s, transition included)", () => {
    const segTotal = Object.values(KANBAN_VO_SEG_SEC).reduce((s, v) => s + v, 0);
    expect(KANBAN_RUNTIME_SEC).toBe(segTotal);
    expect(KANBAN_RUNTIME_SEC).toBe(140);
  });
});

// ── hero-beat data provenance (sha256 + bytes + IHDR dims match the committed board PNG) ───────────────
describe("#1120 kanban hero-beat data provenance", () => {
  const heroes = KANBAN_BEATS.filter((b) => b.hero);

  test("there is exactly 1 hero beat with declared provenance (beat 6 committed still)", () => {
    expect(heroes.length).toBe(1);
    expect(heroes[0].n).toBe(6);
  });

  test.each(heroes.map((b) => [b.n, b.hero!.source, b.hero!.sha256, b.hero!.bytes] as const))(
    "beat %i — %s sha256+bytes match the committed board PNG",
    (_n, source, sha256, bytes) => {
      const abs = path.join(REPO_ROOT, source);
      expect(fs.existsSync(abs)).toBe(true);
      const buf = fs.readFileSync(abs);
      expect(buf.length).toBe(bytes);
      expect(crypto.createHash("sha256").update(buf).digest("hex")).toBe(sha256);
    },
  );

  test.each(heroes.map((b) => [b.n, b.hero!.source, b.hero!.srcW, b.hero!.srcH] as const))(
    "beat %i — %s declared srcW/srcH match the committed PNG IHDR pixel dimensions",
    (_n, source, srcW, srcH) => {
      const buf = fs.readFileSync(path.join(REPO_ROOT, source));
      expect(buf.subarray(12, 16).toString("ascii")).toBe("IHDR");
      expect(buf.readUInt32BE(16)).toBe(srcW);
      expect(buf.readUInt32BE(20)).toBe(srcH);
    },
  );
});

// ── hero camera-framing guard (column-locked vertical pan — no horizontal side-crop) ──────────────────
describe("#1120 kanban hero camera-framing guard (column-locked vertical pan)", () => {
  const heroBeats = KANBAN_BEATS.filter((b) => b.hero);
  test.each(heroBeats.map((b) => [b.n, b.hero!.focusStart, b.hero!.focusEnd] as const))(
    "beat %i is a column-locked vertical pan (no cross-column horizontal sweep)",
    (_n, start, end) => {
      expect(Math.abs(start.cx - end.cx)).toBeLessThanOrEqual(0.06);
    },
  );
});

// ── AC #2 — the ◆ REVIEW · PASS GLYPH is on the committed pixels (Rule-19 pixel probe) ─────────────────
describe("#1120 kanban face-verdict glyph on the committed still", () => {
  const beat6 = KANBAN_BEATS.find((b) => b.n === 6)!;

  test("the In Review verdict region carries verdict-green text; the subject line below it does NOT", () => {
    const buf = fs.readFileSync(path.join(REPO_ROOT, beat6.hero!.source));
    const img = decodePng(buf);
    const hl = beat6.highlight!;
    // The verdict ring region (the ◆ REVIEW · PASS `.ak-phase` line), padded slightly for sub-pixel.
    const verdictRegion = { sx: hl.sx - 0.005, sy: hl.sy - 0.004, sw: hl.sw + 0.01, sh: hl.sh + 0.008 };
    // A control: the card SUBJECT line directly BELOW the verdict (gray text, not verdict-green).
    const controlRegion = { sx: hl.sx, sy: hl.sy + hl.sh + 0.006, sw: hl.sw, sh: hl.sh };
    const verdictGreen = countMatching(img, verdictRegion, isVerdictGreen);
    const controlGreen = countMatching(img, controlRegion, isVerdictGreen);
    // eslint-disable-next-line no-console
    console.log(`[glyph-probe] verdict region verdict-green px=${verdictGreen}, control (subject below) px=${controlGreen}`);
    expect(verdictGreen).toBeGreaterThan(60);
    expect(controlGreen).toBeLessThan(verdictGreen / 3);
  });
});

// ── R13 — phone full-screen aspect discipline (keep 9:16, never taller) ───────────────────────────────
describe("#1120 R13 phone-full-screen aspect discipline", () => {
  test("the kanban demo's publish aspects pass the discipline (9:16 present + nothing taller than 9:16)", () => {
    expect(() => assertPhoneFullScreenAspectDiscipline(kanbanSpec.aspects)).not.toThrow();
    expect(() => assertPhoneFullScreenAspectDiscipline(FABLE_ASPECTS)).not.toThrow();
  });

  test("a 9:16 aspect exists, sized exactly 1080×1920", () => {
    const hero = kanbanSpec.aspects.find((a) => a.key === "9:16")!;
    expect([hero.width, hero.height]).toEqual([1080, 1920]);
  });
});
