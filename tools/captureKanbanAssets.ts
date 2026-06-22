/**
 * #1120 agent-kanban demo (v2) — capture the RAW BOARD ASSETS (content-pipeline INPUTS, not the deliverable).
 *
 * Produces the real inputs the v2 feature-tour build consumes from agent-kanban's SELF-EXPLAINING card:
 *   • assets/kanban-demo/board-overview.png  — COMMITTED hero still, cols 2–3 (In Progress + In Review), DSF 3.
 *       Beat 6 (verdict-on-face) pan-zoom + beat 5 (role) camera. Prints sha256/bytes/srcW/srcH + the
 *       re-measured ◆ REVIEW · PASS `.ak-phase` ring + the ▶ EXECUTOR `.ak-phase` ring.
 *   • out/capture/kanban/wide-board.png       — gitignored still, ALL 4 columns (beats 2/3 reveal + lanes pan).
 *   • out/capture/kanban/clip-heartbeat.mp4   — DYNAMIC: cols 2–3, the pulsing ▶ WORKING card breathing (beat 4).
 *   • out/capture/kanban/clip-card-move.mp4   — DYNAMIC: cols 2–3, a card LIFTS In Progress → LANDS In Review,
 *       the phase line flips ▶ WORKING → ◆ REVIEW · PASS on land (beat 7 — the causal move).
 *   • out/capture/kanban/clip-drawer-open.mp4 — DYNAMIC: tap a card → the timeline drawer SLIDES OPEN; settles
 *       on the role ledger + verdict pills. Prints the .ak-pipeline + .ak-verdict union for the beat-8 ring.
 *
 * Requires the agent-kanban dev server up at http://localhost:3210 (PORT=3210 npm run dev in that repo) serving
 * the BRAND-SAFE demo board. This tool PLACES the committed `assets/kanban-demo/demo-board.json` fixture into
 * agent-kanban's data/board.json (after backing up + restoring the user's REAL board, byte-verified) and rebases
 * its timestamps to "now" so the live session breathes — so a re-run never films the operator's private board.
 *
 * MOTION PROOF: each dynamic clip emits a ≥6-frame strip under out/review/kanban/strip-<clip>/ and prints the
 * per-frame md5 so the orchestrator can verify the frames are DISTINCT (real motion, not a static pan).
 *
 * Uses THIS repo's playwright + the vendored ffmpeg. out/ is gitignored; the overview PNG is committed.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import { spawnSync } from "child_process";

import { resolveVendoredFfmpeg, probeRender } from "../video/renderProbe";
import { KANBAN_PICKER_CLIP, KANBAN_HEARTBEAT_CLIP, KANBAN_CARD_CLIP, KANBAN_DRAWER_CLIP } from "../video/kanbanStoryboard";
import { requireApprovedStoryboard } from "../video/storyboardGate";
import { assertNoStripSlice } from "./captureSafety";

/* eslint-disable @typescript-eslint/no-explicit-any */

const BOARD_URL = "http://localhost:3210/";
// agent-kanban repo location: override with KANBAN_REPO, else default under the user's home (no hardcoded
// user/home path in a PUBLIC repo).
const KANBAN_REPO = process.env.KANBAN_REPO || path.join(os.homedir(), "coding_projects", "agent-kanban");
const BOARD_JSON = path.join(KANBAN_REPO, "data", "board.json");
const REPO_ROOT = fs.realpathSync(process.cwd());
const ASSET_DIR = path.join(REPO_ROOT, "assets", "kanban-demo");
const DEMO_BOARD_FIXTURE = path.join(ASSET_DIR, "demo-board.json");
const CLIP_DIR = path.join(REPO_ROOT, "out", "capture", "kanban");
const STRIP_DIR = path.join(REPO_ROOT, "out", "review", "kanban");

// Hero still (committed, beat 6): cols 2–3 (In Progress + In Review), DSF 3 → 2700×3900.
const VW = 900;
const VH = 1050;
const DSF = 3;
// Wide-board still (beats 2/3): all 4 columns, DSF 2 → 2160×2560.
const WIDE_VW = 1080;
const WIDE_VH = 1280;
const WIDE_DSF = 2;
// Dynamic-clip recording geometry (recordVideo `size` MUST equal the viewport CSS size).
const PICKER_W = KANBAN_PICKER_CLIP.w;
const PICKER_H = KANBAN_PICKER_CLIP.h;
const HEART_W = KANBAN_HEARTBEAT_CLIP.w;
const HEART_H = KANBAN_HEARTBEAT_CLIP.h;
const CARD_W = KANBAN_CARD_CLIP.w;
const CARD_H = KANBAN_CARD_CLIP.h;
const DRAWER_W = KANBAN_DRAWER_CLIP.w;
const DRAWER_H = KANBAN_DRAWER_CLIP.h;

// COLS 2–3 framing — show exactly In Progress + In Review (hide To Do + Done) at 50% each, so the captured
// board NEVER slices a partial column at the frame edge. The face-VERDICT renders only for in_review/done, so
// every verdict beat frames In Progress + In Review (never cols 1–2). Capture-time FRAMING only; ticket DATA
// is 100% the live board.
// #1120 clip-fix: zero the strip's horizontal PADDING (16px 14px left a 24px right overflow at 900px) so
// 2×(50% − 8) + 12px gap = 896 ≤ 900 — the 2 columns sit FLUSH, no L/R overflow. Combined with a scrollLeft=0
// reset (assertNoStripSlice, applied in EVERY board capture) this kills the stale-88vw-snap left-edge "haircut".
const TWO_COL_CSS =
  ".ak-strip{overflow-x:hidden !important;scroll-snap-type:none !important;padding-left:0 !important;padding-right:0 !important}" +
  ".ak-col{flex:0 0 calc(50% - 8px) !important;scroll-snap-align:none !important}" +
  ".ak-col:nth-child(1),.ak-col:nth-child(4){display:none !important}";
// WIDE framing — all 4 columns contained at 25% each (the reveal + lanes-pan establishing shots).
const WIDE_COL_CSS =
  ".ak-strip{overflow-x:hidden !important;scroll-snap-type:none !important;padding-left:0 !important;padding-right:0 !important}" +
  ".ak-col{flex:0 0 calc(25% - 6px) !important;scroll-snap-align:none !important}";

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function ffmpegEnv(dir: string): NodeJS.ProcessEnv {
  return process.platform === "darwin" ? { ...process.env, DYLD_FALLBACK_LIBRARY_PATH: dir } : { ...process.env };
}

/** Transcode a recorded webm → an even-dimension mp4 (no scaling — preserve the board aspect). */
function transcodeClip(webm: string, outMp4: string): void {
  const { bin, dir } = resolveVendoredFfmpeg();
  const r = spawnSync(
    bin,
    [
      "-hide_banner", "-y", "-i", webm,
      "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-r", "30", "-pix_fmt", "yuv420p",
      "-c:v", "libx264", "-profile:v", "high", "-preset", "veryfast", "-crf", "20",
      "-movflags", "+faststart", "-an", outMp4,
    ],
    { env: ffmpegEnv(dir), encoding: "utf8", maxBuffer: 128 * 1024 * 1024 },
  );
  if (!fs.existsSync(outMp4) || fs.statSync(outMp4).size === 0) {
    throw new Error(`captureKanbanAssets: transcode produced no output (exit ${r.status}) for ${webm}`);
  }
}

/** MOTION PROOF — extract `count` evenly-spread frames from a clip → a strip dir, print per-frame md5 so the
 *  orchestrator can verify the frames are DISTINCT (real motion). Returns the md5 list. */
function proofStrip(mp4: string, label: string, count = 6): string[] {
  const { bin, dir } = resolveVendoredFfmpeg();
  const dur = probeRender(mp4).videoDurationSec || 1;
  const outDir = path.join(STRIP_DIR, `strip-${label}`);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const md5s: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = ((i + 0.5) / count) * dur;
    const frame = path.join(outDir, `frame-${String(i).padStart(2, "0")}.png`);
    spawnSync(bin, ["-hide_banner", "-y", "-ss", t.toFixed(2), "-i", mp4, "-frames:v", "1", frame],
      { env: ffmpegEnv(dir), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    md5s.push(fs.existsSync(frame) ? crypto.createHash("md5").update(fs.readFileSync(frame)).digest("hex") : "MISSING");
  }
  const distinct = new Set(md5s).size;
  console.log(`[motion-proof:${label}] ${count} frames → ${path.relative(REPO_ROOT, outDir)}  (${distinct}/${count} DISTINCT)`);
  md5s.forEach((m, i) => console.log(`  frame-${String(i).padStart(2, "0")}.png  md5=${m}`));
  if (distinct < 4) console.log(`[motion-proof:${label}] ⚠ FEWER than 4 distinct frames — motion NOT proven for ${label}.`);
  return md5s;
}

/** Normalized box (0..1) of a rect inside a clip window. */
function normBox(rect: { x: number; y: number; w: number; h: number }, clip: { x: number; y: number; width: number; height: number }) {
  return {
    sx: Number(((rect.x - clip.x) / clip.width).toFixed(4)),
    sy: Number(((rect.y - clip.y) / clip.height).toFixed(4)),
    sw: Number((rect.w / clip.width).toFixed(4)),
    sh: Number((rect.h / clip.height).toFixed(4)),
  };
}

/** Hide the Next.js dev-mode indicator (the bottom-left "N" portal) so no dev chrome reaches a public frame. */
async function hideDevChrome(page: any): Promise<void> {
  await page.addStyleTag({
    content:
      "nextjs-portal,#__next-build-watcher,[data-nextjs-toast],[data-next-badge],[data-next-badge-root],[data-nextjs-dev-tools-button]{display:none !important;visibility:hidden !important;opacity:0 !important;pointer-events:none !important}",
  }).catch(() => {});
}

async function rectOf(page: any, sel: string): Promise<{ x: number; y: number; w: number; h: number } | null> {
  return await page.evaluate((s: string) => {
    const el = (globalThis as any).document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, sel);
}

/** Place the BRAND-SAFE demo board into agent-kanban's data/board.json, rebasing timestamps to "now" so the
 *  live session breathes. Backs up the user's REAL board bytes and returns them (or null) for restoration. */
function placeDemoBoard(): Buffer | null {
  const real = fs.existsSync(BOARD_JSON) ? fs.readFileSync(BOARD_JSON) : null;
  const board = JSON.parse(fs.readFileSync(DEMO_BOARD_FIXTURE, "utf8"));
  const now = Date.now();
  const maxU = Math.max(...board.tickets.map((t: any) => t.updatedAt));
  for (const t of board.tickets) t.updatedAt = now - (maxU - t.updatedAt);
  for (const s of board.sessions) s.lastActive = now - (maxU - s.lastActive);
  board.generatedAt = now;
  fs.mkdirSync(path.dirname(BOARD_JSON), { recursive: true });
  fs.writeFileSync(BOARD_JSON, JSON.stringify(board, null, 2));
  console.log(`[demo-board] placed brand-safe demo board → ${BOARD_JSON} (${board.tickets.length} tickets, live session, timestamps rebased to now)`);
  return real;
}

async function main(): Promise<void> {
  // #1120 Leg 0 — refuse to capture until an approved storyboard exists for this post (design-first).
  requireApprovedStoryboard("agent-kanban-demo");
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  fs.mkdirSync(CLIP_DIR, { recursive: true });
  fs.mkdirSync(STRIP_DIR, { recursive: true });
  // `--clips-only` re-captures ONLY the dynamic mp4s + the gitignored stills and leaves the committed hero
  // still untouched (re-capturing it changes its sha256 → breaks the provenance test).
  const clipsOnly = process.argv.includes("--clips-only");
  const { chromium } = await import("playwright");
  const recRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanban-assets-"));

  // Place the brand-safe demo board; restore the user's REAL board in the OUTER finally (byte-verified).
  const realBoardBytes = placeDemoBoard();

  try {
  // ── 1. board-overview.png (committed hero, beats 5/6) — cols 2–3, ring ◆ REVIEW · PASS + ▶ EXECUTOR ──
  const OVERVIEW_CLIP = { x: 0, y: 0, width: VW, height: VH };
  if (!clipsOnly) {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DSF });
    const page = await ctx.newPage();
    await page.goto(BOARD_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await hideDevChrome(page);
    await page.addStyleTag({ content: TWO_COL_CSS }).catch(() => {}); // cols 2–3, no L/R slice
    await page.waitForTimeout(500); // let the flex re-layout settle before measuring rings + screenshot
    await assertNoStripSlice(page, VW); // #1120 clip-fix: kill the stale 88vw scrollLeft before measuring/shooting
    // NOTE: no nested named function / `const f = () =>` inside page.evaluate — tsx/esbuild keepNames injects a
    // `__name(...)` helper around them which does NOT exist in the browser context (ReferenceError __name).
    const boxes = await page.evaluate(() => {
      const doc = (globalThis as any).document;
      const phases = Array.prototype.slice.call(doc.querySelectorAll(".ak-phase")) as any[];
      let review: any = null;
      let exec: any = null;
      for (let i = 0; i < phases.length; i++) {
        const t = phases[i].textContent || "";
        if (!review && /◆\s*REVIEW/.test(t)) review = phases[i];
        if (!exec && /EXECUTOR/.test(t)) exec = phases[i];
      }
      const live = doc.querySelector(".ak-phase--live");
      const epicEl = doc.querySelector(".ak-tag--parent") || doc.querySelector(".ak-tag--epic");
      const rb = review ? review.getBoundingClientRect() : null;
      const eb = exec ? exec.getBoundingClientRect() : null;
      const lb = live ? live.getBoundingClientRect() : null;
      const pb = epicEl ? epicEl.getBoundingClientRect() : null;
      return {
        review: rb ? { x: rb.x, y: rb.y, w: rb.width, h: rb.height } : null,
        exec: eb ? { x: eb.x, y: eb.y, w: eb.width, h: eb.height } : null,
        live: lb ? { x: lb.x, y: lb.y, w: lb.width, h: lb.height } : null,
        epic: pb ? { x: pb.x, y: pb.y, w: pb.width, h: pb.height } : null,
        reviewText: review ? review.textContent : null,
        execText: exec ? exec.textContent : null,
        epicText: epicEl ? epicEl.textContent : null,
      };
    });
    const out = path.join(ASSET_DIR, "board-overview.png");
    await page.screenshot({ path: out, clip: OVERVIEW_CLIP });
    await ctx.close();
    await browser.close();
    const buf = fs.readFileSync(out);
    console.log(`\n[overview] ${path.relative(REPO_ROOT, out)} bytes=${buf.length} sha256=${sha256(buf)}`);
    console.log(`[overview] srcW=${OVERVIEW_CLIP.width * DSF} srcH=${OVERVIEW_CLIP.height * DSF}`);
    if (boxes.review) console.log(`[overview] BEAT-6 ring (◆ REVIEW) .ak-phase "${boxes.reviewText}" => ${JSON.stringify(normBox(boxes.review, OVERVIEW_CLIP))}`);
    else console.log(`[overview] WARN: ◆ REVIEW phase line NOT found — beat-6 ring NOT measured`);
    if (boxes.exec) console.log(`[overview] BEAT-8 ring (▶ EXECUTOR) .ak-phase "${boxes.execText}" => ${JSON.stringify(normBox(boxes.exec, OVERVIEW_CLIP))}`);
    else console.log(`[overview] WARN: ▶ EXECUTOR phase line NOT found — beat-8 ring NOT measured`);
    if (boxes.epic) console.log(`[overview] BEAT-10 ring (parent epic) .ak-tag "${boxes.epicText}" => ${JSON.stringify(normBox(boxes.epic, OVERVIEW_CLIP))}`);
    else console.log(`[overview] WARN: parent/epic chip NOT found in cols 2–3 — beat-10 ring NOT measured (add a "[#NNNN] " subject prefix to a cols-2–3 ticket)`);
  }

  // ── 2. wide-board.png (gitignored, beats 2/3) — ALL 4 columns contained ─────────────────────────────
  {
    const WIDE_CLIP = { x: 0, y: 0, width: WIDE_VW, height: WIDE_VH };
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: WIDE_VW, height: WIDE_VH }, deviceScaleFactor: WIDE_DSF });
    const page = await ctx.newPage();
    await page.goto(BOARD_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await hideDevChrome(page);
    await page.addStyleTag({ content: WIDE_COL_CSS }).catch(() => {}); // all 4 columns contained
    await page.waitForTimeout(500);
    await assertNoStripSlice(page, WIDE_VW); // #1120 clip-fix
    const out = path.join(CLIP_DIR, "wide-board.png");
    await page.screenshot({ path: out, clip: WIDE_CLIP });
    await ctx.close();
    await browser.close();
    const buf = fs.readFileSync(out);
    console.log(`\n[wide-board] ${path.relative(REPO_ROOT, out)} bytes=${buf.length} srcW=${WIDE_VW * WIDE_DSF} srcH=${WIDE_VH * WIDE_DSF}`);
  }

  // ── 3. clip-session-picker.mp4 (beat 5) — cols 2–3, OPEN the session picker dropdown (the session list IS
  // the feature) → DWELL with it open over the active board. The dropdown-open is the MOTION. ───────────────
  {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({
      viewport: { width: PICKER_W, height: PICKER_H },
      deviceScaleFactor: 2,
      recordVideo: { dir: recRoot, size: { width: PICKER_W, height: PICKER_H } },
    });
    const page = await ctx.newPage();
    await page.goto(BOARD_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(2400); // establish on the ACTIVE board first (clip plays ONCE)
    await hideDevChrome(page);
    await page.addStyleTag({ content: TWO_COL_CSS }).catch(() => {});
    await page.waitForTimeout(500);
    await assertNoStripSlice(page, PICKER_W); // #1120 clip-fix
    await page.click(".ak-picker__btn").catch(() => {}); // the dropdown VISIBLY opens (the feature)
    await page.waitForTimeout(900);
    const menu = await page.evaluate(() => {
      const m = (globalThis as any).document.querySelector(".ak-picker__menu");
      const opts = Array.prototype.slice.call((globalThis as any).document.querySelectorAll(".ak-picker__opt")) as any[];
      return { open: !!m, count: opts.length, first: opts[0]?.textContent ?? null };
    });
    await page.waitForTimeout(9000); // DWELL with the session list open over the active board
    const video = page.video();
    await ctx.close();
    await browser.close();
    const webm = await video!.path();
    const out = path.join(CLIP_DIR, "clip-session-picker.mp4");
    transcodeClip(webm, out);
    console.log(`\n[picker] dropdown open (menu=${menu.open}, ${menu.count} sessions, top="${menu.first}") → ${path.relative(REPO_ROOT, out)}`);
    proofStrip(out, "session-picker");
  }

  // ── 4. clip-heartbeat.mp4 (beat 7) — cols 2–3, the pulsing ▶ WORKING focus card breathing ───────────
  {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({
      viewport: { width: HEART_W, height: HEART_H },
      deviceScaleFactor: 2,
      recordVideo: { dir: recRoot, size: { width: HEART_W, height: HEART_H } },
    });
    const page = await ctx.newPage();
    await page.goto(BOARD_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(1800);
    await hideDevChrome(page);
    await page.addStyleTag({ content: TWO_COL_CSS }).catch(() => {});
    await page.waitForTimeout(500);
    await assertNoStripSlice(page, HEART_W); // #1120 clip-fix
    const liveText = await page.evaluate(() => (globalThis as any).document.querySelector(".ak-phase--live")?.textContent ?? null);
    await page.waitForTimeout(6000); // DWELL on the breathing ▶ WORKING card (pulse cycle = 1.7s → ~3.5 cycles)
    const video = page.video();
    await ctx.close();
    await browser.close();
    const webm = await video!.path();
    const out = path.join(CLIP_DIR, "clip-heartbeat.mp4");
    transcodeClip(webm, out);
    console.log(`\n[heartbeat] cols 2–3, live pill "${liveText}" breathing → ${path.relative(REPO_ROOT, out)}`);
    proofStrip(out, "heartbeat");
  }

  // ── 4. clip-card-move.mp4 (beat 7) — mover LIFTS In Progress → LANDS In Review, phase flips on land ──
  // The mover = the in_progress card carrying a PRE-BAKED execution-review PASS comment but NO work-role
  // comment (so it reads ▶ WORKING in progress; on flipping to in_review the pre-baked PASS surfaces as
  // ◆ REVIEW · PASS — the verdict appears CAUSALLY on land). board.json restored to pre-mutation bytes here;
  // the user's REAL board is restored in the OUTER finally.
  const preMoveBytes = fs.readFileSync(BOARD_JSON);
  const preMoveSha = sha256(preMoveBytes);
  try {
    const board = JSON.parse(preMoveBytes.toString("utf8"));
    const mover = board.tickets.find(
      (t: any) => t.column === "in_progress"
        && t.comments.some((c: any) => c.role === "execution-review" && c.verdict)
        && !t.comments.some((c: any) => c.role === "planner" || c.role === "executor"),
    );
    if (!mover) throw new Error("captureKanbanAssets: no in_progress mover (execution-review PASS, no work-role) in the demo board.");
    console.log(`\n[card-move] mover ticket #${mover.id} (${mover.column}) — pre-baked execution-review PASS`);

    // Pre-bump the mover to the TOP of In Progress (focus → ▶ WORKING breathing, loads on-screen at the head).
    {
      const b = JSON.parse(fs.readFileSync(BOARD_JSON, "utf8"));
      const t = b.tickets.find((x: any) => x.id === mover.id);
      t.updatedAt = Date.now();
      fs.writeFileSync(BOARD_JSON, JSON.stringify(b, null, 2));
    }

    const cardSel = `button[aria-label^="Open ticket #${mover.id}:"]`;
    const browser = await chromium.launch();
    const ctx = await browser.newContext({
      viewport: { width: CARD_W, height: CARD_H },
      deviceScaleFactor: 2,
      recordVideo: { dir: recRoot, size: { width: CARD_W, height: CARD_H } },
    });
    const page = await ctx.newPage();
    await page.goto(BOARD_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await hideDevChrome(page);
    await page.addStyleTag({ content: TWO_COL_CSS }).catch(() => {});
    await page.waitForTimeout(2600); // establish: In Progress + In Review side by side, mover ▶ WORKING at top
    await assertNoStripSlice(page, CARD_W); // #1120 clip-fix
    const beforeRect = await rectOf(page, cardSel);

    // Flip ONLY the column → in_review (updatedAt=now → top of In Review). The 1500ms poll animates the cross
    // and the phase line flips ▶ WORKING → ◆ REVIEW · PASS on land.
    {
      const b = JSON.parse(fs.readFileSync(BOARD_JSON, "utf8"));
      const t = b.tickets.find((x: any) => x.id === mover.id);
      t.column = "in_review";
      t.updatedAt = Date.now();
      fs.writeFileSync(BOARD_JSON, JSON.stringify(b, null, 2));
    }
    await page.waitForTimeout(3200); // poll (1500ms) + 0.7s lift + 2s arrival glow, held to read the flip
    const afterRect = await rectOf(page, cardSel);
    await page.waitForTimeout(5200); // dwell on the landed ◆ REVIEW · PASS card at top of In Review
    const video = page.video();
    await ctx.close();
    await browser.close();
    const webm = await video!.path();
    const out = path.join(CLIP_DIR, "clip-card-move.mp4");
    transcodeClip(webm, out);
    console.log(`[card-move] #${mover.id} lifted In Progress → landed In Review (cols 2–3) → ${path.relative(REPO_ROOT, out)}`);
    console.log(`[card-move] mover rect before(In Progress)=${JSON.stringify(beforeRect)} after(In Review)=${JSON.stringify(afterRect)} (x should shift toward the right column)`);
    proofStrip(out, "card-move");
  } finally {
    fs.writeFileSync(BOARD_JSON, preMoveBytes);
    const afterSha = sha256(fs.readFileSync(BOARD_JSON));
    if (afterSha !== preMoveSha) throw new Error(`captureKanbanAssets: card-move board restore FAILED (sha ${afterSha} != ${preMoveSha}).`);
    console.log(`[card-move] board restored to pre-move bytes (sha ${afterSha.slice(0, 12)}… verified)`);
  }

  // ── 5. clip-drawer-open.mp4 (beat 8) — tap the In Review PASS card → drawer SLIDES OPEN → settle ─────
  {
    const DRAWER_VIEWPORT = { x: 0, y: 0, width: DRAWER_W, height: DRAWER_H };
    const browser = await chromium.launch();
    const ctx = await browser.newContext({
      viewport: { width: DRAWER_W, height: DRAWER_H },
      deviceScaleFactor: 2,
      recordVideo: { dir: recRoot, size: { width: DRAWER_W, height: DRAWER_H } },
    });
    const page = await ctx.newPage();
    await page.goto(BOARD_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(2400); // establish on the live board BEFORE the tap (clip plays ONCE)
    await hideDevChrome(page);
    // Tap the In Review card with the richest ledger (4 roles + verdict pills). Fall back to any ticket.
    const richSel = 'button[aria-label^="Open ticket #2005:"]';
    const hasRich = await page.evaluate((s) => !!(globalThis as any).document.querySelector(s), richSel);
    await page.click(hasRich ? richSel : "button[aria-label^='Open ticket #']");
    await page.waitForTimeout(1300); // drawer slide/spring open + settle
    const pipeRect = await rectOf(page, ".ak-pipeline");
    const verdicts = await page.evaluate(() => {
      const els = [...(globalThis as any).document.querySelectorAll(".ak-verdict")] as any[];
      if (els.length === 0) return null;
      const rs = els.map((e) => e.getBoundingClientRect());
      const x = Math.min(...rs.map((r) => r.x));
      const y = Math.min(...rs.map((r) => r.y));
      const right = Math.max(...rs.map((r) => r.x + r.width));
      const bottom = Math.max(...rs.map((r) => r.y + r.height));
      return { x, y, w: right - x, h: bottom - y, count: els.length, texts: els.map((e) => e.textContent) };
    });
    // BEAT-12 still — screenshot the SETTLED open drawer (the multi-colored verdict pills) for the pan-zoom
    // still beat. Gitignored (not byte-checked); its srcW/srcH = DRAWER_W/H × DSF 2.
    const stillOut = path.join(CLIP_DIR, "drawer-verdicts.png");
    await page.screenshot({ path: stillOut, clip: DRAWER_VIEWPORT });
    await page.waitForTimeout(3400); // hold the settled drawer (dwell before the beat-11 clip end)
    const video = page.video();
    await ctx.close();
    await browser.close();
    const webm = await video!.path();
    const out = path.join(CLIP_DIR, "clip-drawer-open.mp4");
    transcodeClip(webm, out);
    console.log(`\n[drawer-open] tapped ${hasRich ? "#2005" : "first ticket"} → drawer opened → ${path.relative(REPO_ROOT, out)}`);
    const stillBuf = fs.readFileSync(stillOut);
    console.log(`[drawer-verdicts] still ${path.relative(REPO_ROOT, stillOut)} bytes=${stillBuf.length} srcW=${DRAWER_W * 2} srcH=${DRAWER_H * 2}`);
    if (pipeRect && verdicts) {
      const x = Math.min(pipeRect.x, verdicts.x);
      const y = Math.min(pipeRect.y, verdicts.y);
      const right = Math.max(pipeRect.x + pipeRect.w, verdicts.x + verdicts.w);
      const bottom = Math.max(pipeRect.y + pipeRect.h, verdicts.y + verdicts.h);
      const union = { x, y, w: right - x, h: bottom - y };
      console.log(`[drawer-open] .ak-verdict x${verdicts.count} texts=${JSON.stringify(verdicts.texts)}`);
      console.log(`[drawer-verdicts] BEAT-12 ring (normalized over ${DRAWER_W}x${DRAWER_H}) => ${JSON.stringify(normBox(union, DRAWER_VIEWPORT))}`);
    } else {
      console.log(`[drawer-open] WARN: pipeline/verdict not found (pipe=${!!pipeRect} verdicts=${!!verdicts}) — beat-12 ring NOT measured`);
    }
    proofStrip(out, "drawer-open");
  }
  } finally {
    // RESTORE the user's REAL board.json (byte-exact) — or remove the demo board if there was none.
    if (realBoardBytes) {
      fs.writeFileSync(BOARD_JSON, realBoardBytes);
      const afterSha = sha256(fs.readFileSync(BOARD_JSON));
      if (afterSha !== sha256(realBoardBytes)) throw new Error("captureKanbanAssets: REAL board restore FAILED.");
      console.log(`\n[restore] user's REAL data/board.json restored (sha ${afterSha.slice(0, 12)}… verified)`);
    } else {
      fs.rmSync(BOARD_JSON, { force: true });
      console.log(`\n[restore] no prior board.json — demo board removed`);
    }
    fs.rmSync(recRoot, { recursive: true, force: true });
  }

  console.log("\nKANBAN-ASSETS: done — 1 committed hero still + 1 wide still + 3 dynamic clips + motion strips.");
}

main().catch((err) => {
  console.error("KANBAN-ASSETS FAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
