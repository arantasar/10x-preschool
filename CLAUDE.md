# Rules for AI

## Git

**Every product slice from S-03 (`week-generation`) onwards starts on a feature branch.** Before the *first* commit of a new change, run `git branch --show-current`; if it says `master`, branch first. This is not conditional on the size of the change.

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

- Protected page example: `src/pages/dashboard.astro`

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

### Environment

- Node.js version: see `@.nvmrc`

- Env var names: see `@.env.example`. Copy to `.env` for Node or `.dev.vars` for Cloudflare local dev. Cloudflare local dev: secrets go in `.dev.vars` (gitignored — this is easy to miss).

- Local Supabase: `npx supabase start` (requires Docker)

- Deploy: `npx wrangler deploy` (requires Cloudflare account + `wrangler` auth)

## CI

See `@.github/workflows/ci.yml`. Requires `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets for the build step.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 5

Scale the single-change cycle into parallel work with **worktrees, goal-directed delegation, and multi-session orchestration**:

```
worktree per change -> /goal or claude -p -> PR -> review -> merge
```

The lesson focus is safe throughput: isolated contexts, choosing the right execution mode, and capping parallelism at review capacity.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code isolation** | |
| `git worktree add` | You need a separate working directory for a parallel change. One change per worktree, one fresh agent context per worktree. |
| **Complex changes** | |
| `/10x-implement <change-id> phase <n>` | The change has multiple phases, needs manual gates, or benefits from interactive decision-making during execution. |
| **Simple changes** | |
| `/goal` | You have a clear, bounded task and want goal-directed delegation. The agent works autonomously toward the stated goal with a stop condition. |
| `claude -p` | You want headless execution for a well-defined task. The Ralph Wiggum loop (run, check, retry) is the universal autonomous pattern. |
| **Multi-session orchestration** | |
| Superset / Conductor / Antigravity / VS Code Agent View | You are running multiple agent sessions in parallel and need visibility, coordination, or session management across them. |

### Parallel work rules

- One change per worktree or isolated workspace. One fresh agent context per change.
- Choose interactive `/10x-implement` for complex changes, `/goal` or `claude -p` for simple ones.
- Parallelism is capped by review capacity. More agents without review means more unreviewed code, not higher throughput.
- The quality pain from faster shipping is intentional — it bridges into Module 3 testing gates.

### Lesson boundaries

- Do not reteach interactive `/10x-implement` or `/10x-impl-review`; those are Lessons 2 and 3.
- Do not introduce testing strategy here. The quality pain is the motivation for Module 3.
- Worktrees are a mechanism for isolation, not the topic of a full git tutorial.

### Paths used by this lesson

- `context/changes/<change-id>/` - active change folder
- `context/changes/<change-id>/plan.md` - implementation input for any execution mode

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
