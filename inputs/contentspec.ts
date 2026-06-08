export type Fact = {
  label: string;
  value: string;
  scopeGuard?: string;
  source: string;
};

export type ContentSpec = {
  product: { name: string; summary: string; repoUrl?: string };
  facts: Fact[];
  highlights: string[];
  ctas: string[];
  sourceFiles: string[];
};

export function validateContentSpec(spec: ContentSpec): string[] {
  const errors: string[] = [];
  if (!spec.product.name) {
    errors.push("product.name is required");
  }
  for (const fact of spec.facts) {
    if (!/\d/.test(fact.value)) {
      errors.push(`fact "${fact.label}" has no number`);
    }
  }
  return errors;
}

export function unguardedFacts(spec: ContentSpec): Fact[] {
  return spec.facts.filter((f) => f.scopeGuard === undefined);
}
