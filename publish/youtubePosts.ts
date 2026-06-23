/**
 * Per-post YouTube SHORTS spec + metadata builder — the SSOT that maps each of the 8 launch posts
 * (publish/publishAssets.ts → POST_ASSETS) to its YouTube title / description / tags.
 *
 * FORMAT: YouTube Shorts. Our heroes are 9:16, ~90-110s — YouTube auto-classifies a short vertical
 * video as a Short, so we simply upload the 9:16 MP4 with NO special flag (there is no "isShort" field
 * in the API; the `#Shorts` tag in the description is the conventional hint).
 *
 * SOCIAL LINKS come from the canonical SSOT (config/socialLinks.ts): GitHub, X, Threads — all
 * operator-confirmed + resolve-verified. LinkedIn is intentionally OMITTED (held — employer visibility).
 *
 * VALIDATION (assertYouTubeMetadataValid): title ≤100 chars, description ≤5000 chars, total tag
 * characters ≤500 — throws on any violation (both-ends: a too-long title fails).
 *
 * The hero VIDEO basename + the durable launch BUNDLE dir are NOT duplicated here — they come from the
 * POST_ASSETS SSOT (the `hero-video` role + `defaultBundleDir`), so this file never drifts from the
 * Typefully publish path on which file is the hero.
 */

import * as path from "path";

import { POST_ASSETS, type PostSlug } from "./publishAssets";
import type { VideoType } from "../video/demoCategoryRecipe";
import { SOCIAL_LINKS, YOUTUBE_CHANNEL } from "../config/socialLinks";
import type { VideoInsertResource } from "../adapters/youtube";

// ── Social links ────────────────────────────────────────────────────────

/** Operator-confirmed, resolve-verified social links (from config/socialLinks.ts SSOT). */
export const GITHUB_PROFILE_URL = SOCIAL_LINKS.github;
export const X_PROFILE_URL = SOCIAL_LINKS.x;
export const THREADS_PROFILE_URL = SOCIAL_LINKS.threads;
// LinkedIn intentionally omitted from public YouTube links — held per operator (employer visibility).

/** The full clickable channel URL, built from the @handle SSOT (YOUTUBE_CHANNEL = "@AnsonAndAI"). */
export const YOUTUBE_CHANNEL_URL = `https://www.youtube.com/${YOUTUBE_CHANNEL.replace(/^@?/, "@")}`;

// ── YouTube metadata limits (YouTube Data API v3) ───────────────────────

export const YT_TITLE_MAX = 100;
export const YT_DESCRIPTION_MAX = 5000;
/** Combined length of all tag strings (YouTube's total-tags character budget). */
export const YT_TAGS_TOTAL_MAX = 500;

// ── Per-post spec ───────────────────────────────────────────────────────

export interface YouTubePostSpec {
  slug: PostSlug;
  /** The repository this post is about (rendered as the headline ⭐ GitHub link). */
  repoUrl: string;
  /**
   * The video FORMAT. Drives the trailing hashtags + the shared-tag set:
   *   "short"   → `#Shorts #opensource #devtools` + the `Shorts` tag (a vertical YouTube Short).
   *   "regular" → `#AIcoding #opensource #AnsonAndAI` (NO `#Shorts`, no `Shorts` tag) for a long-form video.
   */
  format: "short" | "regular";
  /**
   * #1164 — the PUBLISH-ASPECT class: "demo" renders 16:9 (regular video), "intro" renders 9:16 (Short).
   * Feeds the fail-closed `enforceDemoAspectByConstruction` guard. This is DELIBERATELY DECOUPLED from the
   * #1137 30-40s intro CONTENT-band (which lives on DemoVideoSpec, not here): `forge-demo-871` and
   * `content-pipeline-demo-post4` are demo-CONTENT intentionally shipped as 9:16 Shorts, so they are
   * "intro" HERE (= "renders 9:16") regardless of their walk-through length.
   */
  videoType: VideoType;
  /** A short, hooky phrase. The title defaults to `"{hook} (open source)"` unless `title` overrides it. */
  hook: string;
  /** Optional verbatim title override. When present it is used as-is (no `(open source)` suffix). */
  title?: string;
  /** 1-2 sentence value prop — the opening paragraph of the description. */
  valueProp: string;
  /** Per-post tags (merged with the shared tags; combined chars must stay ≤500). */
  tags: string[];
}

/** Shared tags appended to every post (kept short so the per-post + shared total stays ≤500 chars). */
const SHARED_TAGS = ["open source", "developer tools", "AI agents", "Claude Code", "Shorts"];

/** The shared tags for a given format: shorts keep `Shorts`; regular videos drop it. */
function sharedTagsFor(format: "short" | "regular"): string[] {
  return format === "short" ? SHARED_TAGS : SHARED_TAGS.filter((t) => t !== "Shorts");
}

/**
 * The 8 launch posts → their repo + hook + value prop. repoUrl per the operator's mapping:
 *   lfah-post1 / lfah-post2            → local-first-agent-harness
 *   forge-harness-post3 / forge-demo-871 → forge-harness
 *   content-pipeline-demo-post4        → content-pipeline
 *   three-role-model-post5             → three-role-model
 *   ui-evolve                          → ui-evolve
 *   agent-kanban-demo                  → agent-kanban
 */
export const YOUTUBE_POSTS: Record<PostSlug, YouTubePostSpec> = {
  "lfah-post1": {
    slug: "lfah-post1",
    repoUrl: "https://github.com/ziyilam3999/local-first-agent-harness",
    format: "short",
    videoType: "intro",
    hook: "An AI coding agent that runs on your own machine",
    valueProp:
      "A local-first agent harness that runs a red-test → green-code loop entirely on your own machine — your tests are the oracle that decides when the work is done.",
    tags: ["local-first", "agent harness", "test-driven", "TDD", "local LLM"],
  },
  "lfah-post2": {
    slug: "lfah-post2",
    repoUrl: "https://github.com/ziyilam3999/local-first-agent-harness",
    format: "short",
    videoType: "intro",
    hook: "Watch a local AI agent build a feature from a failing test",
    valueProp:
      "The builder side of the local-first agent harness: hand it a failing test and watch it write the code, run the suite, and iterate until everything passes — no cloud round-trip required.",
    tags: ["local-first", "agent harness", "code generation", "TDD", "automation"],
  },
  "forge-harness-post3": {
    slug: "forge-harness-post3",
    repoUrl: "https://github.com/ziyilam3999/forge-harness",
    format: "short",
    videoType: "intro",
    hook: "Your tests decide what ships, not the AI",
    valueProp:
      "forge-harness drives AI story implementation where your real tests — not the model's self-assessment — are the gate that decides what is actually done.",
    tags: ["forge-harness", "test-driven", "AI agents", "CI", "story workflow"],
  },
  "content-pipeline-demo-post4": {
    slug: "content-pipeline-demo-post4",
    repoUrl: "https://github.com/ziyilam3999/content-pipeline",
    format: "short",
    videoType: "intro",
    hook: "One ask turns into a whole launch post",
    valueProp:
      "content-pipeline turns a single launch announcement into ready-to-post social content — copy, an image card, a voiceover, and the video — with a built-in fact-checker, run by an agent instead of a person.",
    tags: ["content pipeline", "automation", "video generation", "social media", "AI agents"],
  },
  "three-role-model-post5": {
    slug: "three-role-model-post5",
    repoUrl: "https://github.com/ziyilam3999/three-role-model",
    format: "short",
    videoType: "intro",
    hook: "Four AI roles, and nobody grades their own homework",
    valueProp:
      "A development model where four AI subagents — planner, plan-reviewer, executor, execution-reviewer — split the work so nothing ships on self-review. Two simple knobs pick the shape per task.",
    tags: ["AI agents", "multi-agent", "code review", "software process", "workflow"],
  },
  "forge-demo-871": {
    slug: "forge-demo-871",
    repoUrl: "https://github.com/ziyilam3999/forge-harness",
    format: "short",
    videoType: "intro",
    hook: "Watch an AI harness retry a story until the tests pass",
    valueProp:
      "A live look at forge-harness: eight blocks, only one of them calls the model, and your tests decide what counts as done — watch a story go from Retry to Done on the real dashboard.",
    tags: ["forge-harness", "test-driven", "AI agents", "demo", "dashboard"],
  },
  "ui-evolve": {
    slug: "ui-evolve",
    repoUrl: "https://github.com/ziyilam3999/ui-evolve",
    format: "short",
    videoType: "intro",
    hook: "I caught my AI design tool rewarding empty pages",
    valueProp:
      "I built an AI tool to redesign my site, then caught its own taste-judge scoring a nearly-blank page higher than a clean one. Here's how I rebuilt the judge and proved the fix blind — 6 for 6.",
    tags: ["ui-evolve", "AI design", "frontend", "design systems", "evaluation"],
  },
  "agent-kanban-demo": {
    slug: "agent-kanban-demo",
    // The demo is about the agent-kanban board itself — the SAME repo the Typefully kanban-demo post
    // links to (smoke/publish-typefully-kanban-demo.ts → github.com/ziyilam3999/agent-kanban), NOT
    // content-pipeline. Keep the YouTube link consistent with the post's other surfaces.
    repoUrl: "https://github.com/ziyilam3999/agent-kanban",
    format: "regular",
    videoType: "demo",
    hook: "Watch your AI coding agent work live on a kanban board",
    title: "Your AI agent is a black box — this open-source board fixes it",
    valueProp:
      "Your AI coding agent is a black box — you can't see what it's planning, reviewing, or shipping. agent-kanban makes every move legible: an open-source, real-time board where each ticket shows its plan, its review verdict, and where it is right now. See it — and trust it.",
    tags: ["agent-kanban", "kanban", "AI agents", "dashboard", "developer tools"],
  },
};

// ── Flat metadata (built + validated, then converted to the insert resource) ──

export interface YouTubeMetadata {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  defaultLanguage: string;
  privacyStatus: "public" | "unlisted" | "private";
  selfDeclaredMadeForKids: boolean;
}

/** The privacy status, env-overridable; defaults to "public" per operator decision. */
export function resolvePrivacyStatus(): "public" | "unlisted" | "private" {
  const v = (process.env.YOUTUBE_PRIVACY ?? "public").trim().toLowerCase();
  if (v === "public" || v === "unlisted" || v === "private") return v;
  throw new Error(`YOUTUBE_PRIVACY must be public|unlisted|private (got "${process.env.YOUTUBE_PRIVACY}")`);
}

/** Total character count across all tag strings (YouTube's total-tags budget). */
export function tagsTotalChars(tags: string[]): number {
  return tags.reduce((sum, t) => sum + t.length, 0);
}

/**
 * Build the description from the template:
 *   {valueProp}
 *
 *   ⭐ GitHub: {repoUrl}
 *
 *   ⭐ GitHub: {repoUrl}
 *   ▶ Subscribe for more: {channelUrl}
 *
 *   — Links —
 *   GitHub: …
 *   X: …
 *   Threads: …          (LinkedIn intentionally omitted — held per operator)
 *
 *   {hashtags}           (#Shorts #opensource #devtools for shorts; #AIcoding #opensource #AnsonAndAI for regular)
 */
export function buildDescription(spec: YouTubePostSpec): string {
  const links = [
    "— Links —",
    `GitHub: ${GITHUB_PROFILE_URL}`,
    `X: ${X_PROFILE_URL}`,
    `Threads: ${THREADS_PROFILE_URL}`,
  ].join("\n");
  const hashtags =
    spec.format === "short" ? "#Shorts #opensource #devtools" : "#AIcoding #opensource #AnsonAndAI";
  return (
    `${spec.valueProp}\n\n` +
    `⭐ GitHub: ${spec.repoUrl}\n` +
    `▶ Subscribe for more: ${YOUTUBE_CHANNEL_URL}\n\n` +
    `${links}\n\n` +
    hashtags
  );
}

/** Assemble (but do NOT validate) the flat metadata for a post. */
export function buildYouTubeMetadata(slug: PostSlug): YouTubeMetadata {
  const spec = YOUTUBE_POSTS[slug];
  if (!spec) throw new Error(`no YouTube post spec for slug "${slug}"`);
  return {
    title: spec.title ?? `${spec.hook} (open source)`,
    description: buildDescription(spec),
    tags: [...new Set([...spec.tags, ...sharedTagsFor(spec.format)])], // dedupe per-post vs shared overlap
    categoryId: "28", // Science & Technology
    defaultLanguage: "en",
    privacyStatus: resolvePrivacyStatus(),
    selfDeclaredMadeForKids: false, // set EXPLICITLY — never omitted
  };
}

/**
 * Validate the metadata against YouTube's limits — THROW on any violation:
 *   - title ≤100 chars
 *   - description ≤5000 chars
 *   - combined tag characters ≤500
 * (both-ends: a too-long title fails here.)
 */
export function assertYouTubeMetadataValid(meta: YouTubeMetadata): void {
  if (meta.title.length > YT_TITLE_MAX) {
    throw new Error(
      `YouTube title too long: ${meta.title.length} > ${YT_TITLE_MAX} chars ("${meta.title.slice(0, 60)}…")`,
    );
  }
  if (meta.description.length > YT_DESCRIPTION_MAX) {
    throw new Error(`YouTube description too long: ${meta.description.length} > ${YT_DESCRIPTION_MAX} chars`);
  }
  const tagChars = tagsTotalChars(meta.tags);
  if (tagChars > YT_TAGS_TOTAL_MAX) {
    throw new Error(`YouTube tags too long: ${tagChars} > ${YT_TAGS_TOTAL_MAX} total chars`);
  }
}

/** Convert validated flat metadata to the `videos.insert` resource the adapter uploads. */
export function toInsertResource(meta: YouTubeMetadata): VideoInsertResource {
  return {
    snippet: {
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
      categoryId: meta.categoryId,
      defaultLanguage: meta.defaultLanguage,
    },
    status: {
      privacyStatus: meta.privacyStatus,
      selfDeclaredMadeForKids: meta.selfDeclaredMadeForKids,
    },
  };
}

// ── Hero-video resolution (from the POST_ASSETS SSOT) ───────────────────

/** The hero-video basename for a post, read from the POST_ASSETS SSOT (the `hero-video` role). */
export function heroVideoBasename(slug: PostSlug): string {
  const asset = POST_ASSETS[slug].assets.find((a) => a.role === "hero-video");
  if (!asset) throw new Error(`no hero-video asset for post "${slug}"`);
  return asset.basename;
}

/**
 * Resolve the absolute 9:16 hero-video path for a post from its durable launch BUNDLE dir
 * (POST_ASSETS[slug].defaultBundleDir + the hero basename). Override the bundle root with
 * $CONTENT_PIPELINE_LAUNCH_ASSETS for portability/tests.
 */
export function heroVideoPath(slug: PostSlug): string {
  const spec = POST_ASSETS[slug];
  const bundleDir = process.env.CONTENT_PIPELINE_LAUNCH_ASSETS
    ? path.join(process.env.CONTENT_PIPELINE_LAUNCH_ASSETS, path.basename(spec.defaultBundleDir))
    : spec.defaultBundleDir;
  return path.join(bundleDir, heroVideoBasename(slug));
}

/** The 8 posts in publish order. */
export const YOUTUBE_POST_ORDER: PostSlug[] = [
  "lfah-post1",
  "lfah-post2",
  "forge-harness-post3",
  "content-pipeline-demo-post4",
  "three-role-model-post5",
  "forge-demo-871",
  "ui-evolve",
  "agent-kanban-demo",
];
