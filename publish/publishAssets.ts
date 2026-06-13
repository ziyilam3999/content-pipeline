/**
 * #810 — Per-post PUBLISH-ASSET SSOT.
 *
 * The ONE place that lists which rendered files each launch post actually PUBLISHES, with each
 * file's role. Read by BOTH the freeze step (`tools/freeze-publish-manifest.ts`, which snapshots
 * these files' hashes from the durable approved bundle) and the publish smokes (which resolve each
 * basename to the file they upload and assert it against the frozen manifest). Keeping freeze and
 * publish reading from ONE list is what prevents them silently diverging on which assets matter.
 *
 * NOTE: this lists only the files that are UPLOADED. e.g. Post #1's `card-tweet-1.png` exists in the
 * bundle but tweet 1 is the video hook, so it is NOT a published asset and is intentionally absent.
 */

import * as os from "os";
import * as path from "path";

export type PostSlug =
  | "lfah-post1"
  | "lfah-post2"
  | "forge-harness-post3"
  | "content-pipeline-demo-post4";

/** The role of a published asset — drives the hero-aspect/fidelity story + clearer error messages. */
export type AssetRole = "hero-video" | "card";

export interface PostAssetRef {
  role: AssetRole;
  /** The file's basename (unique within a post — manifests are keyed by basename). */
  basename: string;
}

export interface PostAssetSpec {
  slug: PostSlug;
  /**
   * The DURABLE, operator-approved launch bundle the freeze step hashes from (the canonical copies).
   * The publish smokes read the SAME files from the gitignored `out/review/...` working dirs, so any
   * drift between the working dir and this approved bundle is exactly what the provenance gate catches.
   * Override at freeze time with `--from <dir>`.
   */
  defaultBundleDir: string;
  assets: PostAssetRef[];
}

const LAUNCH_ASSETS_ROOT = path.join(os.homedir(), "coding_projects", "_launch-assets");

export const POST_ASSETS: Record<PostSlug, PostAssetSpec> = {
  "lfah-post1": {
    slug: "lfah-post1",
    defaultBundleDir: path.join(LAUNCH_ASSETS_ROOT, "lfah-20260610"),
    assets: [
      { role: "hero-video", basename: "demo-9x16.mp4" }, // full-bleed 9:16 hero — leads X + Threads
      { role: "card", basename: "card-tweet-2.png" },
      { role: "card", basename: "card-tweet-3.png" },
      { role: "card", basename: "card-tweet-4.png" },
      { role: "card", basename: "card-tweet-5.png" },
      { role: "card", basename: "card-over-art-4x5.png" }, // Threads infographic card
    ],
  },
  "lfah-post2": {
    slug: "lfah-post2",
    defaultBundleDir: path.join(LAUNCH_ASSETS_ROOT, "lfah-post2-20260610"),
    assets: [
      { role: "hero-video", basename: "builder-demo-9x16.mp4" }, // full-bleed 9:16 builder hero
      { role: "card", basename: "card-post2-A.png" },
      { role: "card", basename: "card-post2-B.png" },
      { role: "card", basename: "card-post2-C.png" },
    ],
  },
  "forge-harness-post3": {
    slug: "forge-harness-post3",
    defaultBundleDir: path.join(LAUNCH_ASSETS_ROOT, "forge-harness-post3-20260611"),
    assets: [
      { role: "hero-video", basename: "post3-demo-9x16.mp4" }, // full-bleed 9:16 forge-harness hero
      { role: "card", basename: "card-post3-A.png" },
      { role: "card", basename: "card-post3-B.png" },
      { role: "card", basename: "card-post3-C.png" },
    ],
  },
  // Post #4 — content-pipeline DEMONSTRATION post (#824). This is a VIDEO-LED + TEXT post: the 85s
  // voiced Fable-style demo IS the hero/demo, and the X body tweets + the Threads post are TEXT (the
  // video carries the visual). So the ONLY published/uploaded asset is the full-bleed 9:16 hero video
  // — there are NO cards (a deliberate demo-category structure, distinct from the introduction posts
  // above which split the lead into a video hook + card body tweets). The canonical voiced render is
  // `fable-voiced-9x16.mp4` (the #794 hero cut); its mobile proxy / 1x1 / 4x5 siblings are NOT uploaded.
  "content-pipeline-demo-post4": {
    slug: "content-pipeline-demo-post4",
    defaultBundleDir: path.join(LAUNCH_ASSETS_ROOT, "content-pipeline-demo-post4-20260613"),
    assets: [
      { role: "hero-video", basename: "fable-voiced-9x16.mp4" }, // full-bleed 9:16 voiced demo hero
    ],
  },
};

/** Type-guard: is `s` a known post slug? */
export function isPostSlug(s: string): s is PostSlug {
  return (
    s === "lfah-post1" ||
    s === "lfah-post2" ||
    s === "forge-harness-post3" ||
    s === "content-pipeline-demo-post4"
  );
}
