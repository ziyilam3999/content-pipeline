# Changelog

All notable changes to content-pipeline are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Conventional Commits](https://www.conventionalcommits.org/). The `/ship`
release step (Stage 7) pulls the section for a tag `vX.Y.Z` out of this file as
the GitHub Release notes, so this changelog is the single source of truth for
"what changed".

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
