/**
 * Row A52c — unit tests for the still:edit tool. Made-up values only; the fake caller
 * records each URL/header it is handed and returns made-up bytes. NO REAL CALL and no paid
 * step: globalThis.fetch is replaced (before the module under test loads) with a counter
 * that throws, and an afterAll asserts the count stayed 0. The key reader is injected (and
 * the Keychain lookup of the default reader is faked at the module level, so a dry run that
 * reads a key turns the dry-run test red). No test holds a copy of a plan prompt: prompt
 * text is read from the committed plan file at run time.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import type { CliResult, NetCall, StillCaller, StillEditDeps } from "../stillEdit";

type SE = typeof import("../stillEdit");
type RW = typeof import("../runway");
type VG = typeof import("../videogen");

// ── no-network fence, installed before the module under test is loaded ──────────────────

let fetchCount = 0;
const realFetch = globalThis.fetch;
(globalThis as { fetch: typeof fetch }).fetch = (() => {
  fetchCount++;
  throw new Error("network is disabled in still:edit tests");
}) as typeof fetch;

let se: SE;
let rw: RW;
let vg: VG;

// the Keychain lookup is faked at the module level: the builtin's execFileSync
// property is non-configurable, so jest.mock replaces the module the adapter sees
// (the dry-run test asserts NO execFileSync call, so a key read in the dry run is red)
const mockExecCalls: { file: string; args: string[] }[] = [];
jest.mock("child_process", () => {
  const actual = jest.requireActual("child_process") as Record<string, unknown>;
  return {
    ...actual,
    execFileSync: (file: string, args: readonly string[]): string => {
      mockExecCalls.push({ file, args: [...args] });
      return "made-up-keychain-key-not-real\n";
    },
  };
});

beforeAll(() => {
  jest.isolateModules(() => {
    se = require("../stillEdit");
    rw = require("../runway");
    vg = require("../videogen");
  });
});
afterAll(() => {
  expect(fetchCount).toBe(0);
  (globalThis as { fetch: typeof fetch }).fetch = realFetch;
});

// ── made-up values and helpers ─────────────────────────────────────────────────────────

const KEY = "se-planted-key-not-real";
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/** A made-up reply image: a PNG header (IHDR) naming 777x1344 plus some body bytes. */
const FAKE_PNG = (() => {
  const b = Buffer.alloc(40);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0); // PNG signature
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(777, 16);
  b.writeUInt32BE(1344, 20);
  b.write("made-up-png-body", 24, "ascii");
  return b;
})();

const REPO = path.resolve(__dirname, "..", "..");
const PLAN_FILE = path.join(REPO, "tools", "still-edit-plan.json");
const RUNWAY_PLAN = path.join(REPO, "tools", "runway-tryout-plan.json");

interface PlanItem {
  id: string;
  shot: string;
  needs_input: boolean;
  aspect_ratio?: string;
  prompt: string;
}
interface PlanJson {
  plan_id: string;
  model: string;
  price_usd_per_call: number;
  price_read: string;
  items: PlanItem[];
}
const PLAN = JSON.parse(fs.readFileSync(PLAN_FILE, "utf8")) as PlanJson;

/** The committed plan's item (prompt text is read at run time, never copied into a test). */
const planItem = (id: string): PlanItem => PLAN.items.find((i) => i.id === id) as PlanItem;

const sha = (b: Buffer): string => crypto.createHash("sha256").update(b).digest("hex");

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "a52c-se-test-"));
}

interface ArgsOpts {
  plan?: string;
  item?: string;
  out?: string;
  ledger?: string;
  ceiling?: string;
  in?: string;
  timeout?: string;
  extra?: string[];
  drop?: string[];
  dropIn?: boolean;
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
      "--item", o.item ?? "ai-4-no-pillars",
      "--out", o.out ?? out,
      "--ledger", o.ledger ?? ledger,
      "--ceiling-usd", o.ceiling ?? "1",
    ];
    if (o.in !== undefined) full.push("--in", o.in);
    if (o.timeout) full.push("--timeout-seconds", o.timeout);
    full.push(...(o.extra ?? []));
    const drop = new Set([...(o.drop ?? []), ...(o.dropIn ? ["--in"] : [])]);
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

function goodReply(): unknown {
  return {
    candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: FAKE_PNG.toString("base64") } }] } }],
    usageMetadata: { promptTokenCount: 321, candidatesTokenCount: 1290 },
  };
}

class FakeCaller implements StillCaller {
  calls: NetCall[] = [];
  count = 0;
  impl: () => Promise<unknown> = async () => goodReply();
  async generate(call: NetCall): Promise<unknown> {
    this.calls.push(call);
    this.count++;
    return this.impl();
  }
}

/** Run with injected fakes; if the module itself throws, its text must hold no key.
 *  A --live run gets () => KEY injected (the default reader must not run in tests); a dry
 *  run gets NO reader, so a key read in the dry run hits the faked Keychain and is red. */
async function run(argv: string[], fake: FakeCaller, keyReader?: () => string): Promise<CliResult> {
  const deps: StillEditDeps = { caller: fake, keyReader: keyReader ?? (argv.includes("--live") ? () => KEY : undefined) };
  try {
    return await se.runStillEdit(argv, deps);
  } catch (e) {
    expect(e instanceof Error ? e.message : String(e)).not.toContain(KEY);
    throw e;
  }
}

/** A refusal: exit 2, one line, the code first, no call, the record byte-equal, no lock file,
 *  and the out folder (makeCtx puts it beside the record as out/) still empty. */
async function expectRefusal(r: CliResult, code: string, fake: FakeCaller, ledgerPath: string, before?: Buffer | null): Promise<void> {
  expect(r.code).toBe(2);
  const line = r.err.trim();
  expect(line.split("\n").length).toBe(1); // one line
  expect(line.split(/\s+/)[0]).toBe(code); // code first
  expect(fake.calls.length).toBe(0); // no network step
  const now = readBytes(ledgerPath);
  if (before === undefined) expect(now).toBeNull(); // nothing was written
  else expect(now).toEqual(before ?? null); // byte-equal before and after
  expect(fs.readdirSync(path.dirname(ledgerPath)).filter((f) => f.endsWith(".lock")).length).toBe(0);
  const outDir = path.join(path.dirname(ledgerPath), "out");
  if (fs.existsSync(outDir)) expect(fs.readdirSync(outDir)).toEqual([]); // no file written to out/
}

// ── (1) the dry run ────────────────────────────────────────────────────────────────────

describe("t1 dry run", () => {
  let savedEnv: string | undefined;
  let envWasSet: boolean;
  beforeEach(() => {
    savedEnv = process.env.GEMINI_API_KEY;
    envWasSet = Object.prototype.hasOwnProperty.call(process.env, "GEMINI_API_KEY");
    delete process.env.GEMINI_API_KEY; // no env key: a key read would hit the (faked) Keychain
    mockExecCalls.length = 0;
  });
  afterEach(() => {
    if (envWasSet) process.env.GEMINI_API_KEY = savedEnv;
    else delete process.env.GEMINI_API_KEY;
    mockExecCalls.length = 0;
  });

  it("edit mode: no key read (no execFileSync), no call, nothing written; the three output lines", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ in: still }), fake); // no injected key reader: the default one must not run
    expect(r.code).toBe(0);
    expect(r.err).toBe("");
    const lines = r.out.split("\n");
    expect(lines[0]).toBe("still: dry-run (no request sent, no key read, nothing written)");
    expect(lines[1]).toMatch(
      new RegExp(`^still: item id=ai-4-no-pillars mode=edit model=gemini-2\\.5-flash-image prompt-sha256=[0-9a-f]{64} in-sha256=${sha(PNG_BYTES)} estimate-usd=0\\.040$`),
    );
    expect(lines[2]).toBe("still: spend group=ai-image spent usd=0.000 ceiling=1 room usd=1.000 room-after usd=0.960");
    expect(mockExecCalls.length).toBe(0); // the default key reader (env, Keychain) never ran
    expect(fake.calls.length).toBe(0);
    expect(readBytes(ctx.ledger)).toBeNull(); // writes nothing
    expect(fs.readdirSync(ctx.out).length).toBe(0);
    expect(fs.existsSync(`${ctx.ledger}.lock`)).toBe(false);
    expect(fetchCount).toBe(0);
  });

  it("text mode: mode=text, no in-sha256, its own prompt-sha256", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const r = await run(ctx.args({ item: "ai-4-outdoor-start", dropIn: true }), fake);
    expect(r.code).toBe(0);
    const itemLine = r.out.split("\n")[1];
    expect(itemLine).toMatch(/^still: item id=ai-4-outdoor-start mode=text model=gemini-2\.5-flash-image prompt-sha256=[0-9a-f]{64} estimate-usd=0\.040$/);
    expect(itemLine).not.toContain("in-sha256");
    expect(fake.calls.length).toBe(0);
  });

  it("a spend line from the record: spent 0.040 gives room 0.960 room-after 0.920; the record is byte-equal", async () => {
    const ctx = makeCtx();
    writeLedger(ctx.ledger, [{ kind: "attempt", service: "gemini-image", cost_usd: 0.04 }]);
    const before = readBytes(ctx.ledger);
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ in: still }), fake);
    expect(r.code).toBe(0);
    expect(r.out).toContain("still: spend group=ai-image spent usd=0.040 ceiling=1 room usd=0.960 room-after usd=0.920");
    expect(readBytes(ctx.ledger)).toEqual(before); // byte-equal before and after
  });
});

// ── (2) the request body ───────────────────────────────────────────────────────────────

describe("t2 request body", () => {
  it("edit mode: one POST to the model URL with the key header; image part (base64 + mime) then the plan prompt", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ in: still, extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    expect(fake.count).toBe(1);
    const call = fake.calls[0];
    expect(call.method).toBe("POST");
    expect(call.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent");
    expect(call.headers["x-goog-api-key"]).toBe(KEY);
    expect(call.headers["content-type"]).toBe("application/json");
    const body = JSON.parse(call.body as string) as Record<string, unknown>;
    const parts = ((body.contents as Record<string, unknown>[])[0].parts as Record<string, unknown>[]);
    expect(parts.length).toBe(2); // exactly one image part, then one text part
    expect(parts[0]).toEqual({ inlineData: { mimeType: "image/png", data: PNG_BYTES.toString("base64") } });
    expect(parts[1]).toEqual({ text: planItem("ai-4-no-pillars").prompt }); // the plan prompt, byte for byte
    expect(body.generationConfig).toEqual({ responseModalities: ["TEXT", "IMAGE"] }); // no imageConfig on an edit
  });

  it("text mode: no inlineData anywhere, the text part only, imageConfig.aspectRatio from the plan item", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const r = await run(ctx.args({ item: "ai-4-outdoor-start", dropIn: true, extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    const body = JSON.parse(fake.calls[0].body as string) as Record<string, unknown>;
    expect(call_hasNoInlineData(body)).toBe(true);
    const parts = ((body.contents as Record<string, unknown>[])[0].parts as Record<string, unknown>[]);
    expect(parts).toEqual([{ text: planItem("ai-4-outdoor-start").prompt }]);
    const gc = body.generationConfig as Record<string, unknown>;
    expect(gc.responseModalities).toEqual(["TEXT", "IMAGE"]);
    expect((gc.imageConfig as Record<string, unknown>).aspectRatio).toBe(planItem("ai-4-outdoor-start").aspect_ratio);
  });

  it("a 503 reply: outcome failed, exit 1, and the caller is called ONCE (no retry inside a run)", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    fake.impl = async () => {
      throw new vg.HttpError(503);
    };
    const r = await run(ctx.args({ in: still, extra: ["--live"] }), fake);
    expect(r.code).toBe(1);
    expect(fake.count).toBe(1);
    expect(ledgerLines(ctx.ledger)[1].status).toBe("failed");
  });
});

function call_hasNoInlineData(body: Record<string, unknown>): boolean {
  return !JSON.stringify(body).includes("inlineData") && !JSON.stringify(body).includes("inline_data");
}

// ── (3) the spend lines ────────────────────────────────────────────────────────────────

describe("t3 spend lines", () => {
  it("one attempt line BEFORE the call — kept when the call throws — and one outcome line after", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    let seenAtCall: string | null = null;
    fake.impl = async () => {
      seenAtCall = readBytes(ctx.ledger)?.toString("utf8") ?? null; // read at call time
      throw new Error("made-up generate failure");
    };
    const r = await run(ctx.args({ in: still, extra: ["--live"] }), fake);
    expect(r.code).toBe(1);
    expect(seenAtCall).not.toBeNull();
    expect(String(seenAtCall).endsWith("\n")).toBe(true);
    const atCall = JSON.parse(String(seenAtCall).trim()) as Record<string, unknown>;
    expect(atCall.kind).toBe("attempt");
    expect(atCall.cost_usd).toBe(0.04);

    const lines = ledgerLines(ctx.ledger);
    expect(lines.length).toBe(2);
    const att = lines[0];
    expect(att.kind).toBe("attempt");
    expect(att.service).toBe("gemini-image");
    expect(typeof att.attempt_id).toBe("string");
    expect(new Date(String(att.time)).toString()).not.toBe("Invalid Date");
    expect(att.sent).toEqual({
      plan_id: PLAN.plan_id,
      item_id: "ai-4-no-pillars",
      shot: planItem("ai-4-no-pillars").shot,
      model: PLAN.model,
      mode: "edit",
      prompt_sha256: sha(Buffer.from(planItem("ai-4-no-pillars").prompt, "utf8")),
      image_sha256: sha(PNG_BYTES),
    });
    expect(att.cost_usd).toBe(0.04);
    expect(att.cost_how).toMatchObject({ price_read: PLAN.price_read, output_usd_per_image: 0.039, input_usd_guess: 0.001 });
    expect(att.status).toBe("attempted");
    const out = lines[1];
    expect(out.kind).toBe("outcome");
    expect(out.attempt_id).toBe(att.attempt_id);
    expect(out.service).toBe("gemini-image");
    expect(out.cost_usd).toBe(0);
    expect(out.status).toBe("failed");
    expect(String(out.failure)).toContain("made-up generate failure");
    expect(fs.existsSync(`${ctx.ledger}.lock`)).toBe(false); // the lock is released before the call
  });

  it("a good edit run: 2 lines, the file on disk, file_sha256 of the fake bytes, PNG width and height, usage tokens", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ in: still, extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    const saved = fs.readdirSync(ctx.out);
    expect(saved.length).toBe(1);
    expect(saved[0]).toMatch(/^still-ai-4-no-pillars-[0-9a-f]{8}\.png$/);
    expect(fs.readFileSync(path.join(ctx.out, saved[0]))).toEqual(FAKE_PNG); // the bytes as returned
    const lines = ledgerLines(ctx.ledger);
    expect(lines.length).toBe(2);
    expect(lines[0].cost_usd).toBe(0.04);
    const out = lines[1];
    expect(out.status).toBe("ok");
    expect(out.file).toBe(saved[0]);
    expect(out.file_sha256).toBe(sha(FAKE_PNG));
    expect(out.mime).toBe("image/png");
    expect(out.width).toBe(777);
    expect(out.height).toBe(1344);
    expect(out.prompt_tokens).toBe(321);
    expect(out.output_tokens).toBe(1290);
    expect(out.failure).toBeNull();
  });

  it("a good text run: image_sha256 null in the attempt line, its own file name", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const r = await run(ctx.args({ item: "ai-4-outdoor-start", dropIn: true, extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    const lines = ledgerLines(ctx.ledger);
    expect((lines[0].sent as Record<string, unknown>).mode).toBe("text");
    expect((lines[0].sent as Record<string, unknown>).image_sha256).toBeNull();
    expect(lines[1].status).toBe("ok");
    expect(String(lines[1].file)).toMatch(/^still-ai-4-outdoor-start-[0-9a-f]{8}\.png$/);
  });

  it("a reply with text only gives outcome no-image, exit 1, no file", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    fake.impl = async () => ({ candidates: [{ content: { parts: [{ text: "made-up words, no image" }] } }] });
    const r = await run(ctx.args({ in: still, extra: ["--live"] }), fake);
    expect(r.code).toBe(1);
    expect(fs.readdirSync(ctx.out).length).toBe(0);
    const out = ledgerLines(ctx.ledger)[1];
    expect(out.status).toBe("no-image");
    expect(out.file).toBeNull();
    expect(String(out.failure)).toContain("no image part");
  });

  it("a reply image of mime image/webp gives outcome no-image, exit 1, no file written", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    fake.impl = async () => ({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/webp", data: FAKE_PNG.toString("base64") } }] } }],
    });
    const r = await run(ctx.args({ in: still, extra: ["--live"] }), fake);
    expect(r.code).toBe(1);
    expect(fs.readdirSync(ctx.out).length).toBe(0);
    const out = ledgerLines(ctx.ledger)[1];
    expect(out.status).toBe("no-image");
    expect(String(out.failure)).toContain("image/webp");
  });

  it("a reply image with empty data gives outcome no-image, exit 1, no file written", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    fake.impl = async () => ({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "" } }] } }],
    });
    const r = await run(ctx.args({ in: still, extra: ["--live"] }), fake);
    expect(r.code).toBe(1);
    expect(fs.readdirSync(ctx.out).length).toBe(0);
    const out = ledgerLines(ctx.ledger)[1];
    expect(out.status).toBe("no-image");
    expect(String(out.failure)).toContain("data is empty");
  });

  it("an HTTP 429 reply: outcome failed, exit 1, the caller called once, the attempt line keeps cost_usd 0.04", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    fake.impl = async () => {
      throw new vg.HttpError(429);
    };
    const r = await run(ctx.args({ in: still, extra: ["--live"] }), fake);
    expect(r.code).toBe(1);
    expect(fake.count).toBe(1);
    const lines = ledgerLines(ctx.ledger);
    expect(lines[0].cost_usd).toBe(0.04);
    expect(lines[1].status).toBe("failed");
    expect(String(lines[1].failure)).toContain("429");
  });

  it("an HTTP 400 reply: outcome failed, exit 1, the caller called once, the attempt line keeps cost_usd 0.04", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    fake.impl = async () => {
      throw new vg.HttpError(400);
    };
    const r = await run(ctx.args({ in: still, extra: ["--live"] }), fake);
    expect(r.code).toBe(1);
    expect(fake.count).toBe(1);
    const lines = ledgerLines(ctx.ledger);
    expect(lines[0].cost_usd).toBe(0.04);
    expect(lines[1].status).toBe("failed");
    expect(String(lines[1].failure)).toContain("400");
  });

  it("a failure text that echoes the key is scrubbed from the record and stderr", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    fake.impl = async () => {
      throw new Error(`made-up failure echoing ${KEY} in full`);
    };
    const r = await run(ctx.args({ in: still, extra: ["--live"] }), fake);
    expect(r.code).toBe(1);
    expect(r.err).not.toContain(KEY);
    expect(r.err).toContain("[redacted]");
    const text = readBytes(ctx.ledger)?.toString("utf8") ?? "";
    expect(text).not.toContain(KEY);
    expect(text).toContain("[redacted]");
  });
});

// ── (4) the cap group ai-image, apart from ai-video and paid-media ─────────────────────

describe("t4 cap group", () => {
  it("a gemini-image attempt line of 0.04 counts 40000 micro-USD in ai-image; ai-video and paid-media stay as before", () => {
    const ctx = makeCtx();
    writeLedger(ctx.ledger, [
      { kind: "attempt", service: "gemini-image", cost_usd: 0.04 },
      { kind: "attempt", service: "gemini-omni", cost_usd: 6.16 },
      { kind: "attempt", service: "runway", cost_usd: 12.71 },
      { service: "elevenlabs", cost_usd: 5 },
    ]);
    expect(vg.readLedgerTotal(ctx.ledger, "ai-image")).toBe(40_000);
    expect(vg.readLedgerTotal(ctx.ledger, "ai-video")).toBe(18_870_000);
    expect(vg.readLedgerTotal(ctx.ledger, "paid-media")).toBe(5_000_000);
  });

  it("a record holding a gemini-image line does not refuse in the video:tryout dry run (no ledger-unreadable)", async () => {
    const ctx = makeCtx();
    writeLedger(ctx.ledger, [{ kind: "attempt", service: "gemini-image", cost_usd: 0.04 }]);
    const out = path.join(ctx.tmp, "rw-out");
    fs.mkdirSync(out);
    const r = await rw.runRunwayTryout(
      ["--plan", RUNWAY_PLAN, "--out", out, "--ledger", ctx.ledger, "--ceiling-usd", "25"],
    );
    expect(r.code).toBe(0);
    expect(r.err).toBe("");
  });

  it("spent 0.97 plus 0.04 against ceiling 1 refuses over-ceiling (the text names ai-image); 0.96 passes at exactly 1", async () => {
    const over = makeCtx();
    writeLedger(over.ledger, [{ kind: "attempt", service: "gemini-image", cost_usd: 0.97 }]);
    const before = readBytes(over.ledger);
    const still = writeStill(over.tmp);
    const fake = new FakeCaller();
    const r = await run(over.args({ in: still }), fake);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("over-ceiling");
    expect(r.err).toContain("ai-image");
    expect(fake.calls.length).toBe(0);
    expect(readBytes(over.ledger)).toEqual(before);

    const exact = makeCtx();
    writeLedger(exact.ledger, [{ kind: "attempt", service: "gemini-image", cost_usd: 0.96 }]);
    const still2 = writeStill(exact.tmp);
    const r2 = await run(exact.args({ in: still2 }), new FakeCaller());
    expect(r2.code).toBe(0);
    expect(r2.out).toContain("room-after usd=0.000");
  });

  it("the reverse: USD 18.87 of ai-video lines and no gemini-image line passes the dry run at ceiling 1 with spent usd=0.000", async () => {
    const ctx = makeCtx();
    writeLedger(ctx.ledger, [
      { kind: "attempt", service: "gemini-omni", cost_usd: 6.16 },
      { kind: "attempt", service: "runway", cost_usd: 12.71 },
    ]);
    const still = writeStill(ctx.tmp);
    const r = await run(ctx.args({ in: still }), new FakeCaller());
    expect(r.code).toBe(0);
    expect(r.out).toContain("still: spend group=ai-image spent usd=0.000 ceiling=1 room usd=1.000 room-after usd=0.960");
  });
});

// ── (5) the plan check (shape only; no test holds a copy of a plan prompt) ──────────────

describe("t5 plan", () => {
  it("the committed plan: 2 items with the two ids, each prompt a non-empty string, needs_input a boolean, the price a number", () => {
    expect(PLAN.plan_id).toBe("a52c-still-edit-2026-11-22");
    expect(PLAN.model).toBe("gemini-2.5-flash-image");
    expect(PLAN.price_usd_per_call).toBe(0.04);
    expect(PLAN.price_read).toBe("2026-11-22");
    expect(PLAN.items.length).toBe(2);
    expect(PLAN.items.map((i) => i.id)).toEqual(["ai-4-no-pillars", "ai-4-outdoor-start"]);
    for (const i of PLAN.items) {
      expect([i.id, typeof i.prompt]).toEqual([i.id, "string"]);
      expect([i.id, i.prompt.length > 0]).toEqual([i.id, true]);
      expect([i.id, typeof i.needs_input]).toEqual([i.id, "boolean"]);
    }
    expect(planItem("ai-4-no-pillars").needs_input).toBe(true);
    expect(planItem("ai-4-outdoor-start").needs_input).toBe(false);
  });

  it("the dry run of each item prints the pinned prompt-sha256 of the ticket text (one changed character turns it red)", async () => {
    const pinned: Record<string, string> = {
      "ai-4-no-pillars": "4d38bfdedb55c13715660af5d0613574808fd86f81cf8a288e644bd10e313c91",
      "ai-4-outdoor-start": "da9c2224321383c7a0129639105f6e07ed09288c6347da43c3342d9f4309443c",
    };
    for (const id of ["ai-4-no-pillars", "ai-4-outdoor-start"]) {
      const ctx = makeCtx();
      const o: ArgsOpts = { item: id, dropIn: id === "ai-4-outdoor-start" };
      if (id === "ai-4-no-pillars") o.in = writeStill(ctx.tmp);
      const r = await run(ctx.args(o), new FakeCaller());
      expect([id, r.code]).toEqual([id, 0]);
      expect([id, r.out.split("\n")[1]]).toEqual([id, expect.stringContaining(`prompt-sha256=${pinned[id]} `)]);
    }
  });

  it("the dry run of each item prints a prompt-sha256 (both quoted in the PR body)", async () => {
    for (const id of ["ai-4-no-pillars", "ai-4-outdoor-start"]) {
      const ctx = makeCtx();
      const o: ArgsOpts = { item: id, dropIn: id === "ai-4-outdoor-start" };
      if (id === "ai-4-no-pillars") o.in = writeStill(ctx.tmp);
      const r = await run(ctx.args(o), new FakeCaller());
      expect([id, r.code]).toEqual([id, 0]);
      const line = r.out.split("\n")[1];
      expect([id, line]).toEqual([id, expect.stringMatching(/prompt-sha256=[0-9a-f]{64}/)]);
    }
  });
});

// ── (6) refusals: usage (the six required cases plus extra cases, each asserting its detail text) ──

describe("t6 refusals: usage", () => {
  it("usage: a missing required option (--ledger dropped) refuses with its own text", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ in: still, drop: ["--ledger"] }), fake);
    await expectRefusal(r, "usage", fake, ctx.ledger);
    expect(r.err).toContain("missing required argument --ledger");
  });

  it("usage: an unknown option refuses with its own text", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ in: still, extra: ["--bogus", "x"] }), fake);
    await expectRefusal(r, "usage", fake, ctx.ledger);
    expect(r.err).toContain("bad or incomplete argument --bogus");
  });

  it("usage: --ceiling-usd not a plain number refuses with its own text", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ in: still, ceiling: "1.0.0" }), fake);
    await expectRefusal(r, "usage", fake, ctx.ledger);
    expect(r.err).toContain("--ceiling-usd must be a plain number");
  });

  it("usage: --ceiling-usd above the cap (1.01) refuses with its own text", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ in: still, ceiling: "1.01" }), fake);
    await expectRefusal(r, "usage", fake, ctx.ledger);
    expect(r.err).toContain("--ceiling-usd must be above 0 and at most 1");
  });

  it("usage: an option given with no value (--item as the last argument) refuses with its own text", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ in: still, extra: ["--item"] }), fake);
    await expectRefusal(r, "usage", fake, ctx.ledger);
    expect(r.err).toContain("bad or incomplete argument --item");
  });

  it("usage: --ceiling-usd 0 refuses with its own text", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ in: still, ceiling: "0" }), fake);
    await expectRefusal(r, "usage", fake, ctx.ledger);
    expect(r.err).toContain("--ceiling-usd must be above 0 and at most");
  });

  it("usage: --ceiling-usd 2 (above the cap) refuses with its own text", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ in: still, ceiling: "2" }), fake);
    await expectRefusal(r, "usage", fake, ctx.ledger);
    expect(r.err).toContain("--ceiling-usd must be above 0 and at most");
  });

  it("usage: a bad --timeout-seconds (0, then abc) refuses with its own text", async () => {
    for (const bad of ["0", "abc"]) {
      const ctx = makeCtx();
      const still = writeStill(ctx.tmp);
      const fake = new FakeCaller();
      const r = await run(ctx.args({ in: still, timeout: bad }), fake);
      await expectRefusal(r, "usage", fake, ctx.ledger);
      expect(r.err).toContain("--timeout-seconds must be a whole number above 0");
    }
  });

  it("usage: an item with needs_input true and no --in refuses with its own text", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const r = await run(ctx.args({ dropIn: true }), fake); // default item ai-4-no-pillars needs an input
    await expectRefusal(r, "usage", fake, ctx.ledger);
    expect(r.err).toContain("needs an input image: give --in");
  });

  it("usage: an item with needs_input false and an --in refuses with its own text", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ item: "ai-4-outdoor-start", in: still }), fake);
    await expectRefusal(r, "usage", fake, ctx.ledger);
    expect(r.err).toContain("takes no --in");
  });
});

// ── (7) refusals: plan-invalid (five sub-cases, each its own detail text) ───────────────

describe("t7 refusals: plan-invalid", () => {
  it("plan-invalid: a plan file that is not readable JSON refuses with its own text", async () => {
    const ctx = makeCtx();
    const bad = path.join(ctx.tmp, "not-json.json");
    fs.writeFileSync(bad, "this is not JSON at all");
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ plan: bad, in: still }), fake);
    await expectRefusal(r, "plan-invalid", fake, ctx.ledger);
    expect(r.err).toContain("is not readable JSON");
  });

  it("plan-invalid: no item with that id refuses with its own text", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ item: "made-up-item", in: still }), fake);
    await expectRefusal(r, "plan-invalid", fake, ctx.ledger);
    expect(r.err).toContain("the plan holds no item made-up-item");
  });

  it("plan-invalid: a prompt that is not a non-empty string refuses with its own text", async () => {
    const plan = tempPlan((p) => {
      planItemMut(p, "ai-4-no-pillars").prompt = "";
    });
    const ctx = makeCtx(plan);
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ plan, in: still }), fake);
    await expectRefusal(r, "plan-invalid", fake, ctx.ledger);
    expect(r.err).toContain("the prompt is not a non-empty string");
  });

  it("plan-invalid: needs_input not a boolean refuses with its own text", async () => {
    const plan = tempPlan((p) => {
      (planItemMut(p, "ai-4-no-pillars") as unknown as { needs_input: string }).needs_input = "yes";
    });
    const ctx = makeCtx(plan);
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ plan, in: still }), fake);
    await expectRefusal(r, "plan-invalid", fake, ctx.ledger);
    expect(r.err).toContain("needs_input must be true or false");
  });

  it("plan-invalid: a missing price, or one that is not a number, refuses with its own text", async () => {
    const mutations: ((p: PlanJson) => void)[] = [
      (p) => {
        (p as unknown as { price_usd_per_call?: number }).price_usd_per_call = undefined; // JSON.stringify drops it: missing
      },
      (p) => {
        (p as unknown as { price_usd_per_call: string }).price_usd_per_call = "0.04";
      },
    ];
    for (const mutate of mutations) {
      const plan = tempPlan(mutate);
      const ctx = makeCtx(plan);
      const still = writeStill(ctx.tmp);
      const fake = new FakeCaller();
      const r = await run(ctx.args({ plan, in: still }), fake);
      await expectRefusal(r, "plan-invalid", fake, ctx.ledger);
      expect(r.err).toContain("price_usd_per_call is missing or not a positive number");
    }
  });
});

/** Mutate one item of a plan copy being built by tempPlan. */
function planItemMut(p: PlanJson, id: string): PlanItem {
  return p.items.find((i) => i.id === id) as PlanItem;
}

// ── (8) refusals: the input image, the folders, the ledger ─────────────────────────────

describe("t8 refusals: input, out-bad, ledger", () => {
  it("input-missing: an --in that is not readable refuses with its own text", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const r = await run(ctx.args({ in: path.join(ctx.tmp, "no-such-still.png") }), fake);
    await expectRefusal(r, "input-missing", fake, ctx.ledger);
    expect(r.err).toContain("is not readable");
  });

  it("input-not-image: an --in that is neither PNG nor JPEG by its first bytes refuses with its own text", async () => {
    const ctx = makeCtx();
    const notImage = path.join(ctx.tmp, "not-image.png");
    fs.writeFileSync(notImage, "just plain text, not an image");
    const fake = new FakeCaller();
    const r = await run(ctx.args({ in: notImage }), fake);
    await expectRefusal(r, "input-not-image", fake, ctx.ledger);
    expect(r.err).toContain("is neither PNG nor JPEG");
  });

  it("input-too-big: an --in above the 8 MB limit of videogen.ts refuses with its own text", async () => {
    const ctx = makeCtx();
    const big = Buffer.concat([PNG_BYTES, Buffer.alloc(vg.MAX_IMAGE_BYTES)]); // over MAX_IMAGE_BYTES
    expect(big.length).toBeGreaterThan(vg.MAX_IMAGE_BYTES);
    const still = writeStill(ctx.tmp, "big.png", big);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ in: still }), fake);
    await expectRefusal(r, "input-too-big", fake, ctx.ledger);
    expect(r.err).toContain("byte limit");
  });

  it("input-symlink: an --in that is a symbolic link refuses with the detail text 'is a symlink'", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const link = path.join(ctx.tmp, "still-link.png");
    fs.symlinkSync(still, link);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ in: link }), fake);
    await expectRefusal(r, "input-symlink", fake, ctx.ledger);
    expect(r.err).toContain("is a symlink");
  });

  it("out-bad: an --out inside the repo tree but outside its out/ folder refuses", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ out: path.join(REPO, "adapters"), in: still }), fake);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("out-bad");
    expect(r.err).toContain(`out folder ${path.join(REPO, "adapters")} is inside the repo tree but outside its out/ folder`);
    expect(fake.calls.length).toBe(0);
  });

  it("out-bad: a --ledger folder inside the repo tree but outside its out/ refuses and creates nothing there", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const ledgerInside = path.join(REPO, "adapters", "made-up-ledger-a52c.jsonl");
    const fake = new FakeCaller();
    const r = await run(ctx.args({ ledger: ledgerInside, in: still }), fake);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("out-bad");
    expect(r.err).toContain(`ledger folder ${path.join(REPO, "adapters")} is inside the repo tree but outside its out/ folder`);
    expect(fs.existsSync(ledgerInside)).toBe(false);
    expect(fs.existsSync(`${ledgerInside}.lock`)).toBe(false);
  });

  it("ledger-unreadable: a line with an unknown service refuses with its own text (from readLedgerTotal)", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    fs.writeFileSync(ctx.ledger, '{"cost_usd":0.1,"service":"not-a-known-service"}\n');
    const before = readBytes(ctx.ledger);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ in: still }), fake);
    await expectRefusal(r, "ledger-unreadable", fake, ctx.ledger, before);
    expect(r.err).toContain(`${path.join(fs.realpathSync(ctx.tmp), "ledger.jsonl")}: a line has no known service`);
  });
});

// ── (9) key-missing (live only; the dry run never reads a key) ──────────────────────────

describe("t9 key-missing", () => {
  const readers: [string, () => string, string][] = [
    ["a throwing reader", () => {
      throw new Error("no key found");
    }, "the key reader threw"],
    ["an empty key", () => "", "the key reader returned no key"],
    ["a blank key", () => "  ", "the key reader returned no key"],
  ];
  for (const [label, reader, detail] of readers) {
    it(`refuses with key-missing for ${label}: no attempt line, nothing written, caller not called`, async () => {
      const ctx = makeCtx();
      const still = writeStill(ctx.tmp);
      const fake = new FakeCaller();
      const r = await run(ctx.args({ in: still, extra: ["--live"] }), fake, reader);
      expect(r.code).toBe(2);
      expect(r.err.trim().split(/\s+/)[0]).toBe("key-missing");
      expect(r.err).toContain(detail);
      expect(fake.calls.length).toBe(0);
      expect(readBytes(ctx.ledger)).toBeNull();
      expect(fs.readdirSync(ctx.out).length).toBe(0);
      expect(fs.existsSync(`${ctx.ledger}.lock`)).toBe(false);
    });
  }
});

// ── (10) the double checks: the cap and the lock, before the key read and again under it ─

describe("t10 double checks", () => {
  /** A key reader that first appends one line to the record plays the other run that wrote
   *  between the first checks in buildStillRun and the lock taken in liveRun. */
  function racingKeyReader(ledger: string, line: Record<string, unknown>): { reader: () => string; after: () => Buffer | null } {
    let after: Buffer | null = null;
    return {
      reader: () => {
        fs.appendFileSync(ledger, `${JSON.stringify(line)}\n`);
        after = readBytes(ledger);
        return KEY;
      },
      after: () => after,
    };
  }

  it("t-cap-1: a dry run over the ceiling refuses over-ceiling (the first cap check)", async () => {
    const ctx = makeCtx();
    writeLedger(ctx.ledger, [{ kind: "attempt", service: "gemini-image", cost_usd: 0.99 }]);
    const before = readBytes(ctx.ledger);
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ in: still }), fake);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("over-ceiling");
    expect(r.err).toContain("ai-image");
    expect(fake.calls.length).toBe(0);
    expect(readBytes(ctx.ledger)).toEqual(before);
  });

  it("t-cap-2: live, a spend landing during the key read refuses over-ceiling, no attempt line, no call", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const race = racingKeyReader(ctx.ledger, { kind: "attempt", service: "gemini-image", cost_usd: 0.97 });
    const fake = new FakeCaller();
    const r = await run(ctx.args({ in: still, extra: ["--live"] }), fake, race.reader);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("over-ceiling");
    expect(r.err).toContain("0.970"); // the re-read total saw the racing 0.97
    expect(fake.calls.length).toBe(0);
    expect(race.after()).not.toBeNull();
    expect(readBytes(ctx.ledger)).toEqual(race.after()); // no attempt line on top of the racing append
    expect(fs.existsSync(`${ctx.ledger}.lock`)).toBe(false); // the lock is released, not left behind
  });

  it("t-lock-1: a dry run with an existing <record>.lock refuses ledger-busy; the lock is neither stolen nor removed", async () => {
    const ctx = makeCtx();
    fs.writeFileSync(`${ctx.ledger}.lock`, ""); // another run holds the lock
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ in: still }), fake);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("ledger-busy");
    expect(r.err).toContain("lock file");
    expect(fake.calls.length).toBe(0);
    expect(readBytes(ctx.ledger)).toBeNull();
    expect(readBytes(`${ctx.ledger}.lock`)).toEqual(Buffer.alloc(0)); // still there, untouched
  });

  it("t-lock-2: live, the lock file appearing during the key read refuses ledger-busy; the lock is neither stolen nor removed", async () => {
    const ctx = makeCtx();
    const still = writeStill(ctx.tmp);
    const fake = new FakeCaller();
    const reader = (): string => {
      fs.writeFileSync(`${ctx.ledger}.lock`, ""); // the other run takes the lock first
      return KEY;
    };
    const r = await run(ctx.args({ in: still, extra: ["--live"] }), fake, reader);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("ledger-busy");
    expect(r.err).toContain(`lock file ${path.join(fs.realpathSync(ctx.tmp), "ledger.jsonl")}.lock exists`); // the run names the real path
    expect(fake.calls.length).toBe(0);
    expect(readBytes(ctx.ledger)).toBeNull(); // no attempt line
    expect(readBytes(`${ctx.ledger}.lock`)).toEqual(Buffer.alloc(0)); // neither stolen nor removed
  });
});
