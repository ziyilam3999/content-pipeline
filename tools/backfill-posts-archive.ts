/**
 * BACKFILL the durable posts archive — run the pipeline's dual-write `archivePostAll` for every known
 * launch post so BOTH durable homes are produced BY the machinery (idempotent over any hand-made
 * archive — reconcile, don't duplicate): the EXTERNAL non-repo archive AND the IN-REPO git-tracked
 * mirror (`.ai-workspace/posts`, #821). Use this once to capture pre-existing posts, and any time the
 * per-post archive SSOT (`ARCHIVE_POSTS` in publish/postArchive.ts) changes.
 *
 * Usage:
 *   npm run archive:backfill                 (writes the real archives — external + in-repo)
 *   POSTS_ARCHIVE_DIR=/tmp/x npm run archive:backfill          (temp EXTERNAL archive — safe dry test)
 *   POSTS_INREPO_ARCHIVE_DIR=/tmp/y npm run archive:backfill   (temp IN-REPO mirror — safe dry test)
 *
 * Resolves each post's copy JSON from the primary checkout's out/copy ($CONTENT_PIPELINE_PRIMARY or the
 * default clone). Makes NO network call. Idempotent: re-running updates records in place.
 */

import {
  ARCHIVE_POSTS,
  archivePostAll,
  buildArchiveRecord,
  resolveArchiveDir,
  resolveInRepoArchiveDir,
} from "../publish/postArchive";
import type { PostSlug } from "../publish/publishAssets";

function main() {
  const externalDir = resolveArchiveDir();
  const inRepoDir = resolveInRepoArchiveDir();
  const slugs = Object.keys(ARCHIVE_POSTS) as PostSlug[];
  console.log(
    `Backfilling ${slugs.length} posts into BOTH durable homes:\n  external: ${externalDir}\n  in-repo:  ${inRepoDir}\n`,
  );

  for (const slug of slugs) {
    const res = archivePostAll(buildArchiveRecord(slug));
    console.log(
      `  • ${slug.padEnd(20)} copy=${res.inRepo.copyPath ? "written" : "MISSING-SOURCE"}  meta=${res.inRepo.metaPath
        .split("/")
        .pop()}`,
    );
  }

  console.log(
    `\nARCHIVE-BACKFILL: done — external index ${externalDir}/POSTS-ARCHIVE.md ; in-repo index ${inRepoDir}/POSTS-ARCHIVE.md`,
  );
}

main();
