# clip sound: lay voice lines and one ducked music bed on a silent cut (A57)

`apply` takes a finished silent cut, the voice line files and one music bed, all named with
their sha256 in a spec (schema `clip-sound/1`). It brings each line to one loudness, places it
at its time on a mono voice track, brings the bed to its level and ducks it under the voice. It
copies the picture stream and writes four files into `--out`: the film `<slug>.sound.mp4`,
`<slug>.voice.wav`, the ducked bed `<slug>.bed.wav` and the sound record `<slug>.sound.json`.
The tool reads no key, sends no request and reads no spend record; it needs the system ffmpeg.

## The run line

    npx tsx tools/clipSound.ts apply --spec <file> --media <dir> --out <dir> [--dry]

- `--spec <file>` the `clip-sound/1` spec.
- `--media <dir>` the folder of the picture, the line files and the bed.
- `--out <dir>` an existing folder for the four files, not `--media`; both outside a git work tree.
- `--dry` the checks and the measurements only: nothing is written into `--out`.

A good run prints
`clip-sound: wrote <slug> sec=<n> lines=<n> voice-lufs=<n> mix-lufs=<n> mix-peak-db=<n>` and
exits 0. With `--dry` it prints `clip-sound: dry-run (nothing written)`, one
`clip-sound: line id=<id> at=<n> sec=<n> words-end=<n> in-lufs=<n> gain-db=<n>` per line and one
`clip-sound: bed sec=<n> in-lufs=<n> gain-db=<n>`. Files of the same name from an earlier run are
replaced. A refused run leaves them as they were.

## The spec

These keys and no other.

- `schema` — `clip-sound/1`.
- `slug` — 1 to 64 characters of lower-case letters, digits and dash, starting with a letter or digit.
- `picture` — `file`, `sha256`: the silent cut.
- `voice.target_lufs` — a number from -24 to -12.
- `voice.lines` — 1 to 40 lines, in strictly rising order of `at`. A line holds `id` (the rule of
  `slug`, each used once), `file`, `sha256`, `at` and, if wanted, `window`.
- `at` — where the sound of the line file starts, in seconds of the picture: 0 or more, at most
  3 decimals (a step of one millisecond).
- `window` — `from`, `to`: the beat of the line in seconds of the picture, with
  `0 <= from <= at < to` and `to` not beyond the picture's end. It is copied to the sound record;
  the words are not judged against it here.
- `bed` — `file`, `sha256`, `level_lufs` (a number from -40 to -18).
- `file` — a bare file name in `--media`, 1 to 200 characters, with no path separator and no `..`,
  not starting with a dot or a dash. `sha256` is 64 lower-case hex characters.

## An example (made-up values)

    {
      "schema": "clip-sound/1",
      "slug": "example-sound",
      "picture": { "file": "example-cut.mp4", "sha256": "<sha256 of the file>" },
      "voice": {
        "target_lufs": -18,
        "lines": [
          { "id": "line-one", "file": "line-one.wav", "sha256": "<sha256 of the file>",
            "at": 2, "window": { "from": 2, "to": 6 } },
          { "id": "line-two", "file": "line-two.wav", "sha256": "<sha256 of the file>", "at": 7.25 }
        ]
      },
      "bed": { "file": "bed.mp3", "sha256": "<sha256 of the file>", "level_lufs": -28 }
    }

## Refusal codes

A refusal exits 2, the first stderr line starts with the code, and no file of the run is left in
`--out`.

- `usage` — a missing or unknown option, an option twice, or a first argument other than `apply`.
- `spec-invalid` — the spec cannot be read as JSON or breaks a limit; the reason lines follow.
- `out-missing` — `--out` or `--media` is missing or is not a folder.
- `out-symlink` — `--out` is a symlink, or a symlink sits at a temp name or final name in it.
- `same-folder` — `--media` and `--out` are one folder by real path.
- `inside-repo` — `--media` or `--out` lies in a git work tree.
- `source-missing` — a named file is not in `--media` or is not a regular file (a symlink is not followed).
- `source-changed` — the sha256 of the picture, a line or the bed differs from the spec.
- `picture-no-video` — the picture file has no video stream.
- `picture-has-sound` — the picture file holds a sound stream.
- `picture-extra-stream` — the picture file holds another stream beside its one video stream.
- `line-no-sound` — a line file has no sound stream.
- `bed-no-sound` — the bed file has no sound stream.
- `line-too-short` — a line file, or the words of a line, are shorter than 1 s.
- `line-silent` — a line or the bed reads -70 LUFS or lower (the floor of the meter) or cannot be read.
- `window-past-end` — a window ends beyond the picture's end.
- `line-past-end` — `at` plus the end of the words is beyond the picture's end.
- `line-overlap` — the words of a line end after the next line starts; a silent tail may reach into it.
- `bed-too-short` — the bed ends more than 0.05 s before the picture does.
- `ffmpeg-missing` — no system ffmpeg or ffprobe.
- `ffmpeg-failed` — ffmpeg or ffprobe exits with an error, or a measure cannot be read.

The reason lines of `spec-invalid`, as `<code>: <detail>`:

- `bad-schema` — the spec is not an object, `schema` is another text, or a section is not an object or list.
- `unknown-key` — a key outside the list above.
- `bad-slug` — `slug` breaks its rule.
- `bad-id` — a line `id` breaks its rule.
- `id-twice` — two lines share an `id`.
- `bad-file` — a `file` is not a bare file name as above.
- `bad-sha` — a `sha256` is not 64 lower-case hex characters.
- `bad-level` — `target_lufs` or `level_lufs` is not a number in its range.
- `no-lines` — the list of lines is empty.
- `too-many-lines` — more than 40 lines.
- `bad-time` — an `at` is not a number of 0 or more with at most 3 decimals.
- `line-order` — the `at` values are not strictly rising.
- `bad-window` — a window does not hold `0 <= from <= at < to`.

An error outside these codes exits 1 with a `clip-sound: error:` line.

## The sound record

`<slug>.sound.json` has these keys. It holds no time stamp, no absolute path and no user name.

- Top: `schema` (`clip-sound-record/1`), `spec_sha256`, `slug`, `picture`, `lines`, `bed`, `mix`,
  `measured`, `outputs`, `ffmpeg` (the first line of `ffmpeg -version`).
- `picture` — `file`, `sha256`, `video_stream_sha256`, `frames`, `sec`.
- `lines[]` — `id`, `file`, `sha256`, `at`, `sec`, `words_end` (seconds from the line's start),
  `in_lufs`, `gain_db`, `out_lufs`, and `window` (`from`, `to`) when the spec gave one.
- `bed` — `file`, `sha256`, `sec`, `in_lufs`, `gain_db`.
- `mix` — `target_lufs`, `level_lufs`, `line_limit`, `line_attack_ms`, `line_release_ms`,
  `duck_threshold`, `duck_ratio`, `duck_attack_ms`, `duck_release_ms`, `sum_limit`,
  `sum_attack_ms`, `sum_release_ms`, `sample_rate`, `aac_kbps`.
- `measured` — `voice_lufs`, `mix_lufs`, `mix_peak_db` (true peak of the film's sound).
- `outputs` — `film`, `voice`, `bed`, each with `file` and `sha256`.

## The sound, its constants and where they come from

The numbers are those of the mix the operator passed on 2026-11-26 (scratch scripts
`build-real.sh` and `build-real5.sh`, outside the repo). They are exported constants of
`video/clipSound.ts`, not spec keys.

1. A line: its first sound stream, mono at 48 kHz, a plain gain of `target_lufs` minus its own
   loudness (read over the whole stream), then a limiter: limit 0.84, attack 2 ms, release 40 ms,
   no make-up level.
2. The end of the words: the start of the last silence that runs to the file end
   (`silencedetect` at -60 dB, at least 0.1 s, on the line after its gain and limiter), else the
   file end. The tail behind it is not used.
3. The voice track: the lines at their `at` times, mono, 48 kHz, 16-bit, as long as the picture.
4. The bed: its first sound stream, stereo at 48 kHz, a plain gain of `level_lufs` minus its
   loudness (read over the whole stream), cut at the picture's end.
5. Ducking: the voice track as stereo (each channel 3 dB lower) keys a side-chain compressor on
   the bed: threshold 0.03, ratio 4, attack 20 ms, release 500 ms.
6. The sum of the stereo voice and the ducked bed, no level change, then a limiter: limit 0.84,
   attack 5 ms, release 50 ms, no make-up level; encoded as stereo AAC at 48 kHz, 192 kb/s. The
   passed script set no attack and release here: 5 and 50 are the ffmpeg 8.1.1 defaults, written
   out so that another ffmpeg gets the same numbers.
7. The picture stream is copied. Tags and chapters of the inputs are not carried into the film.

## Known limits

- One bed, and it is not looped or padded. A bed up to 0.05 s short is taken as it is.
- No fade is added.
- The clips' own sound is not used.
- The numbers of the mix are fixed.
- Words shorter than 1 s are refused.
- The tool measures and prints; the pass or fail lines belong to the later film check (ticket V4).
- A hot mix can read above -1 dB true peak after the AAC step (a probe on a made-up bed read
  -0.9 dB), and then the film check of V4 fails the film.
- The byte-equal repeat holds on one machine with one ffmpeg and is not proven for the ffmpeg of
  the CI job.
- A line or bed file with a cover picture is taken: its first sound stream is used.

## Neighbours

- `clip:edit check` ([clip-edit.md](clip-edit.md)) fails the film by design (a `shape` FAIL on
  its sound stream), so check the silent cut before the sound is laid.
- The eyeball ack of the silent cut is tied to that file. It does not carry to the film, which
  needs its own look and listen before it is shown or published.
- The tie between a voice file and its paid call is not checked here (ticket V4).

## The live check after the merge

Free; a step of this ticket (ask A57), done by the Orchestrator outside the repo, which holds no
real cut and no real line.

Run `apply` on the silent rough cut of story 1 with the three real Bernard lines (beats 3, 5 and
8, at 10, 18 and 44 s) and the bed the operator chose. The spec of this run holds the levels of
the passed mix: `target_lufs` -16 and `level_lufs` -24.

Pass:

- exit 0;
- the stream hash of the film's video stream equals that of the rough cut;
- the voice track reads -16 LUFS within 1 LU;
- the film's true peak is at most -1 dB;
- the voice is at least 15 dB above the bed file while speaking;
- the operator's ear on the file, against the mix passed on 2026-11-26 ("Level is right").

Tracked: a new heading "V3 tool mix" in the record `a57-kling-voice-test-20261126.md` (probe
records of the bridlework state root) with the printed line and the measures, and one ask ledger
bullet in row A57. Until V4 is merged the measures are read with the scratch scripts of that
record. On a fail: a friction row and a fix ticket; the scratch mix stays the reference.
