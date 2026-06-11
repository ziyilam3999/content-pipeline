/**
 * BACKFILL the durable posts archive — run the pipeline's `archivePost` for every known launch post so
 * the durable archive is produced BY the machinery (idempotent over any hand-made archive — reconcile,
 * don't duplicate). Use this once to capture pre-existing posts, and any time the per-post archive SSOT
 * (`ARCHIVE_POSTS` in publish/postArchive.ts) changes.
 *
 * Usage:
 *   npm run archive:backfill                 (writes the real archive at CONFIG.publish.archiveDir)
 *   POSTS_ARCHIVE_DIR=/tmp/x npm run archive:backfill   (writes a temp archive — safe dry test)
 *
 * Resolves each post's copy JSON from the primary checkout's out/copy ($CONTENT_PIPELINE_PRIMARY or the
 * default clone). Makes NO network call. Idempotent: re-running updates records in place.
 */

import {
  ARCHIVE_POSTS,
  archivePost,
  buildArchiveRecord,
  resolveArchiveDir,
} from "../publish/postArchive";
import type { PostSlug } from "../publish/publishAssets";

function main() {
  const archiveDir = resolveArchiveDir();
  const slugs = Object.keys(ARCHIVE_POSTS) as PostSlug[];
  console.log(`Backfilling ${slugs.length} posts into durable archive: ${archiveDir}\n`);

  for (const slug of slugs) {
    const res = archivePost(buildArchiveRecord(slug));
    console.log(
      `  • ${slug.padEnd(20)} copy=${res.copyPath ? "written" : "MISSING-SOURCE"}  meta=${res.metaPath
        .split("/")
        .pop()}`,
    );
  }

  console.log(`\nARCHIVE-BACKFILL: done — index at ${archiveDir}/POSTS-ARCHIVE.md`);
}

main();
