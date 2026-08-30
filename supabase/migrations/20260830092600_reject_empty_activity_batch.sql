-- ---------------------------------------------------------------------------
-- the batch writer refuses an empty batch
-- ---------------------------------------------------------------------------
--
-- `insert into activities ... select from jsonb_array_elements('[]'::jsonb)`
-- inserts zero rows and raises nothing. what that leaves behind is a day_plans
-- row with a bumped current_generation, a cleared accepted_at and no activities
-- at all - a day that reads as "planned" on the month grid, as `done` on the
-- week board, and as an empty screen in the editor. three surfaces, three
-- different lies, none of them an error.
--
-- until now the only thing standing between that state and the database was
-- `.length(ACTIVITY_COUNT)` in `day-plan-contract.ts`. that is a zod schema in
-- one route's request path, not an invariant: anything calling this function by
-- another road - psql, a future route, a migration - writes the empty day
-- without complaint. the project's own rule is that invariants live in the
-- schema, and this one did not.
--
-- the bound is "non-empty", not "= 3", and that is a decision rather than a
-- compromise. "a batch is never empty" is a structural invariant of the
-- relation; "exactly three" is the prompt contract's number, which can change
-- with a prompt edit and no migration. pinning the schema to three would also
-- break the thirteen call sites in `supabase/tests/database/` that write
-- single-element batches on purpose, and `day_plan_write.test.sql:244-254`
-- asserts `lives_ok` on exactly such a call. tightening further belongs to the
-- rollout phase that owns those tests.
--
-- `create or replace` rather than drop + create: the signature is unchanged, and
-- replacing keeps the grants from 20260823232953 rather than making this
-- migration restate them.

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
  -- asked before anything else, and specifically before the upsert. an empty
  -- batch is malformed input whatever state the day is in, so answering it with
  -- u0001 ("confirm to replace") or u0002 ("already planned") would invite the
  -- teacher to make a decision that cannot lead anywhere. running it after the
  -- upsert would be worse still: the refusal would arrive with
  -- current_generation already bumped and accepted_at already cleared.
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
  'the only writer of an activities batch: refuses an empty batch (u0003), '
  'leaves an existing day alone when p_require_absent, refuses to supersede an '
  'accepted plan without p_confirm_replace, then upserts the plan (bumping '
  'current_generation, clearing acceptance, keeping any theme the caller did '
  'not supply), drops the superseded batch and inserts the new one - '
  'atomically, because postgrest gives the client no transaction.';
