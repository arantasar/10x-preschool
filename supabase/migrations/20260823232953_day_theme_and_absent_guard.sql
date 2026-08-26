-- the day's theme, and a guard for "do not touch a day that already has a plan"
--
-- s-03 (week-generation) generates five days from one haslo. five calls carrying
-- the same haslo produce five variants of one idea rather than a week of
-- lessons - finding f4 of the s-01 implementation review named this by hand. so
-- a cheap outline call splits the haslo into five day themes first, and each
-- day's generation carries its own.
--
-- the theme has to outlive the request. regenerating wednesday a month later
-- from /plan?date= must still know where wednesday sits in the week, and the
-- island that held the outline is long gone by then. hence a column rather than
-- a value passed through.
--
-- two consequences follow, and both are in this migration because neither is
-- optional:
--
--   1. this function is `security invoker`, so `on conflict ... do update set
--      theme` runs with the caller's privileges. 20260720162553 took the
--      table-level update grant away from `authenticated` and handed back a
--      named column list; a new column does not join that list by itself.
--      without the grant the upsert fails with 42501, which categorize() in
--      day-plan-store.ts maps to config/500 - "contact your administrator" -
--      after a paid 10-30s model call.
--
--   2. the single-day route sends no theme: DayPlanEditor posts plan_date,
--      prompt and confirm_replace, nothing else. a plain `theme =
--      excluded.theme` would therefore null the column on every single-day
--      regeneration, quietly unpinning that day from the week's arc with no
--      error, no exception and no log line. hence coalesce.
--
-- the third change is the week's skip policy. "generating a week does not touch
-- a day that already has a plan" is enforced here rather than in the island, for
-- the reason finding f1 of the s-02 review established: a client-side-only guard
-- standing in front of a destructive write is exactly the shape that loses an
-- accepted plan. u0002 is kept distinguishable from u0001 because the two are
-- different answers - u0001 says "confirm and i will", u0002 says "this day is
-- taken and i left it alone".
--
-- both tables now hold rows (s-02 deliberately left local test data behind), so
-- the column is nullable. null is a valid permanent state rather than missing
-- data: a day planned on its own from /plan?date= has no theme and never will.
--
-- rollback: drop column theme, recreate the four-argument function from
-- 20260823193447 together with its grants.

-- ---------------------------------------------------------------------------
-- 1. the column
-- ---------------------------------------------------------------------------

alter table public.day_plans
  add column theme text;

alter table public.day_plans
  add constraint day_plans_theme_length
  check (theme is null or char_length(theme) between 1 and 200);

comment on column public.day_plans.theme is
  'the day''s slice of a week outline: a narrowing of the haslo assigned when '
  'the week was generated. null means the day was planned on its own and has no '
  'place in a week arc - a valid permanent state, not missing data.';

comment on constraint day_plans_theme_length on public.day_plans is
  'mirrors THEME_MAX in src/lib/day-plan-limits.ts. the lower bound of 1 rejects '
  'the empty string, which a nullable text column otherwise admits alongside null.';

-- ---------------------------------------------------------------------------
-- 2. the column grant
-- ---------------------------------------------------------------------------
--
-- 20260720162553 replaced the table-level update grant with an explicit column
-- list, precisely so that a column added later has to be considered rather than
-- inherited. this is that consideration: the upsert below writes `theme` under
-- the caller's own privileges, so `authenticated` needs it by name.
--
-- the teacher never edits this field by hand - it is written by the week
-- generation and preserved by every later single-day regeneration - but the
-- grant is about who executes the statement, not about which ui exposes it.

grant update (theme) on public.day_plans to authenticated;

-- ---------------------------------------------------------------------------
-- 3. the batch writer, with two new arguments
-- ---------------------------------------------------------------------------
--
-- the signature changes, so the old four-argument function is dropped rather
-- than replaced: `create or replace` with added defaulted parameters would leave
-- both overloads resident and make supabase.rpc ambiguous. the reasoning is
-- recorded in 20260823193447, which had to do the same thing.
--
-- the first read still takes `for update` and still runs before the upsert, for
-- the reason that migration gives: after the upsert there is no longer any
-- evidence that there was an acceptance to protect. it now reads two facts
-- instead of one, in one query, because both refusals are decided from it.
--
-- refusal order is deliberate. u0002 is asked first because it is the fuller
-- answer: a week generation is not offering to replace anything, so telling the
-- teacher "this day is accepted, confirm to replace it" would invite a decision
-- the caller never asked to make.

drop function public.save_day_plan_generation(date, text, jsonb, boolean);

create function public.save_day_plan_generation(
  p_plan_date date,
  p_prompt text,
  p_activities jsonb,
  p_confirm_replace boolean default false,
  p_theme text default null,
  p_require_absent boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_generation smallint;
  v_exists boolean;
  v_accepted boolean;
begin
  select true, accepted_at is not null
    into v_exists, v_accepted
    from public.day_plans
   where user_id = (select auth.uid())
     and plan_date = p_plan_date
     for update;

  -- coalesce covers both "no plan yet" and "a plan rls hides": neither is a day
  -- this caller has already worked on, and neither should be refused here.
  if coalesce(v_exists, false) and p_require_absent then
    raise exception
      'plan for % already exists and was left untouched', p_plan_date
      using errcode = 'U0002';
  end if;

  if coalesce(v_accepted, false) and not p_confirm_replace then
    raise exception
      'plan for % is accepted; regeneration must be confirmed', p_plan_date
      using errcode = 'U0001';
  end if;

  insert into public.day_plans (user_id, plan_date, prompt, theme)
  values ((select auth.uid()), p_plan_date, p_prompt, p_theme)
  on conflict (user_id, plan_date) do update
    set prompt = excluded.prompt,
        -- a caller that sends no theme is not asking for the theme to be
        -- cleared. the single-day route never sends one, so without this a
        -- regeneration from /plan?date= would unpin the day from its week.
        theme = coalesce(excluded.theme, public.day_plans.theme),
        current_generation = public.day_plans.current_generation + 1,
        accepted_at = null
  returning id, current_generation into v_plan_id, v_generation;

  delete from public.activities
   where plan_id = v_plan_id
     and generation < v_generation;

  insert into public.activities
    (plan_id, user_id, generation, ordinal, title, description)
  select v_plan_id,
         (select auth.uid()),
         v_generation,
         ord::smallint,
         item ->> 'title',
         item ->> 'description'
    from jsonb_array_elements(p_activities) with ordinality as t(item, ord);

  return v_plan_id;
end;
$$;

comment on function public.save_day_plan_generation is
  'the only writer of an activities batch: leaves an existing day alone when '
  'p_require_absent, refuses to supersede an accepted plan without '
  'p_confirm_replace, then upserts the plan (bumping current_generation, '
  'clearing acceptance, keeping any theme the caller did not supply), drops the '
  'superseded batch and inserts the new one - atomically, because postgrest '
  'gives the client no transaction.';

-- the grants do not survive the drop, and they are two revokes rather than one
-- for the reason 20260823095136 recorded: postgres grants execute to PUBLIC on
-- every new function, and supabase's default privileges additionally grant it to
-- anon directly, which a revoke from PUBLIC does not reach.

revoke all on function public.save_day_plan_generation(date, text, jsonb, boolean, text, boolean) from public;
revoke all on function public.save_day_plan_generation(date, text, jsonb, boolean, text, boolean) from anon;
grant execute on function public.save_day_plan_generation(date, text, jsonb, boolean, text, boolean) to authenticated;
