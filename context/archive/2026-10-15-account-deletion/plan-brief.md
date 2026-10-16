# Account Deletion (S-18) — Plan Brief

> Full plan: `context/changes/account-deletion/plan.md`

## What & Why

A teacher can delete her own account and every plan with it (FR-024). It is irreversible and it is the first operation in Temio that acts above RLS, so it needs a proof of intent stronger than a click and an isolation proof on two accounts, not an assumption.

## Starting Point

`day_plans` and `activities` already cascade from `auth.users`; GoTrue's sessions do too. The app has no service-role key — only the anon key — and no `security definer` function yet. `/ustawienia` (S-17) already has the settings shell, a re-sign-in pattern in `change-password`, and `useConfirmDialog` for danger windows.

## Desired End State

`/ustawienia` has a danger card „Usuń konto” and a matching menu item. The teacher types her current password, confirms in a danger window („Usuń konto” / „Zostaw”), and lands on `/` with a one-shot „Konto zostało usunięte…” notice. She cannot sign in, her plans are gone, her other devices are signed out, and nobody else's data is touched.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Where the privilege lives | `public.delete_own_account()` — `security definer`, no arguments, deletes `auth.users where id = auth.uid()` | No new secret in the Worker; the boundary is SQL that pgTAP proves on two accounts. |
| Proof of intent | Current password (re-sign-in with the session's e-mail) + `useConfirmDialog` danger window | An open session on a shared preschool computer must not be enough; reuses S-17's pattern. |
| Design's typed „USUŃ” dialog | Not followed | Password is stronger, and CLAUDE.md routes confirmations through `useConfirmDialog`. |
| Landing after deletion | `/` with a one-shot cookie notice | Same pattern as `password_changed`; visible proof it happened. |
| Rate limit on the password check | None, by explicit decision (revisit at S-25) | Route needs a valid session; change-password already allows the same guessing. |
| Contact messages | Kept (`on delete set null`, 12-month retention) | PRD scope is „konto i plany”; the mail already sits in the owner's inbox; S-20 must describe it. |
| Error slot on `/ustawienia` | `?delete_error=` + `#usun-konto` | `?error=` belongs to the password-change form. |
| Tests | pgTAP + route unit + e2e on two throwaway accounts | Each tier proves what the others cannot: privilege boundary, ordering, real end-to-end. |

## Scope

**In scope:** migration + pgTAP; `POST /api/auth/delete-account`; error code, cookie, confirmation request; danger card, island, menu item; notice on `/`; e2e; CLAUDE.md + roadmap.

**Out of scope:** subscription condition (S-25); deleting contact messages; per-account attempt limit; service-role key; soft delete/undo; goodbye e-mail.

## Architecture / Approach

Island validates → danger window → native POST → route: `signInWithPassword(session e-mail)` → `rpc("delete_own_account")` (cascades plans, activities, sessions) → `signOut({ scope: "local" })` (cookies cleared, error only logged) → `account_deleted` cookie → `/`. Every failure before the RPC succeeds deletes nothing and returns to `/ustawienia?delete_error=…#usun-konto`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Database | The definer function, grants, pgTAP on two accounts, regenerated types | Hosted `postgres` role not allowed to delete from `auth.users` (checked in production in Phase 3) |
| 2. Route and wording | Ordered route, error code, cookie, confirmation request, unit tests | Session cookies surviving the post-deletion `signOut` error |
| 3. UI, e2e, docs | Danger card, menu item, landing notice, two-account e2e, CLAUDE.md/roadmap | E2E cleanup when a run fails midway |

**Prerequisites:** local Supabase stack (Docker); branch `feat/account-deletion` (already current); migration pushed to the hosted project with the merge.
**Estimated effort:** ~2 sessions across 3 phases.

## Open Risks & Assumptions

- Assumes the migration owner can `delete from auth.users` on hosted Supabase; if the production check fails, stop and revisit the service-role alternative — do not grant on the `auth` schema.
- Deleting `auth.users` directly bypasses GoTrue's admin API; relies on GoTrue's FK cascades for identities, sessions and refresh tokens.
- A guesser with a stolen session can try passwords here without limit — accepted, owner S-25.

## Success Criteria (Summary)

- After deletion the teacher cannot sign in, her plans are gone, and another device loses access on its next request.
- Another account's plans are untouched — proved by pgTAP and by e2e.
- A wrong password, „Zostaw”, or a failed RPC deletes nothing.
