/**
 * Row A48 — unit tests for the video:gen tool. Made-up values only; the fake caller
 * records each URL/header it is handed and returns made-up bytes. NO REAL CALL:
 * globalThis.fetch is replaced (before the module under test loads) with a counter
 * that throws, and an afterAll asserts the count stayed 0.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import type { CliResult, FileState, GenerateResult, NetCall, VideoCaller, VideoGenDeps } from "../videogen";

type VG = typeof import("../videogen");

// ── no-network fence, installed before the module under test is loaded ──────────────────

let fetchCount = 0;
const realFetch = globalThis.fetch;
(globalThis as { fetch: typeof fetch }).fetch = (() => {
  fetchCount++;
  throw new Error("network is disabled in videogen tests");
}) as typeof fetch;

let vg: VG;

// the Keychain lookup is faked at the module level: the builtin's execFileSync
// property is non-configurable, so jest.mock replaces the module the adapter sees
const mockExecCalls: { file: string; args: string[] }[] = [];
jest.mock("child_process", () => {
  const actual = jest.requireActual("child_process") as Record<string, unknown>;
  return {
    ...actual,
    execFileSync: (file: string, args: readonly string[]): string => {
      mockExecCalls.push({ file, args: [...args] });
      return "chain-key-not-real\n";
    },
  };
});
beforeAll(() => {
  jest.isolateModules(() => {
    vg = require("../videogen");
  });
});
afterAll(() => {
  expect(fetchCount).toBe(0);
  (globalThis as { fetch: typeof fetch }).fetch = realFetch;
});

// ── made-up values and helpers ─────────────────────────────────────────────────────────

const KEY = "test-key-not-real";
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PROMPT_A_TEXT =
  "Static overhead security-camera view looking straight down at one row of an indoor concrete " +
  "parking garage, single continuous shot, no camera movement, no scene cuts. Fluorescent ceiling " +
  "light, slightly worn grey concrete floor with plain white bay lines, plain unmarked round " +
  "concrete pillars. Every bay is filled with ordinary everyday cars. A small red hatchback drives " +
  "slowly along the lane from the bottom of the frame to the top, brake lights glowing briefly as " +
  "it pauses. Realistic, filmed on a real camera, natural motion blur, subtle sensor noise. " +
  "Surfaces are plain with no writing, signs or numbers.";
const SAFE_PROMPT = "a made-up plain prompt for a test video";

const sha = (b: Buffer): string => crypto.createHash("sha256").update(b).digest("hex");

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "a48-vg-test-"));
}

interface ArgsOpts {
  prompt?: string;
  firstFrame?: string;
  refs?: string[];
  model?: string;
  seconds?: string;
  resolution?: string;
  aspect?: string;
  out?: string;
  ledger?: string;
  ceiling?: string;
  timeout?: string;
  extra?: string[];
  drop?: string[];
}

interface Ctx {
  tmp: string;
  promptFile: string;
  out: string;
  ledger: string;
  args: (o?: ArgsOpts) => string[];
}

function makeCtx(promptText = SAFE_PROMPT): Ctx {
  const tmp = mkTmp();
  const promptFile = path.join(tmp, "prompt.txt");
  fs.writeFileSync(promptFile, promptText);
  const out = path.join(tmp, "out");
  fs.mkdirSync(out);
  const ledger = path.join(tmp, "ledger.jsonl");
  const args = (o: ArgsOpts = {}): string[] => {
    const full = [
      "--prompt", o.prompt ?? promptFile,
      "--model", o.model ?? "gemini-omni-1.2-flash",
      "--seconds", o.seconds ?? "6",
      "--resolution", o.resolution ?? "720p",
      "--aspect", o.aspect ?? "9:16",
      "--out", o.out ?? out,
      "--ledger", o.ledger ?? ledger,
      "--ceiling-usd", o.ceiling ?? "1",
    ];
    if (o.timeout) full.push("--timeout-seconds", o.timeout);
    if (o.firstFrame) full.push("--first-frame", o.firstFrame);
    for (const r of o.refs ?? []) full.push("--ref", r);
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
  return { tmp, promptFile, out, ledger, args };
}

function writePng(dir: string, name = "frame.png", bytes = PNG_BYTES): string {
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

class FakeCaller implements VideoCaller {
  calls: NetCall[] = [];
  generateCount = 0;
  statusCount = 0;
  downloadCount = 0;
  gen: () => Promise<GenerateResult> = async () => ({ kind: "no-video" });
  states: FileState[] = [];
  dl = Buffer.from("made-up-download-bytes");

  async generate(call: NetCall): Promise<GenerateResult> {
    this.calls.push(call);
    this.generateCount++;
    return this.gen();
  }
  async fileStatus(call: NetCall): Promise<FileState> {
    this.calls.push(call);
    this.statusCount++;
    return this.states.shift() ?? "ready";
  }
  async download(call: NetCall): Promise<Buffer> {
    this.calls.push(call);
    this.downloadCount++;
    return this.dl;
  }
}

// key-leak canaries for test 19, filled by tests 2 to 5 and 17
const captures: { label: string; text: string }[] = [];
function capture(label: string, r: CliResult, fake: FakeCaller, ledgerPath: string): void {
  captures.push({
    label,
    text: [r.out, r.err, readBytes(ledgerPath)?.toString("utf8") ?? "", fake.calls.map((c) => `${c.method} ${c.url}`).join("\n")].join("\n"),
  });
}

/** Run with injected fakes; if the module itself throws, its text and cause must hold no key. */
async function run(argv: string[], fake: FakeCaller, keyReader: () => string = () => KEY): Promise<CliResult> {
  const deps: VideoGenDeps = { caller: fake, keyReader, pollIntervalMs: 1 };
  try {
    return await vg.runVideoGen(argv, deps);
  } catch (e) {
    expect(e instanceof Error ? e.message : String(e)).not.toContain(KEY);
    const cause = (e as { cause?: unknown }).cause;
    if (cause !== undefined && cause !== null) {
      expect(cause instanceof Error ? cause.message : String(cause)).not.toContain(KEY);
    }
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

function live(ctx: Ctx, o: ArgsOpts = {}): string[] {
  return ctx.args({ ...o, extra: [...(o.extra ?? []), "--live"] });
}

// ── (1) dry run ────────────────────────────────────────────────────────────────────────

describe("1 dry run", () => {
  it("estimates 0.420 for 6 s 720p, calls and reads nothing, writes nothing", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const keyReader = jest.fn(() => KEY);
    const r = await vg.runVideoGen(ctx.args({ seconds: "6", resolution: "720p" }), { caller: fake, keyReader });
    expect(r.code).toBe(0);
    expect(r.out).toContain("usd=0.420");
    expect(r.out).toContain("model=gemini-omni-1.2-flash seconds=6 resolution=720p");
    expect(r.out).toContain("price-read=2026-11-21");
    expect(fake.calls.length).toBe(0);
    expect(keyReader).not.toHaveBeenCalled();
    expect(fs.readdirSync(ctx.out).length).toBe(0);
    expect(readBytes(ctx.ledger)).toBeNull();
  });

  it("estimates 0.161 for 7 s 360p", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const r = await vg.runVideoGen(ctx.args({ seconds: "7", resolution: "360p" }), { caller: fake, keyReader: () => KEY });
    expect(r.code).toBe(0);
    expect(r.out).toContain("usd=0.161");
    expect(fake.calls.length).toBe(0);
  });

  it("prints the prompt text, image names, sizes and sha256", async () => {
    const ctx = makeCtx();
    const ff = writePng(ctx.tmp);
    const jpgBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("made-up-jpg-bytes")]);
    const ref = writePng(ctx.tmp, "ref-1.jpg", jpgBytes);
    const r = await vg.runVideoGen(ctx.args({ firstFrame: ff, refs: [ref] }));
    expect(r.code).toBe(0);
    expect(r.out).toContain(SAFE_PROMPT);
    expect(r.out).toContain(`file=frame.png bytes=${PNG_BYTES.length} sha256=${sha(PNG_BYTES)}`);
    expect(r.out).toContain(`file=ref-1.jpg bytes=${jpgBytes.length} sha256=${sha(jpgBytes)}`);
  });
});

// ── (2) live runs ──────────────────────────────────────────────────────────────────────

describe("2a live, inline reply", () => {
  it("saves the returned bytes byte for byte and writes attempt + outcome lines", async () => {
    const ctx = makeCtx();
    const ff = writePng(ctx.tmp);
    const bytes = Buffer.from("made-up-mp4-bytes-inline");
    const fake = new FakeCaller();
    fake.gen = async () => ({
      kind: "video",
      bytes,
      mimeType: "video/mp4",
      interactionId: "made-up-interaction-1",
      model: "gemini-omni-1.2-flash-reply",
    });
    const keyReader = jest.fn(() => KEY);
    const r = await run(live(ctx, { firstFrame: ff }), fake, () => keyReader());
    expect(keyReader).toHaveBeenCalledTimes(1);
    expect(r.code).toBe(0);

    // key in a header only, prompt text in the body
    expect(fake.calls.length).toBe(1);
    expect(fake.calls[0].headers["x-goog-api-key"]).toBe(KEY);
    expect(fake.calls[0].url).toContain("gemini-omni-1.2-flash");
    expect(fake.calls[0].url).not.toContain(KEY);
    const body = JSON.parse(fake.calls[0].body as string) as { contents: { parts: { text?: string }[] }[] };
    expect(body.contents[0].parts[0].text).toBe(SAFE_PROMPT);

    // saved file = returned bytes, byte for byte
    const saved = fs.readdirSync(ctx.out);
    expect(saved.length).toBe(1);
    const savedPath = path.join(ctx.out, saved[0]);
    expect(saved[0]).toMatch(/^clip-[0-9a-f-]+\.mp4$/);
    expect(sha(fs.readFileSync(savedPath))).toBe(sha(bytes));

    const lines = ledgerLines(ctx.ledger);
    expect(lines.length).toBe(2);
    const attempt = lines[0];
    expect(attempt.kind).toBe("attempt");
    expect(typeof attempt.attempt_id).toBe("string");
    expect(new Date(String(attempt.time)).toString()).not.toBe("Invalid Date");
    expect(attempt.service).toBe("gemini-omni");
    expect(attempt.sent).toEqual({
      model: "gemini-omni-1.2-flash",
      seconds: 6,
      resolution: "720p",
      aspect: "9:16",
      prompt_sha256: sha(Buffer.from(SAFE_PROMPT, "utf8")),
      image_sha256: [sha(PNG_BYTES)],
    });
    expect(attempt.cost_usd).toBe(0.42);
    expect(attempt.cost_how).toEqual({ rate_usd_per_s: 0.07, price_read: "2026-11-21", basis: "list price x seconds, output video only" });
    expect(attempt.status).toBe("attempted");
    expect(attempt.interaction_id).toBeNull();
    const outcome = lines[1];
    expect(outcome.kind).toBe("outcome");
    expect(outcome.attempt_id).toBe(attempt.attempt_id);
    expect(outcome.service).toBe("gemini-omni");
    expect(outcome.cost_usd).toBe(0);
    expect(outcome.status).toBe("ok");
    expect(outcome.interaction_id).toBe("made-up-interaction-1");
    expect(outcome.model).toBe("gemini-omni-1.2-flash-reply");
    expect(outcome.file).toBe(saved[0]);
    capture("2a", r, fake, ctx.ledger);
  });
});

describe("2b live, uri reply", () => {
  it("polls the file until ready, downloads and saves the download bytes", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    fake.gen = async () => ({ kind: "uri", uri: "file:made-up-file-uri-1", interactionId: "made-up-interaction-2", model: "gemini-omni-1.2-flash" });
    fake.states = ["processing", "ready"];
    fake.dl = Buffer.from("made-up-download-bytes-xyz");
    const r = await run(live(ctx), fake);
    expect(r.code).toBe(0);
    expect(fake.statusCount).toBe(2); // a not-ready then a ready status
    expect(fake.downloadCount).toBe(1);
    expect(fake.calls[0].headers["x-goog-api-key"]).toBe(KEY);
    const saved = fs.readdirSync(ctx.out);
    expect(saved.length).toBe(1);
    expect(sha(fs.readFileSync(path.join(ctx.out, saved[0])))).toBe(sha(fake.dl));
    const lines = ledgerLines(ctx.ledger);
    expect(lines.length).toBe(2);
    expect(lines[0].kind).toBe("attempt");
    expect(lines[1].status).toBe("ok");
    expect(lines[1].interaction_id).toBe("made-up-interaction-2");
    expect(lines[1].file).toBe(saved[0]);
    capture("2b", r, fake, ctx.ledger);
  });
});

// ── (3) the attempt line counts even when the call fails ───────────────────────────────

describe("3 attempt line kept on failure", () => {
  const cases: { label: string; status: string; make: () => Promise<GenerateResult> }[] = [
    { label: "throws", status: "error", make: async () => { throw Object.assign(new Error("made-up generate failure"), { cause: new Error("made-up cause detail") }); } },
    { label: "times out", status: "timeout", make: async () => { throw new vg.CallTimeout("generate"); } },
    { label: "returns 500", status: "http-500", make: async () => { throw new vg.HttpError(500); } },
  ];
  for (const c of cases) {
    it(`keeps the attempt line when the call ${c.label}`, async () => {
      const ctx = makeCtx();
      const fake = new FakeCaller();
      fake.gen = c.make;
      const r = await run(live(ctx), fake);
      expect(r.code).toBe(1);
      const lines = ledgerLines(ctx.ledger);
      expect(lines.length).toBe(2);
      expect(lines[0].kind).toBe("attempt");
      expect(lines[0].cost_usd).toBe(0.42);
      expect(lines[1].kind).toBe("outcome");
      expect(lines[1].status).toBe(c.status);
      capture(`3-${c.label}`, r, fake, ctx.ledger);
    });
  }
});

// ── (4) no automatic retry ────────────────────────────────────────────────────────────

describe("4 no retry", () => {
  it("a 503 is called exactly once, exit 1, outcome http-503", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    fake.gen = async () => {
      throw new vg.HttpError(503);
    };
    const r = await run(live(ctx), fake);
    expect(fake.generateCount).toBe(1);
    expect(fake.calls.length).toBe(1);
    expect(r.code).toBe(1);
    const lines = ledgerLines(ctx.ledger);
    expect(lines.length).toBe(2);
    expect(lines[1].status).toBe("http-503");
    capture("4", r, fake, ctx.ledger);
  });
});

// ── (5) no-video and blocked replies ──────────────────────────────────────────────────

describe("5 no-video and blocked", () => {
  it("a reply with no video part: exit 1, attempt kept, outcome no-video", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    fake.gen = async () => ({ kind: "no-video", interactionId: "made-up-interaction-3" });
    const r = await run(live(ctx), fake);
    expect(r.code).toBe(1);
    const lines = ledgerLines(ctx.ledger);
    expect(lines.length).toBe(2);
    expect(lines[0].kind).toBe("attempt");
    expect(lines[1].status).toBe("no-video");
    expect(lines[1].interaction_id).toBe("made-up-interaction-3");
    capture("5-no-video", r, fake, ctx.ledger);
  });

  it("a blocked reply: exit 1, attempt kept, outcome blocked", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    fake.gen = async () => ({ kind: "blocked", reason: "made-up-block-reason" });
    const r = await run(live(ctx), fake);
    expect(r.code).toBe(1);
    const lines = ledgerLines(ctx.ledger);
    expect(lines.length).toBe(2);
    expect(lines[1].status).toBe("blocked");
    capture("5-blocked", r, fake, ctx.ledger);
  });
});

// ── (6) usage refusals ────────────────────────────────────────────────────────────────

describe("6 usage", () => {
  it("refuses each bad-argument case with the ledger byte for byte unchanged", async () => {
    const ctx = makeCtx();
    fs.writeFileSync(ctx.ledger, '{"cost_usd":0.01}\n');
    const before = readBytes(ctx.ledger);
    const fake = new FakeCaller();
    const refs = [writePng(ctx.tmp, "r1.png"), writePng(ctx.tmp, "r2.png"), writePng(ctx.tmp, "r3.png"),
      writePng(ctx.tmp, "r4.png"), writePng(ctx.tmp, "r5.png"), writePng(ctx.tmp, "r6.png"), writePng(ctx.tmp, "r7.png")];
    const cases: { label: string; args: string[] }[] = [
      { label: "missing --prompt", args: ctx.args({ drop: ["--prompt"] }) },
      { label: "missing --model", args: ctx.args({ drop: ["--model"] }) },
      { label: "unknown flag", args: ctx.args({ extra: ["--bogus", "x"] }) },
      { label: "flag without value", args: [...ctx.args(), "--seconds"] },
      { label: "seconds 2", args: ctx.args({ seconds: "2" }) },
      { label: "seconds 16", args: ctx.args({ seconds: "16" }) },
      { label: "seconds 2.5", args: ctx.args({ seconds: "2.5" }) },
      { label: "seconds not a number", args: ctx.args({ seconds: "six" }) },
      { label: "aspect 16:9", args: ctx.args({ aspect: "16:9" }) },
      { label: "7 refs", args: ctx.args({ refs }) },
      { label: "ceiling 0", args: ctx.args({ ceiling: "0" }) },
      { label: "ceiling -1", args: ctx.args({ ceiling: "-1" }) },
      { label: "ceiling NaN", args: ctx.args({ ceiling: "NaN" }) },
      { label: "ceiling Infinity", args: ctx.args({ ceiling: "Infinity" }) },
      { label: "ceiling 1e9", args: ctx.args({ ceiling: "1e9" }) },
      { label: "ceiling $1", args: ctx.args({ ceiling: "$1" }) },
      { label: "ceiling 1,00", args: ctx.args({ ceiling: "1,00" }) },
      { label: "ceiling 21 above the 20 cap", args: ctx.args({ ceiling: "21" }) },
    ];
    for (const c of cases) {
      const r = await run(c.args, fake);
      expect([c.label, r.code]).toEqual([c.label, 2]);
      expect([c.label, r.err.trim().split(/\s+/)[0]]).toEqual([c.label, "usage"]);
      expect([c.label, readBytes(ctx.ledger)]).toEqual([c.label, before]);
    }
    expect(fake.calls.length).toBe(0);
  });
});

// ── (7) out-bad ───────────────────────────────────────────────────────────────────────

describe("7 out-bad", () => {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const maybeIt = process.platform === "win32" ? it.skip : it;

  it("refuses a missing out folder", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const r = await run(ctx.args({ out: path.join(ctx.tmp, "no-such-dir") }), fake);
    await expectRefusal(r, "out-bad", fake, ctx.ledger);
  });

  it("refuses an out path that is a file", async () => {
    const ctx = makeCtx();
    const file = path.join(ctx.tmp, "a-file.txt");
    fs.writeFileSync(file, "x");
    const fake = new FakeCaller();
    const r = await run(ctx.args({ out: file }), fake);
    await expectRefusal(r, "out-bad", fake, ctx.ledger);
  });

  maybeIt("refuses an out folder that is a symlink (win32 needs admin rights to make one)", async () => {
    const ctx = makeCtx();
    const target = mkTmp();
    const link = path.join(mkTmp(), "out-link");
    fs.symlinkSync(target, link);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ out: link }), fake);
    await expectRefusal(r, "out-bad", fake, ctx.ledger);
  });

  it("refuses an out folder inside the repo outside out/", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const r = await run(ctx.args({ out: path.join(repoRoot, "adapters") }), fake);
    await expectRefusal(r, "out-bad", fake, ctx.ledger);
  });

  it("refuses a ledger inside the repo outside out/", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const r = await run(ctx.args({ ledger: path.join(repoRoot, "adapters", "made-up-ledger.jsonl") }), fake);
    await expectRefusal(r, "out-bad", fake, ctx.ledger);
  });
});

// ── (8) input refusals ────────────────────────────────────────────────────────────────

describe("8 input checks", () => {
  it("refuses an unreadable prompt file", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const r = await run(ctx.args({ prompt: path.join(ctx.tmp, "no-prompt.txt") }), fake);
    await expectRefusal(r, "input-missing", fake, ctx.ledger);
  });

  it("refuses a missing first frame and a missing ref image", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const r1 = await run(ctx.args({ firstFrame: path.join(ctx.tmp, "no-frame.png") }), fake);
    await expectRefusal(r1, "input-missing", fake, ctx.ledger);
    const r2 = await run(ctx.args({ refs: [path.join(ctx.tmp, "no-ref.png")] }), fake);
    await expectRefusal(r2, "input-missing", fake, ctx.ledger);
  });

  it("refuses an image whose first bytes are not PNG or JPEG", async () => {
    const ctx = makeCtx();
    const notImage = path.join(ctx.tmp, "not-image.png");
    fs.writeFileSync(notImage, "just plain text, not an image");
    const fake = new FakeCaller();
    const r = await run(ctx.args({ firstFrame: notImage }), fake);
    await expectRefusal(r, "input-not-image", fake, ctx.ledger);
  });

  it("refuses an image above the size limit (the limit is a guess)", async () => {
    const ctx = makeCtx();
    const big = Buffer.concat([PNG_BYTES, Buffer.alloc(9 * 1024 * 1024)]);
    const bigPath = writePng(ctx.tmp, "big.png", big);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ firstFrame: bigPath }), fake);
    await expectRefusal(r, "input-too-big", fake, ctx.ledger);
  });
});

// ── (9) prompt-home-path, one case per pattern ────────────────────────────────────────

describe("9 prompt-home-path", () => {
  // the path fixtures are joined from parts so the diff itself holds no home path
  const macHome = "render " + ["", "Users", "madeupname", "file.txt"].join("/") + " as a sign";
  const linuxHome = "render " + ["", "home", "madeupname", "file.txt"].join("/") + " as a sign";
  const tildeHome = "render " + "~" + "/madeup/notes as a sign";
  const winHome = "render " + ["C:", "Users", "madeup", "file.txt"].join("\\") + " as a sign";
  const cases: [string, string][] = [
    ["mac home path", macHome],
    ["linux home path", linuxHome],
    ["tilde home path", tildeHome],
    ["windows home path", winHome],
  ];
  for (const [label, text] of cases) {
    it(`refuses a prompt with a ${label} path`, async () => {
      const ctx = makeCtx(text);
      const fake = new FakeCaller();
      const r = await run(ctx.args(), fake);
      await expectRefusal(r, "prompt-home-path", fake, ctx.ledger);
    });
  }
});

// ── (10) prompt-email ─────────────────────────────────────────────────────────────────

describe("10 prompt-email", () => {
  it("refuses a prompt with an e-mail address", async () => {
    const ctx = makeCtx("contact someone@example-com.test for details");
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    await expectRefusal(r, "prompt-email", fake, ctx.ledger);
  });
});

// ── (11) prompt-plate ─────────────────────────────────────────────────────────────────

describe("11 prompt-plate", () => {
  it("refuses a made-up plate ab-1234", async () => {
    const ctx = makeCtx("a car with plate ab-1234 parked");
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    await expectRefusal(r, "prompt-plate", fake, ctx.ledger);
  });

  it("refuses a made-up plate XYZ 123 A", async () => {
    const ctx = makeCtx("a car with plate XYZ 123 A parked");
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    await expectRefusal(r, "prompt-plate", fake, ctx.ledger);
  });

  it("refuses a money-like text such as USD 1260 (noted in the PR)", async () => {
    const ctx = makeCtx("a budget of USD 1260 in total");
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    await expectRefusal(r, "prompt-plate", fake, ctx.ledger);
  });

  it("does not refuse the longer word XSBA1234AB", async () => {
    const ctx = makeCtx("the code word XSBA1234AB is not a plate");
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    expect(r.code).toBe(0);
    expect(fake.calls.length).toBe(0);
  });
});

// ── (12) the plan's prompt A is not refused ───────────────────────────────────────────

describe("12 prompt A", () => {
  it("accepts the plan's prompt A text", async () => {
    const ctx = makeCtx(PROMPT_A_TEXT);
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    expect(r.code).toBe(0);
    expect(r.out).toContain("usd=0.420");
    expect(fake.calls.length).toBe(0);
  });
});

// ── (13) price-unknown ────────────────────────────────────────────────────────────────

describe("13 price-unknown", () => {
  it("refuses an unknown model", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const r = await run(ctx.args({ model: "made-up-model" }), fake);
    await expectRefusal(r, "price-unknown", fake, ctx.ledger);
  });

  it("refuses an unknown resolution", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    const r = await run(ctx.args({ resolution: "1440p" }), fake);
    await expectRefusal(r, "price-unknown", fake, ctx.ledger);
  });
});

// ── (14) ledger-unreadable ────────────────────────────────────────────────────────────

describe("14 ledger-unreadable", () => {
  const cases: [string, string][] = [
    ["a non-JSON line", "not-json\n"],
    ["a line without cost_usd", '{"x":1}\n'],
    ["a last line with no final newline", '{"cost_usd":0.1}'],
  ];
  for (const [label, text] of cases) {
    it(`refuses ${label}`, async () => {
      const ctx = makeCtx();
      fs.writeFileSync(ctx.ledger, text);
      const before = readBytes(ctx.ledger);
      const fake = new FakeCaller();
      const r = await run(ctx.args(), fake);
      expect(r.code).toBe(2);
      expect(r.err.trim().split(/\s+/)[0]).toBe("ledger-unreadable");
      expect(fake.calls.length).toBe(0);
      expect(readBytes(ctx.ledger)).toEqual(before);
    });
  }
});

// ── (15) ledger-busy and the lock ─────────────────────────────────────────────────────

describe("15 ledger lock", () => {
  it("refuses with ledger-busy, naming the lock file, when it exists", async () => {
    const ctx = makeCtx();
    fs.writeFileSync(`${ctx.ledger}.lock`, "");
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("ledger-busy");
    expect(r.err).toContain(`${ctx.ledger}.lock`);
    expect(fake.calls.length).toBe(0);
    expect(readBytes(ctx.ledger)).toBeNull();
  });

  it("the lock file is gone after a normal run", async () => {
    const ctx = makeCtx();
    const fake = new FakeCaller();
    fake.gen = async () => ({ kind: "video", bytes: Buffer.from("made-up-bytes"), mimeType: "video/mp4" });
    const r = await run(live(ctx), fake);
    expect(r.code).toBe(0);
    expect(fs.existsSync(`${ctx.ledger}.lock`)).toBe(false);
    expect(ledgerLines(ctx.ledger).length).toBe(2);
  });
});

// ── (16) over-ceiling, equal is allowed ───────────────────────────────────────────────

describe("16 over-ceiling", () => {
  it("refuses 0.58 spent plus 0.42 against 0.99", async () => {
    const ctx = makeCtx();
    fs.writeFileSync(ctx.ledger, '{"cost_usd":0.58}\n');
    const fake = new FakeCaller();
    const r = await run(ctx.args({ ceiling: "0.99" }), fake);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("over-ceiling");
    expect(fake.calls.length).toBe(0);
    expect(ledgerLines(ctx.ledger).length).toBe(1);
  });

  it("allows 0.58 spent plus 0.42 against 1.00 (equal passes)", async () => {
    const ctx = makeCtx();
    fs.writeFileSync(ctx.ledger, '{"cost_usd":0.58}\n');
    const fake = new FakeCaller();
    const r = await run(ctx.args({ ceiling: "1.00" }), fake);
    expect(r.code).toBe(0);
    expect(ledgerLines(ctx.ledger).length).toBe(1); // dry run adds no line
  });
});

// ── (17) key-missing (live only) ──────────────────────────────────────────────────────

describe("17 key-missing", () => {
  const readers: [string, () => string][] = [
    ["a throwing reader", () => { throw new Error("no key found"); }],
    ["an empty key", () => ""],
    ["a blank key", () => "  "],
  ];
  for (const [label, reader] of readers) {
    it(`refuses with key-missing for ${label}, ledger untouched`, async () => {
      const ctx = makeCtx();
      const fake = new FakeCaller();
      const r = await run(live(ctx), fake, reader);
      expect(r.code).toBe(2);
      expect(r.err.trim().split(/\s+/)[0]).toBe("key-missing");
      expect(fake.calls.length).toBe(0);
      expect(readBytes(ctx.ledger)).toBeNull();
      capture(`17-${label}`, r, fake, ctx.ledger);
    });
  }
});

// ── (18) the default key reader: env, then Keychain (mocked) ──────────────────────────

describe("18 default key reader", () => {
  it("reads the key from $GEMINI_API_KEY", async () => {
    const old = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "env-key-not-real";
    try {
      const ctx = makeCtx();
      const fake = new FakeCaller();
      fake.gen = async () => ({ kind: "video", bytes: Buffer.from("made-up"), mimeType: "video/mp4" });
      const r = await vg.runVideoGen(live(ctx), { caller: fake, pollIntervalMs: 1 }); // default key reader
      expect(r.code).toBe(0);
      expect(fake.calls[0].headers["x-goog-api-key"]).toBe("env-key-not-real");
    } finally {
      if (old === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = old;
    }
  });

  it("reads the key from the macOS Keychain path (execFileSync mocked, no real read)", async () => {
    const oldKey = process.env.GEMINI_API_KEY;
    const oldSvc = process.env.GEMINI_KEYCHAIN_SERVICE;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_KEYCHAIN_SERVICE;
    mockExecCalls.length = 0;
    try {
      const ctx = makeCtx();
      const fake = new FakeCaller();
      fake.gen = async () => ({ kind: "video", bytes: Buffer.from("made-up"), mimeType: "video/mp4" });
      const r = await vg.runVideoGen(live(ctx), { caller: fake, pollIntervalMs: 1 });
      expect(r.code).toBe(0);
      expect(fake.calls[0].headers["x-goog-api-key"]).toBe("chain-key-not-real");
      expect(mockExecCalls.length).toBe(1);
      expect(mockExecCalls[0].file).toBe("security");
      expect(mockExecCalls[0].args).toContain("find-generic-password");
    } finally {
      mockExecCalls.length = 0;
      if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = oldKey;
      if (oldSvc === undefined) delete process.env.GEMINI_KEYCHAIN_SERVICE;
      else process.env.GEMINI_KEYCHAIN_SERVICE = oldSvc;
    }
  });
});

// ── (19) the key reaches no URL, output, ledger or error text ─────────────────────────

describe("19 key containment", () => {
  it("the made-up key appears in no captured URL, stdout, stderr, ledger or error text", () => {
    expect(captures.length).toBeGreaterThan(5);
    for (const c of captures) {
      expect([c.label, c.text.includes(KEY)]).toEqual([c.label, false]);
    }
  });
});

// ── (20) default path: dry run reads no key, runs no Keychain lookup ──────────────────

describe("20 default dry run reads no key", () => {
  it("makes 0 execFileSync calls and reads no key env var", async () => {
    const oldKey = process.env.GEMINI_API_KEY;
    const oldSvc = process.env.GEMINI_KEYCHAIN_SERVICE;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_KEYCHAIN_SERVICE;
    mockExecCalls.length = 0;
    try {
      const ctx = makeCtx(PROMPT_A_TEXT); // the hand dry run's prompt text
      // no deps: the CLI entry's default caller and default key reader
      const r = await vg.runVideoGen(ctx.args());
      expect(r.code).toBe(0);
      expect(r.out).toContain("usd=0.420");
      expect(r.out).toContain("price-read=2026-11-21");
      expect(r.out + r.err).not.toContain("GEMINI");
      expect(r.err).toBe("");
      expect(mockExecCalls.length).toBe(0); // no Keychain lookup in a dry run
      expect(readBytes(ctx.ledger)).toBeNull(); // no ledger file created
    } finally {
      mockExecCalls.length = 0;
      if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = oldKey;
      if (oldSvc === undefined) delete process.env.GEMINI_KEYCHAIN_SERVICE;
      else process.env.GEMINI_KEYCHAIN_SERVICE = oldSvc;
    }
  });
});
