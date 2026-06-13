/**
 * #824 Fable VOICED — add the PAID Adam voiceover + synced captions to the approved silent
 * 8-beat capture, then render the 3 publish aspects (9:16 / 1:1 / 4:5) + a mobile review proxy.
 *
 * This is LEG 2 over the LEG-1 capture (`tools/captureFable.ts`): it consumes the real captured
 * beat clips (`out/capture/beat-01..08.mp4`) — NOT a re-synthesized scene — and edits them into a
 * voiced cut. The ONE paid call is the ElevenLabs Adam synth (operator-approved, ~$0.15–0.30);
 * everything else (re-time, caption overlay, aspect crop, proxy) is free SYSTEM-ffmpeg work.
 *
 * Pipeline (all SYSTEM ffmpeg `/opt/homebrew/bin/ffmpeg` — the vendored remotion ffmpeg is
 * `--disable-filters`, so drawtext/crop/setpts must use the system binary):
 *   1. synth the Adam VO (paid, gated by FABLE_VOICE_PAID=1) → mp3 + real per-char timestamps.
 *   2. derive per-beat end-times from the alignment (`narrationSceneEndTimes`) + provenance-bind
 *      the audio to the alignment (`assertAudioMatchesSync`).
 *   3. re-time each captured beat clip (setpts) so it holds for EXACTLY its narration line, concat
 *      → a silent 9:16 spine whose length == the VO length.
 *   4. build synced captions (`buildDemoCaptionCues`, real-voice timing) — substitute Alpha→lfah for
 *      DISPLAY so captions match the chat bubble — and bake them as a thin drawtext band, PER ASPECT
 *      (so the band sits correctly in each frame), over the real footage; mux the Adam VO.
 *   5. write out/review/fable/fable-voiced-{9x16,1x1,4x5}.mp4 + a ≤8MB 9:16 mobile proxy + the
 *      VO alignment bundle (out/review/fable/fable-vo-sync.json) for provenance.
 *
 * out/ is gitignored — the renders + audio + bundle are NOT committed; this tool is.
 *
 * Run (FREE mock, NO paid call):  npx tsx tools/voiceFable.ts
 * Run (REAL, PAID Adam synth):    FABLE_VOICE_PAID=1 npx tsx tools/voiceFable.ts   ← operator-only.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";

import { synthesizeVoiceToFile } from "../adapters/voice";
import { makeSilentWav } from "../adapters/video";
import {
  FABLE_NARRATION,
  fableNarrationScript,
  fableCaptionDisplayText,
} from "../video/fableNarration";
import { narrationSceneEndTimes } from "../video/demoTimeline";
import { buildDemoCaptionCues } from "../video/demoCaptions";
import { assertAudioMatchesSync, audioDurationSec } from "../video/audioDuration";
import {
  type VoiceCaller,
  type VoiceClip,
  type SpeechRequest,
} from "../audio/voiceover";

// ── Geometry + binaries ────────────────────────────────────────────────────
const W = 1080;
const H = 1920;
const FPS = 30;
const FFMPEG = "/opt/homebrew/bin/ffmpeg";
const FFPROBE = "/opt/homebrew/bin/ffprobe";

// The system ffmpeg is built WITHOUT freetype (no `drawtext`/`subtitles`/`ass` filter — only
// `overlay`). So captions are baked as transparent alpha PNGs (rendered by Playwright at the frame
// width) and composited with the `overlay` filter — the approved alpha-overlay path, NOT a
// full-frame Remotion base. The caption band is a fixed 1080-wide strip; only the overlay Y changes
// per aspect, so ONE set of PNGs serves all three aspects.
const CAP_BAND_W = 1080;
const CAP_BAND_H = 240;

const PAID = process.env.FABLE_VOICE_PAID === "1";

// ── Aspect crop specs (center-crop the 9:16 spine to FILL each frame — no letterbox) ──────────
interface Aspect {
  key: string;
  fileName: string;
  width: number;
  height: number;
  /** Center-crop expression from the 1080×1920 spine ("" = no crop, native 9:16). */
  crop: string;
  /** Caption-band top Y in THIS aspect's frame (lower third, clear of the bottom edge). */
  captionY: number;
}
const ASPECTS: Aspect[] = [
  { key: "9:16", fileName: "fable-voiced-9x16.mp4", width: 1080, height: 1920, crop: "", captionY: 1430 },
  { key: "1:1", fileName: "fable-voiced-1x1.mp4", width: 1080, height: 1080, crop: `crop=1080:1080:0:${(1920 - 1080) / 2}`, captionY: 820 },
  { key: "4:5", fileName: "fable-voiced-4x5.mp4", width: 1080, height: 1350, crop: `crop=1080:1350:0:${(1920 - 1350) / 2}`, captionY: 1090 },
];

// ── ffmpeg/ffprobe helpers (system binaries) ────────────────────────────────
function ff(args: string[], label: string): void {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-loglevel", "error", ...args], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`voiceFable: ffmpeg failed (${label}): ${(r.stderr || r.stdout || "").slice(-800)}`);
  }
}

function probeDurationSec(p: string): number {
  const r = spawnSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", p], { encoding: "utf8" });
  const v = parseFloat((r.stdout || "").trim());
  if (!Number.isFinite(v)) throw new Error(`voiceFable: could not probe duration of ${p}`);
  return v;
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

/** Render one transparent caption PNG per cue (DISPLAY substitution Alpha→lfah). Returns paths. */
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
    await page.setContent(captionBandHtml(fableCaptionDisplayText(cues[i].text)), { waitUntil: "domcontentloaded" });
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
  const repoRoot = process.cwd();
  const captureDir = path.join(repoRoot, "out", "capture");
  const reviewDir = path.join(repoRoot, "out", "review", "fable");
  const audioDir = path.join(repoRoot, "out", "audio");
  fs.mkdirSync(reviewDir, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });

  // 0 — beat clips must exist (the LEG-1 capture must have run).
  const beatClips: string[] = [];
  for (let n = 1; n <= 8; n++) {
    const p = path.join(captureDir, `beat-${String(n).padStart(2, "0")}.mp4`);
    if (!fs.existsSync(p)) throw new Error(`voiceFable: missing captured beat clip ${p} — run \`npm run capture:fable\` first.`);
    beatClips.push(p);
  }
  if (beatClips.length !== FABLE_NARRATION.length) {
    throw new Error(`voiceFable: ${beatClips.length} beat clips but ${FABLE_NARRATION.length} narration segments — they must be 1:1.`);
  }

  const script = fableNarrationScript();
  console.log(`\n=== #824 Fable VOICED — ${FABLE_NARRATION.length} beats, ${script.length} script chars, ${PAID ? "PAID (real Adam synth)" : "FREE (mock alignment, NO paid call)"} ===\n`);

  // 1 — synth the Adam VO (paid only behind the gate; mock otherwise).
  const fileName = PAID ? "fable-vo.mp3" : "fable-vo.wav";
  const voice = await synthesizeVoiceToFile(
    { script },
    PAID ? undefined : { primary: mockVoiceCaller(85) },
    { outDir: audioDir, fileName },
  );
  console.log(`  ${voice.pathLine}`);
  const charEndTimesSec = voice.charEndTimesSec;
  if (!charEndTimesSec || charEndTimesSec.length === 0) throw new Error("voiceFable: no per-character alignment returned — cannot sync.");
  const durationSec = voice.durationSec;
  console.log(`  VO duration = ${durationSec.toFixed(2)}s (Adam, ${voice.usedProvider})`);

  // 2 — per-beat end-times from the alignment + provenance bind.
  const sceneEndTimesSec = narrationSceneEndTimes(FABLE_NARRATION, charEndTimesSec, durationSec);
  if (!sceneEndTimesSec) throw new Error("voiceFable: narrationSceneEndTimes returned null — the alignment did not line up with the script.");
  assertAudioMatchesSync(voice.audioPath, sceneEndTimesSec);
  const audioDur = audioDurationSec(voice.audioPath);
  console.log(`  per-beat end-times (s): ${sceneEndTimesSec.map((s) => s.toFixed(2)).join(", ")}`);
  console.log(`  assertAudioMatchesSync: PASS (audio=${audioDur?.toFixed(2) ?? "?"}s ≈ alignment end=${sceneEndTimesSec[sceneEndTimesSec.length - 1].toFixed(2)}s)`);

  // 3 — re-time each beat to its narration line, concat → silent 9:16 spine.
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "fable-voice-"));
  const retimed: string[] = [];
  let prevEnd = 0;
  for (let i = 0; i < beatClips.length; i++) {
    const target = sceneEndTimesSec[i] - prevEnd;
    prevEnd = sceneEndTimesSec[i];
    const srcDur = probeDurationSec(beatClips[i]);
    const factor = target / srcDur;
    const out = path.join(work, `retimed-${String(i + 1).padStart(2, "0")}.mp4`);
    ff([
      "-y", "-i", beatClips[i],
      "-vf", `setpts=${factor.toFixed(6)}*PTS,scale=${W}:${H}`,
      "-r", String(FPS), "-t", target.toFixed(3), "-an",
      "-c:v", "libx264", "-profile:v", "high", "-preset", "veryfast", "-crf", "18",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", out,
    ], `retime beat ${i + 1}`);
    retimed.push(out);
    console.log(`  beat ${i + 1}: ${srcDur.toFixed(2)}s → ${target.toFixed(2)}s (setpts ${factor.toFixed(3)})`);
  }

  const spine = path.join(work, "spine-9x16.mp4");
  const listPath = path.join(work, "concat.txt");
  fs.writeFileSync(listPath, retimed.map((p) => `file '${p}'`).join("\n"), "utf8");
  ff(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", spine], "concat spine");
  const spineDur = probeDurationSec(spine);
  console.log(`  silent spine: ${spineDur.toFixed(2)}s (target ${durationSec.toFixed(2)}s)`);

  // 4 — synced captions (real-voice timing), DISPLAY substitution Alpha→lfah, rendered as alpha PNGs.
  const cues = buildDemoCaptionCues(script, { durationSec, charEndTimesSec });
  console.log(`  captions: ${cues.length} cues (first="${fableCaptionDisplayText(cues[0].text)}" … last="${fableCaptionDisplayText(cues[cues.length - 1].text)}")`);
  const pngDir = fs.mkdtempSync(path.join(work, "caps-"));
  const { chromium } = await import("playwright");
  const capPngs = await renderCaptionPngs(cues, pngDir, chromium);

  // 5 — render each aspect (crop → overlay the timed caption PNGs → mux Adam VO).
  const rendered: { aspect: string; file: string; width: number; height: number; durationSec: number; hasAudio: boolean; bytes: number }[] = [];
  for (const a of ASPECTS) {
    // Inputs: 0 = spine, 1..N = caption PNGs, N+1 = audio.
    const inputs: string[] = ["-i", spine];
    for (const p of capPngs) inputs.push("-i", p);
    inputs.push("-i", voice.audioPath);
    const audioIdx = capPngs.length + 1;

    // Filter: crop the spine to the aspect, then chain one timed overlay per caption.
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
    const out = path.join(reviewDir, a.fileName);
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
    console.log(`  ${a.key} → ${path.relative(repoRoot, out)} (${pr.width}x${pr.height}, ${pr.durationSec.toFixed(2)}s, audio=${pr.hasAudio}, ${(bytes / 1048576).toFixed(2)}MB)`);
    if (pr.width !== a.width || pr.height !== a.height) throw new Error(`voiceFable: ${a.key} rendered at ${pr.width}x${pr.height}, expected ${a.width}x${a.height}.`);
    if (!pr.hasAudio) throw new Error(`voiceFable: ${a.key} has NO audio stream — the Adam VO was dropped.`);
  }

  // 6 — ≤8MB 9:16 mobile review proxy.
  const hero = rendered.find((r) => r.aspect === "9:16")!;
  const proxy = path.join(reviewDir, "fable-voiced-9x16-mobile.mp4");
  ff([
    "-y", "-i", hero.file,
    "-vf", "scale=-2:1280:flags=lanczos",
    "-c:v", "libx264", "-preset", "slow", "-crf", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "96k", proxy,
  ], "mobile proxy");
  const proxyBytes = fs.statSync(proxy).size;
  console.log(`  mobile proxy → ${path.relative(repoRoot, proxy)} (${(proxyBytes / 1048576).toFixed(2)}MB)`);

  // 7 — provenance bundle (SOURCE alignment so future caption renders are FREE — #775).
  const bundle = {
    task: 824,
    leg: 2,
    paidCall: PAID,
    voiceProvider: voice.usedProvider,
    voiceName: "Adam",
    voiceGender: "male",
    script,
    scriptChars: script.length,
    durationSec: Number(durationSec.toFixed(4)),
    sceneEndTimesSec: sceneEndTimesSec.map((s) => Number(s.toFixed(4))),
    charEndTimesSec: charEndTimesSec.map((s) => Number(s.toFixed(4))),
    captionCount: cues.length,
    captions: cues.map((c) => ({ text: fableCaptionDisplayText(c.text), startSec: Number(c.startSec.toFixed(3)), endSec: Number(c.endSec.toFixed(3)) })),
    audioPath: voice.audioPath,
    renders: rendered.map((r) => ({ aspect: r.aspect, file: path.relative(repoRoot, r.file), width: r.width, height: r.height, durationSec: Number(r.durationSec.toFixed(3)), bytes: r.bytes })),
    mobileProxy: { file: path.relative(repoRoot, proxy), bytes: proxyBytes },
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(reviewDir, "fable-vo-sync.json"), JSON.stringify(bundle, null, 2) + "\n", "utf8");

  fs.rmSync(work, { recursive: true, force: true });

  // soft drift check (the voiced cut should land near the ~85s silent cut).
  if (durationSec < 75 || durationSec > 100) {
    console.warn(`  WARNING: VO duration ${durationSec.toFixed(2)}s is outside the ~75–100s expected window — eyeball length.`);
  }
  console.log(`\n#824 Fable VOICED: DONE — 3 aspects + mobile proxy + sync bundle under out/review/fable/.${PAID ? "" : " (mock; re-run with FABLE_VOICE_PAID=1 for the real Adam synth)"}\n`);
}

main().catch((err) => {
  console.error("#824 Fable VOICED FAIL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
