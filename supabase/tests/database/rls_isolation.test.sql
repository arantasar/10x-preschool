-- rls isolation suite for public.day_plans and public.activities
--
-- proves the guarantee f-01 exists to provide: a signed-in teacher reaches
-- exactly their own rows and nothing else, across all four operations on both
-- tables, plus no anonymous reach at all.
--
-- two failure modes get explicit coverage because neither produces a symptom:
--   * cross-account update/delete - rls filters rather than raising, so the
--     statement "succeeds" while affecting zero rows. asserted on the affected
--     row count, not on an error.
--   * cross-account insert with a forged user_id - the `with check` path. this
--     is the one that silently writes another account's data if the policy is
--     missing its check clause.

begin;

select plan(23);

-- ---------------------------------------------------------------------------
-- fixtures (seeded as the owner, so rls is bypassed here by design)
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'teacher-a@test.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'teacher-b@test.local', 'x', now(), now(), now());

insert into public.day_plans (id, user_id, plan_date, prompt)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', date '2026-03-02', 'wiosna'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', date '2026-03-02', 'zwierzeta');

insert into public.activities (id, plan_id, user_id, generation, ordinal, title, description)
values
  ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 1, 1, 'a-one', 'opis a1'),
  ('a1a1a1a1-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 1, 2, 'a-two', 'opis a2'),
  ('b1b1b1b1-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 1, 1, 'b-one', 'opis b1'),
  ('b1b1b1b1-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 1, 2, 'b-two', 'opis b2');

-- rls filters silently, so cross-account writes have to be judged on how many
-- rows they touched. a data-modifying cte cannot be nested in a scalar
-- subquery, so the counts are parked here and asserted after the role switch.
create temp table affected_rows (label text primary key, n integer not null);
grant all on affected_rows to authenticated;

-- ---------------------------------------------------------------------------
-- teacher a's view of the world
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- day_plans: select

select is(
  (select count(*)::int from public.day_plans),
  1,
  'day_plans: teacher a sees exactly one plan - their own'
);

select is(
  (select count(*)::int from public.day_plans where user_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'day_plans: teacher b''s plan is invisible to teacher a'
);

-- day_plans: update / delete against b's row affect nothing

with upd as (
  update public.day_plans set prompt = 'przejete' where user_id = '22222222-2222-2222-2222-222222222222' returning 1
)
insert into affected_rows select 'day_plans_update', count(*)::int from upd;

with del as (
  delete from public.day_plans where user_id = '22222222-2222-2222-2222-222222222222' returning 1
)
insert into affected_rows select 'day_plans_delete', count(*)::int from del;

select is(
  (select n from affected_rows where label = 'day_plans_update'),
  0,
  'day_plans: teacher a''s update of teacher b''s plan affects zero rows'
);

select is(
  (select n from affected_rows where label = 'day_plans_delete'),
  0,
  'day_plans: teacher a''s delete of teacher b''s plan affects zero rows'
);

-- day_plans: insert forging b as the owner - the `with check` path

select throws_ok(
  $$insert into public.day_plans (user_id, plan_date, prompt)
    values ('22222222-2222-2222-2222-222222222222', date '2026-03-03', 'podszycie')$$,
  '42501',
  null,
  'day_plans: teacher a cannot insert a row owned by teacher b'
);

-- activities: select

select is(
  (select count(*)::int from public.activities),
  2,
  'activities: teacher a sees exactly their own two activities'
);

select is(
  (select count(*)::int from public.activities where user_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'activities: teacher b''s activities are invisible to teacher a'
);

-- activities: update / delete against b's rows affect nothing

with upd as (
  update public.activities set title = 'przejete' where user_id = '22222222-2222-2222-2222-222222222222' returning 1
)
insert into affected_rows select 'activities_update', count(*)::int from upd;

with del as (
  delete from public.activities where user_id = '22222222-2222-2222-2222-222222222222' returning 1
)
insert into affected_rows select 'activities_delete', count(*)::int from del;

select is(
  (select n from affected_rows where label = 'activities_update'),
  0,
  'activities: teacher a''s update of teacher b''s activities affects zero rows'
);

select is(
  (select n from affected_rows where label = 'activities_delete'),
  0,
  'activities: teacher a''s delete of teacher b''s activities affects zero rows'
);

-- activities: insert forging b as the owner

select throws_ok(
  $$insert into public.activities (plan_id, user_id, generation, ordinal, title, description)
    values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 1, 3, 'podszycie', 'opis')$$,
  '42501',
  null,
  'activities: teacher a cannot insert a row owned by teacher b'
);

-- ---------------------------------------------------------------------------
-- teacher a's own rows - the positive path
-- ---------------------------------------------------------------------------
--
-- every assertion above would pass just as green against write policies that
-- deny everything: deny-all likewise affects zero rows and likewise raises
-- 42501. these are what make the negatives above discriminating rather than
-- vacuous. do not delete them to "simplify" the suite.

select lives_ok(
  $$insert into public.day_plans (id, user_id, plan_date, prompt)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', date '2026-03-04', 'las')$$,
  'day_plans: teacher a can insert a plan they own'
);

select lives_ok(
  $$insert into public.activities (plan_id, user_id, generation, ordinal, title, description)
    values ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 1, 1, 'a-three', 'opis a3')$$,
  'activities: teacher a can insert an activity they own'
);

with upd as (
  update public.day_plans set prompt = 'las zimowy' where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' returning 1
)
insert into affected_rows select 'day_plans_self_update', count(*)::int from upd;

with upd as (
  update public.activities set title = 'a-three-poprawione' where plan_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' returning 1
)
insert into affected_rows select 'activities_self_update', count(*)::int from upd;

select is(
  (select n from affected_rows where label = 'day_plans_self_update'),
  1,
  'day_plans: teacher a''s update of their own plan affects exactly one row'
);

select is(
  (select n from affected_rows where label = 'activities_self_update'),
  1,
  'activities: teacher a''s update of their own activity affects exactly one row'
);

-- the child goes first: deleting the plan would cascade the activity away and
-- rob the activities delete assertion of its subject.

with del as (
  delete from public.activities where plan_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' returning 1
)
insert into affected_rows select 'activities_self_delete', count(*)::int from del;

with del as (
  delete from public.day_plans where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' returning 1
)
insert into affected_rows select 'day_plans_self_delete', count(*)::int from del;

select is(
  (select n from affected_rows where label = 'activities_self_delete'),
  1,
  'activities: teacher a''s delete of their own activity affects exactly one row'
);

select is(
  (select n from affected_rows where label = 'day_plans_self_delete'),
  1,
  'day_plans: teacher a''s delete of their own plan affects exactly one row'
);

-- ---------------------------------------------------------------------------
-- ownership transfer - the update `with check` path
-- ---------------------------------------------------------------------------
--
-- the row is a's on the way in, so the update policy's `using` filter passes;
-- something has to inspect it on the way out. two clauses do, and it is worth
-- knowing which: measured by weakening each in turn against this suite, the
-- block comes from the *select* policy, because postgres requires the new row
-- to remain visible under it after an update. the `with check` on the update
-- policy is real defense in depth but is redundant while that select policy
-- stands - weakening it alone changes nothing observable here.
--
-- these assertions therefore pin the behaviour, not one clause. if a future
-- change relaxes the select policy, they are what catches the handoff.

select throws_ok(
  $$update public.day_plans set user_id = '22222222-2222-2222-2222-222222222222'
    where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  '42501',
  null,
  'day_plans: teacher a cannot hand their own plan to teacher b'
);

select throws_ok(
  $$update public.activities set user_id = '22222222-2222-2222-2222-222222222222'
    where id = 'a1a1a1a1-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'activities: teacher a cannot hand their own activity to teacher b'
);

reset role;

-- ---------------------------------------------------------------------------
-- anonymous reach
-- ---------------------------------------------------------------------------
--
-- the migration revokes anon's table grants, so the denial fires at the grant
-- layer before rls is consulted - hence insufficient_privilege rather than an
-- empty result set. the eight anon deny policies still stand behind it.

set local role anon;
set local "request.jwt.claims" to '{"role":"anon"}';

select throws_ok(
  'select * from public.day_plans',
  '42501',
  null,
  'day_plans: anon is refused at the grant layer'
);

select throws_ok(
  'select * from public.activities',
  '42501',
  null,
  'activities: anon is refused at the grant layer'
);

reset role;

-- the grant revoke masks rls entirely for anon, so the assertions above say
-- nothing about whether the policy layer would hold on its own. hand the
-- privilege back inside this transaction and re-ask. the rollback undoes it.
--
-- what these two do *not* prove is that the eight anon deny policies do any
-- work: dropping them leaves this suite green, because rls with no applicable
-- policy already denies by default. measured, not assumed. they are also
-- permissive, so they would not override a future permissive anon policy -
-- only a restrictive one would. their value is documentary (plan.md:110),
-- and no test can make them discriminate.

grant select on public.day_plans to anon;
grant select on public.activities to anon;

set local role anon;
set local "request.jwt.claims" to '{"role":"anon"}';

select is(
  (select count(*)::int from public.day_plans),
  0,
  'day_plans: with anon''s grant restored, rls alone still yields no rows'
);

select is(
  (select count(*)::int from public.activities),
  0,
  'activities: with anon''s grant restored, rls alone still yields no rows'
);

reset role;

revoke select on public.day_plans from anon;
revoke select on public.activities from anon;

-- ---------------------------------------------------------------------------
-- structural ownership guarantee
-- ---------------------------------------------------------------------------
--
-- run as the owner, with rls out of the picture: even a caller that bypasses
-- every policy cannot attach an activity to a plan owned by someone else.

select throws_ok(
  $$insert into public.activities (plan_id, user_id, generation, ordinal, title, description)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 1, 9, 'rozjazd', 'opis')$$,
  '23503',
  null,
  'composite fk rejects an activity whose owner differs from its plan''s owner'
);

select * from finish();

rollback;
