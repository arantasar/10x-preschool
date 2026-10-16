<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Account-Deleted Notice as a Floating Toast

- **Plan**: context/changes/deletion-banner-fix/plan.md
- **Scope**: Phase 1 of 1 (full plan)
- **Date**: 2026-10-16
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS (1 observation) |
| Success Criteria | PASS (1 observation) |

Automated criteria re-run on `3b9f674`: e2e `account-deletion.spec.ts` 5/5, grep `pt-4` = 0 and `AccountDeletedNotice client:load` = 1, lint pass, unit tests 774/774, build pass. Criterion 1.1 (red on the old code) is historical and was shown in the implementation run: header y 64 vs 0, h1 286 vs 222. Two deliberate breaks also went red there: the notice back in the flow, and a no-op close button. Manual rows 1.7–1.10 are pending.

Reviewed inline, with no sub-agents: the code diff is three small files.

## Findings

### F1 — The 1.3 grep gate checks a styling class, not the notice

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/deletion-banner-fix/plan.md (criterion 1.3)
- **Detail**: `grep -n 'pt-4' src/pages/index.astro` tells the two states apart (1 → 0), but `pt-4` is just a class on the old wrapper. It would stay green if an in-flow notice came back with `pt-3`, and turn red if an unrelated `pt-4` appeared (lesson „Bramka grepowa musi celować w konstrukcję”). The e2e position assertion is the real proof of "no shift", and it was seen red.
- **Fix**: No code change. The plan stays as written (rows are SHA-stamped); treat it as a reminder for future plan gates.
- **Decision**: ACCEPTED — the recommendation was no code change (automatic triage).

### F2 — The new island sits in src/components/ instead of account/

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/AccountDeletedNotice.tsx
- **Detail**: The other account-related islands live in `src/components/account/` (AccountMenu, DeleteAccountForm, PasswordChangeForm). The plan named the root path, so this was plan-conformant.
- **Fix**: Move it to `src/components/account/` and update the import in `index.astro`.
- **Decision**: FIXED. It now lives at `src/components/account/AccountDeletedNotice.tsx`, and the plan's phase block keeps the original path as the historical record. After the move: lint pass, build pass, e2e 5/5.
