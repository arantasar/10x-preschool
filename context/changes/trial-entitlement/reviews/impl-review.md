<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Okres próbny i stan planu konta (S-23)

- **Plan**: context/changes/trial-entitlement/plan.md
- **Scope**: Phases 1–3 of 3
- **Date**: 2026-10-18
- **Verdict**: NEEDS ATTENTION (before triage) — all findings resolved in triage
- **Findings**: 0 critical, 3 warnings, 3 observations

Verified at review time: `npm test` 855/855, `npm run test:db:api` 12/12, lint ✓, build ✓, `npm run test:db` 258/259 (F1), `claim_generation` grep 0, migrations diff = new file only, forbidden-words grep empty, `PRIVACY_VERSION` 1.3 ✓, policy text in pkt 2.1 ✓. `npx supabase db reset` not run (it would wipe local data). After triage: `npm run test:db` PASS (account_entitlements 23/23), `test:db:api` 12/12.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | FAIL |

## Findings

### F1 — pgTAP test 9 counts the whole table

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/tests/database/account_entitlements.test.sql:96
- **Detail**: `count(*) == 5` over the whole table only passes on an empty table. Every GoTrue account created after the migration (including the fixture teachers from `ensureUser`) has a row, so `npm run test:db` was red on the existing local database (1/22, test 9).
- **Fix**: Limit the count to the five fixture ids.
- **Decision**: FIXED

### F2 — updated_at has no trigger

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20261018140000_account_entitlements.sql:46
- **Detail**: The column only gets a default on insert. The SQL Editor edits (testers) and S-25/S-26 updates would leave it at the sign-up time. `day_plans` uses `public.set_updated_at()`. This is a gap in the plan; the migration hadn't been pushed yet.
- **Fix**: Add a `before update` trigger on `public.set_updated_at()` in the same migration, plus a pgTAP test.
- **Decision**: FIXED (migration + pgTAP test 21; trigger also created by hand on the local database so no `db reset` was needed)

### F3 — pgTAP role path differs from the plan; plan.md not updated

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/trial-entitlement/plan.md (Phase 1 §3)
- **Detail**: The plan requires an insert under `set local role supabase_auth_admin`, which isn't possible locally. The implementation checks the role's privileges directly and proves the insert through GoTrue (a sound substitute, with a break-check in 9785ae9). This was recorded only in the commit and the test header.
- **Fix**: Add an addendum to plan.md.
- **Decision**: FIXED

### F4 — Manual 2.5 can't be done as written; all manual rows pending

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md Progress 2.5
- **Detail**: After a reset the fixture teachers have rows too, so a "konto bez wiersza" has to be made in Studio. Rows 1.8 and 2.4–2.7 are pending; 3.4–3.7 happen at merge.
- **Fix**: Reword 2.5 in the plan; run the manual checks before merging.
- **Decision**: FIXED (wording); manual checks queued in follow-ups/review-fixes.md

### F5 — newTeacher leaks the account if sign-in fails

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/__fixtures__/supabase-local.ts:181
- **Detail**: When `createUser` succeeds and sign-in throws, the caller doesn't get the id and can't remove the account.
- **Fix**: Delete the account before rethrowing.
- **Decision**: FIXED

### F6 — Roadmap status changed to `ready` before archiving

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md:75, :263
- **Detail**: The plan says the status changes at archive; it moved from blocked to ready now (accurate, since S-28 is done).
- **Fix**: Leave it; `/10x-archive` sets `done`.
- **Decision**: NO CHANGE NEEDED
