-- write-contract suite for public.save_day_plan_generation and its triggers
--
-- separate from rls_isolation.test.sql on purpose: that file is the f-01 proof
-- of account isolation and should stay readable as exactly that. this one
-- proves the properties s-02 adds, all of which share a trait - nothing in the
-- application signals when they break. a batch written at the wrong generation
-- renders as an empty plan; a superseded batch left behind renders as nothing
-- at all until the counter moves again; an acceptance that survives an edit
-- looks identical to one that was re-given.
--
-- method inherited from the f-01 review: every assertion below was checked by
-- mutation - break the thing it claims to test, confirm it goes red. an
-- assertion that stays green with the trigger dropped is not testing the
-- trigger.

begin;

select plan(23);

-- ---------------------------------------------------------------------------
-- fixtures (seeded as the owner, so rls is out of the picture here by design)
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'teacher-a@test.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'teacher-b@test.local', 'x', now(), now(), now());

-- two plans of teacher a's, differing only in where their counter stands, so
-- the invariant can be pushed at from both sides.
insert into public.day_plans (id, user_id, plan_date, prompt, current_generation)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '11111111-1111-1111-1111-111111111111', date '2026-03-02', 'wiosna', 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000002', '11111111-1111-1111-1111-111111111111', date '2026-03-05', 'jesien', 2);

-- the function returns a uuid, and a test script has nowhere to put a returned
-- value; this parks it for the assertions that follow. same shape as
-- affected_rows in rls_isolation.test.sql.
create temp table saved (label text primary key, plan_id uuid not null);
grant all on saved to authenticated;

-- ---------------------------------------------------------------------------
-- the generation invariant
-- ---------------------------------------------------------------------------

set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$insert into public.activities (plan_id, user_id, generation, ordinal, title, description)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '11111111-1111-1111-1111-111111111111', 2, 1, 'przedwczesna', 'opis')$$,
  '23514',
  null,
  'a batch ahead of the plan''s counter is refused'
);

select throws_ok(
  $$insert into public.activities (plan_id, user_id, generation, ordinal, title, description)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-000000000002', '11111111-1111-1111-1111-111111111111', 1, 1, 'przeterminowana', 'opis')$$,
  '23514',
  null,
  'a batch behind the plan''s counter is refused'
);

-- a plan the caller cannot see is an authorization failure, not a constraint
-- one, and answers the code rls itself would have given. run against a plan_id
-- that exists for nobody, so the trigger is what refuses it: drop the trigger
-- and this comes back as a foreign key violation (23503) instead, which is the
-- only way to tell the branch is doing work at all - behind rls it is by design
-- indistinguishable from the denial it stands in for.
select throws_ok(
  $$insert into public.activities (plan_id, user_id, generation, ordinal, title, description)
    values ('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', 1, 1, 'sierota', 'opis')$$,
  '42501',
  null,
  'a plan the caller cannot see is refused as a privilege failure, not a check failure'
);

-- without this the two above would pass just as green against a trigger that
-- refuses everything. do not delete it to "simplify" the suite.
select lives_ok(
  $$insert into public.activities (plan_id, user_id, generation, ordinal, title, description)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '11111111-1111-1111-1111-111111111111', 1, 1, 'zgodna', 'opis')$$,
  'a batch at the plan''s counter is accepted'
);

-- ---------------------------------------------------------------------------
-- first generation for a day that has no plan yet
-- ---------------------------------------------------------------------------

insert into saved
select 'day', public.save_day_plan_generation(
  date '2026-04-01',
  'zima',
  '[{"title":"z-one","description":"opis 1"},
    {"title":"z-two","description":"opis 2"},
    {"title":"z-three","description":"opis 3"}]'::jsonb
);

select is(
  (select current_generation::int from public.day_plans
    where id = (select plan_id from saved where label = 'day')),
  1,
  'a day with no plan starts at generation 1'
);

select is(
  (select count(*)::int from public.activities
    where plan_id = (select plan_id from saved where label = 'day')),
  3,
  'the first call writes exactly the three proposals it was given'
);

-- ordinal and title asserted together: array_agg ordered by ordinal alone would
-- still pass if the ordinals were 5, 6, 7. `with ordinality` is what makes this
-- deterministic - `row_number() over ()` has no order by and would not.
select is(
  (select array_agg(ordinal::int || ':' || title order by ordinal)
     from public.activities
    where plan_id = (select plan_id from saved where label = 'day')),
  array['1:z-one', '2:z-two', '3:z-three'],
  'ordinals follow the order the model returned the proposals in'
);

-- ---------------------------------------------------------------------------
-- regeneration: counter up, old batch gone, acceptance withdrawn
-- ---------------------------------------------------------------------------

update public.day_plans
   set accepted_at = now()
 where id = (select plan_id from saved where label = 'day');

insert into saved
select 'again', public.save_day_plan_generation(
  date '2026-04-01',
  'lato',
  '[{"title":"l-one","description":"opis 4"},
    {"title":"l-two","description":"opis 5"},
    {"title":"l-three","description":"opis 6"}]'::jsonb
);

select is(
  (select plan_id from saved where label = 'again'),
  (select plan_id from saved where label = 'day'),
  'regenerating the same day rewrites the same plan rather than creating a second'
);

select is(
  (select current_generation::int from public.day_plans
    where id = (select plan_id from saved where label = 'day')),
  2,
  'regeneration advances the counter to 2'
);

-- counted across the whole plan, not filtered to the current generation: a
-- filtered count would read 3 whether or not the superseded batch was deleted,
-- which is the entire property under test.
select is(
  (select count(*)::int from public.activities
    where plan_id = (select plan_id from saved where label = 'day')),
  3,
  'the superseded batch is deleted, not left resident alongside the new one'
);

select is(
  (select array_agg(title order by ordinal) from public.activities
    where plan_id = (select plan_id from saved where label = 'day')),
  array['l-one', 'l-two', 'l-three'],
  'the three surviving rows are the new batch'
);

select is(
  (select accepted_at from public.day_plans
    where id = (select plan_id from saved where label = 'day')),
  null,
  'regeneration withdraws an acceptance the teacher had already given'
);

select is(
  (select prompt from public.day_plans
    where id = (select plan_id from saved where label = 'day')),
  'lato',
  'regeneration replaces the haslo the batch grew from'
);

-- ---------------------------------------------------------------------------
-- editing content returns the plan to draft; reordering does not
-- ---------------------------------------------------------------------------

update public.day_plans
   set accepted_at = now()
 where id = (select plan_id from saved where label = 'day');

update public.activities
   set title = 'l-one-poprawione'
 where plan_id = (select plan_id from saved where label = 'day')
   and ordinal = 1;

select is(
  (select accepted_at from public.day_plans
    where id = (select plan_id from saved where label = 'day')),
  null,
  'editing a title returns the plan to draft'
);

update public.day_plans
   set accepted_at = now()
 where id = (select plan_id from saved where label = 'day');

update public.activities
   set description = 'opis 4 poprawiony'
 where plan_id = (select plan_id from saved where label = 'day')
   and ordinal = 1;

select is(
  (select accepted_at from public.day_plans
    where id = (select plan_id from saved where label = 'day')),
  null,
  'editing a description returns the plan to draft'
);

-- the `when` clause on the trigger exists for this one. reordering is not a
-- change of content and must not cost the teacher their acceptance.
update public.day_plans
   set accepted_at = now()
 where id = (select plan_id from saved where label = 'day');

update public.activities
   set ordinal = 9
 where plan_id = (select plan_id from saved where label = 'day')
   and ordinal = 1;

select isnt(
  (select accepted_at from public.day_plans
    where id = (select plan_id from saved where label = 'day')),
  null,
  'reordering a proposal leaves the acceptance standing'
);

-- ---------------------------------------------------------------------------
-- the function is security invoker: one date, two teachers, two plans
-- ---------------------------------------------------------------------------

reset role;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local role authenticated;

insert into saved
select 'teacher_b', public.save_day_plan_generation(
  date '2026-04-01',
  'kosmos',
  '[{"title":"b-one","description":"opis b1"},
    {"title":"b-two","description":"opis b2"},
    {"title":"b-three","description":"opis b3"}]'::jsonb
);

select isnt(
  (select plan_id from saved where label = 'teacher_b'),
  (select plan_id from saved where label = 'day'),
  'teacher b generating for a date teacher a already used gets their own plan'
);

select is(
  (select count(*)::int from public.activities
    where plan_id = (select plan_id from saved where label = 'teacher_b')
      and user_id = '22222222-2222-2222-2222-222222222222'),
  3,
  'teacher b''s batch is written under teacher b''s ownership'
);

-- the same branch again, this time with rls doing the hiding rather than the row
-- being absent: teacher b cannot reach into teacher a's plan even at a counter
-- that would otherwise match.
select throws_ok(
  $$insert into public.activities (plan_id, user_id, generation, ordinal, title, description)
    values ((select plan_id from saved where label = 'day'), '22222222-2222-2222-2222-222222222222', 2, 4, 'podszycie', 'opis')$$,
  '42501',
  null,
  'a plan hidden by rls is refused with the same code as one that does not exist'
);

reset role;

select results_eq(
  $$select prompt, current_generation::int, accepted_at is not null
      from public.day_plans
     where id = (select plan_id from saved where label = 'day')$$,
  $$values ('lato'::text, 2, true)$$,
  'teacher a''s plan for that date is untouched by teacher b''s call'
);

-- ---------------------------------------------------------------------------
-- anonymous reach
-- ---------------------------------------------------------------------------
--
-- execute on a new function is granted to public by default, so what needs
-- proving here is the revoke, not the grant.
--
-- asserted on the privilege rather than on a call, and measured before it was
-- trusted: granting execute back to public leaves the *behavioural* assertion
-- at the bottom of this block just as green, because anon is already refused a
-- layer earlier by `revoke all on public.day_plans from anon` in f-01. that
-- assertion is worth keeping as the end-to-end statement, but on its own it
-- cannot tell whether this migration's revoke line exists at all.

select ok(
  not has_function_privilege('anon', 'public.save_day_plan_generation(date, text, jsonb)', 'execute'),
  'anon holds no execute privilege on the batch writer'
);

-- the positive control: without it the assertion above would read identically
-- against a function nobody can execute.
select ok(
  has_function_privilege('authenticated', 'public.save_day_plan_generation(date, text, jsonb)', 'execute'),
  'authenticated does hold execute on the batch writer'
);

set local role anon;
set local "request.jwt.claims" to '{"role":"anon"}';

-- defence in depth, end to end: whichever layer answers first, anon writes no
-- plan through this function.
select throws_ok(
  $$select public.save_day_plan_generation(date '2026-04-02', 'podszycie', '[]'::jsonb)$$,
  '42501',
  null,
  'anon calling the batch writer is refused'
);

reset role;

select * from finish();

rollback;
