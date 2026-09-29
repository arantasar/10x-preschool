# Rozszerzenie zastępowania na dni zaakceptowane — Implementation Plan

## Overview

Since `S-09`, a week regeneration replaces every **unaccepted** day of the week and leaves accepted
days alone, absolutely. A teacher who wants a new hasło over a week they have already signed off has
to withdraw acceptance day by day first — the "five operations one at a time" the roadmap set out to
remove.

This change lets the teacher opt accepted days into the run explicitly. A scope question asks whether
the accepted days go too; a final confirmation then states exactly how many days will be replaced and
how many of them are accepted. The writer replaces an accepted day **only if the teacher named that
date** — a day accepted in another tab after the dialog is refused, not silently wiped.

Roadmap slice `S-10`. PRD refs: FR-013 (the package's only nice-to-have), FR-014 (whose literal
wording — „ile z nich jest zaakceptowanych" — becomes non-zero for the first time), Guardrail #2
(brak cichej utraty zaakceptowanej pracy), §Business Logic Changes rule 1.

## Current State Analysis

**The schema was prepared for this and the route was told to wait.**
`save_week_plan_generation(p_prompt text, p_days jsonb, p_confirm_replace boolean default false)`
refuses any accepted day without the flag (`U0001`, naming the date) and clears `accepted_at` on
every replacement (`supabase/migrations/20260920140000_week_writer_guards_plan_date.sql:103-122`).
The route hard-codes `confirm_replace: false` with a comment saying `S-10` flips it
(`src/pages/api/day-plan/week/save.ts:76-81`).

**A boolean is not the guarantee this slice needs.** One flag for the whole set means "replace any
accepted day that happens to be in the set". The set is chosen in the island, from a copy of
`accepted_at` that can be stale for the 10–30 s a week run takes. A draft target accepted in another
tab during that window would be replaced with the flag set, although no dialog ever counted it.
That is Guardrail #2's "silent loss of accepted work" on a narrow path — and this is the slice where
the confirmation is the only barrier (no undo anywhere: `S-02`, `S-05`, PRD §Non-Goals).

**The island rebuilds a run's target set from acceptance, in three places.** `retryDay`
(`src/components/plan/WeekPlanBoard.tsx:482-485`), `retryWrite` (`:511-514`) and `heldSetIsComplete`
(`:104-106`) all derive "the days this run targets" as "the days that are not accepted". That is
true in `S-09` by construction and false the moment an accepted day can be a target:

- `heldSetIsComplete` counts an accepted day as satisfied whether or not it holds a batch, so a run
  that included an accepted day and failed to generate it would offer **„Zapisz tydzień"** for a
  partial week — the one outcome `S-09` exists to make impossible.
- `retryDay` / `retryWrite` would drop the consented accepted days from the write, committing a
  narrower week than the one the teacher confirmed.

**The confirmation copy and the partition live in a React-free module.**
`src/lib/week-generation.ts` holds `partitionWeek`, `replacementConfirmation` (with spelled-out Polish
agreement) and `ALL_ACCEPTED_MESSAGE`, tested in `src/lib/week-generation.test.ts`. The all-accepted
refusal (`WeekPlanBoard.tsx:362-366`) is exactly the case FR-013 exists for.

**The day-naming 409 already exists.** `weekConflictMessage` (`src/lib/services/day-plan-store.ts`)
parses the refused `plan_date` out of the `U0001` message and gives the teacher a dated sentence. Its
advice — „Cofnij jego akceptację albo wygeneruj tydzień bez niego" — was written for `S-09`, where an
accepted day in the set could only mean stale state, and needs rewording now that the refusal means
"accepted after you confirmed".

**No pgTAP suite covers the week writer.** `supabase/tests/database/day_plan_write.test.sql` tests
the single-day writer only; `S-09` decided against new pgTAP. This slice's guarantee lives in the
schema and is the last barrier before bulk deletion, so it is tested there.

**Nothing on the single-day path changes.** `DayPlanEditor` and `/api/day-plan/generate` keep
`confirm_replace` and `save_day_plan_generation(…, p_confirm_replace boolean, …)`.

## Desired End State

A teacher on `/plan/week` presses **Generuj tydzień** with a hasło:

- **Empty week** — no dialog, as today.
- **Only drafts (no accepted days)** — one dialog, as today: „Zastąpię N dni nowymi propozycjami.
  Tej operacji nie można cofnąć."
- **Mixed week (N drafts, M accepted)** — dialog 1 (scope): M accepted days exist; OK = replace them
  too, Anuluj = only the drafts. Dialog 2 (go / stop) states the count for the chosen scope: either
  „Zastąpię N+M dni nowymi propozycjami, w tym M zaakceptowane — ich akceptacja zostanie cofnięta."
  or today's „Zastąpię N dni… M zaakceptowane dni zostaną nietknięte." Anuluj in dialog 2 always
  stops with nothing spent.
- **All five accepted** — no refusal any more. One dialog (go / stop) states that all five are
  accepted and will lose their acceptance; Anuluj stops.

On confirmation the run proceeds exactly as in `S-09` (outline for targets, per-day generation, held
batches, one atomic write), with the consented accepted dates travelling to the writer. After the
write, every replaced day — including formerly accepted ones — is a draft with the new hasło.

If a day that was a draft at dialog time is accepted elsewhere before the write, the write is refused
as a whole, nothing changes, and the alert names that day and tells the teacher to refresh.

Verify: on a week with 3 drafts and 2 accepted, choosing "replace them too" leaves all 5 as drafts
under the new hasło; choosing "only drafts" leaves the 2 accepted days byte-identical; accepting a
draft in a second tab mid-run makes the write refuse and changes no day.

### Key Discoveries:

- `accepted_at = null` on replacement is already in the writer's upsert — consent needs only a
  different refusal condition, not a different write (`20260920140000_…sql:113-122`).
- Changing a parameter's type needs `drop function` + `create`, and grants do not survive a drop;
  Supabase grants `execute` to `anon` directly, so the revoke must name `anon` as well as `public`
  (`20260823193447_confirm_replacing_accepted_plan.sql`).
- `weekConflictMessage` already turns a `U0001` into a dated sentence; only its advice changes.
- `window.confirm` is the dialog primitive everywhere in this codebase (`DayPlanEditor.tsx:286,338,476`,
  `WeekPlanBoard.tsx:373,681`); `src/components/ui/` has no Dialog or Checkbox.
- E2E does not drive OpenRouter (`tests/e2e/E2E-RULES.md:49`), so the generating half of the flow is
  verified by hand.

## What We're NOT Doing

- **A new UI primitive.** No custom dialog, no checkbox; two sequential `window.confirm`s.
- **Re-asking on a stale accept.** A day accepted after the dialog makes the write refuse; the
  teacher refreshes and runs again. No structured "which day" response, no third dialog, no
  drop-that-day-and-write-the-rest.
- **Touching the single-day path** (`/api/day-plan/generate`, `save_day_plan_generation`,
  `DayPlanEditor`).
- **Any generation quota or rate limit** (Open Roadmap Question #5 stays open; the worst case per
  click stays five days, as in `S-09`).
- **Prompt changes.** None expected; if one becomes necessary, `lessons.md` §3 applies and the plan
  must be revised, not quietly extended.
- **New Playwright specs.** Decided this session: the destructive invariant is tested in pgTAP where it
  lives; the dialog sequence is verified manually.
- **Undo, history or a recycle bin** (PRD §Non-Goals).
- **Editing `roadmap.md` / `prd-v2.md`** beyond what the archive ritual does to the slice's status.

## Implementation Approach

Three phases, bottom-up (schema → route → island), matching `S-09`.

The guarantee moves from "a boolean the caller sets" to "a list of dates the teacher saw". The
writer checks membership per day inside the same `for update` it already takes, so the check and the
row it guards cannot drift. The boolean is **removed**, not kept alongside: a leftover "replace every
accepted day" switch next to the consent list would be exactly the bypass the list exists to close.

In the island, a run stops being something re-derived from acceptance and becomes an explicit value
— which days it targets, which accepted dates the teacher consented to, and under which hasło —
held from the moment the teacher confirms until the write lands or is abandoned.

## Critical Implementation Details

**Run scope must be state, not a ref, and must not be re-derived.** `heldSetIsComplete` is computed
at render and decides whether „Zapisz tydzień" appears; it has to re-render when the run changes.
Every place that today writes `weekAcceptance(…).filter((day) => !day.accepted)` must read the run
instead. A day's `accepted_at` *during* a run is not evidence of whether it is a target: a consented
accepted day stays accepted until the write lands.

**Dialog 1's Anuluj narrows; it does not cancel.** That is a non-standard meaning for a native Cancel
button, so dialog 1's text must name both outcomes in words (what OK does, what Anuluj does), and
dialog 2 must always follow it with a plain go / stop. Never let a run start from dialog 1 alone.

**Consent is captured at dialog time and sent verbatim.** The consented dates are the accepted
dates the teacher was shown, not "whatever is accepted when the write fires". The retry paths must
reuse the same list.

---

## Phase 1: Per-date consent in the week writer

### Overview

Replace the week writer's boolean with a list of consented dates, so an accepted day is replaced
only when the teacher named it.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/20260928<HHmmss>_week_writer_consent_dates.sql`

**Intent**: Swap `p_confirm_replace boolean` for `p_confirm_dates date[]` on
`save_week_plan_generation`, keeping every other behaviour of the `20260920140000` version (the
`plan_date` shape check, the empty-batch refusal, the theme coalescing, `accepted_at = null`, the
lock order).

**Contract**: `drop function public.save_week_plan_generation(text, jsonb, boolean);` then
`create function public.save_week_plan_generation(p_prompt text, p_days jsonb, p_confirm_dates date[] default '{}') returns jsonb`,
`language plpgsql`, `security invoker`, `set search_path = ''`. The refusal becomes: accepted **and**
`v_plan_date` not in `coalesce(p_confirm_dates, '{}')` → `U0001`, same message shape (the date must
stay in the message — `weekConflictMessage` parses it). A consented date that turns out not to be
accepted is harmless: the day is replaced as a draft. The grant triple is re-issued:

```sql
revoke all on function public.save_week_plan_generation(text, jsonb, date[]) from public;
revoke all on function public.save_week_plan_generation(text, jsonb, date[]) from anon;
grant execute on function public.save_week_plan_generation(text, jsonb, date[]) to authenticated;
```

The header comment records why the boolean was removed rather than kept (the stale-accept path), and
the rollback: drop this signature, recreate the `20260920140000` body and re-issue its grant triple
for `(text, jsonb, boolean)`. `comment on function` is updated to say "unless its date is in
p_confirm_dates".

#### 2. Generated types

**File**: `src/db/database.types.ts`

**Intent**: Regenerate so the RPC args carry `p_confirm_dates?: string[]` and no `p_confirm_replace`
for this function.

**Contract**: `npx supabase gen types typescript --local > src/db/database.types.ts`; the
`save_day_plan_generation` entry keeps its `p_confirm_replace`.

#### 3. Command type and store wrapper

**Files**: `src/types.ts`, `src/lib/services/day-plan-store.ts`

**Intent**: The week command names the consented dates instead of a boolean, and the wrapper passes
them through.

**Contract**: `GenerateWeekPlanCommand.confirm_replace: boolean` → `confirm_dates: readonly string[]`
(doc comment: the accepted dates the teacher saw and agreed to lose). `callSaveWeekGeneration` sends
`p_confirm_dates: command.confirm_dates`. `weekConflictMessage`'s advice is reworded for the
now-meaningful case — the day was accepted after the teacher confirmed — e.g.
„{data} — ten dzień został zaakceptowany w międzyczasie, więc nic nie zostało zapisane. Odśwież
stronę i wygeneruj tydzień ponownie." Retry asymmetry (`conflict` not retried) is unchanged.

#### 4. pgTAP suite for the week writer

**File**: `supabase/tests/database/week_plan_write.test.sql` (new)

**Intent**: Test the consent guarantee at the layer that enforces it. Mirror the auth setup and
fixture style of `day_plan_write.test.sql`.

**Contract**: At minimum:
- exactly one `save_week_plan_generation` overload exists, with identity arguments
  `p_prompt text, p_days jsonb, p_confirm_dates date[]`;
- `anon` has no execute on it; `authenticated` has;
- a set of {draft, accepted-consented} replaces both: both carry the new prompt, bumped
  `current_generation`, `accepted_at is null`, new activities only;
- a set of {draft, accepted-**not**-consented}, with the draft first in `p_days`, throws `U0001`
  whose message contains the accepted day's date, and **both** days keep their prior
  `current_generation`, `accepted_at` and activities (the draft written earlier in the loop is
  rolled back);
- a consented date that is a draft (not accepted) is replaced without error;
- `p_confirm_dates` omitted behaves as empty (accepted day refused).

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly against a reset local database: `npx supabase db reset`
- Database suites pass, including the new week writer suite: `npm run test:db`
- Exactly one overload remains and it takes the date array:
  `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -tAc "select pg_get_function_identity_arguments(oid) from pg_proc where proname = 'save_week_plan_generation'"`
  prints exactly one line, `p_prompt text, p_days jsonb, p_confirm_dates date[]` (a leftover boolean
  overload prints two lines — this criterion fails on the broken state)
- The week wrapper sends the list, not the flag:
  `grep -n "p_confirm_dates: command.confirm_dates" src/lib/services/day-plan-store.ts` returns one line
- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- From `psql`, as an authenticated user: a two-day payload {draft, accepted} with
  `p_confirm_dates => '{}'` refuses with `U0001` naming the accepted date and leaves both days'
  `current_generation` unchanged; the same payload with the accepted date in the list replaces both
  and leaves `accepted_at` null on both

**Implementation Note**: After completing this phase and all automated verification passes, pause
here for manual confirmation from the human that the manual testing was successful before proceeding
to the next phase.

---

## Phase 2: Write route carries consent

### Overview

Let `/api/day-plan/week/save` accept the consented dates from the island and pass them to the
writer, validated against the set being written.

### Changes Required:

#### 1. Request schema

**File**: `src/lib/services/day-plan-contract.ts`

**Intent**: Add the consent list to `saveWeekPlanRequestSchema`, bounded and tied to the days
actually being written.

**Contract**: `confirm_dates: z.array(z.iso.date()).max(WEEK_DAYS).default([])`, unique, and every
entry must be one of `days[].plan_date` (object-level refine). Defaulting to `[]` means an older
client, or a request that omits the field, gets the refusal rather than the deletion — the same
reasoning `generateDayPlanRequestSchema.confirm_replace` records.

#### 2. Route

**File**: `src/pages/api/day-plan/week/save.ts`

**Intent**: Pass `parsed.data.confirm_dates` to `saveWeekGeneration`; rewrite the file's header
paragraph and inline comment that say `confirm_replace` is hard-coded `false` "until S-10" — they
now describe consent by date and why a boolean was not enough.

**Contract**: Status codes unchanged: `400` for a malformed body (including a consented date outside
the set), `409` with the dated message for an unconsented accepted day, `200` with the read-back week.

#### 3. Route tests

**File**: `src/pages/api/day-plan/week/save.test.ts`

**Intent**: Replace the `confirm_replace false` assertion with consent-list cases.

**Contract**: The writer is called once with `p_confirm_dates` equal to the request's list; an
omitted `confirm_dates` reaches the writer as `[]`; a consented date not among `days` → `400` before
any store call; duplicate consented dates → `400`; a `U0001` naming a date still surfaces as `409`
with that date formatted in the body.

### Success Criteria:

#### Automated Verification:

- Route tests pass, including the new consent cases: `npm run test`
- The route no longer hard-codes the flag:
  `grep -n "confirm_replace: false" src/pages/api/day-plan/week/save.ts` returns nothing (it returns
  line 80 today, so this criterion fails on the unchanged state)
- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- `POST /api/day-plan/week/save` from the browser console with two days, one accepted, and that
  accepted date in `confirm_dates`, returns `200` and both days come back as drafts with the new hasło;
  the same request without `confirm_dates` returns `409` naming the accepted day and changes neither

**Implementation Note**: Pause for human confirmation before proceeding.

---

## Phase 3: Board — scope question, honest count, run-scoped targets

### Overview

Ask the teacher whether accepted days go too, state the final count honestly, and make the board
remember each run's scope so retries and „Zapisz tydzień" write exactly what was confirmed.

### Changes Required:

#### 1. Partition, questions and copy

**File**: `src/lib/week-generation.ts`

**Intent**: Extend the React-free module with the scope decision and the new sentences, so every
string and every branch stays unit-testable.

**Contract**:
- `partitionWeek(days, includeAccepted: boolean)` → `{ targets, untouched, consented }`, where
  `consented` is the accepted dates among `targets` (empty when `includeAccepted` is false).
  `targets` stays in calendar order.
- `scopeQuestion(acceptedCount)` → the dialog-1 text for a **mixed** week, naming both outcomes in
  words (OK → also the accepted days, their acceptance will be withdrawn; Anuluj → only the drafts).
  Polish agreement spelled out as the existing helpers do: „1 dzień jest zaakceptowany" /
  „2–4 dni są zaakceptowane".
- `replacementConfirmation(partition, weekIsEmpty)` gains the consented case: when
  `consented.length > 0` it says „Zastąpię {X} nowymi propozycjami, w tym {Y} — ich akceptacja
  zostanie cofnięta. Tej operacji nie można cofnąć." with `Y` agreed as „1 zaakceptowany" /
  „2 zaakceptowane" / „5 zaakceptowanych". An all-accepted week (targets = consented = 5) reads
  naturally in the same sentence or gets its own wording ("Wszystkie 5 dni jest zaakceptowanych…") —
  implementer's choice, tested either way. The drafts-only sentences are unchanged.
- `ALL_ACCEPTED_MESSAGE` is removed: an all-accepted week is no longer refused.

#### 2. Dialog flow

**File**: `src/components/plan/WeekPlanBoard.tsx` (`generateWeek`)

**Intent**: Replace the refusal-and-single-confirm with the scope-then-count sequence.

**Contract**:
- Empty week → no dialog (unchanged).
- No accepted days → today's single confirm.
- Mixed week → `window.confirm(scopeQuestion(M))` decides `includeAccepted`; then
  `window.confirm(replacementConfirmation(…))`; Anuluj on the second returns with no request.
- All accepted → skip the scope question (there is no "drafts only" to offer), `includeAccepted = true`,
  one `window.confirm(replacementConfirmation(…))`; Anuluj returns with no request.
- `untouched` days are marked `skipped` only when the run actually leaves them (drafts-only scope),
  as today.

#### 3. Run-scoped state

**File**: `src/components/plan/WeekPlanBoard.tsx`

**Intent**: Hold one run's scope from confirmation until the write lands, and have every path that
continues the run read it.

**Contract**: A `useState<WeekRun | null>` with `{ targets, consented, keyword }`, set when the
teacher confirms and cleared when the write succeeds. `retryDay` and `retryWrite` take `targets` and
`keyword` from it and pass `consented` through; `heldSetIsComplete` becomes "a run exists and every
one of its targets holds a batch". `writeWeek` / `writeWeekOnce` take the consented dates and send
them as `confirm_dates`. No remaining code derives targets as "not accepted".

The retry paths today capture `prompt` from the input at retry time; from this slice they use the
run's `keyword`, so editing the field between a failure and a retry cannot write a week under a hasło
the teacher never generated with.

#### 4. Cost copy and badge

**Files**: `src/components/plan/WeekPlanBoard.tsx`, `src/components/plan/WeekDayCard.tsx`

**Intent**: Stop saying accepted days are always untouched.

**Contract**: The note under the button drops „Zaakceptowane dni zostają nietknięte." in favour of a
sentence that accepted days are replaced only if the teacher agrees in the dialog. The file-level doc
comments in both files that say accepted days are out of reach "until `S-10`" are updated. The
`skipped` / „Nietknięty" badge meaning is unchanged (it is still set only on accepted days a
drafts-only run left alone); a consented accepted day shows the existing held / saving badge, which
already outranks the acceptance badge.

#### 5. Unit tests

**File**: `src/lib/week-generation.test.ts`

**Intent**: Cover the new branches and remove the `ALL_ACCEPTED_MESSAGE` block.

**Contract**: `partitionWeek` for (3 drafts + 2 accepted) × include true / false, (5 accepted) ×
include true, (5 empty); `consented` is empty whenever include is false. `scopeQuestion` for 1 and 2–4
accepted days (agreement and both outcomes named). `replacementConfirmation` for mixed-include (states
total and the accepted count with „akceptacja zostanie cofnięta"), mixed-exclude (unchanged
sentence), all-accepted (5 and 5), and every non-null variant still says „nie można cofnąć".

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the new partition, scope and confirmation cases: `npm run test`
- No path in the board re-derives targets from acceptance:
  `grep -n "filter((day) => !day.accepted)" src/components/plan/WeekPlanBoard.tsx` returns nothing (it
  returns two lines today — `retryDay` and `retryWrite` — so the criterion fails on the unchanged state)
- The board sends consent to the writer:
  `grep -n "confirm_dates" src/components/plan/WeekPlanBoard.tsx` returns the `JSON.stringify` body of
  the `/api/day-plan/week/save` request
- The all-accepted refusal is gone: `grep -rn "ALL_ACCEPTED_MESSAGE" src` returns nothing
- Type checking passes: `npm run build`
- Linting passes: `npm run lint`
- Existing Playwright specs still pass: `npm run test:e2e`

#### Manual Verification:

- Mixed week (3 drafts, 2 accepted), dialog 1 → OK, dialog 2 states 5 days „w tym 2 zaakceptowane"
  and the withdrawal of acceptance; after the run all 5 days are drafts with the new hasło
- Same week, dialog 1 → Anuluj: dialog 2 states 3 replaced and 2 untouched; after the run the 2
  accepted days keep hasło, theme and accepted badge
- Same week, dialog 2 → Anuluj (either scope): nothing is requested, nothing changes
- All-accepted week: one dialog, stating that all 5 are accepted and will lose acceptance; OK
  replaces all 5; Anuluj spends nothing
- Mixed week with "replace them too", one consented accepted day's generation forced to fail: no
  „Zapisz tydzień" appears until it is retried; retrying it completes the set and the write includes it
- Drafts-only scope; while generating, accept one of the draft targets in a second tab: the write is
  refused, the alert names that day and says to refresh, and after reload every day is as it was
- A second account's week is not affected by any of the above (Guardrail #1)

**Implementation Note**: This phase is where the behaviour change becomes visible to the teacher.
Do not close the slice on automated verification alone.

---

## Testing Strategy

Decided this session: **pgTAP + unit + route**, no new Playwright spec.

### Unit Tests:

- `partitionWeek` with and without accepted days in scope; `consented` never non-empty when excluded
- `scopeQuestion` agreement and that both outcomes are named
- `replacementConfirmation` across drafts-only, mixed-exclude, mixed-include, all-accepted

### Integration Tests:

- `week_plan_write.test.sql` (pgTAP): single overload, grants, consented replace, unconsented refusal
  rolls back the whole set, consented draft harmless, omitted list = empty
- `save.test.ts`: consent list passed verbatim, default `[]`, out-of-set and duplicate dates → 400,
  dated 409 preserved

### Manual Testing Steps:

1. Seed a week with 3 drafts and 2 accepted; run with "replace them too" and read both dialogs
2. Repeat with "only drafts" and confirm the accepted days are untouched
3. Decline dialog 2 in both scopes; reload; nothing changed
4. Accept all five; run; one dialog; confirm all five replaced
5. Force one consented accepted day to fail; verify no partial save is offered; retry completes it
6. Accept a draft target in a second tab mid-run; verify refusal naming the day and an unchanged week
7. Check a second account's week is untouched

## Performance Considerations

Unchanged in shape from `S-09`: one outline plus one generation per replaced day, concurrently, then
one write. The worst case per click stays five days; what changes is that a fully accepted week can
now reach it. The consent check adds an array membership test per day inside a transaction that
already takes a row lock per day.

## Migration Notes

The migration drops and recreates one function; no tables, columns or data change, so the
column-grant trap in PRD §Constraints does not apply. Deploy order matters only briefly: once the
migration lands, the previous route build (sending `p_confirm_replace`) would call a signature that
no longer exists and get a PostgREST error on week writes until the new worker is live. Ship the
migration and the code in the same merge. Rollback: drop the `date[]` signature, recreate the
`20260920140000` body with its `(text, jsonb, boolean)` grant triple, and revert the code.

## References

- Roadmap slice: `context/foundation/roadmap.md` §Slices → `S-10`
- Requirements: `context/foundation/prd-v2.md` — FR-013, FR-014, Guardrail #2, §Business Logic Changes rule 1
- Predecessor plan: `context/archive/2026-09-19-week-regeneration-replace/plan.md`
- Writer being changed: `supabase/migrations/20260920140000_week_writer_guards_plan_date.sql`
- Grant-triple precedent: `supabase/migrations/20260823193447_confirm_replacing_accepted_plan.sql`
- Board: `src/components/plan/WeekPlanBoard.tsx:104-106, 356-378, 466-523`
- Rules consulted: `context/foundation/lessons.md` (grep gates anchored on constructs and able to fail;
  prompt-change gate — not triggered)

## Addendum — implementation review fixes (2026-09-29)

The implementation review (`reviews/impl-review.md`) changed the consent shape after the three phases
landed. The phase text above is kept as it was planned; where it and the code disagree, this section
wins.

- **Consent names the acceptance, not only the date (F2, F1).** A date list let a day withdrawn,
  edited and accepted again in another tab be replaced on the strength of consent to its *earlier*
  acceptance, and `= any` over a `date[]` holding a `null` let every accepted day through.
  `supabase/migrations/20260929120000_week_writer_consent_versions.sql` replaces
  `p_confirm_dates date[]` with `p_confirm_accepted jsonb` — `[{plan_date, accepted_at}]` — and the
  writer refuses an accepted day unless an entry names both its date and its current `accepted_at`
  (an `exists`, so null and partial entries match nothing). A new migration rather than an edit of
  `20260928120000`, because whether that one already reached the remote database was not verified.
  Downstream: `GenerateWeekPlanCommand.confirm_accepted: readonly AcceptedDayConsent[]`, request
  field `confirm_accepted`, `WeekDayAcceptance.acceptedAt: string | null`, `WeekPartition.consented`
  carries `{plan_date, accepted_at}`. pgTAP gained re-acceptance, `[null]`, mixed null/partial and
  explicit-null cases (19 assertions).
- **An untouched day drops a previous run's batch (F3)**, so a drafts-only run after a run that
  included it can no longer leave a held batch on a „Nietknięty” card that locks the board.
- **A 409 ends the run (F4).** The held batches are dropped and each day goes back to its saved plan,
  matching the alert's „Odśwież stronę”; network failures still keep the batches for „Zapisz tydzień”.
- **Gates restated for the new names (F5).** 1.3 prints `p_prompt text, p_days jsonb,
  p_confirm_accepted jsonb`, and runs as
  `docker exec supabase_db_10x-astro-starter psql -U postgres -tAc "…"` where host `psql` is absent.
  1.4 becomes `grep -n "p_confirm_accepted: command.confirm_accepted" src/lib/services/day-plan-store.ts`;
  3.3 becomes `grep -n "confirm_accepted: consented" src/components/plan/WeekPlanBoard.tsx` — both
  return one line now and nothing on `3aa00a9`. 3.7 must run against a freshly started dev server:
  `reuseExistingServer` picks up whatever is listening on `:4321`, and a long-running one failed the
  four print specs that pass on a fresh server for both this branch and `master`.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not
> rename step titles. See `references/progress-format.md`.

### Phase 1: Per-date consent in the week writer

#### Automated

- [x] 1.1 Migration applies cleanly against a reset local database: `npx supabase db reset` — 0bea710
- [x] 1.2 Database suites pass, including the new week writer suite: `npm run test:db` — 0bea710
- [x] 1.3 Exactly one overload remains and it takes the date array — 0bea710
- [x] 1.4 The week wrapper sends the list, not the flag — 0bea710
- [x] 1.5 Type checking passes: `npm run build` — 0bea710
- [x] 1.6 Linting passes: `npm run lint` — 0bea710

#### Manual

- [x] 1.7 From psql: unconsented accepted day refuses and changes nothing; consented one replaces both and clears acceptance

### Phase 2: Write route carries consent

#### Automated

- [x] 2.1 Route tests pass, including the new consent cases: `npm run test` — 9aaf177
- [x] 2.2 The route no longer hard-codes the flag — 9aaf177
- [x] 2.3 Type checking passes: `npm run build` — 9aaf177
- [x] 2.4 Linting passes: `npm run lint` — 9aaf177

#### Manual

- [x] 2.5 Browser-console POST with consent replaces both days; without consent returns 409 naming the day and changes neither

### Phase 3: Board — scope question, honest count, run-scoped targets

#### Automated

- [x] 3.1 Unit tests pass, including the new partition, scope and confirmation cases: `npm run test` — 3aa00a9
- [x] 3.2 No path in the board re-derives targets from acceptance — 3aa00a9
- [x] 3.3 The board sends consent to the writer — 3aa00a9
- [x] 3.4 The all-accepted refusal is gone — 3aa00a9
- [x] 3.5 Type checking passes: `npm run build` — 3aa00a9
- [x] 3.6 Linting passes: `npm run lint` — 3aa00a9
- [x] 3.7 Existing Playwright specs still pass: `npm run test:e2e` — 3aa00a9

#### Manual

- [x] 3.8 Mixed week, "replace them too": dialog 2 states total and accepted count; all 5 become drafts
- [x] 3.9 Mixed week, "only drafts": accepted days keep hasło, theme and badge
- [x] 3.10 Declining dialog 2 in either scope requests and changes nothing
- [x] 3.11 All-accepted week: one dialog; OK replaces all 5; Anuluj spends nothing
- [x] 3.12 Failed consented day blocks „Zapisz tydzień" until retried; retry writes it
- [x] 3.13 Draft accepted in another tab mid-run: write refused, day named, week unchanged after reload
- [x] 3.14 A second account's week is unaffected
