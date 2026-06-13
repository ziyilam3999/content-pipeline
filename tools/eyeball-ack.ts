/**
 * #867 Leg 1 — `npm run eyeball:ack -- <videoPath> [--note "<who looked / what they checked>"]`.
 *
 * Record the human "I looked at the rendered pixels" ack for an artifact's EXACT current bytes. REQUIRES
 * that a contact sheet was already generated for those bytes (run `npm run eyeball:sheet -- <videoPath>`
 * and LOOK first). Writes `.ai-workspace/eyeball-ack-<sha>.json`, which `requireEyeballAck` checks
 * before any paid VO synth or live publish. A re-render changes the bytes → forces a fresh look.
 */

import * as path from "path";

import { recordEyeballAck } from "../video/eyeballAck";

function parseArgs(argv: string[]): { videoPath?: string; note?: string } {
  const out: { videoPath?: string; note?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--note") out.note = argv[++i];
    else if (!a.startsWith("--") && !out.videoPath) out.videoPath = a;
  }
  return out;
}

function main(): void {
  const { videoPath, note } = parseArgs(process.argv.slice(2));
  if (!videoPath) {
    console.error('usage: npm run eyeball:ack -- <videoPath> [--note "<note>"]');
    process.exit(2);
  }
  try {
    const p = recordEyeballAck(videoPath, { note });
    console.log(`\n#867 eyeball-ack recorded → ${p}\nThe paid/publish gate for ${path.basename(videoPath)} is now satisfied (for these exact bytes).`);
  } catch (err) {
    console.error(`#867 eyeball-ack FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
