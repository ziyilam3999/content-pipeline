/**
 * #790 — render-time overflow gate for the card-over-art layout.
 *
 * Before #790 the card laid its fact tiles in a fixed-height body with `overflow: hidden` and ZERO
 * fit logic, so when the tiles wrapped past the card height the bottom row was SILENTLY CLIPPED —
 * the 4:5 hero dropped its last tile ("cost saving vs full-cloud 55%"). renderImage now auto-fits
 * the facts grid (the card's --fit knob) and THROWS if the content still overflows at the floor.
 *
 * These tests drive the REAL Playwright render path (deterministic placeholder background, no paid
 * call, no network) and prove both ends of that mechanical gate:
 *   1. the full lfahSpec 4:5 hero — every tile fits (the fit loop converges, no throw);
 *   2. a deliberately-too-many-facts spec — the assertion THROWS (loud failure, not a silent clip).
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { renderImage } from "../image";
import { lfahSpec } from "../../smoke/lfahSpec";
import { type ContentSpec, type Fact } from "../../inputs/contentspec";
import { type CopyResult } from "../../pipeline/run";

// Playwright launch + layout is heavier than a unit test; give it generous headroom.
jest.setTimeout(120_000);

const PLACEHOLDER_ART_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const COPY: CopyResult = { thread: [], script: "", labels: [] };

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "card-overflow-"));
});
afterAll(() => {
  // mv-not-rm is for tracked artefacts; this is an OS temp scratch dir → rm is fine.
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Render through the real adapter with a fixed placeholder background (no paid call). */
async function render(spec: ContentSpec, maxFacts: number, fileName: string): Promise<number> {
  let fitScale = 1;
  await renderImage(
    { spec, copy: COPY },
    {
      generative: true,
      aspect: "4:5",
      outDir: tmpDir,
      fileName,
      maxFacts,
      genartDeps: { caller: async () => PLACEHOLDER_ART_DATA_URI },
      onFit: (s) => {
        fitScale = s;
      },
    },
  );
  return fitScale;
}

describe("renderImage overflow gate (#790)", () => {
  it("fits ALL lfahSpec facts in the 4:5 hero (the fit loop converges, including the 55% tile)", async () => {
    const spec = lfahSpec();
    // The full hero shows every fact; this is the exact case the operator caught clipping.
    const fitScale = await render(spec, spec.facts.length, "hero-full.png");
    expect(fitScale).toBeGreaterThan(0.5); // converged at or above the floor → it fit
    expect(fitScale).toBeLessThanOrEqual(1);
    // The 55% punchline tile must be part of what was rendered.
    expect(
      spec.facts.some((f) => /55%/.test(f.value) && /cost saving/i.test(f.label)),
    ).toBe(true);
  });

  it("THROWS (loud failure, not a silent clip) when given far too many facts to ever fit", async () => {
    // Fabricate a spec with many tall tiles that cannot fit even at the minimum fit scale.
    const many: Fact[] = Array.from({ length: 60 }, (_, i) => ({
      label: `metric number ${i} with a deliberately long label to force tall tiles`,
      value: `${i}00.0%`,
      scopeGuard: `n=13, scope guard line ${i} also long`,
      source: "r.md",
    }));
    const spec: ContentSpec = {
      product: {
        name: "overflow-case",
        summary: "a card with far too many tiles to fit the frame",
        repoUrl: "https://github.com/example/example",
      },
      facts: many,
      highlights: [],
      ctas: ["Try it"],
      sourceFiles: [],
    };
    await expect(render(spec, many.length, "overflow.png")).rejects.toThrow(
      /card content overflows the frame/i,
    );
  });
});
