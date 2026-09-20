<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Regeneracja tygodnia z zastępowaniem dni niezaakceptowanych (S-09)

- **Plan**: `context/changes/week-regeneration-replace/plan.md`
- **Scope**: Phases 1–4 (all)
- **Date**: 2026-09-20
- **Verdict**: REJECTED — one critical fix required. The slice is already merged (PR #23) and therefore already in production, so this is a follow-up, not a merge block.
- **Findings**: 1 critical, 6 warnings, 3 observations

## Verification run independently at HEAD (node v22.14.0)

| Check | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npm test` | exit 0 — 11 files, 238 tests |
| `npm run build` | exit 0 |
| `npm run test:db` | exit 0 — 3 files, 79 tests |
| `npm run test:e2e` | exit 0 — 6 passed |
| grep gates 3.4 / 4.2 / 4.3 | all green |
| `\df+ save_week_plan_generation` | `authenticated=X/postgres` only; no `anon`, no `PUBLIC` (criterion 1.3 confirmed) |
| `npm run test:gate` | 2 files / 6 tests **skipped** (suspended by recorded decision) |

Plan adherence is genuinely high: all 15 planned changes landed as described, no scope guardrail is
violated, `confirm_replace: true` is passed nowhere, and the day route keeps its contract.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — retryDay checks the week lock before a 30s await, takes it after

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/WeekPlanBoard.tsx:407-427
- **Detail**: The lock is read at `:408` and not taken until `:420`, across a model call. `retryDay`
  also never sets `busy`, so `isBusy` (`:87`) stays false and every control — the per-day retry
  buttons and "Generuj tydzień" (`:560`) — stays enabled for the whole retry. Two reachable
  outcomes: (1) **Double write** — two days failed on one rate limit (the ordinary case the
  docstring names); retry C then D, both pass `:408`, both continuations see a complete held set and
  each POST `/api/day-plan/week/save`; both transactions bump every day's `current_generation`, so
  `expected_generation` goes stale and "Akceptuj tydzień" 409s on every day. (2) **Week stored under
  the wrong hasło** — retry C, then press "Generuj tydzień" with a different hasło (the button is
  enabled and `generateWeek:302` passes because `weekInFlight` is still false); the new run
  generates A,B,D,E, C is skipped by `generateDay:119`, so that run's `writeWeek` returns silently
  with no message (`:184-186`) — four paid generations discarded wordlessly — and then C's
  continuation fires `writeWeek` with `keyword` captured at `:409`, the **old** hasło. The migration
  applies `p_prompt` to every day (`:105`), so the week is committed with one hasło's activities
  under another hasło's prompt, and `firstPrompt()` prefills the wrong one on reload. Also
  `retryDay`'s `finally` (`:425`) calls `setBusy("idle")` unconditionally and can clear a
  concurrently-running week run's state mid-run. The correct pattern is 20 lines below in the same
  file: `retryWrite` (`:439-444`) takes `weekInFlight` synchronously before the IIFE.
- **Fix**: Take a write-level guard synchronously before `void (async …)` in `retryDay` and set a
  `busy` value for the whole retry, so the other controls disable. Mirror `retryWrite:439-444`.
  - Strength: The pattern already exists in this file; the per-day `inFlight` set is the wrong guard
    because the collision is two days converging on one week-level write.
  - Tradeoff: The docstring deliberately declines `weekInFlight` during generation so two
    rate-limited days can be retried in parallel. Hoisting it wholesale would repeal that decision —
    so this needs a separate write guard, not a one-line move.
  - Confidence: HIGH — confirmed the check/set gap, the absent `setBusy`, and `generateWeek`'s own
    synchronous take at `:302`/`:328` by reading the code.
  - Blind spot: Have not measured how often two days fail together in practice; the docstring
    asserts it is the ordinary case, which is what makes the race reachable.
- **Decision**: **FIXED** — separate `writeInFlight` guard taken synchronously inside `writeWeek`, `retriesInFlight` counter read by `generateWeek`, `busy` set for the whole retry and cleared only by the last retry standing. Stale docstring claim corrected.

### F2 — The atomicity claim has zero automated coverage

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/database/day_plan_write.test.sql
- **Detail**: "The load-bearing half is not the UI" (plan.md:15). Nothing can fail if that half
  regresses. `git show a04aa83:…/day_plan_write.test.sql | grep -c save_week_plan_generation` → **0**.
  The one occurrence at HEAD came from `a778f2f` (the later theme fix) and asserts theme clearing,
  not atomicity. The vitest route tests stub PostgREST entirely
  (`__fixtures__/supabase.ts:97-103` — `rpc` is a `vi.fn`) so they cannot execute a line of plpgsql.
  The 6 Playwright specs cover ownership and day deletion; none touches the week board, so criterion
  4.6 passes while covering nothing of this slice. `plan.md:111` lists "New pgTAP coverage" under
  *What We're NOT Doing*, so this is a recorded decision, not drift — what makes it worth raising is
  that `a778f2f` added a week-writer pgTAP call two commits later, so the cost of the missing
  assertions is demonstrably three lines in a suite that already exists and already runs.
- **Fix**: Add three assertions to `day_plan_write.test.sql` — (a) two-day payload, second day empty
  → `U0003` and day one's `current_generation` unchanged; (b) accepted day with
  `p_confirm_replace => false` → `U0001` with the date in the message; (c)
  `has_function_privilege('anon', …)` is false.
  - Strength: Closes the slice's stated invariant, the grant check, and manual criteria 1.6/1.7 in
    one pass, in a suite `npm run test:db` already gates on.
  - Tradeoff: Reopens a decision the plan recorded; ~30 lines of SQL.
  - Confidence: HIGH — ran `test:db` and read the file; the fixtures and role-switching pattern are
    already there.
  - Blind spot: None significant.
- **Decision**: **SKIPPED** — the plan's recorded no-new-pgTAP decision stands.

### F3 — The CI gate detector does not watch where this slice moved the prompt

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:51-52 and :72-74
- **Detail**: With the gate suspended, the `::warning::` annotation is the only remaining signal that
  a prompt changed ungraded. Its regex matches
  `^src/lib/services/prompts/.*\.(pl\.md|schema\.json)$|^src/lib/services/allowed-models\.ts$|^src/lib/services/content-safety|^vitest\.gate\.config\.ts$`.
  `src/lib/services/activity-generator.ts` is **not** in it — and this slice moved prompt assembly
  into that file: `buildOutlineSystemMessage` (assembles the final system message from the `.pl.md`
  template) and `buildOutlineResponseSchema` (rewrites the model-facing JSON Schema's bounds at call
  time). An edit to either changes what the model is told and triggers neither the gate nor even the
  warning. `gate-suspension.ts` is also outside the pattern, so silently flipping the gate back off
  would not be flagged either. This is not a pre-existing hole; the slice created it by moving text
  out of the watched file into an unwatched one. `change.md` documents the suspension thoroughly but
  does not mention this gap.
- **Fix**: Add `^src/lib/services/activity-generator\.ts$` and `^src/lib/services/gate-suspension\.ts$`
  to both regexes in `ci.yml`, and note the gap in `change.md`.
- **Decision**: **SKIPPED**

### F4 — The refused plan_date never reaches the teacher

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: supabase/migrations/20260919164500_save_week_plan_generation.sql:29-31, src/lib/services/day-plan-http.ts:147-158
- **Detail**: The plan's Phase 1 store contract: "Where the refusal names a `plan_date`, that must
  survive into the `StoreError` message so the route and the island can point at the day." The
  migration header states it as achieved: "the date travels in the message and out through
  `StoreError` to the route." Half of that is true — the Postgres message is interpolated verbatim
  into `StoreError.message`. But `storeFailure` sends
  `failure.userMessage ?? MESSAGE_BY_CATEGORY[failure.category]` — never `message` — and there is no
  per-code entry for `U0001`. The teacher gets the generic singular *"Ten plan zmienił się w innym
  miejscu. Odśwież stronę i spróbuj ponownie."* The date reaches the server log only. Across five
  days, "a plan is accepted" without a date is precisely the thing the migration header says it set
  out to avoid.
- **Fix A ⭐ Recommended**: Give the week path a `userMessage` that carries the date — set it in
  `saveWeekGeneration` when the code is `U0001`.
  - Strength: Realises the contract the plan wrote and the migration header already claims;
    `userMessage` is the established channel for "the one message a category default cannot cover"
    (`day-plan-store.ts:157`).
  - Tradeoff: Puts a database-derived string in front of the teacher; needs Polish copy built on our
    side, not Postgres's.
  - Confidence: HIGH — the mechanism exists and is already used once.
  - Blind spot: Haven't checked whether the island has anywhere to render a per-day refusal versus
    the week-level banner.
- **Fix B**: Correct the migration header and the plan's contract to say the date is for the log only.
  - Strength: Zero behaviour change; makes the comment honest, which is what future readers act on.
  - Tradeoff: Leaves the teacher with an unactionable message on a five-day operation.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: **FIXED via Fix A** — `weekConflictMessage` lifts the refused date out of the U0001 message and sets a Polish `userMessage`; falls back to the category default when the message shape does not match. Migration header corrected to say `message` is log-only. Two route tests added (date present; fallback on unmatched shape).

### F5 — The week writer does not validate plan_date; a bad date is reported as a temporary outage

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20260919164500_save_week_plan_generation.sql:66
- **Detail**: The single-day writer takes `p_plan_date date`, so PostgREST rejects garbage before the
  body runs. The week writer takes it out of jsonb with no check:
  `v_plan_date := (v_day ->> 'plan_date')::date;`. Missing/null/non-object element → `v_plan_date`
  NULL → the update matches nothing → insert hits `plan_date NOT NULL` → 23502 → `invalid` → 500,
  and any `U0003` for that element prints `activity batch for <NULL> is empty`. Malformed date
  string → 22007, which `categorize()` (`day-plan-store.ts:105-154`) does not list → falls to
  `default: "transient"` → 503 *"spróbuj ponownie za chwilę"*, and `saveWeekGeneration` retries it
  once — a permanently malformed payload described to the teacher as a passing outage. Blast radius
  today is small (`save.ts` validates with `z.iso.date()`, `SUPABASE_KEY` is server-only), but
  `20260830092600`'s own comment is the reason this matters: "the project's own rule is that
  invariants live in the schema."
- **Fix**: Raise `U0003` when `v_day ->> 'plan_date'` is null or does not cast, so a malformed
  payload gets a terminal, named refusal instead of a retried 503.
- **Decision**: **FIXED** — new migration `20260920140000_week_writer_guards_plan_date.sql` refuses a missing/malformed `plan_date` with U0003 before the cast; `categorize()` additionally names 22007/22008 as `invalid` so the residual cast failures stop being retried as outages. Verified against a reset database.

### F6 — A contract comment asserts a refusal the function does not have

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/day-plan-contract.ts:266-269
- **Detail**: The comment reads "`days` is bounded `1..WEEK_DAYS` on both sides: … The writer refuses
  both on its own (`U0003`), but reaching it costs a round trip." The writer refuses one, not both.
  The migration's `U0003` guard (`:58-62`) covers null, non-array and zero-length. There is no upper
  bound anywhere in the function — a `p_days` of 500 elements is iterated and written. The only cap
  is the zod `.max(WEEK_DAYS)` at `:282`, which is exactly the "a schema in one route's request path,
  not an invariant" that `20260830092600:13-17` was written to reject.
- **Fix**: Add `or jsonb_array_length(p_days) > 5` to the `U0003` guard so the comment becomes true —
  or correct the comment to say the upper bound is the route's alone.
- **Decision**: **SKIPPED** — the comment's over-claim stands; no upper bound added to the function.

### F7 — All 11 manual criteria unchecked, yet the slice is closed and shipped

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/week-regeneration-replace/plan.md §Progress (1.6, 1.7, 2.7, 2.8, 3.7, 3.8, 4.7–4.11)
- **Detail**: Every automated box is `[x]` and each one was confirmed independently. Every manual box
  is `[ ]` — 11 of 11 — while `change.md` says `status: implemented` and PR #23 is merged to
  `master`, which per CLAUDE.md §CI is a production release with no approval step between. Phase 4's
  own note says "This phase is where the behaviour change becomes visible to the teacher. Do not
  close the slice on automated verification alone." Phases 1–3 each say "pause here for manual
  confirmation before proceeding." This is not rubber-stamping — nothing was falsely marked done,
  which is the honest version of this failure. But the unchecked boxes include exactly the properties
  automated tests do not cover (F2): 1.6 two-day payload with one empty batch leaves both unchanged,
  4.9 forced failure leaves every day on its old plan after reload.
- **Fix**: Run the 11 manual steps against local Supabase and check them off, or record explicitly in
  `change.md` which ones are being waived and why — as was done for 2.4.
- **Decision**: **SKIPPED** — Progress left as it stands.

### F8 — First ungraded prompt edit merged under the gate suspension

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/changes/week-regeneration-replace/change.md, src/lib/services/gate-suspension.ts, src/lib/services/content-safety-judge.ts:38
- **Detail**: The suspension is an owner decision, documented unusually honestly (`describe.skip` not
  deletion; suites still compile; a loud banner). Recording rather than re-litigating: this slice
  rewrote `week-outline.pl.md`'s opening and "rytm tygodnia" paragraphs, so it is the first slice to
  merge a prompt edit that nobody graded, and the judge moved to `claude-haiku-4.5` whose calibration
  suite is itself suspended. §Odbiorca / §Język / §Hasło nieodpowiednie dla wieku are verifiably
  untouched (zero diff lines), and `activity-generator.test.ts` asserts those strings survive — so
  the safety wording did not move. The actionable part is F3.
- **Fix**: None — recorded for the PR. See F3 for what to change.
- **Decision**: **ACKNOWLEDGED** — no action; recorded decision stands.

### F9 — `npm run test:gate` exits 0 while suspended

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: vitest.gate.config.ts
- **Detail**: Ran it: "2 skipped / 6 skipped", banner printed, exit code 0. The human-visible signal
  is honest; the machine-visible one reads green. Any future automation keying on exit status
  inherits a false pass.
- **Fix**: Exit non-zero (or a distinct code) from the gate script while `GATE_SUSPENDED` is on, so
  no automation can read the suspension as green.
- **Decision**: **FIXED** — `npm run test:gate` now exits 2 while suspended (distinct from Vitest's 1), so no automation reads the suspension as a pass. Verified both ways.

### F10 — Two of the three grep gates are weaker than they look

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/week-regeneration-replace/plan.md §Phase 3/4 Automated Verification
- **Detail**: All three pass. Against `lessons.md`'s "a grep gate must anchor on the construct
  carrying the invariant": **4.2** (`only_if_absent` absent from the board) is vacuous — the board no
  longer calls that route at all, so nothing could reintroduce the field; it is the exact shape the
  lesson names. **3.4** (`MESSAGE_BY_CATEGORY` → one file) anchors on a bare identifier and
  `--include='*.ts'` excludes `.tsx`, which is where duplication has actually happened here
  (`DayPlanEditor.tsx:173` carries its own hardcoded fallback string). **4.3** is the good one — it
  anchors on a string literal that is the load-bearing construct — but escapes a template literal.
- **Fix**: Tighten 4.3 to ``grep -nE "/api/day-plan/generate['\"`]"``; drop or replace 4.2 with a
  unit test asserting the board's only day request goes to `week/day`; widen 3.4 to include `.tsx`.
- **Decision**: **FIXED** — 3.4 widened to `.tsx`; 4.2 restated as a positive grep on the `week/day` fetch; 4.3 tightened with a trailing quote class. All three re-run green; plan.md criteria and Progress rows updated.
