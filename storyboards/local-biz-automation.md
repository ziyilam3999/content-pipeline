---
slug: local-biz-automation
title: "Get your hours back — automation for local shops"
aspect: 9:16
target_runtime_sec: 86
---

# Storyboard — "Get your hours back" (#1243 local-biz automation pitch, 6 beats / ~86s)

Vertical **9:16**, target **~86s** (sub-110 pinned band {78,96}, like fable {85,92} / forge {92,100}; final beat
lengths fit to the measured VO via `fitBeatsToVo` — the seconds below are DESIGN targets, not hand-locks). A
SHORT-FORM **sales arc** selling custom automation services to local small-business owners. The arc is
**hook → before/after → time+money saved → real use cases**, with a payoff + CTA bookend. The LEAD FRAME is a
concrete time/money number: beat 1's headline IS a figure ("got back 5 hours a week"), and a dedicated
quantified time-money beat (beat 3) is the hero emphasis — so the number both OPENS the video and ANCHORS its
middle.

This arc is a sales pitch, NOT an agent-tool demo: it has NO chat / tool / transition beat, so the recipe's
`shape: "feature-tour"` (skip R3/R5 ONLY, keep every other rule) is the intended escape hatch — no new
videoType, no edit to the shared validator.

## Spine / theme
"Your time back. Their busywork, automated." Show a local shop owner getting real hours (and dollars) back when
the repetitive jobs they do by hand are automated for them.

## Design rules carried in
- **Lead with the number** (R2 forces the hook to be beat 1): beat 1's headline IS a concrete time figure; a
  dedicated time-money beat (3) re-states it as the hero emphasis.
- **Real footage spine** (R1): the before/after (beat 2) and use-cases (beat 4) beats bind REAL captured
  footage at publish time — no hallucinated UI, no generative video.
- **Brand-safe + self-explanatory** for a public post: no employer/internal token, no real customer name, no
  real email. Subjects are everyday small-business jobs (missed-call text-back, review requests, invoice
  follow-ups, booking reminders).
- **CTA copy only — NO URL in the BAKE** (R10): the CTA beat ships "Book a free automation audit" with no URL
  string. The real booking URL is an operator-input item appended at publish time (R10 forbids a placeholder /
  `example.*` / `your-*` / `<...>` / `TODO`). Do NOT invent one.
- **9:16 discipline** (R13): primary aspect 9:16 (1080×1920), nothing taller; `FABLE_ASPECTS` spine.
- Terminal share = 0% (no terminal beat, R7). Captions are mandatory + real-voice-synced (R12).

## Board / scene snapshot the capture needs
For a sales arc the "scene" is REAL captured footage of a willing local business (operator-arranged at the
publish leg), each beat with a real on-screen target:
- **Before/after (beat 2):** the manual repetitive task done by hand (the "before"), then the same job running
  automatically (the "after") — split or sequential, labeled "before → after".
- **Time-money (beat 3):** a quantified results card ("5 hrs a week · $320 a month, back") — generated + COMMITTED
  with provenance at the publish leg (promotes this beat to a real `isHeroOutput`).
- **Use-cases (beat 4):** 3–4 concrete real automations on screen (missed-call text-back, review requests,
  invoice follow-ups, booking reminders), labeled "real use cases".

## The beats

| # | arcRole | Beat | Dur* | Kind / vehicle | Framing / camera | Narration (draft) |
|---|---------|------|------|----------------|------------------|-------------------|
| 1 | hook | **The number** | ~8s | hook / overlay | Dark brand bg; headline IS the figure | "This shop owner got back five hours a week — same staff, same hours, just no repetitive work by hand." |
| 2 | before-after | **By hand → automated** | ~18s | output / captured-footage | Cream output bg; manual before vs automated after; label "before → after" | "Here's the task that ate those hours, done by hand every day. And here's the same job now — it just runs itself." |
| 3 | time-money | **Time + money saved** ⭐ | ~18s | output / overlay | Cream output bg; the quantified hero card | "Five hours a week. Around three hundred and twenty dollars a month — handed straight back to the owner." |
| 4 | use-cases | **Real use cases** | ~22s | output / captured-footage | Cream output bg; 3–4 real automations; label "real use cases" | "Missed-call text-backs, review requests, invoice follow-ups, booking reminders — the everyday jobs, all handled automatically." |
| 5 | payoff | **Payoff** | ~12s | payoff / overlay | Dark brand bg | "Your time back. Their busywork, automated. Custom-built for how your shop actually runs." |
| 6 | cta | **CTA (copy only)** | ~8s | cta / overlay | Dark brand bg; copy only, NO url | "Book a free automation audit, and see what an hour of your week is worth back." |

*Dur = design target / animation minimum; final length is locked by `fitBeatsToVo` against the measured VO.
Sum 8+18+18+22+12+8 = **86s**. ⭐ = the hero-emphasis quantified moment (promoted to a committed provenance-hashed
results card at the publish leg).

## Capture-assets list (what the PUBLISH leg must PRODUCE — deferred, operator-gated)
- committed still — the **time-money results card** (beat 3) generated by the existing launch-card machinery;
  print sha256 + bytes + the measured "$"/"hrs" glyph box (the both-ends anchor below).
- gitignored dynamic clip(s) — the before/after (beat 2) + use-cases (beat 4) REAL captured footage under
  `out/capture/localbiz/` (≥4 distinct frames each if they must animate).
- synth frames for the hook / payoff / CTA bookends (reuse the existing hook/CTA treatment).

## BOTH-ENDS AC anchor
Core slice (BAKE): the oracle `video/__tests__/localBizPitchSpec.test.ts` asserts the arc order on `arcRole`,
the lead-frame time/money regex on beat-1's headline, and a both-ends R2 failure (strip the hook → the recipe
throws `/demo-recipe R2/`). Publish leg (deferred): an OCR/pixel probe of the time-money results card finds the
"$" / "hrs" glyph; revert to the prior framing → the probe finds nothing → the AC fails. (That committed frame's
bytes prove the storyboard was shot as designed.)

## What changes vs the prior storyboards
- DROP: the agent-interface setup (chat → tool → transition) — this is a SALES arc, not a tool demo.
- REFRAME: the recipe `shape` is `feature-tour` (skips R3/R5 only); `videoType` stays `demo` (mirrors kanban's
  9:16 + demo pairing).
- ADD: a dedicated quantified **time-money** hero beat (3) plus the hook headline IS a number (lead frame).
- KEEP + REUSE: the fable/kanban layout geometry, `FABLE_ASPECTS`, the demonstration-category recipe contract.

## Open questions for the operator
- The real **booking URL** for the CTA (R10 forbids a placeholder — appended at publish time).
- Which willing local business to film the before/after + use-case footage with (publish leg).
- The exact verified time/money figures (the headline + results card numbers are placeholders for the real,
  measured customer result — replace with the real number before any paid VO / publish).

## Status
DESIGN spec — PostSlug registration deferred to the publish leg. The publish leg (register `local-biz-automation`
in `publish/publishAssets.ts`, add a `smoke/`, capture real footage, generate + commit the provenance-hashed
time-money results card, `npm run storyboard:approve -- local-biz-automation`, paid VO) is OUT of this slice and
stays operator-gated. R6 is vacuous in the core slice (no `isHeroOutput` beat declared) — the BAKE is green on
pure data with NO committed stub.
