---
change_id: edit-accept-day-plan
title: Edit accept day plan
status: implemented
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


### 2026-08-23 — `.dev.vars` points at the hosted project (blocks manual testing)

`SUPABASE_URL` in `.dev.vars` is `https://tponbccoxczjyoqwliyx.supabase.co`, not
the local stack. None of the five migrations have been applied there — the three
F-01 ones deferred in step 1.7, plus this change's write-contract migration — so
a dev server started as-is fails every write in this slice.

Also found: the local stack itself was half-dead (kong, rest, studio and pg_meta
had exited eight days ago while db and auth stayed up), which is why pgTAP
worked all along and nothing else would have. Fixed with
`npx supabase stop && npx supabase start`.

Before manual verification, one of two things has to happen: point `.dev.vars` at
`http://127.0.0.1:54321` with the local anon key, or run `npx supabase db push`
so hosted catches up. `.dev.vars` was left holding its original hosted values.

### 2026-08-23 — the wire envelope moved out of the routes (Phase 3 adaptation)

`plan.md` gives each route its own error envelope. Three routes now answer with
it, and the island has a single response handler — three copies of the
status/message table would drift, and the drift would make that handler wrong
for whichever route moved. Lifted into `src/lib/services/day-plan-http.ts`;
`generate.ts` was folded onto it, which is why it appears in the Phase 3 diff.

`invalid` maps to 500 rather than 400 on purpose: by the time the store refuses
a value, zod has already accepted it against the same bound the CHECK enforces,
so the two disagreeing is our bug, not the caller's.

### 2026-08-23 — `.dev.vars` left pointing at LOCAL Supabase

Deliberate, on request, so manual verification can start without a hosted push.
`.dev.vars` is gitignored, so nothing about this is committed.

To go back to the hosted project, replace the two lines with:

    SUPABASE_URL=https://tponbccoxczjyoqwliyx.supabase.co
    SUPABASE_KEY=<the hosted anon key>

and remember hosted still has none of the five migrations — see the 1.7 note.

### 2026-08-23 — acceptance timestamp was rendering in two time zones (Phase 4 fix)

`formatAcceptedAt` used an unpinned `Intl.DateTimeFormat`. Workers run in UTC and
the teacher's browser does not, so SSR emitted `23 sierpnia 09:31` and hydration
re-rendered `11:31`: a mismatch, and a wrong time on first paint. Moved into
`day-plan-dates.ts` and pinned to `Europe/Warsaw`, alongside the same decision
`todayIsoDate` already makes for resolving `?date=`.

### 2026-08-23 — `GenerationProgress.startedAt` became optional (Phase 4 adaptation)

`plan.md` says to keep `GenerationProgress` unchanged. It could not stay quite
unchanged: the repo's `react-hooks/purity` rule rejects `Date.now()` anywhere in
a component body, which is where the island used to stamp the start of a
generation. Stamping it inside the async mutate was rejected the same way;
stamping it in an effect was rejected by `no cascading setState in effect`. A
lazy state initialiser is the one place React sanctions reading the wall clock,
so the component now settles its own origin when no `startedAt` is given.
Behaviour with an explicit `startedAt` is unchanged.
