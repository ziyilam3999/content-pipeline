/**
 * Row A48 — paid AI video generation tool (Gemini Omni), dry run by default, with one
 * spend ledger and a ceiling. Thin CLI: tools/videogen.ts (npm run video:gen).
 *
 * Request shape read 2026-11-21 from the docs page the plan record names,
 * https://aistudio.google.com/docs/omni.md (model page
 * https://aistudio.google.com/docs/models/gemini-omni-flash.md): one synchronous POST
 * .../models/<model>:generateVideo with header x-goog-api-key; the reply holds the
 * video inline (base64) or a file uri (the page advises uri delivery above 4 MB);
 * a uri file is polled with a GET until ready/failed, then downloaded with ?alt=media.
 * The shape is UNPROVEN until the paid hand run after the merge; a wrong endpoint or
 * field there is a follow-up ticket, not a silent fallback here.
 *
 * Money rules: rates are whole micro-USD per second (list prices read 2026-11-21);
 * one attempt line is appended to the ledger BEFORE the call, under an O_EXCL lock;
 * one run sends at most one generation call (a retry is a new run); the returned video
 * bytes are saved as received, so any provenance mark stays.
 */

import { randomUUID } from "crypto";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import { readGeminiKey } from "./genart";

// ── prices (whole micro-USD per second; list prices read 2026-11-21) ───────────────────

export const PRICE_READ = "2026-11-21";

export const PRICE_TABLE: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  "gemini-omni-1.2-flash": { "360p": 23_000, "720p": 70_000, "1080p": 104_000, "4k": 209_000 },
};

/** Image size limit is a GUESS: the docs page gives no image size limit for this model. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const DEFAULT_TIMEOUT_SECONDS = 900;

/** Standing cap on --ceiling-usd for all paid media together. */
export const CEILING_CAP_USD = 20;

const SERVICE = "gemini-omni";

// ── refusal ────────────────────────────────────────────────────────────────────────────

/** A fail-closed refusal: exit 2, one line, the code is the first word. */
export class Refusal extends Error {
  constructor(readonly code: string, readonly detail: string) {
    super(`${code} ${detail.replace(/\s+/g, " ")}`);
  }
}

// ── prompt refusal patterns (fail closed; a match refuses the run) ─────────────────────

// home path: /Users/<name>, /home/<name>, ~/ or a Windows C:\Users\ path
const HOME_PATH_RES: readonly RegExp[] = [
  /\/Users\/[A-Za-z0-9_.-]+/,
  /\/home\/[A-Za-z0-9_.-]+/,
  /~\//,
  /[A-Za-z]:[\\/]Users[\\/]/i,
];
// e-mail address
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
// licence plate as a whole word: 2-3 letters, optional space or hyphen, 3-4 digits,
// optional space or hyphen, one optional letter ("USD 1260" matches too; "XSBA1234AB" does not)
const PLATE_RE = /\b[A-Za-z]{2,3}[ -]?\d{3,4}[ -]?[A-Za-z]?\b/i;

// ── money helpers (whole micro-USD; no float sum) ──────────────────────────────────────

/** USD to whole micro-USD, rounded up (the 1e-6 term absorbs binary float dust). */
export function usdToMicro(usd: number): number {
  return Math.ceil(usd * 1e6 - 1e-6);
}

/** Micro-USD to a USD string with 3 decimals, rounded up (70000 -> "0.070"). */
export function formatUsdMicro(micro: number): string {
  return (Math.ceil(micro / 1000) / 1000).toFixed(3);
}

// ── network caller (one injected object behind each network step) ──────────────────────

export interface NetCall {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
}

export type GenerateResult =
  | { kind: "video"; bytes: Buffer; mimeType: string; interactionId?: string; model?: string }
  | { kind: "uri"; uri: string; interactionId?: string; model?: string }
  | { kind: "blocked"; reason?: string; interactionId?: string; model?: string }
  | { kind: "no-video"; interactionId?: string; model?: string };

export type FileState = "processing" | "ready" | "failed";

export interface VideoCaller {
  generate(call: NetCall): Promise<GenerateResult>;
  fileStatus(call: NetCall): Promise<FileState>;
  download(call: NetCall): Promise<Buffer>;
}

/** A non-2xx reply from any network step. */
export class HttpError extends Error {
  constructor(readonly status: number) {
    super(`http ${status}`);
  }
}

/** A network step hit its timeout. */
export class CallTimeout extends Error {
  constructor(what: string) {
    super(`timeout ${what}`);
  }
}

/** fetch is looked up HERE, when a call runs, so loading the module binds nothing. */
function fetchNow(): typeof fetch {
  const f = (globalThis as { fetch?: typeof fetch }).fetch;
  if (typeof f !== "function") throw new Error("globalThis.fetch is unavailable");
  return f;
}

async function send(call: NetCall): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), call.timeoutMs);
  try {
    return await fetchNow()(call.url, {
      method: call.method,
      headers: call.headers,
      body: call.body,
      signal: controller.signal,
    });
  } catch (e) {
    if (controller.signal.aborted) throw new CallTimeout(call.url.split("?")[0]);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function parseGenerateReply(json: any): GenerateResult {
  const interactionId = json?.interactionId ?? json?.responseId ?? json?.metadata?.interactionId;
  const model = json?.modelVersion ?? json?.model;
  const cand = json?.candidates?.[0];
  for (const p of cand?.content?.parts ?? []) {
    const inline = p?.inlineData ?? p?.inline_data;
    if (inline?.data) {
      return {
        kind: "video",
        bytes: Buffer.from(String(inline.data), "base64"),
        mimeType: String(inline.mimeType ?? inline.mime_type ?? "video/mp4"),
        interactionId: interactionId ? String(interactionId) : undefined,
        model: model ? String(model) : undefined,
      };
    }
    const uri = p?.fileData?.fileUri ?? p?.fileData?.uri ?? p?.file_data?.file_uri ?? p?.fileData?.fileUri;
    if (uri) {
      return {
        kind: "uri",
        uri: String(uri),
        interactionId: interactionId ? String(interactionId) : undefined,
        model: model ? String(model) : undefined,
      };
    }
  }
  const block = json?.blockReason ?? cand?.blockReason;
  if (block) return { kind: "blocked", reason: String(block) };
  const fin = String(cand?.finishReason ?? "");
  if (/BLOCK|SAFETY|PROHIBIT/i.test(fin)) return { kind: "blocked", reason: fin };
  return { kind: "no-video" };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The real caller; the tool hands it each URL and header, the key sits in a header. */
export function realVideoCaller(): VideoCaller {
  return {
    async generate(call: NetCall): Promise<GenerateResult> {
      const res = await send(call);
      if (!res.ok) throw new HttpError(res.status);
      return parseGenerateReply(await res.json());
    },
    async fileStatus(call: NetCall): Promise<FileState> {
      const res = await send(call);
      if (!res.ok) throw new HttpError(res.status);
      const json = (await res.json()) as { state?: unknown; status?: unknown; done?: unknown };
      const st = String(json.state ?? json.status ?? "").toUpperCase();
      if (st.includes("FAIL")) return "failed";
      if (/ACTIVE|READY|DONE|OK/.test(st) || json.done === true) return "ready";
      return "processing";
    },
    async download(call: NetCall): Promise<Buffer> {
      const res = await send(call);
      if (!res.ok) throw new HttpError(res.status);
      return Buffer.from(await res.arrayBuffer());
    },
  };
}

// ── ledger (one spend record for all paid media; JSON lines) ───────────────────────────

/** Read the ledger and return the total spent in whole micro-USD. Missing file = 0. */
export function readLedgerTotal(ledger: string): number {
  let raw: Buffer;
  try {
    raw = fs.readFileSync(ledger);
  } catch {
    return 0; // a missing ledger counts as zero spent
  }
  if (raw.length === 0) return 0;
  const text = raw.toString("utf8");
  if (!text.endsWith("\n")) throw new Refusal("ledger-unreadable", `${ledger}: last line has no final newline`);
  let total = 0;
  for (const line of text.split("\n").slice(0, -1)) {
    if (line.trim() === "") continue;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      throw new Refusal("ledger-unreadable", `${ledger}: a line is not JSON`);
    }
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
      throw new Refusal("ledger-unreadable", `${ledger}: a line is not a JSON object`);
    }
    const c = (obj as { cost_usd?: unknown }).cost_usd;
    if (typeof c !== "number" || !Number.isFinite(c) || c < 0) {
      throw new Refusal("ledger-unreadable", `${ledger}: a line has no finite non-negative cost_usd`);
    }
    total += usdToMicro(c);
  }
  return total;
}

// ── args and the plan ──────────────────────────────────────────────────────────────────

const VALUE_FLAGS = new Set([
  "--prompt", "--first-frame", "--ref", "--model", "--seconds", "--resolution",
  "--aspect", "--out", "--ledger", "--ceiling-usd", "--timeout-seconds",
]);

export interface ParsedArgs {
  promptFile: string;
  firstFrame?: string;
  refs: string[];
  model: string;
  seconds: number;
  resolution: string;
  aspect: string;
  out: string;
  ledger: string;
  ceilingUsd: number;
  timeoutSeconds: number;
  live: boolean;
}

const CEILING_RE = /^(?:\d+(?:\.\d+)?|\.\d+)$/; // a plain number: no sign, exponent or separators

export function parseArgs(argv: string[]): ParsedArgs {
  const vals: Record<string, string> = {};
  const refs: string[] = [];
  let live = false;
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--live") {
      live = true;
      continue;
    }
    if (!VALUE_FLAGS.has(k) || i + 1 >= argv.length) throw new Refusal("usage", `bad or incomplete argument ${k}`);
    const v = argv[++i];
    if (k === "--ref") refs.push(v);
    else vals[k] = v;
  }
  for (const req of ["--prompt", "--model", "--seconds", "--resolution", "--out", "--ledger", "--ceiling-usd"]) {
    if (!vals[req]) throw new Refusal("usage", `missing required argument ${req}`);
  }
  if (!/^\d+$/.test(vals["--seconds"])) throw new Refusal("usage", "--seconds must be a whole number");
  const seconds = Number(vals["--seconds"]);
  if (seconds < 3 || seconds > 15) throw new Refusal("usage", "--seconds must be 3 to 15");
  const aspect = vals["--aspect"] ?? "9:16";
  if (aspect !== "9:16") throw new Refusal("usage", `--aspect ${aspect} is not accepted (only 9:16)`);
  if (refs.length > 6) throw new Refusal("usage", `at most 6 --ref images, got ${refs.length}`);
  if (!CEILING_RE.test(vals["--ceiling-usd"])) throw new Refusal("usage", "--ceiling-usd must be a plain number");
  const ceilingUsd = Number(vals["--ceiling-usd"]);
  if (!(ceilingUsd > 0) || ceilingUsd > CEILING_CAP_USD) {
    throw new Refusal("usage", `--ceiling-usd must be above 0 and at most ${CEILING_CAP_USD}`);
  }
  let timeoutSeconds = DEFAULT_TIMEOUT_SECONDS;
  if (vals["--timeout-seconds"]) {
    if (!/^\d+$/.test(vals["--timeout-seconds"])) throw new Refusal("usage", "--timeout-seconds must be a whole number");
    timeoutSeconds = Number(vals["--timeout-seconds"]);
  }
  return {
    promptFile: vals["--prompt"],
    firstFrame: vals["--first-frame"],
    refs,
    model: vals["--model"],
    seconds,
    resolution: vals["--resolution"],
    aspect,
    out: vals["--out"],
    ledger: vals["--ledger"],
    ceilingUsd,
    timeoutSeconds,
    live,
  };
}

interface ImageIn {
  role: string;
  name: string;
  bytes: Buffer;
  sha: string;
  mimeType: string;
}

export interface Plan {
  model: string;
  seconds: number;
  resolution: string;
  aspect: string;
  promptText: string;
  promptSha: string;
  images: ImageIn[];
  rateMicro: number;
  estimateMicro: number;
  outReal: string;
  ledgerReal: string;
  lockPath: string;
}

const REPO_ROOT = path.resolve(__dirname, "..");

/** The out folder and the ledger folder stay outside this repo's tree, or inside its out/. */
function checkFolder(p: string, what: string): string {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(p);
  } catch {
    throw new Refusal("out-bad", `${what} ${p} is missing`);
  }
  if (st.isSymbolicLink()) throw new Refusal("out-bad", `${what} ${p} is a symlink`);
  if (!st.isDirectory()) throw new Refusal("out-bad", `${what} ${p} is not a folder`);
  const real = fs.realpathSync(p);
  const repoReal = fs.realpathSync(REPO_ROOT);
  const rel = path.relative(repoReal, real);
  const insideRepo = rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  if (insideRepo && rel !== "out" && !rel.startsWith(`out${path.sep}`)) {
    throw new Refusal("out-bad", `${what} ${p} is inside the repo tree but outside its out/ folder`);
  }
  return real;
}

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function readImage(file: string, role: string): ImageIn {
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    throw new Refusal("input-missing", `${role} image ${file} is not readable`);
  }
  const png = bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!png && !jpg) throw new Refusal("input-not-image", `${role} image ${file} is neither PNG nor JPEG`);
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Refusal("input-too-big", `${role} image ${file} is above the ${MAX_IMAGE_BYTES} byte limit (a guess)`);
  }
  return { role, name: path.basename(file), bytes, sha: sha256(bytes), mimeType: png ? "image/png" : "image/jpeg" };
}

/** Build the full plan: reads the inputs and runs all refusal checks except key-missing. */
export function buildPlan(a: ParsedArgs): Plan {
  const outReal = checkFolder(a.out, "out folder");
  const ledgerFolder = checkFolder(path.dirname(a.ledger), "ledger folder");
  const ledgerReal = path.join(ledgerFolder, path.basename(a.ledger));
  const lockPath = `${ledgerReal}.lock`;

  let promptText: string;
  try {
    promptText = fs.readFileSync(a.promptFile, "utf8");
  } catch {
    throw new Refusal("input-missing", `prompt file ${a.promptFile} is not readable`);
  }
  const images: ImageIn[] = [];
  if (a.firstFrame) images.push(readImage(a.firstFrame, "first-frame"));
  for (const r of a.refs) images.push(readImage(r, "ref"));

  for (const re of HOME_PATH_RES) {
    if (re.test(promptText)) throw new Refusal("prompt-home-path", "the prompt text holds a home path");
  }
  if (EMAIL_RE.test(promptText)) throw new Refusal("prompt-email", "the prompt text holds an e-mail address");
  if (PLATE_RE.test(promptText)) throw new Refusal("prompt-plate", "the prompt text may hold a licence plate");

  const rateMicro = PRICE_TABLE[a.model]?.[a.resolution];
  if (rateMicro === undefined) {
    throw new Refusal("price-unknown", `no list price for model ${a.model} at ${a.resolution}`);
  }

  const total = readLedgerTotal(ledgerReal);
  if (fs.existsSync(lockPath)) throw new Refusal("ledger-busy", `lock file ${lockPath} exists`);
  const estimateMicro = a.seconds * rateMicro;
  if (total + estimateMicro > usdToMicro(a.ceilingUsd)) {
    throw new Refusal(
      "over-ceiling",
      `spent ${formatUsdMicro(total)} plus estimate ${formatUsdMicro(estimateMicro)} is above ceiling ${a.ceilingUsd}`,
    );
  }

  return {
    model: a.model,
    seconds: a.seconds,
    resolution: a.resolution,
    aspect: a.aspect,
    promptText,
    promptSha: sha256(Buffer.from(promptText, "utf8")),
    images,
    rateMicro,
    estimateMicro,
    outReal,
    ledgerReal,
    lockPath,
  };
}

// ── the run ────────────────────────────────────────────────────────────────────────────

export interface CliResult {
  code: number;
  out: string;
  err: string;
}

export interface VideoGenDeps {
  caller?: VideoCaller;
  keyReader?: () => string;
  pollIntervalMs?: number;
}

/** Reads the key the way adapters/genart.ts does: env first, else one Keychain lookup. */
const defaultKeyReader = (): string => readGeminiKey();

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function scrub(text: string, key: string): string {
  return key ? text.split(key).join("[redacted]") : text;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildRequestBody(plan: Plan): string {
  const parts: Record<string, unknown>[] = [{ text: plan.promptText }];
  for (const img of plan.images) {
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.bytes.toString("base64") } });
  }
  return JSON.stringify({
    contents: [{ parts }],
    // uri delivery asked for: the docs page advises it above 4 MB (shape unproven)
    generationConfig: { seconds: plan.seconds, resolution: plan.resolution, aspectRatio: plan.aspect, responseMode: "uri" },
  });
}

interface Outcome {
  status: string;
  file: string | null;
  interactionId: string | null;
  model: string | null;
  detail?: string;
}

async function pollAndDownload(
  caller: VideoCaller,
  uri: string,
  headers: Record<string, string>,
  timeoutMs: number,
  intervalMs: number,
): Promise<Buffer> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const st = await caller.fileStatus({ url: uri, method: "GET", headers, timeoutMs });
    if (st === "failed") throw new Error(`file status failed for ${uri.split("?")[0]}`);
    if (st === "ready") break;
    if (Date.now() + intervalMs > deadline) throw new CallTimeout("file status");
    await wait(intervalMs);
  }
  const dl = uri.includes("?") ? `${uri}&alt=media` : `${uri}?alt=media`;
  return caller.download({ url: dl, method: "GET", headers, timeoutMs });
}

async function liveRun(a: ParsedArgs, plan: Plan, deps?: VideoGenDeps): Promise<CliResult> {
  let key = "";
  try {
    key = (deps?.keyReader ?? defaultKeyReader)();
  } catch {
    throw new Refusal("key-missing", "the key reader threw");
  }
  if (typeof key !== "string" || key.trim() === "") throw new Refusal("key-missing", "the key reader returned no key");

  const attemptId = randomUUID();
  const attemptLine = JSON.stringify({
    kind: "attempt",
    attempt_id: attemptId,
    time: new Date().toISOString(),
    service: SERVICE,
    sent: {
      model: plan.model,
      seconds: plan.seconds,
      resolution: plan.resolution,
      aspect: plan.aspect,
      prompt_sha256: plan.promptSha,
      image_sha256: plan.images.map((i) => i.sha),
    },
    cost_usd: plan.estimateMicro / 1e6,
    cost_how: {
      rate_usd_per_s: plan.rateMicro / 1e6,
      price_read: PRICE_READ,
      basis: "list price x seconds, output video only",
    },
    status: "attempted",
    interaction_id: null,
  });

  // lock held from the read of the total to the attempt line; O_EXCL, no wait, no steal
  try {
    fs.closeSync(fs.openSync(plan.lockPath, "wx"));
  } catch {
    throw new Refusal("ledger-busy", `lock file ${plan.lockPath} exists`);
  }
  try {
    const total = readLedgerTotal(plan.ledgerReal); // re-read under the lock
    if (total + plan.estimateMicro > usdToMicro(a.ceilingUsd)) {
      throw new Refusal("over-ceiling", `spent ${formatUsdMicro(total)} plus estimate ${formatUsdMicro(plan.estimateMicro)} is above ceiling ${a.ceilingUsd}`);
    }
    fs.appendFileSync(plan.ledgerReal, `${attemptLine}\n`); // BEFORE the call is sent
  } finally {
    fs.unlinkSync(plan.lockPath);
  }

  const caller = deps?.caller ?? realVideoCaller();
  const headers = { "x-goog-api-key": key, "content-type": "application/json" };
  const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(plan.model)}:generateVideo`;
  const timeoutMs = a.timeoutSeconds * 1000;

  let o: Outcome;
  try {
    const reply = await caller.generate({
      url: genUrl,
      method: "POST",
      headers,
      body: buildRequestBody(plan),
      timeoutMs,
    });
    const interactionId = reply.interactionId ?? null;
    const replyModel = reply.model ?? null;
    if (reply.kind === "video" || reply.kind === "uri") {
      const bytes =
        reply.kind === "video" ? reply.bytes : await pollAndDownload(caller, reply.uri, headers, timeoutMs, deps?.pollIntervalMs ?? 5000);
      const fileName = `clip-${attemptId}.mp4`;
      fs.writeFileSync(path.join(plan.outReal, fileName), bytes); // the returned bytes, as received
      o = { status: "ok", file: fileName, interactionId, model: replyModel };
    } else if (reply.kind === "blocked") {
      o = { status: "blocked", file: null, interactionId, model: replyModel, detail: reply.reason };
    } else {
      o = { status: "no-video", file: null, interactionId, model: replyModel };
    }
  } catch (e) {
    const status = e instanceof CallTimeout ? "timeout" : e instanceof HttpError ? `http-${e.status}` : "error";
    o = { status, file: null, interactionId: null, model: null, detail: msg(e) };
  }

  fs.appendFileSync(
    plan.ledgerReal,
    `${JSON.stringify({
      kind: "outcome",
      attempt_id: attemptId,
      time: new Date().toISOString(),
      service: SERVICE,
      cost_usd: 0,
      status: o.status,
      interaction_id: o.interactionId,
      model: o.model,
      file: o.file,
    })}\n`,
  );

  if (o.status === "ok") {
    const out = scrub(`video-gen: wrote ${o.file} usd=${formatUsdMicro(plan.estimateMicro)} attempt=${attemptId}\n`, key);
    return { code: 0, out, err: "" };
  }
  const detail = o.detail ? ` ${o.detail.replace(/\s+/g, " ").slice(0, 200)}` : "";
  const err = scrub(`video-gen: ${o.status} attempt=${attemptId}${detail}\n`, key);
  return { code: 1, out: "", err };
}

function dryRunOutput(plan: Plan): string {
  const lines = [
    "video-gen: dry-run (no request sent, no key read, nothing written)",
    `video-gen: would-send model=${plan.model} seconds=${plan.seconds} resolution=${plan.resolution} aspect=${plan.aspect}`,
    `video-gen: prompt sha256=${plan.promptSha}`,
    "video-gen: prompt-text:",
    plan.promptText,
    ...plan.images.map((i) => `video-gen: image role=${i.role} file=${i.name} bytes=${i.bytes.length} sha256=${i.sha}`),
    `video-gen: estimate usd=${formatUsdMicro(plan.estimateMicro)} model=${plan.model} seconds=${plan.seconds} resolution=${plan.resolution} rate=${formatUsdMicro(plan.rateMicro)} price-read=${PRICE_READ}`,
  ];
  return `${lines.join("\n")}\n`;
}

/** Parse, check and run; dry run is the default, --live sends at most one generation call. */
export async function runVideoGen(argv: string[], deps?: VideoGenDeps): Promise<CliResult> {
  try {
    const a = parseArgs(argv);
    const plan = buildPlan(a);
    if (!a.live) return { code: 0, out: dryRunOutput(plan), err: "" };
    return await liveRun(a, plan, deps);
  } catch (e) {
    if (e instanceof Refusal) return { code: 2, out: "", err: `${e.message}\n` };
    return { code: 1, out: "", err: `video-gen: error: ${msg(e)}\n` };
  }
}
