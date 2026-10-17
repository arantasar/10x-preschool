-- migration: per-account fair-use overrides (S-28, fair-use-overrides)
-- purpose: lets the owner give one account its own monthly limit - higher,
--          lower, or no ceiling at all - with a row written in the supabase
--          dashboard, without a deploy. public.claim_generation() reads that
--          row and, while it is in force, uses its numbers instead of the limits
--          passed in from configuration (`FAIR_USE_*`).
-- affected: creates public.fair_use_overrides, one rls policy, and one pg_cron
--           job that deletes expired rows; replaces public.claim_generation()
--           with the same signature.
-- special considerations:
--   * the repository is public. no e-mail address, account id or name of a real
--     person goes into a migration, test or document here: rows for people are
--     written only in the dashboard (sql editor, as postgres, above rls).
--   * read-only for the api: a teacher can read her own row and nothing else,
--     and cannot insert, update or delete any. there is no insert/update/delete
--     policy and no such grant.
--   * `null` in a limit column means no ceiling for that family. the ledger still
--     records every call of such an account - the override changes the limit,
--     not the bookkeeping.
--   * `valid_until` is inclusive, as a date in Europe/Warsaw (the product's only
--     time zone). claim_generation and the expiry job compute "today" the same
--     way, so a row neither lapses a day early nor works a day late. the cron
--     job is the owner of this table's retention; the account's row goes at once
--     by cascade.
--   * still security invoker, for the reasons in 20261017150000: the function
--     reads the override through the teacher's own select policy.
--   * the refund allowance stays global (`FAIR_USE_REFUNDS_PER_MONTH`), and
--     observe mode is unchanged: an account without a ceiling gets
--     allowed = true, so it never shows up in `fair_use.would_limit`.
--   * additive: the signature does not change, so the deployed app works before
--     and after `npx supabase db push`; without the push, overrides simply do
--     not exist.
--   * rollback: `select cron.unschedule('fair-use-overrides-expiry');`, re-run
--     the function block of 20261017170000, then
--     `drop table public.fair_use_overrides;`.

create table public.fair_use_overrides (
  user_id uuid primary key references auth.users (id) on delete cascade,
  days_per_month int constraint fair_use_overrides_days_positive check (days_per_month >= 1),
  refines_per_month int constraint fair_use_overrides_refines_positive check (refines_per_month >= 1),
  valid_until date,
  created_at timestamptz not null default now()
);

comment on table public.fair_use_overrides is 'fair use: one account''s own monthly limit, written by the owner in the dashboard. read-only for the api (own row). expired rows are deleted by the fair-use-overrides-expiry cron job.';
comment on column public.fair_use_overrides.days_per_month is 'the day family''s limit for this account; null = no ceiling for that family.';
comment on column public.fair_use_overrides.refines_per_month is 'the light family''s limit (refines + week outlines) for this account; null = no ceiling for that family.';
comment on column public.fair_use_overrides.valid_until is 'last day the override is in force, inclusive, in Europe/Warsaw; null = no end date.';

-- ---------------------------------------------------------------------------
-- privileges and row level security
-- ---------------------------------------------------------------------------

alter table public.fair_use_overrides enable row level security;

-- supabase's default privileges grant everything on new public tables to the
-- api roles; this table hands back select to signed-in teachers only.
revoke all on table public.fair_use_overrides from anon, authenticated;
grant select on table public.fair_use_overrides to authenticated;

create policy "authenticated can read their own fair use override"
  on public.fair_use_overrides for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- claim_generation: the override, when in force, replaces the configured limits
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
  v_day_limit int;
  v_refine_limit int;
  v_day_live int;
  v_day_failed int;
  v_light_live int;
  v_light_failed int;
  v_day_used int;
  v_light_used int;
  v_day_fits boolean;
  v_light_fits boolean;
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

  -- where the limit comes from, first match wins:
  --   1. the account's override in public.fair_use_overrides, while in force;
  --   2. (from S-23) the account's plan;
  --   3. the arguments, i.e. the `FAIR_USE_*` configuration.
  -- read after the lock, in the same transaction as the count, so five
  -- parallel week/day claims all see the same limit. a null column in an
  -- override means no ceiling for that family.
  select o.days_per_month, o.refines_per_month
  into v_day_limit, v_refine_limit
  from public.fair_use_overrides o
  where o.user_id = v_uid
    and (o.valid_until is null
         or o.valid_until >= (now() at time zone 'Europe/Warsaw')::date);

  if not found then
    v_day_limit := p_day_limit;
    v_refine_limit := p_refine_limit;
  end if;

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

  v_day_fits := v_day_limit is null or v_day_used + 1 <= v_day_limit;
  v_light_fits := v_refine_limit is null or v_light_used + 1 <= v_refine_limit;

  v_allowed := case p_kind
    when 'day' then v_day_fits
    when 'refine' then v_light_fits
    else v_day_fits and v_light_fits
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

comment on function public.claim_generation is 'fair use: under a per-account advisory lock, counts this calendar month (Europe/Warsaw) and reserves a ledger row, or refuses. the account''s override in fair_use_overrides, while in force, replaces the limits passed in (null = no ceiling). with p_enforce = false (observe mode) it reserves even over the limit and still reports allowed = false.';

revoke all on function public.claim_generation(text, int, int, int, date, boolean) from public, anon;
grant execute on function public.claim_generation(text, int, int, int, date, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- retention: an expired override is deleted the next night
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;

select cron.schedule(
  'fair-use-overrides-expiry',
  '41 3 * * *',
  $$delete from public.fair_use_overrides where valid_until < (now() at time zone 'Europe/Warsaw')::date$$
);
