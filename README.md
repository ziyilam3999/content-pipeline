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
| Publish | `publish/` | Posts the finished content to social (dry-run by default; nothing goes out until you say so). |

One piece is not here yet: a **weekly schedule** that regenerates content on its own.

### Media layout doctrine: every platform's primary worded post LEADS WITH VIDEO

**The durable principle (platform-agnostic):** **every platform's primary worded post LEADS WITH
VIDEO** — native video is the highest-attention medium (it earns ~10x the engagement and is native
on X, Threads, and LinkedIn), so the strongest stop-power media goes FIRST on the lead post. AND
**every worded unit ALSO carries its own card-over-art infographic** (cards best simplify the data).
This is NOT "tweet 1 = video, tweets 2-5 = cards" — that is merely the *X-specific consequence* of
the principle under the X constraint below.

How the principle is realized per platform:

- **X (Twitter)** — a single X tweet carries **EITHER images OR one video, never both**. So the lead
  is **split** into a video **hook** tweet (the highest-impression slot) + separate **card** body
  tweets; the **CTA and any hashtags go in the last tweet**; no tweet mixes image+video.
- **Threads / LinkedIn** — these platforms support a **mixed-media carousel** (a video AND an image
  in one post — the Threads API allows 2-20 mixed items, verified 2026-06-10). So the lead is a
  **single post whose first media item is the video** (it leads) and which also carries the
  card-over-art infographic.

**Which video is the hero: the full-bleed 9:16 phone cut.** The video that LEADS — both the X hook
tweet and the Threads/LinkedIn hero post — is the **full-bleed 9:16 phone-native cut** (1080x1920),
the most-watched format. We render the demo in three aspects (1:1, 4:5, 9:16), but the **published
post always leads with the 9:16 hero** — never the square (1:1) or portrait (4:5) crop. This is
**config-driven** (`config/index.ts` → `CONFIG.publish.heroVideoAspect = "9:16"`), so the hero is
selected by config, not a magic hard-code, and enforced by a **fidelity gate** (`assertHeroAspect`
in `publish/promoMedia.ts`) that **throws** if a 1:1 or 4:5 cut is used as a lead video. (#794: the
launch first went out with the square 1:1 as the X hook and the 4:5 cut on Threads — so the
full-screen 9:16 hero we built was posted nowhere; the gate now makes that miss impossible.)

This is baked as a **per-platform hard gate** in `publish/promoMedia.ts` → `assertPromoMediaComplete`
(it throws naming the offending platform/unit/kind). The gate is **per-platform, not aggregate**:
it is not enough for a video to exist *somewhere* in the batch — each video-capable platform's lead
post must ITSELF lead with video (the `PlatformPrimaryPost` shape requires `media[0]` to be the
video). On X the `PromoThread` invariant requires the hook to carry the video and no unit to mix
image+video; a soft `checkVideoFirst` warning flags when the video does not lead. Sources:
[avenuez 2025-2026 X guide](https://avenuez.com/blog/2025-2026-x-twitter-organic-social-media-guide-for-brands/),
[business.twitter video during launches](https://business.twitter.com/en/blog/4-ways-to-use-video-during-product-launches-on-twitter.html),
[usevisuals twitter threads 2025](https://usevisuals.com/blog/writing-effective-twitter-threads-2025),
[buffer twitter video](https://buffer.com/library/twitter-video/amp),
[Threads API mixed-media carousel](https://www.threads.com/@threadsapi.changelog/post/DAWFiK2BE6m).
The per-tweet card set is rendered by `smoke/launch-card.ts` (`launchCardSet()`), which fans ONE
generated background out behind all the distinct info-cards.

### Art doctrine: per-post UNIQUE art, within-post shared, cross-post guarded

**Every NEW post gets its OWN distinct background artwork.** Cards in the SAME post may share one
piece of art (one paid gen, reused behind that post's cards — cheap and consistent), but a new post
must **never** inherit the previous post's art. This is realized three ways:

- **Post-scoped art cache key.** `generateArtOnce(..., {postSlug})` (`smoke/launch-card.ts`) keys the
  art cache to `_art-base-<postSlug>.png`. A new post has no such file yet → cache MISS → it must
  generate fresh art. (The old single global `_art-base.png`, keyed to nothing, silently handed
  post #2 post #1's art — the bug this fixes. An omitted slug keeps the legacy path for post #1.)
- **Distinct per-post prompt.** Each post supplies its own art-theme prompt (`promptExtra`) so the
  generations actually differ in palette and motif (e.g. post #2's builder / red→green build-loop
  theme vs post #1's benchmark-data theme).
- **Cross-post uniqueness registry (fail-loud).** `smoke/fixtures/art-registry.json` maps
  `<postSlug> → sha256(art)`. Before a post ships its art, `assertArtUnique` (`smoke/art-registry.ts`)
  throws if that exact art hash is already registered to a DIFFERENT post — so a silent cross-post
  reuse can never ship. The #790 auto-fit/overflow gate stays intact on top of this.

## How it's built

Each stage was built test-first: a test describing what the stage must do was
written first, then the code was written until that test passed. So the tests in
each `__tests__/` folder are the real specification of how a stage behaves.

### Built by an AI builder (dogfood)

This whole app was the first real-world job for a separate project — an AI coding
agent called [local-first-agent-harness](https://github.com/ziyilam3999/local-first-agent-harness).
It builds software by writing the test first, then doing the work on a cheap model
running on the developer's own laptop, and only escalating to a cloud model when the
local one gets stuck. The real numbers from it building this app:

| Measure | Result |
|---|---|
| Build phases shipped | **13 / 13** (100%) |
| Solved by the free local model | **11 / 13** — only the 2 hardest phases escalated to the cloud |
| Passed on the first try | **11 / 13** (1.15 attempts per phase on average) |
| Total cloud cost for the whole build | **$12.56** (~$0.97 per phase); the local model's work was free |

Every phase shipped only when two independent checks agreed: the builder's own
reviewer **and** the real jest test suite — never an AI grading its own work.

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
- Releases are cut by the `/ship` pipeline (Stage 7) — the same client-side flow
  every repo in this fleet uses. It bumps the version in `package.json` from the
  conventional-commit history, prepends a `CHANGELOG.md` section, opens a release
  PR, and after that merges it tags `vX.Y.Z` and creates the GitHub Release from
  the changelog section. There is no tag-triggered release Action — `/ship` owns
  it end-to-end so the flow is identical across repos.

## License

Private / unlicensed. Not for public distribution.
