/**
 * #828 — PLATFORM-SUBSET publishing (partial-publish recovery).
 *
 * WHY this exists: a multi-platform Typefully draft can PARTIALLY publish — the operator hits
 * Publish, X goes LIVE, but Threads is BLOCKED (e.g. over the char limit). To fix the still-blocked
 * platform you must NOT recreate the FULL draft: republishing a draft that still carries the X thread
 * RE-POSTS the already-live X thread = a duplicate. The correct recovery is a draft that targets ONLY
 * the unpublished platform(s) — e.g. a Threads-ONLY draft whose body has `platforms.threads` and NO
 * `platforms.x` key at all.
 *
 * THIS MODULE is the mechanical, both-ends-testable core of that recovery: parse the requested
 * platform subset from the `PLATFORMS` env, then assemble a `CreateDraftBody` carrying ONLY the
 * requested platforms (any excluded platform's block is OMITTED ENTIRELY — not sent disabled). It is
 * pure (no network, no fs), so the publish smokes wire it and the unit tests pin its behavior.
 *
 * Default (PLATFORMS unset/empty) = BOTH platforms — the normal full-launch path is unchanged. A
 * subset is requested explicitly (`PLATFORMS=threads`, `PLATFORMS=x,threads`) for a partial-publish
 * recovery. An invalid token errors clearly rather than silently dropping a platform.
 */

import type { CreateDraftBody, DraftPost, PlatformBlock } from "../adapters/typefully";

/** The platforms a launch draft can target. Canonical order is X then Threads. */
export type Platform = "x" | "threads";

/** The full set, in canonical order. Used as the default when no subset is requested. */
export const ALL_PLATFORMS: readonly Platform[] = ["x", "threads"] as const;

/** Type guard: is `s` a known platform token? */
export function isPlatform(s: string): s is Platform {
  return s === "x" || s === "threads";
}

/**
 * Parse the `PLATFORMS` env value into a validated, de-duplicated, canonically-ordered platform list.
 *
 *  - UNSET or empty/whitespace-only ⇒ the FULL set (both platforms) — the normal launch path.
 *  - A comma-separated list (`"threads"`, `"x,threads"`, `" Threads , X "`) ⇒ exactly those platforms,
 *    case-insensitively, de-duplicated, returned in canonical order regardless of input order.
 *  - An UNKNOWN token (`"linkedin"`, `"x,bogus"`) ⇒ THROWS a clear error naming the offending token(s)
 *    and the valid set. We FAIL rather than silently drop it, so a typo can never quietly publish to
 *    the wrong subset (the partial-publish bug is exactly about getting the subset right).
 */
export function parsePlatformsEnv(raw: string | undefined): Platform[] {
  if (raw === undefined || raw.trim() === "") return [...ALL_PLATFORMS];

  const tokens = raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);

  // A value of only separators/whitespace (e.g. "," or " , ") carries no real token ⇒ treat as unset.
  if (tokens.length === 0) return [...ALL_PLATFORMS];

  const invalid = tokens.filter((t) => !isPlatform(t));
  if (invalid.length > 0) {
    throw new Error(
      `PLATFORMS contains unknown platform(s): ${invalid.join(", ")}. ` +
        `Valid platforms are: ${ALL_PLATFORMS.join(", ")} ` +
        `(comma-separated, e.g. PLATFORMS=threads or PLATFORMS=x,threads). Leave PLATFORMS unset to publish both.`,
    );
  }

  // De-duplicate and return in canonical order (so "threads,x" and "x,threads" are identical).
  const requested = new Set(tokens as Platform[]);
  return ALL_PLATFORMS.filter((p) => requested.has(p));
}

/** True iff `platforms` is a strict subset of the full platform set (i.e. at least one is excluded). */
export function isSubset(platforms: Platform[]): boolean {
  return platforms.length < ALL_PLATFORMS.length;
}

/**
 * A human-readable, greppable note for the smoke output when a SUBSET is requested — so a partial
 * publish is EXPLICIT in the log. Returns null when publishing the full set (nothing to flag).
 */
export function platformSubsetNote(platforms: Platform[]): string | null {
  if (!isSubset(platforms)) return null;
  const excluded = ALL_PLATFORMS.filter((p) => !platforms.includes(p));
  return `PLATFORM-SUBSET: publishing only [${platforms.join(", ")}] (excluded: [${excluded.join(", ")}])`;
}

/** The per-platform posts the body is assembled from. Only the requested platforms' posts are used. */
export interface DraftBodyParts {
  /** The X thread posts (used only when `x` is in the requested platforms). */
  xPosts: DraftPost[];
  /** The Threads post(s) (used only when `threads` is in the requested platforms). */
  threadsPosts: DraftPost[];
  draftTitle?: string;
  /** Whether Typefully generates a public share link. Default false (internal draft). */
  share?: boolean;
}

/**
 * Assemble a `CreateDraftBody` that targets ONLY the requested platforms. THE key behavior: an
 * EXCLUDED platform's block is OMITTED ENTIRELY — the resulting `body.platforms` has NO key for it
 * (not a disabled block). So `assembleDraftBody(["threads"], …)` yields `{ platforms: { threads: … } }`
 * with no `x` key — exactly what a Threads-only partial-publish recovery needs so the already-live X
 * thread is NOT re-posted.
 *
 * THROWS when `platforms` is empty (a draft must target at least one platform).
 */
export function assembleDraftBody(platforms: Platform[], parts: DraftBodyParts): CreateDraftBody {
  if (platforms.length === 0) {
    throw new Error(
      "assembleDraftBody: no platforms requested — a draft must target at least one of: " +
        `${ALL_PLATFORMS.join(", ")}.`,
    );
  }

  const blocks: { x?: PlatformBlock; threads?: PlatformBlock } = {};
  if (platforms.includes("x")) blocks.x = { enabled: true, posts: parts.xPosts };
  if (platforms.includes("threads")) blocks.threads = { enabled: true, posts: parts.threadsPosts };

  return {
    platforms: blocks,
    draft_title: parts.draftTitle,
    share: parts.share ?? false,
  };
}
