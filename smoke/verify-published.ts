/**
 * #793 — POST-PUBLISH READ-BACK smoke. Given a published Typefully draft id, reads the LIVE draft
 * back via the Typefully GET (read-only + free), asserts it is actually published with live URLs and
 * an in-order stored X thread, prints the live URLs, and prints a greppable PUBLISH-VERIFY line.
 *
 * WHY: an outward publish is NOT verified until you READ BACK the live result — stored/submitted
 * state is not published state. Post #1 reported "published" off the submitted state alone and came
 * out scrambled on X. See feedback_verify_live_published_result_not_just_submitted_state.
 *
 * LIVE per-tweet ORDER is UNVERIFIED here, and that is HONEST — NOT faked. Typefully's GET returns
 * only the ROOT tweet URL (`x_published_url`), not the live reply ordering of the thread. Confirming
 * the live reply chain is a FOLLOW-UP that needs the X API (GET the root tweet's reply chain and
 * compare). Until then we mark `live-per-tweet-order=UNVERIFIED(needs X API)` and never assert it.
 *
 * This smoke makes ONE read-only GET against the live Typefully API — it is for MANUAL / operator use
 * (never run in CI; the unit tests in publish/__tests__/publishVerify.test.ts use fixtures, zero net).
 * It makes NO paid call.
 *
 * Run:
 *   npm run smoke:verify-published -- <draftId>
 *   (social_set_id from $TYPEFULLY_SOCIAL_SET_ID, default 312308; key via $TYPEFULLY_API_KEY / Keychain)
 *
 * Exits non-zero if status != published, a live URL is missing, or the stored order mismatches.
 */

import { readTypefullyKey, TYPEFULLY_API_BASE } from "../adapters/typefully";
import {
  assertPublishedDraftShape,
  threadLengthAdvisory,
  type FetchedDraft,
  type PublishIntent,
  type PublishIntentTweet,
} from "../publish/publishVerify";

const SOCIAL_SET_ID = process.env.TYPEFULLY_SOCIAL_SET_ID ?? "312308";

/**
 * Build the verification intent from the LIVE fetched draft itself. We only have a draftId here (not
 * the original submit record), so the stored-order check asserts the fetched draft is internally
 * well-formed: each X post carries a media id, the count is consistent, and index 0 is treated as the
 * video hero. A caller that DOES hold the original submit record (e.g. the publish smoke right after
 * createDraft) can instead pass that recorded intent for a true submit-vs-stored order comparison —
 * that is the strong form the pure assertPublishedDraftShape enables. Threads is required when the
 * fetched draft has an enabled threads block.
 */
function intentFromFetchedDraft(draft: FetchedDraft): PublishIntent {
  const xPosts = draft.platforms?.x?.posts ?? [];
  const xThread: PublishIntentTweet[] = xPosts.map((p, i) => ({
    mediaId: p.media_ids?.[0] ?? "",
    kind: i === 0 ? "video" : "card-over-art",
  }));
  const threadsEnabled = draft.platforms?.threads?.enabled === true;
  return { threadsEnabled, xThread };
}

async function main() {
  const draftId = process.argv[2];
  if (!draftId) {
    console.error("usage: npm run smoke:verify-published -- <draftId>");
    process.exit(1);
  }

  const key = readTypefullyKey();
  const url = `${TYPEFULLY_API_BASE}/social-sets/${SOCIAL_SET_ID}/drafts/${draftId}`;
  console.log(`→ reading back live draft ${draftId} (read-only GET, no paid call)…`);

  const res = await fetch(url, { method: "GET", headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`SMOKE FAIL: GET draft HTTP ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
    process.exit(1);
  }
  const draft = (await res.json()) as FetchedDraft;

  const intent = intentFromFetchedDraft(draft);
  // Throws (and we exit non-zero below via the catch) on status/URL/order mismatch.
  assertPublishedDraftShape(draft, intent);

  const xUrl = draft.x_published_url ?? "";
  const threadsUrl = draft.threads_published_url ?? "(none)";
  console.log(`status:        ${draft.status}`);
  console.log(`published_at:  ${draft.published_at ?? "(none)"}`);
  console.log(`x_url:         ${xUrl}`);
  console.log(`threads_url:   ${threadsUrl}`);

  // NON-FATAL short-thread advisory — surface same-second scramble risk for a long thread.
  const note = threadLengthAdvisory(intent.xThread.map((t) => t.mediaId));
  if (note) console.log(note);

  // Greppable verdict. LIVE per-tweet order is honestly UNVERIFIED — needs the X API (see header).
  console.log(
    `PUBLISH-VERIFY: published=true x_url=${xUrl} threads_url=${threadsUrl} ` +
      `stored-order=OK live-per-tweet-order=UNVERIFIED(needs X API)`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE FAIL (threw):", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
