# runway:audio — one Runway speech_to_speech call (A57)

## What the verb `swap` does

`swap` takes the first sound stream of `--in` (a clip with sound, or a sound file) out with
the system ffmpeg as a 16-bit PCM WAV, at the stream's own sample rate and channel count, and
sends it in one POST to `https://api.dev.runwayml.com/v1/speech_to_speech` (model
`eleven_multilingual_sts_v2`, a `runway-preset` voice, `removeBackgroundNoise`). The picture
and a second sound stream are not sent. The tool polls the task and downloads the first output
URL once, and saves the bytes as received as
`<clip id>-sts-<voice>-noise<true|false>-<attempt id>.<ext>` in `--out`; the extension comes
from the first bytes of the reply. A live run sends at most one create request; a retry is a
new run.

`runway:audio` is one more of the paid tools that write the spend record.

## Run line

    npm run runway:audio -- swap --in <file> --voice <preset id> --remove-noise <true|false> --plan-id <id> --out <dir> --ledger <file> --ceiling-usd <n> [--timeout-seconds <n>] [--live]

- `swap` — the verb, the first argument; another verb, or none, is refused with `usage`.
- `--in <file>` — the clip or sound file; a regular file, no symlink, FIFO or device. The
  clip id is its file name without its last extension.
- `--voice <preset id>` — one of the 49 preset ids of the adapter's list, matched exactly and
  with case (`Bernard`, `Vincent`, ...).
- `--remove-noise <true|false>` — `removeBackgroundNoise` of the request, as the word `true`
  or the word `false`.
- `--plan-id <id>` — the plan this swap belongs to; with the clip id it holds the retry count.
- `--out <dir>` — where a live run writes the swapped sound.
- `--ledger <file>` — the spend record (JSON lines); a file that does not exist yet counts as
  an empty record.
- `--ceiling-usd <n>` — a ceiling on the total of the spend record for this run, a plain
  number above 0 and at most `PAID_SPEND_CAP_USD` of `adapters/videogen.ts`.
- `--timeout-seconds <n>` — the limit of each call and of the poll, a whole number above 0
  (default 900).
- `--live` — send the one request.

`--out` and the folder of `--ledger` lie outside git work trees. The repo check of
`checkFolder` (`adapters/videogen.ts`) comes first, so a folder of this repo outside `out/` is
refused with `out-bad`. The git work tree check comes next: a folder under this repo's `out/`,
or a folder inside another git work tree, is refused with `inside-repo`.

## Dry run (the default)

Without `--live` the tool reads no key, sends nothing and writes nothing: no file in `--out`,
the spend record stays byte-equal, no lock file is made. It makes the checks that need no key
and no lock: `usage`, `bad-id`, `input-missing`, `voice-unknown`, `ffmpeg-missing`,
`input-no-sound`, `input-too-big`, `out-bad`, `inside-repo`, `ledger-unreadable` and
`over-ceiling`. Three checks run with `--live` only: `key-missing` (the dry run reads no
key), `ledger-busy` (the dry run does not look at the lock file) and `retry-limit`. The dry
run needs the system ffmpeg too, since it prices the WAV it would send. It prints three lines:

    runway-audio: dry-run (no request sent, no key read, nothing written)
    runway-audio: swap clip id=<id> model=eleven_multilingual_sts_v2 voice=<voice> remove-noise=<true|false> seconds=<n> input-sha256=<64 hex> audio-sha256=<64 hex> data-uri-chars=<n> credits=<n> estimate-usd=<x.xxx>
    runway-audio: spend group=all spent usd=<x.xxx> ceiling=<n> room usd=<x.xxx> room-after usd=<x.xxx>

`input-sha256` is the hash of the `--in` file and `audio-sha256` the hash of the WAV a live
run would send. `spent` is the total of the whole record.

## Refusal codes

A refusal is exit 2 and one stderr line that starts with the code. It comes before a line is
appended and before a request is sent.

- `usage` — a missing required option, an unknown option, an option given twice, a value that
  starts with `--`, a `--remove-noise` other than `true` or `false`, a `--ceiling-usd` that is
  0, negative, above the cap or not a plain number, a `--timeout-seconds` that is not a whole
  number above 0, or an unknown or missing verb.
- `voice-unknown` — `--voice` is not one of the preset ids of the list (exact and with case).
- `bad-id` — `--plan-id` or the clip id is not 1 to 120 characters of letters, digits, dot,
  dash and underscore, or starts with a dot or a dash.
- `input-missing` — `--in` is missing, or is a folder, a symlink, a FIFO or a device; such a
  path is not opened.
- `input-no-sound` — `--in` holds no sound stream, or the WAV to be sent has no length.
- `input-too-big` — the data URI of the WAV is longer than `MAX_DATA_URI_CHARS` of
  `adapters/runway.ts` (5000000 characters).
- `ffmpeg-missing` — no system ffmpeg was found.
- `out-bad` — `--out` or the folder of `--ledger` is missing, is a symlink, is not a folder,
  or lies in this repo outside `out/`.
- `inside-repo` — `--out` or the folder of `--ledger` lies in a git work tree, this repo's
  `out/` included.
- `ledger-unreadable` — `--ledger` exists and is not a regular file (a symlink, a folder, a
  FIFO, a device), or a line of it is not a JSON object, has no final newline, has no finite
  `cost_usd` of 0 or more, or has a service the table of `adapters/videogen.ts` does not hold.
- `over-ceiling` — the total of the record plus the estimate is above `--ceiling-usd`.
- `key-missing` (with `--live`) — the key reader threw, or returned an empty or blank text.
- `ledger-busy` (with `--live`) — the lock file `<record>.lock` exists.
- `retry-limit` (with `--live`) — the record holds 2 swap attempt lines of this plan id and
  this clip id.

A run that ends another way prints `runway-audio: <status> attempt=<attempt id> <failure text>`
on stderr and exits 1; the statuses are `failed`, `cancelled`, `timeout`, `http-<n>` and
`error`. `http-<n>` is a reply other than 2xx. The tool follows a redirect on the download
only (to `https:` addresses, at most 5 in a row); a 3xx of the API host ends the run, so the
reply of another host is not taken for the task's.

## Spend lines

A live run appends two JSON lines to `--ledger`, each ending with a newline. The lines carry
service `runway`, like the hand lines of the earlier swaps and the lines of `video:tryout`; a
swap line is told from a `video:tryout` line by `sent.endpoint` `speech_to_speech`.

The attempt line is appended before the request is sent, under the lock `<record>.lock`, and
stays when the call throws. Its keys:

- `kind` (`attempt`), `attempt_id` (a uuid made by the tool), `time` (ISO, UTC), `service`.
- `sent`: `plan_id`, `clip_id`, `model`, `endpoint`, `seconds`, `voice` (`{type:
  "runway-preset", presetId}`), `removeBackgroundNoise`, `media_type` (`audio`),
  `input_clip_sha256`, `input_audio_sha256`.
- `cost_usd` (the list estimate), `cost_how` (`credits_per_3s`, `price_read`, `basis`),
  `status` (`attempted`).

The outcome line follows the call, also after a failed call or a timeout. Its keys: `kind`
(`outcome`), `attempt_id` (the same), `time`, `service`, `cost_usd`, `status` (`ok`, `failed`,
`cancelled`, `timeout`, `http-<n>` or `error`), `task_id` (the Runway task id, or null),
`estimated_cost_credits`, `final_cost_credits`, `file`, `file_sha256` (null when no file was
saved), `failure` (null, or at most 200 characters with the key removed before the cut).

The outcome `cost_usd` is max(0, C x USD 0.01 − the attempt `cost_usd`), where C is the credits
of the terminal task reply when the run read one, else the `estimatedCost` credits of the
create reply, else 0. A cost field is read as an object `{credits: n}` or as a plain number n;
n counts only when it is a finite number from 0 to 1000000, and anything else is null in the
line. The printed line of a good run says in which form each field was read
(`cost-form estimate=<object|number|none> final=<object|number|none>`).

## Price

Price read 2026-11-26 on the Runway price page: "1 credit per 3s of audio", USD 0.01 per
credit. The tool takes 1 credit per 3 s of sent sound, rounded UP to whole credits and at
least 1. A 6 s line is 2 credits (USD 0.020), a 10.03 s line is 4 (USD 0.040).

## Known limits

- The five paid runs before this ticket were booked at this amount; the rounding is read from
  those runs, not from the price page.
- About 21 s of 44.1 kHz stereo sound is the most that fits the data URI limit.
- The voice list is a copy of 2026-11-26, and one voice of it was heard.
- There is one cap, USD 46, over the whole record, where each line counts, the lines of other
  tools too. The number sits in `PAID_SPEND_CAP_USD` of `adapters/videogen.ts`; the operator
  raises it. A raise also changes the tests `ceiling limit` and `dry spend line` of
  `adapters/__tests__/runwayAudio.test.ts` and the cap figure of this page.
- `adapters/voice.ts` and `adapters/genart.ts` write no spend line, so their spend is outside
  the cap.
- The 5 hand attempt lines of the earlier swaps are swap lines too: a clip id and plan id of
  theirs counts them.
- The retry count goes by file name and plan id: the same sound under another name or another
  plan id starts a new count. `video:tryout` counts a swap line as one of its 2 attempts when
  plan id and clip id are the same; a try-out clip id is the plan's own, a swap clip id is the
  donor file name, so the two meet when a donor file is renamed.
- An outcome line carries no endpoint: a reader tells a swap from a `video:tryout` run through
  the attempt line of the same `attempt_id`.
- The `clip:edit` ai-clip kind (`video/clipEdit.ts`, on master) reads the table value `ai-video`
  for service `runway`, so it takes a swap line as a line of the AI video group.
- A create that Runway refuses (`http-4xx`) leaves the attempt line at the list estimate and
  uses one of the 2 attempts of that clip id.
- A run that dies between the two lines leaves the attempt line alone.
- A run that dies between taking the lock and removing it leaves `<record>.lock`, and then the
  paid tools that write the record answer `ledger-busy` until the file is removed by hand.
- The form of the final cost field of a live reply of this call was not looked at again; the
  tool takes an object or a plain number for each cost field, where `adapters/runway.ts` takes
  the object form only.
- The terms for output of this model through Runway were not found beyond Runway's own terms.
- The tool does not judge the sound.

## Live check (after the merge)

A step of this ticket (ask A57), done by the Orchestrator outside the repo. The builder has no
key and spends nothing.

Free step, a test: the dry run on a donor clip that was already swapped, with the real spend
record and `--ceiling-usd 46`. Pass: it prints the credits and estimate of that clip's hand
lines (the beat 3 clip: `credits=2 estimate-usd=0.020`), and a spend line whose spent figure
equals the sum of `cost_usd` of the record's lines (USD 15.290 when the record was read on
2026-11-26), and the record is byte-equal afterwards.

Paid step: it needs a donor clip that has no swap yet. Such a clip is made first with
`video:tryout` (Kling 4.0 at list: USD 0.63 for 4 s to USD 1.57 for 10 s); the swap itself is
about USD 0.02 to 0.04. Both need the operator's yes.

Before each of the two paid calls its dry run comes first: the dry run of `video:tryout` for
the donor, then the dry run of the same swap command on the new donor. The printed lines of
each are written under the heading before the paid call. A dry run passes with exit 0, the
estimate line (for the swap: the credits line), and `room-after` of 0 or more.

The paid swap passes when:

- exit 0;
- the record gained one attempt line and one outcome line with status `ok`, written by the
  tool, with service `runway`, the attempt line with endpoint `speech_to_speech`;
- the total of the record after the run is at most 46;
- `estimated_cost_credits` is a number; `final_cost_credits` is a number or null, and which it
  was is written down, with the `cost-form` part of the printed line;
- the sha256 of the saved file equals `file_sha256`;
- the saved line reads at most -60 dB outside the words (RMS per 0.2 s window, read with the
  scratch script `tl.sh` of that record, the way mark 2 of "Clean swap and bed" was read;
  outside the words = before the first and after the last window above -40 dB);
- the operator's ear says one speaker with the Bernard lines of beats 3, 5 and 8.

Tracked (both steps): a new heading "V1 tool swap" in the record
`a57-kling-voice-test-20261126.md` in the probe-records folder of the bridlework state root,
with the printed lines, and one ask ledger bullet in row A57. On a fail: stop and ask the
operator; no second paid run without a yes.
