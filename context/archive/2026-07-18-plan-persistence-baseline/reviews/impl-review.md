<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Minimalny schemat przechowywania planów z izolacją RLS per konto

- **Plan**: context/changes/plan-persistence-baseline/plan.md
- **Scope**: Phases 1–4 of 4 (full plan)
- **Date**: 2026-07-20
- **Verdict**: REJECTED at review; **all 10 findings triaged and resolved** — see Triage Outcome below
- **Findings**: 1 critical, 6 warnings, 3 observations (F10 surfaced during triage)

## Triage Outcome (2026-07-20)

|                           | Findings                                                   |
| ------------------------- | ---------------------------------------------------------- |
| Fixed                     | F1, F2, F3, F4 (Fix A), F5 (Fix A), F6, F7, F8, F10        |
| Partially fixed by choice | F9 — npm script added; `force row level security` declined |

**Post-triage verification, all green**: 4 migrations apply from scratch · pgTAP 23/23 · `astro check` 0 errors / 0 warnings · `npm run lint` clean · `npm run build` succeeds · generated types regenerate byte-identical · generated file excluded from Prettier.

**Two findings were falsified by their own mutation checks**, and both corrections are recorded in place rather than quietly dropped:

- **F2** — the ownership-transfer block comes from the SELECT policy, not the UPDATE `with check`. Postgres requires an updated row to remain visible under SELECT policies.
- **F3 → F10** — the eight `anon` deny policies are inert: identical behaviour without them, and being `permissive` they would not override a future permissive policy either.

The method that produced both: never accept that a test passes: change the thing it claims to test and confirm it fails.

**⚠️ Three follow-up migrations are local-only.** Phase 4 pushed the original migration to the hosted project; `20260720162247`, `20260720162553` and `20260720163134` have not been pushed. `npx supabase db push` is the user's call.

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | FAIL    |
| Architecture        | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

Note on the verdict: the rubric maps any CRITICAL to `Safety & Quality: FAIL` and therefore to REJECTED. The critical finding is a **defect in the proof, not in the schema** — all 16 policies were read line by line and independently verified correct against a live local stack, including the UPDATE `with check` that blocks ownership transfer. There is no live leak. What is broken is the regression net that is supposed to keep it that way, which for a foundation whose entire deliverable is _a proven isolation guarantee_ is the thing under review.

## Findings

### F1 — pgTAP suite has no positive-path assertion; 6 of 13 assertions pass vacuously

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: supabase/tests/database/rls_isolation.test.sql:69-99, 127-147
- **Detail**: Nothing asserts that teacher A _can_ insert, update, or delete their own rows. Every write assertion is a negative: "affects zero rows" or "raises 42501". If all four `authenticated` write policies were replaced with `using (false) with check (false)`, the suite still passes green — deny-all also affects zero rows and also raises 42501. That is 6 of 13 assertions passing against a completely broken write layer; only the two SELECT counts (lines 55, 103) would catch it. `plan(13)` correctly matches the 13 assertions — the count is right, the coverage is hollow. Phase 2's manual mutation check (Progress 2.3) dropped a **SELECT** policy, which is precisely the one dimension that is not vacuous, so the check passed without surfacing this.
- **Fix**: Add four assertions that A's own-row insert/update/delete succeed — `lives_ok` on a self-owned insert plus `is(…, 1)` on a self-owned update's and delete's affected count — and bump to `plan(17)`.
  - Strength: Turns each existing negative assertion into a genuine discriminator; the suite then fails on a deny-all mutation, which is the property Phase 2 claimed to establish.
  - Tradeoff: ~20 lines in the existing fixture; no schema or production change.
  - Confidence: HIGH — verified by reading the assertions; the deny-all mutation argument is mechanical.
  - Blind spot: None significant.
- **Decision**: FIXED — added six positive-path assertions (insert/update/delete × both tables), `plan(13)` → `plan(19)`. Verified by mutation: setting the `day_plans` UPDATE policy to `using (false) with check (false)` now fails assertion 13, where the pre-fix suite passed green. Restored via `db reset`; 19/19 pass on a fresh database.

### F2 — UPDATE `with check` (ownership transfer) is never exercised

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: supabase/tests/database/rls_isolation.test.sql:69-99
- **Detail**: The suite tests the INSERT `with check` path (lines 93, 141) and the UPDATE `using` path (69-89), but never attempts `update public.day_plans set user_id = '2222…' where user_id = '1111…'`. The migration blocks this correctly today (migration:124, 162), yet deleting that `with check` clause leaves the entire suite green. The single highest-value escalation vector on these tables has no regression coverage.
- **Fix**: Add `throws_ok` (42501) on a self-owned row whose `user_id` is rewritten to teacher B, on both tables.
- **Decision**: FIXED, but **the finding's premise was wrong and is corrected here.** The two assertions were added (`plan(19)` → `plan(21)`, 21/21 pass on a fresh database). The mutation check then falsified the stated rationale: weakening `with check` to `true` on both UPDATE policies left the suite green. Bisecting further — `with check (true)` _and_ the SELECT policy relaxed to `using (true)` — the transfer finally succeeds (`UPDATE 1`). Mechanism: because a SELECT policy exists, Postgres requires the new row to remain visible under it after an UPDATE, so `auth.uid() = user_id` on **SELECT** is what blocks the handoff. The UPDATE `with check` is real defense in depth but is redundant while that SELECT policy stands, and no test can isolate it. The assertions are kept because they pin the _behaviour_ — they are what catches a handoff if a future change relaxes the SELECT policy — and the in-file comment now records the measured mechanism instead of the wrong one.

### F3 — The eight `anon` deny policies have zero test coverage

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: supabase/tests/database/rls_isolation.test.sql:150-174
- **Detail**: The two anon assertions pass at the _grant_ layer, not the policy layer — the in-file comment at 154-157 is honest about this. But the plan's stated rationale for writing the 8 anon policies at all (plan.md:110) is that they are the backstop if a later migration or dashboard action re-grants `anon`. That backstop is unverified: dropping all 8 policies leaves the suite green.
- **Fix**: In a nested block, `grant select on public.day_plans to anon`, assert the row count is 0 (not an error), then revoke — exercising the layer the comment claims stands behind the grant.
- **Decision**: FIXED with a correction, and it surfaced a follow-on (see F10). Two assertions added (`plan(21)` → `plan(23)`, 23/23 pass): with anon's SELECT grant handed back inside the transaction, RLS alone still yields zero rows. That is real defense-in-depth coverage — it proves the RLS layer holds independently of the grant layer, which nothing previously tested. But the mutation check falsified the _stated_ goal: dropping both anon SELECT policies leaves the suite green, because RLS with no applicable policy already denies by default. The eight anon deny policies cannot be made to discriminate by any test. The in-file comment now records this as measured rather than assumed.

### F10 — The eight `anon` deny policies are inert as a security control

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: supabase/migrations/20260718211452_day_plans_and_activities.sql:132-147, 170-185
- **Detail**: Raised by the F3 mutation check, not in the original scan. Two measured facts: (1) dropping the policies changes nothing, since RLS default-deny is identical; (2) they are `permissive`, and permissive policies OR together — so they would **not** override a future permissive `anon` policy either. That second point matters because plan.md:110 justifies them partly as protection against "a later migration or dashboard action that re-grants". They do not provide that. Against a re-grant they are equivalent to nothing, and against a future permissive policy they are equivalent to nothing. Their genuine value is the one the plan states first: making "no policy" unambiguous between deliberate deny and oversight — a documentation benefit, correctly obtained.
- **Fix**: Keep them for the documentary value, but correct plan.md:110's claim that they backstop a re-grant. If an actual backstop is wanted, it must be `as restrictive`.
- **Decision**: FIXED (plan text corrected; policies kept). plan.md:110 now states plainly that the re-grant claim was wrong, records both measured facts, and notes that only `as restrictive` would provide the described backstop. The policies stay for their documentary value. No migration change.

### F4 — No bounds on client-written text or child-row count

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Data safety)
- **Location**: supabase/migrations/20260718211452_day_plans_and_activities.sql:27, 58-62
- **Detail**: `prompt`, `title` and `description` are unbounded `text`. `prompt` is the LLM seed written directly by an authenticated client, so a teacher can store up to ~1GB, inflating token cost on the generation path and payload on every read. `not null` does not exclude the empty string. There is no cap on activities per plan, and `ordinal` (line 60) carries no positivity check while its sibling `generation` (line 57) does. This is the exact class recorded in `context/foundation/lessons.md` § "Domknij górną granicę wierszy potomnych przed pierwszą migracją" — recorded _from_ this change (0ff6fbd) but never applied to it. That lesson permits consciously recording the absence as a decision; the migration is now on production, so adding bounds later means a migration against live data.
- **Fix A ⭐ Recommended**: Add a follow-up migration with `check (length(prompt) between 1 and 2000)`, comparable bounds on `title`/`description`, and `check (ordinal >= 1)`.
  - Strength: Tables are still empty, so the constraint applies against zero rows — the cheapest this fix will ever be, and it discharges the recorded lesson instead of leaving it as a note.
  - Tradeoff: A second production migration; the row-count cap still needs a trigger or an application-layer decision.
  - Confidence: HIGH — no data exists to violate the constraints.
  - Blind spot: The 2000-character figure is a guess; the PRD does not state a prompt length.
- **Fix B**: Record the absence explicitly as an accepted decision in the plan and let S-02 own it.
  - Strength: Honest, matches what the lesson permits, avoids guessing limits before a caller exists.
  - Tradeoff: Every day it stays deferred, the migration gets more expensive; deferred cleanup with no owner is itself a recorded lesson.
  - Confidence: MEDIUM — depends on S-02 landing soon.
  - Blind spot: Nothing schedules the follow-up today.
- **Decision**: FIXED via Fix A — new migration `supabase/migrations/20260720162247_bound_plan_and_activity_input.sql`. `char_length(prompt) between 1 and 2000`, `title` 1..200, `description` 1..4000, `ordinal between 1 and 20`. The lower bounds close the empty-string gap that `not null` admits. **The row cap is structural rather than a trigger**: `unique (plan_id, generation, ordinal)` already makes `ordinal` unique within a batch, so bounding it to 1..20 caps a batch at twenty rows with no counting query and no race between concurrent inserts — the same style of guarantee as the composite FK. Verified: `db reset` applies both migrations clean, suite still 23/23, and the constraints were exercised directly — empty prompt rejected, 2001 chars rejected, valid accepted, `ordinal` 21 rejected, 20 accepted. The 2000/200/4000/20 figures are chosen, not derived: the PRD says only "jedna lub więcej" and sets no length guidance.
- **⚠️ Not yet on production.** Phase 4 pushed the original migration to the hosted project; this follow-up exists only locally. `npx supabase db push` is the user's call.
- **Open**: these four constraints have no pgTAP coverage. Given that this review's theme is untested guarantees, that is worth closing — not done here to avoid expanding scope mid-triage.

### F5 — Column-level UPDATE grants leave acceptance and generation state client-writable

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality (Data safety)
- **Location**: supabase/migrations/20260718211452_day_plans_and_activities.sql:121-124, 159-162
- **Detail**: The UPDATE policies constrain `user_id` only, and `authenticated` retains UPDATE on every column. Within their own account a teacher can rewrite `created_at`, `accepted_at`, `current_generation`, and on `activities` both `plan_id` and `generation`. Two consequences: acceptance state (FR-009) is client-writable to any timestamp including backdated, and an activity can be moved between the owner's plans with nothing tying `activities.generation` to the destination's `current_generation`. `src/types.ts` builds a branded `CurrentActivity` type to make the generation invariant unforgeable in TypeScript — but the database it derives from does not hold that invariant, so the brand guarantees less than it appears to. Not a cross-account issue: the composite FK and `with check` hold ownership.
- **Fix A ⭐ Recommended**: `revoke update (id, user_id, created_at) on public.day_plans from authenticated` (and `id, user_id, plan_id, created_at` on `activities`), plus `check (accepted_at is null or accepted_at >= created_at)`.
  - Strength: Closes the identity and provenance columns at the layer that actually enforces them, and column-level revokes cost nothing at runtime.
  - Tradeoff: Does not by itself bind `generation` to `current_generation`; that needs a trigger or a service-layer rule S-02 would own.
  - Confidence: MEDIUM — the revoke is safe and standard, but which columns S-02 legitimately needs to write is not yet known.
  - Blind spot: No caller exists yet, so this is being decided without the call sites the plan deliberately declined to guess at.
- **Fix B**: Leave the grants and treat these as service-layer invariants for S-02.
  - Strength: Consistent with the plan's stated refusal to design a data-access API with no caller.
  - Tradeoff: The branded type in `src/types.ts` continues to imply a guarantee the schema does not make.
  - Confidence: MEDIUM — workable, but shifts a database invariant into code that does not exist yet.
  - Blind spot: Nothing records the obligation for S-02 to pick up.
- **Decision**: FIXED via Fix A — new migration `supabase/migrations/20260720162553_narrow_authenticated_update_columns.sql`. `authenticated` keeps UPDATE on `day_plans (plan_date, prompt, current_generation, accepted_at)` and `activities (ordinal, title, description)`; everything else is withheld — `id`, `user_id`, `created_at`, `updated_at` (the trigger owns it), and on `activities` the two columns that decide batch membership, `plan_id` and `generation`. Plus `check (accepted_at is null or accepted_at >= created_at)`.
- **Mechanism note worth keeping**: a column-level `REVOKE` does _not_ cut a table-level grant — Postgres tracks them separately. The table-level UPDATE has to come off first, then the allowed columns go back on. Writing this as `revoke update (col)` would have silently done nothing.
- **Verified**: `db reset` applies all three migrations clean; suite 23/23; generated types re-run and byte-identical (privileges do not surface in `Database`). Exercised directly as `authenticated`: writes to `created_at`, `activities.generation` and `activities.plan_id` are denied, a backdated `accepted_at` violates the new check, and the legitimate edits (`prompt`/`accepted_at`/`current_generation`, `title`/`description`/`ordinal`) still succeed.
- **⚠️ Not yet on production**, same as F4.
- **Residual**: this closes the _hijack_ path but not the positive invariant — nothing yet ties a new `activities.generation` to its plan's `current_generation` on INSERT. That still belongs to S-02, and the branded type in `src/types.ts` now overstates less than it did.

### F6 — `src/types.ts` ships runtime functions, inverting the CLAUDE.md module split

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: src/types.ts:40-42, 66-70
- **Detail**: CLAUDE.md draws an explicit line — "Shared types (entities, DTOs) go in `src/types.ts`" and "Services/helpers go in `src/lib/`". This file exports two executable functions, `selectCurrentGeneration` and `acceptanceOf`. The first is load-bearing: it is the only constructor for the branded `CurrentActivity`, so every future consumer must import runtime code from the types module, converting it from a type-only module into an implementation module. The tension is real rather than careless — the plan required the generation invariant to be _encoded, not documented_, and a brand is unforgeable precisely because only a function can mint it — but it should be a conscious decision before S-02 imports it.
- **Fix**: Keep the types in `src/types.ts`; move the two functions to `src/lib/day-plans.ts`, following the existing `src/lib/config-status.ts` precedent.
- **Decision**: FIXED — `selectCurrentGeneration` and `acceptanceOf` moved to new `src/lib/day-plans.ts`. `src/types.ts` is now type-only (its sole remaining runtime-adjacent line is the `declare const` brand symbol, which emits nothing). The brand symbol stays unexported in `src/types.ts`, which is what keeps the constructor privileged.
- **Verified the move did not dissolve the guarantee** — this was the risk, since the whole point of the brand is that only one function can mint it. A temporary type-check fixture confirmed a plain `Activity[]` is still rejected where `DayPlanWithCurrentActivities` is expected (`ts(2322): Property '[currentGenerationBrand]' is missing`), while the same array routed through `selectCurrentGeneration` is accepted. `npx astro check` 0 errors across 31 files, `npm run lint` clean, `npm run build` succeeds.

### F7 — Missing `.prettierignore` leaves the generated-file protection half-applied

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: eslint.config.js:73-77
- **Detail**: The comment states the goal — stop the pre-commit `eslint --fix` rewriting the generated file behind the generator's back — and the flat-config global ignore at line 77 is correctly placed. But `package.json` also defines `"format": "prettier --write ."` and the repo has no `.prettierignore`. The generator emits semicolon-free output; `.prettierrc.json` adds semicolons and reflows. So `npm run format` reintroduces exactly the generator-vs-formatter churn the eslint ignore was added to prevent, and the next `supabase gen types` reverts it.
- **Fix**: Add `.prettierignore` containing `src/db/database.types.ts` (plus `dist/` and `.astro/`).
- **Decision**: FIXED — `.prettierignore` created with `src/db/database.types.ts`, `dist/`, `.astro/`, and `supabase/.temp/` (CLI link state, machine-written; Prettier v3 does not read `.gitignore`, so being gitignored was not enough). Claim confirmed before fixing — `npx prettier --check src/db/database.types.ts` did flag the file — and confirmed after: it no longer appears in `prettier --check .`.
- **Note, not fixed**: 45 other files still fail `prettier --check`, nearly all `context/**` markdown. Pre-existing and unrelated to this change, so left alone rather than swept into a review fix. Worth a separate pass, since `npm run format` currently produces a large unrelated diff for anyone who runs it.

### F8 — Redundant index on `activities (plan_id, generation)`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Performance)
- **Location**: supabase/migrations/20260718211452_day_plans_and_activities.sql:77
- **Detail**: The unique constraint at line 68 already creates a btree on `(plan_id, generation, ordinal)`; line 77 creates a strict prefix of it. Postgres serves any `(plan_id)` or `(plan_id, generation)` lookup from the wider index. The extra index buys nothing and costs write amplification on the hottest write path — regeneration batch-inserts here. The index was specified in the plan (plan.md:104), so this is a flaw carried from the plan, not drift. RLS index backing is otherwise fine: `day_plans.user_id` leads its unique constraint and `activities_user_id_idx` covers the child.
- **Fix**: Drop `activities_plan_id_generation_idx` in a follow-up migration.
- **Decision**: FIXED — new migration `supabase/migrations/20260720163134_drop_redundant_activities_index.sql`. Verified _before_ dropping, on a 500-plan / 5000-activity fixture: with the index gone the current-batch read plans as a bitmap index scan on `activities_plan_id_generation_ordinal_key` with an identical index condition, not a sequential scan. After: all four migrations apply clean, suite 23/23, and `activities` retains exactly `activities_pkey`, `activities_plan_id_generation_ordinal_key`, `activities_user_id_idx`.
- **This corrects the plan, not the implementation** — plan.md:104 specified the index and Phase 1 built exactly what was asked.

### F9 — RLS enabled but not forced; suite has no npm entry point

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260718211452_day_plans_and_activities.sql:108-109; package.json
- **Detail**: Two small gaps. (1) The tables are owned by the migration role, and a table owner bypasses RLS entirely unless `force row level security` is set — so any future `security definer` function silently skips all 16 policies. The test fixtures (test:28-38) rely on that bypass to seed, so forcing it is not free. (2) `package.json` has no `test` script and CI runs only lint and build, so `npx supabase test db` — the regression net for the entire deliverable — is discoverable only by reading the plan. CI wiring is legitimately Module 3 scope per the plan's Testing Strategy, but the npm entry point is not.
- **Fix**: Add `"test:db": "supabase test db"` to package.json; consider `force row level security` with a dedicated seeding path, or document the bypass as accepted.
- **Decision**: PARTIALLY FIXED, by choice. `"test:db": "supabase test db"` added to package.json; `npm run test:db` verified → 23/23 PASS. **`force row level security` deliberately not applied** — the pgTAP fixtures seed through the owner bypass, so forcing it means reworking the fixtures, and that is a larger change than an observation warrants mid-triage. The owner-bypass exposure stands as an accepted risk: any future `security definer` function on these tables skips all 16 policies. Worth revisiting if such a function is ever added.

## Verified clean

Recorded so future reviews do not re-litigate these:

- **Plan Adherence** — every contract item across all four phases verified MATCH against a live local stack. Exactly 16 policies, confirmed both by counting `create policy` statements and by querying `pg_policies`. The `unique (id, user_id)` constraint carries its load-bearing comment twice (inline and as `comment on constraint`). `ordinal` correctly avoids the name `position`. `src/db/database.types.ts` was regenerated and diffed byte-identical — not hand-edited.
- **Scope Discipline** — all eight "What We're NOT Doing" guardrails hold. `src/lib/services/` does not exist; no files under `src/pages/` or `src/components/` touched; `PROTECTED_ROUTES` unchanged; `.env`/`.dev.vars` untouched; `config.toml` `project_id` unrenamed.
- **Policy correctness** — every `authenticated` policy predicates on `(select auth.uid()) = user_id`, already using the subselect initplan-caching idiom. UPDATE policies carry both `using` and `with check`. `anon` policies are genuine deny-all, backed by `revoke all`. `set_updated_at()` is `security invoker` with `set search_path = ''` — correctly hardened, no escalation vector.
- **Success Criteria** — re-ran all automated checks on 2026-07-20: `npm run lint` clean, `npx astro check` 0 errors / 0 warnings, `npm run build` succeeds. The pgTAP suite reports 13/13 PASS (see F1 for what that number does and does not prove).
