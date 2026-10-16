# Account-Deleted Notice as a Floating Toast — Implementation Plan

## Overview

After an account is deleted, `/` shows the one-shot notice „Konto zostało usunięte razem ze wszystkimi planami.” in the normal page flow, above `<Welcome />`. It pushes the site header and the hero down. This plan takes the notice out of the flow: a fixed toast at the bottom of the viewport, in front of the page, with a close button. Header and hero stay exactly where they are without the notice.

## Current State Analysis

- `src/pages/index.astro:20-23` reads and deletes the `account_deleted` cookie (one-shot); `:26-35` renders the notice as a `div.relative.z-20.pt-4` sibling **before** `<Welcome />`. `z-20` orders paint only — the element still takes up space, so `MarketingHeader` (inside Welcome) and the hero move down by its height.
- `src/components/Welcome.astro:68-77` owns the header; `index.astro` has no slot under it (frame, hypothesis 2).
- The product has no floating notice to reuse (frame, hypothesis 4). The only foreground layer is the native `<dialog>` in `ConfirmDialog.tsx` (top layer) and Radix dropdown content at `z-50`.
- The e2e scenario `tests/e2e/account-deletion.spec.ts:171-177` finds the notice as `getByRole("status").filter({ hasText: NOTICE })`, reloads and expects it hidden. It does not check layout.

Frame's reframed problem (authoritative): the notice on `/` is the only one placed outside its page's layout, above the site header. The user chose to keep the "foreground" direction: placing it under the header would still push the hero, which is half of the complaint.

## Desired End State

On `/` right after deletion, the notice floats at the bottom-centre of the viewport, above the content, in the `bg-szalwia-soft` notice palette with a panel shadow. It has a close button „Zamknij komunikat”. The header's and the hero heading's vertical positions are identical with and without the notice. A reload removes it (unchanged one-shot cookie). Closing it removes it from the DOM.

Verify: the extended e2e scenario passes, and the same layout assertions fail against today's `index.astro`.

### Key Discoveries:

- Notice markup to replace: `src/pages/index.astro:26-35`; cookie logic `:18-23` stays as it is.
- Island convention: `client:load` on a React component (`src/pages/ustawienia.astro:69`); icons from `lucide-react`, icon button pattern with Polish `aria-label`, `size-11` hit area and the project's focus ring — `src/components/auth/PasswordToggle.tsx:10-18`.
- Tokens: `--color-szalwia-soft` (`src/styles/global.css:129`), `--shadow-panel` (`:172`), text `text-mech-ciemny`, radius `rounded-input` (current notice).
- E2E helper `waitForIslands` (`tests/e2e/support/hydration.ts:32`) — needed before clicking the close button.
- `MarketingHeader` renders `<header>` outside any landmark, so it is `getByRole("banner")`; the hero heading is `getByRole("heading", { level: 1 })`.

## What We're NOT Doing

- No toast library, no generic toast/notification system — one component for one notice. If a second floating notice appears, generalise then.
- No auto-hide (contradicts "stays until reload").
- No change to the cookie, `ACCOUNT_DELETED_COOKIE_OPTIONS`, or `/api/auth/delete-account`.
- No change to the other notices (`/ustawienia`, `/plan/month`, auth pages) — they sit under their headers and are not affected.
- No `Welcome.astro` slot.
- No safe-area handling: `Layout.astro`'s viewport meta has no `viewport-fit=cover`, so `env(safe-area-inset-bottom)` is 0.

## Implementation Approach

Test-first within one phase: first extend the e2e scenario with layout and dismissal assertions and see the layout ones fail on the current code; then build the island and swap it into `index.astro`.

## Critical Implementation Details

- **DOM order:** render the island **after** `<Welcome />` in `index.astro`. Being `fixed`, its position in the DOM does not affect the layout. Placed last, it keeps the keyboard order logo → navigation → hero form → … → close button, instead of starting the page with an ✕. The live region behaves the same as today: neither placement is announced on page load.
- **Before hydration:** the island is server-rendered (`client:load`), so the notice is visible at once; the close button only works after hydration. That is why the e2e calls `waitForIslands` before clicking it.

## Phase 1: Floating toast with e2e proof

### Overview

Extend the e2e first (red on layout), then replace the in-flow notice with a fixed, dismissible toast island.

### Changes Required:

#### 1. E2E: layout and dismissal assertions

**File**: `tests/e2e/account-deletion.spec.ts`

**Intent**: In the scenario that lands on `/` after deletion (`:171-177`), record the bounding-box `y` of `getByRole("banner")` and of the level-1 heading while the notice is visible, and compare them with the same values after the reload (no notice). They must be equal — this is the "no shift" proof. Then add the dismissal: a fresh deletion is costly, so assert dismissal in the same visit before the reload: `waitForIslands`, click `getByRole("button", { name: "Zamknij komunikat" })`, expect the notice hidden. Then reload and keep the existing "reload → hidden" check (still meaningful: it proves the cookie was consumed, not just the element removed client-side — so after dismissal, assert that the reloaded page has no notice either).

**Contract**: the y positions are read with `boundingBox()` at the same viewport, in the order: visible notice → read positions → close → hidden → reload → read positions → equal → notice still hidden. Before writing the fix, run the spec against the current `index.astro` and confirm the position assertion fails (lesson „Kryterium weryfikacji musi móc nie przejść”). The close-button step will fail too at that point. That is expected, but the run must show the **position** assertion failing, so move the close step after it, or run with the close step temporarily commented out.

#### 2. Toast island

**File**: `src/components/AccountDeletedNotice.tsx` (new)

**Intent**: A small React island holding `open` state. While open, it renders a fixed toast: bottom-centre, 16px side gutters at phone width, `max-w-[560px]`, `bg-szalwia-soft text-mech-ciemny`, `rounded-input`, `shadow-panel`, `z-40` (above page content, below dialogs/dropdowns). Inside: the `role="status"` paragraph with the existing sentence and an icon button (`lucide-react` `X`, `aria-label="Zamknij komunikat"`, the `PasswordToggle` hit-area and focus-ring pattern). Closing returns `null`. A short header comment says why it floats (no shift of the landing's header and hero) and why it is a one-off rather than a toast system.

**Contract**: no props. `role="status"` stays on the element holding the sentence, so the existing locator `getByRole("status").filter({ hasText: NOTICE })` keeps matching. The text is byte-identical to today's.

#### 3. Landing page

**File**: `src/pages/index.astro`

**Intent**: Replace the in-flow `div` with `{accountDeleted && <AccountDeletedNotice client:load />}`, placed after `<Welcome />`. Cookie read/delete stays untouched.

**Contract**: the island is rendered only on the request that consumed the cookie. No other render path ships its JS.

### Success Criteria:

#### Automated Verification:

- Extended e2e position assertion fails against the unchanged `index.astro` (recorded before the fix): `npx playwright test tests/e2e/account-deletion.spec.ts`
- Extended e2e scenario passes after the fix: `npx playwright test tests/e2e/account-deletion.spec.ts`
- The in-flow notice is gone from the landing: `grep -n 'pt-4' src/pages/index.astro` returns nothing, and `grep -n 'AccountDeletedNotice client:load' src/pages/index.astro` returns one line
- Lint passes: `npm run lint`
- Unit tests still pass: `npm test`
- Build passes: `npm run build`

#### Manual Verification:

- Desktop: after deleting a throwaway account, the toast floats at the bottom-centre; header and hero sit where they do on a plain `/`
- Phone (~375 px, DevTools): the toast fits within the 16 px gutters, does not cover the hero form on first view, text wraps cleanly beside the ✕
- Keyboard: Tab reaches „Zamknij komunikat” after the page's own controls; Enter/Space closes it with a visible focus ring
- Reload after deletion shows no toast

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful. Work on a feature branch (`fix/deletion-banner`) — `git branch --show-current` before the first commit.

---

## Testing Strategy

### Unit Tests:

- None. The component has no logic beyond a boolean, and the project has no component-test setup. The behaviour is covered end to end.

### Integration Tests:

- `account-deletion.spec.ts`: notice visible → header/h1 y unchanged vs. no-notice → close hides it → reload shows none.

### Manual Testing Steps:

1. Create a throwaway account, delete it from `/ustawienia#usun-konto`.
2. On `/`, compare the header position with a second tab on a plain `/`.
3. Repeat at 375 px width; check the hero form is uncovered and the toast respects the gutters.
4. Tab to the close button, press Enter; reload and confirm no notice.

## Performance Considerations

The island's JS (React + a few lines) loads only on the one render that shows the notice. The plain landing ships no extra JS.

## References

- Frame: `context/changes/deletion-banner-fix/frame.md`
- Original notice contract: `context/archive/2026-10-15-account-deletion/plan.md:197-203`
- Icon-button pattern: `src/components/auth/PasswordToggle.tsx:10-18`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Floating toast with e2e proof

#### Automated

- [x] 1.1 Extended e2e position assertion fails against the unchanged `index.astro` — f83d15f
- [x] 1.2 Extended e2e scenario passes after the fix — f83d15f
- [x] 1.3 The in-flow notice is gone from the landing (grep checks) — f83d15f
- [x] 1.4 Lint passes — f83d15f
- [x] 1.5 Unit tests still pass — f83d15f
- [x] 1.6 Build passes — f83d15f

#### Manual

- [ ] 1.7 Desktop: toast floats bottom-centre, header and hero unshifted
- [ ] 1.8 Phone (~375 px): toast fits gutters, hero form uncovered, text wraps cleanly
- [ ] 1.9 Keyboard: close button reachable, closes with visible focus ring
- [ ] 1.10 Reload after deletion shows no toast
