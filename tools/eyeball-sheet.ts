/**
 * #867 Leg 1 — `npm run eyeball:sheet -- <videoPath> [--slug <slug>]`.
 *
 * Generate the per-beat contact sheet for a produced video so a human can LOOK at the pixels in 2
 * seconds before the paid/publish step. Beats are derived from the demo timeline's scenes when the
 * video is a known demo cut; otherwise we fall back to N evenly-spaced beats over the video duration
 * (probed via the vendored ffmpeg). Prints the greppable EYEBALL-SHEET / EYEBALL-HASH lines.
 *
 * After looking at out/review/<slug>/eyeball/<sha>/sheet.png, ack it with:
 *   npm run eyeball:ack -- <videoPath>
 */

import * as path from "path";

import { generateContactSheet, beatsFromScenes, type ContactSheetBeat } from "../video/contactSheet";
import { probeRender } from "../video/renderProbe";
import { buildDemoTimeline } from "../video/demoTimeline";
import { lfahSpec } from "../smoke/lfahSpec";

function parseArgs(argv: string[]): { videoPath?: string; slug?: string; beatsN?: number } {
  const out: { videoPath?: string; slug?: string; beatsN?: number } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--slug") out.slug = argv[++i];
    else if (a === "--beats") out.beatsN = Number(argv[++i]);
    else if (!a.startsWith("--") && !out.videoPath) out.videoPath = a;
  }
  return out;
}

/** Evenly-spaced fallback beats over a probed duration, when no timeline scenes are available. */
function evenBeats(durationSec: number, n: number): ContactSheetBeat[] {
  const count = Math.max(1, n);
  const span = durationSec / count;
  const beats: ContactSheetBeat[] = [];
  for (let i = 0; i < count; i++) {
    beats.push({ label: `beat-${i + 1}`, fromSec: i * span, durationSec: span });
  }
  return beats;
}

function main(): void {
  const { videoPath, slug, beatsN } = parseArgs(process.argv.slice(2));
  if (!videoPath) {
    console.error("usage: npm run eyeball:sheet -- <videoPath> [--slug <slug>] [--beats <N>]");
    process.exit(2);
  }

  // Prefer the real demo timeline scenes for representative beat midpoints; fall back to even beats.
  let beats: ContactSheetBeat[];
  try {
    const probe = probeRender(videoPath);
    const timeline = buildDemoTimeline(lfahSpec(), { durationSec: probe.videoDurationSec });
    // Only use the timeline scenes if their span roughly matches the actual clip (same cut).
    const timelineSpan = timeline.scenes.reduce((s, sc) => Math.max(s, sc.fromSec + sc.durationSec), 0);
    if (Math.abs(timelineSpan - probe.videoDurationSec) <= 1.5) {
      beats = beatsFromScenes(timeline.scenes);
    } else {
      beats = evenBeats(probe.videoDurationSec, beatsN ?? Math.min(8, timeline.scenes.length || 6));
    }
  } catch {
    // Probe failed (unknown container) — use a fixed even fallback.
    beats = evenBeats(60, beatsN ?? 6);
  }

  const res = generateContactSheet(videoPath, beats, { slug: slug ?? "demo" });
  console.log(
    `\n#867 contact sheet ready — ${res.manifest.frameCount} beats tiled ${res.manifest.grid.cols}x${res.manifest.grid.rows}.\n` +
      `  LOOK: ${res.sheetPath}\n` +
      `  index: ${res.indexPath}\n` +
      `Then, if the pixels look right:  npm run eyeball:ack -- ${path.resolve(videoPath)}`,
  );
}

main();
