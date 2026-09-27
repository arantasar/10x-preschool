<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Wydruk miesiąca (PDF) — month-print

- **Plan**: context/changes/month-print/plan.md
- **Scope**: Full plan (Phases 1–5 of 5)
- **Date**: 2026-09-27
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Automated re-run at review time: `npm test` 371/371, lint, build and gates 1.5, 1.8/4.5, 3.4, 4.6, 5.4 all pass. Gate 1.6 as written failed (see F2). E2E 5.1/5.2 could not be reproduced: `auth.setup` timed out because the dev server on :4321 was started before every commit on the branch and serves `/auth/signin` with no form. That is the environment, not the branch.

After the fixes: `npm test` 374/374, lint and build pass. The new F1 tests go red when the row filter is removed.

## Findings

### F1 — A month that starts on a weekend prints an empty week

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/plan-pdf/model.ts:196
- **Detail**: `buildPrintMonth` took its rows from `weeksOfMonth`, which for a month whose 1st is a Saturday or Sunday starts at the Monday before it. That gave a row of five `null` slots. In "tygodniami" this printed a page with only the heading "Plan miesiąca — sierpień 2026 · 27–31 lipca". In the siatka it added a blank sixth row that took about 17% of the height from every other cell. It contradicts plan.md:47. The unit tests only used 2026-09 and 2026-12, and the e2e `weeksTouching` repeated the same arithmetic.
- **Fix**: Drop rows without an in-month working day in `buildPrintMonth`. `weeksOfMonth` stays as is for `MonthGrid`. Add unit tests for 2026-08 and change the e2e count to weeks with a working day of the month.
- **Decision**: FIXED. `buildPrintMonth` filters the rows; there is a model test and a layout test for 2026-08; the e2e uses `weeksWithWorkingDays`; the plan's Phase 3 semantics and Phase 5 contract are updated.

### F2 — Criterion 1.6 was ticked, but its command could not return 0

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/month-print/plan.md:179 (Progress 1.6)
- **Detail**: The pathspec listed only `plan-pdf/*`, so `-M` had no pair and every test file counted as added: 340 lines at 03f7f5e. The allowlist also lacked `printDays` and `normalizeDocument`. What matters held up: the 11 remaining lines are accessor changes (`week.days[i]` → `printDays(week)[i]`), and no assertion or expected value changed.
- **Fix**: Rewrite the command with both sides of the rename, the range pinned to `master..03f7f5e` and the allowlist extended. Re-run it on the good and the broken state.
- **Decision**: FIXED. The plan has the new command. It gives 0 at 03f7f5e and 2 with an expected page count changed.

### F3 — The "tygodniami" heading named dates outside the month

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/plan-pdf/model.ts:204
- **Detail**: The first September page was headed "31 sierpnia – 4 września" while the 31 August column is left blank.
- **Fix**: Build the heading from the row's first and last in-month working days.
- **Decision**: FIXED. `formatDateRange(first, last)` was added to `day-plan-dates.ts` and `formatWeekRange` delegates to it; a test covers "1 – 4 września 2026" and "28 – 30 września 2026".

### F4 — The error shown was random when the renderer and the data both failed

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/PdfDownloadControls.tsx:115
- **Detail**: `loadDocument()` ran inside the same `Promise.all` as the renderer import, so the message depended on which one rejected first.
- **Fix**: Give the `loadDocument` error priority.
- **Decision**: FIXED. `documentLoad` is held apart from `Promise.all`, and the `catch` prefers its rejection. `Promise.resolve().then(loadDocument)` turns a synchronous throw into a rejection. No automated test covers it; it is not part of the plan's manual rows.

### F5 — Grid tests checked landscape orientation only for the typical month

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/plan-pdf/grid-layout.test.ts:94,101
- **Detail**: The plan says "zawsze jedna strona pozioma", but the empty-month and overflowing-month tests checked the page count only.
- **Fix**: Add `expect(spec).toBe(A4_LANDSCAPE)` to both.
- **Decision**: FIXED

### F6 — The store's error text for a month read said "tygodnia"

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/day-plan-store.ts:658,673
- **Detail**: `readWeekPlans` also serves the month read, but its error messages named the week.
- **Fix**: Make the wording neutral.
- **Decision**: FIXED. The messages now read "Nie udało się odczytać planów" and "…propozycji". The save message at :313 stays, because it really is about the week.

### F7 — Status is "implemented", but the merge condition is still open

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md Progress 1.9–5.6
- **Detail**: Every manual row is unchecked, including 4.7, which the plan names as the merge condition (open the generated PDF). E2E 5.1/5.2 could not be re-checked here. Merging to master deploys to production.
- **Fix**: Restart the dev server, re-run the e2e specs, do 4.7, 4.8 and 1.9, and only then close the slice in the roadmap and PRD and open a PR.
- **Decision**: PENDING (manual — the author's to do)
