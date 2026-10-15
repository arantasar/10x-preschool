# Review follow-ups — account-deletion

From `reviews/impl-review.md` (2026-10-15).

## F2 — prove the hosted DELETE privilege before merging (owner: Janusz) — DONE 2026-10-15

Result: steps 1–2 passed on the hosted project (no error, rollback left the account in place). Safe to merge; Progress 3.8 remains the post-merge end-to-end check.

Not applied during triage: it is a change to the production database, which only the owner runs.

1. `npx supabase db push` to the hosted project (the migration is additive: one function, grants, comment; unused until the route ships).
2. Create a throwaway account on `temio.pl` and sign in. Within five minutes, in the dashboard SQL editor:

   ```sql
   begin;
   set local role authenticated;
   set local "request.jwt.claims" to '{"sub":"<throwaway user id>","role":"authenticated","session_id":"<its newest auth.sessions id>"}';
   select public.delete_own_account();
   rollback;
   ```

   A `permission denied for table users` here means the hosted owner cannot delete from `auth.users`: stop and return to the service-role alternative (plan, Critical Implementation Details). Do not grant anything on the `auth` schema.
3. Merge only after step 2 passes; Progress 3.8 stays the post-merge end-to-end check.
