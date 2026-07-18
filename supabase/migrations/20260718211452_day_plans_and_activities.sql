-- migration: day plans and their generated activities
-- purpose: establish the storage contract for one plan per teacher per day (the
--          teacher's prompt, the generated activity proposals, and an explicit
--          accepted state), with account isolation enforced at the database
--          level rather than in application code.
-- affected: creates public.day_plans, public.activities, one trigger function,
--           and sixteen row level security policies (four operations x two
--           roles x two tables).
-- special considerations:
--   * ownership on activities is denormalized into a user_id column and kept
--     honest by a composite foreign key to day_plans (id, user_id). this makes a
--     parent/child ownership mismatch structurally impossible and lets both
--     tables carry the identical, auditable auth.uid() = user_id predicate with
--     no subquery per row.
--   * anon policies are written explicitly as false rather than omitted, so
--     "no policy" is never ambiguous between a deliberate deny and an oversight.

-- ---------------------------------------------------------------------------
-- day_plans
-- ---------------------------------------------------------------------------

create table public.day_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_date date not null,
  -- the teacher's haslo: the free-text seed the proposals are generated from
  prompt text not null,
  current_generation smallint not null default 1 constraint day_plans_current_generation_positive check (current_generation >= 1),
  -- null = draft, non-null = accepted, and records when
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- one plan per teacher per day
  constraint day_plans_user_id_plan_date_key unique (user_id, plan_date),
  -- load-bearing despite looking redundant next to the primary key on id:
  -- postgres requires a unique constraint on exactly (id, user_id) before
  -- activities can declare its composite foreign key against those columns.
  -- do not drop this.
  constraint day_plans_id_user_id_key unique (id, user_id)
);

comment on table public.day_plans is 'one plan per teacher per day: the prompt it was generated from, the current generation counter, and its accepted state.';
comment on column public.day_plans.prompt is 'the teacher''s haslo - the free-text seed for activity generation.';
comment on column public.day_plans.current_generation is 'points at the live batch in activities. regeneration increments it; undo decrements it.';
comment on column public.day_plans.accepted_at is 'null means draft; a timestamp means the teacher accepted the plan then.';
comment on constraint day_plans_id_user_id_key on public.day_plans is 'required to support the composite foreign key from public.activities. not redundant with the primary key.';

-- ---------------------------------------------------------------------------
-- activities
-- ---------------------------------------------------------------------------

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  -- denormalized owner, so the rls predicate is a direct column comparison
  user_id uuid not null,
  generation smallint not null constraint activities_generation_positive check (generation >= 1),
  -- display order within the batch. named ordinal rather than position because
  -- position collides with the sql function of the same name.
  ordinal smallint not null,
  title text not null,
  description text not null,
  created_at timestamptz not null default now(),
  -- composite fk: an activity can only ever point at a plan owned by the same
  -- account, so parent/child ownership can never diverge.
  constraint activities_plan_id_user_id_fkey foreign key (plan_id, user_id)
    references public.day_plans (id, user_id) on delete cascade,
  constraint activities_plan_id_generation_ordinal_key unique (plan_id, generation, ordinal)
);

comment on table public.activities is 'generated activity proposals belonging to a day plan. one batch per generation; at most the current and immediately previous batch are retained.';
comment on column public.activities.user_id is 'denormalized from day_plans so rls evaluates without a per-row subquery. kept honest by the composite foreign key.';
comment on column public.activities.generation is 'the batch this activity belongs to. reads of "current activities" must filter on day_plans.current_generation.';
comment on column public.activities.ordinal is 'display order within the batch.';

-- current-batch reads: activities for a plan at a given generation
create index activities_plan_id_generation_idx on public.activities (plan_id, generation);
-- keeps the rls predicate index-backed rather than forcing a sequential scan
create index activities_user_id_idx on public.activities (user_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at is 'trigger function maintaining updated_at on row update.';

create trigger day_plans_set_updated_at
  before update on public.day_plans
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------

alter table public.day_plans enable row level security;
alter table public.activities enable row level security;

-- day_plans: authenticated - a teacher reaches exactly their own rows

create policy "authenticated users can select their own day plans"
  on public.day_plans for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "authenticated users can insert their own day plans"
  on public.day_plans for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "authenticated users can update their own day plans"
  on public.day_plans for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "authenticated users can delete their own day plans"
  on public.day_plans for delete to authenticated
  using ((select auth.uid()) = user_id);

-- day_plans: anon - explicit deny, so absence of a policy is never ambiguous

create policy "anon users cannot select day plans"
  on public.day_plans for select to anon
  using (false);

create policy "anon users cannot insert day plans"
  on public.day_plans for insert to anon
  with check (false);

create policy "anon users cannot update day plans"
  on public.day_plans for update to anon
  using (false)
  with check (false);

create policy "anon users cannot delete day plans"
  on public.day_plans for delete to anon
  using (false);

-- activities: authenticated - identical predicate to day_plans, by design

create policy "authenticated users can select their own activities"
  on public.activities for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "authenticated users can insert their own activities"
  on public.activities for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "authenticated users can update their own activities"
  on public.activities for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "authenticated users can delete their own activities"
  on public.activities for delete to authenticated
  using ((select auth.uid()) = user_id);

-- activities: anon - explicit deny

create policy "anon users cannot select activities"
  on public.activities for select to anon
  using (false);

create policy "anon users cannot insert activities"
  on public.activities for insert to anon
  with check (false);

create policy "anon users cannot update activities"
  on public.activities for update to anon
  using (false)
  with check (false);

create policy "anon users cannot delete activities"
  on public.activities for delete to anon
  using (false);

-- ---------------------------------------------------------------------------
-- table privileges
-- ---------------------------------------------------------------------------

-- supabase's default privileges grant the full dml set to anon and
-- authenticated on every new table in public. neither table has an anonymous
-- access path, and the surviving grant makes them discoverable through
-- pg_graphql introspection without signing in - names and columns only, since
-- rls still returns no rows. revoke it so the denial holds on both layers.
--
-- the eight anon policies above are deliberately kept rather than dropped:
-- grants and rls are independent, and a later migration or dashboard action
-- that re-grants would otherwise silently reopen these tables.
--
-- authenticated keeps its grants on purpose. it is the role every signed-in
-- teacher's queries run as; per-account isolation is rls's job here, not the
-- grant layer's.
revoke all on public.day_plans from anon;
revoke all on public.activities from anon;
