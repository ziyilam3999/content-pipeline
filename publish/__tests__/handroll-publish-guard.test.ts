/**
 * #1063 — ANTI-HAND-ROLL PUBLISH GUARD (root-cause-ritual bake).
 *
 * The Typefully adapter's `createDraft` / `uploadMedia` (the only two operations that POST a draft
 * or upload media to Typefully) may be REFERENCED only from:
 *   - the adapter that defines them (`adapters/typefully.ts`),
 *   - the sanctioned per-post RUNBOOKS (`smoke/publish-typefully-*.ts`), and
 *   - tests.
 *
 * Any OTHER file referencing them is a HAND-ROLLED publish path that bypasses the established system
 * (the `publishAssets.ts` slug registry → `freeze-manifest` → dry-run → the provenance / copy-limit /
 * video-first / hero-aspect / eyeball-ack gates). That is exactly the mistake caught on 2026-06-20:
 * the kanban demo was nearly published by a one-off ad-hoc script instead of through the system.
 * See memory `feedback_study_pipeline_system_end_to_end_before_handrolling_any_step`.
 *
 * Both ends are objective: the recurrence-condition (a reference outside the allowlist) and the
 * fix-landed signal (no such reference) are pure greps over committed source — Rule-17 mechanical.
 */
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const ALLOW = [
  /adapters[/\\]typefully\.ts$/, // defines createDraft + uploadMedia
  /(^|[/\\])smoke[/\\]/, // the sanctioned publish/verify flow home (smoke/publish-typefully-*, verify-published, ...)
  /\.test\.ts$/, // tests (incl. this file)
  /[/\\]__tests__[/\\]/, // tests
];
const PATTERN = /\b(createDraft|uploadMedia)\b/;

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

// Enumerate only TRACKED source via `git ls-files` (respects .gitignore → never scans untracked
// scratch like tmp/ or .ai-workspace/). This matches the guard's "committed source" property and
// makes local == CI. Paths are repo-root-relative POSIX (forward slashes) on every OS.
function trackedSourceFiles(): string[] {
  return git(["ls-files"])
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((p) => p.endsWith(".ts") || p.endsWith(".tsx"));
}

describe("#1063 hand-rolled-publish guard", () => {
  it("createDraft/uploadMedia are referenced ONLY from the adapter, the smoke runbooks, and tests", () => {
    const offenders: string[] = [];
    for (const rel of trackedSourceFiles()) {
      if (ALLOW.some((re) => re.test(rel))) continue;
      if (PATTERN.test(fs.readFileSync(path.join(REPO_ROOT, rel), "utf8"))) offenders.push(rel);
    }
    // A NEW file calling the Typefully publish ops (a hand-rolled publish) lands here → FAIL.
    // Fix: route the publish through a smoke/publish-typefully-<slug>.ts runbook instead.
    expect(offenders).toEqual([]);
  });
});
