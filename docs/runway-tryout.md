# Runway try-out — pass criteria and tracking (row A52)

Fixed BEFORE any paid call (day card item 16). The try-out compares three Runway models
(Kling 3.0 standard, Seedance 2.0, Veo 3.1 fast) against the current tool (Gemini Omni 1.2
Flash, `video:gen`) on the two GetSpace AI shots. The tool choice is NOT made before the
test: the operator fills these tables by eyeball after the clips are generated, and the
pick rule below decides.

The plan: 6 picture clips (shots AI-1 and AI-4 x the three models, 6 s, ratio 720:1280,
audio false) plus 3 voice clips (shot AI-4 x the three models, audio true). AI-1 is
text-only (`text_to_video`); AI-4 uses `image_to_video` with ONE still, chosen at run time,
passed as `--still` (the same still for every AI-4 clip). Planned total USD 9.36 against the
USD 25 AI video cap; the Omni control (USD 0.42, AI-4, same still and prompt, 6 s, 720p) is
run separately with the existing `video:gen` and counted in the same cap.

## Picture table — one column per tool, yes/no by operator eyeball

| # | Check | Kling 3.0 | Seedance 2.0 | Veo 3.1 fast | Omni control |
|---|-------|-----------|--------------|--------------|--------------|
| P1 | Looks filmed, not AI-made | | | | |
| P2 | Cars do not warp, melt, merge or change shape | | | | |
| P3 | Camera stays straight top-down and still | | | | |
| P4 | No stray text artefacts (letters, numbers, arrows, logos) | | | | |
| P5 | Prompt followed (AI-1: the red hatchback drives from bottom to top and pauses; AI-4: the silver car reverses out and leaves at the bottom, the red car rolls into the freed bay) | | | | |
| P6 | Within each clip the red car keeps one look (colour, shape, size) from the first frame to the last, and in each AI-4 clip it matches the red car of the still | | | | |

- A tool **passes** with all six yes.
- The **pick** is the passing tool with the lowest cost per second
  (list USD/s at 720:1280: Kling 3.0 standard 0.09 without audio / 0.13 with; Seedance 2.0
  0.30; Veo 3.1 fast 0.10 without audio / 0.15 with; Omni 0.07).
- **No pass** = stay on Omni and say so.
- The label row of the A48 five points is NOT judged here (no label on a raw clip).
- AI-1 is text only, so a match between the AI-1 clip and the AI-4 still is not judged (P6
  judges each clip within itself, and each AI-4 clip against the still).

## Voice table — one row per voice clip (AI-4 x 3 tools)

| Clip | Model | V1 operator verdict (usable / not usable) | V2 spoken words are the narration sentence (yes/no) | V3 no clashing extra speech or music (yes/no) | P1 | P2 | P3 | P4 |
|------|-------|-------------------------------------------|----------------------------------------------------|------------------------------------------------|----|----|----|----|
| ai-4-kling3-voice | kling3.0_standard | | | | | | | |
| ai-4-seedance-voice | seedance2 | | | | | | | |
| ai-4-veo-voice | veo3.1_fast | | | | | | | |

- The narration sentence the voice clips carry: "The giver is told the seeker is nearby as
  the arrival gets close." (storyboards/getspace-level3.md beat 8).
- A **lip or mouth match is not required** (top-down car shot).
- Voice pass = V1 usable AND V2 yes. The voice clip picture is also marked P1 to P4 in the
  row above.
- The voice result feeds the A52 review of storyboard and voiceover, which is not this ticket.

## Tracking

- The spend record lines (attempt ids) in the shared paid-media spend record.
- One run record file `a52-runway-tryout-<date>.md` in the probe-records folder of the
  bridlework state root, one row per clip: date, clip id, model, audio, prompt sha256, still
  sha256, seconds, ratio, list usd, estimatedCost credits, file sha256, marks, verdict.
- One ask ledger bullet in row A52 with the dry-run total and the result.

## Open points (also in the PR body)

- The planned USD 9.36 + 0.42 Omni is above the "about USD 6.30, at most about 9" of
  WAITING-147 because the A52 voice clips were added after that estimate; the operator chose
  the full plan by menu (WAITING-151 = "151 A: full plan (Recommended)").
- The try-out leaves USD 9.48 under the cap, below the USD 20.51 that row A49-paid-runs plans.
- Whether seedance2 bills audio the same (the price page shows no audio split).
- Whether a Runway audio track holds speech at all for a top-down shot.
- The still for AI-4 is chosen at run time.
- The Omni control is made fresh on AI-4 with the same still and prompt (USD 0.42, in the
  WAITING-151 total).
