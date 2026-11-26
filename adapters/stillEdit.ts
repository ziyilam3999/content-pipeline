/**
 * Row A52c — paid still-image tool (Gemini 2.5 Flash Image), dry run by default, with the
 * one spend cap and the spend record. Thin CLI: tools/stillEdit.ts (npm run still:edit).
 *
 * Why this tool (day card item 17 (a)): the AI-4 start still needs one local edit before the
 * next video take, and the repo has no image tool under the spend rules — adapters/genart.ts
 * sends text only, writes no spend line and retries up to 5 times inside one run. This tool
 * sends ONE generateContent call per run: with --in an edit (image part plus text part),
 * without --in text to image. Prompt texts are plan data (tools/still-edit-plan.json), never
 * code. One run handles one item; a retry is a new run with its own attempt line.
 *
 * Call shape from the pages read 2026-11-22 (public, no key):
 *   https://ai.google.dev/api/generate-content (redirects to aistudio.google.com/api-reference/
 *   generate-content): POST /v1beta/models/{model}:generateContent, a Part with inlineData
 *   holding mimeType and data, imageConfig.aspectRatio with 9:16 in its list.
 *   https://ai.google.dev/gemini-api/docs/image-generation (redirects to aistudio.google.com/
 *   docs/image-generation): "By default, the model matches the output image size to that of
 *   your input image, or otherwise generates 1:1 squares"; 9:16 is 768x1344 for this model.
 * responseModalities on generateContent rests on the live-verified comment at genart.ts:162
 * ("Verified live 2026-06-08"); the current image docs page shows its REST examples on the
 * Interactions endpoint with a newer model, so the FIRST LIVE CALL is the real check of the
 * body (PR body open point). The reply's first inlineData part is the image (candidates[0]
 * .content.parts[]), the small parse of genart.ts copied here.
 *
 * Money rules: the price is plan data (list price read 2026-11-22 on
 * https://ai.google.dev/gemini-api/docs/pricing: USD 0.039 per output image; the estimate is
 * USD 0.040 = 0.039 output + 0.001 input, a guess on the high side); whole micro-USD
 * arithmetic with the helpers of videogen.ts. One attempt line is appended to the ledger
 * BEFORE the call, under the same O_EXCL lock as video:gen and video:tryout; a failed send
 * keeps its attempt line, so failed sends use up the cap. The cap is the one of videogen.ts:
 * --ceiling-usd is a ceiling on the total of the spend record, at most PAID_SPEND_CAP_USD,
 * and readLedgerTotal counts every line, whatever tool wrote it. It refuses an unknown
 * service, so the table in videogen.ts lists service gemini-image.
 */

import { randomUUID } from "crypto";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import { readGeminiKey } from "./genart";
import {
  CallTimeout,
  checkFolder,
  formatUsdMicro,
  formatUsdMicroDown,
  HttpError,
  MAX_IMAGE_BYTES,
  NetCall,
  PAID_SPEND_CAP_USD,
  readLedgerTotal,
  Refusal,
  usdToMicro,
} from "./videogen";

export type { NetCall } from "./videogen";

// ── constants ──────────────────────────────────────────────────────────────────────────

export const DEFAULT_TIMEOUT_SECONDS = 120;

const SERVICE = "gemini-image";
const API_HOST = "generativelanguage.googleapis.com";
const API_BASE = `https://${API_HOST}/v1beta`;
const KEY_HEADER = "x-goog-api-key";

// ── small JSON helpers ─────────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;
const asObj = (v: unknown): Json => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : {});
const asStr = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const asNum = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// ── the run plan (data, checked on load; fail closed, also in the dry run) ─────────────

export interface StillItem {
  id: string;
  shot: string;
  needsInput: boolean;
  aspectRatio?: string;
  prompt: string;
  promptSha: string;
}

export interface StillPlan {
  planId: string;
  model: string;
  priceUsdPerCall: number;
  priceRead: string;
  items: StillItem[];
}

/** Load and CHECK the plan file: not readable JSON, a bad price, a bad item shape all refuse. */
export function loadPlan(file: string): StillPlan {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new Refusal("plan-invalid", `plan ${file} is not readable JSON`);
  }
  const root = asObj(raw);
  const planId = asStr(root.plan_id);
  if (!planId) throw new Refusal("plan-invalid", "the plan holds no plan_id");
  const model = asStr(root.model);
  if (!model) throw new Refusal("plan-invalid", "the plan holds no model");
  const price = root.price_usd_per_call;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    throw new Refusal("plan-invalid", "the plan price_usd_per_call is missing or not a positive number");
  }
  const priceRead = asStr(root.price_read);
  if (!priceRead) throw new Refusal("plan-invalid", "the plan holds no price_read");
  const itemsArr = Array.isArray(root.items) ? root.items : [];
  if (itemsArr.length === 0) throw new Refusal("plan-invalid", "the plan holds no items");
  const items: StillItem[] = [];
  const seen = new Set<string>();
  for (const it of itemsArr) {
    const o = asObj(it);
    const id = asStr(o.id);
    if (!id || seen.has(id)) throw new Refusal("plan-invalid", "an item id is missing or not unique");
    seen.add(id);
    const prompt = asStr(o.prompt);
    if (prompt === undefined || prompt === "") {
      throw new Refusal("plan-invalid", `item ${id}: the prompt is not a non-empty string`);
    }
    if (typeof o.needs_input !== "boolean") {
      throw new Refusal("plan-invalid", `item ${id}: needs_input must be true or false`);
    }
    const shot = asStr(o.shot) ?? "";
    let aspectRatio: string | undefined;
    if (o.aspect_ratio !== undefined) {
      if (typeof o.aspect_ratio !== "string") {
        throw new Refusal("plan-invalid", `item ${id}: aspect_ratio must be a string`);
      }
      aspectRatio = o.aspect_ratio;
    }
    items.push({ id, shot, needsInput: o.needs_input, aspectRatio, prompt, promptSha: sha256(Buffer.from(prompt, "utf8")) });
  }
  return { planId, model, priceUsdPerCall: price, priceRead, items };
}

// ── the input image (one --in at run time; PNG or JPEG, its own reader) ─────────────────

export interface InputImage {
  bytes: Buffer;
  sha: string;
  mimeType: string;
}

/**
 * Read and check the input image BEFORE any key read. The same three codes as the reader of
 * videogen.ts, the same wording after the role word, plus input-symlink (an lstat before the
 * read): a symbolic link is refused rather than followed.
 */
export function readInputImage(file: string): InputImage {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(file);
  } catch {
    throw new Refusal("input-missing", `input image ${file} is not readable`);
  }
  if (st.isSymbolicLink()) throw new Refusal("input-symlink", `input image ${file} is a symlink`);
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    throw new Refusal("input-missing", `input image ${file} is not readable`);
  }
  const png = bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!png && !jpg) throw new Refusal("input-not-image", `input image ${file} is neither PNG nor JPEG`);
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Refusal("input-too-big", `input image ${file} is above the ${MAX_IMAGE_BYTES} byte limit (a guess)`);
  }
  return { bytes, sha: sha256(bytes), mimeType: png ? "image/png" : "image/jpeg" };
}

// ── args ───────────────────────────────────────────────────────────────────────────────

const VALUE_FLAGS = new Set(["--plan", "--item", "--out", "--ledger", "--ceiling-usd", "--in", "--timeout-seconds"]);
const CEILING_RE = /^(?:\d+(?:\.\d+)?|\.\d+)$/; // a plain number: no sign, exponent or separators

export interface StillEditArgs {
  planFile: string;
  item: string;
  out: string;
  ledger: string;
  ceilingUsd: number;
  in?: string;
  timeoutSeconds: number;
  live: boolean;
}

export function parseStillArgs(argv: string[]): StillEditArgs {
  const vals: Record<string, string> = {};
  let live = false;
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--live") {
      live = true;
      continue;
    }
    if (!VALUE_FLAGS.has(k) || i + 1 >= argv.length) throw new Refusal("usage", `bad or incomplete argument ${k}`);
    vals[k] = argv[++i];
  }
  for (const req of ["--plan", "--item", "--out", "--ledger", "--ceiling-usd"]) {
    if (!vals[req]) throw new Refusal("usage", `missing required argument ${req}`);
  }
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
    item: vals["--item"],
    out: vals["--out"],
    ledger: vals["--ledger"],
    ceilingUsd,
    in: vals["--in"],
    timeoutSeconds,
    live,
  };
}

// ── build the run (item and input checks, folder checks, ledger read, cap, lock) ───────

export interface StillBuilt {
  plan: StillPlan;
  item: StillItem;
  mode: "edit" | "text";
  input?: InputImage;
  estimateMicro: number;
  ceilingUsd: number;
  spentMicro: number;
  outReal: string;
  ledgerReal: string;
  lockPath: string;
}

export function buildStillRun(a: StillEditArgs): StillBuilt {
  const plan = loadPlan(a.planFile);
  const item = plan.items.find((i) => i.id === a.item);
  if (!item) throw new Refusal("plan-invalid", `the plan holds no item ${a.item}`);
  if (item.needsInput && !a.in) {
    throw new Refusal("usage", `item ${item.id} needs an input image: give --in <png or jpeg>`);
  }
  if (!item.needsInput && a.in) {
    throw new Refusal("usage", `item ${item.id} takes no --in (its prompt is text only)`);
  }
  const input = a.in ? readInputImage(a.in) : undefined;

  const outReal = checkFolder(a.out, "out folder");
  const ledgerFolder = checkFolder(path.dirname(a.ledger), "ledger folder");
  const ledgerReal = path.join(ledgerFolder, path.basename(a.ledger));
  const lockPath = `${ledgerReal}.lock`;

  const estimateMicro = usdToMicro(plan.priceUsdPerCall);
  const spentMicro = readLedgerTotal(ledgerReal); // every line of the record
  if (fs.existsSync(lockPath)) throw new Refusal("ledger-busy", `lock file ${lockPath} exists`);
  if (spentMicro + estimateMicro > usdToMicro(a.ceilingUsd)) {
    throw new Refusal(
      "over-ceiling",
      `spend record total ${formatUsdMicro(spentMicro)} plus estimate ${formatUsdMicro(estimateMicro)} is above ceiling ${a.ceilingUsd}`,
    );
  }
  return {
    plan,
    item,
    mode: input ? "edit" : "text",
    input,
    estimateMicro,
    ceilingUsd: a.ceilingUsd,
    spentMicro,
    outReal,
    ledgerReal,
    lockPath,
  };
}

// ── network caller (one injected object behind the one network step) ───────────────────

export interface StillCaller {
  generate(call: NetCall): Promise<unknown>;
}

/** fetch is looked up HERE, when a call runs, so loading the module binds nothing. */
function fetchNow(): typeof fetch {
  const f = (globalThis as { fetch?: typeof fetch }).fetch;
  if (typeof f !== "function") throw new Error("globalThis.fetch is unavailable");
  return f;
}

/** The key header goes to the API host only; a request to another host gets none. */
function headersFor(url: string, headers: Record<string, string>): Record<string, string> {
  if (new URL(url).host === API_HOST) return headers;
  const rest: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() !== KEY_HEADER) rest[k] = v;
  return rest;
}

/** One POST; a redirect is not followed (it is the reply, and it is not ok). */
async function send(call: NetCall): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), call.timeoutMs);
  try {
    const res = await fetchNow()(call.url, {
      method: call.method,
      headers: headersFor(call.url, call.headers),
      body: call.body,
      redirect: "manual",
      signal: controller.signal,
    });
    if (!res.ok) throw new HttpError(res.status);
    return res.json();
  } catch (e) {
    if (controller.signal.aborted) throw new CallTimeout(call.url.split("?")[0]);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** The real caller; the key sits in the x-goog-api-key header to the API host only. */
export function realStillCaller(): StillCaller {
  return { generate: (c) => send(c) };
}

// ── the reply (the first inlineData part is the image; usageMetadata when present) ─────

export interface ParsedReply {
  /** The first image part of the reply, its data possibly empty (checked by the run). */
  image?: { data: string; mimeType?: string };
  promptTokens?: number;
  outputTokens?: number;
}

export function parseStillReply(raw: unknown): ParsedReply {
  const json = asObj(raw);
  const candidates = Array.isArray(json.candidates) ? json.candidates : [];
  const partsRaw = asObj(asObj(candidates[0]).content).parts;
  const parts = Array.isArray(partsRaw) ? (partsRaw as unknown[]) : [];
  let image: ParsedReply["image"] | undefined;
  for (const p of parts) {
    const o = asObj(p);
    const inline = asObj(o.inlineData ?? o.inline_data);
    const d = asStr(inline.data);
    if (d !== undefined) {
      // the first inlineData part is the image (its data may be empty: the run checks that)
      image = { data: d, mimeType: asStr(inline.mimeType) ?? asStr(inline.mime_type) };
      break;
    }
  }
  const usage = asObj(json.usageMetadata);
  const out = asNum(usage.candidatesTokenCount) ?? asNum(usage.outputTokenCount);
  return {
    image,
    promptTokens: asNum(usage.promptTokenCount),
    outputTokens: out,
  };
}

/** PNG width and height from the IHDR header (bytes 16-23, big-endian); null when not a PNG header. */
export function pngSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  if (bytes[12] !== 0x49 || bytes[13] !== 0x48 || bytes[14] !== 0x44 || bytes[15] !== 0x52) return null; // IHDR
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

// ── the run ────────────────────────────────────────────────────────────────────────────

export interface CliResult {
  code: number;
  out: string;
  err: string;
}

export interface StillEditDeps {
  caller?: StillCaller;
  keyReader?: () => string;
}

/** Reads the key the way adapters/genart.ts does: env first, else one Keychain lookup. */
const defaultKeyReader = (): string => readGeminiKey();

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function scrub(text: string, key: string): string {
  return key ? text.split(key).join("[redacted]") : text;
}

/** Request body: edit mode an image part then a text part; text mode the text part only,
 *  plus imageConfig.aspectRatio from the plan item when the item names one. */
function buildRequestBody(b: StillBuilt): string {
  const parts: Record<string, unknown>[] = [];
  if (b.mode === "edit" && b.input) {
    parts.push({ inlineData: { mimeType: b.input.mimeType, data: b.input.bytes.toString("base64") } });
  }
  parts.push({ text: b.item.prompt });
  const generationConfig: Record<string, unknown> = { responseModalities: ["TEXT", "IMAGE"] };
  if (b.mode === "text" && b.item.aspectRatio) {
    generationConfig.imageConfig = { aspectRatio: b.item.aspectRatio };
  }
  return JSON.stringify({ contents: [{ parts }], generationConfig });
}

interface Outcome {
  status: "ok" | "failed" | "no-image" | "timeout";
  file: string | null;
  fileSha: string | null;
  mime: string | null;
  width: number | null;
  height: number | null;
  promptTokens: number | null;
  outputTokens: number | null;
  failure: string | null;
}

const noFile = (status: Outcome["status"], failure: string | null, promptTokens: number | null = null, outputTokens: number | null = null): Outcome => ({
  status,
  file: null,
  fileSha: null,
  mime: null,
  width: null,
  height: null,
  promptTokens,
  outputTokens,
  failure,
});

async function liveRun(a: StillEditArgs, b: StillBuilt, deps?: StillEditDeps): Promise<CliResult> {
  // the key is read BEFORE the attempt line, so a key-missing run writes nothing and calls nothing
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
      plan_id: b.plan.planId,
      item_id: b.item.id,
      shot: b.item.shot,
      model: b.plan.model,
      mode: b.mode,
      prompt_sha256: b.item.promptSha,
      image_sha256: b.input ? b.input.sha : null,
    },
    cost_usd: b.estimateMicro / 1e6,
    cost_how: {
      price_usd_per_call: b.plan.priceUsdPerCall,
      output_usd_per_image: 0.039,
      input_usd_guess: 0.001,
      price_read: b.plan.priceRead,
      basis: "list output price USD 0.039 per image plus USD 0.001 for the input (a guess on the high side)",
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
    if (total + b.estimateMicro > usdToMicro(a.ceilingUsd)) {
      throw new Refusal(
        "over-ceiling",
        `spend record total ${formatUsdMicro(total)} plus estimate ${formatUsdMicro(b.estimateMicro)} is above ceiling ${a.ceilingUsd}`,
      );
    }
    fs.appendFileSync(b.ledgerReal, `${attemptLine}\n`); // BEFORE the call is sent
  } finally {
    fs.unlinkSync(b.lockPath);
  }

  const caller = deps?.caller ?? realStillCaller();
  const timeoutMs = a.timeoutSeconds * 1000;

  let o: Outcome;
  try {
    const raw = await caller.generate({
      url: `${API_BASE}/models/${encodeURIComponent(b.plan.model)}:generateContent`,
      method: "POST",
      headers: { [KEY_HEADER]: key, "content-type": "application/json" },
      body: buildRequestBody(b),
      timeoutMs,
    });
    const parsed = parseStillReply(raw);
    const promptTokens = parsed.promptTokens ?? null;
    const outputTokens = parsed.outputTokens ?? null;
    const img = parsed.image;
    if (!img) {
      o = noFile("no-image", "the reply holds no image part", promptTokens, outputTokens);
    } else {
      const mime = img.mimeType ?? "";
      if (mime !== "image/png" && mime !== "image/jpeg") {
        o = noFile("no-image", `the reply image has mime ${mime || "none"}, not image/png or image/jpeg`, promptTokens, outputTokens);
      } else {
        const bytes = Buffer.from(img.data, "base64");
        if (bytes.length === 0) {
          o = noFile("no-image", "the reply image data is empty", promptTokens, outputTokens);
        } else {
          const dims = pngSize(bytes); // read from the PNG header when the reply is a PNG, else null
          const ext = mime === "image/png" ? "png" : "jpg";
          const fileName = `still-${b.item.id}-${attemptId.slice(0, 8)}.${ext}`;
          fs.writeFileSync(path.join(b.outReal, fileName), bytes); // the returned bytes, as received
          o = {
            status: "ok",
            file: fileName,
            fileSha: sha256(bytes),
            mime,
            width: dims ? dims.width : null,
            height: dims ? dims.height : null,
            promptTokens,
            outputTokens,
            failure: null,
          };
        }
      }
    }
  } catch (e) {
    const status = e instanceof CallTimeout ? "timeout" : "failed";
    o = noFile(status, msg(e));
  }

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
      cost_usd: 0,
      status: o.status,
      file: o.file,
      file_sha256: o.fileSha,
      mime: o.mime,
      width: o.width,
      height: o.height,
      prompt_tokens: o.promptTokens,
      output_tokens: o.outputTokens,
      failure,
    })}\n`,
  );

  if (o.status === "ok") {
    const out = scrub(`still: wrote ${o.file} usd=${formatUsdMicro(b.estimateMicro)} attempt=${attemptId}\n`, key);
    return { code: 0, out, err: "" };
  }
  const err = scrub(`still: ${o.status} attempt=${attemptId}${failure ? ` ${failure}` : ""}\n`, key);
  return { code: 1, out: "", err };
}

// ── dry run (the default: reads no key, sends nothing, writes nothing) ──────────────────

function dryRunOutput(b: StillBuilt): string {
  const roomMicro = usdToMicro(b.ceilingUsd) - b.spentMicro;
  const lines = [
    "still: dry-run (no request sent, no key read, nothing written)",
    `still: item id=${b.item.id} mode=${b.mode} model=${b.plan.model} prompt-sha256=${b.item.promptSha}` +
      (b.input ? ` in-sha256=${b.input.sha}` : "") +
      ` estimate-usd=${formatUsdMicro(b.estimateMicro)}`,
    `still: spend group=all spent usd=${formatUsdMicro(b.spentMicro)} ceiling=${b.ceilingUsd}` +
      ` room usd=${formatUsdMicroDown(roomMicro)} room-after usd=${formatUsdMicroDown(roomMicro - b.estimateMicro)}`,
  ];
  return `${lines.join("\n")}\n`;
}

/** Parse, check and run; dry run is the default, --live sends at most one generation call. */
export async function runStillEdit(argv: string[], deps?: StillEditDeps): Promise<CliResult> {
  try {
    const a = parseStillArgs(argv);
    const b = buildStillRun(a);
    if (!a.live) return { code: 0, out: dryRunOutput(b), err: "" };
    return await liveRun(a, b, deps);
  } catch (e) {
    if (e instanceof Refusal) return { code: 2, out: "", err: `${e.message}\n` };
    return { code: 1, out: "", err: `still: error: ${msg(e)}\n` };
  }
}
