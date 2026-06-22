---
slug: agent-kanban-demo
title: "Your AI agent, finally legible"
aspect: 9:16
target_runtime_sec: 140
---

# Storyboard — "Your AI agent, finally legible" (#1120 extended cut, 14 beats / ~140s)

Vertical **9:16**, target **~140s** (∈ the demonstration-category demo band {110,180}; final beat lengths fit to the
measured VO via #1095 `fitBeatsToVo` — the seconds below are DESIGN targets / animation minimums, not hand-locks).
This is the EXTENDED re-cut of the v2 "finally legible" board tour: it KEEPS the v0.7.x **self-explaining card** (the
plain-words phase line on every card face) AND restores a short **agent-interface setup** (chat → tool → board) at the
front, then DEEPENS the board tour with four added feature beats (session picker, phase line, parent epic, multi-verdict
drawer). The two operator pains it fixes: (a) the recurring **left-edge "haircut"** (board sliced on the LEFT) — fixed at
the capture source (stale horizontal `scrollLeft` reset + flush 2-col + a both-ends CONTAIN assert); (b) **too short at
77s** — extended to ~140s with real dwell on each feature.

## Design rules carried in
- Showcase the self-explaining card: the **plain-words phase line on every card face** — `QUEUED` ·
  `▶ WORKING/<ROLE>` (mint, pulsing when live) · `◆ REVIEW · <VERDICT>` · `✓ DONE · <VERDICT>`. The **phase line**,
  the **live heartbeat**, the **on-face verdict**, and the **multi-colored drawer verdicts** are the hero moments.
- Agent-interface reframe (R3/R5): the tool is the AGENT's interface, not the human's. Beat 2 (chat, plain English) →
  beat 3 (the real pipeline running on the dark tool world) → beat 4 (silent transition, work surfaces onto the board).
- Hard production constraint: a face-VERDICT renders ONLY for `in_review`/`done` → every verdict beat frames **cols 2–3
  (In Progress + In Review)**, never cols 1–2. Prove CONTAIN (no L/R slice).
- Capture machinery reused (`tools/captureKanbanAssets.ts`): ONE committed provenance-hashed still
  (`assets/kanban-demo/board-overview.png`, DSF 3, beats 6/8/10) + gitignored dynamic clips + a gitignored open-drawer
  still. Don't reinvent — extend. Every board capture resets `scrollLeft=0` + flushes the 2-col layout (the clip-fix).
- Narrative causality (operator lesson): a state change must show its TRIGGER (the card MOVES, then the verdict appears).
- Terminal share = the single tool beat (8/140 = 5.7% ≤ 30%, R7). No planned silent gap >1.5s (the #1091 silence-gate).

## Board snapshot the capture needs (one `data/board.json` active session)
- **In Progress:** one LIVE card → `▶ WORKING` (mint, pulsing) — the heartbeat hero (beat 7). One pipeline card →
  `▶ EXECUTOR` for beats 6/8. At least one In Progress card carries a `[#NNNN]` parent-epic subject prefix so the
  `↳ #NNNN` chip renders (beat 10).
- **In Review (top of column):** a card with an `execution-review`/`plan-review` comment carrying a non-empty `verdict`
  so the face renders `◆ REVIEW · PASS` (beat 6 hero + beat 9 landing slot). The richest-ledger card (4 roles + the four
  verdict types PASS / APPROVE / APPROVE-WITH-NOTES / BLOCK across the board) anchors the drawer (beats 11/12).
- Subjects must be brand-safe + self-explanatory (this is a public post).

## The 14 beats (sum = 140s)

| # | Beat | Dur* | Kind / asset | Framing / camera | Highlight | Narration (draft) |
|---|------|------|--------------|------------------|-----------|-------------------|
| 1 | **Hook — watch your agent work** | 8s | synth (no board) | Dark brand bg | — | "Your AI agent plans, codes, and reviews its own work. But can you actually see it — and trust it?" |
| 2 | **Chat — you just ask** | 6s | chat overlay | Plain English typed to Claude Code | — | "It starts how you already work: you just ask, in plain English, and the agent picks up the task." |
| 3 | **Tool — the real pipeline** | 8s | terminal (tool world) | Dark tool bg; planner → plan-review → executor → exec-review | — | "Behind the scenes it runs a real pipeline — planner, plan-review, executor, exec-review — each step checked before the next." |
| 4 | **Transition (silent)** | 1s | transition overlay | The work surfaces tool → board (dark → cream) | — | (silent) |
| 5 | **Session picker** | 12s | **dynamic clip** | Cols 2–3; open the picker dropdown → filter sessions | the dropdown opening IS the motion | "Here it all is, live. Every work session your agent runs is one tap away — open the picker and filter between them." |
| 6 | **Phase line / self-explaining card** | 14s | **COMMITTED hero still** (cols 2–3, DSF 3) | Column-locked vertical push-in onto the top In-Review card | ring on the `◆ REVIEW · PASS` `.ak-phase` line | "Every card says where it is, in plain words, right on its face — queued, working, in review, or done." |
| 7 | **Live heartbeat** ⭐ | 12s | **dynamic clip** (pulse) | Cols 2–3; push-in on the `▶ WORKING` breathing card | the pulse + push-in is the highlight | "The one card it's working on right now gently breathes, with a live pulse." |
| 8 | **Names the role** | 11s | still (committed bytes, gitignored camera) | Tight on the In Progress `▶ EXECUTOR` card | ring on the `▶ EXECUTOR` token | "And it names the exact role on the job — here, the executor is in the seat." |
| 9 | **Causal move** ⭐ | 15s | **dynamic clip** (card-move) | Card lifts In Progress, crosses, LANDS In Review; phase flips `▶ WORKING → ◆ REVIEW · PASS` on land | grow/land glow + the flip | "Watch a task move — it lifts off one column, grows as it lands in review, and the passed verdict appears the instant it arrives." |
| 10 | **Parent epic** | 9s | still (committed bytes) | Tight on a card's `↳ #NNNN` parent chip | ring on the `.ak-tag--parent` chip | "Every card also shows its parent epic, so you see how the small work rolls up into the big goal." |
| 11 | **Depth on tap** | 13s | **dynamic clip** (drawer-open) | Tap the card → timeline drawer SLIDES open → role ledger + verdict pills + elapsed | the tap→open motion | "Tap any task and its full timeline opens up — every role that touched it, in order, with how long each took." |
| 12 | **The verdicts** ⭐ | 17s | **gitignored open-drawer still** | Settled drawer; push-in on the multi-colored verdict pills | ring on the `.ak-pipeline` + `.ak-verdict` union | "A colored verdict sits on each step — green passed, amber approved-with-notes, red blocked — so you see whether its own reviews really passed." |
| 13 | **Payoff** | 9s | synth (no board) | Brand bg | — | "You ask. The agent works. And you watch every move and every verdict — not a black box." |
| 14 | **CTA** | 5s | synth (no board) | Brand bg; handle / repo | — | "agent-kanban — open-source and free under MIT. See your agent work." |

*Dur = design target / animation minimum; final locked by `fitBeatsToVo` against the measured VO. Sum 8+6+8+1+12+14+12+11+15+9+13+17+9+5 = **140s**.

⭐ = the headline self-explaining moments (live heartbeat · causal flip · multi-verdict drawer). Beat 6 is the only
COMMITTED, provenance-hashed frame → the deterministic both-ends AC anchor (the extracted-frame `◆ REVIEW · PASS` glyph
probe runs on its bytes). Beats 8 + 10 read the SAME committed bytes as a non-provenance `still` (different camera + ring).

## What changes vs the v2 10-beat tour
- RESTORE: the agent-interface setup — chat (beat 2) + tool (beat 3) + silent transition (beat 4). The cut is now a
  strict tool-demo (R3/R5 apply + PASS), NOT a feature-tour carve-out.
- ADD four feature beats: session picker (5), parent-epic chip (10), and the multi-verdict drawer still (12), plus a
  dedicated phase-line dwell (6).
- DEEPEN: every board beat gets real dwell (12–17s) instead of the 6–10s the v2 cut rushed.
- FIX: the recurring left-edge slice — `scrollLeft=0` reset + flush 2-col (zero strip h-padding) in EVERY board capture,
  and the drawer beat (11) re-framed CONTAIN (`kanbanClipDeviceRect`) instead of COVER. Both-ends CONTAIN assert added.
- RE-BAND: `RUNTIME_BAND` 74–84 → **130–150** (`videoType:"demo"` preserved; 140 ∈ {130,150} ⊂ {110,180}).

## New / re-captured assets (`capture:kanban-assets`)
1. `board-overview.png` — DSF 3, cols 2–3, the `▶ EXECUTOR` (left) + `◆ REVIEW · PASS` (right) faces + a `↳ #NNNN`
   epic chip. Re-bake sha256/bytes + the re-measured `.ak-phase` (◆ REVIEW, ▶ EXECUTOR) + `.ak-tag--parent` rings.
2. `clip-session-picker.mp4` — open the picker dropdown over the active board (≥4 distinct frames).
3. `clip-heartbeat.mp4` — push-in on the pulsing `▶ WORKING` card (≥4 distinct frames proving the pulse).
4. `clip-card-move.mp4` — lift In Progress → land In Review, phase flip on land (≥4 distinct frames).
5. `clip-drawer-open.mp4` — tap → drawer slides open → role ledger + verdict pills.
6. `drawer-verdicts.png` — gitignored still of the settled open drawer (the multi-colored verdict pills) for beat 12.

## Status
DESIGN spec for operator sign-off. The SILENT 9:16 rough cut (`out/review/kanban/kanban-rough-silent-9x16.mp4`) is the
artifact the operator EYEBALLS to approve; the PAID ElevenLabs VO stays gated behind `KANBAN_VOICE_PAID=1` + the #1096a
preview lock (NOT run by the build). On the operator's eyeball-YES → paid VO → stage → publish runbook (operator-gated).
