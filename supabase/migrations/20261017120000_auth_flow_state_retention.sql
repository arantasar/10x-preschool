-- migration: retention for auth.flow_state
-- purpose: keep the privacy policy's promise (pkt 2.6, pkt 8) that technical
--          sign-in records are gone within 7 days, including after the account
--          itself is deleted (s-20, legal-pages impl-review f5).
-- affected: schedules one pg_cron job. no table, column or policy changes.
-- rollback: select cron.unschedule('auth-flow-state-retention');
--
-- special considerations:
--   * the client runs pkce (`@supabase/ssr`), so every signUp and every
--     resetPasswordForEmail writes an auth.flow_state row. our /auth/confirm
--     verifies the e-mail link with verifyOtp(token_hash), which never consumes
--     that row, and gotrue does not clear it on its own - rows two days old were
--     still there on the local stack. the row has no foreign key to auth.users,
--     so it also outlives a deleted account.
--   * the row holds the account id, the flow type and timestamps - no e-mail and
--     no ip. a pkce code is useless after minutes, so a day is a generous floor;
--     a daily run keeps the longest stay under 48 hours, inside the policy's 7.
--   * the job runs as the migration owner (postgres), which already writes to
--     the auth schema in production through delete_own_account().

create extension if not exists pg_cron;

select cron.schedule(
  'auth-flow-state-retention',
  '23 3 * * *',
  $$delete from auth.flow_state where created_at < now() - interval '24 hours'$$
);
