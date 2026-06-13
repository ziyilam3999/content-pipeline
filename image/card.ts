import { ContentSpec, Fact } from "../inputs/contentspec";

/**
 * An art-text MASK overlay (#824 mask-art-text). A nano-banana art base can bake GARBLED / MISSPELLED
 * micro-text into the image (e.g. the post-4 art baked "ASK", "copy", "imae card", "captioned video"
 * into the lower-right). Garbled text can never ship on a public post, so the card renderer paints an
 * OPAQUE chip — positioned in CARD-SPACE px — fully over each garbled spot, optionally carrying a CLEAN
 * rendered label. The chips sit ABOVE the art background but BELOW the translucent content tiles
 * (z-index:-1), so even where a tile overlaps a masked spot the garble cannot bleed through the tile.
 */
export interface ArtMaskOverlay {
  /** Chip left edge, px from the card's top-left corner (card-space). */
  left: number;
  /** Chip top edge, px from the card's top-left corner (card-space). */
  top: number;
  /** Chip width in px — make it comfortably WIDER than the garble it covers. */
  width: number;
  /** Chip height in px — make it comfortably TALLER than the garble it covers. */
  height: number;
  /** A clean label rendered centered in the chip (the CORRECT word for that art panel). */
  label?: string;
  /** Font size px (default 26). */
  fontSize?: number;
  /** "chip" = opaque label tile (default); "scrim" = opaque darkening cover only, no text. */
  variant?: "chip" | "scrim";
}

/**
 * Render the art-text mask layer (#824). Empty/absent → "" (byte-identical to the pre-mask card, so
 * every existing card render and snapshot is unchanged). Each overlay is an absolutely-positioned chip
 * in card-space px; the container is z-index:-1 (above art, below translucent content tiles).
 */
function buildOverlaysHtml(overlays?: ArtMaskOverlay[]): { css: string; html: string } {
  if (!overlays || overlays.length === 0) return { css: "", html: "" };
  const items = overlays
    .map((o) => {
      const variant = o.variant ?? "chip";
      const fs = o.fontSize ?? 26;
      const text = variant === "chip" && o.label ? esc(o.label) : "";
      return (
        `<div class="art-overlay ${variant}" style="left:${o.left}px;top:${o.top}px;` +
        `width:${o.width}px;height:${o.height}px;font-size:${fs}px;">${text}</div>`
      );
    })
    .join("\n");
  const css = `
/* Art-text MASK layer (#824 mask-art-text). Opaque chips that cover garbled baked-in art text with
   clean rendered labels. z-index:-1 → above the art background but BELOW the translucent content tiles,
   so the garble can't bleed through a tile either. pointer-events:none keeps it inert. */
.art-overlays { position: absolute; inset: 0; z-index: -1; pointer-events: none; }
.art-overlay { position: absolute; display: flex; align-items: center; justify-content: center;
  border-radius: 10px; font-weight: 600; letter-spacing: 0.3px; text-align: center; line-height: 1.05; }
.art-overlay.chip {
  background: linear-gradient(180deg, #0e1a33 0%, #0a1322 100%);
  color: #d6f3e7; border: 1px solid rgba(56,211,159,0.45);
  box-shadow: 0 0 0 1px rgba(0,0,0,0.65), 0 4px 16px rgba(0,0,0,0.5);
  text-shadow: 0 1px 2px rgba(0,0,0,0.7);
}
.art-overlay.scrim { background: #0a1322; box-shadow: 0 0 14px 8px #0a1322; }`;
  const html = `<div class="art-overlays">\n${items}\n</div>`;
  return { css, html };
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function selectFacts(spec: ContentSpec, maxFacts: number): Fact[] {
  // Numbers already implied by an "n=<num>" scope guard anywhere in the spec.
  // e.g. a fact guarded "n=74" tells the viewer the sample size is 74.
  const impliedNs = new Set<string>();
  for (const f of spec.facts) {
    const m = (f.scopeGuard ?? "").match(/\bn\s*=\s*([\d,]+)/i);
    if (m) impliedNs.add(m[1].replace(/,/g, ""));
  }

  // A "bare n tile" is an UNGUARDED fact whose value is just a number that some
  // other fact's guard already implies (e.g. "Suite size: 74" next to "n=74").
  // It adds a tile without adding information — curate it out so the slot can go
  // to a fact the viewer hasn't already seen. Guarded facts are never dropped:
  // they carry their own scope and meaning.
  const isRedundantBareN = (f: Fact): boolean => {
    if (f.scopeGuard) return false;
    const v = f.value.trim().replace(/,/g, "");
    return /^\d+$/.test(v) && impliedNs.has(v);
  };

  const guarded = spec.facts.filter((f) => !!f.scopeGuard);
  const unguarded = spec.facts.filter((f) => !f.scopeGuard && !isRedundantBareN(f));
  return [...guarded, ...unguarded].slice(0, maxFacts);
}

export function buildCardHtml(
  spec: ContentSpec,
  dims: { width: number; height: number },
  opts?: { maxFacts?: number; backgroundDataUri?: string; overlays?: ArtMaskOverlay[] }
): string {
  const maxFacts = opts?.maxFacts ?? 4;
  const facts = selectFacts(spec, maxFacts);
  const { width, height } = dims;
  const repoHost = (spec.product.repoUrl ?? "").replace(/^https?:\/\//, "");

  const bgStyle = opts?.backgroundDataUri
    ? `background-image: url("${opts.backgroundDataUri}"); background-size: cover;`
    : `background: radial-gradient(ellipse at 60% 40%, #1a2a4a 0%, #0a0f1e 80%);`;

  // A tall portrait frame (9:16, ratio 1.78) gets a DENSER layout that fills its height:
  // a big hero stat + visual bar in the dead middle band, with the remaining facts as
  // wide tiles. Gated strictly on the portrait ratio so 1:1 (1.0) and 4:5 (1.25) keep the
  // exact byte-identical layout they shipped with (no regression to the publish path).
  if (height / width >= 1.5) {
    return buildTallCardHtml(spec, facts, { width, height }, repoHost, bgStyle, opts?.overlays);
  }

  const overlays = buildOverlaysHtml(opts?.overlays);

  const factsHtml = facts
    .map(
      (f) =>
        `<div class="fact">` +
        `<span class="label">${esc(f.label)}</span>` +
        `<span class="value">${esc(f.value)}</span>` +
        (f.scopeGuard ? `<span class="scope">${esc(f.scopeGuard)}</span>` : "") +
        `</div>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
/*
 * --fit is the AUTO-FIT KNOB read by the render adapter (adapters/image.ts).
 * It is a multiplier on the facts-grid type scale + spacing. Default 1 = no-op
 * (rendered layout identical to before this hook existed). The adapter measures
 * overflow after setContent and progressively lowers --fit until every .fact tile
 * AND the .cta/.repo fit inside the frame; if it cannot, it throws (no silent clip).
 * Only the FACTS GRID scales — the header (name/summary) stays readable.
 */
:root { --fit: 1; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  width: ${width}px;
  height: ${height}px;
  ${bgStyle}
  font-family: system-ui, sans-serif;
  color: #fff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 60px;
  position: relative;
}
.name { font-size: 48px; font-weight: 700; }
.summary { font-size: 28px; margin-top: 16px; opacity: 0.85; }
.facts { display: flex; flex-wrap: wrap; gap: calc(24px * var(--fit)); margin-top: calc(40px * var(--fit)); }
.fact { background: rgba(255,255,255,0.12); padding: calc(24px * var(--fit)); border-radius: 12px; min-width: calc(200px * var(--fit)); }
.label { display: block; font-size: calc(18px * var(--fit)); opacity: 0.7; }
.value { display: block; font-size: calc(48px * var(--fit)); font-weight: 700; }
.scope { display: block; font-size: calc(16px * var(--fit)); opacity: 0.6; }
.cta { margin-top: auto; font-size: 28px; font-weight: 600; }
.repo { font-size: 20px; opacity: 0.7; margin-top: 8px; }
${overlays.css}
</style>
</head>
<body>
${overlays.html}
<div class="name">${esc(spec.product.name)}</div>
<div class="summary">${esc(spec.product.summary)}</div>
<div class="facts">
${factsHtml}
</div>
<div class="cta">${esc(spec.ctas[0] ?? "")}</div>
<div class="repo">${esc(repoHost)}</div>
</body>
</html>`;
}

/**
 * Parse a percentage 0..100 out of a fact value (e.g. "83.8%" → 83.8). Returns null when the
 * value is not a clean percentage so the hero bar is only drawn for genuine 0-100% metrics.
 */
function pctOf(value: string): number | null {
  const m = value.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

/**
 * DENSER 9:16 layout (#824 card-density). The default card leaves a large empty middle band in a
 * 1080×1920 frame (header at the top, CTA pinned to the bottom). This portrait variant fills the
 * height: the header sits at the top, ONE prominent fact becomes a big hero stat (with a visual
 * bar when it is a real percentage) that grows to fill the middle, the remaining facts render as
 * wide tiles, and the CTA + real repo URL anchor the bottom. Every number is still genuine DOM text
 * straight from the spec — nothing is faked. The `.fact`/`.cta`/`.repo` classes are preserved so the
 * adapter's auto-fit/overflow gate (adapters/image.ts) still guards this layout.
 */
function buildTallCardHtml(
  spec: ContentSpec,
  facts: Fact[],
  dims: { width: number; height: number },
  repoHost: string,
  bgStyle: string,
  overlaysIn?: ArtMaskOverlay[]
): string {
  const { width, height } = dims;
  const overlays = buildOverlaysHtml(overlaysIn);
  // Pick the headline stat: prefer a clean percentage (reads punchiest + can draw a bar), else
  // the first selected fact. The rest render as wide tiles below — every fact stays on the card.
  const heroIdx = (() => {
    const p = facts.findIndex((f) => pctOf(f.value) !== null);
    return p >= 0 ? p : facts.length > 0 ? 0 : -1;
  })();
  const hero = heroIdx >= 0 ? facts[heroIdx] : undefined;
  const restFacts = facts.filter((_, i) => i !== heroIdx);
  const heroPct = hero ? pctOf(hero.value) : null;

  const heroHtml = hero
    ? `<div class="hero">
  <div class="hero-value">${esc(hero.value)}</div>
  <div class="hero-label">${esc(hero.label)}</div>
  ${hero.scopeGuard ? `<div class="hero-scope">${esc(hero.scopeGuard)}</div>` : ""}
  ${heroPct !== null ? `<div class="bar"><div class="bar-fill" style="width:${heroPct}%"></div></div>` : ""}
</div>`
    : "";

  const factsHtml = restFacts
    .map(
      (f) =>
        `<div class="fact">` +
        `<span class="label">${esc(f.label)}</span>` +
        `<span class="value">${esc(f.value)}</span>` +
        (f.scopeGuard ? `<span class="scope">${esc(f.scopeGuard)}</span>` : "") +
        `</div>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
:root { --fit: 1; --accent: #38d39f; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  width: ${width}px;
  height: ${height}px;
  ${bgStyle}
  font-family: system-ui, sans-serif;
  color: #fff;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 80px 72px;
  position: relative;
}
.name { font-size: 80px; font-weight: 800; letter-spacing: -1px; }
.summary { font-size: 38px; margin-top: 18px; opacity: 0.85; line-height: 1.3; }
/* The hero stat grows to consume the middle band so there is no dead vertical gap. */
.hero { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;
        justify-content: center; align-items: flex-start; gap: 18px; padding: 32px 0; }
.hero-value { font-size: 220px; font-weight: 800; line-height: 0.95; color: var(--accent); letter-spacing: -4px; }
.hero-label { font-size: 40px; font-weight: 600; opacity: 0.92; text-transform: uppercase; letter-spacing: 2px; }
.hero-scope { font-size: 28px; opacity: 0.6; }
.bar { width: 100%; height: 34px; margin-top: 14px; background: rgba(255,255,255,0.14); border-radius: 999px; overflow: hidden; }
.bar-fill { height: 100%; background: var(--accent); border-radius: 999px; }
/* Remaining facts as wide side-by-side tiles anchored above the footer. */
.facts { display: flex; flex-wrap: wrap; gap: calc(28px * var(--fit)); }
.fact { flex: 1 1 0; background: rgba(255,255,255,0.12); padding: calc(34px * var(--fit)); border-radius: 18px; min-width: calc(260px * var(--fit)); }
.label { display: block; font-size: calc(26px * var(--fit)); opacity: 0.7; }
.value { display: block; font-size: calc(72px * var(--fit)); font-weight: 800; margin-top: 6px; }
.scope { display: block; font-size: calc(22px * var(--fit)); opacity: 0.6; margin-top: 6px; }
.cta { margin-top: 44px; font-size: 44px; font-weight: 700; }
.repo { font-size: 30px; opacity: 0.75; margin-top: 12px; }
${overlays.css}
</style>
</head>
<body>
${overlays.html}
<div class="name">${esc(spec.product.name)}</div>
<div class="summary">${esc(spec.product.summary)}</div>
${heroHtml}
<div class="facts">
${factsHtml}
</div>
<div class="cta">${esc(spec.ctas[0] ?? "")}</div>
<div class="repo">${esc(repoHost)}</div>
</body>
</html>`;
}
