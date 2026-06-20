/**
 * #1046 agent-kanban demo VOICED — add the Adam voiceover + synced captions to the approved SILENT kanban
 * cut, then render the 3 publish aspects (9:16 / 1:1 / 4:5) + a ≤8MB mobile review proxy + the vo-sync
 * bundle. The `voiceKanban.ts` analogue of `tools/voiceForge.ts`.
 *
 * This is the VOICED leg over the SILENT `tools/captureKanban.ts` cut: it consumes the real captured 10-beat
 * spine (`out/review/kanban/kanban-rough-silent-9x16.mp4`) — NOT a re-synthesized scene — and edits captions
 * + the VO onto it. Kanban has 10 captured beats but only 9 spoken lines (beat-4 transition is SILENT), so it
 * splices `KANBAN_TRANSITION_SEC` of silence into the continuous VO at the tool→board seam (forge's #944
 * pattern) so audio + video + captions share one timeline.
 *
 * The ONE paid call is the ElevenLabs Adam synth, gated behind `KANBAN_VOICE_PAID=1` (operator-only).
 * DEFAULT = FREE segment-aware mock (NO network, NO cost). Everything else (caption overlay, aspect crop,
 * mux, proxy) is free SYSTEM-ffmpeg work. out/ is gitignored — the renders + audio + bundle are NOT committed.
 *
 * Run (FREE mock, NO paid call):  npm run voice:kanban
 * Run (REAL, PAID Adam synth):    KANBAN_VOICE_PAID=1 npm run voice:kanban   ← operator-only.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

import { synthesizeVoiceToFile } from "../adapters/voice";
import { makeSilentWav } from "../adapters/video";
import { KANBAN_NARRATION, kanbanNarrationScript, kanbanCaptionDisplayText } from "../video/kanbanNarration";
import {
  KANBAN_BEATS,
  KANBAN_VO_SEG_SEC,
  KANBAN_TRANSITION_SEC,
  KANBAN_RUNTIME_SEC,
  KANBAN_BEAT_LAYOUTS,
  kanbanSpec,
} from "../video/kanbanStoryboard";
import { narrationSceneEndTimes } from "../video/demoTimeline";
import { buildDemoCaptionCues, assertCaptionsTrackRealVoice } from "../video/demoCaptions";
import { assertAudioMatchesSync, audioDurationSec, assertAudibleUnlessSilent } from "../video/audioDuration";
import { FABLE_ASPECTS, CAP_BAND_H, assertNoCaptionMediaOverlap, assertFableBeatsSafeAndFilled } from "../video/fableLayout";
import { assertDemoCategoryRecipe } from "../video/demoCategoryRecipe";
import { assertNoLongSilenceGap } from "../video/silenceGap";
import { type VoiceCaller, type VoiceClip, type SpeechRequest } from "../audio/voiceover";
import { planVoFit, type BeatSlot, type VoFitPlan } from "../video/voiceFit";

// ── Geometry + binaries ────────────────────────────────────────────────────
const FPS = 30;
const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const FFPROBE = "/opt/homebrew/bin/ffprobe";
const CAP_BAND_W = 1080;
const ASPECT_FILE: Record<string, string> = {
  "9:16": "kanban-voiced-9x16.mp4",
  "1:1": "kanban-voiced-1x1.mp4",
  "4:5": "kanban-voiced-4x5.mp4",
};

const PAID = process.env.KANBAN_VOICE_PAID === "1";
const HOME = os.homedir();
const SPOKEN_SEC = KANBAN_RUNTIME_SEC - KANBAN_TRANSITION_SEC; // raw spoken total (no transition silence)

function scrub(s: string): string {
  return HOME ? s.split(HOME).join("~") : s;
}

// ── ffmpeg/ffprobe helpers (system binaries) ────────────────────────────────
function ff(args: string[], label: string): void {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`voiceKanban: ffmpeg failed (${label}): ${(r.stderr || r.stdout || "").slice(-800)}`);
}

/** Splice `silenceSec` of silence into `srcAudio` at `seamSec`, writing a synced WAV (44.1k stereo). */
function insertTransitionSilence(srcAudio: string, seamSec: number, silenceSec: number, outWav: string): void {
  const fmt = "aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo";
  const filter = [
    `[0:a]${fmt},atrim=0:${seamSec.toFixed(3)},asetpts=N/SR/TB[a1]`,
    `[0:a]${fmt},atrim=${seamSec.toFixed(3)},asetpts=N/SR/TB[a2]`,
    `[1:a]${fmt},asetpts=N/SR/TB[sil]`,
    `[a1][sil][a2]concat=n=3:v=0:a=1[out]`,
  ].join(";");
  ff([
    "-y", "-i", srcAudio,
    "-f", "lavfi", "-t", silenceSec.toFixed(3), "-i", "anullsrc=r=44100:cl=stereo",
    "-filter_complex", filter, "-map", "[out]", "-c:a", "pcm_s16le", outWav,
  ], "insert transition silence");
}

function probeStreams(p: string): { width: number; height: number; durationSec: number; hasAudio: boolean } {
  const r = spawnSync(FFPROBE, ["-v", "error", "-show_entries", "stream=codec_type,width,height", "-show_entries", "format=duration", "-of", "json", p], { encoding: "utf8" });
  const j = JSON.parse(r.stdout || "{}");
  const v = (j.streams || []).find((s: { codec_type: string }) => s.codec_type === "video") || {};
  const hasAudio = (j.streams || []).some((s: { codec_type: string }) => s.codec_type === "audio");
  return { width: v.width ?? 0, height: v.height ?? 0, durationSec: parseFloat(j.format?.duration ?? "0"), hasAudio };
}

function probeDurationSec(p: string): number {
  const r = spawnSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", p], { encoding: "utf8" });
  const v = parseFloat((r.stdout || "").trim());
  if (!Number.isFinite(v)) throw new Error(`voiceKanban: could not probe duration of ${p}`);
  return v;
}

/** Mean loudness (dB) of a file's audio via ffmpeg volumedetect; -Infinity if none. */
function meanVolumeDb(p: string): number {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-i", p, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  const m = (r.stderr || "").match(/mean_volume:\s*(-?[\d.]+) dB/);
  return m ? parseFloat(m[1]) : -Infinity;
}

// ── FREE voice callers (NO network) ──────────────────────────────────────────
// Two free modes, both NO-cost / NO-network:
//   • SAY    — AUDIBLE offline macOS `say` stand-in (DEFAULT on macOS). Lets the
//              operator actually HEAR the script + pacing for $0 before paying
//              for the polished Adam synth. (#1046 root-cause fix: the old "mock"
//              was SILENT by design, so a free render had NO audible voice — it
//              was mislabeled "voiced".)
//   • SILENT — legacy silent placeholder (alignment only). CI / non-macOS fallback.
// The ONE paid path stays the ElevenLabs Adam synth behind KANBAN_VOICE_PAID=1.
const SAY_VOICE = process.env.KANBAN_SAY_VOICE || "Samantha";

/** Is the offline `say` binary usable (macOS) AND not explicitly disabled? */
function sayAvailable(): boolean {
  if (process.env.KANBAN_VOICE_SILENT === "1") return false;
  const r = spawnSync("say", ["-v", "?"], { encoding: "utf8" });
  return r.status === 0;
}

/** Per-char end-times that land each narration segment EXACTLY on its beat slot
 *  (caption alignment — identical for the silent + audible callers, so the
 *  spine↔VO drift gate sees 0 drift regardless of which voice is used). */
function computeCharEndTimes(textLen: number): number[] {
  const charEndTimesSec: number[] = [];
  let t0 = 0;
  for (let k = 0; k < KANBAN_NARRATION.length; k++) {
    const seg = KANBAN_NARRATION[k];
    const dur = KANBAN_VO_SEG_SEC[seg.beat];
    const isLast = k === KANBAN_NARRATION.length - 1;
    const blockLen = seg.text.length + (isLast ? 0 : 1); // +1 for the single-space separator (non-last)
    for (let i = 0; i < blockLen; i++) {
      charEndTimesSec.push(Number((t0 + ((i + 1) / blockLen) * dur).toFixed(4)));
    }
    t0 += dur;
  }
  charEndTimesSec[charEndTimesSec.length - 1] = SPOKEN_SEC;
  if (charEndTimesSec.length !== textLen) {
    throw new Error(`voiceKanban: generated ${charEndTimesSec.length} char-timestamps but the script is ${textLen} chars.`);
  }
  return charEndTimesSec;
}

// SILENT placeholder caller (alignment only) — CI / non-macOS fallback.
function mockVoiceCaller(): VoiceCaller {
  return async (req: SpeechRequest): Promise<VoiceClip> => ({
    provider: req.provider,
    voiceId: req.voiceId,
    audio: makeSilentWav(SPOKEN_SEC).toString("base64"),
    durationSec: SPOKEN_SEC,
    charEndTimesSec: computeCharEndTimes(req.text.length),
  });
}

/** Synthesize ONE narration segment with `say`, then time-fit it to EXACTLY its
 *  beat slot: speed up (atempo) if the natural read is too long, pad trailing
 *  silence if it's short. Each fitted segment is exactly `targetSec` so the
 *  concatenated VO totals SPOKEN_SEC and segment boundaries stay on beats. */
function fitSegmentWav(text: string, targetSec: number, tmpDir: string, idx: number): string {
  const aiff = path.join(tmpDir, `say_${idx}.aiff`);
  const s = spawnSync("say", ["-v", SAY_VOICE, "-o", aiff, text], { encoding: "utf8" });
  if (s.status !== 0 || !fs.existsSync(aiff)) throw new Error(`voiceKanban: say failed (seg ${idx}): ${(s.stderr || "").slice(-300)}`);
  const natural = probeDurationSec(aiff);
  const outWav = path.join(tmpDir, `seg_${String(idx).padStart(2, "0")}.wav`);
  const fmt = "aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=stereo";
  if (natural > targetSec + 0.02) {
    let ratio = natural / targetSec; // > 1 → compress (speed up); chain atempo for ratios > 2
    const stages: string[] = [];
    while (ratio > 2.0) { stages.push("atempo=2.0"); ratio /= 2.0; }
    stages.push(`atempo=${ratio.toFixed(4)}`);
    ff(["-y", "-i", aiff, "-filter_complex", `[0:a]${stages.join(",")},${fmt},apad[o]`, "-map", "[o]", "-t", targetSec.toFixed(3), "-c:a", "pcm_s16le", outWav], `fit-fast seg ${idx}`);
  } else {
    ff(["-y", "-i", aiff, "-filter_complex", `[0:a]${fmt},apad[o]`, "-map", "[o]", "-t", targetSec.toFixed(3), "-c:a", "pcm_s16le", outWav], `fit-pad seg ${idx}`);
  }
  return outWav;
}

// AUDIBLE free caller: per-segment `say` → time-fit → concat → one SPOKEN_SEC WAV.
function sayVoiceCaller(): VoiceCaller {
  return async (req: SpeechRequest): Promise<VoiceClip> => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanban-say-"));
    const segs: string[] = [];
    for (let k = 0; k < KANBAN_NARRATION.length; k++) {
      segs.push(fitSegmentWav(KANBAN_NARRATION[k].text, KANBAN_VO_SEG_SEC[KANBAN_NARRATION[k].beat], tmpDir, k));
    }
    const list = path.join(tmpDir, "list.txt");
    fs.writeFileSync(list, segs.map((w) => `file '${w.replace(/'/g, "'\\''")}'`).join("\n"));
    const full = path.join(tmpDir, "say-vo.wav");
    ff(["-y", "-f", "concat", "-safe", "0", "-i", list, "-c:a", "pcm_s16le", full], "concat say segments");
    return {
      provider: req.provider,
      voiceId: req.voiceId,
      audio: fs.readFileSync(full).toString("base64"),
      durationSec: SPOKEN_SEC,
      charEndTimesSec: computeCharEndTimes(req.text.length),
    };
  };
}

/** A `silenceSec`-long stereo 44.1k s16 WAV (gap filler for the cue-sync timeline). */
function silenceWav(silenceSec: number, tmpDir: string, idx: number): string {
  const out = path.join(tmpDir, `gap_${String(idx).padStart(3, "0")}.wav`);
  ff(["-y", "-f", "lavfi", "-t", Math.max(silenceSec, 0.001).toFixed(3), "-i", "anullsrc=r=44100:cl=stereo", "-c:a", "pcm_s16le", out], `silence gap ${idx}`);
  return out;
}

/**
 * CUE-SYNCED audible `say` track (#1046 free-preview sync fix). The default `say`
 * caller fits each whole NARRATION SEGMENT to its beat, so a fast read finishes
 * early then goes silent while the captions (timed on an even-rate estimate) keep
 * crawling — the voice runs AHEAD of the subtitles. This rebuilds the VO from the
 * actual CAPTION CUES: each subtitle's text is synthesized and fit to EXACTLY its
 * on-screen window [startSec,endSec], with silence in the gaps, so the spoken line
 * and its subtitle start + end together. Total = `totalSec` (the synced timeline).
 */
function buildCueSyncedSayWav(cues: ReadonlyArray<{ text: string; startSec: number; endSec: number }>, totalSec: number, outWav: string): void {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kanban-cuesay-"));
  const ordered = [...cues].sort((a, b) => a.startSec - b.startSec);
  const parts: string[] = [];
  let cursor = 0;
  let gapIdx = 0;
  for (let i = 0; i < ordered.length; i++) {
    const cue = ordered[i];
    const start = Math.max(cue.startSec, cursor);
    const end = Math.max(cue.endSec, start + 0.05);
    if (start - cursor > 0.005) parts.push(silenceWav(start - cursor, tmpDir, gapIdx++));
    parts.push(fitSegmentWav(cue.text, end - start, tmpDir, i)); // reuse the beat-fit: atempo if long, pad if short
    cursor = end;
  }
  if (totalSec - cursor > 0.005) parts.push(silenceWav(totalSec - cursor, tmpDir, gapIdx++));
  const list = path.join(tmpDir, "list.txt");
  fs.writeFileSync(list, parts.map((w) => `file '${w.replace(/'/g, "'\\''")}'`).join("\n"));
  ff(["-y", "-f", "concat", "-safe", "0", "-i", list, "-t", totalSec.toFixed(3), "-c:a", "pcm_s16le", outWav], "concat cue-synced say");
}

/** Char-index ranges per narrated segment (separator space after a non-last segment belongs to it). */
function narrationCharRanges(): { start: number; end: number }[] {
  const r: { start: number; end: number }[] = [];
  let idx = 0;
  for (let k = 0; k < KANBAN_NARRATION.length; k++) {
    const len = KANBAN_NARRATION[k].text.length;
    r.push({ start: idx, end: idx + len });
    idx += len + 1; // +1 for the single-space separator (non-last)
  }
  return r;
}

/** Assemble the fitted VO (44.1k s16 stereo) from a VoFitPlan over the raw VO audio:
 *  each segment is sliced, compressed (atempo) if the plan scaled it, padded with
 *  trailing silence to its beat, and the transition silences are dropped in place. */
function assembleFittedVo(rawAudioPath: string, plan: VoFitPlan, work: string): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kanban-fitvo-"));
  const fmt = "aformat=sample_fmts=s16:sample_rates=44100:channel_layouts=stereo";
  const parts: { at: number; file: string }[] = [];
  for (const seg of plan.segments) {
    const slice = path.join(tmp, `seg_${String(seg.segIdx).padStart(2, "0")}.wav`);
    const dur = Math.max(seg.rawEndSec - seg.rawStartSec, 0.05);
    const stages: string[] = [];
    // scale>1 → speed up (compress); scale<1 → slow down (stretch to fill the beat). atempo floor 0.5.
    if (Math.abs(seg.scale - 1) > 0.0001) { let r = Math.max(0.5, seg.scale); while (r > 2) { stages.push("atempo=2.0"); r /= 2; } stages.push(`atempo=${r.toFixed(4)}`); }
    const chain = stages.length ? `[0:a]${stages.join(",")},${fmt},apad[o]` : `[0:a]${fmt},apad[o]`;
    ff(["-y", "-ss", seg.rawStartSec.toFixed(3), "-t", dur.toFixed(3), "-i", rawAudioPath, "-filter_complex", chain, "-map", "[o]", "-t", seg.targetSec.toFixed(3), "-c:a", "pcm_s16le", slice], `fit seg ${seg.segIdx}`);
    parts.push({ at: seg.newStartSec, file: slice });
  }
  let g = 0;
  for (const tr of plan.transitions) parts.push({ at: tr.atSec, file: silenceWav(tr.durSec, tmp, 800 + g++) });
  parts.sort((a, b) => a.at - b.at);
  const list = path.join(tmp, "list.txt");
  fs.writeFileSync(list, parts.map((p) => `file '${p.file.replace(/'/g, "'\\''")}'`).join("\n"));
  const out = path.join(work, "kanban-vo-fitted.wav");
  ff(["-y", "-f", "concat", "-safe", "0", "-i", list, "-t", plan.totalSec.toFixed(3), "-c:a", "pcm_s16le", out], "concat fitted vo");
  return out;
}

// ── spine↔VO transition-gap math (inlined forge #944 seam logic) ────────────────────────────────────
const DRIFT_TOL_SEC = 0.5;

function seamSegmentIndex(): number {
  const transitions = KANBAN_BEATS.filter((b) => b.kind === "transition");
  if (transitions.length !== 1) throw new Error(`voiceKanban: expected exactly 1 transition beat, found ${transitions.length}.`);
  return KANBAN_NARRATION.filter((s) => s.beat < transitions[0].n).length;
}
function seamCharIndex(seamSegIdx: number): number {
  let idx = 0;
  for (let k = 0; k < seamSegIdx; k++) idx += KANBAN_NARRATION[k].text.length + 1;
  return idx;
}
function assertVoMatchesSpine(rawSceneEndTimesSec: number[]): void {
  if (rawSceneEndTimesSec.length !== KANBAN_NARRATION.length) {
    throw new Error(`voiceKanban spine↔VO drift: got ${rawSceneEndTimesSec.length} segment end-times but the narration has ${KANBAN_NARRATION.length}.`);
  }
  let prev = 0;
  for (let i = 0; i < KANBAN_NARRATION.length; i++) {
    const spine = KANBAN_VO_SEG_SEC[KANBAN_NARRATION[i].beat];
    const measured = rawSceneEndTimesSec[i] - prev;
    if (Math.abs(measured - spine) > DRIFT_TOL_SEC) {
      throw new Error(`voiceKanban spine↔VO drift: beat ${KANBAN_NARRATION[i].beat} VO segment is ${measured.toFixed(3)}s but the spine renders ${spine}s (drift > ${DRIFT_TOL_SEC}s). VO-lock KANBAN_VO_SEG_SEC + re-render the spine.`);
    }
    prev = rawSceneEndTimesSec[i];
  }
}

// ── caption band PNG (transparent alpha strip) ─────────
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function captionBandHtml(displayText: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${CAP_BAND_W}px;height:${CAP_BAND_H}px;background:transparent;overflow:hidden}
#wrap{width:100%;height:100%;display:flex;align-items:center;justify-content:center;
  font-family:"Arial",ui-sans-serif,-apple-system,Helvetica,sans-serif}
#cap{max-width:84%;background:rgba(10,12,20,.62);color:#ffffff;border-radius:22px;
  padding:18px 40px;font-weight:800;font-size:46px;line-height:1.22;letter-spacing:.2px;
  text-align:center;backdrop-filter:blur(2px);box-shadow:0 8px 30px rgba(0,0,0,.35)}
</style></head><body><div id="wrap"><div id="cap">${escapeHtml(displayText)}</div></div></body></html>`;
}

async function renderCaptionPngs(cues: ReadonlyArray<{ text: string }>, outDir: string, chromium: any): Promise<string[]> {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: CAP_BAND_W, height: CAP_BAND_H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const paths: string[] = [];
  for (let i = 0; i < cues.length; i++) {
    await page.setContent(captionBandHtml(kanbanCaptionDisplayText(cues[i].text)), { waitUntil: "domcontentloaded" });
    const p = path.join(outDir, `cap_${String(i).padStart(3, "0")}.png`);
    await page.screenshot({ path: p, omitBackground: true });
    paths.push(p);
  }
  await ctx.close();
  await browser.close();
  return paths;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const repoRoot = fs.realpathSync(process.cwd());
  const reviewDir = path.join(repoRoot, "out", "review", "kanban");
  const audioDir = path.join(repoRoot, "out", "audio");
  const captureDir = path.join(repoRoot, "out", "capture", "kanban");
  fs.mkdirSync(reviewDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });
  const rel = (p: string): string => path.relative(repoRoot, p);

  // 0 — the silent spine must exist (the SILENT capture leg). Run it synchronously if absent.
  const spine = path.join(reviewDir, "kanban-rough-silent-9x16.mp4");
  const beat1 = path.join(captureDir, "beat-01.mp4");
  if (!fs.existsSync(spine) || !fs.existsSync(beat1)) {
    console.log("  silent spine absent → running `npm run capture:kanban` (Playwright, a few minutes)…");
    const cap = spawnSync("npm", ["run", "capture:kanban"], { cwd: repoRoot, stdio: "inherit" });
    if (cap.status !== 0) throw new Error(`voiceKanban: capture:kanban failed (exit ${cap.status}) — cannot voice a missing spine.`);
  }
  if (!fs.existsSync(spine)) throw new Error(`voiceKanban: silent spine still missing after capture: ${rel(spine)}`);
  const spineDur = probeDurationSec(spine);
  console.log(`  silent spine: ${rel(spine)} (${spineDur.toFixed(2)}s)`);

  const script = kanbanNarrationScript();
  console.log(scrub(`\n=== #1046 kanban VOICED — ${KANBAN_NARRATION.length} narrated beats, ${script.length} script chars, ${PAID ? "PAID (real Adam synth)" : sayAvailable() ? "FREE AUDIBLE (macOS say, NO paid call)" : "FREE SILENT (alignment-only fallback)"} ===\n`));

  // 1 — obtain the VO (PAID / REUSE / MOCK), mirroring voiceForge.
  const existingMp3 = path.join(audioDir, "kanban-vo.mp3");
  const existingBundle = path.join(reviewDir, "kanban-vo-sync.json");
  const canReuse = !PAID && fs.existsSync(existingMp3) && fs.existsSync(existingBundle);

  let audioPath: string;
  let charEndTimesSec: number[] | undefined;
  let durationSec: number;
  let voiceProvider: string;
  let providerLabel: string;
  // "paid" | "reuse" | "say" (audible free) | "silent" (alignment-only fallback).
  // Anything except "silent" MUST render to audible audio (asserted after mux).
  let voiceMode: string;

  if (canReuse) {
    const prior = JSON.parse(fs.readFileSync(existingBundle, "utf8"));
    if (prior.script !== script) throw new Error("voiceKanban: kanban-vo-sync.json was synthesized from a DIFFERENT script — re-synthesize (KANBAN_VOICE_PAID=1) or delete the stale bundle.");
    audioPath = existingMp3;
    charEndTimesSec = prior.charEndTimesSec as number[];
    durationSec = prior.durationSec as number;
    voiceProvider = prior.voiceProvider as string;
    providerLabel = `${voiceProvider} (reused — FREE, no paid call)`;
    voiceMode = "reuse";
    console.log(`  REUSE: existing Adam VO ${rel(existingMp3)} (${durationSec.toFixed(2)}s, ${charEndTimesSec.length} char-timestamps)`);
  } else {
    const freeAudible = !PAID && sayAvailable();
    voiceMode = PAID ? "paid" : freeAudible ? "say" : "silent";
    const fileName = PAID ? "kanban-vo.mp3" : "kanban-vo.wav";
    const freeCaller = freeAudible ? sayVoiceCaller() : mockVoiceCaller();
    if (voiceMode === "silent") console.log("  ⚠ FREE voice is SILENT (no macOS `say` / KANBAN_VOICE_SILENT=1) — alignment only, NOT audible.");
    else if (voiceMode === "say") console.log(`  FREE AUDIBLE voice via macOS \`say\` (${SAY_VOICE}) — hear the script + pacing at $0; KANBAN_VOICE_PAID=1 for the real Adam synth.`);
    const voice = await synthesizeVoiceToFile({ script }, PAID ? undefined : { primary: freeCaller }, { outDir: audioDir, fileName });
    console.log(`  ${scrub(voice.pathLine)}`);
    audioPath = voice.audioPath;
    charEndTimesSec = voice.charEndTimesSec;
    durationSec = voice.durationSec;
    voiceProvider = voice.usedProvider;
    providerLabel = voice.usedProvider;
    if (PAID && charEndTimesSec && charEndTimesSec.length) {
      // Persist the PAID VO bundle IMMEDIATELY (#1046): a later gate failure must never waste the
      // (billed) synth. With mp3 + this stub present, canReuse re-renders for FREE on the next run.
      fs.writeFileSync(existingBundle, JSON.stringify({ script, charEndTimesSec, durationSec, voiceProvider }, null, 2) + "\n", "utf8");
      console.log(`  persisted paid VO bundle → ${rel(existingBundle)} (reusable; re-runs won't re-synthesize)`);
    }
  }
  if (!charEndTimesSec || charEndTimesSec.length === 0) throw new Error("voiceKanban: no per-character alignment returned — cannot sync.");
  console.log(`  VO duration = ${durationSec.toFixed(2)}s (Adam, ${providerLabel}) — RAW spoken length`);

  // 2 — SYNC. Drift-gate the cached VO against the spine, then splice KANBAN_TRANSITION_SEC of silence at the
  // tool→board seam into BOTH the audio and the alignment so audio + video + captions share one timeline.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "kanban-voice-"));
  const rawSceneEndTimesSec = narrationSceneEndTimes(KANBAN_NARRATION, charEndTimesSec, durationSec);
  if (!rawSceneEndTimesSec) throw new Error("voiceKanban: narrationSceneEndTimes(raw) returned null — the alignment did not line up with the script.");
  // A REAL synth (Adam) often reads FASTER than the spine, so its segments are shorter than the
  // beats → the rigid seam-splice would drift. FIT the VO onto the beat timeline instead: each
  // segment plays at its beat start, padded (or compressed) to the beat, transition silence in
  // place, and the caption char-times shifted onto the fitted timeline. The mock/say paths already
  // match the spine by construction, so they keep the proven seam-splice.
  const driftMax = Math.max(...KANBAN_NARRATION.map((seg, i) => Math.abs((rawSceneEndTimesSec[i] - (i ? rawSceneEndTimesSec[i - 1] : 0)) - KANBAN_VO_SEG_SEC[seg.beat])));
  const useFit = (voiceMode === "paid" || voiceMode === "reuse") && driftMax > DRIFT_TOL_SEC;

  let syncedCharEndTimesSec: number[];
  let syncedDurationSec: number;
  let syncedAudioPath: string;
  let sceneEndTimesSec: number[];
  let seamTimeSec = 0; // tool→board seam (transition) position on the synced timeline, for the bundle

  if (useFit) {
    const beats: BeatSlot[] = KANBAN_BEATS.map((b) => ({ n: b.n, narrated: b.kind !== "transition", transition: b.kind === "transition" }));
    // KANBAN_VO_FILL=stretch → slow Adam up to 1.4× to FILL the (longer, dwell-heavy) beats, so his
    // last word lands near the end (captions stay synced) and there is less dead-air; default = pad.
    const maxStretch = process.env.KANBAN_VO_FILL === "stretch" ? Number(process.env.KANBAN_VO_MAX_STRETCH || "1.4") : 1.0;
    const plan = planVoFit({ rawSegEndsSec: rawSceneEndTimesSec, charEndTimesSec, charRanges: narrationCharRanges(), beats, targetBeatSec: KANBAN_VO_SEG_SEC, transitionSec: KANBAN_TRANSITION_SEC, maxStretch });
    syncedAudioPath = assembleFittedVo(audioPath, plan, work);
    syncedCharEndTimesSec = plan.newCharEndTimesSec;
    syncedDurationSec = plan.totalSec;
    // Scene (beat) boundaries come straight from the plan — each narrated beat ENDS at its
    // slot end (newStart+target), even though the spoken words may finish earlier (trailing
    // silence). narrationSceneEndTimes can't be used here: it (rightly, for the seam path)
    // demands the last char land at the audio end, which a fitted timeline deliberately breaks.
    sceneEndTimesSec = plan.segments.map((s) => Number((s.newStartSec + s.targetSec).toFixed(4)));
    seamTimeSec = plan.transitions[0]?.atSec ?? 0;
    const pads = plan.segments.filter((s) => s.scale <= 1.0001).length;
    console.log(`  VO-FIT: real VO ${durationSec.toFixed(2)}s → fitted to the ${syncedDurationSec.toFixed(2)}s spine (driftMax ${driftMax.toFixed(2)}s; ${pads}/${plan.segments.length} segments padded, rest compressed); captions shifted onto the fitted timeline.`);
  } else {
    assertVoMatchesSpine(rawSceneEndTimesSec);
    const seamSegIdx = seamSegmentIndex();
    const seamCharIdx = seamCharIndex(seamSegIdx);
    const seamTimeSec = rawSceneEndTimesSec[seamSegIdx - 1];
    syncedCharEndTimesSec = charEndTimesSec.map((t, i) => (i >= seamCharIdx ? t + KANBAN_TRANSITION_SEC : t));
    syncedDurationSec = durationSec + KANBAN_TRANSITION_SEC;
    syncedAudioPath = path.join(work, "kanban-vo-synced.wav");
    insertTransitionSilence(audioPath, seamTimeSec, KANBAN_TRANSITION_SEC, syncedAudioPath);
    const se = narrationSceneEndTimes(KANBAN_NARRATION, syncedCharEndTimesSec, syncedDurationSec);
    if (!se) throw new Error("voiceKanban: narrationSceneEndTimes(synced) returned null — the synced alignment did not line up.");
    sceneEndTimesSec = se;
    console.log(`  sync: spine↔VO drift gate PASS; spliced ${KANBAN_TRANSITION_SEC}s transition silence at ${seamTimeSec.toFixed(2)}s → synced VO ${syncedDurationSec.toFixed(2)}s (spine target ${KANBAN_RUNTIME_SEC.toFixed(2)}s)`);
  }
  assertAudioMatchesSync(syncedAudioPath, sceneEndTimesSec);
  const audioDur = audioDurationSec(syncedAudioPath);
  console.log(`  per-segment end-times (s): ${sceneEndTimesSec.map((s) => s.toFixed(2)).join(", ")}`);
  console.log(`  assertAudioMatchesSync: PASS (synced audio=${audioDur?.toFixed(2) ?? "?"}s ≈ alignment end=${sceneEndTimesSec[sceneEndTimesSec.length - 1].toFixed(2)}s)`);

  // 3 — synced captions (real-voice timing on the SYNCED timeline), rendered as transparent alpha PNGs.
  const cues = buildDemoCaptionCues(script, { durationSec: syncedDurationSec, charEndTimesSec: syncedCharEndTimesSec });
  console.log(`  captions: ${cues.length} cues (first="${kanbanCaptionDisplayText(cues[0].text)}" … last="${kanbanCaptionDisplayText(cues[cues.length - 1].text)}")`);
  // #1046 BAKE: a real VO must drive UNEVEN cues; near-uniform = silent even-split fallback (desync).
  assertCaptionsTrackRealVoice(cues, voiceMode === "paid" || voiceMode === "reuse");

  // 3b — CUE-SYNC the free `say` VO (#1046): rebuild the audio so each subtitle's words
  // play during EXACTLY that subtitle's window (the segment-fit VO ran ahead of the
  // captions). Only the free `say` path needs this; paid Adam already carries real
  // per-word timestamps, and the silent fallback has nothing to sync.
  if (voiceMode === "say") {
    const cueSynced = path.join(work, "kanban-vo-cuesynced.wav");
    buildCueSyncedSayWav(cues, syncedDurationSec, cueSynced);
    syncedAudioPath = cueSynced;
    assertAudioMatchesSync(syncedAudioPath, sceneEndTimesSec);
    console.log(`  say cue-sync: rebuilt VO from ${cues.length} caption cues (each line fit to its subtitle window) → captions now track the spoken words (${audioDurationSec(syncedAudioPath)?.toFixed(2) ?? "?"}s).`);
  }

  const pngDir = fs.mkdtempSync(path.join(work, "caps-"));
  const { chromium } = await import("playwright");
  const capPngs = await renderCaptionPngs(cues, pngDir, chromium);

  // 4 — render each aspect (crop the spine → overlay the timed caption PNGs → mux the VO). Gate first.
  assertNoCaptionMediaOverlap(FABLE_ASPECTS);
  assertFableBeatsSafeAndFilled(KANBAN_BEAT_LAYOUTS);
  assertDemoCategoryRecipe(kanbanSpec);

  const rendered: { aspect: string; file: string; width: number; height: number; durationSec: number; hasAudio: boolean; bytes: number }[] = [];
  for (const a of FABLE_ASPECTS) {
    const inputs: string[] = ["-i", spine];
    for (const p of capPngs) inputs.push("-i", p);
    inputs.push("-i", syncedAudioPath);
    const audioIdx = capPngs.length + 1;

    const parts: string[] = [];
    parts.push(`[0:v]${a.crop ? a.crop : "null"}[base]`);
    let prev = "base";
    for (let i = 0; i < cues.length; i++) {
      const next = i === cues.length - 1 ? "v" : `o${i}`;
      parts.push(`[${prev}][${i + 1}:v]overlay=x=0:y=${a.captionY}:enable='between(t,${cues[i].startSec.toFixed(3)},${cues[i].endSec.toFixed(3)})'[${next}]`);
      prev = next;
    }
    const out = path.join(reviewDir, ASPECT_FILE[a.key]);
    ff([
      "-y", ...inputs,
      "-filter_complex", parts.join(";"),
      "-map", "[v]", "-map", `${audioIdx}:a`,
      "-r", String(FPS),
      "-c:v", "libx264", "-profile:v", "high", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest", out,
    ], `render ${a.key}`);
    const pr = probeStreams(out);
    const bytes = fs.statSync(out).size;
    rendered.push({ aspect: a.key, file: out, width: pr.width, height: pr.height, durationSec: pr.durationSec, hasAudio: pr.hasAudio, bytes });
    console.log(`  ${a.key} → ${rel(out)} (${pr.width}x${pr.height}, ${pr.durationSec.toFixed(2)}s, audio=${pr.hasAudio}, ${(bytes / 1048576).toFixed(2)}MB)`);
    if (pr.width !== a.width || pr.height !== a.height) throw new Error(`voiceKanban: ${a.key} rendered at ${pr.width}x${pr.height}, expected ${a.width}x${a.height}.`);
    if (!pr.hasAudio) throw new Error(`voiceKanban: ${a.key} has NO audio stream — the VO was dropped.`);
  }

  // #1063 DEAD-AIR GATE (the bake for the 0:36 pause): the shipped 9:16 hero must carry NO long internal
  // silence. The transition is an intentional ~1s silent beat, so the 1.5s threshold tolerates it; a gap
  // beyond that means a beat over-budgets its VO again (the exact defect the operator caught). Both-ends
  // mechanical — see video/silenceGap.ts + its test.
  const hero916 = rendered.find((r) => r.aspect === "9:16");
  if (hero916) {
    assertNoLongSilenceGap(hero916.file, 1.5, { durationSec: hero916.durationSec });
    console.log(`  #1063 dead-air gate: PASS — no internal silence gap >1.5s in ${rel(hero916.file)}`);
  }

  // 4b — AUDIBILITY gate (#1046 root-cause bake): a "voiced" render MUST be audible.
  // The hasAudio check above only proves an audio STREAM exists — a silent mock WAV
  // passes it (-91 dB) yet is voiceless. Measure the master's mean loudness and refuse
  // a silent render unless voiceMode is explicitly the alignment-only "silent" fallback.
  const heroFile = rendered.find((r) => r.aspect === "9:16")!.file;
  const meanDb = meanVolumeDb(heroFile);
  assertAudibleUnlessSilent(meanDb, voiceMode);
  console.log(`  audibility gate: voiceMode='${voiceMode}', master mean volume ${meanDb.toFixed(1)} dB — ${voiceMode === "silent" ? "silent fallback (allowed)" : "AUDIBLE ✓"}`);

  // 5 — ≤8MB 9:16 mobile review proxy.
  const hero = rendered.find((r) => r.aspect === "9:16")!;
  const proxy = path.join(reviewDir, "kanban-voiced-9x16-mobile.mp4");
  ff([
    "-y", "-i", hero.file,
    "-vf", "scale=-2:1280:flags=lanczos",
    "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "96k", proxy,
  ], "mobile proxy");
  const proxyBytes = fs.statSync(proxy).size;
  console.log(`  mobile proxy → ${rel(proxy)} (${(proxyBytes / 1048576).toFixed(2)}MB)`);
  if (proxyBytes > 8 * 1024 * 1024) throw new Error(`voiceKanban: mobile proxy is ${(proxyBytes / 1048576).toFixed(2)}MB (> 8MB cap).`);

  // 6 — provenance bundle.
  const bundle = {
    task: 1046,
    leg: "voiced",
    paidCall: PAID,
    voiceProvider,
    voiceName: "Adam",
    voiceGender: "male",
    script,
    scriptChars: script.length,
    durationSec: Number(durationSec.toFixed(4)), // RAW spoken length (reuse cache)
    transitionSec: KANBAN_TRANSITION_SEC,
    seamTimeSec: Number(seamTimeSec.toFixed(4)),
    syncedDurationSec: Number(syncedDurationSec.toFixed(4)),
    narratedBeats: KANBAN_NARRATION.map((s) => ({ beat: s.beat, kind: s.kind, clipSec: s.clipSec })),
    sceneEndTimesSec: sceneEndTimesSec.map((s) => Number(s.toFixed(4))),
    charEndTimesSec: charEndTimesSec.map((s) => Number(s.toFixed(4))),
    captionCount: cues.length,
    captions: cues.map((c) => ({ text: kanbanCaptionDisplayText(c.text), startSec: Number(c.startSec.toFixed(3)), endSec: Number(c.endSec.toFixed(3)) })),
    audioPath: rel(audioPath),
    spine: rel(spine),
    renders: rendered.map((r) => ({ aspect: r.aspect, file: rel(r.file), width: r.width, height: r.height, durationSec: Number(r.durationSec.toFixed(3)), bytes: r.bytes })),
    mobileProxy: { file: rel(proxy), bytes: proxyBytes },
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(reviewDir, "kanban-vo-sync.json"), JSON.stringify(bundle, null, 2) + "\n", "utf8");

  fs.rmSync(work, { recursive: true, force: true });

  const voSource = PAID
    ? "real Adam synth (PAID)"
    : canReuse
      ? "reused real Adam VO (FREE — no paid call)"
      : voiceMode === "say"
        ? `FREE AUDIBLE macOS say (${SAY_VOICE}) — re-run with KANBAN_VOICE_PAID=1 for the polished Adam synth`
        : "FREE SILENT alignment-only fallback (no audible voice — install/enable macOS say or set KANBAN_VOICE_PAID=1)";
  console.log(scrub(`\n#1046 kanban VOICED: DONE — 3 aspects + mobile proxy + sync bundle under out/review/kanban/. VO source: ${voSource}.\n`));
}

main().catch((err) => {
  console.error("#1046 kanban VOICED FAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
