# Account-Deleted Notice as a Floating Toast — Plan Brief

> Full plan: `context/changes/deletion-banner-fix/plan.md`
> Frame brief: `context/changes/deletion-banner-fix/frame.md`

## What & Why

> The notice on `/` is the only one placed outside its page's layout (above the site header), because the landing's header is buried inside `Welcome` and `index.astro` has no other place to put it.

As a result, after deleting their account the teacher sees the header and hero pushed down. The fix takes the notice out of the flow entirely.

## Starting Point

`src/pages/index.astro` consumes the one-shot `account_deleted` cookie and renders a `role="status"` paragraph in normal flow before `<Welcome />`. The product has no floating notice yet.

## Desired End State

The notice floats as a toast at the bottom-centre of the viewport, in front of the page, with a close button „Zamknij komunikat”. Header and hero sit exactly where they do on a plain `/`. A reload still removes it.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Problem | The notice sits above the header, outside the layout | The code shows it directly; the user named header and hero shifting | Frame |
| Overlay vs. under-header | Overlay | Under the header the hero would still move, which is half the complaint | Plan |
| Position | Fixed, bottom-centre | The bottom of the viewport matters least on the landing; the top would cover „Zaloguj się” | Plan |
| Dismissal | Close button (React island) | A notice that stays until reload must not permanently cover phone content | Plan |
| Lifetime | Until reload, no auto-hide | Narrowing signal from the frame | Frame |
| Scope of pattern | One-off component, no toast system | First and only floating notice; generalise when a second appears | Plan |
| Proof | E2E compares header/h1 y with and without notice, run red first | Lesson: a criterion must be able to fail | Plan |

## Scope

**In scope:** new `AccountDeletedNotice.tsx` island; swap in `index.astro`; extended `account-deletion.spec.ts`.

**Out of scope:** toast library or generic system; auto-hide; cookie/API changes; other pages' notices; a `Welcome.astro` slot; safe-area insets.

## Architecture / Approach

`index.astro` keeps the cookie logic and renders `<AccountDeletedNotice client:load />` after `<Welcome />` only on the consuming request. The island is `position: fixed`, `z-40`, in the `bg-szalwia-soft` / `shadow-panel` tokens, with `role="status"` on the sentence (existing e2e locator still matches) and a lucide `X` button.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Floating toast with e2e proof | No-shift toast with close button, e2e layout + dismissal assertions | Covering hero content on narrow phones |

**Prerequisites:** local Supabase + dev server for e2e; feature branch `fix/deletion-banner`.
**Estimated effort:** one short session.

## Open Risks & Assumptions

- Phone appearance is unverified (frame); the manual 375 px check covers it.
- Focus is lost to `<body>` after closing. Acceptable for a non-modal notice the user tabbed to deliberately.

## Success Criteria (Summary)

- After deletion, the landing's header and hero don't move; the notice floats over the page.
- The teacher can close it; a reload shows nothing.
- The e2e test that proves this failed on the old code and passes on the new.
