# Help and Contact (S-19) Implementation Plan

## Overview

Two new public pages: an FAQ at `/pomoc` and a contact form at `/kontakt`. Anyone can use them, signed in or not. A message from the form is stored as a database row, then e-mailed to the owner. Bot traffic is stopped before anything is stored. The bot check is built as a reusable helper so that S-22 (sign-up for the founding price) can call it unchanged. The "nothing arrived" fallback on the password-reset page moves from the temporary `mailto:` link to the form.

Roadmap: `context/foundation/roadmap.md` §S-19 · PRD: FR-025 (the FAQ part), FR-026, and the §Constraints rule „Wiadomości automatów nie docierają do właściciela, a prawdziwe nie giną”.

## Current State Analysis

- **No public pages exist besides `/` and `/auth/*`.** `MarketingHeader.astro` and `SiteFooter.astro` deliberately carry no Cennik / FAQ / Kontakt links, and their comments say so: "a dead link is worse than none". The signed-in shell (`AppHeader.astro`) has no way out to help.
- **The design package has mock-ups for both pages.** They are `09-faq`, `11-kontakt` and `11b-kontakt-wyslano` in `context/foundation/design/design/reference/`, and `FaqItem.astro` is a spec component (native `<details>`, no JS). The mock-ups go beyond what the product does today:
  - a "Płatności" FAQ section;
  - a consent checkbox linking to a Regulamin that does not exist (that is S-20);
  - a "Płatności i faktury" topic.
- **The app sends no e-mail.** Auth e-mails go through Supabase. There is no `send_email` binding in `wrangler.jsonc`, and mail for `kontakt@temio.pl` stays at OVH.
- **There is no service-role key in the app.** Every query runs as the caller's role through `context.locals.supabase`, so a visitor who is not signed in writes as `anon`.
- **`SUPPORT_EMAIL` is a temporary channel.** It lives in `src/lib/support-contact.ts`, is shown as a `mailto:` on `/auth/forgot-password/sent.astro`, and its comment hands the replacement to S-19.
- **Search engines see only an allow-list.** That list is `INDEXABLE_PATHS` in `src/lib/seo.ts`, which drives both the `robots` meta tag and the sitemap.
- **Testing has four tiers:**
  - `npm test`: unit and route tests, with `locals.supabase` stubbed.
  - `npm run test:db`: pgTAP.
  - `npm run test:db:api`: routes against the local stack, through a real publishable-key client.
  - Playwright e2e: rules in `tests/e2e/E2E-RULES.md`.

  Vitest uses the adapter-free `astro.config.test.mjs`, so `cloudflare:workers` does not exist inside tests.

## Desired End State

**Visitor path.** A visitor on any public page reaches "Pomoc" and "Kontakt" from the header and the footer. `/pomoc` answers what Temio is, how it works and what happens to the teacher's data, and states nothing the product contradicts. Its closing band leads to `/kontakt`. There, the visitor fills in their e-mail and message (name and topic are optional). An invisible Turnstile check runs, and on success they land on `/kontakt/wyslano` ("Dziękujemy!").

**What happens to the message.** The message is now a row in `public.contact_messages`, and the owner has an e-mail in their inbox with Reply-To set to the visitor's address. If the e-mail fails, the row still exists. The row is deleted automatically after 12 months.

**Bots.** A bot that fills the honeypot field gets the same "Dziękujemy" page, and nothing is stored or sent. A request that fails Turnstile is refused, and nothing is stored or sent.

**Signed-in teachers.** They reach `/pomoc` through a "Pomoc" link in `AppHeader`, and the form arrives with their account e-mail filled in.

**Password reset.** The "sent" page now says "napisz przez formularz kontaktowy" and links to `/kontakt`.

How to verify it is done: every item in the `## Progress` section below is ticked, including the production smoke test in Phase 3.

### Key Discoveries:

- **Bindings come from `cloudflare:workers`.** In Astro 6 with `@astrojs/cloudflare` v13 that import replaces `Astro.locals.runtime.env` (Astro docs, Cloudflare guide). Vitest cannot resolve that module, so the binding must be read in exactly one small module that tests `vi.mock`.
- **Onboarding `temio.pl` for Email Sending only adds records on `cf-bounce.temio.pl`** (SPF, DKIM and MX for bounces). The root MX, which points at OVH, is untouched. Sends to a *verified destination address* are free and do not count toward quota (Email Service docs, "Limits").
- **The insert must not read back.** An insert-only RLS policy means the route must insert **without `.select()` and without `return=representation`**. PostgREST implements those with `RETURNING`, which needs a SELECT policy. Without one, `anon` gets an RLS error even though the INSERT policy allows the row.
- **The established route pattern** is `src/pages/api/auth/forgot-password.ts`: zod parse, then `locals.supabase` null → `config_missing`, then a structured `console.error("<area>.<event>", {...})`, then an error *code*, never a sentence (`supabase-error-copy`).
- **Route unit tests call `POST(context)` directly with a stubbed `locals`.** See `src/pages/api/auth/confirm.test.ts:15-43`.
- **The db-tier fixtures already build publishable-key clients** (`src/lib/services/__fixtures__/supabase-local.ts`), and assertions must never read through the service client.
- **`security.checkOrigin: true` is set in `astro.config.mjs`.** A same-origin `fetch` POST passes it, so nothing needs to change.
- **There is no Content-Security-Policy anywhere**, so the Turnstile script from `challenges.cloudflare.com` loads without config changes.
- **Turnstile has official test keys.** Site key `1x00000000000000000000AA` always passes; secret `1x0000000000000000000000000000000AA` always passes, and `2x0000000000000000000000000000000AA` always fails.

## What We're NOT Doing

- **No Regulamin or privacy policy page.** That is S-20. The form carries a one-sentence inline notice instead of a consent checkbox. S-20 adds the link.
- **No "Płatności" FAQ section and no "Płatności i faktury" topic.** They arrive with S-22/S-23, which add entries to `src/lib/faq.ts`.
- **No Cennik link in the header or footer.** That is S-22.
- **No admin UI for reading messages.** The owner reads them in their inbox, or in the Supabase dashboard if the e-mail failed.
- **No auto-reply e-mail to the visitor.** It would mean sending to arbitrary recipients and keeping a sender reputation.
- **No per-IP rate limiting.** Turnstile plus the honeypot meet the NFR at the current scale.
- **No "mail failed, retry later" queue and no `mailed_at` column.** The row plus the `contact.mail_failed` log line are the recovery path. A column would need an UPDATE policy for `anon`.
- **No changes to e-mail templates, auth flows or the planner.**

## Implementation Approach

**One pipeline, in a fixed order.** Inside `POST /api/contact` the steps run as: parse → honeypot → validate → configuration → bot check → **store** → mail → answer. Storing comes before mailing, so "a real message is not lost" depends only on Postgres. A mail failure is logged and swallowed: the visitor still sees success, because their message *was* received.

**The bot check is a service with no knowledge of the form.** It lives in `src/lib/services/bot-check.ts` and takes a token, the expected action and the remote IP. It returns `{ ok }` or a reason. S-22 calls it with `action: "founding-price"`.

**Data model.** One table with insert-only policies for `anon` and `authenticated`, and no other policies at all. CHECK constraints mirror the zod bounds. Retention is a `pg_cron` job created in the same migration, so that rule is enforced by code from day one (`lessons.md`: "Odroczone sprzątanie danych musi mieć właściciela").

**Pages.** `/pomoc` is static Astro built from data in `src/lib/faq.ts`. `/kontakt` is an Astro page around one React island. React is needed because of the Turnstile widget, the state that keeps the typed message on an error, and the client-side validation. Both pages use `MarketingHeader` and `SiteFooter`, like the landing.

## Critical Implementation Details

- **Submit with `fetch`, not a form POST that redirects.** The auth forms post natively and come back with `?error=code`. That costs a teacher at most an e-mail and password. Here it would throw away a long message.

  The island therefore POSTs JSON to `/api/contact`, keeps every field on an error, and shows the Polish message mapped from the returned code. Only on `{ ok: true }` does it `window.location.assign("/kontakt/wyslano")`.

  It must also call `turnstile.reset()` after **any** error response. Turnstile tokens are single-use, so a retry with the old token always fails.
- **Read the Turnstile site key at runtime and pass it to the island as a prop.** Do not make it a `PUBLIC_` variable. It gets the same treatment as `LEGACY_HOST` / `CANONICAL_ORIGIN` in `astro.config.mjs`: Astro inlines `public` variables at build time, and Workers Builds has no variables at build time. So `TURNSTILE_SITE_KEY` is declared `access: "secret"`, and `kontakt.astro` reads it and hands it to the island.
- **Keep the binding's import out of Vitest.** `cloudflare:workers` must be imported only in `src/lib/services/email-binding.ts`, and that module exports nothing but a getter. Route tests `vi.mock("@/lib/services/email-binding")`.

  If Vite's import analysis still tries to resolve the virtual module when the importer is mocked, fall back to a `resolve.alias` for `cloudflare:workers` in `astro.config.test.mjs` that points at a test stub, and record that choice there.
- **The honeypot answers exactly like success.** It returns the same 200 `{ ok: true }` as a real message, and is logged as `contact.honeypot`. A different status or body would teach a bot which field to leave empty.

## Phase 1: Backbone (storage, bot check, route)

### Overview

Everything behind the form, built and tested with no UI: the table and its policies, the retention job, the reusable bot check, the contact schema and error map, the mail sender, configuration, and `POST /api/contact`.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_contact_messages.sql`

**Intent**: Durable storage for messages that `anon` and `authenticated` can write and nobody can read through the API. Retention is enforced by the database.

**Contract**:
- **The table `public.contact_messages`** has these columns:

  | Column | Type | Rules |
  | --- | --- | --- |
  | `id` | `uuid` | pk, default `gen_random_uuid()` |
  | `created_at` | `timestamptz` | not null, default `now()` |
  | `user_id` | `uuid` | null, references `auth.users(id)` on delete set null |
  | `name` | `text` | null, ≤ 100 chars |
  | `email` | `text` | not null, ≤ 254 chars |
  | `topic` | `text` | not null, one of `question`, `bug`, `idea`, `account`, `other` |
  | `message` | `text` | not null, 10–5000 chars after trim |

- **RLS is enabled, with two policies only:**
  - an `insert` policy for `anon`, `with check (user_id is null)`;
  - an `insert` policy for `authenticated`, `with check (user_id is null or user_id = auth.uid())`.

  There are no select, update or delete policies. Explicit `grant insert` to `anon` and `authenticated` covers only what the policies need.
- **Retention:** `create extension if not exists pg_cron`. A job named `contact-messages-retention` runs daily and executes `delete from public.contact_messages where created_at < now() - interval '12 months'`. If the extension's schema differs between local and hosted, schedule through `cron.schedule(...)` and use a fully qualified table name inside the command.
- **Regenerate `src/db/database.types.ts`** after applying the migration.

#### 2. pgTAP suite

**File**: `supabase/tests/database/contact_messages.test.sql`

**Intent**: Prove the access contract at the only layer that enforces it.

**Contract**: Follow the shape of `rls_isolation.test.sql`. Assert all of the following:
- `anon` inserts a row with `user_id null`, and is refused with a forged `user_id`.
- `authenticated` inserts with its own id or null, and is refused with another user's id.
- `anon` and `authenticated` both see 0 rows on select.
- update and delete affect 0 rows.
- each CHECK rejects an out-of-range value: a message that is too short, one that is too long, and an unknown topic.
- the cron job exists, and its `command` contains `interval '12 months'`.

#### 3. Contact form contract

**File**: `src/lib/contact-form.ts` (+ `contact-form.test.ts`)

**Intent**: The single source for the payload shape, the topic list with Polish labels, and the mapping from error code to Polish sentence. The route and the island both import it.

**Contract**:
- `contactPayloadSchema` (zod). It parses `{ name?, email, topic, message, website, turnstileToken }`, applies the same bounds as the DB CHECKs, and trims strings.
- `CONTACT_TOPICS`: an ordered list of `{ value, label }`. The labels are „Pytanie o działanie”, „Zgłoszenie błędu”, „Pomysł na funkcję”, „Konto i logowanie” and „Inne”.
- `ContactErrorCode`, which is one of `validation_failed`, `bot_check_failed`, `bot_check_unavailable`, `config_missing` or `save_failed`.
- `contactErrorMessage(code: string): string`. An unknown code falls back to a generic Polish message, as in `auth-error-messages.ts`.

#### 4. Bot check service

**File**: `src/lib/services/bot-check.ts` (+ `bot-check.test.ts`)

**Intent**: A reusable server-side Turnstile check with no knowledge of any form, so S-22 can call it unchanged.

**Contract**:
- Signature: `verifyHumanToken(token: string | null | undefined, opts: { secret: string; action: string; remoteIp?: string | null; fetchImpl?: typeof fetch }) => Promise<{ ok: true } | { ok: false; reason: "missing" | "rejected" | "unavailable" }>`.
- It POSTs to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with the secret, the token and, when present, `remoteip`. The call is bounded by `AbortSignal.timeout(5000)`.
- It returns `rejected` when `success` is false **or** when the returned `action` differs from `opts.action`.
- Tests stub `fetch` to cover these cases:
  - success;
  - `success: false`;
  - an action mismatch;
  - a non-200 response;
  - a network error;
  - a timeout, which becomes `unavailable`;
  - an empty token, which becomes `missing` without any network call.

#### 5. Mail sender and binding seam

**Files**: `src/lib/services/email-binding.ts`, `src/lib/services/contact-mail.ts` (+ `contact-mail.test.ts`)

**Intent**: Turn a stored message into one plain-text e-mail to the owner, with the visitor's address as Reply-To. The Workers binding stays behind one mockable module.

**Contract**:
- `email-binding.ts` exports `getEmailBinding(): SendEmail | undefined`, read from `env.EMAIL` in `cloudflare:workers`. That module is the only place the import appears.
- `contact-mail.ts` exports `buildContactMail(msg, to)`, a pure function returning `{ to, from, replyTo, subject, text }`. Its rules:
  - `from` is `{ email: "formularz@temio.pl", name: "Temio — formularz" }`.
  - `subject` is `Temio · <topic label> · <first 60 chars of the message, single line>`.
  - `text` lists the name, e-mail, topic, whether the sender was signed in, and the message.
  - It is text only, with no HTML, so the visitor's content is never interpreted as markup.
- `contact-mail.ts` also exports `sendContactMail(binding, msg, to)`, which wraps `binding.send(buildContactMail(...))`.
- Unit tests cover:
  - the subject is truncated, and newlines in it are collapsed;
  - `replyTo` is the visitor's address;
  - a message containing `<script>` comes out verbatim in `text`, with no `html` key.

#### 6. Configuration

**Files**: `astro.config.mjs`, `.env.example`, `wrangler.jsonc`

**Intent**: Declare the three new runtime values and the e-mail binding.

**Contract**:
- `env.schema` gains `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` and `CONTACT_TO`, all `context: "server", access: "secret", optional: true`. The comment says why, pointing at the existing `LEGACY_HOST` explanation.
- `.env.example` lists them, and notes Turnstile's always-pass test keys for local development.
- `wrangler.jsonc` gains `"send_email": [{ "name": "EMAIL", "allowed_sender_addresses": ["formularz@temio.pl"] }]`, with a one-line comment. For local dev, decide `remote: true` vs. the local simulation while implementing. Remote sending from `npm run dev` would deliver real mail during e2e, so the local simulation is preferred.

#### 7. API route

**File**: `src/pages/api/contact.ts` (+ `contact.test.ts`, `contact.db.test.ts`)

**Intent**: The pipeline, in the order fixed under §Implementation Approach.

**Contract**:
- `export const prerender = false`. The route takes `POST` with a JSON body and always answers JSON.
- The steps, in order:
  1. A body that is not JSON → 400 `{ error: "validation_failed" }`.
  2. A non-empty `website` (the honeypot) → 200 `{ ok: true }` and the log `contact.honeypot`. Nothing else runs.
  3. zod failure → 400 `validation_failed`.
  4. Missing `locals.supabase` or `TURNSTILE_SECRET_KEY` → 503 `config_missing`.
  5. `verifyHumanToken(..., { action: "contact", remoteIp: CF-Connecting-IP })`: a `missing` or `rejected` result → 403 `bot_check_failed`; an `unavailable` result → 503 `bot_check_unavailable`.
  6. Insert through `locals.supabase`, with `user_id = locals.user?.id ?? null` and **no `.select()`**. An error → 500 `save_failed` and the log `contact.save_failed` with `code`/`message`.
  7. Mail:
     - if `CONTACT_TO` or the binding is missing → log `contact.mail_skipped`;
     - otherwise `await sendContactMail`;
     - if the send throws → log `contact.mail_failed`.

     In none of these cases does the response change.
  8. 200 `{ ok: true }`.
- **`contact.test.ts`** (stubbed `locals`, mocked `bot-check` and `email-binding`). It asserts each branch above, and specifically:
  - a honeypot hit never calls the bot check, the insert or the mail;
  - `bot_check_failed` never inserts;
  - `save_failed` never mails;
  - `mail_failed` still returns `{ ok: true }` after the insert happened;
  - the insert payload carries `user_id` for a signed-in user and `null` otherwise.
- **`contact.db.test.ts`** (`npm run test:db:api`). The route is called with a real **anon** publishable-key client and with a signed-in teacher client. Both succeed, which proves the insert-without-return path against real PostgREST and RLS. Clean up through the service client by id. That cleanup is the only service-client use.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on a fresh local stack: `npx supabase db reset`
- pgTAP passes, including the new suite: `npm run test:db`
- Route against the real stack passes, for anon and for a signed-in teacher: `npm run test:db:api`
- Unit and route tests pass: `npm test`
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- The insert-only contract is real. Temporarily add `.select()` after the insert in `contact.ts` and confirm `contact.db.test.ts` goes red for the anon case. Then revert. (This is the deliberate-break check from `lessons.md`.)

#### Manual Verification:

- With `npm run dev` and Turnstile's always-pass test keys in `.dev.vars`, a `curl` POST of a valid JSON body to `/api/contact` returns `{ ok: true }`, and the row is visible in local Studio.
- With the always-fail test secret (`2x…AA`), the same request returns 403 `bot_check_failed`, and no row appears.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Pages and wiring

### Overview

The visible slice: `/pomoc`, `/kontakt` and `/kontakt/wyslano`, the links that reach them from signed-out and signed-in screens, the SEO allow-list, and the reset page's fallback.

### Changes Required:

#### 1. FAQ data and page

**Files**: `src/lib/faq.ts`, `src/components/marketing/FaqItem.astro`, `src/pages/pomoc.astro`

**Intent**: An FAQ whose every answer is true today. The content is data, so later slices add entries instead of editing markup.

**Contract**:
- `faq.ts` exports an ordered list of sections, `{ id, title, items: { question, answer: string[] }[] }`. Each string in `answer` is one paragraph.
- **Section „Jak to działa” (`dzialanie`).** Its questions:
  - „Skąd biorą się propozycje zajęć?”
  - „Czy muszę sprawdzać propozycje przed zajęciami?” The answer is yes: they are AI-generated and the teacher is the judge.
  - „Czy mogę zmienić propozycję?” Edit, regenerate, approve. Use the wording „zatwierdź” / „do przejrzenia”, never „zaakceptuj”.
  - „Czy mogę wydrukować plan?” Yes: PDF of the week and of the month.

  Do not reuse the mock-up's „Nic nie trafia do planu bez Twojej akceptacji”. A generated day is saved as „do przejrzenia” at once (`pl-landing-copy`, the comment in `src/lib/seo.ts`).
- **Section „Konto i dane” (`konto`).** Its questions:
  - „Nie pamiętam hasła — co zrobić?” Link to `/auth/forgot-password`.
  - „Co dzieje się z moimi planami?” They are private to the account.
  - „Jak usunąć konto?” Until S-18 lands: write through the contact form. Leave a code comment there that S-18 rewrites this entry.
- `FaqItem.astro` is ported from the design spec as a native `<details>`, styled with project tokens and `cn()`, not the spec's `<style>` block. The first item is `open`.
- `pomoc.astro` follows mock-up 09:
  - an eyebrow „Pomoc”;
  - an H1 „Najczęstsze pytania”;
  - a lead sentence without „ile kosztuje”;
  - a category nav with anchors, hidden on narrow screens;
  - the sections;
  - the dark band „Nie ma tu Twojego pytania?” with a link „Formularz kontaktowy” → `/kontakt`.

  The page uses `Layout` with `title="Pomoc"` and works at 390 px, 768 px and 1440 px.

#### 2. Contact page, form island, success page

**Files**: `src/pages/kontakt.astro`, `src/components/contact/ContactForm.tsx`, `src/pages/kontakt/wyslano.astro`

**Intent**: Mock-ups 11 and 11b, minus the consent checkbox, which is replaced by the inline notice decided for Open Roadmap Question #11.

**Contract**:
- **`kontakt.astro`** has this content:
  - The left column: eyebrow „Kontakt”, H1 „Napisz *do nas.*”, the lead sentence, the label „E-mail” with `SUPPORT_EMAIL` as a `mailto:` (the fallback channel when the form itself fails), and „Zanim napiszesz, zajrzyj do najczęstszych pytań” → `/pomoc`.
  - The lead sentence has no promise of a response time unless Janusz supplies one; the `[CZAS ODPOWIEDZI]` placeholder must not ship.
  - The page passes `TURNSTILE_SITE_KEY` and `Astro.locals.user?.email` to `<ContactForm client:load>`.
  - If the site key is missing, the page still renders, and the island shows the `config_missing` message instead of the widget.
- **`ContactForm.tsx`** has these fields:

  | Field | Label | Rules |
  | --- | --- | --- |
  | name | „Imię” | optional |
  | email | „E-mail” | required, prefilled when signed in; reuse `emailError` from `src/lib/email-check.ts` |
  | topic | „Temat” | a select over `CONTACT_TOPICS` |
  | message | „Wiadomość” | required, 10–5000 chars, with a counter only near the limit |
  | website | n/a | the honeypot: visually hidden, `tabIndex={-1}`, `autoComplete="off"`, `aria-hidden` on its wrapper |

  The form also contains:
  - the Turnstile widget, rendered explicitly with `action: "contact"` and the script from `challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` loaded once;
  - the notice sentence: „Twoje imię, adres e-mail i wiadomość zapisujemy, żeby odpowiedzieć; usuwamy je po 12 miesiącach.”;
  - the submit button „Wyślij wiadomość”, with the pending text „Wysyłanie…”.

  Its behaviour follows §Critical Implementation Details: fetch, keep the fields, reset the widget, show `contactErrorMessage(code)` through `ServerError`. Reuse `FormField` / `SubmitButton` from `src/components/auth/` where they fit; a textarea or select may need a sibling component.
- **`kontakt/wyslano.astro`** shows the same left column as `/kontakt`, plus the card from mock-up 11b: „Dziękujemy!”, „Wiadomość dotarła. Odpowiemy na podany adres e-mail.”, and a link-styled button „Napisz kolejną wiadomość” → `/kontakt`.

#### 3. Navigation

**Files**: `src/components/layout/MarketingHeader.astro`, `src/components/layout/SiteFooter.astro`, `src/components/AppHeader.astro`

**Intent**: Make the pages reachable everywhere without dead links. Update the "none of those pages exists yet" comments.

**Contract**:
- **`MarketingHeader`** gets an optional `active?: "pomoc" | "kontakt"` prop and links „Pomoc” → `/pomoc` and „Kontakt” → `/kontakt`. The active link carries `aria-current="page"`. On narrow screens the links stay hidden, because the footer carries them. When `Astro.locals.user` is set, the account links become a single „Wróć do planu” → `/plan/month`.
- **`SiteFooter`** gets a `<nav aria-label="Stopka">` with „Pomoc” and „Kontakt”. Leave a comment that Cennik and Regulamin are added by S-22 and S-20.
- **`AppHeader`** gets a text link „Pomoc” → `/pomoc` beside „Wyloguj się”, at the same size and style. „Wyloguj się” stays a visible submit button, because `auth.setup.ts` waits for it.

#### 4. SEO and reset fallback

**Files**: `src/lib/seo.ts` (+ `seo.test.ts`), `src/pages/auth/forgot-password/sent.astro`, `src/lib/support-contact.ts`

**Intent**: Index the two new pages, and switch the reset page's "nothing arrived" path from `mailto:` to the form.

**Contract**:
- `INDEXABLE_PATHS` gains `/pomoc` and `/kontakt`. `/kontakt/wyslano` stays `noindex`. `seo.test.ts` asserts all three.
- `sent.astro` changes its last paragraph to „Nic nie przyszło po kilku minutach? Napisz do nas przez [formularz kontaktowy](/kontakt).” The `SUPPORT_EMAIL` import is removed from that file.
- `support-contact.ts` keeps the constant. It is still shown on `/kontakt` as a fallback. Its comment is rewritten: it is no longer temporary, and it is the address shown beside the form.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including `seo.test.ts`: `npm test`
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- The reset page no longer offers a `mailto:`: `grep -c 'mailto:' src/pages/auth/forgot-password/sent.astro` prints `0`. It prints `1` on `master`, so this check can fail.
- The reset page links to the form: `grep -c 'href="/kontakt"' src/pages/auth/forgot-password/sent.astro` prints `1`. It prints `0` on `master`.

#### Manual Verification:

- `/pomoc` and `/kontakt` match mock-ups 09, 11 and 11b at 390 px, 768 px and 1440 px. The only intended departures are the missing "Płatności" section, the missing consent checkbox, and the notice sentence in its place.
- Janusz reads every FAQ answer and the notice sentence, and confirms each is true today and worded as he wants.
- Typing a long message, then submitting with the dev server's Turnstile secret switched to the always-fail key, shows the Polish error and keeps the message intact. Switching the key back and submitting again succeeds without a reload.
- Signed in, the „Pomoc” link appears in `AppHeader` on desktop and on mobile width. `/kontakt` arrives with the account e-mail filled in, and the header shows „Wróć do planu”.
- Keyboard-only: tab order is name → e-mail → topic → message → Turnstile → submit, the honeypot is never focused, and FAQ items open with Enter or Space.
- `/auth/forgot-password/sent` shows the form link, and it lands on `/kontakt`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: E2E, production setup, documentation

### Overview

Use one browser test to show the whole public path works. Prepare the Cloudflare and Supabase side of production. Then record the decisions where later slices will look for them.

### Changes Required:

#### 1. E2E test

**File**: `tests/e2e/help-and-contact.spec.ts`

**Intent**: Cover the one risk that exists only across the boundaries: a signed-out visitor goes from the FAQ, through the real route and real RLS, to the thank-you page. Use the `/10x-e2e` skill.

**Contract**:
- The test runs with an empty `storageState`, because the visitor is signed out.
- **Steps:**
  1. Open `/pomoc` and click „Formularz kontaktowy”.
  2. Fill the form by label. The message carries a `uniqueStamp()`.
  3. Submit.
  4. Wait for `/kontakt/wyslano`.
- **Assertions:**
  - „Dziękujemy!” is visible.
  - Through the service client, used for verification only, a row with that stamp exists.
- **Cleanup:** delete that row by `id` in `afterEach`.
- **Environment:**
  - The local `.dev.vars` uses Turnstile's always-pass test keys.
  - No mail is sent: `CONTACT_TO` is unset locally, so the route logs `contact.mail_skipped`.
  - Document both in `.env.example` and in the spec's header comment.
- **The row is checked through the service client on purpose.** RLS deliberately hides it from every API role. State this in a comment, because it is the reasoned exception to the "never assert through the service key" rule in E2E-RULES. What RLS hides here is a write-only table, not another account's data.

#### 2. Production setup (manual, before merge)

**Intent**: The merge to `master` is the release, so everything production needs must exist before it.

**Contract**: The steps below are done by Janusz. Record the result of each as a short line in `context/changes/help-and-contact/release-notes.md`.
- **Email Sending:** onboard `temio.pl` (`npx wrangler email sending enable temio.pl`, or the dashboard). Confirm the `cf-bounce` records with `dig` and that the root MX still points at OVH. Add the owner's inbox as a verified destination address.
- **Turnstile:** create a widget for `temio.pl` (mode: managed or invisible), and add the hostname of the Workers preview if it is used.
- **Worker secrets** (dashboard or `wrangler secret put`): `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `CONTACT_TO`.
- **Supabase:** apply the migration to production (`npx supabase db push`). Confirm `pg_cron` is enabled and the `contact-messages-retention` job is listed.

#### 3. Documentation

**Files**: `CLAUDE.md`, `context/foundation/roadmap.md`

**Intent**: Leave the conventions that S-21 and S-22 will build on where they will be found.

**Contract**:
- **`CLAUDE.md` §Architecture** gets a short "Public help and contact" entry:
  - the pages `/pomoc`, `/kontakt` and `/kontakt/wyslano`;
  - the pipeline order;
  - `verifyHumanToken` as **the** bot check for any public form (S-22 calls it with its own `action`);
  - the binding seam in `email-binding.ts`;
  - the insert-without-select rule for `contact_messages`;
  - the 12-month cron;
  - the three secrets.
- **`roadmap.md` §S-19 Unknowns:** mark the three unknowns resolved, with the decisions: DB plus e-mail; ship with an inline notice; the reset page relinked. Then answer **Open Roadmap Question #11** with the same decision and the date. Do not change the Status column; `/10x-archive` does that.

### Success Criteria:

#### Automated Verification:

- The new e2e test passes against the local stack: `npx playwright test tests/e2e/help-and-contact.spec.ts`
- The whole e2e suite still passes, so the header changes broke no locator: `npm run test:e2e`
- Lint and build pass: `npm run lint && npm run build`

#### Manual Verification:

- The four production setup steps are done and recorded in `release-notes.md`.
- After the merge deploys, a real message sent from `https://temio.pl/kontakt` arrives in the owner's inbox, and replying to it goes to the visitor's address.
- The same message is visible as a row in the production Supabase dashboard.
- On production, mail for `kontakt@temio.pl` still arrives at OVH, so the Email Sending onboarding did not touch the root MX.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- **`contact-form`:** the schema bounds, matching the DB CHECKs exactly; trimming; unknown topic; the error map, including the fallback for unknown codes.
- **`bot-check`:** each outcome of siteverify (success, rejected, action mismatch, non-200, network error, timeout), plus an empty token with no network call.
- **`contact-mail`:** subject truncation and newline collapse, `replyTo`, plain text only.
- **`api/contact`:** each pipeline branch, and that later steps never run once an earlier one has stopped the request.

### Integration Tests:

- **pgTAP:** the insert-only RLS for both roles, `user_id` forgery refused, zero visibility, the CHECKs, and the existence of the cron job.
- **`contact.db.test.ts`:** the route with a real anon client and a real signed-in client. It is the only test that can catch the `RETURNING` trap.
- **E2E:** FAQ → form → thank-you, signed out, through real routing, the route and RLS.

### Manual Testing Steps:

1. In local dev, submit a valid message. You land on „Dziękujemy”, and the row is in Studio.
2. Switch to the always-fail Turnstile secret and submit a long message. The error shows, the text survives, and after switching back a retry succeeds.
3. Fill the honeypot through DevTools and submit. You still land on „Dziękujemy”, but there is no row and the log shows `contact.honeypot`.
4. Signed in, go Pomoc → Kontakt. The e-mail is prefilled, and the row carries `user_id`.
5. After the merge, send a production message. It is in the inbox with a working reply, and it is in the table.

## Performance Considerations

The success path makes one siteverify call (bounded to 5 s), one insert, and one awaited `send()`. That is well within a Worker request at this volume. The FAQ is server-rendered static markup with no JS. On `/kontakt` the only island is the form, and Turnstile loads only there.

## Migration Notes

The migration is additive: a new table, new policies, and one cron job. Rolling it back would mean `cron.unschedule('contact-messages-retention')` and `drop table public.contact_messages`. Existing rows would be lost, so prefer leaving the table in place. A code rollback without a DB rollback is safe: an unused table does no harm.

## References

- Roadmap: `context/foundation/roadmap.md` §S-19, Open Roadmap Questions #11
- PRD: `context/foundation/prd-v3.md` FR-025, FR-026, §Warunki jakościowe zmiany, §Access Control Changes
- Mock-ups: `context/foundation/design/design/reference/09-faq.html`, `11-kontakt.html`, `11b-kontakt-wyslano.html`; spec component `context/foundation/design/src/components/ui/FaqItem.astro`
- Route pattern: `src/pages/api/auth/forgot-password.ts`; route test pattern: `src/pages/api/auth/confirm.test.ts:15-43`
- RLS test pattern: `supabase/tests/database/rls_isolation.test.sql`
- Lessons applied: „Odroczone sprzątanie danych musi mieć właściciela” (the cron job in the same migration); „Kryterium weryfikacji musi móc nie przejść” and „Bramka grepowa musi celować w konstrukcję…” (the 2.4 and 2.5 greps are anchored on `mailto:` / `href="/kontakt"` and red on `master`; the 1.7 deliberate break)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backbone (storage, bot check, route)

#### Automated

- [x] 1.1 Migration applies cleanly on a fresh local stack — 738529f
- [x] 1.2 pgTAP passes including the new suite — 738529f
- [x] 1.3 Route against the real stack passes for anon and signed-in — 738529f
- [x] 1.4 Unit and route tests pass — 738529f
- [x] 1.5 Lint passes — 738529f
- [x] 1.6 Build passes — 738529f
- [x] 1.7 Deliberate break: `.select()` after insert turns `contact.db.test.ts` red for anon, then reverted — 738529f

#### Manual

- [x] 1.8 curl POST with always-pass keys returns ok and the row exists
- [x] 1.9 Always-fail secret returns 403 bot_check_failed and no row

### Phase 2: Pages and wiring

#### Automated

- [x] 2.1 Unit tests pass including `seo.test.ts` — 1cfadbc
- [x] 2.2 Lint passes — 1cfadbc
- [x] 2.3 Build passes — 1cfadbc
- [x] 2.4 `sent.astro` has no `mailto:` (prints 0; 1 on master) — 1cfadbc
- [x] 2.5 `sent.astro` links to `/kontakt` (prints 1; 0 on master) — 1cfadbc

#### Manual

- [x] 2.6 Pages match mock-ups 09/11/11b at 390/768/1440 px, with only the intended departures
- [x] 2.7 Janusz approves every FAQ answer and the notice sentence
- [x] 2.8 Failed bot check keeps the typed message; retry after switching keys succeeds
- [x] 2.9 Signed-in: Pomoc in AppHeader, e-mail prefilled, „Wróć do planu” in header
- [x] 2.10 Keyboard-only order correct, honeypot never focused, FAQ toggles by keyboard
- [x] 2.11 Reset "sent" page links to `/kontakt`

### Phase 3: E2E, production setup, documentation

#### Automated

- [x] 3.1 New e2e test passes against the local stack — 435abaa
- [x] 3.2 Whole e2e suite still passes — 435abaa
- [x] 3.3 Lint and build pass — 435abaa

#### Manual

- [x] 3.4 Production setup steps done and recorded in `release-notes.md` (2026-10-13)
- [ ] 3.5 Production message arrives in the owner's inbox and Reply-To reaches the visitor
- [ ] 3.6 Production message is a row in the Supabase dashboard
- [ ] 3.7 `kontakt@temio.pl` mail still arrives at OVH
