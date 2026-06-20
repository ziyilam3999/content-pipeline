/**
 * #824 Fable — SHARED cross-layer layout geometry (caption-overlap fix).
 *
 * The bug this module exists to prevent: the synced captions are composited as a GLOBAL lower-third
 * overlay in LEG 2 (`tools/voiceFable.ts`), while the embedded output-beat media (the framed card /
 * video "device") is sized in LEG 1 (`tools/captureFable.ts`). The two layers never saw each other,
 * so on the OUTPUT beats the caption band rendered ON TOP of the device's bottom row (the stat pills /
 * diagram rows) — `assertHorizontalSafeArea`-class checks only validate WITHIN one layer and cannot
 * span the clip↔caption boundary.
 *
 * SSOT here: the caption-band geometry (per aspect) AND the embedded-media device geometry live in ONE
 * place, and `assertNoCaptionMediaOverlap` is the cross-layer invariant both LEG 1 (capture) and LEG 2
 * (voicing/render) call. captureFable builds the #device box from `outputDeviceSpineRect`; voiceFable
 * overlays the caption band from `FABLE_ASPECTS`; the assertion compares the two rendered rects.
 *
 * Coordinate space: the 9:16 SPINE is 1080×1920. Each publish aspect is a CENTER-CROP of that spine
 * (`cropY` = px trimmed from the top), then the caption band is overlaid at `captionY` in the cropped
 * frame. So the device's rect in a given aspect = its spine rect shifted up by `cropY` and clamped.
 */

// ── Spine + caption band ──────────────────────────────────────────────────────────────────────────
export const CAP_W = 1080;
export const CAP_H = 1920;
/** Height (px) of the transparent caption alpha-PNG band overlaid by voiceFable. */
export const CAP_BAND_H = 240;

/**
 * The embedded output-beat media ("device") rectangle, in the 9:16 SPINE coordinate space.
 *
 * INSET into the UPPER region (#824 caption-overlap-fix): the bottom edge must clear the HIGHEST
 * caption-band top across ALL aspects so the lower-third caption always lands in clear cream BELOW the
 * device. The binding aspect is 1:1 (its band top, in spine coords, is captionY 820 + cropY 420 = 1240),
 * so the device bottom (1200) sits 40px above it; 9:16 and 4:5 have larger clearances. The device keeps
 * the real card/video 9:16 portrait aspect and is centered horizontally.
 */
export const OUTPUT_DEVICE = { top: 150, bottom: 1200, aspectW: 9, aspectH: 16 } as const;

// ── Aspects ─────────────────────────────────────────────────────────────────────────────────────--
export interface FableAspect {
  key: string;
  width: number;
  height: number;
  /** Top offset (px) of the center-crop window from the 1080×1920 spine (0 for native 9:16). */
  cropY: number;
  /** Caption-band top Y (px) in THIS aspect's FINAL frame (lower third, clear of the bottom edge). */
  captionY: number;
  /** ffmpeg center-crop expression from the spine ("" = native 9:16, no crop). */
  crop: string;
}

const CROP_1x1 = (CAP_H - 1080) / 2; // 420
const CROP_4x5 = (CAP_H - 1350) / 2; // 285

/** The three publish aspects — the SSOT consumed by voiceFable's render loop and the overlap assertion. */
export const FABLE_ASPECTS: ReadonlyArray<FableAspect> = [
  { key: "9:16", width: 1080, height: 1920, cropY: 0, captionY: 1430, crop: "" },
  { key: "1:1", width: 1080, height: 1080, cropY: CROP_1x1, captionY: 820, crop: `crop=1080:1080:0:${CROP_1x1}` },
  { key: "4:5", width: 1080, height: 1350, cropY: CROP_4x5, captionY: 1090, crop: `crop=1080:1350:0:${CROP_4x5}` },
];

// ── Rect helpers ──────────────────────────────────────────────────────────────────────────────────
export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** True iff two axis-aligned rects intersect (strict — touching edges do NOT count as an overlap). */
export function rectsIntersect(p: Rect, q: Rect): boolean {
  return p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom;
}

/** The inset output-device rect in the 9:16 SPINE frame — exactly what captureFable renders as #device. */
export function outputDeviceSpineRect(): Rect {
  const height = OUTPUT_DEVICE.bottom - OUTPUT_DEVICE.top;
  const width = (height * OUTPUT_DEVICE.aspectW) / OUTPUT_DEVICE.aspectH;
  const left = (CAP_W - width) / 2;
  return { top: OUTPUT_DEVICE.top, bottom: OUTPUT_DEVICE.bottom, left, right: left + width };
}

/** The device rect as it lands in a given aspect's FINAL frame (after the aspect's center-crop). */
export function outputDeviceRectInAspect(a: FableAspect): Rect {
  const s = outputDeviceSpineRect();
  return {
    top: Math.max(0, s.top - a.cropY),
    bottom: Math.min(a.height, s.bottom - a.cropY),
    left: s.left,
    right: s.right,
  };
}

/** The caption-band rect in a given aspect's FINAL frame (the band is full frame width). */
export function captionBandRectInAspect(a: FableAspect): Rect {
  return { top: a.captionY, bottom: a.captionY + CAP_BAND_H, left: 0, right: a.width };
}

// ── FOUR-SIDE title-safe band + per-beat FILL (operator feedback 2026-06-13) ───────────────────────
//
// The opening Claude Code CHAT beat read SPARSE on full-screen playback — content top-anchored, a big
// empty MIDDLE band. Two generalizations live here, wired into BOTH capture (LEG 1) and render (LEG 2):
//   1. FOUR-side title-safe — the #823 `assertHorizontalSafeArea` only checked LEFT/RIGHT; on a tall
//      phone the TOP/BOTTOM can crop too. `assert4SideSafeArea` requires key content to sit inside a
//      band inset by `FILL_SAFE_MARGIN` (~5%) from ALL FOUR edges.
//   2. FILL — a full-bleed beat (chat/title-less/terminal) must actually FILL the frame: the content
//      bbox must cover ≥ `MIN_FILL_AREA_FRACTION` of the frame AND leave no single empty edge band
//      wider than `MAX_EDGE_BAND_FRACTION`. A top-anchored sparse beat FAILS. Framed-object beats
//      (the output card/video on their designed cream matte) are exempt from FILL (fill:false) but
//      still must be 4-side-safe.

/** The four-side title-safe inset (fraction of each dimension). 5% = the minimum safe band (ask: ~5-8%). */
export const FILL_SAFE_MARGIN = 0.05;
/** A FILL beat's content bbox must cover at least this fraction of the frame area. */
export const MIN_FILL_AREA_FRACTION = 0.7;
/** No single empty edge band (gap between a content edge and the frame edge) may exceed this fraction. */
export const MAX_EDGE_BAND_FRACTION = 0.2;

/** The inner title-safe rectangle for a frame, inset by `margin` on every side. */
export function safeAreaBox(width = CAP_W, height = CAP_H, margin = FILL_SAFE_MARGIN): Rect {
  return { left: width * margin, top: height * margin, right: width * (1 - margin), bottom: height * (1 - margin) };
}

/**
 * FOUR-side title-safe assertion (generalizes #823 `assertHorizontalSafeArea` to top+bottom too).
 * Throws if any edge of `content` falls OUTSIDE the safe band, i.e. within `margin` of a frame edge.
 */
export function assert4SideSafeArea(args: {
  content: Rect;
  width?: number;
  height?: number;
  margin?: number;
  label?: string;
}): void {
  const { content } = args;
  const width = args.width ?? CAP_W;
  const height = args.height ?? CAP_H;
  const margin = args.margin ?? FILL_SAFE_MARGIN;
  const label = args.label ?? "beat";
  if (!(width > 0) || !(height > 0)) throw new Error(`assert4SideSafeArea: width/height must be positive (${width}x${height})`);
  if (!(margin > 0 && margin < 0.5)) throw new Error(`assert4SideSafeArea: margin must be in (0,0.5) (got ${margin})`);
  const safe = safeAreaBox(width, height, margin);
  const EPS = 0.5; // sub-pixel slack (content edges may be floored)
  const bad: string[] = [];
  if (content.left < safe.left - EPS) bad.push(`left ${Math.round(content.left)}px < safe ${Math.round(safe.left)}px`);
  if (content.top < safe.top - EPS) bad.push(`top ${Math.round(content.top)}px < safe ${Math.round(safe.top)}px`);
  if (content.right > safe.right + EPS) bad.push(`right ${Math.round(content.right)}px > safe ${Math.round(safe.right)}px`);
  if (content.bottom > safe.bottom + EPS) bad.push(`bottom ${Math.round(content.bottom)}px > safe ${Math.round(safe.bottom)}px`);
  if (bad.length > 0) {
    throw new Error(
      `#824 four-side title-safe violated for "${label}": ${bad.join("; ")} ` +
        `(${(margin * 100).toFixed(0)}% margin on ${width}x${height}). A full-screen tall-phone crop would clip it — ` +
        `inset the content inside the ${(margin * 100).toFixed(0)}% safe band on all four sides.`,
    );
  }
}

/**
 * FILL assertion — a full-bleed beat must not read sparse. Throws if the content bbox covers too little
 * of the frame (area) OR leaves any single empty edge band wider than the allowed fraction (the
 * "empty middle/top/bottom" the operator saw on the chat beat). Framed-object beats pass `fill:false`
 * and are exempt (their cream matte is a designed surround, not dead space).
 */
export function assertBeatFill(args: {
  content: Rect;
  width?: number;
  height?: number;
  minFillAreaFraction?: number;
  maxEdgeBandFraction?: number;
  label?: string;
}): void {
  const { content } = args;
  const width = args.width ?? CAP_W;
  const height = args.height ?? CAP_H;
  const minFill = args.minFillAreaFraction ?? MIN_FILL_AREA_FRACTION;
  const maxBand = args.maxEdgeBandFraction ?? MAX_EDGE_BAND_FRACTION;
  const label = args.label ?? "beat";
  const cw = Math.max(0, content.right - content.left);
  const ch = Math.max(0, content.bottom - content.top);
  const areaFraction = (cw * ch) / (width * height);
  const bands = {
    top: content.top / height,
    bottom: (height - content.bottom) / height,
    left: content.left / width,
    right: (width - content.right) / width,
  };
  const widest = (Object.entries(bands) as [string, number][]).reduce((m, e) => (e[1] > m[1] ? e : m), ["", 0]);
  const EPS = 1e-4;
  if (areaFraction < minFill - EPS) {
    throw new Error(
      `#824 fill violated for "${label}": content covers ${(areaFraction * 100).toFixed(1)}% of the frame ` +
        `(< ${(minFill * 100).toFixed(0)}% required). The beat reads sparse — distribute/enlarge content to fill the frame.`,
    );
  }
  if (widest[1] > maxBand + EPS) {
    throw new Error(
      `#824 fill violated for "${label}": empty ${widest[0]} band is ${(widest[1] * 100).toFixed(1)}% of the frame ` +
        `(> ${(maxBand * 100).toFixed(0)}% allowed) — a large dead band. Anchor content to span the frame (no empty ${widest[0]} gap).`,
    );
  }
}

// ── Per-beat content geometry (the SSOT the capture HTML derives from + the gate asserts) ──────────
export interface FableBeatLayout {
  beat: number;
  kind: string;
  /** Key-content bounding box in the 9:16 SPINE (1080×1920) coordinate space. */
  content: Rect;
  /** true → the beat is full-bleed and must FILL; false → framed-object/transient, 4-side-safe only. */
  fill: boolean;
}

/**
 * The CHAT-beat content box (SSOT) — the panel CONTAINER. `tools/captureFable.ts` positions its
 * #content container at these exact spine px, so the panel spans the safe area top→bottom and stays
 * inside the 4-side safe band. NOTE: this box only proves the CONTAINER is full-bleed — whether the
 * conversation INSIDE it fills the panel (vs bunching at the top over a dead band) is a SEPARATE
 * invariant, asserted by `assertChatBeatInteriorFill` against `CHAT_FILL_CONTRACT` below.
 */
export const CHAT_CONTENT_BOX: Rect = { left: 72, top: 120, right: CAP_W - 72, bottom: CAP_H - 120 };
/** The raised lower-third label baseline (px from the BOTTOM). #823's 72px sat below the safe band. */
export const LOWER_THIRD_BOTTOM_PX = 120;

/**
 * #824 — the chat beat's INTERIOR-fill contract. `assertBeatFill` on `CHAT_CONTENT_BOX` only proves the
 * panel CONTAINER spans the frame — it is BLIND to whether the conversation INSIDE the panel fills it
 * (the operator's "too much empty space": a few short messages bunched at the top over a dead middle
 * band, while the panel border was full-bleed). This contract models the rendered message rows the
 * capture HTML (`buildChatHtml`) produces — their count, min heights, and the flex `justify` mode — so
 * the gate can compute the worst-case empty band BETWEEN rows and reject a sparse layout. Keep these in
 * lock-step with the CSS in buildChatHtml.
 */
export interface ChatFillContract {
  /** Top of the message area (below the header) in 9:16 spine px. */
  innerTopPx: number;
  /** Bottom of the message area (above the composer) in 9:16 spine px. */
  innerBottomPx: number;
  /** Min rendered height of each message row, top→bottom (greet, you-bubble, agent, deliverables). */
  rowHeightsPx: number[];
  /** The flex distribution the HTML uses — decides how slack pools into gaps. */
  justify: "start" | "between" | "evenly";
}

export const CHAT_FILL_CONTRACT: ChatFillContract = {
  // box.top(120) + panel padding-top(52) + header block(~96) + #chat padding-top(40)
  innerTopPx: 120 + 52 + 96 + 40,
  // box.bottom(1800) − panel padding-bottom(52) − composer block(~150) − #chat padding-bottom(6)
  //   − the 240px caption-band reserve (#chat margin-bottom) so the rows end ABOVE the 9:16 caption band.
  innerBottomPx: CAP_H - 120 - 52 - 150 - 6 - 240,
  // greet, you-bubble, agent line, deliverables checklist (3 rows ≈ 462px) — mirror buildChatHtml min-heights.
  rowHeightsPx: [86, 210, 84, 462],
  justify: "between",
};

/** Worst-case empty band (px) between rendered rows, given the flex distribution of the slack. */
export function worstInteriorGapPx(c: ChatFillContract): number {
  const inner = Math.max(0, c.innerBottomPx - c.innerTopPx);
  const sum = c.rowHeightsPx.reduce((a, b) => a + b, 0);
  const slack = Math.max(0, inner - sum);
  const n = c.rowHeightsPx.length;
  if (n <= 1) return slack;
  // `between` splits slack into n-1 interior gaps; `evenly` into n+1; `start` pools ALL slack into one
  // trailing band (the old top-anchored bug) — so flush-top is judged by its single worst band.
  if (c.justify === "between") return slack / (n - 1);
  if (c.justify === "evenly") return slack / (n + 1);
  return slack;
}

/**
 * #824 — the chat beat's CROSS-LAYER caption-clearance invariant. The global synced caption is
 * composited LATER (voiceFable) over the lower-third band (`captionBandRectInAspect`), so the chat's own
 * bottom rows must end ABOVE the band — exactly the cross-layer rule `assertNoCaptionMediaOverlap`
 * enforces for embedded output-beat MEDIA, but that guard never covered a CAPTURED PAGE beat's own
 * content. Without this, the bottom deliverable row lands under the caption text (the 2026-06-13 miss).
 * The 9:16 hero is native (cropY 0) so its `captionY` is the spine band top.
 */
export function heroCaptionBandTopSpinePx(): number {
  const hero = FABLE_ASPECTS.find((a) => a.key === "9:16");
  if (!hero) throw new Error("heroCaptionBandTopSpinePx: 9:16 aspect missing from FABLE_ASPECTS");
  return hero.captionY; // native 9:16 → spine coords == final-frame coords
}

export function assertChatContentClearsCaptionBand(
  c: ChatFillContract = CHAT_FILL_CONTRACT,
  marginPx = 24,
): void {
  const bandTop = heroCaptionBandTopSpinePx();
  if (c.innerBottomPx > bandTop - marginPx + 1e-4) {
    throw new Error(
      `#824 chat-beat caption overlap: chat content bottom is ${c.innerBottomPx}px, not clear of the 9:16 ` +
        `caption band top ${bandTop}px (need ≤ ${bandTop - marginPx}px). The synced caption (composited ` +
        `later over the lower third) would land over the bottom deliverable row — reserve the caption band ` +
        `(end the chat rows above it via #chat margin-bottom).`,
    );
  }
}

/**
 * Throws if the chat beat's conversation leaves an interior dead band wider than the allowed fraction
 * of the frame — the cross-check `assertBeatFill(CHAT_CONTENT_BOX)` cannot see this (it validates the
 * panel container, not the rows inside). Both-ends: the shipped distributed layout PASSES; a
 * top-anchored or too-few-short-rows layout FAILS.
 */
export function assertChatBeatInteriorFill(
  c: ChatFillContract = CHAT_FILL_CONTRACT,
  maxEdgeBandFraction = MAX_EDGE_BAND_FRACTION,
  height = CAP_H,
): void {
  const gap = worstInteriorGapPx(c);
  const limit = maxEdgeBandFraction * height;
  if (gap > limit + 1e-4) {
    throw new Error(
      `#824 chat-beat interior dead band: worst empty gap is ${gap.toFixed(0)}px ` +
        `(> ${limit.toFixed(0)}px allowed) for justify=${c.justify} with ${c.rowHeightsPx.length} rows. ` +
        `The conversation reads sparse over a void — distribute/grow the message rows to fill the panel.`,
    );
  }
}

/**
 * The shipped per-beat layout boxes the gate validates. Title cards are intentionally centered
 * (fill:false); chat + terminal are full-bleed (fill:true); the output beats reuse the inset device
 * rect (fill:false — framed object on the cream matte); the 3s transition is a transient handoff (omitted).
 */
export const FABLE_BEAT_LAYOUTS: ReadonlyArray<FableBeatLayout> = [
  { beat: 1, kind: "title", content: { left: 120, top: 560, right: CAP_W - 120, bottom: 1360 }, fill: false },
  { beat: 2, kind: "chat", content: CHAT_CONTENT_BOX, fill: true },
  { beat: 3, kind: "terminal", content: { left: 108, top: 120, right: CAP_W - 108, bottom: CAP_H - 120 }, fill: true },
  { beat: 5, kind: "viewer-card", content: outputDeviceSpineRect(), fill: false },
  { beat: 6, kind: "viewer-video", content: outputDeviceSpineRect(), fill: false },
  { beat: 7, kind: "title", content: { left: 120, top: 560, right: CAP_W - 120, bottom: 1360 }, fill: false },
  { beat: 8, kind: "title", content: { left: 120, top: 480, right: CAP_W - 120, bottom: 1440 }, fill: false },
];

/**
 * The #824 video-fill-safe invariant — every shipped beat layout is FOUR-side title-safe, and every
 * full-bleed (fill) beat actually FILLS the frame (no sparse/top-anchored dead band). Called by BOTH
 * LEG 1 (captureFable preflight) and LEG 2 (voiceFable, before render) so a sparse or edge-cropping
 * beat HARD-FAILS before any capture/render is spent. Pass a synthetic list to exercise the failing end.
 */
export function assertFableBeatsSafeAndFilled(layouts: ReadonlyArray<FableBeatLayout> = FABLE_BEAT_LAYOUTS): void {
  for (const l of layouts) {
    const label = `beat ${l.beat} (${l.kind})`;
    assert4SideSafeArea({ content: l.content, label });
    if (l.fill) assertBeatFill({ content: l.content, label });
    // The chat beat needs two cross-checks the container box is blind to: (1) its conversation must FILL
    // the panel interior (no dead middle band), not just its border be full-bleed; (2) its bottom rows
    // must clear the lower-third caption band the global synced caption is composited into later.
    if (l.kind === "chat") {
      assertChatBeatInteriorFill();
      assertChatContentClearsCaptionBand();
    }
  }
}

// ── #1071 FRAME-ECONOMY gate (operator feedback 2026-06-20 — "the product is too small") ───────────
//
// The recurring defect this prevents: a board/device-subject beat whose framed surface fills only a
// SLIVER of the frame, marooned in big empty matte bands. The #1046 v3 beat-7 captured the board in a
// LANDSCAPE (all-4-columns) viewport and scaled that wide strip into the 9:16 spine — the device ended up
// ~⅓ of the title-safe HEIGHT with large cream bands top+bottom (the operator's "product too small").
// assert4SideSafeArea only checks the device does not CROSS the safe edge (a ceiling); it is BLIND to a
// device that is far too SMALL inside the safe box. assertBeatFill is for full-bleed beats and is waived
// for framed-object beats (fill:false), so it never fires on these. So neither existing guard catches a
// shrunken board subject — this gate adds the missing FLOOR.

/**
 * A device/board-subject beat's framed surface must fill at least this fraction of the SAFE-AREA HEIGHT.
 * Principled floor (NOT tuned-to-pass): a portrait board beat must occupy a clear MAJORITY (≥60%) of the
 * title-safe height — below this the board reads as a thin strip in empty cream. The shipped portrait
 * board device (WIDE_BOARD_DEVICE: 1120px of the 1728px safe height = 0.648) clears it; the rejected v3
 * landscape beat-7 (~0.35) fails it. The ceiling of the band is the 4-side title-safe box itself
 * (assert4SideSafeArea — nothing may cross the safe edge), so MIN..safe is a BAND.
 */
export const MIN_SUBJECT_FILL_HEIGHT_FRACTION = 0.6;

/**
 * The beat kinds whose SUBJECT is the framed device/board surface (the board still, its pan-zoom, or a
 * captured board clip). Only these are economy-checked. Title / terminal / chat beats carry no device
 * subject and are exempt — their content box is text/centered, not a product surface that can read "small".
 */
export const DEVICE_SUBJECT_KINDS: ReadonlySet<string> = new Set([
  "viewer-video",
  "viewer-panzoom",
  "viewer-card",
]);

/** True iff a beat's kind makes its subject the framed device/board surface (frame-economy applies). */
export function isDeviceSubjectBeat(kind: string): boolean {
  return DEVICE_SUBJECT_KINDS.has(kind);
}

/**
 * #1071 FRAME-ECONOMY invariant — every device/board-subject beat's framed surface must sit inside a BAND:
 *   • FLOOR — it fills ≥ `minFillHeightFraction` of the SAFE-AREA HEIGHT (not a thin strip in empty cream).
 *   • CEILING — it stays inside the 4-side title-safe box (assert4SideSafeArea — nothing crops the frame).
 * Title / terminal / chat beats carry no device subject → skipped. This is the mechanical prevention for
 * the operator's "the product is too small" feedback: a landscape board clip scaled into 9:16 fills only
 * ~⅓ of the height and reads as a strip. Pass a synthetic layout list to exercise the failing end.
 */
export function assertFrameEconomy(
  layouts: ReadonlyArray<FableBeatLayout>,
  opts?: { minFillHeightFraction?: number; width?: number; height?: number; margin?: number },
): void {
  const width = opts?.width ?? CAP_W;
  const height = opts?.height ?? CAP_H;
  const margin = opts?.margin ?? FILL_SAFE_MARGIN;
  const minFill = opts?.minFillHeightFraction ?? MIN_SUBJECT_FILL_HEIGHT_FRACTION;
  if (!(minFill > 0 && minFill < 1)) throw new Error(`assertFrameEconomy: minFillHeightFraction must be in (0,1) (got ${minFill})`);
  const safe = safeAreaBox(width, height, margin);
  const safeH = safe.bottom - safe.top;
  const EPS = 1e-4;
  for (const l of layouts) {
    if (!isDeviceSubjectBeat(l.kind)) continue; // only device/board-subject beats are economy-checked
    const label = `beat ${l.beat} (${l.kind})`;
    // CEILING — the framed surface must not cross the 4-side title-safe edge (nothing crops).
    assert4SideSafeArea({ content: l.content, width, height, margin, label });
    // FLOOR — the framed surface must fill a clear majority of the safe-area HEIGHT (not a thin strip).
    const subjectH = Math.max(0, l.content.bottom - l.content.top);
    const fillH = subjectH / safeH;
    if (fillH < minFill - EPS) {
      throw new Error(
        `#1071 frame-economy violated for "${label}": the board subject fills only ${(fillH * 100).toFixed(1)}% ` +
          `of the title-safe height (< ${(minFill * 100).toFixed(0)}% required). The product reads as a thin strip ` +
          `in empty cream bands — frame the board PORTRAIT so it fills the frame, not a landscape strip scaled into 9:16.`,
      );
    }
  }
}

export interface OverlapHit {
  aspect: string;
  deviceBottom: number;
  bandTop: number;
}

/**
 * Cross-layer check: on every captioned aspect, the embedded-media bbox must NOT intersect the caption
 * band. Returns the offending aspects (empty = clean). The caption band is full-width, so an overlap
 * reduces to the device's bottom edge crossing into the band's vertical span.
 */
export function captionMediaOverlaps(aspects: ReadonlyArray<FableAspect> = FABLE_ASPECTS): OverlapHit[] {
  const hits: OverlapHit[] = [];
  for (const a of aspects) {
    const dev = outputDeviceRectInAspect(a);
    const band = captionBandRectInAspect(a);
    if (rectsIntersect(dev, band)) hits.push({ aspect: a.key, deviceBottom: dev.bottom, bandTop: band.top });
  }
  return hits;
}

/**
 * The #824 prevention invariant — throws if the embedded output-beat media overlaps the lower-third
 * caption band on ANY captioned aspect. Called by BOTH LEG 1 (captureFable preflight) and LEG 2
 * (voiceFable, before the render loop) so a future captioned-over-media beat cannot ship with the
 * overlap. Pass a synthetic aspect list to exercise the failing end.
 */
export function assertNoCaptionMediaOverlap(aspects: ReadonlyArray<FableAspect> = FABLE_ASPECTS): void {
  const hits = captionMediaOverlaps(aspects);
  if (hits.length > 0) {
    const detail = hits
      .map((h) => `${h.aspect} (device bottom ${Math.round(h.deviceBottom)}px > caption-band top ${h.bandTop}px)`)
      .join("; ");
    throw new Error(
      `#824 Fable caption-overlap: the embedded output-beat media intersects the lower-third caption band on ${detail}. ` +
        `Inset OUTPUT_DEVICE (video/fableLayout.ts) so its bottom edge clears the caption-band top in every aspect.`,
    );
  }
}
