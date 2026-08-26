<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-03 `week-generation` — plan implementacji

- **Plan**: `context/changes/week-generation/plan.md`
- **Scope**: Phases 1–6 of 6 (full plan)
- **Date**: 2026-08-26
- **Verdict**: APPROVED (was NEEDS ATTENTION; all 9 findings fixed and verified 2026-08-26)
- **Findings**: 0 critical, 6 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Automated verification (re-run at review time)

| Check | Result |
|-------|--------|
| `npm run lint` | PASS — 0 errors |
| `npx astro check` | PASS — 0 errors, 0 warnings, 4 hints (all pre-existing, in `eslint.config.js`) |
| `npm run build` | PASS |
| Build without `SUPABASE_URL`/`SUPABASE_KEY` (CI parity) | PASS |
| `npm run test:db` | PASS — 63 tests, 2 files |
| `npx supabase gen types typescript --local` vs repo | PASS — byte-identical |
| Model-output shape (`jq`: 5 unique `dzien`; 3 `aktywnosci`) | PASS — all runs |

Not re-runnable at review time: criterion 1.3 (each new pgTAP assertion reddens under a mutation
removing its guard) — a one-off procedure. See F4 for a guard it does not cover.

## Findings

### F1 — `/plan?date=` behaviour did change, and the changed configuration was never gated

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/day-plan/generate.ts:151-154
- **Detail**: The plan states the contract twice — Phase 2 §3: "a jego brak daje dokładnie dzisiejsze `content: keyword`", and the Phase 2 overview: "Bez tematu prompt dnia zachowuje się dokładnie jak dziś, więc `/plan?date=` nie zmienia działania". The generator honours it (`buildDayUserMessage` returns the bare hasło with no context, activity-generator.ts:289-292), but the route never omits the context — it unconditionally passes `{ planDate, theme }`. Every single-day generation, including `DayPlanEditor`'s, now sends `Hasło: …\nDzień tygodnia: …` instead of the bare hasło. Nothing in `src/` calls `generateDayActivities` with one argument any more; the no-context branch is reachable only from `scripts/compare-models.sh`.

  The change looks deliberate — generate.ts:144-149 argues for it explicitly (S-01 review finding F4) — but three things now contradict it: the plan, and two doc comments that still claim the old behaviour (activity-generator.ts:157-161 "`/plan?date=` keeps behaving exactly as it did, and the quality gate has an unchanged baseline"; the `compare-models.sh` header's "Byte-identical to the S-01 request").

  The gate consequence is the substantive half. `scripts/compare-models.sh:97` runs three modes: `outline`, `day` (bare hasło) and `day-themed` (weekday **and** theme). Production's single-day route sends weekday **without** theme — a configuration no mode covers. `lessons.md` #3 requires the gate to cover every configuration the prompt can be run in, and this slice changed both prompts. The run itself gives a reason not to wave this through: DeepSeek failed 5/5 calls in the no-theme mode (4× timeout, 1× `truncated_budget`) while passing 10/10 with a theme — the no-theme path is the one that behaves differently.
- **Fix A ⭐ Recommended**: Add a `day-weekday` mode (weekday, no theme) to `compare-models.sh`, re-run it for the three models, record the result in `model-comparison.md`, and correct the two stale doc comments plus the plan's Phase 2 contract to say the single-day route now supplies the weekday.
  - Strength: Keeps the behaviour the code argues for (it closes S-01's F4 for `/plan?date=` too) while restoring the `lessons.md` #3 invariant that every reachable prompt configuration has been through the gate. The script already has the mode machinery — this is a fourth entry in `MODES`, not new plumbing.
  - Tradeoff: One more paid gate run (15 calls, ~$0.005 at the chosen model) and a plan edit after the fact.
  - Confidence: HIGH — the mode switch, the `day_user_message` helper and the summary/`jq` validation all already accept exactly these parameters.
  - Blind spot: Does not settle whether the plan or the code held the better position on the contract; it just makes the code's position the documented and gated one.
- **Fix B**: Restore the plan's contract — make `generate.ts` pass context only when `theme` or `only_if_absent` is present, so `/plan?date=` sends the bare hasło again.
  - Strength: No new gate run needed; the already-gated `day` mode is once again the production configuration, and the doc comments become true as written.
  - Tradeoff: Gives up a deliberate improvement — a Wednesday regenerated from `/plan?date=` loses the weekday cue and drifts back toward S-01's F4. The generate.ts comment would have to be reversed.
  - Confidence: MEDIUM — mechanically trivial, but it overrides a reasoned in-code decision that the implementer made knowingly.
  - Blind spot: Whether the manual check 2.4 ("wynik nieodróżnialny od dzisiejszego") was actually performed against the route or only against the generator function.
- **Decision**: FIXED via Fix A ⭐ — `day-weekday` mode added to `compare-models.sh`, gate re-run 2026-08-26 across 3 models × 5 keywords (14/15; the one failure is DeepSeek's known no-theme timeout). No content violations for either admitted model; `DEFAULT_MODEL` unchanged. Recorded in `model-comparison.md` § „Ponowny przebieg 2026-08-26"; stale doc comment in `activity-generator.ts` corrected; plan § Addendum 2026-08-26 supersedes the Phase 2 contract statement.

### F2 — Outline fetch has no `catch`; a transport failure fails silently

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/WeekPlanBoard.tsx:168-206
- **Detail**: The outline IIFE is `try`/`finally` with no `catch`. `await fetch("/api/day-plan/week/outline", …)` at :174 rejects outright on any transport failure (offline, DNS, dropped connection); `response.json()` is guarded by `.catch(() => null)` at :179, but the `fetch` is not. On rejection `finally` still runs (`weekInFlight.current = false`, `setBusy("idle")`), so the button returns to "Generuj tydzień" — but `setFailure` is never called and the rejection escapes the `void`-ed promise as an unhandled rejection. The teacher's only signal is that nothing happened. This is the one mutation path in the file without the handler its siblings have: `generateDay` catches at :115, `acceptWeek` catches at :262, and `DayPlanEditor.mutate` catches too.
- **Fix**: Add a `catch` before the `finally` at :203, matching the sibling wording — `setFailure({ message: "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.", signInRequired: false })`.
- **Decision**: FIXED — `catch` added before the `finally`, wording matched to `generateDay`/`acceptWeek`.

### F3 — Days marked "pominięty" before the outline runs are never rolled back

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/WeekPlanBoard.tsx:157-166
- **Detail**: Days that already have a plan are flipped to `status: "skipped"` before anything is asked of the model, and the marking is never undone. If the outline then fails — the `return` at :181-188, or F2's rejection — those cards read "Pominięty — ten dzień ma już plan", asserting that a week generation ran and deliberately left them alone, when nothing was generated at all. Compounds F2: after a silent outline failure the screen actively reports a successful skip.
- **Fix**: Move the optimistic marking to just before the `Promise.allSettled` at :202, so it only claims a skip once the week generation is genuinely under way.
- **Decision**: FIXED — the optimistic `skipped` marking moved into the post-outline `setDays`, so it is applied only once generation is genuinely under way.

### F4 — The refusal order the migration calls "deliberate" has no assertion

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: supabase/tests/database/day_plan_write.test.sql:323-327
- **Detail**: The plan makes the order load-bearing ("`U0002` przed `U0001`, bo »ten dzień ma już plan« jest odpowiedzią pełniejszą") and the migration implements it correctly (U0002 at :130-134, U0001 at :136-140). But the 12 new assertions test each guard in isolation: `p_require_absent` over an *unaccepted* existing day (:323), and acceptance without `p_confirm_replace` (:166). No assertion covers the case where **both** conditions hold — an accepted plan with `p_require_absent => true`. Swapping the two `if` blocks in the function would leave the suite green, and a week generation would then receive U0001's "confirm and I will" for a day it is not offering to replace. Criterion 1.3 (mutation-resistance for each new assertion) is satisfied for the guards that have assertions; this guard has none. Also unasserted: that the 4-arg overload is gone — the privilege assertions were retargeted to the 6-arg signature, so a surviving overload would not be detected.
- **Fix**: Add one `throws_ok` against the existing accepted-plan fixture with `p_require_absent => true` expecting `U0002`, and a `hasnt_function('save_day_plan_generation', ARRAY['date','text','jsonb','boolean'])`.
- **Decision**: FIXED — added a `throws_ok` with both guards armed (accepted day + `p_require_absent`) expecting `U0002`, and a `count(*) = 1` assertion on `pg_proc`. Mutation-verified: swapping the two `if` blocks in the migration turns exactly the new assertion red (Failed test 28). Suite 63 → 65.

### F5 — A U0002 raised by the function itself gets the message the plan said to avoid

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/day-plan-store.ts:121, src/pages/api/day-plan/generate.ts:120-129
- **Detail**: The plan puts the named message on the `U0002` mapping: "`U0002` mapuje się na kategorię `conflict` z komunikatem nazywającym przyczynę … przez `userMessage` na miejscu rzutu, bo domyślny komunikat kategorii mówi o odświeżeniu strony." Only the cheap pre-check carries it (generate.ts:126). A `U0002` raised by the function — the race the schema guard exists for — goes through `toStoreError` (day-plan-store.ts:139), which sets no `userMessage`, so the teacher gets the category default "Ten plan zmienił się w innym miejscu. Odśwież stronę…" (day-plan-http.ts:76): exactly the message the plan called out as wrong here. Low user impact today, because `WeekPlanBoard.tsx:105-108` turns any 409 into `skipped` without showing the text — but the single-day route does surface it.
- **Fix**: In `toStoreError`, attach `userMessage: "Ten dzień ma już plan — nie został nadpisany."` on the `U0002` branch so both paths speak with one voice.
- **Decision**: FIXED — `MESSAGE_BY_CODE` added in `day-plan-store.ts`; `toStoreError` now attaches the same sentence the pre-check uses, so both U0002 paths answer alike.

### F6 — Per-day retry takes the global lock

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/plan/WeekPlanBoard.tsx:210-213
- **Detail**: The plan is explicit: "Blokada `inFlight` jest per dzień; globalna obejmuje wyłącznie szkic i przycisk tygodnia" — motivated by "inaczej pierwszy dzień, który wystartuje, zablokuje cztery pozostałe". Generation itself is correctly per-day (:51, :72), but `retryDay` sets `weekInFlight.current = true` and `setBusy("generating")`, which disables every button and blocks a second day's retry. On the plan's own scenario — two days failed on 429 — the teacher must retry them one at a time, serially.
- **Fix**: Have `retryDay` use only the per-day `inFlight` set, as `generateDay` does, and leave `weekInFlight`/`setBusy` to the outline and the week button.
- **Decision**: FIXED — `retryDay` no longer takes `weekInFlight` or moves `busy`; it still *reads* the week lock, and `generateDay`'s per-day guard covers the only real collision.

### F7 — A 409 on retry leaves the card claiming "pominięty" with no proposals

- **Severity**: 📋 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/WeekPlanBoard.tsx:105-108
- **Detail**: `WeekPlanBoard` has no equivalent of `DayPlanEditor.reconcile`. If a generation's write commits but the response is lost, the card shows "failed + Ponów"; the retry then hits the `only_if_absent` 409 and lands in the `skipped` branch, which sets the status but leaves `plan` at `null`. The day sits on screen as "Pominięty — ten dzień ma już plan" with no activities, excluded from `readyCount` and from `acceptWeek`, until a manual refresh — so "Akceptuj tydzień" silently skips a day that is in fact saved and unaccepted.
- **Fix**: On a 409 from a retry, re-read the day via `GET /api/day-plan?date=` and fold the result in, so a genuinely-saved day renders as saved and joins `readyCount`.
- **Decision**: FIXED — added a module-level `readDay()`; the 409 branch now re-reads the day and folds a genuinely-saved plan in, so it joins `readyCount` and „Akceptuj tydzień" instead of showing an empty skip.

### F8 — The outline's amplification of an unsafe keyword is deferred without a tracked item

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/changes/week-generation/model-comparison.md:100-112
- **Detail**: The gate recorded a genuine new property: the week outline multiplies "Dzień Matki" exposure from one day to a whole week (DeepSeek 5/5 themes, luna 5/5, Gemini 4/5). The decision to defer is reasoned and names an owner ("Właściciel: Janusz. Bramka: przy najbliższej iteracji promptu, nie w S-03"), which is more than `lessons.md` #2 got last time — but it lives only in prose inside a review document. There is no follow-up file, no roadmap entry and no plan item, which is the exact disappearance `lessons.md` #2 describes ("nie ma commita, testu ani pozycji w planie, która by o nim przypomniała").
- **Fix**: Copy the deferral into `context/changes/week-generation/follow-ups/` (or the roadmap's S-03 Unknowns) as a dated item naming the owner and the gate condition, so the next prompt iteration trips over it.
- **Decision**: FIXED — deferral moved into `context/changes/week-generation/follow-ups/review-fixes.md` as item 1, with owner and closing condition; linked from the roadmap's S-03 entry.

### F9 — Roadmap left mid-flight relative to the plan's own claims

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md
- **Detail**: The only edit to the roadmap is two lines flipping S-03 `proposed → in-progress` — benign bookkeeping, no scope creep. But `change.md` now says `status: implemented` with all six phases checked off, so the roadmap still reads `in-progress`; and the plan's References claims "oba Unknowns rozstrzygnięte tym planem" while the roadmap's Unknowns bullets still read "Owner: TBD".
- **Fix**: Flip S-03 to the completed state and resolve the two Unknowns bullets to point at this plan.
- **Decision**: FIXED — S-03 flipped to `done` in both the slice table and the detail block; both Unknowns struck through and resolved against the plan; an `Open follow-ups` line added pointing at the follow-ups file.

## Triage — 2026-08-26

All nine findings fixed, each with the recommended option where the report offered a choice (F1 → Fix A).

| ID | Dimension | Outcome |
|----|-----------|---------|
| F1 | Plan Adherence | Fixed via Fix A — gate extended and re-run, docs corrected |
| F2 | Safety & Quality | Fixed — outline `catch` added |
| F3 | Safety & Quality | Fixed — skip marking deferred until generation starts |
| F4 | Success Criteria | Fixed — 2 assertions added, mutation-verified |
| F5 | Plan Adherence | Fixed — U0002 message unified across both paths |
| F6 | Plan Adherence | Fixed — retry is per-day again |
| F7 | Safety & Quality | Fixed — 409 re-reads the day |
| F8 | Safety & Quality | Fixed — deferral tracked in `follow-ups/review-fixes.md` |
| F9 | Plan Adherence | Fixed — roadmap S-03 closed out |

### Verification after fixes

| Check | Result |
|-------|--------|
| `npm run lint` | PASS — 0 errors |
| `npx astro check` | PASS — 0 errors, 0 warnings |
| `npm run build` | PASS |
| `npm run test:db` | PASS — 65 tests (was 63) |
| Mutation check: guards swapped in the migration | Exactly the new ordering assertion goes red |
| `npx prettier --check` on every touched file | PASS |
| Gate `MODES="day-weekday"` × 3 models × 5 keywords | 14/15; no content violations for `luna` or `gemini` |

Revised dimension verdicts: Plan Adherence PASS, Scope Discipline PASS, Safety & Quality PASS,
Architecture PASS, Pattern Consistency PASS, Success Criteria PASS. **Overall: APPROVED.**
