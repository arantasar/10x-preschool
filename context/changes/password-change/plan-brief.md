# Password Change (S-17) — Plan Brief

> Full plan: `context/changes/password-change/plan.md`

## What & Why

A signed-in teacher changes her password, and every other device signed in to her account (e.g. a computer at the preschool) loses access (FR-023). Changing the password without cutting off other sessions doesn't help after a suspected break-in, so the acceptance check is the *second* session, not the one that made the change. The slice also opens the first account-settings screen, which S-18 (account deletion) builds on.

## Starting Point

S-16 left the parts: the password rules (`MIN_PASSWORD_LENGTH = 8`), the `updateUser` → `signOut({scope:"others"})` sequence, the auth form components, the code → Polish error map and a one-shot flash cookie pattern. No settings screen exists; the header avatar is decoration. S-16 also turned on `secure_password_change`, which rejects a password update from any session older than 24 h. A plain `updateUser` would fail for almost every teacher.

## Desired End State

The header avatar leads to `/ustawienia` (mock-up 18, without the „Usuń konto” card). The teacher enters her current password and a new one twice and sees a one-time confirmation. She stays signed in here, and another browser on her account lands on the sign-in page at its next step. A wrong current password changes nothing and says so in words about the current password.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Current-password check / 24 h limit | Server re-signs in (`signInWithPassword` with the session's e-mail), then `updateUser`, then sign out others | Proves the current password and gives a fresh session that `secure_password_change` accepts, with no dashboard change and no e-mail code. |
| URL | `/ustawienia`, added to `PROTECTED_ROUTES` | Matches the mock-up and the Polish URLs of `/pomoc`, `/kontakt`. |
| „Usuń konto” card and menu item | Left out until S-18 | No dead button on production (merge = deploy). |
| Header | Avatar becomes a „Ustawienia konta” link; „Pomoc” and „Wyloguj się” stay | Minimal change; the E2E setup that waits for „Wyloguj się” keeps working. |
| After saving | Back to `/ustawienia` with a one-shot notice | The confirmation sits where the action happened, as in the mock-up. |
| Errors | React island + `?error=<code>`; new codes `current_password_invalid`, `password_change_failed` | Follows `supabase-error-copy`; the sign-in wording „adres e-mail lub hasło” is wrong on this screen. |
| "Password changed" e-mail | Not in S-17 (noted in new-ideas) | Keeps scope small; it would need a template and dashboard steps. |
| Testing | Unit + route-ordering test + one two-context E2E | The roadmap demands an automated check of the second session. |

## Scope

**In scope:** design package merge (`temio-design-astro/` → `context/foundation/design/`); `validatePasswordChange`; two error codes; flash cookie; `POST /api/auth/change-password` + tests; `/ustawienia` page, `SettingsLayout`, `PasswordChangeForm`; header avatar link; middleware; E2E; CLAUDE.md, roadmap, new-ideas.

**Out of scope:** account deletion (S-18), the notification e-mail, nonce reauthentication, turning off `secure_password_change`, e-mail change, other settings sections, moving logout or help out of the header.

## Architecture / Approach

Native form → `POST /api/auth/change-password` → redirect. The route goes `signInWithPassword(user.email, current)` → `updateUser({password})` → `signOut({scope:"others"})` → flash cookie → `/ustawienia`, or `/ustawienia?error=<code>` at the first failure. The fresh sign-in's session makes the previous session of this device "other" too, so that one is revoked as well; the browser already holds the new cookies.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Design, rules, vocabulary | Single design source; validation; codes; flash cookie | Removing the wrong copy of the design package |
| 2. Change-password route | Re-auth → update → sign out others, with ordering tests | Signing out before the update, or trusting a form e-mail |
| 3. `/ustawienia` screen | Settings shell, form island, avatar link, protection | The header change breaks existing E2E selectors |
| 4. E2E, docs, rollout | Two-context E2E; CLAUDE.md; production checks | The 24 h case is only checkable by hand in production |

**Prerequisites:** a feature branch (`feat/password-change`; currently on `master`); local Supabase + Docker for E2E.
**Estimated effort:** ~2 sessions across 4 phases.

## Open Risks & Assumptions

- Assumes `signOut({scope:"others"})` revokes sessions immediately, so the second browser fails at its next `getUser()`. S-16 confirmed this manually; the E2E now guards it.
- The 24 h path rests on reading GoTrue's source (the fresh session's `created_at`). The only real check is a production change on a day-old session (4.5).
- A wrong current password counts against the sign-in rate limit. That is intended, and the message is already mapped.

## Success Criteria (Summary)

- A teacher changes her password from `/ustawienia`, even when she signed in days ago.
- Her other signed-in devices are sent to sign-in; the old password stops working, the new one works.
- A wrong current password changes nothing and is explained in Polish.
