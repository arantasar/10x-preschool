-- the write contract for a day plan's generation batch
--
-- follow-up to 20260718211452_day_plans_and_activities.sql, discharging the
-- commitment the f-01 implementation review left by name to s-02 (finding f5,
-- "residual"). f-01 built the storage and proved account isolation, but it had
-- no writer yet, so three things were deliberately deferred to whichever slice
-- first wrote a batch. this is that slice.
--
-- what f-01 left open, and what this migration closes:
--
--   1. nothing bound a new batch to its plan's counter. the insert policy asks
--      only about ownership (auth.uid() = user_id) and the check only about
--      generation >= 1. a batch written at the wrong generation fails silently:
--      selectCurrentGeneration (src/lib/day-plans.ts) honestly returns an empty
--      array, the branded CurrentActivity type confirms "this is current", and
--      the teacher sees an empty plan with no error, exception or log line.
--      a before insert trigger now makes that state unreachable.
--
--   2. regeneration is at least two statements (bump the counter, write the
--      batch) and postgrest gives the client no transaction. so the only writer
--      of a batch is a postgres function, and it is what decides the order:
--      upsert first, then delete, then insert. the reverse order ("insert, then
--      bump") is precisely what the trigger in (1) makes impossible.
--
--   3. the retention sentence on the activities comment had no enforcer -
--      lessons.md #2 ("odroczone sprzatanie danych musi miec wlasciciela").
--      save_day_plan_generation is now that owner, and the comment is corrected
--      to what the code actually does rather than left standing as a claim.
--
-- additive: functions, triggers, grants and comments only. no column or data
-- changes, and both tables are empty in practice (nothing has written to them),
-- so the new trigger has no history to validate against. rollback is drop
-- trigger / drop function in reverse order.

-- ---------------------------------------------------------------------------
-- 1. the generation invariant
-- ---------------------------------------------------------------------------
--
-- holds for every insert into activities regardless of who writes it, which is
-- the point: save_day_plan_generation below is not trusted to be the only
-- caller, it is merely the only convenient one. s-03 (week-generation)
-- inherits this the moment it writes its first row.
--
-- the two refusals are told apart on purpose. a plan row the caller cannot see -
-- hidden by rls, or simply not there - is an authorization failure and answers
-- insufficient_privilege, the same code rls itself would have raised had this
-- trigger not fired first. only a plan the caller *can* see, at a counter that
-- does not match, is a check_violation.
--
-- collapsing both into one code (the shape `new.generation is distinct from
-- (select ...)` gives, since the subquery yields null) would be safe - the
-- insert is refused either way - but it changes the answer to a question rls
-- already answers, and the f-01 isolation suite asserts that answer by code.
--
-- what the trigger deliberately does not do is distinguish "hidden" from
-- "absent": it cannot see the difference, and neither should the caller, or the
-- refusal becomes an existence oracle for other teachers' plans.

create function public.enforce_activity_generation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current smallint;
begin
  select current_generation into v_current
    from public.day_plans
   where id = new.plan_id;

  if not found then
    raise exception
      'plan % is not visible to the current user', new.plan_id
      using errcode = 'insufficient_privilege';
  end if;

  if new.generation is distinct from v_current then
    raise exception
      'activities.generation % does not match current_generation for plan %',
      new.generation, new.plan_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.enforce_activity_generation is
  'refuses any activity whose generation is not the plan''s current_generation. '
  'the batch/counter mismatch it prevents has no runtime symptom - the teacher '
  'just sees an empty plan.';

create trigger activities_enforce_generation
  before insert on public.activities
  for each row
  execute function public.enforce_activity_generation();

-- ---------------------------------------------------------------------------
-- 2. editing a proposal returns the plan to draft
-- ---------------------------------------------------------------------------
--
-- a trigger rather than a second statement in the service: a partial failure
-- there would leave corrected text sitting on an accepted plan, which is
-- exactly the state fr-009 rules out.

create function public.clear_plan_acceptance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.day_plans
     set accepted_at = null
   where id = new.plan_id
     and accepted_at is not null;
  return null;
end;
$$;

comment on function public.clear_plan_acceptance is
  'after-trigger returning a plan to draft when the content of one of its '
  'activities changes.';

-- the `when` clause is load-bearing: reordering proposals is not a change of
-- content and must not invalidate an acceptance the teacher already gave.

create trigger activities_edit_clears_acceptance
  after update on public.activities
  for each row
  when (old.title is distinct from new.title
     or old.description is distinct from new.description)
  execute function public.clear_plan_acceptance();

-- ---------------------------------------------------------------------------
-- 3. the only writer of a batch
-- ---------------------------------------------------------------------------
--
-- security invoker, so rls decides whose plan is touched. a second teacher
-- calling this for a date on which the first already has a plan gets their own
-- row - (user_id, plan_date) is unique per teacher, not per date.
--
-- ordering inside the transaction, in the order the statements appear:
--
--   * the upsert bumps the counter and takes the row lock at the same time, so
--     two concurrent regenerations of one day serialise themselves with no
--     explicit `for update`.
--   * only then may the previous batch go, and the new one arrive, so the
--     trigger from (1) already sees the new counter.
--
-- the caller never supplies `generation`: the function assigns it from the row
-- it just wrote. there is no number for a caller to get wrong.
--
-- ordering of the proposals comes from `with ordinality`, not `row_number()
-- over ()` - the latter has no `order by` and is therefore not deterministic.
-- the model's own order is the order the teacher sees.
--
-- returns the plan id alone. the batch is read back by readDayPlan, which ssr
-- needs anyway; one read path instead of two.

create function public.save_day_plan_generation(
  p_plan_date date,
  p_prompt text,
  p_activities jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_generation smallint;
begin
  insert into public.day_plans (user_id, plan_date, prompt)
  values ((select auth.uid()), p_plan_date, p_prompt)
  on conflict (user_id, plan_date) do update
    set prompt = excluded.prompt,
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
  'the only writer of an activities batch: upserts the plan (bumping '
  'current_generation and clearing acceptance), drops the superseded batch, and '
  'inserts the new one - atomically, because postgrest gives the client no '
  'transaction.';

-- a new function is executable by everyone the moment it exists, and closing
-- that takes two revokes, not one - they cover different mechanisms:
--
--   * postgres grants execute to PUBLIC on every new function by default.
--   * supabase additionally carries `alter default privileges in schema public
--     grant execute on functions to anon, authenticated, service_role`, which
--     lands as a *direct* grant to anon. revoking from PUBLIC does not touch
--     it - checked, not assumed: with only the PUBLIC revoke in place,
--     `has_function_privilege('anon', ...)` still answers true.
--
-- the behavioural half of the anon assertion in day_plan_write.test.sql stays
-- green either way, because anon is stopped a layer earlier by f-01's
-- `revoke all on public.day_plans from anon`. that is defence in depth working
-- as intended, and also exactly why the privilege is asserted directly there.
--
-- service_role is left alone, matching how f-01 treated the table grants: it is
-- the backend role, not a role a browser ever holds.

revoke all on function public.save_day_plan_generation(date, text, jsonb) from public;
revoke all on function public.save_day_plan_generation(date, text, jsonb) from anon;
grant execute on function public.save_day_plan_generation(date, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. retention: the comments now describe what the code does
-- ---------------------------------------------------------------------------
--
-- both sentences below were written in f-01 against a design where undo walked
-- current_generation back, which required keeping the superseded batch. that
-- design is not what s-02 shipped: regeneration deletes the old batch, so undo
-- has nothing to walk back to and is explicitly out of scope. leaving the old
-- wording would leave the schema documenting a guarantee it does not give.

comment on table public.activities is
  'generated activity proposals belonging to a day plan. exactly one batch is '
  'resident: public.save_day_plan_generation deletes the superseded generation '
  'in the same write that creates its replacement.';

comment on column public.day_plans.current_generation is
  'points at the live batch in activities. regeneration increments it and '
  'deletes the batch it supersedes; there is no undo to decrement it.';
