/**
 * Publish-to-Typefully smoke (#786, "Phase D") — assembles the lfah launch DRAFT and either
 * prints it (DRY-RUN, default) or actually creates it (LIVE, env-gated).
 *
 * DRY-RUN (default): print the full draft JSON body (media ids shown as placeholders like
 * `<upload:demo-1x1.mp4>`), assert both video files exist + print their sizes, make ZERO
 * network calls, and print the greppable line:
 *     PUBLISH-TYPEFULLY: mode=dry-run posts=x:5,threads:1 media=2
 *
 * LIVE (TYPEFULLY_LIVE=1): upload the two videos via the presigned flow, then create the draft
 * with the real media ids. This path is for the PARENT session to run — it actually spends a
 * live Typefully call. The dry-run path makes none.
 *
 * Run:
 *   npm run smoke:publish-typefully        (dry-run, zero network)
 *   npm run smoke:publish-typefully:live   (LIVE — parent only)
 *
 * social_set_id from env TYPEFULLY_SOCIAL_SET_ID (default 312308).
 */

import * as fs from "fs";
import * as path from "path";

import {
  TypefullyClient,
  type CreateDraftBody,
  type DraftPost,
} from "../adapters/typefully";

// ── Sources ────────────────────────────────────────────────────────────

/**
 * The gitignored out/ artifacts live in the PRIMARY checkout, not in a worktree. Resolve them
 * from the primary repo root. Default to this machine's primary clone; override with
 * $CONTENT_PIPELINE_PRIMARY for portability.
 */
const PRIMARY_ROOT =
  process.env.CONTENT_PIPELINE_PRIMARY ?? "/Users/ansonlam/coding_projects/content-pipeline";

const X_THREAD_JSON = path.join(PRIMARY_ROOT, "out", "copy", "lfah-launch-content.json");
const DEMO_DIR = path.join(PRIMARY_ROOT, "out", "review", "lfah", "demo-multi-aspect");
const DEMO_1X1 = path.join(DEMO_DIR, "demo-1x1.mp4"); // X tweet[0]
const DEMO_4X5 = path.join(DEMO_DIR, "demo-4x5.mp4"); // Threads post

const SOCIAL_SET_ID = process.env.TYPEFULLY_SOCIAL_SET_ID ?? "312308";
const DRAFT_TITLE = "lfah launch";

/**
 * The Threads post (drafted in the brief; no Threads copy existed in the content json).
 * Public benchmark facts only — no employer brand.
 */
const THREADS_TEXT = `We moved the heavy file-editing role of an AI coding agent onto a LOCAL model — 0% cost share for the hardest-working part.

On 13 real SWE-bench Verified bugs:
• Local-first hybrid: 62% resolved, $15.7
• Full-cloud relay: 77%, $35.0

55% cheaper on the same chain, graded by the real SWE-bench Docker oracle — not an LLM judge.

Try it: pip install git+https://github.com/ziyilam3999/local-first-agent-harness`;

// ── Helpers ────────────────────────────────────────────────────────────

function readXThread(): string[] {
  const raw = fs.readFileSync(X_THREAD_JSON, "utf8");
  const json = JSON.parse(raw) as { x_thread?: unknown };
  const arr = json.x_thread;
  if (!Array.isArray(arr) || arr.length !== 5 || !arr.every((s) => typeof s === "string")) {
    throw new Error(`expected x_thread to be 5 strings in ${X_THREAD_JSON}, got ${JSON.stringify(arr)?.slice(0, 120)}`);
  }
  return arr as string[];
}

function assertFile(label: string, p: string): number {
  if (!fs.existsSync(p)) {
    throw new Error(`SMOKE FAIL: missing ${label} video at ${p} (run the demo-multi smoke first in the primary checkout)`);
  }
  return fs.statSync(p).size;
}

/**
 * Build the draft body. `x1x1Media` / `t4x5Media` are the media-id strings to embed; in
 * dry-run these are placeholders, in live they're the real uploaded media ids.
 */
function buildDraftBody(xThread: string[], x1x1Media: string, t4x5Media: string): CreateDraftBody {
  const xPosts: DraftPost[] = xThread.map((text, i) =>
    i === 0 ? { text, media_ids: [x1x1Media] } : { text },
  );
  const threadsPosts: DraftPost[] = [{ text: THREADS_TEXT, media_ids: [t4x5Media] }];

  // NOTE: publish_at is intentionally omitted ⇒ Typefully saves this as a DRAFT.
  return {
    platforms: {
      x: { enabled: true, posts: xPosts },
      threads: { enabled: true, posts: threadsPosts },
    },
    draft_title: DRAFT_TITLE,
    share: false,
  };
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const live = process.env.TYPEFULLY_LIVE === "1";
  const xThread = readXThread();

  // Assert both videos exist + print sizes (both modes — they're what we'd upload).
  const size1x1 = assertFile("demo-1x1 (X tweet 1)", DEMO_1X1);
  const size4x5 = assertFile("demo-4x5 (Threads)", DEMO_4X5);
  console.log("media files to upload:");
  console.log(`  • ${DEMO_1X1}  (${(size1x1 / 1024 / 1024).toFixed(2)} MB) → X tweet[0]`);
  console.log(`  • ${DEMO_4X5}  (${(size4x5 / 1024 / 1024).toFixed(2)} MB) → Threads post`);

  if (!live) {
    // DRY-RUN: print the exact draft body with placeholder media ids; ZERO network calls.
    const body = buildDraftBody(xThread, "<upload:demo-1x1.mp4>", "<upload:demo-4x5.mp4>");
    console.log(`\nsocial_set_id: ${SOCIAL_SET_ID}`);
    console.log("draft body (DRY-RUN — placeholders for media ids, no publish_at ⇒ DRAFT):");
    console.log(JSON.stringify(body, null, 2));

    const xCount = body.platforms.x?.posts.length ?? 0;
    const tCount = body.platforms.threads?.posts.length ?? 0;
    console.log(
      `\nPUBLISH-TYPEFULLY: mode=dry-run posts=x:${xCount},threads:${tCount} media=2`,
    );
    process.exit(0);
  }

  // LIVE — parent session only. Real upload + draft create.
  console.log("\n→ LIVE mode: verifying auth, uploading media, creating the draft…");
  const client = new TypefullyClient();
  await client.verifyAuth();

  const media1x1 = await client.uploadMedia(SOCIAL_SET_ID, DEMO_1X1);
  const media4x5 = await client.uploadMedia(SOCIAL_SET_ID, DEMO_4X5);

  const body = buildDraftBody(xThread, media1x1, media4x5);
  const res = await client.createDraft(SOCIAL_SET_ID, body);
  console.log(`\nPUBLISH-TYPEFULLY: mode=live draft_id=${res.id} status=${res.status} posts=x:5,threads:1 media=2`);
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
