-- bounds on client-written columns for public.day_plans and public.activities
--
-- follow-up to 20260718211452_day_plans_and_activities.sql, from the f-01
-- implementation review. the original migration relied on `not null` alone,
-- which admits both the empty string and a value large enough to matter:
-- `prompt` is the llm seed a teacher writes directly, so an unbounded value
-- lands in every generation request and every read of the plan.
--
-- applied while both tables are still empty, so nothing is validated against
-- existing rows. this is the cheapest this change will ever be - the recorded
-- lesson "domknij gorna granice wierszy potomnych przed pierwsza migracja"
-- exists because deferring it means altering live data later.

-- ---------------------------------------------------------------------------
-- day_plans
-- ---------------------------------------------------------------------------

alter table public.day_plans
  add constraint day_plans_prompt_length
  check (char_length(prompt) between 1 and 2000);

comment on constraint day_plans_prompt_length on public.day_plans is
  'the teacher''s haslo is short guidance, not a document. the lower bound of 1 '
  'rejects the empty string, which not null admits.';

-- ---------------------------------------------------------------------------
-- activities
-- ---------------------------------------------------------------------------

alter table public.activities
  add constraint activities_title_length
  check (char_length(title) between 1 and 200);

alter table public.activities
  add constraint activities_description_length
  check (char_length(description) between 1 and 4000);

-- the upper bound here is load-bearing and is not merely about display order.
-- `unique (plan_id, generation, ordinal)` already makes ordinal unique within a
-- batch, so bounding it to 1..20 caps a batch at twenty rows structurally -
-- no trigger, no counting query, and no race between concurrent inserts. an
-- llm response cannot write an unbounded number of children per plan.
-- changing this bound changes the maximum batch size; they are the same knob.
alter table public.activities
  add constraint activities_ordinal_bounds
  check (ordinal between 1 and 20);

comment on constraint activities_ordinal_bounds on public.activities is
  'doubles as the per-batch row cap: unique (plan_id, generation, ordinal) '
  'means at most 20 activities can exist per plan per generation.';
