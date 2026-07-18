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

select plan(13);

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
