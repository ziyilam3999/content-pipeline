# Changelog

All notable changes to content-pipeline are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Conventional Commits](https://www.conventionalcommits.org/). The `/ship`
release step (Stage 7) pulls the section for a tag `vX.Y.Z` out of this file as
the GitHub Release notes, so this changelog is the single source of truth for
"what changed".

## [0.7.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.6.0...v0.7.0) (2026-06-10)

### Features

* **publish:** Post #2 ("lfah is a BUILDER") dry-run publish assembly — a sibling smoke (`smoke/publish-typefully-post2.ts`) that assembles the 4-tweet X thread (hook=`builder-demo-9x16.mp4` 9:16 hero video, t2-t4 = `card-post2-{A,B,C}.png`) + the Threads mixed post ([9:16 video lead, card A]) and proves the layout passes the consolidated #797 `assertPostAssemblyFidelity` gate in DRY-RUN. Reuses the same gate (no forked logic); hero=9:16 everywhere (`CONFIG.publish.heroVideoAspect`). Emits `FIDELITY: PASS` + `PUBLISH-TYPEFULLY-POST2: mode=dry-run posts=x:4,threads:1 media=6`, makes ZERO network calls (no Typefully client constructed in dry-run), and the LIVE path stays gated behind `TYPEFULLY_LIVE`. Adds a Post #2 assembly unit test asserting the gate passes and that the #792/#793/#794 regression forms throw ([#53](https://github.com/ziyilam3999/content-pipeline/pull/53))

## [0.6.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.5.0...v0.6.0) (2026-06-10)

### Features

* **video:** Post #2 builder demo — "lfah builds an app, test-first" — a NEW 8-scene animated demo distinct from Post #1's 4-way comparison, rendered in 3 frame-filling aspects (1:1 / 9:16 full-bleed / 4:5) with an Adam male voiceover, captions, and scene transitions driven by the REAL audio alignment (provenance-bound). Parallel builder modules reuse all shared render infrastructure and the single-sourced narration-sync algorithm (no divergent copies); the pinned 6-scene Post #1 CI gate is untouched and a new 8-scene sync/parity integration test is a CI gate. Numbers verbatim from the dogfood metrics ([#50](https://github.com/ziyilam3999/content-pipeline/pull/50))
* **launch:** Post #2 "lfah is a BUILDER" card-over-art SET — three X-aspect (1:1) infographics (`card-post2-A/B/C.png`) for the dogfood/build story, reusing the cached nano-banana art (zero paid spend) and the #790 auto-fit card machinery (no composition fork). Card words are verbatim from the number-verified `card_labels`, carried into the repo as a committed fixture so CI works without the gitignored authored source ([#49](https://github.com/ziyilam3999/content-pipeline/pull/49))

## [0.5.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.4.10...v0.5.0) (2026-06-10)

### Features

* **publish:** consolidate publish-assembly fidelity checks into one `assertPostAssemblyFidelity` gate so a caller can never forget one — funnels video-leads + per-unit cards + no-mixing (#792), hero-aspect (#794), and submitted-order-intent (#793) into a single call ([#47](https://github.com/ziyilam3999/content-pipeline/pull/47))

## [0.4.10](https://github.com/ziyilam3999/content-pipeline/compare/v0.4.9...v0.4.10) (2026-06-10)

### Bug Fixes

* **publish:** lead with the 9:16 full-bleed hero video everywhere (#794) ([#45](https://github.com/ziyilam3999/content-pipeline/pull/45))

## [0.4.9](https://github.com/ziyilam3999/content-pipeline/compare/v0.4.8...v0.4.9) (2026-06-10)

### Features

* **publish:** every platform's primary worded post leads with video (#792) ([#43](https://github.com/ziyilam3999/content-pipeline/pull/43))

  Generalize the v0.4.7 X-thread SHAPE into the platform-agnostic PRINCIPLE — every platform's primary worded post LEADS WITH VIDEO (highest-attention medium) and every worded unit also carries its card-over-art infographic. Fixes the regression where the Threads launch post shipped card-only with NO video: `assertPromoMediaComplete` checked AGGREGATE (>=1 video anywhere), so the X hook video masked a video-less Threads post. Adds a per-platform gate (`PlatformPrimaryPost` + `assertPlatformPrimaryLeadsWithVideo`) requiring `media[0]` to be the video, a card when worded, and image-XOR-video on no-mix platforms; Threads now assembles as a mixed-media carousel `[demo-4x5.mp4 (lead), card-over-art-4x5.png]`.

## [0.4.8](https://github.com/ziyilam3999/content-pipeline/compare/v0.4.7...v0.4.8) (2026-06-10)

### Bug Fixes

* **image:** auto-fit card-over-art to frame + render-time overflow gate + raw-art cache (#790) (#41) — the 4:5 hero card-over-art silently clipped its bottom tile (the "cost saving vs full-cloud (same chain) 55%" punchline) because the fact tiles wrapped past the fixed-height `body` (`overflow: hidden`) with zero fit logic. `image/card.ts` gains a no-op-by-default `--fit` CSS variable the facts grid reads (font sizes, gap, padding, min-width); `buildCardHtml` stays pure so its existing tests are unchanged. `adapters/image.ts` `renderImage` now measures overflow in-page after `setContent` and progressively shrinks `--fit` (up to 12 steps, 0.5 floor) until every `.fact` tile AND the `.cta`/`.repo` footer fit inside the frame; if it still overflows at the floor it THROWS naming the count of clipping tiles (silent clip → loud failure). A new jest test (`adapters/__tests__/image-overflow.test.ts`) proves both ends: the full lfahSpec hero fits (the loop converges, all tiles incl. the 55% tile) and a deliberately-too-many-facts case throws. `smoke/launch-card.ts` adds a raw-art cache (`_art-base.png` + `_art-base.datauri.b64`) so after one paid nano-banana gen, layout re-renders are free; SAFE mode reuses the cache when present, else stays the deterministic placeholder. CI now installs Playwright Chromium so the render-path test runs. Verified UNPAID end-to-end.

## [0.4.7](https://github.com/ziyilam3999/content-pipeline/compare/v0.4.6...v0.4.7) (2026-06-10)

### Features

* **publish:** bake canonical X-launch-thread media layout as a durable rule (#789) (#39) — encode the researched best-practice X (Twitter) launch-thread media layout across the gate, the README doctrine, and the publish-typefully assembly. The canonical layout: the hook / lead tweet leads with the VIDEO (native video earns ~10x engagement and tweet 1 is the highest-impression slot); every other worded tweet carries its own infographic card-over-art still (cards best simplify body data); the CTA and any hashtags go in the last tweet; and because a single X tweet carries EITHER images OR one video — never both — no post unit may mix an image and a video. `publish/promoMedia.ts` `assertPromoMediaComplete` now enforces the canonical thread invariant: it THROWS unless (a) no worded unit is media-less, (b) ≥1 unit carries a video, (c) ≥1 unit carries a card-over-art still, (d) no unit mixes image+video. A new SOFT `checkVideoFirst` returns a boolean + warning (never throws) so callers can log that the video should lead. `PromoPostUnit` gains an optional per-unit `videos` field (a unit carries EITHER stills OR a video); the single-post `PromoMediaSet` shape stays back-compat. `smoke/publish-typefully.ts` assembles the canonical layout (tweet 1 = video hook, tweets 2-5 = per-tweet cards, Threads = full 4:5 infographic), runs `assertPromoMediaComplete` on the assembled draft, and logs the video-first soft-check; dry-run makes ZERO network calls. README doctrine block updated with the layout, the why, and 4 source URLs.

## [0.4.6](https://github.com/ziyilam3999/content-pipeline/compare/v0.4.5...v0.4.6) (2026-06-10)

### Features

* **launch:** per-tweet card-over-art infographic SET + per-post-unit promo-media gate (#787-followup) (#37) — bakes the operator rule that EVERY worded post unit carries its OWN distinct card-over-art infographic. For an X thread, EACH tweet now gets its own card-over-art ("infographic is more attractive"; a thread of bare tweets reads as incomplete), not one shared hero. `smoke/launch-card.ts` adds `launchCardSet()`, which derives one `ContentSpec` slice per worded tweet (a curated n=13 fact subset + a tweet headline) and renders `card-tweet-{1..5}.png` (1:1) plus the 4:5 Threads hero. `generateArtOnce()` generates the nano-banana background ONCE and fans the same `backgroundDataUri` behind all the distinct info-cards — one paid gen reused, not one per card; the default unpaid deterministic path keeps CI + proof at $0 (`LAUNCH_CARD_PAID=1` for the real art). The n=13 anti-stale guard is preserved per-card. `publish/promoMedia.ts` `assertPromoMediaComplete` is now PER-UNIT: given a thread it throws unless EVERY worded unit carries its own card-over-art still AND the set carries a video (a thread where only tweet 1 has a card FAILS); the single-post shape is preserved for back-compat. README doctrine note upgraded; a lost-PNG caution (paid renders land in gitignored `out/` — copy before cleaning a worktree) added.

## [0.4.5](https://github.com/ziyilam3999/content-pipeline/compare/v0.4.4...v0.4.5) (2026-06-09)

### Features

* **launch:** card-over-art promo still + promo-media completeness gate (#787) (#35) — `smoke/launch-card.ts` generates the lfah launch hero still as a card-over-art composite (real nano-banana generative background + result-card overlay) in 1:1 and 4:5, driven by the locked n=13 facts in `lfahSpec()` (13 / 54% / 62% / 77% / $15.7 / $35.0 / 55%). SAFE by default (no spend); the PAID real-art path is behind `LAUNCH_CARD_PAID=1` and makes exactly one nano-banana gen reused for both aspects. Primary-only (a failed gen throws; the key is never logged). Adds `publish/promoMedia.ts` → `assertPromoMediaComplete`, a both-ends gate that throws unless a post carries text + a card-over-art still + a video (a plain card or bare-art still does not satisfy the still requirement), with its own test and a README doctrine note. New scripts `smoke:launch-card` / `:paid`.

## [0.4.4](https://github.com/ziyilam3999/content-pipeline/compare/v0.4.3...v0.4.4) (2026-06-09)

### Features

* **publish:** real Typefully v2 posting client (Phase D, #786) (#33) — `TypefullyClient` with `verifyAuth` (GET /v2/me), `uploadMedia` (3-step presigned flow: POST init → PUT raw bytes → poll until ready), and `createDraft` (POST /v2/social-sets/{id}/drafts, `publish_at` omitted/refused so content saves as a DRAFT). Key resolved at runtime (env → macOS keychain), never logged; `fetch` injected for testability. Adds `smoke/publish-typefully.ts` (dry-run default makes zero network calls) and the `smoke:publish-typefully` / `:live` scripts.

## [0.4.3](https://github.com/ziyilam3999/content-pipeline/compare/v0.4.2...v0.4.3) (2026-06-09)

### Tests

- **video:** verify rendered MP4s via a vendored-ffmpeg probe (#784, #31). New
  `video/renderProbe.ts` resolves the ffmpeg remotion already vendors and reports
  decoded frame count, duration, and audio-stream presence — throwing (never a silent
  false-negative) when the binary is missing or output is unparseable, replacing the
  missing system `ffprobe` whose absence read identically to a real "no audio" result.
  Both render smokes now assert frame count ≈ `round(durationSec*fps)` (a truncated cut
  FAILS) and audio presence on voiced renders, printing a `RENDER-VERIFY:` line.

### Bug Fixes

- **smoke:** `smoke:demo-multi` no longer silently renders (and overwrites with) the
  free/silent cut — it defaults `DEMO_BUNDLE` to the bundle `smoke:demo-narrated` writes
  so it produces the VOICED deliverable, and prints a loud banner when it genuinely
  falls back to the free cut (#784).

## [0.4.2](https://github.com/ziyilam3999/content-pipeline/compare/v0.4.1...v0.4.2) (2026-06-09)

The animated demo gains a 6th scene — the lfah flow diagram — that SHOWS the loop
(plan → fix → grade → tests, escalate only when stuck) right after the hook, and a
matching narration segment. The voiced-duration clamp is fixed so the now-longer
narration is never truncated: a voiced render uses the real audio length while the
free/silent cut stays clamped to the 45–90s window.

### Features

- **video**: add a `pipeline` flow-diagram demo scene (#780) as the 2nd scene
  (hook → pipeline → compare → costsplit → verdict → cta). `PipelineScene` renders the
  timeline's nodes/edges as lane-colored cards (local = green with a `$0 · free` badge,
  cloud = blue, test = amber) in a top-to-bottom flow, with the `fix → cloud` edge drawn
  as a dashed "escalate — only when stuck" branch. Adds a FLOW-focused narration segment
  (1:1 with scenes) and re-tunes scene weights so HOOK-FIRST still holds across [45,90].

### Bug Fixes

- **video**: fix the duration clamp (#777) so the longer 6-scene voiced narration isn't
  truncated at 90s. `clampDemoDurationSec` gains a voiced mode — a voiced render (real
  synth → `sceneEndTimesSec` present) is floored at MIN but not capped at MAX, so the
  real audio length flows through and captions + scenes stay synced; the silent/free cut
  stays clamped to [45,90].

## [0.4.1](https://github.com/ziyilam3999/content-pipeline/compare/v0.4.0...v0.4.1) (2026-06-09)

The demo's scene-sync, caption-sync, and parity invariants are now a CI gate, so
every future video stays consistent in quality even though CI never runs a real
video render.

### Miscellaneous

- **video**: add a pure jest integration test that makes the end-to-end
  scene-sync + caption-sync + audio/sync provenance + parity pipeline a CI gate —
  mirrors the `usedRealSceneSync` smoke proof with a synthetic non-linear
  alignment (no Remotion render, CI-safe + fast); fails the build if scenes ever
  silently fall back to weight-tiling, captions go empty/non-spanning, audio and
  alignment drift apart, or the persisted sync bundle drops its source data
  (#778).

## [0.4.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.3.0...v0.4.0) (2026-06-09)

The demo video now fills every aspect ratio edge-to-edge, keeps its audio and
on-screen timing provably in step, and shows synced captions again — and agents
get a project index to find the right files fast.

### Features

- **video**: the demo now fills each aspect's frame instead of letterboxing a
  square inside a taller canvas — the 9:16 phone cut is true full-bleed, with its
  own vertical layout, type scale, and safe band (#765).
- **video**: demo content grows to fill the 9:16 frame, and a provenance guard now
  binds a voiceover's saved timing to the exact audio it was derived from — a
  mismatched audio/sync pair is rejected at render time instead of drifting (#773,
  #774).
- **video**: restored synced captions on the animated demo, timed from the TTS
  engine's real per-character timestamps, with a reserved bottom band so captions
  never cover the cards. A parity invariant makes a voiced demo with no captions
  throw, so they can never be silently dropped again, and the narration bundle now
  persists the full alignment so future caption renders are free (#775).

### Miscellaneous

- added a content-pipeline project index so agents can ground themselves at
  session start and find the few files they need for any task (#772).

## [0.3.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.2.0...v0.3.0) (2026-06-09)

The launch demo video is now a moving, honest product walkthrough whose on-screen
scenes follow the narrator, and the narration introduces the project by name and
explains why it helps.

### Features

- **video**: redesigned the demo into an honest four-way comparison (1-shot Opus,
  1-shot Sonnet, full-cloud relay, and the local-first hybrid) with a verdict that
  concedes the cloud relay's higher resolve % and recommends the local-first option
  on value (#743, #748).
- **video**: the demo's on-screen scenes now follow the narrator — each scene change
  lands on the real voiceover timing instead of a fixed timer, so the screen never
  moves ahead of what's being said (#19, #763).
- **video**: the demo narration now introduces the project by its spoken name
  ("Alpha", how "lfah" is said aloud), expands what the name stands for, and leads
  with a plain with-vs-without hook before any numbers (#764).

## [0.2.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.1.0...v0.2.0) (2026-06-09)

Captions now sync to the real voiceover audio instead of an even-time guess, and
the channel voiceover is locked to one consistent male voice.

### Features

- **voice**: lock the channel voiceover to a single male voice ("Adam") in the config single-source-of-truth, so every clip sounds like the same narrator (#761).
- **captions**: wire the real audio-to-text alignment all the way through the live pipeline run, so on-screen captions land on the words the voiceover actually says instead of an even-time split (#745, #762).

### Bug Fixes

- **captions**: validate the real-alignment final-time range so a bad alignment can't push a caption past the end of the audio (#13).

## [0.1.0](https://github.com/ziyilam3999/content-pipeline/releases/tag/v0.1.0) (2026-06-08)

Initial import. The first six build stages (config, inputs, copy, image, audio,
video) were built test-first and compose end-to-end as one project.

### Features

- **config**: settings single-source-of-truth (aspect ratios, caption band, providers).
- **inputs**: ContentSpec adapter — turns a launch spec into structured facts with scope guards.
- **copy**: factual social copy generator + a number/claim verifier guardrail.
- **image**: deterministic result-card layout (generative art optional, off by default).
- **audio**: voiceover spec — paid provider primary, free provider fallback, real clip length.
- **video**: even-split captions (phone-friendly) + render specs for three aspect ratios with a caption safe-band.

### Notes

- 9 test suites / 87 tests, all green.
- Publish (P5) and the weekly schedule (P6) are not in this import yet.
