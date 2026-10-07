<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Password Reset (S-16)

- **Plan**: context/changes/password-reset/plan.md
- **Scope**: Phases 1–4 of 4 (full plan)
- **Date**: 2026-10-07
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Every item in the plan's contracts is built, and nothing is missing. "What We're NOT Doing" was respected. `src/lib/reset-request.ts` is not in the plan. It holds the two cookie names and their options, shared by the route that sets each cookie and the page that reads it; that is a justified extraction.

Automated checks re-run during the review: `npm test`, `npm run lint`, `npm run build`, grep gates 1.4 and 1.5, and the roadmap `diff -w` gate 4.4. All green. After the triage fixes: 609 unit tests and 28/28 Playwright tests are green against local Supabase restarted with `secure_password_change = true`.

## Findings

### F1 — Any signed-in session can set a new password without re-authenticating

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/update-password.ts:24-46, supabase/config.toml:213
- **Detail**: The page and the route only check `locals.user`, and `secure_password_change = false`. A borrowed session (for example a computer left signed in) can set a password and sign the owner out everywhere with `signOut({ scope: "others" })`. The plan chose not to gate the recovery session but never weighed this result.
- **Fix A ⭐ Recommended**: Turn on `secure_password_change` in config.toml and in the dashboard, and map `reauthentication_needed`.
  - Strength: Enforced by Supabase on the server. A fresh `verifyOtp` session counts as a recent login. S-17 gets the same protection.
  - Tradeoff: One more dashboard step and one more error code.
  - Confidence: MED — this is the flag's documented meaning; not yet tested against the local stack.
  - Blind spot: A recovery session older than 24 hours is refused, which needs a message.
- **Fix B**: Have `confirm.ts` set a short-lived "recovery" marker cookie and require it on the page and the route.
  - Strength: Ties the page strictly to a link that was just used.
  - Tradeoff: More code, it goes against the plan's "no gating" decision, and GoTrue's `updateUser` stays unguarded.
  - Confidence: HIGH — reuses the existing cookie pattern.
  - Blind spot: S-17 would need its own guard.
- **Decision**: FIXED via Fix A. Set `secure_password_change = true` in `supabase/config.toml`. Added `reauthentication_needed` to the error map; the route sends it, along with `session_not_found`, to `/auth/forgot-password`. Added the dashboard step to the plan's Phase 4 checklist (4.6). The E2E reset passes with the setting on.

### F2 — All 17 manual checks are pending, including the production checklist that must happen before the merge

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/password-reset/plan.md:370-421
- **Detail**: Manual checks 1.6–4.7 are all `[ ]`, while `change.md` says `implemented`. Check 4.6 (dashboard template, redirect URL, length 8, 1-hour expiry, SPF/DKIM, and now Secure password change) must be done before or with the merge, because merging to `master` deploys. Check 4.5 (the E2E fails when the template is reverted) has not been seen red.
- **Fix**: Run checks 1.6–3.11 and 4.5 locally, and complete 4.6 in the dashboard before merging. 4.7 comes after deploy.
- **Decision**: PENDING (human) — this needs a person at the browser and in the Supabase dashboard. Queued in `follow-ups/review-fixes.md`.

### F3 — The E2E spec doesn't name a risk, and its login-form exception isn't documented

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/password-reset.spec.ts:50, 110-125
- **Detail**: `E2E-RULES.md:30` requires test names of the form `ryzyko #N — …`; this spec uses "US-04: …", and `test-plan.md` had no matching risk. The spec signs in through the login form, which `E2E-RULES.md:20` forbids; the exception is justified here but not written down.
- **Fix**: Add a risk to `test-plan.md`, rename the tests, and comment the exception.
- **Decision**: FIXED. Added risk #15 to `test-plan.md` §2 Risk Map, renamed the describe block and both tests, and added a comment explaining the login-form exception.

### F4 — The shared `validation_failed` message doesn't fit either new screen

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/auth-error-messages.ts:103
- **Detail**: „Sprawdź adres e-mail i hasło” is shown on forgot-password (no password field) and on new-password (no e-mail field).
- **Fix**: Reword it so it names no field.
- **Decision**: FIXED. The message now reads „Formularz zawiera nieprawidłowe dane. Popraw je i spróbuj ponownie.”

### F5 — Two new routes create their own Supabase client instead of using `locals.supabase`

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/auth/forgot-password.ts:24, src/pages/api/auth/confirm.ts:28
- **Detail**: `update-password.ts` uses `locals`; these two call `createClient`. The middleware comment warns that two clients can disagree about which session is current, which matters in `confirm.ts`, the route that replaces the session.
- **Fix**: Use `context.locals.supabase`.
- **Decision**: FIXED.

### F6 — The `reset_email` cookie is never deleted

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/reset-request.ts:13-19
- **Detail**: After a successful reset, `/auth/forgot-password/sent` still shows the address for up to 15 minutes on a shared computer.
- **Fix**: Delete the cookie in `confirm.ts` when verification succeeds.
- **Decision**: FIXED.

### F7 — The save route can never show the `session_not_found` message

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/update-password.ts:39-40
- **Detail**: The redirect goes to `/auth/new-password?error=session_not_found`. That page has no session, so it bounces to `reset_session_missing` before rendering.
- **Fix**: Send session errors straight to `/auth/forgot-password`.
- **Decision**: FIXED (`SESSION_ERRORS` = `session_not_found`, `reauthentication_needed`).

### F8 — A real e-mail quota failure is hidden behind the "sent" page

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/forgot-password.ts:38-46
- **Detail**: Supabase's project-wide e-mail quota also returns `over_email_send_rate_limit`, which is silenced, and the log uses the same name as real failures.
- **Fix**: Log the silenced case as `auth.reset_request.silenced`.
- **Decision**: FIXED.

### F9 — E2E: cleanup can leak the test user; the seeded month uses the runner's time zone

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/password-reset.spec.ts:28-48, tests/e2e/support/mailpit.ts:48
- **Detail**: If `deleteSeededPlans` throws, `deleteUser` never runs. The month comes from the runner's local time while the server uses Europe/Warsaw. The Mailpit message fetch doesn't check `response.ok`.
- **Fix**: Wrap cleanup in try/finally, compute the month in Europe/Warsaw, and check `response.ok`.
- **Decision**: FIXED.

### F10 — Small leftovers

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: .env.e2e.example:18, supabase/config.toml:158, src/components/auth/ForgotPasswordForm.tsx:15-24
- **Detail**: `.env.e2e.example` still says "min. 6". `http://127.0.0.1:4321/**` is missing from the allow-list. The e-mail check was copied rather than reused, as the plan asked.
- **Fix**: Change the comment to 8, add the second origin, and move the e-mail check to `src/lib/`.
- **Decision**: FIXED. The new `src/lib/email-check.ts` (with a test) is used by SignIn, SignUp and ForgotPassword.

## Considered, not raised

- **Account takeover through someone else's link:** clicking a valid link for another account signs the user into that account. A button press is required, and `/auth/new-password` shows the target address.
- **Timing differences:** response time may differ between known and unknown addresses, depending on how Supabase sends the mail. This can't be checked from the repo.

## Triage summary

- Fixed: F1 (Fix A), F3, F4, F5, F6, F7, F8, F9, F10 (9)
- Pending (human): F2 (1)
