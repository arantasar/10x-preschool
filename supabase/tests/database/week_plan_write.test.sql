-- consent suite for public.save_week_plan_generation
--
-- separate from day_plan_write.test.sql, which is the single-day writer's
-- contract. this file holds the one property s-10 adds, and it is the last
-- barrier before a bulk deletion with no undo: an accepted day is replaced only
-- if its date is in p_confirm_dates. the island's copy of `accepted_at` can be
-- stale for the length of a week run, so nothing above this function can hold
-- the line - a day accepted in another tab after the dialog reaches here as an
-- accepted day the teacher never counted.
--
-- same method as the sibling suites: every assertion below was checked by
-- mutation - break the thing it claims to test, confirm it goes red.

begin;

select plan(15);

-- ---------------------------------------------------------------------------
-- the signature: one writer, taking the list
-- ---------------------------------------------------------------------------

-- a leftover boolean overload is the bypass the list exists to close: a caller
-- could still say "replace every accepted day" without naming one.
select is(
  (select count(*)::int from pg_proc
    where proname = 'save_week_plan_generation'
      and pronamespace = 'public'::regnamespace),
  1,
  'exactly one save_week_plan_generation remains, so no overload is ambiguous'
);

select is(
  (select pg_get_function_identity_arguments(oid) from pg_proc
    where proname = 'save_week_plan_generation'
      and pronamespace = 'public'::regnamespace),
  'p_prompt text, p_days jsonb, p_confirm_dates date[]',
  'the week writer takes a list of consented dates, not a boolean'
);

-- grants do not survive `drop function`, so what needs proving is that the
-- migration re-issued the triple - the revoke from anon in particular, which a
-- revoke from public does not reach.
select ok(
  not has_function_privilege('anon', 'public.save_week_plan_generation(text, jsonb, date[])', 'execute'),
  'anon holds no execute privilege on the week writer'
);

-- the positive control: without it the assertion above would read identically
-- against a function nobody can execute.
select ok(
  has_function_privilege('authenticated', 'public.save_week_plan_generation(text, jsonb, date[])', 'execute'),
  'authenticated does hold execute on the week writer'
);

-- ---------------------------------------------------------------------------
-- fixtures (seeded as the owner, so rls is out of the picture here by design)
-- ---------------------------------------------------------------------------
--
-- pairs of {draft, accepted}, each pair on its own dates so no assertion can
-- disturb another. every day starts at generation 1 with one activity named
-- after it, so "the old batch survived" and "the new batch landed" are both
-- readable off the titles.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'teacher-a@test.local', 'x', now(), now(), now());

insert into public.day_plans (id, user_id, plan_date, prompt, current_generation)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '11111111-1111-1111-1111-111111111111', date '2026-06-01', 'stare', 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000002', '11111111-1111-1111-1111-111111111111', date '2026-06-02', 'stare', 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000003', '11111111-1111-1111-1111-111111111111', date '2026-06-08', 'stare', 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000004', '11111111-1111-1111-1111-111111111111', date '2026-06-09', 'stare', 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000005', '11111111-1111-1111-1111-111111111111', date '2026-06-15', 'stare', 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000006', '11111111-1111-1111-1111-111111111111', date '2026-06-16', 'stare', 1);

insert into public.activities (plan_id, user_id, generation, ordinal, title, description)
select id, user_id, 1, 1, 'old-' || plan_date::text, 'opis'
  from public.day_plans
 where user_id = '11111111-1111-1111-1111-111111111111';

-- after the activities, so no trigger on them can have withdrawn it.
update public.day_plans
   set accepted_at = now()
 where plan_date in (date '2026-06-02', date '2026-06-09', date '2026-06-16');

set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

-- ---------------------------------------------------------------------------
-- a consented accepted day is replaced, and loses its acceptance
-- ---------------------------------------------------------------------------

select lives_ok(
  $$select public.save_week_plan_generation(
      'nowe',
      '[{"plan_date":"2026-06-01","activities":[{"title":"new-2026-06-01","description":"opis"}]},
        {"plan_date":"2026-06-02","activities":[{"title":"new-2026-06-02","description":"opis"}]}]'::jsonb,
      p_confirm_dates => array[date '2026-06-02']
    )$$,
  'a set of {draft, consented accepted} is written'
);

select results_eq(
  $$select plan_date, prompt, current_generation::int, accepted_at is null
      from public.day_plans
     where plan_date in (date '2026-06-01', date '2026-06-02')
     order by plan_date$$,
  $$values (date '2026-06-01', 'nowe'::text, 2, true),
           (date '2026-06-02', 'nowe'::text, 2, true)$$,
  'both days carry the new hasło, a bumped counter and no acceptance'
);

-- counted across the whole plan rather than filtered to the current
-- generation, so a superseded batch left resident would show up here.
select is(
  (select array_agg(p.plan_date::text || ':' || a.title order by p.plan_date, a.ordinal)
     from public.activities a
     join public.day_plans p on p.id = a.plan_id
    where p.plan_date in (date '2026-06-01', date '2026-06-02')),
  array['2026-06-01:new-2026-06-01', '2026-06-02:new-2026-06-02'],
  'both days hold the new batch only'
);

-- ---------------------------------------------------------------------------
-- an accepted day nobody named refuses the whole set
-- ---------------------------------------------------------------------------
--
-- the draft comes first in p_days on purpose: by the time the loop reaches the
-- accepted day it has already rewritten the draft, and the assertions below say
-- that rewrite did not survive the refusal.

select throws_ok(
  $$select public.save_week_plan_generation(
      'nowe',
      '[{"plan_date":"2026-06-08","activities":[{"title":"new-2026-06-08","description":"opis"}]},
        {"plan_date":"2026-06-09","activities":[{"title":"new-2026-06-09","description":"opis"}]}]'::jsonb,
      p_confirm_dates => '{}'
    )$$,
  'U0001',
  'plan for 2026-06-09 is accepted; regeneration must be confirmed',
  'an unconsented accepted day is refused, and the refusal names its date'
);

select results_eq(
  $$select plan_date, prompt, current_generation::int, accepted_at is not null
      from public.day_plans
     where plan_date in (date '2026-06-08', date '2026-06-09')
     order by plan_date$$,
  $$values (date '2026-06-08', 'stare'::text, 1, false),
           (date '2026-06-09', 'stare'::text, 1, true)$$,
  'the refusal leaves both days'' hasło, counter and acceptance as they were'
);

select is(
  (select array_agg(p.plan_date::text || ':' || a.title order by p.plan_date, a.ordinal)
     from public.activities a
     join public.day_plans p on p.id = a.plan_id
    where p.plan_date in (date '2026-06-08', date '2026-06-09')),
  array['2026-06-08:old-2026-06-08', '2026-06-09:old-2026-06-09'],
  'the refusal leaves both days'' batches as they were, the draft included'
);

-- the stale-accept path itself: the teacher consented to *some* accepted day,
-- and a different one turned up accepted. a boolean would have waved this
-- through; the list must not.
select throws_ok(
  $$select public.save_week_plan_generation(
      'nowe',
      '[{"plan_date":"2026-06-16","activities":[{"title":"new-2026-06-16","description":"opis"}]}]'::jsonb,
      p_confirm_dates => array[date '2026-06-15']
    )$$,
  'U0001',
  null,
  'consent to one date does not cover another accepted day'
);

-- ---------------------------------------------------------------------------
-- edges of the list
-- ---------------------------------------------------------------------------

-- a date consented while it was accepted may be a draft by the time the write
-- runs (withdrawn elsewhere). replacing it as a draft is what would have
-- happened without the consent, so it must not error.
select lives_ok(
  $$select public.save_week_plan_generation(
      'nowe',
      '[{"plan_date":"2026-06-15","activities":[{"title":"new-2026-06-15","description":"opis"}]}]'::jsonb,
      p_confirm_dates => array[date '2026-06-15']
    )$$,
  'a consented date that is only a draft is replaced without error'
);

select is(
  (select current_generation::int from public.day_plans where plan_date = date '2026-06-15'),
  2,
  'the consented draft was actually replaced'
);

-- the default is the refusal, not the deletion: a caller that says nothing
-- about consent has consented to nothing.
select throws_ok(
  $$select public.save_week_plan_generation(
      'nowe',
      '[{"plan_date":"2026-06-16","activities":[{"title":"new-2026-06-16","description":"opis"}]}]'::jsonb
    )$$,
  'U0001',
  null,
  'an omitted p_confirm_dates behaves as an empty list'
);

select isnt(
  (select accepted_at from public.day_plans where plan_date = date '2026-06-16'),
  null,
  'the accepted day refused on an omitted list keeps its acceptance'
);

reset role;

select * from finish();

rollback;
