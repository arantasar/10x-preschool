<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Ochrona zapisu i własności (Faza 3 rolloutu)

- **Plan**: context/changes/testing-write-ownership/plan.md
- **Scope**: Phases 1–5 of 5
- **Date**: 2026-09-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 5 observations

Automated checks run during the review: `npm test` 532/532, `npm run lint` clean, `npm run test:db` 129 assertions PASS, `npm run test:db:api` 8/8 on two consecutive runs, `npm test` runs 0 `*.db.test.ts`, 0 `api-teacher-*` rows left after the runs, Phase 1 and Phase 5 grep gates pass, `supabase/migrations` and `tests/e2e` untouched.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — All 11 Manual Progress rows unchecked; 4.5 has no evidence

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/testing-write-ownership/plan.md:487-542
- **Detail**: change.md says `implemented`, but no Manual row is ticked. Mutation outcomes (test comments, §6.7 points 1–3), the job time (2 min 22 s), the leftover-row check and the green db log (run 36766052693) exist as evidence. 4.5, the negative CI control, has none: the branch's three CI runs are a Postgres crash, a green run and an ECR failure, with no deliberate red `db`.
- **Fix**: Tick the rows that have evidence and point to it. Run 4.5, or mark it as consciously skipped. Leave 5.5 and 5.6 to the human.
  - Strength: Progress becomes the source of truth again instead of contradicting change.md.
  - Tradeoff: 4.5 costs a throwaway commit plus a revert on the PR.
  - Confidence: HIGH — the evidence is on disk.
  - Blind spot: Only the comments attest that the Phase 1–2 mutations were actually run.
- **Decision**: FIXED (auto-triage) — Manual rows 1.4, 1.5, 2.4, 3.5–3.7, 4.3, 4.4 ticked with evidence pointers; 4.5 marked NIE WYKONANE with reason; 5.5/5.6 left for the human

### F2 — The `db` job is red on the PR's current HEAD (ECR rate limit)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: .github/workflows/ci.yml (Start the local Supabase stack)
- **Detail**: Run 36768531052 (epilogue commit) fails in `supabase start` with `toomanyrequests: Data limit exceeded`. §6.7 says that if the limit repeats, image caching goes to next-actions.md. It has repeated, and there is no entry.
- **Fix A ⭐ Recommended**: Re-run the job and add an image-cache/retry item with an owner to next-actions.md.
  - Strength: Follows the rule §6.7 already set, with no workflow change in a phase that is closed.
  - Tradeoff: The badge stays flaky until that item is done.
  - Confidence: HIGH — the failure is infrastructure, and the previous run was green.
  - Blind spot: How often ECR limits the shared runner IP.
- **Fix B**: Add a retry loop around `supabase start` now.
  - Strength: Absorbs transient limits immediately.
  - Tradeoff: A retry doesn't lower the quota; under a sustained limit it only adds minutes.
  - Confidence: MED — depends on how long the limit window lasts.
  - Blind spot: Whether the CLI leaves partial containers behind between attempts.
- **Decision**: FIXED via Fix A (auto-triage) — failed db job re-run → success; ECR item with owner added to next-actions.md, §6.7 updated

### F3 — Post-`throws_ok` "untouched" assertions can't fail on their own

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/database/day_plan_write.test.sql:780-794, supabase/tests/database/week_plan_write.test.sql:340-369
- **Detail**: The comment claims "the refusals aborted before the upsert". A raising function rolls back its whole statement, so the counter and batch stay the same whether it raised before or after the upsert. These assertions go red only together with the `throws_ok` before them. The ordering is proven by the U0003-vs-U0002/U0001 assertions. The plan's contract bullet asked for this, so the flaw is in the plan too.
- **Fix**: Reword the comments to say the assertions confirm statement atomicity only and that the ordering is proven below.
- **Decision**: FIXED (auto-triage) — comments reworded in both files; assertions and plan(N) kept

### F4 — Postgres pin 17.6.1.127 is bumped by hand, with no owner

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:59-60
- **Detail**: The pin writes a CLI-internal file. §6.7 says "bump it on upgrade", but next-actions has no item for it (lesson: deferred work needs an owner).
- **Fix**: Add a next-actions item with an owner.
- **Decision**: FIXED (auto-triage) — next-actions.md item with owner

### F5 — db job: no timeout, and the full status env is dumped into GITHUB_ENV

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:41,66
- **Detail**: With no `timeout-minutes`, a hung pull runs to the 360-min default. SECRET_KEY and JWT_SECRET show unmasked in step headers. They are local demo values, but the pattern is unsafe to copy.
- **Fix**: Add `timeout-minutes: 15` and filter the export to API_URL, PUBLISHABLE_KEY and SECRET_KEY.
- **Decision**: FIXED (auto-triage) — timeout-minutes: 15; export filtered to API_URL/PUBLISHABLE_KEY/SECRET_KEY

### F6 — supabase-local.ts robustness gaps

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/__fixtures__/supabase-local.ts:62-69,134-143,180-211
- **Detail**: `execFileSync` has no timeout and drops stderr. `ensureUser` lacks the e2e create-race retry. A failed activities insert in seedDay leaks the plan row. All three fail loudly; none gives a false pass.
- **Fix**: Add `timeout: 30_000`, attach stderr to the error, copy the e2e retry, and delete the plan by id before rethrowing.
- **Decision**: FIXED (auto-triage) — timeout + stderr in the status fallback, create-race retry, seedDay cleans up the orphan plan

### F7 — The accept.db withdrawal case has no positive control of its own

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/day-plan/accept.db.test.ts:82-97
- **Detail**: "B withdraws A's acceptance → 404" would also pass against a route that returns 404 for every `accepted: false`.
- **Fix**: End the case with A withdrawing their own acceptance → 200, then accepted_at read as A → null.
- **Decision**: FIXED (auto-triage) — owner withdrawal → 200 and accepted_at null as a positive control

### F8 — vitest.db.config.ts missing the vitest/config type reference; the fixture imports from tests/e2e

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: vitest.db.config.ts:9, src/lib/services/__fixtures__/supabase-local.ts:10
- **Detail**: The gate config carries `/// <reference types="vitest/config" />`, and this one type-checks only through leakage. The re-export from tests/e2e/support/test-data.ts relies on that file importing supabase-admin type-only.
- **Fix**: Add the triple-slash reference. The comment that test-data.ts must stay free of runtime imports goes in supabase-local.ts, since the plan excludes changes to tests/e2e.
- **Decision**: FIXED (auto-triage) — triple-slash reference added; the note about the runtime-import constraint went into supabase-local.ts (tests/e2e is out of scope)
