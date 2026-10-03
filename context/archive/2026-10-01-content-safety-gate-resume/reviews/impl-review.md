<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Odwieszenie bramki bezpieczeństwa treści (F-02)

- **Plan**: context/changes/content-safety-gate-resume/plan.md
- **Scope**: Phases 1–4 of 4
- **Date**: 2026-10-03
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 6 observations

Automated checks at review time: `npm test` 565/565, `npm run lint`, `npm run build`; greps 2.3, 2.4 and 4.1 empty on HEAD and hitting on `master`; the path filter matches 3/3 and 0/2 on the control list; PR #40 `content-safety-gate` passed in 3m21s. Triage mode: automatic, recommended option per finding (owner's choice).

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — A retry re-asks Haiku after Sonnet fails

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/content-safety.gate.test.ts:106, src/lib/services/content-safety-judge.ts:433-445
- **Detail**: `judgeSafely` wrapped the whole `judgeContentSafety` in `retryGateCall`. A sequence of Haiku "unsafe", then a Sonnet transient error or 402, re-ran both stages, so Haiku was asked again. A second Haiku "safe" ended green with no final verdict. That retries a verdict, which `gate-retry.ts` itself forbids. The first Haiku call's cost was also lost. 4.4.2 says each input gets at most one verdict per stage.
- **Fix**: Retry each stage inside `judgeContentSafety` and drop the outer retry. Add a unit test with `fetch` stubbed.
  - Strength: Only the call that produced no verdict is repeated, and the test pins the order.
  - Tradeoff: The judge module now imports `gate-retry.ts`. Production does not use the judge.
  - Confidence: HIGH — the test fails without the inner retry.
  - Blind spot: Not run live.
- **Decision**: FIXED — `content-safety-judge.ts` (per-stage `retryGateCall`), `content-safety.gate.test.ts` (outer retry removed), test `judgeContentSafety — two stages, retried one stage at a time`.

### F2 — The matrix checks for calibration failures, not passes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/content-safety.gate.test.ts:125,155-173; vitest.gate.config.ts:22
- **Detail**: `calibrationFailures` was only filled from a `catch` in the test body. Two cases let the matrix start on an uncalibrated judge: a Vitest timeout (60 s against a two-stage worst case of 60 s or more), and `-t "live matrix"`, which skips calibration.
- **Fix**: Count passes and require `calibrationPassed === CONTENT_SAFETY_FIXTURES.length`. Set `testTimeout` to 150 s, above 4 × `JUDGE_TIMEOUT_MS`.
- **Decision**: FIXED

### F3 — The CI path filter misses files that change what the gate grades

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:107, src/lib/services/gate-scope.ts:31
- **Detail**: The filter did not match any of these files:
  - `activity-generator.ts`: builds every message, sets the temperature and parses the response;
  - `generation-error.ts`: holds the retry categories;
  - `src/lib/day-plan-limits.ts`: holds the counts the judge checks.

  So a PR touching only these files ran no gate, and one paired with a single prompt narrowed the matrix. The two regexes were hand-kept copies with no test tying them together. The gap came from the plan's own regex.
- **Fix A ⭐ Recommended**: Add the three files to both regexes and pin `ci.yml` to `FULL_MATRIX` with a test.
  - Strength: The gate runs whenever the message, the temperature, the parsing or the counts change. Drift between the copies fails `npm test`.
  - Tradeoff: More PRs trigger a paid run.
  - Confidence: HIGH — the pin test fails when one copy changes.
  - Blind spot: `src/lib/day-plan-dates.ts` (the weekday label) was deliberately left out.
- **Fix B**: Soften the comment ("everything that changes…") and leave the filter.
  - Strength: No extra paid runs.
  - Tradeoff: The gap stays.
  - Confidence: MED.
  - Blind spot: How often the generator changes.
- **Decision**: FIXED via Fix A

### F4 — A top-level `cache_control` probably doesn't cache the rubric

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/content-safety-judge.ts:364-368
- **Detail**: OpenRouter's automatic caching puts the breakpoint on the last block, the user message, which differs in every call. The result is a cache write (charged at a premium where caching kicks in) that no later call reads. The rubric alone (~2–2.5k tokens) is below Haiku's minimum. `gate-runs.md` says the effect was never measured.
- **Fix A ⭐ Recommended**: Remove `cache_control`.
  - Strength: No write premium with no reads.
  - Tradeoff: Reverses 4.4.3.
  - Confidence: MED — based on the documentation, no live measurement.
  - Blind spot: If Sonnet's minimum is lower, block-level caching on the rubric could pay off.
- **Fix B**: `cache_control` on the system-message block, then measure `usage` on two calls.
  - Strength: The rubric could actually be cached.
  - Tradeoff: Needs a paid measurement.
  - Confidence: LOW.
  - Blind spot: The minimum per model.
- **Decision**: FIXED via Fix A

### F5 — Manual Progress rows are unticked, and 4.7 can't pass as written

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md §Progress (1.3, 1.4, 2.5, 3.4–3.6, 4.6–4.8); plan.md Phase 4 Manual
- **Detail**: `change.md` says `implemented` while every Manual row is `[ ]`. Criterion 4.7 (`git diff -w master..HEAD -- roadmap.md`) cannot pass, because `b8b7cf4` brings the whole M-03 roadmap onto the branch. From `b8b7cf4..HEAD`, the diff is 5 lines in F-02 and Baseline, which meets the intent.
- **Fix**: Change the range in 4.7 to `b8b7cf4..HEAD`. The Manual rows stay for the owner to tick.
- **Decision**: FIXED (criterion text). The Manual rows are a follow-up.

### F6 — Stale comments and dates

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: content-safety-judge.ts (callJudge comment, judge model comment), vitest.gate.config.ts:18-26, ci.yml:81-82, next-actions.md:24,66,451, test-plan.md:341, roadmap.md:98,112
- **Detail**:
  - The "Reasoning is left enabled" comments contradicted "the request enables no reasoning".
  - The config still described two gate files.
  - `ci.yml` had a doubled `#` line.
  - The model comment did not record the 2026-10-03 calibration.
  - The docs dated the resume and the switch's removal 2026-10-01, but `96bfb95` landed on 2026-10-03.
- **Fix**: Rewrite the comments and correct the dates to 2026-10-03.
- **Decision**: FIXED

### F7 — An outline failure is labelled `week` outside that scope

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/content-safety.gate.test.ts:227-228
- **Detail**: With only `day-plan.*` changed, a failed outline was recorded as `week`, which the report's `Tryby:` line does not list. The gate still failed closed.
- **Fix**: Label it `day-themed` when `week` is out of scope.
- **Decision**: FIXED

### F8 — The „przepraszam” regex misses an apology after a bare newline

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/content-safety-judge.ts:138
- **Detail**: The lookbehind needed `.!?…` before the word, so "…\nPrzepraszam, …" passed through. Other forms are missed too: after a dash or colon, and "Bardzo przepraszam". Catching those would bring back the false alarm from runs 2 and 6.
- **Fix**: Add `\n` to the lookbehind, with a test that fails on the old regex.
- **Decision**: FIXED (newline only; dash, colon and "Bardzo przepraszam" left on purpose)

### F9 — The gate job gets SUPABASE_* secrets it doesn't need

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:130-131
- **Detail**: Code a PR controls received secrets it doesn't use. They are also missing from the repo (`gh secret list`: only `OPENROUTER_API_KEY`).
- **Fix**: Pass only `OPENROUTER_API_KEY`.
- **Decision**: FIXED

### F10 — `JUDGE_MAX_TOKENS` 4000→1000 is not in the plan

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/services/content-safety-judge.ts:70
- **Detail**: The change is benign and recorded in `gate-runs.md:212`, but missing from the plan.
- **Fix**: Add a plan addendum (Phase 4, item 5).
- **Decision**: FIXED
