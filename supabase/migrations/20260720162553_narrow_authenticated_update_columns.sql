-- narrow the authenticated update surface to the columns a teacher owns
--
-- follow-up to 20260718211452_day_plans_and_activities.sql, from the f-01
-- implementation review.
--
-- rls answers "whose row is this". it does not answer "which columns may the
-- owner rewrite". supabase's default grants give `authenticated` update on
-- every column, so within their own account a teacher could rewrite
-- `created_at`, backdate `accepted_at` (the entire acceptance state behind
-- fr-009), or move an activity to a different plan of theirs via `plan_id`
-- while leaving `generation` pointing at the old batch.
--
-- that last one matters beyond tidiness: src/types.ts brands `CurrentActivity`
-- so downstream code cannot read a stale generation by accident, and the brand
-- is only as good as the invariant the database actually holds.
--
-- note on mechanics: a column-level revoke does not cut a table-level grant -
-- postgres tracks them separately. the table-level privilege has to come off
-- first, then the allowed columns go back on.

-- ---------------------------------------------------------------------------
-- day_plans: a teacher edits their haslo, regenerates, and accepts
-- ---------------------------------------------------------------------------
--
-- withheld: id, user_id, created_at (identity and provenance) and updated_at,
-- which the set_updated_at trigger owns.

revoke update on public.day_plans from authenticated;

grant update (plan_date, prompt, current_generation, accepted_at)
  on public.day_plans to authenticated;

-- ---------------------------------------------------------------------------
-- activities: a teacher edits the text and the display order
-- ---------------------------------------------------------------------------
--
-- withheld: id, user_id, created_at, and - the point of this migration -
-- plan_id and generation, which together decide which batch a row belongs to.
-- undo is a day_plans.current_generation change; it never rewrites these.

revoke update on public.activities from authenticated;

grant update (ordinal, title, description)
  on public.activities to authenticated;

-- ---------------------------------------------------------------------------
-- acceptance cannot predate the plan it accepts
-- ---------------------------------------------------------------------------

alter table public.day_plans
  add constraint day_plans_accepted_after_created
  check (accepted_at is null or accepted_at >= created_at);
