<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Account Deletion (S-18)

- **Plan**: context/changes/account-deletion/plan.md
- **Scope**: Phases 1–3 of 3
- **Date**: 2026-10-15
- **Verdict**: NEEDS ATTENTION (before triage) → all findings resolved except F2, which is an owner action before merge
- **Findings**: 0 critical, 3 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS (`tests/e2e/password-change.spec.ts` locator scoping is a documented, behaviour-neutral adaptation) |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Automated re-run before triage: db reset, pgTAP 162/162, types grep, unit 774/774, lint, build, e2e 37/37 — all pass. After triage: pgTAP 167/167, unit 774/774, lint, build, e2e 37/37.
Manual rows 1.6, 2.5, 3.6–3.9 pending; none checked without evidence.

## Findings

### F1 — Password proof lives only in the route; the RPC deletes on a bare JWT

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261015120000_delete_own_account.sql
- **Detail**: Anyone holding an `authenticated` access token plus `SUPABASE_KEY` could call `/rest/v1/rpc/delete_own_account` directly and delete the account without the password. `sb-*` cookies are not httpOnly. The only barrier was that the key is server-only.
- **Fix A ⭐ Recommended**: require a fresh session inside the function (the JWT `session_id` names the caller's own `auth.sessions` row, created < 5 minutes ago), plus pgTAP for that.
- **Fix B**: document the assumption in CLAUDE.md only.
- **Decision**: FIXED via Fix A.
  - The migration (edited in place; never pushed) adds the check.
  - pgTAP adds three refusals: no `session_id`, a stale session, someone else's session. Removing the check turns tests 6–9 red.
  - The e2e still passes, because `@supabase/ssr` serves the freshly signed-in session to the following RPC.
  - The route comment and CLAUDE.md are updated.

### F2 — Hosted DELETE privilege is proven only after the merge goes live

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (plan issue)
- **Location**: plan.md Progress 3.8; migration header
- **Detail**: The only proof that the hosted `postgres` owner may delete from `auth.users` is the post-merge manual check, and a merge to `master` is a production release.
- **Fix**: before merging, push the migration and test the function on the hosted project with a throwaway account.
- **Decision**: DEFERRED TO OWNER. Pushing to the production database is the owner's action. The steps are in `follow-ups/review-fixes.md`.

### F3 — E2E couldn't fail if the local sign-out stopped clearing cookies

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/e2e/account-deletion.spec.ts
- **Detail**: The `/plan/month` → `/auth/signin` check passes even with dead `sb-*` cookies, because the middleware's `getUser` rejects a deleted user. The plan's invariant "the browser has no session" was therefore not asserted.
- **Fix**: assert that no `sb-` cookie is left in context 1, and document the 5xx case in the route comment.
- **Decision**: FIXED. Skipping `signOut` in the route turns the new assertion red; the route was restored afterwards.

### F4 — E2E cleanup leak and a timing gap in the „Zostaw” check

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: tests/e2e/account-deletion.spec.ts
- **Detail**: Account `a` was added to the cleanup list only after `b` was created. The no-request check was read right after the window closed.
- **Fix**: push each id right after it is created, and read the requests after a later navigation.
- **Decision**: FIXED.

### F5 — The kept contact_messages row was described, not asserted

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: supabase/tests/database/delete_own_account.test.sql
- **Fix**: add a contact message fixture for A and assert its `user_id` is null after deletion. B's session is also asserted intact.
- **Decision**: FIXED.

### F6 — GoTrue audit log keeps the e-mail after deletion

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: migration header (cascade list)
- **Detail**: `auth.audit_log_entries` (e-mail in `payload`) and `auth.flow_state` have no foreign key to `auth.users`. The GoTrue admin API leaves them too, so this is not a regression. It matters for what the privacy policy may promise.
- **Fix**: add an owner note to S-20.
- **Decision**: FIXED. Added to the S-20 Unknowns in `context/foundation/roadmap.md`, together with contact messages.

### F7 — Password-manager autofill can weaken the proof of intent

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/account/DeleteAccountForm.tsx
- **Fix**: accept the risk and note it. `autocomplete="off"` is commonly ignored on password fields.
- **Decision**: ACCEPTED. Noted in the route's header comment.

### F8 — Empty address in the window if email were ever missing

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/account/DeleteAccountForm.tsx
- **Fix**: make `email` required.
- **Decision**: FIXED. `email: string` is required, and `ustawienia.astro` renders the island only when `user.email` exists.
