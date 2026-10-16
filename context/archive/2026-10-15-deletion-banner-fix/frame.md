# Frame Brief: Account-deleted notice on `/` pushes the landing down

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

After deleting the account, the teacher lands on `/` and the notice „Konto zostało usunięte razem ze wszystkimi planami.” pushes the page's content down.

## Initial Framing (preserved)

- **User's stated cause or approach**: the notice is rendered in the page flow, so it takes up space.
- **User's proposed direction**: show the notice in the foreground, on top of the page, without moving the content behind it.
- **Pre-dispatch narrowing**: what bothers the user is that the notice **pushes the header and the hero down**. It does not matter to them that the page gets longer or that the notice looks out of place. Screen width: **not checked** (desktop vs. phone). How long it stays: **until reload**, as it does today.

## Dimension Map

1. **Where the notice sits in `index.astro`.** It is rendered as a sibling *before* `<Welcome />`, so it lands above everything Welcome draws, including `MarketingHeader`. ← initial framing
2. **The shape of `Welcome`.** The header lives *inside* Welcome (`min-h-screen`, `overflow-hidden`, blobs positioned absolutely from the top). `index.astro` has no slot under the header, so anything it adds can only go above the header.
3. **The notice convention copied from elsewhere.** The `bg-szalwia-soft` `role="status"` style was taken from `/ustawienia`, where the notice sits inside a content column.
4. **Missing pattern.** The app has no floating or overlay notice that this one could reuse.

## Hypothesis Investigation

The surface is two files, so the investigation was done by reading them directly; no sub-agents were spawned.

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| 1. Notice in normal flow above Welcome | `src/pages/index.astro:26-34`: a `div.relative.z-20.pt-4` comes before `<Welcome />`. `z-20` only orders paint; it does not take the notice out of the flow. | STRONG |
| 2. Welcome has no slot under the header | `src/components/Welcome.astro:68-77`: the root `div.relative.min-h-screen.overflow-hidden` contains the blobs, `<MarketingHeader />` and `<main>`. The archived plan foresaw this: "`Welcome.astro` only if the notice must sit inside it" (`context/archive/2026-10-15-account-deletion/plan.md:199`). | STRONG (contributing) |
| 3. Convention mismatch | All other notices sit *inside* their page's content, below its header: `ustawienia.astro:63-67` (in the password card), `plan/month.astro:64-70` (above the month header, inside the content column), `auth/signup.astro:42` (in the form). Only `/` puts the notice above the site header. | STRONG |
| 4. No overlay pattern to reuse | No `fixed` element in `src/components`, `src/layouts` or `src/pages`. There is no toast library, and `src/components/ui/` holds only `button`, `ConfirmDialog`, `dropdown-menu` and `LibBadge`. The only `sticky` uses are panel sidebars. | STRONG (constraint) |

## Narrowing Signals

- The user named "pushes the header and the hero down" as the problem, not the extra page length. So the defect is **where the notice sits relative to the header**, not its height.
- "Until reload": the notice has to stay visible as long as it does today (one render). It must not disappear by itself.
- Step 3 was conclusive, so no further narrowing questions were asked.

## Cross-System Convention

Within this project, a one-shot cookie notice sits inside the content area of its page, under the header. It does not shift the header, because the header is above it. `/` breaks this convention only because its header belongs to `Welcome`, which `index.astro` cannot reach into. No page uses an overlay. The user's "foreground" direction would make this notice the first floating element in the product.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: the notice on `/` is the only one placed outside its page's layout (above the site header), because the landing's header is buried inside `Welcome` and `index.astro` has no other place to put it.

The user's framing is correct: the notice takes up space in the flow. But it is not the whole picture. The notice on `/ustawienia` takes up space in the flow too and nobody minds, because it sits under the header. The plan should therefore treat "above the header" as the defect. "Foreground overlay" is one way to fix it, but it is not the only one, and it adds a pattern the app does not yet have.

## Confidence

**HIGH** for the cause. The code shows it directly and the user's narrowing ("pushes the header and the hero down") matches it.

Not verified: what it looks like on a phone (the user hasn't checked). That is the width where an overlay that stays until reload could cover the hero or its CTA.

## What Changes for /10x-plan

The plan must settle two things before it chooses a technique:

1. **Overlay vs. a place under the header.** Showing the notice on top of the page meets "no shift". So does placing it inside Welcome's layout, below `MarketingHeader`, which follows the convention of the other notices. The user asked for the foreground, so the plan should state why it keeps that direction or drops it.
2. **If it is an overlay:** it stays until reload, so it covers part of the landing for as long as it is shown. The plan must say what it covers on a phone (~375 px), and whether it needs a close button (a new element, with an accessible name in Polish). The e2e test from `account-deletion` checks "notice visible → reload → notice gone", and it must keep passing.

## References

- `src/pages/index.astro:19-34`: cookie read and notice markup
- `src/components/Welcome.astro:68-77`: root container, blobs, header inside
- `src/components/layout/MarketingHeader.astro:26`: `relative z-10` header in flow
- `src/pages/ustawienia.astro:63-67`, `src/pages/plan/month.astro:64-70`, `src/pages/auth/signup.astro:42`: notice convention
- `context/archive/2026-10-15-account-deletion/plan.md:197-203`: original notice contract
- Investigation: inline file reads, no sub-agent tasks (two-file surface)
