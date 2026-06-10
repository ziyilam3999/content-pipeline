/**
 * Cross-post ART-UNIQUENESS registry (#802).
 *
 * DOCTRINE — per-post unique art:
 *   • EVERY new post gets its OWN distinct background artwork.
 *   • Cards WITHIN the same post MAY share one art (one paid gen reused behind that post's
 *     cards — within-post sharing is correct and cheap).
 *   • A new post must NEVER inherit the previous post's art. The old single global
 *     `_art-base.png` (keyed to nothing) silently handed post #2 post #1's art — the bug
 *     this module + the post-scoped cache key in launch-card.ts fix together.
 *
 * This registry is the FAIL-LOUD cross-post guard: a small committed JSON mapping
 * `<postSlug> -> sha256(art-png-bytes)`. Before a post ships its art, `assertArtUnique`
 * throws if that exact art hash is already registered under a DIFFERENT postSlug — so a
 * silent cross-post reuse can never ship. Re-registering the SAME slug (a refresh) is fine.
 *
 * The registry travels in the repo (committed) so the guard works in CI and a fresh
 * checkout, independent of the gitignored out/ art bytes.
 */

import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";

/** Default committed registry location (repo-root-relative). */
export const ART_REGISTRY_PATH = path.join("smoke", "fixtures", "art-registry.json");

/** slug -> sha256(art png bytes). */
export type ArtRegistry = Record<string, string>;

/** Hex sha256 of raw bytes (the art-png fingerprint we register and compare). */
export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

/** Hex sha256 of a PNG file on disk. */
export function sha256File(filePath: string): string {
  return sha256(fs.readFileSync(filePath));
}

/** Load the committed registry; an absent file is an empty registry (first post). */
export function loadRegistry(repoRoot = process.cwd()): ArtRegistry {
  const p = path.join(repoRoot, ART_REGISTRY_PATH);
  if (!fs.existsSync(p)) return {};
  const parsed = JSON.parse(fs.readFileSync(p, "utf8"));
  // The committed file carries doc keys prefixed with "_"; strip them to the slug->hash map.
  const reg: ArtRegistry = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (k.startsWith("_")) continue;
    if (typeof v === "string") reg[k] = v;
  }
  return reg;
}

/**
 * Assert `hash` is not already claimed by a DIFFERENT postSlug. Throws (fail-loud) on a
 * cross-post reuse; a no-op when the hash is new OR already mapped to THIS same slug (a
 * refresh of the same post's art). This is the mechanical "different unique artwork per
 * NEW post" guard.
 */
export function assertArtUnique(slug: string, hash: string, registry: ArtRegistry): void {
  for (const [otherSlug, otherHash] of Object.entries(registry)) {
    if (otherSlug !== slug && otherHash === hash) {
      throw new Error(
        `ART-UNIQUENESS VIOLATION: art sha256 ${hash} is already registered to post ` +
          `"${otherSlug}" but post "${slug}" would ship the SAME art. Every NEW post needs ` +
          `its OWN distinct artwork (within-post sharing is fine, cross-post reuse is not). ` +
          `Generate fresh art for "${slug}".`,
      );
    }
  }
}

/**
 * Register `slug -> hash` after the uniqueness assertion passes, returning the updated
 * registry (caller decides whether to persist with saveRegistry). Idempotent on the same
 * slug+hash.
 */
export function registerArt(slug: string, hash: string, registry: ArtRegistry): ArtRegistry {
  assertArtUnique(slug, hash, registry);
  return { ...registry, [slug]: hash };
}

/**
 * Persist the registry to the committed JSON, preserving the leading doc fields ("_*") that
 * explain the file. Sorts slug keys for a stable, diff-friendly file.
 */
export function saveRegistry(registry: ArtRegistry, repoRoot = process.cwd()): void {
  const p = path.join(repoRoot, ART_REGISTRY_PATH);
  const existing = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
  const doc: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(existing)) if (k.startsWith("_")) doc[k] = v;
  const sortedSlugs = Object.keys(registry).sort();
  const out: Record<string, unknown> = { ...doc };
  for (const slug of sortedSlugs) out[slug] = registry[slug];
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(out, null, 2) + "\n");
}
