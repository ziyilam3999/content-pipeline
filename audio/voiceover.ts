/**
 * P4c — voiceover plan
 *
 * Turn a spoken-script string into a text-to-speech request, preferring a PAID primary voice
 * with a FREE backup.  The injected caller returns a clip that carries a real `durationSec`
 * so a later captions step can read it.
 */

// ── Provider constants ────────────────────────────────────────────────
export const PRIMARY_PROVIDER = "elevenlabs";
export const FALLBACK_PROVIDER = "kokoro";

// ── Types ─────────────────────────────────────────────────────────────

export interface SpeechRequest {
  provider: string;
  voiceId: string;
  modelId: string;
  text: string;
  format: string;
}

export interface VoiceClip {
  provider: string;
  voiceId: string;
  audio: string;
  durationSec: number;
  /**
   * #742 — real per-character end-times (seconds) from the TTS provider, one
   * per character of the spoken script. Lets a later captions step time each
   * caption to the ACTUAL voice instead of an even-split estimate. Optional:
   * providers without timestamps (or the free fallback) simply omit it.
   */
  charEndTimesSec?: number[];
}

export type VoiceCaller = (req: SpeechRequest) => Promise<VoiceClip>;

export interface VoiceoverResult {
  clip: VoiceClip;
  usedProvider: string;
  provedPrimary: boolean;
  pathLine: string;
}

// ── buildSpeechRequest ─────────────────────────────────────────────────

export function buildSpeechRequest(
  script: string,
  opts?: { voiceId?: string; modelId?: string; format?: string },
): SpeechRequest {
  return {
    provider: opts?.voiceId ? PRIMARY_PROVIDER : PRIMARY_PROVIDER,
    voiceId: opts?.voiceId ?? "default-voice",
    modelId: opts?.modelId ?? "default-model",
    text: script,
    format: opts?.format ?? "mp3_22050_16",
  };
}

// ── synthesizeVoiceover ─────────────────────────────────────────────────

export async function synthesizeVoiceover(
  script: string,
  callers: { primary: VoiceCaller; fallback: VoiceCaller },
  opts?: { voiceId?: string; modelId?: string; format?: string },
): Promise<VoiceoverResult> {
  // Try the primary provider first.
  try {
    const primaryReq = buildSpeechRequest(script, opts);
    const clip = await callers.primary(primaryReq);
    const pathLine = `VOICE-PATH: primary="${PRIMARY_PROVIDER}" used="${PRIMARY_PROVIDER}" clean=true`;
    return { clip, usedProvider: PRIMARY_PROVIDER, provedPrimary: true, pathLine };
  } catch {
    // Primary failed — fall back.
  }

  // Primary threw; build a fallback request and try the backup.
  const fallbackReq: SpeechRequest = buildSpeechRequest(script, opts);
  fallbackReq.provider = FALLBACK_PROVIDER;

  const clip = await callers.fallback(fallbackReq);

  const pathLine = `VOICE-PATH: primary="${PRIMARY_PROVIDER}" used="${FALLBACK_PROVIDER}" clean=false`;
  return { clip, usedProvider: FALLBACK_PROVIDER, provedPrimary: false, pathLine };
}

// ── assertPrimaryVoiceProven ───────────────────────────────────────────

export function assertPrimaryVoiceProven(
  result: VoiceoverResult,
  options?: { allowFallback?: boolean },
): void {
  if (!result.provedPrimary && !(options?.allowFallback ?? false)) {
    throw new Error(
      "Primary voice was not proven and fallback was not explicitly allowed.",
    );
  }
}
