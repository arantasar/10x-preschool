-- access contract for public.contact_messages (S-19, help-and-contact)
--
-- the table is write-only for every api role: anon and authenticated insert,
-- nobody reads, changes or deletes through the api. three failure modes get
-- explicit coverage because each would look fine from the contact form:
--   * a forged user_id - the `with check` path. without it an anonymous
--     visitor could attribute a message to any account.
--   * a select, update or delete that succeeds - the table holds e-mails of
--     people without an account, and the api must never hand them back.
--   * retention that exists only on paper - the form promises 12 months, so
--     the cron job is asserted, not assumed.

begin;

select plan(17);

-- ---------------------------------------------------------------------------
-- fixtures (as the owner, so rls is bypassed here by design)
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'teacher-a@test.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'teacher-b@test.local', 'x', now(), now(), now());

insert into public.contact_messages (id, email, topic, message)
values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'ktos@example.test', 'question', 'wiadomosc juz zapisana');

-- ---------------------------------------------------------------------------
-- check constraints (as the owner: these are the schema's own bounds)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$insert into public.contact_messages (email, topic, message) values ('a@example.test', 'question', '   krotka ')$$,
  '23514',
  null,
  'check: a message under 10 characters after trimming is refused'
);

select throws_ok(
  $$insert into public.contact_messages (email, topic, message) values ('a@example.test', 'question', repeat('x', 5001))$$,
  '23514',
  null,
  'check: a message over 5000 characters is refused'
);

select throws_ok(
  $$insert into public.contact_messages (email, topic, message) values ('a@example.test', 'payments', 'wiadomosc testowa')$$,
  '23514',
  null,
  'check: an unknown topic is refused'
);

select throws_ok(
  $$insert into public.contact_messages (name, email, topic, message) values (repeat('x', 101), 'a@example.test', 'other', 'wiadomosc testowa')$$,
  '23514',
  null,
  'check: a name over 100 characters is refused'
);

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------

set local role anon;
set local "request.jwt.claims" to '{"role":"anon"}';

select lives_ok(
  $$insert into public.contact_messages (email, topic, message) values ('gosc@example.test', 'question', 'pytanie od goscia')$$,
  'anon: inserts a message without an account'
);

select throws_ok(
  $$insert into public.contact_messages (user_id, email, topic, message)
    values ('11111111-1111-1111-1111-111111111111', 'gosc@example.test', 'question', 'podszyty nadawca')$$,
  '42501',
  null,
  'anon: cannot attribute a message to an account'
);

select throws_ok(
  $$select count(*) from public.contact_messages$$,
  '42501',
  null,
  'anon: cannot read messages'
);

select throws_ok(
  $$update public.contact_messages set message = 'przejete przez goscia'$$,
  '42501',
  null,
  'anon: cannot change messages'
);

select throws_ok(
  $$delete from public.contact_messages$$,
  '42501',
  null,
  'anon: cannot delete messages'
);

reset role;

-- ---------------------------------------------------------------------------
-- authenticated (teacher a)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local "request.jwt.claims" to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$insert into public.contact_messages (user_id, email, topic, message)
    values ('11111111-1111-1111-1111-111111111111', 'teacher-a@test.local', 'bug', 'zgloszenie od nauczyciela')$$,
  'authenticated: inserts a message as themselves'
);

select lives_ok(
  $$insert into public.contact_messages (email, topic, message) values ('teacher-a@test.local', 'idea', 'pomysl bez przypisania')$$,
  'authenticated: inserts a message without attribution'
);

select throws_ok(
  $$insert into public.contact_messages (user_id, email, topic, message)
    values ('22222222-2222-2222-2222-222222222222', 'teacher-a@test.local', 'bug', 'podszyty nadawca')$$,
  '42501',
  null,
  'authenticated: cannot attribute a message to another account'
);

select throws_ok(
  $$select count(*) from public.contact_messages$$,
  '42501',
  null,
  'authenticated: cannot read messages, not even their own'
);

select throws_ok(
  $$update public.contact_messages set message = 'przejete przez nauczyciela'$$,
  '42501',
  null,
  'authenticated: cannot change messages'
);

select throws_ok(
  $$delete from public.contact_messages$$,
  '42501',
  null,
  'authenticated: cannot delete messages'
);

reset role;

-- ---------------------------------------------------------------------------
-- what landed, and retention
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.contact_messages),
  4,
  'owner view: the seeded row plus exactly the three allowed inserts'
);

select ok(
  exists (
    select 1 from cron.job
    where jobname = 'contact-messages-retention'
      and command like '%delete from public.contact_messages%'
      and command like '%interval ''12 months''%'
  ),
  'retention: a cron job deletes messages older than 12 months'
);

select * from finish();

rollback;
