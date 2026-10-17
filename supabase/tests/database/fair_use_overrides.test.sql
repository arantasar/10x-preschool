-- fair-use overrides suite for public.fair_use_overrides and the way
-- public.claim_generation() reads it (S-28, fair-use-overrides)
--
--   * the limit - an override without a ceiling admits any number of calls and
--     each still leaves a ledger row; a number replaces the configured limit,
--     above or below it; the two families are independent, and an outline
--     still needs room in both.
--   * validity - an override past its `valid_until` is ignored, one ending
--     today (Europe/Warsaw) still holds; an account without one behaves as
--     before.
--   * the table - a teacher reads only her own row and writes none; anon reads
--     nothing; 0 is not a limit; the row goes with the account; the expiry job
--     deletes expired rows only.
--
-- no real account appears here: the repository is public.

begin;

select plan(32);

-- ---------------------------------------------------------------------------
-- fixtures (as the owner, so rls is bypassed here by design)
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'teacher-a@test.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'teacher-b@test.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'teacher-c@test.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'teacher-d@test.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'teacher-e@test.local', 'x', now(), now(), now());

-- "today" exactly as claim_generation and the expiry job compute it
create temporary table warsaw on commit drop as
select (now() at time zone 'Europe/Warsaw')::date as today;
grant select on warsaw to authenticated;

-- teacher a: three days and three refines this month, and no ceiling at all.
insert into public.generation_ledger (user_id, kind, status)
values
  ('11111111-1111-1111-1111-111111111111', 'day', 'succeeded'),
  ('11111111-1111-1111-1111-111111111111', 'day', 'succeeded'),
  ('11111111-1111-1111-1111-111111111111', 'day', 'succeeded'),
  ('11111111-1111-1111-1111-111111111111', 'refine', 'succeeded'),
  ('11111111-1111-1111-1111-111111111111', 'refine', 'succeeded'),
  ('11111111-1111-1111-1111-111111111111', 'refine', 'succeeded');

insert into public.fair_use_overrides (user_id)
values ('11111111-1111-1111-1111-111111111111');

-- ---------------------------------------------------------------------------
-- 1-2. metadata
-- ---------------------------------------------------------------------------

select ok(
  not (select prosecdef from pg_proc where oid = 'public.claim_generation(text, int, int, int, date, boolean)'::regprocedure),
  'claim_generation is still security invoker - delete_own_account stays the only definer'
);

select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'fair_use_overrides' and cmd <> 'SELECT'
  ),
  'fair_use_overrides has no insert, update or delete policy'
);

-- ---------------------------------------------------------------------------
-- 3-6. no ceiling, as teacher a (3 days, 3 refines used)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select results_eq(
  $$select ledger_id is not null, allowed from public.claim_generation('day', 1, 1, 30)$$,
  $$values (true, true)$$,
  'no ceiling: a day passes far over the configured limit'
);

select is(
  (select count(*)::int from public.generation_ledger where kind = 'day'),
  4,
  'no ceiling: the reservation still leaves a ledger row'
);

select results_eq(
  $$select ledger_id is not null, allowed from public.claim_generation('refine', 1, 1, 30)$$,
  $$values (true, true)$$,
  'no ceiling: a refine passes over the configured limit'
);

select results_eq(
  $$select ledger_id is not null, allowed from public.claim_generation('outline', 1, 1, 30)$$,
  $$values (true, true)$$,
  'no ceiling: an outline passes over both configured limits'
);

reset role;

-- ---------------------------------------------------------------------------
-- 7-11. a number above the configured limit, and a family without a ceiling
-- (a: 4 days, 5 light)
-- ---------------------------------------------------------------------------

update public.fair_use_overrides
set days_per_month = 6, refines_per_month = null
where user_id = '11111111-1111-1111-1111-111111111111';

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select results_eq(
  $$select ledger_id is not null, allowed from public.claim_generation('day', 1, 1, 30)$$,
  $$values (true, true)$$,
  'a higher override admits a day over the configured limit (5th of 6)'
);

select results_eq(
  $$select ledger_id is not null, allowed from public.claim_generation('day', 1, 1, 30)$$,
  $$values (true, true)$$,
  'a higher override admits up to its own number (6th of 6)'
);

select results_eq(
  $$select ledger_id, allowed from public.claim_generation('day', 150, 300, 30)$$,
  $$values (null::uuid, false)$$,
  'a higher override refuses at its own number, though the configured limit is higher still'
);

select results_eq(
  $$select ledger_id is not null, allowed from public.claim_generation('refine', 1, 1, 30)$$,
  $$values (true, true)$$,
  'the families are independent: the day family is spent, the light family has no ceiling'
);

select results_eq(
  $$select ledger_id, allowed from public.claim_generation('outline', 150, 300, 30)$$,
  $$values (null::uuid, false)$$,
  'an outline still needs room in both families: refused with no day left'
);

reset role;

-- ---------------------------------------------------------------------------
-- 12-14. a number below the configured limit (a: 6 days, 6 light)
-- ---------------------------------------------------------------------------

update public.fair_use_overrides
set days_per_month = null, refines_per_month = 2
where user_id = '11111111-1111-1111-1111-111111111111';

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select results_eq(
  $$select ledger_id is not null, allowed from public.claim_generation('day', 1, 300, 30)$$,
  $$values (true, true)$$,
  'a day passes when only the light family has a number'
);

select results_eq(
  $$select ledger_id, allowed from public.claim_generation('refine', 150, 300, 30)$$,
  $$values (null::uuid, false)$$,
  'a lower override refuses earlier than the configured limit would'
);

select results_eq(
  $$select ledger_id, allowed from public.claim_generation('outline', 150, 300, 30)$$,
  $$values (null::uuid, false)$$,
  'an outline is refused when the light family is spent, though days have no ceiling'
);

reset role;

-- ---------------------------------------------------------------------------
-- 15-16. validity (a: 7 days)
-- ---------------------------------------------------------------------------

update public.fair_use_overrides
set days_per_month = null, refines_per_month = null, valid_until = (select today from warsaw) - 1
where user_id = '11111111-1111-1111-1111-111111111111';

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select results_eq(
  $$select ledger_id, allowed from public.claim_generation('day', 1, 300, 30)$$,
  $$values (null::uuid, false)$$,
  'an override that ended yesterday is ignored: the configured limit applies'
);

reset role;

update public.fair_use_overrides
set valid_until = (select today from warsaw)
where user_id = '11111111-1111-1111-1111-111111111111';

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select results_eq(
  $$select ledger_id is not null, allowed from public.claim_generation('day', 1, 300, 30)$$,
  $$values (true, true)$$,
  'an override ending today (Europe/Warsaw) is still in force'
);

reset role;

-- ---------------------------------------------------------------------------
-- 17-18. an account without an override, as teacher b
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select results_eq(
  $$select ledger_id is not null, allowed from public.claim_generation('day', 1, 1, 30)$$,
  $$values (true, true)$$,
  'no override: the first day under a limit of 1 passes'
);

select results_eq(
  $$select ledger_id, allowed from public.claim_generation('day', 1, 1, 30)$$,
  $$values (null::uuid, false)$$,
  'no override: the second is refused by the configured limit'
);

reset role;

-- ---------------------------------------------------------------------------
-- 19-24. reads and writes through the api
-- ---------------------------------------------------------------------------

insert into public.fair_use_overrides (user_id, days_per_month, refines_per_month)
values ('22222222-2222-2222-2222-222222222222', 10, 10);

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from public.fair_use_overrides where user_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'a teacher reads her own override'
);

select is(
  (select count(*)::int from public.fair_use_overrides where user_id <> '11111111-1111-1111-1111-111111111111'),
  0,
  'a teacher sees no other account''s override'
);

select throws_ok(
  $$insert into public.fair_use_overrides (user_id) values ('33333333-3333-3333-3333-333333333333')$$,
  '42501',
  null,
  'a teacher cannot insert an override'
);

select throws_ok(
  $$update public.fair_use_overrides set days_per_month = 1000 where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  null,
  'a teacher cannot change her override'
);

select throws_ok(
  $$delete from public.fair_use_overrides where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  null,
  'a teacher cannot delete her override'
);

reset role;

set local role anon;
set local "request.jwt.claims" to '{"role":"anon"}';

select throws_ok(
  $$select count(*) from public.fair_use_overrides$$,
  '42501',
  null,
  'anon cannot read overrides'
);

reset role;

-- ---------------------------------------------------------------------------
-- 25-26. a limit of 0 is not a limit
-- ---------------------------------------------------------------------------

select throws_ok(
  $$update public.fair_use_overrides set days_per_month = 0 where user_id = '22222222-2222-2222-2222-222222222222'$$,
  '23514',
  null,
  'check: days_per_month cannot be 0'
);

select throws_ok(
  $$update public.fair_use_overrides set refines_per_month = 0 where user_id = '22222222-2222-2222-2222-222222222222'$$,
  '23514',
  null,
  'check: refines_per_month cannot be 0'
);

-- ---------------------------------------------------------------------------
-- 27-30. the expiry job
-- ---------------------------------------------------------------------------

select ok(
  exists (
    select 1 from cron.job
    where jobname = 'fair-use-overrides-expiry'
      and command like '%delete from public.fair_use_overrides%'
      and command like '%Europe/Warsaw%'
  ),
  'expiry: a cron job deletes expired overrides'
);

insert into public.fair_use_overrides (user_id, valid_until)
values
  ('33333333-3333-3333-3333-333333333333', (select today from warsaw) - 1),
  ('44444444-4444-4444-4444-444444444444', (select today from warsaw)),
  ('55555555-5555-5555-5555-555555555555', null);

do $$
begin
  execute (select command from cron.job where jobname = 'fair-use-overrides-expiry');
end;
$$;

select is(
  (select count(*)::int from public.fair_use_overrides where user_id = '33333333-3333-3333-3333-333333333333'),
  0,
  'expiry: the job deletes an override that ended yesterday'
);

select is(
  (select count(*)::int from public.fair_use_overrides where user_id = '44444444-4444-4444-4444-444444444444'),
  1,
  'expiry: the job keeps an override ending today'
);

select is(
  (select count(*)::int from public.fair_use_overrides where user_id = '55555555-5555-5555-5555-555555555555'),
  1,
  'expiry: the job keeps an override without an end date'
);

-- ---------------------------------------------------------------------------
-- 31-32. cascade
-- ---------------------------------------------------------------------------

delete from auth.users where id = '11111111-1111-1111-1111-111111111111';

select is(
  (select count(*)::int from public.fair_use_overrides where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'deleting the account deletes its override'
);

select is(
  (select count(*)::int from public.fair_use_overrides where user_id = '22222222-2222-2222-2222-222222222222'),
  1,
  'another account''s override survives the deletion'
);

select * from finish();

rollback;
