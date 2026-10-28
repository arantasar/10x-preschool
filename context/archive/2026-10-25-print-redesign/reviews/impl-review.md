<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Wydruki w barwach aplikacji (S-29)

- **Plan**: context/changes/print-redesign/plan.md
- **Scope**: Phases 1–5 of 5 (full plan)
- **Date**: 2026-10-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 5 observations

Automated checks re-run during the review: `npm test` (915), `npm run lint`, `npm run build`, samples (10 PDFs), grep gates 1.3 / 2.5 / 5.4, and the E2E specs week-print + month-print (7/7). All green. Triage was automatic, with the recommended fixes. After the fixes: `npm test` 918, lint, samples and print E2E 7/7, all green.

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

### F1 — Cyrillic prints as "?" everywhere (regression vs Noto)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/plan-pdf/render.ts:126-130
- **Detail**: `hasGlyph` took the intersection of all four faces. Young Serif has no Cyrillic, but Nunito Sans and Noto Sans do, so Ukrainian text in a description became "?". The serif face only ever sets text we generate ourselves.
- **Fix**: Build `hasGlyph` from the three Nunito faces (`TEXT_FACES`), and add a render test that Cyrillic survives `normalizeDocument`.
- **Decision**: FIXED. The new test fails on the old code (verified: Young Serif returns false for every letter of "Привіт").

### F2 — 2000-char hasło with no spaces blocks the browser for seconds

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality / Pattern Consistency
- **Location**: src/lib/plan-pdf/sheet.ts:98-101, grid-layout.ts:185-196
- **Detail**: The truncation loops dropped one character at a time. Every prefix was a new, uncached string, so a single `chip("a"×2000)` took about 5 s, and the month grid multiplied that by up to ~23 cells. `withTruncationMark` in grid-layout duplicated the same loop.
- **Fix**: A single `withTruncationMark` in `sheet.ts` that halves its way to the cut (`longestFitting`), used by `fitOneLine` and by the grid. Test: a 2000-character word is cut in fewer than 30 measurements.
- **Decision**: FIXED

### F3 — Hasło cut to one line, even on the day-per-page sheet

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/lib/plan-pdf/layout.ts:344-359
- **Detail**: The plan decided this explicitly. On master, the full hasło printed in both week layouts, so this is an exception to "nic nie ginie".
- **Fix A ⭐ Recommended**: Keep it and record the tradeoff in the plan.
- **Fix B**: Print the full hasło as flowing text on the day-per-page sheet.
- **Decision**: FIXED via Fix A (plan addendum).

### F4 — Header layout and portrait margins differ from the plan

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/plan-pdf/sheet.ts:163-184
- **Detail**: Things the plan did not describe: the stacked-header fallback, the title shrinking to 12 pt before it is cut, the draft tag dropping to its own row, and portrait pages keeping the 2 cm margin.
- **Fix**: Plan addendum.
- **Decision**: FIXED (addendum in plan.md)

### F5 — Two test gaps

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/plan-pdf/layout.test.ts:66-68, grid-layout.test.ts:125
- **Detail**: (a) `bodyTexts` skipped any text above `body.top`, and chip/tag outlines were not checked against their column. (b) A grid test named "six rows" asserted rows ≥ 5, and manual check 4.6 described a 6-row month, which cannot happen.
- **Fix**: `expectInsideBody` now checks that exactly 4 header texts sit above the body, and that boxes stay inside their column and below the header. The grid test was renamed and its comment explains why a sixth row cannot occur. The wording of plan check 4.6 is corrected.
- **Decision**: FIXED

### F6 — Small cleanups: silent-drop guards, stale docstring, hatch slant

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: sheet.ts:117-119, grid-layout.ts:209, render.ts:138
- **Detail**:
  - `chip()` returned `null` when only "…" fit.
  - `truncateLines` drops the theme when zero lines fit.
  - The docstring said "nine sizes".
  - The hatch slant looked like it went the wrong way.
- **Fix**: A chip now shows a bare "…" when that is all that fits, and the docstring now says six sizes.
- **Decision**: FIXED in part:
  - The hatch slant needed no change. CSS `135deg` draws stripes that rise left to right, which matches the code; the reviewer misread it.
  - `truncateLines` with zero lines that fit is left as is. Nothing can be drawn there without overflowing the cell, and the current geometry cannot reach that case.

### F7 — All 11 manual checks still pending, and merging deploys

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md Progress 1.4, 2.6–2.7, 3.5–3.7, 4.5–4.6, 5.5–5.7
- **Detail**: No manual row is ticked. The footer wording (1.4) and the black-and-white print (5.5) matter most. The hatch `#F4F1E8` and the empty-day outline `#E2DBC8` are very pale.
- **Fix**: Do 1.4 and 5.5 before the merge.
- **Decision**: FIXED — Janusz ran the manual checks and confirmed them on 2026-10-28
