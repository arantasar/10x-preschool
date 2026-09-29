-- ---------------------------------------------------------------------------
-- consent names the acceptance the teacher saw, not only its date
-- ---------------------------------------------------------------------------
--
-- 20260928120000 made the week writer replace an accepted day only if its date
-- was in `p_confirm_dates`. the implementation review of s-10 found two holes in
-- that shape, both in the layer the invariant is meant to live in:
--
-- 1. a date is not an acceptance. the teacher consents to losing *the plan they
--    were shown*. withdraw it in another tab, edit it, accept it again, and the
--    date is still on the list - the writer would replace work no dialog ever
--    counted. the window is not only the 10-30s of a run: the island keeps a
--    failed run's batches and can re-send its consent from "Zapisz tydzień"
--    much later.
-- 2. `v_plan_date = any (array[..., null])` is null, not false, for a date not
--    on the list, and `if true and not null` does not raise. a null element in
--    the array waved every accepted day through. the route's zod could not send
--    one; a direct rpc call could.
--
-- so each consent now names the day *and* the `accepted_at` the teacher saw,
-- and the writer compares both against the row it holds `for update`. a
-- re-acceptance gets a new `accepted_at` and is refused like any other
-- unconsented accepted day. the test is an `exists` over matching entries, so
-- a null or malformed-but-castable entry simply matches nothing: every unknown
-- lands on the refusal side. an `accepted_at` postgres cannot cast raises
-- 22007 and aborts the call, which fails closed too; the route never sends one.
--
-- the `plan_date` comparison is on text against `v_plan_date_text`, which the
-- loop has already checked is `yyyy-mm-dd`. comparing as dates would make a
-- malformed consent entry raise from inside the cast instead of just not
-- matching.
--
-- everything else is the 20260928120000 body unchanged: the plan_date shape
-- check, the empty-batch refusal, theme coalescing, `accepted_at = null`, the
-- lock order, the u0001 message with the date in it (`weekConflictMessage`
-- parses it).
--
-- the parameter's type changes, so drop + create, and the grant triple is
-- re-issued for the reason 20260823193447 records.
--
-- deploy: ship with the route that sends `p_confirm_accepted`; any other pairing
-- of worker and function fails with pgrst202 and writes nothing.
--
-- rollback: drop `save_week_plan_generation(text, jsonb, jsonb)`, recreate the
-- body from 20260928120000_week_writer_consent_dates.sql and re-issue its grant
-- triple for `(text, jsonb, date[])`.

drop function public.save_week_plan_generation(text, jsonb, date[]);

create function public.save_week_plan_generation(
  p_prompt text,
  p_days jsonb,
  p_confirm_accepted jsonb default '[]'
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
  v_accepted_at timestamptz;
  v_consents jsonb;
  v_written jsonb := '[]'::jsonb;
begin
  if p_days is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) = 0 then
    raise exception
      'week generation carries no days; a generation must write at least one day'
      using errcode = 'U0003';
  end if;

  -- anything that is not an array consents to nothing.
  v_consents := case
                  when jsonb_typeof(p_confirm_accepted) = 'array' then p_confirm_accepted
                  else '[]'::jsonb
                end;

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

    v_accepted_at := null;

    select accepted_at
      into v_accepted_at
      from public.day_plans
     where user_id = (select auth.uid())
       and plan_date = v_plan_date
       for update;

    -- consent is per acceptance, not per date and not per call. an accepted day
    -- is replaced only if the teacher named this day *and* this acceptance of
    -- it. one accepted in another tab after the dialog - or withdrawn and
    -- accepted again - matches no entry and refuses the whole set; the raise
    -- discards every day already written above.
    if v_accepted_at is not null
       and not exists (
         select 1
           from jsonb_array_elements(v_consents) as consent(value)
          where consent.value ->> 'plan_date' = v_plan_date_text
            and (consent.value ->> 'accepted_at')::timestamptz = v_accepted_at
       ) then
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
  'plan unless p_confirm_accepted names both its date and its current '
  'accepted_at (u0001, naming the day), then per day upserts the plan (bumping '
  'current_generation, clearing acceptance, and keeping a theme the caller did '
  'not supply only while the hasło is unchanged), drops the superseded batch and '
  'inserts the new one. a raise anywhere in the loop discards every day the loop '
  'had already written.';

revoke all on function public.save_week_plan_generation(text, jsonb, jsonb) from public;
revoke all on function public.save_week_plan_generation(text, jsonb, jsonb) from anon;
grant execute on function public.save_week_plan_generation(text, jsonb, jsonb) to authenticated;
