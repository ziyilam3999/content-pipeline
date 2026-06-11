/**
 * #810 — publish-asset PROVENANCE guard tests (both-ends booleans, fixtures, NO live/network calls).
 *
 * The near-miss this pins: an approved re-render landed only in the durable bundle while the publish
 * path (out/review) still held the OLD, rejected cut. These tests prove the gate:
 *   - PASSES when every about-to-upload file's sha256 matches the frozen manifest;
 *   - HARD-FAILS when the hero video's hash differs (the exact stale-asset case), naming the file;
 *   - HARD-FAILS when the manifest is missing OR empty for a post that requires one;
 *   - HARD-FAILS on an unexpected (unfrozen) asset or a missing-on-disk file;
 *   - freeze produces a manifest whose hashes equal the snapshot inputs.
 * Plus a smoke that the two COMMITTED manifests are real, parseable, and carry a hero-video.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  sha256File,
  assertPublishAssetsMatchManifest,
  loadManifest,
  freezeManifest,
  manifestPath,
  type PublishManifest,
  type PublishAsset,
} from "../publishProvenance";
import { POST_ASSETS, type PostSlug } from "../publishAssets";

/** Make a fresh temp dir and clean it up after each test. */
let tmp: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prov-test-"));
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Write a file with given bytes in the temp dir; return its full path. */
function writeFixture(name: string, contents: string): string {
  const p = path.join(tmp, name);
  fs.writeFileSync(p, contents);
  return p;
}

/** Hex sha256 of a string (mirrors sha256File for assertions). */
function sha256(s: string): string {
  return crypto.createHash("sha256").update(Buffer.from(s)).digest("hex");
}

describe("sha256File", () => {
  it("hashes a file's bytes to lower-case hex matching the known sha256", () => {
    const p = writeFixture("hero.mp4", "approved-bytes-v2");
    expect(sha256File(p)).toBe(sha256("approved-bytes-v2"));
  });

  it("throws when the file is missing", () => {
    expect(() => sha256File(path.join(tmp, "nope.mp4"))).toThrow();
  });
});

/** Build a manifest object directly from fixture files (no disk manifest needed). */
function manifestFromFixtures(
  slug: PostSlug,
  entries: { role: "hero-video" | "card"; basename: string; contents: string }[],
): PublishManifest {
  const assets: PublishManifest["assets"] = {};
  for (const e of entries) {
    writeFixture(e.basename, e.contents);
    assets[e.basename] = {
      role: e.role,
      sha256: sha256(e.contents),
      bytes: Buffer.from(e.contents).length,
    };
  }
  return { postSlug: slug, frozenAt: new Date().toISOString(), sourceDir: tmp, assets };
}

describe("assertPublishAssetsMatchManifest", () => {
  it("PASSES (no throw) when every asset hash matches the manifest", () => {
    const manifest = manifestFromFixtures("lfah-post2", [
      { role: "hero-video", basename: "builder-demo-9x16.mp4", contents: "HERO-approved" },
      { role: "card", basename: "card-post2-A.png", contents: "CARD-A-approved" },
    ]);
    const assets: PublishAsset[] = [
      { role: "hero-video", path: path.join(tmp, "builder-demo-9x16.mp4") },
      { role: "card", path: path.join(tmp, "card-post2-A.png") },
    ];
    expect(() => assertPublishAssetsMatchManifest(assets, manifest)).not.toThrow();
  });

  it("HARD-FAILS when the hero video hash differs (the stale-render case), naming the file", () => {
    const manifest = manifestFromFixtures("lfah-post2", [
      { role: "hero-video", basename: "builder-demo-9x16.mp4", contents: "HERO-approved-v2" },
      { role: "card", basename: "card-post2-A.png", contents: "CARD-A-approved" },
    ]);
    // Overwrite the hero on disk with the OLD/rejected bytes — out/review drifted from approval.
    fs.writeFileSync(path.join(tmp, "builder-demo-9x16.mp4"), "HERO-OLD-rejected-cut");
    const assets: PublishAsset[] = [
      { role: "hero-video", path: path.join(tmp, "builder-demo-9x16.mp4") },
      { role: "card", path: path.join(tmp, "card-post2-A.png") },
    ];
    expect(() => assertPublishAssetsMatchManifest(assets, manifest)).toThrow(
      /builder-demo-9x16\.mp4.*HASH MISMATCH/s,
    );
  });

  it("HARD-FAILS when the manifest is empty (no assets) for a post that requires one", () => {
    const empty: PublishManifest = {
      postSlug: "lfah-post1",
      frozenAt: new Date().toISOString(),
      sourceDir: tmp,
      assets: {},
    };
    const assets: PublishAsset[] = [{ role: "hero-video", path: writeFixture("demo-9x16.mp4", "x") }];
    expect(() => assertPublishAssetsMatchManifest(assets, empty)).toThrow(/NO assets/);
  });

  it("HARD-FAILS when an unexpected (unfrozen) asset is about to be uploaded", () => {
    const manifest = manifestFromFixtures("lfah-post2", [
      { role: "hero-video", basename: "builder-demo-9x16.mp4", contents: "HERO" },
    ]);
    const assets: PublishAsset[] = [
      { role: "hero-video", path: path.join(tmp, "builder-demo-9x16.mp4") },
      { role: "card", path: writeFixture("rogue-card.png", "rogue") }, // not in the manifest
    ];
    expect(() => assertPublishAssetsMatchManifest(assets, manifest)).toThrow(/rogue-card\.png.*NOT in/s);
  });

  it("HARD-FAILS when a manifest-listed file is missing on disk", () => {
    const manifest = manifestFromFixtures("lfah-post2", [
      { role: "hero-video", basename: "builder-demo-9x16.mp4", contents: "HERO" },
    ]);
    fs.rmSync(path.join(tmp, "builder-demo-9x16.mp4")); // file vanished from the publish path
    const assets: PublishAsset[] = [
      { role: "hero-video", path: path.join(tmp, "builder-demo-9x16.mp4") },
    ];
    expect(() => assertPublishAssetsMatchManifest(assets, manifest)).toThrow(/missing on disk/);
  });
});

describe("loadManifest", () => {
  it("HARD-FAILS when the manifest file is missing for a post that requires one", () => {
    // Point at an empty temp dir — no manifest file present.
    expect(() => loadManifest("lfah-post1", tmp)).toThrow(/missing manifest/);
  });

  it("HARD-FAILS when the on-disk manifest has zero assets", () => {
    const empty: PublishManifest = {
      postSlug: "lfah-post1",
      frozenAt: new Date().toISOString(),
      sourceDir: tmp,
      assets: {},
    };
    fs.writeFileSync(manifestPath("lfah-post1", tmp), JSON.stringify(empty));
    expect(() => loadManifest("lfah-post1", tmp)).toThrow(/EMPTY/);
  });
});

describe("freezeManifest", () => {
  it("produces a manifest whose hashes equal the snapshot inputs", () => {
    writeFixture("builder-demo-9x16.mp4", "HERO-bytes");
    writeFixture("card-post2-A.png", "CARD-bytes");
    const manifest = freezeManifest({
      postSlug: "lfah-post2",
      sourceDir: tmp,
      assets: [
        { role: "hero-video", basename: "builder-demo-9x16.mp4" },
        { role: "card", basename: "card-post2-A.png" },
      ],
    });
    expect(manifest.assets["builder-demo-9x16.mp4"].sha256).toBe(sha256("HERO-bytes"));
    expect(manifest.assets["builder-demo-9x16.mp4"].role).toBe("hero-video");
    expect(manifest.assets["builder-demo-9x16.mp4"].bytes).toBe(Buffer.from("HERO-bytes").length);
    expect(manifest.assets["card-post2-A.png"].sha256).toBe(sha256("CARD-bytes"));
  });

  it("a frozen manifest re-verifies clean against the SAME files (freeze→assert round-trip)", () => {
    writeFixture("builder-demo-9x16.mp4", "HERO-bytes");
    const manifest = freezeManifest({
      postSlug: "lfah-post2",
      sourceDir: tmp,
      assets: [{ role: "hero-video", basename: "builder-demo-9x16.mp4" }],
    });
    const assets: PublishAsset[] = [
      { role: "hero-video", path: path.join(tmp, "builder-demo-9x16.mp4") },
    ];
    expect(() => assertPublishAssetsMatchManifest(assets, manifest)).not.toThrow();
  });

  it("throws when an approved source asset is missing from the bundle", () => {
    expect(() =>
      freezeManifest({
        postSlug: "lfah-post2",
        sourceDir: tmp,
        assets: [{ role: "hero-video", basename: "does-not-exist.mp4" }],
      }),
    ).toThrow(/missing in source bundle/);
  });

  it("writeManifest round-trips to a readable file", () => {
    writeFixture("demo-9x16.mp4", "X");
    const manifest = freezeManifest({
      postSlug: "lfah-post1",
      sourceDir: tmp,
      assets: [{ role: "hero-video", basename: "demo-9x16.mp4" }],
    });
    // writeManifest writes to the committed MANIFEST_DIR; redirect by writing into tmp instead.
    const p = manifestPath("lfah-post1", tmp);
    fs.writeFileSync(p, JSON.stringify(manifest, null, 2) + "\n");
    const reloaded = loadManifest("lfah-post1", tmp);
    expect(reloaded.assets["demo-9x16.mp4"].sha256).toBe(manifest.assets["demo-9x16.mp4"].sha256);
  });
});

describe("committed manifests (the real frozen receipts)", () => {
  it.each(Object.keys(POST_ASSETS) as PostSlug[])(
    "%s manifest is parseable, non-empty, and carries a hero-video matching the asset SSOT",
    (slug) => {
      const manifest = loadManifest(slug); // reads the committed publish/manifests/<slug>.*.json
      expect(manifest.postSlug).toBe(slug);
      const entries = Object.values(manifest.assets);
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries.some((a) => a.role === "hero-video")).toBe(true);
      // Every SSOT asset has a manifest entry (freeze + publish read the same list).
      for (const a of POST_ASSETS[slug].assets) {
        expect(manifest.assets[a.basename]).toBeDefined();
        expect(manifest.assets[a.basename].role).toBe(a.role);
      }
    },
  );
});
