/**
 * #1046 agent-kanban demo — the build's test ORACLE.
 *
 *  (1) RECIPE: the net-new kanban `DemoVideoSpec` passes the whole #870 demonstration-category recipe
 *      (R1–R13) cleanly — the same fail-closed contract that gates the #824 fableSpec + #871 forgeSpec.
 *  (2) SAFE-AREA: every kanban beat layout is 4-side title-safe + the full-bleed beats FILL.
 *  (3) PROVENANCE: each hero (still) beat's declared `provenance.sha256` + `bytes` byte-for-byte match the
 *      committed real board PNG it displays.
 *  (4) SHAPE: the proven demonstration shape (10 beats, hook first, captured-footage spine, chat + tool +
 *      transition, terminal ≤30%, 2 hero outputs with real provenance, runtime in the 98–112s band).
 *
 * Pure data-structure + filesystem hashing — NO Playwright / ffmpeg / network / paid call.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

import { assertDemoCategoryRecipe, assertPhoneFullScreenAspectDiscipline } from "../demoCategoryRecipe";
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
  KANBAN_VO_SEG_SEC,
  KANBAN_TRANSITION_SEC,
  KANBAN_RUNTIME_SEC,
} from "../kanbanStoryboard";

const REPO_ROOT = process.cwd();

describe("#1046 kanban demo-category recipe (R1–R13)", () => {
  test("kanbanSpec PASSES the whole demonstration recipe cleanly", () => {
    expect(() => assertDemoCategoryRecipe(kanbanSpec)).not.toThrow();
  });

  test("every kanban beat layout is 4-side title-safe + the full-bleed beats FILL", () => {
    expect(() => assertFableBeatsSafeAndFilled(KANBAN_BEAT_LAYOUTS)).not.toThrow();
  });

  test("kanbanSpec has the proven demonstration shape", () => {
    expect(kanbanSpec.beats.length).toBe(10);
    expect(kanbanSpec.beats[0].kind).toBe("hook");
    expect(kanbanSpec.beats.some((b) => b.vehicle === "captured-footage")).toBe(true);
    expect(kanbanSpec.beats.some((b) => b.kind === "chat")).toBe(true);
    expect(kanbanSpec.beats.some((b) => b.kind === "transition")).toBe(true);
    const tool = kanbanSpec.beats.find((b) => b.kind === "tool")!;
    expect(tool.isTerminal).toBe(true);
    expect(/the agent's interface|not yours/i.test(tool.label)).toBe(true);
    // exactly ONE hero (still) output (beat 6), with real provenance; beats 5/7/8 are NON-hero dynamic
    // clips (beat 8 is now the real tap→drawer-open MOTION capture, not a pre-open still — #1046 v3 fix-3).
    const heroes = kanbanSpec.beats.filter((b) => b.isHeroOutput);
    expect(heroes.length).toBe(1);
    expect(heroes.map((b) => b.n)).toEqual([6]);
    for (const h of heroes) expect(h.provenance?.real).toBe(true);
    for (const n of [5, 7, 8]) expect(KANBAN_BEATS.find((b) => b.n === n)!.isHeroOutput).toBe(false);
  });

  test("runtime is in the 98–112s band and terminal share is ≤30%", () => {
    const total = kanbanSpec.beats.reduce((s, b) => s + b.durationSec, 0);
    expect(total).toBe(104);
    expect(total).toBeGreaterThanOrEqual(98);
    expect(total).toBeLessThanOrEqual(112);
    const terminal = kanbanSpec.beats.filter((b) => b.isTerminal).reduce((s, b) => s + b.durationSec, 0);
    expect(terminal / total).toBeLessThanOrEqual(0.3);
  });

  test("captions carry the R12 fallback shape (durationSec == runtime, lastCue bound)", () => {
    const c = kanbanSpec.captions;
    expect(c.present).toBe(true);
    expect(c.syncBoundToRealAudio).toBe(true);
    expect(c.audio.real).toBe(true);
    expect(c.audio.durationSec).toBe(104);
    expect(Math.abs(c.lastCueEndSec - c.audio.durationSec)).toBeLessThanOrEqual(0.5);
  });
});

// ── #1071 frame-economy gate (board subjects fill the frame — no thin strip in empty cream) ───────────
// The mechanical prevention for the operator's "the product is too small" feedback: a board/device-subject
// beat whose framed surface fills only a sliver of the title-safe height reads as a strip marooned in cream.
describe("#1071 kanban frame-economy gate", () => {
  // The safe-area height the gate measures the subject's fill against (the FALLBACK assert4SideSafeArea max).
  const safe = safeAreaBox();
  const SAFE_H = safe.bottom - safe.top;

  test("every shipped kanban board-subject beat passes the frame-economy band", () => {
    expect(() => assertFrameEconomy(KANBAN_BEAT_LAYOUTS)).not.toThrow();
  });

  test("only the board-subject beats (viewer-*) are economy-checked; title/terminal are exempt", () => {
    const subjects = KANBAN_BEAT_LAYOUTS.filter((l) => isDeviceSubjectBeat(l.kind)).map((l) => l.beat);
    expect(subjects.sort((a, b) => a - b)).toEqual([5, 6, 7, 8]); // the four board beats
    expect(isDeviceSubjectBeat("title")).toBe(false);
    expect(isDeviceSubjectBeat("terminal")).toBe(false);
  });

  // BOTH-ENDS PROOF (#1071): the OLD v3 LANDSCAPE beat-7 geometry must FAIL the gate, and the NEW PORTRAIT
  // beat-7 geometry must PASS — the gate is the mechanical line between the rejected and the fixed framing.
  test("BOTH-ENDS: OLD landscape beat-7 (~⅓ fill) FAILS, NEW portrait beat-7 (≥60% fill) PASSES", () => {
    // OLD: the v3 all-4-columns LANDSCAPE clip was 1280×800; kanbanClipDeviceRect fits that 1.6 aspect into
    // the board box → a short, wide device that fills only ~⅓ of the title-safe height (the thin strip).
    const oldLandscape = kanbanClipDeviceRect(1280, 800);
    const oldFill = (oldLandscape.bottom - oldLandscape.top) / SAFE_H;
    expect(oldFill).toBeLessThan(0.4); // ≈ 0.35 — a sliver
    expect(oldFill).toBeLessThan(MIN_SUBJECT_FILL_HEIGHT_FRACTION);
    const oldLayout: FableBeatLayout = { beat: 7, kind: "viewer-video", content: oldLandscape, fill: false };
    expect(() => assertFrameEconomy([oldLayout])).toThrow(/#1071 frame-economy/);

    // NEW: the portrait To Do→In Progress clip (KANBAN_CARD_CLIP) has an aspect ≈ the board box → it fills
    // nearly the full WIDE_BOARD_DEVICE height → a clear majority of the title-safe height.
    const newPortrait = kanbanClipDeviceRect(KANBAN_CARD_CLIP.w, KANBAN_CARD_CLIP.h);
    const newFill = (newPortrait.bottom - newPortrait.top) / SAFE_H;
    expect(newFill).toBeGreaterThanOrEqual(MIN_SUBJECT_FILL_HEIGHT_FRACTION);
    const newLayout: FableBeatLayout = { beat: 7, kind: "viewer-video", content: newPortrait, fill: false };
    expect(() => assertFrameEconomy([newLayout])).not.toThrow();

    // Surface the numbers (the both-ends proof the brief asks for).
    // eslint-disable-next-line no-console
    console.log(`[#1071 both-ends] OLD landscape beat-7 fill=${(oldFill * 100).toFixed(1)}% (FAILS) → NEW portrait beat-7 fill=${(newFill * 100).toFixed(1)}% (PASSES); floor=${(MIN_SUBJECT_FILL_HEIGHT_FRACTION * 100).toFixed(0)}%`);
  });
});

// ── spine↔VO sync SSOT consistency (the committed end of the drift gate) ──────────────────────────────
describe("#1046 kanban spine↔VO sync SSOT", () => {
  test("every narrated beat's clipSec equals its VO-segment length (KANBAN_VO_SEG_SEC); transition == KANBAN_TRANSITION_SEC", () => {
    for (const b of KANBAN_BEATS) {
      if (b.kind === "transition") {
        expect(b.clipSec).toBe(KANBAN_TRANSITION_SEC);
      } else {
        expect(KANBAN_VO_SEG_SEC[b.n]).toBeDefined();
        expect(b.clipSec).toBe(KANBAN_VO_SEG_SEC[b.n]);
      }
    }
  });

  test("KANBAN_RUNTIME_SEC == the spoken total + the transition silence (104s)", () => {
    const spoken = Object.values(KANBAN_VO_SEG_SEC).reduce((s, v) => s + v, 0);
    expect(KANBAN_RUNTIME_SEC).toBe(spoken + KANBAN_TRANSITION_SEC);
    expect(KANBAN_RUNTIME_SEC).toBe(104);
  });
});

// ── hero-beat data provenance (sha256 + bytes match the committed board PNGs) ─────────────────────────
describe("#1046 kanban hero-beat data provenance", () => {
  const heroes = KANBAN_BEATS.filter((b) => b.hero);

  test("there is 1 hero beat with declared provenance (beat 6 board still)", () => {
    expect(heroes.length).toBe(1);
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

  // DRIFT GATE (#1046): the declared srcW/srcH MUST equal the committed PNG's actual pixel dimensions. The
  // beat-6 ring landed ~40% too high because srcH was 3540 while the PNG was really 2532 (a screenshot clip
  // taller than the viewport got silently clamped). The ring math normalizes the badge box against srcH, so a
  // wrong srcH = a mislocated ring. Reading the real dimensions from the PNG IHDR fails this exact regression.
  test.each(heroes.map((b) => [b.n, b.hero!.source, b.hero!.srcW, b.hero!.srcH] as const))(
    "beat %i — %s declared srcW/srcH match the committed PNG pixel dimensions",
    (_n, source, srcW, srcH) => {
      const buf = fs.readFileSync(path.join(REPO_ROOT, source));
      // PNG: 8-byte signature, then IHDR — width = BE uint32 @16, height = BE uint32 @20.
      expect(buf.subarray(12, 16).toString("ascii")).toBe("IHDR");
      expect(buf.readUInt32BE(16)).toBe(srcW);
      expect(buf.readUInt32BE(20)).toBe(srcH);
    },
  );
});

// ── hero camera-framing guard (column-locked vertical pan — no horizontal side-crop) ──────────────────
// The two STILL board beats pan/zoom over a high-res board screenshot. To avoid the recurring side-crop
// defect, every hero pan must be COLUMN-LOCKED: |cx_start − cx_end| ≤ 0.06 (pure vertical pan, cx centered).
describe("#1046 kanban hero camera-framing guard (column-locked vertical pan)", () => {
  const heroBeats = KANBAN_BEATS.filter((b) => b.hero);
  test.each(heroBeats.map((b) => [b.n, b.hero!.focusStart, b.hero!.focusEnd] as const))(
    "beat %i is a column-locked vertical pan (no cross-column horizontal sweep)",
    (_n, start, end) => {
      expect(Math.abs(start.cx - end.cx)).toBeLessThanOrEqual(0.06);
    },
  );
});

// ── R13 — phone full-screen aspect discipline (keep 9:16, never taller) ───────────────────────────────
describe("#1046 R13 phone-full-screen aspect discipline", () => {
  test("the kanban demo's publish aspects pass the discipline (9:16 present + nothing taller than 9:16)", () => {
    expect(() => assertPhoneFullScreenAspectDiscipline(kanbanSpec.aspects)).not.toThrow();
    expect(() => assertPhoneFullScreenAspectDiscipline(FABLE_ASPECTS)).not.toThrow();
  });

  test("a 9:16 aspect exists, sized exactly 1080×1920", () => {
    const hero = kanbanSpec.aspects.find((a) => a.key === "9:16")!;
    expect([hero.width, hero.height]).toEqual([1080, 1920]);
  });
});
