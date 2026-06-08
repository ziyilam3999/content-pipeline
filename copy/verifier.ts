import { ContentSpec } from '../inputs/contentspec';

const SUPERSET = new Set<string>([
  'fastest',
  'only',
  'never',
  'first',
  'world-class',
]);

/** Normalise a numeric token for comparison: strip commas and trailing %. */
function normalizeToken(n: string): string {
  return n.replace(/,/g, '').replace(/%$/, '');
}

/**
 * Build a single context string from the spec so every author-provided number
 * counts as "supported". The anti-hallucination guard only needs to reject
 * numbers that appear NOWHERE in the spec; any digit the human put in the spec
 * — a fact value/guard, a fact LABEL (e.g. "1-shot Opus"), the repo URL handle
 * (e.g. ".../ziyilam3999"), a highlight, or a CTA — is fair game in the copy.
 * Omitting those fields caused false-positive "unsupported" flags on legitimate
 * launch copy; including them is monotonic (only ever adds support, so it can
 * never mask a genuinely invented statistic like "99%").
 */
export function buildContext(spec: ContentSpec): string {
  const parts: string[] = [spec.product.name, spec.product.summary];
  if (spec.product.repoUrl) {
    parts.push(spec.product.repoUrl);
  }
  for (const fact of spec.facts) {
    parts.push(fact.label);
    parts.push(fact.value);
    if (fact.scopeGuard) {
      parts.push(`(${fact.scopeGuard})`);
    }
  }
  parts.push(...spec.highlights);
  parts.push(...spec.ctas);
  return parts.join(' ');
}

/**
 * Verify `draft` against `spec`: every number must be supportable by context,
 * and marketing superlatives must be flagged for human review.
 *
 * A draft is "ok" iff every numeric token it contains appears in the
 * context built from the spec.  Commas and a trailing % are normalised
 * away ("1,000" ↔ "1000", "83.8%" ↔ "83.8") before comparison.
 *
 * Superlative keywords are matched as WHOLE tokens (not a \b regexp):
 * the draft is split on whitespace and punctuation, each token is lowercased
 * and compared for equality — so "only" does not match inside "lonely"
 * and "first" does not match inside "test-first", but the standalone
 * superlative hyphenated compound "world-class" still flags.
 */
export function verifyDraft(
  draft: string,
  spec: ContentSpec,
): {
  ok: boolean;
  unsupportedNumbers: string[];
  flaggedSuperlatives: string[];
} {
  // (a) Number verification against context
  const ctx = buildContext(spec);

  const ctxNorms = new Set<string>();
  for (const m of ctx.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) {
    ctxNorms.add(normalizeToken(m));
  }

  const unsupportedNumbers: string[] = [];
  for (const m of draft.match(/\d[\d,]*(?:\.\d+)?%?/g) ?? []) {
    if (!ctxNorms.has(normalizeToken(m))) {
      unsupportedNumbers.push(m);
    }
  }

  // (b) Superlative flagging (whole-token, case-insensitive)
  const flaggedSuperlatives: string[] = [];
  for (const token of draft.match(/[a-z0-9-]+/gi) ?? []) {
    const lower = token.toLowerCase();
    if (SUPERSET.has(lower) && !flaggedSuperlatives.includes(lower)) {
      flaggedSuperlatives.push(lower);
    }
  }

  return {
    ok: unsupportedNumbers.length === 0,
    unsupportedNumbers,
    flaggedSuperlatives,
  };
}
