-- migration: access until 31 january 2027 for accounts created before payments (S-30, trial-until-launch)
-- purpose: an account created before payments start gets full access until
--          2027-01-31 inclusive, not a month from sign-up, so every account
--          from before payments gets one notice (S-24) and one decision day,
--          1 february 2027. an account created later gets its month, as
--          before. the trial trigger now gives the later of the two dates,
--          and trial rows written since S-23 are aligned to the same day.
-- affected: replaces public.start_trial_entitlement() in place (same
--           signature; the trigger on_auth_user_created_start_trial, the
--           owner and the revoked execute stay) and updates trial rows in
--           public.account_entitlements dated before 2027-01-31.
-- special considerations:
--   * the repository is public. the alignment picks rows by source and date,
--     never by account; no e-mail address, account id or name of a real person
--     goes into this file.
--   * owner rows (testers, written in the sql editor) are untouched: the update
--     is narrowed to source = 'trial'. trial rows already dated after the
--     constant are not moved back: it is narrowed to access_until < the constant.
--   * still only one security definer in the product (delete_own_account): the
--     function stays security invoker with an empty search_path, and still
--     catches nothing - a failed insert fails the sign-up.
--   * read-only for the api is unchanged: no table, policy or grant is touched.
--   * no second migration at the start of payments: from a sign-up on
--     2027-01-01 on, "+1 month" always falls after 2027-01-31, so the constant
--     stops applying by itself.
--   * moving the date (payments delayed) is a NEW migration that changes the
--     constant here and moves trial rows still carrying the old date - never
--     the sql editor, so the function in the repo and on production stay the
--     same.
--   * additive: the app does not change. without `npx supabase db push`, new
--     accounts get a month and are aligned by this migration when it lands.
--   * rollback: restore the function body from
--     20261018140000_account_entitlements.sql. aligned dates are not moved back:
--     a longer access takes nothing away.

create or replace function public.start_trial_entitlement()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- the later of the sign-up day in Warsaw plus one month (17.10 -> 17.11,
  -- 31.01 -> the last day of february) and 2027-01-31, the last day before
  -- payments start. from a sign-up on 2027-01-01 on, the month always ends
  -- later, so the constant stops applying by itself. inclusive, like every
  -- date in this product.
  insert into public.account_entitlements (user_id, plan, access_until, source)
  values (
    new.id,
    'basic',
    greatest(
      ((coalesce(new.created_at, now()) at time zone 'Europe/Warsaw')::date + interval '1 month')::date,
      date '2027-01-31'
    ),
    'trial'
  );
  return new;
end;
$$;

comment on function public.start_trial_entitlement is 'plan state: after insert on auth.users, gives the new account its trial row in account_entitlements, access until the later of the sign-up day in Warsaw + 1 month and 2027-01-31 (the last day before payments, S-30). security invoker - runs as supabase_auth_admin under gotrue.';

-- trial rows written since S-23 carry a month from sign-up; they get the same
-- day as every account from before payments. updated_at follows through
-- account_entitlements_set_updated_at.
update public.account_entitlements
  set access_until = date '2027-01-31'
  where source = 'trial' and access_until < date '2027-01-31';
