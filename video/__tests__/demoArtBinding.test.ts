/**
 * #817 — PREVENTION test for the silently-solid demo background.
 *
 * The bug: a post's demo INTENDS generative art (CONFIG.demo.animatedBackgroundDefault) but the
 * `_art-base-<slug>.png` is missing (or resolved away before the render) → the video silently
 * renders a SOLID background. The #807 motion gate does NOT catch it (a moving solid passes motion).
 *
 * This suite gates the ART SOURCE being real + bound (both-ends, covering the DEMO_BG escape hatch
 * per feedback_gate_smoke_must_cover_bypass_forms), DISTINCT from the #807 perceptible-MOTION test.
 */

import {
  assertDemoArtBound,
  assertSharedArtSource,
  artBaseSlug,
  isSolidRenderOptOut,
} from "../demoArtBinding";
import { CONFIG } from "../../config";

const ART = "/out/review/lfah/image/_art-base-post2.png";
const BOUND = { backgroundImagePath: ART };

describe("#817 assertDemoArtBound — art-source-bound (NOT motion)", () => {
  // The config SSOT must intend art by default, else the default-intent cases below are vacuous.
  it("CONFIG intends generative art by default (precondition)", () => {
    expect(CONFIG.demo.animatedBackgroundDefault).toBe(true);
  });

  it("BLOCKS: art INTENDED + art base MISSING + DEMO_BG unset ⇒ throws", () => {
    expect(() =>
      assertDemoArtBound({ artImageExists: false, artImagePath: ART, resolvedBackground: null }),
    ).toThrow(/ART-SOURCE-BOUND VIOLATION/);
    // and the message names the missing-art root cause, not motion
    expect(() =>
      assertDemoArtBound({ artImageExists: false, artImagePath: ART, resolvedBackground: null }),
    ).toThrow(/MISSING/);
  });

  it("BLOCKS: art INTENDED + art base PRESENT but resolved away (null background) ⇒ throws", () => {
    // The run-order bug: file exists yet the render was handed no background.
    expect(() =>
      assertDemoArtBound({ artImageExists: true, artImagePath: ART, resolvedBackground: null }),
    ).toThrow(/ART-SOURCE-BOUND VIOLATION/);
    // empty path counts as unbound too
    expect(() =>
      assertDemoArtBound({
        artImageExists: true,
        artImagePath: ART,
        resolvedBackground: { backgroundImagePath: "  " },
      }),
    ).toThrow(/ART-SOURCE-BOUND VIOLATION/);
  });

  it("PASSES: art INTENDED + art base PRESENT + bound to the video ⇒ no throw", () => {
    expect(() =>
      assertDemoArtBound({ artImageExists: true, artImagePath: ART, resolvedBackground: BOUND }),
    ).not.toThrow();
  });

  it.each(["0", "off", "false", "no", "OFF", " Off "])(
    "BYPASS: DEMO_BG=%p (intentional solid) + art MISSING ⇒ NO-OP (does not throw)",
    (val) => {
      expect(() =>
        assertDemoArtBound({
          artImageExists: false,
          artImagePath: ART,
          resolvedBackground: null,
          demoBgEnv: val,
        }),
      ).not.toThrow();
    },
  );

  it("an unrelated DEMO_BG value (e.g. 'on') does NOT bypass — missing art still throws", () => {
    expect(() =>
      assertDemoArtBound({
        artImageExists: false,
        artImagePath: ART,
        resolvedBackground: null,
        demoBgEnv: "on",
      }),
    ).toThrow(/ART-SOURCE-BOUND VIOLATION/);
  });

  it("art NOT intended (intendedDefault=false) ⇒ NO-OP even with missing art", () => {
    expect(() =>
      assertDemoArtBound({
        intendedDefault: false,
        artImageExists: false,
        artImagePath: ART,
        resolvedBackground: null,
      }),
    ).not.toThrow();
  });

  it("isSolidRenderOptOut recognizes every off value and nothing else", () => {
    for (const v of ["0", "off", "false", "no", "OFF", " No "]) expect(isSolidRenderOptOut(v)).toBe(true);
    for (const v of [undefined, "", "on", "1", "true", "yes", "art"]) expect(isSolidRenderOptOut(v)).toBe(false);
  });
});

describe("#817 assertSharedArtSource — one shared per-post art", () => {
  it("PASSES: video + cards both derive from the SAME _art-base-<slug>.png (same slug)", () => {
    expect(() =>
      assertSharedArtSource(
        "out/review/lfah/image/_art-base-post2.png", // repo-relative (video bg)
        "/abs/out/review/lfah/image/_art-base-post2.png", // absolute (cards cache)
        "post2",
      ),
    ).not.toThrow();
  });

  it("BLOCKS: video slug ≠ cards slug ⇒ throws", () => {
    expect(() =>
      assertSharedArtSource(
        "out/.../_art-base-post2.png",
        "out/.../_art-base-post1.png",
        "post2",
      ),
    ).toThrow(/SHARED-SOURCE VIOLATION/);
  });

  it("BLOCKS: bound slug disagrees with the expected post slug (cross-post reuse) ⇒ throws", () => {
    expect(() =>
      assertSharedArtSource("_art-base-post1.png", "_art-base-post1.png", "post2"),
    ).toThrow(/SHARED-SOURCE VIOLATION/);
  });

  it("BLOCKS: a non-art-base path on either side ⇒ throws", () => {
    expect(() =>
      assertSharedArtSource("card-tweet-1.png", "_art-base-post2.png", "post2"),
    ).toThrow(/SHARED-SOURCE/);
    expect(() =>
      assertSharedArtSource("_art-base-post2.png", "some-other.png", "post2"),
    ).toThrow(/SHARED-SOURCE/);
  });

  it("artBaseSlug parses post-scoped, legacy, and non-matching paths", () => {
    expect(artBaseSlug("out/x/_art-base-post2.png")).toBe("post2");
    expect(artBaseSlug("/abs/_art-base.png")).toBe(""); // legacy post #1
    expect(artBaseSlug("card-tweet-1.png")).toBeNull();
    expect(artBaseSlug("/abs/_art-base-post2.PNG")).toBe("post2"); // case-insensitive ext
  });
});
