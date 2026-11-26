/**
 * Row A52 — unit tests for the video:tryout tool. Made-up values only; the fake caller
 * records each URL/header it is handed and returns made-up bytes. NO REAL CALL and no paid
 * step: globalThis.fetch is replaced (before the module under test loads) with a counter
 * that throws, and an afterAll asserts the count stayed 0. The key reader is injected.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import type { CliResult, NetCall, RunwayCaller, RunwayDeps } from "../runway";

type RW = typeof import("../runway");
type VG = typeof import("../videogen");

// ── no-network fence, installed before the module under test is loaded ──────────────────

let fetchCount = 0;
const realFetch = globalThis.fetch;
(globalThis as { fetch: typeof fetch }).fetch = (() => {
  fetchCount++;
  throw new Error("network is disabled in runway tests");
}) as typeof fetch;

let rw: RW;
let vg: VG;

// the Keychain lookup is faked at the module level: the builtin's execFileSync
// property is non-configurable, so jest.mock replaces the module the adapter sees
const mockExecCalls: { file: string; args: string[] }[] = [];
let mockKeychainValue = "rw-chain-key-not-real\n"; // what ONE Keychain lookup returns
let mockKeychainThrows = false; // true → the lookup throws (a missing or locked entry)
jest.mock("child_process", () => {
  const actual = jest.requireActual("child_process") as Record<string, unknown>;
  return {
    ...actual,
    execFileSync: (file: string, args: readonly string[]): string => {
      mockExecCalls.push({ file, args: [...args] });
      if (mockKeychainThrows) throw new Error("the made-up Keychain lookup failed");
      return mockKeychainValue;
    },
  };
});

beforeAll(() => {
  jest.isolateModules(() => {
    rw = require("../runway");
    vg = require("../videogen");
  });
});
afterAll(() => {
  expect(fetchCount).toBe(0);
  (globalThis as { fetch: typeof fetch }).fetch = realFetch;
});

// ── made-up values and helpers ─────────────────────────────────────────────────────────

const KEY = "rw-planted-key-not-real";
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const DL_URL = "https://cdn.made-up-host.test/made-up-clip.mp4";
const NARRATION = 'A calm adult narrator says: "The giver is told the seeker is nearby as the arrival gets close."';

const REPO = path.resolve(__dirname, "..", "..");
const PLAN_FILE = path.join(REPO, "tools", "runway-tryout-plan.json");

interface PlanClip {
  id: string;
  shot: string;
  model: string;
  endpoint: string;
  seconds: number;
  ratio: string;
  audio: boolean;
  prompt: string;
}
interface PlanJson {
  plan_id: string;
  clips: PlanClip[];
  models: Record<string, { prompt_text_max: number; credits_per_second: Record<string, Record<string, number>> }>;
}
const PLAN = JSON.parse(fs.readFileSync(PLAN_FILE, "utf8")) as PlanJson;

/** The prompt of one clip of the try-out plan file, by clip id. */
function planPrompt(id: string): string {
  const c = PLAN.clips.find((x) => x.id === id);
  if (!c) throw new Error(`the plan holds no clip ${id}`);
  return c.prompt;
}

const sha = (b: Buffer): string => crypto.createHash("sha256").update(b).digest("hex");

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "a52-rw-test-"));
}

interface ArgsOpts {
  plan?: string;
  out?: string;
  ledger?: string;
  ceiling?: string;
  clip?: string;
  still?: string;
  timeout?: string;
  extra?: string[];
  drop?: string[];
}

interface Ctx {
  tmp: string;
  out: string;
  ledger: string;
  args: (o?: ArgsOpts) => string[];
}

function makeCtx(planFile = PLAN_FILE): Ctx {
  const tmp = mkTmp();
  const out = path.join(tmp, "out");
  fs.mkdirSync(out);
  const ledger = path.join(tmp, "ledger.jsonl");
  const args = (o: ArgsOpts = {}): string[] => {
    const full = [
      "--plan", o.plan ?? planFile,
      "--out", o.out ?? out,
      "--ledger", o.ledger ?? ledger,
      "--ceiling-usd", o.ceiling ?? "25",
    ];
    if (o.clip) full.push("--clip", o.clip);
    if (o.still) full.push("--still", o.still);
    if (o.timeout) full.push("--timeout-seconds", o.timeout);
    full.push(...(o.extra ?? []));
    const drop = new Set(o.drop ?? []);
    const res: string[] = [];
    for (let i = 0; i < full.length; i++) {
      if (drop.has(full[i])) {
        i++;
        continue;
      }
      res.push(full[i]);
    }
    return res;
  };
  return { tmp, out, ledger, args };
}

function writeStill(dir: string, name = "still.png", bytes = PNG_BYTES): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, bytes);
  return p;
}

function readBytes(p: string): Buffer | null {
  try {
    return fs.readFileSync(p);
  } catch {
    return null;
  }
}

function ledgerLines(p: string): Record<string, unknown>[] {
  const raw = readBytes(p);
  expect(raw).not.toBeNull();
  return raw!
    .toString("utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

function writeLedger(p: string, lines: Record<string, unknown>[]): void {
  fs.writeFileSync(p, `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
}

/** A temp copy of the committed plan with one mutation applied. */
function tempPlan(mut: (p: PlanJson) => void): string {
  const p = JSON.parse(fs.readFileSync(PLAN_FILE, "utf8")) as PlanJson;
  mut(p);
  const f = path.join(mkTmp(), "plan.json");
  fs.writeFileSync(f, JSON.stringify(p));
  return f;
}

class FakeCaller implements RunwayCaller {
  calls: NetCall[] = [];
  createCount = 0;
  statusCount = 0;
  downloadCount = 0;
  // the spec shape is {"credits": N}; typed unknown so the unreadable-shape tests can set others
  estimatedCost?: unknown; // goes in the create reply when set
  finalCost?: unknown; // goes in the terminal task reply when set
  statuses: unknown[] = []; // task-status replies, shifted; default an immediate SUCCEEDED
  createImpl: () => Promise<unknown> = async () => ({ id: "made-up-task-1", status: "PENDING", estimatedCost: this.estimatedCost });
  downloadBytes = Buffer.from("made-up-runway-mp4-bytes");

  async create(call: NetCall): Promise<unknown> {
    this.calls.push(call);
    this.createCount++;
    return this.createImpl();
  }
  async taskStatus(call: NetCall): Promise<unknown> {
    this.calls.push(call);
    this.statusCount++;
    if (this.statuses.length > 0) return this.statuses.shift();
    return { id: "made-up-task-1", status: "SUCCEEDED", output: [DL_URL], cost: this.finalCost };
  }
  async download(call: NetCall): Promise<Buffer> {
    this.calls.push(call);
    this.downloadCount++;
    return this.downloadBytes;
  }
}

/** Run with injected fakes; if the module itself throws, its text must hold no key. */
async function run(argv: string[], fake: FakeCaller, keyReader: () => string = () => KEY): Promise<CliResult> {
  const deps: RunwayDeps = { caller: fake, keyReader, pollIntervalMs: 1 };
  try {
    return await rw.runRunwayTryout(argv, deps);
  } catch (e) {
    expect(e instanceof Error ? e.message : String(e)).not.toContain(KEY);
    throw e;
  }
}

async function expectRefusal(r: CliResult, code: string, fake: FakeCaller, ledgerPath: string): Promise<void> {
  expect(r.code).toBe(2);
  const line = r.err.trim();
  expect(line.split("\n").length).toBe(1); // one line
  expect(line.split(/\s+/)[0]).toBe(code); // code first
  expect(fake.calls.length).toBe(0); // no network step
  expect(readBytes(ledgerPath)).toEqual(null); // ledger untouched
}

// a try-out attempt line for the retry count (service runway, same plan id and clip id)
const runwayAttempt = (planId: string, clipId: string, cost: number): Record<string, unknown> => ({
  kind: "attempt",
  service: "runway",
  cost_usd: cost,
  sent: { plan_id: planId, clip_id: clipId },
});

// ── (1) the dry run ────────────────────────────────────────────────────────────────────

describe("t1 dry run", () => {
  it("no key, exit 0, a total line holding usd=9.360 and 9 clip lines; nothing read, sent or written", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const keyReader = jest.fn(() => {
      throw new Error("no key anywhere");
    });
    const r = await run(ctx.args(), fake, keyReader);
    expect(r.code).toBe(0);
    expect(r.err).toBe("");
    expect(r.out).toContain("usd=9.360");
    const clipLines = r.out.split("\n").filter((l) => l.startsWith("runway: clip id="));
    expect(clipLines.length).toBe(9);
    expect(keyReader).not.toHaveBeenCalled(); // the dry run reads no key
    expect(fake.calls.length).toBe(0); // and calls nothing
    expect(readBytes(ctx.ledger)).toBeNull(); // writes nothing
    expect(fs.readdirSync(ctx.out).length).toBe(0);
    expect(fs.existsSync(`${ctx.ledger}.lock`)).toBe(false);
    // the PR body quotes this committed-plan dry run (no key, no network)
  });

  it("with --clip prints only that one clip, with its own estimate and room-after", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic" }), fake);
    expect(r.code).toBe(0);
    const clipLines = r.out.split("\n").filter((l) => l.startsWith("runway: clip id="));
    expect(clipLines.length).toBe(1);
    expect(clipLines[0]).toContain("id=ai-1-kling3-pic");
    expect(r.out).toContain("estimate-usd=0.540");
    expect(r.out).toContain("usd=0.540");
    expect(r.out).toContain("room-after usd=24.460");
    expect(fake.calls.length).toBe(0);
  });

  it("a --still in the dry run puts the still sha256 on the image_to_video clip lines only", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ still }), fake);
    expect(r.code).toBe(0);
    const lines = r.out.split("\n").filter((l) => l.startsWith("runway: clip id="));
    expect(lines.length).toBe(9);
    for (const l of lines) {
      if (l.includes("endpoint=image_to_video")) expect(l).toContain(`still-sha256=${sha(PNG_BYTES)}`);
      else expect(l).not.toContain("still-sha256=");
    }
  });
});

// ── (2) the cap ────────────────────────────────────────────────────────────────────────

describe("t2 cap", () => {
  it("spent 15.65 plus the plan total 9.36 is above 25: over-ceiling, exit 2, record unchanged, caller not called", async () => {
    const ctx = makeCtx();
    writeLedger(ctx.ledger, [runwayAttempt(PLAN.plan_id, "some-clip", 15.65)]);
    const before = readBytes(ctx.ledger);
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("over-ceiling");
    expect(r.err).toContain("ai-video");
    expect(fake.calls.length).toBe(0);
    expect(readBytes(ctx.ledger)).toEqual(before);
  });

  it("the clip estimate counts for --clip: spent 24.47 plus 0.54 is above 25, refused", async () => {
    const ctx = makeCtx();
    writeLedger(ctx.ledger, [{ kind: "attempt", service: "gemini-omni", cost_usd: 24.47 }]);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("over-ceiling");
    expect(fake.calls.length).toBe(0);
  });

  it("equal passes: spent 15.64 plus 9.36 is exactly 25, exit 0", async () => {
    const ctx = makeCtx();
    writeLedger(ctx.ledger, [{ kind: "attempt", service: "gemini-omni", cost_usd: 15.64 }]);
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    expect(r.code).toBe(0);
    expect(r.out).toContain("usd=9.360");
  });

  it("--ceiling-usd 25.01 and 26 refuse usage; the ceiling is required", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    for (const c of ["25.01", "26", "0", "-1", "1e9", "NaN"]) {
      const r = await run(ctx.args({ ceiling: c }), fake);
      expect([c, r.code]).toEqual([c, 2]);
      expect([c, r.err.trim().split(/\s+/)[0]]).toEqual([c, "usage"]);
    }
    const r2 = await run(ctx.args({ drop: ["--ceiling-usd"] }), fake);
    expect(r2.code).toBe(2);
    expect(r2.err.trim().split(/\s+/)[0]).toBe("usage");
    expect(fake.calls.length).toBe(0);
  });

  it("--live without --clip refuses usage (at most one generation call per run)", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const r = await run(ctx.args({ extra: ["--live"] }), fake);
    await expectRefusal(r, "usage", fake, ctx.ledger);
  });
});

// ── (3) one cap for both tools ──────────────────────────────────────────────────────────

describe("t3 cap group", () => {
  it("a runway attempt and outcome line count in the video:gen ai-video total; paid media stays apart", () => {
    const ctx = makeCtx();
    writeLedger(ctx.ledger, [
      runwayAttempt(PLAN.plan_id, "ai-1-kling3-pic", 0.54),
      { kind: "outcome", service: "runway", cost_usd: 0.06 },
      { kind: "attempt", service: "gemini-omni", cost_usd: 0.42 },
      { service: "elevenlabs", cost_usd: 5 },
    ]);
    expect(vg.readLedgerTotal(ctx.ledger, "ai-video")).toBe(1_020_000); // 0.54 + 0.06 + 0.42
    expect(vg.readLedgerTotal(ctx.ledger, "paid-media")).toBe(5_000_000);
  });

  it("a runway line in the record eats the try-out's own room (dry run spend line)", async () => {
    const ctx = makeCtx();
    writeLedger(ctx.ledger, [
      runwayAttempt(PLAN.plan_id, "ai-1-kling3-pic", 0.54),
      { kind: "outcome", service: "runway", cost_usd: 0.06 },
    ]);
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    expect(r.code).toBe(0);
    expect(r.out).toContain("spent usd=0.600 ceiling=25 room usd=24.400 room-after usd=15.040");
  });

  it("an unknown service in the record still refuses ledger-unreadable, dry run and live", async () => {
    const ctx = makeCtx();
    fs.writeFileSync(ctx.ledger, '{"cost_usd":0.1,"service":"not-a-known-service"}\n');
    const before = readBytes(ctx.ledger);
    let thrown = "none thrown";
    try {
      vg.readLedgerTotal(ctx.ledger, "ai-video");
    } catch (e) {
      thrown = e instanceof vg.Refusal ? e.code : `other: ${String(e)}`;
    }
    expect(thrown).toBe("ledger-unreadable");
    for (const extra of [[], ["--live", "--clip", "ai-1-kling3-pic"]] as string[][]) {
      const fake = new FakeCaller();
      const r = await run(ctx.args({ extra }), fake);
      expect(r.code).toBe(2);
      expect(r.err.trim().split(/\s+/)[0]).toBe("ledger-unreadable");
      expect(fake.calls.length).toBe(0);
    }
    expect(readBytes(ctx.ledger)).toEqual(before);
  });
});

// ── (4) the key reaches no output, no file and no download host ─────────────────────────

describe("t4 key containment", () => {
  it("a good run: the key is in the Authorization header of the API calls only, never the download", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    fake.statuses = [
      { id: "made-up-task-1", status: "RUNNING" },
      { id: "made-up-task-1", status: "SUCCEEDED", output: [DL_URL], cost: { credits: 54 } },
    ];
    const r = await run(ctx.args({ clip: "ai-4-kling3-pic", still, extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    expect(fake.calls.length).toBe(4); // create, two status polls, one download
    for (const c of fake.calls.slice(0, 3)) {
      expect(c.url.startsWith("https://api.dev.runwayml.com/")).toBe(true);
      expect(c.headers.Authorization).toBe(`Bearer ${KEY}`);
    }
    const dl = fake.calls[3];
    expect(dl.url).toBe(DL_URL);
    expect(Object.keys(dl.headers).some((k) => k.toLowerCase() === "authorization")).toBe(false);
    expect(JSON.stringify(dl)).not.toContain(KEY);
    for (const c of fake.calls) expect(c.url).not.toContain(KEY); // the key rides in no URL
    expect(r.out + r.err).not.toContain(KEY);
    expect(readBytes(ctx.ledger)?.toString("utf8")).not.toContain(KEY);
    for (const f of fs.readdirSync(ctx.out)) {
      expect(fs.readFileSync(path.join(ctx.out, f)).toString("utf8")).not.toContain(KEY);
    }
  });

  it("a failure text that echoes the key is scrubbed from the record and stderr", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    fake.statuses = [{ id: "made-up-task-1", status: "FAILED", failure: `made-up failure echoing ${KEY} in full` }];
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
    expect(r.code).toBe(1);
    expect(r.err).not.toContain(KEY);
    expect(r.err).toContain("[redacted]");
    const text = readBytes(ctx.ledger)?.toString("utf8") ?? "";
    expect(text).not.toContain(KEY);
    expect(text).toContain("[redacted]");
  });

  it("a failure text of 190 characters then the key: the 200-character cut leaks no piece of the key", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    fake.statuses = [{ id: "made-up-task-1", status: "FAILED", failure: `${"x".repeat(190)}${KEY}` }];
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
    expect(r.code).toBe(1);
    const ledgerText = readBytes(ctx.ledger)?.toString("utf8") ?? "";
    expect(r.err).toContain("[redacted]");
    expect(ledgerText).toContain("[redacted]");
    // the key starts before character 200 and ends after it: no 6-character piece of it may
    // survive in stdout, stderr, the record or any file in --out (a cut before the scrub
    // would leave the first 10 characters of the key in all of them)
    const printed = [r.out, r.err, ledgerText];
    for (const f of fs.readdirSync(ctx.out)) {
      printed.push(fs.readFileSync(path.join(ctx.out, f), "utf8"));
    }
    for (let i = 0; i + 6 <= KEY.length; i++) {
      const piece = KEY.slice(i, i + 6);
      for (const h of printed) expect([piece, h]).toEqual([piece, expect.not.stringContaining(piece)]);
    }
  });

  it("a throwing create call that echoes the key is scrubbed too", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    fake.createImpl = async () => {
      throw new Error(`made-up create failure with ${KEY} inside`);
    };
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
    expect(r.code).toBe(1);
    expect(r.out + r.err).not.toContain(KEY);
    expect(readBytes(ctx.ledger)?.toString("utf8")).not.toContain(KEY);
    expect(fs.readdirSync(ctx.out).length).toBe(0);
  });
});

// ── (5) the spend lines ────────────────────────────────────────────────────────────────

describe("t5 spend lines", () => {
  it("one attempt line BEFORE the call — kept when the call throws — and one outcome line after", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    let seenAtCall: string | null = null;
    fake.createImpl = async () => {
      seenAtCall = readBytes(ctx.ledger)?.toString("utf8") ?? null; // read at call time
      throw new Error("made-up create failure");
    };
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
    expect(r.code).toBe(1);
    expect(seenAtCall).not.toBeNull();
    expect(String(seenAtCall).endsWith("\n")).toBe(true);
    const atCall = JSON.parse(String(seenAtCall).trim()) as Record<string, unknown>;
    expect(atCall.kind).toBe("attempt");
    expect(atCall.cost_usd).toBe(0.54);

    const lines = ledgerLines(ctx.ledger);
    expect(lines.length).toBe(2);
    const att = lines[0];
    expect(att.kind).toBe("attempt");
    expect(att.service).toBe("runway");
    expect(typeof att.attempt_id).toBe("string");
    expect(new Date(String(att.time)).toString()).not.toBe("Invalid Date");
    expect(att.sent).toEqual({
      plan_id: PLAN.plan_id,
      clip_id: "ai-1-kling3-pic",
      shot: "AI-1",
      model: "kling3.0_standard",
      endpoint: "text_to_video",
      seconds: 6,
      ratio: "720:1280",
      audio: false,
      prompt_sha256: sha(Buffer.from(planPrompt("ai-1-kling3-pic"), "utf8")),
      image_sha256: null,
    });
    expect(att.cost_usd).toBe(0.54);
    expect(att.cost_how).toMatchObject({ rate_usd_per_s: 0.09, credits_per_s: 9, price_read: "2026-11-22" });
    expect(att.status).toBe("attempted");
    const out = lines[1];
    expect(out.kind).toBe("outcome");
    expect(out.attempt_id).toBe(att.attempt_id);
    expect(out.service).toBe("runway");
    expect(out.status).toBe("error");
    expect(out.task_id).toBeNull();
    expect(out.file).toBeNull();
    expect(String(out.failure)).toContain("made-up create failure");
    expect(fs.existsSync(`${ctx.ledger}.lock`)).toBe(false); // the lock is released before the call
  });

  it("a good run writes the file name and sha256, task id and both cost fields in the outcome", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    fake.estimatedCost = { credits: 54 };
    fake.finalCost = { credits: 54 };
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    const saved = fs.readdirSync(ctx.out);
    expect(saved.length).toBe(1);
    expect(saved[0]).toMatch(/^clip-ai-1-kling3-pic-[0-9a-f-]{36}\.mp4$/);
    expect(sha(fs.readFileSync(path.join(ctx.out, saved[0])))).toBe(sha(fake.downloadBytes));
    const lines = ledgerLines(ctx.ledger);
    expect(lines.length).toBe(2);
    const out = lines[1];
    expect(out.status).toBe("ok");
    expect(out.task_id).toBe("made-up-task-1");
    expect(out.estimated_cost_credits).toBe(54);
    expect(out.final_cost_credits).toBe(54);
    expect(out.file).toBe(saved[0]);
    expect(out.file_sha256).toBe(sha(fake.downloadBytes));
    expect(out.failure).toBeNull();
  });

  it("the attempt line with the still sha256 for an image_to_video clip", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ clip: "ai-4-veo-pic", still, extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    const att = ledgerLines(ctx.ledger)[0];
    expect(att.sent).toMatchObject({
      clip_id: "ai-4-veo-pic",
      shot: "AI-4",
      model: "veo3.1_fast",
      endpoint: "image_to_video",
      image_sha256: sha(PNG_BYTES),
    });
    expect(att.cost_usd).toBe(0.6);
  });
});

// ── (6) the retry limit ────────────────────────────────────────────────────────────────

describe("t6 retry limit", () => {
  it("a third attempt for a clip id refuses retry-limit, record unchanged, caller not called", async () => {
    const ctx = makeCtx();
    writeLedger(ctx.ledger, [
      runwayAttempt(PLAN.plan_id, "ai-1-kling3-pic", 0.54),
      { kind: "outcome", service: "runway", cost_usd: 0 },
      runwayAttempt(PLAN.plan_id, "ai-1-kling3-pic", 0.54),
      { kind: "outcome", service: "runway", cost_usd: 0 },
    ]);
    const before = readBytes(ctx.ledger);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("retry-limit");
    expect(fake.calls.length).toBe(0);
    expect(readBytes(ctx.ledger)).toEqual(before);
  });

  it("the second attempt (one retry) is allowed: one create call", async () => {
    const ctx = makeCtx();
    writeLedger(ctx.ledger, [runwayAttempt(PLAN.plan_id, "ai-1-kling3-pic", 0.54), { kind: "outcome", service: "runway", cost_usd: 0 }]);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    expect(fake.createCount).toBe(1);
    expect(ledgerLines(ctx.ledger).length).toBe(4);
  });

  it("attempt lines of another plan id or clip id do not count", async () => {
    const ctx = makeCtx();
    writeLedger(ctx.ledger, [
      runwayAttempt("another-plan", "ai-1-kling3-pic", 0.54),
      runwayAttempt(PLAN.plan_id, "ai-4-kling3-pic", 0.54),
      { kind: "outcome", service: "runway", cost_usd: 0 },
      { kind: "outcome", service: "runway", cost_usd: 0 },
    ]);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    expect(fake.createCount).toBe(1);
  });
});

// ── (7) the plan check ─────────────────────────────────────────────────────────────────

describe("t7 plan check", () => {
  it("the prompt of each of the 9 plan clips is pinned by clip id (sha256); the voice prompt ends with the narration sentence", () => {
    const AI1 = "da2ede5f73dab035d3ca0c45e04416dfbc5f6d4b36a0c58adc23199ab83903dc";
    const AI4 = "fb427a065ae777b904aff31b1c8d7cc1948243f2c4133388189fb37835334f96";
    const AI4_VOICE = "5f239472c4f5ae9a860250ece6fac4ca7b20f49de7a82a4a8151040507718c04"; // the AI-4 text, one space, NARRATION
    const PINNED: Record<string, string> = {
      "ai-1-kling3-pic": AI1,
      "ai-1-seedance-pic": AI1,
      "ai-1-veo-pic": AI1,
      "ai-4-kling3-pic": AI4,
      "ai-4-seedance-pic": AI4,
      "ai-4-veo-pic": AI4,
      "ai-4-kling3-voice": AI4_VOICE,
      "ai-4-seedance-voice": AI4_VOICE,
      "ai-4-veo-voice": AI4_VOICE,
    };
    expect(PLAN.clips.map((c) => c.id).sort()).toEqual(Object.keys(PINNED).sort());
    for (const c of PLAN.clips) {
      expect([c.id, sha(Buffer.from(c.prompt, "utf8"))]).toEqual([c.id, PINNED[c.id]]);
    }
    for (const c of PLAN.clips.filter((x) => x.audio)) {
      expect([c.id, c.prompt.endsWith(` ${NARRATION}`)]).toEqual([c.id, true]);
    }
  });

  it("shape: 9 clips, all 6 s at ratio 720:1280, audio an explicit boolean (6 false, 3 true), endpoints per shot", () => {
    expect(PLAN.clips.length).toBe(9);
    expect(PLAN.clips.filter((c) => !c.audio).length).toBe(6);
    expect(PLAN.clips.filter((c) => c.audio).length).toBe(3);
    for (const c of PLAN.clips) {
      expect([c.id, c.seconds]).toEqual([c.id, 6]);
      expect([c.id, c.ratio]).toEqual([c.id, "720:1280"]);
      expect([c.id, typeof c.audio]).toEqual([c.id, "boolean"]);
      if (c.shot === "AI-1") expect([c.id, c.endpoint]).toEqual([c.id, "text_to_video"]);
      else expect([c.id, c.endpoint]).toEqual([c.id, "image_to_video"]);
    }
    // each of the three models appears once per picture shot and once for voice
    for (const m of Object.keys(PLAN.models)) {
      expect(PLAN.clips.filter((c) => c.model === m).length).toBe(3);
    }
  });

  it("the veo3.1_fast prompts stay under its 1000 UTF-16 code unit limit", () => {
    for (const c of PLAN.clips.filter((x) => x.model === "veo3.1_fast")) {
      expect([c.id, c.prompt.length]).toEqual([c.id, expect.any(Number)]);
      expect(c.prompt.length).toBeLessThanOrEqual(1000);
    }
  });

  it("an unknown model refuses, exit 2", async () => {
    const plan = tempPlan((p) => {
      p.clips[0].model = "made-up-model";
    });
    const ctx = makeCtx(plan);
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("plan-invalid");
    expect(r.err).toContain("made-up-model");
    expect(fake.calls.length).toBe(0);
  });

  it("a prompt of 1001 characters on veo3.1_fast refuses prompt-too-long", async () => {
    const plan = tempPlan((p) => {
      const c = p.clips.find((x) => x.id === "ai-1-veo-pic") as PlanClip;
      c.prompt = "a".repeat(1001);
    });
    const ctx = makeCtx(plan);
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    await expectRefusal(r, "prompt-too-long", fake, ctx.ledger);
  });

  it("a still whose data URI is over 5000000 characters refuses input-too-big before any key read", async () => {
    const ctx = makeCtx();
    const big = Buffer.concat([PNG_BYTES, Buffer.alloc(4_000_000)]); // base64 URI > 5 M chars
    expect(big.length).toBeGreaterThan(PNG_BYTES.length);
    const still = writeStill(ctx.tmp, "big.png", big);
    const fake = new FakeCaller();
    const keyReader = jest.fn(() => KEY);
    const r = await run(ctx.args({ still }), fake, keyReader);
    await expectRefusal(r, "input-too-big", fake, ctx.ledger);
    expect(keyReader).not.toHaveBeenCalled();
  });

  it("a still that is not PNG or JPEG refuses input-too-big", async () => {
    const ctx = makeCtx();
    const notImage = path.join(ctx.tmp, "not-image.png");
    fs.writeFileSync(notImage, "just plain text, not an image");
    const fake = new FakeCaller();
    const r = await run(ctx.args({ still: notImage }), fake);
    await expectRefusal(r, "input-too-big", fake, ctx.ledger);
  });

  it("a clip whose (model, ratio, audio) has no price entry refuses price-unknown (fail closed, dry run too)", async () => {
    const plan = tempPlan((p) => {
      delete p.models["veo3.1_fast"].credits_per_second["720:1280"].true;
    });
    const ctx = makeCtx(plan);
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    await expectRefusal(r, "price-unknown", fake, ctx.ledger);
  });

  it("the committed plan's estimates: pictures 5.88, voice 3.48, total 9.36", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    expect(r.code).toBe(0);
    for (const [id, usd] of [
      ["ai-1-kling3-pic", "estimate-usd=0.540"],
      ["ai-1-seedance-pic", "estimate-usd=1.800"],
      ["ai-1-veo-pic", "estimate-usd=0.600"],
      ["ai-4-kling3-pic", "estimate-usd=0.540"],
      ["ai-4-seedance-pic", "estimate-usd=1.800"],
      ["ai-4-veo-pic", "estimate-usd=0.600"],
      ["ai-4-kling3-voice", "estimate-usd=0.780"],
      ["ai-4-seedance-voice", "estimate-usd=1.800"],
      ["ai-4-veo-voice", "estimate-usd=0.900"],
    ] as [string, string][]) {
      const line = r.out.split("\n").find((l) => l.includes(`id=${id}`));
      expect([id, line]).toEqual([id, expect.stringContaining(usd)]);
    }
  });
});

// ── (8) the request body per endpoint ──────────────────────────────────────────────────

describe("t8 request body", () => {
  it("AI-1: POST text_to_video with model, promptText, ratio, duration and audio false; the version header", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    const call = fake.calls[0];
    expect(call.method).toBe("POST");
    expect(call.url).toBe("https://api.dev.runwayml.com/v1/text_to_video");
    expect(call.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(call.headers["X-Runway-Version"]).toBe("2024-11-06");
    expect(call.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(call.body as string)).toEqual({
      model: "kling3.0_standard",
      promptText: planPrompt("ai-1-kling3-pic"),
      ratio: "720:1280",
      duration: 6,
      audio: false,
    });
  });

  it("AI-4: POST image_to_video with promptImage as a data URI of the still", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ clip: "ai-4-veo-pic", still, extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    const call = fake.calls[0];
    expect(call.url).toBe("https://api.dev.runwayml.com/v1/image_to_video");
    const body = JSON.parse(call.body as string) as Record<string, unknown>;
    expect(body.model).toBe("veo3.1_fast");
    expect(body.promptText).toBe(planPrompt("ai-4-veo-pic"));
    expect(body.promptImage).toBe(`data:image/png;base64,${PNG_BYTES.toString("base64")}`);
    expect(body.audio).toBe(false);
  });

  it("every live body holds the key audio equal to the boolean of the plan (false on the 6 picture clips)", async () => {
    let falseCount = 0;
    for (const c of PLAN.clips) {
      if (!c.audio) falseCount++;
      const ctx = makeCtx();
      const fake = new FakeCaller();
      const o: ArgsOpts = { clip: c.id, extra: ["--live"] };
      if (c.endpoint === "image_to_video") o.still = writeStill(ctx.tmp);
      const r = await run(ctx.args(o), fake);
      expect([c.id, r.code]).toEqual([c.id, 0]);
      const body = JSON.parse(fake.calls[0].body as string) as Record<string, unknown>;
      expect([c.id, body.audio]).toEqual([c.id, c.audio]);
      expect(body).toHaveProperty("audio"); // explicit on every call, never left to the API default
    }
    expect(falseCount).toBe(6);
  });

  it("polling: PENDING then RUNNING and THROTTLED keep polling, then GET /v1/tasks/{id} and one download", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    fake.statuses = [
      { id: "made-up-task-1", status: "RUNNING", progress: 10 },
      { id: "made-up-task-1", status: "THROTTLED" },
      { id: "made-up-task-1", status: "SUCCEEDED", output: [DL_URL], cost: { credits: 54 } },
    ];
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    expect(fake.statusCount).toBe(3);
    expect(fake.downloadCount).toBe(1);
    expect(fake.calls.slice(1).map((c) => [c.method, c.url])).toEqual([
      ["GET", "https://api.dev.runwayml.com/v1/tasks/made-up-task-1"],
      ["GET", "https://api.dev.runwayml.com/v1/tasks/made-up-task-1"],
      ["GET", "https://api.dev.runwayml.com/v1/tasks/made-up-task-1"],
      ["GET", DL_URL],
    ]);
  });

  it("a FAILED task is a failed outcome with the failure text; a CANCELLED task is cancelled", async () => {
    for (const [status, expected] of [["FAILED", "failed"], ["CANCELLED", "cancelled"]] as [string, string][]) {
      const ctx = makeCtx();
      const fake = new FakeCaller();
      fake.statuses = [{ id: "made-up-task-1", status, failure: `made-up ${status} detail` }];
      const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
      expect([status, r.code]).toEqual([status, 1]);
      expect(fake.downloadCount).toBe(0);
      const out = ledgerLines(ctx.ledger)[1];
      expect([status, out.status]).toEqual([status, expected]);
      expect(String(out.failure)).toContain(`made-up ${status} detail`);
      expect(fs.readdirSync(ctx.out).length).toBe(0);
    }
  });

  it("a task that never lands refuses to outlive the timeout: outcome timeout, exit 1", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    fake.statuses = Array.from({ length: 1000 }, () => ({ id: "made-up-task-1", status: "RUNNING" }));
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", timeout: "1", extra: ["--live"] }), fake);
    expect(r.code).toBe(1);
    expect(ledgerLines(ctx.ledger)[1].status).toBe("timeout");
    expect(fake.downloadCount).toBe(0);
  });
});

// ── (9) the cost rule ──────────────────────────────────────────────────────────────────

describe("t9 cost", () => {
  it("a terminal cost above the plan estimate: the outcome cost_usd is the difference and the total grows by it", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    fake.estimatedCost = { credits: 60 };
    fake.finalCost = { credits: 66 }; // kling3.0_standard 6 s without audio is 54 credits in the plan
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    const lines = ledgerLines(ctx.ledger);
    expect(lines[0].cost_usd).toBe(0.54);
    expect(lines[1].cost_usd).toBe(0.12); // (66 - 54) x USD 0.01
    expect(lines[1].final_cost_credits).toBe(66);
    expect(vg.readLedgerTotal(ctx.ledger, "ai-video")).toBe(660_000); // grew by 0.66, not 0.54
  });

  it("no terminal cost, an estimatedCost above the estimate: C is the estimate of the create reply", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    fake.estimatedCost = { credits: 60 };
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    const lines = ledgerLines(ctx.ledger);
    expect(lines[1].cost_usd).toBe(0.06); // (60 - 54) x USD 0.01
    expect(lines[1].estimated_cost_credits).toBe(60);
    expect(lines[1].final_cost_credits).toBeNull();
    expect(vg.readLedgerTotal(ctx.ledger, "ai-video")).toBe(600_000);
  });

  it("a cost lower than the estimate gives 0 (never negative)", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    fake.finalCost = { credits: 50 };
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    const lines = ledgerLines(ctx.ledger);
    expect(lines[1].cost_usd).toBe(0);
    expect(vg.readLedgerTotal(ctx.ledger, "ai-video")).toBe(540_000);
  });

  it("(a) a refunded task: a terminal cost of 0 credits is a read value, not a fall-through to the estimate", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    fake.estimatedCost = { credits: 60 };
    fake.finalCost = { credits: 0 };
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    const outcome = ledgerLines(ctx.ledger)[1];
    expect(outcome.estimated_cost_credits).toBe(60);
    expect(outcome.final_cost_credits).toBe(0);
    expect(outcome.cost_usd).toBe(0);
    expect(vg.readLedgerTotal(ctx.ledger, "ai-video")).toBe(540_000);
  });

  it("(b) a FAILED terminal reply with a cost above the estimate: the cost is read and the delta is recorded", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    fake.statuses = [{ id: "made-up-task-1", status: "FAILED", failure: "made-up failure", cost: { credits: 70 } }];
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
    expect(r.code).toBe(1);
    const outcome = ledgerLines(ctx.ledger)[1];
    expect(outcome.status).toBe("failed");
    expect(outcome.final_cost_credits).toBe(70);
    expect(outcome.cost_usd).toBe(0.16); // (70 - 54) x USD 0.01
    expect(vg.readLedgerTotal(ctx.ledger, "ai-video")).toBe(700_000);
  });

  // (c) values that are not the spec shape. NaN and Infinity cannot come out of a JSON reply;
  // only the fake can hand them in.
  const unreadable: [string, unknown][] = [
    ["a bare number 60", 60],
    ['{"credits": "60"}', { credits: "60" }],
    ["{}", {}],
    ['[ {"credits": 60} ]', [{ credits: 60 }]],
    ['{"credits": -1}', { credits: -1 }],
    ['{"credits": NaN}', { credits: NaN }],
    ['{"credits": Infinity}', { credits: Infinity }],
    ["null", null],
  ];
  for (const [label, value] of unreadable) {
    it(`(c) estimatedCost ${label} gives null, and with no terminal cost C is 0`, async () => {
      const ctx = makeCtx();
      const fake = new FakeCaller();
      fake.estimatedCost = value;
      const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
      expect(r.code).toBe(0);
      const outcome = ledgerLines(ctx.ledger)[1];
      expect(outcome.estimated_cost_credits).toBeNull();
      expect(outcome.final_cost_credits).toBeNull();
      expect(outcome.cost_usd).toBe(0);
      expect(vg.readLedgerTotal(ctx.ledger, "ai-video")).toBe(540_000);
    });

    it(`(c) cost ${label} gives null, and C falls through to the create estimate`, async () => {
      const ctx = makeCtx();
      const fake = new FakeCaller();
      fake.estimatedCost = { credits: 60 };
      fake.finalCost = value;
      const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
      expect(r.code).toBe(0);
      const outcome = ledgerLines(ctx.ledger)[1];
      expect(outcome.estimated_cost_credits).toBe(60);
      expect(outcome.final_cost_credits).toBeNull();
      expect(outcome.cost_usd).toBe(0.06); // (60 - 54) x USD 0.01
      expect(vg.readLedgerTotal(ctx.ledger, "ai-video")).toBe(600_000);
    });
  }
});

// ── (10) key-missing (live only; the dry run never reads a key) ─────────────────────────

describe("t10 key-missing", () => {
  const readers: [string, () => string][] = [
    ["a throwing reader", () => {
      throw new Error("no key found");
    }],
    ["an empty key", () => ""],
    ["a blank key", () => "  "],
  ];
  for (const [label, reader] of readers) {
    it(`refuses with key-missing for ${label}, record unchanged, caller not called`, async () => {
      const ctx = makeCtx();
      const fake = new FakeCaller();
      const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake, reader);
      expect(r.code).toBe(2);
      expect(r.err.trim().split(/\s+/)[0]).toBe("key-missing");
      expect(fake.calls.length).toBe(0);
      expect(readBytes(ctx.ledger)).toBeNull();
      expect(fs.readdirSync(ctx.out).length).toBe(0);
    });
  }
});

// ── (11) the key reader itself: env first, else ONE Keychain lookup ─────────────────────

describe("t11 key reader", () => {
  const ENV = "RUNWAYML_API_SECRET";
  const CHAIN_KEY = "rw-chain-key-not-real";
  let savedValue: string | undefined;
  let wasSet: boolean;

  beforeEach(() => {
    savedValue = process.env[ENV];
    wasSet = Object.prototype.hasOwnProperty.call(process.env, ENV);
    mockExecCalls.length = 0;
    mockKeychainValue = `${CHAIN_KEY}\n`;
    mockKeychainThrows = false;
  });
  afterEach(() => {
    if (wasSet) process.env[ENV] = savedValue;
    else delete process.env[ENV];
    mockExecCalls.length = 0;
    mockKeychainValue = `${CHAIN_KEY}\n`;
    mockKeychainThrows = false;
  });

  it("(a) env set: its value is returned trimmed and the Keychain is never asked", () => {
    process.env[ENV] = "  rw-env-key-not-real  ";
    expect(rw.readRunwayKey()).toBe("rw-env-key-not-real");
    expect(mockExecCalls.length).toBe(0);
  });

  it('(b) env set to "  " or "" counts as absent: ONE Keychain lookup, its value trimmed', () => {
    for (const blank of ["  ", ""]) {
      process.env[ENV] = blank;
      mockExecCalls.length = 0;
      expect(rw.readRunwayKey()).toBe(CHAIN_KEY); // the mock returns it with a trailing newline
      expect(mockExecCalls).toEqual([
        { file: "security", args: ["find-generic-password", "-s", ENV, "-w"] },
      ]);
    }
  });

  it("(c) a Keychain call that throws, or returns only whitespace: an error that holds no key value", () => {
    delete process.env[ENV];
    const texts: string[] = [];
    mockKeychainThrows = true;
    try {
      rw.readRunwayKey();
    } catch (e) {
      texts.push(e instanceof Error ? e.message : String(e));
    }
    mockKeychainThrows = false;
    mockKeychainValue = "   \n\t";
    try {
      rw.readRunwayKey();
    } catch (e) {
      texts.push(e instanceof Error ? e.message : String(e));
    }
    expect(texts.length).toBe(2); // both cases throw
    for (const t of texts) {
      expect(t).not.toBe("");
      expect(t).not.toContain(CHAIN_KEY);
      expect(t).not.toContain("rw-env-key-not-real");
    }
  });
});

// ── (12) round 3: the re-checks under the lock, the lock itself, plan values, unknown
// statuses, stills and folders ───────────────────────────────────────────────────────────

describe("t12 round 3", () => {
  /** A key reader that first appends one line to the record plays the other run that wrote
   *  between the first checks in buildRun and the lock taken in liveRun (ISSUE-020). */
  function racingKeyReader(ledger: string, line: Record<string, unknown>): { reader: () => string; after: () => Buffer | null } {
    let after: Buffer | null = null;
    return {
      reader: () => {
        fs.appendFileSync(ledger, `${JSON.stringify(line)}\n`);
        after = readBytes(ledger); // the bytes right after the racing append
        return KEY;
      },
      after: () => after,
    };
  }

  it("1 the cap re-check under the lock: a spend landing between the first check and the lock refuses over-ceiling", async () => {
    const ctx = makeCtx();
    writeLedger(ctx.ledger, [{ kind: "attempt", service: "gemini-omni", cost_usd: 24 }]); // 24 + 0.54 passes the first check
    const race = racingKeyReader(ctx.ledger, { kind: "attempt", service: "gemini-omni", cost_usd: 0.5 });
    const fake = new FakeCaller();
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake, race.reader);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("over-ceiling");
    expect(r.err).toContain("24.500"); // the re-read total saw the racing 0.5, not the 24 of the first check
    expect(fake.calls.length).toBe(0); // no create call
    expect(race.after()).not.toBeNull();
    expect(readBytes(ctx.ledger)).toEqual(race.after()); // no runway attempt line on top of the racing append
    expect(fs.existsSync(`${ctx.ledger}.lock`)).toBe(false); // the lock is released, not left behind
  });

  it("2 the retry re-count under the lock: a second attempt line landing before the lock refuses retry-limit", async () => {
    const ctx = makeCtx();
    writeLedger(ctx.ledger, [
      runwayAttempt(PLAN.plan_id, "ai-1-kling3-pic", 0.54), // count 1 at the first check in buildRun
      { kind: "outcome", service: "runway", cost_usd: 0 },
    ]);
    const race = racingKeyReader(ctx.ledger, runwayAttempt(PLAN.plan_id, "ai-1-kling3-pic", 0.54)); // count 2 under the lock
    const fake = new FakeCaller();
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake, race.reader);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("retry-limit");
    expect(fake.calls.length).toBe(0); // no create call
    expect(race.after()).not.toBeNull();
    expect(readBytes(ctx.ledger)).toEqual(race.after()); // no third attempt line
    expect(fs.existsSync(`${ctx.ledger}.lock`)).toBe(false);
  });

  it("3 an existing <record>.lock refuses ledger-busy: no call, no record written, the lock is neither stolen nor removed", async () => {
    const ctx = makeCtx();
    fs.writeFileSync(`${ctx.ledger}.lock`, ""); // another run holds the lock
    const fake = new FakeCaller();
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("ledger-busy");
    expect(fake.calls.length).toBe(0);
    expect(readBytes(ctx.ledger)).toBeNull(); // nothing is written while the lock is held
    expect(readBytes(`${ctx.ledger}.lock`)).toEqual(Buffer.alloc(0)); // still there, untouched
  });

  it("4a an unknown ratio refuses plan-invalid (not price-unknown)", async () => {
    const plan = tempPlan((p) => {
      p.clips[0].ratio = "999:999";
    });
    const ctx = makeCtx(plan);
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("plan-invalid");
    expect(r.err).toContain("999:999");
    expect(fake.calls.length).toBe(0);
  });

  it("4b an unknown duration refuses plan-invalid", async () => {
    const plan = tempPlan((p) => {
      p.clips[0].seconds = 7;
    });
    const ctx = makeCtx(plan);
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("plan-invalid");
    expect(fake.calls.length).toBe(0);
  });

  it("4c an audio value that is not a boolean refuses plan-invalid (not price-unknown)", async () => {
    const plan = tempPlan((p) => {
      (p.clips[0] as unknown as { audio: string }).audio = "yes";
    });
    const ctx = makeCtx(plan);
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("plan-invalid");
    expect(fake.calls.length).toBe(0);
  });

  it("4d an audio-true clip on a model with audio_flag false refuses plan-invalid", async () => {
    const plan = tempPlan((p) => {
      (p.models["veo3.1_fast"] as unknown as { audio_flag: boolean }).audio_flag = false;
    });
    const ctx = makeCtx(plan);
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("plan-invalid");
    expect(r.err).toContain("audio flag");
    expect(fake.calls.length).toBe(0);
  });

  it("5a an unknown status and a reply with no status keep polling until a terminal reply lands", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    fake.statuses = [
      { status: "MADE_UP_STATUS" },
      {},
      { status: "SUCCEEDED", output: [DL_URL], cost: { credits: 54 } },
    ];
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    expect(fake.statusCount).toBe(3); // two non-terminal replies, then the terminal one
    expect(fake.downloadCount).toBe(1); // an unknown status never turns into a download by itself
    expect(ledgerLines(ctx.ledger)[1].status).toBe("ok");
  });

  it("5b a status that never becomes terminal ends as outcome timeout, exit 1, no download, no file", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    fake.statuses = Array.from({ length: 1000 }, () => ({ status: "MADE_UP_STATUS" }));
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", timeout: "1", extra: ["--live"] }), fake);
    expect(r.code).toBe(1);
    expect(ledgerLines(ctx.ledger)[1].status).toBe("timeout"); // never ok, never cancelled
    expect(fake.downloadCount).toBe(0);
    expect(fs.readdirSync(ctx.out).length).toBe(0);
  });

  it("6a --live on an image_to_video clip with no --still refuses usage before an attempt line exists", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const r = await run(ctx.args({ clip: "ai-4-veo-pic", extra: ["--live"] }), fake);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("usage");
    expect(fake.calls.length).toBe(0);
    expect(readBytes(ctx.ledger)).toBeNull(); // no attempt line: nothing counted against the cap or the 2 attempts
  });

  it("6b --still on a text_to_video clip refuses usage", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", still }), fake);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("usage");
    expect(fake.calls.length).toBe(0);
    expect(readBytes(ctx.ledger)).toBeNull();
  });

  it("6c a too-big still on a --live run refuses input-too-big BEFORE any key read", async () => {
    const ctx = makeCtx();
    const big = Buffer.concat([PNG_BYTES, Buffer.alloc(4_000_000)]); // base64 data URI over 5 M chars
    const still = writeStill(ctx.tmp, "big.png", big);
    const fake = new FakeCaller();
    const keyReader = jest.fn(() => KEY);
    const r = await run(ctx.args({ clip: "ai-4-veo-pic", still, extra: ["--live"] }), fake, keyReader);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("input-too-big");
    expect(keyReader).not.toHaveBeenCalled(); // checked in buildRun, before liveRun reads the key
    expect(fake.calls.length).toBe(0);
    expect(readBytes(ctx.ledger)).toBeNull();
  });

  it("7a --out inside the repo tree but outside its out/ folder refuses out-bad", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const r = await run(ctx.args({ out: path.join(REPO, "adapters") }), fake);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("out-bad");
    expect(fake.calls.length).toBe(0);
  });

  it("7b a --ledger folder inside the repo tree but outside its out/ folder refuses out-bad and creates nothing there", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const ledgerInside = path.join(REPO, "adapters", "made-up-ledger-a52.jsonl");
    const r = await run(ctx.args({ ledger: ledgerInside }), fake);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("out-bad");
    expect(fs.existsSync(ledgerInside)).toBe(false);
    expect(fs.existsSync(`${ledgerInside}.lock`)).toBe(false);
  });

  it("7c --out as a symlink refuses out-bad", async () => {
    const ctx = makeCtx();
    const link = path.join(ctx.tmp, "out-link");
    fs.symlinkSync(ctx.out, link);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ out: link }), fake);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("out-bad");
    expect(fake.calls.length).toBe(0);
  });
});

// ── (13) round 4: the cost after a failed step, and download redirects ──────────────────

describe("t13 round 4", () => {
  const API = "https://api.dev.runwayml.com/v1";

  // a small fetch stub of our own: records each request, restores the no-network fence after
  interface Seen {
    url: string;
    headers: Record<string, string>;
    method: string;
    redirect?: string;
  }

  function res(status: number, o: { json?: unknown; bytes?: Buffer; location?: string } = {}): Response {
    const b = o.bytes ?? Buffer.alloc(0);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (n: string) => (n.toLowerCase() === "location" ? o.location ?? null : null) },
      json: async () => o.json,
      arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    } as unknown as Response;
  }

  async function withStubFetch(impl: (url: string) => Response, seen: Seen[], fn: () => Promise<void>): Promise<void> {
    const fence = globalThis.fetch;
    (globalThis as { fetch: typeof fetch }).fetch = (async (url: string, init?: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      seen.push({ url: String(url), headers, method: String(init?.method ?? "GET"), redirect: init?.redirect });
      return impl(String(url));
    }) as unknown as typeof fetch;
    try {
      await fn();
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = fence;
    }
  }

  /** A live run through the REAL caller (no caller in deps), with globalThis.fetch stubbed. */
  async function runReal(seen: Seen[], impl: (url: string) => Response, argv: string[]): Promise<CliResult> {
    let r: CliResult | undefined;
    await withStubFetch(impl, seen, async () => {
      r = await rw.runRunwayTryout(argv, { keyReader: () => KEY, pollIntervalMs: 1 });
    });
    return r as CliResult;
  }

  it("C1 a download that fails after SUCCEEDED keeps the terminal cost in the outcome", async () => {
    const rows: [string, Error, string][] = [
      ["a plain Error", new Error("made-up download failure"), "error"],
      ["an HttpError", new vg.HttpError(503), "http-503"],
      ["a CallTimeout", new vg.CallTimeout("download"), "timeout"],
    ];
    for (const [label, err, expected] of rows) {
      const ctx = makeCtx();
      const fake = new FakeCaller();
      fake.estimatedCost = { credits: 60 };
      fake.finalCost = { credits: 80 };
      fake.download = async () => {
        throw err;
      };
      const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
      expect([label, r.code]).toEqual([label, 1]);
      const outcome = ledgerLines(ctx.ledger)[1];
      expect([label, outcome.status]).toEqual([label, expected]);
      expect([label, outcome.final_cost_credits]).toEqual([label, 80]);
      expect([label, outcome.estimated_cost_credits]).toEqual([label, 60]);
      expect([label, outcome.cost_usd]).toEqual([label, 0.26]); // (80 - 54) x USD 0.01
      expect([label, vg.readLedgerTotal(ctx.ledger, "ai-video")]).toEqual([label, 800_000]);
      expect(outcome.file).toBeNull();
      expect(fs.readdirSync(ctx.out).length).toBe(0);
    }
  });

  it("C2 a SUCCEEDED reply with no output url keeps the terminal cost too", async () => {
    for (const statusReply of [
      { id: "made-up-task-1", status: "SUCCEEDED", output: [], cost: { credits: 80 } },
      { id: "made-up-task-1", status: "SUCCEEDED", cost: { credits: 80 } },
    ]) {
      const ctx = makeCtx();
      const fake = new FakeCaller();
      fake.estimatedCost = { credits: 60 };
      fake.statuses = [statusReply];
      const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
      expect(r.code).toBe(1);
      const outcome = ledgerLines(ctx.ledger)[1];
      expect(outcome.status).toBe("error");
      expect(String(outcome.failure)).toContain("no output url");
      expect(fake.downloadCount).toBe(0);
      expect(outcome.final_cost_credits).toBe(80);
      expect(outcome.cost_usd).toBe(0.26);
      expect(vg.readLedgerTotal(ctx.ledger, "ai-video")).toBe(800_000);
    }
  });

  it("C3 no terminal reply: the final cost stays null and C is the create estimate", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    fake.estimatedCost = { credits: 60 };
    fake.taskStatus = async () => {
      throw new Error("made-up status failure");
    };
    const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake);
    expect(r.code).toBe(1);
    const outcome = ledgerLines(ctx.ledger)[1];
    expect(outcome.status).toBe("error");
    expect(outcome.final_cost_credits).toBeNull();
    expect(outcome.cost_usd).toBe(0.06); // (60 - 54) x USD 0.01
    expect(vg.readLedgerTotal(ctx.ledger, "ai-video")).toBe(600_000);
  });

  it("R1 a download redirect is followed, and no hop carries the key header", async () => {
    const ctx = makeCtx();
    const bytes = Buffer.from("made-up-runway-bytes-r1");
    const hop1 = "https://cdn-a.made-up-host.test/made-up-clip.mp4";
    const hop2 = "https://cdn-b.made-up-host.test/hop2.mp4";
    const hop3 = "https://cdn-b.made-up-host.test/final/hop3.mp4"; // the relative Location resolves here
    const seen: Seen[] = [];
    const r = await runReal(
      seen,
      (u) => {
        if (u === `${API}/text_to_video`) return res(200, { json: { id: "made-up-task-r1", estimatedCost: { credits: 54 } } });
        if (u === `${API}/tasks/made-up-task-r1`) return res(200, { json: { status: "SUCCEEDED", output: [hop1], cost: { credits: 54 } } });
        if (u === hop1) return res(302, { location: hop2 });
        if (u === hop2) return res(307, { location: "/final/hop3.mp4" });
        if (u === hop3) return res(200, { bytes });
        return res(500, { json: { unexpected: u } });
      },
      ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }),
    );
    expect(r.code).toBe(0);
    expect(seen.map((s) => s.url)).toEqual([`${API}/text_to_video`, `${API}/tasks/made-up-task-r1`, hop1, hop2, hop3]);
    expect(seen[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(seen[1].headers.Authorization).toBe(`Bearer ${KEY}`);
    for (const s of seen.slice(2)) {
      expect(Object.keys(s.headers).some((k) => k.toLowerCase() === "authorization")).toBe(false);
      expect(JSON.stringify(s)).not.toContain(KEY);
    }
    for (const s of seen) expect(s.redirect).toBe("manual");
    for (const s of seen.slice(2)) expect(s.method).toBe("GET");
    const files = fs.readdirSync(ctx.out);
    expect(files.length).toBe(1);
    expect(sha(fs.readFileSync(path.join(ctx.out, files[0])))).toBe(sha(bytes));
    const outcome = ledgerLines(ctx.ledger)[1];
    expect(outcome.status).toBe("ok");
    expect(outcome.file_sha256).toBe(sha(bytes));
    const printed = `${r.out}${r.err}${readBytes(ctx.ledger)?.toString("utf8") ?? ""}`;
    expect(printed).not.toContain(KEY);
    expect(fetchCount).toBe(0); // the fence itself was never called
  });

  it("R2 the hop limit: 5 redirects followed, then the 3xx is the result", async () => {
    const ctx = makeCtx();
    const seen: Seen[] = [];
    let downloadRequests = 0;
    const r = await runReal(
      seen,
      (u) => {
        if (u === `${API}/text_to_video`) return res(200, { json: { id: "made-up-task-r2", estimatedCost: { credits: 54 } } });
        if (u === `${API}/tasks/made-up-task-r2`)
          return res(200, { json: { status: "SUCCEEDED", output: ["https://cdn-r2.made-up-host.test/hop0.mp4"], cost: { credits: 54 } } });
        downloadRequests++;
        if (downloadRequests <= 10) return res(302, { location: `https://cdn-r2.made-up-host.test/hop${downloadRequests}.mp4` });
        return res(200, { bytes: Buffer.from("made-up-r2-bytes") });
      },
      ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }),
    );
    expect(r.code).toBe(1);
    expect(ledgerLines(ctx.ledger)[1].status).toBe("http-302");
    expect(downloadRequests).toBe(6); // the limit (5) plus the first request
    expect(fs.readdirSync(ctx.out).length).toBe(0);
  });

  it("R3 a Location that is not https, or no Location at all, is not followed", async () => {
    for (const location of ["http://plain-r3.made-up-host.test/x.mp4", undefined] as (string | undefined)[]) {
      const ctx = makeCtx();
      const seen: Seen[] = [];
      let downloadRequests = 0;
      const r = await runReal(
        seen,
        (u) => {
          if (u === `${API}/text_to_video`) return res(200, { json: { id: "made-up-task-r3", estimatedCost: { credits: 54 } } });
          if (u === `${API}/tasks/made-up-task-r3`)
            return res(200, { json: { status: "SUCCEEDED", output: ["https://cdn-r3.made-up-host.test/clip.mp4"], cost: { credits: 54 } } });
          downloadRequests++;
          if (u === "http://plain-r3.made-up-host.test/x.mp4") return res(200, { bytes: Buffer.from("made-up-r3-http-bytes") });
          return res(302, location !== undefined ? { location } : {});
        },
        ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }),
      );
      expect([String(location), r.code]).toEqual([String(location), 1]);
      expect(ledgerLines(ctx.ledger)[1].status).toBe("http-302");
      expect(seen.every((s) => !s.url.startsWith("http:"))).toBe(true);
      expect(downloadRequests).toBe(1);
      expect(fs.readdirSync(ctx.out).length).toBe(0);
    }
  });

  it("R4 a redirect on a keyed call is refused: one request, the Location gets none", async () => {
    // (a) the status call (a GET with the key header)
    {
      const ctx = makeCtx();
      const seen: Seen[] = [];
      const r = await runReal(
        seen,
        (u) => {
          if (u === `${API}/text_to_video`) return res(200, { json: { id: "made-up-task-r4a", estimatedCost: { credits: 54 } } });
          if (u === `${API}/tasks/made-up-task-r4a`) return res(302, { location: "https://elsewhere-r4a.made-up-host.test/task" });
          if (u === "https://elsewhere-r4a.made-up-host.test/task")
            return res(200, { json: { status: "SUCCEEDED", output: ["https://cdn-r4a.made-up-host.test/x.mp4"], cost: { credits: 54 } } });
          return res(500, { json: { unexpected: u } });
        },
        ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }),
      );
      expect(r.code).toBe(1);
      const outcome = ledgerLines(ctx.ledger)[1];
      expect(outcome.status).toBe("http-302");
      expect(seen.map((s) => s.url)).toEqual([`${API}/text_to_video`, `${API}/tasks/made-up-task-r4a`]);
      expect(outcome.final_cost_credits).toBeNull();
      expect(fs.readdirSync(ctx.out).length).toBe(0);
    }
    // (b) the create call (a POST)
    {
      const ctx = makeCtx();
      const seen: Seen[] = [];
      const r = await runReal(
        seen,
        (u) => {
          if (u === `${API}/text_to_video`) return res(307, { location: "https://elsewhere-r4b.made-up-host.test/create" });
          return res(500, { json: { unexpected: u } });
        },
        ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }),
      );
      expect(r.code).toBe(1);
      expect(ledgerLines(ctx.ledger)[1].status).toBe("http-307");
      expect(seen.length).toBe(1);
    }
  });

  it("R5 the key header stays on the API host: send() strips Authorization for other hosts", async () => {
    const seen: Seen[] = [];
    const bytes = Buffer.from("made-up-r5-bytes");
    let dl: Buffer | undefined;
    await withStubFetch(
      (u) => {
        if (u === "https://cdn-r5.made-up-host.test/a.mp4") return res(302, { location: "https://other-r5.made-up-host.test/b.mp4" });
        return res(200, { bytes });
      },
      seen,
      async () => {
        dl = await rw.realRunwayCaller().download({
          url: "https://cdn-r5.made-up-host.test/a.mp4",
          method: "GET",
          headers: { Authorization: `Bearer ${KEY}` },
          timeoutMs: 1000,
        });
        await rw.realRunwayCaller().taskStatus({
          url: `${API}/tasks/made-up-task-r5`,
          method: "GET",
          headers: { Authorization: `Bearer ${KEY}` },
          timeoutMs: 1000,
        });
      },
    );
    expect(dl?.toString("utf8")).toBe(bytes.toString("utf8"));
    expect(seen.length).toBe(3); // two download hops, one status call
    for (const s of seen.slice(0, 2)) {
      expect(Object.keys(s.headers).some((k) => k.toLowerCase() === "authorization")).toBe(false);
      expect(JSON.stringify(s)).not.toContain(KEY);
    }
    expect(seen[2].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(fetchCount).toBe(0);
  });

  // ── (14) round 5: a plan price at or below 0, and the key-header host rule ─────────────

  describe("t14 round 5", () => {
    const badPrices = [0, -9, 0.00001];

    /** A temp plan whose kling3.0_standard no-audio price is the given number. */
    const pricedPlan = (price: number): string =>
      tempPlan((p) => {
        p.models["kling3.0_standard"].credits_per_second["720:1280"]["false"] = price;
      });

    it("P1 a plan price of 0, -9 or 0.00001 credits/s refuses the dry run with price-unknown", async () => {
      for (const price of badPrices) {
        const ctx = makeCtx(pricedPlan(price));
        const fake = new FakeCaller();
        const r = await run(ctx.args(), fake);
        await expectRefusal(r, "price-unknown", fake, ctx.ledger);
      }
    });

    it("P2 the same prices with --clip ai-1-kling3-pic --live refuse before the key read", async () => {
      for (const price of badPrices) {
        const ctx = makeCtx(pricedPlan(price));
        const fake = new FakeCaller();
        const keyReader = jest.fn(() => KEY);
        const r = await run(ctx.args({ clip: "ai-1-kling3-pic", extra: ["--live"] }), fake, keyReader);
        await expectRefusal(r, "price-unknown", fake, ctx.ledger);
        expect(keyReader).not.toHaveBeenCalled(); // loadPlan refuses before the key read
        expect(readBytes(`${ctx.ledger}.lock`)).toEqual(null); // no lock file either
      }
    });

    it("H1 a download keeps no key header on a host that is not the exact API host", async () => {
      const rows = [
        "https://cdn.runwayml.com/a.mp4",
        "https://evil-runwayml.com/a.mp4",
        "https://api.dev.runwayml.com.made-up-host.test/a.mp4",
        "https://api.dev.runwayml.com:8443/a.mp4",
      ];
      const bytes = Buffer.from("made-up-t14-h1-bytes");
      for (const url of rows) {
        const seen: Seen[] = [];
        let got: Buffer | undefined;
        await withStubFetch(() => res(200, { bytes }), seen, async () => {
          got = await rw.realRunwayCaller().download({
            url,
            method: "GET",
            headers: { Authorization: `Bearer ${KEY}` },
            timeoutMs: 1000,
          });
        });
        expect([url, got?.toString("utf8")]).toEqual([url, bytes.toString("utf8")]);
        expect([url, seen.length]).toEqual([url, 1]); // a 200 reply: one request, no hop
        expect([url, Object.keys(seen[0].headers).some((k) => k.toLowerCase() === "authorization")]).toEqual([url, false]);
        expect(JSON.stringify(seen[0])).not.toContain(KEY);
        expect(fetchCount).toBe(0); // the no-network fence itself stayed uncalled
      }
    });
  });
});

// ── second plan (A52b): Seedance 2.5, Kling 4.0 and the Veo prompt control ──────────────

const PLAN_B_FILE = path.join(REPO, "tools", "runway-tryout-plan-b.json");
const PLAN_B = JSON.parse(fs.readFileSync(PLAN_B_FILE, "utf8")) as PlanJson;
const SENTENCE = "The giver is told the seeker is nearby as the arrival gets close.";
const KLING4_IDS = ["ai-1-kling4-pic", "ai-4-kling4-pic", "ai-4-kling4-voice"];
const SEED25_IDS = ["ai-1-seedance25-pic", "ai-4-seedance25-pic", "ai-4-seedance25-voice"];
const PLAN_B_IDS = [...SEED25_IDS, ...KLING4_IDS, "ai-4-veo-newprompt-pic"];

function tempPlanB(mut: (p: PlanJson) => void): string {
  const p = JSON.parse(fs.readFileSync(PLAN_B_FILE, "utf8")) as PlanJson;
  mut(p);
  const f = path.join(mkTmp(), "plan-b.json");
  fs.writeFileSync(f, JSON.stringify(p));
  return f;
}

/** A live run of one plan-b clip; returns the create body. */
async function liveBody(id: string): Promise<{ body: Record<string, unknown>; r: CliResult; ctx: Ctx }> {
  const ctx = makeCtx(PLAN_B_FILE);
  const fake = new FakeCaller();
  const c = PLAN_B.clips.find((x) => x.id === id) as PlanClip;
  const o: ArgsOpts = { clip: id, extra: ["--live"] };
  if (c.endpoint === "image_to_video") o.still = writeStill(ctx.tmp);
  const r = await run(ctx.args(o), fake);
  expect([id, r.code]).toEqual([id, 0]);
  return { body: JSON.parse(fake.calls[0].body as string) as Record<string, unknown>, r, ctx };
}

describe("t15 kling_4 audio rule", () => {
  it("the body of each kling_4 clip holds exactly model, promptText, ratio, duration (and promptImage): no audio key", async () => {
    for (const id of KLING4_IDS) {
      const { body } = await liveBody(id);
      const c = PLAN_B.clips.find((x) => x.id === id) as PlanClip;
      const keys = ["model", "promptText", "ratio", "duration", ...(c.endpoint === "image_to_video" ? ["promptImage"] : [])];
      expect([id, Object.keys(body).sort()]).toEqual([id, keys.sort()]);
      if (c.endpoint === "image_to_video") {
        expect([id, body.ratio]).toEqual([id, "auto_720p"]);
        expect(body.promptImage).toBe(`data:image/png;base64,${PNG_BYTES.toString("base64")}`);
      }
    }
  });

  it("a kling_4 clip with audio true is allowed, and so is audio false; the clip line and attempt line keep the plan audio", async () => {
    const ctx = makeCtx(PLAN_B_FILE);
    const r = await run(ctx.args(), new FakeCaller());
    expect(r.code).toBe(0);
    const voice = r.out.split("\n").find((l) => l.includes("id=ai-4-kling4-voice")) as string;
    const pic = r.out.split("\n").find((l) => l.includes("id=ai-4-kling4-pic")) as string;
    expect(voice).toContain("audio=true");
    expect(pic).toContain("audio=false");
    const { ctx: c2 } = await liveBody("ai-4-kling4-voice");
    expect((ledgerLines(c2.ledger)[0].sent as Record<string, unknown>).audio).toBe(true);
  });

  it("the audio key of seedance2_5 and the veo clip equals the plan boolean", async () => {
    for (const id of [...SEED25_IDS, "ai-4-veo-newprompt-pic"]) {
      const { body } = await liveBody(id);
      const c = PLAN_B.clips.find((x) => x.id === id) as PlanClip;
      expect([id, body.audio]).toEqual([id, c.audio]);
    }
  });

  it("a model with audio_flag true AND audio_always true refuses plan-invalid, dry run too", async () => {
    const plan = tempPlanB((p) => {
      (p.models.kling_4 as unknown as { audio_flag: boolean }).audio_flag = true;
    });
    const ctx = makeCtx(plan);
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    await expectRefusal(r, "plan-invalid", fake, ctx.ledger);
  });

  it("an audio_always value that is not a boolean refuses plan-invalid", async () => {
    const plan = tempPlanB((p) => {
      (p.models.kling_4 as unknown as { audio_always: string }).audio_always = "yes";
    });
    const ctx = makeCtx(plan);
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    await expectRefusal(r, "plan-invalid", fake, ctx.ledger);
    expect(r.err).toContain("audio_always must be true or false");
  });
});

describe("t16 price lookup", () => {
  it("clip lines: kling_4 0.950 at rate 0.157, seedance2_5 1.800, veo 0.600", async () => {
    const ctx = makeCtx(PLAN_B_FILE);
    const r = await run(ctx.args(), new FakeCaller());
    for (const id of KLING4_IDS) {
      const line = r.out.split("\n").find((l) => l.includes(`id=${id} `)) as string;
      expect([id, line]).toEqual([id, expect.stringContaining("rate-usd-per-s=0.157 estimate-usd=0.950")]);
    }
    for (const id of SEED25_IDS) {
      const line = r.out.split("\n").find((l) => l.includes(`id=${id} `)) as string;
      expect([id, line]).toEqual([id, expect.stringContaining("estimate-usd=1.800")]);
    }
    const veo = r.out.split("\n").find((l) => l.includes("id=ai-4-veo-newprompt-pic ")) as string;
    expect(veo).toContain("estimate-usd=0.600");
  });

  it("a 5 s kling_4 clip is 79 credits (ceil of 78.5), USD 0.790", async () => {
    const plan = tempPlanB((p) => {
      (p.models.kling_4 as unknown as { durations: number[] }).durations = [5, 6];
      (p.clips.find((x) => x.id === "ai-1-kling4-pic") as PlanClip).seconds = 5;
    });
    const ctx = makeCtx(plan);
    const r = await run(ctx.args({ clip: "ai-1-kling4-pic" }), new FakeCaller());
    expect(r.code).toBe(0);
    expect(r.out).toContain("estimate-usd=0.790");
  });

  it("a kling_4 clip whose ratio has no price entry refuses price-unknown", async () => {
    const plan = tempPlanB((p) => {
      delete p.models.kling_4.credits_per_second["auto_720p"];
    });
    const ctx = makeCtx(plan);
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    await expectRefusal(r, "price-unknown", fake, ctx.ledger);
  });

  it("attempt basis: seedance2_5 keeps today's text, kling_4 names the round-up", async () => {
    const s = await liveBody("ai-1-seedance25-pic");
    expect((ledgerLines(s.ctx.ledger)[0].cost_how as Record<string, unknown>).basis).toBe(
      "list credits per second x seconds x USD 0.01 per credit",
    );
    const k = await liveBody("ai-1-kling4-pic");
    const att = ledgerLines(k.ctx.ledger)[0];
    expect(String((att.cost_how as Record<string, unknown>).basis)).toContain("rounded up to whole credits");
    expect(att.cost_usd).toBe(0.95);
  });
});

describe("t17 plan check of plan-b", () => {
  const plan = (id: string): PlanClip => PLAN_B.clips.find((x) => x.id === id) as PlanClip;

  it("shape: 7 clips with the 7 ids, 6 s, plan id, endpoints, audio booleans, ratios", () => {
    expect(PLAN_B.plan_id).toBe("a52b-runway-tryout-2026-11-22");
    expect(PLAN_B.clips.map((c) => c.id)).toEqual(PLAN_B_IDS);
    for (const c of PLAN_B.clips) {
      expect([c.id, c.seconds]).toEqual([c.id, 6]);
      expect([c.id, c.endpoint]).toEqual([c.id, c.shot === "AI-1" ? "text_to_video" : "image_to_video"]);
      expect([c.id, c.audio]).toEqual([c.id, c.id.endsWith("-voice")]);
      const kling4Image = c.model === "kling_4" && c.endpoint === "image_to_video";
      expect([c.id, c.ratio]).toEqual([c.id, kling4Image ? "auto_720p" : "720:1280"]);
    }
    expect(PLAN.clips.length).toBe(9); // the first plan file is untouched
  });

  it("prompt shape: 7 distinct per-model prompts, voice prompts hold the sentence, Veo control unchanged; limits hold", () => {
    const ai1 = PLAN_B.clips.filter((c) => c.shot === "AI-1");
    const pic = PLAN_B.clips.filter((c) => c.shot === "AI-4" && !c.audio);
    const voice = PLAN_B.clips.filter((c) => c.audio);
    expect([ai1.length, pic.length, voice.length]).toEqual([2, 3, 2]);
    expect(new Set(PLAN_B.clips.map((c) => c.prompt)).size).toBe(7);
    for (const v of voice) expect([v.id, v.prompt.includes(SENTENCE)]).toEqual([v.id, true]);
    for (const c of PLAN_B.clips.filter((x) => !x.audio)) {
      expect([c.id, c.prompt.includes(SENTENCE)]).toEqual([c.id, false]);
    }
    for (const c of PLAN_B.clips) {
      expect([c.id, c.prompt.length <= PLAN_B.models[c.model].prompt_text_max]).toEqual([c.id, true]);
    }
    const veo = plan("ai-4-veo-newprompt-pic").prompt;
    expect(veo.length).toBeLessThanOrEqual(1000);
    expect(crypto.createHash("sha256").update(veo).digest("hex")).toBe(
      "fe689df49373ed9a14a5582a7a29f4faa8fed3323f0d5dee38014b93b6f9ee9b",
    );
  });

  it("the dry run prints 7 clip lines with the 7 prompt sha256 values of the per-model prompts", async () => {
    const ctx = makeCtx(PLAN_B_FILE);
    const r = await run(ctx.args(), new FakeCaller());
    const lines = r.out.split("\n").filter((l) => l.startsWith("runway: clip id="));
    expect(lines.length).toBe(7);
    const shaOf = (id: string): string => (lines.find((l) => l.includes(`id=${id} `)) as string).match(/prompt-sha256=([0-9a-f]{64})/)![1];
    const expected: Record<string, string> = {
      "ai-1-seedance25-pic": "7a32cbc2e127c77949d4508fbbb4c5e3a2999bf5878800279892e1cd8481585d",
      "ai-4-seedance25-pic": "75553244a17ae34d19ab55b85768a8feae271014b694812c025779e7f0c59c38",
      "ai-4-seedance25-voice": "bc3890a8c53d97588d4aeb8ef05158c4f1be484398dbf3749e90167491a4b55f",
      "ai-1-kling4-pic": "99e04a5f68c09d183593cb415db68417c2876020b38bda299b0088bfa21936b0",
      "ai-4-kling4-pic": "04f068973d32962a6bca1ce56db96df6f77f5b57f119b07a3e8b15669db0852c",
      "ai-4-kling4-voice": "20f5ae138adb3adf0df482104d34715426d5bb03837c08dbb9c34e146d1df9e5",
      "ai-4-veo-newprompt-pic": "fe689df49373ed9a14a5582a7a29f4faa8fed3323f0d5dee38014b93b6f9ee9b",
    };
    for (const [id, sha] of Object.entries(expected)) expect([id, shaOf(id)]).toEqual([id, sha]);
  });

  it("a kling_4 image_to_video clip with ratio 720:1280 refuses plan-invalid, also in the dry run", async () => {
    const p = tempPlanB((x) => {
      (x.clips.find((c) => c.id === "ai-4-kling4-pic") as PlanClip).ratio = "720:1280";
    });
    const ctx = makeCtx(p);
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    await expectRefusal(r, "plan-invalid", fake, ctx.ledger);
  });

  it("a kling_4 clip on an endpoint with no ratio list refuses plan-invalid (no fall back to the model list)", async () => {
    const p = tempPlanB((x) => {
      delete (x.models.kling_4 as unknown as { ratios_by_endpoint: Record<string, string[]> }).ratios_by_endpoint.text_to_video;
    });
    const ctx = makeCtx(p);
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    await expectRefusal(r, "plan-invalid", fake, ctx.ledger);
  });

  it("a round_up_credits value that is not a boolean refuses plan-invalid with its own text", async () => {
    const p = tempPlanB((x) => {
      (x.models.kling_4 as unknown as { round_up_credits: string }).round_up_credits = "yes";
    });
    const ctx = makeCtx(p);
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    await expectRefusal(r, "plan-invalid", fake, ctx.ledger);
    expect(r.err).toContain("round_up_credits must be true or false");
  });

  it("a ratios_by_endpoint entry that is an empty list refuses plan-invalid with its own text", async () => {
    const p = tempPlanB((x) => {
      (x.models.kling_4 as unknown as { ratios_by_endpoint: Record<string, string[]> }).ratios_by_endpoint.text_to_video = [];
    });
    const ctx = makeCtx(p);
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    await expectRefusal(r, "plan-invalid", fake, ctx.ledger);
    expect(r.err).toContain("is not a list");
  });

  it("a seedance2_5 clip of 3 s refuses plan-invalid; 15001 code units refuse prompt-too-long", async () => {
    const p1 = tempPlanB((x) => {
      (x.clips.find((c) => c.id === "ai-1-seedance25-pic") as PlanClip).seconds = 3;
    });
    const c1 = makeCtx(p1);
    const f1 = new FakeCaller();
    await expectRefusal(await run(c1.args(), f1), "plan-invalid", f1, c1.ledger);
    const p2 = tempPlanB((x) => {
      (x.clips.find((c) => c.id === "ai-1-seedance25-pic") as PlanClip).prompt = "a".repeat(15001);
    });
    const c2 = makeCtx(p2);
    const f2 = new FakeCaller();
    await expectRefusal(await run(c2.args(), f2), "prompt-too-long", f2, c2.ledger);
  });

  it("the first plan file still loads with its 9 clip lines and usd=9.360", async () => {
    const ctx = makeCtx(PLAN_FILE);
    const r = await run(ctx.args(), new FakeCaller());
    expect(r.out.split("\n").filter((l) => l.startsWith("runway: clip id=")).length).toBe(9);
    expect(r.out).toContain("usd=9.360");
  });
});

describe("t18 plan-b dry run total and cap", () => {
  it("total clips=7 usd=8.850; record 15.52 gives the spend line with room-after 0.630, exit 0", async () => {
    const ctx = makeCtx(PLAN_B_FILE);
    writeLedger(ctx.ledger, [
      { kind: "attempt", service: "gemini-omni", cost_usd: 6.16 },
      { kind: "attempt", service: "runway", cost_usd: 9.36 },
    ]);
    const r = await run(ctx.args(), new FakeCaller());
    expect(r.code).toBe(0);
    expect(r.out).toContain("runway: total clips=7 usd=8.850");
    expect(r.out).toContain("spent usd=15.520 ceiling=25 room usd=9.480 room-after usd=0.630");
  });

  it("record 16.16 refuses over-ceiling with no clip line and the record unchanged; 16.15 passes", async () => {
    const ctx = makeCtx(PLAN_B_FILE);
    writeLedger(ctx.ledger, [{ kind: "attempt", service: "gemini-omni", cost_usd: 16.16 }]);
    const before = readBytes(ctx.ledger);
    const r = await run(ctx.args(), new FakeCaller());
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("over-ceiling");
    expect(r.out).toBe("");
    expect(readBytes(ctx.ledger)).toEqual(before);
    const ok = makeCtx(PLAN_B_FILE);
    writeLedger(ok.ledger, [{ kind: "attempt", service: "gemini-omni", cost_usd: 16.15 }]);
    const r2 = await run(ok.args(), new FakeCaller());
    expect(r2.code).toBe(0);
  });
});

// ── (A52e) --last-still: the first + last promptImage array of a last_frame model ───────

const LF_CLIP = "ai-4-kling4-pic";
const LF_PNG_A = PNG_BYTES;
const LF_PNG_B = Buffer.concat([PNG_BYTES, Buffer.from("last-frame-made-up-trailer")]);
const uriOf = (b: Buffer): string => `data:image/png;base64,${b.toString("base64")}`;

interface PlanBJson {
  plan_id: string;
  models: Record<string, Record<string, unknown>>;
  clips: PlanClip[];
}

/** A temp copy of plan-b with one mutation applied. */
function lfTempPlan(mut: (p: PlanBJson) => void): string {
  const p = JSON.parse(fs.readFileSync(PLAN_B_FILE, "utf8")) as PlanBJson;
  mut(p);
  const f = path.join(mkTmp(), "plan-b-lf.json");
  fs.writeFileSync(f, JSON.stringify(p));
  return f;
}

/** Run a refusal case on the dry run and on --live: exit 2 before any key read, record unchanged. */
async function refuseBoth(
  planFile: string,
  clip: string,
  extra: string[],
  code: string,
  mention?: string,
): Promise<void> {
  for (const live of [false, true]) {
    const ctx = makeCtx(planFile);
    const fake = new FakeCaller();
    const keyReader = jest.fn(() => KEY);
    const r = await run(ctx.args({ clip, extra: [...extra, ...(live ? ["--live"] : [])] }), fake, keyReader);
    await expectRefusal(r, code, fake, ctx.ledger);
    expect(keyReader).not.toHaveBeenCalled();
    if (mention) expect(r.err).toContain(mention);
  }
}

function lfFiles(): { dir: string; a: string; b: string } {
  const dir = mkTmp();
  return { dir, a: writeStill(dir, "a.png", LF_PNG_A), b: writeStill(dir, "b.png", LF_PNG_B) };
}

describe("a52e last-still: plan and dry run", () => {
  it("plan-b loads with 7 clip lines; last_frame is true only on kling_4", async () => {
    const ctx = makeCtx(PLAN_B_FILE);
    const r = await run(ctx.args(), new FakeCaller());
    expect(r.code).toBe(0);
    expect(r.out.split("\n").filter((l) => l.startsWith("runway: clip id=")).length).toBe(7);
    for (const f of [PLAN_FILE, PLAN_B_FILE]) {
      const p = JSON.parse(fs.readFileSync(f, "utf8")) as PlanBJson;
      for (const [name, m] of Object.entries(p.models)) {
        expect([name, m.last_frame === true]).toEqual([name, f === PLAN_B_FILE && name === "kling_4"]);
      }
    }
  });

  it("last_frame \"yes\" refuses plan-invalid naming the model, dry and live", async () => {
    const plan = lfTempPlan((p) => {
      p.models.kling_4.last_frame = "yes";
    });
    await refuseBoth(plan, LF_CLIP, [], "plan-invalid", "kling_4");
  });

  it("dry run prints both hashes after the first one, exit 0, nothing written", async () => {
    const { a, b } = lfFiles();
    const ctx = makeCtx(PLAN_B_FILE);
    const fake = new FakeCaller();
    const keyReader = jest.fn(() => KEY);
    const base = (await run(ctx.args({ clip: LF_CLIP, still: a }), fake, keyReader)).out
      .split("\n").find((l) => l.startsWith("runway: clip id="))!;
    const r = await run(ctx.args({ clip: LF_CLIP, still: a, extra: ["--last-still", b] }), fake, keyReader);
    expect(r.code).toBe(0);
    const line = r.out.split("\n").find((l) => l.startsWith("runway: clip id="))!;
    expect(line).toBe(
      base.replace(` still-sha256=${sha(LF_PNG_A)}`, ` still-sha256=${sha(LF_PNG_A)} last-still-sha256=${sha(LF_PNG_B)}`),
    );
    expect(line).not.toBe(base);
    expect(line).toContain(` still-sha256=${sha(LF_PNG_A)} last-still-sha256=${sha(LF_PNG_B)} rate-usd-per-s=`);
    expect(keyReader).not.toHaveBeenCalled();
    expect(fake.calls.length).toBe(0);
    expect(readBytes(ctx.ledger)).toBeNull();
    expect(fs.readdirSync(ctx.out).length).toBe(0);
  });

  it("without --last-still the clip line is today's line, no last-still-sha256", async () => {
    const { a } = lfFiles();
    const ctx = makeCtx(PLAN_B_FILE);
    const r = await run(ctx.args({ clip: LF_CLIP, still: a }), new FakeCaller());
    const prompt = (JSON.parse(fs.readFileSync(PLAN_B_FILE, "utf8")) as PlanBJson).clips.find((c) => c.id === LF_CLIP)!.prompt;
    const today =
      `runway: clip id=${LF_CLIP} shot=AI-4 model=kling_4 endpoint=image_to_video seconds=6 ratio=auto_720p audio=false` +
      ` prompt-sha256=${sha(Buffer.from(prompt, "utf8"))} still-sha256=${sha(LF_PNG_A)}` +
      ` rate-usd-per-s=0.157 estimate-usd=0.950`;
    expect(r.out.split("\n").find((l) => l.startsWith("runway: clip id="))).toBe(today);
    expect(r.out).not.toContain("last-still-sha256=");
  });

  it("the same file for --still and --last-still is allowed, two equal hashes", async () => {
    const { a } = lfFiles();
    const ctx = makeCtx(PLAN_B_FILE);
    const r = await run(ctx.args({ clip: LF_CLIP, still: a, extra: ["--last-still", a] }), new FakeCaller());
    expect(r.code).toBe(0);
    expect(r.out).toContain(` still-sha256=${sha(LF_PNG_A)} last-still-sha256=${sha(LF_PNG_A)} `);
  });

  it("flag order does not matter: A stays first, B stays last", async () => {
    const { a, b } = lfFiles();
    const ctx = makeCtx(PLAN_B_FILE);
    const r1 = await run(ctx.args({ clip: LF_CLIP, still: a, extra: ["--last-still", b] }), new FakeCaller());
    const r2 = await run(ctx.args({ clip: LF_CLIP, extra: ["--last-still", b, "--still", a] }), new FakeCaller());
    expect(r2.code).toBe(0);
    expect(r2.out).toBe(r1.out);
    expect(r2.out).toContain(` still-sha256=${sha(LF_PNG_A)} last-still-sha256=${sha(LF_PNG_B)} `);
  });

  it("the estimate with a last still equals the estimate without one", async () => {
    const { a, b } = lfFiles();
    const ctx = makeCtx(PLAN_B_FILE);
    const est = (out: string): string => /estimate-usd=(\S+)/.exec(out.split("\n").find((l) => l.startsWith("runway: clip id="))!)![1];
    const without = await run(ctx.args({ clip: LF_CLIP, still: a }), new FakeCaller());
    const withLast = await run(ctx.args({ clip: LF_CLIP, still: a, extra: ["--last-still", b] }), new FakeCaller());
    expect(est(withLast.out)).toBe(est(without.out));
    expect(est(without.out)).toBe("0.950");
  });
});

describe("a52e last-still: live body and attempt line", () => {
  const promptOf = (): string =>
    (JSON.parse(fs.readFileSync(PLAN_B_FILE, "utf8")) as PlanBJson).clips.find((c) => c.id === LF_CLIP)!.prompt;
  const sentToday = (): Record<string, unknown> => ({
    plan_id: "a52b-runway-tryout-2026-11-22",
    clip_id: LF_CLIP,
    shot: "AI-4",
    model: "kling_4",
    endpoint: "image_to_video",
    seconds: 6,
    ratio: "auto_720p",
    audio: false,
    prompt_sha256: sha(Buffer.from(promptOf(), "utf8")),
    image_sha256: sha(LF_PNG_A),
  });

  for (const order of ["still-first", "last-first"]) {
    it(`sends the first + last array and records both hashes (${order})`, async () => {
      const { a, b } = lfFiles();
      const ctx = makeCtx(PLAN_B_FILE);
      const fake = new FakeCaller();
      const extra =
        order === "still-first" ? ["--still", a, "--last-still", b, "--live"] : ["--last-still", b, "--still", a, "--live"];
      const r = await run(ctx.args({ clip: LF_CLIP, extra }), fake);
      expect(r.code).toBe(0);
      expect(fake.createCount).toBe(1);
      expect(fake.calls[0].url).toBe("https://api.dev.runwayml.com/v1/image_to_video");
      expect(JSON.parse(String(fake.calls[0].body))).toEqual({
        model: "kling_4",
        promptText: promptOf(),
        ratio: "auto_720p",
        duration: 6,
        promptImage: [
          { uri: uriOf(LF_PNG_A), position: "first" },
          { uri: uriOf(LF_PNG_B), position: "last" },
        ],
      });
      const att = ledgerLines(ctx.ledger)[0];
      expect(att.kind).toBe("attempt");
      expect(att.sent).toEqual({ ...sentToday(), last_image_sha256: sha(LF_PNG_B) });
    });
  }

  it("the same file as first and last still sends the two-item array, not the plain string", async () => {
    const { a } = lfFiles();
    const ctx = makeCtx(PLAN_B_FILE);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ clip: LF_CLIP, still: a, extra: ["--last-still", a, "--live"] }), fake);
    expect(r.code).toBe(0);
    expect(fake.createCount).toBe(1);
    expect(JSON.parse(String(fake.calls[0].body))).toEqual({
      model: "kling_4",
      promptText: promptOf(),
      ratio: "auto_720p",
      duration: 6,
      promptImage: [
        { uri: uriOf(LF_PNG_A), position: "first" },
        { uri: uriOf(LF_PNG_A), position: "last" },
      ],
    });
    const att = ledgerLines(ctx.ledger)[0];
    expect(att.sent).toEqual({ ...sentToday(), last_image_sha256: sha(LF_PNG_A) });
  });

  it("without a last still the body keeps the string form and the attempt keys are today's", async () => {
    const { a } = lfFiles();
    const ctx = makeCtx(PLAN_B_FILE);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ clip: LF_CLIP, still: a, extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    expect(JSON.parse(String(fake.calls[0].body))).toEqual({
      model: "kling_4",
      promptText: promptOf(),
      ratio: "auto_720p",
      duration: 6,
      promptImage: uriOf(LF_PNG_A),
    });
    expect(ledgerLines(ctx.ledger)[0].sent).toEqual(sentToday());
  });
});

describe("a52e last-still: refusals", () => {
  it("(a) a model with no last_frame true: usage (seedance2_5, veo3.1_fast)", async () => {
    const { a, b } = lfFiles();
    for (const clip of ["ai-4-seedance25-pic", "ai-4-veo-newprompt-pic"]) {
      await refuseBoth(PLAN_B_FILE, clip, ["--still", a, "--last-still", b], "usage");
    }
  });

  it("(b) kling_4_flash with last_frame true is plan-invalid; without it plus --last-still is usage", async () => {
    const { a, b } = lfFiles();
    const withFlash = (lf: boolean) =>
      lfTempPlan((p) => {
        const m = JSON.parse(JSON.stringify(p.models.kling_4)) as Record<string, unknown>;
        if (lf) m.last_frame = true;
        else delete m.last_frame;
        p.models.kling_4_flash = m;
        const c = p.clips.find((x) => x.id === LF_CLIP)!;
        p.clips.push({ ...c, id: "flash-clip", model: "kling_4_flash" });
      });
    await refuseBoth(withFlash(true), "flash-clip", ["--still", a, "--last-still", b], "plan-invalid", "kling_4_flash");
    await refuseBoth(withFlash(true), "flash-clip", ["--still", a], "plan-invalid", "kling_4_flash");
    await refuseBoth(withFlash(false), "flash-clip", ["--still", a, "--last-still", b], "usage");
  });

  it("(c) a text_to_video clip: usage, the text names --last-still, before the first still is read", async () => {
    const { a, b } = lfFiles();
    // the t2v --last-still refusal (runway.ts:442) runs before the "takes no --still" check,
    // so the text is the --last-still one; a mutant that drops it answers "takes no --still"
    await refuseBoth(PLAN_B_FILE, "ai-1-kling4-pic", ["--still", a, "--last-still", b], "usage", "takes no --last-still");
    // the check also runs BEFORE readStill of the first still: a missing first still is still
    // usage, not input-missing (with the check deleted, readStill refuses input-missing first)
    const missingFirst = path.join(mkTmp(), "no-such-first.png");
    await refuseBoth(PLAN_B_FILE, "ai-1-kling4-pic", ["--still", missingFirst, "--last-still", b], "usage", "takes no --last-still");
  });

  it("(d) --last-still without --still: usage", async () => {
    const { b } = lfFiles();
    await refuseBoth(PLAN_B_FILE, LF_CLIP, ["--last-still", b], "usage");
  });

  it("(e) --last-still without --clip: usage", async () => {
    const { a, b } = lfFiles();
    for (const live of [false, true]) {
      const ctx = makeCtx(PLAN_B_FILE);
      const fake = new FakeCaller();
      const keyReader = jest.fn(() => KEY);
      const r = await run(ctx.args({ still: a, extra: ["--last-still", b, ...(live ? ["--live"] : [])] }), fake, keyReader);
      await expectRefusal(r, "usage", fake, ctx.ledger);
      expect(keyReader).not.toHaveBeenCalled();
    }
  });

  it("(f) --last-still given twice: usage", async () => {
    const { a, b } = lfFiles();
    await refuseBoth(PLAN_B_FILE, LF_CLIP, ["--still", a, "--last-still", b, "--last-still", a], "usage");
    await refuseBoth(PLAN_B_FILE, LF_CLIP, ["--still", a, "--last-still", a, "--last-still", b], "usage");
  });
});

describe("a52e last-still: a bad last still", () => {
  const cases: { name: string; make: (dir: string) => string; code: string }[] = [
    { name: "missing", make: (d) => path.join(d, "no-such-last.png"), code: "input-missing" },
    { name: "not an image", make: (d) => writeStill(d, "last.txt", Buffer.from("plain text, not an image")), code: "input-too-big" },
    {
      name: "data URI over 5000000 characters",
      make: (d) => writeStill(d, "huge.png", Buffer.concat([PNG_BYTES, Buffer.alloc(3_800_000, 1)])),
      code: "input-too-big",
    },
  ];
  for (const c of cases) {
    it(`${c.name}: ${c.code}, names the last still`, async () => {
      const dir = mkTmp();
      const a = writeStill(dir, "first-ok.png");
      const bad = c.make(dir);
      await refuseBoth(PLAN_B_FILE, LF_CLIP, ["--still", a, "--last-still", bad], c.code, `last still image ${bad}`);
    });
  }
});
