/**
 * #802 — cross-post art-uniqueness guard unit test (both ends).
 *
 * Proves the mechanical guard behind "every NEW post gets DIFFERENT unique artwork":
 *   • assertArtUnique THROWS when two DIFFERENT posts would ship the SAME art hash.
 *   • assertArtUnique is a NO-OP when the art hash is distinct (new post, new art).
 *   • re-registering the SAME slug (a refresh of one post's art) is allowed.
 *   • the committed fixture seeds post #1's hash so post #2 is asserted distinct.
 *   • registerArt enforces the guard before adding.
 */

import * as path from "path";

import {
  ART_REGISTRY_PATH,
  assertArtUnique,
  loadRegistry,
  registerArt,
  sha256,
} from "../art-registry";

const REPO_ROOT = path.join(__dirname, "..", "..");
const POST1_HASH = "d3cd57f36e89f7b332460ebf47be099ab15ce5e124a6cd0d0667ae945fed3ecd";

describe("art-registry — cross-post uniqueness guard (#802)", () => {
  it("THROWS when a different post would ship an already-registered art hash (reuse)", () => {
    const reg = { post1: POST1_HASH };
    // post2 trying to ship post1's exact art = the bug we're preventing.
    expect(() => assertArtUnique("post2", POST1_HASH, reg)).toThrow(/ART-UNIQUENESS VIOLATION/);
  });

  it("is a NO-OP when the art hash is distinct (a new post with its own new art)", () => {
    const reg = { post1: POST1_HASH };
    const freshHash = sha256(Buffer.from("a totally different post-2 image"));
    expect(() => assertArtUnique("post2", freshHash, reg)).not.toThrow();
  });

  it("allows re-registering the SAME slug (a refresh of one post's own art)", () => {
    const reg = { post1: POST1_HASH };
    // post1 refreshing its own art to the same (or any) hash under its own slug is fine.
    expect(() => assertArtUnique("post1", POST1_HASH, reg)).not.toThrow();
    const newHash = sha256(Buffer.from("post-1 re-rendered art"));
    expect(() => assertArtUnique("post1", newHash, reg)).not.toThrow();
  });

  it("registerArt adds a distinct entry but refuses a cross-post reuse", () => {
    const reg = { post1: POST1_HASH };
    const freshHash = sha256(Buffer.from("post-2 unique art bytes"));
    const updated = registerArt("post2", freshHash, reg);
    expect(updated.post2).toBe(freshHash);
    expect(updated.post1).toBe(POST1_HASH);
    // ...but registering post2 with post1's hash is rejected.
    expect(() => registerArt("post2", POST1_HASH, reg)).toThrow(/ART-UNIQUENESS VIOLATION/);
  });

  it("the committed fixture seeds post #1's hash (so post #2 is asserted distinct from it)", () => {
    const reg = loadRegistry(REPO_ROOT);
    expect(reg.post1).toBe(POST1_HASH);
    expect(ART_REGISTRY_PATH).toBe(path.join("smoke", "fixtures", "art-registry.json"));
  });
});
