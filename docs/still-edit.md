# still:edit — one Gemini 2.5 Flash Image call (A52c)

One paid still per run: an edit of an input still (`--in`, image part plus text part) or text
to image (text part only, plus the item's `aspect_ratio` when it names one). Dry run is the
default; `--live` sends at most one POST, to the plan's model, at
`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`
(header `x-goog-api-key`, that host only, no retry inside a run).

    npm run still:edit -- --plan tools/still-edit-plan.json --item ai-4-no-pillars \
      --in <png or jpeg> --out <dir> --ledger <file> --ceiling-usd 46 [--timeout-seconds <n>] [--live]

- `--plan <file>` — the run plan (prompts are plan data, never code); one run handles one `--item`.
- `--item <id>` — one item of the plan; `needs_input` true requires `--in`, false refuses it.
- `--out <dir>` / `--ledger <file>` — where the image and the spend lines go (outside the repo, or in its `out/`).
- `--ceiling-usd <n>` — a ceiling on the total of the spend record for this run, at most 46
  (see Spend cap).
- `--in <png or jpeg>` — the still to edit; PNG or JPEG by its first bytes, at most 8 MB (a guess), no symlink.
- `--timeout-seconds <n>` — the call limit (default 120). `--live` — send the one call.

## Spend cap

There is one cap, USD 46, over the whole spend record.
The record is written and read by three tools: `video:gen`, `video:tryout` and `still:edit`.
Every line of the record counts, whatever tool wrote it.
`--ceiling-usd` is a ceiling on the total of the spend record for this run, at most 46.
A value under the total already spent refuses.
The number sits in `PAID_SPEND_CAP_USD` in `adapters/videogen.ts`.
The operator raises it when needed.

Two things went with the old split. The USD 1 guard on image spend is gone.
One tool can now use all the room.
An unknown service in the record refuses each of the three tools.

Known limit: two adapters make paid calls, write no spend line and check no cap.
They are `adapters/voice.ts` (ElevenLabs voice, `fetch` at line 135) and
`adapters/genart.ts` (Gemini art, `fetch` at line 178).
Their spend is outside this cap until a ticket adds them.

## Price and billing

The lines of this tool carry service `gemini-image`. Price read 2026-11-22 on
https://ai.google.dev/gemini-api/docs/pricing (redirects to aistudio.google.com/docs/pricing):
Gemini 2.5 Flash Image, paid tier only, "$0.039 per image" output; the estimate is USD 0.040
per call = 0.039 output + 0.001 input (a guess on the high side; the input token count of a
720x1280 image is not measured). The price sits in the plan (`price_usd_per_call`).

The output of an edit may come back at 768x1344 (the 9:16 size of this model) while the input
is 720x1280; the tool writes the bytes as returned, no resize. A failed send (for example
HTTP 429 or 400) keeps its USD 0.04 attempt line, so failed sends use up the cap; a retry is a
new run with its own attempt line. The pricing page (read 2026-11-22) marks
gemini-2.5-flash-image as the legacy model of its series, shutdown 2027-03-15.

Billing (day card row A53, as found 2026-11-22 on https://aistudio.google.com/docs/billing):
this model has no free tier, so the key's project needs a linked Cloud Billing account. That
account is Prepay (credits bought ahead, minimum USD 5, expire after 12 months,
non-refundable; at balance 0 calls fail with HTTP 402) or Postpay (charged at month end); new
accounts start on Prepay. The page does not mention the consumer Gemini app plans, so a
consumer plan is not assumed to pay for API calls. Which of the two the operator's project is
on was not checked (the key was not read).

Still pass line (day card item 17 (c)), judged by the operator's eye on the written file;
tracked in `~/.bridlework/probe-records/a52c-still-edit-20261122.md`, one row per take (date,
item id, prompt sha256, input sha256, file sha256, width x height, usd, marks). A take passes
with five yes; at most 3 takes (USD 0.12) before the question goes back to the operator.

| mark | pass when |
|---|---|
| S1 | no pillar or pillar stub in the frame |
| S2 | a parked car seen from above fills the strip between the upper-right silver car's bay and the black car |
| S3 | the red car, the upper-right silver car, the black car and the painted lines sit where they sit in the input (side-by-side look) |
| S4 | the frame is 9:16 portrait |
| S5 | no new text, arrow, person or other object |
