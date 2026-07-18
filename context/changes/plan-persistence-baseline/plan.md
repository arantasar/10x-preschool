# Minimalny schemat przechowywania planów z izolacją RLS per konto — Implementation Plan

## Overview

Create the project's first data layer: a two-table schema (`day_plans` → `activities`) that stores one plan per teacher per day — the teacher's hasło, the generated activity proposals, and an explicit accepted state — with per-operation, per-role RLS policies that scope every row to its owning account.

This is roadmap item **F-01**, a foundation with no user-visible surface. Its entire deliverable is a schema contract plus a proven isolation guarantee that `edit-accept-day-plan` (S-02) and `week-generation` (S-03) build against.

## Current State Analysis

- **No data layer exists.** [supabase/](supabase/) contains only `config.toml` — no `migrations/` directory, no tables, no generated DB types. `src/types.ts` (the convention named in CLAUDE.md) does not exist either.
- **Auth is complete and is the RLS anchor.** [supabase.ts:9-23](src/lib/supabase.ts#L9-L23) builds a cookie-based `@supabase/ssr` server client that forwards the user's JWT on every request, so `auth.uid()` resolves correctly inside policies. [middleware.ts:10-16](src/middleware.ts#L10-L16) already resolves the user onto `context.locals.user`.
- **Local dev points at production.** Both `.env` and `.dev.vars` hold the same hosted `https://tpon….supabase.co` URL, and per [deploy-plan.md:22](context/deployment/deploy-plan.md#L22) that same project backs the live Cloudflare Workers deployment. The Supabase CLI is **not linked** (no `supabase/.temp`), and no local stack is in use today.
- **Postgres 17** per `supabase/config.toml:36`; local stack ports are configured (API 54321, DB 54322, Studio 54323) but have never been started for this project.
- **No test infrastructure of any kind** — no vitest, no test script in `package.json`. The Supabase CLI's bundled pgTAP is therefore the cheapest path to an automated database test, since it needs no JS test runner.
- **`createClient` can return `null`** ([supabase.ts:6-8](src/lib/supabase.ts#L6-L8)) when env vars are absent. Not exercised by this change, but any future service layer must respect it.

## Desired End State

A teacher's day plans live in Postgres, structurally invisible to every other account.

Concretely, when this plan is done:

1. `supabase/migrations/` contains one migration creating `public.day_plans` and `public.activities`, both with RLS enabled and eight explicit policies each (four operations × two roles).
2. A pgTAP suite under `supabase/tests/database/` passes, proving that account A cannot read, insert, update, or delete account B's rows on either table — including the INSERT `WITH CHECK` path, which is the failure mode that leaks silently.
3. `src/db/database.types.ts` (generated) and `src/types.ts` (hand-written entities/DTOs) give S-02 and S-03 a typed contract to import.
4. The migration is applied to the hosted production project, and the already-deployed app continues to serve `/`, `/auth/signin`, and the `/dashboard` redirect without regression.

Verification: `npx supabase test db` passes locally, and `npx supabase migration list --linked` shows the migration applied remotely.

### Key Discoveries:

- The child-table policy is the real risk surface. Ownership on `activities` is proven by a **denormalized `user_id` column**, kept honest by a composite foreign key to `day_plans(id, user_id)` — this makes a parent/child ownership mismatch structurally impossible rather than merely unlikely, and lets both tables carry the identical, auditable `auth.uid() = user_id` policy with no subquery.
- Undo (one step back after regeneration, FR-007) is modelled as a **generation counter**: `activities.generation` alongside `day_plans.current_generation`. Undo is a single integer update — no rows move, no JSONB is deserialized.
- Acceptance (FR-009) is a nullable `accepted_at timestamptz`: NULL means draft, a timestamp means accepted and records when.
- PRD Non-Goals (`prd.md:110`) explicitly exclude filtering by activity type, so `activities` needs no category column and no per-activity query surface beyond ordering.
- US-01 acceptance criteria (`prd.md:52-54`) scope regeneration isolation to **the day**, not the individual activity — so a whole-batch generation counter is sufficient granularity.

## What We're NOT Doing

- **No service layer.** `src/lib/services/` stays empty — designing a data-access API with no caller means guessing at call sites S-02 would rewrite anyway.
- **No API routes, no UI, no calendar.** F-01 is a foundation; S-01/S-02/S-03 own all user-visible surface.
- **No LLM integration or generation logic.** The schema stores proposals; it does not produce them.
- **No `PROTECTED_ROUTES` change.** No new routes exist to protect.
- **No generation history beyond one step.** Only the current and immediately previous batch are retained.
- **No switch of local dev to the local Supabase stack.** `.env` and `.dev.vars` keep pointing at the hosted project; the local stack is started only as a test harness.
- **No renaming of `project_id` in `config.toml`** (still the starter default `10x-astro-starter`) — it affects local container naming only.
- **No password-reset or rate-limit work** — both are open PRD questions, neither blocks this foundation.

## Implementation Approach

Build and prove the schema on a disposable local database, then promote it once. Phases 1–3 touch nothing but the local stack and the working tree, so they are fully reversible. Phase 4 — the push to the database that serves live auth — is isolated behind its own gate precisely because it is the one step that cannot be undone by deleting a file.

The RLS suite lands in Phase 2, before type generation, so the isolation guarantee is discharged before any downstream artifact depends on the schema shape.

## Critical Implementation Details

**The composite FK needs a redundant-looking unique constraint.** Postgres requires a `UNIQUE (id, user_id)` on `day_plans` before `activities` can declare `FOREIGN KEY (plan_id, user_id) REFERENCES day_plans(id, user_id)`. It looks superfluous next to the primary key on `id` and will invite deletion by a future reader — it is load-bearing and should carry a comment saying so.

**Every read of "current activities" must filter on the generation.** Because the previous batch stays resident in the same table, `SELECT * FROM activities WHERE plan_id = …` returns both batches. The correct read joins on `activities.generation = day_plans.current_generation`. Omitting the filter shows stale proposals with no error — worth encoding in the DTO layer in Phase 3 so S-02 cannot get it wrong by accident.

**`supabase test db` runs only against the local stack.** It requires Docker and `npx supabase start`; there is no supported way to point it at the hosted project. Phase 2 cannot be verified without the local stack running, even though the deployment target is prod.

---

## Phase 1: Schema migration

### Overview

Create the project's first migration: both tables, their constraints and indexes, RLS enabled, and granular per-operation, per-role policies. Verified by a clean apply against the local stack.

### Changes Required:

#### 1. Migration file

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_day_plans_and_activities.sql` (generate the timestamp with `date -u +%Y%m%d%H%M%S`)

**Intent**: Establish the storage contract for day plans and their generated activities, with account isolation enforced at the database level rather than in application code.

**Contract**:

`public.day_plans`
- `id uuid` primary key, default `gen_random_uuid()`
- `user_id uuid not null` → `auth.users(id) on delete cascade`
- `plan_date date not null`
- `prompt text not null` — the teacher's hasło (FR-005)
- `current_generation smallint not null default 1`, check `>= 1`
- `accepted_at timestamptz` nullable — NULL = draft, set = accepted (FR-009)
- `created_at`, `updated_at` `timestamptz not null default now()`
- `unique (user_id, plan_date)` — one plan per teacher per day
- `unique (id, user_id)` — **required** to support the composite FK from `activities`; comment it as such

`public.activities`
- `id uuid` primary key, default `gen_random_uuid()`
- `plan_id uuid not null`
- `user_id uuid not null` — denormalized owner, for a direct RLS predicate
- `generation smallint not null`, check `>= 1`
- `ordinal smallint not null` — display order within the batch (avoid the name `position`, which collides with the SQL function)
- `title text not null`, `description text not null` — the two fields US-01 requires
- `created_at timestamptz not null default now()`
- `foreign key (plan_id, user_id) references public.day_plans (id, user_id) on delete cascade`
- `unique (plan_id, generation, ordinal)`

Indexes: `activities (plan_id, generation)` for current-batch reads; `activities (user_id)` to keep the RLS predicate cheap. The `day_plans` unique constraints already cover its access paths.

Trigger: a `set_updated_at()` trigger function maintaining `day_plans.updated_at` on UPDATE.

RLS: `alter table … enable row level security` on both tables, then **sixteen** policies total — for each table, one policy per operation (`select`, `insert`, `update`, `delete`) for role `authenticated` using `auth.uid() = user_id` (with the matching `with check` on insert/update), and one per operation for role `anon` evaluating to `false`. The `anon` policies are written explicitly rather than omitted so that "no policy" is never ambiguous between a deliberate deny and an oversight.

#### 2. Local stack availability

**File**: none — operational step

**Intent**: Bring up the local Supabase stack as a disposable verification target.

**Contract**: `npx supabase start` succeeds and `npx supabase db reset` applies the migration from scratch with no errors. Requires Docker running.

### Success Criteria:

#### Automated Verification:

- Local stack starts: `npx supabase start`
- Migration applies from scratch: `npx supabase db reset`
- Both tables report `rowsecurity = true`: query `pg_tables` for `day_plans` and `activities`
- Exactly 16 policies exist: `select count(*) from pg_policies where schemaname = 'public'`
- Linting passes: `npm run lint`

#### Manual Verification:

- Policy text reviewed line by line — each `authenticated` policy predicates on `auth.uid() = user_id`, and insert/update carry a `with check`
- Schema visible and correct in Studio at `http://127.0.0.1:54323`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: RLS isolation suite

### Overview

Prove the isolation guarantee with pgTAP. This is the phase that discharges the risk the roadmap names for F-01 — a mis-set policy leaking plans between accounts.

### Changes Required:

#### 1. pgTAP test suite

**File**: `supabase/tests/database/rls_isolation.test.sql`

**Intent**: Assert that a signed-in teacher can reach exactly their own rows and nothing else, on both tables and across all four operations.

**Contract**: Seed two users directly into `auth.users` with fixed UUIDs, plus one `day_plans` row and two `activities` rows for each. Impersonate a user per assertion block by setting the role and JWT claim:

```sql
set local role authenticated;
set local "request.jwt.claims" to '{"sub":"<user-a-uuid>","role":"authenticated"}';
```

Assertions, for each of the two tables:
- SELECT as A returns only A's rows (count matches, and B's ids are absent)
- UPDATE targeting B's row affects **zero** rows (RLS filters rather than raising)
- DELETE targeting B's row affects **zero** rows
- INSERT with `user_id` set to B's id raises a row-level-security violation — the `with check` path
- SELECT as `anon` returns zero rows

Plus one structural assertion: inserting an `activities` row whose `user_id` does not match its parent plan's owner raises a foreign-key violation, proving the composite FK holds.

Wrap in `begin; select plan(N); … select * from finish(); rollback;` per the pgTAP convention the Supabase CLI expects.

### Success Criteria:

#### Automated Verification:

- Full suite passes: `npx supabase test db`
- Suite is re-runnable against a fresh database: `npx supabase db reset && npx supabase test db`

#### Manual Verification:

- Mutation check: temporarily drop one `authenticated` SELECT policy, confirm the suite **fails**, then restore it — proving the tests actually exercise the policies rather than passing vacuously

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Typed contract

### Overview

Give S-02 and S-03 typed access to the schema: generated database types plus hand-written domain entities and DTOs.

### Changes Required:

#### 1. Generated database types

**File**: `src/db/database.types.ts`

**Intent**: Machine-generated row/insert/update types mirroring the schema, so drift between SQL and TypeScript surfaces as a type error.

**Contract**: Output of `npx supabase gen types typescript --local > src/db/database.types.ts`. Generated file — never hand-edited; regenerate after any migration.

#### 2. Domain types

**File**: `src/types.ts` (new — the location CLAUDE.md designates for shared entities and DTOs)

**Intent**: Express the domain in the language the PRD uses, and encode the generation invariant so downstream code cannot read stale activities by accident.

**Contract**: Entity aliases derived from the generated `Database` type (`DayPlan`, `Activity`), plus DTOs for the shapes S-02/S-03 will actually pass around:
- A day-plan-with-current-activities read model whose activities are, by construction, the current generation only
- A create/regenerate input carrying `plan_date`, `prompt`, and the activity batch
- An acceptance state discriminated on `accepted_at` being null

Derive from the generated types rather than restating column shapes, so a schema change breaks compilation here first.

#### 3. Supabase client typing

**File**: `src/lib/supabase.ts`

**Intent**: Parameterize the existing server client with the generated `Database` type so all future queries are checked.

**Contract**: `createServerClient<Database>(…)` — a type-parameter addition only. The existing null-return behavior and cookie handling are unchanged.

### Success Criteria:

#### Automated Verification:

- Types generate without error: `npx supabase gen types typescript --local`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- `src/types.ts` reads as domain language (day plan, activity, accepted) rather than as a restatement of SQL columns
- The current-generation read model makes it awkward to express "all activities regardless of generation" — the invariant is encoded, not merely documented

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Production push

### Overview

Promote the verified migration to the hosted project that serves the live deployment. The one irreversible step in this plan.

### Changes Required:

#### 1. Link the CLI to the hosted project

**File**: none — operational step (writes `supabase/.temp/`, already gitignored by the CLI's own entries)

**Intent**: Establish the remote target for migration push.

**Contract**: `npx supabase login`, then `npx supabase link --project-ref <ref>` using the ref from the `SUPABASE_URL` host in `.dev.vars`. Requires the database password.

#### 2. Pre-push drift check

**File**: none — operational step

**Intent**: Confirm the remote database is in the state we assume — no public tables, no prior migration history — before writing to it.

**Contract**: `npx supabase migration list --linked` shows the local migration as not-yet-applied and no unexpected remote entries.

#### 3. Push

**File**: none — operational step

**Intent**: Apply the migration to production.

**Contract**: `npx supabase db push`. This creates `supabase_migrations.schema_migrations` on first use.

### Success Criteria:

#### Automated Verification:

- Migration shows as applied remotely: `npx supabase migration list --linked`
- Remote RLS is on and policies are present: query `pg_policies` against the linked database and confirm 16 rows for schema `public`
- App still builds: `npm run build`

#### Manual Verification:

- Supabase Studio (hosted) shows both tables with the RLS-enabled badge and the expected policy list
- Live deployment regression check per [deploy-plan.md:146](context/deployment/deploy-plan.md#L146): `/` → 200, `/auth/signin` → 200, `/dashboard` → 302 to `/auth/signin`
- Signing in with a real account still works — confirming the migration did not disturb the `auth` schema

**Implementation Note**: This is the final phase. Confirm manual verification before considering the change complete.

---

## Testing Strategy

### Unit Tests:

None — this change adds no application code paths. The database *is* the unit under test, covered by pgTAP.

### Integration Tests:

The pgTAP suite in Phase 2 is the integration test: it exercises real policies against real rows under two distinct authenticated identities plus `anon`.

Key edge cases covered:
- Cross-account SELECT (the obvious leak)
- Cross-account UPDATE and DELETE (RLS filters silently — zero rows affected, no error)
- Cross-account INSERT via a forged `user_id` (the `with check` path — the leak that produces no symptom)
- Anonymous access to both tables
- Parent/child ownership mismatch rejected by the composite FK

### Manual Testing Steps:

1. Run the mutation check in Phase 2 — drop a policy, confirm the suite fails, restore it.
2. Inspect policy text in Studio after the Phase 4 push; confirm the remote definitions match the migration file verbatim.
3. Exercise the live app's auth flow post-push to confirm no regression.

## Performance Considerations

Data volume is `small` per `prd.md:11` — roughly 20-22 plans per teacher per month. The `activities (user_id)` index keeps the RLS predicate index-backed rather than forcing a sequential scan per policy evaluation, which matters more than raw row count: RLS predicates run per row on every query. The denormalized `user_id` avoids a per-row subquery entirely, which is the main reason it was chosen over an `EXISTS` join.

Retaining one previous generation at most doubles `activities` row count; pruning (`delete where generation < current_generation - 1`) belongs to whichever slice implements regeneration, not here.

## Migration Notes

There is no existing data — this is the project's first migration, so there is nothing to backfill and no backward compatibility to preserve.

Rollback: phases 1–3 revert by deleting files and running `npx supabase db reset`. After the Phase 4 push, rollback requires a new `drop table` migration, since `supabase db push` has no down-migration mechanism. Both tables are new and unreferenced, so a drop is clean — but it is a forward migration, not an undo.

## References

- Roadmap item: `context/foundation/roadmap.md` § F-01
- Change identity: `context/changes/plan-persistence-baseline/change.md`
- PRD requirements: `context/foundation/prd.md` — FR-005, FR-007, FR-008, FR-009, § Access Control, § Non-Functional Requirements
- Auth client this schema anchors on: [src/lib/supabase.ts:9-23](src/lib/supabase.ts#L9-L23)
- Deployment state and regression checks: [context/deployment/deploy-plan.md:144-146](context/deployment/deploy-plan.md#L144-L146)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema migration

#### Automated

- [x] 1.1 Local stack starts: `npx supabase start`
- [x] 1.2 Migration applies from scratch: `npx supabase db reset`
- [x] 1.3 Both tables report `rowsecurity = true`
- [x] 1.4 Exactly 16 policies exist in schema `public`
- [x] 1.5 Linting passes: `npm run lint`

#### Manual

- [x] 1.6 Policy text reviewed line by line
- [x] 1.7 Schema visible and correct in local Studio

### Phase 2: RLS isolation suite

#### Automated

- [ ] 2.1 Full suite passes: `npx supabase test db`
- [ ] 2.2 Suite re-runnable against a fresh database

#### Manual

- [ ] 2.3 Mutation check: dropping a policy makes the suite fail

### Phase 3: Typed contract

#### Automated

- [ ] 3.1 Types generate without error
- [ ] 3.2 Type checking passes: `npx astro check`
- [ ] 3.3 Linting passes: `npm run lint`
- [ ] 3.4 Production build succeeds: `npm run build`

#### Manual

- [ ] 3.5 `src/types.ts` reads as domain language
- [ ] 3.6 Current-generation invariant is encoded in the read model

### Phase 4: Production push

#### Automated

- [ ] 4.1 Migration shows as applied remotely
- [ ] 4.2 Remote RLS enabled with 16 policies present
- [ ] 4.3 App still builds: `npm run build`

#### Manual

- [ ] 4.4 Hosted Studio shows both tables RLS-enabled with expected policies
- [ ] 4.5 Live deployment regression check passes
- [ ] 4.6 Sign-in with a real account still works
