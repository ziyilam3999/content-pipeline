/**
 * #810 — PUBLISH-ASSET PROVENANCE guard. Makes it mechanically impossible to upload a STALE/divergent
 * render: the publisher must prove that the EXACT bytes it is about to post match the operator-approved
 * canonical render, hashed at approval time.
 *
 * THE NEAR-MISS THIS PREVENTS: an approved re-render (#807 perceptible-motion) landed only in the
 * durable launch bundle, while the gitignored `out/review/...` working dir the publish smoke reads from
 * still held the OLD, rejected cut. The two DRIFTED. A human caught it only by a manual md5 compare
 * right before upload. Without that we would have published the rejected video. This is the 4th
 * publish-fidelity miss in this program — so per Rule 17 ("the uploaded bytes equal the approved bytes"
 * is a pure boolean) it is now a mechanical gate, not a memory or a manual ritual.
 *
 * THE FLOW (human approval stays intact — this does NOT replace it):
 *   1. operator reviews + APPROVES the renders (unchanged).
 *   2. `npm run publish:freeze-manifest -- <postSlug>` snapshots each approved asset's sha256 from the
 *      durable bundle into a committed manifest (`publish/manifests/<slug>.publish-manifest.json`).
 *   3. the publish smoke, BEFORE any assembly/upload, re-hashes the files it is about to upload and
 *      calls `assertPublishAssetsMatchManifest`. Any mismatch / missing-file / missing-manifest →
 *      HARD-FAIL before a single network call.
 *
 * Both-ends boolean: every-hash-matches ⇒ returns; any-divergence ⇒ throws with a per-asset message.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import type { AssetRole, PostSlug } from "./publishAssets";

/** A single frozen asset record in a manifest (keyed by basename in `assets`). */
export interface ManifestAsset {
  role: AssetRole;
  /** Lower-case hex sha256 of the approved file's bytes. */
  sha256: string;
  /** File size in bytes at freeze time (informational / secondary check). */
  bytes: number;
}

/** The committed per-post provenance manifest. */
export interface PublishManifest {
  postSlug: PostSlug;
  /** ISO timestamp of when the snapshot was frozen. */
  frozenAt: string;
  /** The bundle dir the hashes were snapshotted from (provenance breadcrumb). */
  sourceDir: string;
  /** Approved assets, keyed by basename. */
  assets: Record<string, ManifestAsset>;
}

/** An asset the publisher is about to upload — what the gate hashes + checks against the manifest. */
export interface PublishAsset {
  role: AssetRole;
  /** Absolute or repo-relative path to the file that will be uploaded. */
  path: string;
}

/** Directory holding the committed manifests. */
export const MANIFEST_DIR = path.join(__dirname, "manifests");

/** Resolve the committed manifest path for a post slug (`dir` overridable for tests). */
export function manifestPath(postSlug: PostSlug, dir: string = MANIFEST_DIR): string {
  return path.join(dir, `${postSlug}.publish-manifest.json`);
}

/** Stream-free sha256 of a file's bytes as lower-case hex. Throws if the file is missing. */
export function sha256File(filePath: string): string {
  const buf = fs.readFileSync(filePath); // launch assets are ≤~38MB — readFileSync is fine + sync
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/**
 * Load + parse the committed manifest for a post. THROWS a clear error if the manifest file is missing
 * or has zero assets — a post that requires provenance MUST have been frozen first (run
 * `npm run publish:freeze-manifest -- <postSlug>` after operator approval).
 */
export function loadManifest(postSlug: PostSlug, dir: string = MANIFEST_DIR): PublishManifest {
  const p = manifestPath(postSlug, dir);
  if (!fs.existsSync(p)) {
    throw new Error(
      `#810 provenance: missing manifest for ${postSlug} at ${p}. The publish path requires a frozen ` +
        `provenance manifest — run \`npm run publish:freeze-manifest -- ${postSlug}\` AFTER the operator ` +
        `approves the renders, then publish.`,
    );
  }
  const manifest = JSON.parse(fs.readFileSync(p, "utf8")) as PublishManifest;
  if (!manifest.assets || Object.keys(manifest.assets).length === 0) {
    throw new Error(
      `#810 provenance: manifest for ${postSlug} at ${p} is EMPTY (no assets). Re-freeze it with ` +
        `\`npm run publish:freeze-manifest -- ${postSlug}\` so the publish path has hashes to check against.`,
    );
  }
  return manifest;
}

/**
 * THE GATE. Hash every asset the publisher is about to upload and assert each matches the frozen
 * manifest. HARD-FAILS (throws) — naming EVERY offender — on ANY of:
 *   - the manifest is empty (zero assets) — nothing to verify against;
 *   - an asset's basename is NOT in the manifest (an unexpected/unfrozen file is being uploaded);
 *   - the file is missing on disk;
 *   - the file's sha256 ≠ the manifest's (the STALE/divergent-render case — the exact #810 near-miss).
 * No-op (returns) when every asset matches. Both-ends boolean.
 *
 * Pure w.r.t. the manifest object (no I/O for the manifest); it only hashes the on-disk asset files.
 */
export function assertPublishAssetsMatchManifest(
  assets: PublishAsset[],
  manifest: PublishManifest,
): void {
  if (!manifest.assets || Object.keys(manifest.assets).length === 0) {
    throw new Error(
      `#810 provenance: manifest for ${manifest.postSlug} has NO assets — cannot verify the publish set ` +
        `is the approved render. Re-freeze the manifest after approval.`,
    );
  }

  const offenders: string[] = [];

  for (const asset of assets) {
    const basename = path.basename(asset.path);
    const expected = manifest.assets[basename];
    if (!expected) {
      offenders.push(
        `${basename} (${asset.role}) is NOT in the ${manifest.postSlug} manifest — an unfrozen/unexpected ` +
          `asset is about to be uploaded`,
      );
      continue;
    }
    if (!fs.existsSync(asset.path)) {
      offenders.push(`${basename} (${asset.role}) is missing on disk at ${asset.path}`);
      continue;
    }
    const actual = sha256File(asset.path);
    if (actual !== expected.sha256) {
      offenders.push(
        `${basename} (${asset.role}) HASH MISMATCH — about-to-upload sha256=${actual.slice(0, 12)}… ≠ ` +
          `approved sha256=${expected.sha256.slice(0, 12)}… (STALE or divergent render; the file in the ` +
          `publish path is NOT the operator-approved one)`,
      );
    }
    if (expected.bytes !== undefined) {
      const actualBytes = fs.statSync(asset.path).size;
      if (actualBytes !== expected.bytes) {
        offenders.push(
          `${basename} (${asset.role}) bytes mismatch (actual ${actualBytes} vs manifest ${expected.bytes})`,
        );
      }
    }
  }

  const uploadBasenames = new Set(assets.map((a) => path.basename(a.path)));
  for (const basename of Object.keys(manifest.assets)) {
    if (!uploadBasenames.has(basename)) {
      offenders.push(
        `${basename} (${manifest.assets[basename].role}) is in the ${manifest.postSlug} manifest but ABSENT ` +
          `from the publish set — a manifest-approved asset would be silently dropped`,
      );
    }
  }

  if (offenders.length > 0) {
    throw new Error(
      `#810 provenance violation — the publish set does NOT match the approved render for ` +
        `${manifest.postSlug}; refusing to upload:\n  - ${offenders.join("\n  - ")}\n` +
        `Fix: ensure the publish-path files are the approved bundle's copies, OR (if the renders changed ` +
        `and were re-approved) re-run \`npm run publish:freeze-manifest -- ${manifest.postSlug}\`.`,
    );
  }
}

/** Input to `freezeManifest`. */
export interface FreezeInput {
  postSlug: PostSlug;
  /** The bundle dir holding the approved canonical copies to hash. */
  sourceDir: string;
  /** The assets to freeze (basename + role), resolved against `sourceDir`. */
  assets: { role: AssetRole; basename: string }[];
}

/**
 * Snapshot the CURRENT (approved) asset hashes from `sourceDir` into a manifest object. Run AFTER the
 * operator approves the renders. Each `<sourceDir>/<basename>` is hashed; a missing source file throws.
 * Pure: returns the manifest object — writing it to disk is `writeManifest`'s job (kept separate so the
 * freeze can be unit-tested without touching the committed manifests).
 */
export function freezeManifest(input: FreezeInput): PublishManifest {
  const assets: Record<string, ManifestAsset> = {};
  for (const a of input.assets) {
    const filePath = path.join(input.sourceDir, a.basename);
    if (!fs.existsSync(filePath)) {
      throw new Error(
        `#810 freeze: approved asset ${a.basename} missing in source bundle ${input.sourceDir} ` +
          `(expected ${filePath}). Cannot freeze a manifest from an incomplete bundle.`,
      );
    }
    assets[a.basename] = {
      role: a.role,
      sha256: sha256File(filePath),
      bytes: fs.statSync(filePath).size,
    };
  }
  return {
    postSlug: input.postSlug,
    frozenAt: new Date().toISOString(),
    sourceDir: input.sourceDir,
    assets,
  };
}

/** Write a manifest to its committed path (pretty JSON + trailing newline). Returns the path written. */
export function writeManifest(manifest: PublishManifest): string {
  const p = manifestPath(manifest.postSlug);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(manifest, null, 2) + "\n");
  return p;
}
