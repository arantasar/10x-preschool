# App Header Account Menu — Plan Brief

> Full plan: `context/changes/header-update/plan.md`

## What & Why

The updated design package (mock-up 19) replaces the header's loose account controls with one account dropdown. The header gets calmer, and settings, help, contact and sign-out sit in one predictable place.

## Starting Point

`AppHeader.astro` shows an avatar-and-address link to `/ustawienia`, a „Pomoc” link and a visible „Wyloguj się” button. The new design package lies untracked in `temio-design-astro (1)/`.

## Desired End State

The header's right side is a single avatar + chevron button („Menu konta: <email>”). It opens a menu: „Zalogowano jako <email>”, Ustawienia konta · Pomoc · Kontakt, a divider, Wyloguj się. The menu works by mouse and keyboard and marks settings as current on `/ustawienia`.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Where „Pomoc” goes | Only in the menu, as designed | Follows mock-up 19 with no deviations |
| How to build the dropdown | shadcn DropdownMenu (Radix) React island | Matches CLAUDE.md (React for handlers) and shadcn; accessible behaviour for free |
| E-mail in the header | Removed; shown at the top of the menu and in the button's name | Matches the design; the account is still one click away |
| Current page | Sage trigger + `aria-current` on „Ustawienia konta” on `/ustawienia` | Keeps the S-17 cue in the nav's visual language |
| E2E | Fix 3 specs + new `account-menu.spec.ts` | Sign-out is the way out of the app and needs a guard on its new path |
| Design package | Sync into `context/foundation/design/`, delete the untracked copy | Same pattern as `password-change` |

## Scope

**In scope:** design sync; `dropdown-menu` primitive; `AccountMenu.tsx`; `AppHeader.astro` rewrite; PlannerLayout/CLAUDE.md wording; E2E updates + new spec.

**Out of scope:** a „?” icon; MarketingHeader/SiteFooter; SettingsLayout; no-JS fallback; display names.

## Architecture / Approach

`AppHeader.astro` (Astro) mounts `<AccountMenu client:load email current />`. The island uses Radix DropdownMenu for the menu. Its links are `<a>` menu items. Sign-out submits a hidden POST form that sits outside the portal, via `requestSubmit()` in `onSelect`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Design sync and account menu | New header with dropdown, docs updated | Sign-out form inside Radix portal unmounts before submit — form kept outside |
| 2. E2E | 3 specs repointed, new menu spec | Clicking before hydration — `waitForIslands` first |

**Prerequisites:** feature branch off `master`; local Supabase for E2E.
**Estimated effort:** ~1 session, 2 phases.

## Open Risks & Assumptions

- The menu is inert until hydration (accepted, as for other planner islands).
- On a shared preschool computer the account is no longer visible at a glance, only the initial (accepted with the design).

## Success Criteria (Summary)

- The header matches mock-up 19 at 1440 / 768 / 390 px.
- Settings, help, contact and sign-out all work from the menu, by mouse and keyboard.
- The full E2E suite is green.
