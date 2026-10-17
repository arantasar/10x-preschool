<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Regulamin i polityka prywatności (S-20)

- **Plan**: context/changes/legal-pages/plan.md
- **Scope**: Phases 1–4 of 4
- **Date**: 2026-10-17
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Automated criteria re-run on HEAD `5ac1fd2`: lint ✅, 788 unit tests ✅, build ✅, drafts/placeholders/FAQ/dates/roadmap greps ✅, e2e (legal-pages, landing-topic-carry, help-and-contact, account-deletion) 12/12 ✅. Manual 1.7–4.5 confirmed by Janusz on 2026-10-17; 4.6–4.7 pending (post-merge). Unplanned files (`Layout.astro`, `seo.ts`, `seo.test.ts`, `auth-error-messages.test.ts`) are needed by the plan's own contracts.

## Findings

### F1 — Cookie table leaves out the PKCE code-verifier cookie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/content/legal/polityka-prywatnosci.md (pkt 7, cookie table)
- **Detail**: `createServerClient` runs with `flowType: "pkce"`, so `signUp` and `resetPasswordForEmail` store `sb-…-auth-token-code-verifier` as a cookie (400-day default). `/auth/confirm` uses `verifyOtp` with `token_hash`, so nothing reads or deletes it. Pkt 7 says the table lists the cookies we use; this one is missing. The other rows match the code.
- **Fix**: Add a row: `sb-…-auth-token-code-verifier` — zabezpieczenie linku z e-maila (rejestracja, nowe hasło) — najdłużej 400 dni.
- **Decision**: FIXED — row for `sb-…-auth-token-code-verifier` added to pkt 7

### F2 — Policy pkt 2.1 does not list the terms-acceptance record

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/content/legal/polityka-prywatnosci.md (pkt 2.1 „Dane”)
- **Detail**: Phase 2 stores `terms_version` and `terms_accepted_at` with every new account, but the data list in 2.1 does not mention them.
- **Fix**: Add „wersja Regulaminu, którą zaakceptowano, i data akceptacji” to the 2.1 data list.
- **Decision**: FIXED — terms version and acceptance date added to pkt 2.1

### F3 — New FAQ answer says „tylko” and claims less than the policy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/faq.ts:94
- **Detail**: „Przechowujemy tylko adres e-mail, hasło … i Twoje plany” — the policy also lists session data (IP, browser), contact messages (12 months) and security logs (≤ 7 days). The file header requires every answer to be true today.
- **Fix**: Rephrase without „tylko”: „Przechowujemy to, czego Temio potrzebuje do działania: adres e-mail, hasło (jako zaszyfrowany skrót) i Twoje plany. …”
- **Decision**: FIXED — „tylko” replaced with „to, czego Temio potrzebuje do działania”

### F4 — e2e `accountExists` reads only the first page of users

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/legal-pages.spec.ts:65-83
- **Detail**: `listUsers({ perPage: 1000 })` reads one page. Above 1000 local users the assertion `toBe(false)` passes without testing anything, and the cleanup misses the account. `afterEach` also ignores `error`. `tests/e2e/support/supabase-admin.ts` already has a paginating `findUserIdByEmail` that throws on error, but it is not exported.
- **Fix**: Export `findUserIdByEmail` and use it in `accountExists` and in `afterEach`.
- **Decision**: FIXED — `findUserIdByEmail` exported and used in `accountExists` and `afterEach`

### F5 — Pkt 8 may not cover `auth.flow_state` rows

- **Severity**: 💬 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/content/legal/polityka-prywatnosci.md (pkt 8)
- **Detail**: roadmap §S-20 Unknowns lists `auth.flow_state` (no foreign key to `auth.users`) as surviving deletion. PKCE sign-up and reset create those rows. Whether GoTrue's own cleanup removes them on a short timer is unverified.
- **Fix**: Check `select count(*), min(created_at) from auth.flow_state;` on production. If old rows stay, add them to pkt 8 under „historia zdarzeń logowania” or delete them with a pg_cron job.
- **Decision**: FIXED — checked locally: rows survive >24 h and outlive the account. Added pg_cron job `auth-flow-state-retention` (migration 20261017120000, deletes rows older than 24 h daily) and named the records in pkt 2.6 and pkt 8 under the 7-day promise. Needs `npx supabase db push` before the merge

### F6 — Comment in the error map sits above the wrong entry

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/auth-error-messages.ts:138-140
- **Detail**: `[TERMS_NOT_ACCEPTED]` was inserted between the „Re-signing up…” comment and the two `SIGNUP_LINK_*` entries the comment explains.
- **Fix**: Move the `TERMS_NOT_ACCEPTED` line above that comment.
- **Decision**: FIXED — entry moved above the comment

### F7 — Route accepts any non-empty `terms` value

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/signup.ts:14
- **Detail**: `!form.get("terms")` treats `"false"` or `"0"` as acceptance. Not a bypass: a hand-built request can send `accepted` anyway. But the contract with the checkbox's `value="accepted"` is implicit.
- **Fix**: Compare `form.get("terms") !== "accepted"`, plus one unit case for a wrong value.
- **Decision**: FIXED — route compares with `TERMS_ACCEPTED_VALUE` ("accepted", shared with the checkbox); new unit case for `terms=false`, seen red on the old condition

### F8 — CLAUDE.md wording rule does not mention the terms carve-out

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: CLAUDE.md (Key conventions, plan-state wording)
- **Detail**: The rule bans „Akceptuj” for plan state; „Akceptuję Regulamin” / „Zaakceptuj Regulamin” are legitimate but read like a violation to a future grep or reviewer.
- **Fix**: Add to the rule: „akceptacja Regulaminu (rejestracja) jest poza tą regułą”, next to the „dzień roboczy” exception.
- **Decision**: FIXED — carve-out added to the plan-state wording rule in CLAUDE.md

## Triage summary (2026-10-17)

Triaged automatically with the recommended fixes, on Janusz's instruction. Fixed: F1–F8 (8).

Re-run after fixes: lint ✅, 789 unit tests ✅, build ✅, e2e 12/12 ✅. `npm run test:db`: 166/167. The failing test, `contact_messages.test.sql` #16, counts every row in the table, and the local database holds Janusz's manual test message from 2026-10-17 („Test skrzynki OVH”). It fails the same way with this change stashed, so it is not a regression. It passes once that row is gone.
