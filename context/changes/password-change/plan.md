# Password Change (S-17) Implementation Plan

## Overview

A signed-in teacher changes her password on a new account-settings screen, `/ustawienia` (mock-up 18), and every other device signed in to her account loses access (FR-023, roadmap S-17). The form follows the mock-up: current password, new password, repeat. The server checks the current password by signing in again, saves the new one, signs out every other session and returns her to the settings screen with a confirmation.

## Current State Analysis

- **No settings screen.** The signed-in app has `/plan`, `/plan/week`, `/plan/month` (all through `src/layouts/PlannerLayout.astro`) and the shared `/pomoc`. `src/components/AppHeader.astro` shows the avatar initial as decoration ("there is no `/konto` page to lead to"), plus „Pomoc” and the „Wyloguj się” submit button.
- **S-16 left most of the parts in place.** `src/lib/password-policy.ts` has `MIN_PASSWORD_LENGTH = 8` and `validateNewPassword`. `src/pages/api/auth/update-password.ts` already does `updateUser({ password })` → `signOut({ scope: "others" })` (a failed sign-out is logged and does not undo the change). `src/components/auth/{FormField,PasswordToggle,SubmitButton,ServerError}.tsx` are the form parts. `src/lib/auth-error-messages.ts` holds the code → Polish map. `src/lib/reset-request.ts` defines the one-shot flash cookie pattern (`PASSWORD_RESET_DONE_COOKIE`, consumed in `src/pages/plan/month.astro:15-18`).
- **The 24-hour trap.** S-16 turned on `secure_password_change = true` (`supabase/config.toml:216`, and „Secure password change” in the production dashboard). With it, GoTrue rejects a password update with `reauthentication_needed` whenever the session is **older than 24 h** and no nonce is sent (`supabase/auth` `internal/api/user.go`). Teachers stay signed in for days through refresh tokens, and a refresh keeps the original session's `created_at`. A plain `updateUser` from the settings screen would therefore fail for almost everyone.
- **The design package was updated.** `temio-design-astro/` (untracked) is a newer copy of `context/foundation/design/`. The only differences are mock-ups 18/18b (screens + reference HTML), `src/components/account/{SettingsLayout,DeleteAccountDialog}.astro`, `AppHeader.astro` (avatar is a link to `/ustawienia`, `aria-label="Ustawienia konta"`), the README row for `/ustawienia`, and the avatar change in references 03/04.
- **Middleware** protects pages by prefix: `PROTECTED_ROUTES = ["/plan"]` (`src/middleware.ts:10`).
- **E2E** already has a disposable-account pattern with `storageState` cleared and admin create/delete (`tests/e2e/password-reset.spec.ts`, `tests/e2e/support/supabase-admin.ts`). `tests/e2e/auth.setup.ts:34` and `password-reset.spec.ts:128` depend on the „Wyloguj się” button in the header.

## Desired End State

- The avatar in the app header is a link „Ustawienia konta” to `/ustawienia`. Signed out, `/ustawienia` redirects to `/auth/signin`.
- `/ustawienia` shows the eyebrow „Konto”, the heading „Ustawienia”, a side menu („Konto i hasło” active, divider, „Wyloguj się”), a „Konto” card with the e-mail (read-only) and a „Zmień hasło” card: „Obecne hasło”, „Nowe hasło” (hint „Co najmniej 8 znaków”), „Powtórz nowe hasło”, the link „Nie pamiętasz obecnego hasła?” → `/auth/forgot-password`, and the button „Zapisz nowe hasło”. There is no „Usuń konto” card or menu item; S-18 adds them.
- On success the teacher lands back on `/ustawienia` with a success notice („Hasło zostało zmienione. Na innych urządzeniach trzeba zalogować się ponownie.”) shown once, and the fields are empty. She stays signed in on this device.
- A second browser signed in to the same account is redirected to sign-in on its next navigation. The old password no longer signs in and the new one does.
- A wrong current password produces a Polish message about the *current password* (not the sign-in wording „adres e-mail lub hasło”), and nothing changes.
- A session older than 24 h can change the password (verified by reasoning in the route contract and by a manual check in production, see Phase 4).

### Key Discoveries:

- GoTrue's `UpdatePasswordRequireReauthentication` checks `session.CreatedAt + 24h`. A session just created by `signInWithPassword` always passes that check, so a fresh sign-in is enough and no nonce is needed.
- `signInWithPassword` on the cookie-bound SSR client (`context.locals.supabase`) writes the new session's cookies through `setAll` (`src/lib/supabase.ts:16-20`). On failure it writes nothing, so the teacher's current session is left intact.
- `signOut({ scope: "others" })` revokes every session except the current one. After the fresh sign-in, the *previous* session of this same device counts as "other", so it is revoked too. That is harmless, because the browser already holds the new cookies.
- `invalid_credentials` maps to „Nieprawidłowy adres e-mail lub hasło…” (`src/lib/auth-error-messages.ts`), which is wrong on a screen where the e-mail is fixed. The route mints its own code instead.
- The flash-cookie pattern scopes the cookie by `path`. `/ustawienia` gets its own cookie with `path: "/ustawienia"`.

## What We're NOT Doing

- The „Usuń konto” card, menu item and `DeleteAccountDialog` (S-18 `account-deletion`).
- A "your password was changed" notification e-mail (Supabase `password_changed` notification). Recorded in `context/foundation/new-ideas.md` instead.
- Turning off `secure_password_change`, a nonce/OTP reauthentication flow, or `GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD`.
- Moving „Wyloguj się” or „Pomoc” out of the header (the header keeps both; only the avatar changes).
- Changing the e-mail address, or any other settings section (payments, invoice data).
- Porting other components from the design package (`Notice`, `TextField`, `Button`) as general-purpose components. The settings screen uses the existing auth form parts and Tailwind tokens.
- Changing `/api/auth/update-password` (the post-reset route) or its flow.

## Implementation Approach

Server-rendered page + React island + native form POST, mirroring the S-16 flow: `form → POST /api/auth/change-password → redirect with ?error=<code> or a one-shot cookie → page renders`. The route verifies the current password by signing in again with the teacher's own e-mail. Then, in order: `updateUser({ password })`, then `signOut({ scope: "others" })`, then set the flash cookie and redirect. Pure decisions (form validation, error codes, wording) live in `src/lib/` and are unit-tested. The route's ordering is tested with a mocked `locals.supabase` like `src/pages/api/auth/confirm.test.ts`. The cross-session outcome is guarded by one E2E with two browser contexts.

## Critical Implementation Details

- **Ordering in the route.** `signInWithPassword` → `updateUser` → `signOut({ scope: "others" })` → flash cookie → redirect. A failed sign-in stops before anything changes. A failed `updateUser` (e.g. `same_password`, `weak_password`) leaves the password unchanged; the teacher now holds a fresh session, and the old one stays valid, which is acceptable. A failed `signOut` is logged (`auth.change_password.signout_others_failed`) and does not hide the successful change, the same rule as `update-password.ts`. Never call `signOut` before `updateUser` has succeeded.
- **The e-mail comes from the session, never from the form.** The route signs in with `locals.user.email`. The form has no e-mail field. Accepting an address from the request would turn the route into a credential-checking oracle for any account.
- **Error codes.** Supabase `invalid_credentials` from the re-sign-in becomes our `current_password_invalid`. Every other code is passed through as is (`same_password`, `weak_password`, `over_request_rate_limit`, `validation_failed`). An `AuthError` without a code becomes `connection_failed`. `reauthentication_needed` should be unreachable after a fresh sign-in; if it ever appears, it must not show the reset-link wording (that entry talks about "a fresh link"). Map it to a settings-specific code `password_change_failed` with a generic Polish sentence, and log it.

## Phase 1: Design package, rules and error vocabulary

### Overview

The design source of truth lives in one place again, and the pure pieces the screen and route depend on exist with tests.

### Changes Required:

#### 1. Merge the updated design package

**Files**: `context/foundation/design/**`, `temio-design-astro/` (removed)

**Intent**: `temio-design-astro/` is a newer version of `context/foundation/design/`. Copy over what differs, then delete the untracked duplicate so there is a single design source. S-18 will also read 18b and `DeleteAccountDialog` from there.

**Contract**: Add `design/screens/18-ustawienia.png`, `18b-ustawienia-usun-konto.png`, `design/reference/18-ustawienia.html`, `18b-ustawienia-usun-konto.html`, and `src/components/account/{SettingsLayout,DeleteAccountDialog}.astro`. Replace `design/README.md`, `design/reference/03-nowe-propozycje.html`, `04-plan-miesiaca.html` and `src/components/layout/AppHeader.astro` with the new versions. Afterwards `diff -rq context/foundation/design temio-design-astro` prints nothing, then `temio-design-astro/` is removed.

#### 2. Password-change validation

**File**: `src/lib/password-policy.ts` (+ `password-policy.test.ts`)

**Intent**: One function for the client island (and as a mirror for the route's zod schema): current password required, new password rules reused from `validateNewPassword`, and the new password must differ from the current one (to spare a round trip to `same_password`).

**Contract**: `validatePasswordChange(current: string, password: string, repeat: string): PasswordChangeErrors` where `PasswordChangeErrors = NewPasswordErrors & { current?: string }`. Messages: `current` empty → „Podaj obecne hasło”. `password === current` (both non-empty) → on `password`: „Nowe hasło musi się różnić od obecnego”. The rest delegates to `validateNewPassword`. Tests cover each field's empty case, too short, mismatch, same-as-current, and the valid triple.

#### 3. Error vocabulary for the settings screen

**File**: `src/lib/auth-error-messages.ts` (+ `auth-error-messages.test.ts`)

**Intent**: Codes of our own for the two cases where the existing wording would mislead on a screen with a fixed e-mail.

**Contract**: Export `CURRENT_PASSWORD_INVALID = "current_password_invalid"` → „Obecne hasło jest nieprawidłowe. Sprawdź je i spróbuj ponownie.” and `PASSWORD_CHANGE_FAILED = "password_change_failed"` → „Nie udało się zmienić hasła. Spróbuj ponownie za chwilę.” Extend the module doc comment's list of routes and pages with `change-password` / `/ustawienia`. Tests: both codes resolve to their sentence and neither equals `GENERIC_AUTH_ERROR_MESSAGE`.

#### 4. One-shot "password changed" cookie

**File**: `src/lib/account-settings.ts` (new)

**Intent**: The flash cookie for the settings screen, following `PASSWORD_RESET_DONE_COOKIE` but scoped to `/ustawienia`, plus the path constant the middleware and links share.

**Contract**: `SETTINGS_PATH = "/ustawienia"`, `PASSWORD_CHANGED_COOKIE = "password_changed"`, `PASSWORD_CHANGED_COOKIE_OPTIONS: AstroCookieSetOptions` = `{ path: SETTINGS_PATH, httpOnly: true, sameSite: "lax", secure: !import.meta.env.DEV, maxAge: 60 }`.

### Success Criteria:

#### Automated Verification:

- Design package merged and duplicate gone: `test ! -e temio-design-astro && test -f context/foundation/design/design/screens/18-ustawienia.png && test -f context/foundation/design/src/components/account/SettingsLayout.astro`
- Unit tests pass: `npm test -- password-policy auth-error-messages`
- Lint passes: `npm run lint`

#### Manual Verification:

- The Polish wording of the new messages reads correctly in context (current password, not "e-mail or password")

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 2: Route `POST /api/auth/change-password`

### Overview

The server operation: verify the current password, save the new one, cut off every other session, confirm.

### Changes Required:

#### 1. The route

**File**: `src/pages/api/auth/change-password.ts` (new)

**Intent**: Change the password of the signed-in teacher in an order that cannot change anything before the current password is proven, and that is not blocked by `secure_password_change` on a long-lived session.

**Contract**: `export const prerender = false`, `POST`. Fields `current`, `password`, `repeat`; a zod schema mirroring `validatePasswordChange` (min length from `MIN_PASSWORD_LENGTH`, `password === repeat`, `password !== current`); a failed parse → `/ustawienia?error=validation_failed`.
- No `locals.supabase` → `/ustawienia?error=config_missing`.
- No `locals.user` or no `user.email` → `/auth/signin`.
- `supabase.auth.signInWithPassword({ email: user.email, password: current })`: `invalid_credentials` → `current_password_invalid`; another code → that code; no code → `connection_failed`. Log `auth.change_password.reauth_failed` with `{ code, status }` (never the password).
- `supabase.auth.updateUser({ password })`: `reauthentication_needed` → `password_change_failed`; other codes → that code / `connection_failed`. Log `auth.change_password.failed`.
- `supabase.auth.signOut({ scope: "others" })`: an error is logged as `auth.change_password.signout_others_failed` and the flow continues.
- Set `PASSWORD_CHANGED_COOKIE`, redirect `/ustawienia`.

Every error redirect is `/ustawienia?error=<encodeURIComponent(code)>`.

#### 2. Route tests

**File**: `src/pages/api/auth/change-password.test.ts` (new)

**Intent**: Pin the ordering and the code mapping, the parts that would silently weaken the security outcome if they drifted.

**Contract**: Same harness as `confirm.test.ts` (mocked `locals.supabase.auth.{signInWithPassword,updateUser,signOut}`, `cookies.set`, `redirect`). Cases:
- the happy path calls the three in order, `signInWithPassword` with the **session's** e-mail even when the form carries an `email` field, sets the cookie, redirects to `/ustawienia`;
- `invalid_credentials` → `?error=current_password_invalid`, `updateUser` and `signOut` not called;
- `updateUser` error `same_password` → `?error=same_password`, `signOut` not called, no cookie;
- `reauthentication_needed` → `?error=password_change_failed`;
- `signOut` error → still cookie + `/ustawienia`;
- no user → `/auth/signin`; no client → `config_missing`; invalid form → `validation_failed` with no Supabase call.

### Success Criteria:

#### Automated Verification:

- Route tests pass: `npm test -- change-password`
- The route signs in with the session's address, not a form field: `grep -n "signInWithPassword({ email: user.email" src/pages/api/auth/change-password.ts` returns exactly one line (check before relying on it that the grep fails when the route reads `form.get("email")` instead)
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- With `npm run dev`, a `curl` POST without a session cookie to `/api/auth/change-password` redirects to `/auth/signin`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 3: The `/ustawienia` screen

### Overview

The first account-settings screen, reachable from the avatar, with the password form wired to the route.

### Changes Required:

#### 1. Protect the route

**File**: `src/middleware.ts`

**Intent**: Signed-out visitors to the settings screen go to sign-in like on `/plan*`.

**Contract**: `PROTECTED_ROUTES = ["/plan", SETTINGS_PATH]` (imported from `src/lib/account-settings.ts`).

#### 2. Header: the avatar leads to settings

**Files**: `src/components/AppHeader.astro`, `src/layouts/PlannerLayout.astro`

**Intent**: The avatar becomes the way into settings, as in the updated mock-ups. „Pomoc” and „Wyloguj się” stay where they are.

**Contract**: `active` becomes optional in both (`"plan" | "generate" | "account"`; on `account` no main-nav item is current). The avatar is an `<a href="/ustawienia" aria-label="Ustawienia konta">` with the existing initial, `aria-current="page"` and the double ring from mock-up 18 when `active === "account"`, a visible focus state, and at least 44 px. Update the header's comment that says there is no account page. Update the `PlannerLayout` comment and CLAUDE.md's „Planner shell” paragraph accordingly (Phase 4).

#### 3. Settings shell

**File**: `src/components/account/SettingsLayout.astro` (new)

**Intent**: A port of the design's `SettingsLayout` to the project's Tailwind tokens (no copied `<style>` block), so S-18 and later sections append menu items in one place.

**Contract**: Props `active: string`. Built-in items: „Konto i hasło” (`/ustawienia`, lock icon). Below the divider, „Wyloguj się” as a `<form method="POST" action="/api/auth/signout">` submit button (the design's `/wyloguj` link does not exist). Layout per reference 18: eyebrow „Konto”, `h1` „Ustawienia”, 260 px menu + content column, cards with a `set-card` look (surface, large radius, 32/36 px padding). At ≤ 900 px the menu becomes a horizontal pill row above the content. A comment names where S-18 adds „Usuń konto” (last regular item, danger).

#### 4. Password form island

**File**: `src/components/account/PasswordChangeForm.tsx` (new)

**Intent**: The „Zmień hasło” form with client-side validation and the same parts as `NewPasswordForm`.

**Contract**: Props `serverError?: string | null`. `<form method="POST" action="/api/auth/change-password" noValidate>` with fields `current` („Obecne hasło”, `autocomplete="current-password"`), `password` („Nowe hasło”, `autocomplete="new-password"`, running hint as in `NewPasswordForm`), `repeat` („Powtórz nowe hasło”, `autocomplete="new-password"`), each with `PasswordToggle`. `validatePasswordChange` runs on submit. `ServerError`, then a row with the link „Nie pamiętasz obecnego hasła?” → `/auth/forgot-password` and `SubmitButton` „Zapisz nowe hasło” (pending „Zapisywanie...”). Layout per reference 18: current password alone at max ~360 px, new + repeat in two columns, stacked at narrow widths.

#### 5. The page

**File**: `src/pages/ustawienia.astro` (new)

**Intent**: Render the settings screen and consume the flash.

**Contract**: `PlannerLayout title="Ustawienia" active="account"`. Read and delete `PASSWORD_CHANGED_COOKIE` (path from its options) like `month.astro:15-18`. Translate `?error=` through `authErrorMessage` only when present. `SettingsLayout active="konto"`. Card „Konto”: label „E-mail”, `user.email`, aside „Na ten adres wysyłamy linki do aktywacji i resetu hasła.” Card „Zmień hasło” with `id="haslo"`: `h2`, the lead „Po zmianie hasła pozostaniesz zalogowana lub zalogowany na tym urządzeniu, a na pozostałych trzeba będzie zalogować się ponownie.”, the success notice in a `role="status"` element when the flash was present, and `<PasswordChangeForm client:load serverError={…} />`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Unit tests pass: `npm test`
- Existing E2E still green (header change): `npm run test:e2e`

#### Manual Verification:

- `/ustawienia` matches mock-up 18 (without the „Usuń konto” card) at 1440 px, 768 px and 390 px
- Avatar → `/ustawienia`, with focus ring and `aria-current` on that page; signed out, `/ustawienia` → `/auth/signin`
- Wrong current password shows the current-password message; mismatched or short new passwords are caught on the client
- A correct change shows the notice once, a reload removes it, and the fields are empty
- „Wyloguj się” in the settings menu signs out

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human before proceeding to the next phase.

---

## Phase 4: E2E, docs and rollout

### Overview

The acceptance criterion from the roadmap, the second session losing access, gets an automated guard. The docs describe the new screen and the re-auth sequence.

### Changes Required:

#### 1. E2E: the second session loses access

**File**: `tests/e2e/password-change.spec.ts` (new)

**Intent**: Prove FR-023 end to end on the real Supabase: the change works and another signed-in browser is cut off.

**Contract**: Follow `/10x-e2e` and `tests/e2e/E2E-RULES.md`: role/label locators, no `waitForTimeout`, own setup and cleanup, a unique timestamped address. `storageState` cleared, as in `password-reset.spec.ts`, because changing the password of the shared teacher would break the rest of the suite. Setup: admin-create a disposable confirmed user. Test 1: sign in in context A and in context B. In A open `/ustawienia` through the avatar link, enter a wrong current password → the current-password message, and B still opens `/plan/month`. Then enter the right one + new password → the notice. B navigates to `/plan/month` → lands on `/auth/signin`. A still opens `/plan/month`. Signing in with the old password fails and the new one succeeds. Cleanup deletes the user.

#### 2. Docs

**Files**: `CLAUDE.md`, `context/foundation/roadmap.md`, `context/foundation/new-ideas.md`

**Intent**: Record the new screen and the non-obvious sequence so later slices (S-18) build on it correctly.

**Contract**: CLAUDE.md, under Auth flow: `/ustawienia` (protected, `SettingsLayout`, S-18 adds deletion here), and that `POST /api/auth/change-password` re-signs in with the session's e-mail *because* `secure_password_change` refuses sessions older than 24 h. „Planner shell”: `active` is optional, and the avatar leads to `/ustawienia`. Roadmap S-17 status → `in progress` (the archive step closes it). New-ideas: the password-changed notification e-mail.

### Success Criteria:

#### Automated Verification:

- New E2E passes: `npx playwright test password-change`
- Full E2E suite green: `npm run test:e2e`
- Lint, unit, build: `npm run lint && npm test && npm run build`

#### Manual Verification:

- After the merge (merge = deploy), on `https://temio.pl` with a test account signed in on two devices: changing the password on one signs out the other
- In production, change the password on an account whose session is older than 24 h (signed in the day before) — it succeeds, confirming the re-sign-in gets around `secure_password_change`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human.

---

## Testing Strategy

### Unit Tests:

- `validatePasswordChange`: each field empty, too short, mismatch, new equals current, valid.
- `authErrorMessage`: the two new codes resolve to their own sentences.
- Route: call order, the e-mail comes from the session, code mapping, a failed `signOut` does not hide success, no Supabase call on invalid input.

### Integration Tests:

- E2E with two browser contexts on a disposable account (Phase 4).

### Manual Testing Steps:

1. Sign in on two browsers, change the password in one, navigate in the other → sign-in page.
2. Wrong current password → the current-password message; nothing changed (the old password still works).
3. New password equal to the current one → caught on the client; with JS disabled → the `same_password` message from the server.
4. Production: change the password on a session older than 24 h.

## Performance Considerations

The change costs three Supabase Auth calls (sign-in, update, sign-out) instead of two. A wrong current password counts against the sign-in rate limit (`over_request_rate_limit` is already mapped), which is the intended brute-force brake.

## Migration Notes

No schema change and no dashboard change: `secure_password_change` stays on, and the re-sign-in satisfies it. Existing sessions are unaffected until a teacher changes her password.

## References

- Roadmap: `context/foundation/roadmap.md` S-17; PRD: `context/foundation/prd-v3.md` FR-023
- Mock-up: `context/foundation/design/design/screens/18-ustawienia.png`, `design/reference/18-ustawienia.html` (after Phase 1)
- Prior flow: `context/archive/2026-10-03-password-reset/plan.md`; `src/pages/api/auth/update-password.ts`
- Route test pattern: `src/pages/api/auth/confirm.test.ts`
- E2E pattern: `tests/e2e/password-reset.spec.ts`
- GoTrue enforcement: `supabase/auth` `internal/api/user.go` (`UpdatePasswordRequireReauthentication`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Design package, rules and error vocabulary

#### Automated

- [x] 1.1 Design package merged and duplicate gone — 6064464
- [x] 1.2 Unit tests pass (password-policy, auth-error-messages) — 6064464
- [x] 1.3 Lint passes — 6064464

#### Manual

- [ ] 1.4 Polish wording of the new messages reads correctly

### Phase 2: Route `POST /api/auth/change-password`

#### Automated

- [x] 2.1 Route tests pass — 4a0cc05
- [x] 2.2 Route signs in with the session's address (grep gate checked on both states) — 4a0cc05
- [x] 2.3 Lint passes — 4a0cc05
- [x] 2.4 Build passes — 4a0cc05

#### Manual

- [ ] 2.5 POST without a session redirects to `/auth/signin`

### Phase 3: The `/ustawienia` screen

#### Automated

- [x] 3.1 Lint passes — 7aaf774
- [x] 3.2 Build passes — 7aaf774
- [x] 3.3 Unit tests pass — 7aaf774
- [x] 3.4 Existing E2E still green — 7aaf774

#### Manual

- [ ] 3.5 `/ustawienia` matches mock-up 18 at 1440/768/390 px
- [ ] 3.6 Avatar link, focus, `aria-current`; signed-out redirect
- [ ] 3.7 Wrong current password and client validation messages
- [ ] 3.8 Success notice once, reload removes it, fields empty
- [ ] 3.9 „Wyloguj się” in the settings menu signs out

### Phase 4: E2E, docs and rollout

#### Automated

- [x] 4.1 New E2E passes
- [x] 4.2 Full E2E suite green
- [x] 4.3 Lint, unit, build

#### Manual

- [ ] 4.4 Production: second device signed out after a change
- [ ] 4.5 Production: change succeeds on a session older than 24 h
