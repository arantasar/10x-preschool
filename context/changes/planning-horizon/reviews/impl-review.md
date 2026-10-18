<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Horyzont planowania (S-31)

- **Plan**: context/changes/planning-horizon/plan.md
- **Scope**: Phases 1–3 of 3
- **Date**: 2026-10-18
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Automated at review time: `npm test` 877/877, `npm run test:db:api` 12/12, lint, build, grep 2.2 (1 per route), grep 3.2 (1 per page), roadmap `diff -w` only S-31 rows — all green. Exhaustive probe 2020–2031 of `opensOn`: 0 mismatches. No other route generates or saves a dated plan without `checkGenerationDates`.

## Findings

### F1 — Playwright specs break: their dates (year 2100) are outside the window

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/support/test-data.ts:16
- **Detail**: `uniquePlanDate()`/`uniqueWeekStart()` return dates from 2100 on; outside the window the islands show `HorizonNotice` instead of the form. Broke `seed.spec.ts:63`, `day-plan-ownership.spec.ts:74,80`, `day-plan-delete-scope.spec.ts:105`, `regenerate-confirmation.spec.ts` (3 tests) — 6 tests. CI runs no Playwright and the plan never inventoried E2E, so this would have reached `master` unnoticed.
- **Fix**: In-window dates for the specs that need the form / empty day.
  - Strength: keeps the risk assertions (empty day, empty „Hasło dnia” for the intruder) intact.
  - Tradeoff: the window is ~14 weeks; random dates under `fullyParallel` would collide on `unique (user_id, plan_date)`.
  - Confidence: HIGH — verified red (6 failed) before, green after.
  - Blind spot: a future spec copying `seed.spec.ts` reuses its slot.
- **Decision**: FIXED + ACCEPTED-AS-RULE: Zmiana renderu strony wymaga inwentarza specs E2E — `weekStartInHorizon(slot)` in `test-data.ts`: fixed, per-test slots in next month (always wholly in the window), slot owners listed in its doc comment. Old specs 6/6 red on this branch, new 6/6 green.

### F2 — A saved plan outside the window no longer shows its hasło

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/DayPlanEditor.tsx:599, src/components/plan/WeekPlanBoard.tsx:932
- **Detail**: The textarea was the only place a saved plan's hasło was shown; `HorizonNotice` replaced the whole block, so a September plan opened in December lost what it was about.
- **Fix**: Render the saved hasło read-only above the notice.
- **Decision**: FIXED — `HorizonNotice` takes `promptLabel` + `savedPrompt` (day: `prompt`; week: `firstPrompt(week)`); new `tests/e2e/planning-horizon.spec.ts` (red without the fix, green with it).

### F3 — Manual verification not done (1.3, 2.5, 3.4–3.9)

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/planning-horizon/plan.md:352-382
- **Detail**: Eight manual rows still `[ ]`; none rubber-stamped. Merge to `master` deploys immediately.
- **Fix**: Walk them in `npm run dev` before merging.
- **Decision**: PENDING — needs the owner in a browser. 3.6 now partly covered by `planning-horizon.spec.ts` (day view: plan, hasło, notice, no form).

### F4 — week/save refuses `too_old` at month rollover, losing a paid batch

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/day-plan/week/save.ts:84
- **Detail**: A week generated just before midnight on the last day of a month and saved after it, when `first` moves forward, gets a 422; the day generations are already `succeeded` in the ledger. Extremely unlikely.
- **Fix**: Accept.
- **Decision**: ACCEPTED — probability negligible; the cost is a few generations of one teacher.

### F5 — No test of the Warsaw/UTC boundary through the default `todayIsoDate()`

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/planning-horizon.test.ts
- **Detail**: Every test passed `today` explicitly or pinned the clock at midday.
- **Fix**: One test across 31 Oct 22:30Z / 23:30Z with the default `today`.
- **Decision**: FIXED — „moves the window at midnight in Warsaw, not at midnight UTC”.

### F6 — Roadmap: S-31 backlog title still says „N tygodni naprzód”

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md:374
- **Detail**: The N-weeks idea was replaced by the calendar window. The At-a-glance story („kilka tygodni naprzód”) is still true (5–9 weeks) and stays.
- **Fix**: Reword the backlog title.
- **Decision**: FIXED — „Limit horyzontu generowania (do końca następnego miesiąca)”.

## Outside this change

Full E2E run: `month-print.spec.ts` (2), `week-print.spec.ts` (2) and `help-and-contact.spec.ts` (1) fail **identically on `master`** (download never fires; island hydration wait) — pre-existing, not S-31. `password-reset.spec.ts` failed once and passed on rerun (flaky). `src/lib/services/fair-use.test.ts:96` has two pre-existing `tsc` errors (not touched by this branch).
