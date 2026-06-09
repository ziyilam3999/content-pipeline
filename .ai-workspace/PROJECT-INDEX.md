# Project Knowledge Index
Generated: 2026-06-09 | Files: 56 | Topics: 5

> Auto-injected at SessionStart via `hooks/cairn-session-start.sh`. The full file-reference table is in `.ai-workspace/PROJECT-INDEX-reference.md` — Read it on demand.

<!-- polish:start -->
## What this is
content-pipeline turns a launch announcement (a `ContentSpec`) into ready-to-post social content: factual copy, a result-card image, a voiceover spec, and Remotion video render-specs in 3 aspects. Pure-ish TS; real providers live behind `adapters/`. The conductor is `pipeline/run.ts`.

## Quick Start
| If you need to... | Read these files (in order) |
|---|---|
| Understand the pipeline end-to-end | `pipeline/run.ts` > `inputs/contentspec.ts` > `README.md` |
| Work on social copy | `copy/generate.ts` > `copy/verifier.ts` > `adapters/copy.ts` |
| Work on the result-card image | `image/card.ts` > `adapters/image.ts` > `adapters/genart.ts` |
| Work on voiceover / audio | `audio/voiceover.ts` > `adapters/voice.ts` > `config/index.ts` |
| Work on caption↔voice sync | `video/captions.ts` > `pipeline/audioVisual.ts` > `video/__tests__/captions-sync.test.ts` |
| Work on the animated demo | `video/demoTimeline.ts` > `video/demoNarration.ts` > `remotion/index.tsx` > `adapters/video.ts` |
| Change per-aspect video layout / fill | `video/demoLayout.ts` > `remotion/index.tsx` (SceneShell) > `video/renderSpec.ts` |
| Touch audio↔sync provenance guard | `video/audioDuration.ts` > `adapters/video.ts` (assertAudioMatchesSync) |
| Render-spec / aspect ratios (1:1/9:16/4:5) | `video/renderSpec.ts` > `config/index.ts` |
| ContentSpec input + scope guards | `inputs/contentspec.ts` > `inputs/adapter.ts` |
| Produce the lfah demo in 3 aspects | `smoke/demo-multi-aspect.ts` > `smoke/lfahSpec.ts` |
| Run a real end-to-end | `smoke/e2e-lfah.ts` > `pipeline/run.ts` |
| Config SSOT (voice, aspects, providers) | `config/index.ts` |

## Current State
- **Shipped**: v0.3.0 (honest 4-way demo, narration "Alpha", scene↔narration sync). On master since: #765 (per-aspect frame-fill), #773 (9:16 grow-to-fill), #774 (audio↔sync provenance guard) — unreleased.
- **In Progress**: #721 Phase D — post the lfah launch content to X + Threads (Typefully, dry-run default, explicit yes only).
- **Key Decisions**: male "Adam" voice locked in the config SSOT; each aspect FILLS its own frame (never letterbox a square in a taller frame); a voiceover alignment is only valid for the exact audio it came from (render-time guard).

## Patterns & Conventions
- Real providers behind `adapters/`; stages stay pure + testable: see `pipeline/run.ts`
- Scene/caption timing derives from REAL audio alignment, never a heuristic split: see `video/demoTimeline.ts`, `video/captions.ts`
- `remotion/index.tsx` is OUT of the tsc/jest gate — testable contracts live in `video/*.ts`: see `video/demoLayout.ts`
- Smokes prove the PRIMARY path (paid provider), free/silent for CI: see `smoke/`
- Config single-source-of-truth (voice, aspect shapes, caption band): see `config/index.ts`
<!-- polish:end -->
