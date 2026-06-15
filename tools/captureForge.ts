/**
 * #871 forge-demo — the SILENT-CUT render harness for the forge-harness DEMONSTRATION video.
 *
 * REUSES content-pipeline's #824/#870 demo machinery: the `DemoVideoSpec` recipe contract
 * (`assertDemoCategoryRecipe`), the Playwright `recordVideo` capture path, and the #824 beat HTML
 * builders (`buildTitleHtml` / `buildTerminalHtml` / `buildTransitionHtml` / `buildViewerPanZoomHtml`).
 * The ONE net-new piece is the pan-zoom over three pre-captured REAL `.forge/dashboard.html` screenshots
 * (`buildViewerPanZoomHtml`, in `tools/captureFable.ts`); its focus rects live in `video/forgeStoryboard.ts`.
 *
 * Renders the SILENT CUT (no audio — the real VO is a later, gated, PAID leg) at:
 *   • out/video/forge-demo-9x16.mp4   (1080×1920, rendered FIRST — the orchestrator eyeballs this)
 *   • out/video/forge-demo-1x1.mp4    (center-crop of the 9:16 spine)
 *   • out/video/forge-demo-4x5.mp4    (center-crop of the 9:16 spine)
 * `out/` is gitignored. Verifies the 9:16 ffprobe duration is in the 85–92s band before the others.
 *
 * GATES (run before any capture, also in --dry-run): the #870 recipe (R1–R12 via the forgeSpec oracle),
 * 4-side-safe + fill geometry, the cross-layer caption/media overlap, and an owner/brand scrub of every
 * shown command + on-screen text field.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

import {
  CAP_W,
  CAP_H,
  CAP_FPS,
  buildTitleHtml,
  buildTerminalHtml,
  buildTransitionHtml,
  filterPublicLines,
} from "./captureFable";
import { BG_CHAT, BG_TOOL } from "../video/fableStoryboard";
import { assertBrandClean } from "../inputs/frames";
import { assertNoInternalDevTokens, assertNoPlaceholderUrls } from "../video/visualRedFlags";
import {
  assertFableBeatsSafeAndFilled,
  assertNoCaptionMediaOverlap,
  FABLE_ASPECTS,
} from "../video/fableLayout";
import { assertDemoCategoryRecipe } from "../video/demoCategoryRecipe";
import {
  FORGE_BEATS,
  FORGE_BEAT_LAYOUTS,
  forgeSpec,
  type ForgeBeat,
} from "../video/forgeStoryboard";
import { resolveVendoredFfmpeg, probeRender } from "../video/renderProbe";

const REPO_ROOT = fs.realpathSync(process.cwd());

// ── Forge /prd surface — an AUTHENTIC Claude Code TERMINAL running /prd (R1, operator 2026-06-15) ────
//
// The prior version was a messenger-bubble chat clone; the operator called it "clearly fake" with the font
// "too small to read." This rebuild renders the REAL Claude Code experience: a warm-dark terminal where the
// human types `/prd`, Claude asks a couple of plain multiple-choice questions, the human's pick is shown, and
// the spec lands. Big monospace (≥40px) so it is legible on a phone. Warm-clay world (BG_CHAT) keeps it
// visually DISTINCT from the navy forge-tool terminal (beat 4). Still the HUMAN's interface (R3 chat beat);
// the agent's REAL work is the forge terminal + the live dashboard later. The typed request streams in via
// `window.__chatType`; `window.__chatSend` reveals Claude's answered questions + the written-spec line.
function buildForgePrdChatHtml(label = "you → Claude Code · /prd"): string {
  // Full-bleed terminal box (matches the beat-2 `terminal` layout in FORGE_BEAT_LAYOUTS — fills + 4-side safe).
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
#term{flex:1;display:flex;flex-direction:column;justify-content:flex-start;gap:30px;padding:40px 4px 6px;
  margin-bottom:110px;overflow:hidden;color:#e9e3da;font-size:43px;line-height:1.4}
.you-line{display:flex;align-items:baseline;gap:18px;font-size:46px}
.you-line .p{color:#5eead4;font-weight:700}
.you-line .t{color:#f4efe7;font-weight:600}
#caret{display:inline-block;width:18px;height:46px;background:#5eead4;transform:translateY(6px);
  animation:b 1s steps(1) infinite}
@keyframes b{50%{opacity:0}}
#resp{flex:1;display:flex;flex-direction:column;justify-content:space-between;gap:26px;opacity:0;transition:opacity .5s}
.ask{color:#cbb8ac;font-size:40px}
.q{display:flex;align-items:baseline;gap:20px}
.q .n{color:#d97757;font-weight:700;min-width:52px}
.q .label{color:#b7ada3}
.q .pick{margin-left:auto;color:#5eead4;font-weight:700;white-space:nowrap}
.q .pick::before{content:'▸ '}
#done{display:flex;align-items:center;gap:22px;margin-top:8px;color:#9ad9b0;font-size:40px;font-weight:700}
#done .ok{color:#28c840}
#composer{margin-top:24px;display:flex;align-items:center;gap:20px;background:rgba(12,10,9,.5);
  border:2px solid rgba(94,234,212,.28);border-radius:24px;padding:28px 36px}
#composer .txt{color:#5eead4;font-size:34px;font-weight:600;letter-spacing:.2px}
#composer .send{margin-left:auto;width:56px;height:56px;border-radius:50%;background:#5eead4;
  display:flex;align-items:center;justify-content:center;color:#0b1020;font-size:34px;font-weight:800}
</style></head><body>
<div id="content">
  <div id="bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
    <span class="star">✻</span><span class="who">Claude Code</span><span class="tag">/prd</span></div>
  <div id="term">
    <div class="you-line"><span class="p">&gt;</span><span class="t"><span id="txt"></span><span id="caret"></span></span></div>
    <div id="resp">
      <div class="ask">A few quick questions to shape the spec —</div>
      <div class="q"><span class="n">1.</span><span class="label">Who is it for?</span><span class="pick">developers</span></div>
      <div class="q"><span class="n">2.</span><span class="label">Tone?</span><span class="pick">confident, plain</span></div>
      <div class="q"><span class="n">3.</span><span class="label">How long?</span><span class="pick">short</span></div>
      <div id="done"><span class="ok">✓</span><span>PRD + user stories written — each with binary checks</span></div>
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

// ── Decomposition diagram (R3, operator 2026-06-15) — HONEST forge_plan breakdown ──────────────────
//
// The operator asked to "elaborate that forge auto-divides a complex PRD into multiple user stories, and
// splits a big story into smaller ones." VERIFIED against forge-harness (execution-plan schema v3.0.0 +
// planner.ts): the real hierarchy is PRD → phases → user stories (a FLAT list linked by a dependency graph)
// → acceptanceCriteria (binary shell-command checks). "Big story → multiple smaller stories" is TRUE but
// produces SIBLING stories at plan time — NOT children nested under a parent, and forge has NO "sub-task"
// object. So this diagram fans phases into SIBLING stories and shows one big story SPLIT into two siblings;
// it never draws a nested sub-task tree and never uses the word "sub-task". Dark tool-world; animated tiers
// reveal top→bottom; large legible type. Fills the beat-3 `diagram` layout box (4-side safe + fill).
function buildForgeDecompositionHtml(label = "forge_plan — breaks the work down"): string {
  const L = 72, T = 120, R = CAP_W - 72, B = 1700;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${CAP_W}px;height:${CAP_H}px;background:
  radial-gradient(1200px 1200px at 50% 26%, #131a31 0%, ${BG_TOOL} 62%);overflow:hidden;position:relative;
  font-family:ui-sans-serif,-apple-system,Helvetica,Arial,sans-serif;color:#eef2fb}
#wrap{position:absolute;left:${L}px;top:${T}px;width:${R - L}px;height:${B - T}px;
  display:flex;flex-direction:column;align-items:center;justify-content:space-between}
.tier{width:100%;display:flex;flex-direction:column;align-items:center;gap:14px;opacity:0;
  transform:translateY(26px);animation:rise .6s ease-out forwards}
.t1{animation-delay:.2s}.a1{animation-delay:.7s}.t2{animation-delay:1.0s}.a2{animation-delay:1.7s}
.t3{animation-delay:2.0s}.a3{animation-delay:3.0s}.t4{animation-delay:3.3s}
.cap{font-size:30px;font-weight:600;color:#9fb0d8;letter-spacing:.04em;text-transform:uppercase}
.row{display:flex;gap:22px;justify-content:center;align-items:stretch;flex-wrap:nowrap;width:100%}
.node{background:#1b2440;border:2px solid #38456e;border-radius:20px;padding:24px 30px;text-align:center;
  box-shadow:0 14px 40px rgba(0,0,0,.4)}
.node .h{font-size:38px;font-weight:800;line-height:1.1}
.node .s{font-size:27px;font-weight:500;color:#9fb0d8;margin-top:6px}
.prd{background:#20305a;border-color:#4a5e96;min-width:420px}
.prd .h{font-size:46px}
.phase{flex:1;max-width:360px;border-color:#4a5e96}
.phase .h{color:#bcd0ff}
.story{flex:1;max-width:300px;border-color:#5e6f9e}
.story .h{color:#e7ecf8;font-size:34px}
.story.split{border-color:#d97757;background:#2a2230}
.story.split .h{color:#f0b79f}
.story .tag{display:inline-block;margin-top:8px;font-size:22px;font-weight:700;color:#f3c8b4;
  background:rgba(217,119,87,.16);border:1px solid #d97757;border-radius:8px;padding:3px 12px}
.check{flex:1;max-width:300px;background:#16291f;border-color:#2f7a52}
.check .h{color:#9ad9b0;font-size:30px}
.check .ok{color:#28c840;font-weight:800;margin-right:8px}
.arrow{font-size:40px;color:#6376a8;line-height:1;font-weight:800}
.arrow .lbl{display:block;font-size:26px;font-weight:600;color:#8fa0c8;margin-top:2px;font-family:ui-monospace,Menlo,monospace}
@keyframes rise{to{opacity:1;transform:none}}
#pill{position:absolute;left:50%;bottom:120px;transform:translateX(-50%);background:rgba(94,234,212,.12);
  color:#5eead4;border:2px solid rgba(94,234,212,.35);border-radius:999px;font:600 30px/1.2 inherit;
  padding:20px 38px;white-space:nowrap}
</style></head><body>
<div id="wrap">
  <div class="tier t1"><div class="cap">your spec</div>
    <div class="row"><div class="node prd"><div class="h">PRD</div><div class="s">what to build</div></div></div></div>
  <div class="tier a1"><div class="arrow">↓<span class="lbl">forge_plan</span></div></div>
  <div class="tier t2"><div class="cap">phases</div>
    <div class="row">
      <div class="node phase"><div class="h">Phase 1</div><div class="s">foundation</div></div>
      <div class="node phase"><div class="h">Phase 2</div><div class="s">features</div></div>
    </div></div>
  <div class="tier a2"><div class="arrow">↓</div></div>
  <div class="tier t3"><div class="cap">user stories &nbsp;·&nbsp; ordered by dependency</div>
    <div class="row">
      <div class="node story"><div class="h">US-01</div></div>
      <div class="node story split"><div class="h">US-02</div><div class="tag">too big → split</div></div>
      <div class="node story"><div class="h">US-02a</div></div>
      <div class="node story"><div class="h">US-02b</div></div>
    </div></div>
  <div class="tier a3"><div class="arrow">↓</div></div>
  <div class="tier t4"><div class="cap">binary checks &nbsp;·&nbsp; your shell commands</div>
    <div class="row">
      <div class="node check"><div class="h"><span class="ok">✓</span>npm test</div></div>
      <div class="node check"><div class="h"><span class="ok">✓</span>build</div></div>
      <div class="node check"><div class="h"><span class="ok">✓</span>lint</div></div>
    </div></div>
</div>
<div id="pill">${label}</div>
</body></html>`;
}

// Authored, public-safe terminal output per shown forge command (no live forge MCP in this render leg;
// the genuine forge run-record is the captured dashboard PNGs that the hero beats display). Every line is
// owner/brand/dev-token clean and routed through `filterPublicLines` as defense-in-depth.
const FORGE_TERMINAL_OUTPUT: Record<string, string[]> = {
  "forge_plan  --prd .forge/prd.md": [
    "  parsed PRD -> 3 stories",
    "  DEMO-1, DEMO-2, DEMO-3 - each with binary acceptance criteria",
    "  plan written -> .forge/execution-plan.json",
  ],
  "forge_evaluate  --story DEMO-2": [
    "  running acceptance check:  npm test",
    "  x  AC failed - sum() expected 5, got NaN",
    "  DEMO-2 -> ready-for-retry (retry 1/3)",
    "  ...fix applied...",
    "  re-running:  npm test",
    "  ok AC passed",
    "  DEMO-2 -> done (passed after 1 retry)",
  ],
  "forge_status": [
    "  Stories 3/3 done   Budget: Max plan - $0 actual",
    "  Forge Pulse: working-green",
  ],
};

function fileToDataUri(p: string, mime: string): string {
  return `data:${mime};base64,${fs.readFileSync(p).toString("base64")}`;
}

/** R2 (operator 2026-06-15) — screenshot the MOBILE dashboard (reflowed at `width`) to a PNG data URI.
 *  The transition beat used to load the OLD DESKTOP png (`dashboard-working-green.png`), so at 0:36 the
 *  handoff showed the desktop board for one beat then cut to the mobile board — a jarring desktop→mobile
 *  flip. This renders the SAME mobile HTML the hero beats use, so the whole tool→dashboard handoff is
 *  mobile-consistent. Returned as a data URI fed to `buildTransitionHtml`'s emerging card. */
async function mobileDashboardDataUri(dashHtmlAbs: string, chromium: any, width = 440): Promise<string> {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width, height: 1200 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.setContent(fs.readFileSync(dashHtmlAbs, "utf8"), { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const buf = await page.screenshot({ fullPage: true });
  await context.close();
  await browser.close();
  return `data:image/png;base64,${buf.toString("base64")}`;
}

// ── LIVE dashboard camera (net-new for #871) ────────────────────────────────────────────────────────
// The hero beats render the REAL `.forge/dashboard.html` LIVE in an iframe (so its CSS animations — the
// breathing Forge Pulse — actually run; a static screenshot freezes them) and animate a directed camera
// (scale + translate) from a wide `focusStart` to a tight `focusEnd`. The dashboard is a wide-and-short
// board, so it is rendered at a NARROW width (hero.srcW) which reflows the 6 columns TALLER → the whole
// board fills the 9:16 portrait frame for the establishing shot instead of floating as a short island.

/** The dashboard's own off-white body background — the iframe margins (top/bottom of the establishing
 *  shot, where the short board can't cover the tall frame) use this EXACT color so there is no island seam. */
const FORGE_DASH_BG = "rgb(239, 236, 229)";

interface LiveCam {
  scale: number;
  tx: number;
  ty: number;
}

/** Resolve a normalized focus rect (on the srcW×srcH render) to a transform-origin:0,0 `scale + translate`.
 *  Per axis: if the scaled content COVERS the frame, clamp the pan so no off-white edge shows; otherwise
 *  (the short board at the wide establishing zoom) CENTER it on the off-white field. `zoom` = fraction of
 *  source WIDTH visible (1.0 = whole board; smaller = tighter). */
function liveDashboardCamGeom(
  focus: { cx: number; cy: number; zoom: number },
  srcW: number,
  srcH: number,
  frameW: number,
  frameH: number,
): LiveCam {
  const z = Math.min(Math.max(focus.zoom, 1e-3), 1.2);
  const scale = frameW / (z * srcW);
  const visW = frameW / scale;
  const visH = frameH / scale;
  const tx =
    visW <= srcW ? Math.min(0, Math.max(visW - srcW, frameW / (2 * scale) - focus.cx * srcW)) : (visW - srcW) / 2;
  const ty =
    visH <= srcH ? Math.min(0, Math.max(visH - srcH, frameH / (2 * scale) - focus.cy * srcH)) : (visH - srcH) / 2;
  return { scale, tx, ty };
}

/** A normalized "elaboration" highlight on the SOURCE dashboard (sx/sy/sw/sh ∈ [0,1] on srcW×srcH) — drawn
 *  as a glowing ring + a small label, computed at the `focusEnd` camera framing so it lands on the element
 *  AFTER the camera has settled (operator R3/R4 2026-06-15: "elaborate on which part → pan zoom to it"). */
interface HeroHighlight {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  label: string;
  /** Put the label BELOW the ring (for a top-of-board element like the pulse); default ABOVE. */
  labelBelow?: boolean;
}

/** Build the live-dashboard camera HTML: the dashboard embedded as an iframe `srcdoc`, with a camera that
 *  HOLDS `focusStart` (establishing) for `holdSec`, EASES to `focusEnd` (the narrated element), then HOLDS
 *  `focusEnd` for the rest of the beat. An optional highlight ring fades in over the element once settled. */
function buildLiveDashboardCamHtml(opts: {
  dashboardHtml: string;
  srcW: number;
  srcH: number;
  focusStart: { cx: number; cy: number; zoom: number };
  focusEnd: { cx: number; cy: number; zoom: number };
  holdSec: number;
  durationSec: number;
  label: string;
  highlight?: HeroHighlight;
}): string {
  const { dashboardHtml, srcW, srcH, focusStart, focusEnd, holdSec, durationSec, label, highlight } = opts;
  const a = liveDashboardCamGeom(focusStart, srcW, srcH, CAP_W, CAP_H);
  const b = liveDashboardCamGeom(focusEnd, srcW, srcH, CAP_W, CAP_H);
  const tf = (g: LiveCam) => `scale(${g.scale.toFixed(4)}) translate(${g.tx.toFixed(1)}px, ${g.ty.toFixed(1)}px)`;
  // Establishing hold on A, ease A→B, then HOLD B. settlePct is when the camera reaches the element.
  const holdPct = Math.max(0, Math.min(40, (holdSec / durationSec) * 100));
  const settlePct = Math.min(72, holdPct + 42);
  // srcdoc is a double-quoted attribute → escape inner double-quotes (the dashboard renders identically).
  const srcdoc = dashboardHtml.replace(/"/g, "&quot;");

  // The highlight ring's screen rect at the focusEnd (b) framing: screen = b.scale·(src·dim + b.t).
  let ringHtml = "";
  if (highlight) {
    const pad = 14;
    const rx = b.scale * (highlight.sx * srcW + b.tx) - pad;
    const ry = b.scale * (highlight.sy * srcH + b.ty) - pad;
    const rw = b.scale * highlight.sw * srcW + pad * 2;
    const rh = b.scale * highlight.sh * srcH + pad * 2;
    const labelTop = highlight.labelBelow ? ry + rh + 16 : ry - 70;
    // fade the ring + label in from just after the camera settles.
    const ringDelay = (settlePct / 100) * durationSec;
    ringHtml = `<div id="ring" style="left:${rx.toFixed(0)}px;top:${ry.toFixed(0)}px;width:${rw.toFixed(0)}px;height:${rh.toFixed(0)}px;animation-delay:${ringDelay.toFixed(2)}s"></div>` +
      `<div id="ringlabel" style="left:${rx.toFixed(0)}px;top:${labelTop.toFixed(0)}px;max-width:${Math.max(rw, 520).toFixed(0)}px;animation-delay:${ringDelay.toFixed(2)}s">${highlight.label}</div>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${CAP_W}px;height:${CAP_H}px;overflow:hidden;position:relative;background:${FORGE_DASH_BG};
  font-family:ui-sans-serif,-apple-system,Helvetica,Arial,sans-serif}
#stage{position:absolute;inset:0;overflow:hidden}
#frm{position:absolute;left:0;top:0;width:${srcW}px;height:${srcH}px;border:0;transform-origin:0 0;
  transform:${tf(a)};animation:cam ${durationSec.toFixed(2)}s ease-in-out forwards}
@keyframes cam{0%{transform:${tf(a)}}${holdPct.toFixed(1)}%{transform:${tf(a)}}${settlePct.toFixed(1)}%{transform:${tf(b)}}100%{transform:${tf(b)}}}
#pill{position:absolute;left:50%;top:64px;transform:translateX(-50%);background:#14100c;color:#f7f1e6;
  border-radius:999px;font:700 30px/1.2 inherit;padding:18px 40px;letter-spacing:.3px;z-index:3;white-space:nowrap}
#ring{position:absolute;z-index:2;border:5px solid #d97757;border-radius:18px;opacity:0;
  box-shadow:0 0 0 4px rgba(217,119,87,.25),0 0 34px 8px rgba(217,119,87,.45);animation:ringin .5s ease-out forwards}
#ringlabel{position:absolute;z-index:3;color:#14100c;background:#f3c8b4;border:2px solid #d97757;
  border-radius:12px;padding:10px 20px;font:700 30px/1.25 inherit;opacity:0;animation:ringin .5s ease-out forwards;
  box-shadow:0 8px 26px rgba(20,16,12,.28)}
@keyframes ringin{from{opacity:0;transform:scale(1.06)}to{opacity:1;transform:scale(1)}}
</style></head><body>
<div id="stage"><iframe id="frm" srcdoc="${srcdoc}"></iframe></div>
${ringHtml}
<div id="pill">${label}</div>
</body></html>`;
}

// ── ffmpeg (vendored remotion ffmpeg) ───────────────────────────────────────────────────────────────

function runFfmpeg(args: string[]): { code: number | null; out: string } {
  const { bin, dir } = resolveVendoredFfmpeg();
  const env = process.platform === "darwin" ? { ...process.env, DYLD_FALLBACK_LIBRARY_PATH: dir } : { ...process.env };
  const r = spawnSync(bin, args, { env, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  if (r.error) throw new Error(`captureForge: vendored ffmpeg failed: ${r.error.message}`);
  return { code: r.status, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}

/** Transcode a recorded webm → a normalized 1080×1920 beat MP4, trimmed to clipSec from the head. */
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
    throw new Error(`captureForge: beat transcode produced no output (ffmpeg exit ${code}) for ${webm}`);
  }
}

/** Concat the normalized beat MP4s into the 9:16 silent cut (concat demuxer; re-encode fallback). */
function concatBeats(beatMp4s: string[], outMp4: string): void {
  const listPath = path.join(path.dirname(outMp4), "_forge-concat-list.txt");
  fs.writeFileSync(listPath, beatMp4s.map((p) => `file '${p}'`).join("\n"), "utf8");
  let { code } = runFfmpeg(["-hide_banner", "-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", outMp4]);
  if (!fs.existsSync(outMp4) || fs.statSync(outMp4).size === 0) {
    ({ code } = runFfmpeg(["-hide_banner", "-y", "-f", "concat", "-safe", "0", "-i", listPath,
      "-r", String(CAP_FPS), "-vf", `scale=${CAP_W}:${CAP_H}`, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "20", "-movflags", "+faststart", "-an", outMp4]));
  }
  if (!fs.existsSync(outMp4) || fs.statSync(outMp4).size === 0) {
    throw new Error(`captureForge: 9:16 concat produced no output (ffmpeg exit ${code}).`);
  }
}

/** Center-crop the 9:16 spine into another publish aspect (1:1 / 4:5) per FABLE_ASPECTS. */
function cropAspect(spine9x16: string, outMp4: string, cropExpr: string): void {
  const { code } = runFfmpeg([
    "-hide_banner", "-y", "-i", spine9x16, "-vf", cropExpr, "-r", String(CAP_FPS),
    "-pix_fmt", "yuv420p", "-c:v", "libx264", "-profile:v", "high", "-preset", "veryfast", "-crf", "20",
    "-movflags", "+faststart", "-an", outMp4,
  ]);
  if (!fs.existsSync(outMp4) || fs.statSync(outMp4).size === 0) {
    throw new Error(`captureForge: aspect crop produced no output (ffmpeg exit ${code}) for "${cropExpr}".`);
  }
}

// ── Gates (also run in --dry-run) ───────────────────────────────────────────────────────────────────

function assertForgeBeatsClean(): void {
  assertDemoCategoryRecipe(forgeSpec); // #870 recipe R1–R12 (the build's test oracle)
  assertFableBeatsSafeAndFilled(FORGE_BEAT_LAYOUTS); // 4-side safe + fill
  assertNoCaptionMediaOverlap(FABLE_ASPECTS); // cross-layer caption/media band clearance
  for (const b of FORGE_BEATS) {
    // The hero "elaboration" highlight label is a public on-screen text field too — scrub it like the rest.
    const hl = b.hero?.highlight?.label ?? "";
    for (const t of [b.stepLabel, b.headline ?? "", b.sub ?? "", b.url ?? "", b.chatRequest ?? "", b.chip ?? "", hl].filter((s) => s.length > 0)) {
      assertBrandClean(t);
    }
    assertNoInternalDevTokens([b.stepLabel, b.headline ?? "", b.sub ?? "", b.chatRequest ?? "", b.chip ?? "", hl].filter((s) => s.length > 0), `beat ${b.n}`);
    assertNoPlaceholderUrls([b.url ?? ""].filter((s) => s.length > 0), `beat ${b.n} url`);
  }
  // Authored terminal output lines are public frames too — scrub them the same way.
  for (const lines of Object.values(FORGE_TERMINAL_OUTPUT)) {
    for (const l of lines) {
      assertBrandClean(l);
      assertNoInternalDevTokens([l], "forge terminal output");
    }
  }
}

// ── Recording (Playwright recordVideo) ──────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

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

/** Terminal beat: type the forge commands, then write the authored public-safe output (no live MCP).
 *  Pads the tail so the recording fills `recordSec` (the typing+output finishes well before the slot). */
async function recordForgeTerminal(beat: ForgeBeat, recordSec: number, recDir: string, chromium: any): Promise<string> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: CAP_W, height: CAP_H },
    recordVideo: { dir: recDir, size: { width: CAP_W, height: CAP_H } },
  });
  const page = await context.newPage();
  await page.setContent(buildTerminalHtml(beat.stepLabel, "forge-harness"), { waitUntil: "domcontentloaded" });
  const start = Date.now();
  await page.waitForTimeout(600);
  for (const cmd of beat.commands) {
    await page.evaluate(() => (globalThis as any).window.__termPrompt());
    // Accumulate the typed chars into the SINGLE current `.cmd` span (mirrors captureFable's terminal
    // driver) — calling __termCmd per slice would emit a `\n` per 2-char chunk → 1–2 chars per line.
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
    const out = filterPublicLines((FORGE_TERMINAL_OUTPUT[cmd] ?? []).join("\n") + "\n");
    await page.evaluate((t: string) => (globalThis as any).window.__termWrite(t), out);
    await page.waitForTimeout(900);
  }
  // Hold on the finished terminal until the slot is filled.
  const remaining = recordSec * 1000 - (Date.now() - start);
  await page.waitForTimeout(Math.max(700, remaining));
  const video = page.video();
  await context.close();
  await browser.close();
  return await video!.path();
}

/** HERO beat: render the REAL dashboard HTML LIVE (CSS breathing runs) under an animated camera. Uses
 *  deviceScaleFactor 2 so the pushed-in detail (the breathing pulse / cards) stays crisp. */
async function recordLiveDashboardBeat(beat: ForgeBeat, recordSec: number, recDir: string, chromium: any): Promise<string> {
  const h = beat.hero!;
  const dashboardHtml = fs.readFileSync(path.join(REPO_ROOT, h.source), "utf8");
  const html = buildLiveDashboardCamHtml({
    dashboardHtml,
    srcW: h.srcW,
    srcH: h.srcH,
    focusStart: h.focusStart,
    focusEnd: h.focusEnd,
    holdSec: h.holdSec ?? 0,
    durationSec: beat.clipSec,
    label: beat.stepLabel,
    highlight: h.highlight,
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

async function recordBeat(beat: ForgeBeat, recDir: string, chromium: any): Promise<string> {
  const rec = beat.clipSec + 0.6;
  switch (beat.kind) {
    case "hook":
    case "payoff":
    case "cta":
      return recordHtml(buildTitleHtml({ headline: beat.headline!, sub: beat.sub, url: beat.url ?? beat.chip }), rec, recDir, chromium);
    case "chat":
      return recordHtml(buildForgePrdChatHtml(beat.stepLabel), rec, recDir, chromium, async (page) => {
        const req = beat.chatRequest!;
        for (let i = 0; i < req.length; i += 2) {
          await page.evaluate((c: string) => (globalThis as any).window.__chatType(c), req.slice(i, i + 2));
          await page.waitForTimeout(40);
        }
        await page.waitForTimeout(400);
        await page.evaluate(() => (globalThis as any).window.__chatSend());
      });
    case "tool":
      return recordForgeTerminal(beat, rec, recDir, chromium);
    case "title":
      // The R3 decomposition diagram (the only "title"-kind forge beat): forge_plan's honest PRD → phases →
      // sibling stories (a big story split into siblings) → binary checks breakdown.
      return recordHtml(buildForgeDecompositionHtml(beat.stepLabel || "forge_plan — breaks the work down"), rec, recDir, chromium);
    case "transition": {
      // R2: the transition card is a LIVE screenshot of the MOBILE dashboard (same reflowed board the hero
      // beats show) — NOT the old desktop PNG — so the tool→dashboard handoff stays mobile-consistent.
      const dashHtml = path.join(REPO_ROOT, "assets/forge-demo/dashboard-working-green.html");
      const uri = await mobileDashboardDataUri(dashHtml, chromium);
      return recordHtml(buildTransitionHtml(uri), rec, recDir, chromium, undefined, "networkidle");
    }
    case "output":
      // HERO — live-captured dashboard under an animated camera (full board → detail; breathing runs).
      return recordLiveDashboardBeat(beat, rec, recDir, chromium);
    default:
      throw new Error(`captureForge: unknown beat kind "${beat.kind}"`);
  }
}

// ── The render run ──────────────────────────────────────────────────────────────────────────────────

async function runRender(): Promise<void> {
  assertForgeBeatsClean();
  // Verify every hero PNG exists with the declared byte size (provenance is also jest-checked).
  for (const b of FORGE_BEATS) {
    if (!b.hero) continue;
    const abs = path.join(REPO_ROOT, b.hero.source);
    if (!fs.existsSync(abs)) throw new Error(`captureForge: hero PNG missing: ${b.hero.source}`);
    const bytes = fs.statSync(abs).size;
    if (bytes !== b.hero.bytes) throw new Error(`captureForge: hero PNG ${b.hero.source} is ${bytes} bytes, spec says ${b.hero.bytes}`);
  }

  const { chromium } = await import("playwright");
  const outDir = path.join(REPO_ROOT, "out", "video");
  fs.mkdirSync(outDir, { recursive: true });
  const recRoot = fs.mkdtempSync(path.join(os.tmpdir(), "forge-rec-"));
  const captureDir = path.join(REPO_ROOT, "out", "capture", "forge");
  fs.mkdirSync(captureDir, { recursive: true });

  const beatMp4s: string[] = [];
  for (const beat of FORGE_BEATS) {
    console.log(`[forge] recording beat ${beat.n} (${beat.kind}) — ${beat.stepLabel || beat.headline || ""}`);
    const webm = await recordBeat(beat, recRoot, chromium);
    const outMp4 = path.join(captureDir, `beat-${String(beat.n).padStart(2, "0")}.mp4`);
    transcodeBeatClip(webm, outMp4, beat.clipSec);
    const probe = probeRender(outMp4);
    console.log(`  → beat-${String(beat.n).padStart(2, "0")}.mp4 (${probe.videoDurationSec.toFixed(1)}s)`);
    beatMp4s.push(outMp4);
  }

  // 9:16 FIRST — the orchestrator eyeballs this.
  const out9x16 = path.join(outDir, "forge-demo-9x16.mp4");
  concatBeats(beatMp4s, out9x16);
  const dur = probeRender(out9x16).videoDurationSec;
  console.log(`[forge] 9:16 silent cut → out/video/forge-demo-9x16.mp4 (${dur.toFixed(1)}s)`);
  if (dur < 92 || dur > 100) {
    throw new Error(`captureForge: 9:16 runtime ${dur.toFixed(1)}s is outside the 92–100s band.`);
  }

  // Then the two cropped aspects.
  for (const a of FABLE_ASPECTS) {
    if (a.key === "9:16") continue;
    const name = a.key === "1:1" ? "forge-demo-1x1.mp4" : "forge-demo-4x5.mp4";
    const outMp4 = path.join(outDir, name);
    cropAspect(out9x16, outMp4, a.crop);
    console.log(`[forge] ${a.key} silent cut → out/video/${name} (${probeRender(outMp4).videoDurationSec.toFixed(1)}s)`);
  }

  fs.rmSync(recRoot, { recursive: true, force: true });
  console.log(`\nFORGE-RENDER: silent cut rendered in 3 aspects (9:16 first). 9:16 duration ${dur.toFixed(1)}s.`);
}

async function main(): Promise<void> {
  assertForgeBeatsClean();
  if (process.argv.includes("--dry-run")) {
    const total = FORGE_BEATS.reduce((s, b) => s + b.clipSec, 0);
    console.log("FORGE-RENDER: recipe-passed (#870 demonstration-category recipe R1–R12 enforced).");
    console.log(`FORGE-RENDER: --dry-run (gates passed). ${FORGE_BEATS.length} beats, ${total}s:`);
    for (const b of FORGE_BEATS) {
      const what = b.kind === "tool" ? b.commands.join("  ;  ")
        : b.kind === "chat" ? `chat: "${b.chatRequest}"`
        : b.isHeroOutput ? `pan-zoom: ${b.hero!.source}`
        : b.headline ? `title: "${b.headline}"` : `[${b.kind}]`;
      console.log(`  beat ${b.n} (${b.kind}, ${b.clipSec}s) — ${b.stepLabel || "—"}  ::  ${what}`);
    }
    return;
  }
  await runRender();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("FORGE-RENDER FAIL:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
