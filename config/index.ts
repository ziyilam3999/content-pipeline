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
    // HERO video aspect — the full-bleed phone-native cut (9:16, 1080x1920) is the lead
    // video EVERYWHERE it leads (X hook tweet, Threads/LinkedIn hero post). This is the
    // most-watched cut (#744/#765/#773). Per-aspect renders still exist; the assembly
    // SELECTS the hero by this config so the lead is never silently a cropped 1:1 or 4:5.
    // Do NOT change without operator sign-off — leading with the square (1:1) was the
    // #794 bug (the full-screen 9:16 hero we built got posted nowhere).
    heroVideoAspect: "9:16",
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
