/**
 * #1156 — SHARED brand-token SSOT for every video renderer (and the future #1157 thumbnail).
 *
 * WHY this exists: the Remotion entries (`remotion/post5-index.tsx`, `post3-index.tsx`, `index.tsx`)
 * each re-declared the SAME `FONT`/`MONO` stacks and the SAME dark palette as local `const`s, and the
 * kanban/forge capture world-bgs lived only in `video/fableStoryboard.ts`. Three drifting copies of
 * "the brand" is exactly the bug class that lets one surface ship Helvetica/off-brand colour while the
 * others don't. This module is the ONE place those values live.
 *
 * PURITY CONTRACT: this file imports NOTHING (no `fs`, no React, no sibling modules). It is therefore
 * safe to import from the Remotion browser bundle (`remotion/*.tsx`), from Node adapters, AND from
 * jest. The fs-bearing data-URI builder is a SEPARATE module (`video/brandFonts.ts`) that the browser
 * bundle must never import — `video/__tests__/brandFontBundle.test.ts` enforces that.
 *
 * The bundled Inter weights (`INTER_WEIGHTS`) are the ones the renderers ACTUALLY use — grepped from
 * `remotion/*.tsx` (`fontWeight: 400|600|700|800`; there is no 900). Keep this list in lockstep with
 * the `.woff2` files committed under `assets/fonts/Inter/` — `brandFonts.ts` reads exactly these.
 */

/** The brand UI font family name as registered by the bundled `@font-face` rules. */
export const BRAND_FONT_FAMILY = "Inter";

/**
 * The brand UI font STACK. Inter is the brand face; Helvetica/Arial/sans-serif remain as graceful
 * fallbacks, but the bundled-font gate (`assertBrandFontsLoaded`) makes a render FAIL LOUDLY rather
 * than silently use a fallback, so this stack only matters if the gate is ever bypassed.
 */
export const FONT = "Inter, Helvetica, Arial, sans-serif";

/** The brand MONOSPACE stack (code/IDs/hashes). System mono — intentionally NOT bundled. */
export const MONO = "SFMono-Regular, Menlo, Consolas, monospace";

/**
 * The Inter weights bundled + loaded for the render. Grepped from `remotion/*.tsx`. SSOT for both the
 * `.woff2` set under `assets/fonts/Inter/` and the fonts-loaded gate's per-weight `check()` assertions.
 */
export const INTER_WEIGHTS = [400, 600, 700, 800] as const;
export type InterWeight = (typeof INTER_WEIGHTS)[number];

// ───────────────────────────── dark kinetic-typography palette ──────────────────────────────
// The shared palette of the post3 / post5 kinetic-typography compositions (byte-identical literals
// previously duplicated in both entries). index.tsx shares BG + FONT.

/** Deep navy canvas background. */
export const BG = "#0a0f1e";
/** The verified / deterministic-pass accent (green). */
export const GREEN = "#34d399";
/** Secondary accent (blue). */
export const BLUE = "#60a5fa";
/** Attention / footer accent (amber). */
export const AMBER = "#fbbf24";
/** Muted body text on the dark canvas. */
export const MUTED = "#94a3b8";
/** Kicker / eyebrow text. */
export const KICKER = "#64748b";
/** Dimmed tile fill. */
export const DIM_TILE = "#1e293b";
/** Dimmed tile border. */
export const DIM_BORDER = "#334155";

// ───────────────────────────── capture "world" backgrounds ──────────────────────────────
// The dominant background colours of the captured tool/output worlds (kanban + forge + fable demos).
// SSOT here; `video/fableStoryboard.ts` re-exports these for its existing importers (capture tools +
// storyboards), so changing a world colour is a one-line edit in this file.

/** Tool / terminal world (near-black navy). */
export const BG_TOOL = "#0b1020";
/** Chat / assistant world (warm near-black). */
export const BG_CHAT = "#1c1917";
/** Output world A — cream (gradient start). */
export const BG_OUTPUT_A = "#f7f1e6";
/** Output world B — deeper sand (gradient end). */
export const BG_OUTPUT_B = "#ecdfc8";
