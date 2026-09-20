-- ---------------------------------------------------------------------------
-- a day's theme does not outlive the hasło it was a narrowing of
-- ---------------------------------------------------------------------------
--
-- reported from production on 2026-09-20. a teacher generated a week for
-- "kuchnia włoska", then reopened monday and regenerated it as "Urodziny
-- Moniki". the activities changed. the subtitle did not:
--
--   plan_date 2026-09-14 | prompt "Urodziny Moniki"
--                        | theme  "Włochy na mapie i charakterystyczne potrawy
--                                  kuchni włoskiej"
--                        | current_generation 5
--
-- five regenerations and the italian theme survived all of them, on three
-- surfaces at once: the day header (`plan.astro`), the week card
-- (`WeekDayCard`) and the month tile (`MonthGrid`).
--
-- the mechanism was `theme = coalesce(excluded.theme, public.day_plans.theme)`,
-- added in 20260823232953 and correct for the case it was written for.
-- `DayPlanEditor` posts only plan_date, prompt and confirm_replace, so
-- `p_theme` never arrives from `/plan?date=`, and the coalesce kept the stored
-- value. the comment defending it said a caller that sends no theme "is not
-- asking for the theme to be cleared", and that a single-day regeneration would
-- otherwise unpin the day from its week.
--
-- that is right when the teacher is re-rolling the *same* hasło for different
-- activities. it is wrong when they are changing the hasło, because the hasło
-- field on that page is editable and a theme is a narrowing of one particular
-- hasło. once the hasło changes, the narrowing is not stale - it is false. the
-- assumption is written out in `plan.astro`: "this page never sends a theme
-- when it regenerates ... so the line cannot go stale". it held only for as
-- long as nobody edited the hasło.
--
-- so the rule becomes conditional rather than unconditional, and it lives here
-- rather than in the island, for the project's usual reason: every caller of
-- this function - the day route, psql, whatever comes next - has to obey it,
-- and a client cannot be the thing that remembers to.
--
--   1. a theme supplied by the caller always wins (the week path, which sends
--      one per day from the outline).
--   2. no theme supplied and the hasło changed -> clear it. the day is no
--      longer part of the week's arc and must not claim to be.
--   3. no theme supplied and the hasło is unchanged -> keep it. this is the
--      "give me three different activities for the same idea" case, and the
--      day stays pinned exactly as 20260823232953 intended.
--
-- `is distinct from` rather than `<>`: `prompt` is NOT NULL today, but `<>`
-- would answer NULL rather than true if that ever stopped being the case, and
-- a NULL here would silently fall through to "keep the theme" - the bug this
-- migration exists to remove.
--
-- `create or replace` for both: the signatures are unchanged, so the grants
-- from 20260823232953 and 20260919164500 survive and neither migration has to
-- restate them.

create or replace function public.save_day_plan_generation(
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
  if p_activities is null or jsonb_typeof(p_activities) <> 'array'
     or jsonb_array_length(p_activities) = 0 then
    raise exception
      'activity batch for % is empty; a generation must write at least one activity', p_plan_date
      using errcode = 'U0003';
  end if;

  select true, accepted_at is not null
    into v_exists, v_accepted
    from public.day_plans
   where user_id = (select auth.uid())
     and plan_date = p_plan_date
     for update;

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
    from jsonb_array_elements(p_activities) with ordinality as t(item, ord);

  return v_plan_id;
end;
$$;

comment on function public.save_day_plan_generation is
  'the only writer of an activities batch: refuses an empty batch (u0003), '
  'leaves an existing day alone when p_require_absent, refuses to supersede an '
  'accepted plan without p_confirm_replace, then upserts the plan (bumping '
  'current_generation, clearing acceptance, and keeping a theme the caller did '
  'not supply only while the hasło is unchanged), drops the superseded batch '
  'and inserts the new one - atomically, because postgrest gives the client no '
  'transaction.';

-- the week writer never hits branch 2 today, because the island sends a theme
-- per day from the outline and a run whose outline failed never reaches the
-- write. it gets the same rule anyway: the two writers disagreeing about what
-- a theme means is how the next version of this bug gets written.

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
    v_plan_date := (v_day ->> 'plan_date')::date;
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
