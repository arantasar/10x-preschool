-- drop the redundant current-batch index on public.activities
--
-- follow-up to 20260718211452_day_plans_and_activities.sql, from the f-01
-- implementation review.
--
-- `unique (plan_id, generation, ordinal)` already backs a btree on those three
-- columns, and a btree serves any leading-column prefix of itself. the separate
-- (plan_id, generation) index is therefore a strict prefix of an index that
-- already exists: it answers no query the unique constraint cannot, while
-- costing a second write on every activity insert - and activities are written
-- in batches on every regeneration, which is the hottest write path here.
--
-- verified before dropping: with this index gone, the current-batch read plans
-- as a bitmap index scan on activities_plan_id_generation_ordinal_key with the
-- same index condition, not a sequential scan.
--
-- the index was specified in the plan (plan.md:104), so this corrects the plan
-- rather than the implementation - the migration built exactly what was asked.

drop index if exists public.activities_plan_id_generation_idx;
