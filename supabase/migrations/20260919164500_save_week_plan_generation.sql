-- ---------------------------------------------------------------------------
-- a writer that commits a whole week's batches as one transaction
-- ---------------------------------------------------------------------------
--
-- `save_day_plan_generation` is atomic for one day and cannot be made atomic
-- for five. week generation is five http calls, and postgrest gives the client
-- no transaction to put them in - the same reason the single-day writer exists
-- at all (20260823095136_day_plan_generation_write_contract.sql). the board has
-- so far treated "three saved, two failed" as a normal outcome. from S-09 it is
-- not: replacing a week is all-or-nothing, so either every targeted day carries
-- the new hasło or none of them does.
--
-- the transaction is the function body. there is no explicit begin/commit to
-- write here, and that is the whole mechanism: a raise anywhere in the loop
-- discards every day the loop had already written, including days that were
-- perfectly valid.
--
-- this does not replace the single-day writer. `/api/day-plan/generate` keeps
-- calling `save_day_plan_generation`, keeps its `p_require_absent` skip policy
-- and keeps its contract intact.
--
-- no `p_require_absent` here, and that is deliberate rather than an omission:
-- this writer replaces by design. the caller decides *which* days to send by
-- acceptance, not by emptiness, and a day it did not send is a day it never
-- touches. `p_confirm_replace` is present and is never passed `true` in this
-- slice - accepted days stay out of reach until S-10 (FR-013) - but the
-- parameter is here so that slice flips a boolean instead of rewriting this.
--
-- every refusal names the offending `plan_date`. across five days "plan is
-- accepted" without a date tells the teacher nothing they can act on, so the
-- date travels in the message and out through `StoreError`. note that
-- `StoreError.message` is for the log only - `storeFailure` never renders it -
-- so getting the date onto a screen takes a `userMessage`, which
-- `weekConflictMessage` in day-plan-store.ts builds for u0001. a refusal whose
-- wording changes here and is not matched there degrades to the generic
-- conflict sentence rather than showing a wrong date.

create function public.save_week_plan_generation(
  p_prompt text,
  p_days jsonb,
  p_confirm_replace boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_day jsonb;
  v_plan_date date;
  v_theme text;
  v_activities jsonb;
  v_plan_id uuid;
  v_generation smallint;
  v_accepted boolean;
  v_written jsonb := '[]'::jsonb;
begin
  -- asked before the loop, for the reason the single-day writer asks about an
  -- empty batch before its upsert: a write that carries nothing is malformed
  -- input whatever state the week is in, and answering it with u0001 would
  -- invite the teacher to confirm a replacement that has nothing to replace
  -- anything with.
  if p_days is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) = 0 then
    raise exception
      'week generation carries no days; a generation must write at least one day'
      using errcode = 'U0003';
  end if;

  for v_day in select value from jsonb_array_elements(p_days) as elements(value)
  loop
    v_plan_date := (v_day ->> 'plan_date')::date;
    v_theme := v_day ->> 'theme';
    v_activities := v_day -> 'activities';

    -- same refusal, same code and same wording as the single-day writer. a
    -- teacher who hits it from the week path and from the day path should not
    -- have to learn that they are the same condition.
    if v_activities is null or jsonb_typeof(v_activities) <> 'array'
       or jsonb_array_length(v_activities) = 0 then
      raise exception
        'activity batch for % is empty; a generation must write at least one activity', v_plan_date
        using errcode = 'U0003';
    end if;

    -- reset rather than rely on select-into's null-on-no-rows. it does hold,
    -- but this runs in a loop, and "the previous day's acceptance leaked into
    -- this day's check" is the one bug in here that would be silent.
    v_accepted := null;

    -- `for update` before the check, and `day_plans` before `activities`, for
    -- the reason 20260823193447_confirm_replacing_accepted_plan.sql records:
    -- without the lock, a concurrent accept between this read and the upsert
    -- is destroyed by a replacement nobody confirmed. taking the locks in the
    -- same order the single-day writer does is what keeps the two from
    -- deadlocking against each other.
    select accepted_at is not null
      into v_accepted
      from public.day_plans
     where user_id = (select auth.uid())
       and plan_date = v_plan_date
       for update;

    if coalesce(v_accepted, false) and not p_confirm_replace then
      raise exception
        'plan for % is accepted; regeneration must be confirmed', v_plan_date
        using errcode = 'U0001';
    end if;

    insert into public.day_plans (user_id, plan_date, prompt, theme)
    values ((select auth.uid()), v_plan_date, p_prompt, v_theme)
    on conflict (user_id, plan_date) do update
      set prompt = excluded.prompt,
          -- a day sent without a theme is not a day asking to be unpinned from
          -- its week, exactly as in the single-day writer.
          theme = coalesce(excluded.theme, public.day_plans.theme),
          current_generation = public.day_plans.current_generation + 1,
          accepted_at = null
    returning id, current_generation into v_plan_id, v_generation;

    -- the superseded batch goes only after the counter has been bumped, so no
    -- day is ever left holding nothing. per day that ordering was already
    -- guaranteed; across the week it is guaranteed by this function being
    -- called once, with the whole set, after every day has generated.
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
      from jsonb_array_elements(v_activities) with ordinality as t(item, ord);

    v_written := v_written || jsonb_build_object('plan_date', v_plan_date, 'plan_id', v_plan_id);
  end loop;

  return v_written;
end;
$$;

comment on function public.save_week_plan_generation is
  'the batch writer for a whole week: refuses a week with no days and a day '
  'with an empty batch (u0003), refuses to supersede an accepted day without '
  'p_confirm_replace (u0001), then per day upserts the plan (bumping '
  'current_generation, clearing acceptance, keeping any theme the caller did '
  'not supply), drops the superseded batch and inserts the new one - all of it '
  'in one transaction, so a refusal on the last day leaves the first day '
  'untouched. every refusal names the plan_date it refused.';

-- three statements rather than one, for the reason the prior migrations
-- record: postgres grants execute to PUBLIC on every new function, and
-- supabase's default privileges additionally grant it to anon directly, which
-- a revoke from PUBLIC does not reach.

revoke all on function public.save_week_plan_generation(text, jsonb, boolean) from public;
revoke all on function public.save_week_plan_generation(text, jsonb, boolean) from anon;
grant execute on function public.save_week_plan_generation(text, jsonb, boolean) to authenticated;
