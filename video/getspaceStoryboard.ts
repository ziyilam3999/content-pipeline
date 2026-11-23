/**
 * Row A41-storyboards - the checker for the GetSpace storyboards and their shot list.
 *
 * Reads storyboards/getspace-shot-list.md, each of getspace-seek|give|helps.md that exists, and the public
 * facts snapshot (storyboards/getspace-facts.json: id, section, on-screen class, open flag, numbers). Returns
 * one line starting with FAIL per broken rule; an empty list is a pass. Writes nothing, makes no call.
 *
 *   - snapshot it cannot trust (missing, not JSON, wrong schema or keys, bad id, twice) -> THROWS "REFUSED".
 *   - no storyboard present, shot list missing, an unknown getspace-*.md file -> FAIL (decided by the listing,
 *     so a file name in another letter case is not the known name on any system).
 *   - parsing fails closed: BOM, lone CR, table shape, free text, bad fact id group -> FAIL, not a skip.
 *   - each narration / on-screen sentence cites fact ids; ids must be known, not open points, not never rows.
 *   - narration carries no digit and no number word (numbers go on screen only); on-screen digits must be
 *     numbers of the cited facts; borrowing, penalty and cancel facts carry no digit; no money, no banned word.
 *   - the storyboard asset is clip or ai; each beat clip is in the shot list and long enough. An ai beat is
 *     tied to the AI shots list of its own storyboard (<slug>-ai-shots.md, getspace-ai-shots.md for level3;
 *     checkAiShots). The asset screen is level3 only; still and synth are refused in all four.
 *   - an AI list First frame cell is none, last frame of an earlier AI clip, or start still <Name>: a row of the
 *     optional Start stills table (Name, Shows, Sha256 text); the checker holds the shape, opens no picture.
 *   - the shot list holds the 15 check-list lines, the five fixed answers, at most 12 clips, both sides of a
 *     take, and a Hide cell that names blur and the fixed-list words for the facts a clip shows.
 *   - an on-screen fact id is a fact the beat's clip shows; with all three storyboards present, each clip is
 *     used by a beat.
 *
 * These rules tie ids, numbers, words and form. They cannot tell a sentence that is false in words they do
 * not name; a person reads the sentences against the facts (the prose review).
 */

import * as fs from "fs";
import * as path from "path";

import { isPostSlug } from "../publish/publishAssets";
import { CHECKLIST_KINDS } from "./clipIntake";

export const GETSPACE_STORYBOARD_SLUGS = ["getspace-seek", "getspace-give", "getspace-helps"];

/** The 4th storyboard: it may hold ai and screen beats, tied to the list file. */
export const LEVEL3_SLUG = "getspace-level3";
const LEVEL3_FILE = `${LEVEL3_SLUG}.md`;
const AI_SHOTS = "getspace-ai-shots.md";

/** The AI shots list file of a storyboard slug: level3 keeps its name, the others are <slug>-ai-shots.md. */
function aiListName(slug: string): string {
  return slug === LEVEL3_SLUG ? AI_SHOTS : `${slug}-ai-shots.md`;
}

/** True for a known post slug, one of the three A41 GetSpace slugs, or the level 3 slug. */
export function isStoryboardSlug(s: string): boolean {
  return isPostSlug(s) || GETSPACE_STORYBOARD_SLUGS.includes(s) || s === LEVEL3_SLUG;
}

export interface GetspaceCheckOpts {
  storyboardRoot?: string;
  snapshotPath?: string;
}

const SHOT_LIST = "getspace-shot-list.md";
const SNAPSHOT_SCHEMA = "getspace-facts/1";
const FACT_KEYS = ["id", "section", "on_screen", "open", "numbers"];
const SECTIONS = ["seek", "give", "helps", "open"];
const ON_SCREEN = ["yes", "care", "never", "no"];
const MAX_CLIPS = 12;

const STORYBOARD_HEADER = "| # | Beat | Dur | Asset | Clip | On-screen text | Narration |";
const AI_HEADER = "| Id | Sec | Shows | First frame | Prompt |";
const SCREEN_HEADER = "| Id | Shows | Facts shown |";
const START_HEADER = "| Name | Shows | Sha256 |";
const SHOT_HEADER = "| Clip | Side | Take | What to do | Sec | Facts shown | Hide |";

// the five lines the operator answered, in fixed neutral wording
const FIXED_LINES: Record<string, string> = {
  "recorder-overlay": "crop the status bar.",
  "own-name": "blur.",
  "number-plate-vehicle": "blur.",
  "test-build-mark": "blur.",
  "transaction-id": "blur.",
};

// fixed per-id list of Hide words: the snapshot has no care text, so the words live here (ids only)
const HIDE_WORDS: Record<string, string[]> = {
  position: [
    "S-02", "S-03", "S-04", "S-05", "S-06", "S-07", "S-08", "S-09", "S-10", "S-11", "S-12", "S-13", "S-14",
    "G-02", "G-03", "G-04", "G-05", "G-06", "G-07", "G-08", "G-09", "G-10", "G-11", "G-12", "G-14", "G-15",
    "H-10", "H-11", "H-14", "H-15",
  ],
  "spot photos": [
    "S-08", "S-09", "S-10", "S-11", "S-12", "S-13", "S-14",
    "G-02", "G-03", "G-04", "G-05", "G-06", "G-07", "G-08", "G-09", "G-10", "G-11", "G-12", "G-14", "G-15",
    "H-10", "H-11", "H-15",
  ],
  "other user details": [
    "S-08", "S-09", "S-10", "S-11", "S-12", "S-13", "S-14", "S-15",
    "G-10", "G-11", "G-12", "G-14", "G-15",
    "H-01", "H-07", "H-09", "H-10", "H-13", "H-15",
  ],
  id: [
    "S-10", "S-11", "S-12", "S-13", "S-14", "G-06", "G-07", "G-08", "G-09", "G-10", "G-11", "G-12", "G-14",
    "G-15", "H-09", "H-10", "H-11",
  ],
  name: ["S-01", "G-01", "H-03", "H-06"],
  amount: ["S-01", "G-01", "H-03", "H-06", "H-02", "H-07", "H-08", "H-04", "H-05", "H-16", "S-14"],
};

// a group that cites one of these holds no digit anywhere (borrowing, penalty, cancel compensation)
const NO_NUMBER_IDS = ["H-04", "H-05", "H-06", "H-16", "S-14"];

const NUMBER_WORDS = new Set([
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty",
  "forty", "fifty", "sixty", "hundred", "twice", "half",
]);

const BANNED_RE = /(?<![a-z])(seamless|unlock|revolution|game-changer|every|always|never)/i;
const SERVICE_RE = /gs-[a-z]/i;
const URL_RE = /h[t]tps?:|www[.]|[.](com|io|my|dart)(?![a-z])/i;
const HOME_RE = /\/U[s]ers\/|\/h[o]me\/|[~]\//;
const MONEY_WORD_RE = /(?<![a-z])(rm|usd|myr|sen|ringgit|dollars?|cents?)(?![a-z])/i;

const ID_GROUP_RE = /^\[[SGHO]-\d{2}(, [SGHO]-\d{2})*\]$/;
const ID_LIST_RE = /^[SGH]-\d{2}(, [SGH]-\d{2})*$/;

interface Fact {
  id: string;
  section: string;
  on_screen: string;
  open: boolean;
  numbers: string[];
}
type Facts = Map<string, Fact>;

function refused(msg: string): Error {
  return new Error(`getspace-storyboards: REFUSED: ${msg}`);
}

/** Read the snapshot; THROWS REFUSED when it cannot be trusted (no rule runs on it then). */
function loadSnapshot(file: string): Facts {
  const base = path.basename(file);
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    throw refused(`${base} is missing or unreadable`);
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw refused(`${base} is not JSON`);
  }
  const top = data as { schema?: unknown; facts?: unknown } | null;
  if (typeof top !== "object" || top === null || Array.isArray(top)) throw refused(`${base} is not an object`);
  if (top.schema !== SNAPSHOT_SCHEMA) throw refused(`${base} has another schema`);
  if (!Array.isArray(top.facts)) throw refused(`${base} has no facts list`);
  const facts: Facts = new Map();
  for (const f of top.facts as unknown[]) {
    const o = f as Record<string, unknown> | null;
    if (typeof o !== "object" || o === null || Array.isArray(o)) throw refused(`${base} holds a fact that is not an object`);
    const keys = Object.keys(o);
    if (keys.length !== FACT_KEYS.length || !FACT_KEYS.every((k) => keys.includes(k))) {
      throw refused(`${base} holds a fact with a key other than the five`);
    }
    if (typeof o.id !== "string" || !/^[SGHO]-\d{2}$/.test(o.id)) throw refused(`${base} holds a bad id`);
    if (facts.has(o.id)) throw refused(`${base} holds an id twice (${o.id})`);
    if (typeof o.section !== "string" || !SECTIONS.includes(o.section)) throw refused(`${base} holds an unknown section (${o.id})`);
    if (typeof o.on_screen !== "string" || !ON_SCREEN.includes(o.on_screen)) throw refused(`${base} holds an unknown on_screen (${o.id})`);
    if (typeof o.open !== "boolean") throw refused(`${base} holds an open flag that is not a boolean (${o.id})`);
    if (!Array.isArray(o.numbers) || !o.numbers.every((n) => typeof n === "string" && /^\d+$/.test(n))) {
      throw refused(`${base} holds a number that is not digits (${o.id})`);
    }
    facts.set(o.id, o as unknown as Fact);
  }
  return facts;
}

// ---- file reading and table scanning ----

function readLines(name: string, raw: string, fails: string[]): string[] | null {
  if (raw.startsWith("﻿")) {
    fails.push(`FAIL ${name}: starts with a byte order mark`);
    return null;
  }
  const text = raw.replace(/\r\n/g, "\n");
  if (text.includes("\r")) {
    fails.push(`FAIL ${name}: holds a lone CR`);
    return null;
  }
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  lines.forEach((l, i) => {
    if (/[^\x00-\x7f]/.test(l)) fails.push(`FAIL ${name} line ${i + 1}: non-ASCII character`);
  });
  return lines;
}

interface Row {
  n: number;
  cells: string[];
}
interface Scan {
  keys: { n: number; text: string }[];
  rows: Row[];
}

function colCount(header: string): number {
  return header.slice(2, -2).split(" | ").length;
}

function parseRow(name: string, n: number, text: string, cols: number, fails: string[]): string[] | null {
  if (text.includes("\\|")) {
    fails.push(`FAIL ${name} line ${n}: row holds an escaped bar`);
    return null;
  }
  if (!(text.startsWith("| ") && text.endsWith(" |"))) {
    fails.push(`FAIL ${name} line ${n}: row is not of the form | cell | ... |`);
    return null;
  }
  const cells = text.slice(2, -2).split(" | ");
  if (cells.length !== cols) {
    fails.push(`FAIL ${name} line ${n}: row has ${cells.length} cells, the header has ${cols}`);
    return null;
  }
  for (const c of cells) {
    if (c === "" || c.trim() !== c || c.includes("|")) {
      fails.push(`FAIL ${name} line ${n}: row holds an empty, padded or bar-holding cell`);
      return null;
    }
  }
  return cells;
}

/** A square bracket in a cell that holds no fact id groups is a FAIL. */
function noBrackets(where: string, cell: string, fails: string[]): void {
  if (/[[\]]/.test(cell)) fails.push(`FAIL ${where}: bad fact id group (square bracket in the cell)`);
}

function separatorOk(text: string, cols: number): boolean {
  if (!(text.startsWith("|") && text.endsWith("|") && text.length > 1)) return false;
  const cells = text.slice(1, -1).split("|");
  return cells.length === cols && cells.every((c) => /^ ?:?-{3,}:? ?$/.test(c));
}

/** Walk the body lines: fixed lines in order, optional key lines, then one table. Anything else is a FAIL. */
function scanBody(
  name: string,
  lines: string[],
  start: number,
  fixed: string[],
  keyAfter: number,
  header: string,
  fails: string[],
): Scan {
  const scan: Scan = { keys: [], rows: [] };
  const cols = colCount(header);
  let fixedIdx = 0;
  let state: "none" | "header" | "rows" | "ended" = "none";
  for (let i = start; i < lines.length; i++) {
    const text = lines[i];
    const n = i + 1;
    if (text === "") {
      if (state === "rows") state = "ended";
      // a blank line between the header and the separator row is no table
      if (state === "header") fails.push(`FAIL ${name} line ${n}: separator row is not the fixed form (blank line)`);
      continue;
    }
    if (text.startsWith("|")) {
      if (state === "none") {
        if (!(text === header && fixedIdx === fixed.length)) {
          fails.push(`FAIL ${name} line ${n}: table header is not the fixed header (bar line before the header)`);
        }
        state = "header";
      } else if (state === "header") {
        if (!separatorOk(text, cols)) fails.push(`FAIL ${name} line ${n}: separator row is not the fixed form`);
        state = "rows";
      } else if (state === "rows") {
        const cells = parseRow(name, n, text, cols, fails);
        if (cells) scan.rows.push({ n, cells });
      } else if (text === header) {
        fails.push(`FAIL ${name} line ${n}: second table`);
      } else {
        fails.push(`FAIL ${name} line ${n}: bar line after the table ends`);
      }
      continue;
    }
    if (state === "none" && fixedIdx < fixed.length && text === fixed[fixedIdx]) {
      fixedIdx++;
    } else if (state === "none" && fixedIdx === keyAfter && text.startsWith("- ")) {
      scan.keys.push({ n, text });
    } else {
      fails.push(`FAIL ${name} line ${n}: text outside the fixed lines and the table`);
      if (state === "rows") state = "ended";
    }
  }
  if (fixedIdx < fixed.length) fails.push(`FAIL ${name}: fixed line missing: ${fixed[fixedIdx]}`);
  if (state === "none") fails.push(`FAIL ${name}: no table`);
  return scan;
}

// ---- text rules ----

/** Banned word, service name, URL or file ending, at sign, home path. */
function textRules(where: string, text: string, fails: string[], withBanned: boolean): void {
  if (withBanned && BANNED_RE.test(text)) fails.push(`FAIL ${where}: banned word`);
  if (SERVICE_RE.test(text)) fails.push(`FAIL ${where}: service name`);
  if (URL_RE.test(text)) fails.push(`FAIL ${where}: URL or web or file ending`);
  if (text.includes("@")) fails.push(`FAIL ${where}: at sign`);
  if (HOME_RE.test(text)) fails.push(`FAIL ${where}: home path`);
}

function numberWordRule(where: string, text: string, fails: string[]): void {
  for (const tok of text.toLowerCase().split(/[^a-z]+/)) {
    if (NUMBER_WORDS.has(tok)) fails.push(`FAIL ${where}: number word '${tok}'; write digits`);
  }
}

function moneyRule(where: string, text: string, fails: string[]): void {
  if (text.includes("$") || MONEY_WORD_RE.test(text) || /\d[.,]\d/.test(text)) {
    fails.push(`FAIL ${where}: money amount or currency word`);
  }
}

interface Group {
  text: string;
  ids: string[];
}

/** Split a cell into sentence groups, each ending with a space and a fact id group. */
function parseGroups(where: string, cell: string, fails: string[]): Group[] {
  const groups: Group[] = [];
  const spans = [...cell.matchAll(/\[[^[\]]*\]/g)];
  if (/[[\]]/.test(cell.replace(/\[[^[\]]*\]/g, ""))) fails.push(`FAIL ${where}: bad fact id group`);
  if (spans.length === 0) {
    fails.push(`FAIL ${where}: no fact id group`);
    return groups;
  }
  let pos = 0;
  spans.forEach((m, i) => {
    const idx = m.index as number;
    if (!ID_GROUP_RE.test(m[0])) fails.push(`FAIL ${where}: bad fact id group ${m[0]}`);
    let raw = cell.slice(pos, idx);
    if (i > 0) {
      if (!raw.startsWith(" ")) fails.push(`FAIL ${where}: group with no text before it`);
      raw = raw.startsWith(" ") ? raw.slice(1) : raw;
    }
    const sentence = raw.endsWith(" ") ? raw.slice(0, -1) : raw;
    if (sentence === "" || sentence.trim() !== sentence || !raw.endsWith(" ")) {
      fails.push(`FAIL ${where}: group with no text before it`);
    }
    const ids = ID_GROUP_RE.test(m[0]) ? m[0].slice(1, -1).split(", ") : [];
    groups.push({ text: sentence, ids });
    pos = idx + m[0].length;
  });
  if (cell.slice(pos) !== "") fails.push(`FAIL ${where}: text after the last group`);
  return groups;
}

function citeRules(where: string, g: Group, facts: Facts, fails: string[]): void {
  for (const id of g.ids) {
    const f = facts.get(id);
    if (!f) fails.push(`FAIL ${where}: unknown fact id ${id}`);
    else if (f.open) fails.push(`FAIL ${where}: cites open point ${id}`);
    else if (f.on_screen === "never") fails.push(`FAIL ${where}: cites never row ${id}`);
  }
}

// ---- storyboard ----

function openingOf(sentence: string): string {
  const words = sentence.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(" ").filter((w) => w !== "");
  return words.slice(0, 2).join(" ");
}

function checkStoryboard(
  name: string,
  raw: string,
  facts: Facts,
  clips: Map<string, number> | null,
  shownBy: Map<string, string[]>,
  used: Set<string>,
  fails: string[],
  l3: Level3Ctx | null = null,
): string[] {
  const sentences: string[] = [];
  const lines = readLines(name, raw, fails);
  if (!lines) return sentences;
  const slug = name.replace(/[.]md$/, "");

  // front matter: slug, title, aspect, target_runtime_sec in this order
  let titleValue = "";
  let bodyStart = 0;
  if (lines[0] !== "---") {
    fails.push(`FAIL ${name}: front matter missing`);
  } else {
    const end = lines.indexOf("---", 1);
    if (end < 0) {
      fails.push(`FAIL ${name}: front matter not closed`);
    } else {
      bodyStart = end + 1;
      const fm = lines.slice(1, end);
      const want = ["slug", "title", "aspect", "target_runtime_sec"];
      const got = fm.map((l) => l.split(": ")[0]);
      if (fm.length !== 4 || !want.every((k, i) => got[i] === k)) {
        fails.push(`FAIL ${name}: front matter keys are not slug, title, aspect, target_runtime_sec in order`);
      } else {
        const val = (i: number): string => fm[i].slice(want[i].length + 2);
        if (val(0) !== slug) fails.push(`FAIL ${name}: slug does not equal the file name`);
        titleValue = val(1);
        if (!/^"[^"]*"$/.test(titleValue)) fails.push(`FAIL ${name}: title is not one double-quoted text`);
        if (/\d/.test(titleValue)) fails.push(`FAIL ${name}: digit in the title`);
        textRules(`${name} title`, titleValue, fails, true);
        if (val(2) !== "9:16") fails.push(`FAIL ${name}: aspect is not 9:16`);
        const t = val(3);
        if (!/^\d+$/.test(t) || Number(t) < 60 || Number(t) > 90) {
          fails.push(`FAIL ${name}: target_runtime_sec ${t} is not a whole number from 60 to 90`);
        }
      }
    }
  }

  const fixed = [`# Storyboard - ${titleValue}`, "## The beats"];
  const scan = scanBody(name, lines, bodyStart, fixed, -1, STORYBOARD_HEADER, fails);

  let durTotal = 0;
  let words = 0;
  const perClip = new Map<string, number>();
  const perAi = new Map<string, number>();
  const openings = new Map<string, number>();
  scan.rows.forEach((row, i) => {
    const [num, beat, dur, asset, clip, onScreen, narration] = row.cells;
    const at = `${name} beat ${i + 1}`;
    for (const c of [num, beat, dur, asset, clip]) noBrackets(at, c, fails);
    if (num !== String(i + 1)) fails.push(`FAIL ${at}: beat number is ${num}`);
    textRules(`${at} Beat`, beat, fails, true);
    let d = 0;
    if (/^\d+$/.test(dur) && Number(dur) > 0) d = Number(dur);
    else fails.push(`FAIL ${at}: Dur is not whole seconds`);
    durTotal += d;
    if (asset === "synth" || asset === "still") fails.push(`FAIL ${at}: Asset ${asset} is refused, only clip`);
    else if (asset === "screen") {
      if (!l3?.screens) fails.push(`FAIL ${at}: Asset ${asset} is refused, only clip`);
    } else if (asset !== "clip" && asset !== "ai") {
      fails.push(`FAIL ${at}: Asset is not ${l3?.screens ? "clip, ai or screen" : "clip or ai"}`);
    }
    const kind = l3 && (asset === "ai" || (asset === "screen" && l3.screens)) ? asset : "clip";
    let shownIds: string[] | undefined;
    if (l3 && kind === "ai") {
      if (l3.lists && !l3.lists.ai.has(clip)) fails.push(`FAIL ${at}: clip ${clip} is not an AI clip of ${l3.aiName}`);
      perAi.set(clip, (perAi.get(clip) ?? 0) + d);
      l3.usedIds.add(clip);
    } else if (l3 && kind === "screen") {
      if (l3.lists && !l3.lists.screens.has(clip)) fails.push(`FAIL ${at}: clip ${clip} is not a screen of ${l3.aiName}`);
      shownIds = l3.lists?.screens.get(clip);
      l3.usedIds.add(clip);
    } else {
      if (clips && !clips.has(clip)) fails.push(`FAIL ${at}: clip ${clip} is not in the shot list`);
      perClip.set(clip, (perClip.get(clip) ?? 0) + d);
      used.add(clip);
      shownIds = shownBy.get(clip);
    }

    for (const [label, cell] of [["On-screen text", onScreen], ["Narration", narration]] as const) {
      const where = `${at} ${label}`;
      if (kind === "ai" && label === "On-screen text") {
        if (cell !== "-") fails.push(`FAIL ${where}: an ai beat holds no on-screen text, only -`);
        continue;
      }
      if (cell === "-") continue;
      textRules(where, cell, fails, true);
      numberWordRule(where, cell, fails);
      moneyRule(where, cell, fails);
      const groups = parseGroups(where, cell, fails);
      for (const g of groups) {
        citeRules(where, g, facts, fails);
        const known = new Set<string>();
        for (const id of g.ids) for (const nn of facts.get(id)?.numbers ?? []) known.add(nn);
        const digits = [...g.text.matchAll(/\d+/g)].map((m) => m[0]);
        if (label === "Narration") {
          for (const dg of digits) fails.push(`FAIL ${where}: number ${dg} in narration; numbers go on screen only`);
          words += g.text.split(/\s+/).filter((w) => w !== "").length;
          for (const s of g.text.split(/(?<=[.?!]) /)) {
            sentences.push(s.trim().toLowerCase());
            const o = openingOf(s);
            openings.set(o, (openings.get(o) ?? 0) + 1);
          }
        } else {
          // on-screen text is text the clip shows
          if (shownIds) {
            for (const id of g.ids) {
              if (!shownIds.includes(id)) fails.push(`FAIL ${where}: on-screen id ${id} is not in Facts shown of ${clip}`);
            }
          }
          for (const dg of digits) {
            if (g.ids.some((id) => NO_NUMBER_IDS.includes(id))) {
              fails.push(`FAIL ${where}: number ${dg} with a borrowing, penalty or cancel fact`);
            } else if (!known.has(dg)) {
              fails.push(`FAIL ${where}: number ${dg} is not a number of the cited facts ${g.ids.join(", ")}`);
            }
          }
        }
      }
    }
  });

  if (durTotal < 60 || durTotal > 90) fails.push(`FAIL ${name}: Dur total ${durTotal} is not 60 to 90`);
  if (clips) {
    for (const [clip, need] of perClip) {
      const have = clips.get(clip);
      if (have !== undefined && need > have) fails.push(`FAIL ${name}: beats on ${clip} need ${need} s, the clip is ${have} s`);
    }
  }
  if (l3?.lists) {
    for (const [id, need] of perAi) {
      const have = l3.lists.ai.get(id);
      if (have !== undefined && need > have) fails.push(`FAIL ${name}: beats on ${id} need ${need} s, the clip is ${have} s`);
    }
  }
  const ceiling = Math.min(220, 2.5 * durTotal);
  if (words < 140 || words > ceiling) {
    fails.push(`FAIL ${name}: narration has ${words} words, needs 140 to ${ceiling}`);
  }
  for (const [o, count] of openings) {
    if (count > 2) fails.push(`FAIL ${slug}: sentence opening '${o}' used ${count} times, at most 2`);
  }
  return sentences;
}

interface AiLists {
  ai: Map<string, number>;
  screens: Map<string, string[]>;
}
interface Level3Ctx {
  lists: AiLists | null;
  usedIds: Set<string>;
  aiName: string; // list file of this storyboard
  screens: boolean; // screen beats allowed (level3 only)
}

// ---- AI shots list file ----

/** Free text of the list file: the text rules without banned words, plus no digit, slash, backslash or tilde. */
function listTextRules(where: string, text: string, fails: string[]): void {
  textRules(where, text, fails, false);
  if (/\d/.test(text)) fails.push(`FAIL ${where}: digit`);
  if (text.includes("/")) fails.push(`FAIL ${where}: slash`);
  if (text.includes("\\")) fails.push(`FAIL ${where}: backslash`);
  if (text.includes("~")) fails.push(`FAIL ${where}: tilde`);
}

function checkAiShots(name: string, slug: string, raw: string, facts: Facts, fails: string[]): AiLists | null {
  const lines = readLines(name, raw, fails);
  if (!lines) return null;
  const headings = [`# AI shots - ${slug}`, "## AI clips", "## Screens", "## Start stills"];
  const headers = [AI_HEADER, SCREEN_HEADER, START_HEADER];
  const rows: Row[][] = [[], [], []];
  let hIdx = 0; // headings seen (the 4th, Start stills, is optional)
  let sec = -1; // table section: 0 AI clips, 1 Screens, 2 Start stills
  let state: "none" | "header" | "rows" | "ended" | "bad" = "none";
  const closeSection = (): void => {
    if (sec >= 0 && state === "none") fails.push(`FAIL ${name}: no table under ${headings[sec + 1]}`);
    if (sec >= 0 && state === "header") fails.push(`FAIL ${name}: table under ${headings[sec + 1]} has no separator row`);
  };
  lines.forEach((text, i) => {
    const n = i + 1;
    if (text === "") {
      if (hIdx === 0) fails.push(`FAIL ${name} line ${n}: line 1 is not the first heading (blank line)`);
      if (state === "rows") state = "ended";
      if (state === "header") fails.push(`FAIL ${name} line ${n}: separator row is not the fixed form (blank line)`);
      return;
    }
    if (hIdx < 4 && text === headings[hIdx]) {
      if (hIdx >= 2) closeSection();
      hIdx++;
      if (hIdx >= 2) {
        sec = hIdx - 2;
        state = "none";
      }
      return;
    }
    if (text.startsWith("|")) {
      if (sec < 0) fails.push(`FAIL ${name} line ${n}: bar line outside a table`);
      else if (state === "none") {
        if (text === headers[sec]) state = "header";
        else {
          fails.push(`FAIL ${name} line ${n}: table header is not the fixed header`);
          state = "bad";
        }
      } else if (state === "header") {
        if (!separatorOk(text, colCount(headers[sec]))) fails.push(`FAIL ${name} line ${n}: separator row is not the fixed form`);
        state = "rows";
      } else if (state === "rows") {
        const cells = parseRow(name, n, text, colCount(headers[sec]), fails);
        if (cells) rows[sec].push({ n, cells });
      } else if (state === "ended") {
        fails.push(`FAIL ${name} line ${n}: bar line after the table ends`);
      }
      return;
    }
    fails.push(`FAIL ${name} line ${n}: text outside the fixed lines and the tables`);
    if (state === "rows") state = "ended";
  });
  if (hIdx < 3) fails.push(`FAIL ${name}: fixed line missing: ${headings[hIdx]}`);
  else closeSection();

  // Start stills table: the set of names and the Sha256 texts seen; no picture is opened
  const stills = new Set<string>();
  const shaOwner = new Map<string, string>();
  for (const row of rows[2]) {
    const [nm, shows, sha] = row.cells;
    if (!/^[A-Z]{1,8}$/.test(nm)) {
      fails.push(`FAIL ${name} line ${row.n}: start still Name is not 1 to 8 capital letters`);
      continue;
    }
    if (stills.has(nm)) {
      fails.push(`FAIL ${name} line ${row.n}: start still ${nm} is listed twice`);
      continue;
    }
    stills.add(nm);
    if (!/^[0-9a-f]{64}$/.test(sha)) {
      fails.push(`FAIL ${name} start still ${nm}: Sha256 is not 64 lowercase hex characters`);
    } else {
      const earlier = shaOwner.get(sha);
      if (earlier !== undefined) fails.push(`FAIL ${name} line ${row.n}: start still ${nm} has the Sha256 of ${earlier}`);
      else shaOwner.set(sha, nm);
    }
    listTextRules(`${name} start still ${nm} Shows`, shows, fails);
  }
  const cited = new Set<string>();

  const lists: AiLists = { ai: new Map(), screens: new Map() };
  rows[0].forEach((row, i) => {
    const [id, secCell, shows, first, prompt] = row.cells;
    const at = `${name} ${id}`;
    if (id !== `AI-${i + 1}`) fails.push(`FAIL ${name} line ${row.n}: Id ${id} is not AI-${i + 1}`);
    let secN = 0;
    if (/^\d+$/.test(secCell) && Number(secCell) >= 3 && Number(secCell) <= 15) secN = Number(secCell);
    else fails.push(`FAIL ${at}: Sec is not a whole number from 3 to 15`);
    const m = first.match(/^last frame of AI-(\d+)$/);
    const s = first.match(/^start still ([A-Z]{1,8})$/);
    if (s) {
      if (stills.has(s[1])) cited.add(s[1]);
      else fails.push(`FAIL ${at}: First frame start still ${s[1]} is not in the Start stills table`);
    } else if (first !== "none" && !(m && Number(m[1]) >= 1 && Number(m[1]) < i + 1)) {
      fails.push(`FAIL ${at}: First frame is not none, last frame of an earlier AI clip, or start still and a name`);
    }
    listTextRules(`${at} Shows`, shows, fails);
    listTextRules(`${at} Prompt`, prompt, fails);
    lists.ai.set(id, secN);
  });
  for (const nm of stills) {
    if (!cited.has(nm)) fails.push(`FAIL ${name} start still ${nm}: used by no AI row`);
  }
  rows[1].forEach((row, i) => {
    const [id, shows, shown] = row.cells;
    const at = `${name} ${id}`;
    if (slug !== LEVEL3_SLUG) {
      fails.push(`FAIL ${at}: a screen row is not allowed in this list, only ai clips`);
      return;
    }
    if (id !== `SCR-${i + 1}`) fails.push(`FAIL ${name} line ${row.n}: Id ${id} is not SCR-${i + 1}`);
    listTextRules(`${at} Shows`, shows, fails);
    let ids: string[] = [];
    if (!ID_LIST_RE.test(shown)) fails.push(`FAIL ${at}: Facts shown is not a list of S, G or H ids`);
    else {
      ids = shown.split(", ");
      for (const f of ids) {
        const fact = facts.get(f);
        if (!fact) fails.push(`FAIL ${at}: unknown fact id ${f}`);
        else if (fact.open) fails.push(`FAIL ${at}: cites open point ${f}`);
        else if (fact.on_screen === "never") fails.push(`FAIL ${at}: cites never row ${f}`);
      }
    }
    lists.screens.set(id, ids);
  });
  return lists;
}

// ---- shot list ----

function checkShotList(
  name: string,
  raw: string,
  facts: Facts,
  shownBy: Map<string, string[]>,
  fails: string[],
): Map<string, number> | null {
  const lines = readLines(name, raw, fails);
  if (!lines) return null;
  const fixed = ["# Shot list - GetSpace how-to videos", "## Before every take", "## Clips"];
  const scan = scanBody(name, lines, 0, fixed, 2, SHOT_HEADER, fails);

  // one line per check-list kind
  const seen = new Set<string>();
  for (const k of scan.keys) {
    const m = k.text.match(/^- ([a-z-]+): (.+)$/);
    if (!m) {
      fails.push(`FAIL ${name} line ${k.n}: before-every-take line is not - kind: text`);
      continue;
    }
    const [, kind, text] = m;
    if (!CHECKLIST_KINDS.includes(kind)) fails.push(`FAIL ${name} line ${k.n}: unknown kind ${kind}`);
    if (seen.has(kind)) fails.push(`FAIL ${name} line ${k.n}: kind ${kind} twice`);
    seen.add(kind);
    if (/\bOPEN\b/.test(text)) fails.push(`FAIL ${name} line ${k.n}: the word OPEN is left in`);
    if (kind in FIXED_LINES && text !== FIXED_LINES[kind]) {
      fails.push(`FAIL ${name} line ${k.n}: answered line ${kind} changed`);
    }
    textRules(`${name} line ${k.n}`, text, fails, false);
  }
  for (const kind of CHECKLIST_KINDS) {
    if (!seen.has(kind)) fails.push(`FAIL ${name}: before-every-take line missing: ${kind}`);
  }

  // clips
  const clips = new Map<string, number>();
  const sidesByTake = new Map<string, Set<string>>();
  if (scan.rows.length > MAX_CLIPS) fails.push(`FAIL ${name}: ${scan.rows.length} clips, at most ${MAX_CLIPS}`);
  for (const row of scan.rows) {
    const [clip, side, take, todo, sec, shown, hide] = row.cells;
    const at = `${name} ${clip}`;
    for (const c of row.cells) noBrackets(at, c, fails);
    if (!/^C-\d{2}$/.test(clip)) fails.push(`FAIL ${name} line ${row.n}: clip id ${clip} is not C-NN`);
    if (clips.has(clip)) fails.push(`FAIL ${at}: clip id twice`);
    if (side !== "seeker" && side !== "giver") fails.push(`FAIL ${at}: Side is not seeker or giver`);
    if (!/^T-\d+$/.test(take)) fails.push(`FAIL ${at}: Take is not T-N`);
    let secN = 0;
    if (/^\d+$/.test(sec) && Number(sec) >= 3 && Number(sec) <= 30) secN = Number(sec);
    else fails.push(`FAIL ${at}: Sec is not a whole number from 3 to 30`);
    clips.set(clip, secN);
    if (!sidesByTake.has(take)) sidesByTake.set(take, new Set());
    sidesByTake.get(take)?.add(side);
    textRules(`${at} What to do`, todo, fails, false);
    textRules(`${at} Hide`, hide, fails, false);

    if (!ID_LIST_RE.test(shown)) {
      fails.push(`FAIL ${at}: Facts shown is not a list of S, G or H ids`);
      continue;
    }
    const ids = shown.split(", ");
    shownBy.set(clip, ids);
    let care = false;
    for (const id of ids) {
      const f = facts.get(id);
      if (!f) fails.push(`FAIL ${at}: unknown fact id ${id}`);
      else if (f.on_screen === "never") fails.push(`FAIL ${at}: cites never row ${id}`);
      else if (f.on_screen === "care") care = true;
    }
    const hideHas = (w: string): boolean => new RegExp(`(?<![A-Za-z0-9])${w}(?![A-Za-z0-9])`, "i").test(hide);
    const listed = (w: string): string[] => ids.filter((id) => HIDE_WORDS[w].includes(id));
    const anyListed = Object.keys(HIDE_WORDS).flatMap(listed);
    if ((care || anyListed.length > 0) && !hideHas("blur")) {
      const why = ids.filter((id) => facts.get(id)?.on_screen === "care" || anyListed.includes(id));
      fails.push(`FAIL shot list ${clip}: shows ${why.join(", ")} and the Hide cell does not name the blur`);
    }
    for (const w of Object.keys(HIDE_WORDS)) {
      const hit = listed(w);
      if (hit.length > 0 && !hideHas(w)) {
        fails.push(`FAIL shot list ${clip}: shows ${hit.join(", ")} and the Hide cell does not name the ${w}`);
      }
    }
  }
  if (![...sidesByTake.values()].some((s) => s.has("seeker") && s.has("giver"))) {
    fails.push(`FAIL ${name}: no take holds clips of both sides`);
  }
  return clips;
}

// ---- entry ----

/** Check the GetSpace storyboards and shot list. [] is a pass; THROWS REFUSED on an untrusted snapshot. */
export function checkGetspaceStoryboards(opts?: GetspaceCheckOpts): string[] {
  const root = opts?.storyboardRoot ?? path.join(process.cwd(), "storyboards");
  const facts = loadSnapshot(opts?.snapshotPath ?? path.join(root, "getspace-facts.json"));
  const fails: string[] = [];

  const listing = fs.readdirSync(root);
  const known = new Set<string>([
    SHOT_LIST,
    LEVEL3_FILE,
    ...GETSPACE_STORYBOARD_SLUGS.map((s) => `${s}.md`),
    ...[...GETSPACE_STORYBOARD_SLUGS, LEVEL3_SLUG].map(aiListName),
  ]);
  for (const f of listing) {
    if (/^getspace-.*[.]md$/i.test(f) && !known.has(f)) fails.push(`FAIL ${f}: not a known GetSpace storyboard file name`);
  }

  let clips: Map<string, number> | null = null;
  const shownBy = new Map<string, string[]>();
  const used = new Set<string>();
  if (!listing.includes(SHOT_LIST)) {
    fails.push(`FAIL ${SHOT_LIST}: missing`);
  } else {
    clips = checkShotList(SHOT_LIST, fs.readFileSync(path.join(root, SHOT_LIST), "utf8"), facts, shownBy, fails);
  }

  const present = GETSPACE_STORYBOARD_SLUGS.map((s) => `${s}.md`).filter((f) => listing.includes(f));
  const level3 = listing.includes(LEVEL3_FILE);
  if (present.length === 0 && !level3) fails.push("FAIL storyboards: no GetSpace storyboard present");

  const seen = new Map<string, string>();
  for (const slug of [...GETSPACE_STORYBOARD_SLUGS, LEVEL3_SLUG]) {
    const f = `${slug}.md`;
    const aiName = aiListName(slug);
    const isL3 = slug === LEVEL3_SLUG;
    const hasBoard = listing.includes(f);
    const hasList = listing.includes(aiName);
    if (hasList && !hasBoard) fails.push(`FAIL ${aiName}: present with no ${f}`);
    const lists = hasList ? checkAiShots(aiName, slug, fs.readFileSync(path.join(root, aiName), "utf8"), facts, fails) : null;
    if (!hasBoard) continue;
    const ctx: Level3Ctx = { lists, usedIds: new Set(), aiName, screens: isL3 };
    const raw = fs.readFileSync(path.join(root, f), "utf8");
    const sentences = checkStoryboard(f, raw, facts, clips, shownBy, used, fails, ctx);
    for (const s of sentences) {
      const prev = seen.get(s);
      if (prev !== undefined) fails.push(`FAIL same sentence in ${prev} and ${f}: '${s}'`);
      else seen.set(s, f);
    }
    // level3 needs its list; the others need one only when a beat is ai
    if (!hasList && (isL3 || ctx.usedIds.size > 0)) fails.push(`FAIL ${aiName}: missing`);
    // an AI or screen id no beat uses is a FAIL
    if (lists) {
      for (const id of [...lists.ai.keys(), ...lists.screens.keys()]) {
        if (!ctx.usedIds.has(id)) fails.push(`FAIL ${aiName} ${id}: used by no beat`);
      }
    }
  }
  // with seek, give and helps present, a clip no beat uses is a FAIL (level3 uses count)
  if (clips && present.length === GETSPACE_STORYBOARD_SLUGS.length) {
    for (const clip of clips.keys()) {
      if (!used.has(clip)) fails.push(`FAIL ${SHOT_LIST} ${clip}: used by no storyboard`);
    }
  }
  return fails;
}
