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

import { assertDemoCategoryRecipe } from "../demoCategoryRecipe";
import { forgeSpec, FORGE_BEATS } from "../forgeStoryboard";

const REPO_ROOT = process.cwd();

describe("#871 forge demo-category recipe (R1–R12)", () => {
  test("forgeSpec PASSES the whole demonstration recipe cleanly", () => {
    expect(() => assertDemoCategoryRecipe(forgeSpec)).not.toThrow();
  });

  test("forgeSpec has the proven demonstration shape", () => {
    expect(forgeSpec.beats.length).toBe(9);
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

  test("runtime is in the 85–92s band and terminal share is ≤30%", () => {
    const total = forgeSpec.beats.reduce((s, b) => s + b.durationSec, 0);
    expect(total).toBe(88);
    expect(total).toBeGreaterThanOrEqual(85);
    expect(total).toBeLessThanOrEqual(92);
    const terminal = forgeSpec.beats.filter((b) => b.isTerminal).reduce((s, b) => s + b.durationSec, 0);
    expect(terminal / total).toBeLessThanOrEqual(0.3);
  });

  test("captions carry the proven R12 fallback shape (durationSec == runtime, lastCue bound)", () => {
    const c = forgeSpec.captions;
    expect(c.present).toBe(true);
    expect(c.syncBoundToRealAudio).toBe(true);
    expect(c.audio.real).toBe(true);
    expect(c.audio.durationSec).toBe(88);
    expect(Math.abs(c.lastCueEndSec - c.audio.durationSec)).toBeLessThanOrEqual(0.5);
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
