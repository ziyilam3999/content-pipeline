/**
 * #824 Fable LEG 1 — the CAPTURE harness.
 *
 * Records REAL footage of content-pipeline running, as the SPINE that LEG 2 edits. NOT the rejected
 * stylized VHS look, NOT a baked transcript, NOT a placeholder.
 *
 * Two Playwright-recorded surfaces (context `recordVideo`, the stable public API — finalized on
 * `context.close()`), both captured natively at 1080×1920 (9:16) so NO ffmpeg crop is needed:
 *   • TERMINAL page  — a clean modern xterm-style page wired to the REAL streaming stdout of an
 *     actually-executing content-pipeline run (beats 1, 2, 5, 6). Beat 2 LIVE-runs the free producers
 *     (`smoke:image` → a real card PNG; `smoke:demo` → a real animated MP4) — the captured pixels are
 *     the genuine streaming logs, scrubbed of any `/Users/<name>` / `/var/folders` leak.
 *   • ARTIFACT-VIEWER page — shows the REAL produced card PNG full-frame (beat 3, Ken-Burns settle)
 *     and PLAYS the REAL produced MP4 full-frame (beat 4). Headless Chromium plays the H.264 directly.
 *
 * Output (out/ is gitignored — never committed):
 *   • out/capture/beat-01..06.mp4   — the 6 real beat clips (1080×1920)
 *   • out/capture/manifest.json     — per beat: clip + probe; beats 3/4 record the ABSOLUTE source +
 *                                     sha256 of the real card / real MP4 (LEG 3's provenance gate).
 *   • out/review/fable/fable-rough-silent-9x16.mp4 — a rough SILENT concat for the orchestrator EYEBALL.
 *
 * GATES (mechanical, reused): every typed command runs through `assertCaptureCommandsFree` (paid
 * denylist) + `assertCaptureBrandClean` (employer-token denylist) + `ownerLeak` (OS-username denylist);
 * all on-screen stdout is path-scrubbed. `--dry-run` runs the gates + prints the beat plan, no capture.
 *
 * The 3 mandatory gating-test results are in the plan's "LEG 1 — 3 mandatory gating-test results".
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
import * as crypto from "crypto";
import { spawn } from "child_process";
import { spawnSync } from "child_process";

import { assertCaptureCommandsFree, assertCaptureBrandClean } from "./captureDemo";
import { assertBrandClean } from "../inputs/frames";
import { resolveVendoredFfmpeg, probeRender, parseVideoDimensions } from "../video/renderProbe";

// ── Capture geometry (native 9:16 — fill the frame, no letterbox; ~80% h-safe band in the HTML) ──
export const CAP_W = 1080;
export const CAP_H = 1920;
export const CAP_FPS = 30;

// ── The 6-beat storyboard (the approved spine) ───────────────────────────────────────────────────

export type BeatKind = "terminal" | "viewer-card" | "viewer-video";

export interface FableBeat {
  /** 1-based beat number. */
  n: number;
  kind: BeatKind;
  /** Lower-third label LEG 2 may surface (brand-clean, owner-clean). */
  stepLabel: string;
  /** REAL commands streamed live (terminal beats only); [] for viewer beats. */
  commands: string[];
  /** Target rough-cut clip length (seconds). */
  clipSec: number;
}

export const FABLE_BEATS: ReadonlyArray<FableBeat> = [
  { n: 1, kind: "terminal", stepLabel: "content-pipeline", commands: ["ls", "cat package.json | head -5"], clipSec: 6 },
  // Beat 2 LIVE-runs the FREE producers — real streaming render logs, produces the real hero card + MP4.
  { n: 2, kind: "terminal", stepLabel: "one command — it runs for real", commands: ["npm run smoke:image", "npm run smoke:demo"], clipSec: 10 },
  { n: 3, kind: "viewer-card", stepLabel: "the real card it just made", commands: [], clipSec: 6 },
  { n: 4, kind: "viewer-video", stepLabel: "the real video it just made", commands: [], clipSec: 8 },
  // Beat 5 lists the bundle with `ls -gh` (BSD -g SUPPRESSES the owner column — no OS-username leak).
  { n: 5, kind: "terminal", stepLabel: "one out/ bundle", commands: ["ls -gh out/review/lfah/demo/*.mp4", "ls -gh out/image/*.png"], clipSec: 5 },
  { n: 6, kind: "terminal", stepLabel: "content-pipeline · open + MIT", commands: ['echo "content-pipeline — open-source, MIT — link below"'], clipSec: 4 },
];

// ── Owner/username-leak detector (the OS login name must never reach a public capture frame) ──────
// Mirrors the shipped #824 detector in tools/__tests__/captureTape.test.ts so beat commands stay clean.

/** True if an `ls` invocation's flags would print the owner column (long-format with no `-g`/`-o`). */
function lsShowsOwner(cmd: string): boolean {
  if (!/(^|[\s;&|])ls(\s|$)/.test(cmd)) return false;
  const clusters = (cmd.match(/(^|\s)-{1,2}[A-Za-z]+/g) ?? []).map((s) => s.trim().replace(/^-+/, ""));
  const longFormat = clusters.some((c) => c.includes("l"));
  const ownerSuppressed = clusters.some((c) => c.includes("g") || c.includes("o"));
  return longFormat && !ownerSuppressed;
}

const OWNER_LEAK_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "whoami", re: /(^|[\s;&|])whoami(\s|$|[;&|])/i },
  { name: "id (resolves uid/gid -> username)", re: /(^|[\s;&|])id(\s|$|[;&|])/i },
  { name: "stat with owner format (%Su/%u/%U)", re: /\bstat\b[^|]*%-?\d*\.?\d*S?[uU]\b/i },
  { name: "literal /Users/<name> path", re: /\/Users\/[^/\s"']+/i },
];

/** Returns the matched leak-rule name, or null if the command is owner-clean. */
export function ownerLeak(cmd: string): string | null {
  if (lsShowsOwner(cmd)) return "ls long-format (owner column)";
  for (const p of OWNER_LEAK_PATTERNS) if (p.re.test(cmd)) return p.name;
  return null;
}

/**
 * The mechanical pre-flight: every terminal command in `beats` must be FREE (paid denylist),
 * BRAND-CLEAN (employer-token denylist), and OWNER-CLEAN (no OS-username leak). Throws on any
 * violation. Reuses the shipped captureDemo gates by shaping each beat as a {commands, stepLabel}.
 */
export function assertFableBeatsClean(beats: ReadonlyArray<FableBeat>): void {
  const shaped = beats.map((b) => ({ commands: b.commands, stepLabel: b.stepLabel }));
  assertCaptureCommandsFree(shaped); // paid-script denylist (smoke:copy/genart/voice + :paid/:live)
  assertCaptureBrandClean(shaped); // employer-token denylist over labels + commands
  for (const b of beats) {
    assertBrandClean(b.stepLabel);
    for (const c of b.commands) {
      const leak = ownerLeak(c);
      if (leak) {
        throw new Error(`#824 Fable capture: beat ${b.n} command "${c}" would leak the OS owner/username (${leak}). ` +
          `Use \`ls -gh\` (the -g flag suppresses the owner column) and never echo a literal /Users/<name> path.`);
      }
    }
  }
}

// ── On-screen stdout scrub (the streamed output must also be username-clean) ──────────────────────

const REPO_ROOT_ABS = process.cwd();
let REPO_ROOT_REAL = REPO_ROOT_ABS;
try { REPO_ROOT_REAL = fs.realpathSync(REPO_ROOT_ABS); } catch { /* keep abs */ }

/** Strip ANSI + any absolute repo/home/tmp prefix from a streamed chunk so the captured frame is clean. */
export function scrubStreamChunk(s: string): string {
  let out = s.replace(/\x1b\[[0-9;]*m/g, ""); // ANSI color codes
  out = out.split(REPO_ROOT_REAL).join("."); // worktree realpath → repo-relative
  if (REPO_ROOT_ABS !== REPO_ROOT_REAL) out = out.split(REPO_ROOT_ABS).join(".");
  out = out.replace(/\/Users\/[^/\s"']+/g, "~"); // any remaining /Users/<name> → ~
  out = out.replace(/\/var\/folders\/[^\s"']+/g, "<tmp>"); // OS tmp dirs
  return out;
}

// ── Page HTML (clean modern terminal + artifact viewer) — pure, no /Users leak ────────────────────

/** A clean modern terminal page (system-mono, calm dark slate, teal prompt, blinking cursor). */
export function buildTerminalHtml(): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${CAP_W}px;height:${CAP_H}px;background:#0b1020;overflow:hidden}
#frame{height:100%;padding:96px 108px}
#bar{display:flex;align-items:center;gap:14px;margin-bottom:36px}
#bar .dot{width:20px;height:20px;border-radius:50%}
.r{background:#ff5f57}.y{background:#febc2e}.g{background:#28c840}
#bar .title{margin-left:18px;color:#7c89a8;font:600 26px ui-monospace,Menlo,monospace}
#out{font:400 31px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#d7e0f0;white-space:pre-wrap;word-break:break-word}
.cmd{color:#5eead4}.prompt{color:#9aa7c7}
#cur{display:inline-block;width:17px;height:30px;background:#5eead4;vertical-align:-4px;animation:b 1.05s steps(1) infinite}
@keyframes b{50%{opacity:0}}
</style></head><body>
<div id="frame">
  <div id="bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span><span class="title">content-pipeline</span></div>
  <div id="out"></div><span id="cur"></span>
</div>
<script>
window.__termPrompt=()=>{const o=document.getElementById('out');const s=document.createElement('span');s.className='prompt';s.textContent='\\n$ ';o.appendChild(s);};
window.__termCmd=(c)=>{const o=document.getElementById('out');const s=document.createElement('span');s.className='cmd';s.textContent=c+'\\n';o.appendChild(s);};
window.__termWrite=(t)=>{const o=document.getElementById('out');o.appendChild(document.createTextNode(String(t)));
  while(o.textContent.length>2600&&o.firstChild)o.removeChild(o.firstChild);
  document.getElementById('frame').scrollTop=1e9;};
</script></body></html>`;
}

/** Full-frame card viewer — fills 9:16 with a calm backdrop, the real card centred + a slow Ken-Burns settle. */
export function buildViewerCardHtml(cardDataUri: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${CAP_W}px;height:${CAP_H}px;overflow:hidden;background:radial-gradient(circle at 50% 38%,#16213f 0%,#0b1020 70%)}
#stage{width:100%;height:100%;display:flex;align-items:center;justify-content:center}
img{width:84%;border-radius:28px;box-shadow:0 40px 120px rgba(0,0,0,.6);animation:kb 7s ease-out forwards}
@keyframes kb{from{transform:scale(1.0) translateY(18px)}to{transform:scale(1.08) translateY(-6px)}}
</style></head><body><div id="stage"><img src="${cardDataUri}"></div></body></html>`;
}

/** Full-frame video viewer — plays the REAL produced MP4 (served over loopback) filling the 9:16 frame. */
export function buildViewerVideoHtml(videoUrl: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${CAP_W}px;height:${CAP_H}px;overflow:hidden;background:#000}
video{width:100%;height:100%;object-fit:cover;display:block}
</style></head><body><video id="v" src="${videoUrl}" autoplay muted playsinline></video></body></html>`;
}

// ── Manifest types ───────────────────────────────────────────────────────────────────────────────

export interface HeroSource {
  /** Absolute path of the real produced artefact the beat displays (manifest lives in gitignored out/). */
  path: string;
  /** Repo-relative path (the clean form LEG 3's gate resolves against the repo root). */
  relPath: string;
  sha256: string;
  bytes: number;
}

export interface BeatRecord {
  n: number;
  kind: BeatKind;
  stepLabel: string;
  /** Repo-relative path of the rendered beat clip. */
  clip: string;
  bytes: number;
  videoFrames: number;
  width: number;
  height: number;
  /** Present ONLY for the two HERO beats (3 = card, 4 = video). */
  heroSource?: HeroSource;
}

export interface FableManifest {
  task: number;
  leg: number;
  createdAt: string;
  dims: { width: number; height: number };
  beats: BeatRecord[];
  roughConcat: string;
}

// ── ffmpeg helpers (vendored remotion ffmpeg — transcode/trim/concat need NO disabled filters) ─────

function ffmpeg(): { bin: string; dir: string } {
  return resolveVendoredFfmpeg();
}
function runFfmpeg(args: string[]): { code: number | null; out: string } {
  const { bin, dir } = ffmpeg();
  const env = process.platform === "darwin" ? { ...process.env, DYLD_FALLBACK_LIBRARY_PATH: dir } : { ...process.env };
  const r = spawnSync(bin, args, { env, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  if (r.error) throw new Error(`captureFable: vendored ffmpeg failed: ${r.error.message}`);
  return { code: r.status, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}

function sha256File(p: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}
function fileToDataUri(p: string, mime: string): string {
  return `data:${mime};base64,${fs.readFileSync(p).toString("base64")}`;
}
function relOf(p: string): string {
  return path.relative(REPO_ROOT_REAL, fs.realpathSync(p)).split(path.sep).join("/");
}

// ── Recording (Playwright context recordVideo) ─────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Record one TERMINAL beat: live-run each command, stream scrubbed stdout into the page, return the webm path. */
async function recordTerminalBeat(beat: FableBeat, recDir: string, chromium: any): Promise<string> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: CAP_W, height: CAP_H },
    recordVideo: { dir: recDir, size: { width: CAP_W, height: CAP_H } },
  });
  const page = await context.newPage();
  await page.setContent(buildTerminalHtml(), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);

  for (const cmd of beat.commands) {
    await page.evaluate(() => (globalThis as any).window.__termPrompt());
    // type the command out, char-batched, for a live "typed" feel
    for (let i = 0; i < cmd.length; i += 3) {
      await page.evaluate((c: string) => {
        const doc = (globalThis as any).document;
        const o = doc.getElementById("out");
        const last = o.lastChild && o.lastChild.className === "cmd" ? o.lastChild : null;
        if (last) last.textContent += c;
        else { const s = doc.createElement("span"); s.className = "cmd"; s.textContent = c; o.appendChild(s); }
      }, cmd.slice(i, i + 3));
      await page.waitForTimeout(18);
    }
    await page.evaluate(() => (globalThis as any).window.__termWrite("\n"));

    // run the REAL command via the shell, stream scrubbed output live
    const child = spawn("/bin/sh", ["-c", cmd], { cwd: REPO_ROOT_REAL });
    const feed = (buf: Buffer) =>
      page.evaluate((s: string) => (globalThis as any).window.__termWrite(s), scrubStreamChunk(buf.toString())).catch(() => {});
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    const code: number = await new Promise((res) => child.on("close", (c) => res(c ?? 0)));
    if (code !== 0 && beat.n === 2) {
      throw new Error(`captureFable: beat 2 producer "${cmd}" exited ${code} — the real artefacts were not produced.`);
    }
    await page.waitForTimeout(900); // let the final output settle into a frame
  }
  await page.waitForTimeout(800);

  const video = page.video();
  await context.close();
  await browser.close();
  return await video!.path();
}

/** Record the BEAT-3 card viewer (real card as a data URI, Ken-Burns settle). */
async function recordViewerCardBeat(beat: FableBeat, cardPath: string, recDir: string, chromium: any): Promise<string> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: CAP_W, height: CAP_H },
    recordVideo: { dir: recDir, size: { width: CAP_W, height: CAP_H } },
  });
  const page = await context.newPage();
  await page.setContent(buildViewerCardHtml(fileToDataUri(cardPath, "image/png")), { waitUntil: "networkidle" });
  await page.waitForTimeout((beat.clipSec + 2) * 1000);
  const video = page.video();
  await context.close();
  await browser.close();
  return await video!.path();
}

/** Record the BEAT-4 video viewer (PLAYS the real produced MP4 over loopback). */
async function recordViewerVideoBeat(beat: FableBeat, videoUrl: string, recDir: string, chromium: any): Promise<string> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: CAP_W, height: CAP_H },
    recordVideo: { dir: recDir, size: { width: CAP_W, height: CAP_H } },
  });
  const page = await context.newPage();
  await page.setContent(buildViewerVideoHtml(videoUrl), { waitUntil: "domcontentloaded" });
  // wait for real playback to begin
  await page.waitForFunction(() => { const v = (globalThis as any).document.getElementById("v"); return v && v.currentTime > 0.1; }, { timeout: 8000 });
  await page.waitForTimeout((beat.clipSec + 1) * 1000);
  const video = page.video();
  await context.close();
  await browser.close();
  return await video!.path();
}

/** Transcode a recorded webm → a normalized beat MP4 (1080×1920, h264, 30fps, no audio), trimmed to the TAIL clipSec. */
function transcodeBeatClip(webm: string, outMp4: string, clipSec: number): void {
  const dur = probeRender(webm).videoDurationSec;
  const start = Math.max(0, dur - clipSec);
  const { code } = runFfmpeg([
    "-hide_banner", "-y",
    "-ss", start.toFixed(2), "-i", webm, "-t", clipSec.toFixed(2),
    "-r", String(CAP_FPS), "-vf", `scale=${CAP_W}:${CAP_H}`, "-pix_fmt", "yuv420p",
    "-c:v", "libx264", "-profile:v", "high", "-preset", "veryfast", "-crf", "20",
    "-movflags", "+faststart", "-an", outMp4,
  ]);
  if (!fs.existsSync(outMp4) || fs.statSync(outMp4).size === 0) {
    throw new Error(`captureFable: beat transcode produced no output (ffmpeg exit ${code}) for ${webm}`);
  }
}

/** Concat the 6 normalized beat MP4s into the rough SILENT 9:16 cut via the concat demuxer (-c copy; identical params). */
function concatBeats(beatMp4s: string[], outMp4: string): void {
  const listPath = path.join(path.dirname(outMp4), "_concat-list.txt");
  fs.writeFileSync(listPath, beatMp4s.map((p) => `file '${p}'`).join("\n"), "utf8");
  let { code } = runFfmpeg(["-hide_banner", "-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", outMp4]);
  if (!fs.existsSync(outMp4) || fs.statSync(outMp4).size === 0) {
    // fall back to a re-encode concat if stream-copy refused
    ({ code } = runFfmpeg(["-hide_banner", "-y", "-f", "concat", "-safe", "0", "-i", listPath,
      "-r", String(CAP_FPS), "-vf", `scale=${CAP_W}:${CAP_H}`, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-crf", "20", "-movflags", "+faststart", "-an", outMp4]));
  }
  if (!fs.existsSync(outMp4) || fs.statSync(outMp4).size === 0) {
    throw new Error(`captureFable: rough concat produced no output (ffmpeg exit ${code}).`);
  }
}

// ── The capture run ────────────────────────────────────────────────────────────────────────────────

async function runCapture(): Promise<void> {
  assertFableBeatsClean(FABLE_BEATS); // hard pre-flight (paid / brand / owner)

  const { chromium } = await import("playwright");
  const captureDir = path.join(REPO_ROOT_REAL, "out", "capture");
  const reviewDir = path.join(REPO_ROOT_REAL, "out", "review", "fable");
  const recRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fable-rec-"));
  fs.mkdirSync(captureDir, { recursive: true });
  fs.mkdirSync(reviewDir, { recursive: true });

  // loopback static server (serves the real MP4 to the beat-4 viewer — loopback, no external network)
  const server = http.createServer((req, res) => {
    const fp = path.join(REPO_ROOT_REAL, decodeURIComponent((req.url || "/").split("?")[0]));
    if (!fp.startsWith(REPO_ROOT_REAL) || !fs.existsSync(fp)) { res.writeHead(404); res.end(); return; }
    const ext = path.extname(fp);
    res.writeHead(200, { "Content-Type": ext === ".mp4" ? "video/mp4" : ext === ".png" ? "image/png" : "application/octet-stream" });
    fs.createReadStream(fp).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as any).port;

  const CARD_PATH = path.join(REPO_ROOT_REAL, "out", "image", "card-1x1.png");
  const VIDEO_PATH = path.join(REPO_ROOT_REAL, "out", "review", "lfah", "demo", "demo-9x16.mp4");

  const beats: BeatRecord[] = [];
  const beatMp4s: string[] = [];

  for (const beat of FABLE_BEATS) {
    console.log(`[fable] recording beat ${beat.n} (${beat.kind}) — ${beat.stepLabel}`);
    let webm: string;
    if (beat.kind === "terminal") {
      webm = await recordTerminalBeat(beat, recRoot, chromium);
    } else if (beat.kind === "viewer-card") {
      if (!fs.existsSync(CARD_PATH)) throw new Error(`captureFable: beat 3 hero card missing at ${relOf(path.dirname(CARD_PATH))}/card-1x1.png — beat 2 must run first.`);
      webm = await recordViewerCardBeat(beat, CARD_PATH, recRoot, chromium);
    } else {
      if (!fs.existsSync(VIDEO_PATH)) throw new Error("captureFable: beat 4 hero MP4 missing — beat 2 (smoke:demo) must run first.");
      webm = await recordViewerVideoBeat(beat, `http://127.0.0.1:${port}/${relOf(VIDEO_PATH)}`, recRoot, chromium);
    }

    const outMp4 = path.join(captureDir, `beat-${String(beat.n).padStart(2, "0")}.mp4`);
    transcodeBeatClip(webm, outMp4, beat.clipSec);
    const probe = probeRender(outMp4);
    const dims = parseVideoDimensions(runFfmpeg(["-hide_banner", "-i", outMp4]).out) ?? { width: 0, height: 0 };
    const rec: BeatRecord = {
      n: beat.n, kind: beat.kind, stepLabel: beat.stepLabel,
      clip: relOf(outMp4), bytes: fs.statSync(outMp4).size, videoFrames: probe.videoFrames,
      width: dims.width, height: dims.height,
    };
    if (beat.kind === "viewer-card") rec.heroSource = { path: CARD_PATH, relPath: relOf(CARD_PATH), sha256: sha256File(CARD_PATH), bytes: fs.statSync(CARD_PATH).size };
    if (beat.kind === "viewer-video") rec.heroSource = { path: VIDEO_PATH, relPath: relOf(VIDEO_PATH), sha256: sha256File(VIDEO_PATH), bytes: fs.statSync(VIDEO_PATH).size };
    beats.push(rec);
    beatMp4s.push(outMp4);
    console.log(`  → ${rec.clip} (${rec.width}x${rec.height}, ${rec.videoFrames} frames, ${(rec.bytes / 1024).toFixed(0)}KB)`);
  }

  server.close();

  // rough SILENT concat for the orchestrator EYEBALL
  const concatOut = path.join(reviewDir, "fable-rough-silent-9x16.mp4");
  concatBeats(beatMp4s, concatOut);
  const concatProbe = probeRender(concatOut);
  console.log(`[fable] rough silent concat → ${relOf(concatOut)} (${concatProbe.videoFrames} frames, ${concatProbe.videoDurationSec.toFixed(1)}s, ${(fs.statSync(concatOut).size / 1024).toFixed(0)}KB)`);

  const manifest: FableManifest = {
    task: 824, leg: 1, createdAt: new Date().toISOString(),
    dims: { width: CAP_W, height: CAP_H }, beats, roughConcat: relOf(concatOut),
  };
  const manifestPath = path.join(captureDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`[fable] manifest → ${relOf(manifestPath)}`);

  // brand-clean backstop over every label + the rough concat is silent (no audio stream)
  for (const b of beats) assertBrandClean(b.stepLabel);

  fs.rmSync(recRoot, { recursive: true, force: true });
  console.log(`\nFABLE-CAPTURE: 6 beats captured. manifest=${relOf(manifestPath)} roughConcat=${relOf(concatOut)}`);
}

// ── Entrypoint ───────────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  assertFableBeatsClean(FABLE_BEATS);
  if (dryRun) {
    console.log("FABLE-CAPTURE: --dry-run (gates passed: paid-free + brand-clean + owner-clean). 6 beats:");
    for (const b of FABLE_BEATS) {
      const what = b.kind === "terminal" ? b.commands.join("  ;  ") : `[${b.kind}]`;
      console.log(`  beat ${b.n} (${b.kind}, ~${b.clipSec}s) — ${b.stepLabel}  ::  ${what}`);
    }
    return;
  }
  await runCapture();
}

if (require.main === module) {
  main().catch((err) => {
    console.error("FABLE-CAPTURE FAIL:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
