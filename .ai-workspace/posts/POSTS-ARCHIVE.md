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

Last updated: 2026-06-20

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
- **Subject:** a DEMONSTRATION of forge-harness: shape the work with forge's /prd skill, decompose it with forge_plan into binary pass-or-fail checks, run it with forge_evaluate (your real shell commands), then watch the real dashboard — a story hits Retry when a check fails (you see which one), then slides to Done. The model planned; your tests judged. $0 out of pocket on a Max plan. MIT, public.
- **Produced:** 2026-06-15
- **Published:** 2026-06-15 (LIVE).
- **Live URLs:** X https://x.com/anson3999/status/2066504718961303678 · Threads https://www.threads.com/@gotextrameal/post/DZm3e6XjgJA
- **Copy:** `forge-demo-871-copy.json` (this dir)
- **Media bundle:** `~/coding_projects/_launch-assets/forge-demo-871-20260615/`
- **Publish manifest:** `content-pipeline/publish/manifests/forge-demo-871.publish-manifest.json`
- **Numbers:** 96% don't fully trust AI code / 48% verify (Sonar State of Code 2026, external); /prd writes the spec, forge_plan splits it into binary pass-or-fail checks, forge_evaluate runs your real shell commands; Retry→Done; $0 out of pocket on Max; MIT, public.
- **Note:** DEMONSTRATION post — REVISED 2026-06-15 (#927-rev) so the copy is COHERENT with the new video storyboard (R1-R5 + #944 VO sync): the ~94s voiced cut IS the hero (video-hook + card-body). X = 4-tweet thread (tweet 1 hero video; tweets 2-4 body cards A/B/C); Threads = single video-led mixed post (hero video + card A). New live draft 9517372 (created 2026-06-15) SUPERSEDED the stale draft 9510567 (deleted, was unpublished). PUBLISHED LIVE 2026-06-15T12:55:05Z (#926 read-back): X https://x.com/anson3999/status/2066504718961303678 + Threads https://www.threads.com/@gotextrameal/post/DZm3e6XjgJA; stored-order=OK; live-per-tweet-order UNVERIFIED (needs X API). 96%/48% are EXTERNAL industry stats (Sonar State of Code 2026), shown with a source chip — NOT a forge metric. All gate-clean (#810 provenance / #809-#827 length / #797 fidelity / #867 eyeball all PASS).

## Post #7 — ui-evolve — I caught my AI design tool's judge rewarding emptiness  (DEMONSTRATION)
- **Subject:** a DEMONSTRATION of ui-evolve (a Claude Code skill that validates every UI change with objective metrics AND a vision-judge): I caught its own taste-judge scoring a near-empty page ABOVE a clean one, rebuilt the judge (11 dimensions, 5 structural, scored on a band that peaks in the middle — you can't win by being empty or cluttered), then proved the fix BLIND on 6 real screenshots (old generic site 4.8, three redesigns 7.7, 6/6 correct). MIT, public, early.
- **Produced:** 2026-06-19
- **Published:** 2026-06-19 (LIVE).
- **Live URLs:** _(pending publish)_
- **Copy:** `ui-evolve-content-copy.json` (this dir)
- **Media bundle:** `~/coding_projects/_launch-assets/ui-evolve-20260619/`
- **Publish manifest:** `content-pipeline/publish/manifests/ui-evolve.publish-manifest.json`
- **Numbers:** OLD 6-dim judge (0-100): near-empty 87.1 > clean 83.1 (the inversion). NEW 11-dim judge (0-10, 5 structural): generic 4.8 → three redesigns 7.7 each; blind 6/6 correct; structural separation bad 3.4-4.4 vs round-6 7.4-7.8. MIT, public.
- **Note:** DEMONSTRATION post — the ~110s voiced+subtitled cut IS the hero. X = 6-tweet thread (tweet 1 hero video; tweets 2-4 body cards A/B/C; tweet 5 before/after hero still; tweet 6 CTA trio still) so every worded tweet carries media (#792). Threads = single video-led mixed post (hero video + card C). TWO SCALES guarded: 83.1/87.1 = OLD 6-dim 0-100; 4.8/7.7 = NEW 11-dim 0-10 — never conflated. Before/after screenshots are the operator's OWN already-public résumé (design-led, no employer-brand token, name as-is per clearance). Custom Playwright+ffmpeg toolchain (off the Remotion harness) → routed through #810 provenance / #809 length / #797 fidelity / #867 eyeball gates explicitly.

## Post #8 — agent-kanban — watch your AI agent work, live on a board  (DEMONSTRATION)
- **Subject:** a DEMONSTRATION of agent-kanban (a real-time Kanban board for AI-agent work): your agent plans, codes, and reviews its own work and you watch it move across Plan → Code → Review columns; a green ● WORKING heartbeat shows which ticket is in focus right now; tap any ticket for the deep timeline (every step the agent took + its own review verdict, replayed); idle-vs-active reads at a glance. Open-source, MIT.
- **Produced:** 2026-06-20
- **Published:** 2026-06-20 (LIVE).
- **Live URLs:** _(pending publish)_
- **Copy:** `agent-kanban-demo-copy.json` (this dir)
- **Media bundle:** `~/coding_projects/_launch-assets/agent-kanban-demo-20260620/`
- **Publish manifest:** `content-pipeline/publish/manifests/agent-kanban-demo.publish-manifest.json`
- **Numbers:** 3-role loop as Kanban columns (Plan → Code → Review); green ● WORKING heartbeat shows the in-focus ticket; deep timeline = every step + the agent's own review verdict; idle-vs-active at a glance; MIT, public. No efficacy metrics claimed — structural/feature description only.
- **Note:** DEMONSTRATION post — the voiced 9:16 kanban demo cut IS the hero (video-hook + card-body). X = 5-tweet thread (tweet 1 hero video; tweets 2-5 branded body cards A/B/C/D) so every worded tweet carries media (#792). Threads = single video-led mixed post (hero video + 4:5 card-over-art infographic). Body cards render over the pipeline's deterministic DARK brand radial-gradient (SAFE, $0 — no nano-banana art gen; the :paid card variant would add nano-banana art like prior posts). All gate-clean (#810 provenance / #809-#827 length / #797 fidelity all PASS). DRY-RUN only — no live publish.

---

## LinkedIn re-purpose readiness
For each post the durable inputs exist: full copy JSON (X thread + Threads variants + video narration
scenes + card labels + number_verification), the media bundle, the cards, and the art base. A LinkedIn
variant would reuse the numbers + honesty guards verbatim and re-flow the X-thread copy into a single
longer-form post — copy re-flow, not a rebuild. Posting to LinkedIn is a DEFERRED operator decision.
