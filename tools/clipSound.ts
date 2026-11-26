/**
 * Row A57 — thin CLI; apply lives in video/clipSound.ts
 * (run with: npx tsx tools/clipSound.ts apply ...).
 */
import { runCli } from "../video/clipSound";

const r = runCli(process.argv.slice(2));
if (r.out) process.stdout.write(r.out);
if (r.err) process.stderr.write(r.err);
process.exitCode = r.code;
