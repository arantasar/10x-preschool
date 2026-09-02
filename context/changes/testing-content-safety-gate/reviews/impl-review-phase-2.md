<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Powtarzalna bramka bezpieczeństwa treści — Phase 2

- **Plan**: context/changes/testing-content-safety-gate/plan.md
- **Scope**: Phase 2 of 4 — "Ryzyko #6 — twarde wejście i dowód sufitu"
- **Commit**: f7b9ad7
- **Date**: 2026-08-31
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated verification (re-run)

- `npm run lint` — pass
- `npx astro sync && npx tsc --noEmit` — pass, no type errors
- `npm test` — 136 tests / 6 files, no `OPENROUTER_API_KEY` needed, no `*.gate.test.ts` pulled in
- `npm run test:db` — 3 files / 73 assertions, `plan(44)` matches actual assertion count (verified by grep, including the `matches()` helper missed on first pass)
- `npm run build` — pass
- `git diff -w master..HEAD -- src/lib/services/day-plan-contract.ts` — confirms `PROMPT_MAX`/`THEME_MAX` values untouched; only call sites moved from raw `z.string()` to `singleLineText()`

## Plan drift (5 planned changes)

All five "Changes Required" items in Phase 2 MATCH the plan's contract exactly:

1. `day-plan-contract.ts` — `singleLineText()` trims before bounds, rejects `\p{Cc}\p{Cf}` via `.refine()`, applied to `prompt`/`theme` on both routes; bounds unchanged; this is the only production schema change, as scoped.
2. `day-plan-contract.test.ts` — all four proven payloads plus the required positive control, plus extra coverage (Polish-diacritic acceptance, exact boundary tests) not required but not contradicting the plan.
3. `generate.test.ts` — `fetch`/`supabase.rpc` call-count assertions before/after rejection, plus a positive control proving the *trimmed* value reaches `p_prompt`.
4. `day_plan_write.test.sql` — `plan(42)`→`plan(44)`, two `throws_ok(..., '23514', ...)` assertions correctly targeting `activities_ordinal_bounds` (21-row batch) and `day_plans_prompt_length` (2001 chars), each on its own unused fixture date.
5. `test-plan.md` §6.4 — addendum present, slightly fuller than "one sentence" but consistent with intent; `U0003` explicitly left with Phase 3.

Two files outside the plan's explicit file list were touched — `src/pages/api/day-plan/generate.ts` and `src/pages/api/day-plan/week/outline.ts` — but only to update the user-facing Polish rejection message text ("jedna linia tekstu" instead of a pure length claim), with no character named and no logic changed. This is the necessary fallout of item 1, not scope creep, and is disclosed in the commit message.

## Safety & pattern scan

No security, performance, reliability, or data-safety issues. The control-character regex correctly closes the newline-injection vector without false positives on Polish text (verified against the added diacritic/dash/quote test cases and by re-running the suite). No migration files were touched — the two new DB assertions are test-only. New code follows existing `.refine()` and `it.each` idioms already present in the same files.

## Findings

### F1 — Refine's non-leaking error message is never surfaced

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/day-plan-contract.ts:149 (message defined); src/pages/api/day-plan/generate.ts:110 and src/pages/api/day-plan/week/outline.ts:61 (both ignore it)
- **Detail**: `singleLineText()`'s `.refine()` carries a deliberately non-leaking Polish message ("Hasło musi być pojedynczą linią tekstu."), but both routes return a single hard-coded `badRequest(...)` string on *any* `safeParse` failure and never read `parsed.error`. The careful message is currently write-only — harmless today since the hard-coded route message is equally non-leaking, but if a future change wires `parsed.error.issues` into a richer client response, this is the string that would need re-checking against the injection-probing concern it was written for.
- **Fix**: No action needed now — flagging for awareness only. If richer per-field error surfacing is ever added to these routes, re-verify this message still doesn't leak which character triggered the rejection.
- **Decision**: SKIPPED — not worth fixing now; dead code today with no functional impact.

## Manual verification

Progress items 2.8–2.10 are already checked `[x]` with commit `f7b9ad7`, including "mutacja pgTAP przejechana" (both new assertions seen red via mutation before commit). This claim is asserted in the commit body and is structurally consistent (isolated fixture dates, one assertion per constraint, same `null`-message style as every other `throws_ok` in the file) but not independently re-verified in this review — a live mutation re-run was attempted and blocked by the session's Bash permission classifier before any destructive action was taken. Since this item was already gated behind the plan's own "stop and wait for manual confirmation, especially the pgTAP mutation" checkpoint and is recorded as done, it is accepted as-is rather than re-litigated.
