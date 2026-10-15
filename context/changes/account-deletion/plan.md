# Account Deletion (S-18) Implementation Plan

## Overview

A signed-in teacher deletes her own account, and every plan with it, from `/ustawienia`. She proves she knows the current password and confirms in a danger window that says the account and all plans go and that the operation cannot be undone. Afterwards she lands on `/` with a one-shot notice, cannot sign in again, her plans no longer exist, and any other device she was signed in on loses access on its next request. FR-024; roadmap S-18.

## Current State Analysis

- **Data already cascades from the user row.** `public.day_plans.user_id references auth.users (id) on delete cascade` (`supabase/migrations/20260718211452_day_plans_and_activities.sql:24`); `public.activities` cascades through `day_plans (id, user_id)` (same file, :67). `public.contact_messages.user_id` is `on delete set null` (`supabase/migrations/20261009120000_contact_messages.sql:33`). GoTrue's own tables (`auth.identities`, `auth.sessions`, `auth.refresh_tokens`, `auth.mfa_*`) reference `auth.users` with cascades, so removing the user row removes every session server-side.
- **The app has no privileged key.** `SUPABASE_KEY` is the anon key (`src/lib/supabase.ts`); the service role exists only in the e2e helper `tests/e2e/support/supabase-admin.ts`. No migration so far uses `security definer` — every writer function runs as the invoker under RLS. This slice adds the product's first operation above RLS.
- **The settings screen and its route pattern exist (S-17).** `src/pages/ustawienia.astro` renders two cards inside `SettingsLayout` (`src/components/account/SettingsLayout.astro`, whose header comment already reserves „Usuń konto” as the last regular menu item in the danger colour). `POST /api/auth/change-password` (`src/pages/api/auth/change-password.ts`) re-signs in with the **session's** e-mail before acting and maps `invalid_credentials` to `current_password_invalid`; its unit test (`change-password.test.ts`) is the harness to copy.
- **`?error=` on `/ustawienia` belongs to the change-password form** — the page translates it with `authErrorMessage` and hands it to `PasswordChangeForm`. A second form on the page needs its own slot.
- **Confirmations go through `useConfirmDialog`** with a `ConfirmationRequest` built and unit-tested in `src/lib/confirmations.ts`; `ConfirmDialog` has no text input. The design package's `DeleteAccountDialog.astro` (type „USUŃ”) predates that convention and is not followed here (see decisions).
- **Test tiers available:** pgTAP (`supabase/tests/database/*.test.sql`, seeded `auth.users` rows, role switch via `request.jwt.claims`), route unit tests with a mocked `locals.supabase`, Playwright e2e with throwaway accounts through `admin()` (`tests/e2e/password-change.spec.ts`).

## Desired End State

- `/ustawienia` shows a third card, „Usuń konto”, in danger styling, with an „Obecne hasło” field and a „Usuń konto…” button; the settings menu has a danger-coloured „Usuń konto” item linking to `#usun-konto`.
- Submitting with a password opens the danger confirmation; „Zostaw” does nothing; „Usuń konto” posts to `/api/auth/delete-account`.
- A wrong password returns to `/ustawienia?delete_error=current_password_invalid#usun-konto` with the message in the deletion card and nothing deleted.
- A right password deletes `auth.users` row → cascades remove plans, activities and sessions → the browser's session cookies are cleared → redirect to `/` showing „Konto zostało usunięte razem ze wszystkimi planami.” once.
- Signing in with the old credentials fails; a second device's next navigation to `/plan/month` ends on `/auth/signin`; another account's plans are untouched.

Verified by: pgTAP suite for the function, route unit tests, one e2e spec on two throwaway accounts, plus a manual run on production with a throwaway account.

### Key Discoveries:

- `day_plans` / `activities` cascade from `auth.users` — the function deletes one row and nothing else (`20260718211452_day_plans_and_activities.sql:24,67`).
- Function grants need **two** revokes (`public` and `anon`) plus `grant execute … to authenticated`; Supabase's default privileges grant execute to `anon` directly (`20260823095136_day_plan_generation_write_contract.sql:209-228`).
- `secure_password_change = true` in `supabase/config.toml` is irrelevant here (no `updateUser`), but the re-sign-in still matters: it is the proof of intent, not a freshness workaround.
- `src/lib/auth-error-messages.ts` is the single vocabulary; unmapped codes fall back to a generic Polish sentence.
- `security: { checkOrigin: true }` in `astro.config.mjs` is the CSRF protection for every state-changing form in the signed-in app; this route rests on it like change-password does.
- `src/db/database.types.ts` is generated (`npx supabase gen types typescript --local > src/db/database.types.ts`), never hand-edited, and lint-ignored.

## What We're NOT Doing

- **Subscription condition of FR-024** (ending an active subscription on deletion) — belongs to S-25.
- **Deleting `contact_messages`** — the FK stays `on delete set null`; rows expire after 12 months via `contact-messages-retention`. The deletion copy promises the account and plans only; S-20's privacy policy must describe the message retention. Owner: S-20 (`legal-pages`).
- **A per-account attempt limit on the deletion route** — explicit no-limit decision, see Critical Implementation Details. Owner of revisiting: S-25 (first moment an account carries money).
- **A service-role key in the Worker.**
- **The typed „USUŃ” dialog from the design package** and any text input in `ConfirmDialog`.
- **A goodbye e-mail** — the `send_email` binding only reaches verified destination addresses, and nothing in FR-024 asks for one.
- **Soft delete / grace period / undo.**
- **A route `.db.test.ts`** — pgTAP + e2e cover the real database; the tier's two fixed teachers cannot be deleted.

## Implementation Approach

The single privileged step lives in SQL: `public.delete_own_account()` is `security definer`, takes **no arguments**, and deletes exactly `auth.users where id = auth.uid()`. Because the target id comes from the caller's JWT and not from a parameter, no input can name another account; that boundary is proved by pgTAP on two accounts. The route is a thin, ordered wrapper modelled on change-password: prove the password with the session's e-mail, call the function, clear the local session, set a one-shot cookie, redirect home. The UI is a native-POST form island that validates, then asks `useConfirmDialog`, then submits.

## Critical Implementation Details

- **Function hygiene.** `security definer` with `set search_path = ''` and fully qualified names (`auth.users`, `auth.uid()`). Raise if `auth.uid()` is null (a definer function must never run a `where id = null` that a later edit could turn into something broader). Owner stays the migration role (`postgres`); on hosted Supabase that role must be allowed to `delete` from `auth.users` — the manual production check in Phase 3 is the proof, and if it fails the plan stops and returns to the service-role alternative rather than granting anything on the `auth` schema.
- **State sequencing in the route.** Order is the contract: (1) `signInWithPassword({ email: user.email, password })` — failure writes no cookies, deletes nothing; (2) `rpc("delete_own_account")` — failure redirects with `account_delete_failed` and the account is intact (the fresh session from step 1 is harmless); (3) `signOut({ scope: "local" })` — the server-side session is already gone with the user row, so this may answer with an error; log it and continue, the point is that the SDK removes the `sb-*` cookies. If the implementer finds the SDK keeps the cookies on that error, delete them explicitly in the route — the invariant is "the redirect response leaves the browser with no session", asserted by the e2e (`/plan/month` → `/auth/signin` in the same context). (4) set `account_deleted` cookie, redirect `/`.
- **Rate limit decision (lessons.md „Logowanie z Workera nie niesie IP klienta”).** No per-account limit, by explicit decision: the route is reachable only with a valid session, so a guesser already holds the account — and the same guessing is already possible through change-password. Write this as a comment on the route naming S-25 as the point to revisit.
- **Island lock.** The window is asynchronous: check the `submitting` flag before `await confirm(…)` and again after it; set it before `form.submit()`.
- **Error slot.** Deletion errors use `?delete_error=<code>` and the `#usun-konto` fragment so the page scrolls to the card; `?error=` stays the change-password form's. Both go through `authErrorMessage`.

## Phase 1: Database — the privileged function

### Overview

One migration adds the only operation in the product that acts above RLS, proved on two accounts before anything calls it.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20261015120000_delete_own_account.sql`

**Intent**: Add `public.delete_own_account()` that removes the caller's `auth.users` row, relying on existing cascades for plans, activities and GoTrue sessions. Header comment in the style of earlier migrations (purpose, affected objects, rollback: `drop function public.delete_own_account();`), and a note that this is the first `security definer` function and why its id comes from `auth.uid()`.

**Contract**: `public.delete_own_account() returns void`, `language plpgsql`, `security definer`, `set search_path = ''`; raises (e.g. `42501`) when `auth.uid()` is null; deletes `auth.users where id = (select auth.uid())`. Grants: `revoke all … from public; revoke all … from anon; grant execute … to authenticated;`. `comment on function` stating the boundary.

#### 2. pgTAP suite

**File**: `supabase/tests/database/delete_own_account.test.sql`

**Intent**: Prove the boundary where it lives. Fixtures as owner: two `auth.users` rows (A, B), a plan with activities for each, a session row for A. As A: call the function → A's user, plans, activities and sessions are gone; B's user, plan and activities are intact (counted as owner after `reset role`). As anon: `throws_ok` on execute (permission denied). As `authenticated` with no `sub` claim: `throws_ok`. Function metadata: `prosecdef` true, `proconfig` contains `search_path=""`, `has_function_privilege('anon', …, 'execute')` false.

**Contract**: `begin; select plan(N); … select * from finish(); rollback;` — same shape as `rls_isolation.test.sql`.

#### 3. Generated types

**File**: `src/db/database.types.ts`

**Intent**: Regenerate so `supabase.rpc("delete_own_account")` is typed.

**Contract**: output of `npx supabase gen types typescript --local > src/db/database.types.ts`; never hand-edited.

### Success Criteria:

#### Automated Verification:

- Migration applies on a clean local stack: `npx supabase db reset`
- pgTAP suite passes, including the new file: `npm run test:db`
- The new suite can fail: temporarily change the function's `where` to `where true` (or drop the `anon` revoke) locally, run `npm run test:db`, see it red, revert
- Types include the function: `grep -c "delete_own_account: {" src/db/database.types.ts` returns `1`
- Lint passes: `npm run lint`

#### Manual Verification:

- Read the migration once against the Critical Implementation Details checklist (definer, empty `search_path`, null-uid raise, two revokes + one grant)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Route and wording

### Overview

The server path and every sentence the teacher will read, unit-tested without a database.

### Changes Required:

#### 1. Settings constants

**File**: `src/lib/account-settings.ts`

**Intent**: Add the one-shot "account deleted" cookie, the deletion error parameter and the card's anchor, next to `PASSWORD_CHANGED_COOKIE`.

**Contract**: `ACCOUNT_DELETED_COOKIE = "account_deleted"`, `ACCOUNT_DELETED_COOKIE_OPTIONS` (`path: "/"`, `httpOnly`, `sameSite: "lax"`, `secure: !import.meta.env.DEV`, `maxAge: 60`), `DELETE_ERROR_PARAM = "delete_error"`, `DELETE_ACCOUNT_ANCHOR = "usun-konto"`.

#### 2. Error vocabulary

**File**: `src/lib/auth-error-messages.ts` (+ `auth-error-messages.test.ts`)

**Intent**: Mint `ACCOUNT_DELETE_FAILED = "account_delete_failed"` with a Polish sentence that says the account was **not** deleted and to try again or write via `/kontakt`. Reuse `current_password_invalid` as is. Update the module header's list of routes/pages.

**Contract**: new exported constant + map entry; a test that the code maps to a sentence containing „nie zostało usunięte” (or the final wording) and never falls back to the generic message.

#### 3. Confirmation request

**File**: `src/lib/confirmations.ts` (+ `confirmations.test.ts`)

**Intent**: The window's words, testable as data: title „Usunąć konto?”, body naming the e-mail and saying the account and all plans and proposals are deleted, ending on `IRREVERSIBLE_SENTENCE`; buttons „Usuń konto” / „Zostaw”; `tone: "danger"`.

**Contract**: `deleteAccountConfirmation(email: string): ConfirmationRequest`; tests assert tone, both labels, the e-mail in the body, the last paragraph is `IRREVERSIBLE_SENTENCE`.

#### 4. Route

**File**: `src/pages/api/auth/delete-account.ts`

**Intent**: Delete the signed-in teacher's account after proving the current password, in the order given in Critical Implementation Details, with a header comment stating that order as the security contract and the explicit no-rate-limit decision.

**Contract**: `export const prerender = false; export const POST: APIRoute`. Input `current` (zod `z.string().min(1)`); an e-mail in the form is ignored. Redirects: no client → `/ustawienia?delete_error=config_missing#usun-konto`; no user → `/auth/signin`; invalid input → `validation_failed`; `invalid_credentials` → `current_password_invalid`; other sign-in code forwarded, codeless → `connection_failed`; rpc error → `account_delete_failed` (log `auth.delete_account.failed` with code/message); success → set `ACCOUNT_DELETED_COOKIE`, redirect `/`. Logs: `auth.delete_account.reauth_failed`, `auth.delete_account.signout_failed`, `auth.delete_account.done` (user id only, no e-mail).

#### 5. Route unit tests

**File**: `src/pages/api/auth/delete-account.test.ts`

**Intent**: Same harness as `change-password.test.ts`, with `rpc` added to the mock client.

**Contract**: cases — success order `["signIn", "rpc", "signOut"]` with `rpc` called as `("delete_own_account")` and `signOut({ scope: "local" })`, cookie options spelled out, redirect `/`; sign-in uses the session e-mail even when the form carries another; `invalid_credentials` → `current_password_invalid`, no `rpc`, no cookie; codeless sign-in error → `connection_failed`; rpc error → `account_delete_failed`, no `signOut`, no cookie; signOut error still confirms; no client → `config_missing`; no user → `/auth/signin`; empty password → `validation_failed`, no sign-in. Every error redirect ends with `#usun-konto`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- The route's ordering test can fail: swap the `rpc` and `signInWithPassword` calls locally, see `delete-account.test.ts` red, revert
- Lint and types pass: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Read the Polish sentences (confirmation body, `account_delete_failed`) aloud once — they say what is deleted, that it is final, and that a failure deleted nothing

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: UI, end-to-end proof and docs

### Overview

The card, the menu item and the notice; the two-account e2e proof the roadmap asks for; and the docs that future slices read.

### Changes Required:

#### 1. Deletion island

**File**: `src/components/account/DeleteAccountForm.tsx`

**Intent**: Native POST form to `/api/auth/delete-account` with an „Obecne hasło” field (reusing `FormField`, `PasswordToggle`, `ServerError`, `SubmitButton`-like danger button „Usuń konto…”), a hidden read-only `autocomplete="username"` e-mail like `PasswordChangeForm`. `onSubmit`: prevent default; empty password → field error; otherwise lock-check → `await confirm(deleteAccountConfirmation(email))` → lock-check again → set submitting → `form.submit()`. Renders `dialog` from `useConfirmDialog`.

**Contract**: `Props { email?: string; serverError?: string | null }`; field `name="current"`, `autoComplete="current-password"`.

#### 2. Settings page and menu

**Files**: `src/pages/ustawienia.astro`, `src/components/account/SettingsLayout.astro`

**Intent**: Add a third card `<section id="usun-konto" aria-labelledby="usun-konto-heading">` in danger styling (design `.set-card--danger`, mapped to the project's tokens), heading „Usuń konto”, the sentence „Razem z kontem usuniemy wszystkie Twoje plany i propozycje. Tej operacji nie można cofnąć.”, and the island with `serverError` from `?delete_error=`. Add „Usuń konto” as the last regular menu item (danger colour, trash icon from the design, `href="/ustawienia#usun-konto"`) above the divider; update the layout's header comment from "S-18 adds" to what exists.

**Contract**: `?error=` keeps feeding `PasswordChangeForm` only; `?delete_error=` feeds `DeleteAccountForm` only.

#### 3. Notice on the landing page

**File**: `src/pages/index.astro` (and `Welcome.astro` only if the notice must sit inside it)

**Intent**: One-shot: if `ACCOUNT_DELETED_COOKIE` is present, delete it and render a `role="status"` notice „Konto zostało usunięte razem ze wszystkimi planami.” above the welcome content, in the `bg-szalwia-soft` notice style used on `/ustawienia`.

**Contract**: the cookie is deleted with `path: "/"` on the render that shows it; a reload shows no notice.

#### 4. E2E spec

**File**: `tests/e2e/account-deletion.spec.ts`

**Intent**: FR-024 proof on two throwaway accounts (A deleted, B the bystander), no `storageState`, form sign-in as the documented exception (as in `password-change.spec.ts`). Setup via `admin()`: create A and B, insert one `day_plans` row (+ an activity) for each. Scenarios:
1. Wrong password: the card shows the `current_password_invalid` message, A still signs in.
2. „Zostaw” in the window: nothing posted, still on `/ustawienia`.
3. Deletion: A signed in on two contexts; context 1 deletes via the card → lands on `/` with the notice; reload → notice gone; `/plan/month` in context 1 → `/auth/signin`; context 2's next navigation to `/plan/month` → `/auth/signin`; sign-in with A's credentials shows the invalid-credentials message; `admin()` finds no user A and zero `day_plans` rows for A's id; B's plan row still exists.
`afterEach` deletes any remaining throwaway user through `admin()` (ignoring "not found" for A).

**Contract**: locators by role/label/text only; no `waitForTimeout`; unique e-mails via `uniqueStamp()`.

#### 5. Docs

**Files**: `CLAUDE.md`, `context/foundation/roadmap.md`

**Intent**: CLAUDE.md → under Auth flow, an „Account deletion” bullet: route, order, `delete_own_account()` as the only `security definer` function and the only operation above RLS (with the rule that it takes no id argument), `?delete_error=`, no rate limit by decision (revisit at S-25), contact messages kept; replace the "S-18 adds account deletion there" sentence with the present tense. Roadmap → S-18 Unknown resolved (SECURITY DEFINER, date), status `done` when merged.

**Contract**: prose only.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- E2E spec passes against the local stack: `npx playwright test tests/e2e/account-deletion.spec.ts`
- Full e2e suite has no regressions (password-change, account-menu): `npm run test:e2e`
- The e2e can fail: temporarily make the route skip the `rpc` call (redirect to `/` anyway), run the spec, see the "A cannot sign in" / "no plan rows" assertions red, revert
- Lint and build pass: `npm run lint && npm run build`

#### Manual Verification:

- Desktop and ≤ 900 px: the danger card and the menu item match `18b-ustawienia-usun-konto.html` in colour and placement; the menu item scrolls to the card
- Keyboard only: tab to the password, submit with Enter → the window opens with focus on „Zostaw”; Escape closes it and nothing is deleted
- **Production check with a throwaway account on `temio.pl`** (after merge): sign up, generate one plan, delete the account → notice on `/`, sign-in refused, and in the Supabase dashboard the user and its `day_plans` rows are gone. This is the proof that the function's owner may delete from `auth.users` on the hosted project.
- CLAUDE.md and roadmap read correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `delete-account.test.ts` — order, session e-mail only, each failure path deletes nothing and sets no cookie, `#usun-konto` on every error redirect.
- `confirmations.test.ts` — `deleteAccountConfirmation`: danger tone, labels, e-mail present, ends on `IRREVERSIBLE_SENTENCE`.
- `auth-error-messages.test.ts` — `account_delete_failed` mapped, not the fallback.

### Integration Tests:

- pgTAP `delete_own_account.test.sql` — two-account isolation, cascades, anon and no-claim refusals, definer/search_path/grant metadata.
- Playwright `account-deletion.spec.ts` — wrong password, cancel, full deletion with second-session cut-off and bystander account intact.

### Manual Testing Steps:

1. On `/ustawienia`, click „Usuń konto” in the menu → page scrolls to the danger card.
2. Submit with an empty password → field error, no window.
3. Submit with a wrong password → window → „Usuń konto” → back on the card with the wrong-password message; still signed in.
4. Submit with the right password → „Zostaw” → nothing happens.
5. Submit again → „Usuń konto” → `/` with the notice; reload → no notice; `/plan/month` → sign-in page.
6. Production throwaway-account run as in Phase 3.

## Performance Considerations

None: one GoTrue sign-in and one RPC per deletion; cascades touch at most a few hundred rows per account.

## Migration Notes

Additive migration (one function, grants, comment). Rollback: `drop function public.delete_own_account();`. Workers Builds deploys on merge to `master`; the migration must be applied to the hosted project before or with the merge (`npx supabase db push`), otherwise the route answers `account_delete_failed` and nothing is deleted — a safe failure.

## References

- Roadmap: `context/foundation/roadmap.md` §S-18; PRD `context/foundation/prd-v3.md` FR-024, §Access Control Changes
- Pattern route: `src/pages/api/auth/change-password.ts` and its test
- Grant triple rationale: `supabase/migrations/20260823095136_day_plan_generation_write_contract.sql:209-228`
- Design: `context/foundation/design/design/reference/18b-ustawienia-usun-konto.html`, `context/foundation/design/src/components/account/DeleteAccountDialog.astro`
- E2E pattern: `tests/e2e/password-change.spec.ts`
- Lessons: `context/foundation/lessons.md` (password routes and limits; criteria that can fail)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Database — the privileged function

#### Automated

- [x] 1.1 Migration applies on a clean local stack: `npx supabase db reset`
- [x] 1.2 pgTAP suite passes, including the new file: `npm run test:db`
- [x] 1.3 The new suite can fail (broken `where` or missing `anon` revoke → red, then revert)
- [x] 1.4 Types include the function: `grep -c "delete_own_account: {" src/db/database.types.ts` returns `1`
- [x] 1.5 Lint passes: `npm run lint`

#### Manual

- [ ] 1.6 Migration read against the Critical Implementation Details checklist

### Phase 2: Route and wording

#### Automated

- [ ] 2.1 Unit tests pass: `npm test`
- [ ] 2.2 The route's ordering test can fail (swap `rpc` and sign-in → red, then revert)
- [ ] 2.3 Lint and types pass: `npm run lint`
- [ ] 2.4 Build passes: `npm run build`

#### Manual

- [ ] 2.5 Polish sentences read aloud once

### Phase 3: UI, end-to-end proof and docs

#### Automated

- [ ] 3.1 Unit tests pass: `npm test`
- [ ] 3.2 E2E spec passes: `npx playwright test tests/e2e/account-deletion.spec.ts`
- [ ] 3.3 Full e2e suite has no regressions: `npm run test:e2e`
- [ ] 3.4 The e2e can fail (route skips `rpc` → red, then revert)
- [ ] 3.5 Lint and build pass: `npm run lint && npm run build`

#### Manual

- [ ] 3.6 Desktop and ≤ 900 px match the design; menu item scrolls to the card
- [ ] 3.7 Keyboard only: focus on „Zostaw”, Escape deletes nothing
- [ ] 3.8 Production check with a throwaway account on `temio.pl`
- [ ] 3.9 CLAUDE.md and roadmap read correctly
