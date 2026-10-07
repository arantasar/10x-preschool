# Password Reset (S-16) Implementation Plan

## Overview

A teacher who forgot her password asks for a reset from the sign-in page, opens a link from a Polish e-mail — on any device — sets a new password, and lands on her month with every plan intact. The reset page tells her where to look for the message and what to do when it does not come (FR-022, US-04). This closes Open Roadmap Question #4 and the first of `monetization.md` §6's sale preconditions.

## Current State Analysis

- Auth is sign-in / sign-up / sign-out only (`src/pages/api/auth/{signin,signup,signout}.ts`, `src/pages/auth/{signin,signup,confirm-email}.astro`). There is no callback route, no `verifyOtp`, no `updateUser` anywhere in `src/`.
- `src/lib/supabase.ts` builds an `@supabase/ssr` server client, which defaults to the **PKCE** flow. With Supabase's default recovery template, PKCE lands `?code=` on the redirect URL and the exchange needs a code-verifier cookie set in the *requesting* browser — a link opened on another device fails.
- Error vocabulary lives in `src/lib/auth-error-messages.ts` (code → Polish, `Object.hasOwn` lookup, unknown → generic). Routes redirect with `?error=<code>`, never a sentence (`supabase-error-copy`, CLAUDE.md §Key conventions).
- `src/components/layout/AuthCard.astro` exists precisely for this slice (its header comment names "the M-03 password reset"). Mock-ups: `context/foundation/design/design/screens/12-reset-hasla.png`, `12b-reset-link-wyslany.png`, `13-nowe-haslo.png`; sign-in mock-up `reference/02-logowanie.html:31` carries the „Nie pamiętasz hasła?” link.
- Password length: `MIN_PASSWORD_LENGTH = 6` is private to `src/components/auth/SignUpForm.tsx:7`; `supabase/config.toml` `minimum_password_length = 6`. Production setting lives in the Supabase dashboard.
- Local Supabase: `site_url = "http://127.0.0.1:3000"`, `additional_redirect_urls = ["https://127.0.0.1:3000"]` — neither matches the dev server (`http://localhost:4321`, `tests/e2e/support/env.ts:66`). `otp_expiry = 3600`. Mail is captured by Mailpit under `[inbucket]` on port 54324.
- Production sends auth e-mail through a **custom SMTP** sender already (confirmed by the user) — deliverability is not this slice's work beyond a check.
- E2E has an admin client able to create disposable users and seed plans (`tests/e2e/support/supabase-admin.ts`), and the suite is local-only.
- `astro.config.mjs` sets `security.checkOrigin: true`, which covers every new `POST` form here.

## Desired End State

- `/auth/signin` shows „Nie pamiętasz hasła?” → `/auth/forgot-password` (mock-up 12).
- Submitting any syntactically valid address lands on `/auth/forgot-password/sent` (mock-up 12b) with **identical** content whether or not the account exists; the page names the address, says the link is valid for one hour, points to the spam folder, offers „Wyślij ponownie”, and names a fallback e-mail address (mailto) for when nothing arrives.
- The e-mail (Polish) links to `<origin>/auth/confirm?token_hash=…&type=recovery`. `GET /auth/confirm` shows a one-button card; only the `POST` verifies the token — a mailbox scanner's prefetch cannot consume it.
- After verification the teacher is signed in and on `/auth/new-password` (mock-up 13, "Dla konta <email>"). Saving a valid password (≥ 8, repeated) updates it, signs out every **other** session of the account, and redirects to `/plan/month`, which shows a one-shot confirmation.
- Expired / used / malformed links land on `/auth/forgot-password` with a Polish explanation and the form ready to send a new link.
- Minimum password length is 8 in sign-up, in the new form, in `config.toml`, and in the production dashboard.

Verification: unit tests for the new pure helpers and error codes; one Playwright test through Mailpit covering the full path; a manual production checklist.

### Key Discoveries:

- Supabase's documented SSR recovery pattern is `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` + `verifyOtp({ type, token_hash })` — no PKCE verifier needed, so cross-device works (Context7, `supabase/supabase` password-based-auth docs).
- `resetPasswordForEmail` returns success for an unknown address, **but** the per-address cooldown (`over_email_send_rate_limit`, `max_frequency`) can only fire for an address that has an account — surfacing it would be an account-enumeration oracle.
- `signin.ts` / `signup.ts` are the structural template: `createClient` null → `config_missing`; `error.code ?? ""` → fallback `connection_failed`; `console.error("auth.<flow>.failed", { code, status, message })`.
- `pending-topic.ts` is the precedent for a one-shot cookie consumed on display — reuse the shape for the month confirmation.
- `tests/e2e/auth.setup.ts:27` locates sign-in's password with `getByLabel("Hasło", { exact: true })`; the new link text „Nie pamiętasz hasła?” does not collide with it.

## What We're NOT Doing

- Password change for a signed-in user (S-17) — only the post-reset `signOut({ scope: "others" })` call, which S-17 can reuse.
- The contact form (S-19). The fallback is a `mailto:` constant; S-19 owns swapping it (handover item in Phase 4).
- Gating a recovery session: after `verifyOtp` the session is a normal session; leaving `/auth/new-password` simply leaves her signed in.
- Custom SMTP / sender setup, captcha / Turnstile on the form, own rate limiting beyond Supabase's.
- Changing the sign-up confirmation template or flow (it keeps working as it does today).
- Forcing existing users with 6–7-character passwords to change them — Supabase checks length only when a password is set.
- E2E in CI (the suite is local-only by project decision).

## Implementation Approach

Server-rendered Astro pages + `POST` API routes, mirroring sign-in/sign-up: forms post natively, routes redirect with a code, pages translate the code. React islands only for the two forms that validate client-side (forgot-password e-mail, new-password pair). Pure decisions (which Supabase codes are silent vs shown, new-password validation) go to `src/lib/` so they are unit-testable. Local Supabase config is changed in `config.toml`; the production equivalent is a manual checklist, because the recovery template, redirect allow-list and password length live in the hosted dashboard, not in git.

## Critical Implementation Details

- **Template ↔ redirect allow-list coupling.** The template builds the link from `{{ .RedirectTo }}`, which the route sets to `${new URL(request.url).origin}/auth/confirm`. If that URL is not in the project's redirect allow-list, Supabase silently substitutes Site URL and the link lands on `/` with stray query params — the flow breaks with no error anywhere. Locally this means adding `http://localhost:4321/**` to `additional_redirect_urls`; in production the live origin's `/auth/confirm`. Using `RedirectTo` rather than `SiteURL` is deliberate: local `site_url` is `127.0.0.1:3000`, not the dev server.
- **Enumeration.** In `POST /api/auth/forgot-password`, `over_email_send_rate_limit` (and any `user_not_found`-style code, should a Supabase version emit one) must take the **success** path — redirect to `/sent`, log it. Only address-independent failures are shown: `config_missing`, `connection_failed`, `over_request_rate_limit`, `validation_failed`, `email_address_invalid`.
- **Prefetch-safe confirm.** `GET /auth/confirm` must not call Supabase at all; it only validates the presence of `token_hash` and that `type === "recovery"` (allow-list, nothing else is accepted) and renders a form that re-posts both values. `POST` verifies.
- **Session sequencing after save.** `updateUser({ password })` first, then `signOut({ scope: "others" })`; a failure of the second call is logged but does not undo or hide the successful password change — the teacher still goes to the month. Set the flash cookie only after `updateUser` succeeded.

## Phase 1: Shared rules, error vocabulary, local Supabase config

### Overview

Everything the later phases import or depend on, with no user-visible flow yet — except sign-up now asking for 8 characters.

### Changes Required:

#### 1. Password policy constant

**File**: `src/lib/password-policy.ts` (new); `src/components/auth/SignUpForm.tsx`

**Intent**: One minimum length for the app, raised to 8, used by sign-up and the new-password form.

**Contract**: `export const MIN_PASSWORD_LENGTH = 8`. `SignUpForm.tsx` imports it and drops its local constant; its hint, placeholder and error copy follow automatically. Also export a pure `validateNewPassword(password, repeat): { password?: string; repeat?: string }` returning Polish messages (empty, too short — with the count, mismatch) for the Phase 3 form.

#### 2. Support contact constant

**File**: `src/lib/support-contact.ts` (new)

**Intent**: The fallback channel FR-022 requires until S-19 ships, in one place S-19 will replace.

**Contract**: `export const SUPPORT_EMAIL = "<value>"`. The value is supplied by Janusz at implementation time — **ask before writing it; do not invent an address**. A comment names S-19 (`help-and-contact`) as the owner of replacing it with the form.

#### 3. Error vocabulary for the reset flow

**File**: `src/lib/auth-error-messages.ts`, `src/lib/auth-error-messages.test.ts`

**Intent**: Polish copy for every code the three new routes can put in `?error=`, and the silent/shown split for the request route.

**Contract**:
- New entries: `otp_expired` (link expired or already used → send a new one), `same_password` (new password equals the old), `session_not_found` / our minted `reset_session_missing` (no session on `/auth/new-password` → request a link), our minted `reset_link_invalid` (missing/foreign `token_hash`/`type`). Existing `weak_password` copy must read correctly on the new-password page too.
- New exported pure helper `isSilentResetRequestError(code: string | undefined): boolean` — true for codes that reveal account existence (`over_email_send_rate_limit`, `user_not_found`), false otherwise.
- Update the module doc comment: it now covers three flows, not two.
- Tests: each new code resolves to Polish; the silent helper is true/false on both sides; existing tests keep passing.

#### 4. Local Supabase auth config and recovery template

**File**: `supabase/config.toml`, `supabase/templates/recovery.html` (new)

**Intent**: Make the local stack behave like production will after the checklist: Polish recovery mail with a `token_hash` link, the dev origin allowed as redirect, length 8.

**Contract**:
- `minimum_password_length = 8`.
- `additional_redirect_urls` gains `"http://localhost:4321/**"` (keep the existing entry).
- `[auth.email.template.recovery]` with a Polish `subject` and `content_path = "./supabase/templates/recovery.html"`.
- Template link: `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`. Body in Polish: what the link does, valid one hour, ignore if not requested. No tracking, plain HTML.
- Requires `npx supabase stop && npx supabase start` to take effect — note it in the phase's manual check.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Exactly one definition of the minimum, set to 8: `grep -rn "MIN_PASSWORD_LENGTH = " src` prints one line, in `src/lib/password-policy.ts`, ending in `8;` (run it before the change too — it prints `SignUpForm.tsx` with `6`, so the gate can fail)
- Local config carries the length: `grep -n "^minimum_password_length = 8" supabase/config.toml` prints one line

#### Manual Verification:

- After restarting local Supabase, sign-up rejects a 7-character password client-side with the Polish count message, and accepts 8
- An existing local account with a shorter password still signs in

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Request a reset link

### Overview

The public half: link from sign-in, the form, the route that asks Supabase for the mail, and the "check your inbox" page with resend.

### Changes Required:

#### 1. Sign-in link

**File**: `src/pages/auth/signin.astro` (or `SignInForm.tsx`, wherever the mock-up position — next to the password field — is reachable without restructuring)

**Intent**: Entry point named in US-04 ("prosi o reset ze strony logowania").

**Contract**: A plain link „Nie pamiętasz hasła?” → `/auth/forgot-password`. Must not change the accessible names „Adres e-mail”, „Hasło”, „Zaloguj się”.

#### 2. Forgot-password page and form

**File**: `src/pages/auth/forgot-password.astro` (new), `src/components/auth/ForgotPasswordForm.tsx` (new)

**Intent**: Mock-up 12 in `AuthCard`.

**Contract**: Heading „Nie pamiętasz hasła?”, lead text from the mock-up, field labelled „Adres e-mail” (same label as sign-in, not the mock-up's „E-mail”, for consistency with existing forms and tests), button „Wyślij link”, link „Wróć do logowania”. Form posts to `/api/auth/forgot-password`. Client validation reuses sign-in's e-mail check. `?error=` handled exactly like `signin.astro` (absent → no box; present → `authErrorMessage`).

#### 3. Request route

**File**: `src/pages/api/auth/forgot-password.ts` (new)

**Intent**: Ask Supabase to send the recovery mail without ever revealing whether the address has an account.

**Contract**: `POST`, `export const prerender = false`, zod-validated `email` (trimmed, e-mail format; failure → `?error=validation_failed`). Calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/confirm` })`. Outcomes:
- success **or** `isSilentResetRequestError(code)` → set cookie `reset_email` (httpOnly, `sameSite: "lax"`, `path: "/auth"`, `maxAge` 15 min) and redirect `/auth/forgot-password/sent`; silent errors are still `console.error`-logged as `auth.reset_request.failed`.
- `createClient` null → `config_missing`; other errors → `error.code || connection_failed`, redirect `/auth/forgot-password?error=…`.

#### 4. "Check your inbox" page with resend

**File**: `src/pages/auth/forgot-password/sent.astro` (new)

**Intent**: Mock-up 12b plus FR-022's condition: where to look, what to do if nothing arrives.

**Contract**: Reads `reset_email` cookie; if absent, redirect to `/auth/forgot-password` (direct visits and expired cookies). Copy: „Jeśli pod adresem **<email>** jest konto, wysłaliśmy na nie link do ustawienia nowego hasła. Link jest ważny przez godzinę.” + spam hint + "nic nie przyszło po kilku minutach → napisz do nas: `<a href="mailto:SUPPORT_EMAIL">`". „Wyślij ponownie” = a native form posting the same address (hidden input) to `/api/auth/forgot-password`; „Wróć do logowania” link. The mock-up's „Otwórz link (demo)” button is a design-tool artefact and is not built. The address is rendered as text only (Astro escapes it).

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- From `/auth/signin`, the link opens the form; submitting an existing local address shows the sent page and a Polish mail appears in Mailpit (`http://127.0.0.1:54324`) whose link points to `http://localhost:4321/auth/confirm?token_hash=…&type=recovery`
- Submitting an address with no account shows the **same** sent page, and no mail is sent
- Pressing „Wyślij ponownie” twice quickly for an existing address still shows the sent page (cooldown swallowed), and the server log shows `auth.reset_request.failed` with the cooldown code
- Visiting `/auth/forgot-password/sent` directly in a fresh browser redirects to the form
- Layout matches mock-ups 12 / 12b on desktop and on a phone-width viewport

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: From link to new password

### Overview

The private half: prefetch-safe confirmation, the new-password screen, the save route, and the confirmation on the month.

### Changes Required:

#### 1. Confirm step (GET renders, POST verifies)

**File**: `src/pages/auth/confirm.astro` (new), `src/pages/api/auth/confirm.ts` (new)

**Intent**: Turn a valid link into a session, without letting a mailbox scanner's GET use up the single-use token.

**Contract**:
- `GET /auth/confirm`: if `token_hash` is missing or `type !== "recovery"` → redirect `/auth/forgot-password?error=reset_link_invalid`. Otherwise an `AuthCard` with a short heading (e.g. „Ustaw nowe hasło”), one sentence, and a form posting hidden `token_hash` + `type` to `/api/auth/confirm` with the button „Ustaw nowe hasło”. No Supabase call on GET.
- `POST /api/auth/confirm`: zod (`token_hash` non-empty, `type` literal `"recovery"`); `supabase.auth.verifyOtp({ type: "recovery", token_hash })`; success → redirect `/auth/new-password`; error → log `auth.reset_confirm.failed`, redirect `/auth/forgot-password?error=<code || connection_failed>` (expired/used → `otp_expired` copy).

#### 2. New-password page and form

**File**: `src/pages/auth/new-password.astro` (new), `src/components/auth/NewPasswordForm.tsx` (new)

**Intent**: Mock-up 13.

**Contract**: No `Astro.locals.user` → redirect `/auth/forgot-password?error=reset_session_missing`. Heading „Ustaw nowe hasło”, „Dla konta **<user.email>**.”, fields „Nowe hasło” (hint `Co najmniej ${MIN_PASSWORD_LENGTH} znaków`) and „Powtórz nowe hasło”, both with `PasswordToggle`, button „Zapisz nowe hasło”. Client validation via `validateNewPassword`. Posts to `/api/auth/update-password`. `?error=` as on the other auth pages.

#### 3. Save route

**File**: `src/pages/api/auth/update-password.ts` (new)

**Intent**: Set the password, cut off other devices, take her to her plans.

**Contract**: `POST`, `prerender = false`. No user → redirect `/auth/forgot-password?error=reset_session_missing`. zod mirrors `validateNewPassword` (server is authoritative; mismatch/too short → `?error=validation_failed`). `updateUser({ password })`; error → log `auth.update_password.failed`, redirect `/auth/new-password?error=<code || connection_failed>` (`same_password`, `weak_password` mapped). Success → `signOut({ scope: "others" })` (failure logged only), set one-shot cookie `password_reset_done` (short `maxAge`, `path: "/plan"`), redirect `/plan/month`.

#### 4. Confirmation on the month

**File**: `src/pages/plan/month.astro`

**Intent**: Close US-04 with a visible "it worked" without a sticky query parameter.

**Contract**: If `password_reset_done` is present, delete it and render a `role="status"` notice „Hasło zostało zmienione. Pozostałe urządzenia zostały wylogowane.” above the grid. Must not shift the full-month-without-scroll layout beyond the notice's own height (month-grid-fit quality condition from `prd-v2.md`) — keep it one line, dismissed on next load by construction.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Existing E2E suite stays green, including `month-grid-fit.spec.ts` and the sign-in setup: `npx playwright test`

#### Manual Verification:

- Mail link opened in a **different browser** than the request → confirm card → new-password screen with the right address → saving lands on the month with the notice; reload removes the notice; plans of the account are all there
- A second browser signed in to the same account before the reset is signed out on its next navigation
- The same link used a second time → forgot-password page with the expired/used message
- `/auth/confirm` without params, or with `type=signup`, → forgot-password page with the invalid-link message
- `/auth/new-password` signed out → forgot-password page with the session-missing message
- Saving the current password again shows the `same_password` message; a 7-character password is stopped client-side
- Layout matches mock-up 13 on desktop and phone width

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: E2E, documentation, production rollout

### Overview

One browser test guarding the template ↔ route seam, docs that keep the next reader oriented, the S-19 handover, and the dashboard steps that make production match `config.toml`.

### Changes Required:

#### 1. Password-reset E2E

**File**: `tests/e2e/password-reset.spec.ts` (new), `tests/e2e/support/` (a small Mailpit helper, new file), `.env.e2e.example`

**Intent**: Automate US-04 end to end, including the e-mail.

**Contract**: Follow `/10x-e2e` and `tests/e2e/E2E-RULES.md` (role/label locators, no `waitForTimeout`, own setup and cleanup, unique timestamped address). Runs **without** the default teacher storage state. Steps: admin-create a disposable confirmed user and seed one day plan for it → request reset via the UI → poll Mailpit's HTTP API (base URL from `E2E_MAILPIT_URL`, default `http://127.0.0.1:54324`; verify endpoint paths against the running Mailpit) until the message for that address arrives → extract the `/auth/confirm` link → open it, press the button → set a new password → assert the month and the notice are visible and the seeded plan is shown → sign out → old password fails, new one signs in. A second short test: an unknown address reaches the same sent page. Cleanup deletes the user (and its plans).

#### 2. Docs

**File**: `CLAUDE.md`

**Intent**: Keep §Auth flow truthful.

**Contract**: §Auth flow lists the new endpoints (`forgot-password`, `confirm`, `update-password`) and pages, and one sentence on the `token_hash` recovery template living in `supabase/templates/recovery.html` locally and in the Supabase dashboard in production — and that the redirect allow-list must contain `/auth/confirm` of every origin.

#### 3. S-19 handover

**File**: `context/foundation/roadmap.md` (S-19 block, Unknowns)

**Intent**: The fallback swap must have an owner (lessons: "Odroczone sprzątanie danych musi mieć właściciela").

**Contract**: One bullet under S-19 Unknowns: `/auth/forgot-password/sent` points to `SUPPORT_EMAIL` (`src/lib/support-contact.ts`) as a temporary channel; S-19 repoints it to the contact form. Owner: `/10x-plan help-and-contact`. Block: nie. Edit only that block.

#### 4. Production checklist (manual, before merge)

**File**: none (performed in the Supabase dashboard; record completion in Progress)

**Intent**: Merging to `master` deploys (CLAUDE.md §CI); production must accept the new flow on the same release.

**Contract**:
- Auth → Email Templates → Reset Password: subject + body from `supabase/templates/recovery.html` (link built from `{{ .RedirectTo }}`).
- Auth → URL Configuration: production `https://<domain>/auth/confirm` in Redirect URLs.
- Auth → Providers → Email: minimum password length 8; note the OTP/link expiry and confirm it is 1 hour (the sent page says so) — if it differs, change the copy, not the dashboard.
- Custom SMTP: sender domain has SPF and DKIM passing (send one reset to a Gmail address and inspect "Show original").
- `SUPPORT_EMAIL` holds the real address.

### Success Criteria:

#### Automated Verification:

- New E2E passes against local Supabase: `npx playwright test tests/e2e/password-reset.spec.ts`
- Full E2E suite green: `npx playwright test`
- Lint passes: `npm run lint`
- Only the S-19 block of the roadmap changed (whitespace-insensitive, so table realignment cannot fake a result): `git diff -w master..HEAD -- context/foundation/roadmap.md` shows added lines only inside `### S-19`

#### Manual Verification:

- E2E fails when the template link is reverted to `{{ .ConfirmationURL }}` (run once, then restore) — the test can fail
- Production checklist completed (template, redirect URL, length 8, expiry = 1 h, SPF/DKIM)
- After deploy: a real reset on production from a phone, requested on a desktop, ends on the month with plans intact

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `auth-error-messages.test.ts`: every new code resolves to Polish, never to its input; `isSilentResetRequestError` true for the enumeration codes, false for `over_request_rate_limit`, `validation_failed`, `connection_failed`, `undefined`.
- `password-policy` tests: empty, 7 chars (message with remaining count), 8 chars, mismatch, match.

### Integration Tests:

- Playwright `password-reset.spec.ts`: full cross-route path with real mail through Mailpit, plans intact, old password rejected; unknown address yields identical sent page.

### Manual Testing Steps:

1. Request on one browser, open the mail link in another — the flow completes.
2. Re-use a link — expired/used message, form ready to resend.
3. Two sessions open, reset in one — the other is signed out.
4. Unknown address and rapid resend — sent page every time, nothing on screen differs.
5. Mock-ups 12, 12b, 13 at desktop and phone width.

## Performance Considerations

None beyond one Supabase call per request; Supabase's own rate limits apply.

## Migration Notes

No database migration. Existing passwords shorter than 8 keep working until changed. Production config changes (template, redirect URL, length) must be applied before or together with the merge — a merge without the template sends Supabase's default PKCE link, which `/auth/confirm` does not understand.

## References

- Roadmap: `context/foundation/roadmap.md` §S-16
- PRD: `context/foundation/prd-v3.md` US-04, FR-022
- Error-code convention: `context/archive/2026-08-31-supabase-error-copy/`
- Pattern: `src/pages/api/auth/signin.ts`, `src/lib/auth-error-messages.ts`, `src/lib/pending-topic.ts`
- Mock-ups: `context/foundation/design/design/screens/{12-reset-hasla,12b-reset-link-wyslany,13-nowe-haslo}.png`
- Supabase SSR recovery pattern: Context7 `/supabase/supabase` (password-based-auth, `auth/confirm` route)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared rules, error vocabulary, local Supabase config

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — 36bc86d
- [x] 1.2 Lint passes: `npm run lint` — 36bc86d
- [x] 1.3 Build passes: `npm run build` — 36bc86d
- [x] 1.4 Exactly one definition of the minimum, set to 8 (`grep -rn "MIN_PASSWORD_LENGTH = " src`) — 36bc86d
- [x] 1.5 Local config carries the length (`grep -n "^minimum_password_length = 8" supabase/config.toml`) — 36bc86d

#### Manual

- [ ] 1.6 Sign-up rejects 7 characters and accepts 8 after Supabase restart
- [ ] 1.7 Existing shorter-password account still signs in

### Phase 2: Request a reset link

#### Automated

- [x] 2.1 Unit tests pass: `npm test` — 22db401
- [x] 2.2 Lint passes: `npm run lint` — 22db401
- [x] 2.3 Build passes: `npm run build` — 22db401

#### Manual

- [ ] 2.4 Existing address → sent page + Polish mail in Mailpit with `/auth/confirm?token_hash=…&type=recovery` link
- [ ] 2.5 Unknown address → same sent page, no mail
- [ ] 2.6 Rapid resend → sent page, cooldown logged
- [ ] 2.7 Direct visit to sent page redirects to the form
- [ ] 2.8 Layout matches mock-ups 12 / 12b (desktop + phone)

### Phase 3: From link to new password

#### Automated

- [x] 3.1 Unit tests pass: `npm test` — a67884b
- [x] 3.2 Lint passes: `npm run lint` — a67884b
- [x] 3.3 Build passes: `npm run build` — a67884b
- [x] 3.4 Existing E2E suite stays green: `npx playwright test` — a67884b

#### Manual

- [ ] 3.5 Cross-browser link → confirm → new password → month with notice; plans intact
- [ ] 3.6 Other session signed out
- [ ] 3.7 Re-used link → expired/used message
- [ ] 3.8 Invalid confirm params → invalid-link message
- [ ] 3.9 Signed-out `/auth/new-password` → session-missing message
- [ ] 3.10 Same password and 7-character password rejected
- [ ] 3.11 Layout matches mock-up 13 (desktop + phone)

### Phase 4: E2E, documentation, production rollout

#### Automated

- [x] 4.1 New E2E passes: `npx playwright test tests/e2e/password-reset.spec.ts` — 0a974a3
- [x] 4.2 Full E2E suite green: `npx playwright test` — 0a974a3
- [x] 4.3 Lint passes: `npm run lint` — 0a974a3
- [x] 4.4 Only the S-19 block of the roadmap changed (`git diff -w master..HEAD -- context/foundation/roadmap.md`) — 0a974a3

#### Manual

- [ ] 4.5 E2E fails with the template reverted to `{{ .ConfirmationURL }}`
- [ ] 4.6 Production checklist completed
- [ ] 4.7 Real cross-device reset on production after deploy
