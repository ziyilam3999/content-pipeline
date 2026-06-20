/**
 * #1046 agent-kanban demo — capture the RAW BOARD ASSETS (content-pipeline INPUTS, not the deliverable).
 *
 * Produces the four real inputs the kanban demo build consumes:
 *   • assets/kanban-demo/board-overview.png  — high-res still of the live board (beat 6 pan-zoom; ring .ak-live)
 *   • out/capture/kanban/clip-session-picker.mp4 — dynamic capture: open picker → switch to an idle session →
 *                                              board changes + LIVE→IDLE (beat 5 viewer-video)
 *   • out/capture/kanban/clip-drawer-open.mp4 — dynamic capture: board → tap #1053 → drawer SLIDES OPEN →
 *                                              settle on .ak-pipeline + .ak-verdict pills (beat 8 viewer-video).
 *                                              Prints the SETTLED pipeline+verdict union box for the beat-8 ring.
 *   • out/capture/kanban/clip-card-move.mp4  — dynamic capture: a card advancing todo→in_progress→in_review→done
 *                                              via the 1500ms poll (beat 7 viewer-video)
 *
 * Requires the agent-kanban dev server up at http://localhost:3210 (PORT=3210 npm run dev in that repo).
 * Uses THIS repo's playwright. High res: deviceScaleFactor 3, mobile viewport 390x844 (overview still);
 * the dynamic clips use their own per-beat capture viewports.
 *
 * board.json safety: the card-move capture mutates agent-kanban's data/board.json, then RESTORES it to the
 * EXACT original bytes (sha256-verified) in a finally block. The overview/drawer-open captures only READ.
 *
 * Prints the MEASURED normalized highlight boxes (sx/sy/sw/sh) for the ringed elements so they can be baked
 * into video/kanbanStoryboard.ts. out/ is gitignored; the overview PNG is committed.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";
import { spawnSync } from "child_process";

import { resolveVendoredFfmpeg } from "../video/renderProbe";
import { KANBAN_PICKER_CLIP, KANBAN_CARD_CLIP, KANBAN_DRAWER_CLIP } from "../video/kanbanStoryboard";

/* eslint-disable @typescript-eslint/no-explicit-any */

const BOARD_URL = "http://localhost:3210/";
const KANBAN_REPO = "/Users/ansonlam/coding_projects/agent-kanban";
const BOARD_JSON = path.join(KANBAN_REPO, "data", "board.json");
const REPO_ROOT = fs.realpathSync(process.cwd());
const ASSET_DIR = path.join(REPO_ROOT, "assets", "kanban-demo");
const CLIP_DIR = path.join(REPO_ROOT, "out", "capture", "kanban");

const VW = 390;
const VH = 844;
const DSF = 3;
// Dynamic-clip recording geometry. recordVideo `size` MUST equal the viewport CSS size — if `size` is larger
// than the viewport, Playwright paints the page into the TOP-LEFT and leaves the rest GRAY (the #1046 defect).
// dsf 2 renders the page sharp, downsampled to `size`.
//
// PICKER clip (beat 5): PORTRAIT (≈ 9:16), width < 640 so the board keeps its MOBILE layout — the picker
// button + dropdown menu sit at the TOP and must NOT be cropped when framed inset (defect-1 fix).
const PICKER_W = KANBAN_PICKER_CLIP.w;
const PICKER_H = KANBAN_PICKER_CLIP.h;
// CARD-MOVE clip (beat 7): DESKTOP width (≥ 1024 → the board's 4-up grid, all four columns side by side) and
// LANDSCAPE, so a card advancing column-to-column visibly LEAVES one column and ARRIVES in the next on screen
// (defect-2 fix — in the mobile single-column view the destination columns are off-screen).
const CARD_W = KANBAN_CARD_CLIP.w;
const CARD_H = KANBAN_CARD_CLIP.h;
// DRAWER-OPEN clip (beat 8): PORTRAIT mobile so the full deep-timeline drawer (header → pipeline → verdict
// pills) is visible uncropped. The clip captures board → tap #1053 → drawer SLIDES OPEN → settle, and we
// MEASURE the settled pipeline+verdict-pills union box (normalized over this clip) for the elaboration ring.
const DRAWER_W = KANBAN_DRAWER_CLIP.w;
const DRAWER_H = KANBAN_DRAWER_CLIP.h;

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function ffmpegEnv(dir: string): NodeJS.ProcessEnv {
  return process.platform === "darwin" ? { ...process.env, DYLD_FALLBACK_LIBRARY_PATH: dir } : { ...process.env };
}

/** Transcode a recorded webm → an even-dimension mp4 (no scaling — preserve the mobile board aspect). */
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

async function main(): Promise<void> {
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  fs.mkdirSync(CLIP_DIR, { recursive: true });
  // `--clips-only` re-captures ONLY the two dynamic mp4s and leaves the committed stills untouched (the stills
  // carry wall-clock "Xm ago" timestamps → re-capturing them would change their sha256 + break the provenance test).
  const clipsOnly = process.argv.includes("--clips-only");
  const { chromium } = await import("playwright");
  const recRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kanban-assets-"));

  // ── 1. board-overview.png (still for beat 6) — top of the live board, ring .ak-live ────────────────
  // Clip height MUST NOT exceed the viewport height (VH) — a non-fullPage screenshot clip is CLAMPED to the
  // viewport, so height:1180 silently produced an 844-tall (VH) image while the log/storyboard recorded 1180
  // (×DSF=3540) → the beat-6 ring normalized against a phantom height landed ~40% too high (#1046). Keep clip
  // height == VH so the saved PNG, the logged srcH, and the measured normBox all agree.
  const OVERVIEW_CLIP = { x: 0, y: 0, width: VW, height: VH };
  if (!clipsOnly) {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DSF });
    const page = await ctx.newPage();
    await page.goto(BOARD_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await hideDevChrome(page);
    const liveRect = await rectOf(page, ".ak-live");
    const out = path.join(ASSET_DIR, "board-overview.png");
    await page.screenshot({ path: out, clip: OVERVIEW_CLIP });
    await ctx.close();
    await browser.close();
    const buf = fs.readFileSync(out);
    console.log(`\n[overview] ${path.relative(REPO_ROOT, out)} bytes=${buf.length} sha256=${sha256(buf)}`);
    console.log(`[overview] srcW=${OVERVIEW_CLIP.width * DSF} srcH=${OVERVIEW_CLIP.height * DSF}`);
    if (liveRect) console.log(`[overview] .ak-live highlight ${JSON.stringify(normBox(liveRect, OVERVIEW_CLIP))}`);
  }

  // ── 2. clip-drawer-open.mp4 (beat 8) — board → tap #1053 → drawer SLIDES OPEN → settle on pipeline+pills ──
  // #1046 v3 fix-3: the v2 beat 8 cut to a PRE-OPEN drawer still (it "appeared from nowhere"). This captures
  // the real tap→open MOTION; we then MEASURE the settled pipeline+verdict-pills union box (normalized over
  // this clip's 600×1066 window) so the beat-8 elaboration ring lands exactly on the pills.
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
    await page.waitForTimeout(2600); // establish on the live board BEFORE the tap (clip plays ONCE)
    await hideDevChrome(page);
    // Tap #1053 (the demo's own ticket — it carries real verdict pills: APPROVE-WITH-NOTES, PASS). Auto-scrolls
    // it into view, then the drawer springs open. Fall back to any ticket if #1053 isn't present.
    const sel1053 = 'button[aria-label^="Open ticket #1053:"]';
    const has1053 = await page.evaluate((s) => !!(globalThis as any).document.querySelector(s), sel1053);
    await page.click(has1053 ? sel1053 : "button[aria-label^='Open ticket #']");
    await page.waitForTimeout(1200); // drawer slide/spring open + settle
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
    await page.waitForTimeout(3200); // hold the settled drawer (so the played clip dwells on it before the ring)
    const video = page.video();
    await ctx.close();
    await browser.close();
    const webm = await video!.path();
    const out = path.join(CLIP_DIR, "clip-drawer-open.mp4");
    transcodeClip(webm, out);
    console.log(`\n[drawer-open] tapped ${has1053 ? "#1053" : "first ticket"} → drawer opened → ${path.relative(REPO_ROOT, out)}`);
    if (pipeRect && verdicts) {
      const x = Math.min(pipeRect.x, verdicts.x);
      const y = Math.min(pipeRect.y, verdicts.y);
      const right = Math.max(pipeRect.x + pipeRect.w, verdicts.x + verdicts.w);
      const bottom = Math.max(pipeRect.y + pipeRect.h, verdicts.y + verdicts.h);
      const union = { x, y, w: right - x, h: bottom - y };
      console.log(`[drawer-open] .ak-verdict x${verdicts.count} texts=${JSON.stringify(verdicts.texts)}`);
      console.log(`[drawer-open] pipeline+verdict union rect=${JSON.stringify(union)}`);
      console.log(`[drawer-open] BEAT-8 highlight (normalized over ${DRAWER_W}x${DRAWER_H}) => ${JSON.stringify(normBox(union, DRAWER_VIEWPORT))}`);
    } else {
      console.log(`[drawer-open] WARN: pipeline/verdict not found (pipe=${!!pipeRect} verdicts=${!!verdicts}) — beat-8 ring box NOT measured`);
    }
  }

  // ── 3. clip-session-picker.mp4 (beat 5) — establish on the ACTIVE full board → OPEN the dropdown (the
  // session list IS the feature) → DWELL with it open over the active board. #1071 fix (operator 2026-06-20):
  // the v3 capture SWITCHED to the busiest non-live session, but that is only a 3-ticket IDLE session → the
  // board settled near-empty ("large device, mostly empty black"). We no longer switch — we demonstrate the
  // picker by opening the dropdown over the ACTIVE (~86-ticket) board and holding it open, so the final
  // frame is the full board + the open session list, never the barren idle session. The idle state is beat
  // 6's job. The dropdown-open MOTION is preserved (it visibly opens, as in v3).
  {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({
      viewport: { width: PICKER_W, height: PICKER_H },
      deviceScaleFactor: 2,
      recordVideo: { dir: recRoot, size: { width: PICKER_W, height: PICKER_H } },
    });
    const page = await ctx.newPage();
    await page.goto(BOARD_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(2800); // establish on the LIVE/ACTIVE (full) board first (clip plays ONCE)
    await hideDevChrome(page);
    await page.click(".ak-picker__btn"); // the dropdown VISIBLY opens (the feature) — DO NOT switch sessions
    await page.waitForTimeout(900);
    const menu = await page.evaluate(() => {
      const m = (globalThis as any).document.querySelector(".ak-picker__menu");
      const opts = [...(globalThis as any).document.querySelectorAll(".ak-picker__opt")] as any[];
      return { open: !!m, count: opts.length, first: opts[0]?.textContent ?? null };
    });
    await page.waitForTimeout(9000); // DWELL with the session list open over the ACTIVE board (never settle idle)
    const liveText = await page.evaluate(() => (globalThis as any).document.querySelector(".ak-live")?.textContent);
    const video = page.video();
    await ctx.close();
    await browser.close();
    const webm = await video!.path();
    const out = path.join(CLIP_DIR, "clip-session-picker.mp4");
    transcodeClip(webm, out);
    console.log(`\n[picker] dropdown open (menu=${menu.open}, ${menu.count} sessions, top="${menu.first}") over ACTIVE board (badge "${liveText}") → ${path.relative(REPO_ROOT, out)}`);
  }

  // ── 4. clip-card-move.mp4 (beat 7) — a card crossing To Do → In Progress, PORTRAIT two-column ──────
  // #1071 frame-economy fix (operator 2026-06-20): the v3 capture was a LANDSCAPE all-4-columns desktop grid
  // that scaled into 9:16 as a thin strip. This captures PORTRAIT with a capture-time 2-column flex override
  // so exactly the To Do + In Progress columns (the two the card crosses) sit side by side, large + readable,
  // and the board FILLS the frame. We bump the mover to the TOP of To Do first (so it loads on-screen), then
  // during recording flip ONLY its column to in_progress — the 1500ms poll animates it leaving To Do and
  // arriving at the top of In Progress, both columns visible (one clear cross; the VO narrates the full
  // to-do→done journey). board.json is restored to the exact original bytes in the finally block.
  //
  // Two-column override: below the 1024px desktop breakpoint each .ak-col is `flex:0 0 88vw` (≈1 col on
  // screen). We override to 50%-each so the first TWO columns (To Do, In Progress) fit with no scroll — a
  // capture-time FRAMING tweak (like hideDevChrome), the ticket DATA is 100% the real live board.
  const TWO_COL_CSS =
    ".ak-strip{overflow-x:hidden !important;scroll-snap-type:none !important}" +
    ".ak-col{flex:0 0 calc(50% - 8px) !important;scroll-snap-align:none !important}";
  const originalBytes = fs.readFileSync(BOARD_JSON);
  const originalSha = sha256(originalBytes);
  const backup = path.join(recRoot, "board.json.bak");
  fs.writeFileSync(backup, originalBytes);
  try {
    const board = JSON.parse(originalBytes.toString("utf8"));
    const activeSession: string = board.sessionId;
    const active8 = activeSession.slice(0, 8);
    const mover = board.tickets.find(
      (t: any) => t.column === "todo" && (t.sessionId === active8 || t.sessionId === activeSession),
    );
    if (!mover) throw new Error("captureKanbanAssets: no todo ticket in the active session to move.");
    console.log(`\n[card-move] mover ticket #${mover.id} (${mover.column}) in active session ${active8}`);

    // Pre-bump the mover to the TOP of To Do (updatedAt sorts desc) so it loads on-screen at the column head.
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
    await page.evaluate(() => { const s = (globalThis as any).document.querySelector(".ak-strip"); if (s) s.scrollLeft = 0; });
    await page.waitForTimeout(2600); // establish: To Do + In Progress side by side, mover at TOP of To Do
    const beforeRect = await rectOf(page, cardSel);

    // Flip ONLY the column → in_progress (updatedAt=now → top of In Progress). The poll animates the cross.
    {
      const b = JSON.parse(fs.readFileSync(BOARD_JSON, "utf8"));
      const t = b.tickets.find((x: any) => x.id === mover.id);
      t.column = "in_progress";
      t.updatedAt = Date.now();
      fs.writeFileSync(BOARD_JSON, JSON.stringify(b, null, 2));
    }
    await page.waitForTimeout(3200); // poll (1500ms) + 0.32s exit/enter + 700ms arrival glow, held to read
    const afterRect = await rectOf(page, cardSel);
    await page.waitForTimeout(7600); // dwell on the settled state — card at top of In Progress, board fills frame
    const video = page.video();
    await ctx.close();
    await browser.close();
    const webm = await video!.path();
    const out = path.join(CLIP_DIR, "clip-card-move.mp4");
    transcodeClip(webm, out);
    console.log(`[card-move] #${mover.id} crossed To Do → In Progress (portrait 2-col) → ${path.relative(REPO_ROOT, out)}`);
    console.log(`[card-move] mover card rect before(To Do)=${JSON.stringify(beforeRect)} after(In Progress)=${JSON.stringify(afterRect)} (x should shift right by ≈ one column)`);
  } finally {
    // RESTORE board.json to the EXACT original bytes — verify.
    fs.writeFileSync(BOARD_JSON, originalBytes);
    const afterSha = sha256(fs.readFileSync(BOARD_JSON));
    if (afterSha !== originalSha) {
      throw new Error(`captureKanbanAssets: board.json restore FAILED (sha ${afterSha} != ${originalSha}) — backup at ${backup}`);
    }
    console.log(`[restore] data/board.json restored to original bytes (sha256 ${afterSha.slice(0, 12)}… verified)`);
  }

  fs.rmSync(recRoot, { recursive: true, force: true });
  console.log("\nKANBAN-ASSETS: done — 2 stills committed-ready + 2 dynamic clips under out/capture/kanban/.");
}

main().catch((err) => {
  console.error("KANBAN-ASSETS FAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
