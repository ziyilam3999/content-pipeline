/**
 * #867 Leg 1 — red-flag asserts (SPEC-PROXY string checks, NOT pixel OCR).
 *
 * Positive (clean → no throw) + negative (dirty → throw) for each token / URL / island class.
 */

import {
  assertNoInternalDevTokens,
  assertNoPlaceholderUrls,
  assertNoIslandLayout,
} from "../visualRedFlags";
import { demoLayout } from "../demoLayout";
import { ASPECTS } from "../renderSpec";

const aspect = (name: string) => {
  const a = ASPECTS.find((x) => x.name === name);
  if (!a) throw new Error(`no aspect ${name}`);
  return a;
};

describe("#867 assertNoInternalDevTokens", () => {
  test("clean copy passes", () => {
    expect(() =>
      assertNoInternalDevTokens([
        "local-first-agent-harness resolved 62% of 13 SWE-bench Verified bugs",
        "graded by the real Docker test oracle",
      ]),
    ).not.toThrow();
  });

  test.each([
    ["task ref", "Phase D / #748 will add the voiceover"],
    ["smoke word", "this is the demo-frames smoke output"],
    ["Phase marker", "Phase D capture harness"],
    ["tell me", "watch it and tell me what to change"],
    ["TODO", "TODO: replace placeholder art"],
    ["placeholder", "showing a placeholder card"],
    ["WIP", "WIP do not ship"],
  ])("dirty copy (%s) throws", (_label, bad) => {
    expect(() => assertNoInternalDevTokens([bad])).toThrow(/#867 visual red-flag/);
  });

  test("a # followed by <2 digits does NOT trip (avoid false positive)", () => {
    expect(() => assertNoInternalDevTokens(["rated #1 by users"])).not.toThrow();
  });

  test("employer brand token throws (reuses assertBrandClean)", () => {
    expect(() => assertNoInternalDevTokens(["built at shopee"])).toThrow(/#867 visual red-flag/);
  });
});

describe("#867 assertNoPlaceholderUrls", () => {
  test("a real github url passes", () => {
    expect(() =>
      assertNoPlaceholderUrls(["https://github.com/ziyilam3999/local-first-agent-harness"]),
    ).not.toThrow();
  });

  test.each([
    ["example.com", "see example.com for details"],
    ["example/ path", "github.com/example/lfah"],
    ["your-repo template", "github.com/your-repo/here"],
    ["<template>", "visit <your-url-here>"],
  ])("placeholder url (%s) throws", (_label, bad) => {
    expect(() => assertNoPlaceholderUrls([bad])).toThrow(/#867 visual red-flag/);
  });
});

describe("#867 assertNoIslandLayout (spec-proxy)", () => {
  test("9:16 fill layout passes (content fills the frame)", () => {
    const phone = aspect("9:16");
    const layout = demoLayout(phone.width, phone.height);
    expect(() => assertNoIslandLayout(layout, { width: phone.width, height: phone.height })).not.toThrow();
  });

  test("square (1:1) cut is skipped (legitimately centred)", () => {
    const sq = aspect("1:1");
    const layout = demoLayout(sq.width, sq.height);
    expect(() => assertNoIslandLayout(layout, { width: sq.width, height: sq.height })).not.toThrow();
  });

  test("a tall layout with a small content span (an island) throws", () => {
    const phone = aspect("9:16");
    const island = {
      aspectRatio: phone.height / phone.width,
      usableSpanFraction: 0.5, // square island floating in a tall frame
      contentMaxWidthPx: Math.floor(phone.width * 0.8),
      safeAreaXFraction: 0.8,
    };
    expect(() => assertNoIslandLayout(island, { width: phone.width, height: phone.height })).toThrow(
      /ISLAND layout/,
    );
  });

  test("a tall layout wider than the horizontal safe band throws", () => {
    const phone = aspect("9:16");
    const tooWide = {
      aspectRatio: phone.height / phone.width,
      usableSpanFraction: 0.9, // fills vertically...
      contentMaxWidthPx: phone.width, // ...but content extends edge-to-edge (no h-safe margin)
      safeAreaXFraction: 0.8,
    };
    expect(() => assertNoIslandLayout(tooWide, { width: phone.width, height: phone.height })).toThrow(
      /title-safe band/,
    );
  });
});
