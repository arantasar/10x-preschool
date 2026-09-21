<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Edycja dnia zaakceptowanego zdejmuje akceptację

- **Plan**: context/changes/edit-unaccepts-day/plan.md
- **Scope**: Phases 1–4 (all)
- **Date**: 2026-09-20
- **Verdict**: NEEDS ATTENTION → **RESOLVED 2026-09-21** (8 naprawionych, 1 świadomie pominięty z warunkiem wejścia)
- **Findings**: 0 critical · 4 warnings · 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

All 11 planned contract items match. The diff touches exactly the 8 source/test files the plan
named and nothing else. Re-run green: `npm run lint`, `npm run build`, `npm test` (243 tests),
the four new route cases, `npm run test:e2e` (7 tests), `--repeat-each=2`, and zero leftover
seeded rows in the local database.

## Findings

### F1 — Retry path can save an accepted day without asking

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/DayPlanEditor.tsx:279, :306-309
- **Detail**: `saveDraft` gates the dialog on `accepted`, read from the render scope that built
  it. The retry closure stored in `lastAttempt.current` (:130-134) captures *that* `saveDraft`,
  so every "Spróbuj ponownie" re-evaluates `accepted` from the first attempt's render.
  Failure scenario: plan is a draft, teacher clicks "Zapisz" → no dialog (correct). Request
  fails → `mutate` runs `reconcile()` (:195), which calls `setPlan(body)` and picks up an
  acceptance made meanwhile in another tab. Badge now reads "Plan zaakceptowany". Teacher clicks
  "Spróbuj ponownie" → stale `saveDraft` still sees `accepted === null` → no dialog → PATCH goes
  out → trigger clears the fresh acceptance. This is what the comment at :302-305 promises does
  *not* happen. It is the same class of bug the file already solved for `draft` — `draftRef`
  exists at :66 with a comment explaining this precise hazard — and the pattern was not applied
  to `accepted`. Unlike `generate()`, there is no server-side backstop (:270-276 says so): the
  dialog is the whole gate.
- **Fix**: Mirror `accepted` into a ref the way `draft` already is, and read the ref inside
  `saveDraft`'s guard.
  - Strength: The pattern, its comment and its justification are already in this file 200 lines up.
  - Tradeoff: One more ref to keep in sync wherever `setPlan` is called.
  - Confidence: HIGH — traced `reconcile` → `setPlan` → re-render, and confirmed
    `lastAttempt.current` is only reassigned inside `mutate`, so the old closure survives.
  - Blind spot: Requires a concurrent acceptance from another surface to trigger.
- **Decision**: **FIXED** — `planRef` mirroruje `plan` wzorem `draftRef`; bramka `saveDraft` czyta ref. Istniejący test odmowy nadal zielony (asercja „dialog się pokazał" przechodzi, czytając teraz z refa).

### F2 — `acceptance_cleared` reports the pre-write state, not what was cleared

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/day-plan/activity/[id].ts:63
- **Detail**: The route returns `acceptance_cleared: wasAccepted` — the pre-write acceptance
  state verbatim. The trigger is conditional: `when (old.title is distinct from new.title or
  old.description is distinct from new.description)`. A write that changes nothing does not
  clear the acceptance. Reachable today: `ActivityEditor`'s save button is gated only on
  `invalid` (:701, :740) — no dirty check. Open "Edytuj" on an accepted day, click "Zapisz"
  without typing → pre-read sees `accepted_at` non-null → `wasAccepted = true`; UPDATE writes
  identical values → trigger's WHEN is false → acceptance survives. Body is
  `{ plan: { accepted_at: "…" }, …, acceptance_cleared: true }` — self-contradictory, and the
  field's docstring (day-plan-http.ts:31) is false for it. The island is unharmed only because
  `AcceptanceBanner` re-checks `!acceptedAt` (:618) — defence-in-depth, not the contract. The
  teacher still sees a dialog naming a consequence that then does not happen.
- **Fix**: `acceptance_cleared: wasAccepted && saved.plan.accepted_at === null` — the post-write
  plan is already in hand at :62.
  - Strength: Strictly more correct in every case the current code handles; also closes the
    read-then-write race in the "another tab withdrew acceptance" direction.
  - Tradeoff: Needs a fifth route test (accepted before *and* after); `savedDay()` at
    [id].test.ts:44-47 always builds `accepted_at: null`, so all four cases share one post-write
    shape and none would catch a regression.
  - Confidence: HIGH — read the trigger's WHEN clause in the migration and confirmed no dirty
    check exists in ActivityEditor.
  - Blind spot: None significant.
- **Decision**: **SKIPPED** — wyspa broni się złożonym warunkiem `!acceptedAt && clearedByEdit`. Zapisane jako warunek wejścia w `next-actions.md`: policzyć z faktu po zapisie, **zanim** pole zacznie czytać cokolwiek poza `DayPlanEditor` (np. `S-11`).

### F3 — Three Progress rows marked [x] whose commands don't check what they claim

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/edit-unaccepts-day/plan.md (Progress 2.4, 2.5, 3.4)
- **Detail**: The code is correct in all three cases; the gates are not.
  **2.5 is vacuous** — `grep -n "clearedByEdit"` is case-sensitive and misses both assignment
  sites, spelled `setClearedByEdit`. Of its eight hits, three are comments, three prop plumbing,
  one the declaration, one the render branch. None shows where the value comes from, which is
  the only thing the row claims to prove. Honest command: `grep -n "setClearedByEdit("` → 2 hits,
  one containing `readAcceptanceCleared`.
  **2.4 reads red as written** — it demands an `accepted` condition above all three
  `window.confirm` sites; the third (`deletePlan`, :346) shows `if (!plan) return;`. The code is
  right (deletion should not be gated on acceptance); the criterion is over-broad, yet checked [x].
  **3.4 cannot find its target** — `grep -n -A3 "Akceptuj plan"` returns lines 470-473;
  `type="button"` is at :461, thirteen lines above.
  Also worth tightening: 1.5b (`grep -c "acceptance_cleared" … >= 1`) counts 2, one of which is
  a comment — it passes on a file where the code was deleted and only the comment remains.
  Third recurrence of an accepted rule: lessons.md „Bramka grepowa musi celować w konstrukcję i
  przejechać oba stany". DayPlanEditor.tsx:439-441 carries a comment citing that very lesson,
  and 3.4 still fails to find the construct it names.
- **Fix**: Rewrite the three rows to anchor on the construction and record the count the code
  actually produces, then re-run each against a deliberately broken state before re-checking.
  - Strength: Restores Progress as evidence rather than narration; all three are one-liners.
  - Tradeoff: Re-opens a closed plan to amend rows already marked done.
  - Confidence: HIGH — ran all four commands verbatim and compared output against the code.
  - Blind spot: Checked the greps named in Phases 1–4 only, not every historical criterion.
- **Decision**: **FIXED** — 1.5b, 2.4, 2.5 i 3.4 przepisane na kotwice konstrukcyjne, każda przejechana na stanie zepsutym i docelowym, wyniki wpisane w treść kryteriów. 2.4 poprawione dwukrotnie: pierwsza wersja używała okna `-A10`, które rozsunęła poprawka F8.

### F4 — The consent path has no automated proof, and 19 manual rows are unchecked

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/edit-unaccepts-day/plan.md (Progress, Manual)
- **Detail**: Every `#### Manual` row across all four phases is `- [ ]`, while change.md says
  `status: implemented`. The epilogue commit records this as deliberate, so it is a documented
  deferral, not rubber-stamping — but each phase's "Implementation Note" said to stop and wait
  for manual confirmation before moving on, and none of the four did. What this leaves
  uncovered: nothing anywhere exercises the *consent* path. The e2e test covers refusal only
  (deliberately, :33-35); the route test stops at the JSON. The amber banner, its copy and
  "Akceptuj ponownie" have no proof of rendering at all — and manual steps 6 and 7 (the two-tab
  scenarios) are the only evidence that Phase 1 was worth building. Combined with F2, the
  banner's correctness rests on one compound condition that no test reads.
- **Fix**: Run manual steps 2–7 from §Testing Strategy against `npm run dev` before merging, and
  check the rows off with what was observed.
  - Strength: Steps 6 and 7 are the only check on the island's stale-copy behaviour, which is
    the entire justification for Phase 1's shape.
  - Tradeoff: ~15 minutes with two browser tabs and a seeded day.
  - Confidence: HIGH — confirmed no test asserts on the banner.
  - Blind spot: Step 6/7 outcomes may change once F1 and F2 are fixed; do it after those.
- **Decision**: **FIXED** — `tests/e2e/day-plan-edit-consent.spec.ts`: dwa testy pokrywające zgodę, banner przyczyny, „Akceptuj ponownie", ulotność po przeładowaniu i drugą edycję dnia roboczego bez pytania. Zobaczone na czerwono w dwóch wariantach psucia. Kroki 6–7 (dwukartowe) zostają ręczne.

### F5 — Route test never pins what was written

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/day-plan/activity/[id].test.ts:75
- **Detail**: `expect(supabase.update).toHaveBeenCalledTimes(1)` asserts only that an update
  happened. An implementation calling `.update({})`, or writing `description` into `title`,
  passes all four cases.
- **Fix**: Add `expect(supabase.update).toHaveBeenCalledWith({ title: …, description: … })` to
  case (a).
- **Decision**: **FIXED** — `toHaveBeenCalledWith({ title, description })` w przypadku (a).

### F6 — `acceptedAtOf` throws on a null embed

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/day-plan-store.ts:451
- **Detail**: Accepts object-or-array but not `null`; a null embed is a TypeError inside the
  `try`, surfacing as a generic 500 instead of the intended 404. Unreachable today — both
  tables' SELECT policies use the identical `(select auth.uid()) = user_id` predicate — so this
  is insurance against those drifting apart.
- **Fix**: Widen the parameter to `| null` and return `null`.
- **Decision**: **FIXED** — `acceptedAtOf` przyjmuje `| null` i zwraca `null`.

### F7 — The deferred PRD correction was never filed

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/next-actions.md
- **Detail**: The plan's §Migration Notes says `prd-v2.md` §Business Logic Changes rule 2 stays
  wrong on purpose and "warto zgłosić to jako osobną pozycję w next-actions.md przy zamykaniu
  slice'a". The slice is closed (epilogue commit, status `implemented`) and no such entry exists
  — grep for `S-12`/`FR-017`/`edit-unaccepts` returns nothing. This is the recorded lesson
  „Odroczone sprzątanie danych musi mieć właściciela" playing out.
- **Fix**: Add the entry, naming the PRD paragraph and who owns it.
- **Decision**: **FIXED** — sekcja §Otwarte ogony po `edit-unaccepts-day` w `next-actions.md`, z warunkiem wejścia „przed otwarciem `S-10`".

### F8 — Consent collected for a save that is then silently dropped

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/DayPlanEditor.tsx:124 ← :288
- **Detail**: `saveDraft` prompts *before* calling `mutate`, and `mutate` opens with
  `if (inFlight.current) return;` — no state change, no message. Confirm while another mutation
  is in flight and nothing comes back. Narrow (`disabled={isBusy}` plus `window.confirm` being
  blocking) and pre-existing for `generate()`/`deletePlan()`, now also on this path.
- **Fix**: Check `inFlight.current` before prompting.
- **Decision**: **FIXED** — `if (inFlight.current) return;` przed dialogiem w `saveDraft`.

### F9 — E2E spec name departs from the risk-number convention

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/day-plan-edit-confirmation.spec.ts:37
- **Detail**: `E2E-RULES.md` says the test name carries the risk number from test-plan.md ("the
  number is the only link between this directory and the risk map"). This one is named
  `FR-017 — …`, because FR-017 has no entry in the risk map. Defensible, but currently silent.
- **Fix**: Add FR-017 to test-plan.md's risk map, or note in the spec why an FR number stands in.
- **Decision**: **FIXED** — ryzyko #8 dopisane do mapy ryzyk `test-plan.md` §2 i do tabeli Risk Response; oba spece przemianowane na `ryzyko #8`.

## Not flagged, deliberately

- Leaving "Usuń plan dnia" at the bottom rather than moving it with acceptance — a documented
  reading of the PRD's own caution, argued in both the plan (§Phase 3) and a code comment.
- The additive extras beyond the letter of the contracts (`acceptedAtOf`, the stub's `from` spy,
  `AcceptanceBanner`'s `disabled` prop, the fifth e2e assertion) — all supportive, no behaviour
  change.
