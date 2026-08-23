<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-02 `edit-accept-day-plan` — plan implementacji

- **Plan**: context/changes/edit-accept-day-plan/plan.md
- **Scope**: Phases 1–4 of 4 (full plan)
- **Date**: 2026-08-23
- **Verdict**: REJECTED (triaged 2026-08-23 — all 10 findings fixed or documented; re-verified green)
- **Findings**: 1 critical, 6 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

> **Post-triage**: every finding was decided and applied on 2026-08-23. F1's critical
> data-safety gap is closed in the schema, so Safety & Quality no longer FAILs on the
> code as it now stands; the verdict table above records the state the review found.
> Post-fix verification: lint clean, `astro check` 0 errors (44 files), build passes,
> pgTAP **51/51**, generated types in sync, and all four API routes plus `/plan` still
> answer correctly without a session.

## Automated verification (re-run during this review)

| Check | Result |
|---|---|
| `npm run lint` | PASS — clean |
| `npx astro check` | PASS — 0 errors, 0 warnings, 4 hints (43 files) |
| `npm run build` | PASS |
| Build without `SUPABASE_URL` / `SUPABASE_KEY` | PASS |
| `npm run test:db` | PASS — Files=2, Tests=46 |
| `npx supabase gen types typescript --local` | PASS — output byte-identical to the committed `src/db/database.types.ts` |
| `POST /api/day-plan/generate` no session | 401, `application/json` |
| `PATCH /api/day-plan/activity/:id` no session | 401, `application/json` |
| `POST /api/day-plan/accept` no session | 401, `application/json` |
| `GET /plan?date=2026-09-14` no session | 302 → `/auth/signin` |
| `PATCH` title 201 chars (live session) | 400, Polish message naming both bounds |
| `PATCH` description 4001 chars (live session) | 400, same envelope |
| Cross-account `PATCH` on another teacher's activity | 404, row verified unmodified in the DB |
| Cross-account `POST /accept` on another teacher's plan | 404, `accepted_at` verified still NULL |
| `has_function_privilege('anon', 'save_day_plan_generation', 'execute')` | `false` (`authenticated` = `true`) |
| `npx supabase db reset` (criterion 1.1) | **NOT re-run** — it would destroy the local test data `change.md` deliberately preserved for S-03. Passed at 95fa8c7; the full pgTAP suite passes against the current database. |

## Findings

### F1 — The "don't destroy an accepted plan" guard exists only in the browser

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/DayPlanEditor.tsx:128, src/pages/plan.astro:23-25, supabase/migrations/20260823095136_day_plan_generation_write_contract.sql:162-200
- **Detail**: `plan.md` (Phase 4 §2) commits: *"Regeneracja na zaakceptowanym planie: potwierdzenie nazywające konsekwencję … Ten klik jest nieodwracalny, bo wybrana retencja usuwa poprzednią partię."* The confirmation is implemented, but it is gated on `accepted = plan?.plan.accepted_at`, which is **client state**. `save_day_plan_generation` performs the upsert-bump → `delete … where generation < v_generation` → insert unconditionally: it will supersede an accepted plan on any call, with no server-side check. Two reachable paths where the guard is skipped: (a) `plan.astro:23-25` collapses a thrown `readDayPlan` into `initialPlan = null`, so a transient read failure renders "Ten dzień nie ma jeszcze planu" with the generate form on a day that has an accepted plan — the teacher generates, `accepted` is `null`, no confirm fires; (b) two tabs on the same day — the teacher accepts in tab B, then generates in tab A whose `plan` state predates the acceptance. In both cases the accepted batch is deleted and `accepted_at` cleared with no prompt. The migration's own comment (lines 245-247) states there is no undo, and "Żadnego undo" is an explicit *What We're NOT Doing* item — so the loss is unrecoverable. This also cuts against the slice's stated organizing principle: *"niezmienniki mieszkają w schemacie, nie w TypeScripcie."*
- **Fix A ⭐ Recommended**: Enforce the guard server-side — carry `confirm_replace: boolean` through `generateDayPlanRequestSchema` and have the route (or a `p_confirm_replace` argument on the RPC) refuse to supersede a plan whose `accepted_at` is non-null without it; separately, make `plan.astro` distinguish "no plan" from "could not read" and never render the generate-invitation on a read failure.
  - Strength: Puts the invariant where the slice says invariants belong, and closes every stale-client path at once, not just the two identified. The refusal maps cleanly onto the existing `StoreError` categories and the `day-plan-http.ts` envelope.
  - Tradeoff: Touches the request contract, the RPC signature and the island's generate path — the widest edit in this list, and it needs a new pgTAP assertion plus a re-run of the write-contract tests.
  - Confidence: HIGH — the destructive statement and the missing check are both visible in the code, and the cross-account isolation tests already show the RPC path is the only writer.
  - Blind spot: Have not designed the UX for the refusal arriving *after* a paid 10–30 s generation; the confirm may need to move ahead of the model call to avoid burning tokens on a write that will be refused.
- **Fix B**: Fix only `plan.astro` — render an explicit error state with a reload affordance when the SSR read throws, leaving the confirmation client-side.
  - Strength: A few lines, no contract change, no migration; removes the path most likely to hit a teacher working alone.
  - Tradeoff: Leaves the two-tab and stale-page paths open, and leaves a destructive server operation with no server-side guard — the same shape of gap F-01's review handed to this slice.
  - Confidence: MEDIUM — it demonstrably closes path (a); it demonstrably does not close path (b).
  - Blind spot: Have not measured how likely a teacher is to keep two tabs on `/plan` open; if that is common, Fix B addresses the rarer of the two paths.
- **Decision**: FIXED via Fix A — migration `20260823193447_confirm_replacing_accepted_plan.sql` adds `p_confirm_replace boolean default false` to `save_day_plan_generation`, checked (with `for update`) before the upsert that would erase the evidence, raising `U0001`. New `conflict` store category → 409, excluded from the retry. `generate.ts` pre-checks before the model call so a refusal costs no tokens. `plan.astro` distinguishes "no plan" from "could not read" and renders an error panel with no generate form. Island sends `confirm_replace`. Verified: pgTAP 50/50 with three new assertions, all three confirmed red under a mutation that removes the guard; live 409 with the plan untouched and no model call; direct PostgREST call without confirmation refused (`U0001`, plan intact), with confirmation succeeds; the error panel verified by stopping PostgREST.

### F2 — Store-path failures are never logged, and a comment claims otherwise

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/day-plan-store.ts:124-126, src/lib/services/day-plan-http.ts:90-98, src/pages/api/day-plan/generate.ts:58
- **Detail**: `toStoreError` packages `error.code` and `error.message` into a `StoreError`; `storeFailure()` reads only `category` and `userMessage`. Nothing on the store path calls a logger — verified by grep, zero hits for `logError`/`logInfo`/`console` in both files. So a `23514` from the generation invariant or a `42501` from a mis-set grant reaches the teacher as a generic 500 and leaves no server-side record of which constraint refused what. The sibling service does the opposite: `src/lib/services/activity-generator.ts:120-126` defines `logInfo`/`logError` with an explicit `wrangler.jsonc observability` rationale and logs every failure with its status and `error_type`. The comment at `generate.ts:58` — *"The service already logged the failure with its status and error_type"* — is true for `GenerationError` and false for `StoreError`, and both flow through that route.
- **Fix**: Add a `logError` call in `toStoreError` (or in `storeFailure`) carrying `code`, `category` and the sanitised message, mirroring `activity-generator.ts`; correct the comment in `generate.ts:58`.
- **Decision**: FIXED — logging added in `storeFailure` (`day-plan-http.ts`) rather than `toStoreError`, for coverage: several `StoreError`s are raised by hand and never touch a `PostgrestError` (the `not_found` from an update that matched nothing, the new `conflict` refusal), and every route funnels through `storeFailure`, so each failure is recorded exactly once. Fields mirror `activity-generator.ts`: `category`, `code`, `retryable`, `message`. The comment at `generate.ts:58` now says which layer logs what.

### F3 — "Spróbuj ponownie" re-sends a stale edit body and silently discards the teacher's newer text

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/DayPlanEditor.tsx:74, 148-158
- **Detail**: `mutate` stores `lastAttempt.current = () => mutate(request, busyKind)`. For `saveDraft(current)` the captured `request` closes over the `Draft` object as it stood at the first attempt. On failure `setDraft(null)` is not reached (it is in the success branch at line 85), so the editor stays open with the teacher's text. If they adjust the text and then press **"Spróbuj ponownie"** rather than **"Zapisz"** — the two buttons are adjacent and do different things — the *older* body is PATCHed; on success `setPlan(body)` + `setDraft(null)` close the editor showing the older text. The post-failure edits vanish with no error shown.
- **Fix**: Store the retry as a description of intent rather than a frozen closure — e.g. `lastAttempt.current = () => { const d = draftRef.current; if (d) saveDraft(d); }` — or hide the generic retry button while a draft editor is open so "Zapisz" is the only retry path.
- **Decision**: FIXED — `mutate` now takes an optional `retry` describing the intent, defaulting to re-running the frozen request (right for generate and accept, whose bodies are settled). `saveDraft` passes a retry that reads `draftRef.current`, a live mirror kept in sync by a single `setDraft` wrapper, so "Spróbuj ponownie" sends what is on screen rather than what was on screen when it failed. Verified by lint, `astro check` and build; **not** exercised live — reproducing it needs a mid-edit request failure driven through a browser.

### F4 — Acceptance has no optimistic-concurrency guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/day-plan/accept.ts:42, src/lib/services/day-plan-store.ts:234-241
- **Detail**: `setAcceptance` updates `accepted_at` by `plan_id` alone. Two tabs on the same day: tab A regenerates (new batch written, `accepted_at` cleared); tab B still renders the superseded batch and its "Akceptuj plan" button; the teacher clicks it. The acceptance is written and now attests to three proposals they have never read. Editing from tab B would 404 (those rows were deleted), which is the safe outcome — accept is the one verb that succeeds against content the client never saw. The same shape applies to a bookmarked or back-button page. Related to F1, but a distinct hole: F1 is about destroying an acceptance, this is about creating a false one.
- **Fix**: Carry the client's expected `current_generation` in `acceptPlanRequestSchema` and add `.eq("current_generation", expected)` to the update; the zero-row result already maps to `not_found`, so give it a distinct message ("plan zmienił się w innej karcie — odśwież").
- **Decision**: FIXED — `expected_generation` added to `acceptPlanRequestSchema` and sent by the island from the view it rendered; `setAcceptance` filters on it. A zero-row result now pays for one read on the failure path to separate the two reasons: the plan is visible but has moved on → `conflict`/409, otherwise `not_found`/404, so no existence oracle is opened. Verified live: stale accept (expected 1, plan at 2) → 409 with `accepted_at` still NULL, current accept (expected 2) → 200 and written; an unknown id and another teacher's plan both still → 404.

### F5 — After a failed mutation the screen keeps showing pre-request state

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/DayPlanEditor.tsx:93-104, src/lib/services/day-plan-store.ts:176-185
- **Detail**: On failure the island sets `failure` and returns; it never re-reads the plan. Combined with `saveGeneration`'s deliberately non-idempotent retry (documented at lines 170-174): if the RPC commits but the response is lost, the retry commits a *second* generation; if that response is also lost, the route answers 503. The teacher sees "Nie udało się zapisać zmiany. Spróbuj ponownie za chwilę." over the **old** plan, presses retry, and pays for another full 10–30 s generation for a day that already holds two saved generations. `current_generation` ends three higher than the number of button presses and the on-screen state is wrong until a manual refresh. The store's docblock accepts the double-write trade honestly; the gap is that the UI never reconciles.
- **Fix**: After any mutation failure, re-read the plan before offering the retry button (a `GET` on the day, or `window.location.reload()` on the generate path), so the retry decision is made against what the server actually holds.
- **Decision**: FIXED — new read route `src/pages/api/day-plan/index.ts` (`GET ?date=`), answering the same success envelope, 404 for a day with no plan, 400 for a bad date, 401 without a session. The island gained `reconcile()`, called on both failure branches of `mutate` (skipped on 401, where a re-read would fail the same way), so the view matches the server before "Spróbuj ponownie" is offered. Its own failure is swallowed so it cannot overwrite the mutation's message. Verified live: 401 / 400 / 404 / 200 all correct, and a day belonging to another teacher reads as 404 rather than leaking its contents. **Note**: this is a small addition to the public API surface that the plan does not describe — see the Scope Discipline note below.

### F6 — Every successful mutation overwrites a typed-but-unsent hasło

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/DayPlanEditor.tsx:84
- **Detail**: `mutate()` runs `setPrompt(body.plan.prompt)` on every successful response, but only `generate` is a prompt-writing operation. The teacher retypes the hasło intending to regenerate, changes their mind and clicks "Akceptuj plan" (or saves an activity edit); the route answers with the whole plan, `setPrompt` fires, and the typed hasło is replaced by the stored one. `disabled={isBusy}` does not help — the overwrite lands after the textarea re-enables.
- **Fix**: Resync the prompt only when the mutation was a generation (pass `busyKind === "generating"` through `mutate`), or drop the resync entirely — the island already holds the text it sent.
- **Decision**: FIXED — `setPrompt(body.plan.prompt)` is now guarded by `busyKind === "generating"`, so an accept or an activity save no longer takes the hasło back from the server. `reconcile()` (F5) deliberately does not touch the prompt either, for the same reason.

### F7 — `day-plan-store.ts` exposes five functions where the plan specified four

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/day-plan-store.ts:291
- **Detail**: Phase 2 §1 specifies "Cztery funkcje" and names them. The module exports five: `saveGeneration`, `updateActivityText`, `setAcceptance`, `readDayPlan`, plus `readDayPlanById` (line 291). The addition is intent-preserving — the PATCH and accept routes hold a `plan_id` rather than a date, and it routes through the same `readCurrentActivities` → `selectCurrentGeneration` funnel — but it is the one plan commitment stated as an exact count that the implementation does not meet, and unlike the three other adaptations in this slice it was not recorded in `change.md`.
- **Fix**: Add a `change.md` note recording `readDayPlanById` and why the by-id read path was needed, matching how the other adaptations were documented.
- **Decision**: FIXED — `change.md` gained four notes in the same style as the existing adaptations: `readDayPlanById` and the new `GET /api/day-plan` route (both reads beyond the plan's four functions, with the reason for each), the schema-level regeneration confirmation (F1), and the conditional acceptance (F4).

### F8 — `types.ts` and `day-plans.ts` still assert the retention claim the migration corrected

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/types.ts:23-26, src/lib/day-plans.ts:6-8
- **Detail**: Both docblocks state *"A regenerated plan leaves the previous batch resident in `activities`"* — the exact claim §4 of the migration went out of its way to correct in the SQL comments (lines 240-247), because `save_day_plan_generation` now deletes the superseded batch in the same write. The `CurrentActivity` brand is still worth keeping, but its stated justification is now false, which is precisely the kind of drift lessons.md rule #2 is about.
- **Fix**: Rewrite both docblocks in the same spirit as the migration's §4 — the brand guards the counter, not a resident previous batch.
- **Decision**: FIXED — both docblocks now say the delete happens and then give the brand's real justification: the counter, not the delete, is what defines "current", so a row that does not match it renders as a stale proposal with no error, whatever put it there.

### F9 — Manual item 1.6 (mutation checks) has no recorded evidence, and one assertion does not discriminate

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/edit-accept-day-plan/plan.md (Progress 1.6), supabase/tests/database/day_plan_write.test.sql:114-123
- **Detail**: Progress item 1.6 — *"Każda nowa asercja pgTAP sprawdzona mutacją"* — is checked `[x]` against 95fa8c7, but neither that commit message nor `change.md` records the mutation runs, while every other manual item in this change has a detailed evidence note. Supporting signal that the pass may have been less rigorous than claimed: the assertion at lines 114-123 claims to prove `with ordinality` rather than `row_number() over ()`, but for a 3-element `jsonb_array_elements` both produce 1/2/3 in the same order, so that assertion cannot fail under the mutation it names. The rest of the suite is strong — 23 assertions matching `plan(23)`, positive controls at lines 81-85 and 313-316, whole-table retention count at 158-163, joint ordinal+title assertion — so the risk here is low.
- **Fix**: Either re-run the mutation checks and record them in `change.md` as the other manual items were, or soften the comment at day_plan_write.test.sql:114-116 so it does not overclaim what that assertion proves.
- **Decision**: FIXED — full mutation sweep run and recorded in `change.md`. Eight of nine mutations went red on the expected assertions (invariant trigger → 1,2,3,23; acceptance trigger → 18,19; its `when` clause → 20,24; the retention delete → 13,14; the `accepted_at` reset → 15; the counter bump → whole file; `grant execute to anon` → 25; the new confirmation guard → 8,9,10). The ninth confirmed the gap: `with ordinality` → `row_number() over ()` left the suite **green**. No behavioural assertion can separate those two, so a structural assertion on `pg_get_functiondef` was added (`plan(27)` → `plan(28)`, suite now 51) and verified red under the same mutation; the behavioural comment now claims only what it proves.

### F10 — `setAcceptance` timestamps from the Worker clock, not Postgres `now()`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/day-plan-store.ts:238
- **Detail**: Phase 2 §1 says `setAcceptance` "ustawia `accepted_at` na `now()` albo `null`"; the implementation writes `new Date().toISOString()` from the Worker. PostgREST cannot send `now()` as an update value without another RPC, and the code reasons about the one constraint this could violate (`day_plans_accepted_after_created`, migration 20260720162553:52), concluding a human cannot reach it. Phase 3's stronger commitment — that the *returned* `accepted_at` comes from the database — still holds, because `accept.ts:43` re-reads the row. Recorded as a deviation only because it is undocumented and it is the one persisted value in this slice sourced from a clock outside the database.
- **Fix**: Add a `change.md` note, or move the timestamp into the database with a small RPC if the "database is the only source of truth" principle is meant literally.
- **Decision**: DOCUMENTED — `change.md` note added recording the deviation, why PostgREST forces it, the bounded risk (`day_plans_accepted_after_created`, unreachable by a human), and the fact that the *returned* timestamp still comes from the row. The Worker clock stays.

## Triage summary

| | Findings |
|---|---|
| Fixed | F1 (Fix A), F2, F3, F4, F5, F6, F8, F9 |
| Documented | F7, F10 |
| Skipped | — |

New files from triage: `supabase/migrations/20260823193447_confirm_replacing_accepted_plan.sql`,
`src/pages/api/day-plan/index.ts`. Both are recorded in `change.md`.

## Notes on scope

Everything load-bearing in the plan was implemented as written and verified in the code:

- Migration command order (upsert-bump → delete superseded → insert), `with ordinality` for `ordinal`, the `when (old.title is distinct from new.title or old.description is distinct from new.description)` clause, revoke-before-grant plus the extra `revoke … from anon`, and the corrected `activities` retention comment.
- All seven pgTAP contract bullets from Phase 1 §3 are present, none weaker than described.
- `generate.ts` body changed to `{plan, activities}`; no branch returns unsaved proposals.
- `context.locals.supabase` typed `SupabaseClient<Database> | null`, not `any`.
- Both new routes validate against `TITLE_MAX`/`DESCRIPTION_MAX` imported from `day-plan-limits`, answer 404 (not 403) for rows RLS hides — confirmed live against another account's data.
- `plan.astro` resolves `?date=`, reads server-side, passes `planDate` + `initialPlan`; the island initialises from props, navigates on date change, replaces state from the server on every mutation, and Cancel fires zero requests.
- The old "Propozycje nie są jeszcze zapisywane" copy is gone repo-wide; all new UI text is Polish.
- All seven *What We're NOT Doing* boundaries hold: no calendar view, no undo, no TS/React test runner, no prompt or model change (`git diff` over `src/lib/services/prompts/` and `activity-generator.ts` is empty), no delete route, no `dashboard.astro` translation, no regeneration limit.

Three extras beyond the plan's file list, all documented in `change.md` and all holding up on inspection: `src/lib/services/day-plan-http.ts` (shared wire envelope, lifted out of three routes), `GenerationProgress.startedAt` made optional (forced by `react-hooks/purity`), and the two-SQLSTATE trigger (forced by F-01's `rls_isolation.test.sql:141-147`, which was verified).

Clean on inspection: SQL injection, `set search_path = ''` on all three new functions, authn at every API boundary, XSS, CSRF, hardcoded secrets, performance, React effect hygiene, and SSR/hydration (the `Europe/Warsaw` pinning in `day-plan-dates.ts` fixes a real S-01 mismatch). The `delete` in `save_day_plan_generation` was verified safe on all three counts: scoped to the caller's own RLS-checked `plan_id`, `generation < v_generation` with a counter that advances by exactly 1, and ordered strictly before the insert so it cannot touch the batch it is about to write.
