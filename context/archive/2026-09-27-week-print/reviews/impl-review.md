<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Wydruk tygodnia (PDF)

- **Plan**: context/changes/week-print/plan.md
- **Scope**: Phases 1–4 of 4 (full plan)
- **Date**: 2026-09-27
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 4 observations

Automated at review time: `npx vitest run src/lib/week-pdf` 36/36 · `npm test` 319/319 · `npm run lint` exit 0 · `npm run build` OK · gates 1.4, 2.5, 3.4, 4.4 green (3.4 turns red on a planted static `from "pdf-lib"` import) · `week-print.spec.ts` green with `--repeat-each=2` · `npm run test:e2e` 17/17. Code split confirmed in the build: pdf-lib + fontkit only in `render.*.js` (~507 KB gzip, loaded on click), the WeekPlanBoard island is 7.3 KB gzip.

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

### F1 — status: implemented, but all 11 Manual items are unchecked

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/week-print/plan.md:413-458, change.md
- **Detail**: 1.5, 2.6, 3.5–3.9, 4.5, 4.6 are all `[ ]`. 3.6 (PDF reflects accept/undo/delete without a reload — the plan's central Key Discovery) and 3.7 (buttons disabled while a batch is held — the "proposals not in the database" part of risk #11) are not covered by any automated check; the e2e only checks the structure of a file built from the seed. 3.8 (paper print, result in change.md) is missing and the Notes section of change.md is empty. A merge to master ships to production.
- **Fix**: Run 3.5–3.9 by hand before merging (3.6 and 3.7 at minimum), record the printer and week-per-page font size in change.md, tick the Progress items.
  - Strength: Closes the only path that verifies the core of risk #11.
  - Tradeoff: ~20–30 min by hand plus a real printer.
  - Confidence: HIGH — the code path (`savedPlans` from `dayList`) is correct on read-through, but nobody has seen it working.
  - Blind spot: No automated regression for 3.6/3.7 — an e2e would not show the difference (page count doesn't change, text isn't greppable).
- **Decision**: ACCEPTED — 2026-09-27 Janusz confirmed the PDF and buttons work (2.6, 3.5 ticked) and ordered merge + archive with 1.5, 3.6–3.9, 4.5, 4.6 unverified; recorded in change.md Notes. Manual testing found a real bug here (garbled PDF text from `subset: true`), fixed in 2fdf381.

### F2 — Slice epilogue not done in foundation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md:64, :180, :210; context/foundation/prd-v2.md:375
- **Detail**: The Phase 4 Implementation Note calls for S-13 → done and Open Roadmap Questions #1 / PRD §Open Questions #1 marked as resolved ("both — toggle", 2026-09-27). Epilogue commit 8d2bdb6 touched only plan.md and change.md; S-13 is still `ready`.
- **Fix**: After F1, update the three places in roadmap.md and prd-v2.md.
- **Decision**: FIXED — Open Questions #1 marked resolved in roadmap.md and prd-v2.md; S-13 → done and the Done entry are handled by /10x-archive.

### F3 — Stale render chunk after a deploy: endless "Spróbuj ponownie"

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/WeekPdfControls.tsx:78-87
- **Detail**: `render.<hash>.js` is loaded lazily. A teacher who opened the week before a deploy may get a 404 on the old hash; the generic message asks them to retry, and every retry fails until the page is reloaded.
- **Fix**: Catch an `import()` failure separately and show a message asking to reload the page.
  - Strength: The teacher gets the one action that works; a few lines in a single catch.
  - Tradeoff: A second error message.
  - Confidence: MED — depends on whether Workers Static Assets keep the previous deployment's files.
  - Blind spot: Retention of old assets after a Workers deploy not verified.
- **Decision**: FIXED

### F4 — revokeObjectURL after setTimeout(0)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/WeekPdfControls.tsx:58-60
- **Detail**: One tick after `click()` is enough for Chromium (the only browser in e2e); Safari (iOS blob preview) and Firefox can resolve the download asynchronously. FileSaver.js waits 40 s.
- **Fix**: Change the delay to 40 000 ms and update the comment.
- **Decision**: FIXED

### F5 — Test doesn't catch removal of normalizeWeek from the renderer

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/week-pdf/render.ts:111, render.test.ts:87-89; layout.test.ts:43-53
- **Detail**: pdf-lib doesn't throw on a missing glyph, and the "can fail" test checks the `hasGlyph` predicate, not that `renderWeekPdf` calls `normalizeWeek` — deleting line 111 leaves everything green (lesson: "a criterion must be able to fail"). `expectInsideMargins` checks text only, not `dashed-box`.
- **Fix**: Extract the normalize → layout step from render.ts as a function used by `renderWeekPdf` and test it on emoji input; extend `expectInsideMargins` to `dashed-box`.
- **Decision**: FIXED

### F6 — Bare catch {} discards the renderer's error

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/WeekPdfControls.tsx:85
- **Detail**: A fontkit/pdf-lib error leaves no trace.
- **Fix**: `console.error(error)` in the catch.
- **Decision**: DISMISSED — `eslint.config` sets `no-console: warn` and no component under `src/components` logs; the fix would break the convention for the sake of debugging.

### F7 — The reason for disabled buttons isn't tied to the buttons

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/plan/WeekPdfControls.tsx:113
- **Detail**: The `disabledReason` `<p>` has no id or `aria-describedby`; a screen reader doesn't hear why the button is disabled. `MonthGrid.tsx:82` uses `aria-describedby` for a similar link.
- **Fix**: A `useId()` id on the `<p>` and `aria-describedby` on both buttons while `disabledReason !== null`.
- **Decision**: FIXED

### F8 — fixtures.test-helpers.ts: a second convention for fixtures

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/week-pdf/fixtures.test-helpers.ts
- **Detail**: The only existing convention is the `__fixtures__/` directory (`src/lib/services/__fixtures__/`).
- **Fix**: Move it to `src/lib/week-pdf/__fixtures__/week.ts`.
- **Decision**: FIXED

### F9 — Paper typography: no keep-with-next, blank lines not collapsed

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/week-pdf/layout.ts:94-97, :230-252
- **Detail**: An activity title can end a page with its description on the next one; a run of `\n` in a description (500×) gives ~15 nearly blank "(cd.)" pages.
- **Fix**: Collapse runs of blank lines to one in `normalizeText`; keep-with-next waits for feedback from the paper print (F1).
- **Decision**: FIXED (blank-line collapsing); keep-with-next deferred to the F1 paper print.
