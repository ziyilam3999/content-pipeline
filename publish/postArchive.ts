/**
 * POST AUTO-ARCHIVE — make every produced post durable so it is NEVER lost.
 *
 * WHY this exists: the canonical post copy lives ONLY in the gitignored `out/copy/*.json` working
 * files (a `git clean` would delete them). A durable archive was first built BY HAND at
 * `~/coding_projects/_launch-assets/POSTS-ARCHIVE/` (a POSTS-ARCHIVE.md index + per-post copy JSONs).
 * This module BAKES that hand process into the pipeline: when a post is assembled/published, the
 * publish smokes call `archivePost(...)` and the copy + a metadata record land in the durable,
 * NON-REPO archive dir automatically — no human step. A `git clean` can never touch it (it lives
 * outside the repo, under ~/coding_projects/_launch-assets/).
 *
 * DESIGN (idempotent, machine-owned SSOT):
 *   - Each post owns TWO durable files in the archive dir, keyed by slug:
 *       • `<copyArchiveBasename>`  — the post's copy JSON, copied verbatim out of gitignored out/copy.
 *       • `<slug>.meta.json`       — the metadata record (subject, category, dates, media bundle,
 *                                    publish-manifest ref, live URLs when known).
 *   - `POSTS-ARCHIVE.md` is REGENERATED from ALL `*.meta.json` files in the dir (header + one section
 *     per post, ordered by postNumber, + footer). Because it is rebuilt from every meta file, an
 *     upsert of one post NEVER clobbers another post's section — they each have their own meta file.
 *   - `archivePost` is idempotent BY SLUG: re-running MERGES the new record over the existing meta
 *     (defined fields win; undefined fields are preserved), so a live-URL writeback after a publish
 *     read-back merges into the existing record rather than duplicating or erasing it.
 *
 * Both the publish path and a backfill use the SAME `ARCHIVE_POSTS` SSOT + `buildArchiveRecord`, so
 * the durable archive is produced BY the pipeline, identical whether it's a fresh post or a backfill.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { CONFIG } from "../config";
import type { PostSlug } from "./publishAssets";

// ── Record shape ─────────────────────────────────────────────────────────

/** Which launch arc a post belongs to (drives the archive section header). */
export type PostCategory = "introduction" | "demonstration";

/** Live published URLs, populated after a successful publish read-back (#793). */
export interface PostLiveUrls {
  x?: string | null;
  threads?: string | null;
}

/**
 * A durable archive record for one post. `slug` is the only REQUIRED field — every other field is
 * optional so a partial record (e.g. just `slug` + `liveUrls`) can MERGE into an existing record
 * after a publish read-back without erasing the rest. For a brand-new post, build the full record via
 * `buildArchiveRecord(slug, …)` so every display field is populated.
 */
export interface PostArchiveRecord {
  /** Canonical post slug (the cross-pipeline SSOT key). REQUIRED. */
  slug: PostSlug;
  /** Display ordinal (1,2,3…) — orders the sections in POSTS-ARCHIVE.md. */
  postNumber?: number;
  /** Short human title, e.g. "lfah is a BUG-FIXER". */
  title?: string;
  /** One-line subject / value-prop. */
  subject?: string;
  /** Launch arc category. */
  category?: PostCategory;
  /** ISO date the post was produced (YYYY-MM-DD). */
  producedDate?: string;
  /** ISO date the post went live (YYYY-MM-DD), or null/undefined if not yet published. */
  publishedDate?: string | null;
  /** Durable media-bundle dir (display string; may use `~`). */
  mediaBundleDir?: string;
  /** Repo-relative publish-manifest ref (provenance breadcrumb). */
  publishManifestRef?: string;
  /** Basename the copy JSON is archived under in the archive dir. */
  copyArchiveBasename?: string;
  /** Source copy JSON path (gitignored out/copy/…) to copy verbatim into the archive. */
  copySourcePath?: string;
  /** Inline copy object — used when `copySourcePath` is absent (CI / fresh checkout). */
  copy?: unknown;
  /** Live published URLs (filled after read-back). */
  liveUrls?: PostLiveUrls;
  /** One-line numbers summary for the index. */
  numbers?: string;
  /** Free-form note (e.g. publish-status caveat). */
  note?: string;
}

/** Result of an archive write — the durable paths touched. */
export interface ArchiveResult {
  archiveDir: string;
  copyPath: string | null;
  metaPath: string;
  indexPath: string;
}

// ── Archive-dir resolution ───────────────────────────────────────────────

/**
 * Resolve the durable archive dir. Precedence: explicit `override` arg > `$POSTS_ARCHIVE_DIR` env >
 * `CONFIG.publish.archiveDir`. A leading `~` is expanded to the home dir so the FS can always create
 * it. Tests pass a temp dir (via `override` or the env) so they never touch the real home archive.
 */
export function resolveArchiveDir(override?: string): string {
  const raw = override ?? process.env.POSTS_ARCHIVE_DIR ?? CONFIG.publish.archiveDir;
  if (raw === "~") return os.homedir();
  if (raw.startsWith("~/")) return path.join(os.homedir(), raw.slice(2));
  return raw;
}

/**
 * Resolve the IN-REPO archive mirror dir (#821) — the GIT-TRACKED second home for the same archive
 * content (`.ai-workspace/posts`), so a fresh clone / CI has the canonical copy too. Precedence:
 * explicit `override` arg > `$POSTS_INREPO_ARCHIVE_DIR` env > `CONFIG.publish.inRepoArchiveDir`
 * (already an absolute path against the repo root). Mirrors `resolveArchiveDir`'s `~` expansion so a
 * `~`-prefixed override still works; tests pass a temp dir so they never write the real repo archive.
 */
export function resolveInRepoArchiveDir(override?: string): string {
  const raw =
    override ?? process.env.POSTS_INREPO_ARCHIVE_DIR ?? CONFIG.publish.inRepoArchiveDir;
  if (raw === "~") return os.homedir();
  if (raw.startsWith("~/")) return path.join(os.homedir(), raw.slice(2));
  return raw;
}

// ── Per-post static SSOT ─────────────────────────────────────────────────

/** Static (known-at-build-time) metadata for each launch post. */
type StaticArchiveMeta = Omit<PostArchiveRecord, "slug" | "copy" | "copySourcePath"> & {
  /** out/copy source basename, resolved against the primary checkout's out/copy dir. */
  copySourceBasename: string;
};

/**
 * THE per-post archive SSOT — the durable facts the pipeline knows about each launch post. The
 * publish smokes + the backfill both read this so the archive is produced identically by both. Live
 * URLs for already-published posts are recorded here (public launch URLs; brand-clean) so the durable
 * record is complete the moment the post is archived; a future post leaves them undefined until its
 * read-back fills them.
 */
export const ARCHIVE_POSTS: Record<PostSlug, StaticArchiveMeta> = {
  "lfah-post1": {
    postNumber: 1,
    title: "lfah is a BUG-FIXER",
    subject:
      "local-first-agent-harness fixes real SWE-bench bugs cheaply (local-first, cloud-rescue).",
    category: "introduction",
    producedDate: "2026-06-10",
    publishedDate: "2026-06-10",
    mediaBundleDir: "~/coding_projects/_launch-assets/lfah-20260610",
    publishManifestRef: "content-pipeline/publish/manifests/lfah-post1.publish-manifest.json",
    copyArchiveBasename: "post1-lfah-bugfixer-copy.json",
    copySourceBasename: "lfah-launch-content.json",
    liveUrls: {
      x: "https://x.com/anson3999/status/2064573597633728583",
      threads: "https://www.threads.com/@gotextrameal/post/DZZJUkrCkw",
    },
    numbers:
      "13 SWE-bench Verified bugs; hybrid 62% ($15.7) vs full-cloud 77% ($35.0); 55% cheaper; real Docker oracle.",
    note:
      "the live X thread published OUT OF ORDER (5 tweets same second + heavy video on t1) — operator CLOSED, no repost. Square-vs-9:16 hero bug fixed for future posts (#794).",
  },
  "lfah-post2": {
    postNumber: 2,
    title: "lfah is a BUILDER",
    subject:
      "lfah doesn't just fix bugs — it builds whole apps test-first; proof = content-pipeline was built BY lfah.",
    category: "introduction",
    producedDate: "2026-06-11",
    publishedDate: "2026-06-11",
    mediaBundleDir: "~/coding_projects/_launch-assets/lfah-post2-20260610",
    publishManifestRef: "content-pipeline/publish/manifests/lfah-post2.publish-manifest.json",
    copyArchiveBasename: "post2-lfah-builder-copy.json",
    copySourceBasename: "lfah-post2-builder-content.json",
    liveUrls: {
      x: "https://x.com/anson3999/status/2064861439471636632",
      threads: "https://www.threads.com/@gotextrameal/post/DZbMNpElIzu",
    },
    numbers:
      "13 build phases, all shipped; ~85% solved by free local model; $12.56 total cloud; cloud rescued bp2+bp5.",
  },
  "forge-harness-post3": {
    postNumber: 3,
    title: 'forge-harness ("only 1 of 8 talks to the model")',
    subject:
      "8 composable MCP primitives, only 1 ever calls the LLM; deterministic verdicts; a real 13-story project's whole plan ~$0.80.",
    category: "introduction",
    producedDate: "2026-06-11",
    publishedDate: "2026-06-11",
    mediaBundleDir: "~/coding_projects/_launch-assets/forge-harness-post3-20260611",
    publishManifestRef:
      "content-pipeline/publish/manifests/forge-harness-post3.publish-manifest.json",
    copyArchiveBasename: "post3-forge-harness-copy.json",
    copySourceBasename: "forge-harness-post3-content.json",
    // X thread is LIVE but its exact status URL was NOT captured (the Typefully draft was deleted
    // post-publish), so `x` is intentionally ABSENT — never invent a URL we can't read back. Threads
    // URL is read-back VERIFIED.
    liveUrls: {
      threads: "https://www.threads.com/@gotextrameal/post/DZcUScDAIy3",
    },
    numbers:
      "8 primitives / 1 LLM tool; 16 calls / 2 paid; $0.80 plan / ~$0.20 story; MIT, public.",
    note:
      "X thread is LIVE (operator published 2026-06-11) but its exact status URL was not captured (the Typefully draft was deleted post-publish); Threads read-back verified.",
  },
  "content-pipeline-demo-post4": {
    postNumber: 4,
    title: "content-pipeline — a content tool with no buttons",
    subject:
      "content-pipeline has no UI — you ask Claude Code in plain English and the AI agent builds the whole post (copy, card, captioned video in 3 shapes); a built-in checker flags any claim that doesn't match your facts. MIT, open-source.",
    category: "demonstration",
    producedDate: "2026-06-13",
    // Not yet published — a DRAFT is created via the live publisher; the operator does the final manual
    // Publish. publishedDate stays null until a post-publish read-back fills it.
    publishedDate: null,
    mediaBundleDir: "~/coding_projects/_launch-assets/content-pipeline-demo-post4-20260613",
    publishManifestRef:
      "content-pipeline/publish/manifests/content-pipeline-demo-post4.publish-manifest.json",
    copyArchiveBasename: "post4-content-pipeline-demo-copy.json",
    copySourceBasename: "content-pipeline-demo-post4-content.json",
    numbers:
      "no UI / agent-operated; 1 plain-English ask → copy + card + captioned video in 3 shapes; MIT, public.",
    note:
      "DEMONSTRATION post — the 85s voiced Fable-style demo IS the hero (video-hook + card-body). X = 4-tweet thread (tweet 1 hero video; tweets 2-4 branded body cards A/B/C); Threads = single video-led mixed post (hero video + card A). All gate-clean (#810 provenance / #809-#827 length / #797 fidelity all PASS).",
  },
  "three-role-model-post5": {
    postNumber: 5,
    title: "the 3-role development model — nobody grades their own homework",
    subject:
      "a way to build software with AI where four subagents each do one job (planner → plan-review → executor → execution-review) and nobody reviews their own work; two knobs pick the shape per task; mechanically enforced by hooks + a forgery-resistant role-ledger. MIT, public Claude Code plugin.",
    category: "introduction",
    producedDate: "2026-06-14",
    // Not yet published — a DRAFT is created via the live publisher; the operator does the final manual
    // Publish. publishedDate stays null until a post-publish read-back fills it.
    publishedDate: null,
    mediaBundleDir: "~/coding_projects/_launch-assets/three-role-model-post5-20260614",
    publishManifestRef:
      "content-pipeline/publish/manifests/three-role-model-post5.publish-manifest.json",
    copyArchiveBasename: "post5-three-role-model-copy.json",
    copySourceBasename: "three-role-model-post-content.json",
    numbers:
      "4 roles / 2 knobs (4 executor-placements / 3 evaluators); roles bound to real transcripts via a forgery-resistant ledger; MIT, public.",
    note:
      "INTRODUCTION post — the ~90s voiced demo IS the hero (video-hook + card-body). X = 4-tweet thread (tweet 1 hero video; tweets 2-4 body cards A/B/C); Threads = single video-led mixed post (hero video + card A). Workflow/methodology — ZERO efficacy numbers claimed, only structural counts. All gate-clean (#810 provenance / #809-#827 length / #797 fidelity all PASS).",
  },
  "forge-demo-871": {
    postNumber: 6,
    title: "forge-harness — your tests decide what ships",
    subject:
      "a DEMONSTRATION of forge-harness's real dashboard: a story hits Retry when a check fails, shows which one, then slides to Done after the fix; 8 building blocks, only one calls the model; $0 out of pocket on a Max plan. MIT, public.",
    category: "demonstration",
    producedDate: "2026-06-15",
    // Not yet published — a DRAFT is created via the live publisher; the operator does the final manual
    // Publish. publishedDate stays null until a post-publish read-back fills it.
    publishedDate: null,
    mediaBundleDir: "~/coding_projects/_launch-assets/forge-demo-871-20260615",
    publishManifestRef: "content-pipeline/publish/manifests/forge-demo-871.publish-manifest.json",
    copyArchiveBasename: "forge-demo-871-copy.json",
    copySourceBasename: "forge-demo-copy.json",
    numbers:
      "96% don't fully trust AI code / 48% verify (Sonar 2026, external); 8 blocks / 1 calls the model; Retry→Done; $0 out of pocket on Max; MIT, public.",
    note:
      "DEMONSTRATION post — the ~88s voiced cut IS the hero (video-hook + card-body). X = 4-tweet thread (tweet 1 hero video; tweets 2-4 body cards A/B/C); Threads = single video-led mixed post (hero video + card A). 96%/48% are EXTERNAL industry stats (Sonar State of Code 2026), shown with a source chip — NOT a forge metric. All gate-clean (#810 provenance / #809-#827 length / #797 fidelity all PASS).",
  },
};

/**
 * Build a full archive record for a post from the static SSOT, resolving the copy source against the
 * primary checkout. `dynamic` overlays any freshly-known fields (e.g. a publishedDate / liveUrls
 * learned from a publish read-back). Defaults `primaryRoot` to this machine's clone; override with
 * `$CONTENT_PIPELINE_PRIMARY` (mirrors the publish smokes).
 */
export function buildArchiveRecord(
  slug: PostSlug,
  opts: { primaryRoot?: string; dynamic?: Partial<PostArchiveRecord> } = {},
): PostArchiveRecord {
  const meta = ARCHIVE_POSTS[slug];
  const primaryRoot =
    opts.primaryRoot ??
    process.env.CONTENT_PIPELINE_PRIMARY ??
    "/Users/ansonlam/coding_projects/content-pipeline";
  const { copySourceBasename, ...rest } = meta;
  return {
    slug,
    ...rest,
    copySourcePath: path.join(primaryRoot, "out", "copy", copySourceBasename),
    ...(opts.dynamic ?? {}),
  };
}

// ── Merge helpers (idempotent upsert) ────────────────────────────────────

/** Shallow-merge `next` over `base`, but only for keys whose `next` value is NOT undefined. */
function mergeDefined<T extends Record<string, unknown>>(base: T, next: Partial<T>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(next)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/**
 * Read an existing meta record for a slug if present (for the idempotent merge). Returns null when
 * absent or unparseable (a corrupt file should not break a fresh archive).
 */
function readExistingMeta(metaPath: string): PostArchiveRecord | null {
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8")) as PostArchiveRecord;
  } catch {
    return null;
  }
}

// ── The archive write ────────────────────────────────────────────────────

/**
 * Archive a post durably: copy its copy JSON, write/merge its metadata record, and regenerate the
 * POSTS-ARCHIVE.md index. Idempotent by slug (re-running MERGES the record in place — defined fields
 * win, the rest is preserved — so it never duplicates and a live-URL writeback merges cleanly). The
 * archive dir is created if missing.
 */
export function archivePost(record: PostArchiveRecord, archiveDirOverride?: string): ArchiveResult {
  const archiveDir = resolveArchiveDir(archiveDirOverride);
  fs.mkdirSync(archiveDir, { recursive: true });

  // 1 — merge over any existing meta so a partial record never erases prior fields.
  const metaPath = path.join(archiveDir, `${record.slug}.meta.json`);
  const existing = readExistingMeta(metaPath);
  const merged: PostArchiveRecord = existing
    ? (mergeDefined(
        existing as unknown as Record<string, unknown>,
        record as unknown as Record<string, unknown>,
      ) as unknown as PostArchiveRecord)
    : { ...record };
  // liveUrls is a nested object — merge it field-by-field so a partial url update keeps the other url.
  if (existing?.liveUrls || record.liveUrls) {
    merged.liveUrls = mergeDefined(
      (existing?.liveUrls ?? {}) as unknown as Record<string, unknown>,
      (record.liveUrls ?? {}) as unknown as Record<string, unknown>,
    ) as unknown as PostLiveUrls;
  }

  // 2 — copy the canonical copy JSON out of gitignored out/copy (or write an inline copy object).
  let copyPath: string | null = null;
  if (merged.copyArchiveBasename) {
    copyPath = path.join(archiveDir, merged.copyArchiveBasename);
    if (merged.copySourcePath && fs.existsSync(merged.copySourcePath)) {
      fs.copyFileSync(merged.copySourcePath, copyPath);
    } else if (merged.copy !== undefined) {
      fs.writeFileSync(copyPath, JSON.stringify(merged.copy, null, 2) + "\n");
    } else if (!fs.existsSync(copyPath)) {
      // No source on disk + no inline copy + nothing already archived — record the gap, don't fail.
      copyPath = null;
    }
  }

  // 3 — persist the merged meta record. Strip the volatile/inline-only fields from disk (the copy
  // object itself lives in the copy JSON, not the meta; copySourcePath is environment-specific).
  const { copy: _copy, copySourcePath: _src, ...metaToPersist } = merged;
  void _copy;
  void _src;
  fs.writeFileSync(metaPath, JSON.stringify(metaToPersist, null, 2) + "\n");

  // 4 — regenerate the index from ALL meta files (never clobbers other posts' sections).
  const indexPath = upsertArchiveIndex(archiveDir);

  return { archiveDir, copyPath, metaPath, indexPath };
}

// ── POSTS-ARCHIVE.md regeneration ────────────────────────────────────────

const ARCHIVE_INDEX_FILENAME = "POSTS-ARCHIVE.md";

const INDEX_HEADER = `# Launch Posts Archive

Persistent record of every promo post produced by content-pipeline — copy, live URLs, media, numbers —
so any post can later be re-purposed for another platform (e.g. LinkedIn) without reconstructing it.

> WHY this file exists: the canonical copy text lives only in \`content-pipeline/out/copy/*.json\`, which is
> **gitignored** (a \`git clean\` would delete it). This archive is the durable home. It is produced
> AUTOMATICALLY by the pipeline (\`publish/postArchive.ts\` — every post is archived on assembly/publish),
> reconciling the original hand-made archive.

## Categories
- **Product INTRODUCTION** — explain what it is: value prop, real numbers, explainer animation.
- **Product DEMONSTRATION** — show it in action: real screen-capture + narrated play-by-play.

> This file is GENERATED from the \`*.meta.json\` records in this directory — do not hand-edit; edits are
> overwritten on the next archive. Change the source in \`publish/postArchive.ts\` (ARCHIVE_POSTS) instead.
`;

const INDEX_FOOTER = `## LinkedIn re-purpose readiness
For each post the durable inputs exist: full copy JSON (X thread + Threads variants + video narration
scenes + card labels + number_verification), the media bundle, the cards, and the art base. A LinkedIn
variant would reuse the numbers + honesty guards verbatim and re-flow the X-thread copy into a single
longer-form post — copy re-flow, not a rebuild. Posting to LinkedIn is a DEFERRED operator decision.
`;

/** Render one post's markdown section from its meta record. */
function renderSection(m: PostArchiveRecord): string {
  const n = m.postNumber ?? "?";
  const cat = (m.category ?? "introduction").toUpperCase();
  const lines: string[] = [];
  lines.push(`## Post #${n} — ${m.title ?? m.slug}  (${cat})`);
  if (m.subject) lines.push(`- **Subject:** ${m.subject}`);
  if (m.producedDate) lines.push(`- **Produced:** ${m.producedDate}`);
  const liveX = m.liveUrls?.x;
  const liveT = m.liveUrls?.threads;
  if (m.publishedDate) {
    lines.push(`- **Published:** ${m.publishedDate} (LIVE).`);
  } else {
    lines.push(`- **Published:** _(pending publish)_`);
  }
  if (liveX || liveT) {
    const parts: string[] = [];
    if (liveX) parts.push(`X ${liveX}`);
    if (liveT) parts.push(`Threads ${liveT}`);
    lines.push(`- **Live URLs:** ${parts.join(" · ")}`);
  } else {
    lines.push(`- **Live URLs:** _(pending publish)_`);
  }
  if (m.copyArchiveBasename) lines.push(`- **Copy:** \`${m.copyArchiveBasename}\` (this dir)`);
  if (m.mediaBundleDir) lines.push(`- **Media bundle:** \`${m.mediaBundleDir}/\``);
  if (m.publishManifestRef) lines.push(`- **Publish manifest:** \`${m.publishManifestRef}\``);
  if (m.numbers) lines.push(`- **Numbers:** ${m.numbers}`);
  if (m.note) lines.push(`- **Note:** ${m.note}`);
  return lines.join("\n");
}

/**
 * Regenerate POSTS-ARCHIVE.md from EVERY `*.meta.json` record in the archive dir. Sorted by
 * postNumber (then slug). Because it reads every meta file, regenerating one post's section never
 * clobbers another's. Returns the index path written. Exposed so a backfill / repair can rebuild the
 * index without re-copying any copy JSON.
 */
export function upsertArchiveIndex(archiveDirOverride?: string): string {
  const archiveDir = resolveArchiveDir(archiveDirOverride);
  fs.mkdirSync(archiveDir, { recursive: true });

  const metas: PostArchiveRecord[] = fs
    .readdirSync(archiveDir)
    .filter((f) => f.endsWith(".meta.json"))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(archiveDir, f), "utf8")) as PostArchiveRecord;
      } catch {
        return null;
      }
    })
    .filter((m): m is PostArchiveRecord => m !== null)
    .sort((a, b) => {
      const na = a.postNumber ?? Number.MAX_SAFE_INTEGER;
      const nb = b.postNumber ?? Number.MAX_SAFE_INTEGER;
      if (na !== nb) return na - nb;
      return (a.slug ?? "").localeCompare(b.slug ?? "");
    });

  const body = metas.map(renderSection).join("\n\n");
  const lastUpdated = new Date().toISOString().slice(0, 10);
  const md =
    INDEX_HEADER +
    `\nLast updated: ${lastUpdated}\n\n---\n\n` +
    (body ? body + "\n\n" : "") +
    `---\n\n` +
    INDEX_FOOTER;

  const indexPath = path.join(archiveDir, ARCHIVE_INDEX_FILENAME);
  fs.writeFileSync(indexPath, md);
  return indexPath;
}

// ── Non-fatal wrapper for the publish path ───────────────────────────────

/**
 * Archive a post WITHOUT ever throwing — archiving must NEVER break a publish. Logs a clear warning on
 * any write error and returns null; returns the ArchiveResult on success. The publish smokes call THIS
 * (not `archivePost` directly) so a flaky archive write is non-fatal. The unit tests exercise the
 * throwing `archivePost` to prove the happy path writes correctly.
 */
export function safeArchivePost(
  record: PostArchiveRecord,
  archiveDirOverride?: string,
): ArchiveResult | null {
  try {
    return archivePost(record, archiveDirOverride);
  } catch (err) {
    console.warn(
      `ARCHIVE WARN: failed to archive post ${record.slug} (non-fatal — publish continues): ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

// ── Dual-write (external durable + in-repo mirror) ───────────────────────

/** Optional per-target dir overrides for the dual-write (tests point both at temp dirs). */
export interface ArchiveAllOptions {
  /** Override the EXTERNAL durable dir (else $POSTS_ARCHIVE_DIR / CONFIG.publish.archiveDir). */
  externalDirOverride?: string;
  /** Override the IN-REPO mirror dir (else $POSTS_INREPO_ARCHIVE_DIR / CONFIG.publish.inRepoArchiveDir). */
  inRepoDirOverride?: string;
}

/** Result of a dual-write — the per-target ArchiveResults. */
export interface ArchiveAllResult {
  /** The external durable archive (outside the repo — survives `git clean`). */
  external: ArchiveResult;
  /** The in-repo git-tracked mirror (so a fresh clone / CI has the canonical copy too, #821). */
  inRepo: ArchiveResult;
}

/**
 * DUAL-WRITE (#821): archive a post into BOTH durable homes — the EXTERNAL non-repo archive AND the
 * IN-REPO git-tracked mirror — by calling the existing single-dir `archivePost` once per target. This
 * reuses ALL of `archivePost`'s logic (idempotent merge, copy-JSON copy, index regeneration) for each
 * dir; the single-dir `archivePost`/`safeArchivePost` stay intact for the temp-dir `override` contract.
 * Throws if either write fails — use `safeArchivePostAll` on the publish path.
 */
export function archivePostAll(
  record: PostArchiveRecord,
  opts: ArchiveAllOptions = {},
): ArchiveAllResult {
  const external = archivePost(record, resolveArchiveDir(opts.externalDirOverride));
  const inRepo = archivePost(record, resolveInRepoArchiveDir(opts.inRepoDirOverride));
  return { external, inRepo };
}

/**
 * Non-fatal dual-write — like `safeArchivePost`, archiving must NEVER break a publish. Logs a clear
 * warning and returns null on any error; returns the per-target results on success. The publish smokes
 * call THIS so every future post auto-persists in BOTH the external durable archive and the in-repo
 * git-tracked mirror.
 */
export function safeArchivePostAll(
  record: PostArchiveRecord,
  opts: ArchiveAllOptions = {},
): ArchiveAllResult | null {
  try {
    return archivePostAll(record, opts);
  } catch (err) {
    console.warn(
      `ARCHIVE WARN: failed to dual-archive post ${record.slug} (non-fatal — publish continues): ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
