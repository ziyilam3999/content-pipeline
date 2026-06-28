import {
  buildCardHtml,
  selectFacts,
  esc,
  centerSafeArea,
  checkCenterSafeLayout,
  assertCenterSafeLayout,
  type ContentBox,
} from "../card";
import { ContentSpec } from "../../inputs/contentspec";
import { CONFIG } from "../../config";

const SPEC: ContentSpec = {
  product: {
    name: "lfah",
    repoUrl: "https://github.com/example/example",
    summary: "A local-first agent harness that fixes bugs test-first.",
  },
  facts: [
    { label: "Resolved (5-role chain)", value: "83.8%", scopeGuard: "n=74", source: "r.md" },
    { label: "Cost per chain", value: "$0.69", scopeGuard: "1 instance", source: "r.json" },
    { label: "Suite size", value: "74", source: "r.md" }, // unguarded
    { label: "Iterations to green", value: "1", scopeGuard: "1 instance", source: "r.json" },
    { label: "Extra unguarded", value: "100", source: "r.md" },
  ],
  highlights: ["Test-first"],
  ctas: ["Star the repo"],
  sourceFiles: [],
};

const DIMS = CONFIG.aspects["1:1"];

describe("esc", () => {
  it("escapes HTML-significant characters", () => {
    expect(esc(`<script>"x"&'y'`)).toBe("&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;");
  });
});

describe("selectFacts", () => {
  it("prefers guarded facts and caps at maxFacts", () => {
    const sel = selectFacts(SPEC, 3);
    expect(sel.length).toBe(3);
    expect(sel.every((f) => f.scopeGuard)).toBe(true); // all three guarded facts come first
  });

  it("falls back to unguarded facts when more tiles are requested than guarded facts exist", () => {
    const sel = selectFacts(SPEC, 4);
    expect(sel.length).toBe(4);
    expect(sel[3].scopeGuard).toBeUndefined(); // the 4th is an unguarded fact
  });

  it("drops a bare unguarded tile whose value is already implied by another fact's n= guard (#698)", () => {
    // "Suite size: 74" just restates the "n=74" already shown on the resolved-rate
    // tile — a redundant bare-n tile. It should be curated out, freeing the slot for
    // a genuinely new unguarded fact ("Extra unguarded: 100", which no guard implies).
    const sel = selectFacts(SPEC, 4);
    const labels = sel.map((f) => f.label);
    expect(labels).not.toContain("Suite size");
    expect(labels).toContain("Extra unguarded");
  });

  it("keeps an unguarded number that is NOT implied by any guard", () => {
    const sel = selectFacts(SPEC, 5);
    expect(sel.map((f) => f.label)).toContain("Extra unguarded"); // value 100, no n=100 guard
  });
});

describe("buildCardHtml", () => {
  const html = buildCardHtml(SPEC, DIMS, { maxFacts: 4 });

  it("prints every featured fact's value AND its scope guard verbatim (the honesty rule)", () => {
    expect(html).toContain("83.8%");
    expect(html).toContain("n=74");
    expect(html).toContain("$0.69");
    expect(html).toContain("1 instance");
  });

  it("shows the product name, summary, CTA, and a clean repo host", () => {
    expect(html).toContain("lfah");
    expect(html).toContain("fixes bugs test-first");
    expect(html).toContain("Star the repo");
    expect(html).toContain("github.com/example/example");
    expect(html).not.toContain("https://"); // protocol stripped from the displayed URL
  });

  it("sizes the document to the given aspect", () => {
    expect(html).toContain(`width: ${DIMS.width}px`);
    expect(html).toContain(`height: ${DIMS.height}px`);
  });

  it("uses a code-drawn gradient (no external image) when no generative background is supplied", () => {
    expect(html).not.toContain("background-image:");
    expect(html).toContain("radial-gradient");
  });

  it("puts an AI background BEHIND the numbers when one is supplied (numbers still real text)", () => {
    const withBg = buildCardHtml(SPEC, DIMS, { backgroundDataUri: "data:image/png;base64,AAAA" });
    expect(withBg).toContain("background-image:");
    expect(withBg).toContain("data:image/png;base64,AAAA");
    expect(withBg).toContain("83.8%"); // the exact number is STILL DOM text, not part of the image
  });

  it("renders NO art-mask overlay layer when none is supplied (byte-identical to the pre-mask card)", () => {
    // #824 mask-art-text: absent/empty overlays ⇒ the card HTML is unchanged.
    expect(html).not.toContain("art-overlays");
    expect(html).not.toContain("art-overlay");
    expect(buildCardHtml(SPEC, DIMS, { maxFacts: 4, overlays: [] })).toBe(html);
  });

  it("paints an OPAQUE chip carrying the CLEAN label over a garbled art spot (#824 mask-art-text)", () => {
    const withMask = buildCardHtml(SPEC, DIMS, {
      maxFacts: 4,
      backgroundDataUri: "data:image/png;base64,AAAA",
      overlays: [
        // The post-4 case: nano-banana baked the misspelled "imae card"; mask it with clean "image card".
        { left: 700, top: 588, width: 184, height: 50, label: "image card", fontSize: 26 },
        { left: 296, top: 520, width: 96, height: 44, variant: "scrim" },
      ],
    });
    expect(withMask).toContain('class="art-overlays"');
    expect(withMask).toContain("image card"); // the CLEAN corrected label is rendered
    expect(withMask).toContain("art-overlay chip"); // opaque label chip
    expect(withMask).toContain("art-overlay scrim"); // opaque darkening cover
    expect(withMask).toContain("z-index: -1"); // above art, below the translucent content tiles
    expect(withMask).toContain("left:700px"); // positioned in card-space px over the garble
  });

  it("HTML-escapes a hostile label so it cannot break or inject markup", () => {
    const evil: ContentSpec = {
      ...SPEC,
      facts: [{ label: "<script>alert(1)</script>", value: "9", scopeGuard: "n=1", source: "x" }],
    };
    const out = buildCardHtml(evil, DIMS);
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;script&gt;");
  });
});

describe("#1326 center-safe layout", () => {
  // The static-default surface the live gate targets. Geometry derives from CONFIG (no magic px).
  const STATIC = CONFIG.aspects[CONFIG.formatTargets.staticDefault]; // 4:5 → 1080×1350
  const ASPECT = CONFIG.staticSafeArea.aspectRatio; // 3/4

  // Compute the EXPECTED inscribed-rect from config — never hard-code magic px in the assertion.
  const expW = Math.min(STATIC.width, STATIC.height * ASPECT) * CONFIG.staticSafeArea.insetFraction;
  const expH = (expW / ASPECT) * 1; // insetFraction already applied to expW; h = w/aspect for inset=1
  const expLeft = (STATIC.width - expW) / 2;
  const expTop = (STATIC.height - expH) / 2;

  it("A1: centerSafeArea returns the inscribed 3:4 rect for the 4:5 canvas (derived from CONFIG)", () => {
    const r = centerSafeArea(STATIC);
    expect(r.width).toBeCloseTo(expW, 3); // ≈ 1012.5 at the 3:4 default
    expect(r.height).toBeCloseTo(STATIC.height, 3); // full canvas height (width-bound)
    expect(r.left).toBeCloseTo(expLeft, 3); // ≈ 33.75
    expect(r.right).toBeCloseTo(STATIC.width - expLeft, 3); // ≈ 1046.25
    expect(r.top).toBeCloseTo(expTop, 3); // 0
    expect(r.bottom).toBeCloseTo(STATIC.height - expTop, 3); // 1350
  });

  it("A2: a box fully inside passes (check ok, no violations, assert does not throw)", () => {
    const boxes: ContentBox[] = [{ name: "inside", left: 200, top: 200, right: 880, bottom: 1150 }];
    const res = checkCenterSafeLayout(boxes, STATIC);
    expect(res.ok).toBe(true);
    expect(res.violations).toHaveLength(0);
    expect(() => assertCenterSafeLayout(boxes, STATIC)).not.toThrow();
  });

  it("A3: a box crossing the LEFT edge fires with the overflow px", () => {
    const boxes: ContentBox[] = [{ name: "logo", left: 10, top: 200, right: 880, bottom: 1150 }];
    const res = checkCenterSafeLayout(boxes, STATIC);
    expect(res.ok).toBe(false);
    expect(res.violations[0].edge).toBe("left");
    expect(res.violations[0].overflowPx).toBeCloseTo(res.safe.left - 10, 3);
    expect(() => assertCenterSafeLayout(boxes, STATIC)).toThrow(/center-safe layout violated/);
    expect(() => assertCenterSafeLayout(boxes, STATIC)).toThrow(/left/);
  });

  it("A4: a box crossing the TOP edge fires /top/ (pure assertion, inset shrinks the rect)", () => {
    // At inset 1.0 top=0, so use a deliberate inset to bring the top edge inward and cross it.
    const boxes: ContentBox[] = [{ name: "header", left: 500, top: 10, right: 580, bottom: 600 }];
    expect(() => assertCenterSafeLayout(boxes, STATIC, { insetFraction: 0.5 })).toThrow(/top/);
  });

  it("A5: a box crossing the RIGHT edge fires /right/", () => {
    const boxes: ContentBox[] = [{ name: "chip", left: 200, top: 200, right: 1075, bottom: 1150 }];
    expect(() => assertCenterSafeLayout(boxes, STATIC)).toThrow(/right/);
  });

  it("A6: a box crossing the BOTTOM edge fires /bottom/", () => {
    const boxes: ContentBox[] = [{ name: "footer", left: 500, top: 200, right: 580, bottom: 1349 }];
    expect(() => assertCenterSafeLayout(boxes, STATIC, { insetFraction: 0.5 })).toThrow(/bottom/);
  });

  it("A7: the thrown message names the offending element", () => {
    const boxes: ContentBox[] = [{ name: "repo-url", left: 5, top: 200, right: 880, bottom: 1150 }];
    expect(() => assertCenterSafeLayout(boxes, STATIC)).toThrow(/repo-url/);
  });

  it("A8: the insetFraction knob halves width+height of the inscribed rect", () => {
    const full = centerSafeArea(STATIC);
    const half = centerSafeArea(STATIC, { insetFraction: 0.5 });
    expect(half.width).toBeCloseTo(full.width / 2, 3);
    expect(half.height).toBeCloseTo(full.height / 2, 3);
    // still centered
    expect((half.left + half.right) / 2).toBeCloseTo(STATIC.width / 2, 3);
    expect((half.top + half.bottom) / 2).toBeCloseTo(STATIC.height / 2, 3);
  });

  it("A9: centerSafeArea guards bad inputs (insetFraction outside (0,1], non-positive dims, bad aspect)", () => {
    expect(() => centerSafeArea(STATIC, { insetFraction: 0 })).toThrow(/insetFraction/);
    expect(() => centerSafeArea(STATIC, { insetFraction: 1.5 })).toThrow(/insetFraction/);
    expect(() => centerSafeArea({ width: 0, height: 100 })).toThrow(/positive/);
    expect(() => centerSafeArea({ width: 100, height: -1 })).toThrow(/positive/);
    expect(() => centerSafeArea(STATIC, { aspectRatio: 0 })).toThrow(/aspectRatio/);
  });

  it("A10: EPS=0.5 sub-pixel slack is wired (left−0.4 passes, left−0.6 fires)", () => {
    const safeLeft = centerSafeArea(STATIC).left;
    const justInside: ContentBox[] = [{ name: "edge", left: safeLeft - 0.4, top: 200, right: 880, bottom: 1150 }];
    const justOutside: ContentBox[] = [{ name: "edge", left: safeLeft - 0.6, top: 200, right: 880, bottom: 1150 }];
    expect(checkCenterSafeLayout(justInside, STATIC).ok).toBe(true);
    expect(checkCenterSafeLayout(justOutside, STATIC).ok).toBe(false);
  });
});
