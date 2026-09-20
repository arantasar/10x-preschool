-- ---------------------------------------------------------------------------
-- the week writer refuses a day it cannot date, instead of failing on the cast
-- ---------------------------------------------------------------------------
--
-- `save_day_plan_generation` takes `p_plan_date date`, so postgrest rejects
-- anything that is not a date before the body ever runs. the week writer reads
-- the same value out of jsonb - `(v_day ->> 'plan_date')::date` - and until now
-- checked nothing, which made two malformed payloads read as something they are
-- not:
--
--   * a missing, null or non-object element left `v_plan_date` null. the
--     `for update` select then matched no row, the insert hit `plan_date not
--     null`, and the teacher got a 500 (23502 -> `invalid`). worse, a u0003
--     raised for that element printed "activity batch for <NULL> is empty".
--   * a malformed date string raised 22007, which `categorize()` does not name.
--     it fell to the `default: transient` arm, so `saveWeekGeneration` retried
--     it once and then told the teacher "spróbuj ponownie za chwilę" - a
--     permanently broken payload described as a passing outage.
--
-- the route validates this with `z.iso.date()` and is the only caller today, so
-- nothing reachable was broken. the reason to move it down here anyway is the
-- one 20260830092600_reject_empty_activity_batch.sql records: an invariant that
-- lives in one route's request schema is not an invariant, it is a habit.
--
-- u0003 rather than a new code, and for the same reason the empty batch uses
-- it: this is malformed input whatever state the week is in, there is nothing
-- for the teacher to decide, and `categorize()` already maps it to `invalid`
-- (terminal, not retried). a new code would have to be taught to that map to
-- behave identically.
--
-- the shape check is a regex and not an exception block on purpose. catching
-- the cast would open a subtransaction per day, and "there is no per-day
-- begin/exception here" is exactly the property that makes the all-or-nothing
-- claim readable. the residual case a regex cannot see - a well-formed date
-- that does not exist, like 2026-02-30 - is handled one layer up instead, by
-- naming 22007/22008 in `categorize()` so it is terminal rather than retried.
--
-- rollback: `create or replace` this function from
-- 20260920110000_theme_follows_haslo.sql, which is the version this one edits.
-- grants are untouched - `create or replace` keeps them, which is the whole
-- reason neither this migration nor that one re-issues the grant triple.

create or replace function public.save_week_plan_generation(
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
  v_plan_date_text text;
  v_plan_date date;
  v_theme text;
  v_activities jsonb;
  v_plan_id uuid;
  v_generation smallint;
  v_accepted boolean;
  v_written jsonb := '[]'::jsonb;
begin
  if p_days is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) = 0 then
    raise exception
      'week generation carries no days; a generation must write at least one day'
      using errcode = 'U0003';
  end if;

  for v_day in select value from jsonb_array_elements(p_days) as elements(value)
  loop
    -- read as text and checked before the cast, so the refusal can name what is
    -- wrong. casting first would raise 22007 from inside postgres with a
    -- message about syntax, which is neither this function's vocabulary nor
    -- something the route knows how to answer.
    v_plan_date_text := v_day ->> 'plan_date';

    if v_plan_date_text is null or v_plan_date_text !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception
        'week generation carries a day whose plan_date is missing or malformed: %',
        coalesce(v_plan_date_text, '<null>')
        using errcode = 'U0003';
    end if;

    v_plan_date := v_plan_date_text::date;
    v_theme := v_day ->> 'theme';
    v_activities := v_day -> 'activities';

    if v_activities is null or jsonb_typeof(v_activities) <> 'array'
       or jsonb_array_length(v_activities) = 0 then
      raise exception
        'activity batch for % is empty; a generation must write at least one activity', v_plan_date
        using errcode = 'U0003';
    end if;

    v_accepted := null;

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
          theme = case
                    when excluded.theme is not null then excluded.theme
                    when public.day_plans.prompt is distinct from excluded.prompt then null
                    else public.day_plans.theme
                  end,
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
      from jsonb_array_elements(v_activities) with ordinality as t(item, ord);

    v_written := v_written || jsonb_build_object('plan_date', v_plan_date, 'plan_id', v_plan_id);
  end loop;

  return v_written;
end;
$$;

comment on function public.save_week_plan_generation is
  'commits a whole week''s generation batches as one transaction: refuses a day '
  'it cannot date and an empty batch (u0003), refuses to supersede an accepted '
  'plan without p_confirm_replace (u0001, naming the day), then per day upserts '
  'the plan (bumping current_generation, clearing acceptance, and keeping a '
  'theme the caller did not supply only while the hasło is unchanged), drops '
  'the superseded batch and inserts the new one. a raise anywhere in the loop '
  'discards every day the loop had already written.';
