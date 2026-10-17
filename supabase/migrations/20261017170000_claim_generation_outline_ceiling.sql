-- migration: claim_generation after the implementation review (S-21, fair-use-limit)
-- purpose: two fixes to public.claim_generation() from the impl review of
--          fair-use-limit, as a migration of their own because
--          20261017150000_generation_ledger.sql already reached the hosted
--          project in its first form.
--   * f1 - a week outline was free of any ceiling: it counted no day and was
--     refused only when no day was left, so a script could call week/outline
--     without end. outline rows now count against the refine ceiling ("light"
--     family, refines + outlines), and an outline needs room under both.
--   * f4 - `p_plan_date` moves to the end with `default null`, so an outline
--     (which has no planned day) can leave it out and the generated type says so.
--     postgres wants defaulted arguments last, hence the new argument order.
-- affected: replaces public.claim_generation(); updates one column comment.
--           no table, row, policy or cron change.
-- special considerations:
--   * written to land on either form of the function: the original signature is
--     dropped if present, then the reviewed one is created or replaced.
--   * every other note in 20261017150000 still holds (security invoker, limits
--     as arguments, advisory lock, refund allowance).
--   * rollback: re-run the function block of 20261017150000 after
--     `drop function public.claim_generation(text, int, int, int, date, boolean);`.

drop function if exists public.claim_generation(text, date, int, int, int, boolean);

create or replace function public.claim_generation(
  p_kind text,
  p_day_limit int,
  p_refine_limit int,
  p_refund_allowance int,
  p_plan_date date default null,
  p_enforce boolean default true
)
returns table (ledger_id uuid, allowed boolean, resets_on date)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_month_local timestamp;
  v_month_start timestamptz;
  v_day_live int;
  v_day_failed int;
  v_light_live int;
  v_light_failed int;
  v_day_used int;
  v_light_used int;
  v_allowed boolean;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'claim_generation needs a signed-in caller'
      using errcode = '42501';
  end if;

  if p_kind is null or p_kind not in ('day', 'outline', 'refine') then
    raise exception 'unknown generation kind: %', p_kind
      using errcode = '22023';
  end if;

  if p_day_limit is null or p_refine_limit is null or p_refund_allowance is null then
    raise exception 'claim_generation needs every limit'
      using errcode = '22023';
  end if;

  -- one account's claims run one at a time; other accounts are not blocked.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('generation_ledger:' || v_uid::text, 0)
  );

  v_month_local := pg_catalog.date_trunc('month', now() at time zone 'Europe/Warsaw');
  v_month_start := v_month_local at time zone 'Europe/Warsaw';

  -- two families. `day`: day plans and week days. `light`: activity refines and
  -- week outlines - the cheap calls, under the refine ceiling. an outline uses
  -- no day, but it is a model call, so it must not be free of any ceiling: it
  -- counts against the light family, and is refused when no day is left either,
  -- so a teacher over the limit is stopped at the first click of a week.
  select
    count(*) filter (where gl.kind = 'day' and gl.status <> 'failed'),
    count(*) filter (where gl.kind = 'day' and gl.status = 'failed'),
    count(*) filter (where gl.kind in ('refine', 'outline') and gl.status <> 'failed'),
    count(*) filter (where gl.kind in ('refine', 'outline') and gl.status = 'failed')
  into v_day_live, v_day_failed, v_light_live, v_light_failed
  from public.generation_ledger gl
  where gl.user_id = v_uid
    and gl.created_at >= v_month_start;

  v_day_used := v_day_live + greatest(0, v_day_failed - p_refund_allowance);
  v_light_used := v_light_live + greatest(0, v_light_failed - p_refund_allowance);

  v_allowed := case p_kind
    when 'day' then v_day_used + 1 <= p_day_limit
    when 'refine' then v_light_used + 1 <= p_refine_limit
    else v_day_used + 1 <= p_day_limit and v_light_used + 1 <= p_refine_limit
  end;

  if v_allowed or not coalesce(p_enforce, true) then
    insert into public.generation_ledger (user_id, kind, plan_date)
    values (v_uid, p_kind, p_plan_date)
    returning id into v_id;
  end if;

  ledger_id := v_id;
  allowed := v_allowed;
  resets_on := (v_month_local + interval '1 month')::date;
  return next;
end;
$$;

comment on function public.claim_generation is 'fair use: under a per-account advisory lock, counts this calendar month (Europe/Warsaw) and reserves a ledger row, or refuses. with p_enforce = false (observe mode) it reserves even over the limit and still reports allowed = false.';

revoke all on function public.claim_generation(text, int, int, int, date, boolean) from public, anon;
grant execute on function public.claim_generation(text, int, int, int, date, boolean) to authenticated;

comment on column public.generation_ledger.kind is 'day (a day plan or a week day), outline (a week outline: counts no day, counts against the refine ceiling) or refine (one activity).';
