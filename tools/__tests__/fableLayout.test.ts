/**
 * #824 Fable — CROSS-LAYER caption/media overlap gate (caption-overlap-fix).
 *
 * The operator found the synced captions overlapping the bottom row of the embedded output-beat media
 * (the card's stat pills, the demo's diagram row) DESPITE the existing within-layer safe-band checks.
 * Root cause: the caption band is sized in LEG 2 (voiceFable) and the media device in LEG 1
 * (captureFable); no check spanned the two layers. This test pins the cross-layer invariant BOTH ways:
 *   • the SHIPPED inset geometry PASSES (device bottom clears the band on every aspect), and
 *   • a media bbox that intersects the band FAILS — proving the gate actually catches the regression.
 */

import {
  FABLE_ASPECTS,
  CAP_BAND_H,
  CAP_W,
  CAP_H,
  OUTPUT_DEVICE,
  FILL_SAFE_MARGIN,
  type FableAspect,
  type Rect,
  rectsIntersect,
  outputDeviceSpineRect,
  outputDeviceRectInAspect,
  captionBandRectInAspect,
  captionMediaOverlaps,
  assertNoCaptionMediaOverlap,
  safeAreaBox,
  assert4SideSafeArea,
  assertBeatFill,
  assertFableBeatsSafeAndFilled,
  FABLE_BEAT_LAYOUTS,
  CHAT_CONTENT_BOX,
  CHAT_FILL_CONTRACT,
  worstInteriorGapPx,
  assertChatBeatInteriorFill,
} from "../../video/fableLayout";

describe("#824 fableLayout — the SHIPPED layout has NO caption/media overlap (the PASS end)", () => {
  it("the inset output device clears the caption band on EVERY aspect", () => {
    expect(captionMediaOverlaps(FABLE_ASPECTS)).toEqual([]);
    expect(() => assertNoCaptionMediaOverlap(FABLE_ASPECTS)).not.toThrow();
    expect(() => assertNoCaptionMediaOverlap()).not.toThrow(); // default arg = FABLE_ASPECTS
  });

  it("on every aspect the device BOTTOM sits strictly above the caption-band TOP (clear gap)", () => {
    for (const a of FABLE_ASPECTS) {
      const dev = outputDeviceRectInAspect(a);
      const band = captionBandRectInAspect(a);
      expect(dev.bottom).toBeLessThan(band.top);
    }
  });

  it("the 1:1 aspect is the binding constraint and still clears (smallest gap, > 0)", () => {
    const a = FABLE_ASPECTS.find((x) => x.key === "1:1")!;
    const dev = outputDeviceRectInAspect(a);
    const band = captionBandRectInAspect(a);
    const gap = band.top - dev.bottom;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(80); // it IS the tightest — guards against silently over-shrinking the device
  });

  it("the device keeps the real card/video 9:16 portrait aspect, centered, inset into the upper region", () => {
    const s = outputDeviceSpineRect();
    expect(s.top).toBe(OUTPUT_DEVICE.top);
    expect(s.bottom).toBe(OUTPUT_DEVICE.bottom);
    expect((s.right - s.left) / (s.bottom - s.top)).toBeCloseTo(9 / 16, 4);
    expect((s.left + s.right) / 2).toBeCloseTo(540, 4); // horizontally centered in the 1080 spine
  });
});

describe("#824 fableLayout — the gate CATCHES an overlapping media bbox (the FAIL end)", () => {
  it("a caption band raised INTO the device span is flagged as an overlap", () => {
    // The pre-fix bug: a lower-third band high enough to cross the device. Device (9:16) spans y 150..1200,
    // so a band starting at y 1100 sits ON the device — must be caught.
    const overlapping: FableAspect = { key: "9:16-bad", width: 1080, height: 1920, cropY: 0, captionY: 1100, crop: "" };
    const hits = captionMediaOverlaps([overlapping]);
    expect(hits).toHaveLength(1);
    expect(hits[0].aspect).toBe("9:16-bad");
    expect(() => assertNoCaptionMediaOverlap([overlapping])).toThrow(/caption-overlap/i);
  });

  it("reproduces the SHIPPED-BUG geometry (full-height 86%-width device under a lower-third band) as a FAIL", () => {
    // The original captureFable device: top:54%/translate centered, aspect 9/16, width 86% → bottom ≈ 1862.
    // With the 9:16 caption band at y 1430 that device clearly intersected the band. Model it explicitly.
    const buggyDevice: Rect = { top: 211, bottom: 1862, left: 75, right: 1004 };
    const band9x16: Rect = { top: 1430, bottom: 1430 + CAP_BAND_H, left: 0, right: 1080 };
    expect(rectsIntersect(buggyDevice, band9x16)).toBe(true);
  });

  it("the assertion error names the offending aspect(s) so a future regression is debuggable", () => {
    const bad: FableAspect = { key: "1:1-bad", width: 1080, height: 1080, cropY: 420, captionY: 300, crop: "" };
    expect(() => assertNoCaptionMediaOverlap([bad])).toThrow(/1:1-bad/);
  });
});

describe("#824 video-fill-safe — FOUR-side title-safe + FILL (the PASS end)", () => {
  it("every SHIPPED beat layout passes the 4-side-safe + fill gate", () => {
    expect(() => assertFableBeatsSafeAndFilled()).not.toThrow();
    expect(() => assertFableBeatsSafeAndFilled(FABLE_BEAT_LAYOUTS)).not.toThrow();
  });

  it("the chat beat is a FILL beat and its content box fills the frame, 4-side-safe (no empty middle)", () => {
    const chat = FABLE_BEAT_LAYOUTS.find((l) => l.kind === "chat")!;
    expect(chat.fill).toBe(true);
    expect(chat.content).toEqual(CHAT_CONTENT_BOX);
    // 4-side safe: every edge inside the safe band.
    const safe = safeAreaBox();
    expect(chat.content.left).toBeGreaterThanOrEqual(safe.left - 0.5);
    expect(chat.content.top).toBeGreaterThanOrEqual(safe.top - 0.5);
    expect(chat.content.right).toBeLessThanOrEqual(safe.right + 0.5);
    expect(chat.content.bottom).toBeLessThanOrEqual(safe.bottom + 0.5);
    // genuinely fills: height span ≥ 80% of the frame (the prior top-anchored layout failed this).
    const heightSpan = (chat.content.bottom - chat.content.top) / CAP_H;
    expect(heightSpan).toBeGreaterThan(0.8);
    expect(() => assertBeatFill({ content: chat.content, label: "chat" })).not.toThrow();
  });

  it("a perfectly-filled, 4-side-safe beat PASSES both assertions", () => {
    const filled: Rect = { left: CAP_W * 0.08, top: CAP_H * 0.08, right: CAP_W * 0.92, bottom: CAP_H * 0.92 };
    expect(() => assert4SideSafeArea({ content: filled, label: "filled" })).not.toThrow();
    expect(() => assertBeatFill({ content: filled, label: "filled" })).not.toThrow();
  });

  it("safeAreaBox insets by FILL_SAFE_MARGIN on all four sides", () => {
    const s = safeAreaBox();
    expect(s.left).toBeCloseTo(CAP_W * FILL_SAFE_MARGIN, 4);
    expect(s.top).toBeCloseTo(CAP_H * FILL_SAFE_MARGIN, 4);
    expect(s.right).toBeCloseTo(CAP_W * (1 - FILL_SAFE_MARGIN), 4);
    expect(s.bottom).toBeCloseTo(CAP_H * (1 - FILL_SAFE_MARGIN), 4);
  });
});

describe("#824 video-fill-safe — the gate CATCHES edge-crop + sparse beats (the FAIL end)", () => {
  it("content touching the TOP edge FAILS 4-side-safe (top/bottom now checked, not just left/right)", () => {
    const touchTop: Rect = { left: 100, top: 10, right: CAP_W - 100, bottom: CAP_H - 200 };
    expect(() => assert4SideSafeArea({ content: touchTop, label: "touch-top" })).toThrow(/four-side title-safe/i);
  });

  it("content touching the BOTTOM edge FAILS 4-side-safe", () => {
    const touchBottom: Rect = { left: 100, top: 200, right: CAP_W - 100, bottom: CAP_H - 10 };
    expect(() => assert4SideSafeArea({ content: touchBottom, label: "touch-bottom" })).toThrow(/bottom/i);
  });

  it("content touching the LEFT/RIGHT edge FAILS (parity with the prior horizontal-only check)", () => {
    const touchLeft: Rect = { left: 10, top: 200, right: CAP_W - 100, bottom: CAP_H - 200 };
    expect(() => assert4SideSafeArea({ content: touchLeft, label: "touch-left" })).toThrow(/left/i);
  });

  it("a TOP-ANCHORED sparse beat (the operator's bug) FAILS fill — large empty BOTTOM band", () => {
    // content only in the top third → big dead band below, exactly the chat-beat regression.
    const topAnchored: Rect = { left: 100, top: 120, right: CAP_W - 100, bottom: 640 };
    expect(() => assertBeatFill({ content: topAnchored, label: "sparse-top-anchored" })).toThrow(/fill/i);
  });

  it("a small centered island FAILS fill on AREA (covers too little of the frame)", () => {
    const island: Rect = { left: CAP_W * 0.3, top: CAP_H * 0.35, right: CAP_W * 0.7, bottom: CAP_H * 0.65 };
    expect(() => assertBeatFill({ content: island, label: "island" })).toThrow(/fill/i);
  });

  it("assertFableBeatsSafeAndFilled surfaces the offending beat label for a regressed layout", () => {
    const regressed = [{ beat: 2, kind: "chat", content: { left: 100, top: 120, right: CAP_W - 100, bottom: 600 }, fill: true }];
    expect(() => assertFableBeatsSafeAndFilled(regressed)).toThrow(/beat 2 \(chat\)/);
  });
});

describe("#824 chat-beat INTERIOR fill — catches the empty-middle the container box is blind to", () => {
  it("the shipped distributed contract PASSES (no large interior dead band)", () => {
    expect(() => assertChatBeatInteriorFill()).not.toThrow();
    expect(() => assertChatBeatInteriorFill(CHAT_FILL_CONTRACT)).not.toThrow();
    // worst interior gap must stay under the 20%-of-frame dead-band limit (384px @1920).
    expect(worstInteriorGapPx(CHAT_FILL_CONTRACT)).toBeLessThan(0.2 * 1920);
  });

  it("the OLD top-anchored layout FAILS (4 short rows flush to the top → one huge trailing band)", () => {
    const topAnchored = { ...CHAT_FILL_CONTRACT, rowHeightsPx: [80, 150, 60, 70], justify: "start" as const };
    expect(worstInteriorGapPx(topAnchored)).toBeGreaterThan(0.2 * 1920);
    expect(() => assertChatBeatInteriorFill(topAnchored)).toThrow(/interior dead band/i);
  });

  it("too-few short rows even when distributed FAIL (gaps still exceed the limit)", () => {
    const sparse = { ...CHAT_FILL_CONTRACT, rowHeightsPx: [80, 120], justify: "between" as const };
    expect(() => assertChatBeatInteriorFill(sparse)).toThrow(/sparse/i);
  });

  it("the chat beat is wired into the whole-video invariant (default PASS includes the interior check)", () => {
    expect(() => assertFableBeatsSafeAndFilled()).not.toThrow();
  });
});

describe("#824 fableLayout — rectsIntersect primitive (both ends)", () => {
  const base: Rect = { top: 0, bottom: 100, left: 0, right: 100 };
  it("returns true for genuinely overlapping rects", () => {
    expect(rectsIntersect(base, { top: 50, bottom: 150, left: 50, right: 150 })).toBe(true);
  });
  it("returns false for separated rects (and for merely touching edges — strict)", () => {
    expect(rectsIntersect(base, { top: 200, bottom: 300, left: 0, right: 100 })).toBe(false);
    expect(rectsIntersect(base, { top: 100, bottom: 200, left: 0, right: 100 })).toBe(false); // touching, not overlapping
  });
});
