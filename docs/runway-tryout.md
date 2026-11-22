# Runway try-out — pass criteria and tracking (row A52)

Fixed BEFORE any paid call (day card item 16). The try-out compares Runway models
against the current tool (Gemini Omni 1.2 Flash, `video:gen`) on the two GetSpace AI
shots. The first run used Kling 3.0 standard, Seedance 2.0 and Veo 3.1 fast; the second run
adds Seedance 2.5 and Kling 4.0, plus one Veo 3.1 fast clip with the new prompt. The tool
choice is NOT made before the test: the operator fills these tables by eyeball after the
clips are generated, and the pick rule below decides.

The first-run plan (`tools/runway-tryout-plan.json`): 6 picture clips (shots AI-1 and AI-4 x
the three models, 6 s, ratio 720:1280, audio false) plus 3 voice clips (shot AI-4 x the
three models, audio true). AI-1 is text-only (`text_to_video`); AI-4 uses `image_to_video`
with ONE still, chosen at run time, passed as `--still` (the same still for every AI-4
clip). Planned total USD 9.36 against the USD 25 AI video cap; the Omni control (USD 0.42,
AI-4, same still and prompt, 6 s, 720p) was run separately with the existing `video:gen` and
counted in the same cap.

## First run result

No first-run tool has six yes. Operator decision, 2026-11-22: "Omni is out; Veo 3.1 fast is
the current best; compare with Kling 4.0 and Seedance 2.5 first" (operator words: "Omni is
performing the worst, we cannot use omni. the best among all is the Veo, but i want to
compare with newer kling 4.0 and seedance 2.5 first.").

The four first-run columns were judged against "the silver car ... leaves at the bottom".

## Picture table — one column per tool, yes/no by operator eyeball

| #   | Check                                                                                                                                                                            | Kling 3.0 | Seedance 2.0 | Veo 3.1 fast | Omni control | Seedance 2.5 | Kling 4.0 | Veo 3.1 fast (new prompt) |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------ | ------------ | ------------ | ------------ | --------- | ------------------------- |
| P1  | Looks filmed, not AI-made                                                                                                                                                        | yes       | yes          | yes          | yes          |              |           |                           |
| P2  | Cars do not warp, melt, merge or change shape                                                                                                                                    | no        | no           | yes          | no           |              |           |                           |
| P3  | Camera stays straight top-down and still                                                                                                                                         | yes       | yes          | yes          | yes          |              |           |                           |
| P4  | No stray text artefacts (letters, numbers, arrows, logos)                                                                                                                        | yes       | yes          | yes          | yes          |              |           |                           |
| P5  | Prompt followed (AI-1: the red hatchback drives from bottom to top and pauses; AI-4: the silver car reverses out and leaves at the bottom, the red car rolls into the freed bay) | yes       | no           | no           | no           |              |           |                           |
| P6  | Within each clip the red car keeps one look (colour, shape, size) from the first frame to the last, and in each AI-4 clip it matches the red car of the still                    | yes       | yes          | yes          | yes          |              |           |                           |

- Judging line for P5: for the three second-run columns (Seedance 2.5, Kling 4.0, Veo 3.1
  fast (new prompt)) the AI-4 part of P5 reads
  "the silver car reverses out and leaves at the top, the red car rolls into the freed bay".
  The four first-run columns were judged against "leaves at the bottom". The other checks
  (P1 to P4, P6, V1 to V3) and the AI-1 part of P5 are unchanged. The second-run cells are
  empty in the repo (fixed before the paid call).
- A tool **passes** with all six yes.
- The **pick** is the passing tool with the lowest cost per second
  (list USD/s at 720:1280: Kling 3.0 standard 0.09 without audio / 0.13 with; Seedance 2.0
  0.30; Seedance 2.5 0.30; Kling 4.0 0.157 (list; the pricing page gives 20% off through
  2026-11-30 UTC, not used in the estimate); Veo 3.1 fast 0.10 without audio / 0.15 with;
  Omni 0.07).
- **No pass in the second run = Veo 3.1 fast stays the current best (operator 2026-11-22:
  Omni is out); say so.**
- The Veo 3.1 fast (new prompt) column holds one AI-4 clip: it is the prompt control, its P5
  cell judges the AI-4 part only, and it is not a tool in the pick.
- The label row of the A48 five points is NOT judged here (no label on a raw clip).
- AI-1 is text only, so a match between the AI-1 clip and the AI-4 still is not judged (P6
  judges each clip within itself, and each AI-4 clip against the still).

### Prompt-control checks (Veo 3.1 fast, new prompt)

From the prompt review (a52prompt/report.md, section "Proposed smallest test"): 5 yes/no
checks on the take, read from a 2 frames per second sheet:

1. the upper-right silver hatchback moves first;
2. it leaves the frame;
3. exactly one red car in each frame;
4. no car on car or car on pillar overlap;
5. last frame: the red car is in, or turning into, the freed bay.

The take passes the control with 5 yes. The review scored 2 takes and this run has one, so
the result is one observation.

## Voice table — one row per voice clip

| Clip                   | Model             | V1 operator verdict (usable / not usable) | V2 spoken words are the narration sentence (yes/no) | V3 no clashing extra speech or music (yes/no) | P1  | P2  | P3  | P4  |
| ---------------------- | ----------------- | ----------------------------------------- | --------------------------------------------------- | --------------------------------------------- | --- | --- | --- | --- |
| ai-4-kling3-voice      | kling3.0_standard | usable                                    | yes                                                 | yes                                           | yes | no  | yes | yes |
| ai-4-seedance-voice    | seedance2         | usable                                    | yes                                                 | yes                                           | yes | no  | yes | yes |
| ai-4-veo-voice         | veo3.1_fast       | usable                                    | yes                                                 | yes                                           | yes | yes | yes | yes |
| ai-4-seedance25-voice  | seedance2_5       |                                           |                                                     |                                               |     |     |     |     |
| ai-4-kling4-voice      | kling_4           |                                           |                                                     |                                               |     |     |     |     |

- The narration sentence the voice clips carry: "The giver is told the seeker is nearby as
  the arrival gets close." (storyboards/getspace-level3.md beat 8).
- A **lip or mouth match is not required** (top-down car shot).
- Voice pass = V1 usable AND V2 yes. The voice clip picture is also marked P1 to P4 in the
  row above.
- The voice result feeds the A52 review of storyboard and voiceover, which is not this ticket.

## Second run

- Plan file `tools/runway-tryout-plan-b.json`, plan_id `a52b-runway-tryout-2026-11-22`.
  A second file because a dry run with no `--clip` totals the whole plan and `--clip` takes
  one id; a new plan_id starts its own retry count.
- 7 clips, each 6 s: ai-1-seedance25-pic, ai-4-seedance25-pic, ai-4-seedance25-voice
  (seedance2_5); ai-1-kling4-pic, ai-4-kling4-pic, ai-4-kling4-voice (kling_4);
  ai-4-veo-newprompt-pic (veo3.1_fast).
- Planned total USD 8.85 (Seedance 2.5 3 x 1.80; Kling 4.0 at list 3 x 0.95; the Veo prompt
  control 0.60).
- The AI-4 clips use the same still as the first run (720 x 1280).
- The new clips use the rewritten prompts (WAITING-167 = A). The Veo 3.1 fast (new prompt)
  column is the old-versus-new prompt control.
- Kling 4.0 clips carry sound with no switch (pic clips too): the request holds no audio key,
  and the plan `audio` of a Kling 4.0 clip means "the prompt asks for a voice".
- The Kling 4.0 AI-4 clips use ratio `auto_720p`, so the frame follows the still (the first-run
  still is 720 x 1280).

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
- The first try-out left USD 9.48 under the cap; the second run (USD 8.85) leaves about
  USD 0.63, below the USD 20.51 that row A49-paid-runs plans.
- What Runway bills for a kling_4 clip is not measured; it is recorded at list (USD 0.95), and
  while the 20% discount runs (through 2026-11-30 UTC) the real charge may be USD 0.76.
- For seedance2_5 a promptImage given as one string has no position; the schema text says
  "omit position for reference images", so first-frame use is not confirmed by the docs
  (seedance2 has the same wording and was sent the same way in the first run).
- The rewritten prompts are untested proposals, and the Veo control is one take.
- No retry room: an attempt line is written before the create call (adapters/runway.ts,
  `attemptLine`, from line 568 on this head), so one failed kling_4 (USD 0.95) or
  seedance2_5 (USD 1.80) attempt is above the USD 0.63 left and the 7 clips cannot finish
  under the cap; the Orchestrator runs the Veo control first and one clip of each new model
  before the rest.
- Whether seedance2 bills audio the same (the price page shows no audio split).
- Whether a Runway audio track holds speech at all for a top-down shot.
- The still for AI-4 is chosen at run time.
