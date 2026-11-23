/**
 * Row A41-storyboards - tests of the GetSpace storyboard checker.
 *
 * (1) the real tree passes; (2) a small made-up fixture passes; (3) one test per planted break on its own
 * copy of the fixture; (4) three cases that must pass; (5) the slug helper. Each planted file is made in a
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
| C-03 | giver | T-1 | Hold on the matched screen. | 20 | S-10 | blur: position, id, spot photos, other user details |
| C-04 | seeker | T-2 | Hold on the next screen. | 20 | S-03 | blur: position |
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
  ["care row with Hide without blur", (f) => { f[SHOT] = rep(f[SHOT], "| S-03 | blur: position |", "| S-03 | - |"); }, "does not name the blur"],
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
  ["a blank line between the header and the separator", (f) => { f[SEEK] = rep(f[SEEK], `Narration |\n${SEP}`, `Narration |\n\n${SEP}`); }, "separator row is not the fixed form"],
  ["a square bracket in a storyboard Beat cell", (f) => { f[SEEK] = rep(f[SEEK], "| 1 | Home |", "| 1 | Ho[me] |"); }, "bad fact id group"],
  ["a square bracket in a shot list Hide cell", (f) => { f[SHOT] = rep(f[SHOT], "| S-02 | blur: position |", "| S-02 | blur: [position] |"); }, "bad fact id group"],
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

// ids of the widened Hide-word lists: the required words of each id, and the pairs the lists add
const R = (a: string, from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_v, i) => `${a}-${String(from + i).padStart(2, "0")}`);

const REQUIRED: Record<string, string[]> = {
  position: [...R("S", 2, 14), ...R("G", 2, 12), "G-14", "G-15", "H-10", "H-11", "H-14", "H-15"],
  "spot photos": [...R("S", 8, 14), ...R("G", 2, 12), "G-14", "G-15", "H-10", "H-11", "H-15"],
  "other user details": [
    ...R("S", 8, 15), "G-10", "G-11", "G-12", "G-14", "G-15", "H-01", "H-13", "H-09", "H-07", "H-10", "H-15",
  ],
  id: [...R("S", 10, 14), ...R("G", 6, 12), "G-14", "G-15", "H-09", "H-10", "H-11"],
  name: ["S-01", "G-01", "H-03", "H-06"],
  amount: ["S-01", "G-01", "H-03", "H-06", "H-02", "H-07", "H-08", "H-04", "H-05", "H-16", "S-14"],
};

const NEW_PAIRS: [string, string][] = [
  ...[...R("S", 3, 6), "S-08", "S-09", ...R("G", 2, 12), "G-14", "G-15", "H-11", "H-14", "H-15"].map((id): [string, string] => ["position", id]),
  ...REQUIRED["spot photos"].map((id): [string, string] => ["spot photos", id]),
  ...REQUIRED["other user details"].map((id): [string, string] => ["other user details", id]),
  ["id", "H-09"],
];

describe("getspace storyboards - widened Hide words and clip use", () => {
  test("a clip showing a spot photos id without the spot photos word", () => {
    const f = fixture();
    f[SHOT] = rep(f[SHOT], ", spot photos", "");
    expect(run(f).some((l) => l.includes("FAIL shot list C-03") && l.includes("does not name the spot photos"))).toBe(true);
  });

  test("a clip showing an other-user id without the other user details word", () => {
    const f = fixture();
    f[SHOT] = rep(f[SHOT], ", other user details", "");
    expect(run(f).some((l) => l.includes("FAIL shot list C-03") && l.includes("does not name the other user details"))).toBe(true);
  });

  test("with three storyboards present, a clip no beat uses", () => {
    const f = fixture();
    f[SHOT] = rep(f[SHOT], "| C-04 | seeker", "| C-05 | seeker | T-2 | Hold on the spare screen. | 20 | S-01 | blur: name, amount |\n| C-04 | seeker");
    expect(run(f).some((l) => l.includes("used by no storyboard"))).toBe(false);
    f["getspace-give.md"] = rep(f[SEEK], "slug: getspace-seek", "slug: getspace-give");
    f["getspace-helps.md"] = rep(f[SEEK], "slug: getspace-seek", "slug: getspace-helps");
    expect(run(f)).toContain("FAIL getspace-shot-list.md C-05: used by no storyboard");
  });

  test("an on-screen id that is not in the clip's Facts shown", () => {
    const f = fixture();
    f[SEEK] = rep(f[SEEK], "Pin [S-02]", "Pin [S-03]");
    expect(run(f)).toContain("FAIL getspace-seek.md beat 2 On-screen text: on-screen id S-03 is not in Facts shown of C-02");
  });

  test("each word-and-id pair the lists add is asked for", () => {
    const snap = fs.readFileSync(path.join(__dirname, "..", "..", "storyboards", SNAP), "utf8");
    expect(NEW_PAIRS.length).toBeGreaterThan(60);
    for (const [word, id] of NEW_PAIRS) {
      const others = Object.keys(REQUIRED).filter((w) => w !== word && REQUIRED[w].includes(id));
      const f = fixture();
      f[SNAP] = snap;
      f[SHOT] = rep(f[SHOT], /\| C-01 .*\n/.exec(f[SHOT] as string)?.[0] ?? "", "");
      f[SHOT] = (f[SHOT] as string).replace(/\| C-0[2-4] .*\n/g, "") + `| C-01 | seeker | T-1 | Hold on the screen. | 20 | ${id} | blur${others.length ? ": " + others.join(", ") : ""} |\n`;
      const named = run(f).filter((l) => l.includes("does not name the"));
      expect(named).toHaveLength(1);
      expect(named[0]).toContain(`does not name the ${word}`);
      expect(named[0].endsWith(`does not name the ${word}`)).toBe(true);
    }
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

// ---- the 4th storyboard (level3) and its list file ----

const L3 = "getspace-level3.md";
const LIST = "getspace-ai-shots.md";
const L3_OPEN = [
  "Pale roads", "Odd bells", "Neat coats", "Rich dust", "Keen elms", "Fond farms",
  "Hot gates", "Idle hats", "Just jams", "Kind keys", "Lazy lamps", "Mild maps",
];

function l3s(i: number): string {
  return `${L3_OPEN[i]} are shown here as plain test words for this line today.`;
}

function n3(j: number, id: string): string {
  return [0, 1, 2].map((k) => `${l3s(j * 3 + k)} [${id}]`).join(" ");
}

function level3(): string {
  const rows = [
    "| 1 | Start | 10 | ai | AI-1 | - | - |",
    `| 2 | Home | 12 | clip | C-01 | Home [S-01] | ${n3(0, "S-01")} |`,
    "| 3 | Next | 8 | ai | AI-2 | - | - |",
    `| 4 | Pin | 12 | clip | C-02 | Pin [S-02] | ${n3(1, "S-02")} |`,
    `| 5 | Screen | 12 | screen | SCR-1 | Pin [S-02] | ${n3(2, "S-02")} |`,
    `| 6 | Wait | 12 | clip | C-03 | Wait [S-10] | ${n3(3, "S-10")} |`,
  ];
  return `---
slug: getspace-level3
title: "Level test"
aspect: 9:16
target_runtime_sec: 66
---

# Storyboard - "Level test"

## The beats

| # | Beat | Dur | Asset | Clip | On-screen text | Narration |
${SEP}
${rows.join("\n")}
`;
}

function aiList(): string {
  return `# AI shots - getspace-level3

## AI clips

| Id | Sec | Shows | First frame | Prompt |
|----|-----|-------|-------------|--------|
| AI-1 | 10 | A full level from above. | none | Plain test words for the first shot. |
| AI-2 | 8 | The same level, later. | last frame of AI-1 | Plain test words for the second shot. |

## Screens

| Id | Shows | Facts shown |
|----|-------|-------------|
| SCR-1 | A made-up match screen. | S-02, S-03 |
`;
}

function fixture3(): Files {
  return { ...fixture(), [L3]: level3(), [LIST]: aiList() };
}

// a seek, give or helps fixture whose beat 1 is an ai beat tied to the list of that storyboard
function aiListOf(slug: string): string {
  return `# AI shots - getspace-${slug}

## AI clips

| Id | Sec | Shows | First frame | Prompt |
|----|-----|-------|-------------|--------|
| AI-1 | 15 | A full level from above. | none | Plain test words for the first shot. |

## Screens

| Id | Shows | Facts shown |
|----|-------|-------------|
`;
}

function fixtureAi(slug: string): Files {
  const board = rep(
    rep(storyboard(), "| 1 | Home | 16 | clip | C-01 | Home [S-01] |", "| 1 | Home | 15 | ai | AI-1 | - |"),
    "slug: getspace-seek",
    `slug: getspace-${slug}`,
  );
  const f = fixture();
  if (slug !== "seek") f[SEEK] = null;
  // clips not used by the ai storyboard stay used by the other file
  f[`getspace-${slug}.md`] = board;
  f[`getspace-${slug}-ai-shots.md`] = aiListOf(slug);
  return f;
}

const SL = "getspace-seek-ai-shots.md";
const S = (text: string): string => `FAIL ${SL}${text}`;

describe("getspace ai beats in seek, give and helps", () => {
  test("a seek ai beat with no seek list", () => {
    const f = fixtureAi("seek");
    f[SL] = null;
    expect(run(f)).toContain("FAIL getspace-seek-ai-shots.md: missing");
  });

  test("an ai id present only in the give list or the level3 list", () => {
    const want ="FAIL getspace-seek.md beat 1: clip AI-2 is not an AI clip of getspace-seek-ai-shots.md";
    // AI-2 is in the give list only (the seek list holds AI-1 only)
    const f = fixtureAi("seek");
    f[SEEK] = rep(f[SEEK], "| ai | AI-1 |", "| ai | AI-2 |");
    f["getspace-give.md"] = rep(storyboard(), "slug: getspace-seek", "slug: getspace-give");
    f["getspace-give-ai-shots.md"] = rep(
      aiListOf("give"),
      "\n\n## Screens",
      "\n| AI-2 | 8 | Next view. | none | More plain words. |\n\n## Screens",
    );
    expect(run(f)).toContain(want);
    // AI-2 is in the level3 list only
    const g = fixtureAi("seek");
    g[SEEK] = rep(g[SEEK], "| ai | AI-1 |", "| ai | AI-2 |");
    g[L3] = level3();
    g[LIST] = aiList();
    expect(run(g)).toContain(want);
  });

  test("a seek list with no getspace-seek.md", () => {
    const f = fixture();
    f[SL] = aiListOf("seek");
    f[SEEK] = null;
    f["getspace-give.md"] = rep(storyboard(), "slug: getspace-seek", "slug: getspace-give");
    expect(run(f)).toContain("FAIL getspace-seek-ai-shots.md: present with no getspace-seek.md");
  });

  test("an AI id of the seek list used by no seek beat", () => {
    const f = fixtureAi("seek");
    f[SL] = rep(f[SL], "\n\n## Screens", "\n| AI-2 | 8 | Next view. | none | More plain words. |\n\n## Screens");
    expect(run(f)).toContain("FAIL getspace-seek-ai-shots.md AI-2: used by no beat");
  });

  test("a list whose line 1 names another slug", () => {
    const f = fixtureAi("seek");
    f[SL] = rep(f[SL], "# AI shots - getspace-seek", "# AI shots - getspace-give");
    expect(run(f)).toContain(S(" line 1: text outside the fixed lines and the tables"));
  });

  test.each(["getspace-seek-ai-shot.md", "getspace-seek-ai-shots.MD", "getspace-level3-ai-shots.md"])(
    "a stray name %s is not a known file name",
    (name) => {
      const f = fixture();
      f[name] = "x\n";
      expect(run(f)).toContain(`FAIL ${name}: not a known GetSpace storyboard file name`);
    },
  );

  test("two ai beats on one id above its Sec", () => {
    const f = fixtureAi("seek");
    // two beats of 9 s on AI-1 (Sec 15), each alone within it
    f[SEEK] = rep(f[SEEK], "| 1 | Home | 15 |", "| 1 | Home | 9 |");
    f[SEEK] = rep(f[SEEK], "| 2 | Pin | 16 | clip | C-02 | Pin [S-02] |", "| 2 | Pin | 9 | ai | AI-1 | - |");
    expect(run(f)).toContain("FAIL getspace-seek.md: beats on AI-1 need 18 s, the clip is 15 s");
  });

  const closed: [string, (f: Files) => void, string][] = [
    ["a byte order mark", (f) => { f[SL] = `﻿${f[SL]}`; }, S(": starts with a byte order mark")],
    ["a lone CR", (f) => { f[SL] = rep(f[SL], "Plain test words for the first", "Plain test\rwords for the first"); }, S(": holds a lone CR")],
    ["a missing table", (f) => { f[SL] = (f[SL] as string).split("\n| Id | Shows | Facts shown |")[0]; }, S(": no table under ## Screens")],
  ];
  test.each(closed)("a seek list fails closed: %s", (_n, edit, line) => {
    const f = fixtureAi("seek");
    edit(f);
    expect(run(f)).toContain(line);
  });

  test("an SCR row in a seek list", () => {
    const f = fixtureAi("seek");
    f[SL] = `${f[SL]}| SCR-1 | A made-up match screen. | S-02 |\n`;
    expect(run(f)).toContain(S(" SCR-1: a screen row is not allowed in this list, only ai clips"));
  });

  test("a screen beat in give and helps still fails", () => {
    for (const slug of ["give", "helps"]) {
      const f = fixtureAi(slug);
      f[`getspace-${slug}.md`] = rep(f[`getspace-${slug}.md`], "| clip | C-02 |", "| screen | SCR-1 |");
      expect(run(f)).toContain(`FAIL getspace-${slug}.md beat 2: Asset screen is refused, only clip`);
    }
  });

  test("isStoryboardSlug is false for the three list slugs", () => {
    for (const s of ["getspace-seek-ai-shots", "getspace-give-ai-shots", "getspace-helps-ai-shots"]) {
      expect(isStoryboardSlug(s)).toBe(false);
    }
  });
});

function addAiRow(f: Files, row: string): void {
  f[LIST] = rep(f[LIST], "\n\n## Screens", `\n${row}\n\n## Screens`);
}

function addScreenRow(f: Files, row: string): void {
  f[LIST] = `${f[LIST]}${row}\n`;
}

const A = (id: string, text: string): string => `FAIL getspace-ai-shots.md ${id}: ${text}`;
const SEC_FAIL = "Sec is not a whole number from 3 to 15";
const FIRST_FAIL = "First frame is not none, last frame of an earlier AI clip, or start still and a name";

describe("getspace level3 - the fixture and asset kinds", () => {
  test("a valid fixture with level3 and the list file passes", () => {
    expect(run(fixture3())).toEqual([]);
  });

  test("Sec 3 and Sec 15 rows pass", () => {
    const f = fixture3();
    f[LIST] = rep(rep(f[LIST], "| AI-1 | 10 |", "| AI-1 | 15 |"), "| AI-2 | 8 |", "| AI-2 | 3 |");
    f[L3] = rep(rep(f[L3], "| 3 | Next | 8 |", "| 3 | Next | 3 |"), "| 6 | Wait | 12 |", "| 6 | Wait | 17 |");
    expect(run(f)).toEqual([]);
  });

  test.each(["still", "synth"])("level3 beat with asset %s keeps the BASE fail text", (asset) => {
    const f = fixture3();
    f[L3] = rep(f[L3], "| clip | C-01 |", `| ${asset} | C-01 |`);
    expect(run(f)).toContain(`FAIL getspace-level3.md beat 2: Asset ${asset} is refused, only clip`);
  });

  test("seek beat with asset screen names the asset", () => {
    const f = fixture3();
    f[SEEK] = rep(f[SEEK], "| clip | C-01 |", "| screen | C-01 |");
    expect(run(f)).toContain("FAIL getspace-seek.md beat 1: Asset screen is refused, only clip");
  });

  test.each(["seek", "give", "helps"])("a %s beat with asset ai and its own list passes", (slug) => {
    expect(run(fixtureAi(slug))).toEqual([]);
  });
});

describe("getspace level3 - ai beats", () => {
  test("an AI id not in the list", () => {
    const f = fixture3();
    f[L3] = rep(f[L3], "| ai | AI-2 |", "| ai | AI-9 |");
    expect(run(f)).toContain("FAIL getspace-level3.md beat 3: clip AI-9 is not an AI clip of getspace-ai-shots.md");
  });

  test.each(["SCR-1", "C-09"])("an ai beat with Clip %s", (id) => {
    const f = fixture3();
    f[L3] = rep(f[L3], "| ai | AI-2 |", `| ai | ${id} |`);
    expect(run(f)).toContain(`FAIL getspace-level3.md beat 3: clip ${id} is not an AI clip of getspace-ai-shots.md`);
  });

  test.each(["AI-1", "C-09"])("a screen beat with Clip %s", (id) => {
    const f = fixture3();
    f[L3] = rep(f[L3], "| screen | SCR-1 |", `| screen | ${id} |`);
    expect(run(f)).toContain(`FAIL getspace-level3.md beat 5: clip ${id} is not a screen of getspace-ai-shots.md`);
  });

  test("two ai beats on one id above its Sec, each alone within it", () => {
    const f = fixture3();
    f[L3] = rep(rep(f[L3], "| 1 | Start | 10 |", "| 1 | Start | 6 |"), "| 3 | Next | 8 | ai | AI-2 |", "| 3 | Next | 6 | ai | AI-1 |");
    expect(run(f)).toContain("FAIL getspace-level3.md: beats on AI-1 need 12 s, the clip is 10 s");
  });

  test("one ai beat with Dur above Sec", () => {
    const f = fixture3();
    f[L3] = rep(f[L3], "| 3 | Next | 8 |", "| 3 | Next | 9 |");
    expect(run(f)).toContain("FAIL getspace-level3.md: beats on AI-2 need 9 s, the clip is 8 s");
  });

  test("an ai beat with on-screen text", () => {
    const f = fixture3();
    f[L3] = rep(f[L3], "| ai | AI-1 | - | - |", "| ai | AI-1 | Home [S-01] | - |");
    expect(run(f)).toContain("FAIL getspace-level3.md beat 1 On-screen text: an ai beat holds no on-screen text, only -");
  });

  test("an ai beat narration with a digit", () => {
    const f = fixture3();
    f[L3] = rep(f[L3], "| ai | AI-1 | - | - |", "| ai | AI-1 | - | Some 5 words. [S-01] |");
    expect(run(f)).toContain("FAIL getspace-level3.md beat 1 Narration: number 5 in narration; numbers go on screen only");
  });

  test("an ai beat narration with an unknown fact id", () => {
    const f = fixture3();
    f[L3] = rep(f[L3], "| ai | AI-1 | - | - |", "| ai | AI-1 | - | Some words. [S-77] |");
    expect(run(f)).toContain("FAIL getspace-level3.md beat 1 Narration: unknown fact id S-77");
  });
});

describe("getspace level3 - screen beats", () => {
  test("an on-screen id not in Facts shown of the screen", () => {
    const f = fixture3();
    f[L3] = rep(f[L3], "| screen | SCR-1 | Pin [S-02] |", "| screen | SCR-1 | Pin [S-01] |");
    expect(run(f)).toContain("FAIL getspace-level3.md beat 5 On-screen text: on-screen id S-01 is not in Facts shown of SCR-1");
  });

  test("an on-screen digit that is not a number of the cited facts", () => {
    const f = fixture3();
    f[L3] = rep(f[L3], "| screen | SCR-1 | Pin [S-02] |", "| screen | SCR-1 | 9 credits [S-03] |");
    expect(run(f)).toContain("FAIL getspace-level3.md beat 5 On-screen text: number 9 is not a number of the cited facts S-03");
  });

  test("a screen on-screen digit of the cited fact passes", () => {
    const f = fixture3();
    f[L3] = rep(f[L3], "| screen | SCR-1 | Pin [S-02] |", "| screen | SCR-1 | 7 credits [S-03] |");
    expect(run(f)).toEqual([]);
  });

  test("a screen beat narration with a digit", () => {
    const f = fixture3();
    f[L3] = rep(f[L3], "Hot gates are", "Hot 5 gates are");
    expect(run(f)).toContain("FAIL getspace-level3.md beat 5 Narration: number 5 in narration; numbers go on screen only");
  });

  test("a Screens row citing an open point, an unknown id and a never row", () => {
    const f = fixture3();
    f[LIST] = rep(f[LIST], "S-02, S-03", "S-02, S-77");
    expect(run(f)).toContain(A("SCR-1", "unknown fact id S-77"));
    f[LIST] = rep(f[LIST], "S-02, S-77", "S-02, S-16");
    expect(run(f)).toContain(A("SCR-1", "cites never row S-16"));
    const g = fixture3();
    snapEdit((d) => {
      const x = d.facts.find((o) => o.id === "S-03");
      if (x) x.open = true;
    })(g);
    expect(run(g)).toContain(A("SCR-1", "cites open point S-03"));
  });
});

describe("getspace level3 - the list file", () => {
  test.each(["2", "16", "4.5"])("Sec %s", (sec) => {
    const f = fixture3();
    f[LIST] = rep(f[LIST], "| AI-1 | 10 |", `| AI-1 | ${sec} |`);
    expect(run(f)).toContain(A("AI-1", SEC_FAIL));
  });

  test.each([
    ["a digit", "Plain test words 5 for the first shot.", "Prompt: digit"],
    ["an at sign", `Plain ${["a", "b"].join("@")} words.`, "Prompt: at sign"],
    ["a slash", "Plain test/words for the first shot.", "Prompt: slash"],
    ["a backslash", "Plain test\\words for the first shot.", "Prompt: backslash"],
    ["a tilde", "Plain test ~ words for the first shot.", "Prompt: tilde"],
    ["a web address", `Plain test words ${url} for the first shot.`, "Prompt: URL or web or file ending"],
  ])("a Prompt cell holding %s", (_n, text, line) => {
    const f = fixture3();
    f[LIST] = rep(f[LIST], "Plain test words for the first shot.", text);
    expect(run(f)).toContain(`FAIL getspace-ai-shots.md AI-1 ${line}`);
  });

  test("a Shows cell holding a digit", () => {
    const f = fixture3();
    f[LIST] = rep(f[LIST], "A full level from above.", "A full level 5 from above.");
    expect(run(f)).toContain("FAIL getspace-ai-shots.md AI-1 Shows: digit");
  });

  const home = ["/Use", "rs/zz", "qx/notes.txt"].join("");

  test("a home path in the AI clips Shows and Prompt cells", () => {
    const f = fixture3();
    f[LIST] = rep(f[LIST], "A full level from above.", `A file at ${home} from above.`);
    f[LIST] = rep(f[LIST], "Plain test words for the first shot.", `Plain words held at ${home}.`);
    const out = run(f);
    expect(out).toContain(A("AI-1 Shows", "home path"));
    expect(out).toContain(A("AI-1 Prompt", "home path"));
  });

  test("a service name in the AI clips Shows and Prompt cells", () => {
    const f = fixture3();
    f[LIST] = rep(f[LIST], "A full level from above.", `The ${svc} level from above.`);
    f[LIST] = rep(f[LIST], "Plain test words for the first shot.", `Plain words for the ${svc} shot.`);
    const out = run(f);
    expect(out).toContain(A("AI-1 Shows", "service name"));
    expect(out).toContain(A("AI-1 Prompt", "service name"));
  });

  test.each([
    ["a digit", "A made-up 4 match screen.", "digit"],
    ["a slash", "A/B made-up match screen.", "slash"],
    ["a backslash", "A\\B made-up match screen.", "backslash"],
    ["a tilde", "A ~B made-up match screen.", "tilde"],
    ["an at sign", `A ${["a", "b"].join("@")} match screen.`, "at sign"],
    ["a web address", `A match screen at ${url}.`, "URL or web or file ending"],
    ["a service name", `A ${svc} match screen.`, "service name"],
    ["a home path", `A match screen at ${home}.`, "home path"],
  ])("the Screens Shows cell holding %s", (_n, text, line) => {
    const f = fixture3();
    f[LIST] = rep(f[LIST], "A made-up match screen.", text);
    expect(run(f)).toContain(A("SCR-1 Shows", line));
  });

  test("a Prompt with everyday, one and ninety passes", () => {
    const f = fixture3();
    f[LIST] = rep(f[LIST], "Plain test words for the first shot.", "Everyday cars, one at a time, ninety degrees.");
    expect(run(f)).toEqual([]);
  });

  test.each([
    ["a later clip", "last frame of AI-1", "last frame of AI-3"],
    ["its own id", "last frame of AI-1", "last frame of AI-2"],
    ["free text", "last frame of AI-1", "the old frame"],
    ["AI-0", "last frame of AI-1", "last frame of AI-0"],
  ])("First frame holding %s", (_n, from, to) => {
    const f = fixture3();
    f[LIST] = rep(f[LIST], from, to);
    expect(run(f)).toContain(A("AI-2", FIRST_FAIL));
  });

  test("an AI id gap and a repeat", () => {
    const f = fixture3();
    f[LIST] = rep(f[LIST], "| AI-2 |", "| AI-3 |");
    expect(run(f)).toContain("FAIL getspace-ai-shots.md line 8: Id AI-3 is not AI-2");
    const g = fixture3();
    addAiRow(g, "| AI-2 | 8 | Another view. | last frame of AI-1 | More plain words. |");
    expect(run(g)).toContain("FAIL getspace-ai-shots.md line 9: Id AI-2 is not AI-3");
  });

  test("an SCR id gap and a repeat", () => {
    const f = fixture3();
    addScreenRow(f, "| SCR-3 | Another screen. | S-02 |");
    expect(run(f)).toContain("FAIL getspace-ai-shots.md line 15: Id SCR-3 is not SCR-2");
    const g = fixture3();
    addScreenRow(g, "| SCR-1 | Another screen. | S-02 |");
    expect(run(g)).toContain("FAIL getspace-ai-shots.md line 15: Id SCR-1 is not SCR-2");
  });

  test("level3 present with the list file missing", () => {
    const f = fixture3();
    f[LIST] = null;
    expect(run(f)).toContain("FAIL getspace-ai-shots.md: missing");
  });

  test("the list file present with level3 absent", () => {
    const f = fixture3();
    f[L3] = null;
    expect(run(f)).toContain("FAIL getspace-ai-shots.md: present with no getspace-level3.md");
  });

  test("an AI id and an SCR id used by no beat", () => {
    const f = fixture3();
    addAiRow(f, "| AI-3 | 5 | Another view. | last frame of AI-2 | More plain words. |");
    addScreenRow(f, "| SCR-2 | Another screen. | S-02 |");
    const out = run(f);
    expect(out).toContain("FAIL getspace-ai-shots.md AI-3: used by no beat");
    expect(out).toContain("FAIL getspace-ai-shots.md SCR-2: used by no beat");
  });

  const failsClosed: [string, (f: Files) => void, string][] = [
    ["a byte order mark", (f) => { f[LIST] = `﻿${f[LIST]}`; }, "FAIL getspace-ai-shots.md: starts with a byte order mark"],
    ["a lone CR", (f) => { f[LIST] = rep(f[LIST], "Plain test words for the first", "Plain test\rwords for the first"); }, "FAIL getspace-ai-shots.md: holds a lone CR"],
    ["a row with a missing cell", (f) => { f[LIST] = rep(f[LIST], "| AI-1 | 10 | A full level from above. | none |", "| AI-1 | 10 | none |"); }, "FAIL getspace-ai-shots.md line 7: row has 4 cells, the header has 5"],
    ["a missing Screens table", (f) => { f[LIST] = `${(f[LIST] as string).split("\n| Id | Shows | Facts shown |")[0]}`; }, "FAIL getspace-ai-shots.md: no table under ## Screens"],
    ["the two tables swapped", (f) => {
      f[LIST] = `# AI shots - getspace-level3

## AI clips

| Id | Shows | Facts shown |
|----|-------|-------------|
| SCR-1 | A made-up match screen. | S-02, S-03 |

## Screens

| Id | Sec | Shows | First frame | Prompt |
|----|-----|-------|-------------|--------|
| AI-1 | 10 | A full level from above. | none | Plain test words. |
`;
    }, "FAIL getspace-ai-shots.md line 5: table header is not the fixed header"],
    ["a third table", (f) => { f[LIST] = `${f[LIST]}\n| Id | Shows | Facts shown |\n|----|-------|-------------|\n| SCR-2 | X | S-02 |\n`; }, "FAIL getspace-ai-shots.md line 16: bar line after the table ends"],
    ["a wrong first line", (f) => { f[LIST] = rep(f[LIST], "# AI shots - getspace-level3", "# AI shots - getspace-level4"); }, "FAIL getspace-ai-shots.md line 1: text outside the fixed lines and the tables"],
    ["a blank line before line 1", (f) => { f[LIST] = `\n${f[LIST]}`; }, "FAIL getspace-ai-shots.md line 1: line 1 is not the first heading (blank line)"],
    ["the AI clips header followed by the Screens heading", (f) => {
      const [head, rest] = (f[LIST] as string).split("|----|-----|-------|-------------|--------|\n");
      f[LIST] = head + rest.slice(rest.indexOf("## Screens"));
    }, "FAIL getspace-ai-shots.md: table under ## AI clips has no separator row"],
    ["the Screens header as the last line", (f) => {
      f[LIST] = `${(f[LIST] as string).split("|----|-------|-------------|\n")[0]}`;
    }, "FAIL getspace-ai-shots.md: table under ## Screens has no separator row"],
    ["an AI clips separator with four dash cells", (f) => {
      f[LIST] = rep(f[LIST], "|----|-----|-------|-------------|--------|", "|----|-----|-------|-------------|");
    }, "FAIL getspace-ai-shots.md line 6: separator row is not the fixed form"],
    ["a Screens separator with two dash cells", (f) => {
      f[LIST] = rep(f[LIST], "|----|-------|-------------|", "|----|-------|");
    }, "FAIL getspace-ai-shots.md line 13: separator row is not the fixed form"],
  ];
  test.each(failsClosed)("list file parsing fails closed: %s", (_n, edit, line) => {
    const f = fixture3();
    edit(f);
    expect(run(f)).toContain(line);
  });
});

describe("getspace level3 - across storyboards", () => {
  test("the same sentence in seek and level3", () => {
    const f = fixture3();
    f[L3] = rep(f[L3], l3s(0), sentence(0));
    expect(run(f)).toContain(`FAIL same sentence in getspace-seek.md and getspace-level3.md: '${sentence(0).toLowerCase()}'`);
  });

  test("a stray getspace-extra.md with level3 present", () => {
    const f = fixture3();
    f["getspace-extra.md"] = "x\n";
    expect(run(f)).toContain("FAIL getspace-extra.md: not a known GetSpace storyboard file name");
  });

  const spare = "| C-05 | seeker | T-2 | Hold on the spare screen. | 20 | S-01 | blur: name, amount |\n| C-04 | seeker";
  test("a clip used by no storyboard, with level3 absent and present", () => {
    const f = fixture();
    f[SHOT] = rep(f[SHOT], "| C-04 | seeker", spare);
    f["getspace-give.md"] = rep(f[SEEK], "slug: getspace-seek", "slug: getspace-give");
    f["getspace-helps.md"] = rep(f[SEEK], "slug: getspace-seek", "slug: getspace-helps");
    expect(run(f)).toContain("FAIL getspace-shot-list.md C-05: used by no storyboard");
    const g = { ...f, [L3]: level3(), [LIST]: aiList() };
    expect(run(g)).toContain("FAIL getspace-shot-list.md C-05: used by no storyboard");
  });

  test("a clip used only by level3 is used", () => {
    const f = fixture3();
    f[SHOT] = rep(f[SHOT], "| C-04 | seeker", spare);
    f["getspace-give.md"] = rep(f[SEEK], "slug: getspace-seek", "slug: getspace-give");
    f["getspace-helps.md"] = rep(f[SEEK], "slug: getspace-seek", "slug: getspace-helps");
    f[L3] = rep(f[L3], "| clip | C-02 |", "| clip | C-05 |");
    expect(run(f).some((l) => l.includes("used by no storyboard"))).toBe(false);
  });

  test("slug helper knows level3 and not the list file", () => {
    expect(isStoryboardSlug("getspace-level3")).toBe(true);
    expect(isStoryboardSlug("getspace-other")).toBe(false);
    expect(isStoryboardSlug("getspace-ai-shots")).toBe(false);
  });
});

// ---- A57: the start still First frame cell and the Start stills table ----

const START_H = "| Name | Shows | Sha256 |";
const START_SEP = "|------|-------|--------|";
const HEX = (c: string): string => c.repeat(64);
const SS_FAIL_FIRST = "First frame is not none, last frame of an earlier AI clip, or start still and a name";
const LISTN = "getspace-ai-shots.md";

function stillRow(name: string, sha: string = HEX("a"), shows = "A start picture."): string {
  return `| ${name} | ${shows} | ${sha} |`;
}

/** Add a Start stills section (heading, header, separator, rows) after the last table of a list file. */
function addStills(f: Files, rows: string[], key: string = LIST, header: string = START_H): void {
  f[key] = `${f[key]}\n## Start stills\n\n${header}\n${START_SEP}\n${rows.map((r) => `${r}\n`).join("")}`;
}

function setFirst(f: Files, cell: string, id = "AI-1", key: string = LIST): void {
  const re = new RegExp(`^(\\| ${id} \\| \\d+ \\| [^|]*\\| )[^|]*( \\| .*)$`, "m");
  f[key] = (f[key] as string).replace(re, (_m, a: string, b: string) => `${a}${cell}${b}`);
}

function lineOf(f: Files, text: string, key: string = LIST): number {
  return (f[key] as string).split("\n").lastIndexOf(text) + 1;
}

/** level3 and its list, plus a seek storyboard with two AI beats and its own list. */
function fixtureBoth(): Files {
  const f = fixtureAi("seek");
  f[SEEK] = rep(f[SEEK], "| 2 | Pin | 16 | clip | C-02 | Pin [S-02] |", "| 2 | Pin | 15 | ai | AI-2 | - |");
  f[SEEK] = rep(f[SEEK], "| 4 | Last | 16 |", "| 4 | Last | 18 |");
  f[SL] = rep(f[SL], "\n\n## Screens", "\n| AI-2 | 15 | Next view. | last frame of AI-1 | More plain words. |\n\n## Screens");
  f[L3] = level3();
  f[LIST] = aiList();
  return f;
}

const UNKNOWN = (n: string): string => `FAIL ${LISTN} AI-1: First frame start still ${n} is not in the Start stills table`;

describe("getspace start stills - what passes", () => {
  test.each([["E"], ["D"], ["PZ"], ["ABCDEFGH"]])("the level3 list with AI-1 start still %s and its table row", (n) => {
    const f = fixture3();
    setFirst(f, `start still ${n}`);
    addStills(f, [stillRow(n)]);
    expect(run(f)).toEqual([]);
  });

  test("one name used by two AI rows", () => {
    const f = fixture3();
    setFirst(f, "start still D");
    setFirst(f, "start still D", "AI-2");
    addStills(f, [stillRow("D")]);
    expect(run(f)).toEqual([]);
  });

  test("AI-1 start still E with AI-2 last frame of AI-1 in one file", () => {
    const f = fixture3();
    setFirst(f, "start still E");
    addStills(f, [stillRow("E")]);
    expect(f[LIST]).toContain("| last frame of AI-1 |");
    expect(run(f)).toEqual([]);
  });

  test("the same in a seek list", () => {
    const f = fixtureBoth();
    setFirst(f, "start still E", "AI-1", SL);
    addStills(f, [stillRow("E")], SL);
    expect(f[SL]).toContain("| last frame of AI-1 |");
    expect(run(f)).toEqual([]);
  });

  test("64 zeros pass: the checker holds the shape, not the value", () => {
    const f = fixture3();
    setFirst(f, "start still D");
    addStills(f, [stillRow("D", "0".repeat(64))]);
    expect(run(f)).toEqual([]);
  });

  test("the section with header and separator and no rows passes", () => {
    const f = fixture3();
    addStills(f, []);
    expect(run(f)).toEqual([]);
  });

  test("a table passes none and last frame of AI-1 rows", () => {
    const f = fixture3();
    setFirst(f, "start still D");
    addStills(f, [stillRow("D")]);
    expect(run(f)).toEqual([]);
    setFirst(f, "none", "AI-2");
    expect(run(f)).toEqual([]);
  });
});

describe("getspace start stills - table rows", () => {
  test.each([["e"], ["E-1"], ["S4"], ["ABCDEFGHI"], ["AI-1"]])("Name %s", (n) => {
    const f = fixture3();
    addStills(f, [stillRow(n)]);
    expect(run(f)).toContain(`FAIL ${LISTN} line 20: start still Name is not 1 to 8 capital letters`);
  });

  test("a Name listed twice", () => {
    const f = fixture3();
    setFirst(f, "start still D");
    addStills(f, [stillRow("D"), stillRow("D", HEX("b"))]);
    expect(run(f)).toContain(`FAIL ${LISTN} line 21: start still D is listed twice`);
  });

  test.each([
    ["63 characters", "a".repeat(63)],
    ["65 characters", "a".repeat(65)],
    ["one upper case letter", `A${"a".repeat(63)}`],
    ["one letter g", `g${"a".repeat(63)}`],
    ["a sha256: prefix", `sha256:${"a".repeat(64)}`],
  ])("Sha256 with %s", (_n, sha) => {
    const f = fixture3();
    addStills(f, [stillRow("D", sha)]);
    expect(run(f)).toContain(`FAIL ${LISTN} start still D: Sha256 is not 64 lowercase hex characters`);
  });

  test("a bad Sha256 cited by an AI row is the only line", () => {
    const f = fixture3();
    setFirst(f, "start still D");
    addStills(f, [stillRow("D", "a".repeat(63))]);
    expect(run(f)).toEqual([`FAIL ${LISTN} start still D: Sha256 is not 64 lowercase hex characters`]);
  });

  test("one Sha256 under two names", () => {
    const f = fixture3();
    setFirst(f, "start still D");
    setFirst(f, "start still P", "AI-2");
    addStills(f, [stillRow("D"), stillRow("P")]);
    expect(run(f)).toContain(`FAIL ${LISTN} line 21: start still P has the Sha256 of D`);
  });

  test.each([
    ["a digit", "A picture 4 here."],
    ["a slash", "A/B picture."],
    ["a tilde", "A ~B picture."],
  ])("Shows with %s", (_n, shows) => {
    const f = fixture3();
    setFirst(f, "start still D");
    addStills(f, [stillRow("D", HEX("a"), shows)]);
    expect(run(f).some((l) => l.startsWith(`FAIL ${LISTN} start still D Shows:`))).toBe(true);
  });

  test("a Name that no AI row cites", () => {
    const f = fixture3();
    addStills(f, [stillRow("D")]);
    expect(run(f)).toContain(`FAIL ${LISTN} start still D: used by no AI row`);
  });

  test("a name cited only by an AI row no beat uses gives the used-by-no-beat line only", () => {
    const f = fixture3();
    addAiRow(f, "| AI-3 | 5 | Another view. | start still D | More plain words. |");
    addStills(f, [stillRow("D")]);
    const out = run(f);
    expect(out).toContain(`FAIL ${LISTN} AI-3: used by no beat`);
    expect(out.some((l) => l.includes("start still"))).toBe(false);
  });

  test("a seek list with a refused SCR row keeps that line and adds none for a cited row", () => {
    const f = fixtureBoth();
    f[SL] = `${f[SL]}| SCR-1 | A made-up match screen. | S-02 |\n`;
    setFirst(f, "start still E", "AI-1", SL);
    addStills(f, [stillRow("E")], SL);
    const out = run(f);
    expect(out).toContain(`FAIL ${SL} SCR-1: a screen row is not allowed in this list, only ai clips`);
    expect(out.some((l) => l.includes("start still"))).toBe(false);
  });
});

describe("getspace start stills - section shape", () => {
  test("the section before ## Screens", () => {
    const f = fixture3();
    f[LIST] = rep(f[LIST], "## Screens", "## Start stills\n\n## Screens");
    expect(run(f)).toContain(`FAIL ${LISTN} line ${lineOf(f, "## Start stills")}: text outside the fixed lines and the tables`);
  });

  test("the heading given a second time", () => {
    const f = fixture3();
    addStills(f, []);
    f[LIST] = `${f[LIST]}\n## Start stills\n`;
    expect(run(f)).toContain(`FAIL ${LISTN} line ${lineOf(f, "## Start stills")}: text outside the fixed lines and the tables`);
  });

  test("the heading given a second time starts no new table", () => {
    const f = fixture3();
    addStills(f, []);
    f[LIST] = `${f[LIST]}\n## Start stills\n\n${START_H}\n${START_SEP}\n${stillRow("D")}\n`;
    const out = run(f);
    expect(out).toContain(`FAIL ${LISTN} line ${lineOf(f, "## Start stills")}: text outside the fixed lines and the tables`);
    expect(out.some((l) => l.includes("start still D"))).toBe(false);
  });

  test.each([["## start stills"], ["## Start stills "]])("the heading %j", (h) => {
    const f = fixture3();
    addStills(f, []);
    f[LIST] = rep(f[LIST], "## Start stills", h);
    expect(run(f)).toContain(`FAIL ${LISTN} line 16: text outside the fixed lines and the tables`);
  });

  test("the heading with no table", () => {
    const f = fixture3();
    f[LIST] = `${f[LIST]}\n## Start stills\n`;
    expect(run(f)).toContain(`FAIL ${LISTN}: no table under ## Start stills`);
  });

  test("another header", () => {
    const f = fixture3();
    addStills(f, [], LIST, "| Name | Shows | Hash |");
    expect(run(f)).toContain(`FAIL ${LISTN} line 18: table header is not the fixed header`);
  });

  test("a row of 2 cells", () => {
    const f = fixture3();
    addStills(f, ["| D | A start picture. |"]);
    expect(run(f)).toContain(`FAIL ${LISTN} line 20: row has 2 cells, the header has 3`);
  });
});

describe("getspace start stills - First frame refusals", () => {
  test("an unknown name when the file has no Start stills section", () => {
    const f = fixture3();
    setFirst(f, "start still E");
    expect(run(f)).toContain(UNKNOWN("E"));
  });

  test("an unknown name when the section lacks it", () => {
    const f = fixture3();
    setFirst(f, "start still E");
    setFirst(f, "start still D", "AI-2");
    addStills(f, [stillRow("D")]);
    expect(run(f)).toContain(UNKNOWN("E"));
  });

  test("a name that is a row of the seek list only", () => {
    const f = fixtureBoth();
    setFirst(f, "start still E");
    setFirst(f, "start still E", "AI-1", SL);
    addStills(f, [stillRow("E")], SL);
    expect(run(f)).toContain(UNKNOWN("E"));
  });

  test.each([
    ["the table lists D and the cell cites DX", "D", "DX"],
    ["the table lists DX and the cell cites D", "DX", "D"],
  ])("a prefix of a name is not the name: %s", (_n, tabled, cited) => {
    const f = fixture3();
    setFirst(f, `start still ${cited}`);
    setFirst(f, `start still ${tabled}`, "AI-2");
    addStills(f, [stillRow(tabled)]);
    expect(run(f)).toEqual([UNKNOWN(cited)]);
  });

  test.each([
    ["start still"], ["start still d"], ["Start still D"], ["start still  D"], ["start stillD"], ["still D"],
    ["start still D."], ["start still E-1"], ["start still S4"], ["start still ABCDEFGHI"],
    ["start still D to PZ"], ["start still D, P"], ["x start still D"],
  ])("a malformed cell %j", (cell) => {
    const f = fixture3();
    setFirst(f, cell);
    setFirst(f, "start still D", "AI-2");
    addStills(f, [stillRow("D")]);
    expect(run(f)).toEqual([A("AI-1", SS_FAIL_FIRST)]);
  });

  test("a malformed cell is not a use of the name", () => {
    const f = fixture3();
    setFirst(f, "start still D to PZ");
    addStills(f, [stillRow("D")]);
    expect(run(f)).toContain(`FAIL ${LISTN} start still D: used by no AI row`);
  });

  test("a padded empty name is refused by the row parser", () => {
    const f = fixture3();
    f[LIST] = rep(f[LIST], "| none |", "| start still  |");
    expect(run(f)).toContain(`FAIL ${LISTN} line 7: row holds an empty, padded or bar-holding cell`);
  });
});

describe("getspace start stills - none and last frame as before", () => {
  test.each([["last frame of E"], ["last frame of AI-1"], ["None"], ["NONE"]])("AI-1 holding %s", (cell) => {
    const f = fixture3();
    setFirst(f, cell);
    expect(run(f)).toContain(A("AI-1", FIRST_FAIL));
  });

  test("with a table, last frame of a later clip still fails", () => {
    const f = fixture3();
    setFirst(f, "start still D");
    setFirst(f, "last frame of AI-3", "AI-2");
    addStills(f, [stillRow("D")]);
    expect(run(f)).toContain(A("AI-2", FIRST_FAIL));
  });
});
