-- delete suite for public.day_plans and the cascade that empties a day with it
--
-- a third file rather than an addition to the two that exist, because both of
-- those declare an identity in their header and should stay readable as exactly
-- that: rls_isolation.test.sql is the f-01 proof of account isolation,
-- day_plan_write.test.sql is the s-02 write contract. this one proves the
-- properties s-05 leans on, and they share the trait that decides which
-- assertions are worth their cost - every one of them breaks without any signal
-- the application could give:
--
--   * the delete privilege gone turns a teacher's "usuń plan dnia" into 42501,
--     which the store maps to config/500 - "skontaktuj się z administratorem"
--     on an action that has nothing to do with configuration.
--   * the cascade gone leaves activities behind with no plan to reach them
--     from. no read path in the project looks for them, so nobody ever finds
--     out.
--   * the cascade too wide takes another day's proposals with it. that day
--     still has its plan row, so it still renders as planned in the month grid
--     - and opens empty.
--   * a deleted day that save_day_plan_generation still counts as existing is
--     silently skipped by week generation. that is exactly the failure the
--     roadmap attributed to soft deletion, and hard deletion is only free of it
--     if p_require_absent really does pass over the emptied day.
--
-- s-05 adds no migration: the delete policy, the authenticated privilege and
-- `on delete cascade` on activities_plan_id_user_id_fkey have stood since f-01
-- and nothing has ever used them. this file is their first user and their first
-- proof.
--
-- method inherited from the f-01 review and kept by s-02: every assertion below
-- was checked by mutation - break the thing it claims to test, confirm it goes
-- red. an assertion that stays green after the cascade is dropped is not
-- testing the cascade.
--
-- account isolation of the delete is not repeated here. rls_isolation.test.sql
-- covers it in both directions (day_plans_delete, day_plans_self_delete).

begin;

select plan(6);

-- ---------------------------------------------------------------------------
-- fixtures (seeded as the owner, so rls is out of the picture here by design)
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'teacher-a@test.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'teacher-b@test.local', 'x', now(), now(), now());

-- teacher a gets *two* days, and that is the whole point of the second one: a
-- cascade wired to the teacher rather than to the plan would empty both, and an
-- assertion that only looked at the deleted day would stay green while it did.
insert into public.day_plans (id, user_id, plan_date, prompt, theme)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '11111111-1111-1111-1111-111111111111', date '2026-06-01', 'wiosna', 'kielki'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000002', '11111111-1111-1111-1111-111111111111', date '2026-06-02', 'wiosna', 'kielki'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-000000000001', '22222222-2222-2222-2222-222222222222', date '2026-06-03', 'kosmos', null);

insert into public.activities (plan_id, user_id, generation, ordinal, title, description)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '11111111-1111-1111-1111-111111111111', 1, 1, 'a1-one', 'opis a1-1'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '11111111-1111-1111-1111-111111111111', 1, 2, 'a1-two', 'opis a1-2'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '11111111-1111-1111-1111-111111111111', 1, 3, 'a1-three', 'opis a1-3'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000002', '11111111-1111-1111-1111-111111111111', 1, 1, 'a2-one', 'opis a2-1'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000002', '11111111-1111-1111-1111-111111111111', 1, 2, 'a2-two', 'opis a2-2'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-000000000001', '22222222-2222-2222-2222-222222222222', 1, 1, 'b-one', 'opis b1');

-- rls filters silently, so a delete has to be judged on how many rows it
-- touched rather than on whether it raised. a data-modifying cte cannot be
-- nested in a scalar subquery, so the counts are parked here and asserted after.
-- same shape as affected_rows in rls_isolation.test.sql.
create temp table affected_rows (label text primary key, n integer not null);
grant all on affected_rows to authenticated;

-- the function returns a uuid and a test script has nowhere to put a returned
-- value. same shape as `saved` in day_plan_write.test.sql.
create temp table saved (label text primary key, plan_id uuid not null);
grant all on saved to authenticated;

-- ---------------------------------------------------------------------------
-- 1. the privilege itself
-- ---------------------------------------------------------------------------
--
-- structural, and it is the only kind of evidence available: 20260720162553
-- revoked the table-level *update* grant and handed back a named column list.
-- nothing in that migration touches delete, and nothing in the application
-- would report it if a future one did - the first symptom would be a 500 on a
-- teacher's delete button. the catalog is the only witness.

select ok(
  has_table_privilege('authenticated', 'public.day_plans', 'delete'),
  'authenticated holds the delete privilege on day_plans'
);

-- ---------------------------------------------------------------------------
-- 2-4. deleting a day, and exactly one day
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

with del as (
  delete from public.day_plans where plan_date = date '2026-06-01' returning 1
)
insert into affected_rows select 'own_day', count(*)::int from del;

select is(
  (select n from affected_rows where label = 'own_day'),
  1,
  'a teacher deleting their own day touches exactly one plan row'
);

-- counted by plan_id rather than by "what the teacher can see", so the
-- assertion keeps its subject even though the plan row it belonged to is gone.
-- nothing deleted these rows explicitly; if they are absent, the cascade is the
-- only thing that could have taken them.
select is(
  (select count(*)::int from public.activities
    where plan_id = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001'),
  0,
  'the cascade takes the deleted day''s proposals with the plan'
);

-- the containment half. without it the assertion above reads identically
-- against a cascade wired to user_id, which would empty every day this teacher
-- has while leaving their plan rows standing - a month grid full of days that
-- open blank.
select is(
  (select count(*)::int from public.activities
    where plan_id = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000002'),
  2,
  'the cascade leaves the teacher''s other day untouched'
);

-- ---------------------------------------------------------------------------
-- 5. the deleted day is free again, not merely invisible
-- ---------------------------------------------------------------------------
--
-- the property the whole slice rests on. `select … for update` in
-- save_day_plan_generation finds nothing, v_exists stays null, and
-- `coalesce(v_exists, false)` makes p_require_absent pass - so week generation
-- covers the day again instead of skipping it. asserted rather than assumed,
-- because a skip is silent: no error, no log line, just a day the teacher
-- believes is planned and is not.
--
-- the mutation for this one (coalesce(v_exists, false) -> true) makes the call
-- below raise U0002, which aborts the script rather than printing `not ok`.
-- that is still red, and it is the only shape available: lives_ok plus a
-- separate is() would be two assertions for one property.
insert into saved
select 'reborn', public.save_day_plan_generation(
  date '2026-06-01',
  'wiosna od nowa',
  '[{"title":"r-one","description":"opis r1"},
    {"title":"r-two","description":"opis r2"},
    {"title":"r-three","description":"opis r3"}]'::jsonb,
  p_require_absent => true
);

-- generation 1, not 2: the counter went with the row. a day that came back at 2
-- would mean the delete left something resident behind it.
select is(
  (select current_generation::int from public.day_plans
    where id = (select plan_id from saved where label = 'reborn')),
  1,
  'a deleted day is absent for p_require_absent and starts again at generation 1'
);

-- ---------------------------------------------------------------------------
-- 6. deleting what is not there
-- ---------------------------------------------------------------------------
--
-- teacher b's day, which for teacher a is indistinguishable from a date nobody
-- has ever planned - and that is the point. rls filters instead of raising, so
-- this is a delete that succeeds and touches nothing. the store checks the
-- empty result explicitly and answers not_found; if this ever started raising
-- instead, that branch would become unreachable and a 404 would turn into a
-- 500.
--
-- measured, and the measurement is worth keeping: relaxing the *delete* policy
-- to `using (true)` leaves this assertion green. a delete whose where clause and
-- returning read columns also has the select policies applied to it, so what
-- actually hides teacher b's row here is
-- "authenticated users can select their own day plans". it goes red only when
-- both policies are opened. the delete policy is not redundant - it is what
-- rls_isolation.test.sql's day_plans_delete pins - but this line is not the
-- assertion holding it.

with del as (
  delete from public.day_plans where plan_date = date '2026-06-03' returning 1
)
insert into affected_rows select 'other_day', count(*)::int from del;

select is(
  (select n from affected_rows where label = 'other_day'),
  0,
  'deleting a day the teacher cannot see touches nothing and raises nothing'
);

reset role;

select * from finish();

rollback;
