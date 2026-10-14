# App Header Account Menu Implementation Plan

## Overview

Replace the right-hand side of the signed-in app header — today an avatar-and-address link to `/ustawienia`, a „Pomoc” text link and a visible „Wyloguj się” button — with a single account dropdown, exactly as in the updated design package (mock-up `19-menu-konta.png`): a round avatar with the initial and a chevron opens a menu with „Zalogowano jako <email>”, Ustawienia konta · Pomoc · Kontakt, a divider, and Wyloguj się.

## Current State Analysis

- `src/components/AppHeader.astro` renders logo · main nav · a right-hand group of three: the avatar + e-mail link to `SETTINGS_PATH` (address hidden below 721 px, `aria-current="page"` and sage background when `active === "account"`), `<a href="/pomoc">Pomoc</a>`, and `<form method="POST" action="/api/auth/signout">` with a „Wyloguj się” submit button.
- `src/layouts/PlannerLayout.astro` passes `active: "plan" | "generate" | "account"` to it; `AppHeader` reads the user from `Astro.locals.user`.
- A new design package sits untracked in `temio-design-astro (1)/`. Compared with the synced copy in `context/foundation/design/`, it adds `src/components/layout/AccountMenu.astro`, `design/screens/19-menu-konta.png` and `design/reference/19-menu-konta.html`, changes `AppHeader.astro` (uses `AccountMenu`, takes `email`), the README (new section „Nagłówek aplikacji i menu konta”: no e-mail in the header itself, only in the menu), the header in references/screens 03, 04, 08, 18, 18b, and `SettingsLayout.astro` (logout as a POST form — the project's port already does that).
- The design's `AccountMenu.astro` is an Astro component with a hand-written `<script>`. `src/` contains no Astro `<script>` at all; CLAUDE.md puts anything with click handlers into a React island. shadcn is configured (`components.json`, new-york), `lucide-react` is installed, only `@radix-ui/react-slot` is present so far.
- E2E depends on the current header: `tests/e2e/auth.setup.ts:34` waits for the „Wyloguj się” button, `tests/e2e/password-reset.spec.ts:128` clicks it, `tests/e2e/password-change.spec.ts:76` clicks the „Ustawienia konta” link. `tests/e2e/support/hydration.ts` provides `waitForIslands`.
- CLAUDE.md describes the old header in two places: the „Account settings” bullet (Auth flow) and the „Planner shell” bullet.

## Desired End State

On every signed-in screen the header's right side is one button: avatar with the initial + chevron, accessible name „Menu konta: <email>”. Clicking it (or Enter/Space/↓) opens a menu styled like mock-up 19: avatar + „Zalogowano jako” + address; menu items „Ustawienia konta” (`/ustawienia`), „Pomoc” (`/pomoc`), „Kontakt” (`/kontakt`); a divider; „Wyloguj się”, which POSTs to `/api/auth/signout`. The menu closes on outside click, Esc (focus returns to the button), or picking an item; ↑/↓ move between items. On `/ustawienia` the trigger has the sage background and „Ustawienia konta” carries `aria-current="page"`. No e-mail address and no „Pomoc”/„Wyloguj się” remain directly in the header bar. The design package is synced into `context/foundation/design/` and the untracked copy is gone. All E2E is green, including a new menu spec.

### Key Discoveries:

- Header today: `src/components/AppHeader.astro:51-97`.
- Design component to port (look and behaviour, not code): `temio-design-astro (1)/src/components/layout/AccountMenu.astro`; exact px values in `design/reference/19-menu-konta.html`.
- Prior sync pattern: `context/archive/2026-10-13-password-change/plan.md` Phase 1 — copy over, `diff -rq` empty, delete the untracked folder.
- E2E islands race: `tests/e2e/support/hydration.ts` — the trigger is in the DOM before hydration but does nothing until then.
- `scrollbar-gutter: stable` is already set (`src/styles/global.css:198`), so Radix's scroll lock in modal mode won't shift the header.

## What We're NOT Doing

- No „?” help icon in the header — „Pomoc” lives only in the menu, as designed.
- No change to `MarketingHeader` (public pages, incl. `/pomoc` and `/kontakt` for a signed-in teacher) or `SiteFooter`.
- No change to `SettingsLayout` (its sign-out stays) or to `/api/auth/signout`.
- No no-JS fallback for the menu: before hydration the trigger is inert, as every other island in the planner.
- No renaming of the main nav items or routes; the design's `/generuj`, `/faq`, `/api/auth/logout` defaults are not adopted.
- No display name — the initial comes from the e-mail address.

## Implementation Approach

Install shadcn `dropdown-menu` (Radix) and build a small React island `AccountMenu` that takes the e-mail and whether settings is the current page. Radix provides the menu semantics and keyboard handling the design specifies; we only style it with the project's Tailwind tokens to match mock-up 19. `AppHeader.astro` stays Astro and mounts the island with `client:load`. Then repoint the three E2E dependencies at the menu and add one spec for the menu itself.

## Critical Implementation Details

**Sign-out from inside a portal.** Radix renders menu content in a portal and unmounts it on select, so a `<form>` inside the content is not a reliable submit path. Render the sign-out `<form method="POST" action="/api/auth/signout">` outside the dropdown content (inside the island root, hidden) and have the „Wyloguj się” item's `onSelect` call `requestSubmit()` on it. Keep it a POST — the route rests on `security.checkOrigin`.

**E2E hydration.** Every test that opens the menu must `waitForIslands(page)` first; otherwise the click lands on an un-hydrated button and nothing opens.

## Phase 1: Design sync and account menu

### Overview

Bring the design package into `context/foundation/design/`, add the dropdown primitive, build the island and swap it into the header.

### Changes Required:

#### 1. Design package sync

**Files**: `context/foundation/design/**`, `temio-design-astro (1)/`

**Intent**: Keep one source of truth for the design; the untracked copy must not linger.

**Contract**: Copy the changed and new files listed in Current State Analysis into `context/foundation/design/` so that `diff -rq context/foundation/design "temio-design-astro (1)"` prints nothing, then delete `temio-design-astro (1)/`.

#### 2. Dropdown primitive

**File**: `src/components/ui/dropdown-menu.tsx` (new, via `npx shadcn@latest add dropdown-menu`)

**Intent**: Accessible menu behaviour (roles, focus, arrows, Esc, outside click) without hand-rolled code.

**Contract**: Standard shadcn new-york component; adds `@radix-ui/react-dropdown-menu` to `package.json`. Leave the generated file as is apart from what lint/format require.

> **Addendum (impl-review F2, 2026-10-14):** the current shadcn CLI installs the unified `radix-ui` package (`import { DropdownMenu } from "radix-ui"`), not `@radix-ui/react-dropdown-menu`. That is intended: `radix-ui` is side-effect-free, so unused primitives are tree-shaken. `button.tsx` keeps importing `@radix-ui/react-slot` for now; both styles resolve to one copy of `react-slot` (bumped 1.2.4 → 1.5.0 by this change).

#### 3. Account menu island

**File**: `src/components/account/AccountMenu.tsx` (new)

**Intent**: The avatar trigger and menu from mock-up 19, in the project's tokens (`bg-morela-soft` avatar, `bg-mleko` panel, `border-linia`-coloured ring and dividers, `hover:bg-owies` trigger, `bg-szalwia-soft` when current).

**Contract**: Props `{ email: string; current?: boolean }`. Initial = first character of `email`, `toLocaleUpperCase("pl")`. Trigger: `<button>` ≥ 44 px, `aria-label={`Menu konta: ${email}`}`, avatar 40 px + chevron rotating 180° when open; sage background when `current`. Content aligned to the end, ~300 px wide (`max-w-[calc(100vw-32px)]`), header block „Zalogowano jako” + address (ellipsis, `title={email}`), separator, three link items (`asChild` `<a>`: `SETTINGS_PATH`, `/pomoc`, `/kontakt`) with the design's gear / help / mail icons (lucide equivalents are fine), separator, „Wyloguj się” item with the logout icon (see Critical Implementation Details). „Ustawienia konta” gets `aria-current="page"` when `current`. All items ≥ 44 px, visible `focus-visible` state, Polish copy exactly as in the mock-up.

#### 4. Header

**File**: `src/components/AppHeader.astro`

**Intent**: Replace the three right-hand elements with the island; keep logo and main nav untouched.

**Contract**: Right-hand group becomes `{user?.email && <AccountMenu client:load email={user.email} current={active === "account"} />}`. Remove the avatar link, the „Pomoc” link and the sign-out form, and rewrite the top comment (it now describes the menu, why the address moved into it, and that sign-out lives in the menu).

#### 5. Docs

**Files**: `src/layouts/PlannerLayout.astro` (comment), `CLAUDE.md`

**Intent**: Remove the description of the avatar-and-address link.

**Contract**: PlannerLayout comment: `account` marks the account-menu trigger as current. CLAUDE.md „Account settings” bullet: settings is reached through the account menu in `AppHeader` (`src/components/account/AccountMenu.tsx`), which also holds Pomoc, Kontakt and Wyloguj się. „Planner shell” bullet: `account` marks the account-menu trigger.

### Success Criteria:

#### Automated Verification:

- Design synced and copy removed: `diff -rq context/foundation/design "temio-design-astro (1)"` prints nothing before deletion, and `test ! -e "temio-design-astro (1)"` after
- Header no longer links help or posts sign-out directly (fails on today's header): `! grep -nE 'href="/pomoc"|action="/api/auth/signout"' src/components/AppHeader.astro`
- Island mounted in the header: `grep -n '<AccountMenu client:load' src/components/AppHeader.astro`
- Sign-out POST lives in the island: `grep -n 'action="/api/auth/signout"' src/components/account/AccountMenu.tsx`
- Lint passes: `npm run lint`
- Unit tests pass: `npm test`
- Build passes: `npm run build`

#### Manual Verification:

- At 1440 px the header matches `context/foundation/design/design/screens/19-menu-konta.png` (closed: avatar + chevron, no address; open: panel as in the mock-up)
- Keyboard: Tab to trigger, Enter opens, ↑/↓ move, Esc closes and returns focus; outside click closes
- „Wyloguj się” in the menu signs out and lands on the signed-out page
- On `/ustawienia` the trigger is sage and the menu marks „Ustawienia konta” as current
- At 390 px and 768 px the menu fits on screen and the main nav still wraps below as before

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: E2E

### Overview

Repoint the tests that used the old header and cover the menu itself.

### Changes Required:

#### 1. Existing specs

**Files**: `tests/e2e/auth.setup.ts`, `tests/e2e/password-reset.spec.ts`, `tests/e2e/password-change.spec.ts`

**Intent**: Same behaviour under test, reached through the menu.

**Contract**: `auth.setup`: after `waitForURL("**/plan/month")`, `waitForIslands`, then expect `getByRole("button", { name: `Menu konta: ${teacher.email}` })` visible (update the comment). `password-reset`: open the menu, click `getByRole("menuitem", { name: "Wyloguj się" })`. `password-change`: open the menu, click `getByRole("menuitem", { name: "Ustawienia konta" })`.

#### 2. Menu spec

**File**: `tests/e2e/account-menu.spec.ts` (new)

**Intent**: Guard the only way out of the app and the menu's basic contract.

**Contract**: Follow `/10x-e2e` and `tests/e2e/E2E-RULES.md`. Uses the shared teacher's `storageState` for read-only checks: on `/plan/month` the address is not visible before opening; open → „Zalogowano jako” and the address visible, three link items and „Wyloguj się” present; Esc closes it and focus is back on the trigger; „Pomoc” → `/pomoc`; on `/ustawienia` „Ustawienia konta” has `aria-current="page"`. Sign-out runs in a disposable account with cleared `storageState` (as in `password-reset.spec.ts`), because signing out the shared session would break parallel tests: sign-out → `/plan/month` redirects to `/auth/signin`.

### Success Criteria:

#### Automated Verification:

- New spec passes: `npx playwright test tests/e2e/account-menu.spec.ts`
- Full E2E suite green: `npm run test:e2e`
- Lint passes: `npm run lint`

#### Manual Verification:

- Read the new spec against the five anti-patterns in `/10x-e2e` (no CSS locators, no `waitForTimeout`, own setup/cleanup)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation.

---

## Testing Strategy

### Unit Tests:

- None new: the island has no logic beyond the initial; behaviour belongs to Radix and is covered in E2E.

### Integration Tests:

- `account-menu.spec.ts` as above; the three repointed specs keep covering sign-in, password reset and password change through the menu.

### Manual Testing Steps:

1. Sign in, compare the header with mock-up 19 at 1440 / 768 / 390 px.
2. Operate the menu by keyboard only.
3. Open `/ustawienia` through the menu and check the current marking.
4. Sign out through the menu.

## Performance Considerations

One more `client:load` island on every planner page; React is already shipped there, so the added cost is the Radix dropdown bundle.

## References

- Design: `context/foundation/design/design/screens/19-menu-konta.png`, `design/reference/19-menu-konta.html`, `src/components/layout/AccountMenu.astro`, README „Nagłówek aplikacji i menu konta”
- Previous header change: `context/archive/2026-10-13-password-change/plan.md`
- E2E patterns: `tests/e2e/password-reset.spec.ts`, `tests/e2e/support/hydration.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Design sync and account menu

#### Automated

- [x] 1.1 Design synced and copy removed — 8263b01
- [x] 1.2 Header no longer links help or posts sign-out directly — 8263b01
- [x] 1.3 Island mounted in the header — 8263b01
- [x] 1.4 Sign-out POST lives in the island — 8263b01
- [x] 1.5 Lint passes — 8263b01
- [x] 1.6 Unit tests pass — 8263b01
- [x] 1.7 Build passes — 8263b01

#### Manual

- [x] 1.8 Header matches mock-up 19 at 1440 px — confirmed on production 2026-10-14
- [x] 1.9 Keyboard behaviour and outside click — confirmed on production 2026-10-14
- [x] 1.10 Sign-out from the menu works — confirmed on production 2026-10-14
- [x] 1.11 Current marking on /ustawienia — confirmed on production 2026-10-14
- [x] 1.12 Menu fits at 390 px and 768 px — confirmed on production 2026-10-14

### Phase 2: E2E

#### Automated

- [x] 2.1 New spec passes — 4d70226
- [x] 2.2 Full E2E suite green — 4d70226
- [x] 2.3 Lint passes — 4d70226

#### Manual

- [x] 2.4 New spec reviewed against the five anti-patterns — impl-review 2026-10-14
