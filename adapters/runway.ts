/**
 * Row A52 — Runway try-out tool, dry run by default, with the one spend cap and the spend
 * record. Thin CLI: tools/runwayTryout.ts (npm run video:tryout).
 *
 * Why a try-out (day card item 17 (a)): the current AI video tool (Gemini Omni 1.2 Flash,
 * adapters/videogen.ts) is known to change the look of the same car between clips, and the
 * spend record holds no evidence for any other host (every attempt line so far is service
 * gemini-omni). Whether a tool built-in voice is usable (ask ledger row A52, bullet 04:54 UTC)
 * is not measured either. The tool choice is NOT made before the test: this tool only gathers
 * the side-by-side evidence; the pass criteria are fixed in docs/runway-tryout.md.
 *
 * Call shape from the Runway OpenAPI read 2026-11-22 (public docs, no key):
 *   POST /v1/text_to_video, POST /v1/image_to_video (promptImage as a data URI, PNG or JPEG,
 *   at most 5 MB), GET /v1/tasks/{id} until status SUCCEEDED, FAILED or CANCELLED
 *   (PENDING, RUNNING and THROTTLED keep polling), then one download of the first output URL.
 *   Header X-Runway-Version: 2024-11-06; the key in Authorization: Bearer, to
 *   api.dev.runwayml.com only — the download host gets no key header.
 *
 * Money rules: prices are data in the plan (list prices read 2026-11-22,
 * docs.dev.runwayml.com/guides/pricing, USD 0.01 per credit); one attempt line is appended
 * BEFORE the call, under the same O_EXCL lock as video:gen; one run sends at most one
 * generation call (a retry is a new run, at most one retry per clip id); the outcome line
 * tops the record up to the credits this run read back from Runway (cost_usd = max(0, C x
 * USD 0.01 - the attempt estimate); C and its limits: see the cost rule in liveRun). The
 * cap is the one of videogen.ts: --ceiling-usd is a ceiling on the total of the spend record,
 * at most PAID_SPEND_CAP_USD, and readLedgerTotal counts every line, whatever tool wrote it.
 */

import { randomUUID } from "crypto";
import * as crypto from "crypto";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

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

export const PRICE_READ = "2026-11-22";

/** docs.dev.runwayml.com/guides/pricing: one credit costs USD 0.01. */
export const USD_PER_CREDIT = 0.01;

/** The Runway API date-version header every request to the API host carries. */
export const RUNWAY_VERSION = "2024-11-06";

/** promptImage data URI limit (the docs put the still at most 5 MB). */
export const MAX_DATA_URI_CHARS = 5_000_000;

export const DEFAULT_TIMEOUT_SECONDS = 900;

/** The fixed sentence appended to the AI-4 prompt for the three voice clips. */
export const NARRATION_SENTENCE =
  'A calm adult narrator says: "The giver is told the seeker is nearby as the arrival gets close."';

const SERVICE = "runway";
const API_HOST = "api.dev.runwayml.com";
const API_BASE = `https://${API_HOST}/v1`;
const KEY_ENV_VAR = "RUNWAYML_API_SECRET";
const MICRO_PER_CREDIT = usdToMicro(USD_PER_CREDIT); // 10 000 whole micro-USD per credit

// ── small JSON helpers ─────────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;
const asObj = (v: unknown): Json => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {});
const asStr = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const asNum = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** The credits of an estimatedCost or cost reply value, which the API gives as {"credits": N};
 *  null for any other shape and for a number that is not finite or is below 0 (the spec allows
 *  a negative integer; null lets the cost rule fall through, so the record does not under-count). */
function readCredits(v: unknown): number | null {
  const c = asNum(asObj(v).credits);
  return c !== undefined && c >= 0 ? c : null;
}

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// ── the key: env first, else ONE macOS Keychain lookup (the shape of readGeminiKey) ─────

/**
 * Read the Runway API key. Prefers $RUNWAYML_API_SECRET (an empty or whitespace value counts
 * as absent); otherwise a SINGLE targeted Keychain generic-password lookup (service
 * RUNWAYML_API_SECRET, no scanning). Throws when neither is present, so the caller refuses
 * with key-missing and no attempt line is written. The key goes only in the Authorization
 * header of requests to api.dev.runwayml.com; it is never printed, logged or written to a file.
 */
export function readRunwayKey(): string {
  const fromEnv = process.env[KEY_ENV_VAR];
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  try {
    const out = execFileSync("security", ["find-generic-password", "-s", KEY_ENV_VAR, "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const key = out.trim();
    if (!key) throw new Error("empty key");
    return key;
  } catch {
    throw new Error(
      `Runway API key not found. Set $${KEY_ENV_VAR}, or store it in the macOS Keychain as a ` +
        `generic password (service "${KEY_ENV_VAR}", value = the key). Never commit the key.`,
    );
  }
}

// ── the run plan (data, checked on load; fail closed, also in the dry run) ─────────────

export interface RunwayModelInfo {
  name: string;
  promptMax: number; // promptText limit in UTF-16 code units
  promptMin: number; // promptText minimum in UTF-16 code units
  ratios: string[];
  durations: number[];
  audioFlag: boolean; // whether the model takes the audio flag at all
  /** The model always makes sound and has no audio switch (Kling 4.0): the body holds no audio key. */
  audioAlways: boolean;
  /** The clip charge is rounded up to whole credits (the list-price rule of Kling 4.0). */
  roundUpCredits: boolean;
  /** Ratios per endpoint, when the model gives them so; an endpoint with no list is refused. */
  ratiosByEndpoint?: Readonly<Record<string, string[]>>;
  /** ratio -> audio "true"/"false" -> list credits per second (docs.dev.runwayml.com/guides/pricing). */
  creditsPerSecond: Readonly<Record<string, Readonly<Record<string, number>>>>;
  /** The plan lists the model as taking a last frame (a convenience list, not a safety guard). */
  lastFrame: boolean;
}

/** Models the docs say take no last frame: a plan cannot set last_frame true on them. */
const NO_LAST_FRAME_MODELS = new Set(["kling_4_flash"]);

export interface RunwayClip {
  id: string;
  shot: string;
  model: string;
  endpoint: "text_to_video" | "image_to_video";
  seconds: number;
  ratio: string;
  audio: boolean;
  prompt: string;
  promptSha: string;
  creditsPerSecond: number;
  rateMicro: number; // whole micro-USD per second
  estimateMicro: number; // whole micro-USD for the clip
  roundedUp: boolean; // the clip charge was rounded up to whole credits
  sendAudioKey: boolean; // false for a model with no audio switch: the body holds no audio key
  lastFrame: boolean; // the plan lists the model as taking a last frame
}

export interface RunwayPlan {
  planId: string;
  clips: RunwayClip[];
  totalMicro: number;
}

/** Load and CHECK the plan file: unknown model, ratio, duration or audio value, a prompt over
 *  the model's UTF-16 limit, and a (model, ratio, audio) with no price entry all refuse. */
export function loadPlan(file: string): RunwayPlan {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new Refusal("plan-invalid", `plan ${file} is not readable JSON`);
  }
  const root = asObj(raw);
  const planId = asStr(root.plan_id);
  if (!planId) throw new Refusal("plan-invalid", "the plan holds no plan_id");

  const models: Record<string, RunwayModelInfo> = {};
  for (const [name, m] of Object.entries(asObj(root.models))) {
    const mo = asObj(m);
    const promptMax = asNum(mo.prompt_text_max);
    const promptMin = asNum(mo.prompt_text_min);
    const ratios = Array.isArray(mo.ratios) ? mo.ratios.map(String) : [];
    const durations = Array.isArray(mo.durations) ? mo.durations.map(Number) : [];
    const prices: Record<string, Record<string, number>> = {};
    for (const [ratio, byAudio] of Object.entries(asObj(mo.credits_per_second))) {
      const pa = asObj(byAudio);
      const entry: Record<string, number> = {};
      for (const flag of ["true", "false"]) {
        const c = asNum(pa[flag]);
        if (c !== undefined) entry[flag] = c;
      }
      prices[ratio] = entry;
    }
    if (
      promptMax === undefined || promptMax < 1 || promptMin === undefined || promptMin < 1 ||
      ratios.length === 0 || durations.length === 0 || durations.some((d) => !Number.isInteger(d) || d < 1)
    ) {
      throw new Refusal("plan-invalid", `model ${name} is not well formed`);
    }
    if (mo.audio_always !== undefined && typeof mo.audio_always !== "boolean") {
      throw new Refusal("plan-invalid", `model ${name}: audio_always must be true or false`);
    }
    const audioAlways = mo.audio_always === true;
    if (audioAlways && mo.audio_flag === true) {
      throw new Refusal("plan-invalid", `model ${name}: audio_flag and audio_always contradict`);
    }
    if (mo.round_up_credits !== undefined && typeof mo.round_up_credits !== "boolean") {
      throw new Refusal("plan-invalid", `model ${name}: round_up_credits must be true or false`);
    }
    if (mo.last_frame !== undefined && typeof mo.last_frame !== "boolean") {
      throw new Refusal("plan-invalid", `model ${name}: last_frame must be true or false`);
    }
    const lastFrame = mo.last_frame === true;
    if (lastFrame && NO_LAST_FRAME_MODELS.has(name)) {
      throw new Refusal("plan-invalid", `model ${name}: the docs say it takes no last frame, last_frame cannot be true`);
    }
    let ratiosByEndpoint: Record<string, string[]> | undefined;
    if (mo.ratios_by_endpoint !== undefined) {
      const rbe = asObj(mo.ratios_by_endpoint);
      ratiosByEndpoint = {};
      for (const [ep, list] of Object.entries(rbe)) {
        if (!Array.isArray(list) || list.length === 0) {
          throw new Refusal("plan-invalid", `model ${name}: ratios_by_endpoint ${ep} is not a list`);
        }
        ratiosByEndpoint[ep] = list.map(String);
      }
    }
    models[name] = {
      name, promptMax, promptMin, ratios, durations, audioFlag: mo.audio_flag === true, audioAlways,
      roundUpCredits: mo.round_up_credits === true, ratiosByEndpoint, creditsPerSecond: prices,
      lastFrame,
    };
  }
  if (Object.keys(models).length === 0) throw new Refusal("plan-invalid", "the plan holds no models");

  const clipsArr = Array.isArray(root.clips) ? root.clips : [];
  if (clipsArr.length === 0) throw new Refusal("plan-invalid", "the plan holds no clips");
  const clips: RunwayClip[] = [];
  const seen = new Set<string>();
  for (const c of clipsArr) {
    const co = asObj(c);
    const id = asStr(co.id);
    const shot = asStr(co.shot);
    const model = asStr(co.model);
    const endpoint = asStr(co.endpoint);
    const seconds = asNum(co.seconds);
    const ratio = asStr(co.ratio);
    const audio = co.audio;
    const prompt = asStr(co.prompt);
    if (!id || seen.has(id)) throw new Refusal("plan-invalid", "a clip id is missing or not unique");
    seen.add(id);
    if (!shot || !model || prompt === undefined) throw new Refusal("plan-invalid", `clip ${id} is not well formed`);
    if (endpoint !== "text_to_video" && endpoint !== "image_to_video") {
      throw new Refusal("plan-invalid", `clip ${id}: unknown endpoint ${String(endpoint)}`);
    }
    const m = models[model];
    if (!m) throw new Refusal("plan-invalid", `clip ${id}: unknown model ${model}`);
    if (!m.ratios.includes(ratio ?? "")) throw new Refusal("plan-invalid", `clip ${id}: ratio ${String(ratio)} is not a ratio of ${model}`);
    if (m.ratiosByEndpoint) {
      // per-endpoint ratios: no list for this endpoint is a refusal, not a fall back to m.ratios
      const list = m.ratiosByEndpoint[endpoint];
      if (!list || !list.includes(ratio ?? "")) {
        throw new Refusal("plan-invalid", `clip ${id}: ratio ${String(ratio)} is not a ratio of ${model} on ${endpoint}`);
      }
    }
    if (!m.durations.includes(seconds ?? -1)) throw new Refusal("plan-invalid", `clip ${id}: duration ${String(seconds)} is not a duration of ${model}`);
    if (typeof audio !== "boolean") throw new Refusal("plan-invalid", `clip ${id}: audio must be true or false`);
    if (audio && !m.audioFlag && !m.audioAlways) throw new Refusal("plan-invalid", `clip ${id}: model ${model} has no audio flag`);
    const units = prompt.length; // a JS string length IS UTF-16 code units
    if (units > m.promptMax) {
      throw new Refusal("prompt-too-long", `clip ${id}: the prompt is ${units} UTF-16 code units, model ${model} allows ${m.promptMax}`);
    }
    if (units < m.promptMin) {
      throw new Refusal("prompt-too-short", `clip ${id}: the prompt is ${units} UTF-16 code units, model ${model} needs at least ${m.promptMin}`);
    }
    const credits = ratio !== undefined ? m.creditsPerSecond[ratio]?.[String(audio)] : undefined;
    if (credits === undefined) {
      throw new Refusal("price-unknown", `no list price for model ${model} at ${ratio} audio ${audio}`);
    }
    const rateMicro = Math.round(credits * MICRO_PER_CREDIT);
    // fail closed: a price at or below 0, or one whose whole-micro-USD rate rounds to 0,
    // gives a 0 or negative estimate the cap checks and the attempt line cannot represent
    if (!(credits > 0) || rateMicro <= 0) {
      throw new Refusal(
        "price-unknown",
        `model ${model} at ${ratio} audio ${audio}: price ${credits} credits/s rounds to rate ${rateMicro} micro-USD/s`,
      );
    }
    let estimateMicro = rateMicro * (seconds as number);
    if (m.roundUpCredits) {
      // whole-number arithmetic: credits in thousandths, the clip charge rounded UP to whole credits
      const milli = Math.round(credits * 1000);
      const chargedCredits = Math.floor((milli * (seconds as number) + 999) / 1000);
      estimateMicro = chargedCredits * MICRO_PER_CREDIT;
    }
    clips.push({
      id, shot, model, endpoint, seconds: seconds as number, ratio: ratio as string, audio, prompt,
      promptSha: sha256(Buffer.from(prompt, "utf8")),
      creditsPerSecond: credits,
      rateMicro,
      estimateMicro,
      roundedUp: m.roundUpCredits,
      sendAudioKey: !m.audioAlways,
      lastFrame: m.lastFrame,
    });
  }
  return { planId, clips, totalMicro: clips.reduce((s, c) => s + c.estimateMicro, 0) };
}

// ── the still image (one --still at run time, the same still for every AI-4 clip) ───────

export interface StillImage {
  dataUri: string;
  sha: string;
}

/** Read and check the still BEFORE any key read: PNG or JPEG only, data URI at most 5 M chars. */
export function readStill(file: string, label = "still image"): StillImage {
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    throw new Refusal("input-missing", `${label} ${file} is not readable`);
  }
  const png = bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!png && !jpg) throw new Refusal("input-too-big", `${label} ${file} is neither PNG nor JPEG, so it cannot go in a promptImage data URI`);
  const dataUri = `data:${png ? "image/png" : "image/jpeg"};base64,${bytes.toString("base64")}`;
  if (dataUri.length > MAX_DATA_URI_CHARS) {
    throw new Refusal("input-too-big", `${label} ${file} as a data URI is ${dataUri.length} characters, above the ${MAX_DATA_URI_CHARS} limit`);
  }
  return { dataUri, sha: sha256(bytes) };
}

// ── args ───────────────────────────────────────────────────────────────────────────────

const VALUE_FLAGS = new Set(["--plan", "--ledger", "--out", "--ceiling-usd", "--clip", "--still", "--last-still", "--timeout-seconds"]);
const CEILING_RE = /^(?:\d+(?:\.\d+)?|\.\d+)$/; // a plain number: no sign, exponent or separators

export interface RunwayArgs {
  planFile: string;
  out: string;
  ledger: string;
  ceilingUsd: number;
  clip?: string;
  still?: string;
  lastStill?: string;
  timeoutSeconds: number;
  live: boolean;
}

export function parseRunwayArgs(argv: string[]): RunwayArgs {
  const vals: Record<string, string> = {};
  let live = false;
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--live") {
      live = true;
      continue;
    }
    if (!VALUE_FLAGS.has(k) || i + 1 >= argv.length) throw new Refusal("usage", `bad or incomplete argument ${k}`);
    if (k === "--last-still" && k in vals) throw new Refusal("usage", "--last-still is given twice; one last frame only");
    vals[k] = argv[++i];
  }
  if ("--last-still" in vals) {
    if (!vals["--clip"]) throw new Refusal("usage", "--last-still needs one --clip");
    if (!vals["--still"]) throw new Refusal("usage", "--last-still needs --still: exactly one first frame, no last-only array is sent");
  }
  for (const req of ["--plan", "--out", "--ledger", "--ceiling-usd"]) {
    if (!vals[req]) throw new Refusal("usage", `missing required argument ${req}`);
  }
  if (live && !vals["--clip"]) throw new Refusal("usage", "--live needs one --clip (at most one generation call per run)");
  if (!CEILING_RE.test(vals["--ceiling-usd"])) throw new Refusal("usage", "--ceiling-usd must be a plain number");
  const ceilingUsd = Number(vals["--ceiling-usd"]);
  if (!(ceilingUsd > 0) || ceilingUsd > PAID_SPEND_CAP_USD) {
    throw new Refusal("usage", `--ceiling-usd must be above 0 and at most ${PAID_SPEND_CAP_USD}`);
  }
  let timeoutSeconds = DEFAULT_TIMEOUT_SECONDS;
  if (vals["--timeout-seconds"]) {
    if (!/^\d+$/.test(vals["--timeout-seconds"]) || Number(vals["--timeout-seconds"]) < 1) {
      throw new Refusal("usage", "--timeout-seconds must be a whole number above 0");
    }
    timeoutSeconds = Number(vals["--timeout-seconds"]);
  }
  return {
    planFile: vals["--plan"],
    out: vals["--out"],
    ledger: vals["--ledger"],
    ceilingUsd,
    clip: vals["--clip"],
    still: vals["--still"],
    lastStill: vals["--last-still"],
    timeoutSeconds,
    live,
  };
}

// ── retry count (at most one retry per clip id: two attempt lines and the third refuses) ─

/** Count this plan's try-out attempt lines for one clip id (service runway, same plan id). */
export function countAttempts(ledger: string, planId: string, clipId: string): number {
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
      if (o.kind === "attempt" && o.service === SERVICE) {
        const s = asObj(o.sent);
        if (s.plan_id === planId && s.clip_id === clipId) n++;
      }
    } catch {
      // readLedgerTotal is the gatekeeper for odd lines; here an odd line simply does not count
    }
  }
  return n;
}

// ── build the run (folder checks, ledger read, cap check, retry count) ──────────────────

export interface RunwayBuilt {
  plan: RunwayPlan;
  clip?: RunwayClip;
  still?: StillImage;
  lastStill?: StillImage;
  ceilingUsd: number;
  spentMicro: number;
  outReal: string;
  ledgerReal: string;
  lockPath: string;
}

export function buildRun(a: RunwayArgs): RunwayBuilt {
  const plan = loadPlan(a.planFile);
  const clip = a.clip ? plan.clips.find((c) => c.id === a.clip) : undefined;
  if (a.clip && !clip) throw new Refusal("plan-invalid", `the plan holds no clip ${a.clip}`);
  if (a.lastStill !== undefined && clip) {
    if (!clip.lastFrame) throw new Refusal("usage", `clip ${clip.id}: model ${clip.model} is not listed in the plan as taking a last frame (last_frame)`);
    if (clip.endpoint === "text_to_video") throw new Refusal("usage", `clip ${clip.id} is text_to_video and takes no --last-still`);
  }
  const still = a.still ? readStill(a.still) : undefined;
  if (still && clip && clip.endpoint === "text_to_video") {
    throw new Refusal("usage", `clip ${clip.id} is text_to_video and takes no --still`);
  }
  const lastStill = a.lastStill !== undefined ? readStill(a.lastStill, "last still image") : undefined;
  if (a.live && clip && clip.endpoint === "image_to_video" && !still) {
    throw new Refusal("usage", `clip ${clip.id} is image_to_video and needs --still`);
  }
  const outReal = checkFolder(a.out, "out folder");
  const ledgerFolder = checkFolder(path.dirname(a.ledger), "ledger folder");
  const ledgerReal = path.join(ledgerFolder, path.basename(a.ledger));
  const lockPath = `${ledgerReal}.lock`;

  const spentMicro = readLedgerTotal(ledgerReal); // every line of the record
  const plannedMicro = clip ? clip.estimateMicro : plan.totalMicro;
  if (spentMicro + plannedMicro > usdToMicro(a.ceilingUsd)) {
    throw new Refusal(
      "over-ceiling",
      `spend record total ${formatUsdMicro(spentMicro)} plus planned ${formatUsdMicro(plannedMicro)} is above ceiling ${a.ceilingUsd}`,
    );
  }
  if (a.live && clip && countAttempts(ledgerReal, plan.planId, clip.id) >= 2) {
    throw new Refusal("retry-limit", `clip ${clip.id} already has 2 try-out attempt lines in plan ${plan.planId}`);
  }
  return { plan, clip, still, lastStill, ceilingUsd: a.ceilingUsd, spentMicro, outReal, ledgerReal, lockPath };
}

// ── network caller (one injected object behind each network step) ──────────────────────

export interface RunwayCaller {
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

/** How many redirects one download call follows (the same limit as video:gen). */
const MAX_DOWNLOAD_REDIRECTS = 5;

/** The Authorization header goes to the API host only; a request to another host gets none. */
function headersFor(url: string, headers: Record<string, string>): Record<string, string> {
  if (new URL(url).host === API_HOST) return headers;
  const rest: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() !== "authorization") rest[k] = v;
  return rest;
}

/** The next URL when this reply is a redirect this code follows; null when the reply is the result. */
function nextHop(url: string, res: Response, isDownload: boolean, method: string, hop: number): string | null {
  if (!isDownload || method !== "GET") return null; // the API calls take a 3xx as the reply
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
      const next = nextHop(url, res, as === "bytes", call.method, hop);
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
export function realRunwayCaller(): RunwayCaller {
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

export interface RunwayDeps {
  caller?: RunwayCaller;
  keyReader?: () => string;
  pollIntervalMs?: number;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function scrub(text: string, key: string): string {
  return key ? text.split(key).join("[redacted]") : text;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function apiHeaders(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}`, "X-Runway-Version": RUNWAY_VERSION };
}

interface Outcome {
  status: string; // ok / failed / cancelled / timeout / http-<n> / error
  taskId: string | null;
  estimated: number | null;
  finalCost: number | null;
  file: string | null;
  fileSha: string | null;
  failure: string | null;
}

async function liveRun(a: RunwayArgs, b: RunwayBuilt, deps?: RunwayDeps): Promise<CliResult> {
  const clip = b.clip as RunwayClip;

  // the key is read BEFORE the attempt line, so a key-missing run writes nothing and calls nothing
  let key = "";
  try {
    key = (deps?.keyReader ?? readRunwayKey)();
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
      plan_id: b.plan.planId,
      clip_id: clip.id,
      shot: clip.shot,
      model: clip.model,
      endpoint: clip.endpoint,
      seconds: clip.seconds,
      ratio: clip.ratio,
      audio: clip.audio,
      prompt_sha256: clip.promptSha,
      image_sha256: b.still ? b.still.sha : null,
      ...(b.lastStill ? { last_image_sha256: b.lastStill.sha } : {}),
    },
    cost_usd: clip.estimateMicro / 1e6,
    cost_how: {
      rate_usd_per_s: clip.rateMicro / 1e6,
      credits_per_s: clip.creditsPerSecond,
      price_read: PRICE_READ,
      basis: clip.roundedUp
        ? "list credits per second x seconds, rounded up to whole credits, x USD 0.01 per credit"
        : "list credits per second x seconds x USD 0.01 per credit",
    },
    status: "attempted",
  });

  // lock held from the re-read of the total to the attempt line; O_EXCL, no wait, no steal
  try {
    fs.closeSync(fs.openSync(b.lockPath, "wx"));
  } catch {
    throw new Refusal("ledger-busy", `lock file ${b.lockPath} exists`);
  }
  try {
    const total = readLedgerTotal(b.ledgerReal); // every line again, under the lock
    if (total + clip.estimateMicro > usdToMicro(a.ceilingUsd)) {
      throw new Refusal(
        "over-ceiling",
        `spend record total ${formatUsdMicro(total)} plus estimate ${formatUsdMicro(clip.estimateMicro)} is above ceiling ${a.ceilingUsd}`,
      );
    }
    if (countAttempts(b.ledgerReal, b.plan.planId, clip.id) >= 2) {
      throw new Refusal("retry-limit", `clip ${clip.id} already has 2 try-out attempt lines in plan ${b.plan.planId}`);
    }
    fs.appendFileSync(b.ledgerReal, `${attemptLine}\n`); // BEFORE the call is sent
  } finally {
    fs.unlinkSync(b.lockPath);
  }

  const caller = deps?.caller ?? realRunwayCaller();
  const timeoutMs = a.timeoutSeconds * 1000;
  const intervalMs = deps?.pollIntervalMs ?? 5000;

  let taskId: string | null = null;
  let estimated: number | null = null;
  // a terminal cost already read survives a later failure (no output url, a download or write
  // that fails), so the outcome line below still counts it through the cost rule
  let finalCost: number | null = null;
  let o: Outcome;
  try {
    const body: Record<string, unknown> = {
      model: clip.model,
      promptText: clip.prompt,
      ratio: clip.ratio,
      duration: clip.seconds,
    };
    // named explicitly on every call: the API default is true; a model with no audio switch
    // (Kling 4.0) gets no key, its schema refuses unknown keys
    if (clip.sendAudioKey) body.audio = clip.audio;
    if (clip.endpoint === "image_to_video") {
      const first = (b.still as StillImage).dataUri;
      // with a last still: the documented array, exactly one first frame and one last frame
      body.promptImage = b.lastStill
        ? [{ uri: first, position: "first" }, { uri: b.lastStill.dataUri, position: "last" }]
        : first;
    }

    const createReply = asObj(
      await caller.create({
        url: `${API_BASE}/${clip.endpoint}`,
        method: "POST",
        headers: { ...apiHeaders(key), "content-type": "application/json" },
        body: JSON.stringify(body),
        timeoutMs,
      }),
    );
    taskId = asStr(createReply.id) ?? null;
    estimated = readCredits(createReply.estimatedCost);
    if (!taskId) throw new Error("the create reply holds no task id");

    // poll GET /v1/tasks/{id}: PENDING, RUNNING and THROTTLED (and anything unknown) keep polling
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
    finalCost = readCredits(task.cost);

    if (status === "SUCCEEDED") {
      const outputs = Array.isArray(task.output) ? task.output : [];
      const url = asStr(outputs[0]);
      if (!url) throw new Error("the SUCCEEDED task holds no output url");
      // one download of the first output URL; the download host gets no key header
      const bytes = await caller.download({ url, method: "GET", headers: {}, timeoutMs });
      const fileName = `clip-${clip.id}-${attemptId}.mp4`;
      fs.writeFileSync(path.join(b.outReal, fileName), bytes); // the returned bytes, as received
      o = { status: "ok", taskId, estimated, finalCost, file: fileName, fileSha: sha256(bytes), failure: null };
    } else {
      const raw = task.failure;
      const failureText = raw === undefined ? "" : typeof raw === "string" ? raw : JSON.stringify(raw);
      o = {
        status: status === "FAILED" ? "failed" : "cancelled",
        taskId, estimated, finalCost, file: null, fileSha: null,
        failure: failureText !== "" ? failureText : null,
      };
    }
  } catch (e) {
    const status = e instanceof CallTimeout ? "timeout" : e instanceof HttpError ? `http-${e.status}` : "error";
    o = { status, taskId, estimated, finalCost, file: null, fileSha: null, failure: msg(e) };
  }

  // cost rule: after the outcome line the record holds, for this attempt, the larger of the
  // list estimate and C x USD 0.01. C = the cost credits of the terminal task reply when the
  // run read one with a number; else the estimatedCost credits of the create reply; else 0.
  // A charge above that amount is not in the record when the run read no terminal reply (the
  // create or a status call failed, or the poll ran out) or the terminal reply held no cost;
  // whether a terminal cost equals what Runway bills is not measured.
  // A run that ends before the outcome line leaves the list estimate only.
  const cCredits = o.finalCost ?? o.estimated ?? 0;
  const deltaMicro = Math.max(0, Math.round(cCredits * MICRO_PER_CREDIT) - clip.estimateMicro);

  // scrub the WHOLE text before the 200-character cut: cutting first would leave the first
  // part of a key that straddles character 200, a part scrub can no longer match
  const failure = o.failure ? scrub(o.failure.replace(/\s+/g, " "), key).slice(0, 200) : null;
  fs.appendFileSync(
    b.ledgerReal,
    `${JSON.stringify({
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
    })}\n`,
  );

  if (o.status === "ok") {
    const out = scrub(`runway: wrote ${o.file} usd=${formatUsdMicro(clip.estimateMicro)} attempt=${attemptId}\n`, key);
    return { code: 0, out, err: "" };
  }
  const err = scrub(`runway: ${o.status} attempt=${attemptId}${failure ? ` ${failure}` : ""}\n`, key);
  return { code: 1, out: "", err };
}

// ── dry run (the default: reads no key, sends nothing, writes nothing) ──────────────────

function clipLine(c: RunwayClip, still?: StillImage, lastStill?: StillImage): string {
  const stillPart =
    (still && c.endpoint === "image_to_video" ? ` still-sha256=${still.sha}` : "") +
    (lastStill && c.endpoint === "image_to_video" ? ` last-still-sha256=${lastStill.sha}` : "");
  return (
    `runway: clip id=${c.id} shot=${c.shot} model=${c.model} endpoint=${c.endpoint}` +
    ` seconds=${c.seconds} ratio=${c.ratio} audio=${c.audio} prompt-sha256=${c.promptSha}${stillPart}` +
    ` rate-usd-per-s=${formatUsdMicro(c.rateMicro)} estimate-usd=${formatUsdMicro(c.estimateMicro)}`
  );
}

function dryRunOutput(b: RunwayBuilt): string {
  const clips = b.clip ? [b.clip] : b.plan.clips;
  const plannedMicro = b.clip ? b.clip.estimateMicro : b.plan.totalMicro;
  const roomMicro = usdToMicro(b.ceilingUsd) - b.spentMicro;
  const lines = [
    "runway: dry-run (no request sent, no key read, nothing written)",
    ...clips.map((c) => clipLine(c, b.still, b.lastStill)),
    `runway: total clips=${clips.length} usd=${formatUsdMicro(plannedMicro)}`,
    `runway: spend group=all spent usd=${formatUsdMicro(b.spentMicro)} ceiling=${b.ceilingUsd}` +
      ` room usd=${formatUsdMicroDown(roomMicro)} room-after usd=${formatUsdMicroDown(roomMicro - plannedMicro)}`,
  ];
  return `${lines.join("\n")}\n`;
}

/** Parse, check and run; dry run is the default, --live sends at most one generation call. */
export async function runRunwayTryout(argv: string[], deps?: RunwayDeps): Promise<CliResult> {
  try {
    const a = parseRunwayArgs(argv);
    const b = buildRun(a);
    if (!a.live) return { code: 0, out: dryRunOutput(b), err: "" };
    return await liveRun(a, b, deps);
  } catch (e) {
    if (e instanceof Refusal) return { code: 2, out: "", err: `${e.message}\n` };
    return { code: 1, out: "", err: `runway: error: ${msg(e)}\n` };
  }
}
