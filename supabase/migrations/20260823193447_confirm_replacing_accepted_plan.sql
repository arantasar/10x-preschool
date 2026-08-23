-- confirmation of a destructive regeneration moves into the schema
--
-- s-02 shipped the rule "regenerating over an accepted plan needs the teacher's
-- confirmation" as a `window.confirm` in DayPlanEditor, gated on the island's own
-- copy of `accepted_at`. the writer never checked. that left two ways to destroy
-- an accepted plan without ever being asked:
--
--   * an ssr read that failed rendered the day as empty, so the island believed
--     there was nothing to lose and skipped the dialog;
--   * a second tab holding state from before the acceptance did the same.
--
-- both end in save_day_plan_generation deleting the accepted batch and clearing
-- accepted_at, and this slice has no undo - the loss is final. so the guard goes
-- where the destructive statement is, which is also what the plan's own rule
-- asks for: invariants live in the schema, not in typescript. the browser dialog
-- stays, but as an affordance rather than the enforcement point.
--
-- the check has to run *before* the upsert. the upsert clears accepted_at, so
-- after it there is no longer any evidence that there was an acceptance to
-- protect. `for update` on that first read is what makes the check meaningful
-- under concurrency: without it, a second session could accept the plan between
-- the read and the upsert. it also keeps the lock order this function already
-- had - day_plans first, activities second - so it introduces no new deadlock
-- pairing with activities_edit_clears_acceptance.
--
-- U0001 is a user-defined sqlstate (class U is reserved for exactly this). it
-- needs to be distinguishable from 23514: a counter mismatch is our bug and
-- answers 500, while this is a legitimate refusal the teacher can act on and
-- answers 409.
--
-- the signature changes, so the old three-argument function is dropped rather
-- than replaced - `create or replace` with an added defaulted parameter would
-- leave both overloads resident and make `supabase.rpc` ambiguous.

drop function public.save_day_plan_generation(date, text, jsonb);

create function public.save_day_plan_generation(
  p_plan_date date,
  p_prompt text,
  p_activities jsonb,
  p_confirm_replace boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan_id uuid;
  v_generation smallint;
  v_accepted boolean;
begin
  select accepted_at is not null
    into v_accepted
    from public.day_plans
   where user_id = (select auth.uid())
     and plan_date = p_plan_date
     for update;

  -- coalesce covers both "no plan yet" and "a plan rls hides": neither is an
  -- acceptance this caller owns, and neither should be refused here. a plan
  -- belonging to someone else is stopped by the insert's own with check.
  if coalesce(v_accepted, false) and not p_confirm_replace then
    raise exception
      'plan for % is accepted; regeneration must be confirmed', p_plan_date
      using errcode = 'U0001';
  end if;

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
  'the only writer of an activities batch: refuses to supersede an accepted plan '
  'without p_confirm_replace, then upserts the plan (bumping current_generation '
  'and clearing acceptance), drops the superseded batch, and inserts the new one '
  '- atomically, because postgrest gives the client no transaction.';

-- the grants do not survive the drop, and they are two revokes rather than one
-- for the reason the previous migration recorded: postgres grants execute to
-- PUBLIC on every new function, and supabase's default privileges additionally
-- grant it to anon directly, which a revoke from PUBLIC does not reach.

revoke all on function public.save_day_plan_generation(date, text, jsonb, boolean) from public;
revoke all on function public.save_day_plan_generation(date, text, jsonb, boolean) from anon;
grant execute on function public.save_day_plan_generation(date, text, jsonb, boolean) to authenticated;
