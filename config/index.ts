import * as os from "os";
import * as path from "path";

export type AspectRatio = "16:9" | "9:16" | "1:1" | "4:5";

export const CONFIG = {
  aspects: {
    "16:9":  { width: 1920, height: 1080 },
    "9:16":  { width: 1080, height: 1920 },
    "1:1":   { width: 1080, height: 1080 },
    "4:5":   { width: 1080, height: 1350 },
  } as const,
  defaultAspects: ["1:1", "9:16", "4:5"] as const,
  // #1164 — CANONICAL output aspect per videoType (operator policy 2026-06-23). A DEMO renders 16:9
  // (a regular YouTube video whose hand-made custom thumbnail drives clicks; a 9:16 demo gets auto-filed
  // as a Short and the thumbnail is suppressed — the #1162 bug). An INTRO renders 9:16 (the vertical
  // reach Short). Output dimensions DERIVE from this map by construction (video/demoCategoryRecipe
  // `dimensionsForVideoType` + video/renderSpec `renderAspectForVideoType`), so a demo can never
  // accidentally render 9:16. Keys MUST match the VideoType union in video/demoCategoryRecipe.ts.
  videoTypeAspects: {
    demo: "16:9",
    intro: "9:16",
  } as const,
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

    // RULE 4 — HORIZONTAL TITLE-SAFE band for croppable (vertical) cuts. A 9:16 (1080x1920)
    // video played FULL-SCREEN on a tall phone (taller than 16:9, ~9:19.5–9:21) is filled to
    // HEIGHT → it becomes wider than the screen → ~9-12% is cropped off EACH side. So text /
    // tiles / cards / CTA laid edge-to-edge get CLIPPED even though the file dimension is correct.
    // Keep all CONTENT inside this fraction of the width (0.80 = ~10% clear margin each side =
    // ~108px at 1080w); the BACKGROUND art stays full-bleed (cropping bg is cosmetically fine).
    // The layout (`video/demoLayout.ts`) reads this and `assertHorizontalSafeArea` HARD-FAILS any
    // croppable layout whose content extent exceeds the band. See
    // feedback_vertical_video_needs_horizontal_titlesafe_band_for_fullscreen_crop.
    safeAreaXFraction: 0.8,
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
    // POST AUTO-ARCHIVE — the DURABLE, non-repo home for every produced post's canonical copy +
    // metadata. The canonical copy text lives ONLY in `out/copy/*.json`, which is GITIGNORED (a
    // `git clean` deletes it). The archive is the durable home so a post is NEVER lost: it sits
    // OUTSIDE the repo (under ~/coding_projects/_launch-assets/) so no git operation can touch it.
    // `~` is resolved to os.homedir() here (never a literal "~" the FS can't expand). Override at
    // runtime with $POSTS_ARCHIVE_DIR (read by publish/postArchive.ts) — e.g. tests point it at a
    // temp dir so they never write the real home archive.
    archiveDir: path.join(os.homedir(), "coding_projects", "_launch-assets", "POSTS-ARCHIVE"),
    // IN-REPO ARCHIVE MIRROR (#821) — a SECOND, GIT-TRACKED home for the same per-post copy +
    // metadata + index, so a fresh clone / CI has the canonical wording too (the external
    // `archiveDir` above lives OUTSIDE the repo and is never in git). It is `.ai-workspace/posts`
    // resolved to an ABSOLUTE path against the REPO ROOT (the dir that contains `config/`, i.e. the
    // parent of THIS file's dir) so the FS can always write it, exactly like `archiveDir`. The repo
    // `.gitignore` allow-lists `.ai-workspace/posts/**` so the mirror is committed. Override at
    // runtime with $POSTS_INREPO_ARCHIVE_DIR (read by publish/postArchive.ts) — tests point it at a
    // temp dir so they never write the real repo archive.
    inRepoArchiveDir: path.resolve(__dirname, "..", ".ai-workspace", "posts"),
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
    // (t.co wrapping).
    //
    // #827 — NEWLINE = 2 CHARS. Threads/Typefully (and X) count each LINE BREAK as 2 characters
    // (a CRLF `\r\n`), NOT 1. A codepoint-only count UNDER-counts a multi-paragraph post: Post #3's
    // Threads copy was 497 codepoints with 7 newlines → 504 in Typefully's count → over 500, yet the
    // codepoint-only gate PASSED it. So the validator now adds the newline count to BOTH the Threads
    // length and the X-weighted length (codepoints + number of `\n`). See
    // feedback_threads_counts_newlines_as_two_chars_in_length_validator.
    copyLimits: {
      xTweet: 280, // max X-weighted chars per tweet (URLs=23 each; each `\n` counts as 2)
      threads: 500, // max effective chars per Threads post (codepoints + 1 per `\n`)
      // X discounts every URL to a FIXED weight regardless of real length (t.co shortener).
      xUrlWeight: 23,
      // #827 — SAFETY MARGIN reserved below each platform limit. The gate fails when the effective
      // length exceeds (limit - safetyMargin), so a BORDERLINE post (e.g. Threads effective 496-500)
      // is flagged BEFORE it ships — it can never slip on any other un-modeled counting quirk. Authors
      // therefore target ≤ (limit - safetyMargin): Threads ≤495, X tweet ≤275.
      safetyMargin: 5,
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
