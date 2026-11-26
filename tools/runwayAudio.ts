/**
 * Row A57 — thin CLI; the logic lives in adapters/runwayAudio.ts
 * (run with: npm run runway:audio -- and the options below).
 * The first argument is the verb; this file builds swap and refuses another verb with usage.
 * Required:
 *   swap — the verb: one Runway speech_to_speech call for the sound of --in
 *   --in <file> — a clip with sound, or a sound file; its first sound stream is sent
 *   --voice <preset id> — one preset voice id, an exact match of the list in the adapter
 *   --remove-noise <true|false> — removeBackgroundNoise of the request
 *   --plan-id <id> — the plan this swap belongs to (1 to 120 characters)
 *   --out <dir> — where a live run writes the swapped sound
 *   --ledger <file> — the spend record
 *   --ceiling-usd <n> — a ceiling on the total of the spend record for this run (at most
 *     PAID_SPEND_CAP_USD of adapters/videogen.ts)
 * Optional:
 *   --timeout-seconds <n> — the limit of each call and of the poll (default 900)
 *   --live — send the one request
 * Dry run is the default: it reads no key, sends nothing and writes nothing.
 */
import { runRunwayAudio } from "../adapters/runwayAudio";

runRunwayAudio(process.argv.slice(2)).then(
  (r) => {
    if (r.out) process.stdout.write(r.out);
    if (r.err) process.stderr.write(r.err);
    process.exitCode = r.code;
  },
  (e) => {
    process.stderr.write(`runway-audio: error: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  },
);
