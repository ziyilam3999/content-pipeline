/**
 * REAL voice adapter — fulfils the orchestrator's injected `synthVoice` slot.
 *
 * Drives the already-built `audio/voiceover.ts` planning module with a REAL ElevenLabs
 * caller (the PAID premium voice), writes the returned audio to a real .mp3, and returns
 * its path. Duration comes from ElevenLabs' character timestamps, so a later captions step
 * can read the true clip length.
 *
 * By design the default path is PRIMARY-ONLY: the free fallback (Kokoro) is NOT wired
 * unless a caller is explicitly injected, and `assertPrimaryVoiceProven` runs by default.
 * This is what lets the smoke PROVE the paid primary instead of quietly sliding to a
 * free backup (feedback_smoke_prove_primary_not_fallback).
 *
 * The API key is read at RUNTIME (env var or macOS Keychain) and never committed or logged.
 */

import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

import { CONFIG } from "../config";
import {
  synthesizeVoiceover,
  buildSpeechRequest,
  assertPrimaryVoiceProven,
  PRIMARY_PROVIDER,
  type VoiceCaller,
  type VoiceClip,
  type SpeechRequest,
  type VoiceoverResult,
} from "../audio/voiceover";

// ── Defaults (all overridable via opts/env) ────────────────────────────
/**
 * The LOCKED MALE channel voice ("Adam"), sourced from the config SSOT
 * (CONFIG.voice) so every piece of channel content uses one recognizable
 * voice. Do not change here — change CONFIG.voice (needs operator sign-off).
 * A one-off run may still override via opts.voiceId / $ELEVENLABS_VOICE_ID.
 */
export const DEFAULT_VOICE_ID = CONFIG.voice.channelVoiceId;
export const DEFAULT_MODEL_ID = CONFIG.voice.modelId;
export const DEFAULT_OUTPUT_FORMAT = CONFIG.voice.outputFormat;

export type VoicePath = "elevenlabs" | "kokoro" | "injected";

// ── Key sourcing (runtime only; never in repo/logs) ────────────────────

export interface KeySource {
  /** Env var checked first. Default ELEVENLABS_API_KEY. */
  envVar?: string;
  /** macOS Keychain generic-password service. Default $ELEVENLABS_KEYCHAIN_SERVICE or "ELEVENLABS_API_KEY". */
  keychainService?: string;
  /** Optional Keychain account (-a) to disambiguate. */
  keychainAccount?: string;
}

/**
 * Read the ElevenLabs API key. Prefers an env var; otherwise a SINGLE targeted Keychain
 * lookup (no scanning). Throws a clear, actionable error if neither is present.
 */
export function readElevenLabsKey(src?: KeySource): string {
  const envVar = src?.envVar ?? "ELEVENLABS_API_KEY";
  const fromEnv = process.env[envVar];
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  const service =
    src?.keychainService ?? process.env.ELEVENLABS_KEYCHAIN_SERVICE ?? "ELEVENLABS_API_KEY";
  try {
    const args = ["find-generic-password", "-s", service, "-w"];
    if (src?.keychainAccount) args.push("-a", src.keychainAccount);
    const out = execFileSync("security", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const key = out.trim();
    if (!key) throw new Error("empty key");
    return key;
  } catch {
    throw new Error(
      `ElevenLabs API key not found. Set $${envVar}, or store it in the macOS Keychain ` +
        `as a generic password (service "${service}", value = the key). ` +
        `Override the service name with $ELEVENLABS_KEYCHAIN_SERVICE. Never commit the key.`,
    );
  }
}

// ── Real ElevenLabs caller ─────────────────────────────────────────────

export interface ElevenLabsOpts {
  voiceId?: string;
  modelId?: string;
  outputFormat?: string;
  keySource?: KeySource;
  timeoutMs?: number;
}

interface ElevenLabsTimestampResponse {
  audio_base64?: string;
  alignment?: { character_end_times_seconds?: number[] };
}

/**
 * Build a real ElevenLabs text-to-speech caller. POSTs to the `/with-timestamps` endpoint
 * (verified against the live API docs 2026-06-08: header `xi-api-key`, body `{text,model_id}`,
 * response `{audio_base64, alignment.character_end_times_seconds}`) so we get both the mp3 and
 * the true clip duration in one paid call.
 */
export function elevenLabsCaller(opts?: ElevenLabsOpts): VoiceCaller {
  return async (req: SpeechRequest): Promise<VoiceClip> => {
    const key = readElevenLabsKey(opts?.keySource);
    const voiceId = opts?.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID;
    const modelId = opts?.modelId ?? DEFAULT_MODEL_ID;
    const outputFormat = opts?.outputFormat ?? DEFAULT_OUTPUT_FORMAT;
    const url =
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}` +
      `/with-timestamps?output_format=${encodeURIComponent(outputFormat)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 120_000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "xi-api-key": key,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ text: req.text, model_id: modelId }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ElevenLabs HTTP ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
    }

    const json = (await res.json()) as ElevenLabsTimestampResponse;
    if (!json.audio_base64) throw new Error("ElevenLabs response missing audio_base64");

    const ends = json.alignment?.character_end_times_seconds ?? [];
    const durationSec = ends.length ? ends[ends.length - 1] : 0;

    // #742 — keep the FULL per-character timing array (not just the last
    // element) so a later captions step can sync to the real voice.
    return {
      provider: PRIMARY_PROVIDER,
      voiceId,
      audio: json.audio_base64,
      durationSec,
      charEndTimesSec: ends.length ? ends : undefined,
    };
  };
}

// ── synthVoice — the orchestrator slot ─────────────────────────────────

export interface SynthVoiceDeps {
  /** Injected primary caller (tests pass a fake); defaults to the real ElevenLabs caller. */
  primary?: VoiceCaller;
  /** Injected free fallback; defaults to an unwired caller that throws. */
  fallback?: VoiceCaller;
}

export interface SynthVoiceOpts extends ElevenLabsOpts {
  outDir?: string;
  fileName?: string;
  /** Allow the fallback to satisfy the run. Default false → the paid primary must be proven. */
  allowFallback?: boolean;
}

export interface SynthVoiceOutcome {
  audioPath: string;
  usedProvider: string;
  provedPrimary: boolean;
  durationSec: number;
  /** #742 — real per-character end-times, threaded to the captions step for sync. */
  charEndTimesSec?: number[];
  pathLine: string;
}

/**
 * Synthesize the spoken script to a real .mp3 on disk and return the full outcome
 * (path + provenance). The smoke uses this to assert the paid primary was proven.
 */
export async function synthesizeVoiceToFile(
  args: { script: string },
  deps?: SynthVoiceDeps,
  opts?: SynthVoiceOpts,
): Promise<SynthVoiceOutcome> {
  const primary =
    deps?.primary ??
    elevenLabsCaller({
      voiceId: opts?.voiceId,
      modelId: opts?.modelId,
      outputFormat: opts?.outputFormat,
      keySource: opts?.keySource,
      timeoutMs: opts?.timeoutMs,
    });

  let vo: VoiceoverResult;
  if (deps?.fallback) {
    // A real free fallback is wired — use the planning module's try-primary-then-fallback flow.
    vo = await synthesizeVoiceover(
      args.script,
      { primary, fallback: deps.fallback },
      { voiceId: opts?.voiceId, modelId: opts?.modelId, format: opts?.outputFormat },
    );
  } else {
    // PRIMARY-ONLY: call the primary directly so its REAL error (key-not-found, HTTP status)
    // propagates verbatim instead of being masked by the unwired fallback's message.
    const req = buildSpeechRequest(args.script, {
      voiceId: opts?.voiceId,
      modelId: opts?.modelId,
      format: opts?.outputFormat,
    });
    const clip = await primary(req);
    vo = {
      clip,
      usedProvider: PRIMARY_PROVIDER,
      provedPrimary: true,
      pathLine: `VOICE-PATH: primary="${PRIMARY_PROVIDER}" used="${PRIMARY_PROVIDER}" clean=true`,
    };
  }
  // Throws unless the paid primary was proven (or a fallback is explicitly allowed).
  assertPrimaryVoiceProven(vo, { allowFallback: opts?.allowFallback ?? false });

  const outDir = opts?.outDir ?? path.join(process.cwd(), "out", "audio");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, opts?.fileName ?? "voiceover.mp3");
  fs.writeFileSync(outPath, Buffer.from(vo.clip.audio, "base64"));

  const pathLine =
    `VOICE-PATH: primary="${PRIMARY_PROVIDER}" used="${vo.usedProvider}" ` +
    `clean=${vo.provedPrimary} dur=${vo.clip.durationSec.toFixed(2)} file="${outPath}"`;

  return {
    audioPath: outPath,
    usedProvider: vo.usedProvider,
    provedPrimary: vo.provedPrimary,
    durationSec: vo.clip.durationSec,
    charEndTimesSec: vo.clip.charEndTimesSec,
    pathLine,
  };
}

/**
 * The orchestrator's injected `synthVoice` slot — returns just the audio file path.
 * Production default: the paid ElevenLabs voice, primary-only.
 *
 * NOTE: this bare-path return DROPS the real per-character alignment. For the
 * live pipeline use `synthVoiceStage` (below), which the conductor threads into
 * the video stage so captions sync to the actual voice (#742).
 */
export async function synthVoice(
  args: { script: string },
  deps?: SynthVoiceDeps,
  opts?: SynthVoiceOpts,
): Promise<string> {
  const outcome = await synthesizeVoiceToFile(args, deps, opts);
  return outcome.audioPath;
}

/**
 * #742 — the LIVE `synthVoice` slot for the conductor. Returns the audio path
 * AND the real per-character end-times so `runPipeline` can thread the alignment
 * into the video stage — guaranteeing real caption sync on the production path
 * (no closure smuggle). Wire this (not `synthVoice`) as `deps.synthVoice`.
 */
export async function synthVoiceStage(
  args: { script: string },
  deps?: SynthVoiceDeps,
  opts?: SynthVoiceOpts,
): Promise<{ audioPath: string; charEndTimesSec?: number[] }> {
  const outcome = await synthesizeVoiceToFile(args, deps, opts);
  return { audioPath: outcome.audioPath, charEndTimesSec: outcome.charEndTimesSec };
}
