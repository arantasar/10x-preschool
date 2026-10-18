-- migration: account entitlements and the trial at sign-up (S-23, trial-entitlement)
-- purpose: introduces the product's one model of what an account is entitled
--          to - "a plan + access up to a date" - and gives every account created
--          from now on its first month: plan 'basic', access until the same day
--          of the next month, source 'trial'. payments (S-25, S-26) will move the
--          same date; S-27 will read the plan in the fair-use limit.
-- affected: creates public.account_entitlements (with an updated_at trigger on
--           public.set_updated_at()), two rls policies, the trigger
--           function public.start_trial_entitlement() and the trigger
--           on_auth_user_created_start_trial on auth.users; grants
--           supabase_auth_admin usage on schema public and insert on the table.
-- special considerations:
--   * the repository is public. no e-mail address, account id or name of a real
--     person goes into a migration, test or document here: rows for people (the
--     testers, source 'owner') are written only in the dashboard (sql editor, as
--     postgres, above rls).
--   * read-only for the api: a teacher can read her own row and nothing else,
--     and cannot insert, update or delete any. the only writers are the trigger
--     and the sql editor.
--   * no row = an account created before this migration, NOT a free plan. that
--     holds until S-24 gives those accounts their rows.
--   * `access_until` is inclusive, as a date in Europe/Warsaw (the product's only
--     time zone), the same convention as fair_use_overrides.valid_until.
--   * still only one security definer in the product (delete_own_account): the
--     trigger function is security invoker. gotrue inserts into auth.users as
--     supabase_auth_admin, so that role gets exactly what the insert needs -
--     usage on public, insert on this table, and an insert policy (rls is on
--     and the role does not bypass it). this is supabase's documented pattern
--     for auth hooks.
--   * no exception handling in the trigger: if the row cannot be written, the
--     sign-up fails with it. every account created after this migration has a
--     row - the invariant payments will stand on.
--   * the fair-use limit function is not changed here (S-27 wires the plan in).
--   * additive: the deployed app works before and after `npx supabase db push`;
--     without the push, sign-up works and simply writes no row, and the settings
--     page shows no access card.
--   * rollback: `drop trigger on_auth_user_created_start_trial on auth.users;
--     drop function public.start_trial_entitlement();
--     drop table public.account_entitlements;`.

create table public.account_entitlements (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null constraint account_entitlements_plan_known check (plan in ('basic')),
  access_until date not null,
  source text not null constraint account_entitlements_source_known check (source in ('trial', 'owner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.account_entitlements is 'plan state: one row per account, "a plan + access up to a date". written only by the sign-up trigger (start_trial_entitlement) and in the sql editor; read-only for the api (own row). no row = an account created before payments (until S-24), not a free plan.';
comment on column public.account_entitlements.plan is 'the plan the account has access to until access_until.';
comment on column public.account_entitlements.access_until is 'last day of access, inclusive, in Europe/Warsaw.';
comment on column public.account_entitlements.source is 'where the current access_until came from: trial (sign-up trigger) or owner (sql editor).';

-- the sql editor (testers) and, later, payments update the row; updated_at
-- follows through the product's shared trigger function.
create trigger account_entitlements_set_updated_at
  before update on public.account_entitlements
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- privileges and row level security
-- ---------------------------------------------------------------------------

alter table public.account_entitlements enable row level security;

-- supabase's default privileges grant everything on new public tables to the
-- api roles; this table hands back select to signed-in teachers only.
revoke all on table public.account_entitlements from anon, authenticated;
grant select on table public.account_entitlements to authenticated;

create policy "authenticated can read their own entitlement"
  on public.account_entitlements for select to authenticated
  using (user_id = (select auth.uid()));

-- gotrue writes auth.users as supabase_auth_admin; the trigger below runs as
-- that role, so it needs to reach the table and to pass rls on insert.
grant usage on schema public to supabase_auth_admin;
grant insert on table public.account_entitlements to supabase_auth_admin;

create policy "supabase_auth_admin can start an entitlement at sign-up"
  on public.account_entitlements for insert to supabase_auth_admin
  with check (true);

-- ---------------------------------------------------------------------------
-- the trial: one row for every new account
-- ---------------------------------------------------------------------------

create function public.start_trial_entitlement()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- the sign-up day in Warsaw, plus one month: 17.10 -> 17.11, 31.01 -> the
  -- last day of february. inclusive, like every date in this product.
  insert into public.account_entitlements (user_id, plan, access_until, source)
  values (
    new.id,
    'basic',
    ((coalesce(new.created_at, now()) at time zone 'Europe/Warsaw')::date + interval '1 month')::date,
    'trial'
  );
  return new;
end;
$$;

comment on function public.start_trial_entitlement is 'plan state: after insert on auth.users, gives the new account its trial row in account_entitlements. security invoker - runs as supabase_auth_admin under gotrue.';

revoke execute on function public.start_trial_entitlement() from public, anon, authenticated;

create trigger on_auth_user_created_start_trial
  after insert on auth.users
  for each row execute function public.start_trial_entitlement();
