/**
 * #1068 — unit tests for the PURE YouTube metadata/limit builders (publish/youtubePosts.ts).
 *
 * Zero network, zero Keychain — these are pure functions over the POST_ASSETS + SOCIAL_LINKS SSOTs.
 * Both-ends coverage: the validator PASSES on every real post AND THROWS on a too-long title /
 * description / tag set. Also asserts the YOUTUBE_POSTS keys + YOUTUBE_POST_ORDER === the full
 * PostSlug set (no post silently unmapped — the recurrence that broke typecheck on the 8th post).
 */
import { POST_ASSETS, type PostSlug } from "../publishAssets";
import { SOCIAL_LINKS } from "../../config/socialLinks";
import {
  YOUTUBE_POSTS,
  YOUTUBE_POST_ORDER,
  YT_TITLE_MAX,
  YT_DESCRIPTION_MAX,
  YT_TAGS_TOTAL_MAX,
  buildDescription,
  buildYouTubeMetadata,
  assertYouTubeMetadataValid,
  resolvePrivacyStatus,
  toInsertResource,
  tagsTotalChars,
  type YouTubeMetadata,
} from "../youtubePosts";

const ALL_SLUGS = Object.keys(POST_ASSETS) as PostSlug[];

afterEach(() => {
  delete process.env.YOUTUBE_PRIVACY;
});

describe("coverage completeness — every PostSlug is mapped (no silent gap)", () => {
  it("YOUTUBE_POSTS keys === the full PostSlug set", () => {
    expect(new Set(Object.keys(YOUTUBE_POSTS))).toEqual(new Set(ALL_SLUGS));
  });

  it("YOUTUBE_POST_ORDER === the full PostSlug set (and includes the 8th post)", () => {
    expect(new Set(YOUTUBE_POST_ORDER)).toEqual(new Set(ALL_SLUGS));
    expect(YOUTUBE_POST_ORDER).toContain("agent-kanban-demo");
    expect(YOUTUBE_POST_ORDER.length).toBe(ALL_SLUGS.length);
  });

  it("both-ends: a partial order is NOT equal to the full slug set", () => {
    const partial = YOUTUBE_POST_ORDER.slice(0, -1);
    expect(new Set(partial)).not.toEqual(new Set(ALL_SLUGS));
  });
});

describe("buildYouTubeMetadata + assertYouTubeMetadataValid — PASS end for every post", () => {
  it.each(ALL_SLUGS)("post %s builds valid metadata the validator accepts", (slug) => {
    const meta = buildYouTubeMetadata(slug);
    expect(() => assertYouTubeMetadataValid(meta)).not.toThrow();
    expect(meta.title.length).toBeLessThanOrEqual(YT_TITLE_MAX);
    expect(meta.description.length).toBeLessThanOrEqual(YT_DESCRIPTION_MAX);
    expect(tagsTotalChars(meta.tags)).toBeLessThanOrEqual(YT_TAGS_TOTAL_MAX);
    // Format-aware: shorts keep the default "(open source)" suffix; the regular demo uses its override title.
    if (YOUTUBE_POSTS[slug].format === "short") {
      expect(meta.title).toContain("(open source)");
    } else {
      expect(meta.title).toBe("Your AI agent is a black box — this open-source board fixes it");
    }
  });

  it.each(ALL_SLUGS)("description for %s carries the repo URL + all 3 social links + format-correct hashtags", (slug) => {
    const spec = YOUTUBE_POSTS[slug];
    const desc = buildDescription(spec);
    const meta = buildYouTubeMetadata(slug);
    expect(desc).toContain(spec.repoUrl);
    expect(desc).toContain(SOCIAL_LINKS.github);
    expect(desc).toContain(SOCIAL_LINKS.x);
    expect(desc).toContain(SOCIAL_LINKS.threads);
    // Format-aware hashtags + tags (both directions).
    if (spec.format === "short") {
      expect(desc).toContain("#Shorts");
      expect(meta.tags).toContain("Shorts");
    } else {
      expect(desc).not.toContain("#Shorts");
      expect(meta.tags).not.toContain("Shorts");
    }
    // LinkedIn intentionally omitted.
    expect(desc.toLowerCase()).not.toContain("linkedin");
  });
});

describe("#1153 — metadata convention (per-post title override + format-aware hashtags/tags + subscribe CTA)", () => {
  // AC1 — the regular demo uses the operator-approved result-first title verbatim (NO "(open source)").
  it("AC1: agent-kanban-demo title is the exact override (no '(open source)' suffix)", () => {
    const meta = buildYouTubeMetadata("agent-kanban-demo");
    expect(meta.title).toBe("Your AI agent is a black box — this open-source board fixes it");
    expect(meta.title).not.toContain("(open source)");
    expect(meta.title.length).toBeLessThanOrEqual(YT_TITLE_MAX);
  });

  // AC2 — every short post's title still ends with the default "(open source)" suffix.
  it("AC2: all 7 short posts keep the default '<hook> (open source)' title", () => {
    const shorts = (Object.keys(YOUTUBE_POSTS) as PostSlug[]).filter(
      (s) => YOUTUBE_POSTS[s].format === "short",
    );
    expect(shorts.length).toBe(7);
    for (const slug of shorts) {
      const meta = buildYouTubeMetadata(slug);
      expect(meta.title).toBe(`${YOUTUBE_POSTS[slug].hook} (open source)`);
      expect(meta.title.endsWith("(open source)")).toBe(true);
    }
  });

  // AC3 — both directions: short carries #Shorts + a "Shorts" tag; regular carries neither.
  it("AC3 (short): a short post has #Shorts in its description AND a 'Shorts' tag", () => {
    const meta = buildYouTubeMetadata("lfah-post1");
    const desc = buildDescription(YOUTUBE_POSTS["lfah-post1"]);
    expect(desc).toContain("#Shorts");
    expect(desc).toContain("#opensource #devtools");
    expect(meta.tags).toContain("Shorts");
  });

  it("AC3 (regular): agent-kanban-demo has NO #Shorts in description and NO 'Shorts' tag", () => {
    const meta = buildYouTubeMetadata("agent-kanban-demo");
    const desc = buildDescription(YOUTUBE_POSTS["agent-kanban-demo"]);
    expect(desc).not.toContain("#Shorts");
    expect(desc).toContain("#AIcoding #opensource #AnsonAndAI");
    expect(meta.tags).not.toContain("Shorts");
  });

  // AC5 — the demo description carries the literal subscribe-CTA prefix + the GitHub repo line.
  it("AC5: agent-kanban-demo description carries the subscribe CTA + the ⭐ GitHub repo link", () => {
    const desc = buildDescription(YOUTUBE_POSTS["agent-kanban-demo"]);
    expect(desc).toContain("▶ Subscribe for more:");
    expect(desc).toContain("https://www.youtube.com/@AnsonAndAI");
    expect(desc).toContain("⭐ GitHub: https://github.com/ziyilam3999/agent-kanban");
  });

  // CTA applies to ALL formats (short posts get it too).
  it("the subscribe CTA renders on a short post as well", () => {
    const desc = buildDescription(YOUTUBE_POSTS["lfah-post1"]);
    expect(desc).toContain("▶ Subscribe for more: https://www.youtube.com/@AnsonAndAI");
  });
});

describe("toInsertResource — explicit COPPA + privacy mapping", () => {
  it("sets selfDeclaredMadeForKids:false EXPLICITLY", () => {
    const res = toInsertResource(buildYouTubeMetadata("lfah-post1"));
    expect(res.status.selfDeclaredMadeForKids).toBe(false);
    expect(Object.keys(res.status)).toContain("selfDeclaredMadeForKids");
    expect(res.snippet.categoryId).toBe("28");
  });
});

describe("resolvePrivacyStatus — default + both-ends", () => {
  it("defaults to public", () => {
    delete process.env.YOUTUBE_PRIVACY;
    expect(resolvePrivacyStatus()).toBe("public");
  });
  it.each(["unlisted", "private", "PUBLIC"])("accepts %s", (v) => {
    process.env.YOUTUBE_PRIVACY = v;
    expect(["public", "unlisted", "private"]).toContain(resolvePrivacyStatus());
  });
  it("FAIL end: throws on a bad YOUTUBE_PRIVACY", () => {
    process.env.YOUTUBE_PRIVACY = "semi-secret";
    expect(() => resolvePrivacyStatus()).toThrow(/YOUTUBE_PRIVACY/);
  });
});

describe("assertYouTubeMetadataValid — FAIL end (both-ends throws)", () => {
  function base(): YouTubeMetadata {
    return {
      title: "ok",
      description: "ok",
      tags: [],
      categoryId: "28",
      defaultLanguage: "en",
      privacyStatus: "public",
      selfDeclaredMadeForKids: false,
    };
  }
  it("throws on a 101-char title", () => {
    expect(() => assertYouTubeMetadataValid({ ...base(), title: "x".repeat(YT_TITLE_MAX + 1) })).toThrow(
      /title too long/,
    );
  });
  it("throws on a 5001-char description", () => {
    expect(() =>
      assertYouTubeMetadataValid({ ...base(), description: "x".repeat(YT_DESCRIPTION_MAX + 1) }),
    ).toThrow(/description too long/);
  });
  it("throws on a >500-char tag set", () => {
    const tags = Array.from({ length: 11 }, () => "x".repeat(50)); // 550 chars
    expect(() => assertYouTubeMetadataValid({ ...base(), tags })).toThrow(/tags too long/);
  });
});
