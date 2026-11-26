/**
 * Row A57 — unit tests for the runway:audio swap call (adapters/runwayAudio.ts). Made-up
 * values only: the fake caller records each call and returns made-up bytes, the key reader is
 * injected, and the sound fixtures are made with the system ffmpeg. NO REAL CALL and no paid
 * step: globalThis.fetch is replaced (before the module under test loads) with a counter that
 * throws, and an afterAll asserts the count stayed 0.
 */

import * as crypto from "crypto";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { hasSystemFfmpeg, resolveSystemFfmpeg } from "../../video/contactSheet";
import type { CliResult, NetCall, RunwayAudioCaller, RunwayAudioDeps } from "../runwayAudio";

type RA = typeof import("../runwayAudio");
type RW = typeof import("../runway");
type VG = typeof import("../videogen");

// ── no-network fence, installed before the module under test is loaded ──────────────────

let fetchCount = 0;
const realFetch = globalThis.fetch;
(globalThis as { fetch: typeof fetch }).fetch = (() => {
  fetchCount++;
  throw new Error("network is disabled in runway-audio tests");
}) as typeof fetch;

let ra: RA;
let rw: RW;
let vg: VG;

beforeAll(() => {
  jest.isolateModules(() => {
    ra = require("../runwayAudio");
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
const PLAN_ID = "a57-made-up-swap-plan";
const API = "https://api.dev.runwayml.com/v1";
const ENDPOINT_URL = `${API}/speech_to_speech`;
const TASK = "made-up-task-1";
const DL_URL = "https://cdn.made-up-host.test/made-up-swap.mp3";
const DL_URL_2 = "https://cdn.made-up-host.test/made-up-swap-second.mp3";
const MODEL = "eleven_multilingual_sts_v2";

const REPO = path.resolve(__dirname, "..", "..");
const TRYOUT_PLAN = path.join(REPO, "tools", "runway-tryout-plan.json");

const sha = (b: Buffer): string => crypto.createHash("sha256").update(b).digest("hex");

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "a57-ra-test-"));
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

/** The value of name= on a printed line. */
function field(line: string, name: string): string {
  const m = new RegExp(`(?:^| )${name}=(\\S+)`).exec(line);
  if (!m) throw new Error(`no ${name}= on the line`);
  return m[1];
}

// a swap attempt line of this tool's shape (service runway, endpoint speech_to_speech)
const swapAttempt = (planId: string, clipId: string, cost = 0.02): Record<string, unknown> => ({
  kind: "attempt",
  service: "runway",
  cost_usd: cost,
  sent: { plan_id: planId, clip_id: clipId, endpoint: "speech_to_speech" },
});
const swapOutcome = (): Record<string, unknown> => ({ kind: "outcome", service: "runway", cost_usd: 0 });
// a video:tryout attempt line (service runway, a video endpoint)
const tryoutAttempt = (planId: string, clipId: string): Record<string, unknown> => ({
  kind: "attempt",
  service: "runway",
  cost_usd: 0.54,
  sent: { plan_id: planId, clip_id: clipId, endpoint: "text_to_video" },
});
const spendLine = (service: string, cost: number): Record<string, unknown> => ({ kind: "attempt", service, cost_usd: cost });

// ── fixtures: the system ffmpeg writes PCM; a run reads its temp folder from TMPDIR ─────

const ON_WIN32 = process.platform === "win32";
const FFMPEG = !ON_WIN32 && hasSystemFfmpeg() ? resolveSystemFfmpeg() : null;
const maybeIt = ON_WIN32 || FFMPEG === null ? it.skip : it;
const NEEDS_TOOL = "(needs the system ffmpeg or a POSIX file kind: skipped on win32 and without ffmpeg)";

/** A test that needs the system ffmpeg, a symlink, a FIFO or a device. */
function toolIt(name: string, fn: () => Promise<void>): void {
  maybeIt(`${name} ${NEEDS_TOOL}`, fn);
}

function ffmpeg(args: string[], input?: Buffer): void {
  execFileSync(FFMPEG as string, ["-hide_banner", "-loglevel", "error", "-nostdin", ...args], {
    input,
    stdio: ["pipe", "ignore", "pipe"],
    maxBuffer: 16 * 1024 * 1024,
  });
}

function ffprobeBin(): string {
  const sibling = path.join(path.dirname(FFMPEG as string), ON_WIN32 ? "ffprobe.exe" : "ffprobe");
  return fs.existsSync(sibling) ? sibling : "ffprobe";
}

function probe(file: string, entries: string): { streams: Record<string, unknown>[] } {
  return JSON.parse(
    execFileSync(ffprobeBin(), ["-v", "error", "-show_entries", entries, "-of", "json", file], { encoding: "utf8" }),
  ) as { streams: Record<string, unknown>[] };
}

/** A PCM WAV with exactly `samples` samples per channel, written by ffmpeg from made-up raw samples. */
function makeWav(dir: string, name: string, rate: number, channels: number, samples: number): string {
  const file = path.join(dir, name);
  const pcm = Buffer.alloc(samples * channels * 2);
  for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(Math.round(6000 * Math.sin(i / 97)), i);
  ffmpeg(["-f", "s16le", "-ar", String(rate), "-ac", String(channels), "-i", "pipe:0", "-c:a", "pcm_s16le", "-f", "wav", file], pcm);
  return file;
}

let wav6Bytes: Buffer | null = null;

/** The 6 s fixture (mono, 44100 Hz, 264600 samples) at the usual place of a context. */
function writeWav6(file: string): void {
  if (!wav6Bytes) {
    const dir = mkTmp();
    wav6Bytes = fs.readFileSync(makeWav(dir, "donor.wav", 44100, 1, 264600));
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.writeFileSync(file, wav6Bytes);
}

/** A container with two sound streams of different length (about 3 s and about 8 s), no picture. */
function makeTwoStreams(dir: string): string {
  const file = path.join(dir, "donor.mkv");
  ffmpeg([
    "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=3",
    "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=8",
    "-map", "0:a", "-map", "1:a", "-c:a", "pcm_s16le", file,
  ]);
  return file;
}

/** A clip with a picture and one AAC sound stream of about 6 s. */
function makeClip(dir: string, name = "donor.mp4", withSound = true): string {
  const file = path.join(dir, name);
  ffmpeg([
    "-f", "lavfi", "-i", "color=c=black:s=32x32:d=6",
    ...(withSound ? ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=6"] : []),
    "-map", "0:v", ...(withSound ? ["-map", "1:a"] : []),
    "-c:v", "mpeg4", "-pix_fmt", "yuv420p", ...(withSound ? ["-c:a", "aac"] : []),
    "-shortest", file,
  ]);
  return file;
}

/** A WAV header with no data at all: the 44 bytes of an empty 16-bit mono file. */
function makeEmptyWav(dir: string): string {
  const file = path.join(dir, "donor.wav");
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(44100, 24);
  h.writeUInt32LE(88200, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(0, 40);
  fs.writeFileSync(file, h);
  return file;
}

interface ArgsOpts {
  verb?: string | false;
  in?: string;
  voice?: string;
  noise?: string;
  planId?: string;
  out?: string;
  ledger?: string;
  ceiling?: string;
  timeout?: string;
  extra?: string[];
  drop?: string[];
}

interface Ctx {
  tmp: string;
  out: string;
  ledger: string;
  file: string;
  args: (o?: ArgsOpts) => string[];
}

function makeCtx(withSound = false): Ctx {
  const tmp = mkTmp();
  const out = path.join(tmp, "out");
  fs.mkdirSync(out);
  const ledger = path.join(tmp, "ledger.jsonl");
  const file = path.join(tmp, "donor.wav");
  if (withSound) writeWav6(file);
  const args = (o: ArgsOpts = {}): string[] => {
    const full = [
      ...(o.verb === false ? [] : [o.verb ?? "swap"]),
      "--in", o.in ?? file,
      "--voice", o.voice ?? "Bernard",
      "--remove-noise", o.noise ?? "true",
      "--plan-id", o.planId ?? PLAN_ID,
      "--out", o.out ?? out,
      "--ledger", o.ledger ?? ledger,
      "--ceiling-usd", o.ceiling ?? "46",
    ];
    if (o.timeout !== undefined) full.push("--timeout-seconds", o.timeout);
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
  return { tmp, out, ledger, file, args };
}

class FakeCaller implements RunwayAudioCaller {
  calls: NetCall[] = [];
  createCount = 0;
  statusCount = 0;
  downloadCount = 0;
  estimatedCost?: unknown; // goes in the create reply when set
  finalCost?: unknown; // goes in the terminal task reply when set
  taskId: string = TASK; // the id of the create reply
  statuses: unknown[] = []; // task-status replies, shifted; default an immediate SUCCEEDED
  outputs: unknown = [DL_URL]; // output of the default terminal reply
  failure?: unknown; // failure of the default terminal reply
  createHook?: (call: NetCall) => Promise<unknown>; // replaces the default create reply
  statusHook?: (call: NetCall) => Promise<unknown>; // replaces the default status reply
  downloadHook?: (call: NetCall) => Promise<Buffer>; // replaces the default download bytes
  downloadBytes: Buffer = Buffer.from(`ID3made-up-mp3-bytes-of-the-swap`);

  async create(call: NetCall): Promise<unknown> {
    this.calls.push(call);
    this.createCount++;
    if (this.createHook) return this.createHook(call);
    return { id: this.taskId, status: "PENDING", estimatedCost: this.estimatedCost };
  }
  async taskStatus(call: NetCall): Promise<unknown> {
    this.calls.push(call);
    this.statusCount++;
    if (this.statusHook) return this.statusHook(call);
    if (this.statuses.length > 0) return this.statuses.shift();
    return { id: TASK, status: "SUCCEEDED", output: this.outputs, cost: this.finalCost, failure: this.failure };
  }
  async download(call: NetCall): Promise<Buffer> {
    this.calls.push(call);
    this.downloadCount++;
    if (this.downloadHook) return this.downloadHook(call);
    return this.downloadBytes;
  }
}

/** A caller whose each step throws: it shows at once when a dry run sends something. */
class ThrowingCaller implements RunwayAudioCaller {
  calls: NetCall[] = [];
  private fail(c: NetCall): never {
    this.calls.push(c);
    throw new Error("the caller was used where no request may go");
  }
  create(c: NetCall): Promise<unknown> {
    this.fail(c);
  }
  taskStatus(c: NetCall): Promise<unknown> {
    this.fail(c);
  }
  download(c: NetCall): Promise<Buffer> {
    this.fail(c);
  }
}

/** The temp folder of a run: a fresh empty folder handed to the tool as its temp folder. */
function tempRoot(): string {
  return mkTmp();
}

/** Run with injected fakes; the temp folder of the run must be empty again afterwards. */
async function run(argv: string[], fake: RunwayAudioCaller, keyReader: () => string = () => KEY): Promise<CliResult> {
  const root = tempRoot();
  let r: CliResult;
  try {
    r = await ra.runRunwayAudio(argv, { caller: fake, keyReader, pollIntervalMs: 1, tempDir: root });
  } catch (e) {
    // if the module itself throws, its text must hold no key
    expect(e instanceof Error ? e.message : String(e)).not.toContain(KEY);
    throw e;
  }
  expect(fs.readdirSync(root)).toEqual([]); // the temp folder of the run is empty again
  return r;
}

interface Snap {
  ledger: Buffer | null;
  out: string[];
  lock: Buffer | null;
}

const snap = (ctx: Ctx): Snap => ({ ledger: readBytes(ctx.ledger), out: fs.readdirSync(ctx.out), lock: readBytes(`${ctx.ledger}.lock`) });

/** The record is byte-equal, --out holds no new file, and no lock file is left (a planted one stays). */
function expectUntouched(ctx: Ctx, s: Snap, keepLock = false): void {
  expect(readBytes(ctx.ledger)).toEqual(s.ledger);
  expect(fs.readdirSync(ctx.out)).toEqual(s.out);
  expect(readBytes(`${ctx.ledger}.lock`)).toEqual(keepLock ? s.lock : null);
}

/** Exit 2, one stderr line that starts with the code, no call, and nothing touched. */
function expectRefusal(r: CliResult, code: string, fake: { calls: NetCall[] }, ctx: Ctx, s: Snap, keepLock = false): void {
  expect([code, r.code]).toEqual([code, 2]);
  expect([code, r.out]).toEqual([code, ""]);
  const line = r.err.trim();
  expect([code, line.split("\n").length]).toEqual([code, 1]); // one line
  expect([code, line.split(/\s+/)[0]]).toEqual([code, code]); // the code is the first word
  expect([code, fake.calls.length]).toEqual([code, 0]); // no network step
  expectUntouched(ctx, s, keepLock);
}

/** The WAV bytes of the data URI the create call sent. */
function sentWav(fake: { calls: NetCall[] }): Buffer {
  const body = JSON.parse(fake.calls[0].body as string) as { media: { type: string; uri: string } };
  expect(body.media.type).toBe("audio");
  const prefix = "data:audio/wav;base64,";
  expect(body.media.uri.startsWith(prefix)).toBe(true);
  return Buffer.from(body.media.uri.slice(prefix.length), "base64");
}

/** The bytes of the data chunk and the bytes of its samples of a RIFF WAV (an independent read of the form). */
function wavData(wav: Buffer): { chunk: number; samples: number } {
  expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
  expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
  let off = 12;
  for (;;) {
    expect(off + 8).toBeLessThanOrEqual(wav.length);
    const id = wav.toString("ascii", off, off + 4);
    const size = wav.readUInt32LE(off + 4);
    if (id === "data") return { chunk: size, samples: wav.length - (off + 8) };
    off += 8 + size + (size % 2);
  }
}

/** A run that ended as `status`: exit 0 for ok and 1 else, one create call, an attempt line and one outcome line. */
function expectEnded(fake: FakeCaller, r: CliResult, ctx: Ctx, status: string): Record<string, unknown> {
  expect([status, r.code]).toEqual([status, status === "ok" ? 0 : 1]);
  expect([status, fake.createCount]).toEqual([status, 1]);
  const lines = ledgerLines(ctx.ledger);
  expect([status, lines.length]).toEqual([status, 2]);
  expect([status, lines[0].kind]).toEqual([status, "attempt"]);
  expect([status, lines[1].kind]).toEqual([status, "outcome"]);
  expect([status, lines[1].status]).toEqual([status, status]);
  expect([status, lines[1].attempt_id]).toEqual([status, lines[0].attempt_id]);
  expect([status, fs.existsSync(`${ctx.ledger}.lock`)]).toEqual([status, false]); // no lock file is left
  if (status !== "ok") expect([status, fs.readdirSync(ctx.out)]).toEqual([status, []]); // no file in --out
  return lines[1];
}

/** A key reader that first appends a text to the record plays another run that wrote between
 *  the first checks of the build and the lock taken in the live run. */
function racingKeyReader(ledger: string, text: string): { reader: () => string; after: () => Buffer | null } {
  let after: Buffer | null = null;
  return {
    reader: () => {
      fs.appendFileSync(ledger, text);
      after = readBytes(ledger); // the bytes right after the racing append
      return KEY;
    },
    after: () => after,
  };
}

const LIVE_ONLY = [[], ["--live"]] as string[][];

// ── (1) the dry run ────────────────────────────────────────────────────────────────────

describe("a57 dry run (the default)", () => {
  toolIt("dry", async () => {
    const ctx = makeCtx(true);
    const keyReader = jest.fn(() => {
      throw new Error("no key anywhere");
    });
    const fake = new ThrowingCaller();
    // a fetch stub of our own that throws and counts
    let stubbed = 0;
    const fence = globalThis.fetch;
    (globalThis as { fetch: typeof fetch }).fetch = (() => {
      stubbed++;
      throw new Error("a dry run must not reach fetch");
    }) as typeof fetch;
    let r1: CliResult;
    let r2: CliResult;
    try {
      r1 = await run(ctx.args(), fake, keyReader);
      r2 = await run(ctx.args(), fake, keyReader); // the same file again
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = fence;
    }
    expect(r1.code).toBe(0);
    expect(r1.err).toBe("");
    expect(r2.code).toBe(0);
    expect(r2.out).toBe(r1.out); // two dry runs on one file print the same three lines
    const lines = r1.out.split("\n");
    expect(lines.length).toBe(4); // three lines and the final newline
    expect(lines[0]).toBe("runway-audio: dry-run (no request sent, no key read, nothing written)");
    expect(lines[1]).toMatch(
      new RegExp(`^runway-audio: swap clip id=donor model=${MODEL} voice=Bernard remove-noise=true seconds=6 input-sha256=`),
    );
    expect(lines[1]).toContain(` input-sha256=${sha(fs.readFileSync(ctx.file))} audio-sha256=`);
    expect(lines[1]).toMatch(/ audio-sha256=[0-9a-f]{64} data-uri-chars=\d+ credits=2 estimate-usd=0\.020$/);
    expect(lines[2]).toBe("runway-audio: spend group=all spent usd=0.000 ceiling=46 room usd=46.000 room-after usd=45.980");
    expect(keyReader).not.toHaveBeenCalled(); // the dry run reads no key
    expect(fake.calls.length).toBe(0); // and calls nothing
    expect(stubbed).toBe(0);
    expect(readBytes(ctx.ledger)).toBeNull(); // writes nothing
    expect(fs.readdirSync(ctx.out)).toEqual([]);

    // a lock file is not looked at in the dry run
    fs.writeFileSync(`${ctx.ledger}.lock`, "made-up lock holder");
    const r3 = await run(ctx.args(), fake, keyReader);
    expect(r3.code).toBe(0);
    expect(r3.out).toBe(r1.out);
    fs.rmSync(`${ctx.ledger}.lock`);

    // and neither is the retry count
    writeLedger(ctx.ledger, [swapAttempt(PLAN_ID, "donor"), swapOutcome(), swapAttempt(PLAN_ID, "donor"), swapOutcome()]);
    const r4 = await run(ctx.args(), fake, keyReader);
    expect(r4.code).toBe(0);
    expect(keyReader).not.toHaveBeenCalled();
    expect(fake.calls.length).toBe(0);
  });

  toolIt("dry spend line", async () => {
    const ctx = makeCtx(true);
    writeLedger(ctx.ledger, [spendLine("gemini-image", 20), spendLine("elevenlabs", 25.98)]);
    const fake = new FakeCaller();
    const r = await run(ctx.args(), fake);
    expect(r.code).toBe(0);
    const lines = r.out.split("\n");
    expect(lines[2]).toBe("runway-audio: spend group=all spent usd=45.980 ceiling=46 room usd=0.020 room-after usd=0.000");
    expect(lines[1]).toMatch(/ credits=2 estimate-usd=0\.020$/);
  });
});

// ── (2) price and the sent sound ───────────────────────────────────────────────────────

describe("a57 price and the sent sound", () => {
  it("credits", () => {
    const rows: [number, number, number][] = [ // rate, samples per channel, credits
      [44100, 264600, 2], // 6 s
      [44100, 264601, 3],
      [44100, 266364, 3], // 6.04 s
      [44100, 22050, 1], // 0.5 s
      [44100, 132300, 1], // 3 s
      [44100, 132301, 2],
      [44100, 442323, 4], // 10.03 s
      [48000, 144000, 1],
      [48000, 144001, 2],
    ];
    for (const [rate, samples, credits] of rows) {
      expect([rate, samples, ra.creditsForAudio(samples, rate)]).toEqual([rate, samples, credits]);
    }
    // a whole multiple of 3 s costs one credit less than one sample above it
    for (const rate of [8000, 22050, 44100, 48000]) {
      expect([rate, 3, ra.creditsForAudio(3 * rate, rate)]).toEqual([rate, 3, 1]);
      expect([rate, 3, ra.creditsForAudio(3 * rate + 1, rate)]).toEqual([rate, 3, 2]);
      expect([rate, 6, ra.creditsForAudio(6 * rate, rate)]).toEqual([rate, 6, 2]);
      expect([rate, 6, ra.creditsForAudio(6 * rate + 1, rate)]).toEqual([rate, 6, 3]);
    }
    for (const bad of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => ra.creditsForAudio(bad, 44100)).toThrow("whole number above 0");
      expect(() => ra.creditsForAudio(264600, bad)).toThrow("whole number above 0");
    }
  });

  toolIt("credits of a fixture: 266364 samples (6.04 s) give credits=3, 132300 samples (3 s) give credits=1", async () => {
    for (const [samples, credits] of [[266364, 3], [132300, 1], [132301, 2]] as [number, number][]) {
      const ctx = makeCtx();
      const file = makeWav(ctx.tmp, "donor.wav", 44100, 1, samples);
      const r = await run(ctx.args({ in: file }), new FakeCaller());
      expect([samples, r.code]).toEqual([samples, 0]);
      const line = r.out.split("\n")[1];
      expect([samples, field(line, "credits")]).toEqual([samples, String(credits)]);
      expect([samples, field(line, "estimate-usd")]).toEqual([samples, `0.0${credits}0`]);
    }
  });

  toolIt("wav form", async () => {
    const rows: [string, number, number][] = [["a mono 22050 Hz fixture", 22050, 1], ["a stereo 44100 Hz fixture", 44100, 2]];
    for (const [label, rate, channels] of rows) {
      const ctx = makeCtx();
      const file = makeWav(ctx.tmp, "donor.wav", rate, channels, rate * 6);
      const fake = new FakeCaller();
      const r = await run(ctx.args({ in: file, extra: ["--live"] }), fake);
      expect([label, r.code]).toEqual([label, 0]);
      const sent = path.join(ctx.tmp, "sent.wav");
      fs.writeFileSync(sent, sentWav(fake));
      const { streams } = probe(sent, "stream=codec_type,codec_name,sample_rate,channels");
      expect([label, streams.length]).toEqual([label, 1]);
      expect([label, streams[0].codec_type]).toEqual([label, "audio"]);
      expect([label, streams[0].codec_name]).toEqual([label, "pcm_s16le"]);
      expect([label, streams[0].sample_rate]).toEqual([label, String(rate)]);
      expect([label, streams[0].channels]).toEqual([label, channels]);
    }
  });

  toolIt("two streams", async () => {
    const ctx = makeCtx();
    const file = makeTwoStreams(ctx.tmp);
    const { streams } = probe(file, "stream=codec_type");
    expect(streams.map((s) => s.codec_type)).toEqual(["audio", "audio"]); // the fixture: two sound streams
    // the container runs as long as its second stream (about 8 s), the first is about 3 s
    const container = JSON.parse(
      execFileSync(ffprobeBin(), ["-v", "error", "-show_entries", "format=duration", "-of", "json", file], { encoding: "utf8" }),
    ) as { format: { duration: string } };
    expect(Number(container.format.duration)).toBeGreaterThan(7.9);
    const r = await run(ctx.args({ in: file }), new FakeCaller());
    expect(r.code).toBe(0);
    const seconds = Number(field(r.out.split("\n")[1], "seconds"));
    expect(seconds).toBeGreaterThanOrEqual(3);
    expect(seconds).toBeLessThan(3.2); // the length of the FIRST sound stream, not of the second
  });

  toolIt("picture not sent", async () => {
    const ctx = makeCtx();
    const file = makeClip(ctx.tmp); // a picture and one AAC sound stream
    const fake = new FakeCaller();
    const r = await run(ctx.args({ in: file, extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    const sent = path.join(ctx.tmp, "sent.wav");
    fs.writeFileSync(sent, sentWav(fake));
    const { streams } = probe(sent, "stream=codec_type,codec_name");
    expect(streams.map((s) => s.codec_type)).toEqual(["audio"]);
    expect(streams[0].codec_name).toEqual("pcm_s16le");
  });
});

// ── (3) the one cap ────────────────────────────────────────────────────────────────────

describe("a57 cap", () => {
  toolIt("ceiling limit", async () => {
    const ctx = makeCtx(true);
    writeLedger(ctx.ledger, [spendLine("gemini-image", 20), spendLine("elevenlabs", 25.98)]);
    const before = snap(ctx);
    const ok = await run(ctx.args({ ceiling: "46" }), new FakeCaller());
    expect(ok.code).toBe(0);
    expect(ok.out).toContain("ceiling=46 ");
    for (const ceiling of ["46.01", "47"]) {
      for (const extra of LIVE_ONLY) {
        const fake = new FakeCaller();
        const keyReader = jest.fn(() => KEY);
        const r = await run(ctx.args({ ceiling, extra }), fake, keyReader);
        expect([ceiling, r.code]).toEqual([ceiling, 2]);
        expect([ceiling, r.err]).toEqual([ceiling, "usage --ceiling-usd must be above 0 and at most 46\n"]);
        expect(keyReader).not.toHaveBeenCalled();
        expect(fake.calls.length).toBe(0);
        expect(readBytes(ctx.ledger)).toEqual(before.ledger);
      }
    }
  });

  toolIt("other tools' lines count", async () => {
    const over = makeCtx(true);
    writeLedger(over.ledger, [spendLine("gemini-image", 20), spendLine("elevenlabs", 25.99)]);
    const before = readBytes(over.ledger);
    for (const extra of LIVE_ONLY) {
      const fake = new FakeCaller();
      const keyReader = jest.fn(() => KEY);
      const r = await run(over.args({ ceiling: "46", extra }), fake, keyReader);
      expect([extra.join(" "), r.code]).toEqual([extra.join(" "), 2]);
      expect(r.err.trim().split(/\s+/)[0]).toBe("over-ceiling");
      expect(r.err).toContain("spend record total 45.990 plus estimate 0.020 is above ceiling 46");
      expect(keyReader).not.toHaveBeenCalled(); // no key read
      expect(fake.calls.length).toBe(0); // no call
      expect(readBytes(over.ledger)).toEqual(before); // the record byte-equal
    }
    const exact = makeCtx(true);
    writeLedger(exact.ledger, [spendLine("gemini-image", 20), spendLine("elevenlabs", 25.98)]);
    const r = await run(exact.args({ ceiling: "46" }), new FakeCaller());
    expect(r.code).toBe(0);
  });

  toolIt("unknown service", async () => {
    const ctx = makeCtx(true);
    fs.writeFileSync(ctx.ledger, '{"cost_usd":0.1,"service":"not-a-known-service"}\n');
    const before = readBytes(ctx.ledger);
    for (const extra of LIVE_ONLY) {
      const fake = new FakeCaller();
      const r = await run(ctx.args({ extra }), fake);
      expect([extra.join(" "), r.code]).toEqual([extra.join(" "), 2]);
      expect([extra.join(" "), r.err.trim().split(/\s+/)[0]]).toEqual([extra.join(" "), "ledger-unreadable"]);
      expect(fake.calls.length).toBe(0);
      expect(readBytes(ctx.ledger)).toEqual(before);
    }
  });

  toolIt("over-ceiling under lock", async () => {
    const ctx = makeCtx(true);
    const fake = new FakeCaller();
    // the first check passes (no record yet); the key reader plays another tool's run that fills the cap
    const race = racingKeyReader(ctx.ledger, `${JSON.stringify(spendLine("gemini-image", 46))}\n`);
    const r = await run(ctx.args({ extra: ["--live"] }), fake, race.reader);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("over-ceiling");
    expect(r.err).toContain("spend record total 46.000 plus estimate 0.020 is above ceiling 46");
    expect(fake.calls.length).toBe(0); // no create call
    expect(race.after()).not.toBeNull();
    expect(readBytes(ctx.ledger)).toEqual(race.after()); // no attempt line of this run
    expect(fs.existsSync(`${ctx.ledger}.lock`)).toBe(false);
  });

  toolIt("unreadable under lock", async () => {
    const rows: [string, string][] = [
      ["a line of service not-a-known-service", `${JSON.stringify({ kind: "attempt", service: "not-a-known-service", cost_usd: 1 })}\n`],
      ["half a line with no final newline", '{"kind":"attempt","service":"runway"'],
    ];
    for (const [label, text] of rows) {
      const ctx = makeCtx(true);
      const fake = new FakeCaller();
      const race = racingKeyReader(ctx.ledger, text);
      const r = await run(ctx.args({ extra: ["--live"] }), fake, race.reader);
      expect([label, r.code]).toEqual([label, 2]);
      expect([label, r.err.trim().split(/\s+/)[0]]).toEqual([label, "ledger-unreadable"]);
      expect([label, fake.calls.length]).toEqual([label, 0]);
      expect(race.after()).not.toBeNull();
      expect([label, readBytes(ctx.ledger)]).toEqual([label, race.after()]); // no attempt line of this run
      expect([label, fs.existsSync(`${ctx.ledger}.lock`)]).toEqual([label, false]);
    }
  });

  toolIt("retry-limit", async () => {
    // 2 swap lines of this plan id and clip id: refused, and the key is not read
    const full = makeCtx(true);
    writeLedger(full.ledger, [swapAttempt(PLAN_ID, "donor"), swapOutcome(), swapAttempt(PLAN_ID, "donor"), swapOutcome()]);
    const before = readBytes(full.ledger);
    const fake = new FakeCaller();
    const keyReader = jest.fn(() => KEY);
    const r = await run(full.args({ extra: ["--live"] }), fake, keyReader);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("retry-limit");
    expect(keyReader).not.toHaveBeenCalled();
    expect(fake.calls.length).toBe(0);
    expect(readBytes(full.ledger)).toEqual(before);

    // 1 swap line with 2 video:tryout lines of the same plan id and clip id: not refused
    const mixed = makeCtx(true);
    writeLedger(mixed.ledger, [
      swapAttempt(PLAN_ID, "donor"), swapOutcome(),
      tryoutAttempt(PLAN_ID, "donor"), tryoutAttempt(PLAN_ID, "donor"),
    ]);
    const mixedFake = new FakeCaller();
    const r2 = await run(mixed.args({ extra: ["--live"] }), mixedFake);
    expect(r2.code).toBe(0);
    expect(mixedFake.createCount).toBe(1);

    // 2 swap lines of another plan id and 2 of another clip id: not refused
    const other = makeCtx(true);
    writeLedger(other.ledger, [
      swapAttempt("another-plan", "donor"), swapOutcome(), swapAttempt("another-plan", "donor"), swapOutcome(),
      swapAttempt(PLAN_ID, "another-clip"), swapOutcome(), swapAttempt(PLAN_ID, "another-clip"), swapOutcome(),
    ]);
    const otherFake = new FakeCaller();
    const r3 = await run(other.args({ extra: ["--live"] }), otherFake);
    expect(r3.code).toBe(0);
    expect(otherFake.createCount).toBe(1);

    // 1 swap attempt line with its outcome line counts as 1: a second run goes through
    const one = makeCtx(true);
    writeLedger(one.ledger, [swapAttempt(PLAN_ID, "donor"), swapOutcome()]);
    const oneFake = new FakeCaller();
    const r4 = await run(one.args({ extra: ["--live"] }), oneFake);
    expect(r4.code).toBe(0);
    expect(oneFake.createCount).toBe(1);
  });

  toolIt("retry-limit under lock", async () => {
    const ctx = makeCtx(true);
    const fake = new FakeCaller();
    writeLedger(ctx.ledger, [swapAttempt(PLAN_ID, "donor"), swapOutcome()]); // count 1 at the first check
    const race = racingKeyReader(ctx.ledger, `${JSON.stringify(swapAttempt(PLAN_ID, "donor"))}\n`); // count 2 under the lock
    const r = await run(ctx.args({ extra: ["--live"] }), fake, race.reader);
    expect(r.code).toBe(2);
    expect(r.err.trim().split(/\s+/)[0]).toBe("retry-limit");
    expect(fake.calls.length).toBe(0);
    expect(race.after()).not.toBeNull();
    expect(readBytes(ctx.ledger)).toEqual(race.after()); // the record as the key reader left it
    expect(fs.existsSync(`${ctx.ledger}.lock`)).toBe(false);
  });
});

// ── (4) the spend lines ────────────────────────────────────────────────────────────────

describe("a57 spend lines", () => {
  const attemptKeys = ["kind", "attempt_id", "time", "service", "sent", "cost_usd", "cost_how", "status"];
  const sentKeys = [
    "plan_id", "clip_id", "model", "endpoint", "seconds", "voice", "removeBackgroundNoise", "media_type",
    "input_clip_sha256", "input_audio_sha256",
  ];
  const outcomeKeys = [
    "kind", "attempt_id", "time", "service", "cost_usd", "status", "task_id", "estimated_cost_credits",
    "final_cost_credits", "file", "file_sha256", "failure",
  ];

  toolIt("line keys", async () => {
    const ctx = makeCtx(true);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ noise: "false", extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    const lines = ledgerLines(ctx.ledger);
    expect(lines.length).toBe(2);
    const att = lines[0];
    expect(Object.keys(att).sort()).toEqual([...attemptKeys].sort());
    expect(Object.keys(att).length).toBe(attemptKeys.length); // a key more or less fails
    expect(Object.keys(att.sent as object).sort()).toEqual([...sentKeys].sort());
    expect(Object.keys(att.cost_how as object).sort()).toEqual(["basis", "credits_per_3s", "price_read"]);
    expect(att.sent).toEqual({
      plan_id: PLAN_ID,
      clip_id: "donor",
      model: MODEL,
      endpoint: "speech_to_speech",
      seconds: 6,
      voice: { type: "runway-preset", presetId: "Bernard" },
      removeBackgroundNoise: false,
      media_type: "audio",
      input_clip_sha256: sha(fs.readFileSync(ctx.file)),
      input_audio_sha256: sha(sentWav(fake)),
    });
    expect(att.cost_usd).toBe(0.02);
    expect(att.cost_how).toEqual({
      credits_per_3s: 1,
      price_read: "2026-11-26",
      basis: "1 credit per 3 s of sent sound, rounded up to whole credits, at least 1 credit, x USD 0.01 per credit",
    });
    expect(att.status).toBe("attempted");
    expect(att.service).toBe("runway");
    expect(new Date(String(att.time)).toString()).not.toBe("Invalid Date");
    expect(String(att.time)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const id = String(att.attempt_id);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/); // 36 characters of lower-case hex and dashes
    const out = lines[1];
    expect(Object.keys(out).sort()).toEqual([...outcomeKeys].sort());
    expect(Object.keys(out).length).toBe(outcomeKeys.length);
    expect(out.attempt_id).toBe(id); // the same in both lines
    expect(out.service).toBe("runway");
    expect(out.status).toBe("ok");
  });

  toolIt("own lines count", async () => {
    const ctx = makeCtx(true);
    const first = new FakeCaller();
    const r1 = await run(ctx.args({ extra: ["--live"] }), first);
    expect(r1.code).toBe(0);
    expect(rw.countAttempts(ctx.ledger, PLAN_ID, "donor")).toBe(1); // the neighbour's count reads the line this tool wrote
    const second = new FakeCaller();
    const r2 = await run(ctx.args({ extra: ["--live"] }), second);
    expect(r2.code).toBe(0);
    const before = readBytes(ctx.ledger);
    const third = new FakeCaller();
    const keyReader = jest.fn(() => KEY);
    const r3 = await run(ctx.args({ extra: ["--live"] }), third, keyReader);
    expect(r3.code).toBe(2);
    expect(r3.err.trim().split(/\s+/)[0]).toBe("retry-limit");
    expect(keyReader).not.toHaveBeenCalled();
    expect(third.calls.length).toBe(0);
    expect(readBytes(ctx.ledger)).toEqual(before);
  });

  toolIt("attempt before call", async () => {
    const ctx = makeCtx(true);
    const fake = new FakeCaller();
    const seen: { atCall: Buffer | null } = { atCall: null };
    fake.createHook = async () => {
      seen.atCall = readBytes(ctx.ledger); // the record as the create call runs
      return { id: TASK, status: "PENDING" };
    };
    const r = await run(ctx.args({ extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    expect(seen.atCall).not.toBeNull();
    const atCall = String(seen.atCall && seen.atCall.toString("utf8"));
    expect(atCall.endsWith("\n")).toBe(true);
    const linesAtCall = atCall.split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(linesAtCall.length).toBe(1);
    expect(linesAtCall[0].kind).toBe("attempt");
    expect(linesAtCall[0].cost_usd).toBe(0.02);
    const lines = ledgerLines(ctx.ledger);
    expect(lines[1].attempt_id).toBe(linesAtCall[0].attempt_id); // the outcome line names that attempt
    expect(fs.existsSync(`${ctx.ledger}.lock`)).toBe(false); // the lock is released before the call
  });

  toolIt("outcome on error", async () => {
    const ctx = makeCtx(true);
    const fake = new FakeCaller();
    fake.createHook = async () => {
      throw new Error("made-up create failure");
    };
    const r = await run(ctx.args({ extra: ["--live"] }), fake);
    const outcome = expectEnded(fake, r, ctx, "error");
    expect(outcome.cost_usd).toBe(0);
    expect(String(outcome.failure)).toContain("made-up create failure");
    expect(r.err).toContain("made-up create failure");
    expect(r.err).not.toContain(KEY);
  });

  toolIt("cost forms", async () => {
    const rows: [string, unknown, unknown, string][] = [
      ["the object form", { credits: 2 }, { credits: 2 }, "cost-form estimate=object final=object"],
      ["the plain number", 2, 2, "cost-form estimate=number final=number"],
      ["neither field", undefined, undefined, "cost-form estimate=none final=none"],
    ];
    for (const [label, estimatedCost, cost, printed] of rows) {
      const ctx = makeCtx(true);
      const fake = new FakeCaller();
      fake.estimatedCost = estimatedCost;
      fake.finalCost = cost;
      const r = await run(ctx.args({ extra: ["--live"] }), fake);
      const outcome = expectEnded(fake, r, ctx, "ok");
      expect([label, r.out.trim().endsWith(printed)]).toEqual([label, true]);
      const n = typeof estimatedCost === "object" || typeof estimatedCost === "number" ? 2 : null;
      expect([label, outcome.estimated_cost_credits]).toEqual([label, n]);
      expect([label, outcome.final_cost_credits]).toEqual([label, n]);
      expect([label, outcome.cost_usd]).toEqual([label, 0]);
    }
  });

  toolIt("hostile cost", async () => {
    const rows: [string, unknown][] = [
      ["a negative object", { credits: -5 }],
      ["a text", "2"],
      ["a number above 1000000", 1000001],
      ["a missing field", undefined],
    ];
    for (const [label, value] of rows) {
      const ctx = makeCtx(true);
      const fake = new FakeCaller();
      fake.estimatedCost = value;
      fake.finalCost = value;
      const r = await run(ctx.args({ extra: ["--live"] }), fake);
      const outcome = expectEnded(fake, r, ctx, "ok");
      expect([label, outcome.estimated_cost_credits]).toEqual([label, null]);
      expect([label, outcome.final_cost_credits]).toEqual([label, null]);
      expect([label, outcome.cost_usd]).toEqual([label, 0]);
      expect(r.out.trim().endsWith("cost-form estimate=none final=none")).toBe(true);
      expect([label, vg.readLedgerTotal(ctx.ledger)]).toEqual([label, 20_000]); // the record still reads
    }
    const ctx = makeCtx(true);
    const fake = new FakeCaller();
    fake.finalCost = { credits: 2.5 }; // a fraction is taken
    const r = await run(ctx.args({ extra: ["--live"] }), fake);
    const outcome = expectEnded(fake, r, ctx, "ok");
    expect(outcome.final_cost_credits).toBe(2.5);
    expect(outcome.cost_usd).toBe(0.005);
    expect(vg.readLedgerTotal(ctx.ledger)).toBe(25_000);
  });

  toolIt("top-up", async () => {
    const ctx = makeCtx(true);
    const fake = new FakeCaller();
    fake.finalCost = { credits: 5 };
    const r = await run(ctx.args({ extra: ["--live"] }), fake);
    const outcome = expectEnded(fake, r, ctx, "ok");
    expect(outcome.final_cost_credits).toBe(5);
    expect(outcome.cost_usd).toBe(0.03); // (5 - 2) x USD 0.01
    expect(vg.readLedgerTotal(ctx.ledger)).toBe(50_000);
  });

  toolIt("newline", async () => {
    const ctx = makeCtx(true);
    const failing = new FakeCaller();
    failing.createHook = async () => {
      throw new Error("made-up create failure");
    };
    const r1 = await run(ctx.args({ extra: ["--live"] }), failing);
    expect(r1.code).toBe(1);
    const polling = new FakeCaller();
    polling.statuses = Array.from({ length: 1000 }, () => ({ id: TASK, status: "RUNNING" }));
    const r2 = await run(ctx.args({ timeout: "1", extra: ["--live"] }), polling);
    expect(r2.code).toBe(1);
    const raw = readBytes(ctx.ledger) as Buffer;
    expect(raw.toString("utf8").endsWith("\n")).toBe(true);
    const lines = raw.toString("utf8").split("\n").slice(0, -1);
    expect(lines.length).toBe(4); // two lines per run
    for (const line of lines) expect(typeof JSON.parse(line)).toBe("object"); // each line is JSON
  });

  toolIt("record readable", async () => {
    const ctx = makeCtx(true);
    writeLedger(ctx.ledger, [spendLine("gemini-image", 1)]);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    const lines = ledgerLines(ctx.ledger);
    expect(lines.length).toBe(3);
    expect([lines[1].service, lines[2].service]).toEqual(["runway", "runway"]);
    expect((lines[1].sent as Record<string, unknown>).endpoint).toBe("speech_to_speech");
    expect(vg.readLedgerTotal(ctx.ledger)).toBe(1_000_000 + 20_000);
    // the dry run of video:tryout on that record: exit 0, its spend line holds the total as spent
    const r2 = await rw.runRunwayTryout(["--plan", TRYOUT_PLAN, "--out", ctx.out, "--ledger", ctx.ledger, "--ceiling-usd", "25"]);
    expect(r2.code).toBe(0);
    expect(r2.out).toContain("runway: spend group=all spent usd=1.020 ceiling=25 ");
  });
});

// ── (5) how a live run can end ────────────────────────────────────────────────────────

describe("a57 how a live run can end", () => {
  toolIt("failed", async () => {
    const ctx = makeCtx(true);
    const fake = new FakeCaller();
    fake.statuses = [{ id: TASK, status: "FAILED", failure: "made-up failed detail" }];
    const r = await run(ctx.args({ extra: ["--live"] }), fake);
    const outcome = expectEnded(fake, r, ctx, "failed");
    expect(outcome.failure).toBe("made-up failed detail");
    expect(outcome.task_id).toBe(TASK);
    expect(r.err).toContain("made-up failed detail");
    expect(fake.downloadCount).toBe(0);
    // a failure text of 300 characters is written with 200
    const long = makeCtx(true);
    const longFake = new FakeCaller();
    longFake.statuses = [{ id: TASK, status: "FAILED", failure: "x".repeat(300) }];
    const r2 = await run(long.args({ extra: ["--live"] }), longFake);
    expectEnded(longFake, r2, long, "failed");
    expect(ledgerLines(long.ledger)[1].failure).toBe("x".repeat(200));
    expect(r2.err.trim().endsWith("x".repeat(200))).toBe(true);
    expect(r2.err).not.toContain("x".repeat(201));
  });

  toolIt("cancelled", async () => {
    const ctx = makeCtx(true);
    const fake = new FakeCaller();
    fake.statuses = [{ id: TASK, status: "CANCELLED", failure: null }];
    const r = await run(ctx.args({ extra: ["--live"] }), fake);
    const outcome = expectEnded(fake, r, ctx, "cancelled");
    expect(outcome.failure).toBeNull();
    expect(outcome.task_id).toBe(TASK);
    expect(r.err).toContain("runway-audio: cancelled attempt=");
    expect(fake.downloadCount).toBe(0);
  });

  toolIt("timeout", async () => {
    const ctx = makeCtx(true);
    const fake = new FakeCaller();
    fake.statuses = Array.from({ length: 1000 }, () => ({ id: TASK, status: "RUNNING" }));
    const r = await run(ctx.args({ timeout: "1", extra: ["--live"] }), fake);
    const outcome = expectEnded(fake, r, ctx, "timeout");
    expect(outcome.task_id).toBe(TASK);
    expect(outcome.estimated_cost_credits).toBeNull(); // no create estimate in this reply
    expect(fake.downloadCount).toBe(0);
    expect(fake.statusCount).toBeGreaterThan(10); // the poll ran until the timeout
  });

  toolIt("http", async () => {
    const created = makeCtx(true);
    const createFake = new FakeCaller();
    createFake.createHook = async () => {
      throw new vg.HttpError(400);
    };
    const r1 = await run(created.args({ extra: ["--live"] }), createFake);
    const o1 = expectEnded(createFake, r1, created, "http-400");
    expect(o1.task_id).toBeNull();
    expect(createFake.statusCount).toBe(0);
    const polled = makeCtx(true);
    const statusFake = new FakeCaller();
    statusFake.statusHook = async () => {
      throw new vg.HttpError(500);
    };
    const r2 = await run(polled.args({ extra: ["--live"] }), statusFake);
    const o2 = expectEnded(statusFake, r2, polled, "http-500");
    expect(o2.task_id).toBe(TASK);
    expect(statusFake.downloadCount).toBe(0);
  });

  toolIt("no-output", async () => {
    for (const reply of [{ id: TASK, status: "SUCCEEDED", output: [] }, { id: TASK, status: "SUCCEEDED" }]) {
      const ctx = makeCtx(true);
      const fake = new FakeCaller();
      fake.statuses = [reply];
      const r = await run(ctx.args({ extra: ["--live"] }), fake);
      const outcome = expectEnded(fake, r, ctx, "error");
      expect(String(outcome.failure)).toContain("no output url");
      expect(fake.downloadCount).toBe(0);
    }
  });

  toolIt("download fails after the cost was read", async () => {
    const ctx = makeCtx(true);
    const fake = new FakeCaller();
    fake.finalCost = { credits: 5 };
    fake.downloadHook = async () => {
      throw new Error("made-up download failure");
    };
    const r = await run(ctx.args({ extra: ["--live"] }), fake);
    const outcome = expectEnded(fake, r, ctx, "error");
    expect(outcome.final_cost_credits).toBe(5);
    expect(outcome.cost_usd).toBe(0.03); // the top-up stays in the outcome line
    expect(outcome.file).toBeNull();
    expect(outcome.file_sha256).toBeNull();
    expect(vg.readLedgerTotal(ctx.ledger)).toBe(50_000);
    expect(fake.downloadCount).toBe(1);
  });

  toolIt("ok", async () => {
    const ctx = makeCtx(true);
    const fake = new FakeCaller();
    fake.statuses = [
      { id: TASK, status: "PENDING" },
      { id: TASK, status: "THROTTLED" },
      { id: TASK, status: "RUNNING" },
      { id: TASK, status: "MADE_UP_STATUS" },
      { id: TASK, status: "SUCCEEDED", output: [DL_URL, DL_URL_2], cost: { credits: 2 } },
    ];
    const r = await run(ctx.args({ extra: ["--live"] }), fake);
    const outcome = expectEnded(fake, r, ctx, "ok");
    expect(fake.statusCount).toBe(5); // four replies that keep polling, then the terminal one
    expect(fake.downloadCount).toBe(1); // exactly one download call, of the FIRST output URL
    expect(fake.calls.map((c) => c.url)).toEqual([ENDPOINT_URL, ...Array.from({ length: 5 }, () => `${API}/tasks/${TASK}`), DL_URL]);
    const saved = fs.readdirSync(ctx.out);
    expect(saved.length).toBe(1); // one file in --out
    const id = String(outcome.attempt_id);
    expect(saved[0]).toBe(`donor-sts-Bernard-noisetrue-${id}.mp3`); // <clip id>-sts-<voice>-noise<true|false>-<attempt id>.<ext>
    expect(saved[0]).toMatch(/^donor-sts-Bernard-noisetrue-[0-9a-f-]{36}\.mp3$/);
    expect(outcome.file).toBe(saved[0]);
    expect(outcome.file_sha256).toBe(sha(fake.downloadBytes));
    expect(outcome.task_id).toBe(TASK);
    expect(outcome.final_cost_credits).toBe(2);
    expect(outcome.failure).toBeNull();
    expect(r.out).toBe(
      `runway-audio: wrote ${saved[0]} usd=0.020 attempt=${id} sha256=${sha(fake.downloadBytes)} cost-form estimate=none final=object\n`,
    );
    expect(r.err).toBe("");
  });

  toolIt("empty download", async () => {
    const ctx = makeCtx(true);
    const fake = new FakeCaller();
    fake.downloadBytes = Buffer.alloc(0);
    fake.finalCost = { credits: 2 };
    const r = await run(ctx.args({ extra: ["--live"] }), fake);
    const outcome = expectEnded(fake, r, ctx, "error");
    expect(outcome.final_cost_credits).toBe(2); // as the terminal reply gave it
    expect(String(outcome.failure)).toContain("0 bytes");
    expect(fake.downloadCount).toBe(1);
  });

  toolIt("bad task id", async () => {
    const rows: [string, string][] = [
      ["a text of 1 MB", "x".repeat(1_000_000)],
      ["an id with a slash", "abc/def"],
      ["an id with a line break", "abc\ndef"],
    ];
    for (const [label, id] of rows) {
      const ctx = makeCtx(true);
      const fake = new FakeCaller();
      fake.taskId = id;
      const r = await run(ctx.args({ extra: ["--live"] }), fake);
      const outcome = expectEnded(fake, r, ctx, "error");
      expect([label, outcome.task_id]).toEqual([label, null]);
      expect([label, fake.statusCount]).toEqual([label, 0]); // no status call
      expect([label, r.err.split("\n").length]).toEqual([label, 2]); // one line and the final newline
      expect(r.err.length).toBeLessThan(300); // the refused id is not echoed
      expect([label, r.err.includes("abc")]).toEqual([label, false]);
    }
  });

  toolIt("bad output url", async () => {
    const rows: [string, string][] = [
      ["http", "http://plain.made-up-host.test/made-up-swap.mp3"],
      ["file", "file:///made-up/made-up-swap.mp3"],
    ];
    for (const [label, url] of rows) {
      const ctx = makeCtx(true);
      const fake = new FakeCaller();
      fake.outputs = [url];
      const r = await run(ctx.args({ extra: ["--live"] }), fake);
      const outcome = expectEnded(fake, r, ctx, "error");
      expect([label, String(outcome.failure)]).toEqual([label, expect.stringContaining("https://")]);
      expect([label, fake.downloadCount]).toEqual([label, 0]); // no download call
    }
  });
});

// ── (6) the request and the saved file ────────────────────────────────────────────────

describe("a57 request and saved file", () => {
  toolIt("body", async () => {
    for (const noise of ["true", "false"]) {
      const ctx = makeCtx(true);
      const fake = new FakeCaller();
      const live = await run(ctx.args({ noise, extra: ["--live"] }), fake);
      expect([noise, live.code]).toEqual([noise, 0]);
      const dry = await run(ctx.args({ noise }), new FakeCaller());
      const call = fake.calls[0];
      expect([noise, call.method]).toEqual([noise, "POST"]);
      expect([noise, call.url]).toEqual([noise, ENDPOINT_URL]);
      expect([noise, call.headers.Authorization]).toEqual([noise, `Bearer ${KEY}`]);
      expect([noise, call.headers["X-Runway-Version"]]).toEqual([noise, "2024-11-06"]);
      expect([noise, call.headers["content-type"]]).toEqual([noise, "application/json"]);
      const body = JSON.parse(call.body as string) as { media: { type: string; uri: string } } & Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(["media", "model", "removeBackgroundNoise", "voice"]); // four keys and no other
      expect(body.model).toBe(MODEL);
      expect(body.voice).toEqual({ type: "runway-preset", presetId: "Bernard" });
      expect([noise, body.removeBackgroundNoise]).toEqual([noise, noise === "true"]);
      // the sha256 of the bytes decoded from the data URI is the hash of the sent WAV in both lines
      const wav = sentWav(fake);
      expect([noise, wavData(wav)]).toEqual([noise, { chunk: 264600 * 2, samples: 264600 * 2 }]); // a whole 6 s of 16-bit mono samples
      const att = ledgerLines(ctx.ledger)[0];
      expect([noise, (att.sent as Record<string, unknown>).input_audio_sha256]).toEqual([noise, sha(wav)]);
      expect([noise, (att.sent as Record<string, unknown>).seconds]).toEqual([noise, 6]);
      const dryLine = dry.out.split("\n")[1];
      expect([noise, field(dryLine, "seconds")]).toEqual([noise, "6"]);
      expect([noise, field(dryLine, "audio-sha256")]).toEqual([noise, sha(wav)]);
      expect([noise, field(dryLine, "data-uri-chars")]).toEqual([noise, String(body.media.uri.length)]);
      expect([noise, field(dryLine, "input-sha256")]).toEqual([noise, sha(fs.readFileSync(ctx.file))]);
    }
  });

  toolIt("saved as received", async () => {
    const ctx = makeCtx(true);
    const fake = new FakeCaller();
    fake.downloadBytes = Buffer.concat([Buffer.from("ID3"), crypto.randomBytes(5000)]); // bytes that no re-encode would keep
    const r = await run(ctx.args({ extra: ["--live"] }), fake);
    const outcome = expectEnded(fake, r, ctx, "ok");
    const saved = path.join(ctx.out, String(outcome.file));
    expect(fs.readFileSync(saved).equals(fake.downloadBytes)).toBe(true);
    expect(outcome.file_sha256).toBe(sha(fake.downloadBytes));
    expect(field(r.out, "sha256")).toBe(sha(fake.downloadBytes));
  });

  toolIt("extension", async () => {
    const rows: [string, Buffer, string][] = [
      ["ID3", Buffer.from("ID3made-up-tag"), "mp3"],
      ["an MPEG sound frame start", Buffer.from([0xff, 0xfb, 0x90, 0x00, 1, 2, 3]), "mp3"],
      ['RIFF with WAVE', Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt "), Buffer.alloc(8)]), "wav"],
      ["fLaC", Buffer.from("fLaCmade-up"), "flac"],
      ["OggS", Buffer.from("OggSmade-up"), "ogg"],
      ["ftyp at byte 4", Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypM4A "), Buffer.alloc(8)]), "m4a"],
      ["anything else", Buffer.from("made-up-bytes-with-no-known-start"), "bin"],
    ];
    for (const [label, bytes, ext] of rows) {
      const ctx = makeCtx(true);
      const fake = new FakeCaller();
      fake.downloadBytes = bytes;
      const r = await run(ctx.args({ extra: ["--live"] }), fake);
      const outcome = expectEnded(fake, r, ctx, "ok"); // a bin file is booked like the others
      expect([label, outcome.file]).toEqual([label, expect.stringMatching(new RegExp(`^donor-sts-Bernard-noisetrue-[0-9a-f-]{36}\\.${ext}$`))]);
    }
  });

  toolIt("one create", async () => {
    const ok = makeCtx(true);
    const okFake = new FakeCaller();
    expect((await run(ok.args({ extra: ["--live"] }), okFake)).code).toBe(0);
    expect(okFake.createCount).toBe(1);
    for (const failing of ["a create that throws", "a FAILED task", "a download that throws"] as const) {
      const ctx = makeCtx(true);
      const fake = new FakeCaller();
      if (failing === "a create that throws") {
        fake.createHook = async () => {
          throw new Error("made-up create failure");
        };
      } else if (failing === "a FAILED task") {
        fake.statuses = [{ id: TASK, status: "FAILED", failure: "made-up failure" }];
      } else {
        fake.downloadHook = async () => {
          throw new Error("made-up download failure");
        };
      }
      const r = await run(ctx.args({ extra: ["--live"] }), fake);
      expect([failing, r.code]).toEqual([failing, 1]);
      expect([failing, fake.createCount]).toEqual([failing, 1]); // a failed run sends no second create request
      expect([failing, ledgerLines(ctx.ledger).length]).toEqual([failing, 2]);
    }
  });

  toolIt("temp empty", async () => {
    const ctx = makeCtx(true);
    const fake = new FakeCaller();
    const root = tempRoot();
    expect(fs.readdirSync(root)).toEqual([]); // the temp folder variable points to an empty folder
    const r = await ra.runRunwayAudio(ctx.args({ extra: ["--live"] }), { caller: fake, keyReader: () => KEY, pollIntervalMs: 1, tempDir: root });
    expect(r.code).toBe(0);
    expect(fake.createCount).toBe(1);
    expect(fs.readdirSync(root)).toEqual([]); // and it is empty afterwards
  });

  toolIt("download has no key header", async () => {
    const ctx = makeCtx(true);
    const fake = new FakeCaller();
    const r = await run(ctx.args({ extra: ["--live"] }), fake);
    expect(r.code).toBe(0);
    const dl = fake.calls[fake.calls.length - 1];
    expect(dl.url).toBe(DL_URL);
    expect(dl.method).toBe("GET");
    expect(Object.keys(dl.headers).some((k) => k.toLowerCase() === "authorization")).toBe(false);
    expect(JSON.stringify(dl)).not.toContain(KEY);
    for (const c of fake.calls) expect(c.url).not.toContain(KEY); // the key rides in no URL
  });
});

// ── (7) the key reaches no output, no file and no download host ───────────────────────

describe("a57 key containment", () => {
  toolIt("key not shown", async () => {
    const tempNamesAtCreate: string[][] = [];
    // (a) a run that succeeds
    const ok = makeCtx(true);
    const okRoot = tempRoot();
    const okFake = new FakeCaller();
    okFake.createHook = async () => {
      tempNamesAtCreate.push(fs.readdirSync(okRoot)); // what lies under the temp folder while the keyed request is on its way
      return { id: TASK, status: "PENDING", estimatedCost: { credits: 2 } };
    };
    const r1 = await ra.runRunwayAudio(ok.args({ extra: ["--live"] }), { caller: okFake, keyReader: () => KEY, pollIntervalMs: 1, tempDir: okRoot });
    expect(r1.code).toBe(0);
    // the temp folder held the WAV only and is gone before a request that carries the key
    expect(tempNamesAtCreate).toEqual([[]]);
    expect(fs.readdirSync(okRoot)).toEqual([]);
    // (b) a failure text that holds the key
    const bad = makeCtx(true);
    const badFake = new FakeCaller();
    badFake.statuses = [{ id: TASK, status: "FAILED", failure: `made-up failure echoing ${KEY} in full` }];
    const r2 = await run(bad.args({ extra: ["--live"] }), badFake);
    expect(r2.code).toBe(1);
    expect(r2.err).toContain("[redacted]");
    expect(readBytes(bad.ledger)?.toString("utf8")).toContain("[redacted]");
    // (c) the key lies across character 200 of the failure text
    const edge = makeCtx(true);
    const edgeFake = new FakeCaller();
    edgeFake.statuses = [{ id: TASK, status: "FAILED", failure: `${"x".repeat(190)}${KEY}` }];
    const r3 = await run(edge.args({ extra: ["--live"] }), edgeFake);
    expect(r3.code).toBe(1);
    expect(readBytes(edge.ledger)?.toString("utf8")).toContain("[redacted]");

    // the fake caller saw the key in the Authorization header of the create and status calls
    for (const fake of [okFake, badFake, edgeFake]) {
      expect(fake.createCount).toBe(1);
      expect(fake.statusCount).toBeGreaterThanOrEqual(1);
      for (const c of fake.calls.slice(0, 2)) expect(c.headers.Authorization).toBe(`Bearer ${KEY}`);
    }

    const printed: string[] = [r1.out + r1.err, r2.out + r2.err, r3.out + r3.err];
    for (const ctx of [ok, bad, edge]) {
      printed.push(readBytes(ctx.ledger)?.toString("utf8") ?? "");
      for (const f of fs.readdirSync(ctx.out)) printed.push(fs.readFileSync(path.join(ctx.out, f), "utf8"));
    }
    for (const h of printed) {
      expect(h).not.toContain(KEY);
      // a cut before the scrub would leave the first part of the key: no 6-character piece may survive
      for (let i = 0; i + 6 <= KEY.length; i++) expect(h.includes(KEY.slice(i, i + 6))).toBe(false);
    }
    expect(readBytes(ok.ledger)?.toString("utf8")).toContain(`"presetId":"Bernard"`); // the rest of the line is intact
  });
});

// ── (8) the real caller through a fetch stub ──────────────────────────────────────────

describe("a57 real caller", () => {
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

  toolIt("real caller: the key header stays on the API host and a download redirect is followed", async () => {
    const ctx = makeCtx(true);
    const bytes = Buffer.from("ID3made-up-bytes-of-the-real-caller-run");
    const hop1 = "https://cdn-a.made-up-host.test/made-up-swap.mp3";
    const hop2 = "https://cdn-b.made-up-host.test/made-up-swap.mp3";
    const seen: Seen[] = [];
    const root = tempRoot();
    let r: CliResult | undefined;
    await withStubFetch(
      (u) => {
        if (u === ENDPOINT_URL) return res(200, { json: { id: "made-up-task-real", estimatedCost: { credits: 2 } } });
        if (u === `${API}/tasks/made-up-task-real`) {
          return res(200, { json: { status: "SUCCEEDED", output: [hop1], cost: { credits: 2 } } });
        }
        if (u === hop1) return res(302, { location: hop2 });
        if (u === hop2) return res(200, { bytes });
        return res(500, { json: { unexpected: u } });
      },
      seen,
      async () => {
        // a live run through the REAL caller: no caller in deps
        r = await ra.runRunwayAudio(ctx.args({ extra: ["--live"] }), { keyReader: () => KEY, pollIntervalMs: 1, tempDir: root });
      },
    );
    expect(fs.readdirSync(root)).toEqual([]);
    expect(r?.code).toBe(0);
    expect(seen.map((s) => s.url)).toEqual([ENDPOINT_URL, `${API}/tasks/made-up-task-real`, hop1, hop2]);
    expect(seen.map((s) => s.method)).toEqual(["POST", "GET", "GET", "GET"]);
    expect(seen[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(seen[1].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(seen[0].headers["X-Runway-Version"]).toBe("2024-11-06");
    for (const s of seen.slice(2)) {
      expect(Object.keys(s.headers).some((k) => k.toLowerCase() === "authorization")).toBe(false);
      expect(JSON.stringify(s)).not.toContain(KEY);
    }
    for (const s of seen) expect(s.redirect).toBe("manual");
    const outcome = ledgerLines(ctx.ledger)[1];
    expect(outcome.status).toBe("ok");
    expect(outcome.file_sha256).toBe(sha(bytes));
    expect(`${r?.out ?? ""}${r?.err ?? ""}${readBytes(ctx.ledger)?.toString("utf8") ?? ""}`).not.toContain(KEY);
    expect(fetchCount).toBe(0); // the fence itself was not called
  });
});

// ── (9) fail closed ───────────────────────────────────────────────────────────────────

const soundCtx = (): Ctx => makeCtx(true);

/** A context whose --in is a regular file with made-up bytes: the refusals below come before the input is read. */
function plainCtx(): Ctx {
  const ctx = makeCtx();
  fs.writeFileSync(ctx.file, "made-up bytes that are no sound");
  return ctx;
}

/** A temp folder that looks like a git work tree: a planted .git entry. */
function gitLike(): string {
  const dir = mkTmp();
  fs.writeFileSync(path.join(dir, ".git"), "gitdir: made-up\n");
  return dir;
}

const REQUIRED_OPTIONS = ["--in", "--voice", "--remove-noise", "--plan-id", "--out", "--ledger", "--ceiling-usd"];

const INPUT_MISSING: { label: string; posix: boolean; make: (ctx: Ctx) => string }[] = [
  { label: "a missing path", posix: false, make: (c) => path.join(c.tmp, "no-such-file.wav") },
  { label: "a folder", posix: false, make: (c) => c.out },
  {
    label: "a symlink to a sound file",
    posix: true,
    make: (c) => {
      const link = path.join(c.tmp, "link.wav");
      fs.symlinkSync(c.file, link);
      return link;
    },
  },
  {
    label: "a symlink to a device",
    posix: true,
    make: (c) => {
      const link = path.join(c.tmp, "link-device");
      fs.symlinkSync("/dev/null", link);
      return link;
    },
  },
  {
    label: "a symlink to a FIFO",
    posix: true,
    make: (c) => {
      const fifo = path.join(c.tmp, "made-up-fifo-b");
      execFileSync("mkfifo", [fifo]);
      const link = path.join(c.tmp, "link-fifo");
      fs.symlinkSync(fifo, link);
      return link;
    },
  },
  {
    label: "a FIFO",
    posix: true,
    make: (c) => {
      const fifo = path.join(c.tmp, "made-up-fifo-a");
      execFileSync("mkfifo", [fifo]);
      return fifo;
    },
  },
  { label: "a device", posix: true, make: () => "/dev/null" },
];

describe("a57 fail closed", () => {
  it("usage", async () => {
    const ctx = plainCtx();
    const s = snap(ctx);
    const cases: { label: string; argv: string[] }[] = [];
    for (const req of REQUIRED_OPTIONS) cases.push({ label: `a missing required option (${req})`, argv: ctx.args({ drop: [req] }) });
    const base = ctx.args(); // swap, --in, <file>, --voice, <voice>, --remove-noise, ...
    cases.push(
      { label: "an unknown option", argv: ctx.args({ extra: ["--bogus", "x"] }) },
      { label: "an option given twice", argv: ctx.args({ extra: ["--voice", "Vincent"] }) },
      { label: "the --live flag given twice", argv: ctx.args({ extra: ["--live", "--live"] }) },
      { label: "a value that starts with -- (--in --live)", argv: ["swap", "--in", "--live", ...base.slice(3)] },
      { label: "a value that starts with -- (--voice --live)", argv: [...base.slice(0, 3), "--voice", "--live", ...base.slice(5)] },
      { label: "an unknown verb", argv: ctx.args({ verb: "music" }) },
      { label: "no verb", argv: ctx.args({ verb: false }) },
      { label: "no argument at all", argv: [] },
    );
    for (const noise of ["True", "1", "yes", ""]) cases.push({ label: `--remove-noise ${JSON.stringify(noise)}`, argv: ctx.args({ noise }) });
    for (const ceiling of ["0", "-1", "46.01", "1e2", "abc"]) cases.push({ label: `--ceiling-usd ${ceiling}`, argv: ctx.args({ ceiling }) });
    for (const timeout of ["0", "1.5", "abc", "-1"]) cases.push({ label: `--timeout-seconds ${timeout}`, argv: ctx.args({ timeout }) });
    expect(cases.length).toBe(7 + 8 + 4 + 5 + 4);
    for (const c of cases) {
      const fake = new FakeCaller();
      const keyReader = jest.fn(() => KEY);
      const r = await run(c.argv, fake, keyReader);
      expectRefusal(r, "usage", fake, ctx, s);
      expect([c.label, keyReader.mock.calls.length]).toEqual([c.label, 0]);
    }
  });

  it("voice-unknown", async () => {
    const ctx = plainCtx();
    const s = snap(ctx);
    const names = ["bernard", "Bernard ", "", "constructor", "__proto__", "Ber\nnard"];
    for (const voice of names) {
      for (const extra of LIVE_ONLY) {
        const fake = new FakeCaller();
        const keyReader = jest.fn(() => KEY);
        const r = await run(ctx.args({ voice, extra }), fake, keyReader);
        expectRefusal(r, "voice-unknown", fake, ctx, s);
        expect([JSON.stringify(voice), keyReader.mock.calls.length]).toEqual([JSON.stringify(voice), 0]);
      }
    }
  });

  toolIt("voice-unknown: Bernard and Vincent pass the voice check", async () => {
    for (const voice of ["Bernard", "Vincent"]) {
      const ctx = soundCtx();
      const fake = new FakeCaller();
      const r = await run(ctx.args({ voice, extra: ["--live"] }), fake);
      expect([voice, r.code]).toEqual([voice, 0]);
      expect([voice, fake.createCount]).toEqual([voice, 1]);
      expect([voice, (ledgerLines(ctx.ledger)[0].sent as Record<string, unknown>).voice]).toEqual([voice, { type: "runway-preset", presetId: voice }]);
    }
  });

  it("voice list", () => {
    expect([...ra.PRESET_VOICES]).toEqual([
      "Maya", "Arjun", "Serene", "Bernard", "Billy", "Mark", "Clint", "Mabel", "Chad", "Leslie",
      "Eleanor", "Elias", "Elliot", "Grungle", "Brodie", "Sandra", "Kirk", "Kylie", "Lara", "Lisa",
      "Malachi", "Marlene", "Martin", "Miriam", "Monster", "Paula", "Pip", "Rusty", "Ragnar", "Xylar",
      "Maggie", "Jack", "Katie", "Noah", "James", "Rina", "Ella", "Mariah", "Frank", "Claudia",
      "Niki", "Vincent", "Kendrick", "Myrna", "Tom", "Wanda", "Benjamin", "Kiana", "Rachel",
    ]);
    expect(ra.PRESET_VOICES.length).toBe(49);
    for (const name of ["Bernard", "Vincent"]) expect(ra.isKnownVoice(name)).toBe(true);
    for (const name of ["bernard", "Bernard ", "", "constructor", "__proto__", "Ber\nnard", "maya"]) {
      expect([JSON.stringify(name), ra.isKnownVoice(name)]).toEqual([JSON.stringify(name), false]);
    }
  });

  it("bad-id", async () => {
    const ctx = plainCtx();
    const s = snap(ctx);
    const badIds = ["a".repeat(121), ".plan", "-plan", "a b", ""];
    const planIds = [...badIds];
    const clipFiles = ["c".repeat(121) + ".wav", ".donor.wav", "-donor.wav", "donor name.wav", ".wav"];
    expect(planIds.length).toBe(5);
    expect(clipFiles.length).toBe(5);
    for (const mode of LIVE_ONLY) {
      for (const planId of planIds) {
        const fake = new FakeCaller();
        const keyReader = jest.fn(() => KEY);
        const r = await run(ctx.args({ planId, extra: mode }), fake, keyReader);
        expectRefusal(r, "bad-id", fake, ctx, s);
        expect([JSON.stringify(planId), keyReader.mock.calls.length]).toEqual([JSON.stringify(planId), 0]);
      }
      for (const name of clipFiles) {
        const file = path.join(ctx.tmp, name);
        fs.writeFileSync(file, "made-up bytes that are no sound");
        const fake = new FakeCaller();
        const keyReader = jest.fn(() => KEY);
        const r = await run(ctx.args({ in: file, extra: mode }), fake, keyReader);
        expectRefusal(r, "bad-id", fake, ctx, s);
        expect([name, keyReader.mock.calls.length]).toEqual([name, 0]);
      }
    }
  });

  it("input-missing (a missing path, a folder)", async () => {
    const ctx = plainCtx();
    const s = snap(ctx);
    for (const c of INPUT_MISSING.filter((x) => !x.posix)) {
      for (const extra of LIVE_ONLY) {
        const fake = new FakeCaller();
        const keyReader = jest.fn(() => KEY);
        const r = await run(ctx.args({ in: c.make(ctx), extra }), fake, keyReader);
        expectRefusal(r, "input-missing", fake, ctx, s);
        expect([c.label, keyReader.mock.calls.length]).toEqual([c.label, 0]);
      }
    }
  });

  toolIt("input-missing (a symlink, a FIFO, a device)", async () => {
    const ctx = soundCtx();
    const s = snap(ctx);
    const posix = INPUT_MISSING.filter((x) => x.posix);
    expect(posix.map((x) => x.label)).toEqual(["a symlink to a sound file", "a symlink to a device", "a symlink to a FIFO", "a FIFO", "a device"]);
    for (const c of posix) {
      // the symlink to a sound file points at a file a run would swap: only the lstat refuses it
      const input = c.make(ctx); // the path is made once, then refused in the dry run and with --live
      for (const extra of LIVE_ONLY) {
        const fake = new FakeCaller();
        const keyReader = jest.fn(() => KEY);
        const r = await run(ctx.args({ in: input, extra }), fake, keyReader);
        expectRefusal(r, "input-missing", fake, ctx, s);
        expect([c.label, keyReader.mock.calls.length]).toEqual([c.label, 0]);
      }
    }
  });

  toolIt("input-no-sound", async () => {
    const files: [string, (dir: string) => string][] = [
      ["a clip with no sound stream", (dir) => makeClip(dir, "donor.mp4", false)],
      ["a WAV with no length", makeEmptyWav],
    ];
    for (const [label, make] of files) {
      const ctx = makeCtx();
      const file = make(ctx.tmp);
      const s = snap(ctx);
      for (const extra of LIVE_ONLY) {
        const fake = new FakeCaller();
        const keyReader = jest.fn(() => KEY);
        const r = await run(ctx.args({ in: file, extra }), fake, keyReader);
        expectRefusal(r, "input-no-sound", fake, ctx, s);
        expect([label, keyReader.mock.calls.length]).toEqual([label, 0]);
      }
    }
  });

  toolIt("input-too-big", async () => {
    const ctx = makeCtx();
    const file = makeWav(ctx.tmp, "donor.wav", 44100, 2, 30 * 44100); // about 5.3 MB of PCM: the data URI is above 5000000 characters
    expect(fs.statSync(file).size).toBeGreaterThan(3_750_000);
    const s = snap(ctx);
    for (const extra of LIVE_ONLY) {
      const fake = new FakeCaller();
      const keyReader = jest.fn(() => KEY);
      const r = await run(ctx.args({ in: file, extra }), fake, keyReader);
      expectRefusal(r, "input-too-big", fake, ctx, s);
      expect(keyReader).not.toHaveBeenCalled(); // refused before any key read
    }
  });

  toolIt("out-bad", async () => {
    const cases: { label: string; set: (c: Ctx) => Pick<ArgsOpts, "out" | "ledger"> }[] = [
      { label: "out folder missing", set: (c) => ({ out: path.join(c.tmp, "no-such-out") }) },
      {
        label: "out path is a file",
        set: (c) => {
          const f = path.join(c.tmp, "a-file.txt");
          fs.writeFileSync(f, "x");
          return { out: f };
        },
      },
      {
        label: "out folder is a symlink",
        set: (c) => {
          const link = path.join(c.tmp, "out-link");
          fs.symlinkSync(c.out, link);
          return { out: link };
        },
      },
      { label: "out folder inside the repo outside out/", set: () => ({ out: path.join(REPO, "adapters") }) },
      { label: "ledger folder missing", set: (c) => ({ ledger: path.join(c.tmp, "no-such-dir", "ledger.jsonl") }) },
      {
        label: "ledger folder is a file",
        set: (c) => {
          const f = path.join(c.tmp, "a-file.txt");
          fs.writeFileSync(f, "x");
          return { ledger: path.join(f, "ledger.jsonl") };
        },
      },
      {
        label: "ledger folder is a symlink",
        set: (c) => {
          const link = path.join(c.tmp, "ledger-link");
          fs.symlinkSync(c.tmp, link);
          return { ledger: path.join(link, "ledger.jsonl") };
        },
      },
      {
        label: "ledger folder inside the repo outside out/",
        set: () => ({ ledger: path.join(REPO, "adapters", "made-up-ledger-a57.jsonl") }),
      },
    ];
    for (const c of cases) {
      const ctx = soundCtx();
      const where = c.set(ctx); // the paths are made once, then refused in the dry run and with --live
      const s = snap(ctx);
      for (const extra of LIVE_ONLY) {
        const fake = new FakeCaller();
        const keyReader = jest.fn(() => KEY);
        const r = await run(ctx.args({ ...where, extra }), fake, keyReader);
        expectRefusal(r, "out-bad", fake, ctx, s);
        expect([c.label, keyReader.mock.calls.length]).toEqual([c.label, 0]);
      }
      expect([c.label, fs.existsSync(path.join(REPO, "adapters", "made-up-ledger-a57.jsonl"))]).toEqual([c.label, false]);
    }
  });

  toolIt("inside-repo (--out)", async () => {
    const ctx = soundCtx();
    const s = snap(ctx);
    for (const extra of LIVE_ONLY) {
      const fake = new FakeCaller();
      const keyReader = jest.fn(() => KEY);
      const r = await run(ctx.args({ out: gitLike(), extra }), fake, keyReader);
      expectRefusal(r, "inside-repo", fake, ctx, s);
      expect(keyReader).not.toHaveBeenCalled();
    }
  });

  toolIt("inside-repo (ledger folder)", async () => {
    const ctx = soundCtx();
    const s = snap(ctx);
    for (const extra of LIVE_ONLY) {
      const fake = new FakeCaller();
      const keyReader = jest.fn(() => KEY);
      const ledger = path.join(gitLike(), "ledger.jsonl");
      const r = await run(ctx.args({ ledger, extra }), fake, keyReader);
      expectRefusal(r, "inside-repo", fake, ctx, s);
      expect(keyReader).not.toHaveBeenCalled();
      expect(fs.existsSync(ledger)).toBe(false);
      expect(fs.existsSync(`${ledger}.lock`)).toBe(false);
    }
  });

  toolIt("ledger-unreadable (a symlink)", async () => {
    const ctx = soundCtx();
    const target = path.join(ctx.tmp, "real-ledger.jsonl");
    writeLedger(target, [spendLine("gemini-image", 1)]);
    const link = path.join(ctx.tmp, "ledger-link.jsonl");
    fs.symlinkSync(target, link);
    const s = snap(ctx);
    for (const extra of LIVE_ONLY) {
      const fake = new FakeCaller();
      const r = await run(ctx.args({ ledger: link, extra }), fake);
      expectRefusal(r, "ledger-unreadable", fake, ctx, s);
      expect(readBytes(target)).not.toBeNull(); // the file behind the link is untouched
      expect(fs.readFileSync(target, "utf8").trim()).toBe(JSON.stringify(spendLine("gemini-image", 1)));
    }
  });

  toolIt("ledger-unreadable (a folder)", async () => {
    const ctx = soundCtx();
    const s = snap(ctx);
    for (const extra of LIVE_ONLY) {
      const fake = new FakeCaller();
      const r = await run(ctx.args({ ledger: ctx.out, extra }), fake);
      expectRefusal(r, "ledger-unreadable", fake, ctx, s);
    }
  });

  toolIt("ledger-unreadable (content)", async () => {
    const rows: [string, string][] = [
      ["a line that is not JSON", "{not json}\n"],
      ["a half line with no final newline", '{"kind":"attempt","service":"runway"'],
      ["a negative cost_usd", '{"kind":"attempt","service":"runway","cost_usd":-1}\n'],
      ["a cost_usd that is not a number", '{"kind":"attempt","service":"runway","cost_usd":"0.02"}\n'],
      ["an empty service", '{"kind":"attempt","service":"","cost_usd":0.02}\n'],
    ];
    for (const [label, text] of rows) {
      const ctx = soundCtx();
      fs.writeFileSync(ctx.ledger, text);
      const s = snap(ctx);
      for (const extra of LIVE_ONLY) {
        const fake = new FakeCaller();
        const r = await run(ctx.args({ extra }), fake);
        expectRefusal(r, "ledger-unreadable", fake, ctx, s);
      }
      expect([label, readBytes(ctx.ledger)?.toString("utf8")]).toEqual([label, text]);
    }
  });

  toolIt("over-ceiling", async () => {
    const ctx = soundCtx();
    writeLedger(ctx.ledger, [spendLine("gemini-image", 46)]);
    const s = snap(ctx);
    for (const extra of LIVE_ONLY) {
      const fake = new FakeCaller();
      const keyReader = jest.fn(() => KEY);
      const r = await run(ctx.args({ extra }), fake, keyReader);
      expectRefusal(r, "over-ceiling", fake, ctx, s);
      expect(r.err).toContain("spend record total 46.000 plus estimate 0.020 is above ceiling 46");
      expect(keyReader).not.toHaveBeenCalled();
    }
    // two hundredths under the cap: the estimate fits
    const fits = soundCtx();
    writeLedger(fits.ledger, [spendLine("gemini-image", 45.98)]);
    const r2 = await run(fits.args(), new FakeCaller());
    expect(r2.code).toBe(0);
    expect(r2.out).toContain("room-after usd=0.000");
  });

  toolIt("ledger-busy", async () => {
    const ctx = soundCtx();
    fs.writeFileSync(`${ctx.ledger}.lock`, "made-up lock holder\n"); // another run holds the lock
    const s = snap(ctx);
    const fake = new FakeCaller();
    const keyReader = jest.fn(() => KEY);
    const r = await run(ctx.args({ extra: ["--live"] }), fake, keyReader);
    expect(keyReader).toHaveBeenCalledTimes(1); // the key is read before the lock is looked at
    expectRefusal(r, "ledger-busy", fake, ctx, s, true); // the lock is neither stolen nor removed
    expect(r.err).toContain("ledger-busy");
    // the dry run does not look at the lock
    const dry = await run(ctx.args(), new FakeCaller());
    expect(dry.code).toBe(0);
  });

  toolIt("key-missing", async () => {
    const readers: [string, () => string][] = [
      ["a throwing reader", () => {
        throw new Error("no key found");
      }],
      ["an empty key", () => ""],
      ["a blank key", () => "  "],
    ];
    for (const [label, reader] of readers) {
      const ctx = soundCtx();
      const s = snap(ctx);
      const fake = new FakeCaller();
      const r = await run(ctx.args({ extra: ["--live"] }), fake, reader);
      expectRefusal(r, "key-missing", fake, ctx, s);
      expect([label, r.err.trim().split(/\s+/)[0]]).toEqual([label, "key-missing"]);
    }
  });

  it("checks before key", async () => {
    const ctx = plainCtx();
    const s = snap(ctx);
    const fake = new FakeCaller();
    const keyReader = jest.fn(() => {
      throw new Error("no key anywhere");
    });
    const r = await run(ctx.args({ voice: "bernard", extra: ["--live"] }), fake, keyReader);
    expectRefusal(r, "voice-unknown", fake, ctx, s);
    expect(keyReader).not.toHaveBeenCalled(); // the voice check runs before the key is read
  });

  toolIt("key before lock", async () => {
    const ctx = soundCtx();
    fs.writeFileSync(`${ctx.ledger}.lock`, "made-up lock holder\n");
    const s = snap(ctx);
    const fake = new FakeCaller();
    const keyReader = jest.fn(() => {
      throw new Error("no key anywhere");
    });
    const r = await run(ctx.args({ extra: ["--live"] }), fake, keyReader);
    expect(keyReader).toHaveBeenCalledTimes(1);
    expectRefusal(r, "key-missing", fake, ctx, s, true); // the planted lock is byte-equal
  });
});

