/**
 * #1326 — render-time CENTER-SAFE LAYOUT gate for the static 4:5 card.
 *
 * IG's profile GRID center-crops a 4:5 (1080×1350) feed STILL down to a centered 3:4 (0.75) portrait
 * thumbnail — WIDTH-bound vs the 0.80 source, so it trims the SIDES. Content laid too close to a card
 * edge survives the full feed render but is CLIPPED in the grid thumbnail (silently, until it is public).
 * renderImage now asserts, after the fit loop converges and before the screenshot, that every drawn
 * element sits inside that 3:4 centered safe area — extending the #790 silent-clip discipline from the
 * bottom edge to the IG-grid safe area. This is content PLACEMENT, distinct from #1319's canvas SIZE.
 *
 * These tests drive the REAL Playwright render path (deterministic placeholder background, no paid call,
 * no network) and prove both ends of the mechanical gate:
 *   1. the full lfahSpec 4:5 hero — every drawn element is inside the safe area (no throw);
 *   2. a card with an art-mask overlay placed OUTSIDE the safe area on the LEFT edge — the assertion FIRES;
 *   3. (right-edge twin) an overlay past the RIGHT safe edge ALSO fires through the real render path.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { renderImage } from "../image";
import { lfahSpec } from "../../smoke/lfahSpec";
import { type ContentSpec } from "../../inputs/contentspec";
import { type CopyResult } from "../../pipeline/run";
import { type ArtMaskOverlay } from "../../image/card";

// Playwright launch + layout is heavier than a unit test; give it generous headroom.
jest.setTimeout(120_000);

const PLACEHOLDER_ART_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const COPY: CopyResult = { thread: [], script: "", labels: [] };

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "card-safe-area-"));
});
afterAll(() => {
  // mv-not-rm is for tracked artefacts; this is an OS temp scratch dir → rm is fine.
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Render through the real 4:5 adapter with a fixed placeholder background (no paid call). */
async function render(
  spec: ContentSpec,
  fileName: string,
  overlays?: ArtMaskOverlay[],
): Promise<string> {
  return renderImage(
    { spec, copy: COPY },
    {
      generative: true,
      aspect: "4:5",
      outDir: tmpDir,
      fileName,
      genartDeps: { caller: async () => PLACEHOLDER_ART_DATA_URI },
      overlays,
    },
  );
}

describe("renderImage center-safe layout gate (#1326)", () => {
  it("PASSES the proven lfahSpec 4:5 card — every drawn element is inside the 3:4 safe area", async () => {
    const spec = lfahSpec();
    // The default 4:5 card lays content at x∈[60,1020], inside the [33.75,1046.25] safe band → no throw.
    const out = await render(spec, "safe-pass.png");
    expect(fs.existsSync(out)).toBe(true);
  });

  it("FIRES when an overlay is placed OUTSIDE the safe area on the LEFT edge", async () => {
    const spec = lfahSpec();
    // left:5 < safe.left (≈33.75) → the LEFT safe edge is crossed in the REAL render.
    const overlays: ArtMaskOverlay[] = [{ left: 5, top: 5, width: 120, height: 60, variant: "scrim" }];
    await expect(render(spec, "safe-fail-left.png", overlays)).rejects.toThrow(
      /center-safe layout violated/i,
    );
  });

  it("FIRES when an overlay crosses the RIGHT safe edge (right-edge twin, real render path)", async () => {
    const spec = lfahSpec();
    // left:1000 + width:120 → right 1120 > safe.right (≈1046.25) → the RIGHT safe edge is crossed.
    const overlays: ArtMaskOverlay[] = [{ left: 1000, top: 5, width: 120, height: 60, variant: "scrim" }];
    await expect(render(spec, "safe-fail-right.png", overlays)).rejects.toThrow(
      /center-safe layout violated/i,
    );
  });
});
