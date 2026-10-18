# Cennik i zapis na cenę założycielską — Implementation Plan

## Overview

S-22 (`founder-price-signup`, FR-028, FR-029, US-05). Public `/cennik` page showing the Darmowy and Basic plans with prices and the comparison table, plus a "Zarezerwuj cenę założycielską" form that stores an e-mail on a list and confirms honestly: payments don't work yet, you're on the list, you'll get a message. Since 2026-10-17 this is no longer a gate or a measurement. It is the list of people who get the founder price (FR-035) and one e-mail when payments start. S-25 reads it.

## Current State Analysis

- There is no pricing page and no signup. `MarketingHeader.astro` (Pomoc, Kontakt) and `SiteFooter.astro` both carry the comment "Cennik joins with S-22".
- The contact form (S-19) is the template for a public form taking data from people without an account: `src/pages/api/contact.ts` runs parse → honeypot (answers like success) → zod → config → `verifyHumanToken` → insert without `.select()` → `{ ok }`; the contract (schema, error codes, Polish sentences) lives in `src/lib/contact-form.ts`; the table `public.contact_messages` is insert-only for `anon`/`authenticated` with a pg_cron retention job (`supabase/migrations/20261009120000_contact_messages.sql`), covered by pgTAP (`supabase/tests/database/contact_messages.test.sql`) and API tests (`src/pages/api/contact.db.test.ts`, `contact.test.ts`).
- `verifyHumanToken` (`src/lib/services/bot-check.ts:5`) already names S-22 as its second caller, with its own `action`.
- The Turnstile lifecycle (script loading, explicit render, `interaction-only`, waiting for the token, widget failure) sits inline in `src/components/contact/ContactForm.tsx:20-130`. The second form needs the same thing.
- The design package has `context/foundation/design/src/components/billing/{PricingCard,BillingToggle,PlanComparison}.astro` and the mockup `design/screens/07-cennik.png`/`07b`. These are plain CSS with design tokens. The app's components are written in Tailwind with tokens from `src/styles` (e.g. `text-las`, `bg-szalwia-soft` in `MarketingHeader.astro`).
- **Mockup vs truth today** (PRD v3 §Business Logic: "każdy wiersz musi być prawdziwy w dniu publikacji cennika"):
  - footnote 2 "poprawki liczą się do puli dni" contradicts FR-037 (2026-10-17: a refinement does not use up days);
  - the hero "Pierwszy miesiąc z pełnym Basic za darmo" — since S-30 an account created before payments has access until at least 31.01.2027;
  - the 5-day free plan (S-27) and payments (S-25/S-26) don't exist yet;
  - the Regulamin says "Temio jest bezpłatne" (§ 3 ust. 2), and `/ustawienia` says "Wszystkie funkcje Temio są dziś bezpłatne" (`src/pages/ustawienia.astro:67`). Both stay true and the page must not contradict them.
- Privacy policy 1.3 (`src/content/legal/polityka-prywatnosci.md`, version in `src/lib/legal.ts`): covers the contact form as the only route for e-mails from people without an account, and says "Nie wysyłamy newslettera ani wiadomości reklamowych" (pkt 2.4). The roadmap (S-20 §Ślad, Open Roadmap Questions #6) assigns S-22 the job of adding its own section.

## Desired End State

- `/cennik` is public and indexable, linked from the public header (first item, "Cennik") and the footer. It says plainly that Temio is free today and that the plans below apply from 1 February 2027. It shows the cards Darmowy and Basic with a Rocznie/Miesięcznie toggle (Rocznie by default), the founder price, the comparison table with footnotes (none of them false today), short questions and answers, and the form.
- A visitor without an account gives an e-mail, passes the invisible Turnstile and sees the confirmation. A signed-in teacher doesn't type an address: one button saves the address of her session together with `user_id`. If she is already on the list (with that address), she sees "Jesteś na liście" instead of the button on page entry.
- A repeated signup of the same address answers the same success and changes nothing.
- The row records the billing period the person was looking at (`yearly` | `monthly`).
- After 2027-08-31 (Europe/Warsaw) pg_cron deletes the list. Moving that date is a new migration.
- Privacy policy 1.4 describes the signup: data, purpose, basis (consent), withdrawal, retention, Turnstile, what happens after account deletion.
- Verification: `npm test`, `npm run test:db`, `npm run test:db:api`, `npm run lint`, `npm run build`, the E2E spec `founder-price.spec.ts` plus the specs that visit pages with `MarketingHeader`.

### Key Discoveries:

- `src/pages/api/contact.ts:21-131` — the pipeline to copy, including the size limit, the honeypot before zod, `testingKey` logged on the canonical host, and `waitUntil` (not needed here: no mail).
- `src/lib/contact-form.ts` — the pattern "contract shared by route and island": schema, `…ErrorCode` codes, `…ErrorMessage(code)` with a fallback, field bounds mirrored by `check` in the migration.
- `supabase/migrations/20261009120000_contact_messages.sql` — the header comment style, `revoke all … grant insert`, policies per role, `cron.schedule`, a rollback note.
- `src/lib/services/bot-check.ts:25` — `action: string`; S-22 passes `"founder_price"`.
- `src/components/layout/MarketingHeader.astro:13` — `active?: "pomoc" | "kontakt"`; it gets `"cennik"`.
- `src/content/legal/polityka-prywatnosci.md` — pkt 2.4 (newsletter sentence), 2.5 (contact form as the pattern), 2.6 (Turnstile in security), 7 (Turnstile only "na stronie formularza kontaktowego"), 8 (what is left after deletion), summary at the top.
- `supabase/migrations/20261018160000_trial_until_launch.sql` — the 2027-01-31 constant and the rule "przesunięcie daty = nowa migracja". The page's payment start date (2027-02-01) depends on it.

## What We're NOT Doing

- No e-mail at signup (no double opt-in, no "you're signed up" mail). The launch e-mail is S-25.
- No payments, no simulated checkout, no Pro on the pricing page (FR-028).
- We don't change the Regulamin (rewritten with the lawyer at S-25/S-26) or the `/ustawienia` card (the sentence about everything being free stays true).
- We don't link the pricing page from the account menu, `/ustawienia` or FAQ (`/pomoc`). `faq.ts` keeps the rule "nothing about prices until they exist".
- No "Wypisz się" link or self-service withdrawal: consent is withdrawn through the contact form or e-mail, and the owner deletes the row in the SQL Editor.
- No counter for "~100 osób" (FR-035) and no attaching `user_id` to an earlier anonymous row with the same address. S-25 matches by e-mail.
- We don't port `PaywallDialog` (belongs to S-27).

## Implementation Approach

A direct copy of the contact form's model with three differences: (1) uniqueness on the address and `23505` treated as success, so the table stays insert-only for writes; (2) a narrow `select` for `authenticated` only on the row with her own address, for the "Jesteś na liście" state; (3) retention as a fixed date tied to the start of payments, not a period from signup. Every price and date the page prints lives in one module, `src/lib/pricing.ts`. The page's wording points to it rather than repeating numbers, and its tests check that no false sentence slips in.

## Critical Implementation Details

**Duplicate without upsert.** A plain `insert` without `.select()`. The route treats a unique violation (`error.code === "23505"`) as success. Don't use `upsert({ ignoreDuplicates })`: PostgREST then needs `on_conflict` on a column and, under RLS, may need more than insert. A plain insert keeps "insert-only for writes" and is easy to prove with a test.

**Address normalised before the database.** zod does `trim().toLowerCase()`, and the migration enforces `check (email = lower(btrim(email)))` with a `unique (email)` constraint. Otherwise `Ania@x.pl` and `ania@x.pl` are two people, and the RLS policy comparing against `auth.jwt()->>'email'` fails for an address written with capitals.

**Signed-in teacher: the address only from the session.** The route ignores `email` from the body when `context.locals.user` exists, and inserts `user.email` (lowercased) and `user.id`. The `authenticated` policy closes the direct route: `with check (user_id = (select auth.uid()) and email = lower((select auth.jwt() ->> 'email')))`. An authenticated user doesn't insert anonymous rows (otherwise she could sign up any address without Turnstile, in her own name). Anon: `with check (user_id is null)`.

**The payment start date has two places.** `PAYMENTS_START_ON = "2027-02-01"` in `src/lib/pricing.ts` must equal the S-30 constant + 1 day (`start_trial_entitlement`, 2027-01-31), and `FOUNDER_LIST_RETENTION_UNTIL = "2027-08-31"` must equal the date in the cron job. The comment in both places names the other. A delay means: a new migration (S-30 + retention) and a change to `pricing.ts` in the same PR.

## Phase 1: Tabela zapisów

### Overview

The list's storage with an access contract and retention, proven by pgTAP and API tests before any code uses it.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261019120000_founder_price_signups.sql`

**Intent**: Create `public.founder_price_signups`: the list of people who reserved the founder price, insert-only for writes, readable only as "your own row" by a signed-in teacher, deleted after 2027-08-31.

**Contract**:

- Columns: `id uuid pk default gen_random_uuid()`, `created_at timestamptz not null default now()`, `email text not null` (`check char_length between 3 and 254`, `check email = lower(btrim(email))`, `unique`), `user_id uuid null references auth.users(id) on delete set null` (the signup is consent tied to the address, not account data — same as `contact_messages`), `period text not null check (period in ('yearly','monthly'))`.
- `enable row level security`; `revoke all … from anon, authenticated`; `grant insert … to anon, authenticated`; `grant select … to authenticated`.
- Policies: insert `anon` — `user_id is null`; insert `authenticated` — `user_id = (select auth.uid()) and email = lower((select auth.jwt() ->> 'email'))`; select `authenticated` — `email = lower((select auth.jwt() ->> 'email'))`. No update/delete.
- Index on `created_at` isn't needed (the retention predicate doesn't look at rows). The cron job `founder-price-signups-retention`, daily: `delete from public.founder_price_signups where (now() at time zone 'Europe/Warsaw')::date > date '2027-08-31'`.
- Header comment in the `contact_messages` style: the purpose, insert-only, why `select` exists and why it is so narrow, why an authenticated user doesn't insert anonymously, that Turnstile lives in the route (and `SUPABASE_KEY` is server-only — the same warning), that the retention date is tied to the start of payments (S-30) and moving it is a new migration, rollback (`cron.unschedule` before `drop table`). No real addresses in the file (the repository is public).

#### 2. pgTAP

**File**: `supabase/tests/database/founder_price_signups.test.sql`

**Intent**: Prove the access contract the way `contact_messages.test.sql` does.

**Contract**: covers at least: the check constraints (capitals, spaces, unknown `period`); `unique` on the address; anon inserts with `user_id null` and is refused with `user_id` set; anon reads nothing; authenticated inserts its own row with its own address, is refused with someone else's `user_id`, with someone else's address and with `user_id null`; authenticated sees only the row with its own address (including one added anonymously earlier) and not someone else's; update and delete fail for both roles; the cron job exists with the expected name and command.

#### 3. Testy API (Supabase lokalnie)

**File**: `src/lib/founder-price.db.test.ts` (or next to the route in phase 2 — the `contact.db.test.ts` pattern)

**Intent**: Prove through supabase-js what the route relies on: an insert without `.select()` passes for anon, a repeat returns `23505`, and a signed-in teacher reads her own row and not someone else's.

**Contract**: run by `npm run test:db:api`; unique addresses with a timestamp suffix, cleanup through the service role as in existing `.db.test.ts` files.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly from scratch: `npx supabase db reset`
- pgTAP passes, including the new file: `npm run test:db`
- API tests pass: `npm run test:db:api`
- The `authenticated` policy is proven able to fail: the pgTAP case "someone else's address" is red after temporarily removing the `email = …` condition (checked once while writing the test, noted in the commit message)

#### Manual Verification:

- The migration's header comment reads as a contract (purpose, access, retention, rollback) and contains no real address

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Trasa zapisu

### Overview

`POST /api/founder-price` with a contract shared with the island, and the Turnstile lifecycle extracted from the contact form into a hook.

### Changes Required:

#### 1. Kontrakt zapisu

**File**: `src/lib/founder-price.ts` (+ `founder-price.test.ts`)

**Intent**: One source for the payload, the error codes and their Polish sentences — like `contact-form.ts`.

**Contract**:

- `founderPricePayloadSchema`: `email` optional at the schema level (required by the route only without a session) — `trim().toLowerCase().max(254).pipe(z.email())`; `period: z.enum(["yearly","monthly"])`; `website` (honeypot), `turnstileToken` optional.
- `FounderPriceErrorCode = "validation_failed" | "bot_check_failed" | "bot_check_unavailable" | "config_missing" | "save_failed"`; `founderPriceErrorMessage(code)` with a fallback; `FOUNDER_PRICE_WIDGET_FAILED_MESSAGE` with `SUPPORT_EMAIL`.
- `FOUNDER_PRICE_BOT_ACTION = "founder_price"` — used by the route and the island.
- Bounds mirror the migration's `check` constraints; the comment names the migration.

#### 2. Trasa

**File**: `src/pages/api/founder-price.ts` (+ `founder-price.test.ts`)

**Intent**: Save the signup in the order parse → honeypot → zod → address (from the session or from the form) → config → bot check → insert → `{ ok }`, and answer with codes, never sentences.

**Contract**:

- `export const prerender = false`; body cap of 4 KB (413 → `validation_failed`); the honeypot answers `{ ok: true }` and logs `founder_price.honeypot`.
- Address: with `locals.user` — `user.email` lowercased and `user_id = user.id`, `email` from the body ignored; without a user — `email` from the body required (missing → 400 `validation_failed`).
- `verifyHumanToken(…, { action: FOUNDER_PRICE_BOT_ACTION, hostname, remoteIp, secret })`; `unavailable` → 503, otherwise 403; `testingKey` on the canonical host → `founder_price.bot_check_testing_key`.
- `insert` without `.select()`; `error.code === "23505"` → `{ ok: true }` (log `founder_price.duplicate`, without the address); any other error → 500 `save_failed` + `founder_price.save_failed`.
- No e-mail is sent. Logs never contain the address.
- Route tests (mocked like `contact.test.ts`): honeypot, invalid body, oversized body, missing address without a session, session address over the body address, both bot-check outcomes, duplicate = success, save error, config missing.

#### 3. Hook Turnstile

**File**: `src/components/hooks/useTurnstile.ts`; changes in `src/components/contact/ContactForm.tsx`

**Intent**: Move the script loading, explicit render (`interaction-only`, `pl`, `light`, `flexible`), waiting for the token (`TOKEN_WAIT_MS`), reset after sending and the "widget failed" state out of `ContactForm` into a hook taking `siteKey` and `action`, so the second form doesn't copy ~100 lines.

**Contract**: `useTurnstile({ siteKey, action }) → { containerRef, tokenFor(): Promise<string | undefined>, reset(), widgetFailed }` (names up to the implementer, but behaviour identical to today's — contact form behaviour doesn't change). `ContactForm` passes `action: "contact"`.

### Success Criteria:

#### Automated Verification:

- Unit and route tests pass: `npm test`
- Lint and types: `npm run lint`
- Build: `npm run build`
- The contact form works as before: `npx playwright test tests/e2e/help-and-contact.spec.ts`

#### Manual Verification:

- Locally (Turnstile test keys) the contact form still sends a message and shows the post-send state

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Strona cennika

### Overview

`/cennik` with the cards, the toggle, the table, questions and the form; Cennik links in the header and footer.

### Changes Required:

#### 1. Ceny i daty w jednym miejscu

**File**: `src/lib/pricing.ts` (+ `pricing.test.ts`)

**Intent**: Every number and date the page prints, plus the comparison table data — so the wording isn't scattered and can be tested.

**Contract**:

- `PAYMENTS_START_ON = "2027-02-01"` (comment: = the S-30 constant + 1 day, moves with a migration), `FOUNDER_LIST_RETENTION_UNTIL = "2027-08-31"` (= the cron date from phase 1).
- Prices: Basic 159 zł/rok (default) and 19,99 zł/mies.; founder price 119 zł/rok and 14,99 zł/mies.; the yearly note "ok. 13,25 zł miesięcznie" (159/12 = 13,25).
- Table data (`PLAN_COMPARISON`: groups, rows, footnotes) = the PRD v3 table, with fixes: the refinement row is ✓ on both sides with the footnote "Poprawka aktywności poleceniem nie zużywa dni z puli" (FR-037); footnote 1 on fair use; footnote 3 on BLIK/przelew; the row "Pierwszy miesiąc od rejestracji" stays (it describes the rules from `PAYMENTS_START_ON`, which the section heading says).
- Tests: no text in the data contains "bez limitu" or "Pro"; the refinement row doesn't say "liczy się do puli"; `PAYMENTS_START_ON` formatted by `formatLegalDate` gives "1 lutego 2027".

#### 2. Komponenty cennika

**Files**: `src/components/billing/PricingCard.astro`, `BillingToggle.astro`, `PlanComparison.astro`

**Intent**: Port the design package to the app's conventions (Tailwind + tokens, `cn()`), keeping semantics and accessibility: a real `<table>` with `scope`, ✓ with `aria-label="tak"`, "nie dotyczy" for the dash, cards from 640 px down, 44 px targets, the toggle as radio inputs.

**Contract**:

- `BillingToggle` — Astro with a small inline script swapping `data-price-monthly`/`data-price-yearly` (as in the design). `name="billing"`, default `yearly`.
- `PricingCard` — `cta` optional (a signed-in teacher has no "Załóż konto" on the Darmowy card); `founder` as in the design.
- `PlanComparison` takes data from `PLAN_COMPARISON`; `set:html` only on data from our module (no user input).

#### 3. Wyspa formularza

**File**: `src/components/billing/FounderPriceForm.tsx`

**Intent**: The reservation form: for a visitor, an e-mail field + button; for a signed-in teacher, the button alone with her address in the text; the confirmation after success; "Jesteś na liście" when the server says she already is.

**Contract**:

- Props: `siteKey?: string`, `accountEmail?: string` (signed in), `alreadyListed: boolean`.
- At send it reads the period from the checked `input[name="billing"]` (default `yearly`), uses `useTurnstile({ action: FOUNDER_PRICE_BOT_ACTION })`, sends `{ email?, period, website, turnstileToken }`, translates codes with `founderPriceErrorMessage`.
- Consent sentence directly at the button (the button is the consent): "Zapisując się, zgadzasz się, żebyśmy napisali na ten adres w sprawie ceny założycielskiej i startu płatności. Zgodę wycofasz w każdej chwili, pisząc do nas." + link to Polityka prywatności (the new point).
- Confirmation (`role="status"`, focus moved to it): "Gotowe — {adres} jest na liście." / "Płatności jeszcze nie działają, więc nic dziś nie płacisz. Napiszemy, gdy ruszą — cena założycielska będzie na Ciebie czekać." The wording avoids grammatical gender.
- "Jesteś na liście" state: the same text without the button.
- Polish copy is the draft of this plan — the owner approves it in the manual check (3.x).

#### 4. Strona

**File**: `src/pages/cennik.astro`

**Intent**: Assemble the page as in mockup 07 with the truth corrections, and resolve server-side whether a signed-in teacher is already on the list.

**Contract**:

- Public, indexable (`Layout` with `title="Cennik"` and a description), `MarketingHeader active="cennik"`, `SiteFooter`, `TURNSTILE_SITE_KEY` passed like in `kontakt.astro`.
- Hero (draft): eyebrow "Cennik"; H1 "Dziś Temio jest bezpłatne."; lead: "Płatności ruszą {1 lutego 2027}. Od tego dnia wybierzesz plan Darmowy albo Basic. Konto założone wcześniej ma pełny dostęp co najmniej do 31 stycznia 2027." — the date from `pricing.ts`. "Co najmniej" is true for every S-30 account (`greatest(+1 miesiąc, 2027-01-31)`).
- Heading above the cards/table: "Plany od {1 lutego 2027}".
- Darmowy card: CTA "Załóż konto" → `/auth/signup` only without a session. Basic card: `founder`, CTA "Zarezerwuj cenę założycielską" → `#zapis`.
- The `#zapis` section with the island (`client:load`).
- "Pytania o cennik" (draft, `FaqItem`): "Czy dziś coś płacę?" (nie — Temio jest bezpłatne do startu płatności; zapis niczego nie kosztuje i do niczego nie zobowiązuje); "Co daje zapis na cenę założycielską?" (cena 119 zł za rok albo 14,99 zł miesięcznie przy subskrypcji, na zawsze, dopóki subskrypcja trwa bez przerwy; jedna wiadomość, gdy ruszą płatności); "Czy cena założycielska obejmuje BLIK i przelew?" (nie — dostęp jednorazowy jest po cenie z cennika, FR-035, Open Roadmap Questions #14).
- Signed in: `locals.supabase.from("founder_price_signups").select("id").limit(1).maybeSingle()` (the policy narrows it to her own address); a read error = `alreadyListed: false` + log `founder_price.read_failed` (the page never breaks because of the list).

#### 5. Nawigacja

**Files**: `src/components/layout/MarketingHeader.astro`, `src/components/layout/SiteFooter.astro`

**Intent**: "Cennik" as the first item in the public header (`active: "cennik"`) and in the footer; remove the "joins with S-22" comments.

**Contract**: `active?: "cennik" | "pomoc" | "kontakt"`. In the header, from `sm` up like the others; the footer covers phones.

#### 6. Inwentarz E2E (lessons: "Zmiana renderu strony wymaga inwentarza specs E2E")

**Intent**: Before committing, list the specs visiting pages with `MarketingHeader`/`SiteFooter` (`grep -ln "pomoc\|kontakt\|regulamin\|polityka-prywatnosci\|getByRole(\"link\"" tests/e2e/*.spec.ts`), check that none counts header/footer links or would change because of a new first link, and add them to the run below.

### Success Criteria:

#### Automated Verification:

- Unit tests (including `pricing.test.ts`): `npm test`
- Lint and build: `npm run lint && npm run build`
- No "bez limitu" on the page or in the components — a gate that can fail: `grep -rn "bez limitu" src/pages/cennik.astro src/components/billing src/lib/pricing.ts` returns nothing (checked red by temporarily adding the phrase to the data)
- Specs from the inventory pass: `npx playwright test tests/e2e/help-and-contact.spec.ts tests/e2e/legal-pages.spec.ts` (+ whatever the inventory adds)

#### Manual Verification:

- The owner approves the page's Polish copy (hero, card headings, table footnotes, questions, consent sentence, confirmation, "Jesteś na liście")
- `/cennik` at 390, 768 and 1440 px matches mockup 07 (with the truth corrections); the toggle swaps prices on the cards; the table becomes cards ≤ 640 px
- Anonymous signup → confirmation; again with the same address (in capitals) → the same confirmation, one row in the database
- Signed-in teacher: no e-mail field, a click → confirmation; reload → "Jesteś na liście"
- Keyboard: toggle, CTA, form and confirmation reachable, focus visible, the confirmation announced

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Polityka prywatności i dokumentacja

### Overview

The policy covers the signup before it goes out (same merge). The repo documentation and the roadmap record the new route and table.

### Changes Required:

#### 1. Polityka prywatności 1.4

**Files**: `src/content/legal/polityka-prywatnosci.md`, `src/lib/legal.ts`

**Intent**: Describe the list honestly and add the fact to the points that are no longer complete.

**Contract**:

- New point **2.8. Zapis na cenę założycielską**; the current 2.8 (claims) becomes 2.9. Points 2.6 (security) and 2.7 (generation limit) keep their numbers, because the applied migration `20261017120000_auth_flow_state_retention.sql` and CLAUDE.md (Fair use, Plan state) cite them — renumbering would break references we can't fix in an applied migration. Content: **Dane:** adres e-mail, wybrany na cenniku okres rozliczenia (rok albo miesiąc — informacja, nie zobowiązanie), data zapisu, a jeśli zapisujesz się zalogowany — powiązanie z Kontem. **Cel:** wiadomość, gdy ruszą płatności, i przyznanie ceny założycielskiej. **Podstawa:** zgoda (art. 6 ust. 1 lit. a RODO), wyrażona kliknięciem przycisku zapisu. **Wycofanie:** w każdej chwili, przez formularz kontaktowy albo e-mail — usuwamy zapis. **Jak długo:** do 31 sierpnia 2027 — usuwamy automatycznie (the date from `FOUNDER_LIST_RETENTION_UNTIL`). **Usunięcie Konta:** the signup stays until withdrawal or the end of the period, without the account link. Turnstile protects the form.
- 2.4: the sentence "Nie wysyłamy newslettera ani wiadomości reklamowych" gets the exception: "…poza wiadomością o starcie płatności do osób zapisanych na cenę założycielską (pkt 2.8)".
- Summary at the top: a bullet about the list (one sentence: what, until when).
- 2.6 (security) and pkt 7 (cookies): Turnstile also on the pricing page.
- pkt 6: without an address you can't sign up for the list.
- pkt 8: the signup stays without the account link until withdrawal or 31.08.2027.
- `PRIVACY_VERSION = "1.4"`, `PRIVACY_PUBLISHED_ON` = the merge day.
- `src/lib/legal.test.ts` — update if it pins the version.

#### 2. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: A new section "Founder-price list" under Architecture (route, table, the insert-only + narrow select contract, `23505` = success, the address from the session, retention 2027-08-31 and its tie to S-30, `db push` with the merge); update the "Public help and contact" section (`verifyHumanToken` — S-22 now calls it with `founder_price`, not "will call").

#### 3. Roadmap i change

**Files**: `context/foundation/roadmap.md`, `context/changes/founder-price-signup/change.md`

**Intent**: S-22 `in progress` → `done` at closing (the table row and `### S-22`), with a note that the pricing table is published with dates and the mockup's footnote 2 was corrected under FR-037.

### Success Criteria:

#### Automated Verification:

- Tests (`legal.test.ts`, everything else): `npm test`
- Numbering of cited points untouched: `grep -n "^### 2\.[67]\." src/content/legal/polityka-prywatnosci.md` shows "2.6. Bezpieczeństwo…" and "2.7. Limit generowania", and `grep -n "^### 2\.8\. Zapis na cenę" src/content/legal/polityka-prywatnosci.md` finds the new point (both gates checked on the pre-change file: the second is red)
- Build: `npm run build`
- Policy E2E: `npx playwright test tests/e2e/legal-pages.spec.ts`

#### Manual Verification:

- The owner reads the new point 2.8 and the changed sentences in the context of the whole policy — true and consistent with the page
- The link from the form's consent sentence leads to the right point of the policy

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: E2E

### Overview

One Playwright spec for the risk "the signup has to work and say the truth", driven with `/10x-e2e`.

### Changes Required:

#### 1. Spec

**File**: `tests/e2e/founder-price.spec.ts`

**Intent**: Pricing page → reservation → confirmation, anonymously and signed in, with the repeat state.

**Contract**: per `tests/e2e/E2E-RULES.md`: `getByRole`/`getByLabel`/`getByText` locators, no `waitForTimeout`, a unique address with a timestamp suffix, cleanup of rows through the service role. Scenarios: (a) anonymous — "Cennik" from the header, the "Dziś Temio jest bezpłatne" heading visible, the Miesięcznie toggle changes the Basic price to "19,99 zł", e-mail → confirmation with the address and "Płatności jeszcze nie działają"; (b) signed in — no e-mail field, click → confirmation, reload → "Jesteś na liście". Local Turnstile test keys.

### Success Criteria:

#### Automated Verification:

- The spec passes three times in a row: `npx playwright test tests/e2e/founder-price.spec.ts --repeat-each=3`
- The whole E2E suite green before merging: `npm run test:e2e`

#### Manual Verification:

- After merging: `npx supabase db push` on the hosted project, then one anonymous signup on `https://temio.pl/cennik` with your own address, the row checked in the dashboard and deleted by hand

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `founder-price.ts` — normalising the address (capitals, spaces), `period` limited to two values, unknown code → fallback.
- `pricing.ts` — no "bez limitu"/"Pro", the refinement row consistent with FR-037, the date "1 lutego 2027", the yearly note 13,25 zł.
- The route — the whole order of the pipeline and every answer, the session address over the body address, `23505` = success, no address in logs.

### Integration Tests:

- pgTAP: the access contract and retention (phase 1).
- supabase-js against local Supabase: insert without `.select()`, duplicate, reading your own row (phase 1).

### Manual Testing Steps:

1. Anonymous signup at 390 px with the address `Test+Ania@Example.com` → confirmation; in the database `test+ania@example.com`, `period` matches the toggle.
2. The same signup again → the same confirmation, no second row.
3. Sign in → `/cennik`: no field, button; click → confirmation; reload → "Jesteś na liście".
4. A teacher who signed up anonymously earlier with the same address, after signing in → "Jesteś na liście".
5. Turnstile blocked in the browser → the message with the address kontakt@temio.pl, no button that can't succeed.

## Performance Considerations

None beyond the norm: the page is SSR with one tiny query (only for a signed-in teacher), the list is at most hundreds of rows.

## Migration Notes

- `npx supabase db push` must go out with the merge (merging to `master` deploys). Without the push the route answers `save_failed` and the page stays readable — the signed-in teacher's query error goes to `alreadyListed: false`.
- Payments delayed past 2027-02-01: a new migration moves the S-30 constant **and** the date in `founder-price-signups-retention`, and in the same PR `PAYMENTS_START_ON` / `FOUNDER_LIST_RETENTION_UNTIL` in `pricing.ts` and the date in policy pkt 2.8 (a new policy version).
- Who closes the list: S-25 (sends the launch mail, reads the list for FR-035, decides whether the form stays after payments start). This is the owner of the deferred cleanup required by the lesson "Odroczone sprzątanie danych musi mieć właściciela"; the cron is the code-level safety net.

## References

- Roadmap: `context/foundation/roadmap.md` §S-22, Open Roadmap Questions #6, #14
- PRD: `context/foundation/prd-v3.md` FR-028, FR-029, FR-035, FR-037, US-05, §Business Logic "Plany — co widzi nauczycielka na cenniku", §Access Control "Fake door", §Warunki jakościowe
- Similar implementation: `src/pages/api/contact.ts:31`, `src/lib/contact-form.ts`, `supabase/migrations/20261009120000_contact_messages.sql`
- Design: `context/foundation/design/src/components/billing/*`, `design/screens/07-cennik.png`, `design/README.md:146`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Tabela zapisów

#### Automated

- [x] 1.1 Migration applies cleanly from scratch: `npx supabase db reset` — 2a21165
- [x] 1.2 pgTAP passes, including the new file: `npm run test:db` — 2a21165
- [x] 1.3 API tests pass: `npm run test:db:api` — 2a21165
- [x] 1.4 The `authenticated` policy is proven able to fail (case "someone else's address" red without the `email = …` condition) — 2a21165

#### Manual

- [ ] 1.5 The migration's header comment reads as a contract and contains no real address

### Phase 2: Trasa zapisu

#### Automated

- [x] 2.1 Unit and route tests pass: `npm test` — 5cb8efa
- [x] 2.2 Lint and types: `npm run lint` — 5cb8efa
- [x] 2.3 Build: `npm run build` — 5cb8efa
- [x] 2.4 The contact form works as before: `npx playwright test tests/e2e/help-and-contact.spec.ts` — 5cb8efa

#### Manual

- [ ] 2.5 Locally the contact form still sends a message and shows the post-send state

### Phase 3: Strona cennika

#### Automated

- [x] 3.1 Unit tests (including `pricing.test.ts`): `npm test` — 0251637
- [x] 3.2 Lint and build: `npm run lint && npm run build` — 0251637
- [x] 3.3 No "bez limitu" on the page or in the components (gate checked red) — 0251637
- [x] 3.4 Specs from the inventory pass — 0251637

#### Manual

- [ ] 3.5 The owner approves the page's Polish copy
- [ ] 3.6 `/cennik` at 390, 768 and 1440 px matches the mockup with the truth corrections
- [ ] 3.7 Anonymous signup and a repeat with the same address → one row
- [ ] 3.8 Signed-in teacher: one click → confirmation; reload → "Jesteś na liście"
- [ ] 3.9 Keyboard and screen-reader announcement of the confirmation

### Phase 4: Polityka prywatności i dokumentacja

#### Automated

- [x] 4.1 Tests: `npm test` — 21fea93
- [x] 4.2 Numbering of cited points 2.6/2.7 untouched, new point 2.8 present — 21fea93
- [x] 4.3 Build: `npm run build` — 21fea93
- [x] 4.4 Policy E2E: `npx playwright test tests/e2e/legal-pages.spec.ts` — 21fea93

#### Manual

- [ ] 4.5 The owner reads the new point 2.8 and the changed sentences in the context of the whole policy
- [ ] 4.6 The link from the consent sentence leads to the right point of the policy

### Phase 5: E2E

#### Automated

- [x] 5.1 The spec passes three times in a row: `npx playwright test tests/e2e/founder-price.spec.ts --repeat-each=3`
- [x] 5.2 The whole E2E suite green before merging: `npm run test:e2e`

#### Manual

- [ ] 5.3 After merging: `db push`, one signup on `https://temio.pl/cennik`, the row checked and deleted
