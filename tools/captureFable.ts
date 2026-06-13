/**
 * #824 Fable — the CAPTURE harness (REVISED ~90s, 8-beat storyboard).
 *
 * Records REAL footage of content-pipeline running, as the SPINE that LEG 2 edits. NOT the rejected
 * stylized VHS look, NOT a baked transcript, NOT a placeholder.
 *
 * THE REFRAME (operator-approved 2026-06-13): content-pipeline is NOT a human UI — it is the interface
 * an AI AGENT uses. The human just talks to Claude Code in plain English ("build me a launch post about
 * lfah"); the agent then drives content-pipeline. The demo must MAKE THIS CLEAR and clearly distinguish
 * THE TOOL (the agent's interface, dark navy) from THE OUTPUT (what it produced, a DISTINCT light bg).
 *
 * The ~90s, 8-beat cut (each captured natively at 1080×1920 / 9:16 — fill the frame, no letterbox):
 *   1. HOOK (~6s, title)        — "This tool has no buttons." / "Because you're not the one using it."
 *   2. CHAT (~12s, chat)        — a clean Claude Code chat surface; the human TYPES the genuine natural-
 *                                 language request. Label "you → Claude Code · plain English". This is the
 *                                 HUMAN's interface. Honest reconstruction of the chat surface (a styled
 *                                 chat UI showing the real request) — the agent's actual work is the REAL
 *                                 terminal capture in beat 3, not faked here.
 *   3. TOOL (~15s, terminal)    — the content-pipeline terminal LIVE-runs the FREE producers (real
 *                                 streaming logs → a real 9:16 card PNG + a real animated MP4), on the
 *                                 TOOL background, labeled "content-pipeline — the agent's interface, not
 *                                 yours". Scrubbed of any /Users path + curated to a public-safe line set.
 *   4. TRANSITION (~3s)         — an explicit animated handoff: the real output emerges from the tool and
 *                                 the background wipes dark(tool) → light(output). NOT a hard cut.
 *   5. OUTPUT — card (~12s)     — the REAL produced card, FRAMED on the DISTINCT light output bg, "the output".
 *   6. OUTPUT — video (~15s)    — the REAL produced MP4 playing, FRAMED on the DISTINCT light output bg.
 *   7. PAYOFF (~12s, title)     — "You spoke. The agent built." / "No UI to learn."
 *   8. CTA (~10s, title)        — content-pipeline · open-source · MIT · github.com/ziyilam3999/content-pipeline.
 *
 * Output (out/ is gitignored — never committed):
 *   • out/capture/beat-01..08.mp4   — the 8 real beat clips (1080×1920)
 *   • out/capture/manifest.json     — per beat: clip + probe; beats 5/6 record the ABSOLUTE source +
 *                                     sha256 of the real card / real MP4 (LEG 3's provenance gate).
 *   • out/review/fable/fable-rough-silent-9x16.mp4 — a rough SILENT concat for the orchestrator EYEBALL.
 *
 * GATES (mechanical, reused): every typed command runs through `assertCaptureCommandsFree` (paid
 * denylist) + `assertCaptureBrandClean` (employer-token denylist) + `ownerLeak` (OS-username denylist);
 * every on-screen TEXT field (labels, headlines, chat request) runs through `assertBrandClean`; all
 * on-screen stdout is path-scrubbed + public-line-curated. `--dry-run` runs the gates + prints the plan.
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
import { outputDeviceSpineRect, assertNoCaptionMediaOverlap } from "../video/fableLayout";

// ── Capture geometry (native 9:16 — fill the frame, no letterbox) ──────────────────────────────────
export const CAP_W = 1080;
export const CAP_H = 1920;
export const CAP_FPS = 30;

// ── The two VISUALLY DISTINCT worlds (the core of the reframe) ─────────────────────────────────────
// THE TOOL — dark navy, teal accent (the agent's interface: terminal, hook, payoff, cta).
export const BG_TOOL = "#0b1020";
// THE OUTPUT — a LIGHT warm cream surface (unmistakably different from the dark tool world). The real
// card / real video are FRAMED on this so the viewer can never confuse the output with the tool.
export const BG_OUTPUT_A = "#f7f1e6"; // cream
export const BG_OUTPUT_B = "#ecdfc8"; // deeper sand (gradient end)

// ── The 8-beat storyboard (the approved REVISED ~90s spine) ────────────────────────────────────────

export type BeatKind = "title" | "chat" | "terminal" | "transition" | "viewer-card" | "viewer-video";

export interface FableBeat {
  /** 1-based beat number. */
  n: number;
  kind: BeatKind;
  /** On-screen lower-third / label (brand-clean, owner-clean). "" for pure title beats. */
  stepLabel: string;
  /** REAL commands streamed live (terminal beats only); [] otherwise. */
  commands: string[];
  /** Target rough-cut clip length (seconds). */
  clipSec: number;
  /** Title beats — the big headline + optional subtext + optional url (CTA). */
  headline?: string;
  sub?: string;
  url?: string;
  /** Chat beat — the genuine natural-language request the human types. */
  chatRequest?: string;
}

export const FABLE_BEATS: ReadonlyArray<FableBeat> = [
  // 1 — HOOK. Clean title on the tool/neutral world.
  { n: 1, kind: "title", stepLabel: "", commands: [], clipSec: 6,
    headline: "This tool has no buttons.", sub: "Because you're not the one using it." },
  // 2 — CHAT. The HUMAN's interface: plain English to Claude Code. Honest chat-surface reconstruction.
  { n: 2, kind: "chat", stepLabel: "you → Claude Code · plain English", commands: [], clipSec: 12,
    chatRequest: "Build me a launch post about lfah — copy, a card, and a video." },
  // 3 — TOOL. The agent's interface runs for real (FREE producers → the real hero card + MP4).
  { n: 3, kind: "terminal", stepLabel: "content-pipeline — the agent's interface, not yours", clipSec: 15,
    commands: ["IMAGE_SMOKE_ASPECT=9:16 npm run smoke:image", "npm run smoke:demo"] },
  // 4 — TRANSITION. Explicit animated handoff: the output emerges from the tool, bg wipes tool → output.
  { n: 4, kind: "transition", stepLabel: "", commands: [], clipSec: 3 },
  // 5 — OUTPUT (card). Real produced card, FRAMED on the DISTINCT light output bg.
  { n: 5, kind: "viewer-card", stepLabel: "the output", commands: [], clipSec: 12 },
  // 6 — OUTPUT (video). Real produced MP4 playing, FRAMED on the DISTINCT light output bg.
  { n: 6, kind: "viewer-video", stepLabel: "the output", commands: [], clipSec: 15 },
  // 7 — PAYOFF. Recap the reframe.
  { n: 7, kind: "title", stepLabel: "", commands: [], clipSec: 12,
    headline: "You spoke. The agent built.", sub: "No UI to learn." },
  // 8 — CTA.
  { n: 8, kind: "title", stepLabel: "", commands: [], clipSec: 10,
    headline: "content-pipeline", sub: "open-source · MIT", url: "github.com/ziyilam3999/content-pipeline" },
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

/** Every brand-checkable on-screen text field a beat carries (labels + title text + chat request). */
function beatTextFields(b: FableBeat): string[] {
  return [b.stepLabel, b.headline ?? "", b.sub ?? "", b.url ?? "", b.chatRequest ?? ""].filter((s) => s.length > 0);
}

/**
 * The mechanical pre-flight: every terminal command in `beats` must be FREE (paid denylist),
 * BRAND-CLEAN (employer-token denylist), and OWNER-CLEAN (no OS-username leak); every on-screen text
 * field must be BRAND-CLEAN. Throws on any violation.
 */
export function assertFableBeatsClean(beats: ReadonlyArray<FableBeat>): void {
  const shaped = beats.map((b) => ({ commands: b.commands, stepLabel: b.stepLabel }));
  assertCaptureCommandsFree(shaped); // paid-script denylist (smoke:copy/genart/voice + :paid/:live)
  assertCaptureBrandClean(shaped); // employer-token denylist over labels + commands
  for (const b of beats) {
    for (const t of beatTextFields(b)) assertBrandClean(t); // every on-screen text field
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

// ── Public-safe stdout curation (DEFECT 2 — no internal dev-process text on a PUBLIC video) ────────
const PUBLIC_UNSAFE_LINE: ReadonlyArray<RegExp> = [
  /#\d/, // internal task references (#748, #744, …)
  /\bphase\b/i, // dev-process phase language ("Phase D / #744")
  /tell me/i, // "tell me what to change"
  /watch it/i, // "Watch it and …"
  /\bsmoke\b/i, // smoke-test banners / SMOKE PASS / SMOKE-PATH
];

/** True if a single output LINE is safe to show on a public capture frame. */
export function publicSafeLine(line: string): boolean {
  return !PUBLIC_UNSAFE_LINE.some((re) => re.test(line));
}

/** Drop every dev-process line from a (newline-terminated) chunk, preserving the safe lines + breaks. */
export function filterPublicLines(text: string): string {
  return text
    .split("\n")
    .filter((l) => publicSafeLine(l))
    .join("\n");
}

// ── Page HTML (each beat renders its OWN world + label — pure, no /Users leak) ─────────────────────

/** A shared lower-third label pill (brand-clean text comes from the beat). */
function lowerThird(label: string, dark: boolean): string {
  if (!label) return "";
  const bg = dark ? "rgba(94,234,212,.12)" : "rgba(20,16,12,.9)";
  const fg = dark ? "#5eead4" : "#f7f1e6";
  const bd = dark ? "rgba(94,234,212,.35)" : "rgba(20,16,12,.0)";
  return `<div style="position:absolute;left:50%;bottom:72px;transform:translateX(-50%);
    background:${bg};color:${fg};border:2px solid ${bd};border-radius:999px;
    font:600 30px/1.2 ui-sans-serif,-apple-system,Helvetica,Arial,sans-serif;
    padding:20px 38px;white-space:nowrap;letter-spacing:.2px;backdrop-filter:blur(6px)">${label}</div>`;
}

/** A clean modern terminal page (system-mono, tool-world navy, teal prompt) + the agent-interface label. */
export function buildTerminalHtml(label = "content-pipeline — the agent's interface, not yours"): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${CAP_W}px;height:${CAP_H}px;background:${BG_TOOL};overflow:hidden;position:relative}
#frame{height:100%;padding:96px 108px 200px}
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
${lowerThird(label, true)}
<script>
window.__termPrompt=()=>{const o=document.getElementById('out');const s=document.createElement('span');s.className='prompt';s.textContent='\\n$ ';o.appendChild(s);};
window.__termCmd=(c)=>{const o=document.getElementById('out');const s=document.createElement('span');s.className='cmd';s.textContent=c+'\\n';o.appendChild(s);};
window.__termWrite=(t)=>{const o=document.getElementById('out');o.appendChild(document.createTextNode(String(t)));
  while(o.textContent.length>2200&&o.firstChild)o.removeChild(o.firstChild);
  document.getElementById('frame').scrollTop=1e9;};
</script></body></html>`;
}

/**
 * A clean Claude Code CHAT surface (the HUMAN's interface). Warm "Claude" world (clay accent), distinct
 * from BOTH the dark-navy tool AND the light output. The genuine request is TYPED in via `window.__chatType`,
 * finalized with `window.__chatSend` (which surfaces the agent picking the work up — honest: the agent's
 * ACTUAL work is the real terminal capture in beat 3).
 */
export function buildChatHtml(label = "you → Claude Code · plain English"): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${CAP_W}px;height:${CAP_H}px;background:#1c1917;overflow:hidden;position:relative;
  font-family:ui-sans-serif,-apple-system,Helvetica,Arial,sans-serif}
#hdr{display:flex;align-items:center;gap:18px;padding:90px 96px 0}
#hdr .mark{width:34px;height:34px;border-radius:9px;background:#d97757}
#hdr .name{color:#e7e2db;font:700 34px/1 inherit}
#hdr .sub{color:#8a817a;font:500 26px/1 inherit;margin-left:auto}
#chat{padding:80px 96px;display:flex;flex-direction:column;gap:40px}
.you{align-self:flex-end;max-width:78%;background:#d97757;color:#fff;border-radius:34px 34px 8px 34px;
  padding:34px 40px;font:500 40px/1.4 inherit;box-shadow:0 18px 50px rgba(217,119,87,.28)}
#caret{display:inline-block;width:5px;height:42px;background:#fff;vertical-align:-7px;margin-left:3px;animation:b 1s steps(1) infinite}
@keyframes b{50%{opacity:0}}
.agent{align-self:flex-start;max-width:78%;color:#b9b1a8;font:500 34px/1.4 inherit;display:flex;align-items:center;gap:16px;opacity:0;transition:opacity .5s}
.agent .d{width:14px;height:14px;border-radius:50%;background:#7c7068;animation:p 1.2s ease-in-out infinite}
@keyframes p{0%,100%{opacity:.3}50%{opacity:1}}
</style></head><body>
<div id="hdr"><span class="mark"></span><span class="name">Claude Code</span><span class="sub">plain English</span></div>
<div id="chat">
  <div class="you" id="bubble"><span id="txt"></span><span id="caret"></span></div>
  <div class="agent" id="agent"><span class="d"></span>On it — driving content-pipeline…</div>
</div>
${lowerThird(label, true)}
<script>
window.__chatType=(c)=>{document.getElementById('txt').textContent+=String(c);};
window.__chatSend=()=>{const cr=document.getElementById('caret');if(cr)cr.style.display='none';
  document.getElementById('agent').style.opacity='1';};
</script></body></html>`;
}

/** A clean title card on the TOOL/neutral world (hook, payoff, cta). */
export function buildTitleHtml(opts: { headline: string; sub?: string; url?: string }): string {
  const { headline, sub, url } = opts;
  const subHtml = sub ? `<div class="sub">${sub}</div>` : "";
  const urlHtml = url ? `<div class="url">${url}</div>` : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${CAP_W}px;height:${CAP_H}px;background:
  radial-gradient(1200px 1200px at 50% 30%, #131a31 0%, ${BG_TOOL} 60%);overflow:hidden}
#wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;
  text-align:center;padding:0 120px;font-family:ui-sans-serif,-apple-system,Helvetica,Arial,sans-serif}
.h{color:#eef2fb;font-family:inherit;font-weight:800;font-size:104px;line-height:1.08;letter-spacing:-2px;animation:rise .8s ease-out both}
.sub{color:#9fb0d8;font-family:inherit;font-weight:500;font-size:54px;line-height:1.3;margin-top:44px;animation:rise .8s .15s ease-out both}
.url{color:#5eead4;font-family:ui-monospace,Menlo,monospace;font-weight:600;font-size:42px;line-height:1.2;margin-top:72px;
  border:2px solid rgba(94,234,212,.4);border-radius:999px;padding:24px 46px;animation:rise .8s .3s ease-out both}
@keyframes rise{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}
</style></head><body><div id="wrap">
  <div class="h">${headline}</div>${subHtml}${urlHtml}
</div></body></html>`;
}

/**
 * The TRANSITION (~3s): the real output literally EMERGES from the tool. The dark navy (tool) is wiped
 * upward by a light cream sheet (output), while the real produced card scales from a small tool-corner
 * thumbnail to a centered framed object and the label crossfades "the agent's interface" → "the output".
 */
export function buildTransitionHtml(cardDataUri: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${CAP_W}px;height:${CAP_H}px;overflow:hidden;position:relative;background:${BG_TOOL};
  font-family:ui-sans-serif,-apple-system,Helvetica,Arial,sans-serif}
#sheet{position:absolute;inset:0;background:linear-gradient(160deg,${BG_OUTPUT_A},${BG_OUTPUT_B});
  transform:translateY(100%);animation:wipe 1.5s .5s cubic-bezier(.7,0,.2,1) forwards}
@keyframes wipe{to{transform:translateY(0)}}
#card{position:absolute;left:50%;top:62%;width:30%;aspect-ratio:9/16;border-radius:20px;overflow:hidden;
  transform:translate(-50%,-50%) rotate(-4deg);box-shadow:0 30px 80px rgba(0,0,0,.5);
  border:6px solid #0e1424;animation:emerge 2s .4s cubic-bezier(.6,0,.2,1) forwards}
#card img{width:100%;height:100%;object-fit:cover;display:block}
@keyframes emerge{to{top:46%;width:62%;transform:translate(-50%,-50%) rotate(0)}}
#lbl{position:absolute;left:50%;bottom:120px;transform:translateX(-50%);white-space:nowrap;
  font:700 34px/1 inherit;color:#5eead4;animation:swap 3s linear forwards}
@keyframes swap{0%,38%{opacity:1}48%,56%{opacity:0}66%,100%{opacity:1;color:#14100c}}
#lbl::after{content:"the agent's interface";animation:txt 3s step-end forwards}
@keyframes txt{0%{content:"the agent's interface"}60%,100%{content:"the output"}}
</style></head><body>
<div id="sheet"></div>
<div id="card"><img src="${cardDataUri}"></div>
<div id="lbl"></div>
</body></html>`;
}

/**
 * OUTPUT — card viewer. The real 9:16 card FRAMED (dark device bezel) on the DISTINCT light output world,
 * labeled "the output". The cream surface FILLS the 9:16 frame (a designed matte, NOT an empty letterbox
 * island) and the framed card dominates (~86% width). A slow Ken-Burns keeps the framed card alive.
 */
export function buildViewerCardHtml(cardDataUri: string, label = "the output"): string {
  const d = outputDeviceSpineRect();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${CAP_W}px;height:${CAP_H}px;overflow:hidden;position:relative;
  background:linear-gradient(160deg,${BG_OUTPUT_A},${BG_OUTPUT_B});
  font-family:ui-sans-serif,-apple-system,Helvetica,Arial,sans-serif}
#pill{position:absolute;left:50%;top:64px;transform:translateX(-50%);background:#14100c;color:#f7f1e6;
  border-radius:999px;font:700 30px/1.2 inherit;padding:18px 40px;letter-spacing:.3px;z-index:2}
/* #824 caption-overlap-fix: device INSET into the upper region (top..bottom from fableLayout.OUTPUT_DEVICE)
   so the lower-third caption band lands in clear cream BELOW it. Bottom clears every aspect's band. */
#device{position:absolute;left:50%;top:${d.top}px;transform:translateX(-50%);width:${d.right - d.left}px;height:${d.bottom - d.top}px;
  border-radius:34px;overflow:hidden;border:10px solid #0e1424;box-shadow:0 40px 110px rgba(60,40,10,.32)}
#device img{width:100%;height:100%;object-fit:cover;display:block;animation:kb 13s ease-out forwards}
@keyframes kb{from{transform:scale(1.0)}to{transform:scale(1.07)}}
</style></head><body>
<div id="pill">${label}</div>
<div id="device"><img src="${cardDataUri}"></div>
</body></html>`;
}

/** OUTPUT — video viewer. Plays the REAL produced MP4, FRAMED on the DISTINCT light output world. */
export function buildViewerVideoHtml(videoUrl: string, label = "the output"): string {
  const d = outputDeviceSpineRect();
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${CAP_W}px;height:${CAP_H}px;overflow:hidden;position:relative;
  background:linear-gradient(160deg,${BG_OUTPUT_A},${BG_OUTPUT_B});
  font-family:ui-sans-serif,-apple-system,Helvetica,Arial,sans-serif}
#pill{position:absolute;left:50%;top:64px;transform:translateX(-50%);background:#14100c;color:#f7f1e6;
  border-radius:999px;font:700 30px/1.2 inherit;padding:18px 40px;letter-spacing:.3px;z-index:2}
/* #824 caption-overlap-fix: device INSET into the upper region (see fableLayout.OUTPUT_DEVICE) so the
   lower-third caption band lands in clear cream BELOW it. Bottom clears every aspect's band. */
#device{position:absolute;left:50%;top:${d.top}px;transform:translateX(-50%);width:${d.right - d.left}px;height:${d.bottom - d.top}px;
  border-radius:34px;overflow:hidden;border:10px solid #0e1424;box-shadow:0 40px 110px rgba(60,40,10,.32);background:#000}
#device video{width:100%;height:100%;object-fit:cover;display:block}
</style></head><body>
<div id="pill">${label}</div>
<div id="device"><video id="v" src="${videoUrl}" autoplay muted playsinline></video></div>
</body></html>`;
}

// ── Manifest types ───────────────────────────────────────────────────────────────────────────────

export interface HeroSource {
  path: string;
  relPath: string;
  sha256: string;
  bytes: number;
}

export interface BeatRecord {
  n: number;
  kind: BeatKind;
  stepLabel: string;
  clip: string;
  bytes: number;
  videoFrames: number;
  width: number;
  height: number;
  /** Present ONLY for the two HERO output beats (5 = card, 6 = video). */
  heroSource?: HeroSource;
}

export interface FableManifest {
  task: number;
  leg: number;
  storyboard: string;
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

type PageSetup = (page: any) => Promise<void>;

/** Record an arbitrary static/animated page for `recordSec`, running an optional setup (e.g. typing). */
async function recordPageBeat(html: string, recordSec: number, recDir: string, chromium: any, setup?: PageSetup, waitUntil: "domcontentloaded" | "networkidle" = "domcontentloaded"): Promise<string> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: CAP_W, height: CAP_H },
    recordVideo: { dir: recDir, size: { width: CAP_W, height: CAP_H } },
  });
  const page = await context.newPage();
  await page.setContent(html, { waitUntil });
  await page.waitForTimeout(500);
  if (setup) await setup(page);
  await page.waitForTimeout(recordSec * 1000);
  const video = page.video();
  await context.close();
  await browser.close();
  return await video!.path();
}

/** Record one TERMINAL beat: live-run each command, stream scrubbed+curated stdout into the page. */
async function recordTerminalBeat(beat: FableBeat, recDir: string, chromium: any): Promise<string> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: CAP_W, height: CAP_H },
    recordVideo: { dir: recDir, size: { width: CAP_W, height: CAP_H } },
  });
  const page = await context.newPage();
  await page.setContent(buildTerminalHtml(beat.stepLabel), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);

  for (const cmd of beat.commands) {
    await page.evaluate(() => (globalThis as any).window.__termPrompt());
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

    const child = spawn("/bin/sh", ["-c", cmd], { cwd: REPO_ROOT_REAL });
    let lineBuf = "";
    const write = (s: string) => {
      if (s) page.evaluate((t: string) => (globalThis as any).window.__termWrite(t), s).catch(() => {});
    };
    const feed = (buf: Buffer) => {
      lineBuf += scrubStreamChunk(buf.toString());
      const nl = lineBuf.lastIndexOf("\n");
      if (nl < 0) return;
      const complete = lineBuf.slice(0, nl + 1);
      lineBuf = lineBuf.slice(nl + 1);
      write(filterPublicLines(complete));
    };
    child.stdout.on("data", feed);
    child.stderr.on("data", feed);
    const code: number = await new Promise((res) => child.on("close", (c) => res(c ?? 0)));
    if (lineBuf) write(filterPublicLines(lineBuf + "\n"));
    if (code !== 0 && beat.n === 3) {
      throw new Error(`captureFable: beat 3 producer "${cmd}" exited ${code} — the real artefacts were not produced.`);
    }
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(800);

  const video = page.video();
  await context.close();
  await browser.close();
  return await video!.path();
}

/** Record the OUTPUT-card viewer (real card as a data URI, Ken-Burns settle on the light output world). */
async function recordViewerCardBeat(beat: FableBeat, cardPath: string, recDir: string, chromium: any): Promise<string> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: CAP_W, height: CAP_H },
    recordVideo: { dir: recDir, size: { width: CAP_W, height: CAP_H } },
  });
  const page = await context.newPage();
  await page.setContent(buildViewerCardHtml(fileToDataUri(cardPath, "image/png"), beat.stepLabel), { waitUntil: "networkidle" });
  await page.waitForTimeout((beat.clipSec + 2) * 1000);
  const video = page.video();
  await context.close();
  await browser.close();
  return await video!.path();
}

/** Record the OUTPUT-video viewer (PLAYS the real produced MP4 over loopback, framed on the output world). */
async function recordViewerVideoBeat(beat: FableBeat, videoUrl: string, recDir: string, chromium: any): Promise<string> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: CAP_W, height: CAP_H },
    recordVideo: { dir: recDir, size: { width: CAP_W, height: CAP_H } },
  });
  const page = await context.newPage();
  await page.setContent(buildViewerVideoHtml(videoUrl, beat.stepLabel), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => { const v = (globalThis as any).document.getElementById("v"); return v && v.currentTime > 0.1; }, { timeout: 8000 });
  await page.waitForTimeout((beat.clipSec + 1) * 1000);
  const video = page.video();
  await context.close();
  await browser.close();
  return await video!.path();
}

/** Transcode a recorded webm → a normalized beat MP4, trimmed to clipSec from the head or tail. */
function transcodeBeatClip(webm: string, outMp4: string, clipSec: number, trim: "head" | "tail"): void {
  const dur = probeRender(webm).videoDurationSec;
  const start = trim === "tail" ? Math.max(0, dur - clipSec) : Math.min(0.4, Math.max(0, dur - clipSec));
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

/** Concat the normalized beat MP4s into the rough SILENT 9:16 cut (concat demuxer; re-encode fallback). */
function concatBeats(beatMp4s: string[], outMp4: string): void {
  const listPath = path.join(path.dirname(outMp4), "_concat-list.txt");
  fs.writeFileSync(listPath, beatMp4s.map((p) => `file '${p}'`).join("\n"), "utf8");
  let { code } = runFfmpeg(["-hide_banner", "-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", outMp4]);
  if (!fs.existsSync(outMp4) || fs.statSync(outMp4).size === 0) {
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
  assertNoCaptionMediaOverlap(); // #824 — embedded output media must clear the LEG-2 caption band

  const { chromium } = await import("playwright");
  const captureDir = path.join(REPO_ROOT_REAL, "out", "capture");
  const reviewDir = path.join(REPO_ROOT_REAL, "out", "review", "fable");
  const recRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fable-rec-"));
  fs.mkdirSync(captureDir, { recursive: true });
  fs.mkdirSync(reviewDir, { recursive: true });

  // loopback static server (serves the real MP4 to the output-video viewer — loopback, no external net)
  const server = http.createServer((req, res) => {
    const fp = path.join(REPO_ROOT_REAL, decodeURIComponent((req.url || "/").split("?")[0]));
    if (!fp.startsWith(REPO_ROOT_REAL) || !fs.existsSync(fp)) { res.writeHead(404); res.end(); return; }
    const ext = path.extname(fp);
    res.writeHead(200, { "Content-Type": ext === ".mp4" ? "video/mp4" : ext === ".png" ? "image/png" : "application/octet-stream" });
    fs.createReadStream(fp).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as any).port;

  const CARD_PATH = path.join(REPO_ROOT_REAL, "out", "image", "card-9x16.png");
  const VIDEO_PATH = path.join(REPO_ROOT_REAL, "out", "review", "lfah", "demo", "demo-9x16.mp4");

  const beats: BeatRecord[] = [];
  const beatMp4s: string[] = [];

  for (const beat of FABLE_BEATS) {
    console.log(`[fable] recording beat ${beat.n} (${beat.kind}) — ${beat.stepLabel || beat.headline || ""}`);
    let webm: string;
    let trim: "head" | "tail" = "head";

    if (beat.kind === "title") {
      webm = await recordPageBeat(buildTitleHtml({ headline: beat.headline!, sub: beat.sub, url: beat.url }), beat.clipSec + 1.0, recRoot, chromium);
    } else if (beat.kind === "chat") {
      webm = await recordPageBeat(buildChatHtml(beat.stepLabel), beat.clipSec + 1.0, recRoot, chromium, async (page) => {
        const req = beat.chatRequest!;
        for (let i = 0; i < req.length; i += 2) {
          await page.evaluate((c: string) => (globalThis as any).window.__chatType(c), req.slice(i, i + 2));
          await page.waitForTimeout(42);
        }
        await page.waitForTimeout(450);
        await page.evaluate(() => (globalThis as any).window.__chatSend());
      });
    } else if (beat.kind === "terminal") {
      webm = await recordTerminalBeat(beat, recRoot, chromium);
      trim = "tail";
    } else if (beat.kind === "transition") {
      if (!fs.existsSync(CARD_PATH)) throw new Error(`captureFable: beat 4 transition needs the real card at out/image/card-9x16.png — beat 3 must run first.`);
      webm = await recordPageBeat(buildTransitionHtml(fileToDataUri(CARD_PATH, "image/png")), beat.clipSec + 1.0, recRoot, chromium, undefined, "networkidle");
    } else if (beat.kind === "viewer-card") {
      if (!fs.existsSync(CARD_PATH)) throw new Error(`captureFable: beat 5 hero card missing at out/image/card-9x16.png — beat 3 must run first.`);
      webm = await recordViewerCardBeat(beat, CARD_PATH, recRoot, chromium);
      trim = "tail";
    } else {
      if (!fs.existsSync(VIDEO_PATH)) throw new Error("captureFable: beat 6 hero MP4 missing — beat 3 (smoke:demo) must run first.");
      webm = await recordViewerVideoBeat(beat, `http://127.0.0.1:${port}/${relOf(VIDEO_PATH)}`, recRoot, chromium);
      trim = "tail";
    }

    const outMp4 = path.join(captureDir, `beat-${String(beat.n).padStart(2, "0")}.mp4`);
    transcodeBeatClip(webm, outMp4, beat.clipSec, trim);
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

  const concatOut = path.join(reviewDir, "fable-rough-silent-9x16.mp4");
  concatBeats(beatMp4s, concatOut);
  const concatProbe = probeRender(concatOut);
  console.log(`[fable] rough silent concat → ${relOf(concatOut)} (${concatProbe.videoFrames} frames, ${concatProbe.videoDurationSec.toFixed(1)}s, ${(fs.statSync(concatOut).size / 1024).toFixed(0)}KB)`);

  const manifest: FableManifest = {
    task: 824, leg: 1, storyboard: "revised-90s-8beat", createdAt: new Date().toISOString(),
    dims: { width: CAP_W, height: CAP_H }, beats, roughConcat: relOf(concatOut),
  };
  const manifestPath = path.join(captureDir, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`[fable] manifest → ${relOf(manifestPath)}`);

  for (const b of beats) assertBrandClean(b.stepLabel);

  fs.rmSync(recRoot, { recursive: true, force: true });
  console.log(`\nFABLE-CAPTURE: ${beats.length} beats captured. manifest=${relOf(manifestPath)} roughConcat=${relOf(concatOut)}`);
}

// ── Entrypoint ───────────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  assertFableBeatsClean(FABLE_BEATS);
  assertNoCaptionMediaOverlap(); // #824 — cross-layer caption/media overlap gate (runs in --dry-run too)
  if (dryRun) {
    const total = FABLE_BEATS.reduce((s, b) => s + b.clipSec, 0);
    console.log(`FABLE-CAPTURE: --dry-run (gates passed: paid-free + brand-clean + owner-clean). 8 beats, ~${total}s:`);
    for (const b of FABLE_BEATS) {
      const what = b.kind === "terminal" ? b.commands.join("  ;  ")
        : b.kind === "chat" ? `chat: "${b.chatRequest}"`
        : b.kind === "title" ? `title: "${b.headline}"${b.sub ? ` / "${b.sub}"` : ""}`
        : `[${b.kind}]`;
      console.log(`  beat ${b.n} (${b.kind}, ~${b.clipSec}s) — ${b.stepLabel || "—"}  ::  ${what}`);
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
