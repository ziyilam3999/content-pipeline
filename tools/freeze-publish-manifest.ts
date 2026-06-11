/**
 * #810 — FREEZE the publish-asset provenance manifest for a post.
 *
 * Run this AFTER the operator approves the renders. It snapshots each approved asset's sha256 from the
 * durable launch bundle into the committed manifest `publish/manifests/<postSlug>.publish-manifest.json`.
 * The publish smokes then hard-fail if the files they are about to upload do NOT match these hashes.
 *
 * Usage:
 *   npm run publish:freeze-manifest -- <postSlug> [--from <bundleDir>]
 *
 *   <postSlug>      lfah-post1 | lfah-post2
 *   --from <dir>    override the source bundle dir (defaults to the post's durable bundle)
 *
 * Example:
 *   npm run publish:freeze-manifest -- lfah-post2
 *   npm run publish:freeze-manifest -- lfah-post1 --from /Users/me/coding_projects/_launch-assets/lfah-20260610
 *
 * This makes NO network call. It only reads the approved files + writes a small JSON manifest.
 */

import { POST_ASSETS, isPostSlug } from "../publish/publishAssets";
import { freezeManifest, writeManifest } from "../publish/publishProvenance";

function parseArgs(argv: string[]): { slug: string | undefined; from: string | undefined } {
  let slug: string | undefined;
  let from: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from") {
      from = argv[++i];
    } else if (!a.startsWith("--") && slug === undefined) {
      slug = a;
    }
  }
  return { slug, from };
}

function main(): void {
  const { slug, from } = parseArgs(process.argv.slice(2));
  if (!slug || !isPostSlug(slug)) {
    console.error(
      `freeze-publish-manifest: expected a postSlug (${Object.keys(POST_ASSETS).join(" | ")}). ` +
        `Usage: npm run publish:freeze-manifest -- <postSlug> [--from <bundleDir>]`,
    );
    process.exit(2);
  }

  const spec = POST_ASSETS[slug];
  const sourceDir = from ?? spec.defaultBundleDir;

  const manifest = freezeManifest({ postSlug: slug, sourceDir, assets: spec.assets });
  const written = writeManifest(manifest);

  const heroes = Object.entries(manifest.assets).filter(([, a]) => a.role === "hero-video");
  console.log(`FREEZE: wrote ${written}`);
  console.log(`  postSlug=${manifest.postSlug} sourceDir=${manifest.sourceDir}`);
  console.log(`  assets=${Object.keys(manifest.assets).length} (hero-video=${heroes.length})`);
  for (const [basename, a] of Object.entries(manifest.assets)) {
    console.log(`    • ${basename.padEnd(26)} ${a.role.padEnd(11)} ${a.sha256.slice(0, 16)}…  (${a.bytes} B)`);
  }
}

main();
