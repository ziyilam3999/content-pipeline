import { ContentSpec, Fact } from "../inputs/contentspec";

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
  opts?: { maxFacts?: number; backgroundDataUri?: string }
): string {
  const maxFacts = opts?.maxFacts ?? 4;
  const facts = selectFacts(spec, maxFacts);
  const { width, height } = dims;
  const repoHost = (spec.product.repoUrl ?? "").replace(/^https?:\/\//, "");

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

  const bgStyle = opts?.backgroundDataUri
    ? `background-image: url("${opts.backgroundDataUri}"); background-size: cover;`
    : `background: radial-gradient(ellipse at 60% 40%, #1a2a4a 0%, #0a0f1e 80%);`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
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
}
.name { font-size: 48px; font-weight: 700; }
.summary { font-size: 28px; margin-top: 16px; opacity: 0.85; }
.facts { display: flex; flex-wrap: wrap; gap: 24px; margin-top: 40px; }
.fact { background: rgba(255,255,255,0.12); padding: 24px; border-radius: 12px; min-width: 200px; }
.label { display: block; font-size: 18px; opacity: 0.7; }
.value { display: block; font-size: 48px; font-weight: 700; }
.scope { display: block; font-size: 16px; opacity: 0.6; }
.cta { margin-top: auto; font-size: 28px; font-weight: 600; }
.repo { font-size: 20px; opacity: 0.7; margin-top: 8px; }
</style>
</head>
<body>
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
