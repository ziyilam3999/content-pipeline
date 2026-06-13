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
