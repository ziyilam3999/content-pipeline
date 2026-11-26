/**
 * Row A57 — Runway speech_to_speech call for the sound of a clip (verb swap), dry run by
 * default, with the one spend cap and the spend record. Thin CLI: tools/runwayAudio.ts
 * (npm run runway:audio).
 *
 * Why (ask A57, the narrator voice of story 1): Kling 4.0 speaks the line in a donor clip,
 * and this call turns it into one speaker. The five paid swaps before this ticket ran from
 * a scratch script outside the repo, which checked no cap, took no lock and counted no retry.
 *
 * Call shape from the scratch script of those runs and the Runway OpenAPI file read
 * 2026-11-26: POST /v1/speech_to_speech with the first sound stream of --in as a WAV data
 * URI, a runway-preset voice and removeBackgroundNoise; GET /v1/tasks/{id} until SUCCEEDED,
 * FAILED or CANCELLED; then one download of the first output URL. Header
 * X-Runway-Version: 2024-11-06; the key goes to api.dev.runwayml.com only.
 *
 * Money rules: the price is data below (read 2026-11-26). One attempt line is appended
 * BEFORE the request, under the O_EXCL lock <record>.lock; one run sends at most one create
 * request (a retry is a new run, at most one per plan id and clip id); the outcome line tops
 * the record up to the credits this run read back. The cap is the one of videogen.ts:
 * --ceiling-usd is a ceiling on the total of the spend record, at most PAID_SPEND_CAP_USD,
 * and readLedgerTotal sums each line, whatever tool wrote it.
 */

import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { resolveSystemFfmpeg } from "../video/contactSheet";
import { MAX_DATA_URI_CHARS, readRunwayKey, RUNWAY_VERSION } from "./runway";
import {
  CallTimeout,
  checkFolder,
  formatUsdMicro,
  formatUsdMicroDown,
  HttpError,
  NetCall,
  PAID_SPEND_CAP_USD,
  readLedgerTotal,
  Refusal,
  usdToMicro,
} from "./videogen";

export type { NetCall } from "./videogen";

// ── constants ──────────────────────────────────────────────────────────────────────────

/** The one verb of this file; another first argument is refused with usage. */
export const VERB = "swap";

export const MODEL = "eleven_multilingual_sts_v2";

export const ENDPOINT = "speech_to_speech";

export const PRICE_READ = "2026-11-26";

/** Price page: one credit costs USD 0.01 and covers 3 s of audio. */
export const USD_PER_CREDIT = 0.01;
export const CREDITS_PER_3S = 1;
export const SECONDS_PER_CREDIT = 3;

/** The preset voice ids of the Runway OpenAPI file read 2026-11-26, in its order. */
export const PRESET_VOICES: readonly string[] = Object.freeze([
  "Maya", "Arjun", "Serene", "Bernard", "Billy", "Mark", "Clint", "Mabel", "Chad", "Leslie",
  "Eleanor", "Elias", "Elliot", "Grungle", "Brodie", "Sandra", "Kirk", "Kylie", "Lara", "Lisa",
  "Malachi", "Marlene", "Martin", "Miriam", "Monster", "Paula", "Pip", "Rusty", "Ragnar", "Xylar",
  "Maggie", "Jack", "Katie", "Noah", "James", "Rina", "Ella", "Mariah", "Frank", "Claudia",
  "Niki", "Vincent", "Kendrick", "Myrna", "Tom", "Wanda", "Benjamin", "Kiana", "Rachel",
]);

export const DEFAULT_TIMEOUT_SECONDS = 900;

/** A plan id or a clip id: 1 to 120 characters, the first a letter or a digit. */
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

/** The Runway task id: the OpenAPI file gives a uuid; a wider id is refused before a status call. */
const TASK_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

/** A cost field counts from 0 up to this many credits; anything else counts as not read. */
const MAX_CREDITS_READ = 1_000_000;

const SERVICE = "runway";
const API_HOST = "api.dev.runwayml.com";
const API_BASE = `https://${API_HOST}/v1`;
const MICRO_PER_CREDIT = usdToMicro(USD_PER_CREDIT); // 10 000 whole micro-USD per credit
const MAX_DOWNLOAD_REDIRECTS = 5;

// ── small JSON helpers ─────────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;
const asObj = (v: unknown): Json => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {});
const asStr = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function scrub(text: string, key: string): string {
  return key ? text.split(key).join("[redacted]") : text;
}

// ── price ──────────────────────────────────────────────────────────────────────────────

/** Exact, case-sensitive match on the preset list's own entries (a prototype name is not a voice). */
export function isKnownVoice(name: string): boolean {
  return PRESET_VOICES.includes(name);
}

/**
 * Credits for the WAV to be sent: 1 credit per 3 s of samples, rounded UP to whole credits,
 * at least 1. Whole-number arithmetic on the sample count per channel and the sample rate.
 * Throws when either is not a whole number above 0.
 */
export function creditsForAudio(samplesPerChannel: number, sampleRate: number): number {
  if (!Number.isInteger(samplesPerChannel) || samplesPerChannel <= 0) {
    throw new RangeError("the sample count must be a whole number above 0");
  }
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError("the sample rate must be a whole number above 0");
  }
  // (count - 1) / per + 1 is the count rounded up; it holds at a whole multiple of 3 s
  const perCredit = SECONDS_PER_CREDIT * sampleRate;
  return Math.max(1, Math.floor((samplesPerChannel - 1) / perCredit) + 1);
}

/**
 * A cost field of a create or task reply: the object {credits: n} or the plain number n,
 * with n a finite number from 0 to MAX_CREDITS_READ. form says which shape answered;
 * "none" when the value was not read.
 */
export function readCostField(v: unknown): { credits: number | null; form: "object" | "number" | "none" } {
  const ok = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= MAX_CREDITS_READ;
  if (typeof v === "number") return ok(v) ? { credits: v, form: "number" } : { credits: null, form: "none" };
  if (typeof v === "object" && v !== null && !Array.isArray(v)) {
    const c = (v as Json).credits;
    return ok(c) ? { credits: c, form: "object" } : { credits: null, form: "none" };
  }
  return { credits: null, form: "none" };
}

// ── the sent sound ─────────────────────────────────────────────────────────────────────

/** The extension of a saved reply from its first bytes; a form not in the list gives bin. */
export function audioExtension(bytes: Buffer): string {
  const at = (i: number, text: string): boolean => bytes.length >= i + text.length && bytes.toString("ascii", i, i + text.length) === text;
  const mpegFrame = bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  if (at(0, "ID3") || mpegFrame) return "mp3";
  if (at(0, "RIFF") && at(8, "WAVE")) return "wav";
  if (at(0, "fLaC")) return "flac";
  if (at(0, "OggS")) return "ogg";
  if (at(4, "ftyp")) return "m4a";
  return "bin";
}

interface WavFacts {
  channels: number;
  sampleRate: number;
  samplesPerChannel: number;
}

/** Read a PCM WAV: its channel count, its sample rate and its sample count per channel. */
function readWav(buf: Buffer): WavFacts {
  const bad = (): Error => new Error("ffmpeg gave no 16-bit PCM WAV");
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw bad();
  let off = 12;
  let format = 0;
  let channels = 0;
  let rate = 0;
  let bits = 0;
  let dataBytes = -1;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === "fmt " && body + 16 <= buf.length) {
      format = buf.readUInt16LE(body);
      channels = buf.readUInt16LE(body + 2);
      rate = buf.readUInt32LE(body + 4);
      bits = body + 24 <= buf.length ? buf.readUInt16LE(body + 14) : 0;
    } else if (id === "data") {
      // a size of 0 or of a stream still open is not the length: the rest of the file is
      dataBytes = size === 0 || size === 0xffffffff || body + size > buf.length ? buf.length - body : size;
    }
    if (size === 0xffffffff) break;
    off = body + size + (size % 2);
  }
  if ((format !== 1 && format !== 0xfffe) || bits !== 16 || channels < 1 || rate < 1 || dataBytes < 0) throw bad();
  return { channels, sampleRate: rate, samplesPerChannel: Math.floor(dataBytes / (channels * 2)) };
}

function systemFfmpeg(): string {
  try {
    return resolveSystemFfmpeg();
  } catch (e) {
    throw new Refusal("ffmpeg-missing", msg(e));
  }
}

/** Take the first sound stream of the file out as a 16-bit PCM WAV in a temp folder that is gone again. */
function extractWav(bin: string, file: string, tempDir: string): Buffer {
  const dir = fs.mkdtempSync(path.join(tempDir, "runway-audio-"));
  const wav = path.join(dir, "sent.wav");
  try {
    try {
      execFileSync(
        bin,
        ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i", file, "-map", "0:a:0", "-c:a", "pcm_s16le", "-f", "wav", wav],
        { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
      );
    } catch (e) {
      const err = e as { status?: number | null; stderr?: string };
      const stderr = typeof err.stderr === "string" ? err.stderr : "";
      if (/matches no streams/.test(stderr)) throw new Refusal("input-no-sound", `input ${file} holds no sound stream`);
      const tail = stderr.replace(/\s+/g, " ").trim().slice(-300);
      throw new Error(`ffmpeg exited ${err.status ?? "on a signal"}: ${tail}`);
    }
    return fs.readFileSync(wav);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── args ───────────────────────────────────────────────────────────────────────────────

const VALUE_FLAGS = new Set(["--in", "--voice", "--remove-noise", "--plan-id", "--out", "--ledger", "--ceiling-usd", "--timeout-seconds"]);
const REQUIRED = ["--in", "--voice", "--remove-noise", "--plan-id", "--out", "--ledger", "--ceiling-usd"];
const CEILING_RE = /^(?:\d+(?:\.\d+)?|\.\d+)$/; // a plain number: no sign, exponent or separators

export interface RunwayAudioArgs {
  verb: string;
  in: string;
  voice: string;
  removeNoise: boolean;
  planId: string;
  out: string;
  ledger: string;
  ceilingUsd: number;
  timeoutSeconds: number;
  live: boolean;
}

/** The first argument is the verb; this file builds swap and refuses another verb with usage. */
export function parseRunwayAudioArgs(argv: string[]): RunwayAudioArgs {
  const verb = argv[0];
  if (verb === undefined || verb.startsWith("-")) throw new Refusal("usage", `the first argument is the verb (${VERB})`);
  if (verb !== VERB) throw new Refusal("usage", `unknown verb ${JSON.stringify(verb)}; the first argument is the verb (${VERB})`);

  const vals: Record<string, string> = {};
  let live = false;
  for (let i = 1; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--live") {
      if (live) throw new Refusal("usage", "--live is given twice");
      live = true;
      continue;
    }
    if (!VALUE_FLAGS.has(k)) throw new Refusal("usage", `unknown option ${JSON.stringify(k)}`);
    if (i + 1 >= argv.length) throw new Refusal("usage", `bad or incomplete argument ${k}`);
    const v = argv[++i];
    if (k in vals) throw new Refusal("usage", `${k} is given twice`);
    if (v.startsWith("--")) throw new Refusal("usage", `the value of ${k} starts with "--"`);
    vals[k] = v;
  }
  for (const req of REQUIRED) {
    if (vals[req] === undefined) throw new Refusal("usage", `missing required argument ${req}`);
  }
  const noise = vals["--remove-noise"];
  if (noise !== "true" && noise !== "false") throw new Refusal("usage", "--remove-noise must be true or false");
  if (!CEILING_RE.test(vals["--ceiling-usd"])) throw new Refusal("usage", "--ceiling-usd must be a plain number");
  const ceilingUsd = Number(vals["--ceiling-usd"]);
  if (!(ceilingUsd > 0) || ceilingUsd > PAID_SPEND_CAP_USD) {
    throw new Refusal("usage", `--ceiling-usd must be above 0 and at most ${PAID_SPEND_CAP_USD}`);
  }
  let timeoutSeconds = DEFAULT_TIMEOUT_SECONDS;
  if (vals["--timeout-seconds"] !== undefined) {
    if (!/^\d+$/.test(vals["--timeout-seconds"]) || Number(vals["--timeout-seconds"]) < 1) {
      throw new Refusal("usage", "--timeout-seconds must be a whole number above 0");
    }
    timeoutSeconds = Number(vals["--timeout-seconds"]);
  }
  return {
    verb,
    in: vals["--in"],
    voice: vals["--voice"],
    removeNoise: noise === "true",
    planId: vals["--plan-id"],
    out: vals["--out"],
    ledger: vals["--ledger"],
    ceilingUsd,
    timeoutSeconds,
    live,
  };
}

// ── the built run (input, sound, price, folder checks, record read, cap, retry count) ───

export interface SwapBuilt {
  in: string;
  clipId: string;
  voice: string;
  removeNoise: boolean;
  planId: string;
  ceilingUsd: number;
  /** sha256 of the --in file */
  inputSha: string;
  /** sha256 of the WAV a live run sends */
  audioSha: string;
  dataUri: string;
  samplesPerChannel: number;
  sampleRate: number;
  seconds: number;
  credits: number;
  estimateMicro: number;
  spentMicro: number;
  outReal: string;
  ledgerReal: string;
  lockPath: string;
}

function checkId(id: string, what: string): void {
  if (!ID_RE.test(id)) {
    throw new Refusal("bad-id", `${what} ${JSON.stringify(id.slice(0, 40))} is not 1 to 120 characters of letters, digits, dot, dash and underscore, and it does not start with a dot or a dash`);
  }
}

/** Is this real path inside a git work tree (a .git entry here or above)? */
function insideGitWorkTree(start: string): boolean {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, ".git"))) return true;
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

/** Build the swap: reads --in, prices the sound and runs each check that comes before the key. */
export function buildSwap(a: RunwayAudioArgs, tempDir: string = os.tmpdir()): SwapBuilt {
  checkId(a.planId, "plan id");

  let st: fs.Stats;
  try {
    st = fs.lstatSync(a.in);
  } catch {
    throw new Refusal("input-missing", `input ${a.in} is missing`);
  }
  if (!st.isFile()) throw new Refusal("input-missing", `input ${a.in} is not a regular file`);
  const clipId = path.basename(a.in, path.extname(a.in));
  checkId(clipId, "clip id");

  if (!isKnownVoice(a.voice)) {
    throw new Refusal("voice-unknown", `voice ${JSON.stringify(a.voice)} is not one of the preset ids read ${PRICE_READ}`);
  }

  const inputSha = sha256(fs.readFileSync(a.in));
  const wav = extractWav(systemFfmpeg(), a.in, tempDir);
  const facts = readWav(wav);
  if (facts.samplesPerChannel < 1) throw new Refusal("input-no-sound", `the sound of input ${a.in} has no length`);
  const credits = creditsForAudio(facts.samplesPerChannel, facts.sampleRate);
  const dataUri = `data:audio/wav;base64,${wav.toString("base64")}`;
  if (dataUri.length > MAX_DATA_URI_CHARS) {
    throw new Refusal("input-too-big", `the sound of input ${a.in} as a data URI is ${dataUri.length} characters, above the ${MAX_DATA_URI_CHARS} limit`);
  }

  const outReal = checkFolder(a.out, "out folder");
  const ledgerFolder = checkFolder(path.dirname(a.ledger), "ledger folder");
  if (insideGitWorkTree(outReal)) throw new Refusal("inside-repo", `out folder ${a.out} lies in a git work tree`);
  if (insideGitWorkTree(ledgerFolder)) throw new Refusal("inside-repo", `ledger folder ${path.dirname(a.ledger)} lies in a git work tree`);
  const ledgerReal = path.join(ledgerFolder, path.basename(a.ledger));
  try {
    if (!fs.lstatSync(ledgerReal).isFile()) throw new Refusal("ledger-unreadable", `spend record ${ledgerReal} is not a regular file`);
  } catch (e) {
    if (e instanceof Refusal) throw e; // a missing record is an empty one; readLedgerTotal decides the rest
  }

  const spentMicro = readLedgerTotal(ledgerReal); // each line of the record
  const estimateMicro = credits * MICRO_PER_CREDIT;
  if (spentMicro + estimateMicro > usdToMicro(a.ceilingUsd)) {
    throw new Refusal(
      "over-ceiling",
      `spend record total ${formatUsdMicro(spentMicro)} plus estimate ${formatUsdMicro(estimateMicro)} is above ceiling ${a.ceilingUsd}`,
    );
  }
  if (a.live && countSwapAttempts(ledgerReal, a.planId, clipId) >= 2) {
    throw new Refusal("retry-limit", `clip ${clipId} already has 2 swap attempt lines in plan ${a.planId}`);
  }

  return {
    in: a.in,
    clipId,
    voice: a.voice,
    removeNoise: a.removeNoise,
    planId: a.planId,
    ceilingUsd: a.ceilingUsd,
    inputSha,
    audioSha: sha256(wav),
    dataUri,
    samplesPerChannel: facts.samplesPerChannel,
    sampleRate: facts.sampleRate,
    seconds: facts.samplesPerChannel / facts.sampleRate,
    credits,
    estimateMicro,
    spentMicro,
    outReal,
    ledgerReal,
    lockPath: `${ledgerReal}.lock`,
  };
}

// ── retry count (at most one retry per plan id and clip id: two attempt lines and the third refuses) ──

/**
 * Count the swap attempt lines of one plan id and clip id: kind attempt, service runway and
 * sent.endpoint speech_to_speech. A video:tryout line of the same names is not counted.
 */
export function countSwapAttempts(ledger: string, planId: string, clipId: string): number {
  let text: string;
  try {
    text = fs.readFileSync(ledger, "utf8");
  } catch {
    return 0;
  }
  let n = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const o = JSON.parse(line) as { kind?: unknown; service?: unknown; sent?: unknown };
      const s = asObj(o.sent);
      if (o.kind === "attempt" && o.service === SERVICE && s.endpoint === ENDPOINT && s.plan_id === planId && s.clip_id === clipId) n++;
    } catch {
      // readLedgerTotal is the gatekeeper for odd lines; here an odd line simply does not count
    }
  }
  return n;
}

// ── network caller (one injected object behind each network step) ──────────────────────

export interface RunwayAudioCaller {
  create(call: NetCall): Promise<unknown>;
  taskStatus(call: NetCall): Promise<unknown>;
  download(call: NetCall): Promise<Buffer>;
}

/** fetch is looked up HERE, when a call runs, so loading the module binds nothing. */
function fetchNow(): typeof fetch {
  const f = (globalThis as { fetch?: typeof fetch }).fetch;
  if (typeof f !== "function") throw new Error("globalThis.fetch is unavailable");
  return f;
}

/** The Authorization header goes to the API host only; a request to another host gets none. */
function headersFor(url: string, headers: Record<string, string>): Record<string, string> {
  if (new URL(url).host === API_HOST) return headers;
  const rest: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() !== "authorization") rest[k] = v;
  return rest;
}

/** The next URL when this reply is a redirect of a download; null when the reply is the result. */
function nextHop(url: string, res: Response, method: string, hop: number): string | null {
  if (method !== "GET") return null; // the API calls take a 3xx as the reply
  if (!(res.status >= 300 && res.status < 400) || hop >= MAX_DOWNLOAD_REDIRECTS) return null;
  const loc = res.headers.get("location");
  if (!loc) return null;
  const next = new URL(loc, url); // a relative Location resolves against the URL that answered
  return next.protocol === "https:" ? next.toString() : null; // http is not followed
}

async function send(call: NetCall, as: "json" | "bytes"): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), call.timeoutMs); // one timer for all hops
  try {
    let url = call.url;
    for (let hop = 0; ; hop++) {
      const res = await fetchNow()(url, {
        method: call.method,
        headers: headersFor(url, call.headers),
        body: call.body,
        redirect: "manual", // each hop is decided in nextHop, not silently by fetch
        signal: controller.signal,
      });
      const next = nextHop(url, res, call.method, hop);
      if (next === null) {
        if (!res.ok) throw new HttpError(res.status);
        if (as === "json") return res.json();
        return Buffer.from(await res.arrayBuffer());
      }
      url = next;
    }
  } catch (e) {
    if (controller.signal.aborted) throw new CallTimeout(call.url.split("?")[0]);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** The real caller; the key sits in the Authorization header of the API calls only. */
export function realRunwayAudioCaller(): RunwayAudioCaller {
  return {
    create: (c) => send(c, "json"),
    taskStatus: (c) => send(c, "json"),
    download: async (c) => (await send(c, "bytes")) as Buffer,
  };
}

// ── the run ────────────────────────────────────────────────────────────────────────────

export interface CliResult {
  code: number;
  out: string;
  err: string;
}

export interface RunwayAudioDeps {
  caller?: RunwayAudioCaller;
  keyReader?: () => string;
  pollIntervalMs?: number;
  /** The OS temp folder the sent WAV is written under (default: os.tmpdir()); tests point it at a folder they watch. */
  tempDir?: string;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function apiHeaders(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}`, "X-Runway-Version": RUNWAY_VERSION };
}

function overCeiling(total: number, estimateMicro: number, ceilingUsd: number): Refusal {
  return new Refusal(
    "over-ceiling",
    `spend record total ${formatUsdMicro(total)} plus estimate ${formatUsdMicro(estimateMicro)} is above ceiling ${ceilingUsd}`,
  );
}

interface Outcome {
  status: string; // ok / failed / cancelled / timeout / http-<n> / error
  taskId: string | null;
  estimated: number | null;
  finalCost: number | null;
  estimateForm: "object" | "number" | "none";
  finalForm: "object" | "number" | "none";
  file: string | null;
  fileSha: string | null;
  failure: string | null;
}

async function liveRun(a: RunwayAudioArgs, b: SwapBuilt, deps?: RunwayAudioDeps): Promise<CliResult> {
  // the key is read after the checks of buildSwap and BEFORE the lock and the attempt line,
  // so a key-missing run writes nothing and calls nothing
  let key = "";
  try {
    key = (deps?.keyReader ?? readRunwayKey)();
  } catch {
    throw new Refusal("key-missing", "the key reader threw");
  }
  if (typeof key !== "string" || key.trim() === "") throw new Refusal("key-missing", "the key reader returned no key");

  const attemptId = randomUUID();
  const attemptLine = scrub(
    JSON.stringify({
      kind: "attempt",
      attempt_id: attemptId,
      time: new Date().toISOString(),
      service: SERVICE,
      sent: {
        plan_id: b.planId,
        clip_id: b.clipId,
        model: MODEL,
        endpoint: ENDPOINT,
        seconds: b.seconds,
        voice: { type: "runway-preset", presetId: b.voice },
        removeBackgroundNoise: b.removeNoise,
        media_type: "audio",
        input_clip_sha256: b.inputSha,
        input_audio_sha256: b.audioSha,
      },
      cost_usd: b.estimateMicro / 1e6,
      cost_how: {
        credits_per_3s: CREDITS_PER_3S,
        price_read: PRICE_READ,
        basis: "1 credit per 3 s of sent sound, rounded up to whole credits, at least 1 credit, x USD 0.01 per credit",
      },
      status: "attempted",
    }),
    key,
  );

  // lock held from the second read of the total to the attempt line; O_EXCL, no wait, no steal
  try {
    fs.closeSync(fs.openSync(b.lockPath, "wx"));
  } catch {
    throw new Refusal("ledger-busy", `lock file ${b.lockPath} exists`);
  }
  try {
    const total = readLedgerTotal(b.ledgerReal); // each line again, under the lock
    if (total + b.estimateMicro > usdToMicro(a.ceilingUsd)) throw overCeiling(total, b.estimateMicro, a.ceilingUsd);
    if (countSwapAttempts(b.ledgerReal, b.planId, b.clipId) >= 2) {
      throw new Refusal("retry-limit", `clip ${b.clipId} already has 2 swap attempt lines in plan ${b.planId}`);
    }
    fs.appendFileSync(b.ledgerReal, `${attemptLine}\n`); // BEFORE the request is sent
  } finally {
    fs.unlinkSync(b.lockPath);
  }

  const caller = deps?.caller ?? realRunwayAudioCaller();
  const timeoutMs = a.timeoutSeconds * 1000;
  const intervalMs = deps?.pollIntervalMs ?? 5000;

  let taskId: string | null = null;
  let estimated: number | null = null;
  // a terminal cost already read survives a later failure (no output url, a download or a
  // write that fails), so the outcome line below still counts it through the cost rule
  let finalCost: number | null = null;
  let estimateForm: Outcome["estimateForm"] = "none";
  let finalForm: Outcome["finalForm"] = "none";
  let o: Outcome;
  try {
    const createReply = asObj(
      await caller.create({
        url: `${API_BASE}/${ENDPOINT}`,
        method: "POST",
        headers: { ...apiHeaders(key), "content-type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          media: { type: "audio", uri: b.dataUri },
          voice: { type: "runway-preset", presetId: b.voice },
          removeBackgroundNoise: b.removeNoise,
        }),
        timeoutMs,
      }),
    );
    const est = readCostField(createReply.estimatedCost);
    estimated = est.credits;
    estimateForm = est.form;
    const id = asStr(createReply.id);
    if (!id || !TASK_ID_RE.test(id)) throw new Error("the create reply holds no usable task id");
    taskId = id;

    // poll GET /v1/tasks/{id}: PENDING, RUNNING and THROTTLED (and an unknown status) keep polling
    let task: Json = {};
    let status = "";
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      task = asObj(
        await caller.taskStatus({
          url: `${API_BASE}/tasks/${encodeURIComponent(taskId)}`,
          method: "GET",
          headers: apiHeaders(key),
          timeoutMs,
        }),
      );
      const st = asStr(task.status);
      if (st === "SUCCEEDED" || st === "FAILED" || st === "CANCELLED") {
        status = st;
        break;
      }
      if (Date.now() + intervalMs > deadline) throw new CallTimeout("task status");
      await wait(intervalMs);
    }
    const fin = readCostField(task.cost);
    finalCost = fin.credits;
    finalForm = fin.form;

    if (status === "SUCCEEDED") {
      const outputs = Array.isArray(task.output) ? task.output : [];
      const url = asStr(outputs[0]);
      if (!url) throw new Error("the SUCCEEDED task holds no output url");
      if (!url.startsWith("https://")) throw new Error("the first output url does not start with https://");
      // one download of the first output URL; the download host gets no key header
      const bytes = await caller.download({ url, method: "GET", headers: {}, timeoutMs });
      if (bytes.length === 0) throw new Error("the download gave 0 bytes");
      const file = `${b.clipId}-sts-${b.voice}-noise${b.removeNoise}-${attemptId}.${audioExtension(bytes)}`;
      fs.writeFileSync(path.join(b.outReal, file), bytes); // the returned bytes, as received
      o = { status: "ok", taskId, estimated, finalCost, estimateForm, finalForm, file, fileSha: sha256(bytes), failure: null };
    } else {
      const raw = task.failure; // a missing or null failure is no failure text
      const failureText = raw === undefined || raw === null ? "" : typeof raw === "string" ? raw : JSON.stringify(raw);
      o = {
        status: status === "FAILED" ? "failed" : "cancelled",
        taskId, estimated, finalCost, estimateForm, finalForm, file: null, fileSha: null,
        failure: failureText !== "" ? failureText : null,
      };
    }
  } catch (e) {
    const status = e instanceof CallTimeout ? "timeout" : e instanceof HttpError ? `http-${e.status}` : "error";
    o = { status, taskId, estimated, finalCost, estimateForm, finalForm, file: null, fileSha: null, failure: msg(e) };
  }

  // cost rule (the one of adapters/runway.ts): after the outcome line the record holds, for
  // this attempt, the larger of the list estimate and C x USD 0.01. C is the credits of the
  // terminal task reply when the run read one, else the estimatedCost credits of the create
  // reply, else 0. A charge above that amount is not in the record when the run read neither.
  // A run that ends before the outcome line leaves the list estimate only.
  const cCredits = o.finalCost ?? o.estimated ?? 0;
  const deltaMicro = Math.max(0, Math.round(cCredits * MICRO_PER_CREDIT) - b.estimateMicro);

  // scrub the WHOLE text before the 200-character cut: cutting first would leave the first
  // part of a key that straddles character 200, a part scrub can no longer match
  const failure = o.failure ? scrub(o.failure.replace(/\s+/g, " "), key).slice(0, 200) : null;
  fs.appendFileSync(
    b.ledgerReal,
    `${scrub(
      JSON.stringify({
        kind: "outcome",
        attempt_id: attemptId,
        time: new Date().toISOString(),
        service: SERVICE,
        cost_usd: deltaMicro / 1e6,
        status: o.status,
        task_id: o.taskId,
        estimated_cost_credits: o.estimated,
        final_cost_credits: o.finalCost,
        file: o.file,
        file_sha256: o.fileSha,
        failure,
      }),
      key,
    )}\n`,
  );

  if (o.status === "ok") {
    const out = scrub(
      `runway-audio: wrote ${o.file} usd=${formatUsdMicro(b.estimateMicro)} attempt=${attemptId} sha256=${o.fileSha}` +
        ` cost-form estimate=${o.estimateForm} final=${o.finalForm}\n`,
      key,
    );
    return { code: 0, out, err: "" };
  }
  const err = scrub(`runway-audio: ${o.status} attempt=${attemptId}${failure ? ` ${failure}` : ""}\n`, key);
  return { code: 1, out: "", err };
}

// ── dry run (the default: reads no key, sends nothing, writes nothing) ──────────────────

function dryRunOutput(b: SwapBuilt): string {
  const roomMicro = usdToMicro(b.ceilingUsd) - b.spentMicro;
  const lines = [
    "runway-audio: dry-run (no request sent, no key read, nothing written)",
    `runway-audio: swap clip id=${b.clipId} model=${MODEL} voice=${b.voice} remove-noise=${b.removeNoise} seconds=${b.seconds}` +
      ` input-sha256=${b.inputSha} audio-sha256=${b.audioSha} data-uri-chars=${b.dataUri.length}` +
      ` credits=${b.credits} estimate-usd=${formatUsdMicro(b.estimateMicro)}`,
    `runway-audio: spend group=all spent usd=${formatUsdMicro(b.spentMicro)} ceiling=${b.ceilingUsd}` +
      ` room usd=${formatUsdMicroDown(roomMicro)} room-after usd=${formatUsdMicroDown(roomMicro - b.estimateMicro)}`,
  ];
  return `${lines.join("\n")}\n`;
}

/** Parse, check and run; dry run is the default, --live sends at most one create request. */
export async function runRunwayAudio(argv: string[], deps?: RunwayAudioDeps): Promise<CliResult> {
  try {
    const a = parseRunwayAudioArgs(argv);
    const b = buildSwap(a, deps?.tempDir ?? os.tmpdir());
    if (!a.live) return { code: 0, out: dryRunOutput(b), err: "" };
    return await liveRun(a, b, deps);
  } catch (e) {
    if (e instanceof Refusal) return { code: 2, out: "", err: `${e.message}\n` };
    return { code: 1, out: "", err: `runway-audio: error: ${scrub(msg(e).replace(/\s+/g, " "), "")}\n` };
  }
}
