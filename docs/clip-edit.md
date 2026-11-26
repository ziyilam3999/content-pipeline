# clip:edit — cut sources into a silent 9:16 video (A41, A57)

Two verbs, both reading one spec file (schema `clip-edit/1`) and the source clips:

    npm run clip:edit -- apply --spec <file> --clips <dir> --intake <dir> --out <dir> [--only <slug>]
    npm run clip:edit -- check --spec <file> --clips <dir> --out <dir> [--only <slug>]

`apply` writes `<slug>.mp4`, `<slug>.edit.json` and a contact sheet under `review/` in `--out`.
It needs `--clips` and `--out` to be outside any git work tree. `check` reads the mp4 from
outside, writes nothing, and prints one `PASS` or `FAIL` line per part. Exit 2 is a refusal,
exit 1 a failed part.

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
  this source that are cut away. Without the key the source uses `output.crop_top`, so a spec
  written before A57 means what it meant. The sources of one video may differ in size, frame
  rate and crop; each is cropped with its own `crop_top`, scaled to `output.width` and padded
  to the output size before the join.
- `zoom_to` on a stretch piece — a number above 1 and at most 1.25. The piece starts at zoom 1
  and ends at `zoom_to` around the centre of the picture, with an ease-in over the whole piece:
  output frame n of the N frames has zoom `1 + (zoom_to - 1) * (n / (N - 1))^2`. A zoom on the
  end of a shot only is two pieces, the second with `zoom_to`. The piece needs 2 output frames
  or more and a source without blur boxes and cuts.

No new flags: `apply` and `check` take the flags above.

## Refusal codes

New codes of `validateSpec` (apply and check exit 2):

- `bad-crop` — a source's `crop_top` is odd, negative, not a finite number, or not below the source height.
- `zoom-on-still` — `zoom_to` on a held-frame piece.
- `bad-zoom` — `zoom_to` is not a finite number, not above 1, above 1.25, or the piece has fewer than 2 output frames.
- `zoom-with-blur` — `zoom_to` on a piece whose source has a blur box (the blur proof of the check maps boxes without a zoom).
- `zoom-with-cut` — `zoom_to` on a piece whose source has a cut (the cut proof of the check compares frames without a zoom).

A source's crop feeds the same checks as `output.crop_top`: `box-above-crop`, `content-too-tall`.

The codes that were there before: `bad-schema`, `unknown-key`, `bad-number`, `bad-id`, `bad-slug`,
`bad-file`, `bad-sha`, `src-twice`, `slug-twice`, `bad-output`, `bad-box`, `box-above-crop`,
`content-too-tall`, `bad-time`, `unknown-src`, `piece-in-cut`, `still-in-cut`, `beat-order`,
`beat-length`; `spec-invalid` (a spec that cannot be read or does not pass these checks; in
`apply` also a graph filter outside the allowed list); in `apply` after the spec: `inside-repo`,
`out-missing`, `source-missing`, `source-changed`, `not-in-intake`, `ffmpeg-missing`,
`ffprobe-missing`, `shape-mismatch`, `piece-past-end`, `ffmpeg-failed`, `usage`; in `check` also
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
- The spec has no source kind: `apply` needs a `clip-intake/1` record for each source in `--intake`.
