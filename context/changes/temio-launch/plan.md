# Temio Launch Implementation Plan

## Overview

The app becomes **Temio**, at **`temio.pl`**, and its auth mail reaches every teacher. Today production sends auth mail through Supabase's built-in sender, which delivers only to members of the project's team, so a teacher outside it receives neither the reset nor the sign-up mail (`context/archive/2026-10-03-password-reset/follow-ups/review-fixes.md`). This plan does three things:

1. ships the rebrand in code: name, leaf logo, icons and footer;
2. moves `temio.pl` from OVH DNS to Cloudflare and serves the Worker there;
3. sends auth mail as `Temio <kontakt@temio.pl>` through Resend, with a Polish sign-up confirmation that uses the same scanner-safe `token_hash` pattern as the reset.

## Current State Analysis

- **The old name appears in 11 places in code:**
  - `src/layouts/Layout.astro:17` (default `<title>`)
  - `src/components/brand/Logo.astro:14,30`
  - `src/components/AppHeader.astro:32`
  - `src/pages/index.astro:18`
  - `src/lib/services/activity-generator.ts:240` and `src/lib/services/content-safety-judge.ts:350` (`X-OpenRouter-Title`)
  - `scripts/compare-models.sh:240`
  - `supabase/templates/recovery.html:5,9`
  - `supabase/config.toml:238` (recovery subject)

  `package.json` is still called `10x-astro-starter`. In `CLAUDE.md`, the name only appears as the Worker name, and that stays.
- **Logo:** `src/components/brand/Logo.astro` draws the mark as a CSS rounded square (`bg-las` + `rounded-logo`). The package's version (`context/foundation/design/src/components/ui/Logo.astro`) draws an SVG leaf, takes `variant: "default" | "inverse"` and `markOnly`, and writes "temio" in lowercase. Our version also takes `href`, `label` and `class`. `AppHeader` passes its own label, and `AuthSplit` passes `class="self-start"`. Neither API is a subset of the other.
- **Icons:** `public/` contains only `favicon.png`, linked in `Layout.astro:25`. The package ships `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` and `icon-512.png` (`context/foundation/design/public/`), and asks for `theme-color: #1F3B2D`.
- **Footer:** `src/components/layout/SiteFooter.astro` has no copyright line. The package's footer ends with `© {year} Temio`.
- **Support address:** `src/lib/support-contact.ts:8` still points to a private Gmail address.
- **Sign-up confirmation:** `src/pages/api/auth/signup.ts` calls `signUp({ email, password })` without `emailRedirectTo`. In production, Supabase sends its default English template with `{{ .ConfirmationURL }}`, which goes through Supabase's verify endpoint, so a mailbox scanner's prefetch can spend it. `/auth/confirm` (`src/pages/auth/confirm.astro`) and `POST /api/auth/confirm` (`src/pages/api/auth/confirm.ts`) accept only `type=recovery`. Locally, `enable_confirmations = false` (`supabase/config.toml`), so `confirm-email.astro` shows "Konto założone" in DEV.
- **Error map:** `src/lib/auth-error-messages.ts` does not know `email_address_not_authorized`, so the built-in sender's refusal falls to the generic message. `otp_expired` is worded for the reset only.
- **Hosting:** the Worker is called `10x-preschool` (`wrangler.jsonc`) and is served only on `*.workers.dev`. `astro.config.mjs` has `@astrojs/sitemap` but no `site`, so no sitemap is produced. `security.checkOrigin: true` stays as it is.

## Desired End State

- Every screen says **Temio**, with the leaf logo, the new favicons and `© <year> Temio` in the public footer. No `10xPreschool` / `10x Preschool` is left in `src/`, `scripts/`, `supabase/` or `package.json`. The Worker is still called `10x-preschool`.
- `https://temio.pl` serves the app. `https://www.temio.pl/…` and `https://10x-preschool.<account>.workers.dev/…` both redirect to the same path on `temio.pl`. Preview URLs still work.
- `kontakt@temio.pl` keeps receiving mail through OVH, before, during and after the nameserver move.
- Supabase sends auth mail through Resend's SMTP as `Temio <kontakt@temio.pl>`. An address that is not on the Supabase team receives:
  - the Polish reset mail;
  - the Polish sign-up confirmation. Its link opens `/auth/confirm?token_hash=…&type=email`, whose button activates the account and lands the teacher signed in on `/plan/month`.
- SPF and DKIM pass for `send.temio.pl` / `temio.pl`, and DMARC `p=none` is published.

### Key Discoveries:

- `verifyOtp` takes `type: "email"` for a sign-up `token_hash`; `"signup"` is deprecated (Supabase docs, via Context7). The template link is `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`, the same shape as `recovery.html:11`.
- `forgot-password.ts:32` builds `redirectTo` from the request's origin. `signUp`'s `emailRedirectTo` follows the same pattern, so the link stays on the origin the teacher signed up from. The Supabase allow-list must contain that origin's `/auth/confirm` (CLAUDE.md, Auth flow).
- Once custom SMTP is on, Supabase limits auth mail to **30 per hour** until it's raised under Auth → Rate Limits (Supabase docs).
- `confirm-email.astro` already writes the production copy, "Sprawdź skrzynkę… Kliknij go, żeby aktywować konto." The new template has to match that promise.

## What We're NOT Doing

- Renaming the `10x-preschool` Worker (`wrangler.jsonc`). Its name is internal, and a rename creates a new Worker and breaks the Workers Builds connection.
- Any layout change. All 16 screens keep their layout; this is a rebrand, not a redesign.
- New public pages (cennik, FAQ, regulamin, kontakt): those belong to S-19 / S-20 / S-22. The footer stays without links (`SiteFooter.astro` comment).
- A "resend the activation link" UI. An unconfirmed teacher can sign up again with the same address, and Supabase sends a new link.
- Templates for invite, magic link, email change and password-changed notifications. None of these flows exist in the UI.
- Moving the mailbox off OVH, or DMARC enforcement (`quarantine` / `reject`). Both are later follow-ups.
- Renaming the repository, the GitHub project or the Supabase project.

## Implementation Approach

The code ships first, in one PR on the `feat/temio-launch` branch, phases 1 to 3. Everything in it is safe on `*.workers.dev`:

- the rebrand is cosmetic;
- the confirmation flow accepts `type=email` but changes nothing until the dashboard template is switched;
- the host redirect is inert until its two vars are set.

The ops work follows (phases 4–5). Each of those steps either makes a reversible dashboard change or is preceded by an inventory that makes it reversible. The order inside phase 4 protects the mailbox. Phase 5 starts only once the domain resolves through Cloudflare.

## Critical Implementation Details

**State sequencing (DNS):** if DNSSEC is enabled at OVH, turn it off and wait for the DS record to disappear before the nameservers change. A stale DS record pointing at OVH's keys makes validating resolvers return SERVFAIL for the whole domain, mail included. Copy **every** record from the OVH zone (MX, SPF TXT, `autodiscover`/`autoconfig` CNAMEs, any DKIM, DMARC or `_` SRV records), not only MX and SPF. Mail records stay **DNS-only** (grey cloud) in Cloudflare.

**State sequencing (sign-up template):** paste the `type=email` confirmation template into the production dashboard only **after** the Phase 1–3 code is deployed. Until then, production's `/auth/confirm` rejects `type=email`. The reverse order is safe, because the old template keeps working with the new code.

**Error routing for `type=email`:** a failed sign-up confirmation must not land on `/auth/forgot-password` with reset wording. It goes to `/auth/signin` with an activation-specific code (Phase 2).

## Phase 1: Rebrand in code

### Overview

Swap the name, the logo, the icons and the footer line. No behaviour changes.

### Changes Required:

#### 1. Logo

**File**: `src/components/brand/Logo.astro`

**Intent**: Replace the CSS square and the "10xPreschool" wordmark with the package's SVG leaf and the lowercase "temio" wordmark, keeping what our call sites rely on.

**Contract**: Props are `size?: "sm" | "md" | "lg"`, `href?: string` (default `/`), `label?: string` (default `"Temio — strona główna"`), `class?: string`, `variant?: "default" | "inverse"` and `markOnly?: boolean`. The leaf path, its 64×64 viewBox and the sizes 26/30/34 px come from `context/foundation/design/src/components/ui/Logo.astro`. The leaf fill is `las`, or `szalwia` when `variant="inverse"`, which also sets the text colour to `owies`. Styling uses Tailwind utilities with `cn()`, as the current file does, not the package's `<style>` block. `aria-label` is still on the `<a>`, and the mark and the word stay `aria-hidden`.

#### 2. Name in pages, header and services

**Files**:
- `src/layouts/Layout.astro`: default `title` becomes `"Temio"`.
- `src/pages/index.astro`: `"Temio — plan zajęć przedszkolnych"`.
- `src/components/AppHeader.astro`: label `"Temio — plan miesiąca"`.
- `src/lib/services/activity-generator.ts` and `scripts/compare-models.sh`: `X-OpenRouter-Title: Temio`.
- `src/lib/services/content-safety-judge.ts`: `Temio-content-safety-gate`.
- `package.json`: `"name": "temio"`, then `npm install` to update `package-lock.json`.

**Intent**: Plain renames. The OpenRouter title only labels requests in OpenRouter's dashboard.

#### 3. Icons and theme colour

**Files**: `public/favicon.svg`, `public/favicon-32.png`, `public/apple-touch-icon.png`, `public/icon-512.png` (copied from `context/foundation/design/public/`), `public/favicon.png` (deleted), `src/layouts/Layout.astro`

**Intent**: Use the leaf icon everywhere a browser shows the app.

**Contract**: `<head>` links `favicon.svg` (`image/svg+xml`), `favicon-32.png` (`sizes="32x32"`) and `apple-touch-icon.png`, and adds `<meta name="theme-color" content="#1F3B2D">`. First grep for other references to `/favicon.png` (e.g. a print layout). `public/template.png` is unrelated starter content, so it stays out of scope.

#### 4. Footer copyright

**File**: `src/components/layout/SiteFooter.astro`

**Intent**: Add `© {year} Temio`, where the year is the current year at render time. Keep "Plan zajęć przedszkolnych".

#### 5. Support address and site URL

**Files**: `src/lib/support-contact.ts`, `astro.config.mjs`

**Intent**: `SUPPORT_EMAIL = "kontakt@temio.pl"`; the comment about S-19 stays. Add `site: "https://temio.pl"` so the sitemap integration produces `sitemap-index.xml` and canonical URLs resolve.

#### 6. Recovery template and docs

**Files**: `supabase/templates/recovery.html`, `supabase/config.toml`, `CLAUDE.md`

**Intent**: "Temio" in the template's `<title>` and body, and in the subject `"Ustaw nowe hasło w Temio"`. In `CLAUDE.md`, the architecture intro names the product (Temio, `temio.pl`). The Worker name stays as it is.

### Success Criteria:

#### Automated Verification:

- No old name remains in the shipped code: `grep -rniE "10x ?preschool" src scripts supabase public package.json` prints nothing. Run it before the change, when it must print the 11 hits; `10x-preschool` (the Worker) does not match, by design.
- The new wordmark is rendered: `grep -n '>temio<\|"temio"' src/components/brand/Logo.astro` finds the wordmark literal.
- Lint passes: `npm run lint`
- Unit tests pass: `npm test`
- Build passes and emits the sitemap: `npm run build && ls dist/client/sitemap-index.xml` (adjust the path to the adapter's output dir if it differs)

#### Manual Verification:

- `npm run dev`: landing, sign-in, sign-up and `/plan/month` show the leaf logo and "temio" at 390, 768 and 1440 px, compared against `context/foundation/design/design/screens/01`, `02` and `04`.
- The browser tab shows the leaf favicon; the public footer shows `© 2026 Temio`.
- A screen reader (or the accessibility tree) reads the logo link as "Temio — strona główna", or as "Temio — plan miesiąca" in the app bar.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Polish sign-up confirmation

### Overview

Sign-up confirmation goes through the same `/auth/confirm` button page as the reset. A Polish template drives it, and the error codes are worded for activation.

### Changes Required:

#### 1. Confirmation template

**Files**: `supabase/templates/confirmation.html` (new), `supabase/config.toml`

**Intent**: A Polish "Potwierdź adres e-mail w Temio" mail in the style of `recovery.html`, with a link to `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`. Register it in `config.toml` as `[auth.email.template.confirmation]`, with subject `"Potwierdź adres e-mail w Temio"`. The comment notes that production carries the same subject and body in the dashboard (Auth → Email Templates → Confirm signup). `enable_confirmations` stays `false` locally.

#### 2. Sign-up passes the redirect

**File**: `src/pages/api/auth/signup.ts`

**Intent**: Pass `options.emailRedirectTo = <request origin>/auth/confirm`, built the same way as in `forgot-password.ts:32`, so `{{ .RedirectTo }}` points back to the origin the teacher used.

#### 3. `/auth/confirm` accepts `type=email`

**Files**: `src/pages/auth/confirm.astro`, `src/pages/api/auth/confirm.ts`

**Intent**: The GET still only renders a button. Its heading, text and button come from the `type`:
- `recovery`: unchanged, "Ustaw nowe hasło".
- `email`: e.g. "Aktywuj konto" / "Kliknij przycisk poniżej, żeby potwierdzić adres e-mail i zacząć planować." / "Aktywuj konto".

The POST verifies with the submitted type. On success:
- `recovery` keeps today's behaviour: delete the reset cookie and go to `/auth/new-password`.
- `email` redirects to `/plan/month`.

**Contract**:
- The zod schema becomes `type: z.enum(["recovery", "email"])`.
- A malformed request with `type=email` redirects to `/auth/signin?error=signup_link_invalid`.
- A malformed request of any other kind keeps today's `/auth/forgot-password?error=reset_link_invalid`.
- A `verifyOtp` error with `type=email` redirects to `/auth/signin?error=<code>`, where `otp_expired` becomes our `signup_link_expired`.

Keep the page copy for the two types in one small lookup, not in scattered ternaries.

#### 4. Error vocabulary

**File**: `src/lib/auth-error-messages.ts` (+ `auth-error-messages.test.ts`)

**Intent**: Add the minted codes `SIGNUP_LINK_INVALID` and `SIGNUP_LINK_EXPIRED`, documented next to `RESET_LINK_INVALID`. Their messages say the activation link is broken or expired and tell the teacher to sign up again with the same address to get a new one.

Add `email_address_not_authorized`: "Nie możemy teraz wysłać wiadomości na ten adres. Spróbuj ponownie później albo napisz do nas: kontakt@temio.pl." It reaches the sign-up page directly. The reset request route swallows or forwards it according to its existing logic; check which, and make sure the wording reads correctly where it lands.

#### 5. Docs

**File**: `CLAUDE.md` (Auth flow)

**Intent**: One bullet: the sign-up confirmation uses the same `/auth/confirm` button page with `type=email`. Its template is `supabase/templates/confirmation.html` locally and lives in the dashboard (Confirm signup) in production.

### Success Criteria:

#### Automated Verification:

- Unit tests cover the new codes, including `email_address_not_authorized`, and a test proves `authErrorMessage("signup_link_expired")` is not the generic fallback: `npm test`
- The confirm route has tests: `src/pages/api/auth/confirm.test.ts` (new, mocking `locals.supabase` like `src/pages/api/day-plan/generate.test.ts`) covers:
  - `type=email` success → `/plan/month`;
  - `type=email` + `otp_expired` → `/auth/signin?error=signup_link_expired`;
  - `type=email` without a token → `signup_link_invalid`;
  - `type=recovery` success → `/auth/new-password`, unchanged;
  - an unknown `type` → `reset_link_invalid`.

  Run with `npm test`.
- The template's link uses the scanner-safe shape: `grep -c 'token_hash={{ .TokenHash }}&amp;type=email' supabase/templates/confirmation.html` prints `1`, and `grep -c 'ConfirmationURL' supabase/templates/confirmation.html` prints `0`.
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Locally, with `enable_confirmations = true` set temporarily and Supabase restarted: sign up, open the mail in Mailpit (`http://127.0.0.1:54324`), see the Polish template, open the link, see the "Aktywuj konto" button, press it, land signed in on `/plan/month`. Revert the toggle afterwards.
- The same link opened a second time → `/auth/signin` with the activation-specific message, not the reset one.
- Reset flow regression: request a reset, open the link, set a password; the behaviour matches the password-reset change.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Old-host redirect

### Overview

Once `temio.pl` is live, requests to the production `*.workers.dev` host redirect to `temio.pl`. The code is inert until two vars are set, so it can be merged and deployed before the domain exists.

### Changes Required:

#### 1. Pure redirect function

**File**: `src/lib/canonical-host.ts` (new) + `src/lib/canonical-host.test.ts`

**Intent**: Decide whether a request must move to the canonical origin, and where to.

**Contract**: `canonicalRedirect(url: URL, method: string, legacyHost: string | undefined, canonicalOrigin: string | undefined): { location: string; status: 301 | 308 } | null`.
- It returns `null` unless both vars are set and `url.hostname === legacyHost`, an **exact** match, so the preview hosts (`<id>-10x-preschool.<account>.workers.dev`) and `localhost` never match.
- `location` is `canonicalOrigin` plus the same path and query.
- `status` is 301 for GET/HEAD and 308 otherwise, which keeps the method.

#### 2. Env and middleware

**Files**: `astro.config.mjs`, `src/middleware.ts`

**Intent**: Declare `LEGACY_HOST` and `CANONICAL_ORIGIN` as `envField.string({ context: "server", access: "public", optional: true })`. They are not secrets; the values go into `wrangler.jsonc` `vars` in Phase 4. In `onRequest`, call `canonicalRedirect` **first**, before the Supabase client is built, and return the redirect when it is not `null`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`. `canonical-host.test.ts` covers:
  - GET on the legacy host → 301 with the path and query kept;
  - POST → 308;
  - a preview host → `null`;
  - `localhost` → `null`;
  - either var missing → `null`;
  - the canonical host itself → `null`, so there is no loop.
- The middleware calls the function before Supabase: `grep -n "canonicalRedirect(" src/middleware.ts` prints a line number smaller than `grep -n "createClient(" src/middleware.ts`.
- Lint and build pass: `npm run lint && npm run build`

#### Manual Verification:

- `npm run dev` with no vars set: the app behaves as before.
- Open the PR from `feat/temio-launch` (phases 1–3). CI and the `Workers Builds: 10x-preschool` check pass. On the preview URL, the logo, favicon and footer show Temio, and preview requests are not redirected.
- Merge to `master` (this deploys). Production on `*.workers.dev` shows Temio, and sign-in and reset still work.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Move `temio.pl` to Cloudflare and serve the app there

### Overview

Ops work in the OVH and Cloudflare dashboards, plus one small code commit that sets the redirect vars. Every step that touches DNS has an inventory and a check behind it.

### Changes Required:

#### 1. Inventory the OVH zone

**File**: `context/changes/temio-launch/dns-inventory.md` (new)

**Intent**: Export the OVH zone (OVH → Domain names → temio.pl → DNS zone → "Change in text format") and save it verbatim, with a table of the records that carry mail: MX, SPF TXT, any DKIM, `_dmarc`, `autodiscover`, `autoconfig` and SRV. Record whether DNSSEC is enabled at OVH. This file is the rollback.

#### 2. DNSSEC off at OVH (if on)

**Intent**: Turn off DNSSEC at OVH and wait until `dig DS temio.pl +short` returns nothing from a public resolver, or until the DS record's TTL (up to 24 h) has passed, before step 4.

#### 3. Cloudflare zone

**Intent**: Add `temio.pl` to the Cloudflare account (Free plan). Check that the imported records match the inventory **one by one**, and add any that were missed. Mail records (MX targets, `autodiscover` etc.) are DNS-only. Check that Speed → Optimization has no minification and no Rocket Loader enabled; both can break React island hydration (`context/foundation/infrastructure.md`, risk table).

#### 4. Nameservers at OVH

**Intent**: Replace OVH's nameservers with the two Cloudflare ones, and wait for Cloudflare to report the zone as **Active**.

#### 5. Mailbox check

**Intent**: Confirm that `kontakt@temio.pl` still receives external mail before going any further.

#### 6. Custom Domain and www

**Intent**: Workers & Pages → `10x-preschool` → Settings → Domains & Routes → add the Custom Domain `temio.pl`. For `www`, add a proxied `AAAA www 100::` record and a Redirect Rule (`www.temio.pl/*` → `https://temio.pl/${1}`, 301, preserving the query string). Then turn DNSSEC on in Cloudflare and add the DS record at OVH (the registrar).

#### 7. Redirect vars

**File**: `wrangler.jsonc`

**Intent**: Add `vars: { LEGACY_HOST: "10x-preschool.<account-subdomain>.workers.dev", CANONICAL_ORIGIN: "https://temio.pl" }`, with the subdomain read from the Cloudflare dashboard. This small commit goes through a PR (feature branch) and deploys on merge. Do not change `name`.

#### 8. Supabase URLs

**Intent**: Supabase dashboard → Auth → URL Configuration:
- Site URL: `https://temio.pl`;
- add `https://temio.pl/auth/confirm` to Redirect URLs.

Keep the workers.dev entry until Phase 5 is verified; a mail sent before the switch may still point there and will now redirect.

#### 9. Docs

**File**: `CLAUDE.md` (CI section)

**Intent**: Note that production is served at `https://temio.pl` through a Workers Custom Domain, and that the old `*.workers.dev` host redirects there through `LEGACY_HOST` / `CANONICAL_ORIGIN`.

### Success Criteria:

#### Automated Verification:

- The nameservers are Cloudflare's: `dig NS temio.pl +short` lists only `*.ns.cloudflare.com`.
- The mail records match the inventory: `dig MX temio.pl +short` and `dig TXT temio.pl +short` equal the MX and SPF rows in `dns-inventory.md`.
- The apex serves the app: `curl -sI https://temio.pl | head -1` → `HTTP/2 200`.
- `curl -sI "https://www.temio.pl/auth/signin?x=1"` → `301` with `location: https://temio.pl/auth/signin?x=1`.
- `curl -sI "https://10x-preschool.<account>.workers.dev/auth/signin?x=1"` → `301` with `location: https://temio.pl/auth/signin?x=1`.
- DNSSEC validates: `dig temio.pl +dnssec +short` returns an answer, and `dig DS temio.pl +short` is non-empty once step 6 is done.

#### Manual Verification:

- An external mailbox (e.g. Gmail) sends to `kontakt@temio.pl` after the NS change, and the mail arrives in OVH webmail.
- Sign in on `https://temio.pl`, generate and view a day; the React islands are interactive, which shows hydration is intact.
- A preview deployment URL still loads without being redirected.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Auth mail through Resend

### Overview

Supabase sends through Resend's SMTP as `Temio <kontakt@temio.pl>`, with both Polish templates in the dashboard. It's proven by delivery to an address outside the Supabase team.

### Changes Required:

#### 1. Resend domain

**Intent**: In Resend, add the domain `temio.pl` in the **EU (eu-west-1)** region. The region is fixed when the domain is created, and teachers' addresses are personal data. In Cloudflare, add the records it shows:
- MX and SPF TXT on `send.temio.pl`;
- DKIM TXT at `resend._domainkey.temio.pl`.

All of them are DNS-only. Wait for "Verified". Create an API key with **sending access** restricted to `temio.pl`.

#### 2. DMARC

**Intent**: If the inventory has no `_dmarc` record, add `TXT _dmarc.temio.pl "v=DMARC1; p=none; rua=mailto:kontakt@temio.pl"`. If OVH already had one, keep it unless it is stricter than `p=none` and OVH outbound mail is not aligned; record that decision in `dns-inventory.md`.

#### 3. Supabase SMTP and rate limit

**Intent**: Supabase → Auth → SMTP Settings:
- enable custom SMTP;
- host `smtp.resend.com`, port `465`, user `resend`, password = the Resend API key;
- sender email `kontakt@temio.pl`, sender name `Temio`.

Then Auth → Rate Limits: raise "emails sent per hour" from 30 to a value Resend's plan supports (e.g. 100).

#### 4. Dashboard templates

**Intent**: Auth → Email Templates:
- **Reset Password**: subject and body from the renamed `supabase/templates/recovery.html`.
- **Confirm signup**: subject and body from `supabase/templates/confirmation.html`.

This step goes after the Phase 1–3 deploy (see Critical Implementation Details). Then remove the old workers.dev entry from Redirect URLs.

#### 5. Close the follow-up

**File**: `context/archive/2026-10-03-password-reset/follow-ups/review-fixes.md`

**Intent**: Tick the "Custom SMTP is not configured in production" item and add a pointer to `temio-launch`.

### Success Criteria:

#### Automated Verification:

- The Resend records resolve: `dig TXT resend._domainkey.temio.pl +short` is non-empty, `dig MX send.temio.pl +short` is non-empty, and `dig TXT _dmarc.temio.pl +short` contains `v=DMARC1`.

#### Manual Verification:

- Reset request on `https://temio.pl` for a **non-team** address:
  - the mail arrives in the inbox (not spam) from `Temio <kontakt@temio.pl>`, in Polish, naming Temio;
  - the message's "Show original" shows SPF, DKIM and DMARC = PASS;
  - the link opens `https://temio.pl/auth/confirm?…&type=recovery`, and the new password works.
- Sign-up on `https://temio.pl` with a fresh non-team address: the Polish confirmation arrives, the link opens the "Aktywuj konto" page, the button lands signed in on `/plan/month`.
- Replying to the reset mail delivers the reply to `kontakt@temio.pl`.
- Resend's dashboard logs both sends as delivered.

---

## Testing Strategy

### Unit Tests:

- `auth-error-messages.test.ts`: the new codes resolve to their own Polish text, not the fallback.
- `confirm.test.ts` (new): both types × success / Supabase error / malformed input, with the redirect targets above.
- `canonical-host.test.ts` (new): exact host match only, path and query kept, 301 vs 308, inert without vars, no self-redirect.

### Integration Tests:

- None new. The auth flows depend on a real mailbox and the Supabase dashboard; they are covered by the manual checks in Phases 2 and 5.

### Manual Testing Steps:

1. Local sign-up with confirmations on, through Mailpit (Phase 2).
2. Preview and production on workers.dev after the merge (Phase 3).
3. External mail to `kontakt@temio.pl` after the NS change (Phase 4).
4. Reset and sign-up to a non-team address on `temio.pl`, with header inspection (Phase 5).

## Performance Considerations

The redirect check is a string comparison that runs before the Supabase client is created, so a redirected request costs no `getUser()` round trip. Everything else is static assets and copy.

## Migration Notes

- **Rollback, DNS:** put OVH's nameservers back at OVH. The OVH zone keeps its records, since we never delete them there, and `dns-inventory.md` holds a copy.
- **Rollback, mail:** turn custom SMTP off in Supabase, which brings back the built-in sender with its team-only limits.
- **Rollback, redirect:** remove `vars` from `wrangler.jsonc`.
- Existing sessions are tied to the workers.dev origin, so teachers sign in once more on `temio.pl`. That is acceptable at the current user count.

## References

- Change notes: `context/changes/temio-launch/change.md`
- Brand package: `context/foundation/design/design/README.md`, `context/foundation/design/src/components/ui/Logo.astro`, `context/foundation/design/public/`
- Follow-up being closed: `context/archive/2026-10-03-password-reset/follow-ups/review-fixes.md`
- Pattern to mirror: `src/pages/auth/confirm.astro`, `src/pages/api/auth/confirm.ts`, `src/pages/api/auth/forgot-password.ts:32`, `supabase/templates/recovery.html`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Rebrand in code

#### Automated

- [x] 1.1 No old name remains in src/scripts/supabase/public/package.json (grep seen red before, empty after) — 2aa7ea5
- [x] 1.2 Logo renders the "temio" wordmark — 2aa7ea5
- [x] 1.3 Lint passes — 2aa7ea5
- [x] 1.4 Unit tests pass — 2aa7ea5
- [x] 1.5 Build passes and emits sitemap-index.xml — 2aa7ea5

#### Manual

- [x] 1.6 Leaf logo and wordmark on landing, sign-in, sign-up, month at 390/768/1440 px
- [x] 1.7 Leaf favicon and `© 2026 Temio` in the public footer
- [x] 1.8 Logo link's accessible name reads Temio

### Phase 2: Polish sign-up confirmation

#### Automated

- [x] 2.1 Error-map tests cover the new codes and email_address_not_authorized — 77fece1
- [x] 2.2 confirm.test.ts covers both types, success, error and malformed input — 77fece1
- [x] 2.3 Template uses the token_hash&type=email link and no ConfirmationURL — 77fece1
- [x] 2.4 Lint passes — 77fece1
- [x] 2.5 Build passes — 77fece1

#### Manual

- [x] 2.6 Local sign-up through Mailpit activates and lands on /plan/month
- [x] 2.7 Reused activation link shows the activation-specific message on /auth/signin
- [x] 2.8 Reset flow regression passes

### Phase 3: Old-host redirect

#### Automated

- [x] 3.1 canonical-host tests pass — 34f143c
- [x] 3.2 Middleware calls canonicalRedirect before createClient — 34f143c
- [x] 3.3 Lint and build pass — 34f143c

#### Manual

- [x] 3.4 Dev without vars behaves as before
- [x] 3.5 PR checks green; preview shows Temio and is not redirected
- [x] 3.6 Merged to master; production on workers.dev shows Temio, sign-in and reset work

### Phase 4: Move temio.pl to Cloudflare and serve the app there

#### Automated

- [x] 4.1 NS records are Cloudflare's — ccf004b
- [x] 4.2 MX and SPF match dns-inventory.md
- [x] 4.3 https://temio.pl answers 200 — ccf004b
- [x] 4.4 www redirects to apex with path and query — ccf004b
- [x] 4.5 Legacy workers.dev host redirects to temio.pl with path and query — fdb42ed
- [x] 4.6 DNSSEC validates with DS at the registrar

#### Manual

- [x] 4.7 External mail reaches kontakt@temio.pl after the NS change
- [x] 4.8 Sign-in and generation work on temio.pl with interactive islands
- [x] 4.9 Preview URL is not redirected

### Phase 5: Auth mail through Resend

#### Automated

- [x] 5.1 Resend DKIM, send MX and DMARC records resolve — fdb42ed

#### Manual

- [x] 5.2 Reset to a non-team address: inbox, Polish, SPF/DKIM/DMARC pass, link works
- [x] 5.3 Sign-up to a non-team address: Polish confirmation activates and signs in
- [x] 5.4 Reply to the auth mail reaches kontakt@temio.pl
- [x] 5.5 Resend logs both sends as delivered
