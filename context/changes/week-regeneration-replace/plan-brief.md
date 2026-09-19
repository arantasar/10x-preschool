# Regeneracja tygodnia z zastępowaniem dni niezaakceptowanych — Plan Brief

> Full plan: `context/changes/week-regeneration-replace/plan.md`
> Slice: `S-09` (gwiazda przewodnia `M-02`) — `context/foundation/roadmap.md`
> Requirements: `context/foundation/prd-v2.md` — FR-012, FR-014, US-02

## What & Why

Week generation today silently skips every day that already has a plan — including a draft the
teacher never accepted. To change a week's hasło you must open five days one at a time. This slice
makes week generation **replace** every unaccepted day, behind a confirmation that honestly states
how many days go and how many accepted days stay. Accepted days remain out of reach until `S-10`.

The hard part is not the dialog. It is that replacing five days has to be all-or-nothing: the
teacher ends up with a complete new week or with the week they had, never a mix.

## Starting Point

`WeekPlanBoard` filters the week to days with no row at all and sends `only_if_absent: true` per day
(`WeekPlanBoard.tsx:88,138`); everything else is badged `pominięty`. Per-day replacement already
exists on the wire — `/api/day-plan/generate` takes `only_if_absent` and `confirm_replace`, and
`DayPlanEditor` uses them. Per-day atomicity is already correct: `save_day_plan_generation` swaps
the batch inside one transaction, after the model returns. What does not exist is a writer that
spans five days, and PostgREST gives the client no transaction to build one from.

## Desired End State

A teacher types a new hasło on `/plan/week` and presses Generuj tydzień. A confirmation names both
numbers — days to be replaced, accepted days left alone. On confirmation the targeted days are
outlined and generated; nothing is written until the whole set is in hand, and then it lands as one
transaction. A day that fails can be retried alone. A week where every day is accepted is refused
before a single token is spent, and says why.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Week atomicity | Generate all, then one transactional write via a new RPC | Only the schema can hold a transaction spanning five days; the roadmap already names the single-day writer as the thing to change | Plan |
| Partial failure | Hold batches in the island, retry only failed days, write once complete | Doesn't burn four paid-for generations on one transient rate limit | Plan |
| Confirmation copy | Both numbers, two roles — N replaced, M accepted untouched | Guardrail #2 asks for a confirmation "uczciwe co do liczby i stanu dni"; FR-014's literal wording assumes FR-013 is also in scope, and it isn't | Plan (divergence recorded) |
| All-accepted week | Refuse before spending, name acceptance as the reason | Today's message ("wszystkie dni mają już plan") becomes false once drafts are replaceable | Plan |
| Orchestration | Island drives generation; new write-only route | Keeps per-day progress (a PRD v1 quality requirement) and per-day retry, and keeps five LLM calls out of one Worker invocation | Plan |
| Outline scope | Only the days being replaced | Avoids paying for discarded themes; costs loosening the exactly-five contract to 1..5 | Plan |
| Outline subset cost | Loosen schemas **and** edit the Polish prompt | Leaving the prompt saying "dokładnie pięć" while the schema permits two is how off-contract responses start | Plan |
| Testing | Route + unit (vitest) only; no new pgTAP | User decision this session | Plan |
| Generation quota | None — only the cost copy is corrected | Open Roadmap Question #5 is a techniczno-biznesowa decision with a named owner; the slice stays vertical | Roadmap (#5) |
| Accepted days | Out of scope | PRD splits FR-012 (must-have) from FR-013 (nice-to-have → `S-10`, after `S-12`) | PRD |

## Scope

**In scope:** replacing unaccepted days on week generation; the two-number confirmation; a
transactional N-day writer; outlining a subset of days; the deferred-write and atomic-write routes;
board status vocabulary and cost copy.

**Out of scope:** replacing accepted days (FR-013 / `S-10`); week-level unaccept and delete
(FR-015/016 / `S-11`); edit-clears-acceptance (FR-017 / `S-12`); any quota or cooldown; new pgTAP;
undo or history; the day-level generate route's contract.

## Architecture / Approach

Bottom-up, in the codebase's own order — schema → store → API → client.

```
island: outline (N days) → generate ×N  ──hold batches──►  /week/save ──► save_week_plan_generation
          │                    │                                              (one transaction,
          └── per-day progress └── per-day retry                               N days, all or none)
```

Atomicity lives in a new `save_week_plan_generation` RPC, reusing the existing refusal codes
(`U0001` accepted-unconfirmed, `U0003` empty batch). Above it, everything is arrangement: the island
keeps driving so progress and retry survive, then hands the completed set to one write. Generating
without writing is a state `generate.ts` deliberately declares non-existent — so it is introduced in
new routes rather than by loosening that one.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Week batch writer | `save_week_plan_generation` RPC + store wrapper + command type | Atomicity invariant ships with no pgTAP asserting it |
| 2. Outline subset | 1..5 outline across zod, JSON Schema and the Polish prompt | Prompt edit forces a content-safety gate re-run across every allowed model |
| 3. New routes | Deferred-write day route + atomic week write route | Write route accepts client-supplied batches and must validate them as such |
| 4. Week board | Target partition, confirmation, hold-and-write, copy | Unwritten batches live only in browser memory |

**Prerequisites:** a feature branch — CLAUDE.md requires one before the first commit from `S-03`
onwards, and the repo is currently on `master`. Local Supabase (`npx supabase start`) for Phase 1,
and OpenRouter credit for the Phase 2 gate run.

**Estimated effort:** ~4 sessions, one per phase; Phase 4 is the largest.

## Open Risks & Assumptions

- **The all-or-nothing invariant has no database test.** It is enforced in a new RPC and asserted
  only through route and unit tests. `lessons.md` records twice that invariants belong in the schema
  and that a gate nobody has seen fail is a comment, not a gate. Accepted by decision this session;
  `test-plan.md` Phase 3 is sequenced after this slice and is the natural place to close it.
- **The confirmation copy diverges from FR-014's literal wording.** FR-014 says "ile dni zostanie
  zastąpionych i ile z nich jest zaakceptowanych", which is zero by construction while FR-013 is out
  of scope. The plan says N replaced + M untouched instead. Deliberate, recorded here so a later
  reviewer does not read it as drift.
- **Editing `week-outline.pl.md` touches the only content-safety layer there is.** Safety is a CI
  gate, not a runtime filter, so the gate run in Phase 2 is the whole defence.
- **Unwritten batches are lost on tab close.** Correct behaviour — nothing was written — but it must
  be visible on screen, not discovered.
- **Open Roadmap Question #5 (generation limit) stays open** and this slice makes the operation
  cheaper to repeat, five calls at a time.
- **US-02's acceptance criteria describe FR-012 + FR-013 together** (five days replaced, three of
  them accepted). `S-09` satisfies the half the PRD scoped to it; US-02 does not fully close until
  `S-10`.

## Success Criteria (Summary)

- A teacher changes a week's hasło in one operation instead of opening five days, and is told
  exactly what will be replaced and what will be spared before anything is spent.
- A failed run leaves the week exactly as it was — not partly replaced, not empty.
- Accepted work is never touched without being asked, and in this slice is never touched at all.
