# Password Reset (S-16) — Plan Brief

> Full plan: `context/changes/password-reset/plan.md`

## What & Why

A teacher who forgets her password today has no way back to her account and her plans (PRD v3 US-04, FR-022). This slice adds a self-service reset by e-mail. The reset page must also say where to look for the message and what to do when it doesn't arrive. It is a precondition for selling (`monetization.md` §6 #2).

## Starting Point

Auth is sign-in / sign-up / sign-out only, on an `@supabase/ssr` client that defaults to PKCE. Mock-ups 12, 12b and 13 and `AuthCard.astro` are ready. Error codes go through `?error=` and `auth-error-messages.ts`. Production already sends auth mail through its own SMTP.

## Desired End State

„Nie pamiętasz hasła?” on sign-in leads to a form. Any address leads to the same "sprawdź skrzynkę" page, which offers a resend and a fallback e-mail address. The Polish mail's link works on any device. One button press verifies it, she sets a new password (≥ 8), other devices are signed out, and she lands on her month with a confirmation and all plans intact.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Link mechanism | `token_hash` + server `verifyOtp`, custom recovery template | PKCE links fail when opened on a different device than the request. |
| Mail scanner prefetch | GET `/auth/confirm` renders a button; only POST verifies | School mailbox scanners would otherwise use up the single-use link. |
| Delivery | Keep existing custom SMTP; verify SPF/DKIM only | Already sending signup mail in production. |
| Fallback until S-19 | `mailto:` from a `SUPPORT_EMAIL` constant | Meets FR-022's condition today; S-19 swaps one place (handover item on S-19). |
| After saving | Stay signed in, `signOut({scope:"others"})`, month + one-shot notice | US-04 ends on her plans; a reset after a suspected break-in should lock out other devices. |
| Recovery session | Normal session, no gating | Supabase's standard model; gating adds state for little gain. |
| Password minimum | Raised to 8 everywhere (shared constant, config, dashboard) | Explicit choice; existing shorter passwords keep working until changed. |
| Resend | Re-POST of the same address; per-address cooldown swallowed | Showing the cooldown would reveal that the account exists. |
| Testing | Unit (error codes, validation) + one E2E through Mailpit | The template ↔ route seam is the riskiest part and needs an automated guard. |

## Scope

**In scope:** sign-in link; `/auth/forgot-password` (+ `/sent`), `/auth/confirm`, `/auth/new-password`; three POST routes; Polish recovery template; min length 8; month notice; E2E; CLAUDE.md; S-19 handover; production dashboard checklist.

**Out of scope:** signed-in password change (S-17), contact form (S-19), captcha, own SMTP setup, recovery-session gating, forcing old short passwords to change, E2E in CI.

## Architecture / Approach

Native forms → `POST /api/auth/{forgot-password,confirm,update-password}` → redirect with a code → the page translates it, mirroring `signin.ts`. Pure decisions (silent vs shown error codes, new-password validation) live in `src/lib/` and are unit-tested. Local Supabase is configured in `config.toml` and `supabase/templates/recovery.html`. Production gets the same settings by hand in the dashboard, because the template and redirect allow-list are not in git.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Rules, errors, local config | `MIN_PASSWORD_LENGTH = 8`, `SUPPORT_EMAIL`, new error codes, recovery template, redirect allow-list | Sign-up behaviour changes (7 chars no longer accepted) |
| 2. Request a link | Sign-in link, form, request route, sent page with resend | Leaking account existence through error paths |
| 3. Link → new password | Prefetch-safe confirm, new-password form, save route, month notice | Template/allow-list mismatch silently breaks the link |
| 4. E2E, docs, rollout | Mailpit E2E, CLAUDE.md, S-19 handover, dashboard checklist | Merge without dashboard changes ships a broken flow (merge = deploy) |

**Prerequisites:** branch `feat/password-reset` (current); local Supabase + Docker; Janusz provides the real `SUPPORT_EMAIL`; dashboard access for production.
**Estimated effort:** ~2–3 sessions across 4 phases.

## Open Risks & Assumptions

- If the redirect URL is missing from the allow-list, Supabase quietly falls back to Site URL and the link breaks without an error. That is why Phase 4 has both an E2E test and a production check.
- Assumes production link expiry is 1 hour. If the dashboard says otherwise, the copy changes, not the setting.
- Some school mailboxes may still filter the mail. The `mailto:` fallback covers this until S-19 ships.

## Success Criteria (Summary)

- A teacher resets her password from a different device than the one she requested it on, and sees all her plans.
- Nothing on screen differs between an existing and an unknown address.
- Other devices signed in to the account lose access after the reset.
