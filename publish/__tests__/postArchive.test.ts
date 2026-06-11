/**
 * POST AUTO-ARCHIVE tests — prove the durable archive is written correctly and idempotently.
 *
 * Every test uses an isolated TEMP dir (never the real home archive) via the archiveDir override, so
 * the unit suite has zero side effects on `~/coding_projects/_launch-assets/POSTS-ARCHIVE`.
 *
 * Covers: (1) a fresh upsert creates the copy + meta + index; (2) re-upsert by the same slug UPDATES
 * in place with no duplicate; (3) regenerating one post's section preserves OTHER posts' sections;
 * (4) a missing archive dir is created; (5) a live-URL writeback MERGES into an existing record
 * without erasing the rest.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  archivePost,
  upsertArchiveIndex,
  type PostArchiveRecord,
} from "../postArchive";

const INDEX = "POSTS-ARCHIVE.md";

/** Make a fresh isolated temp archive dir for one test. */
function freshDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "posts-archive-test-"));
}

/** A complete record for post #1 with an inline copy object (no out/copy dependency). */
function post1Record(over: Partial<PostArchiveRecord> = {}): PostArchiveRecord {
  return {
    slug: "lfah-post1",
    postNumber: 1,
    title: "lfah is a BUG-FIXER",
    subject: "fixes real bugs cheaply",
    category: "introduction",
    producedDate: "2026-06-10",
    publishedDate: "2026-06-10",
    mediaBundleDir: "~/coding_projects/_launch-assets/lfah-20260610",
    publishManifestRef: "content-pipeline/publish/manifests/lfah-post1.publish-manifest.json",
    copyArchiveBasename: "post1-lfah-bugfixer-copy.json",
    copy: { x_thread: ["hook", "body"], threads_post: "t" },
    numbers: "13 bugs, 62% hybrid",
    ...over,
  };
}

/** A complete record for post #2. */
function post2Record(over: Partial<PostArchiveRecord> = {}): PostArchiveRecord {
  return {
    slug: "lfah-post2",
    postNumber: 2,
    title: "lfah is a BUILDER",
    subject: "builds whole apps test-first",
    category: "introduction",
    producedDate: "2026-06-11",
    publishedDate: "2026-06-11",
    copyArchiveBasename: "post2-lfah-builder-copy.json",
    copy: { x_thread: ["a", "b", "c", "d"], threads_post: "t2" },
    ...over,
  };
}

function readIndex(dir: string): string {
  return fs.readFileSync(path.join(dir, INDEX), "utf8");
}

function countSections(md: string): number {
  return (md.match(/^## Post #/gm) ?? []).length;
}

describe("archivePost", () => {
  it("creates a durable record: copy JSON + meta JSON + index section", () => {
    const dir = freshDir();
    const res = archivePost(post1Record(), dir);

    // copy JSON written from the inline copy object.
    expect(res.copyPath).not.toBeNull();
    expect(fs.existsSync(res.copyPath!)).toBe(true);
    const copy = JSON.parse(fs.readFileSync(res.copyPath!, "utf8"));
    expect(copy.x_thread).toEqual(["hook", "body"]);

    // meta JSON written, with the inline copy + env-specific copySourcePath stripped.
    expect(fs.existsSync(res.metaPath)).toBe(true);
    const meta = JSON.parse(fs.readFileSync(res.metaPath, "utf8"));
    expect(meta.slug).toBe("lfah-post1");
    expect(meta.subject).toBe("fixes real bugs cheaply");
    expect(meta.copy).toBeUndefined();
    expect(meta.copySourcePath).toBeUndefined();

    // index regenerated with the post's section.
    const md = readIndex(dir);
    expect(md).toContain("## Post #1 — lfah is a BUG-FIXER  (INTRODUCTION)");
    expect(md).toContain("post1-lfah-bugfixer-copy.json");
    expect(countSections(md)).toBe(1);
  });

  it("is idempotent by slug: re-upsert UPDATES in place with no duplicate", () => {
    const dir = freshDir();
    archivePost(post1Record({ subject: "first subject" }), dir);
    archivePost(post1Record({ subject: "second subject" }), dir);

    // exactly one meta file for the slug.
    const metaFiles = fs.readdirSync(dir).filter((f) => f.endsWith(".meta.json"));
    expect(metaFiles).toEqual(["lfah-post1.meta.json"]);

    const meta = JSON.parse(fs.readFileSync(path.join(dir, "lfah-post1.meta.json"), "utf8"));
    expect(meta.subject).toBe("second subject");

    // index has exactly ONE section, showing the updated subject.
    const md = readIndex(dir);
    expect(countSections(md)).toBe(1);
    expect(md).toContain("second subject");
    expect(md).not.toContain("first subject");
  });

  it("regenerating one post's section preserves OTHER posts' sections", () => {
    const dir = freshDir();
    archivePost(post1Record(), dir);
    archivePost(post2Record(), dir);
    // re-archive post #1 (its section regenerates) — post #2's section must survive.
    archivePost(post1Record({ subject: "updated post1 subject" }), dir);

    const md = readIndex(dir);
    expect(countSections(md)).toBe(2);
    expect(md).toContain("## Post #1 — lfah is a BUG-FIXER");
    expect(md).toContain("## Post #2 — lfah is a BUILDER");
    expect(md).toContain("updated post1 subject");
    // ordered by postNumber: #1 appears before #2.
    expect(md.indexOf("Post #1")).toBeLessThan(md.indexOf("Post #2"));
  });

  it("creates the archive dir when it is missing", () => {
    const base = freshDir();
    const nested = path.join(base, "does", "not", "exist", "yet");
    expect(fs.existsSync(nested)).toBe(false);

    const res = archivePost(post1Record(), nested);
    expect(fs.existsSync(nested)).toBe(true);
    expect(fs.existsSync(res.metaPath)).toBe(true);
    expect(fs.existsSync(path.join(nested, INDEX))).toBe(true);
  });

  it("merges a live-URL writeback into an existing record without erasing the rest", () => {
    const dir = freshDir();
    // 1 — archive the full record WITHOUT live URLs.
    archivePost(post1Record({ publishedDate: null }), dir);

    // 2 — writeback: only slug + liveUrls + publishedDate (a partial record).
    archivePost(
      {
        slug: "lfah-post1",
        publishedDate: "2026-06-10",
        liveUrls: { x: "https://x.com/u/status/123", threads: "https://threads/abc" },
      },
      dir,
    );

    const meta = JSON.parse(fs.readFileSync(path.join(dir, "lfah-post1.meta.json"), "utf8"));
    // merged: live URLs added…
    expect(meta.liveUrls.x).toBe("https://x.com/u/status/123");
    expect(meta.liveUrls.threads).toBe("https://threads/abc");
    expect(meta.publishedDate).toBe("2026-06-10");
    // …and the rest of the record preserved (NOT erased by the partial writeback).
    expect(meta.subject).toBe("fixes real bugs cheaply");
    expect(meta.title).toBe("lfah is a BUG-FIXER");
    expect(meta.numbers).toBe("13 bugs, 62% hybrid");

    const md = readIndex(dir);
    expect(md).toContain("https://x.com/u/status/123");
    expect(md).toContain("https://threads/abc");
    expect(countSections(md)).toBe(1);
  });

  it("merges one live URL without clobbering a previously-stored other URL", () => {
    const dir = freshDir();
    archivePost(post1Record({ liveUrls: { x: "https://x/first", threads: "https://t/first" } }), dir);
    // writeback only the X url — threads must survive.
    archivePost({ slug: "lfah-post1", liveUrls: { x: "https://x/updated" } }, dir);

    const meta = JSON.parse(fs.readFileSync(path.join(dir, "lfah-post1.meta.json"), "utf8"));
    expect(meta.liveUrls.x).toBe("https://x/updated");
    expect(meta.liveUrls.threads).toBe("https://t/first");
  });
});

describe("upsertArchiveIndex", () => {
  it("regenerates the index from all meta files (a pending post shows '(pending publish)')", () => {
    const dir = freshDir();
    archivePost(post1Record(), dir);
    archivePost(
      post2Record({ slug: "forge-harness-post3", postNumber: 3, title: "forge-harness", publishedDate: null, liveUrls: {} }),
      dir,
    );

    const indexPath = upsertArchiveIndex(dir);
    expect(indexPath).toBe(path.join(dir, INDEX));
    const md = fs.readFileSync(indexPath, "utf8");
    expect(countSections(md)).toBe(2);
    expect(md).toContain("_(pending publish)_");
    expect(md).toContain("# Launch Posts Archive");
  });
});
