<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Password Change (S-17)

- **Plan**: context/changes/password-change/plan.md
- **Scope**: all 4 phases + the header follow-up (commit `fbfa016`)
- **Date**: 2026-10-14
- **Verdict**: NEEDS ATTENTION (no blockers) → all findings triaged
- **Findings**: 0 critical, 3 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated criteria, run during the review: 1.1 design merged PASS · 1.2 unit 99/99 · 2.1 route 16/16 · 2.2 grep 1 session-e-mail line, 0 form-e-mail reads · unit 756/756 · lint 0 · build 0 · new E2E 3/3 · full E2E 30/30. Manual rows 1.4, 2.5, 3.5–3.9, 4.4, 4.5 pending; none ticked without evidence.

After the fixes: unit 756/756 · lint 0 · build 0 · E2E 28/28 twice on a fresh dev server (port 4323; the two risk-#15 tests need port 4321 from the Supabase redirect allow-list and were excluded). A long-running dev server on 4321 failed print/hydration tests on unchanged code; a fresh server did not.

Checked and sound: the e-mail comes only from `locals.user` (validated by `getUser()` in the middleware); a failed `signInWithPassword` writes no cookies (auth-js returns before `_saveSession`); URLs carry only codes, logs never a password; the flash cookie is set and deleted with the same path; the form POST is covered by `security.checkOrigin`. Plan drift: every planned file matches its contract; the only drift is the header link, done on the user's request.

## Findings

### F1 — No per-account limit on current-password guesses

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/change-password.ts:61
- **Detail**: The re-sign-in reaches GoTrue from the Worker without the client's IP (`src/lib/supabase.ts` forwards cookies only), so GoTrue's sign-in limit counts Cloudflare's shared egress addresses. A stolen session can guess the current password with no per-account cap; unrelated traffic can fail a real change with `over_request_rate_limit`. `/api/auth/signin` has the same exposure already.
- **Fix A ⭐ Recommended**: Record as a known decision (plan addendum + lesson)
  - Strength: No change to working code; the risk is visible to S-22 and every later password/mail route.
  - Tradeoff: The gap stays open.
  - Confidence: HIGH — the same exposure already exists in sign-in.
  - Blind spot: How production GoTrue counts this limit was not verified.
- **Fix B**: Attempt counter per `user.id` (e.g. KV) before `signInWithPassword`
  - Strength: A hard per-account cap independent of IPs.
  - Tradeoff: New KV binding, tests, a threshold and lockout decision.
  - Confidence: MED — no KV pattern in the repo yet.
  - Blind spot: Covers this route, not `/api/auth/signin`.
- **Decision**: FIXED via Fix A — plan addendum „Known decision: no per-account limit on current-password guesses” (owner: a later security change, before S-22) + lesson „Logowanie z Workera nie niesie IP klienta” in `context/foundation/lessons.md` (ACCEPTED-AS-RULE).

### F2 — Stale CSRF comment

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: astro.config.mjs:31
- **Detail**: The comment called the sign-out POST the signed-in app's only state-changing form resting on `checkOrigin`; the password change rests on it too.
- **Fix**: Name `/api/auth/change-password` in the comment and add a CLAUDE.md line that the form relies on `checkOrigin`.
- **Decision**: FIXED

### F3 — Header change not recorded in the plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/changes/password-change/plan.md (Phase 3 §2, Manual row 3.6)
- **Detail**: Commit `fbfa016` replaced the planned avatar-only link (aria-label, double ring) with an avatar-and-address pill, restyled „Pomoc”/„Wyloguj się”, and added `StableLabel` and `scrollbar-gutter` (public pages too). `FormField.autoComplete` was added earlier. The plan and row 3.6 still described the old variant.
- **Fix**: Plan addendum describing the changes and what row 3.6 now checks.
- **Decision**: FIXED

### F4 — Weak spots in the tests

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/change-password.test.ts:80, tests/e2e/password-change.spec.ts:86–92
- **Detail**: The route test checked only `path` among the cookie options; nothing tested that the notice shows once; the "nothing changed" claim after a wrong password rested implicitly on the next step.
- **Fix**: Spell out the cookie options in the route test; reload in the E2E and assert the notice is gone; comment where the old password is proven to still work.
- **Decision**: FIXED — both new assertions verified red on broken code (no `httpOnly` in the constant → route test red; cookie not deleted → E2E red at `toBeHidden()`). While re-running the suite, the old-password message check in the same spec was made an exact match too (the dev-only island-props `<code>` element also matched under load).

### F5 — Link name ends in a colon on a phone

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/AppHeader.astro:75
- **Detail**: Below 721 px the address hides and the name read „Ustawienia konta:”.
- **Fix**: Hide the colon together with the address.
- **Decision**: FIXED — names verified in the browser: 390 px „Ustawienia konta”, 1440 px „Ustawienia konta: <adres>”.

### F6 — Password manager cannot tell which account the form is for

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/account/PasswordChangeForm.tsx
- **Detail**: No `autocomplete="username"` field, so a browser may not update the saved password.
- **Fix**: A hidden read-only input with the e-mail and no `name`, so the route still never reads an address from the form.
- **Decision**: FIXED

### F7 — Route comment simplifies the session state after a partial failure

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/change-password.ts:35
- **Detail**: If sign-in succeeds and `updateUser` fails, the device holds a fresh session and the previous one stays valid; the comment said "nothing has changed".
- **Fix**: One sentence in the comment.
- **Decision**: FIXED

### F8 — `role="status"` in server-rendered HTML is usually not announced

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/ustawienia.astro:54
- **Detail**: Same pattern as `month.astro`, so consistent, but a screen reader may not announce the confirmation.
- **Fix**: Leave for now; if fixed, fix both places together.
- **Decision**: SKIPPED (per recommendation)
