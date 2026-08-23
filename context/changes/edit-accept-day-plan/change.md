---
change_id: edit-accept-day-plan
title: Edit accept day plan
status: implementing
created: 2026-08-23
updated: 2026-08-23
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### 2026-08-23 — F-01 migrations stay local for now (plan step 1.7)

`20260720162247`, `20260720162553` and `20260720163134` have still never been
applied to the hosted project. Deliberately deferred rather than pushed as part
of this phase: S-02 is being built and verified against the local stack, and
`npx supabase db push` is a prerequisite for shipping S-02 remotely, not for
implementing it. Without `20260720162553` in particular the column grants stay
wide on hosted, so several assumptions in `plan.md` do not hold there.

Owner: Janusz. Gate: before S-02 reaches the hosted project.

### 2026-08-23 — trigger raises two different SQLSTATEs (Phase 1 adaptation)

`plan.md` writes `enforce_activity_generation` as a single
`new.generation is distinct from (select ...)` test, which answers
`check_violation` for both a genuine counter mismatch and a plan row RLS hides.
The second case collides with F-01's `rls_isolation.test.sql` assertion #10,
which asserts `42501` for a cross-account insert — the BEFORE INSERT trigger
runs ahead of the RLS WITH CHECK, so the suite went red on a change that had
not weakened isolation at all.

Adopted after review: the trigger reads the counter into a variable, answers
`insufficient_privilege` when the plan is not visible (the code RLS itself
would have given) and `check_violation` only for a real mismatch. Same refusal,
same single indexed query, F-01's proof untouched.

### 2026-08-23 — the plan's function-grant recipe was incomplete

`plan.md` prescribes `revoke all ... from public` followed by
`grant execute ... to authenticated`. On Supabase that leaves `anon` holding
EXECUTE: `alter default privileges in schema public grant execute on functions
to anon, authenticated, service_role` lands as a *direct* grant, which a revoke
from PUBLIC does not touch. Confirmed by reading `pg_proc.proacl` after running
exactly the plan's two statements. The migration carries an explicit
`revoke all on function ... from anon` as well.

