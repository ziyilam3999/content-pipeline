/**
 * REAL-key smoke for the copy adapter — exercises the actual Claude CLI (Max OAuth).
 *
 * Proves the PRIMARY path (Claude), never silently passes on a fallback
 * (feedback_smoke_prove_primary_not_fallback): the default adapter caller is Claude-only and
 * throws on failure, so a non-Claude path can only occur via explicit injection — which this
 * smoke does not do. Emits a greppable `SMOKE-PATH:` line and exits non-zero on any failure.
 *
 * Run: `npm run smoke:copy`  (requires the ambient `claude` login; ANTHROPIC_API_KEY must be unset)
 */

import { writeCopy } from "../adapters/copy";
import { type ContentSpec } from "../inputs/contentspec";

// A small, PUBLIC spec about lfah (no employer brand; numbers are public benchmark facts).
const spec: ContentSpec = {
  product: {
    name: "lfah",
    summary: "a test-driven app builder that turns a failing test green",
  },
  facts: [
    { label: "bugs evaluated", value: "74", source: "PHASE-B-VERDICT" },
    { label: "resolved rate", value: "83.8%", source: "PHASE-B-VERDICT" },
  ],
  highlights: ["test-first", "real test oracle"],
  ctas: ["check out the repo"],
  sourceFiles: ["PHASE-B-VERDICT"],
};

async function main() {
  if (process.env.ANTHROPIC_API_KEY) {
    console.error("SMOKE FAIL: ANTHROPIC_API_KEY is set — must use Claude Max OAuth, not metered API.");
    process.exit(1);
  }
  const allowFallback = process.env.SMOKE_ALLOW_FALLBACK === "1";

  console.log("→ calling the REAL Claude CLI (Max OAuth) to write launch copy…");
  const out = await writeCopy(spec); // no injected caller → real Claude, primary-only

  const primaryProven = out.pathUsed === "claude";
  console.log(`SMOKE-PATH: primary=claude used=${out.pathUsed} clean=${out.verify.ok}`);

  if (!primaryProven && !allowFallback) {
    console.error(
      `SMOKE FAIL: copy came from "${out.pathUsed}", not the Claude primary. ` +
        `(set SMOKE_ALLOW_FALLBACK=1 only if you explicitly want to accept a fallback.)`,
    );
    process.exit(1);
  }

  // The copy must be real and non-empty.
  if (!Array.isArray(out.thread) || out.thread.length === 0 || !out.script || out.script.trim() === "") {
    console.error("SMOKE FAIL: empty thread or script returned.");
    process.exit(1);
  }

  console.log("\n--- generated X thread ---");
  out.thread.forEach((post, i) => console.log(`  [${i + 1}] ${post}`));
  console.log("\n--- video script ---\n  " + out.script);
  console.log("\n--- infographic labels ---\n  " + out.labels.join(" | "));
  console.log(`\nattempts=${out.attempts}  numbers-verified=${out.verify.ok}` +
    (out.verify.ok ? "" : `  unsupported=${out.verify.unsupportedNumbers.join(",")}`));

  if (!out.verify.ok) {
    console.error("\nSMOKE FAIL: copy contains an unsupported number even after the repair retry.");
    process.exit(1);
  }

  console.log("\nSMOKE PASS: real Claude primary proved, copy returned, numbers verified.");
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
