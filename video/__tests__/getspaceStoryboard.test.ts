/**
 * Row A41-storyboards - tests of the GetSpace storyboard checker.
 *
 * (1) the real tree passes; (2) a small made-up fixture passes; (3) one test per planted break on its own
 * copy of the fixture; (4) three cases that must pass; (5) the slug helper. Every planted file is made in a
 * folder from os.tmpdir() and removed afterwards; planted strings that would look like a service name, a
 * URL or a path are built from parts at run time.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { CHECKLIST_KINDS } from "../clipIntake";
import { checkGetspaceStoryboards, isStoryboardSlug } from "../getspaceStoryboard";

const SEEK = "getspace-seek.md";
const SHOT = "getspace-shot-list.md";
const SNAP = "getspace-facts.json";

type Files = Record<string, string | null>;

const FIXED: Record<string, string> = {
  "recorder-overlay": "crop the status bar.",
  "own-name": "blur.",
  "number-plate-vehicle": "blur.",
  "test-build-mark": "blur.",
  "transaction-id": "blur.",
};

const SEP = "|---|------|-----|-------|------|----------------|-----------|";

const OPENINGS = [
  "Gold apples", "Blue boats", "Red cats", "Green doors", "Calm eggs", "Dark fish",
  "Warm grapes", "Soft hills", "Quick ink", "Sharp jars", "Tall kites", "Wide lakes",
];

function sentence(i: number): string {
  return `${OPENINGS[i]} are shown here as plain test words for this line today.`;
}

function narration(beat: number, id: string): string {
  return [0, 1, 2].map((k) => `${sentence(beat * 3 + k)} [${id}]`).join(" ");
}

function snapshot(): string {
  const f = (id: string, on: string, numbers: string[], open = false): object => ({
    id,
    section: id[0] === "S" ? "seek" : id[0] === "G" ? "give" : id[0] === "H" ? "helps" : "open",
    on_screen: on,
    open,
    numbers,
  });
  return JSON.stringify({
    schema: "getspace-facts/1",
    page_sha256: "0".repeat(64),
    facts: [
      f("S-01", "yes", []),
      f("S-02", "care", []),
      f("S-03", "care", ["7"]),
      f("S-10", "care", []),
      f("S-16", "never", []),
      f("G-01", "yes", []),
      f("H-05", "yes", ["7"]),
      f("O-01", "yes", [], true),
    ],
  });
}

function shotList(): string {
  const keys = CHECKLIST_KINDS.map((k) => `- ${k}: ${FIXED[k] ?? "blur."}`).join("\n");
  return `# Shot list - GetSpace how-to videos

## Before every take
${keys}

## Clips

| Clip | Side | Take | What to do | Sec | Facts shown | Hide |
|------|------|------|------------|-----|-------------|------|
| C-01 | seeker | T-1 | Hold on the home screen. | 20 | S-01 | blur: name, amount |
| C-02 | seeker | T-1 | Hold on the map screen. | 20 | S-02 | blur: position |
| C-03 | giver | T-1 | Hold on the matched screen. | 20 | S-10 | blur: position, id |
| C-04 | seeker | T-2 | Hold on the next screen. | 20 | S-03 | blur |
`;
}

function storyboard(): string {
  const rows = [
    ["Home", "C-01", "Home [S-01]", narration(0, "S-01")],
    ["Pin", "C-02", "Pin [S-02]", narration(1, "S-02")],
    ["Wait", "C-03", "Wait [S-10]", narration(2, "S-10")],
    ["Last", "C-04", "7 credits [S-03]", narration(3, "S-03")],
  ].map((r, i) => `| ${i + 1} | ${r[0]} | 16 | clip | ${r[1]} | ${r[2]} | ${r[3]} |`);
  return `---
slug: getspace-seek
title: "How to look"
aspect: 9:16
target_runtime_sec: 64
---

# Storyboard - "How to look"

## The beats

| # | Beat | Dur | Asset | Clip | On-screen text | Narration |
${SEP}
${rows.join("\n")}
`;
}

function fixture(): Files {
  return { [SEEK]: storyboard(), [SHOT]: shotList(), [SNAP]: snapshot() };
}

function rep(s: string | null, a: string, b: string, all = false): string {
  if (s === null || !s.includes(a)) throw new Error(`plant target missing: ${a}`);
  return all ? s.split(a).join(b) : s.replace(a, b);
}

function run(files: Files): string[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "getspace-sb-"));
  try {
    for (const [name, text] of Object.entries(files)) {
      if (text !== null) fs.writeFileSync(path.join(dir, name), text);
    }
    return checkGetspaceStoryboards({ storyboardRoot: dir });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("getspace storyboards - the real tree and the fixture", () => {
  test("the real tree passes", () => {
    const root = path.join(__dirname, "..", "..", "storyboards");
    expect(checkGetspaceStoryboards({ storyboardRoot: root })).toEqual([]);
  });

  test("the small fixture passes", () => {
    expect(run(fixture())).toEqual([]);
  });
});

type Plant = [string, (f: Files) => void, string];

const svc = ["g", "s-ab"].join("");
const url = ["h", "ttps"].join("") + "://x.example";

const PLANTS: Plant[] = [
  ["a group with no ids", (f) => { f[SEEK] = rep(f[SEEK], "Home [S-01]", "Home"); }, "no fact id group"],
  ["unknown id", (f) => { f[SEEK] = rep(f[SEEK], "Pin [S-02]", "Pin [S-77]"); }, "unknown fact id"],
  ["never row in narration", (f) => { f[SEEK] = rep(f[SEEK], "today. [S-01] Blue", "today. [S-16] Blue"); }, "cites never row"],
  ["never row in Facts shown", (f) => { f[SHOT] = rep(f[SHOT], "| S-02 |", "| S-16 |"); }, "cites never row"],
  ["care row with Hide without blur", (f) => { f[SHOT] = rep(f[SHOT], "| S-03 | blur |", "| S-03 | - |"); }, "does not name the blur"],
  ["fixed-list yes row with Hide -", (f) => { f[SHOT] = rep(f[SHOT], "| S-01 | blur: name, amount |", "| S-01 | - |"); }, "does not name the blur"],
  ["S-01 Hide without amount", (f) => { f[SHOT] = rep(f[SHOT], "blur: name, amount", "blur: name"); }, "does not name the amount"],
  ["match clip without id", (f) => { f[SHOT] = rep(f[SHOT], "blur: position, id", "blur: position"); }, "does not name the id"],
  ["map clip without position", (f) => { f[SHOT] = rep(f[SHOT], "| S-02 | blur: position |", "| S-02 | blur |"); }, "does not name the position"],
  ["home clip without name", (f) => { f[SHOT] = rep(f[SHOT], "| S-01 | blur: name, amount |", "| G-01 | blur: amount |"); }, "does not name the name"],
  ["H-05 with a number on screen", (f) => { f[SEEK] = rep(f[SEEK], "Pin [S-02]", "7 days [H-05]"); }, "with a borrowing, penalty or cancel fact"],
  ["open point cited", (f) => { f[SEEK] = rep(f[SEEK], "Pin [S-02]", "Pin [O-01]"); }, "cites open point"],
  ["money on screen 0.99", (f) => { f[SEEK] = rep(f[SEEK], "Pin [S-02]", "Pin 0.99 [S-02]"); }, "money amount or currency word"],
  ["MYR", (f) => { f[SEEK] = rep(f[SEEK], "Pin [S-02]", "Pin MYR [S-02]"); }, "money amount or currency word"],
  ["sen", (f) => { f[SEEK] = rep(f[SEEK], "Pin [S-02]", "Pin sen [S-02]"); }, "money amount or currency word"],
  ["a digit in narration", (f) => { f[SEEK] = rep(f[SEEK], "Gold apples are", "Gold 5 apples are"); }, "in narration"],
  ["on-screen number not of the cited fact", (f) => { f[SEEK] = rep(f[SEEK], "7 credits [S-03]", "9 credits [S-03]"); }, "is not a number of the cited facts"],
  ["on-screen number of another fact", (f) => { f[SEEK] = rep(f[SEEK], "Pin [S-02]", "7 [S-02]"); }, "is not a number of the cited facts"],
  ["Five", (f) => { f[SEEK] = rep(f[SEEK], "Pin [S-02]", "Five [S-02]"); }, "number word"],
  ["twenty-five", (f) => { f[SEEK] = rep(f[SEEK], "Pin [S-02]", "twenty-five [S-02]"); }, "number word"],
  ["a non-ASCII digit", (f) => { f[SEEK] = rep(f[SEEK], "Gold apples are", "Gold ٣ apples are"); }, "non-ASCII character"],
  ["[S-3]", (f) => { f[SEEK] = rep(f[SEEK], "Pin [S-02]", "Pin [S-3]"); }, "bad fact id group"],
  ["[s-03]", (f) => { f[SEEK] = rep(f[SEEK], "Pin [S-02]", "Pin [s-03]"); }, "bad fact id group"],
  ["[]", (f) => { f[SEEK] = rep(f[SEEK], "Pin [S-02]", "Pin []"); }, "bad fact id group"],
  ["[ S-03 ]", (f) => { f[SEEK] = rep(f[SEEK], "Pin [S-02]", "Pin [ S-03 ]"); }, "bad fact id group"],
  ["[S-03,S-04]", (f) => { f[SEEK] = rep(f[SEEK], "Pin [S-02]", "Pin [S-03,S-04]"); }, "bad fact id group"],
  ["Asset synth", (f) => { f[SEEK] = rep(f[SEEK], "| clip | C-01 |", "| synth | C-01 |"); }, "Asset synth"],
  ["Asset still", (f) => { f[SEEK] = rep(f[SEEK], "| clip | C-01 |", "| still | C-01 |"); }, "Asset still"],
  ["clip not in the shot list", (f) => { f[SEEK] = rep(f[SEEK], "| clip | C-02 |", "| clip | C-09 |"); }, "is not in the shot list"],
  ["beats longer than the clip", (f) => { f[SHOT] = rep(f[SHOT], "| 20 | S-01 |", "| 5 | S-01 |"); }, "beats on C-01 need 16 s, the clip is 5 s"],
  ["target_runtime_sec 95", (f) => { f[SEEK] = rep(f[SEEK], "target_runtime_sec: 64", "target_runtime_sec: 95"); }, "target_runtime_sec 95"],
  ["Dur total 102", (f) => {
    let s = f[SEEK] as string;
    for (const d of [26, 26, 25, 25]) s = rep(s, "| 16 | clip |", `| ${d} | clip |`);
    f[SEEK] = s;
  }, "Dur total 102"],
  ["aspect 16:9", (f) => { f[SEEK] = rep(f[SEEK], "aspect: 9:16", "aspect: 16:9"); }, "aspect is not 9:16"],
  ["too many words for the Dur total", (f) => { f[SEEK] = rep(f[SEEK], "Gold apples are", `Gold apples ${"extra ".repeat(20)}are`); }, "narration has"],
  ["banned word", (f) => { f[SEEK] = rep(f[SEEK], "Pin [S-02]", "Always pin [S-02]"); }, "banned word"],
  ["service name", (f) => { f[SEEK] = rep(f[SEEK], "Pin [S-02]", `Pin ${svc} [S-02]`); }, "service name"],
  ["URL", (f) => { f[SEEK] = rep(f[SEEK], "Pin [S-02]", `Pin ${url} [S-02]`); }, "URL"],
  ["a sentence opening used 3 times", (f) => {
    f[SEEK] = rep(rep(f[SEEK], "Blue boats", "Gold apples"), "Red cats", "Gold apples");
  }, "sentence opening"],
  ["no take with both sides", (f) => { f[SHOT] = rep(f[SHOT], "| giver | T-1 |", "| seeker | T-1 |"); }, "no take holds clips of both sides"],
  ["a before-every-take line missing", (f) => { f[SHOT] = rep(f[SHOT], "- email: blur.\n", ""); }, "before-every-take line missing: email"],
  ["an answered line changed", (f) => { f[SHOT] = rep(f[SHOT], "- own-name: blur.", "- own-name: hide it."); }, "answered line own-name changed"],
  ["the word OPEN left in", (f) => { f[SHOT] = rep(f[SHOT], "- email: blur.", "- email: OPEN"); }, "the word OPEN"],
  ["the status-bar line changed", (f) => { f[SHOT] = rep(f[SHOT], "crop the status bar.", "crop it."); }, "answered line recorder-overlay changed"],
  ["the same sentence in two storyboards", (f) => { f["getspace-give.md"] = rep(f[SEEK], "slug: getspace-seek", "slug: getspace-give"); }, "same sentence in"],
  ["a stray getspace-extra.md", (f) => { f["getspace-extra.md"] = "x\n"; }, "not a known GetSpace storyboard file name"],
  ["the seek file renamed to another letter case", (f) => { f["GetSpace-seek.md"] = f[SEEK]; f[SEEK] = null; }, "not a known GetSpace storyboard file name"],
  ["the shot list missing", (f) => { f[SHOT] = null; }, "getspace-shot-list.md: missing"],
  ["the table header changed", (f) => { f[SEEK] = rep(f[SEEK], "| # | Beat | Dur |", "| # | Beat | Length |"); }, "table header"],
  ["the separator row changed", (f) => { f[SEEK] = rep(f[SEEK], SEP, "|---|------|-----|-------|------|----------------|"); }, "separator row"],
  ["a row with a missing cell", (f) => { f[SEEK] = rep(f[SEEK], "| 1 | Home | 16 |", "| 1 | 16 |"); }, "cells, the header has"],
  ["an escaped bar", (f) => { f[SEEK] = rep(f[SEEK], "| 1 | Home |", "| 1 | Ho\\|me |"); }, "escaped bar"],
  ["a free prose line in a storyboard", (f) => { f[SEEK] += "\nSome free text.\n"; }, "text outside the fixed lines and the table"],
  ["a digit in the title", (f) => { f[SEEK] = rep(f[SEEK], "How to look", "How to look 2", true); }, "digit in the title"],
  ["a free line in the shot list", (f) => { f[SHOT] += "\nFree line.\n"; }, "text outside the fixed lines and the table"],
  ["a byte order mark", (f) => { f[SEEK] = `﻿${f[SEEK]}`; }, "byte order mark"],
  ["a lone CR", (f) => { f[SEEK] = rep(f[SEEK], "Home [S-01]", "Ho\rme [S-01]"); }, "lone CR"],
];

describe("getspace storyboards - planted breaks", () => {
  test.each(PLANTS)("%s", (_name, edit, expected) => {
    const f = fixture();
    edit(f);
    const out = run(f);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((l) => l.startsWith("FAIL"))).toBe(true);
    expect(out.some((l) => l.includes(expected))).toBe(true);
  });
});

function snapEdit(fn: (d: { facts: Record<string, unknown>[] }) => void): (f: Files) => void {
  return (f) => {
    const d = JSON.parse(f[SNAP] as string);
    fn(d);
    f[SNAP] = JSON.stringify(d);
  };
}

const SNAP_PLANTS: [string, (f: Files) => void][] = [
  ["snapshot missing", (f) => { f[SNAP] = null; }],
  ["snapshot not JSON", (f) => { f[SNAP] = "{ not json"; }],
  ["snapshot another schema", snapEdit((d) => { (d as unknown as { schema: string }).schema = "getspace-facts/2"; })],
  ["snapshot unknown key", snapEdit((d) => { d.facts[0].extra = 1; })],
  ["snapshot bad id", snapEdit((d) => { d.facts[0].id = "X-1"; })],
  ["snapshot id twice", snapEdit((d) => { d.facts[1].id = "S-01"; })],
  ["snapshot unknown on_screen", snapEdit((d) => { d.facts[0].on_screen = "maybe"; })],
  ["snapshot non-boolean open", snapEdit((d) => { d.facts[0].open = "no"; })],
  ["snapshot non-digit number", snapEdit((d) => { d.facts[0].numbers = ["1a"]; })],
];

describe("getspace storyboards - untrusted snapshot", () => {
  test.each(SNAP_PLANTS)("%s throws REFUSED", (_name, edit) => {
    const f = fixture();
    edit(f);
    expect(() => run(f)).toThrow(/^getspace-storyboards: REFUSED/);
  });
});

describe("getspace storyboards - cases that pass", () => {
  test("a CRLF copy of the fixture", () => {
    const f = fixture();
    f[SEEK] = (f[SEEK] as string).replace(/\n/g, "\r\n");
    f[SHOT] = (f[SHOT] as string).replace(/\n/g, "\r\n");
    expect(run(f)).toEqual([]);
  });

  test("a sentence with often, confirm and center", () => {
    const f = fixture();
    f[SEEK] = rep(f[SEEK], "Gold apples are shown", "Gold apples often confirm center shown");
    f[SEEK] = rep(f[SEEK], "Pin [S-02]", "Often confirm the center [S-02]");
    expect(run(f)).toEqual([]);
  });

  test("a borrowing sentence with no number", () => {
    const f = fixture();
    f[SEEK] = rep(f[SEEK], "today. [S-01] Blue", "today. [H-05] Blue");
    expect(run(f)).toEqual([]);
  });
});

describe("isStoryboardSlug", () => {
  test("known post, GetSpace slug, unknown slug", () => {
    expect(isStoryboardSlug("getspace-seek")).toBe(true);
    expect(isStoryboardSlug("agent-kanban-demo")).toBe(true);
    expect(isStoryboardSlug("getspace-other")).toBe(false);
  });
});
