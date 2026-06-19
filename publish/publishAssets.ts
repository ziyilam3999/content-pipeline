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
  | "content-pipeline-demo-post4"
  | "three-role-model-post5"
  | "forge-demo-871"
  | "ui-evolve";

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
  // Post #4 — content-pipeline DEMONSTRATION post (#824). The 85s voiced Fable-style demo IS the
  // hero/demo (tweet 1 + the Threads lead). The operator chose PER-TWEET CARDS for the body (like
  // posts #1-#3) so the post passes the #797 consolidated fidelity gate: the X body tweets (2-4) each
  // carry their own card-over-art still, and the Threads post carries a card alongside the hero video.
  // The hero is the full-bleed 9:16 voiced cut (`fable-voiced-9x16.mp4`, #794); the three body cards
  // (`card-post4-{A,B,C}.png`, 1:1) render over the demo's deterministic branded navy gradient — FREE,
  // no generative art (#824 free-first). The hero's mobile proxy / 1x1 / 4x5 siblings are NOT uploaded.
  "content-pipeline-demo-post4": {
    slug: "content-pipeline-demo-post4",
    defaultBundleDir: path.join(LAUNCH_ASSETS_ROOT, "content-pipeline-demo-post4-20260613"),
    assets: [
      { role: "hero-video", basename: "fable-voiced-9x16.mp4" }, // full-bleed 9:16 voiced demo hero
      { role: "card", basename: "card-post4-A.png" }, // tweet 2 — "One ask → the whole post"
      { role: "card", basename: "card-post4-B.png" }, // tweet 3 — "A built-in fact-checker"
      { role: "card", basename: "card-post4-C.png" }, // tweet 4 — "Run by an agent, not a person"
    ],
  },
  // Post #5 — the "3-role development model" INTRODUCTION post. The ~90s voiced demo IS the hero
  // (tweet 1 + the Threads lead); the X body tweets (2-4) each carry their own card-over-art still.
  // The hero is the full-bleed 9:16 voiced cut (`post5-demo-9x16.mp4`, #794); the three body cards
  // (`card-post5-{A,B,C}.png`) render over the post's shared generative art base. The hero's mobile
  // proxy / 1x1 / 4x5 siblings are NOT uploaded.
  "three-role-model-post5": {
    slug: "three-role-model-post5",
    defaultBundleDir: path.join(LAUNCH_ASSETS_ROOT, "three-role-model-post5-20260614"),
    assets: [
      { role: "hero-video", basename: "post5-demo-9x16.mp4" }, // full-bleed 9:16 voiced demo hero
      { role: "card", basename: "card-post5-A.png" }, // tweet 2 — "four roles, no self-review"
      { role: "card", basename: "card-post5-B.png" }, // tweet 3 — "two knobs per task"
      { role: "card", basename: "card-post5-C.png" }, // tweet 4 — "provable, not claimed"
    ],
  },
  // #871 — the forge-harness DEMONSTRATION-category post. The ~88s voiced cut IS the hero (tweet 1 +
  // the Threads lead); the X body tweets (2-4) each carry their own card-over-art still. The hero is
  // the full-bleed 9:16 voiced cut (`forge-demo-voiced-9x16.mp4`, #794) rendered to out/video/; the
  // three body cards (`card-forge-demo-{A,B,C}.png`) live under out/review/fable/. The hero's siblings
  // (mobile proxy / other aspects) are NOT uploaded.
  "forge-demo-871": {
    slug: "forge-demo-871",
    defaultBundleDir: path.join(LAUNCH_ASSETS_ROOT, "forge-demo-871-20260615"),
    assets: [
      { role: "hero-video", basename: "forge-demo-voiced-9x16.mp4" }, // full-bleed 9:16 voiced demo hero
      { role: "card", basename: "card-forge-demo-A.png" }, // tweet 2 — Retry→Done on the real dashboard
      { role: "card", basename: "card-forge-demo-B.png" }, // tweet 3 — 8 blocks, only one calls the model
      { role: "card", basename: "card-forge-demo-C.png" }, // tweet 4 — your tests decide what ships
    ],
  },
  // #1026 — the "before/after ui-evolve" DEMONSTRATION post (discovery→fix→proof: I caught my AI
  // design tool's own taste-judge rewarding emptiness, rebuilt it, proved the fix blind). The ~110s
  // voiced+subtitled cut IS the hero (tweet 1 + the Threads lead). The X thread is 6 tweets so EVERY
  // worded tweet carries its own media (#792 gate): tweet 1 = hero video; tweets 2-4 = the three
  // body cards A/B/C; tweet 5 (before 4.8 → after 7.7) = the editorial before/after hero still;
  // tweet 6 (CTA) = the 3-redesign trio still. The hero is the full-bleed 9:16 voiced+subtitled cut
  // (`ui-evolve-hero-9x16-voiced-subtitled.mp4`, #794) under out/review/ui-evolve/video/; all the
  // stills (cards + the two extra images) live under out/review/ui-evolve/image/. The hero's silent /
  // SMALL / non-subtitled siblings are NOT uploaded.
  "ui-evolve": {
    slug: "ui-evolve",
    defaultBundleDir: path.join(LAUNCH_ASSETS_ROOT, "ui-evolve-20260619"),
    assets: [
      // #1030 fixes: (1) hero is the SAFE-BAND cut (content inset ~7% so the platform's vertical-video
      // display crop can't clip the CTA URL / headlines); (2) tweet-5 before/after is the high-CONTRAST
      // origin→terminal (flat white → dark terminal — the editorial one read "too similar" at feed scale);
      // (3) tweet-6 trio is the MOBILE 3-up (legible at thumbnail; the desktop trio was too small).
      { role: "hero-video", basename: "ui-evolve-hero-9x16-voiced-subtitled-safe.mp4" }, // 9:16 voiced+subtitled, safe-band inset
      { role: "card", basename: "card-ui-evolve-A.png" }, // tweet 2 — the judge rewarded emptiness (87.1 > 83.1)
      { role: "card", basename: "card-ui-evolve-B.png" }, // tweet 3 — a band you can't game (11 dims, 5 structural)
      { role: "card", basename: "card-ui-evolve-C.png" }, // tweet 4 — proven blind 6/6 (generic 4.8 → 7.7)
      { role: "card", basename: "before-after-hero-origin-terminal-9x16.png" }, // tweet 5 — flat original → dark terminal (max contrast)
      { role: "card", basename: "redesign-trio-mobile-1x1.png" }, // tweet 6 (CTA) — three MOBILE views, all 7.7
    ],
  },
};

/** Type-guard: is `s` a known post slug? */
export function isPostSlug(s: string): s is PostSlug {
  return (
    s === "lfah-post1" ||
    s === "lfah-post2" ||
    s === "forge-harness-post3" ||
    s === "content-pipeline-demo-post4" ||
    s === "three-role-model-post5" ||
    s === "forge-demo-871" ||
    s === "ui-evolve"
  );
}
