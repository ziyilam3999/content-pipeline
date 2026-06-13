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
