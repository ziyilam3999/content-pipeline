# content-pipeline

Turn a launch announcement into ready-to-post social content.

You give it the facts about something you're launching. It produces the pieces
you need to post about it: the written copy, an image card, a voiceover script,
and the layout specs for short videos in the common phone/desktop shapes. Every
piece is generated from the same set of facts, so they stay consistent — and a
built-in checker flags numbers or claims that don't match what you gave it.

The name says what it does: content goes through a **pipeline** of stages, each
one adding a piece.

## The stages

| Stage | Folder | What it produces |
|-------|--------|------------------|
| Config | `config/` | One place that holds the settings: aspect ratios, the caption safe-band, which voice provider to use. |
| Inputs | `inputs/` | Reads a launch spec and turns it into clean, structured facts (with guardrails on what each fact may claim). |
| Copy | `copy/` | Writes the social post text — and a verifier double-checks every number/claim against the facts. |
| Image | `image/` | Lays out a shareable result-card. Deterministic by default; optional generated art is off unless you turn it on. |
| Audio | `audio/` | Builds a voiceover request: a paid voice first, a free voice as backup, and the real clip length. |
| Video | `video/` | Splits the script into phone-friendly captions and produces render specs for three shapes (square, vertical, portrait) with a safe-band so captions clear the phone UI. |
| Pipeline | `pipeline/` | Wires the audio and video pieces together so captions line up with the voiceover. |

Two stages are not here yet: **publish** (post to social, dry-run first) and a
**weekly schedule** that regenerates content on its own.

## How it's built

Each stage was built test-first: a test describing what the stage must do was
written first, then the code was written until that test passed. So the tests in
each `__tests__/` folder are the real specification of how a stage behaves.

## Getting started

```bash
npm install
npm run typecheck   # strict TypeScript check
npm test            # run the full jest suite (9 suites, 87 tests)
```

## Contributing

- Work on a branch, open a pull request — the repo doesn't take direct pushes to `master`.
- CI must be green: `typecheck` + `test` run on every PR (Linux and Windows).
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit
  messages (`feat:`, `fix:`, `chore:`, `docs:` …). CI checks this on merge, and
  the release notes are generated from these messages.
- Releases: bump the version in `package.json`, add a section to `CHANGELOG.md`,
  then push a tag `vX.Y.Z`. The Release workflow turns that changelog section
  into a GitHub Release.

## License

Private / unlicensed. Not for public distribution.
