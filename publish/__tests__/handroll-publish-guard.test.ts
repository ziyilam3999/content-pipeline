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
import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
// Scan the WHOLE repo — no hardcoded dir list to omit a caller (e.g. pipeline/, remotion/) — minus build/vendor noise.
const SKIP = /(^|[/\\])(node_modules|\.next|out|dist|coverage|\.git|\.claude)([/\\]|$)/;
const ALLOW = [
  /adapters[/\\]typefully\.ts$/, // defines createDraft + uploadMedia
  /(^|[/\\])smoke[/\\]/, // the sanctioned publish/verify flow home (smoke/publish-typefully-*, verify-published, ...)
  /\.test\.ts$/, // tests (incl. this file)
  /[/\\]__tests__[/\\]/, // tests
];
const PATTERN = /\b(createDraft|uploadMedia)\b/;

function walk(dir: string, acc: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    // Test SKIP against the path RELATIVE to the repo root — else the repo's OWN location
    // (e.g. a worktree under .claude/) would match SKIP and silently skip the whole tree (false pass).
    if (SKIP.test(path.relative(REPO_ROOT, p))) continue;
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) acc.push(p);
  }
}

describe("#1063 hand-rolled-publish guard", () => {
  it("createDraft/uploadMedia are referenced ONLY from the adapter, the smoke runbooks, and tests", () => {
    const files: string[] = [];
    walk(REPO_ROOT, files);
    const offenders: string[] = [];
    for (const f of files) {
      const rel = path.relative(REPO_ROOT, f);
      if (ALLOW.some((re) => re.test(rel))) continue;
      if (PATTERN.test(fs.readFileSync(f, "utf8"))) offenders.push(rel);
    }
    // A NEW file calling the Typefully publish ops (a hand-rolled publish) lands here → FAIL.
    // Fix: route the publish through a smoke/publish-typefully-<slug>.ts runbook instead.
    expect(offenders).toEqual([]);
  });
});
