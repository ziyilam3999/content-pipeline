/**
 * #1137 — BOTH-ENDS oracle for the INTRO-category video recipe (the short YouTube-reach clip).
 *
 * `assertDemoCategoryRecipe` branches on `spec.videoType`: an `"intro"` runs the SHARED geometry/caption
 * rules + the intro band {30,40} (hard cap 40) + the FOUR reach rules R14–R17 (frame-1 hook /
 * keyword-early / clean loop / subscribe CTA), and SKIPS the demo-narrative rules R1–R6. This suite is
 * the test oracle: a fully-compliant ~35s intro PASSES the whole intro path, and for EACH of R14/R15/
 * R16/R17 + the 40s hard cap, a one-field-broken variant FAILS with that rule's `R1x` token.
 *
 * Pure data-structure asserts — NO Playwright / ffmpeg / network / paid call.
 */

import {
  assertDemoCategoryRecipe,
  VIDEO_TYPE_BAND,
  type DemoVideoSpec,
} from "../demoCategoryRecipe";
import { FABLE_ASPECTS, FABLE_BEAT_LAYOUTS } from "../fableLayout";

const BG_INTRO = "#0b0f1a"; // the intro's opening (and, for a clean loop, closing) world

/**
 * A fully-compliant ~35s intro: a SHORT frame-1 hook carrying the focus keyword, two body beats, and a
 * closing subscribe-CTA beat that returns to the opening world; captions @35s synced to a real VO; the
 * focus keyword on frame-1 AND in the opening line; a mid-video subscribe reminder at 20s (in window).
 * Total = 5 + 12 + 12 + 6 = 35s.
 */
function compliantIntro(): DemoVideoSpec {
  return {
    task: 1137,
    videoType: "intro",
    beats: [
      {
        n: 1,
        kind: "hook",
        vehicle: "overlay",
        backgroundColor: BG_INTRO,
        label: "the hook",
        onScreenText: ["forge", "your tests decide what ships"],
        commands: [],
        durationSec: 5,
        isTerminal: false,
        isHeroOutput: false,
        frameOneHook: true,
      },
      {
        n: 2,
        kind: "payoff",
        vehicle: "overlay",
        backgroundColor: "#101826",
        label: "what it does",
        onScreenText: ["plan, code, and a real check before it ships"],
        commands: [],
        durationSec: 12,
        isTerminal: false,
        isHeroOutput: false,
      },
      {
        n: 3,
        kind: "payoff",
        vehicle: "overlay",
        backgroundColor: "#16203a",
        label: "the payoff",
        onScreenText: ["only a passing check moves a story forward"],
        commands: [],
        durationSec: 12,
        isTerminal: false,
        isHeroOutput: false,
      },
      {
        n: 4,
        kind: "cta",
        vehicle: "overlay",
        backgroundColor: BG_INTRO, // returns to the opening world for a clean loop (R16)
        label: "subscribe",
        onScreenText: ["subscribe for more"],
        commands: [],
        durationSec: 6,
        isTerminal: false,
        isHeroOutput: false,
        subscribeCta: true,
      },
    ],
    aspects: FABLE_ASPECTS,
    beatLayouts: FABLE_BEAT_LAYOUTS,
    runtimeWindowSec: { ...VIDEO_TYPE_BAND.intro },
    maxTerminalFraction: 0.3,
    captions: {
      present: true,
      syncBoundToRealAudio: true,
      audio: { source: "out/review/intro/intro-vo-sync.json", real: true, durationSec: 35 },
      lastCueEndSec: 35,
    },
    focusKeyword: "forge",
    voOpeningLine: "Meet forge — your tests decide what ships.",
    loops: true,
    subscribeReminderAtSec: 20,
  };
}

function clone(): DemoVideoSpec {
  return structuredClone(compliantIntro());
}

describe("#1137 intro recipe — the compliant ~35s fixture PASSES (good end / regression anchor)", () => {
  test("a fully-compliant intro PASSES the whole intro path", () => {
    expect(() => assertDemoCategoryRecipe(compliantIntro())).not.toThrow();
  });

  test("the intro fixture has the proven reach shape", () => {
    const s = compliantIntro();
    expect(s.videoType).toBe("intro");
    expect(s.beats.reduce((a, b) => a + b.durationSec, 0)).toBe(35);
    expect(s.beats[0].kind).toBe("hook");
    expect(s.beats[0].frameOneHook).toBe(true);
    expect(s.beats[s.beats.length - 1].kind).toBe("cta");
    expect(s.beats[s.beats.length - 1].subscribeCta).toBe(true);
  });
});

describe("#1137 R14 — frame-1 hook (kind hook + frameOneHook + non-empty text + <=6s)", () => {
  test("frameOneHook !== true THROWS (R14)", () => {
    const s = clone();
    s.beats[0].frameOneHook = false;
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R14\b/);
  });

  test("first beat is not a hook THROWS (R14)", () => {
    const s = clone();
    s.beats[0].kind = "payoff";
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R14\b/);
  });

  test("empty hook on-screen text THROWS (R14)", () => {
    const s = clone();
    s.beats[0].onScreenText = [];
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R14\b/);
  });

  test("a hook longer than 6s (a long dwell) THROWS (R14)", () => {
    const s = clone();
    s.beats[0].durationSec = 9; // > INTRO_HOOK_MAX_SEC
    // keep total inside the band by trimming a body beat
    s.beats[1].durationSec = 8;
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R14\b/);
  });

  test("the compliant frame-1 hook PASSES (good end)", () => {
    expect(() => assertDemoCategoryRecipe(clone())).not.toThrow();
  });
});

describe("#1137 R15 — keyword-early (focus keyword in beat-1 text AND voOpeningLine)", () => {
  test("a missing focus keyword THROWS (R15)", () => {
    const s = clone();
    delete (s as Partial<DemoVideoSpec>).focusKeyword;
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R15\b/);
  });

  test("a keyword absent from the VO opening line THROWS (R15)", () => {
    const s = clone();
    s.voOpeningLine = "Meet the thing — your tests decide what ships."; // drops "forge"
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R15\b/);
  });

  test("a keyword absent from beat-1's on-screen text THROWS (R15)", () => {
    const s = clone();
    s.beats[0].onScreenText = ["your tests decide what ships"]; // drops "forge"
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R15\b/);
  });

  test("the keyword present in both PASSES (good end)", () => {
    expect(() => assertDemoCategoryRecipe(clone())).not.toThrow();
  });
});

describe("#1137 R16 — clean loop (loops===true + first/last world match)", () => {
  test("loops !== true THROWS (R16)", () => {
    const s = clone();
    s.loops = false;
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R16\b/);
  });

  test("last beat does NOT return to the first beat's world THROWS (R16)", () => {
    const s = clone();
    s.beats[s.beats.length - 1].backgroundColor = "#ffffff"; // != BG_INTRO
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R16\b/);
  });

  test("a declared loop returning to the opening world PASSES (good end)", () => {
    expect(() => assertDemoCategoryRecipe(clone())).not.toThrow();
  });
});

describe("#1137 R17 — subscribe CTA (closing CTA beat + a mid reminder in window)", () => {
  test("the closing beat is not a subscribe CTA THROWS (R17)", () => {
    const s = clone();
    s.beats[s.beats.length - 1].subscribeCta = false;
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R17\b/);
  });

  test("the closing beat is not a cta kind THROWS (R17)", () => {
    const s = clone();
    s.beats[s.beats.length - 1].kind = "payoff";
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R17\b/);
  });

  test("the subscribe reminder is OUT of the [0.4t, 0.75t] window THROWS (R17)", () => {
    const s = clone();
    s.subscribeReminderAtSec = 2; // way before 0.4*35 = 14s
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R17\b/);
  });

  test("a missing subscribe reminder THROWS (R17)", () => {
    const s = clone();
    delete (s as Partial<DemoVideoSpec>).subscribeReminderAtSec;
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R17\b/);
  });

  test("a closing CTA + in-window reminder PASSES (good end)", () => {
    expect(() => assertDemoCategoryRecipe(clone())).not.toThrow();
  });
});

describe("#1137 intro band {30,40} hard cap (R8)", () => {
  test("a ~50s intro FAILS the 40s hard cap (R8)", () => {
    const s = clone();
    s.beats[1].durationSec = 27; // 5 + 27 + 12 + 6 = 50s, past the 40s ceiling
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R8\b/);
  });

  test("an intro that tries to WIDEN its band past 40s FAILS the hard cap (R8)", () => {
    const s = clone();
    s.runtimeWindowSec = { min: 30, max: 60 }; // declared band exceeds the intro ceiling
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R8\b/);
  });

  test("a ~25s intro is BELOW the band floor (R8)", () => {
    const s = clone();
    s.beats[1].durationSec = 2; // 5 + 2 + 12 + 6 = 25s, below 30
    expect(() => assertDemoCategoryRecipe(s)).toThrow(/R8\b/);
  });

  test("a ~35s intro is inside the band (good end)", () => {
    expect(() => assertDemoCategoryRecipe(clone())).not.toThrow();
  });
});
