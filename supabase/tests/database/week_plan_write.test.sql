-- consent suite for public.save_week_plan_generation
--
-- separate from day_plan_write.test.sql, which is the single-day writer's
-- contract. this file holds the one property s-10 adds, and it is the last
-- barrier before a bulk deletion with no undo: an accepted day is replaced only
-- if p_confirm_accepted names its date *and* the accepted_at the teacher saw.
-- the island's copy of `accepted_at` can be stale for the length of a week run,
-- so nothing above this function can hold the line - a day accepted (or
-- re-accepted) in another tab after the dialog reaches here as an acceptance
-- the teacher never counted.
--
-- same method as the sibling suites: every assertion below was checked by
-- mutation - break the thing it claims to test, confirm it goes red.

begin;

select plan(35);

-- ---------------------------------------------------------------------------
-- the signature: one writer, taking the consents
-- ---------------------------------------------------------------------------

-- a leftover boolean or date[] overload is the bypass the consents exist to
-- close: a caller could still name a day without naming the acceptance.
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
  'p_prompt text, p_days jsonb, p_confirm_accepted jsonb',
  'the week writer takes consents to acceptances, not dates or a boolean'
);

-- grants do not survive `drop function`, so what needs proving is that the
-- migration re-issued the triple - the revoke from anon in particular, which a
-- revoke from public does not reach.
select ok(
  not has_function_privilege('anon', 'public.save_week_plan_generation(text, jsonb, jsonb)', 'execute'),
  'anon holds no execute privilege on the week writer'
);

-- the positive control: without it the assertion above would read identically
-- against a function nobody can execute.
select ok(
  has_function_privilege('authenticated', 'public.save_week_plan_generation(text, jsonb, jsonb)', 'execute'),
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
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'teacher-a@test.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'teacher-b@test.local', 'x', now(), now(), now());

-- created_at pinned before the fixed acceptance instant below, which
-- day_plans_accepted_after_created would otherwise refuse.
insert into public.day_plans (id, user_id, plan_date, prompt, current_generation, created_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '11111111-1111-1111-1111-111111111111', date '2026-06-01', 'stare', 1, timestamptz '2026-05-01 08:00:00+00'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000002', '11111111-1111-1111-1111-111111111111', date '2026-06-02', 'stare', 1, timestamptz '2026-05-01 08:00:00+00'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000003', '11111111-1111-1111-1111-111111111111', date '2026-06-08', 'stare', 1, timestamptz '2026-05-01 08:00:00+00'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000004', '11111111-1111-1111-1111-111111111111', date '2026-06-09', 'stare', 1, timestamptz '2026-05-01 08:00:00+00'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000005', '11111111-1111-1111-1111-111111111111', date '2026-06-15', 'stare', 1, timestamptz '2026-05-01 08:00:00+00'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000006', '11111111-1111-1111-1111-111111111111', date '2026-06-16', 'stare', 1, timestamptz '2026-05-01 08:00:00+00'),
  -- rollout phase 3: {draft, accepted} for the neighbour outside p_days, two
  -- accepted days for the second account to write over, and a draft for the
  -- u0003 rollback. same shape as the pairs above.
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000007', '11111111-1111-1111-1111-111111111111', date '2026-06-22', 'stare', 1, timestamptz '2026-05-01 08:00:00+00'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000008', '11111111-1111-1111-1111-111111111111', date '2026-06-23', 'stare', 1, timestamptz '2026-05-01 08:00:00+00'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000009', '11111111-1111-1111-1111-111111111111', date '2026-06-29', 'stare', 1, timestamptz '2026-05-01 08:00:00+00'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000010', '11111111-1111-1111-1111-111111111111', date '2026-06-30', 'stare', 1, timestamptz '2026-05-01 08:00:00+00'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-000000000011', '11111111-1111-1111-1111-111111111111', date '2026-07-06', 'stare', 1, timestamptz '2026-05-01 08:00:00+00');

insert into public.activities (plan_id, user_id, generation, ordinal, title, description)
select id, user_id, 1, 1, 'old-' || plan_date::text, 'opis'
  from public.day_plans
 where user_id = '11111111-1111-1111-1111-111111111111';

-- after the activities, so no trigger on them can have withdrawn it. a fixed
-- instant rather than now(), so a consent can name it - in the form PostgREST
-- hands the island ("2026-05-30T08:00:00+00:00").
update public.day_plans
   set accepted_at = timestamptz '2026-05-30 08:00:00+00'
 where plan_date in (date '2026-06-02', date '2026-06-09', date '2026-06-16',
                     date '2026-06-23', date '2026-06-29', date '2026-06-30');

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
      p_confirm_accepted => jsonb_build_array('{"plan_date":"2026-06-02","accepted_at":"2026-05-30T08:00:00+00:00"}'::jsonb)
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
      p_confirm_accepted => '[]'
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
      p_confirm_accepted => jsonb_build_array('{"plan_date":"2026-06-15","accepted_at":"2026-05-30T08:00:00+00:00"}'::jsonb)
    )$$,
  'U0001',
  null,
  'consent to one date does not cover another accepted day'
);

-- withdrawn, edited and accepted again in another tab: same date, a different
-- acceptance. consent was to lose the plan the teacher saw, not whatever
-- carries that date now.
select throws_ok(
  $$select public.save_week_plan_generation(
      'nowe',
      '[{"plan_date":"2026-06-16","activities":[{"title":"new-2026-06-16","description":"opis"}]}]'::jsonb,
      p_confirm_accepted => '[{"plan_date":"2026-06-16","accepted_at":"2026-05-29T08:00:00+00:00"}]'
    )$$,
  'U0001',
  null,
  'consent to an earlier acceptance of the same day does not cover a re-acceptance'
);

-- three-valued logic: with date[] and `= any`, a null element made the test
-- null and `if` let it through. every unknown must land on the refusal side.
select throws_ok(
  $$select public.save_week_plan_generation(
      'nowe',
      '[{"plan_date":"2026-06-16","activities":[{"title":"new-2026-06-16","description":"opis"}]}]'::jsonb,
      p_confirm_accepted => '[null]'
    )$$,
  'U0001',
  null,
  'a null consent entry covers nothing'
);

select throws_ok(
  $$select public.save_week_plan_generation(
      'nowe',
      '[{"plan_date":"2026-06-16","activities":[{"title":"new-2026-06-16","description":"opis"}]}]'::jsonb,
      p_confirm_accepted => jsonb_build_array('{"plan_date":"2026-06-15","accepted_at":"2026-05-30T08:00:00+00:00"}'::jsonb, null, '{"plan_date":"2026-06-16"}'::jsonb)
    )$$,
  'U0001',
  null,
  'a null entry, or one without accepted_at, beside a valid one covers nothing'
);

select throws_ok(
  $$select public.save_week_plan_generation(
      'nowe',
      '[{"plan_date":"2026-06-16","activities":[{"title":"new-2026-06-16","description":"opis"}]}]'::jsonb,
      p_confirm_accepted => null
    )$$,
  'U0001',
  null,
  'an explicit null p_confirm_accepted consents to nothing'
);

-- ---------------------------------------------------------------------------
-- edges of the list
-- ---------------------------------------------------------------------------

-- a day consented while it was accepted may be a draft by the time the write
-- runs (withdrawn elsewhere). replacing it as a draft is what would have
-- happened without the consent, so it must not error.
select lives_ok(
  $$select public.save_week_plan_generation(
      'nowe',
      '[{"plan_date":"2026-06-15","activities":[{"title":"new-2026-06-15","description":"opis"}]}]'::jsonb,
      p_confirm_accepted => jsonb_build_array('{"plan_date":"2026-06-15","accepted_at":"2026-05-30T08:00:00+00:00"}'::jsonb)
    )$$,
  'a consented day that is only a draft is replaced without error'
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
  'an omitted p_confirm_accepted behaves as an empty list'
);

select isnt(
  (select accepted_at from public.day_plans where plan_date = date '2026-06-16'),
  null,
  'the accepted day refused on an omitted list keeps its acceptance'
);

-- ---------------------------------------------------------------------------
-- a set the writer cannot write is refused (u0003), whole
-- ---------------------------------------------------------------------------
--
-- added by rollout phase 3: three u0003 branches, none asserted before. checked
-- by mutation, one branch deleted at a time:
--   * the p_days shape block -> the three set-shape assertions go red ('[]' and
--     null loop zero times and return '[]'; an object raises 22023 instead);
--   * the plan_date shape block -> the two date assertions go red (23502 from
--     the insert for a missing date, 22007/22008 from the cast for a malformed
--     one);
--   * the empty-batch block -> the empty-batch assertion goes red (the day is
--     written with no proposals), and with it the rollback assertions.

select throws_ok(
  $$select public.save_week_plan_generation('nowe', '[]'::jsonb)$$,
  'U0003',
  null,
  'a week set with no days is refused'
);

select throws_ok(
  $$select public.save_week_plan_generation('nowe', null::jsonb)$$,
  'U0003',
  null,
  'a null week set is refused'
);

select throws_ok(
  $$select public.save_week_plan_generation(
      'nowe',
      '{"plan_date":"2026-07-06","activities":[{"title":"new-2026-07-06","description":"opis"}]}'::jsonb
    )$$,
  'U0003',
  null,
  'a week set that is not an array is refused'
);

select throws_ok(
  $$select public.save_week_plan_generation(
      'nowe',
      '[{"activities":[{"title":"bez-daty","description":"opis"}]}]'::jsonb
    )$$,
  'U0003',
  null,
  'a day without a plan_date is refused'
);

select throws_ok(
  $$select public.save_week_plan_generation(
      'nowe',
      '[{"plan_date":"06/07/2026","activities":[{"title":"zla-data","description":"opis"}]}]'::jsonb
    )$$,
  'U0003',
  null,
  'a day whose plan_date is not YYYY-MM-DD is refused'
);

-- the empty batch comes second on purpose: by the time the loop reaches it,
-- 2026-07-06 has been rewritten, and the two assertions after this one say that
-- rewrite did not survive - the property the u0001 block above proves for an
-- unconsented day.
select throws_ok(
  $$select public.save_week_plan_generation(
      'nowe',
      '[{"plan_date":"2026-07-06","activities":[{"title":"new-2026-07-06","description":"opis"}]},
        {"plan_date":"2026-07-07","activities":[]}]'::jsonb
    )$$,
  'U0003',
  null,
  'a day with an empty batch refuses the whole set'
);

select results_eq(
  $$select prompt, current_generation::int
      from public.day_plans
     where plan_date = date '2026-07-06'$$,
  $$values ('stare'::text, 1)$$,
  'a day written before the empty batch keeps its hasło and counter'
);

select is(
  (select array_agg(a.title order by a.ordinal)
     from public.activities a
     join public.day_plans p on p.id = a.plan_id
    where p.plan_date = date '2026-07-06'),
  array['old-2026-07-06'],
  'a day written before the empty batch keeps its batch'
);

-- ---------------------------------------------------------------------------
-- an accepted day outside p_days is not touched ("Tylko do przejrzenia")
-- ---------------------------------------------------------------------------
--
-- the island's "review only" path sends the week's drafts and leaves the
-- accepted days out of p_days entirely. the only proof below the browser that
-- they survive. checked by mutation: the loop followed by
-- `update public.day_plans set accepted_at = null where user_id = auth.uid()
-- and plan_date between v_plan_date - 6 and v_plan_date + 6` turns the
-- neighbour's hasło/counter/acceptance assertion red (and the u0001 block
-- above, whose accepted days it also withdraws). the batch assertion holds a
-- different line - a loop that deleted the neighbour's proposals.

select lives_ok(
  $$select public.save_week_plan_generation(
      'nowe',
      '[{"plan_date":"2026-06-22","activities":[{"title":"new-2026-06-22","description":"opis"}]}]'::jsonb
    )$$,
  'a set naming only the week''s draft is written without consent'
);

-- the positive control: without it the two below would read identically
-- against a writer that refused the call.
select is(
  (select current_generation::int from public.day_plans where plan_date = date '2026-06-22'),
  2,
  'the draft in the set was replaced'
);

select results_eq(
  $$select prompt, current_generation::int, accepted_at
      from public.day_plans
     where plan_date = date '2026-06-23'$$,
  $$values ('stare'::text, 1, timestamptz '2026-05-30 08:00:00+00')$$,
  'the accepted day outside the set keeps its hasło, counter and acceptance'
);

select is(
  (select array_agg(a.title order by a.ordinal)
     from public.activities a
     join public.day_plans p on p.id = a.plan_id
    where p.plan_date = date '2026-06-23'),
  array['old-2026-06-23'],
  'the accepted day outside the set keeps its batch'
);

-- ---------------------------------------------------------------------------
-- the writer is security invoker: a second account writes its own week
-- ---------------------------------------------------------------------------
--
-- teacher b writes a week over the two dates on which teacher a has accepted
-- days, with no consent. b has nothing accepted there, so there is nothing to
-- consent to: the call succeeds for b and a's days are untouched - read back as
-- teacher a, never as the owner, so rls is part of what is asserted. checked by
-- mutation: `security definer` with the `for update` read's
-- `user_id = auth.uid()` filter dropped makes b's call answer u0001 on a's
-- acceptance, and the two assertions made as b go red.

reset role;
set local "request.jwt.claims" to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$select public.save_week_plan_generation(
      'b-tydzien',
      '[{"plan_date":"2026-06-29","activities":[{"title":"b-2026-06-29","description":"opis"}]},
        {"plan_date":"2026-06-30","activities":[{"title":"b-2026-06-30","description":"opis"}]}]'::jsonb
    )$$,
  'teacher b writes a week over teacher a''s accepted dates without consent'
);

select results_eq(
  $$select plan_date, prompt, current_generation::int, user_id
      from public.day_plans
     where plan_date in (date '2026-06-29', date '2026-06-30')
     order by plan_date$$,
  $$values (date '2026-06-29', 'b-tydzien'::text, 1, '22222222-2222-2222-2222-222222222222'::uuid),
           (date '2026-06-30', 'b-tydzien'::text, 1, '22222222-2222-2222-2222-222222222222'::uuid)$$,
  'teacher b sees two new days of their own on those dates'
);

reset role;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

select results_eq(
  $$select plan_date, prompt, current_generation::int, accepted_at
      from public.day_plans
     where plan_date in (date '2026-06-29', date '2026-06-30')
     order by plan_date$$,
  $$values (date '2026-06-29', 'stare'::text, 1, timestamptz '2026-05-30 08:00:00+00'),
           (date '2026-06-30', 'stare'::text, 1, timestamptz '2026-05-30 08:00:00+00')$$,
  'teacher a''s accepted days on those dates keep hasło, counter and acceptance'
);

select is(
  (select array_agg(p.plan_date::text || ':' || a.title order by p.plan_date, a.ordinal)
     from public.activities a
     join public.day_plans p on p.id = a.plan_id
    where p.plan_date in (date '2026-06-29', date '2026-06-30')),
  array['2026-06-29:old-2026-06-29', '2026-06-30:old-2026-06-30'],
  'teacher a''s accepted days on those dates keep their batches'
);

reset role;

select * from finish();

rollback;
