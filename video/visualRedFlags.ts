/**
 * #867 Leg 1 — CHEAP mechanical red-flag asserts over the DISPLAYED copy/manifest STRINGS.
 *
 * SCOPE — READ THIS: these are SPEC-PROXY / STRING checks, NOT pixel OCR. They run over the on-screen
 * text SOURCES (scene/beat labels, narration text, card copy, caption cues, displayed URLs, render-spec
 * layout) — the strings the renderer turns into pixels — NOT over the rendered pixels themselves. They
 * are a cheap PRE-FILTER that catches the obvious leak classes #824 hit (a `#748` task-ref or
 * `example.com` URL on a public frame) without a human or an OCR pass. They CANNOT see a layout bug the
 * spec doesn't model, wrong CONTENT (a terminal where the product should be), letterboxing, or "too
 * much text" rendered. The PIXEL-level catch remains the human EYEBALL (the eyeball-ack gate). Do not
 * mistake a green red-flag pass for "the pixels are fine".
 *
 * React-free + pure → inside the tsc/jest gate. Reuses the `assertBrandClean` / `assertHorizontalSafeArea`
 * machinery rather than re-implementing it.
 */

import { assertBrandClean } from "../inputs/frames";
import { assertHorizontalSafeArea, SAFE_SQUARE_MAX_RATIO } from "./demoLayout";

/**
 * Internal dev-token denylist — the exact leak classes #824 caught on a public frame. These regexes
 * run over every on-screen string source. Each pattern names WHY it is forbidden in the message.
 */
const DEV_TOKEN_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /#\d{2,4}\b/, why: "an internal task/issue ref (e.g. #748)" },
  { re: /\bsmoke\b/i, why: 'the word "smoke" (a dev/test artefact leaking onto a public frame)' },
  { re: /\bPhase\s+[A-Z0-9]/, why: 'a dev "Phase X" milestone marker' },
  { re: /\btell me\b/i, why: 'a dev instruction ("tell me what to change")' },
  { re: /\bwatch it\b/i, why: 'a dev instruction ("watch it")' },
  { re: /\bTODO\b/, why: "a TODO marker" },
  { re: /\bplaceholder\b/i, why: "the word placeholder (a stub shown as real)" },
  { re: /\bWIP\b/, why: "a work-in-progress marker" },
];

/**
 * Placeholder / fake URL denylist — a fake `github.com/example/lfah` URL was on a real card (#824).
 */
const PLACEHOLDER_URL_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /example\.(com|org|net)\b/i, why: "an example.com/org/net placeholder domain" },
  { re: /\bexample\//i, why: 'an "example/" placeholder path segment (e.g. github.com/example/repo)' },
  { re: /your-?(repo|org|handle|name|user)/i, why: 'a "your-repo"/"your-handle" template placeholder' },
  { re: /<[^>]+>/, why: "an unresolved <template> placeholder" },
];

/**
 * #867 — THROW if any displayed string carries an internal dev token (the #824 leak class). Also runs
 * `assertBrandClean` over each string (employer-token denylist) since the same surfaces are governed by
 * the privacy rule. No-op when every string is clean. SPEC-PROXY over strings — not pixel OCR.
 */
export function assertNoInternalDevTokens(strings: ReadonlyArray<string>, label = "on-screen copy"): void {
  const offenders: string[] = [];
  for (const s of strings) {
    if (typeof s !== "string") continue;
    // Brand denylist (reuse — privacy hard rule). assertBrandClean throws on the first hit; capture it.
    try {
      assertBrandClean(s);
    } catch (err) {
      offenders.push(`"${truncate(s)}" → ${err instanceof Error ? err.message : String(err)}`);
    }
    for (const { re, why } of DEV_TOKEN_PATTERNS) {
      const m = s.match(re);
      if (m) offenders.push(`"${truncate(s)}" contains ${why} (matched "${m[0]}")`);
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      `#867 visual red-flag — internal dev token(s) in ${label} (these would leak onto a public frame):\n  - ` +
        offenders.join("\n  - "),
    );
  }
}

/**
 * #867 — THROW if any displayed string carries a placeholder/fake URL or template leftover. No-op when
 * clean. SPEC-PROXY over strings — not pixel OCR.
 */
export function assertNoPlaceholderUrls(strings: ReadonlyArray<string>, label = "on-screen copy"): void {
  const offenders: string[] = [];
  for (const s of strings) {
    if (typeof s !== "string") continue;
    for (const { re, why } of PLACEHOLDER_URL_PATTERNS) {
      const m = s.match(re);
      if (m) offenders.push(`"${truncate(s)}" contains ${why} (matched "${m[0]}")`);
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      `#867 visual red-flag — placeholder/fake URL(s) in ${label} (a real card must show a REAL url):\n  - ` +
        offenders.join("\n  - "),
    );
  }
}

/**
 * #867 — SPEC-PROXY island-layout check. An "island" is square content floating in a tall frame with
 * empty top/bottom (the #765 regression). For a CROPPABLE (taller-than-square) aspect we assert the
 * layout spec's usable vertical content span covers ≥ `minSpanFraction` (default 0.85) of the frame
 * height — i.e. the content FILLS the frame instead of being a centred island — AND reuse
 * `assertHorizontalSafeArea` so content also stays inside the horizontal title-safe band. Square cuts
 * (ratio ≤ SAFE_SQUARE_MAX_RATIO) are intentionally centred and are skipped.
 *
 * CAVEAT (state this in the PR): this checks the renderSpec's CONTENT BOX, NOT the rendered pixels. It
 * cannot catch a layout bug the spec doesn't model (e.g. a component that ignores the layout). The
 * pixel-level island catch remains the human EYEBALL; this is only a cheap pre-filter.
 */
export function assertNoIslandLayout(
  layout: {
    aspectRatio: number;
    usableSpanFraction: number;
    contentMaxWidthPx: number;
    safeAreaXFraction: number;
  },
  frame: { width: number; height: number },
  opts?: { minSpanFraction?: number; label?: string },
): void {
  const minSpan = opts?.minSpanFraction ?? 0.85;
  const label = opts?.label ?? `${layout.aspectRatio.toFixed(3)}:1`;

  // Square (or wider) cuts are legitimately centred — no island risk on a near-square frame.
  if (layout.aspectRatio <= SAFE_SQUARE_MAX_RATIO) return;

  if (!(layout.usableSpanFraction >= minSpan)) {
    throw new Error(
      `#867 visual red-flag (spec-proxy) — possible ISLAND layout for aspect "${label}": the spec's usable ` +
        `vertical content span is ${(layout.usableSpanFraction * 100).toFixed(1)}% of frame height, below the ` +
        `${(minSpan * 100).toFixed(0)}% fill floor. A tall frame should FILL, not centre a square island with ` +
        `empty top/bottom bands (the #765 regression). NOTE: spec-level proxy — the pixel-level island catch ` +
        `is the human eyeball.`,
    );
  }

  // Horizontal title-safe band — reuse the existing assertion machinery.
  assertHorizontalSafeArea({
    width: frame.width,
    contentExtentPx: layout.contentMaxWidthPx,
    safeAreaXFraction: layout.safeAreaXFraction,
    aspectRatio: layout.aspectRatio,
    label,
  });
}

function truncate(s: string, n = 80): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
}
