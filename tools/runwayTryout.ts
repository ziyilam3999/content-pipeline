/**
 * Row A52 — thin CLI; the logic lives in adapters/runway.ts
 * (run with: npm run video:tryout -- --plan tools/runway-tryout-plan.json
 *   --out <dir> --ledger <file> --ceiling-usd <n> [--clip <id> [--still <file>]] [--live]).
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
