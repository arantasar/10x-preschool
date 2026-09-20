# Regeneracja tygodnia z zastępowaniem dni niezaakceptowanych — Implementation Plan

## Overview

Week generation today refuses to touch any day that already has a plan. It filters the week down
to days with no row at all, sends `only_if_absent: true` for each, and badges the rest `pominięty`.
A teacher who wants a different hasło for the week has to open five days one at a time.

This change turns that skip into a replacement. Every **unaccepted** day of the week — draft or
empty — is regenerated under the new hasło, behind a confirmation that states how many days will be
replaced and how many accepted days are being left alone. Accepted days stay out of reach until
`S-10` (FR-013) extends the operation to them.

The load-bearing half is not the UI. It is that "five days replaced" has to be all-or-nothing:
either the teacher ends up with a complete new week or with the week they had. Today's board treats
"three saved, two failed" as a normal outcome and says so in its own comments. That stops being
true here.

Roadmap slice `S-09`. PRD refs: FR-012, FR-014, US-02; §Kryteria sukcesu Primary; Guardrails #2
and #3; §Warunki jakościowe zmiany („Nieukończone zastąpienie tygodnia nie zostawia śladu").

## Current State Analysis

**The skip policy is a real capability gap, not a wording problem.**
`WeekPlanBoard.generateWeek()` computes `free = week.days.filter((date) => days[date].plan === null)`
(`src/components/plan/WeekPlanBoard.tsx:138`) and refuses the whole run when `free.length === 0`
with "Wszystkie dni tego tygodnia mają już plan. Otwórz dzień, żeby go zmienić." Each day request
carries `only_if_absent: true` (`:88`), and the 409 that comes back is folded into a `skipped`
status (`:104-117`).

**Per-day replacement already exists on the wire.** `/api/day-plan/generate` accepts
`only_if_absent` and `confirm_replace` (`src/lib/services/day-plan-contract.ts:165-175`), pre-checks
both before paying the model (`src/pages/api/day-plan/generate.ts:128-147`), and `DayPlanEditor`
already uses `confirm_replace` for single-day regeneration (`src/components/plan/DayPlanEditor.tsx:234`).
Nothing new is needed to replace *one* day.

**Per-day atomicity is already correct.** `save_day_plan_generation` bumps `current_generation`,
deletes the superseded batch and inserts the new one inside one function
(`supabase/migrations/20260830092600_reject_empty_activity_batch.sql`), and the route calls it only
*after* `generateDayActivities` returns. An LLM failure cannot blank a day — guardrail #3 holds for
one day today.

**Week-level atomicity does not exist and cannot be bolted on client-side.** Five days means five
HTTP calls and five separate transactions; PostgREST gives the client no transaction to put them in,
which the write-contract migration records as the reason that function exists at all. The roadmap
names this precisely: *„`save_day_plan_generation` jest dziś jedynym pisarzem partii i umie jeden
dzień."*

**The generation route has no "generate but do not write" mode, deliberately.**
`src/pages/api/day-plan/generate.ts:158-163` states that "a proposal without a row" is a state the
slice has no representation for, because offering one would put the island back in the business of
owning plan state. Holding batches until the whole week is in hand requires exactly that state.
This plan introduces it in new routes rather than by loosening the existing one, so the single-day
route keeps its invariant intact.

**The outline contract is pinned to exactly five in four places.**
`weekOutlineRequestSchema.dates.length(WEEK_DAYS)` and `weekOutlineSchema.tematy.length(WEEK_DAYS)`
plus its uniqueness refine (`day-plan-contract.ts:83-86, 190`), `toDayThemes` mapping sorted index
into `dates` (`:100-105`), `week-outline.schema.json` (`minItems`/`maxItems` 5, `dzien.maximum` 5),
and `week-outline.pl.md`, which says „**Dokładnie pięć** tematów. Nie cztery, nie sześć."

**Content safety is a CI gate, not a runtime filter.** `vitest.gate.config.ts` runs
`src/**/*.gate.test.ts` against every allowed model; there is no per-request judge in the write
path. A write route accepting client-supplied batches therefore bypasses no runtime check, and sits
on the same trust boundary `/api/day-plan/activity/[id]` already has for FR-008 edits.

**Acceptance and deletion primitives exist** (`setAcceptance` at `day-plan-store.ts:300`,
`deleteDayPlan` at `:367`) but belong to `S-11`/`S-12` and are not touched here.

## Desired End State

A teacher on `/plan/week` types a new hasło and presses **Generuj tydzień** on a week that already
has days in it.

- If at least one day is unaccepted, a confirmation states the two numbers — how many days will be
  replaced, and how many accepted days will be left untouched. Declining changes nothing.
- On confirmation, the days being replaced are outlined and generated; nothing is written until
  every targeted day has a batch in hand. A day that fails can be retried on its own, and the write
  fires once the set is complete.
- The write lands as one transaction. Either all targeted days carry the new hasło, or none do.
- If every day in the week is accepted, the run is refused before a single token is spent, and says
  why.

Verify by generating over a week with a mix of accepted and draft days: the accepted days keep
their hasło, theme and `accepted_at`; the draft days carry the new hasło and a fresh
`current_generation`; and forcing a failure on one day leaves every day on its old batch.

### Key Discoveries:

- Replacement per day needs no new capability — `only_if_absent: false` already does it
  (`src/pages/api/day-plan/generate.ts:128-147`).
- The old batch is never deleted before the new one exists; that ordering is inside the RPC, not in
  the route (`20260830092600_reject_empty_activity_batch.sql`).
- `U0001` (accepted, unconfirmed), `U0002` (already planned) and `U0003` (empty batch) are the
  established refusal codes, mapped in `day-plan-store.ts:104-152`. A week writer should reuse them
  rather than mint new ones.
- Grants do not survive a `drop function`, and Supabase grants `execute` to `anon` directly, so a
  revoke from `PUBLIC` does not reach it (`20260823193447_confirm_replacing_accepted_plan.sql`).
- `firstPrompt()` (`WeekPlanBoard.tsx:405-413`) already prefills the hasło field from the earliest
  planned day, so the teacher is editing an existing hasło, not typing into a blank.

## What We're NOT Doing

- **Replacing accepted days.** That is FR-013 / `S-10`, sequenced after `S-12`, nice-to-have. The
  new writer takes a `p_confirm_replace` flag so `S-10` flips a boolean instead of rewriting it, but
  nothing in this slice ever passes `true`.
- **Week-level unaccept or delete** (FR-015, FR-016 — `S-11`).
- **Edit-clears-acceptance** (FR-017 — `S-12`), and the §Constraints „warunek układu" that binds it.
- **Any generation quota, cooldown or rate limit.** Open Roadmap Question #5 gates on this slice and
  stays open by decision; only the cost copy under the button is corrected.
- **New pgTAP coverage.** Decided this session — see Open Risks in the brief.
- **Undo, history or a recycle bin.** PRD §Non-Goals: this package adds confirmations, not history.
- **Touching the day-level generate route's contract.** It keeps `only_if_absent`/`confirm_replace`
  and keeps always writing.

## Implementation Approach

Four phases, bottom-up, matching the codebase's own ordering (schema → store → API → client).

The atomicity requirement is met in the schema, because that is the only place a transaction
spanning five days can exist. Everything above it is arrangement: the island keeps driving the
outline and per-day generation so per-day progress and per-day retry survive (both required — the
progress indicator is a standing PRD v1 quality requirement, and retry-the-failed-day is what keeps
one transient rate limit from discarding four paid-for generations), then hands the completed set to
one write route.

Outlining is narrowed to the days actually being replaced, which loosens the exactly-five contract
to 1..5 end to end, including the Polish prompt. Because a prompt file changes, `lessons.md`
requires the content-safety gate to re-run before merge; that is a success criterion of Phase 2, not
an afterthought.

## Critical Implementation Details

**Ordering is a correctness condition, not a preference.** No day's old batch may be deleted before
its replacement exists. Per day that is already guaranteed inside the RPC; across the week it means
the write route must be called once, after every targeted day has generated, and never
opportunistically as batches arrive.

**Unwritten batches live only in the island.** Between generation and the write, the teacher's
proposals exist only in browser memory. Closing the tab loses them and no row was touched, which is
the correct outcome but must be said on screen rather than discovered.

**The confirmation is an affordance, not the guard.** Same division as
`DayPlanEditor.generate()` (`:216-226`): the island's `accepted_at` can be stale, so the writer
still refuses an unconfirmed accepted day with `U0001`. The dialog is what makes the refusal rare,
not what makes it safe.

---

## Phase 1: Week batch writer in the schema

### Overview

Give the database a writer that commits N days as one transaction, reusing the refusal vocabulary
the single-day writer already established.

### Changes Required:

#### 1. New migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_save_week_plan_generation.sql`

**Intent**: Add a function that writes a whole week's worth of generation batches atomically, so a
failure on any day leaves every day untouched. It does not replace `save_day_plan_generation`; the
single-day route keeps using it.

**Contract**: `public.save_week_plan_generation(p_prompt text, p_days jsonb, p_confirm_replace boolean default false) returns jsonb`,
`language plpgsql`, `security invoker`, `set search_path = ''`. `p_days` is an array of
`{plan_date, theme, activities}`. Per day it applies the same three refusals in the same order as
the single-day writer — `U0003` empty batch, `U0001` accepted without `p_confirm_replace` — then
performs the same upsert / delete-superseded / insert sequence. No `p_require_absent`: this writer
replaces by design. The exception message must name the offending `plan_date` so the route can say
which day refused. Keep the existing lock order (`day_plans` before `activities`) and take
`for update` on each day's row before its check, for the reason
`20260823193447_confirm_replacing_accepted_plan.sql` records.

Iterating `p_days` in a single `plpgsql` function body is what makes this atomic — there is no
explicit `begin`/`commit` to write, because the function body already is the transaction.

**Contract (grants)**: three statements, not one, for the reason recorded in the prior migrations:

```sql
revoke all on function public.save_week_plan_generation(text, jsonb, boolean) from public;
revoke all on function public.save_week_plan_generation(text, jsonb, boolean) from anon;
grant execute on function public.save_week_plan_generation(text, jsonb, boolean) to authenticated;
```

#### 2. Store wrapper

**File**: `src/lib/services/day-plan-store.ts`

**Intent**: Expose the new function the way `saveGeneration` exposes the single-day one, including
its retry asymmetry — retry once on anything but `conflict`, because the week write happens after
the teacher has already waited and paid for up to five generations.

**Contract**: `export async function saveWeekGeneration(supabase: DayPlanClient, command: GenerateWeekPlanCommand): Promise<void>`.
Error mapping goes through the existing `categorize`/`toStoreError`; `U0001` and `U0003` already
map correctly, so no new codes are introduced. Where the refusal names a `plan_date`, that must
survive into the `StoreError` message so the route and the island can point at the day.

#### 3. Command type

**File**: `src/types.ts`

**Intent**: Name the week write's input next to `GenerateDayPlanCommand`.

**Contract**: `GenerateWeekPlanCommand` — the hasło, a readonly array of
`{ plan_date, theme?, activities }`, and `confirm_replace: boolean`. The per-day member reuses
`ActivityDraft[]` so the week path cannot accept a shape the day path would reject.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly against a reset local database: `npx supabase db reset`
- Existing database suites still pass: `npm run test:db`
- The function is not executable by `anon`: `\df+ public.save_week_plan_generation` in `psql` shows
  `authenticated=X/postgres` and no `anon` or `PUBLIC` entry
- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Calling the function from `psql` with a two-day payload where the second day has an empty
  `activities` array leaves **both** days unchanged — confirm by reading `current_generation` for
  both before and after
- Calling it with one accepted day and `p_confirm_replace => false` refuses with `U0001` and names
  that day's date in the message

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation from the human that the manual testing was successful before proceeding
to the next phase.

---

## Phase 2: Outline over a subset of days

### Overview

Let the outline be asked for 1..5 days instead of exactly five, so a run replacing two days buys two
themes rather than five.

### Changes Required:

#### 1. Request and response schemas

**File**: `src/lib/services/day-plan-contract.ts`

**Intent**: Loosen the exactly-five bound to a bounded range while keeping the upper bound, so a
caller still cannot buy a ten-day outline — the reason the current bound exists, recorded in that
file's own comment.

**Contract**: `weekOutlineRequestSchema.dates` becomes `z.array(z.iso.date()).min(1).max(WEEK_DAYS)`.
The response schema must validate against the *requested* count, which a static schema cannot know,
so it becomes a factory: `weekOutlineSchemaFor(count: number)` returning a schema whose `tematy` has
`.length(count)`, whose `dzien` is bounded `1..count`, and whose uniqueness refine compares against
`count`. `toDayThemes(outline, dates)` keeps its shape — sorting by `dzien` and indexing `dates` by
position stays correct once `dzien` is `1..dates.length`.

#### 2. Model-facing JSON Schema

**File**: `src/lib/services/prompts/week-outline.schema.json` (and its loader in
`src/lib/services/activity-generator.ts`)

**Intent**: The `response_format` schema must carry the requested count, not a hard-coded five.

**Contract**: `tematy.minItems`, `tematy.maxItems` and `dzien.maximum` become the requested count.
Since the file is static JSON, the generator parameterises it at call time rather than the file
carrying a placeholder — parse once, override the three numbers, pass the result as
`response_format`. The `description` strings that say „pięć" must move with the numbers, or the
model is told two different things.

#### 3. Outline prompt

**File**: `src/lib/services/prompts/week-outline.pl.md`

**Intent**: Stop asserting five when the caller may want fewer, without weakening any of the safety
or language instruction around it.

**Contract**: The „**Dokładnie pięć** tematów. Nie cztery, nie sześć." line and the opening „pięć
tematów dziennych" become count-parameterised. The „rytm tygodnia" paragraph (Monday as entry,
Friday as summary) is already framed as „możliwość, nie obowiązek" — it must be reworded so it does
not imply the request always covers Monday through Friday. Everything under §Odbiorca, §Język and
§Hasło nieodpowiednie dla wieku is unchanged: this edit is about count, not about content policy.

#### 4. Outline route

**File**: `src/pages/api/day-plan/week/outline.ts`

**Intent**: Pass the requested count through to the schema factory and the prompt.

**Contract**: Route behaviour, status codes and messages are unchanged; only the count reaches
further down than before.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including new cases for `weekOutlineSchemaFor` at counts 1, 3 and 5 and one
  rejecting a `dzien` above the requested count: `npm run test`
- `toDayThemes` maps a 2-date request onto those 2 dates in calendar order — covered by a new unit
  test in `src/lib/services/day-plan-contract.test.ts`
- The request schema rejects an empty `dates` array and rejects 6 dates: `npm run test`
- Content-safety gate passes after the prompt edit, across every allowed model: `npm run test:gate`
- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- A 2-day outline request returns exactly 2 themes, both in Polish, neither one a restatement of the
  other
- The prompt file read end to end still reads as one coherent instruction — no sentence left
  claiming five while the schema asks for two

**Implementation Note**: The gate run is the reason this phase is separate. Per `lessons.md`
(„Gdy prompt jest jedyną warstwą bezpieczeństwa…"), a prompt edit requires the gate to re-run across
every allowed model before merge — not only the default. Pause for human confirmation before
proceeding.

---

## Phase 3: Generate-without-write and atomic write routes

### Overview

Two new routes under `/api/day-plan/week/`: one that generates a day and hands the batch back
unsaved, one that writes a completed set atomically.

### Changes Required:

#### 1. Deferred-write day generation

**File**: `src/pages/api/day-plan/week/day.ts`

**Intent**: Generate one day's proposals for a week run and return them without touching the
database, so the island can hold the set until it is complete. Kept as its own route rather than a
flag on `/api/day-plan/generate`, so that route's "this route always writes" invariant survives
intact.

**Contract**: `POST`, `export const prerender = false`. Body: `{ plan_date, prompt, theme? }`,
validated with the same bounds as `generateDayPlanRequestSchema` (reuse `singleLineText`, do not
restate the bounds). Response `200`: `{ plan_date, theme, activities }`. Session check in the route,
not middleware, for the reason `day-plan-http.ts` records. Generation failures map through the same
`STATUS_BY_CATEGORY` / `MESSAGE_BY_CATEGORY` tables as `generate.ts`; extract them into
`day-plan-http.ts` rather than writing a third copy — `outline.ts` already holds the second.

This route performs **no** pre-check against existing plans. It writes nothing, so there is nothing
to pre-check for; the accepted-day refusal belongs to the write.

#### 2. Atomic week write

**File**: `src/pages/api/day-plan/week/save.ts`

**Intent**: Take a completed set of batches and commit them as one transaction.

**Contract**: `POST`, `export const prerender = false`. Body:
`{ prompt, days: [{ plan_date, theme?, activities }] }` with `days` bounded `1..WEEK_DAYS` and each
`activities` bounded to `ACTIVITY_COUNT` with the same title/description bounds the single-day path
enforces — the batches came from the client and must be validated as such, exactly as
`/api/day-plan/activity/[id]` validates FR-008 edits. Calls `saveWeekGeneration` with
`confirm_replace: false`. Response `200`: the week read back through `readWeekPlans`, so the island
refreshes from the database rather than from its own optimism. Store failures answer through
`storeFailure`, so a `U0001` surfaces as `409`.

#### 3. Client-side request guards

**File**: `src/lib/day-plan-guards.ts`

**Intent**: Type guards for the two new response bodies, matching the existing `isDayPlanBody` /
`isOutlineBody` pattern.

**Contract**: `isGeneratedDayBody` and whatever the write route's success body needs. No zod in the
client bundle — these stay hand-written predicates, as the existing ones are.

### Success Criteria:

#### Automated Verification:

- New route tests pass, mirroring `src/pages/api/day-plan/generate.test.ts`: unauthenticated → 401,
  malformed body → 400, missing Supabase client → the `unconfigured` answer, generation failure →
  the mapped status per category: `npm run test`
- A write-route test asserts an over-long `activities` array and an over-long title are both
  rejected with 400 before any store call: `npm run test`
- A write-route test asserts a store `conflict` surfaces as 409: `npm run test`
- Exactly one copy of the generation-error tables remains in the tree:
  `grep -rn "MESSAGE_BY_CATEGORY" src --include='*.ts' -l` returns one file
- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- `POST /api/day-plan/week/day` for a date that already has an accepted plan returns proposals and
  leaves the stored plan untouched — confirm the row's `current_generation` and `accepted_at` are
  unchanged
- `POST /api/day-plan/week/save` with two days, one of them accepted, is refused with 409 and writes
  neither

**Implementation Note**: Pause for human confirmation before proceeding.

---

## Phase 4: Week board — confirmation, replacement, all-or-nothing

### Overview

Rewire the island: pick targets by acceptance rather than by emptiness, ask honestly, hold the
batches, write once.

### Changes Required:

#### 1. Target selection

**File**: `src/components/plan/WeekPlanBoard.tsx`

**Intent**: Replace the emptiness test with an acceptance test. A day is a target when it has no
plan **or** has a plan that is not accepted; a day with `accepted_at` is untouched.

**Contract**: The `free` computation at `:138` becomes a partition into `targets` and `untouched`.
The all-planned refusal at `:139-146` becomes a refusal only when `targets.length === 0` — i.e. when
every day is accepted — with a message naming that reason rather than "wszystkie dni mają już plan",
which stops being the operative condition.

#### 2. Confirmation

**File**: `src/components/plan/WeekPlanBoard.tsx`

**Intent**: Before spending anything, state both numbers and let the teacher decline.

**Contract**: `window.confirm`, matching `DayPlanEditor.generate()` and `deletePlan()` — this is the
established affordance in this codebase and the existing Playwright specs already drive it. The text
names what is replaced and what is not, and says the operation cannot be undone, e.g.
„Zastąpię N dni nowymi propozycjami. M zaakceptowanych dni zostanie nietkniętych. Tej operacji nie
można cofnąć." Both numbers are rendered from the partition above; when `M` is zero the second
sentence is omitted rather than printed as "0 zaakceptowanych dni". Declining returns without a
request. Skip the dialog entirely when the week is empty — there is nothing to replace and nothing
to warn about.

#### 3. Hold-and-write orchestration

**File**: `src/components/plan/WeekPlanBoard.tsx`

**Intent**: Generate every target, keep the batches in the island, and write only when the set is
complete. A failed day is retried on its own.

**Contract**: `generateDay` calls `/api/day-plan/week/day` and stores the returned batch in day
state instead of patching in a saved plan. A new `busy` value covers the write step. When every
target holds a batch, `POST /api/day-plan/week/save` fires once; its response replaces the board's
day state wholesale. `retryDay` regenerates one day and, if that completes the set, triggers the
write. Until the write succeeds, days holding unwritten batches must be visibly distinct from saved
days, and the board must say that leaving the page discards them.

The existing `409 → skipped` branch (`:104-117`) is removed: the deferred route returns no 409, and
skipping is no longer an outcome of week generation.

#### 4. Card status vocabulary

**File**: `src/components/plan/WeekDayCard.tsx`

**Intent**: `skipped` no longer means "had any plan"; it means "accepted, deliberately left alone".
A new state is needed for "generated, not yet written".

**Contract**: `DayStatus` loses nothing but gains the pending-write state; the `skipped` badge copy
(`:131`) is rewritten to name acceptance as the reason. Accepted days already render an
`acceptedAt` badge, so the two must not say the same thing twice.

#### 5. Cost copy

**File**: `src/components/plan/WeekPlanBoard.tsx`

**Intent**: The note under the button says "po jednym na każdy pusty dzień", which stops being true.

**Contract**: Rewrite to state one call for the outline plus one per **replaced** day, and drop
"Dni, które już mają plan, zostają nietknięte" in favour of the accepted-days rule. This is the only
answer this slice gives to Open Roadmap Question #5, and it is deliberate.

### Success Criteria:

#### Automated Verification:

- Unit tests cover the target/untouched partition and the confirmation sentence for the cases
  (5 empty), (3 draft + 2 accepted), (5 accepted), (0 planned): `npm run test`
- No `only_if_absent` remains in the week path:
  `grep -n "only_if_absent" src/components/plan/WeekPlanBoard.tsx` returns nothing, while
  `grep -rn "only_if_absent" src/lib/services/day-plan-contract.ts` still returns the schema field
  (the day route keeps it)
- The week board no longer calls the writing generate route:
  `grep -n '"/api/day-plan/generate"' src/components/plan/WeekPlanBoard.tsx` returns nothing
- Type checking passes: `npm run build`
- Linting passes: `npm run lint`
- Existing Playwright specs still pass: `npm run test:e2e`

#### Manual Verification:

- On a week with 3 drafts and 2 accepted days: the dialog states 3 and 2; declining leaves all five
  rows unchanged; confirming leaves the 2 accepted days with their old hasło, theme and accepted
  badge, and gives the 3 drafts the new hasło
- On a week where every day is accepted: pressing the button spends nothing and explains why
- Forcing one day's generation to fail (offline, or an invalid model configured) and then declining
  to retry leaves every day on its old plan after a page reload
- Retrying the failed day completes the set and the write fires once
- Reloading the page mid-run — after some days generated but before the write — shows the original
  week, and the board warned that this would happen

**Implementation Note**: This phase is where the behaviour change becomes visible to the teacher.
Do not close the slice on automated verification alone.

---

## Testing Strategy

Decided this session: **route and unit tests (vitest) only**; no new pgTAP. See Open Risks in the
brief for what that leaves uncovered.

### Unit Tests:

- `weekOutlineSchemaFor` at counts 1, 3, 5; rejection of an out-of-range `dzien`; rejection of
  duplicate `dzien` values at a count below 5
- `toDayThemes` over a 2-date subset, including an out-of-order model response
- `weekOutlineRequestSchema` rejecting 0 and 6 dates
- The target/untouched partition and the confirmation sentence across the four week compositions
- `saveWeekGeneration` error mapping: `U0001` → `conflict` (not retried), `U0003` → `invalid`,
  unknown code → `transient` (retried once)

### Integration Tests:

- `src/pages/api/day-plan/week/day.test.ts` and `save.test.ts`, mirroring the structure of
  `src/pages/api/day-plan/generate.test.ts`: auth, body validation, store-failure mapping, and for
  the write route the client-supplied-batch bounds

### Manual Testing Steps:

1. Seed a week with 3 draft days and 2 accepted days; press **Generuj tydzień** with a new hasło and
   read the dialog — it must state 3 and 2
2. Decline; reload; confirm all five rows are exactly as before
3. Confirm; watch per-day progress; verify the write lands once and the two accepted days are
   untouched
4. Repeat with the network cut after the outline returns — verify no day changed
5. Accept all five days, press the button, verify nothing is spent and the message names acceptance
6. Run against a second account's week to confirm nothing crosses accounts (guardrail #1)

## Performance Considerations

The week costs one outline plus one generation per replaced day, unchanged in shape from today
except that the divisor is "unaccepted days" rather than "empty days" — so the worst case rises from
"however many days were empty" to five. Generations still run concurrently via `Promise.allSettled`,
so wall-clock cost is the slowest day, not the sum. The write adds one round trip after them.

No automatic retry is added on top of the existing in-route retry, for the reason
`WeekPlanBoard.tsx:25-27` records: a second layer of automatic retries over five parallel calls is
how a rate limit becomes a bill.

## Migration Notes

One new function, no schema change: no new tables, columns or constraints, so the column-level grant
trap flagged in PRD §Constraints does not apply here. Existing data needs no rewriting — days keep
their `accepted_at` semantics, which only `S-12` changes.

`save_day_plan_generation` is left in place and still used by `/api/day-plan/generate`. Rolling back
this slice means dropping the new function and reverting the island; no data written under it needs
undoing, because what it writes is shape-identical to what the single-day writer produces.

## References

- Roadmap slice: `context/foundation/roadmap.md` §Slices → `S-09`
- Requirements: `context/foundation/prd-v2.md` — FR-012, FR-014, US-02, Guardrails #2/#3,
  §Warunki jakościowe zmiany
- Prior art for the batch-write contract:
  `supabase/migrations/20260830092600_reject_empty_activity_batch.sql`
- Prior art for confirmation-as-affordance: `src/components/plan/DayPlanEditor.tsx:216-226`
- Prior art for route tests: `src/pages/api/day-plan/generate.test.ts`
- Rules consulted: `context/foundation/lessons.md` (prompt-change gate; grep gates must be able to
  fail)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not
> rename step titles. See `references/progress-format.md`.

### Phase 1: Week batch writer in the schema

#### Automated

- [x] 1.1 Migration applies cleanly against a reset local database: `npx supabase db reset` — 728d76b
- [x] 1.2 Existing database suites still pass: `npm run test:db` — 728d76b
- [x] 1.3 The function is not executable by `anon` — 728d76b
- [x] 1.4 Type checking passes: `npm run build` — 728d76b
- [x] 1.5 Linting passes: `npm run lint` — 728d76b

#### Manual

- [ ] 1.6 Two-day payload with one empty batch leaves both days unchanged
- [ ] 1.7 Accepted day with `p_confirm_replace => false` refuses with `U0001` and names the date

### Phase 2: Outline over a subset of days

#### Automated

- [x] 2.1 `weekOutlineSchemaFor` unit tests at counts 1, 3, 5 pass: `npm run test` — ab7f734
- [x] 2.2 `toDayThemes` maps a 2-date request onto those 2 dates in calendar order — ab7f734
- [x] 2.3 Request schema rejects an empty `dates` array and rejects 6 dates — ab7f734
- [ ] 2.4 Content-safety gate passes across every allowed model: `npm run test:gate` — UCHYLONE decyzją 2026-09-19 (koszt); bramka zawieszona, patrz change.md
- [x] 2.5 Type checking passes: `npm run build` — ab7f734
- [x] 2.6 Linting passes: `npm run lint` — ab7f734

#### Manual

- [ ] 2.7 A 2-day outline request returns exactly 2 distinct Polish themes
- [ ] 2.8 The prompt file reads coherently — no sentence still claiming five

### Phase 3: Generate-without-write and atomic write routes

#### Automated

- [x] 3.1 New route tests pass for auth, malformed body, unconfigured client, generation failures — 50c220e
- [x] 3.2 Write route rejects over-long activity arrays and titles with 400 before any store call — 50c220e
- [x] 3.3 Write route surfaces a store `conflict` as 409 — 50c220e
- [x] 3.4 Exactly one copy of the generation-error tables remains in the tree — 50c220e
- [x] 3.5 Type checking passes: `npm run build` — 50c220e
- [x] 3.6 Linting passes: `npm run lint` — 50c220e

#### Manual

- [ ] 3.7 Deferred day route leaves an accepted day's row untouched
- [ ] 3.8 Write route refuses a set containing an accepted day and writes neither day

### Phase 4: Week board — confirmation, replacement, all-or-nothing

#### Automated

- [x] 4.1 Unit tests cover the partition and confirmation sentence across four week compositions — dc007d5
- [x] 4.2 No `only_if_absent` remains in the week path; the day route's schema field survives — dc007d5
- [x] 4.3 The week board no longer calls the writing generate route — dc007d5
- [x] 4.4 Type checking passes: `npm run build` — dc007d5
- [x] 4.5 Linting passes: `npm run lint` — dc007d5
- [x] 4.6 Existing Playwright specs still pass: `npm run test:e2e` — dc007d5

#### Manual

- [ ] 4.7 Mixed week: dialog states both numbers; declining changes nothing; confirming spares the accepted days
- [ ] 4.8 All-accepted week: nothing is spent and the message names acceptance
- [ ] 4.9 Forced failure without retry leaves every day on its old plan after reload
- [ ] 4.10 Retrying the failed day completes the set and the write fires once
- [ ] 4.11 Reload mid-run shows the original week, and the board had warned this would happen
