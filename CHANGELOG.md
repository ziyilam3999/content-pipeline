# Changelog

All notable changes to content-pipeline are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Conventional Commits](https://www.conventionalcommits.org/). The `/ship`
release step (Stage 7) pulls the section for a tag `vX.Y.Z` out of this file as
the GitHub Release notes, so this changelog is the single source of truth for
"what changed".

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
