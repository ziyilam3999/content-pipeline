/**
 * Publish-to-YouTube smoke (YouTube SHORTS) for all 8 launch posts. Mirrors the Typefully publish
 * smokes' dry-run-vs-:live structure.
 *
 * DRY-RUN (default): for each of the 8 posts, resolve the 9:16 hero video from its durable launch
 * BUNDLE dir (POST_ASSETS[slug].defaultBundleDir + the hero-video basename — the same SSOT the
 * Typefully path reads), BUILD + VALIDATE the YouTube metadata (title ≤100, description ≤5000, tags
 * ≤500), and PRINT what WOULD upload — slug, video path + size, title, description char count, privacy.
 * Makes ZERO network calls (no YouTubeClient is constructed). A missing hero video is FLAGGED (not a
 * hard fail) so the dry-run still validates every post's metadata.
 *
 * LIVE (YOUTUBE_LIVE=1): construct the real YouTubeClient, verifyAuth() (refresh the access token),
 * then uploadVideo() each post's hero with its validated metadata. This path is for the ORCHESTRATOR to
 * run AFTER explicit operator authorization — it actually spends live YouTube API quota and PUBLISHES.
 * It is NOT exercised by `npm run smoke:publish-youtube`.
 *
 * Auth (LIVE only): OAuth2 refresh-token flow. The three secrets are read at runtime, env-first then a
 * single macOS Keychain lookup keyed on the env-var name:
 *   YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN
 * privacyStatus from $YOUTUBE_PRIVACY (default "public"); selfDeclaredMadeForKids is always false.
 *
 * Run:
 *   npm run smoke:publish-youtube         (dry-run, zero network)
 *   npm run smoke:publish-youtube:live    (LIVE — orchestrator only, post operator go)
 */

import * as fs from "fs";
import * as path from "path";

import { YouTubeClient } from "../adapters/youtube";
import {
  YOUTUBE_POST_ORDER,
  YOUTUBE_POSTS,
  buildYouTubeMetadata,
  assertYouTubeMetadataValid,
  resolvePrivacyStatus,
  toInsertResource,
  heroVideoPath,
  tagsTotalChars,
  type YouTubeMetadata,
} from "../publish/youtubePosts";
import { enforceShortClassification, requireHeroEyeballAck } from "../publish/youtubeHeroGuards";
import { probeVideoGeometry } from "../video/renderProbe";
import type { PostSlug } from "../publish/publishAssets";

interface ResolvedPost {
  slug: PostSlug;
  videoPath: string;
  videoExists: boolean;
  videoBytes: number;
  meta: YouTubeMetadata;
}

/** Build + validate the metadata and resolve the hero video for one post. */
function resolvePost(slug: PostSlug): ResolvedPost {
  const meta = buildYouTubeMetadata(slug);
  assertYouTubeMetadataValid(meta); // throws on any limit violation
  const videoPath = heroVideoPath(slug);
  const videoExists = fs.existsSync(videoPath);
  const videoBytes = videoExists ? fs.statSync(videoPath).size : 0;
  return { slug, videoPath, videoExists, videoBytes, meta };
}

/**
 * Both-ends validation self-check (runs in dry-run): a deliberately over-101-char title MUST be
 * rejected by assertYouTubeMetadataValid. Proves the gate fails on bad input, not just passes on good.
 */
function assertValidatorRejectsTooLongTitle(): void {
  const bad: YouTubeMetadata = {
    title: "x".repeat(101),
    description: "ok",
    tags: [],
    categoryId: "28",
    defaultLanguage: "en",
    privacyStatus: "public",
    selfDeclaredMadeForKids: false,
  };
  let threw = false;
  try {
    assertYouTubeMetadataValid(bad);
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error("VALIDATION both-ends FAIL: a 101-char title was NOT rejected by the validator");
  }
}

/**
 * #1162 — for a present hero, probe its geometry and run the Short-classification guard. Probe failure
 * is a WARN (never crashes the metadata dry-run). Runs in BOTH dry-run and live.
 */
function runShortClassificationGuard(p: ResolvedPost): void {
  if (!p.videoExists) return;
  let geo;
  try {
    geo = probeVideoGeometry(p.videoPath);
  } catch (err) {
    console.warn(
      `⚠️  ${p.slug}: could not probe hero geometry for the Short-classification check ` +
        `(${err instanceof Error ? err.message : String(err)}) — skipping that check.`,
    );
    return;
  }
  enforceShortClassification(p.slug, YOUTUBE_POSTS[p.slug].format, geo);
}

async function main() {
  const live = process.env.YOUTUBE_LIVE === "1";
  const privacy = resolvePrivacyStatus();

  console.log(`YouTube SHORTS publish assembly — ${YOUTUBE_POST_ORDER.length} launch posts\n`);
  console.log(`privacyStatus=${privacy} (env YOUTUBE_PRIVACY), selfDeclaredMadeForKids=false, categoryId=28\n`);

  // Both-ends: prove the validator rejects an over-limit title (good input passes per-post below).
  assertValidatorRejectsTooLongTitle();
  console.log("VALIDATION both-ends: PASS — a 101-char title is correctly rejected ✓\n");

  const resolved = YOUTUBE_POST_ORDER.map(resolvePost);
  const missing: ResolvedPost[] = [];

  for (const p of resolved) {
    if (!p.videoExists) missing.push(p);
    const sizeStr = p.videoExists ? `${(p.videoBytes / 1024 / 1024).toFixed(2)} MB` : "MISSING";
    console.log(`── ${p.slug} ──`);
    console.log(`  video:   ${p.videoPath}  (${sizeStr})`);
    console.log(`  title:   ${p.meta.title}  (${p.meta.title.length} chars)`);
    console.log(`  desc:    ${p.meta.description.length} chars`);
    console.log(`  tags:    ${p.meta.tags.length} tags, ${tagsTotalChars(p.meta.tags)} chars`);
    console.log(`  privacy: ${p.meta.privacyStatus}  madeForKids=${p.meta.selfDeclaredMadeForKids}`);
    console.log("");
    // #1162 — warn (or fail on env) if a regular post's hero will be auto-classified as a Short.
    runShortClassificationGuard(p);
  }

  if (missing.length) {
    console.log(
      `⚠️  ${missing.length}/${resolved.length} hero video(s) MISSING from the launch bundle ` +
        `(metadata still validated; cannot upload until rendered+placed):`,
    );
    for (const m of missing) console.log(`     • ${m.slug} → ${m.videoPath}`);
    console.log("");
  }

  if (!live) {
    // DRY-RUN: print the exact insert resource for one representative post, make ZERO network calls.
    const sample = resolved[0];
    console.log(`sample videos.insert resource (DRY-RUN — ${sample.slug}, no network):`);
    console.log(JSON.stringify(toInsertResource(sample.meta), null, 2));
    // #1163 — dry-run: WARN for any present hero whose exact bytes have no eyeball-ack (live BLOCKS).
    // No ackRoot → reads the real #867 ack root (<cwd>/.ai-workspace).
    for (const p of resolved) {
      if (p.videoExists) requireHeroEyeballAck(p.videoPath, { live: false, label: p.slug });
    }
    console.log(
      `\nPUBLISH-YOUTUBE: mode=dry-run posts=${resolved.length} videos_present=${resolved.length - missing.length} ` +
        `videos_missing=${missing.length} privacy=${privacy}`,
    );
    process.exit(0);
  }

  // LIVE — ORCHESTRATOR ONLY, after explicit operator authorization. Real auth + upload.
  // (NOT exercised by the dry-run smoke; wired here so the path exists.)
  //
  // Three incremental-safety controls so the FIRST live action is the cheapest possible and the
  // batch can be done one outward call at a time (per the operator's per-upload-go constraint):
  //   YOUTUBE_VERIFY_ONLY=1   → run verifyAuth() then EXIT (proves OAuth works; uploads NOTHING)
  //   YOUTUBE_ONLY=<slug>     → upload exactly ONE post (e.g. a single first video before the rest)
  //   YOUTUBE_UPLOAD_DELAY_MS → milliseconds to wait between uploads (space out if the channel throttles)
  const verifyOnly = process.env.YOUTUBE_VERIFY_ONLY === "1";
  const onlySlug = (process.env.YOUTUBE_ONLY ?? "").trim();
  const uploadDelayMs = Number(process.env.YOUTUBE_UPLOAD_DELAY_MS ?? "0") || 0;

  if (onlySlug && !YOUTUBE_POST_ORDER.includes(onlySlug as PostSlug)) {
    throw new Error(
      `YOUTUBE_ONLY="${onlySlug}" is not a known post slug. Valid: ${YOUTUBE_POST_ORDER.join(", ")}`,
    );
  }

  console.log("\n→ LIVE mode: verifying auth…");
  const client = new YouTubeClient();
  await client.verifyAuth();
  console.log("  ✓ verifyAuth OK — refresh token is valid, access token acquired.");

  if (verifyOnly) {
    console.log("\nYOUTUBE_VERIFY_ONLY=1 — auth confirmed, NO upload performed. Exiting.");
    console.log(`PUBLISH-YOUTUBE: mode=live-verify-only posts=0 privacy=${privacy}`);
    process.exit(0);
  }

  const toUpload = onlySlug ? resolved.filter((p) => p.slug === onlySlug) : resolved;
  console.log(
    onlySlug
      ? `\n→ Uploading ONLY "${onlySlug}" (YOUTUBE_ONLY)…`
      : `\n→ Uploading all ${toUpload.length} Shorts${uploadDelayMs ? ` (${uploadDelayMs}ms between)` : ""}…`,
  );
  let uploaded = 0;
  for (let i = 0; i < toUpload.length; i++) {
    const p = toUpload[i];
    if (!p.videoExists) {
      console.warn(`  SKIP ${p.slug}: hero video missing at ${p.videoPath}`);
      continue;
    }
    if (uploadDelayMs && i > 0) await new Promise((r) => setTimeout(r, uploadDelayMs));
    // #1163 — LIVE: BLOCK the upload unless an eyeball-ack exists for THIS hero's exact bytes.
    // No ackRoot → reads the real #867 ack root (<cwd>/.ai-workspace).
    requireHeroEyeballAck(p.videoPath, { live: true, label: p.slug });
    const videoId = await client.uploadVideo({
      filePath: p.videoPath,
      metadata: toInsertResource(p.meta),
    });
    uploaded++;
    console.log(`  uploaded ${p.slug} → videoId=${videoId} (https://youtube.com/shorts/${videoId})`);
  }
  console.log(`\nPUBLISH-YOUTUBE: mode=live posts=${uploaded} privacy=${privacy}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
