<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Rozszerzenie zastępowania na dni zaakceptowane (S-10)

- **Plan**: context/changes/accepted-day-replacement/plan.md
- **Scope**: Phases 1–3 of 3
- **Date**: 2026-09-29
- **Verdict**: NEEDS ATTENTION (all findings fixed in triage)
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Automated gates at review time: `test:db` 94/94, vitest 454/454, lint, build, one `date[]` overload, grep gates 1.4/2.2/3.2/3.3/3.4 — all green. `test:e2e` 20/20 on a fresh dev server (see F5).

## Findings

### F1 — A NULL in p_confirm_dates bypasses the consent check

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260928120000_week_writer_consent_dates.sql:109-110
- **Detail**: `not (v_plan_date = any (coalesce(p_confirm_dates, '{}')))` handles a NULL array but not a NULL element: `d = any('{other,NULL}')` is NULL and `IF true AND NULL` does not raise, so an unconsented accepted day is replaced. Reproduced against the local DB. Zod blocks it on the route; a direct PostgREST call (own rows only) does not.
- **Fix**: Make the membership test null-safe and add pgTAP cases with null elements.
- **Decision**: FIXED — subsumed by F2's new writer: an `exists` over consent entries, so null or partial entries match nothing. pgTAP: `[null]`, `[valid, null, {plan_date only}]`, explicit `null`.

### F2 — Consent is tied to the date, not to the acceptance the teacher saw

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality (plan-level)
- **Location**: migration 20260928120000:106-114 · src/components/plan/WeekPlanBoard.tsx:415, :556
- **Detail**: The consent list only has dates, so a day that was withdrawn, edited and accepted again in another tab is still covered by consent the teacher gave to its earlier acceptance. The window is also longer than one run: `run` survived failed writes, so „Zapisz tydzień” could resend the consent much later. This follows the plan's literal contract, so it is a flaw in the plan rather than drift.
- **Fix A ⭐ Recommended**: Consent names the version seen: `[{plan_date, accepted_at}]`, compared under `for update`.
  - Strength: Closes the Guardrail #2 gap in the layer the plan chose for it.
  - Tradeoff: Touches all three phases again.
  - Confidence: MED — timestamptz round trip needs a test.
  - Blind spot: Precision of accepted_at as read back.
- **Fix B**: Document the residual risk; clear the run after a conflict.
  - Strength: Small.
  - Tradeoff: Gap remains within one run.
  - Confidence: HIGH.
  - Blind spot: Two-tab usage frequency.
- **Decision**: FIXED via Fix A — new migration `20260929120000_week_writer_consent_versions.sql` (`p_confirm_accepted jsonb`), contract/route/store/types/partition/board carry `{plan_date, accepted_at}`; `accepted_at` is always the read-back row value (accept route reads back). pgTAP re-acceptance case added; mutation (drop the `accepted_at` comparison) turns it red.

### F3 — A new run strands an older run's batch on a day it marks „Nietknięty”

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: src/components/plan/WeekPlanBoard.tsx:461-463
- **Detail**: Run A includes accepted X and X holds a batch. Some other day fails. The teacher then starts a drafts-only run B. B's untouched loop marks X `skipped` but keeps A's batch. After B writes, `run` is null while `heldCount > 0`, so the banner, the control lock and the PDF lock stay on and „Zapisz tydzień” never comes back. Only a reload recovers.
- **Fix**: In the untouched loop also set `batch: null, error: null, retryable: false`.
- **Decision**: FIXED

### F4 — After a 409, „Zapisz tydzień” keeps resending a refused write

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/WeekPlanBoard.tsx:351-357
- **Detail**: On a conflict, the run and its batches stayed held, so the button offered a write that would be refused again. The alert said „Odśwież stronę”, which contradicted the button.
- **Fix**: On 409, end the run.
- **Decision**: FIXED — on 409 the run ends, held batches are dropped and each target returns to its saved plan (`planFields`). Clearing only `run` would have recreated F3's lock. Network failures still keep the batches for „Zapisz tydzień”.

### F5 — The e2e gate reuses whatever dev server is already running

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: playwright.config.ts:57
- **Detail**: With the long-running server on :4321, 4 print specs failed every time, including month-print, which this branch doesn't touch. On fresh servers, master passed 7/7 and the branch passed 20/20. Gate 1.3 calls host `psql`, which isn't installed here.
- **Fix**: Run gate 3.7 against a fresh server; note the docker form of 1.3.
- **Decision**: FIXED — recorded in the plan's review addendum, together with gates 1.3/1.4/3.3 restated for the new names; verified that the new greps fail on `3aa00a9` and pass now.

## Verification after fixes

`supabase db reset` ✓ · `test:db` PASS (week suite 19/19) · vitest 459/459 · lint ✓ · build ✓ · e2e 20/20 (fresh server) · single overload `p_prompt text, p_days jsonb, p_confirm_accepted jsonb`.

Manual checks not re-run after the fixes: 3.8–3.13 (dialog flow, consented replace, stale-accept refusal) touch the changed code paths and should be repeated by hand before merge.
