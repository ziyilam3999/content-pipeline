import { buildCardHtml, selectFacts, esc } from "../card";
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
