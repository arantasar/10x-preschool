# Cennik i zapis na cenę założycielską — Plan Brief

> Full plan: `context/changes/founder-price-signup/plan.md`

## What & Why

S-22 publishes a public `/cennik` page (Darmowy vs Basic, with the comparison table) and a "Zarezerwuj cenę założycielską" form. Since 2026-10-17 the signup isn't a measurement or a gate. It is the list of people who get the founder price (FR-035) and one e-mail when payments start (S-25). The confirmation says plainly that payments don't work yet.

## Starting Point

There's no pricing page and no signup. The contact form (S-19) is a ready template for a public form taking data from people without an account: route → honeypot → zod → Turnstile (`verifyHumanToken`) → insert-only table → pg_cron retention. The design package has `PricingCard`, `BillingToggle`, `PlanComparison` and mockup 07. In a few places it isn't true today (footnote 2 vs FR-037, "pierwszy miesiąc za darmo" vs S-30, the free plan and payments don't exist yet).

## Desired End State

Anyone can open `/cennik` from the header and footer. It reads "Dziś Temio jest bezpłatne", then the plans from 1 February 2027 with prices, the founder price and the table. A visitor gives an e-mail, a signed-in teacher clicks once (the address comes from her session), and both see the honest confirmation. A teacher already on the list sees "Jesteś na liście". The list disappears by itself after 31.08.2027, and the privacy policy (1.4) describes it.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Truth on the page | "Dziś bezpłatne", plans "od 1 lutego 2027" | The date is already a fixed constant (S-30), so every sentence is true today |
| E-mail at signup | None, confirmation on screen only | The mail binding only sends to the owner; the cost (someone else's address) is one e-mail later |
| Duplicate | Unique address, repeat = the same success (`23505` → `ok`) | No way to check who is on the list; one row per person for S-25 |
| Retention | Until 2027-08-31 (pg_cron), withdrawal through contact | Retention lives in code, long enough for FR-035, tied to the start of payments |
| Signed-in teacher | No field, address and `user_id` from the session | Account signups are countable, nothing can be spoofed |
| Billing period | `yearly`/`monthly` saved with the signup | Free signal for S-25 on the default yearly choice |
| Links | MarketingHeader + SiteFooter | Matches the design and the comments waiting for S-22 |
| Regulamin | Unchanged | The signup isn't a contract or a paid service; rewritten with the lawyer at S-25/S-26 |
| "Jesteś na liście" | Narrow `select` on the row with her own address | An honest, stable state without repeat clicks |
| New policy point | 2.8 (claims → 2.9) | 2.6 and 2.7 are cited by an applied migration and CLAUDE.md |

## Scope

**In scope:** `founder_price_signups` table (RLS, pgTAP, cron), `POST /api/founder-price`, `useTurnstile` hook (extracted from `ContactForm`), `src/lib/pricing.ts`, ported billing components, `/cennik` page with the island, Cennik links, Polityka prywatności 1.4, CLAUDE.md, roadmap, E2E spec.

**Out of scope:** e-mails (signup and launch), payments, Pro, Regulamin, links from the account menu / `/ustawienia` / FAQ, self-service withdrawal, the ~100 counter, `PaywallDialog`.

## Architecture / Approach

A copy of the contact form's model with three differences: a unique address with a unique violation treated as success (writes stay insert-only), a narrow `select` for `authenticated` on its own address, and retention as a date tied to the start of payments. RLS closes the direct route: anon only with `user_id null`, authenticated only with its own `user_id` and its own address from the JWT. All prices, dates and table data live in `src/lib/pricing.ts`, tested against "bez limitu", "Pro" and contradictions with FR-037.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Signup table | Migration + pgTAP + supabase-js tests | RLS policy that lets someone else's address through |
| 2. Signup route | Route + contract + `useTurnstile` | Regression in the contact form after extracting the hook |
| 3. Pricing page | `/cennik`, components, island, navigation | A sentence false today; the owner's copy |
| 4. Privacy policy and docs | Policy 1.4, CLAUDE.md, roadmap | Inconsistency between the policy and the page |
| 5. E2E | `founder-price.spec.ts` | Flakiness of local Turnstile |

**Prerequisites:** a feature branch (`git branch --show-current` ≠ `master`), local Supabase (Docker), Turnstile test keys in `.dev.vars`.
**Estimated effort:** ~3–4 sessions across 5 phases.

## Open Risks & Assumptions

- Consent = clicking the button with the sentence beside it (no checkbox). It meets the RODO standard for an affirmative act; the lawyer review at S-25 can ask for a checkbox.
- The date 2027-02-01 is written in three places (S-30 migration, `pricing.ts`, retention cron + policy). A payment delay is one PR changing all of them.
- An anonymous row with someone else's address is accepted (no double opt-in). The cost is one launch e-mail, accepted at this scale.
- The page's Polish copy is the plan's draft. Janusz approves it in the phase 3 manual check.

## Success Criteria (Summary)

- A visitor and a signed-in teacher get from `/cennik` to an honest confirmation, and a repeat changes nothing.
- No sentence on the page is false on the day it goes live ("bez limitu", footnote 2, "pierwszy miesiąc").
- The privacy policy describes the list before the first signup reaches production.
