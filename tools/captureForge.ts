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
import { BG_CHAT } from "../video/fableStoryboard";
import { assertBrandClean } from "../inputs/frames";
import { assertNoInternalDevTokens, assertNoPlaceholderUrls } from "../video/visualRedFlags";
import {
  assertFableBeatsSafeAndFilled,
  assertNoCaptionMediaOverlap,
  CHAT_CONTENT_BOX,
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

// ── Forge /prd CHAT surface (mirrors #824 buildChatHtml geometry → CHAT_FILL_CONTRACT holds) ────────

/** The forge /prd chat beat: same 4-row structure (greet · you-bubble · agent · 3 deliverable rows) and
 *  the same min-heights as #824's `buildChatHtml`, so `assertChatBeatInteriorFill` /
 *  `assertChatContentClearsCaptionBand` pass — only the (forge) CONTENT differs. */
function buildForgePrdChatHtml(label = "you → /prd · plain multiple-choice"): string {
  const c = CHAT_CONTENT_BOX;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${CAP_W}px;height:${CAP_H}px;background:${BG_CHAT};overflow:hidden;position:relative;
  font-family:ui-sans-serif,-apple-system,Helvetica,Arial,sans-serif}
#content{position:absolute;left:${c.left}px;top:${c.top}px;width:${c.right - c.left}px;height:${c.bottom - c.top}px;
  display:flex;flex-direction:column;padding:52px 56px;border-radius:52px;
  background:linear-gradient(180deg,#231c18 0%,#1a1512 100%);border:2px solid rgba(231,226,219,.09);
  box-shadow:0 40px 120px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.04)}
#hdr{display:flex;align-items:center;gap:22px;padding-bottom:30px;border-bottom:2px solid rgba(231,226,219,.10)}
#hdr .mark{width:48px;height:48px;border-radius:13px;background:#d97757}
#hdr .name{color:#e7e2db;font:700 46px/1 inherit}
#hdr .sub{color:#8a817a;font:500 31px/1 inherit;margin-left:auto}
#chat{flex:1;display:flex;flex-direction:column;justify-content:space-between;padding:40px 0 6px;margin-bottom:240px;overflow:hidden}
.greet{align-self:flex-start;max-width:86%;color:#9c938b;font:500 46px/1.4 inherit;display:flex;align-items:center;gap:18px;min-height:86px}
.greet .d{width:16px;height:16px;border-radius:50%;background:#7c7068}
.you{align-self:flex-end;max-width:90%;background:#d97757;color:#fff;border-radius:42px 42px 12px 42px;
  padding:54px 60px;font:600 56px/1.36 inherit;box-shadow:0 24px 64px rgba(217,119,87,.34);min-height:210px;
  display:flex;align-items:center}
#caret{display:inline-block;width:6px;height:60px;background:#fff;vertical-align:-12px;margin-left:4px;animation:b 1s steps(1) infinite}
@keyframes b{50%{opacity:0}}
.agent{align-self:flex-start;max-width:92%;color:#cbc3ba;font:600 50px/1.4 inherit;display:flex;align-items:center;gap:18px;min-height:84px;opacity:0;transition:opacity .5s}
.agent .d{width:18px;height:18px;border-radius:50%;background:#7c7068;animation:p 1.2s ease-in-out infinite}
@keyframes p{0%,100%{opacity:.3}50%{opacity:1}}
#deliv{align-self:stretch;display:flex;flex-direction:column;gap:30px;opacity:0;transition:opacity .6s}
#deliv .row{display:flex;align-items:center;gap:28px;background:rgba(217,119,87,.12);
  border:2px solid rgba(217,119,87,.34);border-radius:28px;padding:38px 46px}
#deliv .tick{width:56px;height:56px;border-radius:50%;background:#5eead4;color:#0b1020;
  font:800 34px/1 inherit;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
#deliv .lbl{color:#eab69f;font:600 46px/1 inherit}
#deliv .sub{color:#8a817a;font:500 32px/1 inherit;margin-left:auto}
#composer{margin-top:30px;display:flex;align-items:center;gap:20px;background:rgba(12,10,9,.55);
  border:2px solid rgba(94,234,212,.30);border-radius:30px;padding:30px 38px}
#composer .txt{color:#5eead4;font:600 34px/1.2 inherit;letter-spacing:.2px}
#composer .send{margin-left:auto;width:56px;height:56px;border-radius:50%;background:#5eead4;
  display:flex;align-items:center;justify-content:center;color:#0b1020;font:800 32px/1 inherit}
</style></head><body>
<div id="content">
  <div id="hdr"><span class="mark"></span><span class="name">/prd</span><span class="sub">multiple-choice</span></div>
  <div id="chat">
    <div class="greet"><span class="d"></span>A few quick questions to shape the spec.</div>
    <div class="you" id="bubble"><span id="txt"></span><span id="caret"></span></div>
    <div class="agent" id="agent"><span class="d"></span>Got it — assembling the PRD…</div>
    <div id="deliv">
      <div class="row"><span class="tick">✓</span><span class="lbl">spec</span><span class="sub">written with you</span></div>
      <div class="row"><span class="tick">✓</span><span class="lbl">stories</span><span class="sub">binary acceptance criteria</span></div>
      <div class="row"><span class="tick">✓</span><span class="lbl">checks</span><span class="sub">your shell commands</span></div>
    </div>
  </div>
  <div id="composer"><span class="txt">${label}</span><span class="send">↑</span></div>
</div>
<script>
window.__chatType=(c)=>{document.getElementById('txt').textContent+=String(c);};
window.__chatSend=()=>{const cr=document.getElementById('caret');if(cr)cr.style.display='none';
  document.getElementById('agent').style.opacity='1';document.getElementById('deliv').style.opacity='1';};
</script></body></html>`;
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

/** Build the live-dashboard camera HTML: the dashboard HTML embedded as an iframe `srcdoc`, with a camera
 *  transform that HOLDS `focusStart` for `holdSec` then eases to `focusEnd` by the end of the beat. */
function buildLiveDashboardCamHtml(opts: {
  dashboardHtml: string;
  srcW: number;
  srcH: number;
  focusStart: { cx: number; cy: number; zoom: number };
  focusEnd: { cx: number; cy: number; zoom: number };
  holdSec: number;
  durationSec: number;
  label: string;
}): string {
  const { dashboardHtml, srcW, srcH, focusStart, focusEnd, holdSec, durationSec, label } = opts;
  const a = liveDashboardCamGeom(focusStart, srcW, srcH, CAP_W, CAP_H);
  const b = liveDashboardCamGeom(focusEnd, srcW, srcH, CAP_W, CAP_H);
  const tf = (g: LiveCam) => `scale(${g.scale.toFixed(4)}) translate(${g.tx.toFixed(1)}px, ${g.ty.toFixed(1)}px)`;
  const holdPct = Math.max(0, Math.min(90, (holdSec / durationSec) * 100)).toFixed(1);
  // srcdoc is a double-quoted attribute → escape inner double-quotes (the dashboard renders identically).
  const srcdoc = dashboardHtml.replace(/"/g, "&quot;");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${CAP_W}px;height:${CAP_H}px;overflow:hidden;position:relative;background:${FORGE_DASH_BG};
  font-family:ui-sans-serif,-apple-system,Helvetica,Arial,sans-serif}
#stage{position:absolute;inset:0;overflow:hidden}
#frm{position:absolute;left:0;top:0;width:${srcW}px;height:${srcH}px;border:0;transform-origin:0 0;
  transform:${tf(a)};animation:cam ${durationSec.toFixed(2)}s ease-in-out forwards}
@keyframes cam{0%{transform:${tf(a)}}${holdPct}%{transform:${tf(a)}}100%{transform:${tf(b)}}}
#pill{position:absolute;left:50%;top:64px;transform:translateX(-50%);background:#14100c;color:#f7f1e6;
  border-radius:999px;font:700 30px/1.2 inherit;padding:18px 40px;letter-spacing:.3px;z-index:2;white-space:nowrap}
</style></head><body>
<div id="stage"><iframe id="frm" srcdoc="${srcdoc}"></iframe></div>
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
    for (const t of [b.stepLabel, b.headline ?? "", b.sub ?? "", b.url ?? "", b.chatRequest ?? "", b.chip ?? ""].filter((s) => s.length > 0)) {
      assertBrandClean(t);
    }
    assertNoInternalDevTokens([b.stepLabel, b.headline ?? "", b.sub ?? "", b.chatRequest ?? "", b.chip ?? ""].filter((s) => s.length > 0), `beat ${b.n}`);
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
    case "transition": {
      // The transition card is a still of the real dashboard (the committed PNG snapshot is kept purely for
      // this beat; the HERO beats render the dashboard HTML live).
      const heroPng = path.join(REPO_ROOT, "assets/forge-demo/dashboard-working-green.png");
      return recordHtml(buildTransitionHtml(fileToDataUri(heroPng, "image/png")), rec, recDir, chromium, undefined, "networkidle");
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
  if (dur < 85 || dur > 92) {
    throw new Error(`captureForge: 9:16 runtime ${dur.toFixed(1)}s is outside the 85–92s band.`);
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
    console.log(`FORGE-RENDER: --dry-run (gates passed). 9 beats, ${total}s:`);
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
