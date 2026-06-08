import * as fs from "fs";
import { Fact, ContentSpec } from "./contentspec";

export type JsonExtractor = {
  path: string;
  label: string;
  scopeGuard?: string;
};

const DOC_TABLE_COLS = new Set(["Variable", "Default", "What it controls"]);

function extractGuard(text: string): string | undefined {
  const m = text.match(/\(([^)]*=[^)]*)\)/);
  return m ? m[1] : undefined;
}

function extractCellMetric(cell: string): { value: string; guard: string | undefined } | null {
  const guard = extractGuard(cell);
  const stripped = cell.replace(/\([^)]*=[^)]*\)/g, "").trim().replace(/^`+|`+$/g, "");
  // Reject multi-dot numbers (IPs, versions like 1.2.3 or 127.0.0.1)
  if (/\d+\.\d+\.\d+/.test(stripped)) return null;
  const m = stripped.match(/(\d+(?:\.\d+)?%?)/);
  if (!m) return null;
  return { value: m[1], guard };
}

function findProseGuard(textLines: string[]): string | undefined {
  const text = textLines.join(" ");
  let last: string | undefined;
  const re = /\(([^)]*=[^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    last = m[1];
  }
  return last;
}

export function extractFactsFromMarkdown(md: string, source: string): Fact[] {
  const lines = md.split("\n");
  const facts: Fact[] = [];

  // Segment document into alternating text/table blocks
  type Segment = { type: "text" | "table"; lines: string[] };
  const segments: Segment[] = [];
  let currentType: "text" | "table" = "text";
  let currentLines: string[] = [];

  for (const line of lines) {
    const isTableLine = line.trim().startsWith("|");
    if (isTableLine && currentType === "text") {
      segments.push({ type: "text", lines: currentLines });
      currentLines = [line];
      currentType = "table";
    } else if (!isTableLine && currentType === "table") {
      segments.push({ type: "table", lines: currentLines });
      currentLines = [line];
      currentType = "text";
    } else {
      currentLines.push(line);
    }
  }
  segments.push({ type: currentType, lines: currentLines });

  // Process table segments
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    if (seg.type !== "table") continue;
    const tableLines = seg.lines;
    if (tableLines.length < 3) continue;

    const headerCells = tableLines[0]
      .split("|")
      .map((s) => s.trim())
      .filter((s) => s !== "");

    // Skip documentation/config tables
    if (headerCells.some((h) => DOC_TABLE_COLS.has(h))) continue;

    const proseGuard = si > 0 ? findProseGuard(segments[si - 1].lines) : undefined;

    // Data rows start at index 2 (header + separator)
    for (let ri = 2; ri < tableLines.length; ri++) {
      const cells = tableLines[ri]
        .split("|")
        .map((s) => s.trim())
        .filter((s) => s !== "");
      if (cells.length < 2) continue;

      const rowName = cells[0];

      // Find row-level guard from any cell
      let rowGuard: string | undefined;
      for (const cell of cells) {
        const g = extractGuard(cell);
        if (g) { rowGuard = g; break; }
      }

      for (let ci = 1; ci < cells.length; ci++) {
        const colName = headerCells[ci];
        if (!colName) continue;
        const metric = extractCellMetric(cells[ci]);
        if (!metric) continue;
        // Cell guard > row guard > prose guard
        const scopeGuard = metric.guard ?? rowGuard ?? proseGuard;
        facts.push({ label: `${rowName} — ${colName}`, value: metric.value, scopeGuard, source });
      }
    }
  }

  // Process quantitative bold-label bullets: - **Label:** value ... (guard)
  const boldRe = /^[-*]\s+\*\*([^*]+)\*\*[:\s]+(.+)$/;
  for (const line of lines) {
    const m = boldRe.exec(line.trim());
    if (!m) continue;
    const label = m[1].replace(/:$/, "").trim();
    const rest = m[2];
    const guard = extractGuard(rest);
    const withoutGuard = rest.replace(/\([^)]*=[^)]*\)/g, "").trim();
    const numMatch = withoutGuard.match(/(\d+(?:\.\d+)?%?)/);
    if (!numMatch) continue;
    facts.push({ label, value: numMatch[1], scopeGuard: guard, source });
  }

  return facts;
}

export function extractFactsFromJson(
  obj: Record<string, unknown>,
  source: string,
  extractors: JsonExtractor[]
): Fact[] {
  const facts: Fact[] = [];
  for (const ext of extractors) {
    let current: unknown = obj;
    for (const part of ext.path.split(".")) {
      if (current === null || typeof current !== "object") { current = undefined; break; }
      current = (current as Record<string, unknown>)[part];
    }
    if (typeof current !== "number") continue;
    facts.push({ label: ext.label, value: String(current), scopeGuard: ext.scopeGuard, source });
  }
  return facts;
}

export function buildContentSpec(input: {
  product: { name: string; summary: string; repoUrl?: string };
  markdownPaths: string[];
  jsonInputs: Array<{ path: string; extractors: JsonExtractor[] }>;
  ctas: string[];
}): ContentSpec {
  const facts: Fact[] = [];
  const sourceFiles: string[] = [];

  for (const mdPath of input.markdownPaths) {
    sourceFiles.push(mdPath);
    const md = fs.readFileSync(mdPath, "utf-8");
    facts.push(...extractFactsFromMarkdown(md, mdPath));
  }

  for (const { path: jsonPath, extractors } of input.jsonInputs) {
    sourceFiles.push(jsonPath);
    const content = fs.readFileSync(jsonPath, "utf-8");
    const obj = JSON.parse(content) as Record<string, unknown>;
    facts.push(...extractFactsFromJson(obj, jsonPath, extractors));
  }

  return { product: input.product, facts, highlights: [], ctas: input.ctas, sourceFiles };
}
