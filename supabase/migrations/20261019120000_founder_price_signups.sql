-- migration: founder-price sign-ups (S-22, founder-price-signup)
-- purpose: the list of people who reserved the founder price on `/cennik`
--          (`POST /api/founder-price`). it is not a measurement: it is who gets
--          the founder price (FR-035) and the one e-mail sent when payments
--          start (S-25 reads it).
-- affected: creates public.founder_price_signups, two insert policies, one
--           select policy, and one pg_cron job that deletes the list after
--           2027-08-31.
-- special considerations:
--   * insert-only for writes. anon and authenticated may insert; nobody
--     updates or deletes through the api. the table-level grants are revoked
--     and only insert (plus the narrow select below) is handed back. the owner
--     reads and deletes rows in the dashboard (service role) - a withdrawal of
--     consent arrives through the contact form or e-mail and is handled there.
--   * one row per address: `unique (email)`, and the address is stored
--     normalised (`check email = lower(btrim(email))`), so `Ania@x.pl` and
--     `ania@x.pl` are one person. a repeated sign-up is a unique violation
--     (23505), which the route answers as success - no upsert, so writes stay
--     a plain insert.
--   * consequence for the route: the insert must not read its row back -
--     `.select()` after `.insert()` (postgrest `return=representation`) becomes
--     `insert ... returning`, which needs select, and anon has none.
--   * why select exists, and why it is so narrow: a signed-in teacher sees
--     "Jesteś na liście" instead of the button, so authenticated may select
--     exactly the row carrying the address of her own session (the jwt's
--     `email`) - including a row she added earlier without signing in. no
--     other row, and nothing for anon: the table holds addresses of people
--     without an account.
--   * why authenticated cannot insert anonymously: a signed-in teacher's row
--     must carry her own user_id and her own address. a `user_id is null` row
--     from her would let her put any address on the list in her own session,
--     past the route's address-from-session rule.
--   * the check constraints mirror `founderPricePayloadSchema` in
--     `src/lib/founder-price.ts`; change both together.
--   * the honeypot and turnstile live in the route, not here. anyone holding the
--     publishable key could insert straight through postgrest and skip both
--     (only the check constraints and policies would apply). that is closed
--     today only because the key is server-only (`SUPABASE_KEY`,
--     `access: "secret"` in astro.config.mjs). shipping the key to a browser
--     reopens it - move this insert behind the service role first.
--   * retention is code, not a promise, and it is a date, not a period: the
--     cron job deletes the whole list once 2027-08-31 has passed in
--     Europe/Warsaw. the date is tied to the start of payments (2027-02-01, one
--     day after the constant in 20261018160000_trial_until_launch.sql) and
--     equals `FOUNDER_LIST_RETENTION_UNTIL` in `src/lib/pricing.ts` and the date
--     in polityka prywatności pkt 2.8. moving it (payments delayed) is a NEW
--     migration changing all of them in one pr - never the sql editor.
--   * user_id survives account deletion as null: the sign-up is consent tied to
--     the address, not account data (the same choice as contact_messages).
--   * the repository is public: no real address appears in this file.
--   * rollback: `select cron.unschedule('founder-price-signups-retention');`
--     before `drop table public.founder_price_signups;` - a job left behind
--     fails daily.

create table public.founder_price_signups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null
    constraint founder_price_signups_email_length check (char_length(email) between 3 and 254)
    constraint founder_price_signups_email_normalised check (email = lower(btrim(email)))
    constraint founder_price_signups_email_unique unique,
  -- the signed-in teacher's account; null for a visitor without one, and null
  -- again after the account is deleted
  user_id uuid references auth.users (id) on delete set null,
  -- the billing period the person was looking at when signing up: a signal for
  -- S-25, not a commitment
  period text not null constraint founder_price_signups_period_known check (period in ('yearly', 'monthly'))
);

comment on table public.founder_price_signups is 'founder-price list from /cennik. insert-only for api roles (authenticated selects only the row with its own address); deleted after 2027-08-31 by the founder-price-signups-retention cron job.';
comment on column public.founder_price_signups.user_id is 'the signed-in teacher''s account, else null.';
comment on column public.founder_price_signups.period is 'billing period shown on /cennik at sign-up (yearly | monthly).';

-- ---------------------------------------------------------------------------
-- privileges and row level security
-- ---------------------------------------------------------------------------

alter table public.founder_price_signups enable row level security;

-- supabase's default privileges grant everything on new public tables to the
-- api roles; this table hands back insert, and select to authenticated only.
revoke all on table public.founder_price_signups from anon, authenticated;
grant insert on table public.founder_price_signups to anon, authenticated;
grant select on table public.founder_price_signups to authenticated;

create policy "anon can sign up without an account"
  on public.founder_price_signups for insert to anon
  with check (user_id is null);

create policy "authenticated can sign up only as themselves with their own address"
  on public.founder_price_signups for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and email = lower((select auth.jwt() ->> 'email'))
  );

create policy "authenticated can read only the row with their own address"
  on public.founder_price_signups for select to authenticated
  using (email = lower((select auth.jwt() ->> 'email')));

-- ---------------------------------------------------------------------------
-- retention
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;

select cron.schedule(
  'founder-price-signups-retention',
  '27 3 * * *',
  $$delete from public.founder_price_signups where (now() at time zone 'Europe/Warsaw')::date > date '2027-08-31'$$
);
