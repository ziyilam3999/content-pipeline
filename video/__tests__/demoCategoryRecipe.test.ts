/**
 * #870 — BOTH-ENDS oracle for the demonstration-category video recipe contract.
 *
 * The bake (`video/demoCategoryRecipe.ts`) generalizes the proven #824 demo-video recipe into ONE
 * fail-closed validator (`assertDemoCategoryRecipe`) over a `DemoVideoSpec`. This suite is the test
 * oracle: every recipe rule R1–R11 must FAIL on a violating spec AND PASS on the clean shipped spec
 * (`fableSpec`, the #824 data re-expressed). The clean end is the regression anchor — if the shipped
 * spec ever stops passing, a future demo silently regressed a hard-won rule.
 *
 * Pure data-structure asserts — NO Playwright / ffmpeg / network / paid call.
 */

import {
  assertDemoCategoryRecipe,
  fableSpec,
  type DemoVideoSpec,
  type DemoBeat,
} from "../demoCategoryRecipe";
import { forgeSpec } from "../forgeStoryboard";
import { kanbanSpec } from "../kanbanStoryboard";

/** Deep clone so each mutation test starts from the clean shipped spec. */
function clone(spec: DemoVideoSpec = fableSpec): DemoVideoSpec {
  return structuredClone(spec);
}

function beatOfKind(spec: DemoVideoSpec, kind: DemoBeat["kind"]): DemoBeat {
  const b = spec.beats.find((x) => x.kind === kind);
  if (!b) throw new Error(`test setup: no "${kind}" beat in spec`);
  return b;
}

describe("#870 demo-category recipe — clean shipped spec (AC 9, regression anchor)", () => {
  test("the #824 fableSpec PASSES the whole recipe cleanly", () => {
    expect(() => assertDemoCategoryRecipe(fableSpec)).not.toThrow();
  });

  test("fableSpec has the proven shape (captured-footage spine, hook first, hero provenance)", () => {
    expect(fableSpec.beats.length).toBeGreaterThanOrEqual(8);
    expect(fableSpec.beats[0].kind).toBe("hook");
    expect(fableSpec.beats.some((b) => b.vehicle === "captured-footage")).toBe(true);
    const outputs = fableSpec.beats.filter((b) => b.isHeroOutput);
    expect(outputs.length).toBeGreaterThan(0);
    for (const o of outputs) expect(o.provenance?.real).toBe(true);
  });
});

describe("#870 R1 — vehicle must be captured-footage spine + overlay edits", () => {
  test("a generative-video spine THROWS (R1)", () => {
    const s = clone();
    beatOfKind(s, "tool").vehicle = "generative-video";
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R1\b/);
  });

  test("a composition/montage spine THROWS (R1)", () => {
    const s = clone();
    beatOfKind(s, "output").vehicle = "composition";
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R1\b/);
  });

  test("no captured-footage beat at all THROWS (R1 — there is no real spine)", () => {
    const s = clone();
    for (const b of s.beats) b.vehicle = "overlay";
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R1\b/);
  });

  test("captured-footage + overlay PASSES (good end)", () => {
    expect(() => assertDemoCategoryRecipe(clone())).not.toThrow();
  });
});

describe("#870 R2 — opens with a HOOK beat", () => {
  test("missing/!hook first beat THROWS (R2)", () => {
    const s = clone();
    s.beats[0].kind = "title";
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R2\b/);
  });
});

describe("#870 R3 — agent-interface reframe (chat + 'the agent's interface, not yours' tool beat)", () => {
  test("a tool beat that drops the agent-interface label THROWS (R3)", () => {
    const s = clone();
    const tool = beatOfKind(s, "tool");
    tool.label = "running";
    tool.onScreenText = tool.onScreenText.map((t) => t.replace(/the agent's interface[^"]*/i, "running"));
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R3\b/);
  });
});

describe("#870 R4 — TOOL and OUTPUT beats have VISUALLY DISTINCT backgrounds + labeled output", () => {
  test("tool and output sharing a background color THROWS (R4)", () => {
    const s = clone();
    const tool = beatOfKind(s, "tool");
    for (const b of s.beats) if (b.isHeroOutput) b.backgroundColor = tool.backgroundColor;
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R4\b/);
  });

  test("an unlabeled output beat THROWS (R4)", () => {
    const s = clone();
    for (const b of s.beats) if (b.isHeroOutput) { b.label = ""; b.onScreenText = []; }
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R4\b/);
  });

  test("distinct tool/output backgrounds PASS (good end)", () => {
    expect(() => assertDemoCategoryRecipe(clone())).not.toThrow();
  });
});

describe("#870 R5 — explicit TRANSITION between the tool beat and the first output beat", () => {
  test("removing the transition beat THROWS (R5)", () => {
    const s = clone();
    s.beats = s.beats.filter((b) => b.kind !== "transition");
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R5\b/);
  });

  test("a hard cut (transition AFTER the output) THROWS (R5)", () => {
    const s = clone();
    const idxTrans = s.beats.findIndex((b) => b.kind === "transition");
    const [trans] = s.beats.splice(idxTrans, 1);
    s.beats.push(trans); // move transition to the very end — no longer between tool and output
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R5\b/);
  });
});

describe("#870 R6 — hero output beats carry real-artifact provenance (never placeholder/stub)", () => {
  test("a hero output beat with NO provenance THROWS (R6)", () => {
    const s = clone();
    for (const b of s.beats) if (b.isHeroOutput) delete b.provenance;
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R6\b/);
  });

  test("a placeholder/stub source THROWS (R6)", () => {
    const s = clone();
    for (const b of s.beats) if (b.isHeroOutput && b.provenance) b.provenance.source = "assets/placeholder-card.png";
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R6\b/);
  });

  test("a malformed sha256 THROWS (R6)", () => {
    const s = clone();
    for (const b of s.beats) if (b.isHeroOutput && b.provenance) b.provenance.sha256 = "deadbeef"; // not 64-hex
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R6\b/);
  });

  test("a real sha256+bytes source PASSES (good end)", () => {
    const s = clone();
    for (const b of s.beats) if (b.isHeroOutput && b.provenance) {
      b.provenance.sha256 = "a".repeat(64);
      b.provenance.bytes = 12345;
    }
    expect(() => assertDemoCategoryRecipe(s)).not.toThrow();
  });
});

describe("#870 R7 — terminal/tool beats are ≤30% of total runtime", () => {
  test("terminal beats exceeding 30% THROWS (R7)", () => {
    const s = clone();
    // Inflate the tool beat so terminal time dominates the runtime.
    const tool = beatOfKind(s, "tool");
    tool.durationSec = 200;
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R7\b/);
  });

  test("terminal ≤30% PASSES (good end — the shipped spec)", () => {
    const terminal = fableSpec.beats.filter((b) => b.isTerminal).reduce((a, b) => a + b.durationSec, 0);
    const total = fableSpec.beats.reduce((a, b) => a + b.durationSec, 0);
    expect(terminal / total).toBeLessThanOrEqual(0.3);
    expect(() => assertDemoCategoryRecipe(clone())).not.toThrow();
  });
});

describe("#870 R8 — total runtime inside the ~90s window", () => {
  test("a runtime far outside the band THROWS (R8)", () => {
    const s = clone();
    s.beats[0].durationSec = 400; // blows the upper bound
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R8\b/);
  });
});

describe("#1137 demo videoType + widened {110,180} band — the three shipped demos stay GREEN", () => {
  // Each storyboard pins its OWN sub-110 band (fable {85,92} grandfathered, forge {92,100}, kanban
  // {74,84}), so retargeting the band-less DEFAULT to {110,180} cannot move them.
  test("fableSpec (~85s, grandfathered {85,92}) still PASSES", () => {
    expect(fableSpec.videoType).toBe("demo");
    expect(fableSpec.beats.reduce((a, b) => a + b.durationSec, 0)).toBe(85);
    expect(() => assertDemoCategoryRecipe(fableSpec)).not.toThrow();
  });

  test("forgeSpec (~94s, pinned {92,100}) still PASSES", () => {
    expect(forgeSpec.videoType).toBe("demo");
    expect(() => assertDemoCategoryRecipe(forgeSpec)).not.toThrow();
  });

  test("kanbanSpec (~140s 14-beat, pinned {130,150}) still PASSES", () => {
    expect(kanbanSpec.videoType).toBe("demo");
    expect(kanbanSpec.beats.reduce((a, b) => a + b.durationSec, 0)).toBe(140);
    expect(() => assertDemoCategoryRecipe(kanbanSpec)).not.toThrow();
  });
});

describe("#1137 demo-floor both-ends lock — a band-LESS demo now requires >=110s", () => {
  /** Clone fableSpec, DROP its pinned band (so it inherits VIDEO_TYPE_BAND.demo {110,180}), and stretch
   *  a NON-terminal beat so the total hits `totalSec` (keeps R7 terminal-fraction green). */
  function bandlessDemoAt(totalSec: number): DemoVideoSpec {
    const s = clone();
    delete (s as Partial<DemoVideoSpec>).runtimeWindowSec;
    const current = s.beats.reduce((a, b) => a + b.durationSec, 0);
    s.beats[0].durationSec += totalSec - current; // beat 0 is the hook (non-terminal)
    return s;
  }

  test("a ~100s band-less demo FAILS the >=110 floor (R8)", () => {
    const s = bandlessDemoAt(100);
    expect(s.beats.reduce((a, b) => a + b.durationSec, 0)).toBe(100);
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R8\b/);
  });

  test("a ~70s band-less demo also FAILS the >=110 floor (R8)", () => {
    const s = bandlessDemoAt(70);
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R8\b/);
  });

  test("a ~140s band-less demo PASSES (inside {110,180}) — the good end", () => {
    const s = bandlessDemoAt(140);
    expect(s.beats.reduce((a, b) => a + b.durationSec, 0)).toBe(140);
    expect(() => assertDemoCategoryRecipe(s)).not.toThrow();
  });
});

describe("#870 R9/R10 — on-screen copy is dev-token / brand / owner / placeholder-URL clean", () => {
  test("an internal dev token (#748) on an on-screen field THROWS (R9)", () => {
    const s = clone();
    s.beats[0].onScreenText = [...s.beats[0].onScreenText, "Phase D / #748 capture"];
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R9\b/);
  });

  test("an employer-brand token on an on-screen field THROWS (R9)", () => {
    const s = clone();
    s.beats[0].onScreenText = [...s.beats[0].onScreenText, "built at shopee"];
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R9\b/);
  });

  test("an OS owner/username leak in a shown command THROWS (R9)", () => {
    const s = clone();
    beatOfKind(s, "tool").commands = ["whoami", "ls -la /Users/secret/out"];
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R9\b/);
  });

  test("a placeholder/example URL on an on-screen field THROWS (R10)", () => {
    const s = clone();
    s.beats[0].onScreenText = [...s.beats[0].onScreenText, "github.com/example/lfah"];
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R10\b/);
  });

  test("clean copy PASSES (good end)", () => {
    expect(() => assertDemoCategoryRecipe(clone())).not.toThrow();
  });
});

describe("#870 R11 — every beat layout is 4-side title-safe + fill + caption-band-clear (reuse fableLayout)", () => {
  test("a sparse/island full-bleed beat layout THROWS (R11)", () => {
    const s = clone();
    // Shrink a fill beat's content box to a centered island (large empty bands) → assertBeatFill fails.
    const fillLayout = s.beatLayouts.find((l) => l.fill);
    if (!fillLayout) throw new Error("test setup: no fill beat layout");
    fillLayout.content = { left: 440, top: 840, right: 640, bottom: 1080 };
    expect(() => assertDemoCategoryRecipe(s)).toThrow();
  });

  test("the shipped beat layouts PASS (good end)", () => {
    expect(() => assertDemoCategoryRecipe(clone())).not.toThrow();
  });
});

describe("#873 R12 — captions required (real-voice-synced, provenance-bound)", () => {
  test("the #824 fableSpec carries real-voice-synced captions and PASSES R12 clean", () => {
    expect(fableSpec.captions).toBeDefined();
    expect(fableSpec.captions.present).toBe(true);
    expect(fableSpec.captions.syncBoundToRealAudio).toBe(true);
    expect(fableSpec.captions.audio.real).toBe(true);
    expect(fableSpec.captions.audio.source.length).toBeGreaterThan(0);
    expect(Number.isFinite(fableSpec.captions.audio.durationSec)).toBe(true);
    expect(fableSpec.captions.audio.durationSec).toBeGreaterThan(0);
    // provenance binding: the last caption ends ~when the audio ends (the #742/#19 lesson).
    expect(Math.abs(fableSpec.captions.lastCueEndSec - fableSpec.captions.audio.durationSec)).toBeLessThanOrEqual(0.5);
    expect(() => assertDemoCategoryRecipe(fableSpec)).not.toThrow();
  });

  test("captions absent (field deleted) THROWS (R12)", () => {
    const s = clone();
    delete (s as Partial<DemoVideoSpec>).captions;
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/demo-recipe R12/);
  });

  test("captions.present = false THROWS (R12)", () => {
    const s = clone();
    s.captions.present = false;
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/demo-recipe R12/);
  });

  test("captions not bound to real audio (syncBoundToRealAudio = false) THROWS (R12)", () => {
    const s = clone();
    s.captions.syncBoundToRealAudio = false;
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/demo-recipe R12/);
  });

  test("provenance binding broken (lastCueEndSec far from audio.durationSec) THROWS (R12)", () => {
    const s = clone();
    s.captions.lastCueEndSec = s.captions.audio.durationSec - 20; // 20s drift (the #744 sync bug shape)
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/demo-recipe R12/);
  });

  test("audio not real (audio.real = false) THROWS (R12)", () => {
    const s = clone();
    s.captions.audio.real = false;
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/demo-recipe R12/);
  });

  test("a placeholder/stub caption audio source THROWS (R12)", () => {
    const s = clone();
    s.captions.audio.source = "out/review/fable/placeholder-vo.json";
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/demo-recipe R12/);
  });

  test("non-finite / non-positive durationSec THROWS (R12)", () => {
    const s = clone();
    s.captions.audio.durationSec = 0;
    s.captions.lastCueEndSec = 0;
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/demo-recipe R12/);
  });
});

// ── #1092 R18 — CONTAIN (no L/R slice), enforced for EVERY videoType through the shared rule ───────────
// The recurring board edge-crop class (#1091 cover-aspect + #1120 stale-scroll), generalized: every beat
// that insets a captured asset must be CONTAIN-safe in its device box. Both-ends: a landscape asset in a
// portrait device FAILS (rule a); a dynamic clip not exactly contain-fit FAILS (rule b); the real
// fable/forge/kanban specs PASS — and the NON-VACUOUSNESS assert proves each real spec actually FEEDS the
// gate (≥1 insetAsset beat), so a future regression dropping insetAsset can't silently make R18 a no-op.
describe("#1092 R18 — contain (no L/R slice)", () => {
  test("FAILS (cover, rule a): a landscape asset in fable's portrait viewer device THROWS R18-contain", () => {
    const s = clone(); // fable viewer device ≈ 0.5625 (9:16)
    const board = s.beats.find((b) => b.kind === "output")!;
    board.insetAsset = { w: 1280, h: 800, dynamic: false }; // landscape 1.6 > 0.5625 → L/R slice
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R18-contain/);
  });

  test("FAILS (dynamic non-exact, rule b): a clip whose aspect != its device aspect THROWS R18-contain", () => {
    const s = clone(kanbanSpec);
    // beat 6 device is WIDE_BOARD_DEVICE (≈0.868); a 600×1066 (0.563) DYNAMIC clip there is the #1120 bug.
    const beat6 = s.beats.find((b) => b.n === 6)!;
    beat6.insetAsset = { w: 600, h: 1066, dynamic: true };
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R18-contain/);
  });

  test("PASSES (contain): a contain-fit dynamic fixture in its exact device does NOT throw", () => {
    const s = clone(kanbanSpec);
    // beat 11's device IS kanbanClipDeviceRect(600,1066); a 600×1066 dynamic clip there is exact-fit.
    const beat11 = s.beats.find((b) => b.n === 11)!;
    beat11.insetAsset = { w: 600, h: 1066, dynamic: true };
    expect(() => assertDemoCategoryRecipe(s)).not.toThrow();
  });

  test("PASSES (no asset): a title/chat beat with no insetAsset is skipped by R18", () => {
    const s = clone();
    // fable beat 1 (hook/title) carries no insetAsset → R18 no-ops for it; whole spec still passes.
    expect(s.beats.find((b) => b.n === 1)!.insetAsset).toBeUndefined();
    expect(() => assertDemoCategoryRecipe(s)).not.toThrow();
  });

  test("PASSES + NON-VACUOUS: the real fable/forge/kanban specs pass R18 AND each feeds it (≥1 insetAsset beat)", () => {
    for (const [name, spec] of [["fable", fableSpec], ["forge", forgeSpec], ["kanban", kanbanSpec]] as const) {
      expect(() => assertDemoCategoryRecipe(spec)).not.toThrow();
      const insetCount = spec.beats.filter((b) => b.insetAsset).length;
      // eslint-disable-next-line no-console
      console.log(`[R18 non-vacuous] ${name}: ${insetCount} insetAsset beat(s) feed the contain rule`);
      expect(insetCount).toBeGreaterThanOrEqual(1);
    }
    // The expected per-spec counts (regression anchor): fable viewer beats 5+6 = 2; forge heroes 6/7/8 = 3;
    // kanban all 8 board beats 5–12 = 8.
    expect(fableSpec.beats.filter((b) => b.insetAsset).length).toBe(2);
    expect(forgeSpec.beats.filter((b) => b.insetAsset).length).toBe(3);
    expect(kanbanSpec.beats.filter((b) => b.insetAsset).length).toBe(8);
  });
});
