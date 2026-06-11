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
  // #808 — DEMO render rules: the three winning properties of the Post #2 demo, baked as the
  // committed default so EVERY future demo inherits them. This is the SSOT — producers + tests
  // read these numbers, never magic constants buried in code.
  demo: {
    // RULE 1 — the perceptible animated generative-art background is the DEFAULT path (not opt-in):
    // whenever a post's art-base image exists, the committed multi-aspect producer renders the
    // moving background automatically. Escape hatch: DEMO_BG=0/off disables it (solid bg).
    animatedBackgroundDefault: true,
    // Default dark-scrim opacity over the moving art (legibility-first; dim MORE when unsure).
    backgroundScrimOpacity: 0.72,

    // RULE 2 — every produced REVIEW video auto-emits a phone-downloadable mobile proxy
    // (<name>-mobile.mp4). The operator reviews on the Claude phone app, whose download relay
    // silently fails on large files; the full-res 1080p master ballooned to ~37.7MB and would NOT
    // download, while a 720p ~4MB proxy does. See feedback_deliver_mobile_proxy_for_remote_review_videos.
    mobileProxy: {
      // Hard ceiling — a proxy above this fails the enforced assertion (download relay risk).
      maxBytes: 15 * 1024 * 1024, // ~15MB hard cap
      // Soft target — what a healthy proxy should land near.
      targetBytes: 8 * 1024 * 1024, // ~8MB
      // Max edge (short OR long) in pixels — 720p class so the phone relay accepts it.
      maxEdgePx: 720,
      // ffmpeg encode knobs (mirror tools/make-mobile-proxy.sh).
      crf: 27,
      audioBitrateK: 96,
    },

    // RULE 3 — ~90s target, never truncate the voiced cut. The good Post #2 voiced cut is ~99s;
    // aim for ~90s but ACCEPT anything in the window so a real voiceover-driven length flows
    // through untruncated. The window is an ASSERTION guard (it fails a future demo that silently
    // drifts to e.g. 40s or 130s); it does NOT hard-set the length — real audio alignment still
    // drives scene timing (feedback_real_audio_alignment_drives_all_timed_visual_tracks).
    durationTargetSec: 90,
    durationAcceptanceMinSec: 80,
    durationAcceptanceMaxSec: 100,
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
    // #809 — PER-PLATFORM copy-length limits (SSOT). The copy verifier checked numbers +
    // superlatives but NEVER character limits, so Post #2's hand-authored copy reached a LIVE
    // Typefully draft over-limit (X tweet 4 = 282 X-weighted chars vs 280; Threads = 524 vs 500).
    // `publish/copyLimits.ts` reads these — never a magic constant. X counts every URL as 23
    // (t.co wrapping); Threads counts plain Unicode codepoints.
    copyLimits: {
      xTweet: 280, // max X-weighted chars per tweet (URLs discounted to 23 each)
      threads: 500, // max Unicode codepoints per Threads post
      // X discounts every URL to a FIXED weight regardless of real length (t.co shortener).
      xUrlWeight: 23,
    },
    // #793 — SHORT-THREAD ADVISORY (SOFT cap, SSOT). Post #1 came out SCRAMBLED on X (5 tweets
    // fired the same second → X chained the reply order by ingestion, not by our submitted order).
    // We cannot prove the exact mechanism, but a SHORTER thread has fewer same-second collisions,
    // so `publish/publishVerify.ts` surfaces a NON-FATAL NOTE when an X thread exceeds this soft
    // max. This is a CREATIVE call, never a hard limit — the advisory only flags risk, it NEVER
    // fails the build. Read here, never a magic constant.
    threadShape: {
      xSoftMaxTweets: 5, // X threads longer than this raise same-second scramble risk (advisory only)
    },
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
