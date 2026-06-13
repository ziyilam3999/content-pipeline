/**
 * BOTH-ENDS test for the ART-TEXT GATE (#824 ocr-gate).
 *
 * The gate exists because the post-4 art prompt named labelable elements ("three output panels:
 * copy / image card / captioned video"), so nano-banana baked garbled text into the image. This
 * test proves the mechanical backstop catches that failure AND does not false-positive on the
 * fixed, purely-abstract art:
 *   - OLD garbled base (smoke/fixtures/ocr-gate/old-garbled-art-post4.png) → gate FAILS (legible
 *     words "copy"/"card"/"captioned"/"video" detected; assertNoArtText throws).
 *   - NEW clean abstract base (smoke/fixtures/ocr-gate/new-clean-art-post4.png) → gate PASSES (no
 *     legible words; assertNoArtText resolves).
 *
 * OFFLINE / hermetic: the English OCR model is vendored at smoke/fixtures/tessdata/eng.traineddata.gz
 * (used by default via defaultLangPath()), so this test makes no network call.
 */

import * as fs from "fs";
import * as path from "path";

import { detectArtText, assertNoArtText } from "../art-text-gate";

const OLD_GARBLED = path.join(process.cwd(), "smoke", "fixtures", "ocr-gate", "old-garbled-art-post4.png");
const NEW_CLEAN = path.join(process.cwd(), "smoke", "fixtures", "ocr-gate", "new-clean-art-post4.png");

// OCR (model load + recognize) is slow; give each case generous headroom.
const OCR_TIMEOUT_MS = 120_000;

describe("art-text-gate (#824 ocr-gate) — both ends", () => {
  it("FLAGS the OLD garbled art base (legible baked-in words)", async () => {
    expect(fs.existsSync(OLD_GARBLED)).toBe(true);
    const result = await detectArtText(OLD_GARBLED);
    expect(result.hasText).toBe(true);
    // The garbled base baked these clean words; at least one must be detected above threshold.
    const detected = result.words.map((w) => w.text.toLowerCase());
    expect(detected.some((t) => /^(copy|card|captioned|video)$/.test(t))).toBe(true);
    // assertNoArtText must throw on it (fail-closed).
    await expect(assertNoArtText(OLD_GARBLED)).rejects.toThrow(/ART-TEXT GATE FAIL/);
  }, OCR_TIMEOUT_MS);

  it("PASSES the NEW purely-abstract art base (no legible words)", async () => {
    expect(fs.existsSync(NEW_CLEAN)).toBe(true);
    const result = await detectArtText(NEW_CLEAN);
    if (result.hasText) {
      throw new Error(
        `NEW clean art unexpectedly tripped the gate with: ${result.words
          .map((w) => `"${w.text}"(${w.confidence})`)
          .join(", ")}`,
      );
    }
    expect(result.hasText).toBe(false);
    await expect(assertNoArtText(NEW_CLEAN)).resolves.toBeDefined();
  }, OCR_TIMEOUT_MS);
});
