/**
 * #1120 — a DEPENDENCY-FREE PNG decoder + region pixel probe, for the Rule-19 "the glyph is on the committed
 * pixels" both-ends AC. Decodes an 8-bit, non-interlaced PNG (color type 2 RGB or 6 RGBA) using only Node's
 * built-in `zlib` (no sharp/pngjs/canvas — none are installed), then counts pixels in a normalized region
 * matching a colour predicate. Used by the kanban spec test to prove the ◆ REVIEW · PASS verdict text is
 * actually drawn on `assets/kanban-demo/board-overview.png` (not merely declared in metadata).
 *
 * Pure CPU + Node stdlib — NO network / ffmpeg / Playwright / paid call. Supports exactly what a Playwright
 * `page.screenshot()` emits (8-bit, no interlace, colour type 2/6) — throws on anything else (loud, not silent).
 */

import * as zlib from "zlib";

export interface DecodedPng {
  width: number;
  height: number;
  /** RGBA, 4 bytes/pixel, row-major (alpha = 255 for an RGB source). */
  data: Uint8Array;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/** Decode an 8-bit, non-interlaced, colour-type-2 (RGB) or 6 (RGBA) PNG to RGBA. */
export function decodePng(buf: Buffer): DecodedPng {
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== SIG[i]) throw new Error("decodePng: not a PNG (bad signature)");
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const dataStart = pos + 8;
    if (type === "IHDR") {
      width = buf.readUInt32BE(dataStart);
      height = buf.readUInt32BE(dataStart + 4);
      bitDepth = buf[dataStart + 8];
      colorType = buf[dataStart + 9];
      interlace = buf[dataStart + 12];
    } else if (type === "IDAT") {
      idat.push(buf.subarray(dataStart, dataStart + len));
    } else if (type === "IEND") {
      break;
    }
    pos = dataStart + len + 4; // skip data + CRC
  }
  if (bitDepth !== 8) throw new Error(`decodePng: only 8-bit supported (got bitDepth ${bitDepth})`);
  if (interlace !== 0) throw new Error("decodePng: interlaced PNG not supported");
  if (colorType !== 2 && colorType !== 6) throw new Error(`decodePng: only RGB(2)/RGBA(6) supported (got colorType ${colorType})`);
  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const recon = Buffer.alloc(height * stride);
  let rp = 0; // pointer into raw (filter byte + stride per row)
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const rowStart = y * stride;
    const prevStart = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const cur = raw[rp++];
      const a = x >= channels ? recon[rowStart + x - channels] : 0;
      const b = y > 0 ? recon[prevStart + x] : 0;
      const c = x >= channels && y > 0 ? recon[prevStart + x - channels] : 0;
      let val: number;
      switch (filter) {
        case 0: val = cur; break;
        case 1: val = cur + a; break;
        case 2: val = cur + b; break;
        case 3: val = cur + ((a + b) >> 1); break;
        case 4: val = cur + paeth(a, b, c); break;
        default: throw new Error(`decodePng: bad filter type ${filter} at row ${y}`);
      }
      recon[rowStart + x] = val & 0xff;
    }
  }
  // Expand to RGBA.
  const data = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++) {
    data[j] = recon[i * channels];
    data[j + 1] = recon[i * channels + 1];
    data[j + 2] = recon[i * channels + 2];
    data[j + 3] = channels === 4 ? recon[i * channels + 3] : 255;
    j += 4;
  }
  return { width, height, data };
}

export interface NormRegion {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Count pixels in a NORMALIZED (0..1) region whose (r,g,b) satisfy `pred`. */
export function countMatching(img: DecodedPng, region: NormRegion, pred: (r: number, g: number, b: number) => boolean): number {
  const x0 = Math.max(0, Math.floor(region.sx * img.width));
  const y0 = Math.max(0, Math.floor(region.sy * img.height));
  const x1 = Math.min(img.width, Math.ceil((region.sx + region.sw) * img.width));
  const y1 = Math.min(img.height, Math.ceil((region.sy + region.sh) * img.height));
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      if (pred(img.data[i], img.data[i + 1], img.data[i + 2])) n++;
    }
  }
  return n;
}

/**
 * The verdict-text colour predicate. The ◆ REVIEW · PASS phase line renders in agent-kanban's verdict-green
 * `--done` #4f9e7a (R79 G158 B122 — green-dominant teal) over a near-black board body. A pixel is "verdict
 * text" when it is clearly green-dominant + bright enough to be a glyph stroke, not the dark background.
 */
export function isVerdictGreen(r: number, g: number, b: number): boolean {
  return g > 110 && g > r + 25 && g >= b && b >= r - 10;
}
