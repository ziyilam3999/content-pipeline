/**
 * #1068 — ANTI-HAND-ROLL YOUTUBE PUBLISH GUARD (mirrors #1063's Typefully guard).
 *
 * The YouTube adapter's `uploadVideo` (the only operation that PUTs video bytes to YouTube via the
 * resumable `videos.insert` protocol) may be REFERENCED only from:
 *   - the adapter that defines it (`adapters/youtube.ts`),
 *   - the sanctioned YouTube publish smoke (`smoke/publish-youtube*.ts`), and
 *   - tests.
 *
 * Any OTHER file referencing it is a HAND-ROLLED upload path that bypasses the established system
 * (the `publishAssets.ts` slug registry → the dry-run smoke → the YOUTUBE_LIVE gate → the per-upload-go
 * incremental-safety controls). See memory `feedback_study_pipeline_system_end_to_end_before_handrolling_any_step`.
 *
 * Both ends are objective: the recurrence-condition (a reference outside the allowlist) and the
 * fix-landed signal (no such reference) are pure greps over committed source — Rule-17 mechanical.
 */
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const ALLOW = [
  /adapters[/\\]youtube\.ts$/, // defines uploadVideo (the resumable videos.insert upload)
  /(^|[/\\])smoke[/\\]publish-youtube.*\.ts$/, // the sanctioned YouTube publish runbook(s)
  /\.test\.ts$/, // tests (incl. this file)
  /[/\\]__tests__[/\\]/, // tests
];
const PATTERN = /\buploadVideo\b/;

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

describe("#1068 hand-rolled-youtube-publish guard", () => {
  it("uploadVideo is referenced ONLY from the adapter, the YouTube smoke, and tests", () => {
    const offenders: string[] = [];
    for (const rel of trackedSourceFiles()) {
      if (ALLOW.some((re) => re.test(rel))) continue;
      if (PATTERN.test(fs.readFileSync(path.join(REPO_ROOT, rel), "utf8"))) offenders.push(rel);
    }
    // A NEW file calling the YouTube upload op (a hand-rolled upload) lands here → FAIL.
    // Fix: route the upload through smoke/publish-youtube.ts (YOUTUBE_LIVE=1) instead.
    expect(offenders).toEqual([]);
  });

  it("the allowlist + pattern are the both-ends — the guard would CATCH a stray reference", () => {
    // Prove the detector is real: a hand-rolled path NOT in the allowlist that references uploadVideo
    // must be flagged. (Guards against an over-broad ALLOW that silently passes everything.)
    const strayRel = "pipeline/hand-rolled-youtube.ts";
    const isAllowed = ALLOW.some((re) => re.test(strayRel));
    expect(isAllowed).toBe(false);
    expect(PATTERN.test("await client.uploadVideo({ filePath, metadata });")).toBe(true);
  });
});
