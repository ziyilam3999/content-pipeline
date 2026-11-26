# clip:edit — cut sources into a silent video (A41, A57, A59)

Two verbs, both reading one spec file (schema `clip-edit/1`) and the source clips:

    npm run clip:edit -- apply --spec <file> --clips <dir> --intake <dir> --out <dir> [--spend <file>]... [--only <slug>]
    npm run clip:edit -- check --spec <file> --clips <dir> --out <dir> [--spend <file>]... [--only <slug>]

`apply` writes `<slug>.mp4`, `<slug>.edit.json` and a contact sheet under `review/` in `--out`.
It needs `--clips` and `--out` to be outside any git work tree. `check` reads the mp4 from
outside, writes nothing, and prints one `PASS` or `FAIL` line per part; on an mp4 whose size
differs from the spec's output size, the `shape` line is the one part line printed for that
video. Exit 2 is a refusal. Exit 1 is a failed part of `check` or an error in either verb; on an
error, stderr has an `error:` line and no part line is printed.

## The spec

- `output` — `width`, `height`, `fps` (whole, 1..60), `crop_top` (even, from 0), `pad_color` (`#RRGGBB`).
- `sources[]` — `id`, `file`, `sha256`, `width`, `height`, `blur[]` (boxes that hide private data
  while they play), `cut[]` (stretches not played; the `prove_absent` window of a cut is optional
  in the spec, but a cut on a played source needs one to pass the check, which else prints
  `FAIL cut: unproven`).
- `videos[]` — `slug` and `beats[]` (`n`, `clip`, `dur`, `pieces[]`): a piece is a stretch
  `{src, from, to}` or a held frame `{src, still, sec}`.

### New in A57

- `sources[].crop_top` — even whole number from 0 to below the source height: the top rows of
  this source that are cut away. Without the key a recorded source uses `output.crop_top`, so a
  spec written before A57 means what it meant; an `ai-clip` source has no crop (next section).
  The sources of one video may differ in size, frame
  rate and crop; each is cropped with its own `crop_top`, scaled to `output.width` and padded
  to the output size before the join.
- `zoom_to` on a stretch piece — a number above 1 and at most 1.25. The piece starts at zoom 1
  and ends at `zoom_to` around the centre of the picture, with an ease-in over the whole piece:
  output frame n of the N frames has zoom `1 + (zoom_to - 1) * (n / (N - 1))^2`. A zoom on the
  end of a shot only is two pieces, the second with `zoom_to`. The piece needs 2 output frames
  or more and a source without blur boxes and cuts.

The flags are the ones in the two usage lines at the top; `--spend` came with the source kind of
the next section.

### AI clip sources: `kind`, `attempt_id`, `--spend`

- `sources[].kind` — `recorded-clip` (the meaning without the key) or `ai-clip`. Any other value
  is refused (`bad-kind`).
- `sources[].attempt_id` — on an `ai-clip` source: the attempt id of its outcome line in the
  spend record, 36 characters of lower-case hex and dashes (8-4-4-4-12, as the paid tools write
  it). Missing, or of another shape, is `bad-attempt-id`. On a recorded source the key is refused
  (`attempt-on-recorded`).
- `--spend <file>` — a spend record file (JSON lines), on `apply` and on `check`, allowed more
  than once: older lines are moved to archive files, so the live record and its archive can both
  be named. The files are only read. When the flag is given each named file is read, also for a
  spec with no `ai-clip` source. `--intake` stays required on `apply`, also for a spec with
  `ai-clip` sources only.
- An `ai-clip` source needs no `clip-intake/1` record; one that is in `--intake` is ignored. It is
  accepted when at least one line of the named files holds, on that one line, `kind` `outcome`,
  `status` `ok`, the `attempt_id` of the source, a service of the AI video cap group (the
  `ai-video` entries of `SERVICE_CAP_GROUPS` in `adapters/videogen.ts`: `gemini-omni`, `runway`)
  and a `file_sha256` equal to the `sha256` of the clip file. A spec that holds an `ai-clip`
  source is refused without `--spend` (`spend-missing`), also when `--only` leaves that source
  unused.
- An `ai-clip` source has no status bar crop: without `crop_top` it is used whole (it does not
  take `output.crop_top`), and a `crop_top` other than 0 is refused (`crop-on-ai`). It is scaled
  to `output.width` and padded like any source, and a zoom piece on it works as on any source.
- The edit record (`<slug>.edit.json`) writes each piece of an `ai-clip` source with `kind`
  `ai-clip`, `source`, `sha256` and `attempt_id`; a piece of a recorded source as before.
- `check` holds each `ai-clip` source of the spec to the same rule before any part line is
  printed, so a cut is not reported as checked while its AI clip is not in the record. `check`
  takes no `--intake`.

## Refusal codes

New codes of `validateSpec` (apply and check exit 2):

- `bad-crop` — a source's `crop_top` is not an even whole number, is negative, or is not below the source height.
- `zoom-on-still` — `zoom_to` on a held-frame piece.
- `bad-zoom` — `zoom_to` is not a finite number, not above 1, above 1.25, or the piece has fewer than 2 output frames.
- `zoom-with-blur` — `zoom_to` on a piece whose source has a blur box (the blur proof of the check maps boxes without a zoom).
- `zoom-with-cut` — `zoom_to` on a piece whose source has a cut (the cut proof of the check compares frames without a zoom).

A source's crop feeds the same checks as `output.crop_top`: `box-above-crop`, `content-too-tall`.

The codes of the source kind. `validateSpec` gives the first four (apply and check exit 2):

- `bad-kind` — `kind` is not `recorded-clip` or `ai-clip`.
- `bad-attempt-id` — an `ai-clip` source whose `attempt_id` is missing, or is not lower-case hex
  in the layout 8-4-4-4-12.
- `attempt-on-recorded` — a `recorded-clip` source (the key absent or written out) holds `attempt_id`.
- `crop-on-ai` — an `ai-clip` source holds a `crop_top` other than 0.
- `spend-missing` — the spec holds an `ai-clip` source and `--spend` names no file.
- `spend-unreadable` — a named `--spend` file is missing, has no final newline, or holds a line
  that is not a JSON object. A blank line is skipped and an empty file reads as no lines.
- `not-in-spend` — no line of the named files has kind `outcome`, status `ok` and the
  `attempt_id` of the source. An attempt line alone, an outcome line of another status, and the
  right `file_sha256` under another attempt id do not count.
- `spend-not-video` — no line with kind `outcome`, status `ok` and the `attempt_id` of the source
  has a service of the AI video group (for example the line of a still picture).
- `spend-hash-mismatch` — none of those lines has the `sha256` of the clip file as `file_sha256`,
  or holds no `file_sha256`.
- `ai-as-recorded` — with `--spend` given, a `recorded-clip` source whose `sha256` is the
  `file_sha256` of a line of the named files.

`spend-missing` to `spend-hash-mismatch` are the rule for an `ai-clip` source; when more than one
code fits, the first of this order is given: `spend-missing`, `spend-unreadable`, `not-in-spend`,
`spend-not-video`, `spend-hash-mismatch`; the order is over all `ai-clip` sources of the spec, and
the line names the first source in spec order with that code. With several outcome lines for one
attempt id, the rule reads the lines of status `ok`. Each is exit 2 with one line: in `apply` nothing is written in
`--out`, in `check` no part line is printed. A `recorded-clip` source still needs its intake
record (`not-in-intake`).

### The check list of a recorded take (A59)

A `recorded-clip` source needs a ready check list in `--intake`: `<sha256>.checklist.json` (schema
`clip-checklist/1`), the file `clip intake` writes beside the intake record and a person answers.
`apply` refuses the run unless the list is ready, by the rule of `clip intake check`: it refuses
when `clip intake check --out <that folder>` prints `ready false` for the sha256 of the take, and
cuts when it prints `ready true` (the other checks of `apply` passing). Exit 2, stdout empty, one
stderr line:

- `checklist-not-ready: source <id>: <reasons>` — the reason codes `clip intake check` prints for
  that take, in its order, joined by a comma and a space (`checklist-missing`, `checklist-unreadable`,
  `open-lines`, `present-lines`, `no-looker`, `shown-no-decision`, `source-missing`,
  `intake-missing`, `sha-mismatch`, and the other codes of the check). Nothing is written in `--out`.

Each recorded-clip source of the spec is asked, in spec order, also one that `--only` leaves
unused; the line names the first whose list is not ready. The line is given in the per-source pass,
right after `not-in-intake` of the same source: after `spend-missing` and `spend-unreadable`, and
before the spend codes of an `ai-clip` source (`not-in-spend`, `spend-not-video`,
`spend-hash-mismatch`). An `ai-clip` source is not asked for a check list, and `check` takes no
`--intake` and reads no check list.

The ready rule reads the `source_path` of the intake record and the file it names: the bytes there
must still hash to the recorded sha256. An intake record written by hand needs that key, naming a
file with the bytes of the take; one with no `source_path` is refused (`checklist-not-ready` with
`intake-missing`).

The codes that were there before: `bad-schema`, `unknown-key`, `bad-number`, `bad-id`, `bad-slug`,
`bad-file`, `bad-sha`, `src-twice`, `slug-twice`, `bad-output`, `bad-box`, `box-above-crop`,
`content-too-tall`, `bad-time`, `unknown-src`, `piece-in-cut`, `still-in-cut`, `beat-order`,
`beat-length`; `spec-invalid` (a spec that cannot be read or does not pass these checks; in
`apply` also a graph filter outside the allowed list); in `apply` after the spec: `inside-repo`,
`out-missing`, `source-missing`, `source-changed`, `not-in-intake`, `checklist-not-ready`,
`ffmpeg-missing`, `ffprobe-missing`, `shape-mismatch`, `piece-past-end`, `ffmpeg-failed`, `usage`; in `check` also
`nothing-to-check` and `output-missing`.

`shape-mismatch` covers a source that cannot be probed, and a source whose size or rotation
differs from the spec. A57 added its pixel-shape meaning, in `apply`:

- `shape-mismatch` — the sources of a video differ in pixel shape, so their joined parts would
  not line up. The pixel shape of a source is 1:1 at the output width, else
  (width x scaled height) : (output width x kept rows), reduced: 240x426 beside a 360 wide
  source gives 640:639 and is refused; 240x428 gives 1:1 and is cut. Nothing is written in `--out`.

## An example (made-up values)

Two sources of different sizes in one video, a zoom on the end of the second shot:

    {
      "schema": "clip-edit/1",
      "output": { "width": 360, "height": 640, "fps": 30, "crop_top": 0, "pad_color": "#000000" },
      "sources": [
        { "id": "take-a", "file": "take-a.mp4", "sha256": "<sha256 of the file>",
          "width": 360, "height": 640, "crop_top": 80, "blur": [], "cut": [] },
        { "id": "clip-b", "file": "clip-b.mp4", "sha256": "<sha256 of the file>",
          "width": 240, "height": 400, "blur": [], "cut": [] }
      ],
      "videos": [
        { "slug": "example-cut", "beats": [
          { "n": 1, "clip": "one", "dur": 1, "pieces": [ { "src": "take-a", "from": 0, "to": 1 } ] },
          { "n": 2, "clip": "two", "dur": 2, "pieces": [
            { "src": "clip-b", "from": 0, "to": 1 },
            { "src": "clip-b", "from": 1, "to": 2, "zoom_to": 1.12 }
          ] }
        ] }
      ]
    }

A recorded take beside an AI clip in one video (made-up values):

    {
      "schema": "clip-edit/1",
      "output": { "width": 360, "height": 640, "fps": 30, "crop_top": 80, "pad_color": "#000000" },
      "sources": [
        { "id": "take-a", "file": "take-a.mp4", "sha256": "<sha256 of the file>",
          "width": 360, "height": 500, "blur": [], "cut": [] },
        { "id": "clip-b", "file": "clip-b.mp4", "sha256": "<sha256 of the file>", "kind": "ai-clip",
          "attempt_id": "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d",
          "width": 240, "height": 400, "blur": [], "cut": [] }
      ],
      "videos": [
        { "slug": "example-mix", "beats": [
          { "n": 1, "clip": "one", "dur": 1, "pieces": [ { "src": "take-a", "from": 0, "to": 1 } ] },
          { "n": 2, "clip": "two", "dur": 2, "pieces": [
            { "src": "clip-b", "from": 0, "to": 1 },
            { "src": "clip-b", "from": 1, "to": 2, "zoom_to": 1.12 }
          ] }
        ] }
      ]
    }

    npm run clip:edit -- apply --spec <file> --clips <dir> --intake <dir> --spend <record> --spend <archive> --out <dir>

`take-a` needs a `clip-intake/1` record in `--intake` and a ready check list beside it, and is cut
by `output.crop_top` (80).
`clip-b` needs none; it is used whole (240x400 scaled to 360x600) and is accepted when one line
of the two record files has `"kind": "outcome"`, `"status": "ok"`, its `attempt_id`, a service
of the AI video group and its `sha256` as `file_sha256`.

## The check

Six parts on a video without a zoom piece: `shape`, `blur`, `cut`, `bars`, `crop`, `still`.
`shape` is an ffprobe of the mp4 and reads no source. The pixel parts (the other five, and
`zoom`) use the size, `crop_top` and pad of the source they check. A video with a zoom piece
gets a seventh part, `PASS zoom` or `FAIL zoom`: the first frame of the piece must be nearest to
the source frame with no zoom, the last frame nearest to that frame scaled by `zoom_to` and cut
around the centre.

## Known limits

- The zoom is centred and eased in over the whole piece. The scaled size moves in 4 px steps, so
  the end zoom can sit a few pixels short of `zoom_to`: at `zoom_to` 1.12 a 360 wide picture
  ends at 400 wide (1.111), a 1080 wide one at 1208 (1.1185).
- The zoom is built with scale (`eval=frame`) and crop, both reading the frame time. The zoom
  tests were run with ffmpeg 8.1.1 on a Mac and with ffmpeg 6.1.1 in the ubuntu CI job.
- The sources of one video need the same pixel shape. A source whose width differs from the
  output width can get a shape of its own when its scaled height had to be rounded: 720x1280 with
  `crop_top` 110 scaled to 1080 is 1756:1755. For the 1.5 times scale of a 720 wide clip to 1080,
  a `crop_top` that is a multiple of 4 keeps 1:1 on a height that is a multiple of 4.
- An output rate above a clip's own rate shows some frames twice; below it, some are dropped.
- Scaling a 720 wide clip to 1080 makes it softer.
- The check's zoom proof needs a picture with detail: on a picture too flat to tell the zoomed
  frame from the one with no zoom it prints `FAIL zoom`. It reads the first and the last frame
  of a zoom piece, not the frames between.
- A source with a blur box or a cut cannot hold a zoom piece (`zoom-with-blur`, `zoom-with-cut`).
- The sound of the sources is dropped; the output has a video stream only.
- The edit record (`<slug>.edit.json`) keeps `output.crop_top` and does not list a source's own
  `crop_top` or a piece's `zoom_to`: the spec is the record, named in it by `spec_sha256`.
- A clip of the `video:gen` tool has no `file_sha256` in the record (its outcome line carries a
  file name), so it is refused as `ai-clip` with `spend-hash-mismatch` and is not caught by
  `ai-as-recorded`.
- A take whose file at the intake record's `source_path` was moved or removed is refused
  (`checklist-not-ready` with `source-missing`), though `--clips` holds the same bytes. Putting the
  file back at the recorded path clears it. An intake record with no `source_path` is refused the
  same way (`intake-missing`).
- A ready check list with shown lines passes the cut of a video other than the one its note names:
  `apply` asks for a ready list and does not compare the video and the clips of the note with the
  cut it makes.
- Without `--spend` a recorded-clip run still trusts the intake folder: an AI clip listed as a
  `recorded-clip` source, with a `clip-intake/1` record and a ready check list written by hand, is
  cut as a take, with the take's crop. The record needs a `source_path` that names a file with the
  bytes of the take; one with no `source_path` is refused (`checklist-not-ready` with
  `intake-missing`).
