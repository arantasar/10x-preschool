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

## 10xDevs AI Toolkit - Module 3, Lesson 2

Lesson 2 is about **writing tests that actually protect code** — not just maximise coverage. The oracle problem and vibe-testing anti-patterns explain why LLM-generated tests fail on real code; the risk-first quality contract from Lesson 1 is the fix.

```
context/foundation/test-plan.md (§3 Phased Rollout)
        │
        ▼  (one rollout phase at a time)
   /10x-research  ──►  research.md  (oracle source: what code should do, not what it does)
        │
        ▼
   /10x-plan  ──►  plan.md  (cost × signal, two-layer strategy, ordered phases)
        │
        ▼
   /10x-implement  or  /10x-tdd   ──►  working tests + §6 cookbook update
```

`/10x-tdd` is an **optional test-first mode**, not a replacement for the chain. It reads the same `plan.md`, writes to the same `## Progress` section, and covers the same phases as `/10x-implement`. Use it only when you can name the first failing assertion before writing any code.

### Task Router — Where to start

| Skill / Prompt               | Use it when                                                                                                                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/10x-research`              | Before writing any test for a risk. Research produces the oracle — what behaviour a test must prove — from sources (PRD, tech-stack, docs), not from the implementation shape. Also reveals whether a risk is already covered or has two separate faces (one safe, one real).                     |
| `/10x-plan`                  | Research is done. Plan decomposes the risk into ordered phases: environment setup first, then rules that depend on it, then hermetic stubs for failures that real infra cannot trigger, then cookbook update. Each phase names the behaviour it asserts and the regression it catches.            |
| `/10x-implement`             | Default executor for plan phases. Use for environment setup, existing code, scaffolding, and any phase where you cannot define a red test before writing code.                                                                                                                                    |
| `/10x-tdd`                   | Optional. Use instead of `/10x-implement` for a phase where you can name the first red test in one sentence. Agent writes the failing test first, then the minimal code to green it, then refactors. Stops at the assertion before touching the implementation — that pause is the point.         |
| `m3l2-ad-hoc-testing` prompt | You have a single file and want tests now, without the full research→plan→implement cycle. The prompt forces oracle-from-sources (reads PRD + TECH_STACK before asserting), behavioural assertions, edge cases from risk, and a regression table. Use it knowing you are trading depth for speed. |

### When to use `/10x-tdd` vs `/10x-implement`

The deciding question: _Can you name the first red test in one sentence?_

Good conditions for `/10x-tdd`:

- "promuje wyłącznie drafty w stanie `accepted`, a `pending`/`rejected` nigdy nie trafiają do talii"
- "zwraca `ok: true` i loguje `orphan_review_state`, gdy upsert stanu powtórek padnie w trakcie zapisu"
- "zwraca 401, gdy użytkownik nie ma dostępu do kursu"
- "resetuje interwał powtórki do jednego dnia, gdy ocena wynosi 0"

Each of these names an observable outcome, not an internal detail. If you cannot produce a sentence like this, stay on `/10x-implement` or return to `/10x-research`.

`/10x-tdd` is **not suited** for: environment setup, CI/CD config, documentation, thin wiring where the test would just rewrite the implementation, or a spike where you are still discovering the contract.

You can mix both modes in one plan:

```
/10x-implement <change-id> phase 1   # environment
/10x-tdd       <change-id> phase 2   # contract (new code)
/10x-tdd       <change-id> phase 3   # contract (API endpoint)
/10x-implement <change-id> phase 4   # cookbook + plan sync
```

Both write progress to the same `## Progress` section in `plan.md`.

### Two-layer test strategy (cost × signal)

For each risk, pick the **cheapest test that gives a real signal**. Do not default to e2e "because it's safest", and do not chase coverage percentage.

| Layer                              | When to use                                                                                              | When NOT to use                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Integration (real DB / real infra) | The rule involves DB constraints, cascades, real SQL, or unique constraints that a mock would lie about. | Auth flows gated by RLS that belong to a separate phase; anything where setup cost exceeds signal value. |
| Hermetic (stub client)             | Partial failures that real infra cannot trigger easily (e.g. second operation in a sequence fails).      | Rules that depend on actual DB state — a stub will lie about constraint violations and cascades.         |

A non-atomic save sequence (multiple independent operations without a transaction) means: write hermetic tests for partial-failure branches, not integration tests that force a mid-sequence error.

### Oracle rules

- The oracle — what the code _should_ do — must come from sources: PRD, docs, tech-stack constraints, domain knowledge. It must **not** come from reading the implementation.
- If the implementation has a bug, copying its output as the expected value produces a mirror test that passes against the bug.
- When sources do not resolve the expected behaviour unambiguously, **stop and ask** rather than guessing.
- Research's job is to surface the oracle before any test is written.

### Vibe-testing anti-patterns to avoid

| Anti-pattern          | How it looks                                                                  | What to do instead                                                                               |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Mirror implementation | Assertion computes the expected value with the same logic as the tested code. | Assert against a value derived from the oracle (PRD / domain rule), not from the implementation. |
| Happy paths only      | Tests only pass valid inputs; edge cases absent.                              | Add at least one edge case per risk: `null`, empty, dependency error, invalid input.             |
| Redundant copies      | Six nearly identical tests checking the same absence of a sentinel.           | One parameterised test (`it.each`) per property; each test catches a different regression.       |

### Mutation testing (Stryker) — selective quality gate

Coverage says "this line was executed". Mutation score says "would a test fail if I broke this line?" Use Stryker as a **selective gate** after a risk phase, not as a CI gate on every commit.

Workflow:

1. Tests pass for the risk phase.
2. Run `npx stryker run --mutate "path/to/file.ts"` (narrow scope to the changed module).
3. Open the HTML report; find survived mutants.
4. For each survived mutant ask: "Would this change hurt a user or the business?"
   - Yes → add an assertion that kills the mutant.
   - No (equivalent mutant or cosmetic change) → ignore consciously.
5. Do not chase 100% mutation score. A test that pins implementation details to kill a cosmetic mutant is itself a vibe test.

The integration gate can stay **ad hoc** (not on every commit) when running local infra is expensive. Mark it accordingly in `test-plan.md §4`.

### Lesson boundaries

- Do not configure hooks, hook lifecycle, or debugging hooks. That is Lesson 3.
- Do not configure MCP servers, Playwright API, e2e code, or multimodal scenario code. That is Lesson 4.
- Do not run the bug-to-fix-to-regression-test workflow. That is Lesson 5.
- Do not author CI/CD pipelines from scratch. That is Module 1 Lesson 5 / Module 2 Lesson 5.
- Do not run `/10x-test-plan` to change the risk strategy. That is Lesson 1. Use `/10x-test-plan --status` to read current state.
- Do not write tests without a research step unless using the ad-hoc prompt with full awareness of its trade-offs.

### Paths used by this lesson

- `context/foundation/test-plan.md` — §3 rollout state; §6 cookbook (filled in as phases ship)
- `context/changes/<change-id>/research.md` — oracle source per rollout phase
- `context/changes/<change-id>/plan.md` — ordered phases with `## Progress` as execution state
- `.claude/prompts/m3l2-ad-hoc-testing.md` — ad-hoc file-level testing prompt

<!-- END @przeprogramowani/10x-cli -->
