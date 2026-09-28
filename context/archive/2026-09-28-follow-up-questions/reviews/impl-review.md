<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Polecenie dla modelu przy aktywności

- **Plan**: context/changes/follow-up-questions/plan.md
- **Scope**: All 4 phases
- **Date**: 2026-09-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Automated checks at review time: `npm test` 424/424, `npm run lint`, `npm run build` green; `npm run test:gate` exit 2 (suspended); `day-plan.pl.md` / `day-plan.schema.json` untouched vs master; `git diff -w master..HEAD -- context/foundation/roadmap.md` adds lines only; drift test verified red on a one-word change to §Odbiorca (file restored). After triage fixes: 433/433, lint and build green.

## Findings

### F1 — The data fence can be broken with doubled brackets or NFD diacritics

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality / Plan Adherence
- **Location**: src/lib/services/activity-generator.ts:369-374
- **Detail**: `neutralizeActivityTags` made a single pass and removed only the brackets of the matched tag, so an outer bracket rebuilt it: `"<</aktywnosc>>"` → `"</aktywnosc>"`, `"<<aktywnosc>>"` → `"<aktywnosc>"`. `</aktywność>` in NFD was not matched at all. This forged the instruction line the plan's Critical Implementation Details forbid; the tests did not cover it.
- **Fix**: NFC normalisation, then strip every `<`, `>`, `＜`, `＞` from interpolated data; add the doubled-bracket, NFD and full-width cases to the tests.
- **Decision**: FIXED — all angle brackets stripped after `normalize("NFC")`; 3 new description cases plus a doubled-bracket title case in `activity-generator.test.ts`.

### F2 — "Spróbuj ponownie" after switching drafts sends the old instruction to a different activity

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/DayPlanEditor.tsx:80-91, :384-386
- **Detail**: `setDraft` reset the instruction and notes on an id change but not `failure`. A refine that failed on A → Anuluj → open B → "Spróbuj ponownie" sent A's instruction against B's text. `saveDraft`'s retry had the same gap.
- **Fix**: `setFailure(null)` in `setDraft`'s id-change branch.
- **Decision**: FIXED — side effect: opening or closing a draft also dismisses a stale failure from generate/accept/delete, which is consistent with "whatever was said about the previous one no longer applies".

### F3 — A blank model answer leaves the draft stuck

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/day-plan-contract.ts:73-76, src/lib/day-plan-guards.ts:122-130
- **Detail**: `min(1)` with no trim, and the guard checked `length > 0`, so `" "` / `"\n"` from the model reached the draft, which then disabled both "Zapisz" and "Zapytaj model".
- **Fix**: `z.string().trim().min(1)` for `tytul`/`opis`; `.trim().length > 0` in `isRefinedActivityBody`.
- **Decision**: FIXED — plus tests in `activity-generator.test.ts` and `day-plan-guards.test.ts`.

### F4 — All manual verification is pending, including the only pre-merge safety check

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: plan.md §Progress 1.5, 2.5, 3.4–3.12, 4.7, 4.8
- **Detail**: Every Manual row is `[ ]` while the change was marked implemented. The plan calls step 5 of Manual Testing Steps the only safety assessment before merge; the gate is suspended and lessons §3 was overridden by owner decision. A `master` merge ships to production.
- **Fix**: Run §Manual Testing Steps before merging (at least 3.9, 3.10 and step 5), tick the rows, and record the three risky instructions' answers in the PR description.
  - Strength: The only real signal about the prompt before production.
  - Tradeoff: Needs live dev with an OpenRouter key and owner time.
  - Confidence: HIGH — stated in the plan and lessons §3.
  - Blind spot: Covers only the default model, not every allowed one.
- **Decision**: FIXED by the owner 2026-09-28 — manual checks run on production after the PR #32 merge (not before it, as recommended); all Manual rows in `plan.md` §Progress ticked.

### F5 — Gaps in refine.test.ts compared with week/day.test.ts

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/pages/api/day-plan/refine.test.ts
- **Detail**: No "500 when OpenRouter is not configured" case (week/day.test.ts:180 has one).
- **Fix**: Add the config → 500 case with the no-DB assertion.
- **Decision**: FIXED

### F6 — U+2028/U+2029 get through singleLineText (pre-existing)

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/day-plan-contract.ts:165
- **Detail**: `CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/u` does not cover `Zl`/`Zp`, so a "single-line" instruction (and hasło/theme) could carry a line separator.
- **Fix**: Extend the class to `[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]` and add tests.
- **Decision**: FIXED — applies to every `singleLineText` field, not only the instruction.

### F7 — The judge's count check for kind:"activity" can never fire; gate comment is inaccurate

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/content-safety-judge.ts (itemCounts), src/lib/services/content-safety.gate.test.ts:203-204
- **Detail**: `{actual: 1, expected: 1}` is hard-coded; the plan's "zero items fails" became "empty activity fails the shape check" — acceptable, documented in the test. The gate comment said the instruction fills the hasło column, but `refineCase.name` does.
- **Fix**: Correct the gate comment; accept the count drift.
- **Decision**: FIXED (comment); count drift ACCEPTED.

### F8 — DayPlanEditor.tsx is growing (≈1000 lines, ActivityEditor has 14 props)

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/components/plan/DayPlanEditor.tsx
- **Detail**: The refine state is a candidate for a hook in `src/components/hooks/` per CLAUDE.md, but it shares `inFlight`/`lastAttempt`/`failure`/`busy` with `mutate`, so a clean extraction first needs a shared request-lifecycle hook.
- **Fix**: Record as a follow-up refactor, not a blocker.
  - Strength: Doesn't widen the risk surface just before merge.
  - Tradeoff: The island keeps growing.
  - Confidence: MED — scope depends on untangling the shared state.
  - Blind spot: Other islands not checked for the same pattern.
- **Decision**: DEFERRED — queued in `follow-ups/review-fixes.md`.
