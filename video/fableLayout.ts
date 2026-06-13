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
 * The CHAT-beat content box (SSOT). `tools/captureFable.ts` positions its #content container at these
 * exact spine px and space-distributes the conversation inside it, so the box IS the rendered extent by
 * construction. Spans the safe area top→bottom (no empty middle) and stays inside the 4-side safe band.
 */
export const CHAT_CONTENT_BOX: Rect = { left: 72, top: 120, right: CAP_W - 72, bottom: CAP_H - 120 };
/** The raised lower-third label baseline (px from the BOTTOM). #823's 72px sat below the safe band. */
export const LOWER_THIRD_BOTTOM_PX = 120;

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
