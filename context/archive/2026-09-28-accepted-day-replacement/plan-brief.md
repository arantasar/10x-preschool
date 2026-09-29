# Rozszerzenie zastępowania na dni zaakceptowane — Plan Brief

> Full plan: `context/changes/accepted-day-replacement/plan.md`
> Roadmap: `context/foundation/roadmap.md` S-10 · PRD: `context/foundation/prd-v2.md` FR-013 (nice-to-have), FR-014

## What & Why

Since `S-09`, a teacher can regenerate a week under a new hasło, but accepted days are always left
alone. A teacher who wants to redo a week they have already signed off has to withdraw acceptance
day by day first — the "five operations one at a time" `M-02` set out to remove. This slice lets
them **explicitly** include accepted days in the run. It deletes, in bulk, the one state a person
marked as finished, in a system with no undo anywhere, so the confirmation is the only barrier and
has to be exact.

## Starting Point

The week writer `save_week_plan_generation` already takes a `p_confirm_replace boolean`, refuses
unconfirmed accepted days with `U0001` (naming the date) and clears `accepted_at` on replacement. The
route hard-codes `false`. The week board picks targets by acceptance and — in three places —
**re-derives** a run's targets as "not accepted", which becomes wrong the moment an accepted day can
be a target. An all-accepted week is refused outright today.

## Desired End State

On a mixed week the teacher gets a scope question („2 dni są zaakceptowane — zastąpić także je?"),
then a go / stop dialog stating the exact count („Zastąpię 5 dni, w tym 2 zaakceptowane — ich
akceptacja zostanie cofnięta"). An all-accepted week gets one such dialog instead of a refusal. The
writer replaces an accepted day only if its date is on the list the teacher saw; a day accepted in
another tab after the dialog makes the whole write refuse, naming the day.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Opt-in shape | Second `window.confirm`, no new UI primitive | Reuses the codebase's only dialog primitive; the accepted-day consequence gets its own click | Plan |
| Dialog order | Scope question first, then go / stop with counts | The last dialog always means "go or stop" and states exactly what is destroyed — FR-014's "ile z nich jest zaakceptowanych" becomes non-zero | Plan |
| Guarantee | Per-date consent list in the writer; boolean removed | A boolean would silently replace a day accepted after the dialog — Guardrail #2 on a narrow path | Plan |
| All-accepted week | Offer replacement (one dialog) instead of refusing | It is the case FR-013 exists for | Plan |
| Stale accept mid-run | Refuse the whole write, name the day, advise reload | Rare path; keeps all-or-nothing trivial; the dated 409 already exists | Plan |
| Run scope in the island | Explicit run state `{targets, consented, keyword}` | Re-deriving targets from acceptance would offer a partial "Zapisz tydzień" | Plan |
| Testing | pgTAP + unit + route; no new e2e | The guarantee lives in the schema, so it is tested there; E2E does not drive OpenRouter | Plan |
| Single-day path | Untouched | `DayPlanEditor` / `/api/day-plan/generate` keep `confirm_replace` | Plan |

## Scope

**In scope:** migration swapping `p_confirm_replace boolean` for `p_confirm_dates date[]` (drop + create + grant triple); regenerated DB types; store wrapper and command type; new pgTAP suite for the week writer; `confirm_dates` in the save route's schema and call; reworded stale-accept 409; scope question and count copy in `week-generation.ts`; run-scoped state in `WeekPlanBoard`; cost copy; unit and route tests.

**Out of scope:** custom dialog or checkbox; re-asking after a stale accept; single-day path; generation quota (Open Roadmap Question #5); prompt changes; new Playwright specs; undo or history; editing PRD / roadmap beyond the slice status.

## Architecture / Approach

```
Generuj tydzień ─► partition by acceptance
   ├─ empty week ─────────────────────────────► (no dialog)
   ├─ drafts only ──────────────────────────► confirm(count) ──┐
   ├─ mixed ─► confirm(scope?) ─OK/Anuluj─► confirm(count) ────┤ Anuluj → stop, nothing spent
   └─ all accepted ─────────────────────────► confirm(count) ──┘
                                                   │ OK
                                   run = {targets, consented, keyword}
   outline(targets) → generate each (held) → retryDay/retryWrite read run
                                                   │ all held
            POST /week/save {prompt, days, confirm_dates: consented}
                                                   │
   save_week_plan_generation: accepted AND date ∉ p_confirm_dates → U0001 → whole set rolled back
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Per-date consent in the week writer | `p_confirm_dates date[]` writer, grants, types, store, pgTAP suite | Leftover boolean overload or lost grants after `drop function` |
| 2. Write route carries consent | `confirm_dates` validated (subset of days) and passed through; dated 409 reworded | A consented date outside the set slipping past validation |
| 3. Board: scope question, honest count, run-scoped targets | The dialog flow, run state, copy, unit tests | Any leftover "not accepted = target" derivation producing a partial week |

**Prerequisites:** `S-09` and `S-12` done (both are). Feature branch (`CLAUDE.md` rule for S-03 onward). Local Supabase for phase 1.
**Estimated effort:** ~2 sessions across 3 phases; phase 3 is the largest.

## Open Risks & Assumptions

- **Deploy window:** the migration removes the signature the current worker calls; migration and code must ship in the same merge, or week writes fail until the new worker is live.
- **Dialog 1's Anuluj narrows rather than cancels** — a non-standard meaning for a native button; the copy must name both outcomes, and manual verification is the only check.
- **The dialog sequence has no automated test** (decided): pgTAP guards what is destroyed, not what is said.
- Assumes no prompt edit is needed; if one appears, the suspended content-safety gate (`lessons.md` §3) blocks the merge.

## Success Criteria (Summary)

- A teacher can redo a fully or partly accepted week in one run, after dialogs that state exactly how many accepted days will lose their acceptance.
- Choosing "only drafts" leaves accepted days byte-identical, as in `S-09`.
- No accepted day is ever replaced unless its date was in what the teacher confirmed, and no failure leaves a partial week.
