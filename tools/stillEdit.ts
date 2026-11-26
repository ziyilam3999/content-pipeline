/**
 * Row A52c — thin CLI; the logic lives in adapters/stillEdit.ts
 * (run with: npm run still:edit -- and the options below).
 * Required:
 *   --plan <file> — the run plan (tools/still-edit-plan.json)
 *   --item <id> — one item of the plan (one run handles one item)
 *   --out <dir> — where a live run writes the image
 *   --ledger <file> — the spend record
 *   --ceiling-usd <n> — a ceiling on the total of the spend record for this run (at most
 *     PAID_SPEND_CAP_USD of adapters/videogen.ts)
 * Optional:
 *   --in <png or jpeg> — the still to edit; with it the call is an edit, without it text to image
 *   --timeout-seconds <n> — the limit of the call (default 120)
 *   --live — send the one call
 * Dry run is the default: it reads no key, sends nothing and writes nothing.
 */
import { runStillEdit } from "../adapters/stillEdit";

runStillEdit(process.argv.slice(2)).then(
  (r) => {
    if (r.out) process.stdout.write(r.out);
    if (r.err) process.stderr.write(r.err);
    process.exitCode = r.code;
  },
  (e) => {
    process.stderr.write(`still: error: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  },
);
