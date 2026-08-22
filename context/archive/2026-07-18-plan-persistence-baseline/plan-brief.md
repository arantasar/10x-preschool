# Minimalny schemat przechowywania planów z izolacją RLS per konto — Plan Brief

> Full plan: `context/changes/plan-persistence-baseline/plan.md`

## What & Why

Roadmap item **F-01**: create the project's first data layer — a schema storing one plan per teacher per day (hasło, generated activity proposals, accepted state) with RLS policies that scope every row to its owning account. The PRD's privacy NFR says one teacher's plans must be invisible to other users; that guarantee has to live in the database, not in application code, before S-02 and S-03 write anything.

## Starting Point

There is no data layer at all — `supabase/` holds only `config.toml`, with no `migrations/`, no tables, and no `src/types.ts`. Auth is already complete and is the RLS anchor: the cookie-based SSR client forwards the user's JWT, so `auth.uid()` resolves inside policies. Notably, local dev currently points at the **production** Supabase project (same URL in `.env` and `.dev.vars`), the CLI is unlinked, and no local stack has ever been started.

## Desired End State

Day plans and their activities live in Postgres, structurally invisible across accounts. A pgTAP suite proves account A cannot read, insert, update, or delete account B's rows on either table. S-02 and S-03 have typed entities and DTOs to import, and the already-deployed app keeps serving auth without regression.

## Key Decisions Made

| Decision                | Choice                                                   | Why (1 sentence)                                                                                                                              |
| ----------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema shape            | Two tables: `day_plans` + `activities`                   | Per-activity edit and ordering with typed columns, rather than rewriting a JSONB document on every change.                                    |
| Undo after regeneration | Generation counter on rows                               | Undo becomes a single integer update — no rows move and everything stays relational under one RLS pattern.                                    |
| Draft vs accepted       | Nullable `accepted_at timestamptz`                       | One column carries both the state and the audit fact, with no enum to migrate later.                                                          |
| Child-table ownership   | Own `user_id` + composite FK to `day_plans(id, user_id)` | Both tables get the identical `auth.uid() = user_id` policy with no subquery, and the FK makes an ownership mismatch structurally impossible. |
| Scope                   | Migration + generated types + `src/types.ts`             | Gives downstream slices a typed contract without inventing a service API that has no caller yet.                                              |
| Migration delivery      | Push straight to the hosted project                      | One database, no drift — the app already points there.                                                                                        |
| Isolation proof         | pgTAP via `supabase test db`                             | The only repeatable regression net for the one property F-01 exists to guarantee, and it needs no JS test infrastructure.                     |
| Local stack role        | Test harness only                                        | Reconciles the two above: pgTAP cannot run against the hosted project, so the stack exists purely to verify before pushing.                   |

## Scope

**In scope:** the migration (both tables, constraints, indexes, 16 RLS policies), the pgTAP isolation suite, generated DB types, `src/types.ts` domain entities/DTOs, and the production push.

**Out of scope:** service layer, API routes, UI, calendar, LLM generation, `PROTECTED_ROUTES` changes, generation history beyond one step, and switching local dev off the hosted database.

## Architecture / Approach

`day_plans` is the parent (one per `user_id` + `plan_date`, holding the prompt, `current_generation`, and `accepted_at`). `activities` is the child, carrying `title`, `description`, `ordinal`, a `generation`, and a denormalized `user_id` bound to the parent by a composite foreign key. Reading "current activities" means joining `activities.generation = day_plans.current_generation`; the previous batch stays resident so undo is a decrement. Every table gets four `authenticated` policies predicated on `auth.uid() = user_id` plus four explicit `anon` deny policies, so an absent policy is never ambiguous. `anon` additionally has its table grants revoked, so anonymous access fails with `insufficient_privilege` (`42501`) before RLS is ever consulted — pgTAP must assert that with `throws_ok`, not a row count.

## Phases at a Glance

| Phase                  | What it delivers                                             | Key risk                                                   |
| ---------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| 1. Schema migration    | First migration: both tables, constraints, RLS + 16 policies | A policy that looks right but omits `with check` on insert |
| 2. RLS isolation suite | pgTAP specs proving cross-account access fails               | Tests that pass vacuously without exercising policies      |
| 3. Typed contract      | Generated DB types + `src/types.ts` entities/DTOs            | Types drift, since nothing imports them yet                |
| 4. Production push     | Migration applied to the live database                       | Irreversible; no down-migration mechanism exists           |

**Prerequisites:** Docker running (for the local stack), `supabase login`, and the hosted project's database password for linking.
**Estimated effort:** ~1–2 sessions across 4 phases; phases 1–3 are local and reversible.

## Open Risks & Assumptions

- Assumes the hosted database has no pre-existing `public` tables or migration history — checked explicitly in Phase 4 before pushing.
- Nothing in the app imports the new types when this lands, so schema/type drift won't surface until S-02 begins.
- The generation filter is an invariant a future reader can forget; it's encoded in the DTO read model, but not enforced by the database.
- After the Phase 4 push, rollback requires a new `drop table` migration rather than an undo.

## Success Criteria (Summary)

- `npx supabase test db` passes, demonstrating no cross-account read or write path on either table.
- The migration is applied to production and `npx supabase migration list --linked` confirms it.
- The live app still serves `/`, `/auth/signin`, and the `/dashboard` redirect, and real sign-in still works.
