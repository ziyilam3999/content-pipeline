/**
 * #824 — publish-clean path formatter for smoke stdout shown in a VHS capture frame.
 *
 * Smoke scripts print the path of the file they produced. Printing the ABSOLUTE path leaks the real
 * username (`/Users/<name>/…`) or an OS tmp dir (`/var/folders/…`) onto the captured frame — not
 * publish-clean. (The capture tape's neutral `~/demo/pipeline` cwd does NOT help: Node resolves the
 * symlinked cwd to its physical path, so the absolute path is real and username-bearing.)
 *
 * `toRepoRelative` returns the path RELATIVE to the repo root for anything inside the repo
 * (e.g. `out/review/demo-frames/demo.mp4`), and a scrubbed `<tmp>/<basename>` for anything OUTSIDE it
 * (an OS tmp dir) — so NEITHER an absolute `/Users/` NOR a `/var/folders/` segment can ever appear.
 *
 * PURE + deterministic — safe to import from jest (no IO beyond a best-effort realpath).
 */

import * as fs from "fs";
import * as path from "path";

/** realpath if the path exists (collapses symlinks so cwd-derived + __dirname-derived roots agree); else just resolve. */
function realpathSafe(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/** The repo root = the parent of this `smoke/` dir, realpath'd so it matches a realpath'd cwd. */
export const REPO_ROOT = realpathSafe(path.resolve(__dirname, ".."));

/**
 * Format an absolute path for human-facing capture output: repo-relative when inside the repo, a
 * scrubbed `<tmp>/<basename>` when outside it. The result NEVER contains an absolute `/Users/` or
 * `/var/folders/` segment.
 */
export function toRepoRelative(absPath: string, repoRoot: string = REPO_ROOT): string {
  const root = realpathSafe(repoRoot);
  const abs = realpathSafe(absPath);
  const rel = path.relative(root, abs);
  // Outside the repo (rel escapes upward or stays absolute) — e.g. an OS tmp dir. Never echo the real
  // absolute/username-bearing path; show only a neutral tmp label + the basename.
  if (rel === "" ) return ".";
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return path.posix.join("<tmp>", path.basename(abs));
  }
  // Normalize to forward slashes so the frame reads the same on any OS.
  return rel.split(path.sep).join("/");
}
