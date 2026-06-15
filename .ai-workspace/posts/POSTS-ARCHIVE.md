# Launch Posts Archive

Persistent record of every promo post produced by content-pipeline — copy, live URLs, media, numbers —
so any post can later be re-purposed for another platform (e.g. LinkedIn) without reconstructing it.

> WHY this file exists: the canonical copy text lives only in `content-pipeline/out/copy/*.json`, which is
> **gitignored** (a `git clean` would delete it). This archive is the durable home. It is produced
> AUTOMATICALLY by the pipeline (`publish/postArchive.ts` — every post is archived on assembly/publish),
> reconciling the original hand-made archive.

## Categories
- **Product INTRODUCTION** — explain what it is: value prop, real numbers, explainer animation.
- **Product DEMONSTRATION** — show it in action: real screen-capture + narrated play-by-play.

> This file is GENERATED from the `*.meta.json` records in this directory — do not hand-edit; edits are
> overwritten on the next archive. Change the source in `publish/postArchive.ts` (ARCHIVE_POSTS) instead.

Last updated: 2026-06-15

---

## Post #1 — lfah is a BUG-FIXER  (INTRODUCTION)
- **Subject:** local-first-agent-harness fixes real SWE-bench bugs cheaply (local-first, cloud-rescue).
- **Produced:** 2026-06-10
- **Published:** 2026-06-10 (LIVE).
- **Live URLs:** X https://x.com/anson3999/status/2064573597633728583 · Threads https://www.threads.com/@gotextrameal/post/DZZJUkrCkw
- **Copy:** `post1-lfah-bugfixer-copy.json` (this dir)
- **Media bundle:** `~/coding_projects/_launch-assets/lfah-20260610/`
- **Publish manifest:** `content-pipeline/publish/manifests/lfah-post1.publish-manifest.json`
- **Numbers:** 13 SWE-bench Verified bugs; hybrid 62% ($15.7) vs full-cloud 77% ($35.0); 55% cheaper; real Docker oracle.
- **Note:** the live X thread published OUT OF ORDER (5 tweets same second + heavy video on t1) — operator CLOSED, no repost. Square-vs-9:16 hero bug fixed for future posts (#794).

## Post #2 — lfah is a BUILDER  (INTRODUCTION)
- **Subject:** lfah doesn't just fix bugs — it builds whole apps test-first; proof = content-pipeline was built BY lfah.
- **Produced:** 2026-06-11
- **Published:** 2026-06-11 (LIVE).
- **Live URLs:** X https://x.com/anson3999/status/2064861439471636632 · Threads https://www.threads.com/@gotextrameal/post/DZbMNpElIzu
- **Copy:** `post2-lfah-builder-copy.json` (this dir)
- **Media bundle:** `~/coding_projects/_launch-assets/lfah-post2-20260610/`
- **Publish manifest:** `content-pipeline/publish/manifests/lfah-post2.publish-manifest.json`
- **Numbers:** 13 build phases, all shipped; ~85% solved by free local model; $12.56 total cloud; cloud rescued bp2+bp5.

## Post #3 — forge-harness ("only 1 of 8 talks to the model")  (INTRODUCTION)
- **Subject:** 8 composable MCP primitives, only 1 ever calls the LLM; deterministic verdicts; a real 13-story project's whole plan ~$0.80.
- **Produced:** 2026-06-11
- **Published:** 2026-06-11 (LIVE).
- **Live URLs:** Threads https://www.threads.com/@gotextrameal/post/DZcUScDAIy3
- **Copy:** `post3-forge-harness-copy.json` (this dir)
- **Media bundle:** `~/coding_projects/_launch-assets/forge-harness-post3-20260611/`
- **Publish manifest:** `content-pipeline/publish/manifests/forge-harness-post3.publish-manifest.json`
- **Numbers:** 8 primitives / 1 LLM tool; 16 calls / 2 paid; $0.80 plan / ~$0.20 story; MIT, public.
- **Note:** X thread is LIVE (operator published 2026-06-11) but its exact status URL was not captured (the Typefully draft was deleted post-publish); Threads read-back verified.

## Post #4 — content-pipeline — a content tool with no buttons  (DEMONSTRATION)
- **Subject:** content-pipeline has no UI — you ask Claude Code in plain English and the AI agent builds the whole post (copy, card, captioned video in 3 shapes); a built-in checker flags any claim that doesn't match your facts. MIT, open-source.
- **Produced:** 2026-06-13
- **Published:** _(pending publish)_
- **Live URLs:** _(pending publish)_
- **Copy:** `post4-content-pipeline-demo-copy.json` (this dir)
- **Media bundle:** `~/coding_projects/_launch-assets/content-pipeline-demo-post4-20260613/`
- **Publish manifest:** `content-pipeline/publish/manifests/content-pipeline-demo-post4.publish-manifest.json`
- **Numbers:** no UI / agent-operated; 1 plain-English ask → copy + card + captioned video in 3 shapes; MIT, public.
- **Note:** LIVE Typefully DRAFT created 2026-06-13 (#824) — draft_id=9494173, social_set=312308, video-hook + card-body (X 4-tweet thread: hero video + cards A/B/C; Threads: hero video + card A). NOT yet published — DRAFT ONLY; operator does the final manual Publish. publishedDate/liveUrls fill on a post-publish read-back.

## Post #4 — content-pipeline (a tool with no buttons — you just ask, the agent builds)  (DEMONSTRATION)
- **Subject:** An agent-operated content tool with no human UI: ask Claude Code in plain English and the AI agent drives it to produce copy + an image card + a captioned video in 3 shapes; built-in checker flags claims that don't match your facts.
- **Produced:** 2026-06-13
- **Published:** _(pending publish)_
- **Live URLs:** _(pending publish)_
- **Copy:** `post4-content-pipeline-demo-copy.json` (this dir)
- **Publish manifest:** `content-pipeline/publish/manifests/content-pipeline-post4.publish-manifest.json`
- **Numbers:** no metrics claimed (qualitative demo post); 1 plain-English ask → copy + image card + captioned video in 3 shapes; open-source, MIT licensed, free to use (LICENSE added #824), public on GitHub.
- **Note:** DEMONSTRATION post (video-led; 85s voiced Fable demo is the hero). 'open-source / MIT / free to use' framing REINSTATED + now coherent with the video CTA beat: content-pipeline IS MIT-licensed (#824 — LICENSE file added, package.json license='MIT', README 'MIT licensed — open-source and free to use'), repo public on GitHub (gh visibility=PUBLIC). Video needs NO re-render — its MIT claim is now honest. Not yet published. PostSlug/POST_ASSETS publish-SSOT entry deferred to the publish leg (copy leg writes the archive artifacts only).

## Post #5 — the 3-role development model — nobody grades their own homework  (INTRODUCTION)
- **Subject:** a way to build software with AI where four subagents each do one job (planner → plan-review → executor → execution-review) and nobody reviews their own work; two knobs pick the shape per task; mechanically enforced by hooks + a forgery-resistant role-ledger. MIT, public Claude Code plugin.
- **Produced:** 2026-06-14
- **Published:** 2026-06-14 (LIVE).
- **Live URLs:** X https://x.com/anson3999/status/2066109505214316797 · Threads https://www.threads.com/@gotextrameal/post/DZkDx0KARAl
- **Copy:** `post5-three-role-model-copy.json` (this dir)
- **Media bundle:** `~/coding_projects/_launch-assets/three-role-model-post5-20260614/`
- **Publish manifest:** `content-pipeline/publish/manifests/three-role-model-post5.publish-manifest.json`
- **Numbers:** 4 roles / 2 knobs (4 executor-placements / 3 evaluators); roles bound to real transcripts via a forgery-resistant ledger; MIT, public.
- **Note:** INTRODUCTION post — the ~90s voiced demo IS the hero (video-hook + card-body). X = 4-tweet thread (tweet 1 hero video; tweets 2-4 body cards A/B/C); Threads = single video-led mixed post (hero video + card A). Workflow/methodology — ZERO efficacy numbers claimed, only structural counts. All gate-clean (#810 provenance / #809-#827 length / #797 fidelity all PASS).

## Post #6 — forge-harness — your tests decide what ships  (DEMONSTRATION)
- **Subject:** a DEMONSTRATION of forge-harness's real dashboard: a story hits Retry when a check fails, shows which one, then slides to Done after the fix; 8 building blocks, only one calls the model; $0 out of pocket on a Max plan. MIT, public.
- **Produced:** 2026-06-15
- **Published:** 2026-06-15 (LIVE).
- **Live URLs:** _(pending publish)_
- **Copy:** `forge-demo-871-copy.json` (this dir)
- **Media bundle:** `~/coding_projects/_launch-assets/forge-demo-871-20260615/`
- **Publish manifest:** `content-pipeline/publish/manifests/forge-demo-871.publish-manifest.json`
- **Numbers:** 96% don't fully trust AI code / 48% verify (Sonar 2026, external); 8 blocks / 1 calls the model; Retry→Done; $0 out of pocket on Max; MIT, public.
- **Note:** DEMONSTRATION post — the ~88s voiced cut IS the hero (video-hook + card-body). X = 4-tweet thread (tweet 1 hero video; tweets 2-4 body cards A/B/C); Threads = single video-led mixed post (hero video + card A). 96%/48% are EXTERNAL industry stats (Sonar State of Code 2026), shown with a source chip — NOT a forge metric. All gate-clean (#810 provenance / #809-#827 length / #797 fidelity all PASS).

---

## LinkedIn re-purpose readiness
For each post the durable inputs exist: full copy JSON (X thread + Threads variants + video narration
scenes + card labels + number_verification), the media bundle, the cards, and the art base. A LinkedIn
variant would reuse the numbers + honesty guards verbatim and re-flow the X-thread copy into a single
longer-form post — copy re-flow, not a rebuild. Posting to LinkedIn is a DEFERRED operator decision.
