/**
 * #871 / PR#119 CRLF-class GUARD — every EOL-sensitive TEXT asset tracked under `assets/`
 * MUST be pinned `-text` (or `binary`) in `.gitattributes`, or Windows CI's autocrlf will
 * convert LF→CRLF on checkout, inflate its byte count, and break any byte-length / sha256
 * provenance assertion (e.g. forgeSpec.test.ts) or freeze-manifest hash that targets it.
 *
 * The original bug: assets/forge-demo/dashboard-*.html had their exact bytes + sha256 asserted,
 * but no `.gitattributes` pin; mac/linux (LF-native) never saw it, Windows CI failed all three.
 * The fix (PR#119) added `assets/forge-demo/*.html -text`. This guard PREVENTS the next un-pinned
 * hash-asserted / freeze text asset from slipping through to Windows CI.
 *
 * Pure: only `git ls-files` + `git check-attr` (authoritative — resolves globs/precedence).
 * NO Playwright / ffmpeg / network / paid call.
 */

import { execFileSync } from "child_process";

const REPO_ROOT = process.cwd();

// EOL-sensitive text extensions: git autocrlf would mangle these on a Windows checkout.
const TEXT_EXTENSIONS = new Set([
  ".html",
  ".json",
  ".svg",
  ".txt",
  ".csv",
  ".md",
  ".xml",
  ".yml",
  ".yaml",
]);

function git(args: string[]): string {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

/**
 * `git check-attr text -- <path>` prints `<path>: text: <value>`.
 *  - `unset`        → the file is `-text` (or `binary`, which expands to `-text -diff`): EOL conversion OFF → PINNED.
 *  - `set`          → the file is `text`: git WILL normalize/convert EOL → NOT safe for byte-hash assertions.
 *  - `unspecified`  → no rule covers it: autocrlf default applies on Windows → NOT pinned.
 * Only `unset` disables EOL conversion, so only `unset` counts as pinned.
 */
function isEolPinned(checkAttrValue: string): boolean {
  return checkAttrValue.trim() === "unset";
}

function checkAttrText(relPath: string): string {
  // Format: "<path>: text: <value>"
  const out = git(["check-attr", "text", "--", relPath]).trim();
  const marker = ": text: ";
  const idx = out.lastIndexOf(marker);
  return idx === -1 ? out : out.slice(idx + marker.length);
}

function trackedTextAssets(): string[] {
  return git(["ls-files", "assets/"])
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((p) => {
      const dot = p.lastIndexOf(".");
      const ext = dot === -1 ? "" : p.slice(dot).toLowerCase();
      return TEXT_EXTENSIONS.has(ext);
    });
}

describe("#871/PR#119 .gitattributes EOL pin guard for assets/", () => {
  test("the EOL-pin classifier only accepts `unset` (-text / binary)", () => {
    // Proves the guard BITES: a pinned asset's `unset` passes; an unpinned/normalized asset fails.
    expect(isEolPinned("unset")).toBe(true);
    expect(isEolPinned(" unset ")).toBe(true);
    expect(isEolPinned("unspecified")).toBe(false); // no rule → autocrlf bites on Windows
    expect(isEolPinned("set")).toBe(false); // `text` → git normalizes EOL → hash breaks
  });

  test("every EOL-sensitive text asset tracked under assets/ is `-text`/`binary` pinned", () => {
    const assets = trackedTextAssets();
    const offenders = assets.filter((p) => !isEolPinned(checkAttrText(p)));

    expect(offenders).toEqual([]);
    if (offenders.length > 0) {
      throw new Error(
        `Un-pinned EOL-sensitive text asset(s) under assets/:\n  ${offenders.join("\n  ")}\n\n` +
          "byte/sha256-asserted or freeze-manifest assets must be EOL-pinned or Windows CI " +
          "autocrlf will break their hash — add `<glob> -text` to .gitattributes.",
      );
    }
  });
});
