-- migration: a teacher deletes her own account
-- purpose: give the settings screen (s-18, fr-024) one way to remove the
--          signed-in teacher's auth.users row, and with it everything that
--          hangs off that row.
-- affected: creates public.delete_own_account(), its grants and its comment.
--           no table, column or data changes.
-- rollback: drop function public.delete_own_account();
--
-- special considerations:
--   * this is the first `security definer` function in the project, and the
--     only operation in the product that acts above rls. every earlier writer
--     (save_day_plan_generation, save_week_plan_generation) runs as the invoker.
--     the app holds only the anon key, and the authenticated role has no
--     privilege on auth.users, so deleting the caller's own user row needs the
--     owner's rights for exactly one statement.
--   * the function takes no arguments on purpose. the id it deletes comes from
--     the caller's jwt (auth.uid()), never from a parameter, so no input can name
--     another account. do not add an id argument to "make it reusable" - that
--     turns it into a way to delete anyone. delete_own_account.test.sql proves
--     the boundary on two accounts.
--   * a null auth.uid() raises instead of running `where id = null`. that
--     statement deletes nothing today, but a definer function must not rely on
--     null semantics that a later edit could turn into something broader.
--   * nothing else is deleted explicitly. the existing foreign keys do the rest:
--     day_plans (on delete cascade, 20260718211452), activities through
--     day_plans (id, user_id), and gotrue's own identities, sessions, refresh
--     tokens and mfa rows. contact_messages.user_id is `on delete set null`
--     (20261009120000) and is kept on purpose - see the plan, owner s-20.
--   * the owner stays the migration role (postgres). on hosted supabase that
--     role must be allowed to delete from auth.users; the production check in
--     s-18 phase 3 is the proof. if it fails, return to the service-role
--     alternative rather than granting anything on the auth schema.

create function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'delete_own_account requires a signed-in caller'
      using errcode = '42501';
  end if;

  delete from auth.users where id = v_user_id;
end;
$$;

comment on function public.delete_own_account() is
  'deletes the calling teacher''s own auth.users row (security definer, the only '
  'operation above rls). the target id is auth.uid(), never an argument, so no '
  'input can name another account. plans, activities and sessions go with it '
  'through existing cascades.';

-- the same two revokes as save_day_plan_generation (20260823095136): postgres
-- grants execute to public on every new function, and supabase's default
-- privileges add a direct grant to anon that the public revoke does not touch.
-- a definer function reachable by anon would be the worst grant in the schema;
-- the null-uid raise above stops it today, and these revokes stop it a layer
-- earlier.
revoke all on function public.delete_own_account() from public;
revoke all on function public.delete_own_account() from anon;
grant execute on function public.delete_own_account() to authenticated;
