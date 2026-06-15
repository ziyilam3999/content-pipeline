/**
 * #871 forge-demo — the build's test ORACLE.
 *
 *  (1) RECIPE: the net-new forge `DemoVideoSpec` passes the whole #870 demonstration-category recipe
 *      (R1–R12) cleanly — the same fail-closed contract that gates the #824 fableSpec.
 *  (2) PROVENANCE: each hero beat's declared `provenance.sha256` + `bytes` byte-for-byte match the
 *      committed real dashboard PNG it displays (AC-3 / AC-4a data provenance).
 *  (3) SHAPE: the proven demonstration shape (9 beats, hook first, captured-footage spine, terminal
 *      ≤30%, 3 hero outputs with real provenance, runtime in the 85–92s band).
 *
 * Pure data-structure + filesystem hashing — NO Playwright / ffmpeg / network / paid call.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

import { assertDemoCategoryRecipe, assertPhoneFullScreenAspectDiscipline } from "../demoCategoryRecipe";
import { FABLE_ASPECTS } from "../fableLayout";
import { forgeSpec, FORGE_BEATS, FORGE_VO_SEG_SEC, FORGE_TRANSITION_SEC, FORGE_RUNTIME_SEC } from "../forgeStoryboard";

const REPO_ROOT = process.cwd();

describe("#871 forge demo-category recipe (R1–R12)", () => {
  test("forgeSpec PASSES the whole demonstration recipe cleanly", () => {
    expect(() => assertDemoCategoryRecipe(forgeSpec)).not.toThrow();
  });

  test("forgeSpec has the proven demonstration shape", () => {
    expect(forgeSpec.beats.length).toBe(10);
    expect(forgeSpec.beats[0].kind).toBe("hook");
    expect(forgeSpec.beats.some((b) => b.vehicle === "captured-footage")).toBe(true);
    // hook + chat + tool + transition present; tool labeled as the agent's interface.
    expect(forgeSpec.beats.some((b) => b.kind === "chat")).toBe(true);
    expect(forgeSpec.beats.some((b) => b.kind === "transition")).toBe(true);
    const tool = forgeSpec.beats.find((b) => b.kind === "tool")!;
    expect(tool.isTerminal).toBe(true);
    expect(/the agent's interface|not yours/i.test(tool.label)).toBe(true);
    // exactly three hero outputs, all with real provenance.
    const heroes = forgeSpec.beats.filter((b) => b.isHeroOutput);
    expect(heroes.length).toBe(3);
    for (const h of heroes) expect(h.provenance?.real).toBe(true);
  });

  test("runtime is in the 92–100s band and terminal share is ≤30%", () => {
    const total = forgeSpec.beats.reduce((s, b) => s + b.durationSec, 0);
    expect(total).toBeCloseTo(93.882, 2); // #944: VO-locked spine (90.88s spoken + 3s silent transition)
    expect(total).toBeGreaterThanOrEqual(92);
    expect(total).toBeLessThanOrEqual(100);
    const terminal = forgeSpec.beats.filter((b) => b.isTerminal).reduce((s, b) => s + b.durationSec, 0);
    expect(terminal / total).toBeLessThanOrEqual(0.3);
  });

  test("captions carry the proven R12 fallback shape (durationSec == runtime, lastCue bound)", () => {
    const c = forgeSpec.captions;
    expect(c.present).toBe(true);
    expect(c.syncBoundToRealAudio).toBe(true);
    expect(c.audio.real).toBe(true);
    expect(c.audio.durationSec).toBeCloseTo(93.882, 2);
    expect(Math.abs(c.lastCueEndSec - c.audio.durationSec)).toBeLessThanOrEqual(0.5);
  });
});

// ── #944 — spine↔VO sync SSOT consistency (the committed end of the drift gate) ───────────────────────
// The voiced cut desynced because the spine rendered each beat at a GUESSED length, not its spoken length.
// The fix renders every NARRATED beat at FORGE_VO_SEG_SEC[n] (the measured Adam-VO segment durations) plus a
// FORGE_TRANSITION_SEC silent transition; tools/voiceForge.ts splices the matching silence into the VO. This
// asserts the storyboard literals stay single-sourced from FORGE_VO_SEG_SEC (so a stray clipSec edit fails
// here); the OTHER end — that the CACHED VO actually matches these lengths within 0.5s — is the runtime gate
// assertForgeVoMatchesSpine in voiceForge (proven on the live re-render).
describe("#944 forge spine↔VO sync SSOT", () => {
  test("every narrated beat's clipSec equals its measured VO-segment length (FORGE_VO_SEG_SEC)", () => {
    for (const b of FORGE_BEATS) {
      if (b.kind === "transition") {
        expect(b.clipSec).toBe(FORGE_TRANSITION_SEC);
      } else {
        expect(FORGE_VO_SEG_SEC[b.n]).toBeDefined();
        expect(b.clipSec).toBe(FORGE_VO_SEG_SEC[b.n]);
      }
    }
  });

  test("FORGE_RUNTIME_SEC == the spoken total + the transition silence (≈ 93.882s)", () => {
    const spoken = Object.values(FORGE_VO_SEG_SEC).reduce((s, v) => s + v, 0);
    expect(FORGE_RUNTIME_SEC).toBeCloseTo(spoken + FORGE_TRANSITION_SEC, 6);
    expect(FORGE_RUNTIME_SEC).toBeCloseTo(93.882, 2);
  });
});

describe("#871 forge hero-beat data provenance (AC-3 / AC-4a)", () => {
  const heroes = FORGE_BEATS.filter((b) => b.hero);

  test("there are 3 hero beats with declared provenance", () => {
    expect(heroes.length).toBe(3);
  });

  test.each(heroes.map((b) => [b.n, b.hero!.source, b.hero!.sha256, b.hero!.bytes] as const))(
    "beat %i — %s sha256+bytes match the committed dashboard HTML",
    (_n, source, sha256, bytes) => {
      const abs = path.join(REPO_ROOT, source);
      expect(fs.existsSync(abs)).toBe(true);
      const buf = fs.readFileSync(abs);
      expect(buf.length).toBe(bytes);
      expect(crypto.createHash("sha256").update(buf).digest("hex")).toBe(sha256);
    },
  );
});

// ── Pan-framing guards (eyeball-iterate lessons baked mechanical) ─────────────────────────────────
// The hero beats render the REAL dashboard HTML LIVE at a narrow width (so the wide board reflows taller
// and FILLS the portrait frame) under a directed camera. The empty-column-sweep defect (a tight horizontal
// pan crossing a column that is EMPTY in THAT frame → dead/placeholder mid-frames; the #765/#824 island
// defect on a pan path) is guarded here. There are exactly two SAFE camera shapes — every hero beat must be
// one of them, asserted both-ends so a cross-column sweep can't silently return:
//   (a) FULL-BOARD ESTABLISHING → DETAIL — the camera STARTS on the whole board (focusStart.zoom ≥ 0.85 =
//       ~full width, ALL columns visible, so there is NO empty-column risk: everything is in frame). From
//       a full-board start it may fly anywhere (e.g. beat 5's push to the breathing pulse). This is the ONE
//       "show the full screen once" shot.
//   (b) COLUMN-LOCKED DETAIL — a tight push-in that never travels across columns: |cx_start − cx_end| ≤ 0.13
//       (one board column ≈ 0.16 wide). The DEMO-2 left→right journey is carried by the CUTS between beats
//       + the card-state changes, NOT a continuous horizontal sweep.
// (The old blanket `zoom ≤ 0.30` cream-band guard is retired: live capture renders the board on its own
//  off-white field — there is no empty-cream band, and detail zoom may sit anywhere in (0, 1.2].)
describe("#871 hero camera-framing guards (full-board establishing OR column-locked detail)", () => {
  const heroBeats = FORGE_BEATS.filter((b) => b.hero);
  test.each(heroBeats.map((b) => [b.n, b.hero!.focusStart, b.hero!.focusEnd] as const))(
    "beat %i is a full-board establishing shot OR a column-locked detail push (no cross-column sweep)",
    (_n, start, end) => {
      const fullBoardEstablishing = start.zoom >= 0.85;
      const columnLocked = Math.abs(start.cx - end.cx) <= 0.13;
      expect(fullBoardEstablishing || columnLocked).toBe(true);
    },
  );
});

// ── #871/#927 R13 — PHONE FULL-SCREEN ASPECT DISCIPLINE (keep 9:16, never render taller) ─────────────
// The operator's S25 Ultra (3120×1440 = 19.5:9) is TALLER than 9:16, so a fit-player pads the 9:16 master
// with thin top/bottom bars — inherent + ACCEPTED. The rejected-twice "fix" was rendering the master TALLER
// to fill that one phone; a taller-than-9:16 master then CROPS the board on every other viewer. R13 locks the
// 9:16 gold standard mechanically. See feedback_keep_9x16_social_standard_dont_render_taller.
describe("#871/#927 R13 phone-full-screen aspect discipline (keep 9:16, never taller)", () => {
  test("the forge demo's publish aspects pass the discipline (9:16 present + nothing taller than 9:16)", () => {
    expect(() => assertPhoneFullScreenAspectDiscipline(forgeSpec.aspects)).not.toThrow();
    expect(() => assertPhoneFullScreenAspectDiscipline(FABLE_ASPECTS)).not.toThrow();
  });

  test("a 9:16 aspect exists, sized exactly 1080×1920", () => {
    const hero = forgeSpec.aspects.find((a) => a.key === "9:16")!;
    expect(hero).toBeDefined();
    expect([hero.width, hero.height]).toEqual([1080, 1920]);
  });

  test("a TALLER-than-9:16 master (the 9:20 'fill-my-S25' trap) FAILS the gate", () => {
    const tall = [{ key: "9:16", width: 1080, height: 2400, cropY: 0, captionY: 1430, crop: "" }];
    expect(() => assertPhoneFullScreenAspectDiscipline(tall)).toThrow(/taller than 9:16|1080x1920/i);
  });

  test("dropping the 9:16 aspect entirely FAILS the gate", () => {
    const noHero = FABLE_ASPECTS.filter((a) => a.key !== "9:16");
    expect(() => assertPhoneFullScreenAspectDiscipline(noHero)).toThrow(/no 9:16 aspect|primary/i);
  });
});

// ── #927 — RENDERED-EXTENT CROP-SAFE GATE (the gap R13 missed) ────────────────────────────────────────
// R13 locks the OUTPUT aspect (9:16, never taller) but is BLIND to where the board's CONTENT actually lands
// inside that frame: a hero beat can be a correct 9:16 master yet still pan/zoom the board so its left/right
// content sits in the band a tall phone CROPS at full-screen. That blind spot is exactly the recurring #871/
// #927 side-crop defect. This gate mirrors captureForge's `liveDashboardCamGeom` EXACTLY and asserts, at BOTH
// keyframes of every hero beat, that the board's outermost content stays within the crop-safe central band.
//
// Crop geometry: the operator's S25 Ultra is 19.5:9 (≈0.4615) — TALLER than 9:16 (0.5625). A full-screen
// fill-to-height shows the central 1080·(0.4615/0.5625)=886px of width, cropping (1080−886)/2 = 97px ≈ 8.98%
// off EACH side. So content must stay within [0.09, 0.91] of the frame width to survive that crop.
// Content boundary = the story-card BOX edge, which sits at the `.dashboard` mobile padding (16px at srcW=600
// → measured, see assets/forge-demo/dashboard-*.html `@media (max-width:640px) .dashboard{padding:14px 16px}`).
const CAP_W = 1080;
const CAP_H = 1920;
const CONTENT_INSET_PX = 16; // .dashboard mobile horizontal padding == the story-card box edge
const CROP_SAFE_MIN = 0.09; // central 82% survives the S25 19.5:9 full-screen crop (8.98%/side)
const CROP_SAFE_MAX = 1 - CROP_SAFE_MIN;

/** EXACT mirror of captureForge `liveDashboardCamGeom` (transform-origin 0,0 scale+translate). */
function camGeom(
  focus: { cx: number; cy: number; zoom: number },
  srcW: number,
  srcH: number,
): { scale: number; tx: number } {
  const z = Math.min(Math.max(focus.zoom, 1e-3), 1.2);
  const scale = CAP_W / (z * srcW);
  const visW = CAP_W / scale;
  const tx = visW <= srcW ? Math.min(0, Math.max(visW - srcW, CAP_W / (2 * scale) - focus.cx * srcW)) : (visW - srcW) / 2;
  return { scale, tx };
}

/** Horizontal frame-fraction extent [left, right] of the board's outermost CONTENT at one focus. */
function contentExtent(focus: { cx: number; cy: number; zoom: number }, srcW: number, srcH: number): [number, number] {
  const { scale, tx } = camGeom(focus, srcW, srcH);
  const left = (scale * (CONTENT_INSET_PX + tx)) / CAP_W;
  const right = (scale * (srcW - CONTENT_INSET_PX + tx)) / CAP_W;
  return [left, right];
}

describe("#927 hero rendered-extent crop-safe gate (no left/right crop on a tall-phone full-screen)", () => {
  const heroBeats = FORGE_BEATS.filter((b) => b.hero);

  test.each(heroBeats.map((b) => [b.n, b.hero!.srcW, b.hero!.srcH, b.hero!.focusStart, b.hero!.focusEnd] as const))(
    "beat %i keeps board content within the crop-safe central band at BOTH keyframes",
    (_n, srcW, srcH, start, end) => {
      for (const focus of [start, end]) {
        const [left, right] = contentExtent(focus, srcW, srcH);
        expect(left).toBeGreaterThanOrEqual(CROP_SAFE_MIN);
        expect(right).toBeLessThanOrEqual(CROP_SAFE_MAX);
        // and the board must still FILL meaningfully (not a tiny island): width frac = 1/zoom ≥ 0.6.
        expect(right - left).toBeGreaterThanOrEqual(0.6);
      }
    },
  );

  test("a too-wide / off-center framing that WOULD crop content FAILS the gate (the guard bites)", () => {
    // zoom 1.0 + cx pushed off-center: content runs to the very frame edge → inside the crop band.
    const [left] = contentExtent({ cx: 0.5, cy: 0.5, zoom: 1.0 }, 600, 1328);
    expect(left).toBeLessThan(CROP_SAFE_MIN); // box edge at 16/600 = 2.7% — well inside the 9% crop zone
  });
});
