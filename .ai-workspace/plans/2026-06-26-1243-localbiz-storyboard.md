# Plan #1243 — Storyboard reframe for the local-small-business automation pitch

Repo: `~/coding_projects/content-pipeline`. Role: PLANNER (plan only, no code).

cairn: T1 hit (storyboard) — "PROVEN-GOOD recipe for a PRODUCT-DEMONSTRATION category promo video" and
"A storyboard-confirm gate before any capture/paid/render step is a real human gate." Lessons:
`feedback_demonstration_category_video_recipe` (the R1–R13 contract), VO-first natural order
(`storyboard → script → VO → fit length to measured VO`). No hits contradicting this plan.

## Goal
Add a NEW short-form storyboard arc that sells **custom automation services to local small-business owners**,
WITHOUT touching any existing post. The arc is **hook → before/after → time+money saved → real use cases**,
and the LEAD FRAME is a concrete time/money number (e.g. "this shop owner got back 5 hours a week"). Ship it the
same way every post ships: a storyboard design doc + a code module that builds a `DemoVideoSpec` + a spec test
that mechanically proves the arc renders. Capture / paid-VO / publish stay a separate operator-gated leg.

## Current structure (what I found, with file:line refs)
The pipeline has ONE generalized, fail-closed contract for short-form videos and several per-post storyboards
that each build a spec fed to that contract:

- **The contract** `video/demoCategoryRecipe.ts`:
  - `DemoVideoSpec` interface `video/demoCategoryRecipe.ts:200-230` (beats, aspects, beatLayouts, runtime band,
    captions, optional `shape`, optional `videoType`).
  - `DemoBeatKind = hook|chat|tool|transition|output|payoff|cta|title` `:96-104`.
  - `DemoSpecShape = "tool-demo" | "feature-tour"` `:197`. `feature-tour` is the per-spec opt-out that SKIPS the
    agent-interface rules R3 (chat + tool) and R5 (transition) ONLY — every other rule still runs `:339-403`.
  - `assertDemoCategoryRecipe(spec)` `:292-510` — R1 captured-footage spine, R2 hook first, R3/R5 (skipped for
    feature-tour), R4 output beats labeled + distinct-from-tool bg, R6 hero-output provenance (only fires for
    `isHeroOutput` beats), R7 terminal ≤30%, R8 runtime band, R9 dev/brand/owner-clean copy, R10 no placeholder
    URLs, R11 title-safe + fill geometry, R12 real-voice-synced captions REQUIRED, R13 9:16 aspect discipline,
    R18 contain-fit for inset assets.
  - Band default `VIDEO_TYPE_BAND.demo = {110,180}` `:240`; a spec may PIN its own band (`spec.runtimeWindowSec ??`
    `VIDEO_TYPE_BAND.demo` `:444`) — kanban pins {130,165}, forge {92,100}, fable {85,92}.
- **Per-post storyboards** (the SSOT pattern to mirror): `video/kanbanStoryboard.ts` (BEATS array + VO_LINES +
  `buildKanbanSpec()` → `kanbanSpec` `:459-507`), `video/forgeStoryboard.ts`, `video/fableStoryboard.ts:49-71`
  (the smallest, cleanest template). Each is "pure data + tsc/jest-gated, NO Playwright/ffmpeg/network/paid call."
- **Design docs** `storyboards/_TEMPLATE.md` (front-matter + beats table + capture-assets + both-ends AC anchor)
  and the worked example `storyboards/agent-kanban-demo.md`.
- **Test oracle pattern** `video/__tests__/kanbanSpec.test.ts:49-90` — asserts the spec PASSES the recipe, asserts
  beat shape/order/count, and a BOTH-ENDS test (stripping a required beat FAILS a named rule).
- **Decoupling proof**: `storyboardGate.test.ts` uses a TEMP `storyboardRoot` fixture (`:29,42`) — it does NOT glob
  the real `storyboards/` dir, so a new doc breaks nothing. `PostSlug` `publish/publishAssets.ts:17-25` is a closed
  union used only by the PUBLISH leg — the test-gated structure deliverable does NOT depend on it.

Key finding: the new arc is a **sales pitch, not an agent-tool demo** — it has no chat/tool/transition beats, so the
`feature-tour` shape (skip R3/R5, keep the rest) is the intended, already-existing escape hatch. No new videoType,
no edit to the shared validator/config is needed.

## Proposed change (new template, not a rewrite)
Add THREE new files; modify NONE of the existing posts (so existing content cannot break):

1. **NEW `video/localBizPitchStoryboard.ts`** — the new arc, mirroring `fableStoryboard.ts`/`kanbanStoryboard.ts`:
   - A local beat type carrying `arcRole: "hook" | "before-after" | "time-money" | "use-cases" | "payoff" | "cta"`
     PLUS the coarse `kind: DemoBeatKind` it maps to. `arcRole` is what the test asserts the ORDER on (the recipe's
     `DemoBeatKind` is too coarse — before-after/time-money/use-cases all map to `output`).
   - `buildLocalBizSpec()` → a `DemoVideoSpec` with `shape: "feature-tour"`, `videoType: "demo"`, a pinned
     `runtimeWindowSec` (design target ~80–95s; see Risks if a hidden gate forces ≥110s), captured-footage spine on
     the before/after + use-case beats, labeled output beats, real-voice-synced caption stub bound to the spec
     runtime (mirror `kanbanCaptions()` `kanbanStoryboard.ts:418-425`).
   - Reuse imports: `BG_TOOL, BG_OUTPUT_A` from `./fableStoryboard`; `FABLE_ASPECTS, FableBeatLayout` from
     `./fableLayout`; types from `./demoCategoryRecipe`. NO new geometry — reuse the fable/kanban layout boxes.
2. **NEW `storyboards/local-biz-automation.md`** — design doc from `_TEMPLATE.md` (front-matter slug
   `local-biz-automation`, the 6-row beats table, capture-assets list, both-ends AC anchor, open questions).
3. **NEW `video/__tests__/localBizPitchSpec.test.ts`** — the test oracle (see Acceptance Criteria).

Publish-leg work (register the `PostSlug`, add a `smoke/`, capture real assets, paid VO) is OUT of the core slice and
stays operator-gated — see Build steps 4, Risks, and Deferred-follow-ups.

## New arc beats (time+money is the LEAD)
Order + recipe mapping. `LEAD` = the concrete time/money framing.

| # | arcRole | kind | LEAD | On-screen / content | Background |
|---|---------|------|------|---------------------|------------|
| 1 | hook | `hook` | **YES** | Headline is a concrete number — "This shop owner got back **5 hours a week**." Sub: one line of context. The scroll-stopper IS the number. | BG_TOOL (dark brand) |
| 2 | before-after | `output` | — | Split / sequential: the MANUAL "before" (owner doing the repetitive task by hand) vs the AUTOMATED "after" (it runs itself). Real captured footage. Label "before → after". | BG_OUTPUT_A (cream) |
| 3 | time-money | `output` | **YES (emphasis)** | The quantified payoff card: "**5 hrs/week** · **$NNN/month** back." This is the hero emphasis of the whole arc. Label "time + money saved". | BG_OUTPUT_A |
| 4 | use-cases | `output` | — | 3–4 concrete real automations (e.g. missed-call text-back, review requests, invoice follow-ups, booking reminders). Real captured footage. Label "real use cases". | BG_OUTPUT_A |
| 5 | payoff | `payoff` | — | Recap: "Your time back. Their busywork, automated." | BG_TOOL |
| 6 | cta | `cta` | — | "Book a free automation audit" + a REAL booking URL (operator-supplied; R10 forbids placeholder/example.com). | BG_TOOL |

Rationale for "lead frame = time/money": R2 forces the hook to be beat 1; we make the hook's HEADLINE a concrete
time/money figure (beat 1), and add a dedicated quantified time-money beat (beat 3) as the arc's hero emphasis — so
the number both opens the video and anchors its middle. Beats 2/4 are `captured-footage` so R1's real-footage spine
holds. Core arc = beats 1–4 (the four required arc segments); beats 5–6 are the standard payoff/CTA bookends every
shipped post carries.

## Build steps
1. Author `video/localBizPitchStoryboard.ts`: the 6-beat array (arcRole + kind + label + durations summing into the
   pinned band), `LOCALBIZ_VO_LINES` (≤ a few load-bearing lines), beat layouts (reuse fable/kanban boxes), and
   `buildLocalBizSpec()` returning the `feature-tour` `DemoVideoSpec`. Pure data; no capture/network/paid call.
2. Author `storyboards/local-biz-automation.md` from `_TEMPLATE.md` with the beats table above, the capture-assets
   list, and the both-ends AC anchor description. Mark Status = "DESIGN spec for operator sign-off."
3. Author `video/__tests__/localBizPitchSpec.test.ts` (the oracle — see Acceptance Criteria).
4. (OUT OF CORE SLICE — operator-gated publish leg; see Deferred-follow-ups) register `local-biz-automation` in
   `publish/publishAssets.ts`, add `smoke/`, capture real before/after + use-case footage, generate the time-money
   results card, run `npm run storyboard:approve -- local-biz-automation`, then paid VO.
5. Run `npx tsc --noEmit` and `npm test` — both green.

## Acceptance Criteria (testable, no paid render)
A new `video/__tests__/localBizPitchSpec.test.ts` (mirroring `kanbanSpec.test.ts`) asserts:
- **AC1 recipe pass**: `expect(() => assertDemoCategoryRecipe(localBizSpec)).not.toThrow()`.
- **AC2 arc order**: the `arcRole` sequence of the storyboard beats equals
  `["hook","before-after","time-money","use-cases","payoff","cta"]` (core arc = the first four, in that order).
- **AC3 lead frame**: beat 1 is `kind:"hook"` and its headline matches a time/money figure regex
  (e.g. `/\d+\s*(hours?|hrs?|minutes?|min|\$|dollars?)/i`); AND a `time-money` beat exists with a quantified label.
- **AC4 feature-tour, not tool-demo**: `localBizSpec.shape === "feature-tour"` and there is NO `chat`/`tool`/
  `transition` beat (this arc legitimately opts out of R3/R5).
- **AC5 spine + band**: ≥1 beat has `vehicle:"captured-footage"`; total runtime ∈ the spec's declared band; terminal
  share = 0.
- **AC6 both-ends (proves the order is enforced)**: a spec with beat 1 replaced by a non-hook beat FAILS
  `/demo-recipe R2/`; reordering so `time-money` precedes `before-after` FAILS AC2's order assertion.
- **AC7 hygiene**: `npx tsc --noEmit` exits 0 and `npm test` exits 0 (whole suite, existing posts still green).

## Verification plan (execution-review leg)
- Run `cd ~/coding_projects/content-pipeline && npx tsc --noEmit` → exit 0.
- Run `npm test -- localBizPitchSpec` → the new oracle passes; then `npm test` → full suite green (proves no existing
  post regressed). The reviewer reads the new test to confirm AC2/AC3/AC6 are asserted mechanically (not just AC1).
- Confirm NO existing file under `video/`, `storyboards/`, `publish/` was modified (the new arc is additive):
  `git diff --name-only origin/master` shows only the three new files (+ optional publish-leg files if explicitly
  scoped). Confirm `git grep -nE "/Users/|<employer-token>"` finds nothing in the new files.
- Confirm the storyboard doc and module carry NO real email, NO employer/brand token, and the CTA URL is either a
  real operator-supplied booking URL or flagged as an operator-input item (NOT a placeholder — R10 would reject it).

## Risks
- **R-band**: pinning a sub-110s band is mechanically allowed (`spec.runtimeWindowSec ??`), but a hidden test may
  enforce {110,180} for new demos. Mitigation: if `npm test` flags it, either pin nothing (inherit {110,180} and
  lengthen dwell to ~150s) or add the new band to that test — executor's call; AC5 stays band-agnostic.
- **R-provenance vs quality bar (Rule 19)**: the core slice has NO `isHeroOutput` beat, so R6 is vacuous and the
  test goes green on pure data. That is structurally honest (a storyboard, like the kanban doc's "DESIGN spec for
  sign-off") but the DEMO-QUALITY bar wants ONE committed, provenance-hashed both-ends frame. Recommended (publish
  leg, operator-gated): promote the `time-money` beat to a committed results card generated by the existing
  launch-card machinery → real provenance → an OCR/pixel probe for the "$"/"hrs" glyph as the both-ends anchor.
  Do NOT bake a fake/stub hero just to look hero-y (R6 + Rule 19 forbid it).
- **R-CTA URL**: R10 rejects placeholder/example.com URLs on-screen. The booking URL is an operator-input item —
  surface it as an ELI5 question; do not invent one.
- **R-feature-tour semantics**: the `feature-tour` doc comment ties it to "a live product surface." Using it for a
  sales arc is a slight semantic stretch but mechanically exact (it only skips R3/R5, which this arc genuinely lacks).
  Documented in the module header so a future reader isn't surprised.
- **R-content honesty**: before/after + use-case beats must bind REAL captured footage at publish time (no
  hallucinated UI — R1 forbids generative-video). The core slice only declares the structure; capture is the gated leg.

## Deferred-follow-ups:
- Publish leg (register `local-biz-automation` PostSlug, add `smoke/`, capture real before/after + use-case footage,
  generate + commit the time-money results card with provenance, storyboard:approve, paid VO) — DEFERRED, operator-gated.
  → file a follow-up task when the operator green-lights capture/publish for this post.
- Promote the `time-money` beat to a committed provenance-hashed hero (both-ends OCR/pixel anchor) — DEFERRED to the
  publish leg above. → folds into the same follow-up task.
- CTA booking URL — DEFERRED to operator input (R10 forbids a placeholder). → surface as an ELI5 question before publish.

## Review

**Decision: PASS** (no HIGH; 2 MED surfaced as executor guidance + deferral checks; 3 LOW folded). Reviewed adversarially against the live repo (`~/coding_projects/content-pipeline` @ master `8e5cab6`). The plan is additive, test-gated, and correctly defers the paid/publish leg. Verified claims below.

### Verified against the repo
- **Integration point is real.** `DemoVideoSpec`/`DemoBeat`/`DemoSpecShape="tool-demo"|"feature-tour"`/`assertDemoCategoryRecipe` all exist in `video/demoCategoryRecipe.ts` as cited; `feature-tour` (`:343`) skips ONLY R3/R5 and runs every other rule — exactly the escape hatch this sales arc needs (no chat/tool/transition beats). `fableStoryboard.ts`/`kanbanStoryboard.ts` are the right SSOT to mirror; `kanbanSpec.test.ts` is the right oracle pattern (recipe-pass + shape + BOTH-ENDS `toThrow(/demo-recipe R3/)`). `_TEMPLATE.md` front-matter (slug/aspect 9:16/target_runtime_sec) matches the plan's doc shape.
- **R6 provenance is genuinely vacuous without a hero.** `outputBeats = beats.filter(b => b.isHeroOutput)` and R6 fires only per `isHeroOutput` beat — confirmed. Core slice declares no hero, so R6 no-ops and the BAKE is green on pure data with NO committed stub asset. Structurally honest; the plan explicitly forbids baking a fake hero. **Criteria 3 & 5: PASS.**
- **Band risk is over-stated (good that it was flagged).** fable pins `{85,92}` and forge `{92,100}` — sub-110 pinned bands already ship green on master, so the plan's ~80–95s target is precedented, not risky. (kanban's `{130,165}` plan citation is CORRECT — it matches the `kanbanSpec.test.ts` assertion; the `{74,84}` prose in `demoCategoryRecipe.ts:238` is a stale repo comment, not the binding value.) AC5 staying band-agnostic is the right hedge.
- **Additive safety holds.** No test globs the real `storyboards/` dir or iterates the `PostSlug` union (grep for `readdirSync|glob|PostSlug|forEach.*storyboard` over `video/__tests__` = no matches); `storyboardGate.test.ts` uses a temp `storyboardRoot` + slug `"demo-post"`. `tsc` doesn't read markdown front-matter. So committing a doc whose slug isn't yet a `PostSlug`, plus three new files, breaks nothing.

### MED findings (surface — fold as executor guidance, do NOT bounce)
- **MED-1 — CTA URL handling must be spelled out in committed code.** `DemoBeat` has NO `url` field; URLs live as strings inside `onScreenText[]`, and R10 (`assertNoPlaceholderUrls`, `visualRedFlags.ts`) scans every `onScreenText` entry. That checker is a **no-op when no URL/placeholder token is present** (`:74`). Existing storyboards (`fableStoryboard.ts:70`, `kanbanStoryboard.ts:368`) put a REAL github URL in `onScreenText`. This arc has no operator URL yet. **Executor instruction (fold into Build step 1 / AC):** commit the CTA beat with CTA copy only ("Book a free automation audit") and **NO URL string in `onScreenText`** — do NOT copy fable/kanban's `url:` line. The denylist also rejects `<...>` templates, `example.*`, `your-(repo|org|handle|name|user)`, literal `placeholder`, and `TODO` — so no stub/angle-bracket URL either. Real booking URL is appended to `onScreenText` at publish time (operator-input ELI5). This keeps R10 vacuously satisfied and the BAKE green. **Criteria 4: satisfied via clean omission.**
- **MED-2 — videoType/aspect tension is a PUBLISH-leg open question, not a BAKE blocker.** `videoType:"demo"` has canonical OUTPUT aspect 16:9 (`VIDEO_TYPE_ASPECT` #1164 → `dimensionsForVideoType("demo")` = 1920×1080), while the plan/template declare a 9:16 short with `FABLE_ASPECTS`. This is NOT in the assertion path — R13 only runs `assertPhoneFullScreenAspectDiscipline(spec.aspects)`, which `FABLE_ASPECTS` (9:16 spine) satisfies — and **kanban, a shipped `videoType:"demo"`, already pairs 9:16 `FABLE_ASPECTS` with the demo type**. So mirroring kanban is correct & precedented; `tsc`+`jest` stay green. Carry into the publish leg: confirm the renderer resolves a 9:16 "demo" short to the 9:16 spine (same open question kanban carries), or whether a distinct videoType is warranted. No action for the BAKE.

### LOW findings (folded as executor notes)
- **L1** — `_TEMPLATE.md` front-matter says `slug MUST equal a PostSlug in publish/publishAssets.ts`, but registration is (correctly) deferred. Nothing enforces it for the BAKE (verified above). Executor: set the doc Status to "DESIGN spec — PostSlug registration deferred to publish leg" so a future reader/gate isn't surprised.
- **L2** — Plan imports `BG_TOOL, BG_OUTPUT_A` "from `./fableStoryboard`"; those are re-exports (`fableStoryboard.ts:25` re-exports from `./brandTokens`). Works either way; `./brandTokens` is the canonical source if the executor prefers it.
- **L3** — AC3's regex `/\d+\s*(hours?|hrs?|minutes?|min|\$|dollars?)/i` correctly matches "5 hours"; mechanically sound. Keep it asserted on beat-1's headline string within `onScreenText`.

### AC / verification check
ACs are all `tsc`+`jest`, no Playwright/ffmpeg/network/paid — clean. AC2 keying order on a local `arcRole` (not the too-coarse `DemoBeatKind`, where before-after/time-money/use-cases all map to `output`) is the correct discriminator. AC6 both-ends is real: R2 throws `/demo-recipe R2/` (confirmed `:334`), and the reorder check exercises AC2. AC3 lead-frame is mechanically enforced (regex), not narrated. Verification plan correctly checks `git diff --name-only origin/master` is the three new files + privacy grep. **Criteria 1, 2, 6: PASS.**

Follow-ups: no NEW deferred items introduced by this review — all deferrals (publish leg, provenance hero, CTA URL) are already accounted for in the plan's `## Deferred-follow-ups:` section above; MED-2's renderer-aspect check folds into that same publish-leg follow-up.

— PLAN-REVIEWER (role 2/4), task #1243
