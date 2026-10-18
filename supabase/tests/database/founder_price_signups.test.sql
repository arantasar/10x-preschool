-- access contract for public.founder_price_signups (S-22, founder-price-signup)
--
-- insert-only for writes; authenticated reads only the row with its own
-- address; anon reads nothing. the failure modes covered here would all look
-- fine from the pricing page:
--   * an address that is not normalised - `Ania@x.pl` next to `ania@x.pl`
--     would be two people for S-25, and the select policy (compared against the
--     jwt's lowercase address) would miss the row.
--   * a forged sign-up - anon attributing a row to an account, or a signed-in
--     teacher putting someone else's user_id or someone else's address on the
--     list, or an anonymous row from inside her session.
--   * a select that hands back more than her own row - the table holds
--     addresses of people without an account.
--   * a repeat that does not surface as 23505 - the route turns exactly that
--     code into success, for anon and authenticated alike.
--   * retention that exists only on paper - the job's command is asserted and
--     run against a cut-off of today and of yesterday, so the test does not
--     depend on the calendar.
--
-- no real address appears here: the repository is public.

begin;

select plan(24);

-- ---------------------------------------------------------------------------
-- fixtures (as the owner, so rls is bypassed here by design)
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'teacher-a@test.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'teacher-b@test.local', 'x', now(), now(), now());

-- someone without an account, and teacher b before she signed in
insert into public.founder_price_signups (email, period)
values ('ktos@example.test', 'yearly'), ('teacher-b@test.local', 'monthly');

-- ---------------------------------------------------------------------------
-- 1-5. check constraints and uniqueness (as the owner: the schema's own bounds)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.founder_price_signups (email, period) values ('Ania@example.test', 'yearly')$$,
  '23514',
  null,
  'check: an address with capitals is refused'
);

select throws_ok(
  $$insert into public.founder_price_signups (email, period) values (' ania@example.test ', 'yearly')$$,
  '23514',
  null,
  'check: an address with surrounding spaces is refused'
);

select throws_ok(
  $$insert into public.founder_price_signups (email, period) values (repeat('x', 243) || '@example.test', 'yearly')$$,
  '23514',
  null,
  'check: an address over 254 characters is refused'
);

select throws_ok(
  $$insert into public.founder_price_signups (email, period) values ('ania@example.test', 'weekly')$$,
  '23514',
  null,
  'check: an unknown billing period is refused'
);

select throws_ok(
  $$insert into public.founder_price_signups (email, period) values ('ktos@example.test', 'monthly')$$,
  '23505',
  null,
  'unique: the same address cannot be listed twice'
);

-- ---------------------------------------------------------------------------
-- 6-10. anon
-- ---------------------------------------------------------------------------

set local role anon;
set local "request.jwt.claims" to '{"role":"anon"}';

select lives_ok(
  $$insert into public.founder_price_signups (email, period) values ('gosc@example.test', 'yearly')$$,
  'anon: signs up without an account'
);

select throws_ok(
  $$insert into public.founder_price_signups (user_id, email, period)
    values ('11111111-1111-1111-1111-111111111111', 'teacher-a@test.local', 'yearly')$$,
  '42501',
  null,
  'anon: cannot attribute a sign-up to an account'
);

select throws_ok(
  $$select count(*) from public.founder_price_signups$$,
  '42501',
  null,
  'anon: cannot read the list'
);

select throws_ok(
  $$update public.founder_price_signups set period = 'monthly'$$,
  '42501',
  null,
  'anon: cannot change sign-ups'
);

select throws_ok(
  $$delete from public.founder_price_signups$$,
  '42501',
  null,
  'anon: cannot delete sign-ups'
);

reset role;

-- ---------------------------------------------------------------------------
-- 11-18. authenticated (teacher a)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","email":"teacher-a@test.local"}';

select throws_ok(
  $$insert into public.founder_price_signups (user_id, email, period)
    values ('22222222-2222-2222-2222-222222222222', 'teacher-a@test.local', 'yearly')$$,
  '42501',
  null,
  'authenticated: cannot sign up under someone else''s account'
);

select throws_ok(
  $$insert into public.founder_price_signups (user_id, email, period)
    values ('11111111-1111-1111-1111-111111111111', 'inna@example.test', 'yearly')$$,
  '42501',
  null,
  'authenticated: cannot sign up someone else''s address'
);

select throws_ok(
  $$insert into public.founder_price_signups (email, period) values ('teacher-a@test.local', 'yearly')$$,
  '42501',
  null,
  'authenticated: cannot sign up anonymously from inside a session'
);

select lives_ok(
  $$insert into public.founder_price_signups (user_id, email, period)
    values ('11111111-1111-1111-1111-111111111111', 'teacher-a@test.local', 'monthly')$$,
  'authenticated: signs up as themselves with their own address'
);

select is(
  (select array_agg(email) from public.founder_price_signups),
  array['teacher-a@test.local'],
  'authenticated: reads only the row with their own address'
);

select throws_ok(
  $$insert into public.founder_price_signups (user_id, email, period)
    values ('11111111-1111-1111-1111-111111111111', 'teacher-a@test.local', 'yearly')$$,
  '23505',
  null,
  'authenticated: a repeat surfaces as a unique violation, which the route answers as success'
);

select throws_ok(
  $$update public.founder_price_signups set period = 'yearly'$$,
  '42501',
  null,
  'authenticated: cannot change sign-ups, not even their own'
);

select throws_ok(
  $$delete from public.founder_price_signups$$,
  '42501',
  null,
  'authenticated: cannot delete sign-ups, not even their own'
);

reset role;

-- ---------------------------------------------------------------------------
-- 19-20. authenticated (teacher b, listed before she signed in)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","email":"teacher-b@test.local"}';

select is(
  (select array_agg(email || ' ' || coalesce(user_id::text, 'anonymous')) from public.founder_price_signups),
  array['teacher-b@test.local anonymous'],
  'authenticated: sees the row with their own address added without an account, and not someone else''s'
);

select throws_ok(
  $$insert into public.founder_price_signups (user_id, email, period)
    values ('22222222-2222-2222-2222-222222222222', 'teacher-b@test.local', 'yearly')$$,
  '23505',
  null,
  'authenticated: signing up an address already listed anonymously is a unique violation'
);

reset role;

-- ---------------------------------------------------------------------------
-- 21-24. what landed, and retention
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.founder_price_signups),
  4,
  'owner view: the two seeded rows plus exactly the two allowed inserts'
);

select ok(
  exists (
    select 1 from cron.job
    where jobname = 'founder-price-signups-retention'
      and command like '%delete from public.founder_price_signups%'
      and command like '%(now() at time zone ''Europe/Warsaw'')::date > date ''2027-08-31''%'
  ),
  'retention: a cron job deletes the list once 2027-08-31 has passed in Europe/Warsaw'
);

-- the job's own command with the cut-off moved to today and to yesterday, so
-- the result does not depend on when this suite runs. (as the owner, like the
-- scheduled job.)

do $$
begin
  execute replace(
    (select command from cron.job where jobname = 'founder-price-signups-retention'),
    '2027-08-31',
    to_char((now() at time zone 'Europe/Warsaw')::date, 'YYYY-MM-DD')
  );
end;
$$;

select is(
  (select count(*)::int from public.founder_price_signups),
  4,
  'retention: on the cut-off day itself the list stays'
);

do $$
begin
  execute replace(
    (select command from cron.job where jobname = 'founder-price-signups-retention'),
    '2027-08-31',
    to_char((now() at time zone 'Europe/Warsaw')::date - 1, 'YYYY-MM-DD')
  );
end;
$$;

select is(
  (select count(*)::int from public.founder_price_signups),
  0,
  'retention: the day after the cut-off the whole list goes'
);

select * from finish();

rollback;
