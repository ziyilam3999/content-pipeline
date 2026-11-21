/**
 * Row A41-clip-cut — thin CLI; the logic lives in video/clipEdit.ts
 * (run with: npm run clip:edit -- apply --spec <file> --clips <dir> --intake <dir> --out <dir>).
 */
import { runCli } from "../video/clipEdit";

const r = runCli(process.argv.slice(2));
if (r.out) process.stdout.write(r.out);
if (r.err) process.stderr.write(r.err);
process.exitCode = r.code;
