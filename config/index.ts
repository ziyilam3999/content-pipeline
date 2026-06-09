export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:5";

export const CONFIG = {
  aspects: {
    "16:9":  { width: 1920, height: 1080 },
    "9:16":  { width: 1080, height: 1920 },
    "1:1":   { width: 1080, height: 1080 },
    "4:5":   { width: 1080, height: 1350 },
  } as const,
  defaultAspects: ["1:1", "9:16", "4:5"] as const,
  image: {
    generativeBackgroundDefault: false,
  },
  models: {
    copy: {
      provider: "claude-max-oauth",
      localFallback: "qwen-vl-max",
    },
  },
  publish: {
    dryRunDefault: true,
    socialSetIdEnv: "TYPEFULLY_SOCIAL_SET_ID",
  },
  voice: {
    // CHANNEL VOICE — locked MALE voice for consistency across ALL content.
    // Do not change without operator sign-off (a channel needs one recognizable voice).
    channelVoiceId: "pNInz6obpgDQGcFmaJgB", // ElevenLabs "Adam" — male, deep professional narration (stable stock voice)
    channelVoiceName: "Adam",
    channelVoiceGender: "male",
    modelId: "eleven_multilingual_v2",
    outputFormat: "mp3_44100_128",
  },
} as const;
