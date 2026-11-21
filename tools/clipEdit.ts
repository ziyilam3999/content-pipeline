/**
 * Row A41-clip-cut — thin CLI; apply lives in video/clipEdit.ts, check in video/clipCheck.ts
 * (run with: npm run clip:edit -- apply ... | check ...).
 */
import { runCli } from "../video/clipEdit";
import { runCheckCli } from "../video/clipCheck";

const argv = process.argv.slice(2);
const r = argv[0] === "check" ? runCheckCli(argv) : runCli(argv);
if (r.out) process.stdout.write(r.out);
if (r.err) process.stderr.write(r.err);
process.exitCode = r.code;
