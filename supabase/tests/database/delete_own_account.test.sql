-- account deletion suite for public.delete_own_account()
--
-- the function is the only operation in the product that runs above rls
-- (security definer), so its boundary is proved here, where it lives, on two
-- accounts: teacher a deletes herself, teacher b is the bystander whose rows
-- must survive untouched.
--
-- what each block guards, and why none of it would show up in the app:
--
--   * the cascade - a's plans, proposals and sessions go with the user row.
--     nothing deletes them explicitly; if they are absent, the foreign keys are
--     the only thing that could have taken them.
--   * containment - b's user, plan and proposals are counted as the owner after
--     `reset role`, not as a or b, so rls cannot hide a row that was wrongly
--     deleted. a `where true` in the function goes red here.
--   * refusals - anon is stopped at the grant layer; an authenticated caller
--     with no `sub` claim is stopped by the null-uid raise; a caller whose jwt
--     names no session, a stale session, or someone else's session is stopped
--     by the fresh-session check. that check is what keeps a stolen access
--     token from deleting the account without the password the route asks for.
--   * contact messages - kept with user_id set to null, as the migration and
--     CLAUDE.md say. asserted here so the sentence stays a fact.
--   * metadata - definer, empty search_path, and no execute for anon. the anon
--     behavioural assertion would stay green on the null-uid raise alone if the
--     anon revoke went missing, so the privilege is asserted directly too.

begin;

select plan(19);

-- ---------------------------------------------------------------------------
-- fixtures (seeded as the owner, so rls is out of the picture here by design)
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'teacher-a@test.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'teacher-b@test.local', 'x', now(), now(), now());

insert into public.day_plans (id, user_id, plan_date, prompt)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', date '2026-03-02', 'wiosna'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', date '2026-03-02', 'zwierzeta');

insert into public.activities (plan_id, user_id, generation, ordinal, title, description)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 1, 1, 'a-one', 'opis a1'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 1, 2, 'a-two', 'opis a2'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 1, 1, 'b-one', 'opis b1'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 1, 2, 'b-two', 'opis b2');

-- a's fresh session (what the route's sign-in creates), a's stale one (a tab
-- left open for an hour), and b's fresh one.
insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('5e551011-aaaa-aaaa-aaaa-000000000001', '11111111-1111-1111-1111-111111111111', now(), now()),
  ('5e551011-aaaa-aaaa-aaaa-000000000002', '11111111-1111-1111-1111-111111111111', now() - interval '1 hour', now()),
  ('5e551011-bbbb-bbbb-bbbb-000000000001', '22222222-2222-2222-2222-222222222222', now(), now());

insert into public.contact_messages (id, user_id, email, topic, message)
values
  ('c0c0c0c0-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'teacher-a@test.local', 'account', 'pytanie o konto przed usunieciem');

-- ---------------------------------------------------------------------------
-- 1-3. function metadata
-- ---------------------------------------------------------------------------

select ok(
  (select prosecdef from pg_proc where oid = 'public.delete_own_account()'::regprocedure),
  'delete_own_account is security definer'
);

select ok(
  (select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.delete_own_account()'::regprocedure),
  'delete_own_account pins an empty search_path'
);

select ok(
  not has_function_privilege('anon', 'public.delete_own_account()', 'execute'),
  'anon holds no execute privilege on delete_own_account'
);

-- ---------------------------------------------------------------------------
-- 4. anon is refused
-- ---------------------------------------------------------------------------

set local role anon;
set local "request.jwt.claims" to '{"role":"anon"}';

select throws_ok(
  'select public.delete_own_account()',
  '42501',
  null,
  'anon cannot execute delete_own_account'
);

reset role;

-- ---------------------------------------------------------------------------
-- 5. authenticated without a sub claim is refused
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"role":"authenticated"}';

select throws_ok(
  'select public.delete_own_account()',
  '42501',
  null,
  'an authenticated caller with no sub claim is refused, not run with a null id'
);

reset role;

-- ---------------------------------------------------------------------------
-- 6-8. a's own token, but not a fresh session of her own, is refused
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  'select public.delete_own_account()',
  '42501',
  null,
  'a token that names no session is refused'
);

set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","session_id":"5e551011-aaaa-aaaa-aaaa-000000000002"}';

select throws_ok(
  'select public.delete_own_account()',
  '42501',
  null,
  'a session older than five minutes is refused - the password has to be proved again'
);

set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","session_id":"5e551011-bbbb-bbbb-bbbb-000000000001"}';

select throws_ok(
  'select public.delete_own_account()',
  '42501',
  null,
  'someone else''s fresh session does not count as the caller''s'
);

reset role;

-- every refusal deleted nothing - the positive control for what follows.
select is(
  (select count(*)::int from auth.users
    where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')),
  2,
  'the refused calls left both accounts in place'
);

-- ---------------------------------------------------------------------------
-- 10-19. teacher a deletes her own account, from a fresh session
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","session_id":"5e551011-aaaa-aaaa-aaaa-000000000001"}';

select lives_ok(
  'select public.delete_own_account()',
  'teacher a can delete her own account'
);

reset role;

-- counted as the owner, so rls cannot make a wrongly deleted row look present
-- or a surviving row look absent.

select is(
  (select count(*)::int from auth.users where id = '11111111-1111-1111-1111-111111111111'),
  0,
  'teacher a''s user row is gone'
);

select is(
  (select count(*)::int from public.day_plans where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'teacher a''s plans went with the account'
);

select is(
  (select count(*)::int from public.activities where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'teacher a''s proposals went with the account'
);

select is(
  (select count(*)::int from auth.sessions where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'teacher a''s sessions went with the account'
);

select is(
  (select count(*)::int from auth.users where id = '22222222-2222-2222-2222-222222222222'),
  1,
  'teacher b''s user row is untouched'
);

select results_eq(
  $$select id, prompt from public.day_plans where user_id = '22222222-2222-2222-2222-222222222222'$$,
  $$values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'zwierzeta'::text)$$,
  'teacher b''s plan is untouched'
);

select is(
  (select array_agg(title order by ordinal) from public.activities
    where plan_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  array['b-one', 'b-two'],
  'teacher b''s proposals are untouched'
);

select is(
  (select count(*)::int from auth.sessions where user_id = '22222222-2222-2222-2222-222222222222'),
  1,
  'teacher b''s session is untouched'
);

select results_eq(
  $$select user_id from public.contact_messages where id = 'c0c0c0c0-0000-0000-0000-000000000001'$$,
  $$values (null::uuid)$$,
  'teacher a''s contact message is kept, detached from the deleted account'
);

select * from finish();

rollback;
