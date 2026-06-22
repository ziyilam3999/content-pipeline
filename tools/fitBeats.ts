/**
 * #1148 — `npm run fit-beats -- <slug>` : re-derive a video post's per-beat clip durations FROM its
 * measured VO, the supported VO-FIRST default path.
 *
 * Order: storyboard → script → synth the VO → MEASURE it (the cheap paid audio-only preview, #1096a,
 * caches the per-segment spoken lengths) → run this tool to DERIVE the beat spine via `fitBeatsToVo`
 * (breath 0 for TTS; the beat before a silent transition gets no breath) → paste the printed durations
 * back into the storyboard. Never pin the video to a fixed length and squeeze the VO in.
 *
 * Input: the post's measured-VO preview JSON. By slug it reads `out/review/<slug>/<slug>-vo-preview.json`
 * (the gitignored paid-preview output, key `measuredSpokenSec`). Because that file does not exist in a
 * fresh checkout / CI, the tool ALSO accepts an explicit path (`--preview <path>` or `FIT_BEATS_PREVIEW`)
 * so it is runnable against a committed fixture with no paid render — see tools/__tests__/fixtures.
 *
 * Optional preview-JSON fields (beyond `measuredSpokenSec`) shape the beat spine; all have safe defaults:
 *   transitionBeats?: number[]          // silent transition beat numbers (default: inferred gaps below)
 *   animMinByBeat?: Record<number,number> // animation-minimum floor for DYNAMIC clip beats
 *   transitionSec?: number              // silent transition length (default 1)
 * If `transitionBeats` is absent, any beat number in [min..max] that has NO measured length is treated as
 * a silent transition (matches the real kanban preview, where the transition beat 4 is simply absent from
 * `measuredSpokenSec`). PURE derivation — no paid call, no network; unit-tested against the fixture.
 */
import * as fs from "fs";
import * as path from "path";

import { fitBeatsToVo, BeatToFit, BeatsToVoFit } from "../video/voiceFit";

export interface PreviewForFit {
  measuredSpokenSec: Record<number, number>;
  transitionBeats?: number[];
  animMinByBeat?: Record<number, number>;
  transitionSec?: number;
}

export interface DerivedFit {
  preview: PreviewForFit;
  beats: BeatToFit[];
  fit: BeatsToVoFit;
}

/** Resolve the preview JSON path from an explicit path, the FIT_BEATS_PREVIEW env, or a slug. */
export function resolvePreviewPath(opts: { slug?: string; previewPath?: string }): string {
  const explicit = opts.previewPath ?? process.env.FIT_BEATS_PREVIEW;
  if (explicit) return explicit;
  if (!opts.slug) {
    throw new Error("fit-beats: provide a <slug>, --preview <path>, or FIT_BEATS_PREVIEW env.");
  }
  return path.join(process.cwd(), "out", "review", opts.slug, `${opts.slug}-vo-preview.json`);
}

/** Build the BeatToFit spine from a parsed preview + run fitBeatsToVo (VO-first default breath 0). */
export function deriveFit(preview: PreviewForFit): DerivedFit {
  const measured = preview.measuredSpokenSec ?? {};
  const measuredNums = Object.keys(measured).map((k) => Number(k));
  if (measuredNums.length === 0) {
    throw new Error("fit-beats: preview JSON has no `measuredSpokenSec` entries — run the paid audio-only preview first.");
  }
  const explicitTransitions = new Set((preview.transitionBeats ?? []).map((n) => Number(n)));
  const animMin = preview.animMinByBeat ?? {};
  const lo = Math.min(...measuredNums, ...(preview.transitionBeats ?? []));
  const hi = Math.max(...measuredNums, ...(preview.transitionBeats ?? []));

  const beats: BeatToFit[] = [];
  for (let n = lo; n <= hi; n++) {
    const narrated = Object.prototype.hasOwnProperty.call(measured, n);
    // A gap in the measured sequence (or an explicitly listed beat) is a silent transition.
    const transition = explicitTransitions.has(n) || (!narrated && n > lo && n < hi);
    if (!narrated && !transition) continue; // a number with no role (shouldn't happen for a real post)
    const floor = animMin[n];
    beats.push({ n, narrated, transition, ...(floor ? { animMinSec: Number(floor) } : {}) });
  }

  const fit = fitBeatsToVo({
    beats,
    measuredSpokenSec: measured,
    // breath omitted → the #1148 VO-first default of 0.
    transitionSec: preview.transitionSec ?? 1,
  });
  return { preview, beats, fit };
}

/** Read + parse a preview JSON file into the fields fit-beats needs. */
export function readPreviewForFit(filePath: string): PreviewForFit {
  if (!fs.existsSync(filePath)) {
    throw new Error(`fit-beats: preview JSON not found at ${filePath}. Run the paid audio-only preview (it caches measuredSpokenSec), or pass --preview <path> to a fixture.`);
  }
  const j = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!j || typeof j.measuredSpokenSec !== "object") {
    throw new Error(`fit-beats: ${filePath} has no \`measuredSpokenSec\` map.`);
  }
  return j as PreviewForFit;
}

/** A paste-ready, human-readable rendering of the derived durations. */
export function formatDerived(d: DerivedFit, sourceLabel: string): string {
  const lines: string[] = [];
  lines.push(`# fit-beats — VO-first derived durations (breath 0, pre-transition no breath)`);
  lines.push(`# source: ${sourceLabel}`);
  lines.push(`# total: ${d.fit.totalSec}s   worst trailing silence (maxPadSec): ${d.fit.maxPadSec}s`);
  lines.push(``);
  lines.push(`const CLIP_SEC_BY_BEAT: Record<number, number> = {`);
  for (const b of d.fit.beats) {
    const meta = b.measuredSec > 0
      ? `measured ${b.measuredSec}s + pad ${b.padSec}s${b.clampedToAnimMin ? " (clamped to animMin)" : ""}`
      : `silent transition`;
    lines.push(`  ${b.n}: ${b.clipSec},  // ${meta}`);
  }
  lines.push(`};`);
  return lines.join("\n");
}

function parseArgs(argv: string[]): { slug?: string; previewPath?: string } {
  const out: { slug?: string; previewPath?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--preview") {
      out.previewPath = argv[++i];
    } else if (!a.startsWith("--") && !out.slug) {
      out.slug = a;
    }
  }
  return out;
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  let previewPath: string;
  try {
    previewPath = resolvePreviewPath(opts);
  } catch (e) {
    console.error(String((e as Error).message));
    process.exit(2);
    return;
  }
  let preview: PreviewForFit;
  try {
    preview = readPreviewForFit(previewPath);
  } catch (e) {
    console.error(String((e as Error).message));
    process.exit(2);
    return;
  }
  const derived = deriveFit(preview);
  console.log(formatDerived(derived, previewPath));
}

// Run only when invoked as a script (not when imported by the test).
if (require.main === module) {
  main();
}
