# Help and Contact (S-19) — Plan Brief

> Full plan: `context/changes/help-and-contact/plan.md`

## What & Why

A public FAQ (`/pomoc`) and a contact form (`/kontakt`), open to visitors with or without an account (FR-025, the FAQ part; FR-026). The PRD sets a quality rule for this surface: **messages from bots don't reach the owner, and real messages never get lost.** The bot check built here is reused by the founding-price sign-up in S-22, so it cannot be built into one form.

## Starting Point

There are no public pages besides the landing page and the auth screens. The header and footer deliberately link nowhere yet. The app sends no e-mail of its own and has no service-role key. The password-reset "sent" page offers a temporary `mailto:kontakt@temio.pl` that was meant to be replaced by this slice. Mock-ups for both pages already exist (09, 11, 11b).

## Desired End State

Every public page links to Pomoc and Kontakt, and signed-in teachers get a "Pomoc" link in the app header. A submitted message is saved as a database row first, then e-mailed to the owner with Reply-To set to the visitor's address. The row survives a failed e-mail and is deleted after 12 months. Bots are stopped by Turnstile and a honeypot field before anything is stored. The reset page now points to the form.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Where messages go | DB row first, then e-mail via Cloudflare `send_email` | The row is what keeps "a real message is never lost" true when e-mail fails. |
| Bot protection | Turnstile (checked on the server) + honeypot, as the reusable `verifyHumanToken` | Free and already on our platform; S-22 calls the same helper with its own `action`. |
| Release before privacy policy (Open Q #11) | Ship now, with a one-sentence notice and no consent checkbox | Lets the reset fallback and S-21 stop waiting for a lawyer; S-20 adds the link later. |
| Retention | 12 months, enforced by a `pg_cron` job in the same migration | `lessons.md`: deferred cleanup needs an owner, and here the owner is code. |
| FAQ content | Only answers that are true today, kept as data in `src/lib/faq.ts`; no Płatności section | Later slices add entries instead of correcting promises. |
| Signed-in access | "Pomoc" link in `AppHeader`; form prefills the account e-mail | One stable entry point without a footer on the planner screens. |
| URLs | `/pomoc`, `/kontakt`, `/kontakt/wyslano` | Readable, indexable Polish URLs for a Polish-only audience. |
| Submit mechanics | `fetch` + JSON error code, not a redirect with `?error=` | A redirect would throw away a long message the visitor typed. |
| Tests | Unit + route + pgTAP + one db-tier route test + one e2e | RLS on a table that anonymous visitors can write to is the riskiest part and gets tested where it is enforced. |

## Scope

**In scope:**
- the `contact_messages` table: insert-only RLS for anonymous visitors and signed-in teachers, CHECK constraints on field lengths, and the retention cron job
- `verifyHumanToken`, `contact-form` (field rules and error messages), `contact-mail`, and the `POST /api/contact` route
- the `/pomoc`, `/kontakt` and `/kontakt/wyslano` pages, plus the `FaqItem` and `ContactForm` components
- header, footer and `AppHeader` links; the SEO allow-list; relinking the reset page
- one e2e test, the production setup checklist, and notes in `CLAUDE.md` and the roadmap

**Out of scope:** Regulamin and privacy policy (S-20); the Cennik link and the payments FAQ (S-22/23); an admin inbox; an auto-reply to the visitor; per-IP rate limiting; a mail retry queue.

## Architecture / Approach

```
ContactForm (React island) ──fetch JSON──▶ POST /api/contact
  1 honeypot filled? → 200 ok, drop (looks the same as success)
  2 zod validate     → 400 validation_failed
  3 config present?  → 503 config_missing
  4 verifyHumanToken (Turnstile siteverify, action "contact")
                     → 403 bot_check_failed | 503 bot_check_unavailable
  5 insert contact_messages (no .select(): insert-only RLS) → 500 save_failed
  6 send_email to CONTACT_TO, Reply-To = visitor (failure is logged, response unchanged)
  7 200 ok → island goes to /kontakt/wyslano
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backbone | Table + RLS + cron, the bot check, the mail sender, `/api/contact`, all tested | The insert-only policy fails if the insert reads its row back (RETURNING); guarded by the db-tier test and a deliberate-break check |
| 2. Pages and wiring | `/pomoc`, `/kontakt`, `/kontakt/wyslano`, navigation, SEO, reset relink | FAQ copy that promises more than the product does; Janusz signs off on every answer |
| 3. E2E, production, docs | Browser path test, Cloudflare/Supabase production setup, conventions recorded | Merging is the release, so Email Sending, Turnstile, secrets and the migration must all be in place before the merge |

**Prerequisites:** Cloudflare access to onboard Email Sending and create a Turnstile widget; the owner's inbox verified as a destination address; Supabase production access for `db push`.
**Estimated effort:** about 2–3 sessions across 3 phases.

## Open Risks & Assumptions

- **Legal.** Shipping the form before the privacy policy, with only an inline notice, is Janusz's accepted risk (Open Q #11). S-20 has to add the link and cover the stored e-mails of people without an account.
- **pg_cron.** It is assumed to be available on the hosted Supabase project. If it is not, Phase 3's setup fails visibly before the merge, not afterwards.
- **Vitest and the binding import.** If Vitest cannot mock the module that imports `cloudflare:workers`, the fallback is a test alias in `astro.config.test.mjs`. The plan names this fallback.
- **No mail is sent locally.** Local development and e2e never send real mail (`CONTACT_TO` is unset), so actual delivery is checked only by the production smoke test.

## Success Criteria (Summary)

- A visitor who doesn't find an answer in the FAQ sends a message, and the owner gets it by e-mail and can reply directly.
- A message survives an e-mail failure as a database row, and bot submissions leave no trace in the inbox or the table.
- The reset page's "nothing arrived" path leads to the form, and S-22 can reuse the bot check without changing it.
