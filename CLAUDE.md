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

**Astro 6 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui components. Deployed to Cloudflare Workers.

### Rendering mode

Full server-side rendering `output: "server"` in astro.config.mjs). All pages are server-rendered by default. API routes must export `const prerender = false`.

### Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`).

- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.

- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`

- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`

- Home screen of the signed-in app: `src/pages/plan/month.astro` (protected via the `/plan` prefix in `PROTECTED_ROUTES`; `/` redirects a signed-in user there)

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

- **UI copy is Polish** — every string a user sees, on both sides of the login threshold (`pl-landing-copy`, 2026-08-30). `src/layouts/Layout.astro` declares `lang="pl"`. No i18n layer and no second language: strings live at their point of use. **Auth errors are the one indirect case**: `?error=` on `/auth/{signin,signup}` carries a short _code_ — Supabase's `error.code`, or `config_missing` / `connection_failed` which we mint ourselves — and never a sentence. The two pages translate it at render through `src/lib/auth-error-messages.ts`; to cover a new Supabase code, add an entry to the map in that file. Anything unmapped falls back to a generic Polish message. Free text in `?error=` is a bug, not a shortcut: it puts Supabase's English in front of a teacher, and it lets a hand-crafted link render an arbitrary sentence inside our own error box (`supabase-error-copy`, 2026-08-31).

### Environment

- Node.js version: see `@.nvmrc`

- Env var names: see `@.env.example`. Copy to `.env` for Node or `.dev.vars` for Cloudflare local dev. Cloudflare local dev: secrets go in `.dev.vars` (gitignored — this is easy to miss).

- Local Supabase: `npx supabase start` (requires Docker)

- Manual deploy: `npx wrangler deploy` (requires Cloudflare account + `wrangler` auth). Rarely needed — see the CI section: `master` deploys itself.

## CI

**Two independent systems watch this repo, and only one of them is in `.github/`.**

1. **GitHub Actions** — `@.github/workflows/ci.yml`, on push to `master` and on PRs against it. Runs `npm ci`, `astro sync`, `npm run lint`, `npm run build`. Requires `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets for the build step. **Does not deploy.**

2. **Cloudflare Workers Builds** — connected to the repo through the Cloudflare dashboard, not through a file in this repo. It builds and **deploys the `10x-preschool` worker to `production`** when `master` changes, and posts a `Workers Builds: 10x-preschool` check on PRs. There is no YAML for it here; `wrangler.jsonc` only names the worker.

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
