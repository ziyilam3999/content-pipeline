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
} as const;
