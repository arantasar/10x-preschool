<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: App Header Account Menu

- **Plan**: context/changes/header-update/plan.md
- **Scope**: Phases 1–2 of 2
- **Date**: 2026-10-14
- **Verdict**: NEEDS ATTENTION (all findings low-impact; triaged — see decisions)
- **Findings**: 0 critical, 4 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Automated checks at review time: 1.1 `test ! -e "temio-design-astro (1)"` PASS (the `diff -rq` half can no longer be re-run); 1.2 grep PASS (matches 2× on master, so it can fail); 1.3 / 1.4 PASS; `npm run lint` PASS; `npm test` 756/756; `npm run build` PASS; `npm run test:e2e` 34/34. Re-run after the triage fixes: same results.

## Findings

### F1 — Header's whole right side now depends on user.email

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/AppHeader.astro:53
- **Detail**: On master, only the avatar link depended on having an e-mail. „Pomoc” and „Wyloguj się” always rendered. The island rendered only when `user?.email` was set, so a signed-in user without an address would have no way to sign out or reach settings. That can't happen today, because sign-in is e-mail only.
- **Fix**: Render the island whenever `user` exists, with `email={user.email ?? ""}`. The trigger's label falls back to „Menu konta”, the avatar to a person icon, and the „Zalogowano jako” block is hidden.
- **Decision**: FIXED

### F2 — Dependency is the `radix-ui` umbrella, not @radix-ui/react-dropdown-menu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: package.json:41, src/components/ui/dropdown-menu.tsx:4
- **Detail**: Plan 2.2 named `@radix-ui/react-dropdown-menu`, but the shadcn CLI added `radix-ui@^1.8.1`, and `button.tsx` still imports `@radix-ui/react-slot`. This costs nothing at runtime: the package is side-effect-free and there is one copy of react-slot (1.2.4 → 1.5.0). The lockfile only adds transitive Radix and floating-ui packages.
- **Fix**: Plan addendum recording the umbrella package as intended; button.tsx left as is.
- **Decision**: FIXED (plan addendum)

### F3 — New E2E test names carry no risk or FR id

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/account-menu.spec.ts:25, 52, 62, 87
- **Detail**: E2E-RULES.md:30 requires the test name to carry its risk number. The new tests were named „menu konta: …”, and no existing risk (#1–#16) covers the account menu.
- **Fix**: Added risk #17 (sign-out and account links behind a single island) to the risk map in `context/foundation/test-plan.md`, and renamed the four tests to „ryzyko #17: …”.
- **Decision**: FIXED

### F4 — All manual checks still unchecked while change.md says "implemented"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/header-update/plan.md (Progress 1.8–1.12, 2.4)
- **Detail**: None of the manual items had been ticked. account-menu.spec effectively covers keyboard, sign-out and current marking (1.9–1.11). The visual match to mock-up 19 at 1440/768/390 px (1.8, 1.12) has not been checked by anyone.
- **Fix**: Tick 2.4: this review checked the spec against the anti-patterns (no CSS locators, no waitForTimeout, its own account with cleanup). The visual pass for 1.8–1.12 stays with the human (see follow-ups).
- **Decision**: PARTIALLY FIXED — 2.4 ticked; 1.8–1.12 pending human visual pass

### F5 — Sign-out on planner screens now needs JavaScript

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/AppHeader.astro:53
- **Detail**: The plan deliberately has no no-JS fallback (plan.md:33). It's flagged because sign-out used to be a plain form. The rest of the island checks out: the hidden form sits outside the portal, `requestSubmit()` runs synchronously in `onSelect`, `checkOrigin` is on, and the e-mail is rendered only as escaped text.
- **Fix**: Accept as decided; a `<noscript>` sign-out form is the follow-up if ever wanted.
- **Decision**: ACCEPTED — plan decision stands (plan.md:33)
