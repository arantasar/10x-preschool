-- ---------------------------------------------------------------------------
-- the week writer replaces an accepted day only if the teacher named its date
-- ---------------------------------------------------------------------------
--
-- s-10 (fr-013) lets a week run include accepted days. the writer was prepared
-- for that with `p_confirm_replace boolean`, and a boolean turns out to be the
-- wrong shape for the guarantee: one flag for the whole set means "replace any
-- accepted day that happens to be in the set". the set is chosen in the island
-- from a copy of `accepted_at` that can be stale for the 10-30s a week run
-- takes. a draft target accepted in another tab during that window would be
-- replaced with the flag set, although no dialog ever counted it - guardrail #2's
-- silent loss of accepted work, on a narrow path, in a system with no undo.
--
-- so the flag becomes the list of accepted dates the teacher was shown and
-- agreed to lose. the check is made per day inside the same `for update` that
-- already locks the row, so the membership test and the row it guards cannot
-- drift apart. a consented date that turns out not to be accepted is harmless:
-- the day is a draft and is replaced as one.
--
-- the boolean is removed, not kept alongside. a leftover "replace every
-- accepted day" switch next to the consent list would be exactly the bypass the
-- list exists to close.
--
-- the refusal keeps its code (u0001) and its message shape. the date has to
-- stay in the message: `weekConflictMessage` in day-plan-store.ts parses it out
-- to tell the teacher which day to go and look at.
--
-- the parameter's type changes, so this is drop + create rather than
-- `create or replace`, and the grants do not survive the drop. two revokes
-- rather than one for the reason 20260823193447 records: postgres grants execute
-- to public on every new function, and supabase's default privileges grant it
-- to anon directly, which a revoke from public does not reach.
--
-- deploy: the previous worker build sends `p_confirm_replace` and would hit a
-- signature that no longer exists. ship this migration and the route in the
-- same merge.
--
-- rollback: drop `save_week_plan_generation(text, jsonb, date[])`, recreate the
-- body from 20260920140000_week_writer_guards_plan_date.sql, and re-issue its
-- grant triple for `(text, jsonb, boolean)`.

drop function public.save_week_plan_generation(text, jsonb, boolean);

create function public.save_week_plan_generation(
  p_prompt text,
  p_days jsonb,
  p_confirm_dates date[] default '{}'
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

    -- consent is per date, not per call. an accepted day the teacher did not
    -- name - typically one accepted in another tab after the dialog - refuses
    -- the whole set, and the raise discards every day already written above.
    if coalesce(v_accepted, false)
       and not (v_plan_date = any (coalesce(p_confirm_dates, '{}'::date[]))) then
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
  'plan unless its date is in p_confirm_dates (u0001, naming the day), then per '
  'day upserts the plan (bumping current_generation, clearing acceptance, and '
  'keeping a theme the caller did not supply only while the hasło is unchanged), '
  'drops the superseded batch and inserts the new one. a raise anywhere in the '
  'loop discards every day the loop had already written.';

revoke all on function public.save_week_plan_generation(text, jsonb, date[]) from public;
revoke all on function public.save_week_plan_generation(text, jsonb, date[]) from anon;
grant execute on function public.save_week_plan_generation(text, jsonb, date[]) to authenticated;
