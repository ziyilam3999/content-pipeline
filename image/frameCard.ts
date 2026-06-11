/**
 * #824 — annotated-still CARD from a captured demo frame (Phase 3).
 *
 * The DEMONSTRATION post cuts its carousel cards from the SAME captured frames the hero video uses,
 * so video + cards share one source ("every worded unit carries a card"). `image/card.ts` is the
 * data-driven fact card (`buildCardHtml`); this is a DISTINCT path: an HTML template that lays the
 * captured frame full-bleed as a `background-image` data URI on a calm brand panel, `contain`-fit
 * (never cropped — matches the hero's contain rule), with a step-label overlay.
 *
 * Pure string builder; rendered to PNG by the existing `renderImage` Playwright path (via
 * `adapters/frames.ts renderFrameCard`). The step label is brand-scrubbed at ingest.
 */

import { esc } from "./card";

/**
 * Build the annotated-still card HTML for a single captured frame. `frameDataUri` is the embedded
 * PNG (`data:image/png;base64,…`); `stepLabel` is the brand-clean caption drawn at the bottom. The
 * frame is `background-size: contain` on a dark brand panel so terminal text is never cropped.
 */
export function buildFrameCardHtml(
  frameDataUri: string,
  stepLabel: string,
  dims: { width: number; height: number },
): string {
  const { width, height } = dims;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  width: ${width}px;
  height: ${height}px;
  /* The captured frame, contain-fit (never cropped) on a calm brand panel. */
  background-color: #0a0f1e;
  background-image: url("${frameDataUri}");
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
  font-family: system-ui, sans-serif;
  color: #fff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 48px;
}
.step {
  background: rgba(0,0,0,0.62);
  align-self: center;
  font-size: 34px;
  font-weight: 600;
  padding: 16px 28px;
  border-radius: 999px;
  max-width: 86%;
  text-align: center;
}
</style>
</head>
<body>
<div class="step">${esc(stepLabel)}</div>
</body>
</html>`;
}
