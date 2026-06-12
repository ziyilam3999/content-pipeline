/**
 * #824 — publish-clean path-scrub test (RED→GREEN).
 *
 * Before the fix, the image / demo-frames smokes printed `process.cwd()`-absolute (and `/var/folders/`
 * tmp) paths straight to stdout, so the captured VHS frame leaked the real username. This proves the
 * `toRepoRelative` formatter the smokes now use yields a repo-relative path and NEVER emits an absolute
 * `/Users/` or `/var/folders/` segment — for BOTH an in-repo path and an outside-the-repo tmp path.
 *
 * (Red against master: `smoke/relpath.ts` does not exist there, so this suite fails to import/run.)
 */

import * as os from "os";
import * as path from "path";

import { toRepoRelative, REPO_ROOT } from "../relpath";

/** A formatted path is publish-clean iff it has no absolute home/username/tmp segment. */
function assertPublishClean(formatted: string): void {
  expect(formatted).not.toMatch(/\/Users\//);
  expect(formatted).not.toMatch(/\/var\/folders\//);
  expect(formatted).not.toMatch(/^\//); // never an absolute path
}

describe("#824 toRepoRelative — publish-clean smoke output", () => {
  it("an IN-REPO absolute path → repo-relative (e.g. out/review/...), no absolute segment", () => {
    const abs = path.join(REPO_ROOT, "out", "review", "demo-frames", "demo.mp4");
    const rel = toRepoRelative(abs);
    expect(rel).toBe("out/review/demo-frames/demo.mp4");
    assertPublishClean(rel);
  });

  it("an OS tmp path (/var/folders/...) → scrubbed <tmp>/<basename>, no /var/folders/ leak", () => {
    const tmp = path.join(os.tmpdir(), "demo-frames-smoke-abc123", "step-0.png");
    const rel = toRepoRelative(tmp);
    expect(rel).toBe("<tmp>/step-0.png");
    assertPublishClean(rel);
  });

  it("a /Users/<name>/... path outside the repo is scrubbed (no username leak)", () => {
    const homey = "/Users/somebody/coding_projects/other-repo/out/card-1x1.png";
    const rel = toRepoRelative(homey);
    expect(rel).toBe("<tmp>/card-1x1.png");
    assertPublishClean(rel);
  });

  it("the repo root itself maps to '.'", () => {
    expect(toRepoRelative(REPO_ROOT)).toBe(".");
  });
});
