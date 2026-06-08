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
 * Build a single context string from the spec — product name/summary and all
 * fact values + scopeGuards — so every supporting number lives in it.
 */
export function buildContext(spec: ContentSpec): string {
  const parts: string[] = [spec.product.name, spec.product.summary];
  for (const fact of spec.facts) {
    parts.push(fact.value);
    if (fact.scopeGuard) {
      parts.push(`(${fact.scopeGuard})`);
    }
  }
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
