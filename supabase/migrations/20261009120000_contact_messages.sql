-- migration: contact messages (S-19, help-and-contact)
-- purpose: durable storage for messages sent through the public contact form
--          (`/kontakt`, `POST /api/contact`), so that "a real message is never
--          lost" rests on postgres and not on the e-mail that follows the insert.
-- affected: creates public.contact_messages, two insert policies, and one
--           pg_cron job that enforces the 12-month retention.
-- special considerations:
--   * write-only for every api role. anon and authenticated may insert and do
--     nothing else: the table-level grants are revoked and only insert is
--     handed back, and there are no select, update or delete policies. the
--     owner reads the rows in the dashboard (service role) or in the e-mail.
--   * consequence for the route: the insert must not read its row back -
--     `.select()` after `.insert()` (postgrest `return=representation`) becomes
--     `insert ... returning`, which needs select, and fails for anon.
--   * the check constraints mirror `contactPayloadSchema` in
--     `src/lib/contact-form.ts`; change both together.
--   * retention is code, not a promise: the cron job below deletes rows older
--     than 12 months, the period the form's notice states.

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- the sender's account when they were signed in; survives account deletion
  -- as null, because the message is the owner's correspondence, not account data
  user_id uuid references auth.users (id) on delete set null,
  name text constraint contact_messages_name_length check (name is null or char_length(name) <= 100),
  email text not null constraint contact_messages_email_length check (char_length(email) between 3 and 254),
  topic text not null constraint contact_messages_topic_known check (topic in ('question', 'bug', 'idea', 'account', 'other')),
  message text not null constraint contact_messages_message_length check (char_length(btrim(message)) between 10 and 5000)
);

comment on table public.contact_messages is 'messages from the public contact form. write-only for api roles; deleted after 12 months by the contact-messages-retention cron job.';
comment on column public.contact_messages.user_id is 'the sender''s account if they were signed in, else null.';

-- the retention job's predicate
create index contact_messages_created_at_idx on public.contact_messages (created_at);

-- ---------------------------------------------------------------------------
-- privileges and row level security
-- ---------------------------------------------------------------------------

alter table public.contact_messages enable row level security;

-- supabase's default privileges grant everything on new public tables to the
-- api roles; this table hands back insert only.
revoke all on table public.contact_messages from anon, authenticated;
grant insert on table public.contact_messages to anon, authenticated;

create policy "anon can insert contact messages without an account"
  on public.contact_messages for insert to anon
  with check (user_id is null);

create policy "authenticated can insert contact messages as themselves or anonymously"
  on public.contact_messages for insert to authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- retention
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;

select cron.schedule(
  'contact-messages-retention',
  '17 3 * * *',
  $$delete from public.contact_messages where created_at < now() - interval '12 months'$$
);
