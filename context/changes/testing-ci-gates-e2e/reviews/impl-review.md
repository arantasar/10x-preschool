<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Bramki jakości w CI + e2e ścieżki krytycznej

- **Plan**: context/changes/testing-ci-gates-e2e/plan.md
- **Scope**: Phases 1–4 of 5 (Phase 5 not started)
- **Date**: 2026-10-31
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 6 warnings, 4 observations

Automated checks re-run: lint, `npm test` (918), build, stub address in `dist/`, `FULL_MATRIX` diff, `waitForTimeout` grep, workflow YAML parse; PR #61 at 31d1f61 all green and `CLEAN`. Not run: actionlint (download blocked; YAML parse only). Triage was automatic, with the recommended fixes, at the owner's request.

After the fixes: lint, `npm test`, build and `npm run test:db:api` (12) green; no `env.ts` code and no stub address in `dist/`. `npx playwright test` on a second port (4322, because a plain `astro dev` held 4321): 49 passed, 1 failed. The failure is `password-reset.spec.ts:66`: `supabase/config.toml` allows redirects only for port 4321, so it was not re-run on that port. The fixes are uncommitted, so CI has not seen them. The new spec went red with the tile link broken and green after the revert.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Test files are live routes on production

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/**/*.test.ts (20 files)
- **Detail**: Pre-existing on master. Astro routes the test files, so they enter the worker bundle with vitest. `/api/contact.test` and `/api/contact.db.test` answer 500 on temio.pl, a made-up route 404. No secret reader ships. Cause of the 500 not traced.
- **Fix**: Record in next-actions.md with an owner; move route tests out of `src/pages` in a separate change.
- **Decision**: FIXED (recorded in next-actions.md; the code change itself stays open under that owner)

### F2 — test-data.ts breaks its documented import boundary

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: tests/e2e/support/test-data.ts:2
- **Detail**: `supabase-local.ts:9-11` relies on test-data.ts having no value import of env.ts; the new `LLM_STUB_URL` import added 21 lines of env.ts to the worker's supabase-local chunk.
- **Fix**: Move `llmStubCalls` to `support/llm-stub-client.ts`.
- **Decision**: FIXED

### F3 — E2E_SUPABASE_URL has no local-host guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/support/env.ts:48-50
- **Detail**: `supabase-local.ts:90-96` refuses non-local hosts; the e2e tier did not. A hosted URL in `.env.e2e` would create test accounts and rows on production. CI cannot reach this.
- **Fix**: Add the same hostname check to the `supabaseUrl` getter.
- **Decision**: FIXED

### F4 — Phase 5 proof runs with no master image cache

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: plan.md Phase 5 (rows 5.2, 5.3)
- **Detail**: Cache entries exist only on PR refs, so the temporary PR pulls images, as PR #62 did (two `toomanyrequests` reds). BLOCKED could come from the registry rather than a failing test.
- **Fix A ⭐ Recommended**: Keep the order; require the red to come from the `npm run test:e2e` step and treat a pull failure as a re-run.
- **Fix B**: Merge first, then protect and prove.
- **Decision**: FIXED via Fix A

### F5 — "Protection unavailable" comments are stale, ci.yml not on Phase 5's list

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: .github/workflows/ci.yml:31,114; playwright.config.ts:33
- **Detail**: ci.yml says protection is unavailable (false since the repo went public); playwright.config.ts says the check blocks merge (not true yet).
- **Fix**: Add both files to Phase 5's list; correct the comments when protection is switched on.
- **Decision**: FIXED (plan updated; the comments themselves change in Phase 5)

### F6 — Month→day link has no browser coverage

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: tests/e2e/critical-path.spec.ts:43-47
- **Detail**: The spec enters through `/plan/week`, for a recorded reason; no spec follows the `brak planu` link, only its label has a unit test.
- **Fix A ⭐ Recommended**: Add one small spec for the link.
- **Fix B**: Record the change as a plan addendum.
- **Decision**: FIXED via Fix A (`tests/e2e/month-empty-day-link.spec.ts`)

### F7 — Plan text was not reconciled with what was built

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: plan.md Phases 1, 3, 4; test-plan.md §3, §6.7
- **Detail**: `save-images`, `vite.ssr.optimizeDeps`, `auth.setup.ts`, `stdout: "pipe"`, test count, §3 status, §6.7 heading.
- **Fix**: Add an addendum to plan.md and align §3 and §6.7.
- **Decision**: FIXED

### F8 — Remaining sources of false red in CI

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/auth.setup.ts:60; tests/e2e/generation-progress.spec.ts:46; .github/actions/supabase-stack/save/action.yml:15
- **Detail**: The warm-up asserts only 200; the "Wysyłam hasło do modelu…" stage lasts 4 s; a failed `docker save` turns `db` red after its tests passed. None has appeared in 5 green attempts.
- **Fix**: `continue-on-error` on the save step; change the other two only if they fail.
- **Decision**: FIXED (save step only)

### F9 — Critical-path test name has no risk number

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/critical-path.spec.ts:33
- **Detail**: E2E-RULES.md requires `ryzyko #N`; the plan chose `ścieżka krytyczna — …` and the risk map has no such row.
- **Fix**: Add that exception to E2E-RULES.md.
- **Decision**: FIXED

### F10 — A broken accept commit would land in master history

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: commits dc499f1, 26434dd
- **Detail**: The revert is clean and only the tip deploys, but a merge commit keeps dc499f1 in history, where it can mislead `git bisect`.
- **Fix**: Leave it as is; the commit message says it is not for merge.
- **Decision**: ACCEPTED (no change, per the recommended fix)
