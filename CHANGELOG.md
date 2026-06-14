## [0.25.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.24.0...v0.25.0) (2026-06-14)

### Features

* **post5:** three-role-model promo post (#841) — an INTRODUCTION-category post for the 3-role development model ("four AI subagents, nobody grades their own homework"; planner → plan-review → executor → execution-review). Lands the full production source: `inputs/threeRoleModelSpec.ts` ContentSpec (numbers single-sourced from the reviewed, README-claim-verified copy; abstract art prompt; honesty guards as scopeGuards — ZERO efficacy numbers, only structural counts: 4 roles / 2 knobs / 4 executor placements / 3 evaluator options), the git-tracked copy archive + POSTS-ARCHIVE entry, the Remotion demo scaffolding (`remotion/post5-index.tsx`, `video/post5{Narration,Timeline}.ts`, `adapters/video-post5.ts`, `smoke/post5-demo-*.ts`, `smoke/launch-card-post5.ts`), the Typefully publisher (`smoke/publish-typefully-post5.ts`, reusing the #797 fidelity + #810 provenance + #809/#827 length gates) with a frozen 4-asset provenance manifest, and PostSlug/POST_ASSETS/ARCHIVE_POSTS SSOT entries. `adapters/voice.ts` gains an optional, backward-compatible `voice_settings.speed` (default unchanged). Live Typefully draft created for operator review+publish ([#114](https://github.com/ziyilam3999/content-pipeline/pull/114))

## [0.24.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.23.0...v0.24.0) (2026-06-14)

### Features

* **recipe:** R12 — demonstration videos must carry real-voice-synced captions, provenance-bound to real audio (#873) (#112)

### Bug Fixes

* Provenance gate: also verify the frozen bytes field, not just sha256 (#70) (#100)

## [0.23.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.22.2...v0.23.0) (2026-06-14)

### Features

* **#870:** bake the demonstration-category video recipe into a mechanically-enforced contract — new `video/demoCategoryRecipe.ts` (`DemoVideoSpec` + `assertDemoCategoryRecipe` composing recipe rules R1–R11) + a both-ends jest suite + `fableSpec` (the shipped #824 data as the proven regression instance), wired into the `captureFable`/`voiceFable` pre-flights so any future demo-category spec that violates the recipe (generative-video spine, no hook, terminal >30%, placeholder provenance/URL, dev-token/brand/owner leak, sparse/island layout) HARD-FAILS before capture/render/paid/publish. Lifts the storyboard SSOT into `video/fableStoryboard.ts` to resolve the import cycle cleanly ([#110](https://github.com/ziyilam3999/content-pipeline/pull/110))

## [0.22.2](https://github.com/ziyilam3999/content-pipeline/compare/v0.22.1...v0.22.2) (2026-06-13)

### Bug Fixes

* **#872:** add `getDraft`/`deleteDraft` to `TypefullyClient`, reusing the Bearer auth SSOT (`authHeaders()`) so a draft read-back / stale-draft retire goes through the typed client instead of a hand-rolled raw fetch with a guessed `X-API-KEY` header (which 401s); both-ends tests assert the calls carry `Authorization: Bearer` and never `X-API-KEY` ([#108](https://github.com/ziyilam3999/content-pipeline/pull/108))

## [0.22.1](https://github.com/ziyilam3999/content-pipeline/compare/v0.22.0...v0.22.1) (2026-06-13)

### Bug Fixes

* **#824:** demo video chat beat now fills the frame (distributed rows + an honest copy/card/video deliverables checklist) and reserves the synced-caption band so the bottom rows clear the caption; baked both-ends layout gates (`assertChatBeatInteriorFill`, `assertChatContentClearsCaptionBand`) into `assertFableBeatsSafeAndFilled` ([#105](https://github.com/ziyilam3999/content-pipeline/pull/105))

## [0.22.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.21.0...v0.22.0) (2026-06-13)

### Features

* **#867:** eyeball-gate — auto contact-sheet frame extractor (`video/contactSheet.ts`) plus a fail-closed, content-hash eyeball-ack gate so a paid render / publish stays blocked until a human looks at the actual rendered pixels for those exact bytes; includes red-flag asserts and a cross-platform (Windows/Linux/macOS) test of the contact-sheet orchestration ([#103](https://github.com/ziyilam3999/content-pipeline/pull/103))

## [0.21.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.20.3...v0.21.0) (2026-06-13)

### Features

* **#824:** content-pipeline demonstration post — Fable-style agent-interface demo video (real Playwright capture of the tool running + Adam voiceover + synced captions, 3 aspects), 3 per-tweet cards over one unique abstract generative-art base, content-pipeline is now MIT-licensed (LICENSE + package.json + README), and 4 baked prevention gates: cross-layer caption-overlap (`assertNoCaptionMediaOverlap`), OCR art-text (`assertNoArtText`), real-artifact provenance (`fableProvenance`), and demonstration-hero asserts ([#101](https://github.com/ziyilam3999/content-pipeline/pull/101))

### Bug Fixes

* shared tokenizer in captions real-sync span derivation (#14) ([#65](https://github.com/ziyilam3999/content-pipeline/pull/65))
* assert reverse manifest coverage in provenance gate (#69) ([#91](https://github.com/ziyilam3999/content-pipeline/pull/91))

## [0.20.3](https://github.com/ziyilam3999/content-pipeline/compare/v0.20.2...v0.20.3) (2026-06-12)

### Bug Fixes

* **#824:** scrub OS-username leak in VHS capture beat 5 (`ls -la` → `ls -gh`) + bake owner-leak denylist test ([#98](https://github.com/ziyilam3999/content-pipeline/pull/98))

## [0.20.2](https://github.com/ziyilam3999/content-pipeline/compare/v0.20.1...v0.20.2) (2026-06-12)

### Bug Fixes

* **capture:** fix two VHS capture-harness bugs found by a live capture run (a tape-parse test cannot catch either). (A) Heavy live-render beats now carry a per-beat `settleSleepSec` so the screenshot waits for the render to finish — previously the 2s global settle snapped a half-rendered frame and starved beats 5/6/7 (their typed commands never ran). (B) Smoke stdout now prints repo-relative paths via `toRepoRelative()`, so no absolute `/Users/` or `/var/folders/` username-bearing path leaks into the captured frame. Both regress-proofed with jest tests (#824). ([#96](https://github.com/ziyilam3999/content-pipeline/pull/96))

## [0.20.1](https://github.com/ziyilam3999/content-pipeline/compare/v0.20.0...v0.20.1) (2026-06-12)

### Bug Fixes

* **jest:** fence test discovery off the emitted `dist/` tree so a `npm run build` (tsc) followed by `npm test` no longer runs the 82 emitted `*.test.js` copies as duplicate, often-failing tests. Adds `testPathIgnorePatterns` + `modulePathIgnorePatterns` for `dist/` (#833). ([#94](https://github.com/ziyilam3999/content-pipeline/pull/94))

## [0.20.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.19.0...v0.20.0) (2026-06-12)

### Features

* **capture:** add a VHS automated screen-capture harness so the demonstration video's ordered per-step screenshot frames are produced automatically (deterministic, headless, repeatable) instead of hand-recorded, feeding the v0.19.0 frame-ingest manifest. `tools/captureTape.ts` (pure `.tape` generator: one Screenshot per narration beat, mandatory trailing Sleep, pixel dims ≥120, frames-dir-prefixed Screenshot path), `tools/captureDemo.ts` (LOCAL-only runner + a `PAID_COMMANDS` denylist that refuses any tape command that would bill Claude/ElevenLabs/nano-banana — free by gate; reuses `validateFrameManifest`+`assertBrandClean`), committed brand-clean fixtures, a CI-safe logic test (no VHS/network) with regression guards for two live-VHS bugs, a `capture:demo` script, and README VHS dev-dep docs. No paid calls in this build; VHS never runs in CI (#824). ([#92](https://github.com/ziyilam3999/content-pipeline/pull/92))

## [0.19.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.18.1...v0.19.0) (2026-06-11)

### Features

* **frames:** add a typed, validated frame-ingest path so the pipeline can render an ordered set of REAL captured screenshot PNGs as the per-scene HERO of a "demonstration" video (`objectFit: contain`, never crop), reusing the existing narration scene-sync, Adam caption band, audio-sync provenance guard (#774), and multi-aspect render unchanged. Adds `inputs/frames.ts` (FrameManifest + `validateFrameManifest` parity hard-throw + `assertBrandClean` + `assertUiFrameFit`), `adapters/frames.ts` (`embedFrames`/`renderFrameCard`, reuses exported `toDataUri`), `video/demoFrameTimeline.ts`, `image/frameCard.ts`, a `demo-frames` Remotion composition, and a free silent `smoke:demo-frames`. Phases 1-4 of the demonstration category (#824). ([#89](https://github.com/ziyilam3999/content-pipeline/pull/89))

## [0.18.1](https://github.com/ziyilam3999/content-pipeline/compare/v0.18.0...v0.18.1) (2026-06-11)

### Miscellaneous

* **smoke:** dedupe the `DEMO_BG_IMAGE` bg-image path derivation into a single `resolveBgImagePath()` helper so the #817 art-bound guard and `loadBackground` can never desync, and surface the #817 shared-source guard bypass with a `console.warn` when a `DEMO_BG_IMAGE` override is active (it was correct but silent) ([#87](https://github.com/ziyilam3999/content-pipeline/pull/87))

## [0.18.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.17.0...v0.18.0) (2026-06-11)

### Features

* **archive:** mirror every post's canonical copy + index into a git-tracked in-repo archive (`.ai-workspace/posts`) so a fresh clone / CI has the canonical wording too; dual-write wrappers (`archivePostAll`/`safeArchivePostAll`) persist to both the external durable archive and the in-repo mirror, and Post #3 is reconciled to published (Threads URL read-back verified; X status URL intentionally absent) ([#85](https://github.com/ziyilam3999/content-pipeline/pull/85))

## [0.17.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.16.2...v0.17.0) (2026-06-11)

### Features

* **publish:** platform-subset publishing (`PLATFORMS` env) so a partial-publish recovery draft targets only the unpublished platform(s) — an excluded platform's block is omitted entirely, preventing a re-post of an already-live thread ([#83](https://github.com/ziyilam3999/content-pipeline/pull/83))

## [0.16.2](https://github.com/ziyilam3999/content-pipeline/compare/v0.16.1...v0.16.2) (2026-06-11)

### Bug Fixes

* **copyLimits:** count each newline as 2 chars (CRLF) in the per-platform length validator + add a CONFIG safety margin, so a multi-paragraph Threads post can't slip over-limit ([#81](https://github.com/ziyilam3999/content-pipeline/pull/81))

## [0.16.1](https://github.com/ziyilam3999/content-pipeline/compare/v0.16.0...v0.16.1) (2026-06-11)

### Bug Fixes

* **post3:** horizontal title-safe band so a full-screen tall-phone crop never clips content ([#79](https://github.com/ziyilam3999/content-pipeline/pull/79))

## [0.16.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.15.0...v0.16.0) (2026-06-11)

### Features

* auto-archive every post into the durable POSTS-ARCHIVE on publish ([#77](https://github.com/ziyilam3999/content-pipeline/pull/77))

# Changelog

All notable changes to content-pipeline are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Conventional Commits](https://www.conventionalcommits.org/). The `/ship`
release step (Stage 7) pulls the section for a tag `vX.Y.Z` out of this file as
the GitHub Release notes, so this changelog is the single source of truth for
"what changed".

## [0.15.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.14.0...v0.15.0) (2026-06-11)

### Features

* **post3:** forge-harness Post #3 launch pipeline source + publish path (#819) (#75) — adds the Post #3 ("forge-harness — only 1 of 8 ever talks to the model") launch pipeline. Render source: `inputs/forgeHarnessSpec.ts`, `video/post3Narration.ts`, `video/post3Timeline.ts`, `remotion/post3-index.tsx`, `adapters/video-post3.ts`, plus the card + demo render smokes (`smoke/launch-card-post3.ts`, `smoke/post3-demo-narrated.ts`, `smoke/post3-demo-multi-aspect.ts`). Publish path `smoke/publish-typefully-post3.ts` mirrors the post2 sibling: assembles the DRAFT with X t1=video + t2/t3/t4=cards A/B/C and Threads=[9:16 hero video, card A], running the #797 fidelity, #809 copy-length, and #810 provenance gates in both modes before any network; LIVE is gated behind `TYPEFULLY_LIVE=1` (orchestrator only) and dry-run makes zero network calls. Adds `forge-harness-post3` to the `PostSlug` SSOT (`publish/publishAssets.ts`), a frozen provenance manifest (`publish/manifests/forge-harness-post3.publish-manifest.json`), the post3 art-uniqueness hash (`smoke/fixtures/art-registry.json`, #802), and the `smoke:publish-typefully-post3(:live)` scripts. 36 suites / 394 tests green; tsc clean; dry-run smoke PASSes all three gates ([#75](https://github.com/ziyilam3999/content-pipeline/pull/75)).

## [0.14.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.13.0...v0.14.0) (2026-06-11)

### Features

* **video:** art-source-bound guard blocks a silently-solid demo background (#817) (#73) — a demo can INTEND generative art (`CONFIG.demo.animatedBackgroundDefault`) yet render a SOLID background with no error when the art base `_art-base-<slug>.png` is missing or resolved away before the Remotion call; the #807 perceptibility test does not catch it (a moving solid passes the motion gate). New pure module `video/demoArtBinding.ts`: `assertDemoArtBound` HARD-FAILS when art is INTENDED but NOT BOUND (missing file OR null/empty `backgroundImagePath`), with the existing `DEMO_BG=0/off/false/no` escape hatch as a no-op for an intentional solid render; `assertSharedArtSource` enforces that the demo video background and the post's cards derive from the SAME `_art-base-<slug>.png` (one per-post art — prevents forgetting the video bg AND paying for art twice); plus `artBaseSlug`/`isSolidRenderOptOut` helpers. Wired into `smoke/builder-demo-multi-aspect.ts` before any render so a real producer run blocks instead of shipping solid. 36 suites / 393 tests green (+18 covering both ends incl. the `DEMO_BG` bypass forms); tsc clean; no paid calls ([#73](https://github.com/ziyilam3999/content-pipeline/pull/73)).

## [0.13.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.12.0...v0.13.0) (2026-06-11)

### Features

* **publish:** publish-asset provenance guard blocks stale renders (#810) (#68) — a sha256-based gate (`publish/publishProvenance.ts`) hard-fails before any upload unless every publish asset matches the operator-approved render frozen in a committed per-post manifest. Adds `npm run publish:freeze-manifest`, a per-post asset SSOT (`publish/publishAssets.ts`), and committed receipts; wired into both publish smokes before assembly/upload. Prevents the stale-render drift near-miss (an approved re-render lived only in the durable bundle while out/review held the old cut). Human-approval gate unchanged.

## [0.12.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.11.0...v0.12.0) (2026-06-11)

### Features

* **publish:** post-publish read-back verifier + short-thread advisory (#793) — an outward publish is NOT verified until you READ BACK the live result; Post #1 reported "published" off the SUBMITTED state alone and came out scrambled on X. Typefully's GET-draft response, AFTER publish, now populates `status: "published"`, `published_at`, `x_published_url` and `threads_published_url` (absent at draft time), so a read-back is finally possible. New `publish/publishVerify.ts`: pure `assertPublishedDraftShape(draft, intent)` asserts `status === "published"`, a non-empty `x_published_url`, `threads_published_url` when Threads was enabled, AND that the STORED X post media-id order matches the caller-supplied intent (the video hero on tweet 1, cards on 2..n) — throwing a clear per-case message on a scrambled or miscounted order; and NON-FATAL `threadLengthAdvisory(xThread)` returning a NOTE when the X thread exceeds the new `CONFIG.publish.threadShape.xSoftMaxTweets` (5) soft cap (longer threads raise same-second scramble risk), never throwing. New runnable smoke `smoke/verify-published.ts <draftId>` (npm script `smoke:verify-published`) does a read-only Typefully GET, runs the assert, prints the live URLs and a greppable `PUBLISH-VERIFY:` line; the LIVE per-tweet reply order is honestly marked `live-per-tweet-order=UNVERIFIED(needs X API)` — Typefully returns only the root tweet URL, so full live-order verification is documented as an X-API follow-up, NOT faked. The advisory is wired non-fatally into both publish smokes and the copy stage smoke. 34 suites / 360 tests green (was 33 / 352; assertPublishedDraftShape PASS + 4 failure modes, threadLengthAdvisory null/NOTE/boundary); tsc clean; no paid calls ([#66](https://github.com/ziyilam3999/content-pipeline/pull/66))

## [0.11.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.10.0...v0.11.0) (2026-06-10)

### Features

* **publish:** per-platform copy-length validator gates over-limit social copy (#809) — Post #2's hand-authored copy reached a LIVE Typefully draft over-limit (X tweet 4 = 282 X-weighted chars vs the 280 limit; Threads = 524 vs 500) because the existing copy verifier checked numbers + superlatives but never per-platform CHARACTER limits, and did not know X discounts every URL to 23 chars (t.co wrapping) or that Threads caps at 500. New `CONFIG.publish.copyLimits` SSOT (`xTweet: 280`, `threads: 500`, `xUrlWeight: 23`) and pure module `publish/copyLimits.ts`: `xWeightedLength` (Unicode codepoints, every URL counted as a fixed 23), `assertCopyWithinPlatformLimits` (throws a clear per-unit "X tweet N is K over the 280 limit" message; boundary inclusive at the limit), and a NON-FATAL `heroVideoAdvisory` (logs a NOTE for a portrait / taller-than-1080 hero so X's extra compression of the deliberate 9:16 cut is never a Typefully surprise). The assertion is wired BEFORE assembly/upload in BOTH publish smokes (dry-run AND live) and into `adapters/copy.ts` (fail fast at the source), printing `COPY-LIMITS: PASS`; the video advisory is wired non-fatally into both smokes. 352 tests / 33 suites green (was 340 / 32; +12 both-ends tests: over-limit fails, exactly-at-limit passes, URL discount applied, Threads >500 fails / =500 passes, advisory flags 1080×1920 / silent for 1920×1080); tsc clean; no paid calls ([#63](https://github.com/ziyilam3999/content-pipeline/pull/63))

## [0.10.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.9.1...v0.10.0) (2026-06-10)

### Features

* **video:** bake the three winning Post #2 demo properties as enforced rules (#808) — the operator confirmed the Post #2 builder demo is exactly right; three of its winning properties are now the committed DEFAULT so every future demo performs the same, each guarded by a CI test. **RULE 1 — perceptible animated background is the DEFAULT (not opt-in):** the committed multi-aspect builder-demo producer renders the moving generative-art background automatically whenever the post art-base image exists (escape hatch `DEMO_BG=0/off`); the default-on decision is the pure, unit-tested `video/demoBackground.ts → resolveDemoBackground`, and the #807 perceptibility test still gates motion-rate. **RULE 2 — every produced review video auto-emits a phone-downloadable mobile proxy:** after each aspect's master renders, the producer also emits `<name>-mobile.mp4` (new `video/mobileProxy.ts`, vendored ffmpeg, FREE) and asserts it meets the review-relay caps (≤15MB hard ceiling, ≤720p short edge, +faststart moov atom) via `video/renderProbe.ts → probeMobileProxy`/`assertMobileProxy`; the previously-uncommitted `tools/make-mobile-proxy.sh` is now committed. **RULE 3 — ~90s target, never truncate the voiced cut:** the ~90s target + `[80,100]s` acceptance window live in the config SSOT (`config/index.ts → CONFIG.demo`), and `assertDemoDurationInWindow` fails a demo that silently drifts to 40s/130s while the voiced clamp stays floor-only so the real ~99s voiced narration is never truncated. 340 tests / 32 suites green; tsc clean; live FREE smoke validated all three rules end-to-end with no paid calls ([#61](https://github.com/ziyilam3999/content-pipeline/pull/61))

## [0.9.1](https://github.com/ziyilam3999/content-pipeline/compare/v0.9.0...v0.9.1) (2026-06-10)

### Bug Fixes

* **video:** perceptible oscillating motion for the Post #2 builder-demo background (#807) — the #805 animated generative-art background used a single-span Ken-Burns (scale 1.0→1.12 + pan ±2.2%/±1.6% spread over the whole ~99s clip) ≈ 0.12% zoom per second, ~10x below the rate a human reads as motion, so it looked like a STILL IMAGE under the dark scrim. Replace it with a deterministic, unit-tested OSCILLATING motion curve in a pure helper (`video/artBackgroundMotion.ts`, since `remotion/index.tsx` is outside the tsc/jest gate): sine pan ±6% (periods ~22s X / ~26s Y, quarter-phase Lissajous so it never drifts off-frame) plus a breathing zoom 1.15↔1.25 over ~24s. Min scale 1.15 keeps the ±6% pan edge-safe (`objectFit: cover`) on all 3 aspects (overhang/side 7.5% > worst-case pan shift 6.9%, ~0.6% margin). A both-ends prevention test asserts the shipped config is perceptible over EVERY 1s window (≥0.5%/frame) AND the old 0.12%/s config FAILS the same gate. Re-rendered builder-demo-{9x16,1x1,4x5}.mp4 FREE (reused the paid Adam narration + alignment; NO paid call; scene content, timing, captions, and the sync/parity gates unchanged). Measured background-only mean-abs pixel delta over 1.5s = 4.24 on 0-255 (vs near-0 for the old still image); text stays crisp; zero uncovered edges at the tightest-margin frame on every aspect ([#59](https://github.com/ziyilam3999/content-pipeline/pull/59))

## [0.9.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.8.0...v0.9.0) (2026-06-10)

### Features

* **video:** animated generative-art background for the Post #2 builder demo (#805) — the builder-demo composition's flat `#0a0f1e` fill becomes an OPTIONAL animated generative-art background: the SAME post-2 card art (`_art-base-post2.png`, within-post reuse allowed by the #802 per-post guard) rendered FULL-FRAME (`objectFit: cover`, per-aspect, never letterboxed per #765) under a slow, deterministic Ken-Burns drift (scale ~1.0→1.12 + a few-percent pan via `interpolate(useCurrentFrame())`), then DIMMED by a dark `#0a0f1e` scrim (default opacity 0.72) so the foreground UI and synced caption band stay clearly legible — "subtle living texture behind the same dark UI." Config-driven background MODE (`backgroundImagePath` / `backgroundScrimOpacity` / `backgroundBlurPx`, `DEMO_BG`/`DEMO_BG_SCRIM`/`DEMO_BG_BLUR` env knobs), default OFF → byte-identical to the prior solid background. NO new paid call: reuses the existing `builder-narration.mp3` + its alignment bundle; audio, scene timing, and captions are unchanged, so the audio/sync provenance guard (#774/#777) and the sync/parity CI gate (#778) stay green ([#57](https://github.com/ziyilam3999/content-pipeline/pull/57))

## [0.8.0](https://github.com/ziyilam3999/content-pipeline/compare/v0.7.0...v0.8.0) (2026-06-10)

### Features

* **image:** per-post UNIQUE card art + post-2 paid regen (#802, #803) — every NEW launch post now gets its OWN distinct background artwork. The art cache key is POST-SCOPED (`generateArtOnce(..., {postSlug})` → `_art-base-<postSlug>.png`), so a new post is a cache MISS and must generate fresh art instead of silently inheriting the previous post's art (the old single global `_art-base.png` handed post #2 post #1's art — the bug this fixes). Each post supplies its own art-theme prompt (`promptExtra`) so the gens differ in palette and motif, and a committed cross-post uniqueness registry (`smoke/fixtures/art-registry.json` + `smoke/art-registry.ts` `assertArtUnique`) throws fail-loud if a post would ship art whose sha256 is already registered to a DIFFERENT post. Within-post sharing (one paid gen reused behind that post's cards) stays cheap and correct. Adds the `smoke:launch-card-post2:paid` path (ONE authorized #803 nano-banana regen for post #2) with a hard-fail proof line that refuses a false "paid ✓" if it fell back to the placeholder ([#55](https://github.com/ziyilam3999/content-pipeline/pull/55))

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