/**
 * Row A52 — thin CLI; the logic lives in adapters/runway.ts
 * (run with: npm run video:tryout -- and the options below).
 * Required:
 *   --plan <file> — the run plan (tools/runway-tryout-plan.json)
 *   --out <dir> — where a live run writes the clip
 *   --ledger <file> — the spend record
 *   --ceiling-usd <n> — the AI video cap for this run
 * Optional:
 *   --clip <id> — one clip of the plan
 *   --still <file> — the still image of an image_to_video clip
 *   --timeout-seconds <n> — the poll timeout (default 900)
 *   --live — send the one call (needs --clip)
 * Dry run is the default: it reads no key, sends nothing and writes nothing.
 */
import { runRunwayTryout } from "../adapters/runway";

runRunwayTryout(process.argv.slice(2)).then(
  (r) => {
    if (r.out) process.stdout.write(r.out);
    if (r.err) process.stderr.write(r.err);
    process.exitCode = r.code;
  },
  (e) => {
    process.stderr.write(`runway: error: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  },
);
