/**
 * Row A41-clip-intake — thin CLI; the logic lives in video/clipIntake.ts
 * (run with: node_modules/.bin/tsx tools/clipIntake.ts).
 */
import { runCli } from "../video/clipIntake";

process.exit(runCli(process.argv.slice(2)));
