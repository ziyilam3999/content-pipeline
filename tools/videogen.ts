/**
 * Row A48 — thin CLI; the logic lives in adapters/videogen.ts
 * (run with: npm run video:gen -- --prompt <file> --model <id> --seconds <n>
 *   --resolution <r> --aspect 9:16 --out <dir> --ledger <file> --ceiling-usd <n> [--live]).
 */
import { runVideoGen } from "../adapters/videogen";

runVideoGen(process.argv.slice(2)).then(
  (r) => {
    if (r.out) process.stdout.write(r.out);
    if (r.err) process.stderr.write(r.err);
    process.exitCode = r.code;
  },
  (e) => {
    process.stderr.write(`video-gen: error: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  },
);
