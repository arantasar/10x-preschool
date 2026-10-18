<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Cennik i zapis na cenę założycielską

- **Plan**: context/changes/founder-price-signup/plan.md
- **Scope**: All phases (1–5 of 5)
- **Date**: 2026-10-18
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 5 observations

Automated at review time: `npm test` 913/913, `npm run lint` ✓, `npm run build` ✓, `npm run test:db` 289 ✓ (incl. `founder_price_signups.test.sql`), `npm run test:db:api` 16 ✓, `npm run test:e2e` 45/45 ✓, grep gates („bez limitu”, 2.6/2.7/2.8 numbering) ✓. After the triage fixes: `npm test` 914/914, lint ✓, build ✓, `founder-price` + `help-and-contact` + `legal-pages` specs 10/10 ✓.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — Policy summary contradicts pkt 2.8 on retention

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/content/legal/polityka-prywatnosci.md:8
- **Detail**: The summary said „do startu płatności i nie dłużej niż do 31 sierpnia 2027”; pkt 2.8 says „do wycofania zgody, najdłużej do 31 sierpnia 2027”, and S-25 needs the list after 2027-02-01.
- **Fix**: Reword the summary to match pkt 2.8.
- **Decision**: FIXED — summary now reads „do wycofania zgody, najdłużej do 31 sierpnia 2027”.

### F2 — Prices typed outside pricing.ts, untested

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/pages/cennik.astro:72,87,159; src/components/billing/PlanComparison.astro:34,38; src/lib/pricing.ts:109,115-116
- **Detail**: FAQ answer, meta description, `#zapis` lead, table header and `PLAN_COMPARISON` cells repeated price literals; `everyText()` did not see the `.astro` ones, so a price change would leave five places stale with tests green.
- **Fix**: Build every sentence from the price constants in pricing.ts; add them to `everyText()`.
  - Strength: Makes the CLAUDE.md claim true; truth tests cover the sentences.
  - Tradeoff: Slightly more indirection in pricing.ts.
  - Confidence: HIGH — every literal located, all static.
  - Blind spot: None significant.
- **Decision**: FIXED — base prices are private constants in pricing.ts; new exports `FOUNDER_TERMS`, `BASIC_PRICE_HEADER`, `PRICING_DESCRIPTION`; `PLAN_COMPARISON` built from them; `everyText()` extended; new test „leaves no price typed into the page or the table” (checked red with a literal put back).

### F3 — Nothing closes the form once payments start or the list expires

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/cennik.astro (hero); src/lib/founder-price.ts (`FOUNDER_PRICE_LISTED_NOTE`); src/pages/api/founder-price.ts
- **Detail**: From 2027-02-01 the hero and the confirmation become false; after 2027-08-31 the route still confirms and the cron deletes the row within 24 h. S-25 is the declared owner, but its roadmap entry carried neither the date nor the task.
- **Fix A ⭐ Recommended**: Record the deadline and task on S-25 in the roadmap.
  - Strength: Zero code; the deadline sits where the S-25 planner reads.
  - Tradeoff: Still a promise, not code.
  - Confidence: HIGH — S-25 already owns it.
  - Blind spot: None significant.
- **Fix B**: Date gate in page and route.
  - Strength: The page can never lie on its own.
  - Tradeoff: New behaviour and tests for a state S-25 rewrites anyway.
  - Confidence: MED.
  - Blind spot: Copy for the closed state undecided.
- **Decision**: FIXED via Fix A — Unknowns entry added to `### S-25` in roadmap.md.

### F4 — Plan closed with all 12 manual checks unchecked

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/founder-price-signup/plan.md:417-472
- **Detail**: Every Manual row is `[ ]` while the roadmap says `done`. They include owner approval of copy (3.5) and policy (4.5) — F1 is what 4.5 exists to catch. Merging ships to production.
- **Fix**: Run 3.5–3.9 and 4.5–4.6 locally before merging; 5.3 after.
- **Decision**: PENDING (owner action) — queued in follow-ups/review-fixes.md.

### F5 — PRIVACY_PUBLISHED_ON pinned to tomorrow

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/legal.ts:22
- **Detail**: `"2026-10-19"`; the plan says the merge day.
- **Fix**: Set it to the actual merge day in the merge commit.
- **Decision**: PENDING (at merge) — queued in follow-ups/review-fixes.md.

### F6 — Signed-in edge cases rely on session email = JWT email

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/founder-price.ts:61-73
- **Detail**: Address from `getUser()` vs RLS on the JWT claim (differ ≤1 h after an e-mail change → `save_failed`); a session without e-mail sees the field but the route ignores it; zod rejects a malformed body e-mail even when signed in. None reachable today (no e-mail change, no OAuth, the island never sends `email` signed in).
- **Fix**: No change; revisit with e-mail change or OAuth.
- **Decision**: ACCEPTED — unreachable today.

### F7 — useTurnstile never removes the widget

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/hooks/useTurnstile.ts:97-131
- **Detail**: No effect cleanup; FounderPriceForm swaps to the confirmation in place, leaving the widget registered on a detached container.
- **Fix**: Remove the widget on unmount and before the in-place swap.
- **Decision**: FIXED — hook exposes `remove()` (calls `turnstile.remove`), the effect cleans up on unmount and skips rendering if unmounted before the script loads; FounderPriceForm calls `remove()` before showing the confirmation.

### F8 — Form depends on the toggle's radio name by string

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/billing/FounderPriceForm.tsx:28; src/components/billing/BillingToggle.astro:12
- **Detail**: A renamed group would silently record every sign-up as `yearly`.
- **Fix**: Shared constant.
- **Decision**: FIXED — `BILLING_INPUT_NAME` in pricing.ts, used by both; the toggle's `name` prop removed.

### F9 — Anonymous rows carry no proof of consent

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/founder-price.ts:70
- **Detail**: No double opt-in by plan decision; anyone passing Turnstile can list a third party's address, so art. 6.1.a consent is unprovable for anonymous rows.
- **Fix**: Note on S-25 that the launch e-mail to anonymous rows should act as a confirmation.
- **Decision**: FIXED — Unknowns entry added to `### S-25` in roadmap.md (shape left to `/10x-plan` S-25).
