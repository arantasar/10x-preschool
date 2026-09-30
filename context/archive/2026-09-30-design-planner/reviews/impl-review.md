<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Design planner („Ogród” na ekranach planowania)

- **Plan**: context/changes/design-planner/plan.md
- **Scope**: Phases 1–7 of 7
- **Date**: 2026-09-30
- **Verdict**: NEEDS ATTENTION → all findings fixed in triage
- **Findings**: 0 critical, 3 warnings, 6 observations

Automated checks at review time: lint, build, 501 unit tests, 23 e2e tests and all 18 grep gates from
the plan passed. After triage: lint, build, 504 unit tests, 26 e2e tests pass. The first e2e run after
`npm run build` failed `landing-topic-carry` on a 30 s timeout and passed on the rerun — the cold-Vite
behaviour the plan's Migration Notes describe.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — Three windows that overwrite approved days have no e2e test

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: src/components/plan/DayPlanEditor.tsx (`generate`), src/components/plan/WeekPlanBoard.tsx (`generateWeek`, two windows)
- **Detail**: E2E-RULES.md keeps a refusal test mandatory for every operation behind a window. Delete and edit had them; day regeneration and both week windows (scope, day count) had none. Unit tests cover the wording only, so an inverted boolean at the count window would replace approved days with the suite green.
- **Fix**: Add three refusal tests with generation requests cut off in `page.route`.
  - Strength: Closes the only destructive Phase 6 paths without a browser gate.
  - Tradeoff: Three new tests in a finished PR.
  - Confidence: HIGH — refusal needs no model call.
  - Blind spot: Consent path stays uncovered in the browser (the model call is bypassed by design).
- **Decision**: FIXED — `tests/e2e/regenerate-confirmation.spec.ts` (risk #3), three tests. Seen red with `resolve?.(true)` in `useConfirmDialog` (all three failed), then reverted. E2E-RULES.md updated.

### F2 — Retry re-sends delete and regenerate without asking again

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/DayPlanEditor.tsx (`mutate` default `lastAttempt`, used by `generate` and `deletePlan`)
- **Detail**: Pre-existing. After a failed DELETE or generate, `reconcile()` loads what the server now holds and „Spróbuj ponownie” replayed the frozen request, `confirm_replace: true` included, with no window. `saveDraft` already re-entered itself.
- **Fix A ⭐ Recommended**: Pass a `retry` that re-enters `deletePlan` / `generate`.
  - Strength: Matches `saveDraft`; only ever adds a question.
  - Tradeoff: Behaviour change inside a restyle PR.
  - Confidence: HIGH.
  - Blind spot: No e2e covers the retry button.
- **Fix B**: Record as a follow-up.
- **Decision**: FIXED via Fix A. Both functions now read the plan from `planRef`, because the retry re-enters the closure of the first attempt. The retry still sends the hasło as it was at the first attempt, as before.

### F3 — „Zatwierdź wszystkie” moved to the left panel after close-out

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/plan/WeekPlanBoard.tsx (commit 4824fcc)
- **Detail**: Phase 3 puts both bulk actions in the right column. Commit 4824fcc, made after the plan was closed, moved week approval into the form; the plan was not amended.
- **Fix**: Record the move as an accepted deviation in the plan.
- **Decision**: FIXED — plan.md §Addendum.

### F4 — Dialog has no onClose safety net

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/ui/ConfirmDialog.tsx
- **Detail**: Only `onCancel` was handled. A dialog closed any other way would leave the hook's resolver set and every later `confirm()` would return `false` until reload.
- **Fix**: Add `onClose` answering `false`.
- **Decision**: FIXED — with a per-window `answered` guard and an `open` check, so a late `close` from one window cannot answer the next question.

### F5 — A held Enter key can answer a default-tone window unread

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/ui/ConfirmDialog.tsx
- **Detail**: Not reproduced in a browser. For `tone: "default"` the confirm button gets focus, so key repeat could confirm the edit window.
- **Fix**: Ignore repeated Enter keydowns on the dialog.
- **Decision**: FIXED — not verified by hand; the e2e suite confirms ordinary clicks still work.

### F6 — Boundary week says „czeka na temat” when the week has plans

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/month-grid.ts, src/components/plan/MonthGrid.tsx
- **Detail**: Built as the plan specified: `isEmpty` looks only at in-month days. A week with plans on 28–30 Sep and none on 1–2 Oct showed „Ten tydzień czeka na temat.” in October.
- **Fix**: Partial rows speak for their own days.
  - Strength: No model change.
  - Tradeoff: A second copy variant.
  - Confidence: MEDIUM.
  - Blind spot: The CTA still opens a week page that may already have plans.
- **Decision**: FIXED — `emptyRowText` with three unit tests; plan.md §Addendum.

### F7 — button.tsx concatenates classes; focus border on dangerPill

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/ui/button.tsx
- **Detail**: Pill sizes used template literals (CLAUDE.md forbids concatenation); the shadcn base `focus-visible:border-ring` repainted the outlined pills' border on focus; `pillIcon` was unused.
- **Fix**: cva arrays, own focus border on the two outlined pills, drop `pillIcon`.
- **Decision**: FIXED — merge result checked through `cn()`; `pillIcon` removal recorded in plan.md §Addendum.

### F8 — Placeholder contrast below AA

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/field-styles.ts
- **Detail**: `placeholder:text-las-szary/70` on Mleko computes to about 3.75:1 (hand calculation from the token values).
- **Fix**: Drop the `/70`.
- **Decision**: FIXED in the planner's fields. `src/components/auth/FormField.tsx` carries the same class and is outside this change — left as is.

### F9 — Bookkeeping: uncommitted Progress ticks and stale comments

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/design-planner/plan.md, src/components/plan/WeekPlanBoard.tsx
- **Detail**: Manual Progress ticks existed only in the working tree; two comments were stale („Zatwierdź tydzień”, partition „frozen at the second question”).
- **Fix**: Commit the ticks, correct the comments.
- **Decision**: FIXED.

## Not raised as findings

- After a confirmed operation the focus can fall to `<body>` because the opener is disabled or removed. Same as with `window.confirm`; left for a later accessibility pass.
- `text-mech` on `bg-szalwia-soft` is close to 4.5:1 by hand calculation; worth measuring with a tool.
