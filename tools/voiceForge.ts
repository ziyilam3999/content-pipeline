/**
 * #871 forge-demo VOICED — add the Adam voiceover + synced captions to the approved SILENT forge cut,
 * then render the 3 publish aspects (9:16 / 1:1 / 4:5). The `voiceForge.ts` analogue of `voiceFable.ts`.
 *
 * This is the VOICED leg over the SILENT `tools/captureForge.ts` cut: it consumes the real captured
 * 9-beat spine (`out/video/forge-demo-9x16.mp4`) — NOT a re-synthesized scene — and edits captions + the
 * Adam VO onto it. The ONE paid call is the ElevenLabs Adam synth (operator-only, gated behind
 * `FORGE_VOICE_PAID=1`); everything else (caption overlay, aspect crop, mux) is free SYSTEM-ffmpeg work.
 *
 * Why REUSE the pre-built silent spine instead of re-timing per beat (the fable path): forge has NINE
 * captured beats but only EIGHT spoken lines (beat-4 transition is silent), so a strict beat↔segment
 * re-time has no 1:1 mapping. The captured silent cut already concatenates all 9 beats at their designed
 * durations; the captions follow the VOICE (the TTS char-timestamps), exactly the fable model — so we
 * overlay the timed captions + mux the VO straight onto the existing spine. The orchestrator eyeballs the
 * result and the camera/beat framing iterates in `forgeStoryboard.ts`, not here.
 *
 * Pipeline (all SYSTEM ffmpeg `/opt/homebrew/bin/ffmpeg` — the vendored remotion ffmpeg is
 * `--disable-filters`, so overlay/crop must use the system binary):
 *   0. ensure the silent spine exists (run `npm run capture:forge` if absent).
 *   1. obtain the Adam VO (paid / reuse / mock) → audio + per-char timestamps.
 *   2. derive per-segment scene-end-times (`narrationSceneEndTimes`) + provenance-bind (`assertAudioMatchesSync`).
 *   3. build synced captions (`buildDemoCaptionCues`, real-voice timing) → thin alpha-PNG band per cue.
 *   4. render each aspect (crop the spine → overlay the timed caption PNGs → mux the Adam VO).
 *   5. write out/video/forge-demo-voiced-{9x16,1x1,4x5}.mp4 + the VO sync bundle (provenance).
 *
 * out/ is gitignored — the renders + audio + bundle are NOT committed; this tool is.
 *
 * Run (FREE mock, NO paid call):  npm run voice:forge        (or: npx tsx tools/voiceForge.ts)
 * Run (REAL, PAID Adam synth):    FORGE_VOICE_PAID=1 npx tsx tools/voiceForge.ts   ← operator-only.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

import { synthesizeVoiceToFile } from "../adapters/voice";
import { makeSilentWav } from "../adapters/video";
import {
  FORGE_NARRATION,
  forgeNarrationScript,
  forgeCaptionDisplayText,
} from "../video/forgeNarration";
import { FORGE_RUNTIME_SEC, FORGE_BEAT_LAYOUTS, forgeSpec } from "../video/forgeStoryboard";
import { narrationSceneEndTimes } from "../video/demoTimeline";
import { buildDemoCaptionCues } from "../video/demoCaptions";
import { assertAudioMatchesSync, audioDurationSec } from "../video/audioDuration";
import {
  FABLE_ASPECTS,
  CAP_BAND_H,
  assertNoCaptionMediaOverlap,
  assertFableBeatsSafeAndFilled,
} from "../video/fableLayout";
import { assertDemoCategoryRecipe } from "../video/demoCategoryRecipe";
import { type VoiceCaller, type VoiceClip, type SpeechRequest } from "../audio/voiceover";

// ── Geometry + binaries ────────────────────────────────────────────────────
const W = 1080;
const H = 1920;
const FPS = 30;
const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const FFPROBE = "/opt/homebrew/bin/ffprobe";

// Captions are baked as transparent alpha PNGs (the system ffmpeg is built without freetype, so
// drawtext/subtitles are unavailable — only `overlay`). The band is a fixed 1080-wide strip; only the
// overlay Y changes per aspect, so ONE set of PNGs serves all three aspects.
const CAP_BAND_W = 1080;
const ASPECT_FILE: Record<string, string> = {
  "9:16": "forge-demo-voiced-9x16.mp4",
  "1:1": "forge-demo-voiced-1x1.mp4",
  "4:5": "forge-demo-voiced-4x5.mp4",
};

const PAID = process.env.FORGE_VOICE_PAID === "1";
const HOME = os.homedir();

/** Scrub an absolute home path → `~` on any printed line (the bundle stores repo-relative paths). */
function scrub(s: string): string {
  return HOME ? s.split(HOME).join("~") : s;
}

// ── ffmpeg/ffprobe helpers (system binaries) ────────────────────────────────
function ff(args: string[], label: string): void {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", ...args], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`voiceForge: ffmpeg failed (${label}): ${(r.stderr || r.stdout || "").slice(-800)}`);
  }
}

function probeStreams(p: string): { width: number; height: number; durationSec: number; hasAudio: boolean } {
  const r = spawnSync(
    FFPROBE,
    ["-v", "error", "-show_entries", "stream=codec_type,width,height", "-show_entries", "format=duration", "-of", "json", p],
    { encoding: "utf8" },
  );
  const j = JSON.parse(r.stdout || "{}");
  const v = (j.streams || []).find((s: { codec_type: string }) => s.codec_type === "video") || {};
  const hasAudio = (j.streams || []).some((s: { codec_type: string }) => s.codec_type === "audio");
  return { width: v.width ?? 0, height: v.height ?? 0, durationSec: parseFloat(j.format?.duration ?? "0"), hasAudio };
}

function probeDurationSec(p: string): number {
  const r = spawnSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", p], { encoding: "utf8" });
  const v = parseFloat((r.stdout || "").trim());
  if (!Number.isFinite(v)) throw new Error(`voiceForge: could not probe duration of ${p}`);
  return v;
}

// ── A FREE mock ElevenLabs caller (NO network) for the default non-paid run ──
function mockVoiceCaller(durationSec: number): VoiceCaller {
  return async (req: SpeechRequest): Promise<VoiceClip> => {
    const n = req.text.length;
    const charEndTimesSec: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = (i + 1) / n;
      const eased = x * x * (3 - 2 * x); // smoothstep — non-linear so sync != even-split
      charEndTimesSec.push(Number((eased * durationSec).toFixed(4)));
    }
    charEndTimesSec[n - 1] = durationSec;
    return {
      provider: req.provider,
      voiceId: req.voiceId,
      audio: makeSilentWav(durationSec).toString("base64"),
      durationSec,
      charEndTimesSec,
    };
  };
}

// ── caption band PNG (transparent alpha strip, thin + centered, horizontal safe band) ─────────
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

/** Render one transparent caption PNG per cue. Returns paths. */
async function renderCaptionPngs(
  cues: ReadonlyArray<{ text: string }>,
  outDir: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chromium: any,
): Promise<string[]> {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: CAP_BAND_W, height: CAP_BAND_H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const paths: string[] = [];
  for (let i = 0; i < cues.length; i++) {
    await page.setContent(captionBandHtml(forgeCaptionDisplayText(cues[i].text)), { waitUntil: "domcontentloaded" });
    const p = path.join(outDir, `cap_${String(i).padStart(3, "0")}.png`);
    await page.screenshot({ path: p, omitBackground: true });
    paths.push(p);
  }
  await ctx.close();
  await browser.close();
  return paths;
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const repoRoot = fs.realpathSync(process.cwd());
  const videoDir = path.join(repoRoot, "out", "video");
  const captureDir = path.join(repoRoot, "out", "capture", "forge");
  const reviewDir = path.join(repoRoot, "out", "review", "forge-demo");
  const audioDir = path.join(repoRoot, "out", "audio");
  fs.mkdirSync(videoDir, { recursive: true });
  fs.mkdirSync(reviewDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });

  const rel = (p: string): string => path.relative(repoRoot, p);

  // 0 — the silent spine must exist (the SILENT capture leg). Run it synchronously if absent (a few
  // minutes of Playwright). A subagent must never background a step it owns, so this blocks.
  const spine = path.join(videoDir, "forge-demo-9x16.mp4");
  const beat1 = path.join(captureDir, "beat-01.mp4");
  if (!fs.existsSync(spine) || !fs.existsSync(beat1)) {
    console.log("  silent spine absent → running `npm run capture:forge` (Playwright, a few minutes)…");
    const cap = spawnSync("npm", ["run", "capture:forge"], { cwd: repoRoot, stdio: "inherit" });
    if (cap.status !== 0) throw new Error(`voiceForge: capture:forge failed (exit ${cap.status}) — cannot voice a missing spine.`);
  }
  if (!fs.existsSync(spine)) throw new Error(`voiceForge: silent spine still missing after capture: ${rel(spine)}`);
  const spineDur = probeDurationSec(spine);
  console.log(`  silent spine: ${rel(spine)} (${spineDur.toFixed(2)}s)`);

  const script = forgeNarrationScript();
  console.log(
    scrub(
      `\n=== #871 forge VOICED — ${FORGE_NARRATION.length} narrated beats, ${script.length} script chars, ` +
        `${PAID ? "PAID (real Adam synth)" : "FREE (mock alignment, NO paid call)"} ===\n`,
    ),
  );

  // 1 — obtain the Adam VO. Three sources, in priority order (mirrors voiceFable):
  //   PAID  (FORGE_VOICE_PAID=1)                 → real ElevenLabs synth (operator-only, costs $).
  //   REUSE (prior real mp3 + sync bundle exist) → FREE: re-use the existing Adam VO + alignment.
  //   MOCK  (fresh, no prior synth)              → FREE silent mock for dev/CI.
  const existingMp3 = path.join(audioDir, "forge-vo.mp3");
  const existingBundle = path.join(reviewDir, "forge-demo-vo-sync.json");
  const canReuse = !PAID && fs.existsSync(existingMp3) && fs.existsSync(existingBundle);

  let audioPath: string;
  let charEndTimesSec: number[] | undefined;
  let durationSec: number;
  let voiceProvider: string;
  let providerLabel: string;

  if (canReuse) {
    const prior = JSON.parse(fs.readFileSync(existingBundle, "utf8"));
    if (prior.script !== script) {
      throw new Error(
        "voiceForge: out/review/forge-demo/forge-demo-vo-sync.json was synthesized from a DIFFERENT script — its " +
          "alignment cannot be reused. Re-synthesize with FORGE_VOICE_PAID=1 (paid) or delete the stale bundle.",
      );
    }
    audioPath = existingMp3;
    charEndTimesSec = prior.charEndTimesSec as number[];
    durationSec = prior.durationSec as number;
    voiceProvider = prior.voiceProvider as string;
    providerLabel = `${voiceProvider} (reused — FREE, no paid call)`;
    console.log(`  REUSE: existing Adam VO ${rel(existingMp3)} (${durationSec.toFixed(2)}s, ${charEndTimesSec.length} char-timestamps)`);
  } else {
    const fileName = PAID ? "forge-vo.mp3" : "forge-vo.wav";
    const voice = await synthesizeVoiceToFile(
      { script },
      PAID ? undefined : { primary: mockVoiceCaller(FORGE_RUNTIME_SEC) },
      { outDir: audioDir, fileName },
    );
    console.log(`  ${scrub(voice.pathLine)}`);
    audioPath = voice.audioPath;
    charEndTimesSec = voice.charEndTimesSec;
    durationSec = voice.durationSec;
    voiceProvider = voice.usedProvider;
    providerLabel = voice.usedProvider;
  }
  if (!charEndTimesSec || charEndTimesSec.length === 0) throw new Error("voiceForge: no per-character alignment returned — cannot sync.");
  console.log(`  VO duration = ${durationSec.toFixed(2)}s (Adam, ${providerLabel})`);

  // 2 — per-segment scene-end-times from the alignment + provenance bind.
  const sceneEndTimesSec = narrationSceneEndTimes(FORGE_NARRATION, charEndTimesSec, durationSec);
  if (!sceneEndTimesSec) throw new Error("voiceForge: narrationSceneEndTimes returned null — the alignment did not line up with the script.");
  assertAudioMatchesSync(audioPath, sceneEndTimesSec);
  const audioDur = audioDurationSec(audioPath);
  console.log(`  per-segment end-times (s): ${sceneEndTimesSec.map((s) => s.toFixed(2)).join(", ")}`);
  console.log(`  assertAudioMatchesSync: PASS (audio=${audioDur?.toFixed(2) ?? "?"}s ≈ alignment end=${sceneEndTimesSec[sceneEndTimesSec.length - 1].toFixed(2)}s)`);

  // 3 — synced captions (real-voice timing), rendered as transparent alpha PNGs.
  const cues = buildDemoCaptionCues(script, { durationSec, charEndTimesSec });
  console.log(`  captions: ${cues.length} cues (first="${forgeCaptionDisplayText(cues[0].text)}" … last="${forgeCaptionDisplayText(cues[cues.length - 1].text)}")`);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "forge-voice-"));
  const pngDir = fs.mkdtempSync(path.join(work, "caps-"));
  const { chromium } = await import("playwright");
  const capPngs = await renderCaptionPngs(cues, pngDir, chromium);

  // 4 — render each aspect (crop the spine → overlay the timed caption PNGs → mux Adam VO).
  // Reuse the #824 cross-layer + fill/safe gates BEFORE spending the render.
  assertNoCaptionMediaOverlap(FABLE_ASPECTS);
  assertFableBeatsSafeAndFilled(FORGE_BEAT_LAYOUTS);
  assertDemoCategoryRecipe(forgeSpec);

  const rendered: { aspect: string; file: string; width: number; height: number; durationSec: number; hasAudio: boolean; bytes: number }[] = [];
  for (const a of FABLE_ASPECTS) {
    const inputs: string[] = ["-i", spine];
    for (const p of capPngs) inputs.push("-i", p);
    inputs.push("-i", audioPath);
    const audioIdx = capPngs.length + 1;

    const parts: string[] = [];
    parts.push(`[0:v]${a.crop ? a.crop : "null"}[base]`);
    let prev = "base";
    for (let i = 0; i < cues.length; i++) {
      const next = i === cues.length - 1 ? "v" : `o${i}`;
      parts.push(
        `[${prev}][${i + 1}:v]overlay=x=0:y=${a.captionY}:enable='between(t,${cues[i].startSec.toFixed(3)},${cues[i].endSec.toFixed(3)})'[${next}]`,
      );
      prev = next;
    }
    const out = path.join(videoDir, ASPECT_FILE[a.key]);
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
    if (pr.width !== a.width || pr.height !== a.height) throw new Error(`voiceForge: ${a.key} rendered at ${pr.width}x${pr.height}, expected ${a.width}x${a.height}.`);
    if (!pr.hasAudio) throw new Error(`voiceForge: ${a.key} has NO audio stream — the Adam VO was dropped.`);
  }
  void W;
  void H;

  // 5 — provenance bundle (SOURCE alignment so a future caption re-render is FREE). Paths are
  // repo-relative (never absolute home paths) since the bundle is a data manifest.
  const bundle = {
    task: 871,
    leg: "voiced",
    paidCall: PAID,
    voiceProvider,
    voiceName: "Adam",
    voiceGender: "male",
    script,
    scriptChars: script.length,
    durationSec: Number(durationSec.toFixed(4)),
    narratedBeats: FORGE_NARRATION.map((s) => ({ beat: s.beat, kind: s.kind, clipSec: s.clipSec })),
    sceneEndTimesSec: sceneEndTimesSec.map((s) => Number(s.toFixed(4))),
    charEndTimesSec: charEndTimesSec.map((s) => Number(s.toFixed(4))),
    captionCount: cues.length,
    captions: cues.map((c) => ({ text: forgeCaptionDisplayText(c.text), startSec: Number(c.startSec.toFixed(3)), endSec: Number(c.endSec.toFixed(3)) })),
    audioPath: rel(audioPath),
    spine: rel(spine),
    renders: rendered.map((r) => ({ aspect: r.aspect, file: rel(r.file), width: r.width, height: r.height, durationSec: Number(r.durationSec.toFixed(3)), bytes: r.bytes })),
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(reviewDir, "forge-demo-vo-sync.json"), JSON.stringify(bundle, null, 2) + "\n", "utf8");

  fs.rmSync(work, { recursive: true, force: true });

  // Soft drift check — the voiced cut should land near the ~88s silent cut.
  if (durationSec < 80 || durationSec > 100) {
    console.warn(`  WARNING: VO duration ${durationSec.toFixed(2)}s is outside the ~80–100s expected window — eyeball length.`);
  }
  const voSource = PAID ? "real Adam synth (PAID)" : canReuse ? "reused real Adam VO (FREE — no paid call)" : "mock (re-run with FORGE_VOICE_PAID=1 for the real Adam synth)";
  console.log(scrub(`\n#871 forge VOICED: DONE — 3 aspects + sync bundle under out/review/forge-demo/. VO source: ${voSource}.\n`));
}

main().catch((err) => {
  console.error("#871 forge VOICED FAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
