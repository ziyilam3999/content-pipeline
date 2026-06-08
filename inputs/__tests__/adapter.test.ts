import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  extractFactsFromMarkdown,
  extractFactsFromJson,
  buildContentSpec,
  JsonExtractor,
} from "../adapter";
import { validateContentSpec, unguardedFacts, ContentSpec } from "../contentspec";

const TABLE_MD = `
## Results

| Arm | Resolved | n |
| --- | --- | --- |
| 5-role chain | 83.8% (p=0.023) | 74 |
| 1-shot | 74.3% | 74 |

- **Never loses a bug:** 0 regressions across the matched set (n=47)
- **Mostly free:** runs on a local model
- plain bullet with a 99 number but no bold label
`;

describe("extractFactsFromMarkdown", () => {
  const facts = extractFactsFromMarkdown(TABLE_MD, "results.md");

  it("pulls a fact per numeric table cell, labelled row — column", () => {
    const resolved = facts.find((f) => f.label === "5-role chain — Resolved");
    expect(resolved).toBeDefined();
    expect(resolved!.value).toBe("83.8%");
    expect(resolved!.scopeGuard).toBe("p=0.023");
    expect(resolved!.source).toBe("results.md");
  });

  it("carries the row's guard to a guardless cell in the same row", () => {
    const n = facts.find((f) => f.label === "5-role chain — n");
    expect(n!.value).toBe("74");
    expect(n!.scopeGuard).toBe("p=0.023");
  });

  it("leaves scopeGuard undefined when the row has no guard", () => {
    const oneShot = facts.find((f) => f.label === "1-shot — Resolved");
    expect(oneShot!.value).toBe("74.3%");
    expect(oneShot!.scopeGuard).toBeUndefined();
  });

  it("extracts a quantitative bold-label bullet with its guard", () => {
    const bullet = facts.find((f) => f.label === "Never loses a bug");
    expect(bullet).toBeDefined();
    expect(bullet!.value).toBe("0");
    expect(bullet!.scopeGuard).toBe("n=47");
  });

  it("ignores non-numeric bold bullets and non-bold bullets", () => {
    expect(facts.find((f) => f.label === "Mostly free")).toBeUndefined();
    expect(facts.some((f) => f.value === "99")).toBe(false);
  });

  it("never invents a number not present in the source", () => {
    for (const f of facts) expect(TABLE_MD).toContain(f.value);
  });
});

const DOC_AND_NOISE_MD = `
## Configuration

| Variable | Default | What it controls |
| --- | --- | --- |
| \`LFAH_CCR_BASE_URL\` | http://127.0.0.1:3456 | Base URL |
| \`LFAH_CLOUD_HANDOFF\` | 0 | Set to 1 to escalate |

## Versions

| Tool | Version | Score |
| --- | --- | --- |
| widget | 1.2.3 | 88% |
`;

describe("extractFactsFromMarkdown — precision (no noise)", () => {
  const facts = extractFactsFromMarkdown(DOC_AND_NOISE_MD, "readme.md");

  it("skips documentation/config tables entirely (Variable/Default/What it controls)", () => {
    expect(facts.some((f) => f.value === "127.0")).toBe(false);
    expect(facts.some((f) => f.label.includes("LFAH_"))).toBe(false);
    expect(facts.some((f) => f.label.includes("Default"))).toBe(false);
  });

  it("rejects multi-dot numbers (IP / version) but keeps a clean metric in the same row", () => {
    expect(facts.some((f) => f.value === "1.2.3")).toBe(false);
    expect(facts.some((f) => f.value === "1.2")).toBe(false);
    const score = facts.find((f) => f.label === "widget — Score");
    expect(score!.value).toBe("88%");
  });
});

const PROSE_GUARD_MD = `
## Headline result

Across 74 SWE-bench instances (n=74) the chain held up:

| Arm | Resolved |
| --- | --- |
| 5-role chain | 83.8% |
| 1-shot | 74.3% |

## Unrelated section (no guard above this one)

| Arm | Latency |
| --- | --- |
| chain | 8m |
`;

describe("extractFactsFromMarkdown — prose-level scope guard (#695)", () => {
  const facts = extractFactsFromMarkdown(PROSE_GUARD_MD, "results.md");

  it("attaches the intro sentence's guard to a table whose cells/rows carry none", () => {
    const resolved = facts.find((f) => f.label === "5-role chain — Resolved");
    expect(resolved!.value).toBe("83.8%");
    expect(resolved!.scopeGuard).toBe("n=74");
  });

  it("does not borrow a guard for a table with no guard in its preceding paragraph", () => {
    const latency = facts.find((f) => f.label === "chain — Latency");
    expect(latency!.value).toBe("8"); // metricNumber strips the unit; the point is the guard below
    expect(latency!.scopeGuard).toBeUndefined();
  });

  it("a cell/row guard still wins over the prose guard (precedence)", () => {
    const mixed = extractFactsFromMarkdown(
      `Intro (n=74):\n\n| Arm | Resolved |\n| --- | --- |\n| chain | 83.8% (p=0.023) |\n`,
      "r.md",
    );
    expect(mixed.find((f) => f.label === "chain — Resolved")!.scopeGuard).toBe("p=0.023");
  });
});

describe("extractFactsFromJson", () => {
  const obj = {
    iterations: 1,
    telemetry: { cost: { chain_total_cost_usd: 0.6865 } },
    verdict: "SHIP",
  };
  const extractors: JsonExtractor[] = [
    { path: "iterations", label: "Iterations to green" },
    { path: "telemetry.cost.chain_total_cost_usd", label: "Chain cost (USD)", scopeGuard: "1 instance" },
    { path: "verdict", label: "Verdict" },
  ];
  const facts = extractFactsFromJson(obj, "run.json", extractors);

  it("extracts numeric facts at dot-paths", () => {
    expect(facts.find((f) => f.label === "Iterations to green")!.value).toBe("1");
    const cost = facts.find((f) => f.label === "Chain cost (USD)")!;
    expect(cost.value).toBe("0.6865");
    expect(cost.scopeGuard).toBe("1 instance");
  });

  it("skips non-numeric values (e.g. a verdict string)", () => {
    expect(facts.find((f) => f.label === "Verdict")).toBeUndefined();
  });
});

describe("validateContentSpec / unguardedFacts", () => {
  it("flags a spec missing product fields or a number-less fact", () => {
    const bad: ContentSpec = {
      product: { name: "", summary: "" },
      facts: [{ label: "x", value: "no-number", source: "s" }],
      highlights: [],
      ctas: [],
      sourceFiles: [],
    };
    const errs = validateContentSpec(bad);
    expect(errs).toContain("product.name is required");
    expect(errs.some((e) => e.includes("has no number"))).toBe(true);
  });

  it("passes a well-formed spec and reports unguarded facts", () => {
    const good: ContentSpec = {
      product: { name: "lfah", summary: "local-first agent harness" },
      facts: [
        { label: "Resolved", value: "84%", scopeGuard: "n=27", source: "r.md" },
        { label: "Cost", value: "$0.69", source: "r.json" },
      ],
      highlights: [],
      ctas: [],
      sourceFiles: [],
    };
    expect(validateContentSpec(good)).toEqual([]);
    expect(unguardedFacts(good).map((f) => f.label)).toEqual(["Cost"]);
  });
});

describe("buildContentSpec (file inputs)", () => {
  it("reads markdown + json files into a valid spec with provenance", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lcp-"));
    const mdPath = path.join(dir, "results.md");
    const jsonPath = path.join(dir, "run.json");
    fs.writeFileSync(mdPath, TABLE_MD);
    fs.writeFileSync(jsonPath, JSON.stringify({ iterations: 1 }));
    const spec = buildContentSpec({
      product: { name: "lfah", summary: "a local-first agent harness" },
      markdownPaths: [mdPath],
      jsonInputs: [{ path: jsonPath, extractors: [{ path: "iterations", label: "Iterations" }] }],
      ctas: ["Star the repo"],
    });
    expect(validateContentSpec(spec)).toEqual([]);
    expect(spec.sourceFiles).toEqual([mdPath, jsonPath]);
    expect(spec.facts.length).toBeGreaterThan(3);
    expect(spec.facts.every((f) => TABLE_MD.includes(f.value) || f.source === jsonPath)).toBe(true);
  });
});
