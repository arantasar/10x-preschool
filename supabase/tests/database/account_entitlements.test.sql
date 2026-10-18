-- plan state suite for public.account_entitlements and the trial trigger
-- (S-23, trial-entitlement)
--
--   * the sign-up role - gotrue writes auth.users as supabase_auth_admin, and a
--     missing grant or policy for that role breaks every sign-up. inserting as
--     the owner proves nothing about it (postgres bypasses rls), and this suite
--     cannot become that role, so its usage, insert grant, insert policy and
--     lack of bypassrls are asserted directly; the real insert through gotrue
--     is src/lib/account-entitlement.db.test.ts.
--   * the date - the later of the sign-up day in Warsaw plus one month and
--     2027-01-31, inclusive (S-30): an autumn sign-up and the last day before
--     payments both get 31 january; a sign-up in mid january gets its month;
--     the end of january (no 31st of february); and a sign-up at 23:30 utc on
--     the 31st of december, which is already the 1st of january in Warsaw.
--   * the alignment - the migration's update moves trial rows dated before
--     2027-01-31 to that day and leaves owner rows and later dates alone.
--   * the table - a teacher reads only her own row and writes none; anon reads
--     nothing; an unknown plan or source is refused; the row goes with the
--     account.
--   * metadata - the trigger function is security invoker, and
--     delete_own_account is still the only definer in public.
--
-- no real account appears here: the repository is public.

begin;

select plan(28);

-- ---------------------------------------------------------------------------
-- 1-4. metadata
-- ---------------------------------------------------------------------------

select ok(
  not (select prosecdef from pg_proc where oid = 'public.start_trial_entitlement()'::regprocedure),
  'start_trial_entitlement is security invoker'
);

select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.start_trial_entitlement()'::regprocedure),
  'start_trial_entitlement pins an empty search_path'
);

select is(
  (select array_agg(proname::text order by proname) from pg_proc
    where pronamespace = 'public'::regnamespace and prosecdef),
  array['delete_own_account'],
  'delete_own_account is still the only security definer in public'
);

select is(
  (select array_agg(cmd || ' to ' || array_to_string(roles, ',')) from pg_policies
    where schemaname = 'public' and tablename = 'account_entitlements' and cmd <> 'SELECT'),
  array['INSERT to supabase_auth_admin'],
  'the only write policy is the insert for supabase_auth_admin - none for a teacher'
);

-- ---------------------------------------------------------------------------
-- 5-7. what the sign-up role needs
-- ---------------------------------------------------------------------------

-- gotrue inserts into auth.users as supabase_auth_admin, so the trigger runs
-- as that role. the local `postgres` this suite runs as is not a member of it
-- and cannot `set role` to it, so the role's path is proved here by its
-- privileges, each of which goes red without its grant, and end to end through
-- gotrue in src/lib/account-entitlement.db.test.ts. the accounts below are
-- inserted as the owner, like every other suite's fixtures.

select ok(
  has_schema_privilege('supabase_auth_admin', 'public', 'usage'),
  'supabase_auth_admin can reach schema public'
);

select ok(
  has_table_privilege('supabase_auth_admin', 'public.account_entitlements', 'insert'),
  'supabase_auth_admin can insert an entitlement'
);

select ok(
  not (select rolbypassrls from pg_roles where rolname = 'supabase_auth_admin'),
  'supabase_auth_admin does not bypass rls - its insert policy is what lets the row in'
);

-- ---------------------------------------------------------------------------
-- 8-14. sign-up
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'teacher-a@test.local', 'x', now(), timestamptz '2026-10-17 10:00:00+00', now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'teacher-b@test.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'teacher-c@test.local', 'x', now(), timestamptz '2027-01-31 10:00:00+00', now()),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'teacher-d@test.local', 'x', now(), timestamptz '2028-01-31 10:00:00+00', now()),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'teacher-e@test.local', 'x', now(), timestamptz '2026-12-31 23:30:00+00', now()),
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 'teacher-f@test.local', 'x', now(), timestamptz '2026-12-31 10:00:00+00', now()),
  ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777', 'authenticated', 'authenticated', 'teacher-g@test.local', 'x', now(), timestamptz '2027-01-15 10:00:00+00', now());

-- counted as the owner, so rls cannot hide a missing row.

select results_eq(
  $$select plan, source from public.account_entitlements where user_id = '11111111-1111-1111-1111-111111111111'$$,
  $$values ('basic'::text, 'trial'::text)$$,
  'a new account gets a basic trial row'
);

select is(
  (select count(*)::int from public.account_entitlements
    where user_id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
                      '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444',
                      '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666',
                      '77777777-7777-7777-7777-777777777777')),
  7,
  'every new account gets exactly one row'
);

select is(
  (select access_until from public.account_entitlements where user_id = '11111111-1111-1111-1111-111111111111'),
  date '2027-01-31',
  'signed up on 17 october, before payments: access until 31 january 2027'
);

select is(
  (select access_until from public.account_entitlements where user_id = '66666666-6666-6666-6666-666666666666'),
  date '2027-01-31',
  'signed up on 31 december 2026, the last day before payments: access until 31 january 2027'
);

select is(
  (select access_until from public.account_entitlements where user_id = '77777777-7777-7777-7777-777777777777'),
  date '2027-02-15',
  'signed up on 15 january 2027: the constant no longer applies, access until 15 february'
);

select is(
  (select array_agg(access_until order by user_id) from public.account_entitlements
    where user_id in ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444')),
  array[date '2027-02-28', date '2028-02-29'],
  'signed up on 31 january: access until the last day of february, in a common and a leap year'
);

select is(
  (select access_until from public.account_entitlements where user_id = '55555555-5555-5555-5555-555555555555'),
  date '2027-02-01',
  'signed up at 23:30 utc on 31 december - 1 january in Warsaw: access until 1 february'
);

-- ---------------------------------------------------------------------------
-- 15-19. as teacher a: her own row to read, nothing to write
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select results_eq(
  $$select user_id from public.account_entitlements$$,
  $$values ('11111111-1111-1111-1111-111111111111'::uuid)$$,
  'teacher a sees her own row and not teacher b''s'
);

select throws_ok(
  $$insert into public.account_entitlements (user_id, plan, access_until, source)
    values ('11111111-1111-1111-1111-111111111111', 'basic', date '2099-12-31', 'owner')$$,
  '42501',
  null,
  'teacher a cannot insert an entitlement'
);

select throws_ok(
  $$update public.account_entitlements set access_until = date '2099-12-31'
    where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  null,
  'teacher a cannot extend her own access'
);

select throws_ok(
  $$delete from public.account_entitlements where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  null,
  'teacher a cannot delete her own row'
);

reset role;

select results_eq(
  $$select access_until, source from public.account_entitlements where user_id = '11111111-1111-1111-1111-111111111111'$$,
  $$values (date '2027-01-31', 'trial'::text)$$,
  'teacher a''s row is unchanged after the refused writes'
);

-- ---------------------------------------------------------------------------
-- 20. anon reads nothing
-- ---------------------------------------------------------------------------

set local role anon;
set local "request.jwt.claims" to '{"role":"anon"}';

select throws_ok(
  $$select * from public.account_entitlements$$,
  '42501',
  null,
  'anon cannot read entitlements'
);

reset role;

-- ---------------------------------------------------------------------------
-- 21-22. unknown plan and source are refused (as the owner, above rls)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$update public.account_entitlements set plan = 'pro' where user_id = '22222222-2222-2222-2222-222222222222'$$,
  '23514',
  null,
  'an unknown plan is refused'
);

select throws_ok(
  $$update public.account_entitlements set source = 'gift' where user_id = '22222222-2222-2222-2222-222222222222'$$,
  '23514',
  null,
  'an unknown source is refused'
);

-- ---------------------------------------------------------------------------
-- 23. an edit moves updated_at (as the owner, like the sql editor)
-- ---------------------------------------------------------------------------

update public.account_entitlements
  set access_until = date '2027-01-31', source = 'owner', updated_at = timestamptz '2000-01-01 00:00:00+00'
  where user_id = '22222222-2222-2222-2222-222222222222';

select ok(
  (select updated_at > timestamptz '2000-01-01 00:00:00+00' from public.account_entitlements
    where user_id = '22222222-2222-2222-2222-222222222222'),
  'an edit of the row sets updated_at'
);

-- ---------------------------------------------------------------------------
-- 24-26. the alignment (the migration's update, run again as the same statement)
-- ---------------------------------------------------------------------------

-- three rows as they may stand on production before the migration: a trial
-- with its old month, an owner row, and a trial already past the constant.

update public.account_entitlements set access_until = date '2026-11-17', source = 'trial'
  where user_id = '33333333-3333-3333-3333-333333333333';
update public.account_entitlements set access_until = date '2099-12-31', source = 'owner'
  where user_id = '44444444-4444-4444-4444-444444444444';
update public.account_entitlements set access_until = date '2027-02-15', source = 'trial'
  where user_id = '77777777-7777-7777-7777-777777777777';

update public.account_entitlements
  set access_until = date '2027-01-31'
  where source = 'trial' and access_until < date '2027-01-31';

select is(
  (select access_until from public.account_entitlements where user_id = '33333333-3333-3333-3333-333333333333'),
  date '2027-01-31',
  'alignment: a trial row dated 17 november moves to 31 january 2027'
);

select results_eq(
  $$select access_until, source from public.account_entitlements where user_id = '44444444-4444-4444-4444-444444444444'$$,
  $$values (date '2099-12-31', 'owner'::text)$$,
  'alignment: an owner row is untouched'
);

select is(
  (select access_until from public.account_entitlements where user_id = '77777777-7777-7777-7777-777777777777'),
  date '2027-02-15',
  'alignment: a trial row dated after 31 january 2027 is not moved back'
);

-- ---------------------------------------------------------------------------
-- 27-28. the row goes with the account
-- ---------------------------------------------------------------------------

delete from auth.users where id = '11111111-1111-1111-1111-111111111111';

select is(
  (select count(*)::int from public.account_entitlements where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'deleting the account deletes its entitlement'
);

select is(
  (select count(*)::int from public.account_entitlements where user_id = '22222222-2222-2222-2222-222222222222'),
  1,
  'teacher b''s entitlement is untouched'
);

select * from finish();

rollback;
