---
slug: <post-slug>        # MUST equal a PostSlug in publish/publishAssets.ts — the doc lives at storyboards/<slug>.md
title: <human title>
aspect: 9:16             # 9:16 | 1:1 | 4:5
target_runtime_sec: 80   # design target; final beat lengths fit to the measured VO
---

# Storyboard — "<one-line theme>"

> **Leg 0 — design FIRST, then get the operator's YES.** No capture / paid-voice / stage runs for this post
> until this storyboard is approved. After you fill this in and the operator signs off, record it:
> `npm run storyboard:approve -- <slug>`. Editing this doc afterwards auto-expires the approval (it is
> pinned to the doc's exact bytes) — re-run the approve command.

## Spine / theme
The one-line through-line + which product upgrade / story this post showcases.

## Design rules carried in
The hard production constraints this storyboard must respect (e.g. "feature X only renders in columns 3–4",
brand-safe + self-explanatory subjects for a public post, ≤3 narration lines carry real payload).

## Board / scene snapshot the capture needs
The EXACT source state the capture must stand up so every beat has a real on-screen target (the generalized
"what must be true on screen"). For a data-driven UI, describe the seed state (which cards / rows / values).

## The beats

| # | Beat | Dur* | Asset [still / clip / synth] | Framing / camera | Highlight | Narration (draft) |
|---|------|------|------------------------------|------------------|-----------|-------------------|
| 1 | <hook> | ~7s | synth | … | — | "…" |
| 2 | … | ~7s | still | … | … | "…" |
| … | … | … | … | … | … | … |

*Dur = design target / animation minimum; final length is locked by `fitBeatsToVo` against the measured VO.

## Capture-assets list (what the implementation must PRODUCE)
The concrete artifacts the build produces, each with a provenance note:
- committed still(s) — e.g. `assets/<post>/board-overview.png` (DSF 3); print sha256 + bytes + measured boxes.
- gitignored dynamic clip(s) — e.g. `out/capture/<post>/clip-*.mp4` (≥4 distinct frames if it must ANIMATE).
- synth frames for the intro/outro beats (reuse the existing hook/CTA treatment).

## BOTH-ENDS AC anchor
Name the ONE committed, provenance-hashed frame that is the deterministic both-ends AC: an OCR/pixel probe
of region R of `<committed-still>.png` finds glyph G; revert to the prior framing → the probe finds nothing
→ the AC FAILS. (This is the frame whose bytes prove the storyboard was actually shot as designed.)

## What changes vs the prior storyboard
- DROP: …
- REFRAME: …
- ADD: …
- KEEP + REUSE: …

## Open questions for the operator
The decisions the sign-off resolves (length trade-offs, which beats to cut, framing choices).
