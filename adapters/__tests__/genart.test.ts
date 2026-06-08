/**
 * Unit test for the nano-banana generative-art adapter — uses an INJECTED fake caller
 * (no real Gemini, no key, no spend). The real-paid path is exercised by `smoke/genart-smoke.ts`.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { generateArt, buildArtPrompt, parseRetryDelayMs, type ArtCaller } from "../genart";
import { renderImage } from "../image";
import { type ContentSpec } from "../../inputs/contentspec";
import { type CopyResult } from "../../pipeline/run";

// A minimal valid 1x1 PNG.
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const FAKE_URI = `data:image/png;base64,${PNG_B64}`;

function spec(): ContentSpec {
  return {
    product: { name: "lfah", summary: "a test-driven app builder" },
    facts: [{ label: "pass rate", value: "83.8%", source: "PHASE-B-VERDICT" }],
    highlights: ["test-first"],
    ctas: ["star the repo"],
    sourceFiles: ["PHASE-B-VERDICT"],
  };
}
const copy: CopyResult = { thread: ["x"], script: "s", labels: ["l"] };

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lcp-genart-test-"));
}

describe("buildArtPrompt", () => {
  it("includes the product theme and forbids text/logos (brand-safe)", () => {
    const p = buildArtPrompt(spec());
    expect(p).toContain("a test-driven app builder");
    expect(p).toMatch(/NO text/i);
    expect(p).toMatch(/NO logos/i);
    // brand-safety: the prompt explicitly forbids brand names / logos in the pixels
    expect(p).toMatch(/NO brand names/i);
  });
});

describe("parseRetryDelayMs", () => {
  it("reads a RetryInfo retryDelay (seconds) from a 429 body into ms", () => {
    const body = JSON.stringify({
      error: { details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "9s" }] },
    });
    expect(parseRetryDelayMs(body)).toBe(9000);
  });
  it("handles fractional seconds and returns undefined when absent or non-JSON", () => {
    expect(parseRetryDelayMs(JSON.stringify({ error: { details: [{ "@type": "RetryInfo", retryDelay: "1.5s" }] } }))).toBe(1500);
    expect(parseRetryDelayMs(JSON.stringify({ error: { details: [] } }))).toBeUndefined();
    expect(parseRetryDelayMs("not json")).toBeUndefined();
  });
});

describe("generateArt (injected fake caller)", () => {
  it("returns the data URI and marks the path as injected", async () => {
    const caller: ArtCaller = async () => FAKE_URI;
    const out = await generateArt(spec(), { caller });
    expect(out.dataUri).toBe(FAKE_URI);
    expect(out.provider).toBe("injected");
    expect(out.pathLine).toContain('primary="nano-banana"');
  });

  it("throws when the caller does not return a data: URI", async () => {
    const caller: ArtCaller = async () => "not-a-data-uri";
    await expect(generateArt(spec(), { caller })).rejects.toThrow();
  });
});

describe("renderImage generative wiring (injected fake caller)", () => {
  it("bareArt writes the raw nano-banana bytes (no browser)", async () => {
    const outDir = tmpDir();
    const caller: ArtCaller = async () => FAKE_URI;
    const p = await renderImage(
      { spec: spec(), copy },
      { generative: true, bareArt: true, outDir, genartDeps: { caller } },
    );
    expect(p.endsWith(".png")).toBe(true);
    expect(fs.readFileSync(p)).toEqual(Buffer.from(PNG_B64, "base64"));
  });

  it("does NOT silently slide to the gradient — a failed generation throws", async () => {
    const outDir = tmpDir();
    const caller: ArtCaller = async () => {
      throw new Error("nano-banana down");
    };
    await expect(
      renderImage({ spec: spec(), copy }, { generative: true, outDir, genartDeps: { caller } }),
    ).rejects.toThrow();
  });
});
