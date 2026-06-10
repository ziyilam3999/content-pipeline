/**
 * #808 RULE 2 — emit a phone-downloadable MOBILE PROXY next to a rendered master MP4.
 *
 * WHY: the operator reviews videos on the Claude phone app over remote control, whose download relay
 * silently fails on large files. The full-res 1080p master ballooned to ~37.7MB (oscillating motion
 * compresses poorly) and would NOT download; a 720p ~4MB proxy downloads fine. So EVERY produced
 * review video must auto-emit a `<name>-mobile.mp4` sibling. This is the in-process port of
 * `tools/make-mobile-proxy.sh` so proxy emission runs as part of the normal produce step (not a
 * manual afterthought). See feedback_deliver_mobile_proxy_for_remote_review_videos.
 *
 * The encode mirrors the shell helper byte-for-byte: scale by height (preserve aspect, even width),
 * libx264 crf, yuv420p, +faststart (moov-before-mdat so a phone streams it), aac. Caps live in the
 * config SSOT (`CONFIG.demo.mobileProxy`); the verify-side cap assertion is `assertMobileProxy`.
 *
 * Vendored ffmpeg only (no system ffmpeg, no network) — resolved via `resolveVendoredFfmpeg` so it
 * works from a worktree's symlinked node_modules too. FREE: a pure re-encode, never a paid call.
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

import { CONFIG } from "../config";
import { resolveVendoredFfmpeg } from "./renderProbe";

export interface MobileProxyOpts {
  /** Output path; defaults to `<input-dir>/<input-base>-mobile.mp4`. */
  outPath?: string;
  /** Max HEIGHT in pixels the proxy scales to (preserves aspect). Default: CONFIG.demo.mobileProxy.maxEdgePx. */
  maxHeightPx?: number;
  /** libx264 CRF. Default: CONFIG.demo.mobileProxy.crf. */
  crf?: number;
  /** AAC audio bitrate in kbps. Default: CONFIG.demo.mobileProxy.audioBitrateK. */
  audioBitrateK?: number;
}

/** The default sibling proxy path for a master: `<dir>/<base>-mobile.mp4`. */
export function mobileProxyPathFor(masterPath: string): string {
  const dir = path.dirname(masterPath);
  const base = path.basename(masterPath, path.extname(masterPath));
  return path.join(dir, `${base}-mobile.mp4`);
}

/** Build the loader env the vendored darwin/linux ffmpeg needs (sibling dylibs / .so). */
function ffmpegEnv(dir: string): NodeJS.ProcessEnv {
  if (process.platform === "darwin") {
    return { ...process.env, DYLD_FALLBACK_LIBRARY_PATH: dir, DYLD_LIBRARY_PATH: dir };
  }
  if (process.platform === "linux") {
    const prev = process.env.LD_LIBRARY_PATH;
    return { ...process.env, LD_LIBRARY_PATH: prev ? `${dir}:${prev}` : dir };
  }
  return { ...process.env };
}

/**
 * Encode a phone-downloadable mobile proxy of `masterPath` and return its absolute path.
 * Throws (loud) if the source is missing, the vendored ffmpeg can't be found, or the encode fails.
 * The cap-compliance check is separate (`assertMobileProxy` over `probeMobileProxy`) so the producer
 * can render-then-verify.
 */
export function makeMobileProxy(masterPath: string, opts?: MobileProxyOpts): string {
  if (!fs.existsSync(masterPath)) {
    throw new Error(`makeMobileProxy: source not found: ${masterPath}`);
  }
  const caps = CONFIG.demo.mobileProxy;
  const outPath = opts?.outPath ?? mobileProxyPathFor(masterPath);
  const maxHeight = opts?.maxHeightPx ?? caps.maxEdgePx;
  const crf = opts?.crf ?? caps.crf;
  const audioK = opts?.audioBitrateK ?? caps.audioBitrateK;

  const { bin, dir } = resolveVendoredFfmpeg();
  const args = [
    "-hide_banner",
    "-y",
    "-i", masterPath,
    // Scale by height, preserve aspect, keep width even (-2). Web-optimized + faststart for instant play.
    "-vf", `scale=-2:${maxHeight}:flags=lanczos`,
    "-c:v", "libx264",
    "-preset", "slow",
    "-crf", String(crf),
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-c:a", "aac",
    "-b:a", `${audioK}k`,
    outPath,
  ];
  const res = spawnSync(bin, args, {
    env: ffmpegEnv(dir),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) {
    throw new Error(`makeMobileProxy: failed to run vendored ffmpeg (${bin}): ${res.error.message}`);
  }
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size <= 0) {
    throw new Error(
      `makeMobileProxy: encode produced no output for ${masterPath} ` +
        `(exit ${res.status}, signal ${res.signal ?? "none"}). stderr tail: ${(res.stderr ?? "").slice(-400)}`,
    );
  }
  return outPath;
}
