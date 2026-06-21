---
slug: agent-kanban-demo
title: "Your agents, finally legible"
aspect: 9:16
target_runtime_sec: 80
---

# Storyboard v2 — "Your agents, finally legible" (#1120 re-do, from scratch)

Spine APPROVED by operator (2026-06-21). Vertical **9:16**, target **~76–80s** (final beat lengths fit to the
measured VO via #1095 `fitBeatsToVo` — the seconds below are DESIGN targets / animation minimums, not hand-locks).
This redesigns `video/kanbanStoryboard.ts` from scratch around the **v0.7.0 self-explaining card** (the phase line
on every card face) instead of patching the old #1063 board (which hid verdicts in a drawer).

## Execution model
DESIGN artifact for operator sign-off — authored INLINE by the orchestrator (narrative/director design, not code; the
operator explicitly asked to draft the storyboard before any capture). The downstream BUILD this approves
(`kanbanStoryboard.ts` rewrite + `captureKanbanAssets.ts` extension + capture + render) is non-trivial multi-file
code-work → DELEGATED via the 3-role model (planner → plan-review → executor → execution-review) as PR-B in a fresh
`feat/1120-kanban-demo-redo` worktree, per the parent plan `2026-06-21-1120-kanban-demo-redo.md`. This doc itself
authors zero code and shipped nothing — it is the storyboard spec the PR-B executor builds to.

## Design rules carried in
- Showcase the v0.7.0 upgrade: the **plain-words phase line on every card face** — `QUEUED` · `▶ WORKING/STARTED/<ROLE>`
  (mint, pulsing when live) · `◆ REVIEW · <VERDICT>` · `✓ DONE · <VERDICT>`. The **verdict-on-face** + the **live
  heartbeat** are the two hero moments.
- Hard production constraint (verified in `lib/ui-meta.ts` + `lib/board-schema.ts`): a face-VERDICT renders ONLY for
  `in_review`/`done` → only in **columns 3–4**. So every verdict beat frames **cols 2–3 (In Progress + In Review)**,
  never cols 1–2. Prove CONTAIN (no L/R slice of a third column).
- Capture machinery reused (`tools/captureKanbanAssets.ts`): ONE committed provenance-hashed still
  (`assets/kanban-demo/board-overview.png`, DSF 3) + gitignored dynamic clips. Don't reinvent — extend.
- Narrative causality (operator lesson): a state change must show its TRIGGER on screen (the card MOVES, then the
  verdict appears — not a verdict from nowhere). Frame-economy + safe-area gates still apply.
- ≤3 narration lines carry real "look at THIS" payload; no padding/rushing (#1095).

## Board snapshot the capture needs (one `data/board.json` active session)
Craft an active session whose cards give every beat a real target:
- **In Progress:** one LIVE card → `▶ WORKING` (mint, pulsing) — the heartbeat hero (beat 4). One pipeline card →
  `▶ EXECUTOR` (or `▶ PLANNER`) for beat 5.
- **In Review (top of column):** a card whose comments include an `execution-review`/`plan-review` comment with a
  non-empty `verdict` so the face renders `◆ REVIEW · PASS` (NOT bare `◆ REVIEW`). This is the beat-6 hero + the
  beat-7 landing slot.
- **Done:** a card with `✓ DONE · PASS` (visible in the wide reveal + lanes pan).
- Subjects must be brand-safe + self-explanatory (this is a public post).

## The 10 beats

| # | Beat | Dur* | Asset | Framing / camera | Highlight | Narration (draft) |
|---|------|------|-------|------------------|-----------|-------------------|
| 1 | **Hook — flying blind** | ~7s | synth (no board) | Dark brand bg; a prompt fires to "agents," then `?` glyphs / silence | — | "You hand work to AI agents… then you're flying blind. Which one's stuck? Done? Waiting on *you*?" |
| 2 | **Reveal the board** | ~7s | committed-adjacent still (full board, all 4 cols) | Board slides up; slow push-in (clipPanZoom 1.0→1.06) | soft vignette on the column headers | "This board answers it at a glance." |
| 3 | **Self-explaining lanes** | ~9s | wide still | Slow L→R pan across `QUEUED → ▶ WORKING → ◆ REVIEW · PASS → ✓ DONE` | a light underline sweeping each phase line as it passes | "Every card says where it is — plain words, right on its face." |
| 4 | **The live heartbeat** ⭐ | ~8s | **dynamic clip** (pulse) | Cols 2–3; push-in onto the `▶ WORKING` card, mint breathing | ring on the `.ak-live`/`.ak-phase` mint pill | "The one it's working on *right now* breathes." |
| 5 | **Names the role** | ~7s | still crop | Tight on a pipeline card showing `▶ EXECUTOR` | ring on the `▶ <ROLE>` token | "For multi-step work, it names the exact role on the job." |
| 6 | **Verdict on the face** ⭐ | ~9s | **COMMITTED hero still** `board-overview.png` (cols 2–3, DSF 3) | Settled 2-col window: In Progress (left) + In Review (right); push-in onto the top In-Review card | ring on the `◆ REVIEW · PASS` face line (re-measured `.ak-phase`) | "And in review? The verdict's right there — no digging to find out *why*." |
| 7 | **Causal move** ⭐ | ~10s | **dynamic clip** (card-move, lands In Review) | Cols 2–3; card lifts from In Progress, crosses, LANDS in In Review; phase line flips `▶ WORKING → ◆ REVIEW · PASS` on land; push-in on the landed face line | grow/land glow (existing) + the flip | "Watch it move — and explain itself the instant it lands." |
| 8 | **Depth on tap** | ~9s | **dynamic clip** (drawer-open) | Tap the landed card → timeline drawer: role ledger rows + verdict pills + elapsed | sweep down the role/verdict rows | "Want the whole story? Tap in — every role, every verdict, every timing." |
| 9 | **Payoff** | ~6s | dynamic clip or still+motion | Pull back to the whole board; subtle breathing across live cards | — | "Your AI agents — finally legible." |
| 10 | **CTA** | ~5s | synth (no board) | Brand bg; handle / link / repo | — | (CTA copy — handle + "agent-kanban") |

*Dur = design target / animation minimum; final locked by `fitBeatsToVo` against the measured VO.

⭐ = the three beats that carry the v0.7.0 headline (live heartbeat · face-verdict · causal flip). Beat 6 is the only
COMMITTED, provenance-hashed frame → it is the deterministic both-ends AC anchor (the extracted-frame `◆ REVIEW · PASS`
glyph probe runs on its bytes).

## What changes vs the old #1063 storyboard
- DROP: the old session-picker beat (beat 5) and the "idle vs active badge" framing — superseded by the phase line.
- REFRAME: the committed still moves cols 1–2 → **cols 2–3** (face-verdict on screen); the card-move lands in **In
  Review** (was In Progress) so the verdict appears causally.
- ADD: a dedicated **heartbeat** clip (beat 4) + a **role-name** crop (beat 5) + a **lanes pan** (beat 3) — the three
  new "the card explains itself" moments.
- KEEP + REUSE: the drawer-open clip (beat 8, now framed as "depth on tap"), the grow/land glow, clipPanZoom push-ins,
  all gates, the publish runbook (draft 9588485), DSF 3, the 2-col window machinery (re-pointed to cols 2–3).

## New capture assets the implementation must produce (PR-B)
1. `board-overview.png` — DSF 3, 2-col window **cols 2–3**, settled to frame the `▶ WORKING` badge (left) + top
   `◆ REVIEW · PASS` card (right). Print sha256/bytes + re-measured `.ak-live`/`.ak-phase` boxes.
2. dynamic `clip-heartbeat.mp4` — push-in on the pulsing `▶ WORKING` card (≥4 distinct frames proving the pulse).
3. dynamic `clip-card-move.mp4` — lift In Progress → land In Review, phase flip on land (≥4 distinct frames).
4. dynamic `clip-drawer-open.mp4` — drawer with role ledger + verdict pills.
5. wide-board still(s) for beats 2–3 (full board + lanes pan source).
6. synth frames for beats 1 + 10 (brand intro/outro — reuse the existing hook/CTA treatment).

## Open question for the operator (in the reply)
- Beats 4 + 5 (heartbeat + role-name) add two capture targets and ~15s. The "tighter ~6-beat" alt would cut them.
  You picked the full spine — confirming the 10-beat length is what you want, or trim 5 (role-name) if it feels redundant
  next to 4 (heartbeat).

## Status
DESIGN draft for operator sign-off. NO capture / NO code yet. On approval → PR-B 3-role build: implement
`kanbanStoryboard.ts` + extend `captureKanbanAssets.ts` → capture → silent render → EYEBALL → stop at first paid call.
