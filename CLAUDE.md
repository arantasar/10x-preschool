# Rules for AI

## Git

**Every product slice from S-03 (`week-generation`) onwards starts on a feature branch.** Before the _first_ commit of a new change, run `git branch --show-current`; if it says `master`, branch first. This is not conditional on the size of the change.

F-01 and earlier work was committed straight to `master` by design. S-01 and S-02 were not — they landed on `master` against the convention and it went unnoticed until the S-02 implementation review, which is why the rule is written down here rather than left as a habit.

Exceptions: edits to `context/foundation/*`, and closing out a slice already in progress on `master`.

## Commands

- `npm run dev` — start dev server (Cloudflare workerd runtime)

- `npm run build` — production build (SSR via `@astrojs/cloudflare`)

- `npm run preview` — preview production build

- `npm run lint` — ESLint with type-checked rules

- `npm run lint:fix` — auto-fix lint issues

- `npm run format` — Prettier (includes prettier-plugin-astro + prettier-plugin-tailwindcss)

Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

**Temio** (`temio.pl`) — a preschool lesson planner. **Astro 6 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers.

### Rendering mode

Full server-side rendering `output: "server"` in astro.config.mjs). All pages are server-rendered by default. API routes must export `const prerender = false`.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`).

- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.

- API endpoints: `src/pages/api/auth/{signin,signup,signout,forgot-password,confirm,update-password}.ts`

- Auth pages: `src/pages/auth/{signin,signup,confirm-email,forgot-password,confirm,new-password}.astro` and `src/pages/auth/forgot-password/sent.astro`

- Password reset: the recovery e-mail links to `/auth/confirm?token_hash=…&type=recovery` (built from `{{ .RedirectTo }}`); `GET /auth/confirm` only renders a button, `POST /api/auth/confirm` calls `verifyOtp` — so a mailbox scanner's prefetch cannot spend the token, and the link works on any device. The template lives in `supabase/templates/recovery.html` locally and in the Supabase dashboard (Auth → Email Templates → Reset Password) in production; the redirect allow-list must contain `/auth/confirm` of every origin, or Supabase silently falls back to Site URL and the link breaks.

- Sign-up confirmation: the same `/auth/confirm` button page with `type=email` (the link is built from `signUp`'s `emailRedirectTo`). A good token lands the teacher signed in on `/plan/month`; a bad one goes to `/auth/signin?error=signup_link_{invalid,expired}`, never to the reset page. The template is `supabase/templates/confirmation.html` locally and lives in the dashboard (Auth → Email Templates → Confirm signup) in production.

- Account settings: `src/pages/ustawienia.astro` (protected — `SETTINGS_PATH` in `PROTECTED_ROUTES`), built on `src/components/account/SettingsLayout.astro`, with three cards: Konto, Zmień hasło, and Usuń konto (danger-coloured menu item → `#usun-konto`). It is reached through the account menu in `AppHeader` (`src/components/account/AccountMenu.tsx`, a Radix dropdown island), which also holds Pomoc, Kontakt and Wyloguj się; the header bar itself shows only the avatar and no address.

- Password change: `POST /api/auth/change-password` first **re-signs in** with `signInWithPassword` using the session's own e-mail (never an address from the form), then `updateUser({ password })`, then `signOut({ scope: "others" })`. The re-sign-in is not optional: `secure_password_change` is on, and GoTrue refuses `updateUser` from a session older than 24 h with `reauthentication_needed`. Only a fresh session gets through, and teachers stay signed in for days. A wrong current password becomes our `current_password_invalid`, never the sign-in wording. Like sign-out, the form has no CSRF token: it rests on `security.checkOrigin` in `astro.config.mjs`, which must stay on.

- Account deletion: `POST /api/auth/delete-account` (card `src/components/account/DeleteAccountForm.tsx`, danger window `deleteAccountConfirmation` in `src/lib/confirmations.ts`). Order is the contract: re-sign-in with the **session's** e-mail (wrong password → `current_password_invalid`) → `rpc("delete_own_account")` (failure → `account_delete_failed`, nothing deleted) → `signOut({ scope: "local" })` (an error is only logged) → one-shot `account_deleted` cookie → `/` with a notice. `public.delete_own_account()` is the **only `security definer` function and the only operation above RLS** in the product: it takes **no id argument** and deletes `auth.users where id = auth.uid()` — never add a parameter that names a user — and it refuses unless the JWT's `session_id` names the caller's own session created in the last 5 minutes, so a stolen token cannot skip the password by calling `/rest/v1/rpc` directly (the route's re-sign-in is that fresh session). Plans, activities and sessions go by cascade; `contact_messages` are kept (`on delete set null`, 12-month retention — S-20 must describe it). Errors use `?delete_error=<code>#usun-konto`, because `?error=` on `/ustawienia` belongs to the password form. No per-account attempt limit, by decision — revisit at S-25. The migration must reach the hosted project (`npx supabase db push`) with the merge, or the route answers `account_delete_failed`.

- Home screen of the signed-in app: `src/pages/plan/month.astro` (protected via the `/plan` prefix in `PROTECTED_ROUTES`; `/` redirects a signed-in user there)

### Planner shell

- `src/layouts/PlannerLayout.astro` — the shell of every signed-in screen (`/plan`, `/plan/week`, `/plan/month`, `/ustawienia`): it wraps `Layout.astro`, renders `src/components/AppHeader.astro` across the full width and takes an optional `active: "plan" | "generate" | "account"` (month → `plan`, week and day → `generate`, settings → `account`, which marks the account-menu trigger as current). A new signed-in screen uses this layout rather than `Layout.astro` directly.

### Public help and contact

- Pages: `/pomoc` (FAQ, data in `src/lib/faq.ts` — every answer must be true today), `/kontakt` (form island `src/components/contact/ContactForm.tsx`), `/kontakt/wyslano`. Public pages use `MarketingHeader` + `SiteFooter`; signed-in teachers reach `/pomoc` through „Pomoc” in `AppHeader`.
- `POST /api/contact` runs a fixed pipeline: parse → honeypot (answers like success) → zod (`src/lib/contact-form.ts`) → config → bot check → **store** → mail → `{ ok }`. Storing comes before mailing, so a failed mail never loses a message.
- **`verifyHumanToken` (`src/lib/services/bot-check.ts`) is the bot check for every public form** that takes data from people without an account — the founding-price sign-up (S-22) calls it with its own `action`. It checks `action` and the request's own hostname; Turnstile's test keys answer without either, so only testing-key results may skip them (a testing-key result on the canonical host logs `contact.bot_check_testing_key`).
- `public.contact_messages` is **insert-only** for `anon` and `authenticated`: insert without `.select()` (a read-back is `insert … returning` and fails). Rows are deleted after 12 months by the `contact-messages-retention` pg_cron job. The bot check lives in the route, not in the database: the table is safe from direct PostgREST inserts only because `SUPABASE_KEY` is server-only — before exposing that key to a browser, move the insert behind the service role.
- The `send_email` binding (`EMAIL` in `wrangler.jsonc`) is read only in `src/lib/services/email-binding.ts`, which route tests mock — Vitest cannot resolve `cloudflare:workers`.
- Secrets: `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `CONTACT_TO` (all `access: "secret"`, read at runtime). Locally: Turnstile's always-pass test keys and no `CONTACT_TO`, so no mail leaves the machine.

### Fair use

- **Every route that calls a model goes through `claimGeneration` / `finishGeneration`** (`src/lib/services/fair-use.ts`): claim before the model (`allowed: false` → `fairUseExceeded(resetsOn)`, a 429 with `limit.resets_on`; islands add „Napisz do nas” via `isLimitBody`), then `"succeeded"` or `"failed"` after. Today: `generate.ts` (claim after both conflict refusals; a failed save is `failed`), `week/day.ts`, `week/outline.ts` (`outline` counts no day, is refused at 0 days left and counts against the `refine` ceiling), `refine.ts` (its own `refine` family). A new model-calling route without the claim is a hole in the limit.
- The ledger is `public.generation_ledger`, counted by `public.claim_generation()` under a per-account advisory lock, monthly in Europe/Warsaw. It is **insert + `update (status)` only**, with a trigger admitting just `reserved → succeeded | failed`, and the function is **`security invoker`, not definer**: anything the route does with the teacher's token she can do herself via `/rest/v1/rpc`, so a definer would close nothing and would break the „only definer is `delete_own_account`” invariant. Failed calls are refunded only up to `FAIR_USE_REFUNDS_PER_MONTH`; the limits are RPC arguments because an inflated limit sent directly calls no model.
- **Fail-open, in `fair-use.ts` only**: any ledger or config failure means „allowed, no reservation” plus a log (`fair_use.claim_failed`, `fair_use.finish_failed`, `fair_use.config_invalid`). Routes carry no ledger error handling of their own (Guardrail 1).
- Config: `FAIR_USE_DAYS_PER_MONTH` (150), `FAIR_USE_REFINES_PER_MONTH` (300), `FAIR_USE_REFUNDS_PER_MONTH` (30), `FAIR_USE_MODE` (`enforce` | `observe`) — `envField.string`, `access: "secret"`, parsed in the service, changeable without a deploy.
- Rows are kept 13 months (`generation-ledger-retention` pg_cron job) and go by cascade with the account (Polityka prywatności pkt 2.7). The migration must reach the hosted project (`npx supabase db push`) with the merge — without it the limit falls silent (fail-open, `fair_use.claim_failed` on every generation) rather than breaking generation.
- **Per-account overrides** live in `public.fair_use_overrides` (one row per account: `days_per_month`, `refines_per_month`, `valid_until`; `null` in a limit = no ceiling for that family; `valid_until` inclusive, Europe/Warsaw). It is **read-only for the API** — a teacher selects her own row and writes none; rows are written only in the dashboard SQL Editor, never in a migration, test or doc, because the repository is public. `claim_generation` reads the row after the advisory lock; the order of limit sources is override → account plan (`S-23` adds this one, as a source, without reworking the function) → the `FAIR_USE_*` arguments. The ledger still records every call of an account without a ceiling. Expired rows go via the `fair-use-overrides-expiry` pg_cron job, the account's row by cascade (Polityka prywatności pkt 2.7).

### Key conventions

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).

- **Astro components** for static content/layout; **React components** only for elements that need `useState`, `useReducer`, or direct DOM event handlers (click, input, submit). Use Astro for everything else, including components that only display data passed as props.

- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.

- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`.

- **API routes**: use uppercase `GET`, `POST` exports; validate input with zod.

- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies.

- **React**: no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.

- **Services/helpers** go in `src/lib/`. Move to `src/lib/services/` when a function touches more than one Supabase table, or when the same logic is called from more than one API route.

- **Shared types** (entities, DTOs) go in `src/types.ts`.

- **Confirmations go through `useConfirmDialog`** (`src/components/hooks/useConfirmDialog.tsx`), never `window.confirm`. What the window says — title, paragraphs, both button labels, tone — is a `ConfirmationRequest` built in `src/lib/` (`confirmations.ts`, `week-day-controls.ts`, `week-generation.ts`) and unit-tested there; buttons are named after the outcome ("Usuń plan" / "Zostaw"), and `tone: "danger"` marks an operation that cannot be undone. The window is asynchronous and does not freeze the page: check the operation's lock before `await confirm(…)` **and again after it** (`design-planner`, 2026-09-30).

- **Plan state is „zatwierdzony” / „do przejrzenia” in the UI** — in visible text, accessible names, API error sentences and PDF prints alike; the verb is „Zatwierdź”, the noun „zatwierdzenie”. The code and the database keep `accepted` / `accepted_at`. „Zaakceptowany”, „roboczy” (as a plan state) and „Akceptuj” are the pre-`design-planner` wording and must not come back; „dzień roboczy” (a working day, Mon–Fri) is unrelated and stays. Accepting the Regulamin at sign-up („Akceptuję Regulamin”, „Zaakceptuj Regulamin”, `terms_not_accepted`) is not plan state either and stays.

- **UI copy is Polish** — every string a user sees, on both sides of the login threshold (`pl-landing-copy`, 2026-08-30). `src/layouts/Layout.astro` declares `lang="pl"`. No i18n layer and no second language: strings live at their point of use. **Auth errors are the one indirect case**: `?error=` on `/auth/{signin,signup}` carries a short _code_ — Supabase's `error.code`, or `config_missing` / `connection_failed` which we mint ourselves — and never a sentence. The two pages translate it at render through `src/lib/auth-error-messages.ts`; to cover a new Supabase code, add an entry to the map in that file. Anything unmapped falls back to a generic Polish message. Free text in `?error=` is a bug, not a shortcut: it puts Supabase's English in front of a teacher, and it lets a hand-crafted link render an arbitrary sentence inside our own error box (`supabase-error-copy`, 2026-08-31).

### Environment

- Node.js version: see `@.nvmrc`

- Env var names: see `@.env.example`. Copy to `.env` for Node or `.dev.vars` for Cloudflare local dev. Cloudflare local dev: secrets go in `.dev.vars` (gitignored — this is easy to miss).

- Local Supabase: `npx supabase start` (requires Docker)

- Manual deploy: `npx wrangler deploy` (requires Cloudflare account + `wrangler` auth). Rarely needed — see the CI section: `master` deploys itself.

## CI

**Two independent systems watch this repo, and only one of them is in `.github/`.**

1. **GitHub Actions** — `@.github/workflows/ci.yml`, on push to `master` and on PRs against it. Runs `npm ci`, `astro sync`, `npm run lint`, `npm run build`. Requires `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets for the build step. **Does not deploy.**

2. **Cloudflare Workers Builds** — connected to the repo through the Cloudflare dashboard, not through a file in this repo. It builds and **deploys the `10x-preschool` worker to `production`** when `master` changes, and posts a `Workers Builds: 10x-preschool` check on PRs. There is no YAML for it here; `wrangler.jsonc` names the worker and carries the redirect `vars` (below), and the build settings live in the dashboard.

**Production is `https://temio.pl`**, served through a Workers Custom Domain (the `temio.pl` zone is in Cloudflare; mail for `kontakt@temio.pl` stays at OVH through DNS-only MX records). `www.temio.pl` redirects to the apex through a Cloudflare Redirect Rule. The old `10x-preschool.janusz-guzowski.workers.dev` host redirects to `temio.pl` in the middleware (`src/lib/canonical-host.ts`), driven by `LEGACY_HOST` / `CANONICAL_ORIGIN` in `wrangler.jsonc` `vars`. Those two are declared `access: "secret"` in `astro.config.mjs` even though they are not secret: Astro inlines `public` server variables at build time, when Workers Builds has no `vars`.

**Merging to `master` ships to production.** Nothing else has to be run, and there is no approval step between the merge and the live worker. Reading `ci.yml` alone gives the opposite impression — it has no deploy step — which is exactly the trap: the deploy lives outside the repo. Treat a `master` merge as a release, not as an integration.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 4 (E2E Tests)

**For E2E tests, use the `/10x-e2e` skill.** It is the single source of truth
for the workflow — risk → seed test + rules → generate → review against the five
anti-patterns → re-prompt → verify. The skill's `references/` carry the full
rules, anti-patterns, seed pattern, and prompt-template.

A few hard rules that hold even before you invoke the skill:

- **Locators:** `getByRole` / `getByLabel` / `getByText` first; `getByTestId`
  only when accessibility attributes are ambiguous. Never CSS selectors, XPath,
  or DOM structure.
- **Never `page.waitForTimeout()`.** Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- **Test independence + cleanup.** Each test runs standalone — its own setup,
  action, assertion, and cleanup; unique ids (timestamp suffix) so parallel runs
  and re-runs don't collide.

Two boundaries to keep straight:

- **DOM (snapshot) is the default.** Vision (`--caps=vision`) is a supplement for
  visual-only risks (layout, z-index, animation); for pixel regression prefer
  deterministic tools (`toMatchSnapshot`, Argos, Lost Pixel). VLM model
  selection/cost is a debugging topic (Lesson 5), not testing.
- **Healer helps on selectors, harms on logic.** A changed selector → healer
  re-finds it (route through PR review). A changed business behavior → healer
  masks the bug; that failing-test-to-fix case is Lesson 5.

<!-- END @przeprogramowani/10x-cli -->
