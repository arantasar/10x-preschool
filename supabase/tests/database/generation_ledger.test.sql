-- fair-use ledger suite for public.generation_ledger and public.claim_generation()
-- (S-21, fair-use-limit)
--
-- the limit lives in the database, so its invariants are proved here, where
-- they live. none of them would show up in a typical month in the app:
--
--   * counting - below the limit a claim reserves a row, at the limit it is
--     refused and writes nothing; last month's rows do not count; `day` and
--     `refine` are separate families; an outline counts no day, is refused when
--     no day is left, and counts against the refine ceiling so it is never free.
--   * refunds - failed rows do not count up to the allowance, and the excess
--     over the allowance does. this is the bound on a script that marks its own
--     reservations failed.
--   * observe mode - over the limit it still reserves, and still says so.
--   * transitions - only reserved -> succeeded | failed, enforced by the
--     trigger (as the owner, past the column grant) and by the grant (as the
--     teacher).
--   * isolation - teacher b neither sees, changes, nor is counted with a's rows.
--   * cascade and retention - the ledger goes with the account and after 13
--     months, as the privacy policy says.

begin;

select plan(38);

-- ---------------------------------------------------------------------------
-- fixtures (as the owner, so rls is bypassed here by design)
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'teacher-a@test.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'teacher-b@test.local', 'x', now(), now(), now());

-- the first instant of the current month in Europe/Warsaw, for the seeds below
create temporary table month_bounds on commit drop as
select
  (date_trunc('month', now() at time zone 'Europe/Warsaw') at time zone 'Europe/Warsaw') as month_start,
  (date_trunc('month', now() at time zone 'Europe/Warsaw') + interval '1 month')::date as next_month;
grant select on month_bounds to authenticated;

-- teacher a: two days this month, one day a second before the month began,
-- three refines this month.
insert into public.generation_ledger (id, user_id, kind, status, created_at)
values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'day', 'succeeded', (select month_start from month_bounds)),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'day', 'reserved', now()),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'day', 'succeeded', (select month_start from month_bounds) - interval '1 second'),
  ('a0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'refine', 'succeeded', now()),
  ('a0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'refine', 'succeeded', now()),
  ('a0000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'refine', 'failed', now());

-- ---------------------------------------------------------------------------
-- 1-2. function metadata
-- ---------------------------------------------------------------------------

select ok(
  not (select prosecdef from pg_proc where oid = 'public.claim_generation(text, int, int, int, date, boolean)'::regprocedure),
  'claim_generation is security invoker - delete_own_account stays the only definer'
);

select ok(
  not has_function_privilege('anon', 'public.claim_generation(text, int, int, int, date, boolean)', 'execute'),
  'anon holds no execute privilege on claim_generation'
);

-- ---------------------------------------------------------------------------
-- 3-4. callers without an account are refused
-- ---------------------------------------------------------------------------

set local role anon;
set local "request.jwt.claims" to '{"role":"anon"}';

select throws_ok(
  $$select * from public.claim_generation('day', 150, 300, 30)$$,
  '42501',
  null,
  'anon cannot claim a generation'
);

reset role;

set local role authenticated;
set local "request.jwt.claims" to '{"role":"authenticated"}';

select throws_ok(
  $$select * from public.claim_generation('day', 150, 300, 30)$$,
  '42501',
  null,
  'an authenticated caller with no sub claim is refused'
);

reset role;

-- ---------------------------------------------------------------------------
-- 5-19. counting, as teacher a
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- a has 2 days this month (+1 last month). with a limit of 3 the third fits
-- only if last month's row is not counted.
select results_eq(
  $$select ledger_id is not null, allowed from public.claim_generation('day', 3, 300, 30, date '2026-11-02')$$,
  $$values (true, true)$$,
  'below the limit: allowed, with a reserved row - last month''s row is not counted'
);

select is(
  (select plan_date from public.generation_ledger where kind = 'day' and created_at = now() and id <> 'a0000000-0000-0000-0000-000000000002'),
  date '2026-11-02',
  'the reservation carries the planned day'
);

select results_eq(
  $$select ledger_id, allowed from public.claim_generation('day', 3, 300, 30)$$,
  $$values (null::uuid, false)$$,
  'at the limit: refused, with no ledger id'
);

select is(
  (select count(*)::int from public.generation_ledger g, month_bounds m where g.kind = 'day' and g.created_at >= m.month_start),
  3,
  'a refusal writes no row'
);

select is(
  (select resets_on from public.claim_generation('day', 3, 300, 30)),
  (select next_month from month_bounds),
  'resets_on is the first day of the next month in Europe/Warsaw'
);

select is(
  (select extract(day from resets_on)::int from public.claim_generation('day', 3, 300, 30)),
  1,
  'resets_on falls on the 1st'
);

select results_eq(
  $$select ledger_id, allowed from public.claim_generation('outline', 3, 300, 30)$$,
  $$values (null::uuid, false)$$,
  'an outline is refused when no day is left'
);

select results_eq(
  $$select ledger_id is not null, allowed from public.claim_generation('outline', 4, 300, 30)$$,
  $$values (true, true)$$,
  'an outline passes with one day left'
);

select results_eq(
  $$select ledger_id is not null, allowed from public.claim_generation('day', 4, 300, 30)$$,
  $$values (true, true)$$,
  'the outline used no day - the last day still fits'
);

-- refine family: 2 live + 1 failed (inside the allowance) this month.
select results_eq(
  $$select ledger_id is not null, allowed from public.claim_generation('refine', 1, 4, 30)$$,
  $$values (true, true)$$,
  'refines are their own family: allowed while the day limit is spent, and the refunded failure does not count (2 refines + 1 outline + 0 over the allowance leaves one under 4)'
);

select results_eq(
  $$select ledger_id, allowed from public.claim_generation('refine', 1, 4, 0)$$,
  $$values (null::uuid, false)$$,
  'with no refund allowance the failed refine counts again'
);

select results_eq(
  $$select ledger_id, allowed from public.claim_generation('outline', 150, 4, 30)$$,
  $$values (null::uuid, false)$$,
  'an outline counts against the refine ceiling: refused when it is spent, though days remain'
);

reset role;

-- two failed days this month for a (now 4 live days).
insert into public.generation_ledger (user_id, kind, status)
values
  ('11111111-1111-1111-1111-111111111111', 'day', 'failed'),
  ('11111111-1111-1111-1111-111111111111', 'day', 'failed');

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select results_eq(
  $$select ledger_id, allowed from public.claim_generation('day', 5, 300, 1)$$,
  $$values (null::uuid, false)$$,
  'failures over the refund allowance count: 4 live + (2 - 1) = 5 leaves no room under 5'
);

select results_eq(
  $$select ledger_id is not null, allowed from public.claim_generation('day', 5, 300, 2)$$,
  $$values (true, true)$$,
  'failures inside the refund allowance do not count: 4 live + 0 leaves one day under 5'
);

select results_eq(
  $$select ledger_id is not null, allowed from public.claim_generation('day', 1, 300, 30, null, false)$$,
  $$values (true, false)$$,
  'observe mode: over the limit the row is still reserved, and allowed is still false'
);

-- ---------------------------------------------------------------------------
-- 20-26. writes a teacher may and may not make
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.generation_ledger (kind, status) values ('day', 'failed')$$,
  '42501',
  null,
  'a row cannot be inserted already failed'
);

select throws_ok(
  $$insert into public.generation_ledger (user_id, kind) values ('22222222-2222-2222-2222-222222222222', 'day')$$,
  '42501',
  null,
  'a row cannot be inserted for another account'
);

select lives_ok(
  $$update public.generation_ledger set status = 'succeeded' where id = 'a0000000-0000-0000-0000-000000000002'$$,
  'reserved -> succeeded is allowed'
);

select throws_ok(
  $$update public.generation_ledger set status = 'failed' where id = 'a0000000-0000-0000-0000-000000000001'$$,
  'U0004',
  null,
  'succeeded -> failed is refused by the trigger'
);

select throws_ok(
  $$update public.generation_ledger set status = 'reserved' where id = 'a0000000-0000-0000-0000-000000000006'$$,
  'U0004',
  null,
  'failed -> reserved is refused by the trigger'
);

select throws_ok(
  $$update public.generation_ledger set user_id = '22222222-2222-2222-2222-222222222222' where id = 'a0000000-0000-0000-0000-000000000002'$$,
  '42501',
  null,
  'a teacher cannot change any column but status'
);

select throws_ok(
  $$delete from public.generation_ledger where id = 'a0000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'a teacher cannot delete ledger rows'
);

reset role;

select ok(
  (select finished_at is not null from public.generation_ledger where id = 'a0000000-0000-0000-0000-000000000002'),
  'finishing a row stamps finished_at'
);

-- the trigger, past the column grant: the owner tries the moves the grant hides.
insert into public.generation_ledger (id, user_id, kind)
values ('a0000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'day');

select throws_ok(
  $$update public.generation_ledger set user_id = '22222222-2222-2222-2222-222222222222', status = 'succeeded' where id = 'a0000000-0000-0000-0000-000000000007'$$,
  'U0004',
  null,
  'the trigger refuses a change of user_id even alongside a valid status move'
);

select throws_ok(
  $$update public.generation_ledger set kind = 'refine', status = 'failed' where id = 'a0000000-0000-0000-0000-000000000007'$$,
  'U0004',
  null,
  'the trigger refuses a change of kind'
);

-- ---------------------------------------------------------------------------
-- 29-32. teacher b
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.generation_ledger where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'teacher b sees none of a''s rows'
);

-- rls hides the row, so the update matches nothing; the owner checks below
-- that a's reservation is still reserved.
select lives_ok(
  $$update public.generation_ledger set status = 'failed' where id = 'a0000000-0000-0000-0000-000000000007'$$,
  'teacher b''s update of a''s reservation matches no row'
);

select results_eq(
  $$select ledger_id is not null, allowed from public.claim_generation('day', 1, 1, 0)$$,
  $$values (true, true)$$,
  'teacher b''s count does not include a''s rows'
);

reset role;

select is(
  (select status from public.generation_ledger where id = 'a0000000-0000-0000-0000-000000000007'),
  'reserved',
  'a''s reservation is untouched by b'
);

-- ---------------------------------------------------------------------------
-- 33-37. cascade and retention
-- ---------------------------------------------------------------------------

select ok(
  exists (
    select 1 from cron.job
    where jobname = 'generation-ledger-retention'
      and command like '%delete from public.generation_ledger%'
      and command like '%interval ''13 months''%'
  ),
  'retention: a cron job deletes ledger rows older than 13 months'
);

insert into public.generation_ledger (id, user_id, kind, created_at)
values
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'day', now() - interval '14 months'),
  ('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'day', now() - interval '12 months');

do $$
begin
  execute (select command from cron.job where jobname = 'generation-ledger-retention');
end;
$$;

select is(
  (select count(*)::int from public.generation_ledger where id = 'b0000000-0000-0000-0000-000000000001'),
  0,
  'retention: the job deletes a row older than 13 months'
);

select is(
  (select count(*)::int from public.generation_ledger where id = 'b0000000-0000-0000-0000-000000000002'),
  1,
  'retention: the job keeps a row younger than 13 months'
);

delete from auth.users where id = '11111111-1111-1111-1111-111111111111';

select is(
  (select count(*)::int from public.generation_ledger where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'deleting the account deletes its ledger rows'
);

select ok(
  (select count(*)::int from public.generation_ledger where user_id = '22222222-2222-2222-2222-222222222222') > 0,
  'another account''s ledger rows survive the deletion'
);

select * from finish();

rollback;
