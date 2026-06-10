/**
 * #808 RULE 2 — the mobile-proxy cap assertion + helpers (pure, no rendering).
 *
 * Proves (both-ends): a compliant proxy PASSES `assertMobileProxy`, and EACH cap breach
 * (oversize / over-resolution / no-faststart) FAILS it. Also covers the pure parsers
 * (`parseVideoDimensions`, `hasFaststartMoov` via crafted MP4-box fixtures) and the sibling-path
 * helper. No ffmpeg/render — fast and deterministic in CI.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  assertMobileProxy,
  parseVideoDimensions,
  hasFaststartMoov,
  type MobileProxyProbe,
} from "../renderProbe";
import { mobileProxyPathFor } from "../mobileProxy";
import { CONFIG } from "../../config";

const CAPS = {
  maxBytes: CONFIG.demo.mobileProxy.maxBytes,
  maxEdgePx: CONFIG.demo.mobileProxy.maxEdgePx,
};

/** A compliant 9:16 720p proxy probe (well under every cap). */
function compliantProbe(): MobileProxyProbe {
  return {
    bytes: 4 * 1024 * 1024, // 4MB — under the 15MB cap, near the 8MB target
    widthPx: 406,
    heightPx: 720,
    shortEdgePx: 406,
    longEdgePx: 720,
    hasFaststart: true,
  };
}

describe("#808 assertMobileProxy — cap enforcement", () => {
  it("PASSES a compliant proxy (≤15MB, ≤720p short edge, +faststart)", () => {
    expect(() => assertMobileProxy(compliantProbe(), CAPS, { label: "9:16" })).not.toThrow();
  });

  it("FAILS an oversize proxy (> hard byte cap)", () => {
    const p = { ...compliantProbe(), bytes: CAPS.maxBytes + 1 };
    expect(() => assertMobileProxy(p, CAPS)).toThrow(/size .* > cap/i);
  });

  it("FAILS an over-resolution proxy (short edge > maxEdgePx)", () => {
    const p = { ...compliantProbe(), widthPx: 1080, heightPx: 1920, shortEdgePx: 1080, longEdgePx: 1920 };
    expect(() => assertMobileProxy(p, CAPS)).toThrow(/short edge .* > /i);
  });

  it("FAILS a non-faststart proxy (moov not before mdat)", () => {
    const p = { ...compliantProbe(), hasFaststart: false };
    expect(() => assertMobileProxy(p, CAPS)).toThrow(/faststart/i);
  });

  it("aggregates MULTIPLE breaches into one error", () => {
    const p: MobileProxyProbe = {
      bytes: CAPS.maxBytes + 1,
      widthPx: 1080,
      heightPx: 1920,
      shortEdgePx: 1080,
      longEdgePx: 1920,
      hasFaststart: false,
    };
    let msg = "";
    try {
      assertMobileProxy(p, CAPS);
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toMatch(/size/i);
    expect(msg).toMatch(/short edge/i);
    expect(msg).toMatch(/faststart/i);
  });
});

describe("#808 parseVideoDimensions", () => {
  it("extracts WxH from a Video stream line", () => {
    const out =
      "  Stream #0:0(und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 406x720, 1200 kb/s, 30 fps";
    expect(parseVideoDimensions(out)).toEqual({ width: 406, height: 720 });
  });

  it("returns null when there is no Video stream", () => {
    expect(parseVideoDimensions("  Stream #0:1(und): Audio: aac, 44100 Hz, mono")).toBeNull();
  });
});

// Build a minimal top-level ISO-BMFF box stream so hasFaststartMoov can be exercised without a render.
function box(type: string, payloadLen = 8): Buffer {
  const size = 8 + payloadLen;
  const b = Buffer.alloc(size);
  b.writeUInt32BE(size, 0);
  b.write(type, 4, "ascii");
  return b;
}

describe("#808 hasFaststartMoov", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "proxy-faststart-"));

  it("true when moov precedes mdat", () => {
    const f = path.join(dir, "fast.mp4");
    fs.writeFileSync(f, Buffer.concat([box("ftyp"), box("moov", 32), box("mdat", 64)]));
    expect(hasFaststartMoov(f)).toBe(true);
  });

  it("false when mdat precedes moov (streamed, non-faststart)", () => {
    const f = path.join(dir, "slow.mp4");
    fs.writeFileSync(f, Buffer.concat([box("ftyp"), box("mdat", 64), box("moov", 32)]));
    expect(hasFaststartMoov(f)).toBe(false);
  });
});

describe("#808 mobileProxyPathFor", () => {
  it("names the sibling <base>-mobile.mp4 next to the master", () => {
    expect(mobileProxyPathFor("/out/review/builder-demo-9x16.mp4")).toBe(
      "/out/review/builder-demo-9x16-mobile.mp4",
    );
  });
});
