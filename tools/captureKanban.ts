/**
 * #1046 agent-kanban demo — the SILENT-CUT capture harness for the agent-kanban DEMONSTRATION video.
 *
 * REUSES content-pipeline's #824/#870/#871 demo machinery: the `DemoVideoSpec` recipe contract
 * (`assertDemoCategoryRecipe`), the Playwright `recordVideo` path, and the beat HTML builders
 * (`buildTitleHtml` / `buildTransitionHtml` / `buildViewerVideoHtml` / the pan-zoom geometry). The
 * kanban-specific pieces are a Claude Code CHAT surface, the agent's 3-role pipeline TERMINAL, and a
 * pan-zoom-over-still builder that ALSO draws the elaboration ring (the #871 forge `highlight` pattern).
 *
 * Beat sources:
 *   1/9/10 title · 2 chat · 3 tool terminal · 4 transition (board emerges) · 5/7 DYNAMIC board clips
 *   (out/capture/kanban/clip-*.mp4 — captured by tools/captureKanbanAssets.ts) framed on the output world ·
 *   6/8 STILL board pan-zoom (assets/kanban-demo/*.png) with a settled elaboration ring.
 *
 * Output (out/ is gitignored — never committed):
 *   • out/capture/kanban/beat-01..10.mp4               — the 10 beat clips (1080×1920)
 *   • out/capture/manifest.json                         — per beat: clip + probe + still/clip provenance
 *   • out/review/kanban/kanban-rough-silent-9x16.mp4    — a rough SILENT concat for the orchestrator EYEBALL
 *
 * GATES (run before any capture, also in --dry-run): the #870 recipe (R1–R13 via the kanbanSpec oracle),
 * 4-side-safe + fill geometry, the cross-layer caption/media overlap, paid-free + brand + owner scrub of
 * every shown command, and a brand/dev-token scrub of every on-screen text field + highlight label.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
import * as crypto from "crypto";
import { spawnSync } from "child_process";

import {
  CAP_W,
  CAP_H,
  CAP_FPS,
  buildTitleHtml,
  buildTerminalHtml,
  buildTransitionHtml,
  filterPublicLines,
  panZoomBgGeom,
  type PanZoomFocus,
} from "./captureFable";
import { assertCaptureCommandsFree, assertCaptureBrandClean } from "./captureDemo";
import { BG_CHAT, BG_OUTPUT_A, BG_OUTPUT_B, ownerLeak } from "../video/fableStoryboard";
import { assertBrandClean } from "../inputs/frames";
import { assertNoInternalDevTokens, assertNoPlaceholderUrls } from "../video/visualRedFlags";
import { assertFableBeatsSafeAndFilled, assertFrameEconomy, assertNoCaptionMediaOverlap, FABLE_ASPECTS, FILL_SAFE_MARGIN, type Rect } from "../video/fableLayout";
import { assertDemoCategoryRecipe } from "../video/demoCategoryRecipe";
import {
  KANBAN_BEATS,
  KANBAN_BEAT_LAYOUTS,
  kanbanSpec,
  kanbanClipDeviceRect,
  KANBAN_PICKER_CLIP,
  KANBAN_CARD_CLIP,
  KANBAN_DRAWER_CLIP,
  WIDE_BOARD_DEVICE,
  type KanbanBeat,
} from "../video/kanbanStoryboard";
import { resolveVendoredFfmpeg, probeRender } from "../video/renderProbe";

const REPO_ROOT = fs.realpathSync(process.cwd());

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Claude Code CHAT surface (beat 2) — the HUMAN's interface: plain English; the agent picks up the task ──
//
// A warm-clay Claude Code terminal. The human types the request; on send, the agent reveals it picking the
// work up into its REAL 3-role pipeline (planner → plan-review → executor → exec-review), which is exactly
// what surfaces on the board later. Big legible mono. Fills the beat-2 box (4-side safe + fill).
function buildKanbanChatHtml(label = "you → Claude Code · plain English"): string {
  const L = 90, T = 110, R = CAP_W - 90, B = CAP_H - 110;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${CAP_W}px;height:${CAP_H}px;background:${BG_CHAT};overflow:hidden;position:relative;
  font-family:ui-monospace,SFMono-Regular,Menlo,'Cascadia Code',monospace}
#content{position:absolute;left:${L}px;top:${T}px;width:${R - L}px;height:${B - T}px;
  display:flex;flex-direction:column;padding:46px 50px;border-radius:34px;
  background:linear-gradient(180deg,#211a16 0%,#171210 100%);border:2px solid rgba(231,226,219,.10);
  box-shadow:0 40px 120px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.04)}
#bar{display:flex;align-items:center;gap:16px;padding-bottom:26px;border-bottom:2px solid rgba(231,226,219,.10)}
#bar .dot{width:20px;height:20px;border-radius:50%}
.r{background:#ff5f57}.y{background:#febc2e}.g{background:#28c840}
#bar .star{margin-left:14px;color:#d97757;font-size:38px;line-height:1}
#bar .who{color:#e7e2db;font-weight:700;font-size:38px}
#bar .tag{margin-left:auto;color:#8a817a;font-size:30px}
#term{flex:1;display:flex;flex-direction:column;justify-content:flex-start;gap:34px;padding:40px 4px 6px;
  margin-bottom:96px;overflow:hidden;color:#e9e3da;font-size:43px;line-height:1.4}
.you-line{display:flex;align-items:baseline;gap:18px;font-size:46px}
.you-line .p{color:#5eead4;font-weight:700}
.you-line .t{color:#f4efe7;font-weight:600}
#caret{display:inline-block;width:18px;height:46px;background:#5eead4;transform:translateY(6px);
  animation:b 1s steps(1) infinite}
@keyframes b{50%{opacity:0}}
#resp{flex:1;display:flex;flex-direction:column;justify-content:space-evenly;gap:20px;opacity:0;transition:opacity .5s}
.ask{color:#cbb8ac;font-size:40px}
.role{display:flex;align-items:center;gap:22px}
.role .dot{width:22px;height:22px;border-radius:50%;flex:0 0 auto}
.role .name{font-weight:700}
.role .v{margin-left:auto;font-weight:700;white-space:nowrap}
.r1 .dot{background:#38bdf8}.r1 .name{color:#7dd3fc}
.r2 .dot{background:#f6b14e}.r2 .name{color:#f6b14e}.r2 .v{color:#f6b14e}
.r3 .dot{background:#34d399}.r3 .name{color:#6ee7b7}
.r4 .dot{background:#34d399}.r4 .name{color:#6ee7b7}.r4 .v{color:#34d399}
#done{display:flex;align-items:center;gap:22px;margin-top:8px;color:#9ad9b0;font-size:38px;font-weight:700}
#done .ok{color:#28c840}
#composer{margin-top:24px;display:flex;align-items:center;gap:20px;background:rgba(12,10,9,.5);
  border:2px solid rgba(94,234,212,.28);border-radius:24px;padding:28px 36px}
#composer .txt{color:#5eead4;font-size:34px;font-weight:600;letter-spacing:.2px}
#composer .send{margin-left:auto;width:56px;height:56px;border-radius:50%;background:#5eead4;
  display:flex;align-items:center;justify-content:center;color:#0b1020;font-size:34px;font-weight:800}
</style></head><body>
<div id="content">
  <div id="bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
    <span class="star">✻</span><span class="who">Claude Code</span><span class="tag">agent</span></div>
  <div id="term">
    <div class="you-line"><span class="p">&gt;</span><span class="t"><span id="txt"></span><span id="caret"></span></span></div>
    <div id="resp">
      <div class="ask">On it — running the pipeline, each step checked before the next:</div>
      <div class="role r1"><span class="dot"></span><span class="name">planner</span><span class="v">plan filed</span></div>
      <div class="role r2"><span class="dot"></span><span class="name">plan-review</span><span class="v">APPROVE-WITH-NOTES</span></div>
      <div class="role r3"><span class="dot"></span><span class="name">executor</span><span class="v">built + pushed</span></div>
      <div class="role r4"><span class="dot"></span><span class="name">exec-review</span><span class="v">PASS</span></div>
      <div id="done"><span class="ok">✓</span><span>every step surfaces on your board</span></div>
    </div>
  </div>
  <div id="composer"><span class="txt">${label}</span><span class="send">↑</span></div>
</div>
<script>
window.__chatType=(c)=>{document.getElementById('txt').textContent+=String(c);};
window.__chatSend=()=>{const cr=document.getElementById('caret');if(cr)cr.style.display='none';
  document.getElementById('resp').style.opacity='1';};
</script></body></html>`;
}

// ── The agent's pipeline TERMINAL (beat 3) — authored, public-safe output (no live MCP) ─────────────
const KANBAN_TERMINAL_OUTPUT: Record<string, string[]> = {
  "claude  plan and ship the board update": [
    "  planner        plan filed",
    "  plan-review    APPROVE-WITH-NOTES",
    "  executor       branch pushed, tests green",
    "  exec-review    PASS",
  ],
  "show the run on agent-kanban": [
    "  syncing the live board ...",
    "  4 roles, 4 verdicts  ->  on your board",
  ],
};

// ── pan-zoom-over-still builder (beat 6) — directed camera + settled elaboration ring ───────────────
const KANBAN_BOARD_BG = "rgb(8, 11, 20)"; // the board's dark body — iframe margins use it (no island seam)
// The #device CSS border width (px). With box-sizing:border-box the media (#pz / <video>) lives in the
// CONTENT box (device − 2·border), so BOTH the pan-zoom geometry AND the ring MUST be resolved against the
// content box and offset by the border — the #1046 v2 ring used the full device box + omitted the border, so
// the ring landed up-and-RIGHT of the badge and slightly oversized (v3 fix-1).
const DEVICE_BORDER = 10;
// Beat-8 drawer clip: how long (s) into the clip the drawer has SETTLED (board establish + tap + open-spring),
// after which the elaboration ring animates in. Must be ≥ the captured open sequence in captureKanbanAssets.
const DRAWER_RING_DELAY_SEC = 5.0;

function buildKanbanPanZoomHtml(opts: {
  imgDataUri: string;
  srcW: number;
  srcH: number;
  focusStart: PanZoomFocus;
  focusEnd: PanZoomFocus;
  holdSec: number;
  durationSec: number;
  label: string;
  device: Rect;
  highlight?: { sx: number; sy: number; sw: number; sh: number; label: string; labelBelow?: boolean };
}): string {
  const { imgDataUri, srcW, srcH, focusStart, focusEnd, holdSec, durationSec, highlight, device } = opts;
  // The board still is framed INSET in `device` (a wide rect on the cream world, NOT full-bleed). The #pz
  // background fills the device's CONTENT box (device − 2·DEVICE_BORDER, because box-sizing:border-box), so
  // the pan-zoom geometry is resolved against the CONTENT box — and the ring origin is offset by the border
  // (v3 fix-1: v2 used the full device box + no border offset → the ring sat up-and-right of the element).
  const dW = device.right - device.left;
  const dH = device.bottom - device.top;
  const cW = dW - 2 * DEVICE_BORDER;
  const cH = dH - 2 * DEVICE_BORDER;
  const a = panZoomBgGeom(focusStart, srcW, srcH, cW, cH);
  const b = panZoomBgGeom(focusEnd, srcW, srcH, cW, cH);
  const sz = (g: { bgW: number; bgH: number }) => `${g.bgW.toFixed(1)}px ${g.bgH.toFixed(1)}px`;
  const pos = (g: { posX: number; posY: number }) => `${g.posX.toFixed(1)}px ${g.posY.toFixed(1)}px`;
  // Establishing HOLD on A, ease A→B, then HOLD B. settlePct is when the camera reaches the element.
  const holdPct = Math.max(0, Math.min(40, (holdSec / durationSec) * 100));
  const settlePct = Math.min(72, holdPct + 42);

  // The highlight ring's screen rect at the focusEnd (b) framing, in FULL-FRAME coords. The #pz content box's
  // top-left is at (device.left + DEVICE_BORDER, device.top + DEVICE_BORDER) and the background pixel
  // (sx·bgW, sy·bgH) sits at content-origin + b.pos + norm·bg — so the ring lands EXACTLY on the element.
  let ringHtml = "";
  if (highlight) {
    const pad = 14;
    const rx = device.left + DEVICE_BORDER + b.posX + highlight.sx * b.bgW - pad;
    const ry = device.top + DEVICE_BORDER + b.posY + highlight.sy * b.bgH - pad;
    const rw = highlight.sw * b.bgW + pad * 2;
    const rh = highlight.sh * b.bgH + pad * 2;
    const labelTop = highlight.labelBelow ? ry + rh + 16 : ry - 72;
    // Anchor the caption UNDER the ring (centered on the ring's x), not frame-centered — a frame-centered label
    // detaches from a top-corner badge (#1046: the "live or idle" caption floated mid-frame, nowhere near the
    // top-right LIVE badge). Clamp the center so the caption (≈ half-width LABEL_HALF) never crosses the
    // title-safe margin on either edge.
    const LABEL_HALF = 180;
    const safeX = FILL_SAFE_MARGIN * CAP_W;
    const ringCx = rx + rw / 2;
    const labelCx = Math.min(Math.max(ringCx, safeX + LABEL_HALF), CAP_W - safeX - LABEL_HALF);
    const ringDelay = (settlePct / 100) * durationSec;
    ringHtml =
      `<div id="ring" style="left:${rx.toFixed(0)}px;top:${ry.toFixed(0)}px;width:${rw.toFixed(0)}px;height:${rh.toFixed(0)}px;animation-delay:${ringDelay.toFixed(2)}s"></div>` +
      `<div id="ringlabel" style="left:${labelCx.toFixed(0)}px;top:${labelTop.toFixed(0)}px;animation-delay:${ringDelay.toFixed(2)}s">${highlight.label}</div>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${CAP_W}px;height:${CAP_H}px;overflow:hidden;position:relative;
  background:linear-gradient(160deg,${BG_OUTPUT_A},${BG_OUTPUT_B});
  font-family:ui-sans-serif,-apple-system,Helvetica,Arial,sans-serif}
#device{position:absolute;left:${device.left.toFixed(1)}px;top:${device.top.toFixed(1)}px;
  width:${dW.toFixed(1)}px;height:${dH.toFixed(1)}px;border-radius:34px;overflow:hidden;
  border:${DEVICE_BORDER}px solid #0e1424;box-shadow:0 40px 110px rgba(60,40,10,.32);background:${KANBAN_BOARD_BG}}
#pz{position:absolute;inset:0;background-image:url(${imgDataUri});background-repeat:no-repeat;
  background-size:${sz(a)};background-position:${pos(a)};
  animation:pz ${durationSec.toFixed(2)}s ease-in-out forwards}
@keyframes pz{
  0%{background-size:${sz(a)};background-position:${pos(a)}}
  ${holdPct.toFixed(1)}%{background-size:${sz(a)};background-position:${pos(a)}}
  ${settlePct.toFixed(1)}%{background-size:${sz(b)};background-position:${pos(b)}}
  100%{background-size:${sz(b)};background-position:${pos(b)}}
}
#ring{position:absolute;z-index:2;border:5px solid #5eead4;border-radius:18px;opacity:0;
  box-shadow:0 0 0 4px rgba(94,234,212,.22),0 0 34px 8px rgba(94,234,212,.40);animation:ringin .5s ease-out forwards}
#ringlabel{position:absolute;z-index:3;left:50%;transform:translateX(-50%);max-width:760px;text-align:center;
  white-space:nowrap;color:#14100c;background:#f7f1e6;border:2px solid #5eead4;
  border-radius:12px;padding:10px 24px;font:700 32px/1.25 inherit;opacity:0;animation:labelin .5s ease-out forwards;
  box-shadow:0 8px 26px rgba(0,0,0,.28)}
@keyframes ringin{from{opacity:0;transform:scale(1.06)}to{opacity:1;transform:scale(1)}}
@keyframes labelin{from{opacity:0;transform:translateX(-50%) scale(1.06)}to{opacity:1;transform:translateX(-50%) scale(1)}}
</style></head><body>
<div id="device"><div id="pz"></div></div>
${ringHtml}
</body></html>`;
}

// ── inset board-CLIP frame (beats 5/7/8) — the captured board clip framed on the cream world. Plays ONCE
// (no loop): the clips start on the live board and end on the switched/advanced/drawer-open state, so a loop
// would jump-cut AND Chromium paints a white flash at the loop boundary — playing once settles cleanly on the
// real final frame. `objectPosition` controls cover-crop alignment (beat 5 = "top" so the picker survives the
// 90%-wide cover-crop; beats 7/8 size the device to the clip aspect so cover is exact / no crop). An optional
// `highlight` draws the settled elaboration ring (beat 8) on the exact-aspect clip — same content-box +
// DEVICE_BORDER transform as the pan-zoom ring, animated in after the drawer has settled (ringDelaySec).
function buildKanbanClipFrameHtml(opts: {
  videoUrl: string;
  label: string;
  device: Rect;
  /** The captured clip's pixel dims — needed to resolve the object-fit:cover transform for the ring. */
  clipW: number;
  clipH: number;
  objectPosition?: string;
  /** object-fit:cover alignment as fractions (0=left/top, .5=center, 1=right/bottom) — MUST match objectPosition. */
  posFrac?: { x: number; y: number };
  highlight?: { sx: number; sy: number; sw: number; sh: number; label: string; labelBelow?: boolean };
  ringDelaySec?: number;
  /** Optional Ken-Burns push-in over the CLIP toward (cx,cy) [clip-normalized 0..1], ending zoomed to
   *  `zoom` fraction of the width; holds wide for the first `holdFrac` of the beat, then eases in. Used on
   *  beat 7 to enlarge the tiny "● WORKING" breathing indicator after the card lands (device==clip aspect,
   *  no cover-crop, so transform-origin % maps straight to clip coords). */
  clipPanZoom?: { cx: number; cy: number; zoom: number; holdFrac: number };
  durationSec?: number;
}): string {
  const { videoUrl, label, device, clipW, clipH, highlight } = opts;
  const pz = opts.clipPanZoom;
  const pzVideoCss = pz
    ? `transform-origin:${(pz.cx * 100).toFixed(1)}% ${(pz.cy * 100).toFixed(1)}%;animation:clippz ${(opts.durationSec ?? 12).toFixed(2)}s ease-in-out forwards`
    : "";
  const pzKeyframes = pz
    ? `@keyframes clippz{0%,${(pz.holdFrac * 100).toFixed(0)}%{transform:scale(1)}100%{transform:scale(${(1 / pz.zoom).toFixed(3)})}}`
    : "";
  const objectPosition = opts.objectPosition ?? "center";
  const posFrac = opts.posFrac ?? { x: 0.5, y: 0.5 };
  const dW = device.right - device.left;
  const dH = device.bottom - device.top;
  const cW = dW - 2 * DEVICE_BORDER;
  const cH = dH - 2 * DEVICE_BORDER;

  // The ring on the COVER-framed <video> (object-fit:cover fills the content box, scaling to cover + cropping
  // per object-position). Replicate that exact transform so the ring lands on the measured element: scale to
  // cover, then place the displayed media by the same object-position fraction. (When the device aspect == the
  // clip aspect this degenerates to an exact, no-crop fit with zero offset.)
  let ringHtml = "";
  if (highlight) {
    const pad = 14;
    const scale = Math.max(cW / clipW, cH / clipH);
    const dispW = clipW * scale;
    const dispH = clipH * scale;
    const offX = (cW - dispW) * posFrac.x;
    const offY = (cH - dispH) * posFrac.y;
    const rx = device.left + DEVICE_BORDER + offX + highlight.sx * dispW - pad;
    const ry = device.top + DEVICE_BORDER + offY + highlight.sy * dispH - pad;
    const rw = highlight.sw * dispW + pad * 2;
    const rh = highlight.sh * dispH + pad * 2;
    const labelTop = highlight.labelBelow ? ry + rh + 16 : ry - 72;
    const delay = (opts.ringDelaySec ?? DRAWER_RING_DELAY_SEC).toFixed(2);
    ringHtml =
      `<div id="ring" style="left:${rx.toFixed(0)}px;top:${ry.toFixed(0)}px;width:${rw.toFixed(0)}px;height:${rh.toFixed(0)}px;animation-delay:${delay}s"></div>` +
      `<div id="ringlabel" style="top:${labelTop.toFixed(0)}px;animation-delay:${delay}s">${highlight.label}</div>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${CAP_W}px;height:${CAP_H}px;overflow:hidden;position:relative;
  background:linear-gradient(160deg,${BG_OUTPUT_A},${BG_OUTPUT_B});
  font-family:ui-sans-serif,-apple-system,Helvetica,Arial,sans-serif}
#pill{position:absolute;left:50%;top:64px;transform:translateX(-50%);background:#14100c;color:#f7f1e6;
  border-radius:999px;font:700 30px/1.2 inherit;padding:18px 40px;letter-spacing:.3px;z-index:2;white-space:nowrap}
#device{position:absolute;left:${device.left.toFixed(1)}px;top:${device.top.toFixed(1)}px;
  width:${dW.toFixed(1)}px;height:${dH.toFixed(1)}px;border-radius:30px;overflow:hidden;
  border:${DEVICE_BORDER}px solid #0e1424;box-shadow:0 40px 110px rgba(60,40,10,.32);background:${KANBAN_BOARD_BG}}
#device video{width:100%;height:100%;object-fit:cover;object-position:${objectPosition};display:block;${pzVideoCss}}
${pzKeyframes}
#ring{position:absolute;z-index:3;border:5px solid #5eead4;border-radius:18px;opacity:0;
  box-shadow:0 0 0 4px rgba(94,234,212,.22),0 0 34px 8px rgba(94,234,212,.40);animation:ringin .5s ease-out forwards}
#ringlabel{position:absolute;z-index:4;left:50%;transform:translateX(-50%);max-width:760px;text-align:center;
  white-space:nowrap;color:#14100c;background:#f7f1e6;border:2px solid #5eead4;
  border-radius:12px;padding:10px 24px;font:700 32px/1.25 inherit;opacity:0;animation:labelin .5s ease-out forwards;
  box-shadow:0 8px 26px rgba(0,0,0,.28)}
@keyframes ringin{from{opacity:0;transform:scale(1.06)}to{opacity:1;transform:scale(1)}}
@keyframes labelin{from{opacity:0;transform:translateX(-50%) scale(1.06)}to{opacity:1;transform:translateX(-50%) scale(1)}}
</style></head><body>
<div id="pill">${label}</div>
<div id="device"><video id="v" src="${videoUrl}" autoplay muted playsinline></video></div>
${ringHtml}
</body></html>`;
}

function fileToDataUri(p: string, mime: string): string {
  return `data:${mime};base64,${fs.readFileSync(p).toString("base64")}`;
}
function sha256File(p: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}
function relOf(p: string): string {
  return path.relative(REPO_ROOT, fs.realpathSync(p)).split(path.sep).join("/");
}

// ── ffmpeg (vendored remotion ffmpeg) ───────────────────────────────────────────────────────────────
function runFfmpeg(args: string[]): { code: number | null; out: string } {
  const { bin, dir } = resolveVendoredFfmpeg();
  const env = process.platform === "darwin" ? { ...process.env, DYLD_FALLBACK_LIBRARY_PATH: dir } : { ...process.env };
  const r = spawnSync(bin, args, { env, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  if (r.error) throw new Error(`captureKanban: vendored ffmpeg failed: ${r.error.message}`);
  return { code: r.status, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}

function transcodeBeatClip(webm: string, outMp4: string, clipSec: number): void {
  const dur = probeRender(webm).videoDurationSec;
  const start = Math.min(0.3, Math.max(0, dur - clipSec));
  const { code } = runFfmpeg([
    "-hide_banner", "-y",
    "-ss", start.toFixed(2), "-i", webm, "-t", clipSec.toFixed(2),
    "-r", String(CAP_FPS), "-vf", `scale=${CAP_W}:${CAP_H}`, "-pix_fmt", "yuv420p",
    "-c:v", "libx264", "-profile:v", "high", "-preset", "veryfast", "-crf", "20",
    "-movflags", "+faststart", "-an", outMp4,
  ]);
  if (!fs.existsSync(outMp4) || fs.statSync(outMp4).size === 0) {
    throw new Error(`captureKanban: beat transcode produced no output (ffmpeg exit ${code}) for ${webm}`);
  }
}

function concatBeats(beatMp4s: string[], outMp4: string): void {
  const listPath = path.join(path.dirname(outMp4), "_kanban-concat-list.txt");
  fs.writeFileSync(listPath, beatMp4s.map((p) => `file '${p}'`).join("\n"), "utf8");
  let { code } = runFfmpeg(["-hide_banner", "-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", outMp4]);
  if (!fs.existsSync(outMp4) || fs.statSync(outMp4).size === 0) {
    ({ code } = runFfmpeg(["-hide_banner", "-y", "-f", "concat", "-safe", "0", "-i", listPath,
      "-r", String(CAP_FPS), "-vf", `scale=${CAP_W}:${CAP_H}`, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "20", "-movflags", "+faststart", "-an", outMp4]));
  }
  if (!fs.existsSync(outMp4) || fs.statSync(outMp4).size === 0) {
    throw new Error(`captureKanban: rough concat produced no output (ffmpeg exit ${code}).`);
  }
}

// ── Gates (also run in --dry-run) ───────────────────────────────────────────────────────────────────
function assertKanbanBeatsClean(): void {
  assertDemoCategoryRecipe(kanbanSpec); // #870 recipe R1–R13 (the build's test oracle)
  assertFableBeatsSafeAndFilled(KANBAN_BEAT_LAYOUTS); // 4-side safe + fill
  assertFrameEconomy(KANBAN_BEAT_LAYOUTS); // #1071 — board-subject beats fill the frame (no thin strip)
  assertNoCaptionMediaOverlap(FABLE_ASPECTS); // cross-layer caption/media band clearance
  // paid-free + brand-clean + owner-clean over the terminal commands.
  const shaped = KANBAN_BEATS.map((b) => ({ commands: b.commands, stepLabel: b.stepLabel }));
  assertCaptureCommandsFree(shaped);
  assertCaptureBrandClean(shaped);
  for (const b of KANBAN_BEATS) {
    const hl = b.highlight?.label ?? "";
    const texts = [b.stepLabel, b.headline ?? "", b.sub ?? "", b.url ?? "", b.chatRequest ?? "", hl].filter((s) => s.length > 0);
    for (const t of texts) assertBrandClean(t); // every on-screen text field + the highlight label
    assertNoInternalDevTokens(
      [b.stepLabel, b.headline ?? "", b.sub ?? "", b.chatRequest ?? "", hl].filter((s) => s.length > 0),
      `beat ${b.n}`,
    );
    assertNoPlaceholderUrls([b.url ?? ""].filter((s) => s.length > 0), `beat ${b.n} url`);
    for (const c of b.commands) {
      const leak = ownerLeak(c);
      if (leak) throw new Error(`captureKanban: beat ${b.n} command "${c}" would leak the OS owner/username (${leak}).`);
    }
  }
  // Authored terminal output lines are public frames too — scrub them the same way.
  for (const lines of Object.values(KANBAN_TERMINAL_OUTPUT)) {
    for (const l of lines) {
      assertBrandClean(l);
      assertNoInternalDevTokens([l], "kanban terminal output");
    }
  }
}

// ── Recording (Playwright recordVideo) ──────────────────────────────────────────────────────────────
async function recordHtml(html: string, recordSec: number, recDir: string, chromium: any, setup?: (page: any) => Promise<void>, waitUntil: "domcontentloaded" | "networkidle" = "domcontentloaded"): Promise<string> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: CAP_W, height: CAP_H },
    recordVideo: { dir: recDir, size: { width: CAP_W, height: CAP_H } },
  });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil });
  await page.waitForTimeout(400);
  if (setup) await setup(page);
  await page.waitForTimeout(recordSec * 1000);
  const video = page.video();
  await context.close();
  await browser.close();
  return await video!.path();
}

/** Terminal beat: type the agent's pipeline commands, then write the authored public-safe output. */
async function recordKanbanTerminal(beat: KanbanBeat, recordSec: number, recDir: string, chromium: any): Promise<string> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: CAP_W, height: CAP_H },
    recordVideo: { dir: recDir, size: { width: CAP_W, height: CAP_H } },
  });
  const page = await context.newPage();
  await page.setContent(buildTerminalHtml(beat.stepLabel, "Claude Code"), { waitUntil: "domcontentloaded" });
  const start = Date.now();
  await page.waitForTimeout(600);
  for (const cmd of beat.commands) {
    await page.evaluate(() => (globalThis as any).window.__termPrompt());
    for (let i = 0; i < cmd.length; i += 2) {
      await page.evaluate((c: string) => {
        const doc = (globalThis as any).document;
        const o = doc.getElementById("out");
        const last = o.lastChild && o.lastChild.className === "cmd" ? o.lastChild : null;
        if (last) last.textContent += c;
        else { const s = doc.createElement("span"); s.className = "cmd"; s.textContent = c; o.appendChild(s); }
      }, cmd.slice(i, i + 2));
      await page.waitForTimeout(20);
    }
    await page.evaluate(() => (globalThis as any).window.__termWrite("\n"));
    const out = filterPublicLines((KANBAN_TERMINAL_OUTPUT[cmd] ?? []).join("\n") + "\n");
    await page.evaluate((t: string) => (globalThis as any).window.__termWrite(t), out);
    await page.waitForTimeout(900);
  }
  const remaining = recordSec * 1000 - (Date.now() - start);
  await page.waitForTimeout(Math.max(700, remaining));
  const video = page.video();
  await context.close();
  await browser.close();
  return await video!.path();
}

/** STILL board beat: render the committed PNG under an animated pan-zoom camera + a settled ring (dsf 2). */
async function recordKanbanPanZoomBeat(beat: KanbanBeat, recordSec: number, recDir: string, chromium: any): Promise<string> {
  const h = beat.hero!;
  const html = buildKanbanPanZoomHtml({
    imgDataUri: fileToDataUri(path.join(REPO_ROOT, h.source), "image/png"),
    srcW: h.srcW, srcH: h.srcH,
    focusStart: h.focusStart, focusEnd: h.focusEnd,
    holdSec: h.holdSec ?? 0, durationSec: beat.clipSec,
    label: beat.stepLabel, highlight: beat.highlight,
    device: WIDE_BOARD_DEVICE,
  });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: CAP_W, height: CAP_H },
    deviceScaleFactor: 2,
    recordVideo: { dir: recDir, size: { width: CAP_W, height: CAP_H } },
  });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.waitForTimeout(recordSec * 1000);
  const video = page.video();
  await context.close();
  await browser.close();
  return await video!.path();
}

/** The inset device rect + cover alignment + clip dims for a DYNAMIC board beat (#1046 v3 fix-2 framing):
 *  • beat 5 (session picker) — the 90%-wide WIDE_BOARD_DEVICE, COVER-cropped object-position TOP so the
 *    picker/dropdown (board top) survive and the sparse lower board is cropped → fills the frame width.
 *  • beat 7 (To Do→In Progress card move) — PORTRAIT device sized to the clip aspect (exact, no crop); the
 *    portrait two-column clip aspect ≈ the device-box aspect so it fills nearly the full WIDE_BOARD_DEVICE
 *    (board fills the frame, #1071 frame-economy — NOT the v3 landscape thin strip).
 *  • beat 8 (drawer open) — the 90%-wide WIDE_BOARD_DEVICE, COVER-cropped object-position BOTTOM so the deep
 *    timeline (pipeline header + verdict pills, which sit in the LOWER drawer) stays fully on screen + big;
 *    only the ticket title/board above is cropped. The ring's cover transform uses the same bottom alignment. */
function kanbanDynamicFraming(beatN: number): { device: Rect; objectPosition: string; posFrac: { x: number; y: number }; clipW: number; clipH: number } {
  if (beatN === 5) return { device: WIDE_BOARD_DEVICE, objectPosition: "top", posFrac: { x: 0.5, y: 0 }, clipW: KANBAN_PICKER_CLIP.w, clipH: KANBAN_PICKER_CLIP.h };
  if (beatN === 7) return { device: kanbanClipDeviceRect(KANBAN_CARD_CLIP.w, KANBAN_CARD_CLIP.h), objectPosition: "center", posFrac: { x: 0.5, y: 0.5 }, clipW: KANBAN_CARD_CLIP.w, clipH: KANBAN_CARD_CLIP.h };
  return { device: WIDE_BOARD_DEVICE, objectPosition: "center bottom", posFrac: { x: 0.5, y: 1 }, clipW: KANBAN_DRAWER_CLIP.w, clipH: KANBAN_DRAWER_CLIP.h };
}

/** DYNAMIC board beat: PLAY the captured board clip (once), FRAMED INSET on the cream output world; beat 8
 *  also draws the settled elaboration ring over the opened drawer's pipeline + verdict pills. */
async function recordViewerVideoBeat(beat: KanbanBeat, videoUrl: string, recDir: string, chromium: any): Promise<string> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: CAP_W, height: CAP_H },
    recordVideo: { dir: recDir, size: { width: CAP_W, height: CAP_H } },
  });
  const page = await context.newPage();
  const framing = kanbanDynamicFraming(beat.n);
  await page.setContent(buildKanbanClipFrameHtml({
    videoUrl, label: beat.stepLabel, device: framing.device,
    objectPosition: framing.objectPosition, posFrac: framing.posFrac,
    clipW: framing.clipW, clipH: framing.clipH, highlight: beat.highlight,
    clipPanZoom: beat.clipPanZoom, durationSec: beat.clipSec,
  }), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => { const v = (globalThis as any).document.getElementById("v"); return v && v.currentTime > 0.1; }, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout((beat.clipSec + 0.8) * 1000);
  const video = page.video();
  await context.close();
  await browser.close();
  return await video!.path();
}

// ── The capture run ──────────────────────────────────────────────────────────────────────────────────
async function runCapture(): Promise<void> {
  assertKanbanBeatsClean();
  // Verify every committed still exists with the declared byte size (provenance is also jest-checked).
  for (const b of KANBAN_BEATS) {
    if (!b.hero) continue;
    const abs = path.join(REPO_ROOT, b.hero.source);
    if (!fs.existsSync(abs)) throw new Error(`captureKanban: hero still missing: ${b.hero.source} (run capture:kanban-assets)`);
    const bytes = fs.statSync(abs).size;
    if (bytes !== b.hero.bytes) throw new Error(`captureKanban: hero still ${b.hero.source} is ${bytes} bytes, spec says ${b.hero.bytes}`);
  }
  // Verify the dynamic clips exist (captured by tools/captureKanbanAssets.ts).
  for (const b of KANBAN_BEATS) {
    if (!b.clipSource) continue;
    if (!fs.existsSync(path.join(REPO_ROOT, b.clipSource))) {
      throw new Error(`captureKanban: dynamic board clip missing: ${b.clipSource} — run \`npm run capture:kanban-assets\` first.`);
    }
  }

  const { chromium } = await import("playwright");
  const captureDir = path.join(REPO_ROOT, "out", "capture", "kanban");
  const reviewDir = path.join(REPO_ROOT, "out", "review", "kanban");
  const recRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanban-rec-"));
  fs.mkdirSync(captureDir, { recursive: true });
  fs.mkdirSync(reviewDir, { recursive: true });

  // loopback static server (serves the captured board clips to the viewer-video beats — loopback only).
  const server = http.createServer((req, res) => {
    const fp = path.join(REPO_ROOT, decodeURIComponent((req.url || "/").split("?")[0]));
    if (!fp.startsWith(REPO_ROOT) || !fs.existsSync(fp)) { res.writeHead(404); res.end(); return; }
    const ext = path.extname(fp);
    res.writeHead(200, { "Content-Type": ext === ".mp4" ? "video/mp4" : ext === ".png" ? "image/png" : "application/octet-stream" });
    fs.createReadStream(fp).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as any).port;

  const beatRecords: any[] = [];
  const beatMp4s: string[] = [];

  for (const beat of KANBAN_BEATS) {
    console.log(`[kanban] recording beat ${beat.n} (${beat.kind}) — ${beat.stepLabel || beat.headline || ""}`);
    const rec = beat.clipSec + 0.6;
    let webm: string;
    switch (beat.kind) {
      case "hook":
      case "payoff":
      case "cta":
        webm = await recordHtml(buildTitleHtml({ headline: beat.headline!, sub: beat.sub, url: beat.url }), rec, recRoot, chromium);
        break;
      case "chat":
        webm = await recordHtml(buildKanbanChatHtml(beat.stepLabel), rec, recRoot, chromium, async (page) => {
          const req = beat.chatRequest!;
          for (let i = 0; i < req.length; i += 2) {
            await page.evaluate((c: string) => (globalThis as any).window.__chatType(c), req.slice(i, i + 2));
            await page.waitForTimeout(40);
          }
          await page.waitForTimeout(400);
          await page.evaluate(() => (globalThis as any).window.__chatSend());
        });
        break;
      case "tool":
        webm = await recordKanbanTerminal(beat, rec, recRoot, chromium);
        break;
      case "transition": {
        const card = fileToDataUri(path.join(REPO_ROOT, "assets/kanban-demo/board-overview.png"), "image/png");
        webm = await recordHtml(buildTransitionHtml(card), rec, recRoot, chromium, undefined, "networkidle");
        break;
      }
      case "output":
        if (beat.hero) webm = await recordKanbanPanZoomBeat(beat, rec, recRoot, chromium);
        else webm = await recordViewerVideoBeat(beat, `http://127.0.0.1:${port}/${relOf(path.join(REPO_ROOT, beat.clipSource!))}`, recRoot, chromium);
        break;
      default:
        throw new Error(`captureKanban: unknown beat kind "${beat.kind}"`);
    }

    const outMp4 = path.join(captureDir, `beat-${String(beat.n).padStart(2, "0")}.mp4`);
    transcodeBeatClip(webm, outMp4, beat.clipSec);
    const probe = probeRender(outMp4);
    const rec2: any = {
      n: beat.n, kind: beat.kind, stepLabel: beat.stepLabel,
      clip: relOf(outMp4), bytes: fs.statSync(outMp4).size, videoFrames: probe.videoFrames,
      width: CAP_W, height: CAP_H, durationSec: Number(probe.videoDurationSec.toFixed(3)),
    };
    if (beat.hero) {
      const abs = path.join(REPO_ROOT, beat.hero.source);
      rec2.heroSource = { relPath: beat.hero.source, sha256: sha256File(abs), bytes: fs.statSync(abs).size };
    }
    if (beat.clipSource) {
      const abs = path.join(REPO_ROOT, beat.clipSource);
      rec2.clipSource = { relPath: beat.clipSource, sha256: sha256File(abs), bytes: fs.statSync(abs).size };
    }
    beatRecords.push(rec2);
    beatMp4s.push(outMp4);
    console.log(`  → ${rec2.clip} (${rec2.width}x${rec2.height}, ${rec2.videoFrames} frames, ${(rec2.bytes / 1024).toFixed(0)}KB)`);
  }

  server.close();

  const concatOut = path.join(reviewDir, "kanban-rough-silent-9x16.mp4");
  concatBeats(beatMp4s, concatOut);
  const concatProbe = probeRender(concatOut);
  console.log(`[kanban] rough silent concat → ${relOf(concatOut)} (${concatProbe.videoFrames} frames, ${concatProbe.videoDurationSec.toFixed(1)}s)`);

  const manifest = {
    task: 1046, leg: 1, storyboard: "kanban-10beat", createdAt: new Date().toISOString(),
    dims: { width: CAP_W, height: CAP_H }, beats: beatRecords, roughConcat: relOf(concatOut),
  };
  const manifestPath = path.join(REPO_ROOT, "out", "capture", "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`[kanban] manifest → ${relOf(manifestPath)}`);

  fs.rmSync(recRoot, { recursive: true, force: true });
  console.log(`\nKANBAN-CAPTURE: ${beatRecords.length} beats captured. manifest=${relOf(manifestPath)} roughConcat=${relOf(concatOut)}`);
}

async function main(): Promise<void> {
  assertKanbanBeatsClean();
  if (process.argv.includes("--dry-run")) {
    const total = KANBAN_BEATS.reduce((s, b) => s + b.clipSec, 0);
    console.log("KANBAN-CAPTURE: recipe-passed (#870 demonstration-category recipe R1–R13 enforced).");
    console.log(`KANBAN-CAPTURE: --dry-run (gates passed: paid-free + brand-clean + owner-clean). ${KANBAN_BEATS.length} beats, ${total}s:`);
    for (const b of KANBAN_BEATS) {
      const what = b.kind === "tool" ? b.commands.join("  ;  ")
        : b.kind === "chat" ? `chat: "${b.chatRequest}"`
        : b.hero ? `pan-zoom: ${b.hero.source}`
        : b.clipSource ? `clip: ${b.clipSource}`
        : b.headline ? `title: "${b.headline}"` : `[${b.kind}]`;
      console.log(`  beat ${b.n} (${b.kind}, ${b.clipSec}s) — ${b.stepLabel || "—"}  ::  ${what}`);
    }
    return;
  }
  await runCapture();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("KANBAN-CAPTURE FAIL:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
