# Temio Launch — Plan Brief

> Full plan: `context/changes/temio-launch/plan.md`

## What & Why

The app becomes **Temio** and moves to **`temio.pl`**. Its auth mail goes out through Resend as `Temio <kontakt@temio.pl>`. This is urgent: production still sends through Supabase's built-in sender, which delivers only to members of the project's team, so every other teacher receives neither the reset mail nor the sign-up mail.

## Starting Point

The code still says "10xPreschool" in 11 places, and the logo is a CSS square. The Worker is served only on `*.workers.dev`. Sign-up confirmation uses Supabase's default English template with a link that a mailbox scanner can spend. The DNS zone and the `kontakt@temio.pl` mailbox are at OVH.

## Desired End State

A teacher outside the team signs up on `https://temio.pl` and receives a Polish confirmation from `Temio <kontakt@temio.pl>`. One button press activates the account and signs her in. The reset mail reaches her in the same way. Every screen shows the leaf logo, the new favicons and `© <year> Temio`. www and the old workers.dev URL redirect to `temio.pl`. The OVH mailbox never stops receiving mail.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Name and design | Rebrand only; all 16 layouts unchanged | The brand package changes the name, logo and icons, not the screens | change.md |
| Worker name | Stays `10x-preschool` | A rename creates a new Worker and breaks Workers Builds | change.md |
| DNS | Nameservers move from OVH to Cloudflare; mail stays at OVH | A Workers Custom Domain needs the zone in Cloudflare | change.md |
| Mail sender | Resend SMTP, records on `send.temio.pl`, EU region | No collision with OVH mail on the apex domain; personal data stays in the EU | change.md / Plan |
| Sign-up confirmation link | `token_hash` + `type=email` through the `/auth/confirm` button page | Same scanner-safe, any-device pattern already reviewed for the reset | Plan |
| Old workers.dev URL | 301/308 to `temio.pl`, through an exact-host check in middleware, inert until vars are set | One origin for cookies and Supabase redirects; previews are untouched | Plan |
| www | Redirect Rule to the apex | Teachers who type www still arrive | Plan |
| DMARC | `p=none` with reports to `kontakt@` | Meets Gmail's sender rules without risking OVH replies | Plan |
| Ordering | Code PR first (inert on workers.dev), then DNS → domain → Resend → Supabase | Each piece is reversible on its own; the code is waiting when the infra goes live | Plan |

## Scope

**In scope:**
- Name in code and docs.
- Logo with `variant` and `markOnly`.
- 4 favicons and `theme-color`.
- Footer copyright.
- `SUPPORT_EMAIL` and `site` in the Astro config.
- Polish confirmation template, `type=email` on `/auth/confirm`, activation-specific error codes and `email_address_not_authorized`.
- Old-host redirect.
- OVH → Cloudflare DNS move with a record inventory, Custom Domain, www.
- Resend, DMARC, Supabase SMTP, rate limit and templates.

**Out of scope:**
- Renaming the Worker.
- Layout changes.
- New public pages (S-19/20/22).
- A resend-activation UI.
- Other auth templates.
- Moving the mailbox off OVH.
- DMARC enforcement.

## Architecture / Approach

The code changes in phases 1–3 ship together in one PR on `feat/temio-launch`. On workers.dev they are harmless: the new confirmation type is unused until the dashboard template changes, and the redirect does nothing until `LEGACY_HOST` / `CANONICAL_ORIGIN` exist. Phases 4–5 are dashboard work at OVH, Cloudflare, Resend and Supabase. The only code involved is a tiny `wrangler.jsonc` `vars` commit. Each step has a `dig`/`curl` check or a delivery test behind it.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Rebrand in code | Temio name, leaf logo, favicons, footer ©, support address, sitemap | Merging the two Logo APIs breaks a call site (`AppHeader` label, `AuthSplit` class) |
| 2. Polish sign-up confirmation | `type=email` through `/auth/confirm`, Polish template, activation error codes | Failed activations land on reset-worded pages |
| 3. Old-host redirect | Exact-host 301/308 to `temio.pl`, inert by default; PR merged | A broad host match redirects preview URLs |
| 4. Domain move | `temio.pl` on Cloudflare, Custom Domain, www, Supabase URLs | A missed OVH record or a stale DNSSEC DS record cuts off mail |
| 5. Auth mail through Resend | Delivery to non-team addresses, SPF/DKIM/DMARC pass | Junk-folder placement; the 30/h limit if it isn't raised |

**Prerequisites:** access to OVH, Cloudflare, Resend and the Supabase dashboard. A Gmail address outside the Supabase team for the tests.
**Estimated effort:** ~1 coding session for phases 1–3. Phases 4–5 take ~1–2 hours of hands-on dashboard work, plus up to 24–48 h waiting for DNS (DS removal, nameserver propagation).

## Open Risks & Assumptions

- Assumes OVH lets you change the nameservers on its own domain, and that the mailbox keeps working with external DNS. OVH supports this for MX Plan, but check it in the inventory step.
- If DNSSEC is on at OVH, the move waits for the DS record to expire before the nameserver change.
- New sender reputation: the first mails may land in spam. DKIM, SPF and DMARC plus Polish content keep this risk down; Phase 5 checks it explicitly.
- Existing sessions don't carry over to `temio.pl`, so teachers sign in once more.

## Success Criteria (Summary)

- A teacher outside the Supabase team receives the Polish sign-up and reset mails in her inbox and completes both flows on `temio.pl`.
- `kontakt@temio.pl` receives mail throughout.
- No screen, tab or mail says "10xPreschool".
