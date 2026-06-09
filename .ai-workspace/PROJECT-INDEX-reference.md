# Project Knowledge Index — File Reference

> On-demand reference. The auto-injected SessionStart primer (`PROJECT-INDEX.md`) carries Quick Start, Current State, and conventions. Read this file when you need the full file-by-file map.

## File Reference

### Architecture & Docs
| File | Purpose | Freshness |
|------|---------|-----------|
| `README.md` | Product overview: spec → copy/image/voice/video | CURRENT |
| `CHANGELOG.md` | Release notes SSOT (pulled into GitHub Releases by /ship Stage 7) | CURRENT |

### Implementation — pipeline (conductor)
| File | Purpose | Freshness |
|------|---------|-----------|
| `pipeline/run.ts` | `runPipeline(input, deps)` — wires all stages; threads real caption alignment | CURRENT |
| `pipeline/audioVisual.ts` | Copy-script → voiceover(+durationSec) → captions wiring | CURRENT |

### Implementation — inputs
| File | Purpose | Freshness |
|------|---------|-----------|
| `inputs/contentspec.ts` | `ContentSpec` shape + prose-level scope guards on table facts | CURRENT |
| `inputs/adapter.ts` | Turns a launch spec into structured facts | CURRENT |

### Implementation — copy
| File | Purpose | Freshness |
|------|---------|-----------|
| `copy/generate.ts` | Factual social copy generator | CURRENT |
| `copy/verifier.ts` | Number/claim verifier guardrail (no unbacked superlatives) | CURRENT |
| `adapters/copy.ts` | Real Claude Max OAuth writeCopy adapter | CURRENT |

### Implementation — image
| File | Purpose | Freshness |
|------|---------|-----------|
| `image/card.ts` | Deterministic result-card layout | CURRENT |
| `adapters/image.ts` | Playwright renders card HTML → PNG | CURRENT |
| `adapters/genart.ts` | Generative-art background (nano-banana / Gemini), off by default | CURRENT |

### Implementation — audio / voice
| File | Purpose | Freshness |
|------|---------|-----------|
| `audio/voiceover.ts` | Voiceover spec — paid primary, free fallback, real clip length | CURRENT |
| `adapters/voice.ts` | ElevenLabs PAID synthVoice (Adam, locked) | CURRENT |

### Implementation — video
| File | Purpose | Freshness |
|------|---------|-----------|
| `video/renderSpec.ts` | 3 settled aspect shapes (1:1/9:16/4:5), caption safe-band | CURRENT |
| `video/captions.ts` | Captions from real per-character alignment (final-time guard) | CURRENT |
| `video/demoTimeline.ts` | Demo timeline; `narrationSceneEndTimes` derives scene cuts from alignment | CURRENT |
| `video/demoNarration.ts` | Ordered narration segments (spoken "Alpha"; brand voice) | CURRENT |
| `video/demoLayout.ts` | Pure per-aspect fill contract (9:16 grow-to-fill; 1:1 centered) | CURRENT |
| `video/audioDuration.ts` | Pure-Node WAV/MP3 duration + `assertAudioMatchesSync` provenance guard | CURRENT |
| `adapters/video.ts` | `renderVideo` + `renderDemoVideo` (aspectName, layout, sync guard) → Remotion MP4 | CURRENT |
| `remotion/index.tsx` | Remotion compositions (`launch`, `demo`); OUT of tsc/jest gate | CURRENT |

### Configuration
| File | Purpose | Freshness |
|------|---------|-----------|
| `config/index.ts` | Settings SSOT — voice (Adam), aspect ratios, caption band, providers | CURRENT |
| `package.json` | Scripts incl. `smoke:*` and `smoke:demo-multi`; deps (Remotion, Playwright) | CURRENT |
| `tsconfig.json` | `video/**`,`adapters/**` etc. in gate; `remotion/index.tsx` excluded | CURRENT |

### Tests & Smokes
| File | Purpose | Freshness |
|------|---------|-----------|
| `*/__tests__/*.test.ts` | Jest unit suites per module (config, copy, image, audio, video, pipeline, adapters) | CURRENT |
| `smoke/demo-multi-aspect.ts` | Render all 3 aspects from one bound narration bundle (provenance-guarded) | CURRENT |
| `smoke/demo-narrated.ts` | Narrated demo (free mock / `:paid`); `usedRealSceneSync` | CURRENT |
| `smoke/e2e-lfah.ts` | Full end-to-end with all real adapters | CURRENT |
| `smoke/lfahSpec.ts` | The verbatim lfah 4-way fact set | CURRENT |
| `smoke/{copy,image,video,voice,genart,caption-sync-real,demo-video}-smoke.ts` | Per-stage real smokes (prove primary path) | CURRENT |

## Server Source Map
No `server/` or `src/`. Source lives in flat stage dirs; entry compositions in `remotion/index.tsx`.

### pipeline/
- `run.ts` — conductor; `audioVisual.ts` — av wiring
### video/
- `renderSpec.ts`, `captions.ts`, `demoTimeline.ts`, `demoNarration.ts`, `demoLayout.ts`, `audioDuration.ts`
### adapters/
- `copy.ts`, `image.ts`, `genart.ts`, `voice.ts`, `video.ts`
### inputs/ · copy/ · image/ · audio/ · config/
- one module + tests each (see tables above)
