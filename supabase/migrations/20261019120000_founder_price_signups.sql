-- migration: founder-price sign-ups (S-22, founder-price-signup)
-- purpose: the list of people who reserved the founder price on `/cennik`
--          (`POST /api/founder-price`). it is not a measurement: it is who gets
--          the founder price (FR-035) and the one e-mail sent when payments
--          start (S-25 reads it).
-- affected: creates public.founder_price_signups, one insert policy for anon,
--           and one pg_cron job that deletes the list after 2027-08-31.
-- special considerations:
--   * the list is for people WITHOUT an account. an account created before
--     payments has the founder price by right (FR-036), so `/cennik` shows a
--     signed-in teacher that fact instead of the form, the route refuses a
--     session (`signed_in`), and authenticated has no grant on this table at
--     all. the table carries no user_id: nothing here is account data.
--   * insert-only, for anon only. nobody reads, updates or deletes through the
--     api: the table-level grants are revoked and only insert to anon is handed
--     back. the owner reads and deletes rows in the dashboard (service role) -
--     a withdrawal of consent arrives through the contact form or e-mail and is
--     handled there.
--   * one row per address: `unique (email)`, and the address is stored
--     normalised (`check email = lower(btrim(email))`), so `Ania@x.pl` and
--     `ania@x.pl` are one person. a repeated sign-up is a unique violation
--     (23505), which the route answers as success - no upsert, so writes stay
--     a plain insert.
--   * consequence for the route: the insert must not read its row back -
--     `.select()` after `.insert()` (postgrest `return=representation`) becomes
--     `insert ... returning`, which needs select, and anon has none.
--   * the check constraints mirror `founderPricePayloadSchema` in
--     `src/lib/founder-price.ts`; change both together.
--   * the honeypot and turnstile live in the route, not here. anyone holding the
--     publishable key could insert straight through postgrest and skip both
--     (only the check constraints and the policy would apply). that is closed
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
  -- the billing period the person was looking at when signing up: a signal for
  -- S-25, not a commitment
  period text not null constraint founder_price_signups_period_known check (period in ('yearly', 'monthly'))
);

comment on table public.founder_price_signups is 'founder-price list from /cennik, for people without an account. insert-only for anon, nothing for authenticated; deleted after 2027-08-31 by the founder-price-signups-retention cron job.';
comment on column public.founder_price_signups.period is 'billing period shown on /cennik at sign-up (yearly | monthly).';

-- ---------------------------------------------------------------------------
-- privileges and row level security
-- ---------------------------------------------------------------------------

alter table public.founder_price_signups enable row level security;

-- supabase's default privileges grant everything on new public tables to the
-- api roles; this table hands back insert to anon and nothing else.
revoke all on table public.founder_price_signups from anon, authenticated;
grant insert on table public.founder_price_signups to anon;

-- `true`: every bound a row must meet is a check constraint above, and there is
-- no column to forge. the narrowing is the grant - anon only.
create policy "anon can sign up without an account"
  on public.founder_price_signups for insert to anon
  with check (true);

-- ---------------------------------------------------------------------------
-- retention
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;

select cron.schedule(
  'founder-price-signups-retention',
  '27 3 * * *',
  $$delete from public.founder_price_signups where (now() at time zone 'Europe/Warsaw')::date > date '2027-08-31'$$
);
