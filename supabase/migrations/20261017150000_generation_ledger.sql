-- migration: generation ledger (S-21, fair-use-limit)
-- purpose: a durable record of every model call (day, week day, week outline,
--          activity refine) and the one place that decides whether an account
--          still fits inside its monthly fair-use limit (prd-v3 FR-027, FR-038).
-- affected: creates public.generation_ledger, three rls policies, one trigger
--           function and its trigger, public.claim_generation(), and one
--           pg_cron job that enforces the 13-month retention.
-- special considerations:
--   * a ledger, not a counter. usage in a month is counted from rows, so there
--     is no column a teacher could reset. through the api she can only add rows
--     to her own ledger (which only hurts her) and move her own `reserved` rows
--     to `succeeded` or `failed` - nothing else: update is granted on the
--     `status` column alone and the trigger below admits only those two moves.
--   * failed calls are refunded, but only up to `p_refund_allowance` per family
--     and month. a script holding the teacher's own token can mark its own
--     reservations `failed`; the allowance is the bound on that, so the real
--     ceiling is limit + allowance, not unbounded.
--   * the limits are arguments, not constants, so they live in configuration
--     (`FAIR_USE_*` in astro.config.mjs) and change without a deploy. calling
--     the rpc directly with an inflated limit only writes a ledger row - it
--     calls no model, so it bypasses nothing.
--   * security invoker on purpose. everything the route does with the teacher's
--     token she can do herself through /rest/v1/rpc, so a definer would close no
--     door and would break the invariant that delete_own_account() is the only
--     definer in the product. the schema carries the bounds instead: rls, the
--     column grant, the transition trigger and the refund allowance.
--   * concurrency: the week board fires five week/day calls at once. the
--     transaction-scoped advisory lock on the account serialises claims of one
--     account only; each claim counts after taking the lock, in a fresh
--     read-committed snapshot, so five parallel claims at 148/150 admit two.
--   * the month is the calendar month of the call in Europe/Warsaw, the
--     product's only time zone (src/lib/day-plan-dates.ts). `plan_date` is kept
--     for S-27, which will count by the planned day; nothing here reads it.
--   * the routes fail open: a missing function (e.g. a merge without
--     `npx supabase db push`) logs `fair_use.claim_failed` and generation goes
--     on. the limit falls silent; generation does not break.
--   * retention is code, not a promise: the cron job below deletes rows older
--     than 13 months; the account's rows go at once by cascade.
--   * rollback: `select cron.unschedule('generation-ledger-retention');`, then
--     `drop function public.claim_generation(text, int, int, int, date, boolean);`
--     and `drop table public.generation_ledger;` (the trigger function after it).

create table public.generation_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null constraint generation_ledger_kind_known check (kind in ('day', 'outline', 'refine')),
  -- the day the generation was for; read by S-27, not by this migration
  plan_date date,
  status text not null default 'reserved' constraint generation_ledger_status_known check (status in ('reserved', 'succeeded', 'failed')),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

comment on table public.generation_ledger is 'one row per model call, for the monthly fair-use limit. insert + update(status) for the owner only; deleted after 13 months by the generation-ledger-retention cron job.';
comment on column public.generation_ledger.kind is 'day (a day plan or a week day), outline (a week outline: counts no day, counts against the refine ceiling) or refine (one activity).';
comment on column public.generation_ledger.status is 'reserved before the model call, then succeeded or failed. reserved rows count like succeeded ones.';

-- the counting query and the retention job's predicate
create index generation_ledger_user_id_created_at_idx on public.generation_ledger (user_id, created_at);

-- ---------------------------------------------------------------------------
-- privileges and row level security
-- ---------------------------------------------------------------------------

alter table public.generation_ledger enable row level security;

-- supabase's default privileges grant everything on new public tables to the
-- api roles; this table hands back select, insert and an update of status.
revoke all on table public.generation_ledger from anon, authenticated;
grant select, insert on table public.generation_ledger to authenticated;
grant update (status) on table public.generation_ledger to authenticated;

create policy "authenticated can read their own ledger rows"
  on public.generation_ledger for select to authenticated
  using (user_id = (select auth.uid()));

create policy "authenticated can reserve generations as themselves"
  on public.generation_ledger for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'reserved');

create policy "authenticated can finish their own ledger rows"
  on public.generation_ledger for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- transitions: reserved -> succeeded | failed, and nothing else
-- ---------------------------------------------------------------------------

create or replace function public.generation_ledger_guard_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status <> 'reserved'
     or new.status not in ('succeeded', 'failed')
     or new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.kind is distinct from old.kind
     or new.plan_date is distinct from old.plan_date
     or new.created_at is distinct from old.created_at then
    raise exception 'generation ledger rows only move from reserved to succeeded or failed'
      using errcode = 'U0004';
  end if;

  new.finished_at := now();
  return new;
end;
$$;

comment on function public.generation_ledger_guard_transition is 'trigger function: admits only reserved -> succeeded | failed on generation_ledger and stamps finished_at.';

create trigger generation_ledger_guard_transition
  before update on public.generation_ledger
  for each row execute function public.generation_ledger_guard_transition();

-- ---------------------------------------------------------------------------
-- claim_generation: count this month, then reserve or refuse, atomically
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- retention
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;

select cron.schedule(
  'generation-ledger-retention',
  '29 3 * * *',
  $$delete from public.generation_ledger where created_at < now() - interval '13 months'$$
);
